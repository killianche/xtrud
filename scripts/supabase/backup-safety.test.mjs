import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryScript = join(root, "scripts/supabase/collect-db-inventory.sh");
const backupScript = join(root, "scripts/supabase/create-encrypted-cloud-backup.sh");

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "xtrud-supabase-safety-"));
  const bin = join(base, "bin");
  mkdirSync(bin);

  const executables = {
    age: `#!/bin/sh
out=''
input=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --recipient) shift 2 ;;
    --output) out="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
if [ -n "$input" ]; then cp "$input" "$out"; else /bin/cat >"$out"; fi
`,
    psql: `#!/bin/sh
printf '%s\n' 'safe aggregate inventory fixture'
`,
    supabase: `#!/bin/sh
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

function env(bin) {
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    BACKUP_ENCRYPTION: "age",
    BACKUP_RECIPIENT: "age1fixture",
    SUPABASE_DB_URL: "postgresql://fixture.invalid/read_only",
    SOURCE_DB_URL: "postgresql://fixture.invalid/source",
  };
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
  try {
    execFileSync(backupScript, [output], { env: env(bin), stdio: "pipe" });
    const files = readdirSync(output);
    assert.equal(files.length, 1);
    assert.match(files[0], /^supabase-cloud-logical-.*\.tar\.age$/);
    assert.equal(
      files.some((file) => /\.sql$|^\.supabase-cloud-backup/.test(file)),
      false,
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
