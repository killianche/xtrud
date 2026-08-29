#!/usr/bin/env node

/**
 * Captures every Supabase Storage bucket and object into one encrypted archive.
 * Source object names are metadata only; local blob names are SHA-256 identifiers,
 * so an untrusted Storage path can never become a filesystem path.
 */

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = realpathSync(resolve(dirname(scriptPath), "../.."));
const pageSize = 1000;

class BackupError extends Error {}

function usage() {
  return [
    "Usage: node scripts/supabase/create-encrypted-storage-backup.mjs /absolute/output/directory",
    "",
    "Required environment:",
    "  SUPABASE_URL                       exact Supabase project URL",
    "  SUPABASE_STORAGE_KEY_FILE          absolute mode-0600 service/secret key file",
    "  BACKUP_ENCRYPTION                  age or gpg",
    "  BACKUP_RECIPIENT                   age/GPG public recipient",
  ].join("\n");
}

function assertAbsoluteNormalized(path, label) {
  if (!path || !isAbsolute(path) || resolve(path) !== path) {
    throw new BackupError(`${label} must be an absolute normalized path.`);
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
      throw new BackupError("Symlink path components are forbidden.");
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function isInside(parent, child) {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..");
}

function secureOutputDirectory(path) {
  assertAbsoluteNormalized(path, "Output directory");
  assertNoSymlinkComponents(path);
  if (isInside(repoRoot, path)) {
    throw new BackupError("Output inside the repository is forbidden.");
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(path);
  if (canonical !== path) {
    throw new BackupError("Output directory must not resolve through aliases or symlinks.");
  }
  if (isInside(repoRoot, canonical)) {
    throw new BackupError("Output inside the repository is forbidden.");
  }
  const info = lstatSync(canonical);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new BackupError("Output directory must be a private non-symlink directory (mode 0700).");
  }
  return canonical;
}

function secureSecretFile(path, label) {
  assertAbsoluteNormalized(path, label);
  assertNoSymlinkComponents(path);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    throw new BackupError(`${label} must be a regular non-symlink mode-0600 file.`);
  }
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new BackupError(`${label} must be owned by the current user.`);
  }
  return path;
}

function readSecret(path) {
  const raw = readFileSync(path, "utf8");
  const value = raw.endsWith("\n") ? raw.slice(0, -1).replace(/\r$/, "") : raw;
  if (!value || /[\r\n]/.test(value) || value.trim() !== value) {
    throw new BackupError("Storage key file must contain exactly one non-empty line.");
  }
  return value;
}

function validateSourceUrl(value, env) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new BackupError("SUPABASE_URL is not a valid URL.");
  }
  const loopbackTestUrl =
    env.NODE_ENV === "test" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1");
  if (url.protocol !== "https:" && !loopbackTestUrl) {
    throw new BackupError("SUPABASE_URL must use HTTPS (loopback HTTP is allowed only in tests).");
  }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new BackupError(
      "SUPABASE_URL must be an origin without credentials, path, query, or hash.",
    );
  }
  return url.origin;
}

function encryptionExtension(value) {
  if (value === "age") return "age";
  if (value === "gpg") return "gpg";
  throw new BackupError("BACKUP_ENCRYPTION must be age or gpg.");
}

function containsAsciiControl(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeObjectName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !containsAsciiControl(name)
  );
}

function encodeObjectPath(bucketId, objectPath) {
  return [bucketId, ...objectPath.split("/")].map(encodeURIComponent).join("/");
}

