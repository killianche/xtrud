import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryScript = join(root, "scripts/supabase/collect-db-inventory.sh");
const backupScript = join(root, "scripts/supabase/create-encrypted-cloud-backup.sh");
const verifyScript = join(root, "scripts/supabase/verify-encrypted-cloud-backup.sh");

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "xtrud-supabase-safety-"));
  const bin = join(base, "bin");
  mkdirSync(bin);

  const executables = {
    age: `#!/bin/sh
out=''
input=''
mode='encrypt'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --decrypt) mode='decrypt'; shift ;;
    --identity) shift 2 ;;
    --recipient) shift 2 ;;
    --output) out="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
if [ "$mode" = 'decrypt' ]; then
  /bin/cat "$input"
  exit 0
fi
if [ -n "$input" ]; then cp "$input" "$out"; else /bin/cat >"$out"; fi
if [ "\${FAKE_AGE_FAIL:-0}" = '1' ]; then
  printf '%s\n' 'fixture encryption failure' >&2
  exit 41
fi
`,
    docker: `#!/bin/sh
if [ -n "\${DOCKER_ARGV_LOG:-}" ]; then
  : >"$DOCKER_ARGV_LOG"
  for arg in "$@"; do printf '%s\n' "$arg" >>"$DOCKER_ARGV_LOG"; done
fi
for arg in "$@"; do
  case "$arg" in
    *postgresql://*|*fixture.invalid*)
      printf '%s\n' 'database URL leaked into Docker argv' >&2
      exit 97
      ;;
  esac
done
if [ "\${FAKE_DOCKER_FAIL:-0}" = '1' ]; then
  printf '%s\n' 'fixture Docker failure' >&2
  exit 42
fi
printf '%s\n' '-- fixture provider migration ledgers'
`,
    date: `#!/bin/sh
printf '%s\n' '20260825T000000Z'
`,
    psql: `#!/bin/sh
printf '%s\n' 'safe aggregate inventory fixture'
`,
    supabase: `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\n' '2.115.0'
  exit 0
fi
out=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --file|-f) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ] || exit 2
printf '%s\n' 'fixture dump without production data' >"$out"
`,
  };

  for (const [name, source] of Object.entries(executables)) {
    const path = join(bin, name);
    writeFileSync(path, source);
    chmodSync(path, 0o755);
  }

  return { base, bin };
}

