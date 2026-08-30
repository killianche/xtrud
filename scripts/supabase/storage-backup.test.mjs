import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publishNoOverwrite, runStorageBackup } from "./create-encrypted-storage-backup.mjs";
import { verifyStorageBackup } from "./verify-encrypted-storage-backup.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function makeFixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "xtrud-storage-backup-test-")));
  const bin = join(base, "bin");
  const output = join(base, "output");
  const keyFile = join(base, "storage-key");
  const identity = join(base, "identity.txt");
  const ageArgvLog = join(base, "age-argv.log");
  mkdirSync(bin, { mode: 0o700 });
  mkdirSync(output, { mode: 0o700 });
  writeFileSync(keyFile, "fixture-service-secret\n", { mode: 0o600 });
  writeFileSync(identity, "fixture-age-identity\n", { mode: 0o600 });
  writeFileSync(ageArgvLog, "", { mode: 0o600 });
  const fakeAge = join(bin, "age");
  writeFileSync(
    fakeAge,
    `#!/bin/sh
if [ -n "\${AGE_ARGV_LOG:-}" ]; then
  for arg in "$@"; do printf '%s\n' "$arg" >>"$AGE_ARGV_LOG"; done
fi
input=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --decrypt|--encrypt) shift ;;
    --identity|--recipient) shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
[ -n "$input" ] || exit 2
/bin/cat "$input"
`,
    { mode: 0o700 },
  );
  chmodSync(fakeAge, 0o700);
  return { base, bin, output, keyFile, identity, ageArgvLog };
}