function selectedBucket(bucket) {
  if (
    !bucket ||
    typeof bucket !== "object" ||
    typeof bucket.id !== "string" ||
    !bucket.id ||
    typeof bucket.name !== "string" ||
    !bucket.name ||
    typeof bucket.public !== "boolean" ||
    (bucket.file_size_limit !== null &&
      bucket.file_size_limit !== undefined &&
      (!Number.isSafeInteger(bucket.file_size_limit) || bucket.file_size_limit < 0)) ||
    (bucket.allowed_mime_types !== null &&
      bucket.allowed_mime_types !== undefined &&
      (!Array.isArray(bucket.allowed_mime_types) ||
        bucket.allowed_mime_types.some((value) => typeof value !== "string")))
  ) {
    throw new BackupError("Storage returned an invalid bucket record.");
  }
  return {
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    file_size_limit: typeof bucket.file_size_limit === "number" ? bucket.file_size_limit : null,
    allowed_mime_types: bucket.allowed_mime_types ?? null,
    type: typeof bucket.type === "string" ? bucket.type : null,
    created_at: typeof bucket.created_at === "string" ? bucket.created_at : null,
    updated_at: typeof bucket.updated_at === "string" ? bucket.updated_at : null,
  };
}

function selectedObject(bucketId, path, object) {
  if (typeof object.id !== "string" || !object.id) {
    throw new BackupError("Storage returned an invalid object record.");
  }
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata : {};
  return {
    bucket_id: bucketId,
    path,
    source: {
      id: object.id,
      created_at: typeof object.created_at === "string" ? object.created_at : null,
      updated_at: typeof object.updated_at === "string" ? object.updated_at : null,
      last_accessed_at:
        typeof object.last_accessed_at === "string" ? object.last_accessed_at : null,
      size:
        typeof metadata.size === "number" && Number.isSafeInteger(metadata.size)
          ? metadata.size
          : null,
      mimetype: typeof metadata.mimetype === "string" ? metadata.mimetype : null,
      cache_control: typeof metadata.cacheControl === "string" ? metadata.cacheControl : null,
      etag: typeof metadata.eTag === "string" ? metadata.eTag : null,
    },
  };
}

