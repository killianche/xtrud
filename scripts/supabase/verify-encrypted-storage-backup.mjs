#!/usr/bin/env node

/**
 * Decrypts a Storage backup only into a private transient directory, rejects
 * unsafe tar entries, and verifies every source-derived object checksum.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

class VerifyError extends Error {}

function usage() {
  return [
    "Usage: node scripts/supabase/verify-encrypted-storage-backup.mjs /absolute/archive.tar.age|gpg",
    "",
    "For age archives set BACKUP_IDENTITY to an absolute mode-0600 private identity file.",
    "GPG archives use the private key available to the local GPG agent.",
  ].join("\n");
}

function assertAbsoluteNormalized(path, label) {
  if (!path || !isAbsolute(path) || resolve(path) !== path) {
    throw new VerifyError(`${label} must be an absolute normalized path.`);
  }
}

function assertNoSymlinkComponents(path) {
  let cursor = path;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (;;) {
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new VerifyError("Symlink path components are forbidden.");
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function secureRegularFile(path, label, requireMode0600 = false) {
  assertAbsoluteNormalized(path, label);
  assertNoSymlinkComponents(path);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new VerifyError(`${label} must be a regular non-symlink file.`);
  }
  if (requireMode0600 && (info.mode & 0o777) !== 0o600) {
    throw new VerifyError(`${label} must have mode 0600.`);
  }
  if (requireMode0600 && typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new VerifyError(`${label} must be owned by the current user.`);
  }
  return realpathSync(path);
}

function waitForProcess(child, command, collectStdout = false) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      if (collectStdout) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", () => {
      // Tool stderr can include paths or provider details; the verifier reports only exit status.
    });
    child.on("error", () => rejectPromise(new VerifyError(`${command} could not be started.`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else rejectPromise(new VerifyError(`${command} failed with exit code ${code}.`));
    });
  });
}

async function commandOutput(command, args, commandEnv) {
  const child = spawn(command, args, {
    env: commandEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return await waitForProcess(child, command, true);
}

async function commandNoOutput(command, args, commandEnv) {
  const child = spawn(command, args, {
    env: commandEnv,
    stdio: ["ignore", "ignore", "pipe"],
  });
  await waitForProcess(child, command);
}

async function decryptArchive(archive, identity, destination, commandEnv) {
  const descriptor = openSync(destination, "wx", 0o600);
  try {
    const ageArchive = archive.endsWith(".tar.age");
    const command = ageArchive ? "age" : "gpg";
    const args = ageArchive
      ? ["--decrypt", "--identity", identity, archive]
      : ["--batch", "--decrypt", archive];
    const child = spawn(command, args, {
      env: commandEnv,
      stdio: ["ignore", descriptor, "pipe"],
    });
    await waitForProcess(child, command);
  } finally {
    closeSync(descriptor);
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function parseTarEntries(listing, verboseListing) {
  const entries = listing.endsWith("\n") ? listing.slice(0, -1).split("\n") : listing.split("\n");
  const verbose = verboseListing.endsWith("\n")
    ? verboseListing.slice(0, -1).split("\n")
    : verboseListing.split("\n");
  if (entries.length !== verbose.length || entries.length < 2) {
    throw new VerifyError("Archive entry metadata is incomplete.");
  }
  if (new Set(entries).size !== entries.length) {
    throw new VerifyError("Archive contains duplicate entries.");
  }
  const blobs = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const type = verbose[index][0];
    if (entry === "manifest.json") {
      if (type !== "-") throw new VerifyError("manifest.json is not a regular file.");
    } else if (entry === "objects/") {
      if (type !== "d") throw new VerifyError("objects/ is not a directory.");
    } else if (/^objects\/[0-9a-f]{64}\.blob$/.test(entry)) {
      if (type !== "-") throw new VerifyError("An object archive entry is not a regular file.");
      blobs.push(entry);
    } else {
      throw new VerifyError("Archive contains an unsafe or unexpected entry.");
    }
  }
  if (!entries.includes("manifest.json") || !entries.includes("objects/")) {
    throw new VerifyError("Archive is missing required entries.");
  }
  return blobs.sort();
}

function validIso(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function containsAsciiControl(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validOriginalPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !containsAsciiControl(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function validateManifest(manifest, blobs) {
  let sourceUrl;
  try {
    sourceUrl = new URL(manifest?.source_origin);
  } catch {
    throw new VerifyError("Storage manifest source origin is invalid.");
  }
  const secureSourceOrigin =
    sourceUrl.protocol === "https:" ||
    (sourceUrl.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(sourceUrl.hostname));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.backup_format !== "xtrud-supabase-storage-v1" ||
    manifest.complete !== true ||
    !validIso(manifest.capture_started_at) ||
    !validIso(manifest.capture_ended_at) ||
    Date.parse(manifest.capture_ended_at) < Date.parse(manifest.capture_started_at) ||
    sourceUrl.origin !== manifest.source_origin ||
    sourceUrl.username ||
    sourceUrl.password ||
    sourceUrl.search ||
    sourceUrl.hash ||
    !secureSourceOrigin ||
    !Array.isArray(manifest.buckets) ||
    !Array.isArray(manifest.objects) ||
    !manifest.summary ||
    typeof manifest.summary !== "object"
  ) {
    throw new VerifyError("Storage manifest format or completeness is invalid.");
  }
  const bucketIds = [];
  for (const bucket of manifest.buckets) {
    if (
      !bucket ||
      typeof bucket !== "object" ||
      typeof bucket.id !== "string" ||
      !bucket.id ||
      typeof bucket.name !== "string" ||
      !bucket.name ||
      typeof bucket.public !== "boolean" ||
      (bucket.file_size_limit !== null &&
        (!Number.isSafeInteger(bucket.file_size_limit) || bucket.file_size_limit < 0)) ||
      (bucket.allowed_mime_types !== null &&
        (!Array.isArray(bucket.allowed_mime_types) ||
          bucket.allowed_mime_types.some((value) => typeof value !== "string")))
    ) {
      throw new VerifyError("Storage manifest contains an invalid bucket config.");
    }
    bucketIds.push(bucket.id);
  }
  const bucketSet = new Set(bucketIds);
  if (bucketSet.size !== bucketIds.length) {
    throw new VerifyError("Storage manifest contains duplicate buckets.");
  }

  const objectKeys = new Set();
  const archivePaths = [];
  let totalBytes = 0;
  for (const object of manifest.objects) {
    if (
      !object ||
      typeof object !== "object" ||
      !bucketSet.has(object.bucket_id) ||
      !validOriginalPath(object.path) ||
      !/^objects\/[0-9a-f]{64}\.blob$/.test(object.archive_path) ||
      !Number.isSafeInteger(object.bytes) ||
      object.bytes < 0 ||
      !/^[0-9a-f]{64}$/.test(object.sha256) ||
      object.archive_path !==
        `objects/${createHash("sha256")
          .update(object.bucket_id)
          .update("\0")
          .update(object.path)
          .digest("hex")}.blob`
    ) {
      throw new VerifyError("Storage manifest contains an invalid object record.");
    }
    const key = `${object.bucket_id}\0${object.path}`;
    if (objectKeys.has(key)) throw new VerifyError("Storage manifest contains duplicate objects.");
    objectKeys.add(key);
    archivePaths.push(object.archive_path);
    totalBytes += object.bytes;
    if (!Number.isSafeInteger(totalBytes)) {
      throw new VerifyError("Storage manifest total byte count exceeds the safe integer range.");
    }
  }
  archivePaths.sort();
  if (new Set(archivePaths).size !== archivePaths.length) {
    throw new VerifyError("Storage manifest reuses an archive blob path.");
  }
  if (JSON.stringify(archivePaths) !== JSON.stringify(blobs)) {
    throw new VerifyError("Archive blobs do not match the Storage manifest.");
  }
  if (
    manifest.summary.bucket_count !== manifest.buckets.length ||
    manifest.summary.object_count !== manifest.objects.length ||
    manifest.summary.total_bytes !== totalBytes
  ) {
    throw new VerifyError("Storage manifest summary is inconsistent.");
  }
}

export async function verifyStorageBackup(argv, env = process.env) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  if (argv.length !== 1) throw new VerifyError(usage());
  const archive = secureRegularFile(argv[0], "Archive");
  if (!archive.endsWith(".tar.age") && !archive.endsWith(".tar.gpg")) {
    throw new VerifyError("Unsupported encrypted archive extension.");
  }
  let identity = null;
  if (archive.endsWith(".tar.age")) {
    identity = secureRegularFile(env.BACKUP_IDENTITY, "BACKUP_IDENTITY", true);
  }
  const stageDir = mkdtempSync(join(tmpdir(), "xtrud-storage-verify-"));
  try {
    const tarPath = join(stageDir, "bundle.tar");
    await decryptArchive(archive, identity, tarPath, env);
    const listing = await commandOutput("tar", ["-tf", tarPath], env);
    const verboseListing = await commandOutput("tar", ["-tvf", tarPath], env);
    const blobs = parseTarEntries(listing, verboseListing);
    await commandNoOutput("tar", ["-xf", tarPath, "-C", stageDir], env);
    const manifestPath = join(stageDir, "manifest.json");
    const manifestInfo = lstatSync(manifestPath);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) {
      throw new VerifyError("Extracted manifest is not a regular file.");
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      throw new VerifyError("Storage manifest is not valid JSON.");
    }
    validateManifest(manifest, blobs);
    for (const object of manifest.objects) {
      const path = join(stageDir, object.archive_path);
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== object.bytes) {
        throw new VerifyError("Extracted object size or type is invalid.");
      }
      if ((await sha256File(path)) !== object.sha256) {
        throw new VerifyError("Extracted object checksum does not match the manifest.");
      }
    }
    return { archive, checksum: await sha256File(archive), manifest };
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  verifyStorageBackup(process.argv.slice(2))
    .then((result) => {
      if (result.help) {
        process.stdout.write(`${usage()}\n`);
      } else {
        process.stdout.write(
          `Verified Storage backup: ${result.archive}\nSHA-256: ${result.checksum}\n`,
        );
      }
    })
    .catch((error) => {
      const message =
        error instanceof VerifyError ? error.message : "Unexpected verification failure.";
      process.stderr.write(`ERROR: ${message}\n`);
      process.exitCode = 1;
    });
}