function commandEnv(fixture) {
  return {
    ...process.env,
    PATH: `${fixture.bin}:${process.env.PATH}`,
    NODE_ENV: "test",
    SUPABASE_URL: "http://127.0.0.1",
    SUPABASE_STORAGE_KEY_FILE: fixture.keyFile,
    BACKUP_ENCRYPTION: "age",
    BACKUP_RECIPIENT: "age1fixture",
    AGE_ARGV_LOG: fixture.ageArgvLog,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function storageFetch({ traversal = false, inventoryChanges = false } = {}) {
  let bucketScans = 0;
  let authorizationFailures = 0;
  const requests = [];
  const objects = new Map([
    ["/storage/v1/object/portfolio/root.txt", Buffer.from("root object\n")],
    ["/storage/v1/object/portfolio/nested/photo.bin", Buffer.from([0, 1, 2, 255])],
  ]);
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    if (
      headers.get("authorization") !== "Bearer fixture-service-secret" ||
      headers.get("apikey") !== "fixture-service-secret"
    ) {
      authorizationFailures += 1;
      return jsonResponse({}, 401);
    }
    requests.push({ method: init.method ?? "GET", path: url.pathname });
    if (url.pathname === "/storage/v1/bucket") {
      const offset = Number(url.searchParams.get("offset"));
      if (offset === 0) bucketScans += 1;
      return jsonResponse(
        offset === 0
          ? [
              {
                id: "portfolio",
                name: "portfolio",
                public: true,
                file_size_limit: 1048576,
                allowed_mime_types: ["image/jpeg", "text/plain"],
                type: "STANDARD",
                created_at: "2026-08-25T00:00:00.000Z",
                updated_at:
                  inventoryChanges && bucketScans > 1
                    ? "2026-08-25T00:01:00.000Z"
                    : "2026-08-25T00:00:00.000Z",
              },
            ]
          : [],
      );
    }
    if (url.pathname === "/storage/v1/object/list/portfolio") {
      const body = JSON.parse(init.body);
      const page =
        body.prefix === ""
          ? traversal
            ? [{ name: "..", id: null, metadata: null }]
            : [
                { name: "nested", id: null, metadata: null },
                {
                  name: "root.txt",
                  id: "object-root",
                  created_at: "2026-08-25T00:00:00.000Z",
                  updated_at: "2026-08-25T00:00:00.000Z",
                  last_accessed_at: "2026-08-25T00:00:00.000Z",
                  metadata: { size: 12, mimetype: "text/plain", cacheControl: "3600" },
                },
              ]
          : body.prefix === "nested/"
            ? [
                {
                  name: "photo.bin",
                  id: "object-photo",
                  created_at: "2026-08-25T00:00:00.000Z",
                  updated_at: "2026-08-25T00:00:00.000Z",
                  last_accessed_at: "2026-08-25T00:00:00.000Z",
                  metadata: { size: 4, mimetype: "application/octet-stream" },
                },
              ]
            : [];
      return jsonResponse(page);
    }
    if (objects.has(url.pathname)) {
      const contents = objects.get(url.pathname);
      return new Response(contents, {
        status: 200,
        headers: {
          "Content-Length": String(contents.length),
          "Content-Type": "application/octet-stream",
          ETag: '"fixture-etag"',
        },
      });
    }
    return jsonResponse({}, 404);
  };
  return {
    fetchImpl,
    requests,
    authorizationFailures: () => authorizationFailures,
  };
}

test("captures every nested object, bucket config, hashes, and verifies the archive", async () => {
  const fixture = makeFixture();
  const storage = storageFetch();
  try {
    const created = await runStorageBackup(
      [fixture.output],
      commandEnv(fixture),
      storage.fetchImpl,
    );
    assert.equal(storage.authorizationFailures(), 0);
    assert.doesNotMatch(readFileSync(fixture.ageArgvLog, "utf8"), /fixture-service-secret/);
    assert.equal(readdirSync(fixture.output).length, 1);
    assert.match(created.artifactPath, /supabase-storage-\d{8}T\d{6}Z\.tar\.age$/);
    assert.equal(created.manifest.backup_format, "xtrud-supabase-storage-v1");
    assert.equal(created.manifest.summary.bucket_count, 1);
    assert.equal(created.manifest.summary.object_count, 2);
    assert.equal(created.manifest.summary.total_bytes, 16);
    assert.deepEqual(created.manifest.buckets[0].allowed_mime_types, ["image/jpeg", "text/plain"]);
    assert.deepEqual(
      created.manifest.objects.map((object) => object.path),
      ["nested/photo.bin", "root.txt"],
    );
    for (const object of created.manifest.objects) {
      assert.match(object.archive_path, /^objects\/[0-9a-f]{64}\.blob$/);
      assert.match(object.sha256, /^[0-9a-f]{64}$/);
    }
    assert.equal(
      readdirSync(fixture.output).some((file) => file.startsWith(".supabase-storage")),
      false,
    );
    assert.equal(
      storage.requests.filter((request) => request.path === "/storage/v1/bucket").length,
      2,
    );

    const verified = await verifyStorageBackup([created.artifactPath], {
      ...commandEnv(fixture),
      BACKUP_IDENTITY: fixture.identity,
    });
    assert.equal(verified.manifest.summary.object_count, 2);
    assert.match(verified.checksum, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("rejects an unsafe source path and removes every plaintext staging file", async () => {
  const fixture = makeFixture();
  try {
    const storage = storageFetch({ traversal: true });
    await assert.rejects(
      runStorageBackup([fixture.output], commandEnv(fixture), storage.fetchImpl),
      /unsafe object or folder name/,
    );
    assert.deepEqual(readdirSync(fixture.output), []);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("rejects a changing source inventory and publishes no partial backup", async () => {
  const fixture = makeFixture();
  try {
    const storage = storageFetch({ inventoryChanges: true });
    await assert.rejects(
      runStorageBackup([fixture.output], commandEnv(fixture), storage.fetchImpl),
      /inventory changed during capture/,
    );
    assert.deepEqual(readdirSync(fixture.output), []);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("rejects a non-0600 secret file before any network request", async () => {
  const fixture = makeFixture();
  let networkCalled = false;
  try {
    chmodSync(fixture.keyFile, 0o644);
    await assert.rejects(
      runStorageBackup([fixture.output], commandEnv(fixture), async () => {
        networkCalled = true;
        throw new Error("network must not be called");
      }),
      /mode-0600/,
    );
    assert.equal(networkCalled, false);
    assert.deepEqual(readdirSync(fixture.output), []);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("rejects secret-file symlinks and repository output without creating it", async () => {
  const fixture = makeFixture();
  const keyLink = join(fixture.base, "storage-key-link");
  const forbiddenOutput = join(root, `.storage-backup-forbidden-${process.pid}`);
  symlinkSync(fixture.keyFile, keyLink);
  try {
    await assert.rejects(
      runStorageBackup(
        [fixture.output],
        { ...commandEnv(fixture), SUPABASE_STORAGE_KEY_FILE: keyLink },
        async () => {
          throw new Error("network must not be called");
        },
      ),
      /Symlink path components are forbidden/,
    );
    await assert.rejects(
      runStorageBackup([forbiddenOutput], commandEnv(fixture), async () => {
        throw new Error("network must not be called");
      }),
      /inside the repository is forbidden/,
    );
    assert.throws(() => readdirSync(forbiddenOutput));
  } finally {
    rmSync(forbiddenOutput, { recursive: true, force: true });
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("atomic publication never overwrites an existing artifact", () => {
  const fixture = makeFixture();
  const candidate = join(fixture.output, "candidate");
  const artifact = join(fixture.output, "artifact");
  try {
    writeFileSync(candidate, "new", { mode: 0o600 });
    writeFileSync(artifact, "existing", { mode: 0o600 });
    assert.throws(() => publishNoOverwrite(candidate, artifact), /Refusing to overwrite/);
    assert.equal(readFileSync(artifact, "utf8"), "existing");
    assert.equal(readFileSync(candidate, "utf8"), "new");
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("verifier rejects object bytes that do not match the manifest checksum", async () => {
  const fixture = makeFixture();
  const unpacked = join(fixture.base, "tampered");
  const tamperedArchive = join(fixture.base, "tampered.tar.age");
  mkdirSync(unpacked, { mode: 0o700 });
  try {
    const storage = storageFetch();
    const created = await runStorageBackup(
      [fixture.output],
      commandEnv(fixture),
      storage.fetchImpl,
    );
    execFileSync("tar", ["-xf", created.artifactPath, "-C", unpacked]);
    const [blob] = readdirSync(join(unpacked, "objects"));
    const blobPath = join(unpacked, "objects", blob);
    const bytes = readFileSync(blobPath);
    writeFileSync(blobPath, Buffer.alloc(bytes.length, 0x41), { mode: 0o600 });
    execFileSync("tar", ["-C", unpacked, "-cf", tamperedArchive, "manifest.json", "objects"]);
    await assert.rejects(
      verifyStorageBackup([tamperedArchive], {
        ...commandEnv(fixture),
        BACKUP_IDENTITY: fixture.identity,
      }),
      /checksum does not match/,
    );
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("verifier rejects a symlink entry before extraction", async () => {
  const fixture = makeFixture();
  const stage = join(fixture.base, "malicious");
  const objects = join(stage, "objects");
  const archive = join(fixture.base, "malicious.tar.age");
  mkdirSync(objects, { recursive: true });
  writeFileSync(
    join(stage, "manifest.json"),
    JSON.stringify({ backup_format: "xtrud-supabase-storage-v1", complete: true }),
  );
  symlinkSync("../manifest.json", join(objects, `${"a".repeat(64)}.blob`));
  execFileSync("tar", ["-C", stage, "-cf", archive, "manifest.json", "objects"]);
  try {
    await assert.rejects(
      verifyStorageBackup([archive], {
        ...commandEnv(fixture),
        BACKUP_IDENTITY: fixture.identity,
      }),
      /not a regular file/,
    );
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
});