async function fetchJson(fetchImpl, url, init, operation) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new BackupError(`${operation} failed before an HTTP response.`);
  }
  if (!response.ok) {
    throw new BackupError(`${operation} failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new BackupError(`${operation} returned invalid JSON.`);
  }
}

function authHeaders(key, json = false) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function listBuckets(fetchImpl, sourceUrl, key) {
  const buckets = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL("/storage/v1/bucket", sourceUrl);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("sortColumn", "id");
    url.searchParams.set("sortOrder", "asc");
    const page = await fetchJson(fetchImpl, url, { headers: authHeaders(key) }, "Bucket inventory");
    if (!Array.isArray(page)) throw new BackupError("Bucket inventory was not an array.");
    buckets.push(...page.map(selectedBucket));
    if (page.length < pageSize) break;
  }
  buckets.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(buckets.map((bucket) => bucket.id)).size !== buckets.length) {
    throw new BackupError("Bucket inventory contains duplicate identifiers.");
  }
  return buckets;
}

async function listObjects(fetchImpl, sourceUrl, key, bucketId) {
  const queue = [""];
  const queued = new Set(queue);
  const objects = [];
  while (queue.length > 0) {
    const prefix = queue.shift();
    for (let offset = 0; ; offset += pageSize) {
      const page = await fetchJson(
        fetchImpl,
        new URL(`/storage/v1/object/list/${encodeURIComponent(bucketId)}`, sourceUrl),
        {
          method: "POST",
          headers: authHeaders(key, true),
          body: JSON.stringify({
            prefix,
            limit: pageSize,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
        "Object inventory",
      );
      if (!Array.isArray(page)) throw new BackupError("Object inventory was not an array.");
      for (const entry of page) {
        if (!entry || typeof entry !== "object" || !safeObjectName(entry.name)) {
          throw new BackupError("Storage returned an unsafe object or folder name.");
        }
        const path = `${prefix}${entry.name}`;
        if (entry.id == null && entry.metadata == null) {
          const childPrefix = `${path}/`;
          if (!queued.has(childPrefix)) {
            queued.add(childPrefix);
            queue.push(childPrefix);
            queue.sort();
          }
        } else {
          objects.push(selectedObject(bucketId, path, entry));
        }
      }
      if (page.length < pageSize) break;
    }
  }
  objects.sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(objects.map((object) => object.path)).size !== objects.length) {
    throw new BackupError("Object inventory contains duplicate paths.");
  }
  return objects;
}

async function scanStorage(fetchImpl, sourceUrl, key) {
  const buckets = await listBuckets(fetchImpl, sourceUrl, key);
  const objects = [];
  for (const bucket of buckets) {
    objects.push(...(await listObjects(fetchImpl, sourceUrl, key, bucket.id)));
  }
  objects.sort((a, b) => `${a.bucket_id}\0${a.path}`.localeCompare(`${b.bucket_id}\0${b.path}`));
  return { buckets, objects };
}

async function downloadObject(fetchImpl, sourceUrl, key, object, objectsDir) {
  let response;
  try {
    response = await fetchImpl(
      new URL(`/storage/v1/object/${encodeObjectPath(object.bucket_id, object.path)}`, sourceUrl),
      { headers: { Authorization: `Bearer ${key}`, apikey: key, "Cache-Control": "no-store" } },
    );
  } catch {
    throw new BackupError("Object download failed before an HTTP response.");
  }
  if (!response.ok || !response.body) {
    throw new BackupError(`Object download failed with HTTP ${response.status}.`);
  }

  const archiveId = createHash("sha256")
    .update(object.bucket_id)
    .update("\0")
    .update(object.path)
    .digest("hex");
  const archivePath = `objects/${archiveId}.blob`;
  const localPath = join(objectsDir, `${archiveId}.blob`);
  const file = await open(localPath, "wx", 0o600);
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const rawChunk of response.body) {
      const chunk = Buffer.from(rawChunk);
      bytes += chunk.length;
      hash.update(chunk);
      await file.write(chunk);
    }
    await file.sync();
  } catch {
    throw new BackupError("Object download stream failed.");
  } finally {
    await file.close();
  }

  const listedSize = object.source.size;
  if (listedSize !== null && listedSize !== bytes) {
    throw new BackupError("Downloaded object size differs from the source inventory.");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) !== bytes) {
    throw new BackupError("Downloaded object size differs from the HTTP Content-Length.");
  }
  return {
    ...object,
    archive_path: archivePath,
    bytes,
    sha256: hash.digest("hex"),
    response: {
      content_type: response.headers.get("content-type"),
      cache_control: response.headers.get("cache-control"),
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
    },
  };
}

function waitForProcess(child, command) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString("utf8");
    });
    child.on("error", () => rejectPromise(new BackupError(`${command} could not be started.`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new BackupError(`${command} failed with exit code ${code}.`));
    });
  });
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], ...options });
  await waitForProcess(child, command);
}

async function encryptFile(encryption, recipient, inputPath, candidatePath, commandEnv) {
  const descriptor = openSync(candidatePath, "wx", 0o600);
  try {
    const command = encryption === "age" ? "age" : "gpg";
    const args =
      encryption === "age"
        ? ["--encrypt", "--recipient", recipient, inputPath]
        : ["--batch", "--encrypt", "--recipient", recipient, "--output", "-", inputPath];
    const child = spawn(command, args, {
      env: commandEnv,
      stdio: ["ignore", descriptor, "pipe"],
    });
    await waitForProcess(child, command);
  } finally {
    closeSync(descriptor);
    try {
      chmodSync(candidatePath, 0o600);
    } catch {
      // The caller removes an incomplete candidate in its final cleanup.
    }
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function publishNoOverwrite(candidatePath, artifactPath) {
  try {
    statSync(artifactPath);
    throw new BackupError("Refusing to overwrite an existing encrypted artifact.");
  } catch (error) {
    if (error instanceof BackupError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    // A hard link publishes atomically and fails if another process won the name.
    linkSync(candidatePath, artifactPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new BackupError("Refusing to overwrite an existing encrypted artifact.");
    }
    throw error;
  }
  unlinkSync(candidatePath);
}

export async function runStorageBackup(argv, env = process.env, fetchImpl = globalThis.fetch) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length !== 1) throw new BackupError(usage());
  const outputDir = secureOutputDirectory(argv[0]);
  const sourceUrl = validateSourceUrl(env.SUPABASE_URL, env);
  const keyFile = secureSecretFile(env.SUPABASE_STORAGE_KEY_FILE, "SUPABASE_STORAGE_KEY_FILE");
  const key = readSecret(keyFile);
  const encryption = encryptionExtension(env.BACKUP_ENCRYPTION);
  const recipient = env.BACKUP_RECIPIENT?.trim();
  if (!recipient || /[\r\n]/.test(recipient)) {
    throw new BackupError("BACKUP_RECIPIENT must be a single non-empty line.");
  }

  const captureStartedAt = new Date().toISOString();
  const timestamp = captureStartedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const artifactPath = join(outputDir, `supabase-storage-${timestamp}.tar.${encryption}`);
  const candidatePath = join(
    outputDir,
    `.supabase-storage-candidate-${process.pid}-${randomUUID()}`,
  );
  if (existsSync(artifactPath))
    throw new BackupError("Refusing to overwrite an existing artifact.");
  const stageDir = mkdtempSync(join(outputDir, ".supabase-storage-backup-"));
  const objectsDir = join(stageDir, "objects");
  mkdirSync(objectsDir, { mode: 0o700 });

  try {
    const initial = await scanStorage(fetchImpl, sourceUrl, key);
    const capturedObjects = [];
    for (const object of initial.objects) {
      capturedObjects.push(await downloadObject(fetchImpl, sourceUrl, key, object, objectsDir));
    }
    const finalInventory = await scanStorage(fetchImpl, sourceUrl, key);
    if (JSON.stringify(initial) !== JSON.stringify(finalInventory)) {
      throw new BackupError("Storage inventory changed during capture; no artifact was published.");
    }
    const captureEndedAt = new Date().toISOString();
    const totalBytes = capturedObjects.reduce((sum, object) => sum + object.bytes, 0);
    const manifest = {
      backup_format: "xtrud-supabase-storage-v1",
      complete: true,
      capture_started_at: captureStartedAt,
      capture_ended_at: captureEndedAt,
      source_origin: sourceUrl,
      buckets: initial.buckets,
      objects: capturedObjects,
      summary: {
        bucket_count: initial.buckets.length,
        object_count: capturedObjects.length,
        total_bytes: totalBytes,
      },
    };
    writeFileSync(join(stageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    const tarPath = join(stageDir, "bundle.tar");
    await runCommand("tar", ["-C", stageDir, "-cf", tarPath, "manifest.json", "objects"], {
      env,
    });
    await encryptFile(encryption, recipient, tarPath, candidatePath, env);
    const candidate = lstatSync(candidatePath);
    if (!candidate.isFile() || candidate.isSymbolicLink() || candidate.size === 0) {
      throw new BackupError("Encryption did not produce a regular non-empty ciphertext file.");
    }
    const checksum = await sha256File(candidatePath);
    publishNoOverwrite(candidatePath, artifactPath);
    return { artifactPath, checksum, manifest };
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
    rmSync(candidatePath, { force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runStorageBackup(process.argv.slice(2))
    .then((result) => {
      if (result.help) {
        process.stdout.write(`${usage()}\n`);
      } else {
        process.stdout.write(
          `Encrypted Storage backup written: ${result.artifactPath}\nSHA-256: ${result.checksum}\n`,
        );
      }
    })
    .catch((error) => {
      const message = error instanceof BackupError ? error.message : "Unexpected backup failure.";
      process.stderr.write(`ERROR: ${message}\n`);
      process.exitCode = 1;
    });
}
