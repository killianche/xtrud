#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultPaths = {
  commitPath: resolve(root, "infra/supabase/.supabase-commit"),
  dockerTreePath: resolve(root, "infra/supabase/.supabase-docker-tree"),
  imageLockPath: resolve(root, "infra/supabase/image-digests.json"),
  overlayPath: resolve(root, "infra/supabase/docker-compose.rehearsal.yml"),
  versionPath: resolve(root, "infra/supabase/.supabase-version"),
};

const expectedServices = [
  "studio",
  "api-gw",
  "auth",
  "rest",
  "realtime",
  "storage",
  "imgproxy",
  "meta",
  "functions",
  "db",
  "supavisor",
].sort();

function exactKeys(value, expected, name) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${name} has an unexpected key set`);
  }
}

function readPin(path, name, pattern) {
  const value = readFileSync(path, "utf8").trim();
  if (!pattern.test(value)) throw new Error(`${name} pin has an unexpected format`);
  return value;
}

function gitText(repository, args) {
  try {
    return execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`upstream Git check failed: git ${args.join(" ")}`);
  }
}

function gitBlob(repository, revision) {
  try {
    return execFileSync("git", ["-C", repository, "show", revision], {
      encoding: null,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(`upstream Git blob is unavailable: ${revision}`);
  }
}

function containedRegularFile(snapshotRoot, relativePath, name) {
  const candidate = resolve(snapshotRoot, relativePath);
  const linkMetadata = lstatSync(candidate);
  if (linkMetadata.isSymbolicLink()) throw new Error(`${name} must not be a symlink`);
  const realPath = realpathSync(candidate);
  if (!realPath.startsWith(`${snapshotRoot}/`)) throw new Error(`${name} escapes the snapshot`);
  if (!statSync(realPath).isFile()) throw new Error(`${name} must be a regular file`);
  return realPath;
}

function containedDirectory(snapshotRoot, relativePath, name) {
  const candidate = resolve(snapshotRoot, relativePath);
  const linkMetadata = lstatSync(candidate);
  if (linkMetadata.isSymbolicLink()) throw new Error(`${name} must not be a symlink`);
  const realPath = realpathSync(candidate);
  if (!realPath.startsWith(`${snapshotRoot}/`)) throw new Error(`${name} escapes the snapshot`);
  if (!statSync(realPath).isDirectory()) throw new Error(`${name} must be a directory`);
  return realPath;
}

function normalizeImageValue(rawValue, service) {
  const unquoted = rawValue.replace(/^(["'])(.*)\1$/u, "$2");
  const withDefault = /^\$\{[A-Z][A-Z0-9_]*(?::-|-)([^}]+)\}$/u.exec(unquoted);
  const value = withDefault?.[1] ?? unquoted;
  if (!value || value.includes("${")) {
    throw new Error(`${service} upstream image has no immutable source tag default`);
  }
  return value;
}

function extractComposeImages(composeText) {
  const images = new Map();
  const services = new Set();
  let inServices = false;
  let service = null;
  for (const rawLine of composeText.split(/\r?\n/u)) {
    if (/^services:\s*(?:#.*)?$/u.test(rawLine)) {
      inServices = true;
      service = null;
      continue;
    }
    if (!inServices) continue;
    if (/^[A-Za-z][A-Za-z0-9_-]*:\s*(?:#.*)?$/u.test(rawLine)) break;
    const serviceMatch = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/u.exec(rawLine);
    if (serviceMatch) {
      service = serviceMatch[1];
      if (services.has(service)) throw new Error(`${service} is duplicated in upstream compose`);
      services.add(service);
      continue;
    }
    const imageMatch = /^ {4}image:\s*(\S.*?)\s*(?:#.*)?$/u.exec(rawLine);
    if (service && imageMatch) {
      if (images.has(service)) throw new Error(`${service} has duplicate upstream image entries`);
      images.set(service, normalizeImageValue(imageMatch[1], service));
    }
  }
  return { images, services };
}

export function validateImageLockPins({
  commitPath = defaultPaths.commitPath,
  dockerTreePath = defaultPaths.dockerTreePath,
  imageLockPath = defaultPaths.imageLockPath,
  versionPath = defaultPaths.versionPath,
} = {}) {
  const tag = readPin(versionPath, "upstream tag", /^[A-Za-z0-9._/-]+$/u);
  const commit = readPin(commitPath, "upstream commit", /^[0-9a-f]{40}$/u);
  const dockerTree = readPin(dockerTreePath, "upstream docker tree", /^[0-9a-f]{40}$/u);
  const lock = JSON.parse(readFileSync(imageLockPath, "utf8"));

  exactKeys(lock, ["format", "upstream", "images"], "image lock");
  if (lock.format !== "xtrud-supabase-image-lock-v1") {
    throw new Error("unknown image lock format");
  }
  exactKeys(lock.upstream, ["tag", "commit", "dockerTree"], "image lock upstream metadata");
  if (
    lock.upstream.tag !== tag ||
    lock.upstream.commit !== commit ||
    lock.upstream.dockerTree !== dockerTree
  ) {
    throw new Error("image lock upstream metadata does not match tracked pins");
  }

  exactKeys(lock.images, expectedServices, "image lock services");
  const seenRefs = { amd64: new Set(), arm64: new Set() };
  for (const service of expectedServices) {
    const entry = lock.images[service];
    exactKeys(entry, ["source", "amd64", "arm64"], `${service} image lock`);
    if (!/^[^@\s]+:[^@\s]+$/u.test(entry.source)) {
      throw new Error(`${service} source image must be an exact tag without a digest`);
    }
    for (const arch of ["amd64", "arm64"]) {
      const expectedPrefix = `${entry.source}@sha256:`;
      const digest = entry[arch].startsWith(expectedPrefix)
        ? entry[arch].slice(expectedPrefix.length)
        : "";
      if (!/^[0-9a-f]{64}$/u.test(digest)) {
        throw new Error(`${service} ${arch} image is not bound to its exact source tag and digest`);
      }
      if (seenRefs[arch].has(entry[arch])) {
        throw new Error(`${service} duplicates another ${arch} digest-pinned image ref`);
      }
      seenRefs[arch].add(entry[arch]);
    }
  }

  return { commit, dockerTree, lock, tag };
}

function validateComposeImageSources(composeText, pins) {
  const { images: composeImages, services: composeServices } = extractComposeImages(composeText);
  exactKeys(
    Object.fromEntries([...composeServices].map((service) => [service, true])),
    expectedServices,
    "upstream compose services",
  );
  exactKeys(Object.fromEntries(composeImages), expectedServices, "upstream compose image services");
  for (const service of expectedServices) {
    if (composeImages.get(service) !== pins.lock.images[service].source) {
      throw new Error(`${service} image lock source does not match upstream docker-compose.yml`);
    }
  }
}

export function validateUpstreamCompose({
  composePath,
  commitPath = defaultPaths.commitPath,
  dockerTreePath = defaultPaths.dockerTreePath,
  imageLockPath = defaultPaths.imageLockPath,
  versionPath = defaultPaths.versionPath,
}) {
  if (!isAbsolute(composePath)) throw new Error("upstream compose path must be absolute");
  const linkMetadata = lstatSync(composePath);
  if (linkMetadata.isSymbolicLink()) throw new Error("upstream compose must not be a symlink");
  const realComposePath = realpathSync(composePath);
  if (!statSync(realComposePath).isFile())
    throw new Error("upstream compose must be a regular file");
  const pins = validateImageLockPins({ commitPath, dockerTreePath, imageLockPath, versionPath });
  const compose = readFileSync(realComposePath);
  validateComposeImageSources(compose.toString("utf8"), pins);
  return {
    commit: pins.commit,
    composeSha256: createHash("sha256").update(compose).digest("hex"),
    dockerTree: pins.dockerTree,
    images: expectedServices.length,
    tag: pins.tag,
  };
}

export function validateUpstreamSnapshot({
  snapshotPath,
  commitPath = defaultPaths.commitPath,
  dockerTreePath = defaultPaths.dockerTreePath,
  imageLockPath = defaultPaths.imageLockPath,
  overlayPath = defaultPaths.overlayPath,
  versionPath = defaultPaths.versionPath,
}) {
  if (typeof snapshotPath !== "string" || !isAbsolute(snapshotPath)) {
    throw new Error("upstream snapshot path must be absolute");
  }
  const linkMetadata = lstatSync(snapshotPath);
  if (linkMetadata.isSymbolicLink()) throw new Error("upstream snapshot must not be a symlink");
  const snapshotRoot = realpathSync(snapshotPath);
  if (snapshotRoot === root || snapshotRoot.startsWith(`${root}/`)) {
    throw new Error("upstream snapshot must be outside the repository");
  }
  if (!statSync(snapshotRoot).isDirectory())
    throw new Error("upstream snapshot must be a directory");

  const pins = validateImageLockPins({ commitPath, dockerTreePath, imageLockPath, versionPath });
  const upstreamPath = containedDirectory(snapshotRoot, "upstream", "upstream checkout");

  const actualCommit = gitText(upstreamPath, ["rev-parse", "HEAD"]);
  const actualTag = gitText(upstreamPath, ["describe", "--exact-match", "--tags", "HEAD"]);
  const actualDockerTree = gitText(upstreamPath, ["rev-parse", "HEAD:docker"]);
  if (actualCommit !== pins.commit) throw new Error("upstream checkout commit mismatch");
  if (actualTag !== pins.tag) throw new Error("upstream checkout exact tag mismatch");
  if (actualDockerTree !== pins.dockerTree)
    throw new Error("upstream checkout docker tree mismatch");

  const gitCompose = gitBlob(upstreamPath, "HEAD:docker/docker-compose.yml");
  const checkoutComposePath = containedRegularFile(
    snapshotRoot,
    "upstream/docker/docker-compose.yml",
    "upstream docker-compose.yml",
  );
  const stackComposePath = containedRegularFile(
    snapshotRoot,
    "stack/docker-compose.yml",
    "stack docker-compose.yml",
  );
  const checkoutCompose = readFileSync(checkoutComposePath);
  const stackCompose = readFileSync(stackComposePath);
  if (!checkoutCompose.equals(gitCompose) || !stackCompose.equals(gitCompose)) {
    throw new Error("docker-compose.yml does not byte-match the pinned upstream Git blob");
  }

  const copiedLockPath = containedRegularFile(
    snapshotRoot,
    "stack/xtrud-image-digests.json",
    "snapshot image lock",
  );
  if (!readFileSync(copiedLockPath).equals(readFileSync(imageLockPath))) {
    throw new Error("snapshot image lock does not byte-match the tracked lock");
  }
  const copiedOverlayPath = containedRegularFile(
    snapshotRoot,
    "stack/docker-compose.rehearsal.yml",
    "snapshot rehearsal overlay",
  );
  const overlayMetadata = lstatSync(overlayPath);
  if (overlayMetadata.isSymbolicLink() || !overlayMetadata.isFile()) {
    throw new Error("tracked rehearsal overlay must be a regular non-symlink file");
  }
  if (!readFileSync(copiedOverlayPath).equals(readFileSync(overlayPath))) {
    throw new Error("snapshot rehearsal overlay does not byte-match the tracked overlay");
  }

  const manifestPath = containedRegularFile(snapshotRoot, "manifest.json", "snapshot manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  exactKeys(manifest, ["format", "upstream", "runnable", "nextGate"], "snapshot manifest");
  exactKeys(manifest.upstream, ["tag", "commit", "dockerTree"], "snapshot manifest upstream");
  if (
    manifest.format !== "xtrud-exact-rehearsal-v1" ||
    manifest.runnable !== false ||
    manifest.upstream.tag !== pins.tag ||
    manifest.upstream.commit !== pins.commit ||
    manifest.upstream.dockerTree !== pins.dockerTree
  ) {
    throw new Error("snapshot manifest does not match tracked upstream pins");
  }

  validateComposeImageSources(gitCompose.toString("utf8"), pins);

  return {
    commit: pins.commit,
    composeSha256: createHash("sha256").update(gitCompose).digest("hex"),
    dockerTree: pins.dockerTree,
    images: expectedServices.length,
    tag: pins.tag,
  };
}

function readCliArgs(argv) {
  if (argv.length !== 2 || !new Set(["--compose", "--snapshot"]).has(argv[0]) || !argv[1]) {
    throw new Error("usage: check-upstream-snapshot.mjs (--compose PATH | --snapshot PATH)");
  }
  return argv[0] === "--compose"
    ? { composePath: argv[1], snapshotPath: undefined }
    : { composePath: undefined, snapshotPath: argv[1] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = readCliArgs(process.argv.slice(2));
    if (Boolean(args.composePath) === Boolean(args.snapshotPath)) {
      throw new Error("provide exactly one of --compose or --snapshot");
    }
    const result = args.composePath
      ? validateUpstreamCompose({ composePath: args.composePath })
      : validateUpstreamSnapshot({ snapshotPath: args.snapshotPath });
    console.log(
      `Supabase upstream snapshot passed: tag=${result.tag}, commit=${result.commit}, dockerTree=${result.dockerTree}, images=${result.images}, composeSha256=${result.composeSha256}.`,
    );
  } catch (error) {
    console.error(`Supabase upstream snapshot FAILED: ${error.message}`);
    process.exit(1);
  }
}