function env(bin, overrides = {}) {
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    BACKUP_ENCRYPTION: "age",
    BACKUP_RECIPIENT: "age1fixture",
    SUPABASE_DB_URL: "postgresql://fixture.invalid/read_only",
    SOURCE_DB_URL: "postgresql://fixture.invalid/source",
    ...overrides,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("inventory rejects a repository path before creating it", () => {
  const { base, bin } = fixture();
  const forbidden = join(root, `.inventory-forbidden-${process.pid}`);
  try {
    const result = spawnSync(inventoryScript, [forbidden], { env: env(bin), encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /inside the repository is forbidden/);
    assert.throws(() => readdirSync(forbidden));
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(forbidden, { recursive: true, force: true });
  }
});

test("inventory retains ciphertext only and defaults to estimates", () => {
  const { base, bin } = fixture();
  const output = join(base, "inventory");
  try {
    execFileSync(inventoryScript, [output], { env: env(bin), stdio: "pipe" });
    const files = readdirSync(output);
    assert.equal(files.length, 1);
    assert.match(files[0], /^supabase-db-inventory-.*\.txt\.age$/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("logical backup retains one encrypted archive and removes staging", () => {
  const { base, bin } = fixture();
  const output = join(base, "backup");
  const dockerArgvLog = join(base, "docker-argv.txt");
  try {
    execFileSync(backupScript, [output], {
      env: env(bin, { DOCKER_ARGV_LOG: dockerArgvLog }),
      stdio: "pipe",
    });
    const files = readdirSync(output);
    assert.equal(files.length, 1);
    assert.match(files[0], /^supabase-cloud-logical-.*\.tar\.age$/);
    const entries = execFileSync("tar", ["-tf", join(output, files[0])], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    assert.deepEqual(entries, [
      "roles.sql",
      "system-schema.sql",
      "schema.sql",
      "data.sql",
      "migration-data.sql",
      "provider-ledger-data.sql",
      "manifest.txt",
    ]);
    const dockerArgv = readFileSync(dockerArgvLog, "utf8");
    assert.match(dockerArgv, /--env\nSOURCE_DB_URL\n/);
    assert.doesNotMatch(dockerArgv, /postgresql:\/\/|fixture\.invalid/);

    const manifest = execFileSync("tar", ["-xOf", join(output, files[0]), "manifest.txt"], {
      encoding: "utf8",
    });
    assert.match(manifest, /^supabase_cli_version=2\.115\.0$/m);
    assert.match(
      manifest,
      /^postgres_image=public\.ecr\.aws\/supabase\/postgres:[^\n]+@sha256:[0-9a-f]{64}$/m,
    );
    for (const dump of entries.slice(0, -1)) {
      const contents = execFileSync("tar", ["-xOf", join(output, files[0]), dump]);
      assert.ok(contents.length > 0, `${dump} must not be empty`);
      assert.match(
        manifest,
        new RegExp(`^sha256\\.${dump.replace(".", "\\.")}=${sha256(contents)}$`, "m"),
      );
    }
    assert.equal(
      files.some((file) => /\.sql$|^\.supabase-cloud-backup/.test(file)),
      false,
    );
    const identity = join(base, "fixture-age-key.txt");
    writeFileSync(identity, "fixture private identity\n", { mode: 0o600 });
    const verified = execFileSync(verifyScript, [join(output, files[0])], {
      env: env(bin, { BACKUP_IDENTITY: identity }),
      encoding: "utf8",
    });
    assert.match(verified, /^Verified logical backup:/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("verifier rejects a legacy incomplete archive", () => {
  const { base, bin } = fixture();
  const stage = join(base, "legacy");
  const archive = join(base, "legacy.tar.age");
  const identity = join(base, "fixture-age-key.txt");
  mkdirSync(stage);
  writeFileSync(join(stage, "roles.sql"), "legacy\n");
  writeFileSync(join(stage, "schema.sql"), "legacy\n");
  writeFileSync(join(stage, "data.sql"), "legacy\n");
  writeFileSync(join(stage, "manifest.txt"), "complete=false\n");
  writeFileSync(identity, "fixture private identity\n", { mode: 0o600 });
  execFileSync("tar", [
    "-C",
    stage,
    "-cf",
    archive,
    "roles.sql",
    "schema.sql",
    "data.sql",
    "manifest.txt",
  ]);
  try {
    const result = spawnSync(verifyScript, [archive], {
      env: env(bin, { BACKUP_IDENTITY: identity }),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /incomplete, reordered, or unsafe/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("verifier rejects a symlink masquerading as a required dump", () => {
  const { base, bin } = fixture();
  const stage = join(base, "symlink-bundle");
  const archive = join(base, "symlink-bundle.tar.age");
  const identity = join(base, "fixture-age-key.txt");
  mkdirSync(stage);
  for (const name of [
    "system-schema.sql",
    "schema.sql",
    "data.sql",
    "migration-data.sql",
    "provider-ledger-data.sql",
  ]) {
    writeFileSync(join(stage, name), "fixture\n");
  }
  symlinkSync("schema.sql", join(stage, "roles.sql"));
  writeFileSync(join(stage, "manifest.txt"), "fixture\n");
  writeFileSync(identity, "fixture private identity\n", { mode: 0o600 });
  execFileSync("tar", [
    "-C",
    stage,
    "-cf",
    archive,
    "roles.sql",
    "system-schema.sql",
    "schema.sql",
    "data.sql",
    "migration-data.sql",
    "provider-ledger-data.sql",
    "manifest.txt",
  ]);
  try {
    const result = spawnSync(verifyScript, [archive], {
      env: env(bin, { BACKUP_IDENTITY: identity }),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a regular file/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("verifier rejects a malformed literal checksum key in a complete v1 bundle", () => {
  const { base, bin } = fixture();
  const output = join(base, "backup");
  const stage = join(base, "malformed-stage");
  const archive = join(base, "malformed.tar.age");
  const identity = join(base, "fixture-age-key.txt");
  try {
    execFileSync(backupScript, [output], { env: env(bin), stdio: "pipe" });
    mkdirSync(stage);
    execFileSync("tar", ["-xf", join(output, readdirSync(output)[0]), "-C", stage]);
    const manifestPath = join(stage, "manifest.txt");
    const manifest = readFileSync(manifestPath, "utf8").replace(
      "sha256.roles.sql=",
      "sha256.rolesXsql=",
    );
    assert.match(manifest, /^sha256\.rolesXsql=/m);
    writeFileSync(manifestPath, manifest);
    execFileSync("tar", [
      "-C",
      stage,
      "-cf",
      archive,
      "roles.sql",
      "system-schema.sql",
      "schema.sql",
      "data.sql",
      "migration-data.sql",
      "provider-ledger-data.sql",
      "manifest.txt",
    ]);
    writeFileSync(identity, "fixture private identity\n", { mode: 0o600 });

    const result = spawnSync(verifyScript, [archive], {
      env: env(bin, { BACKUP_IDENTITY: identity }),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /checksum mismatch: roles\.sql/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("logical backup publication never overwrites an existing timestamp", () => {
  const { base, bin } = fixture();
  const output = join(base, "backup");
  try {
    execFileSync(backupScript, [output], { env: env(bin), stdio: "pipe" });
    const firstFiles = readdirSync(output);
    assert.deepEqual(firstFiles, ["supabase-cloud-logical-20260825T000000Z.tar.age"]);
    const firstHash = sha256(readFileSync(join(output, firstFiles[0])));

    const second = spawnSync(backupScript, [output], { env: env(bin), encoding: "utf8" });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /refusing to overwrite encrypted artifact/);
    assert.deepEqual(readdirSync(output), firstFiles);
    assert.equal(sha256(readFileSync(join(output, firstFiles[0]))), firstHash);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("Docker failure leaves no plaintext, partial, candidate, or final archive", () => {
  const { base, bin } = fixture();
  const output = join(base, "backup");
  try {
    const result = spawnSync(backupScript, [output], {
      env: env(bin, { FAKE_DOCKER_FAIL: "1" }),
      encoding: "utf8",
    });
    assert.equal(result.status, 42);
    assert.deepEqual(readdirSync(output), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("encryption failure removes partial ciphertext and plaintext staging", () => {
  const { base, bin } = fixture();
  const output = join(base, "backup");
  try {
    const result = spawnSync(backupScript, [output], {
      env: env(bin, { FAKE_AGE_FAIL: "1" }),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /dump or encryption failed/);
    assert.deepEqual(readdirSync(output), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("PostgreSQL dump image is pinned to an immutable allowed digest", () => {
  const image = readFileSync(join(root, "infra/supabase/.postgres-image"), "utf8").trim();
  assert.match(
    image,
    /^public\.ecr\.aws\/supabase\/postgres:\d+\.\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/,
  );
});
