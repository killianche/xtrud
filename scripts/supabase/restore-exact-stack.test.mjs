import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/supabase/restore-exact-stack.sh");
const entries = [
  "roles.sql",
  "system-schema.sql",
  "schema.sql",
  "data.sql",
  "migration-data.sql",
  "provider-ledger-data.sql",
  "manifest.txt",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function executable(file, body) {
  writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
}

function replaceManifestValue(file, name, value) {
  const updated = readFileSync(file, "utf8").replace(
    new RegExp(`^${name.replaceAll(".", "\\.")}=.*$`, "mu"),
    `${name}=${value}`,
  );
  writeFileSync(file, updated, { mode: 0o600 });
}

function createFixture({ insideRepo = false } = {}) {
  const base = insideRepo
    ? mkdtempSync(path.join(root, ".restore-preflight-test-"))
    : mkdtempSync(path.join(realpathSync(os.tmpdir()), "xtrud-restore-preflight-"));
  chmodSync(base, 0o700);
  const privateDir = path.join(base, "private");
  const snapshot = path.join(base, "snapshot");
  const binDir = path.join(base, "bin");
  for (const directory of [privateDir, snapshot, binDir]) {
    mkdirSync(directory, { mode: 0o700 });
    chmodSync(directory, 0o700);
  }

  const tag = readFileSync(path.join(root, "infra/supabase/.supabase-version"), "utf8").trim();
  const cliVersion = readFileSync(path.join(root, "infra/supabase/.cli-version"), "utf8").trim();
  const postgresImage = readFileSync(
    path.join(root, "infra/supabase/.postgres-image"),
    "utf8",
  ).trim();
  writeFileSync(path.join(snapshot, "manifest.json"), '{"fixture":true}\n', { mode: 0o600 });

  const dbArchive = path.join(privateDir, "db.tar.age");
  const storageArchive = path.join(privateDir, "storage.tar.age");
  const runtimeEnv = path.join(privateDir, "runtime.env");
  const renderedConfig = path.join(privateDir, "rendered.json");
  writeFileSync(dbArchive, "approved-db-ciphertext\n", { mode: 0o600 });
  writeFileSync(storageArchive, "approved-storage-ciphertext\n", { mode: 0o600 });
  writeFileSync(runtimeEnv, "POSTGRES_PASSWORD=RUNTIME_SECRET_SENTINEL\n", { mode: 0o600 });
  writeFileSync(renderedConfig, '{"secret":"RENDERED_SECRET_SENTINEL"}\n', { mode: 0o600 });

  const entryContents = Object.fromEntries(entries.map((entry) => [entry, `approved-${entry}\n`]));
  const plaintextTotal = Object.values(entryContents).reduce(
    (total, value) => total + Buffer.byteLength(value),
    0,
  );
  const approvedManifest = path.join(privateDir, "approved-backup-set.manifest");
  const manifestLines = [
    "approval_format=xtrud-approved-backup-set-v1",
    `backup_set_id=${randomUUID()}`,
    `archive_entries=${entries.join(",")}`,
    `db_archive_sha256=${sha256(readFileSync(dbArchive))}`,
    `db_archive_bytes=${readFileSync(dbArchive).byteLength}`,
    `db_plaintext_total_bytes=${plaintextTotal}`,
    `storage_archive_sha256=${sha256(readFileSync(storageArchive))}`,
    `storage_archive_bytes=${readFileSync(storageArchive).byteLength}`,
    `upstream_snapshot=${tag}`,
    `supabase_cli_version=${cliVersion}`,
    `postgres_image=${postgresImage}`,
    "migration_data_policy=skip",
    ...entries.flatMap((entry) => [
      `sha256.${entry}=${sha256(entryContents[entry])}`,
      `bytes.${entry}=${Buffer.byteLength(entryContents[entry])}`,
    ]),
  ];
  writeFileSync(approvedManifest, `${manifestLines.join("\n")}\n`, { mode: 0o600 });

  const forbiddenMarker = path.join(base, "forbidden-command-called");
  executable(
    path.join(binDir, "node"),
    'case "$1" in *check-upstream-snapshot.mjs|*check-runtime-env.mjs|*check-rendered-compose.mjs) exit 0;; *) exit 91;; esac',
  );
  executable(
    path.join(binDir, "df"),
    "printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on' \"fixture 104857600 0 $FAKE_FREE_KIB 0% /\"",
  );
  for (const command of ["age", "docker", "psql", "tar"]) {
    executable(path.join(binDir, command), 'touch "$FORBIDDEN_MARKER"\nexit 99');
  }

  return {
    approvedManifest,
    base,
    binDir,
    dbArchive,
    forbiddenMarker,
    renderedConfig,
    runtimeEnv,
    snapshot,
    storageArchive,
  };
}

function run(fixture, { omitApproved = false, env = {} } = {}) {
  const args = [
    script,
    "--archive",
    fixture.dbArchive,
    "--storage-archive",
    fixture.storageArchive,
    ...(omitApproved ? [] : ["--approved-manifest", fixture.approvedManifest]),
    "--snapshot",
    fixture.snapshot,
    "--runtime-env",
    fixture.runtimeEnv,
    "--rendered-config",
    fixture.renderedConfig,
    "--arch",
    "amd64",
    "--migration-data",
    "skip",
  ];
  const result = spawnSync("bash", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_FREE_KIB: "104857600",
      FORBIDDEN_MARKER: fixture.forbiddenMarker,
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      ...env,
    },
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

test("validates one approved DB+Storage backup set without decrypt, target access or receipt", () => {
  const fixture = createFixture();
  try {
    const result = run(fixture);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /validation-only/u);
    assert.match(result.stdout, /Restore remains NO-GO/u);
    assert.equal(existsSync(fixture.forbiddenMarker), false);
    assert.equal(readFileSync(fixture.approvedManifest, "utf8").includes(fixture.base), false);
    assert.doesNotMatch(result.output, /RUNTIME_SECRET|RENDERED_SECRET|approved-db-ciphertext/u);
  } finally {
    rmSync(fixture.base, { force: true, recursive: true });
  }
});

for (const [name, mutate] of [
  ["missing approved manifest argument", (_fixture) => ({ omitApproved: true })],
  [
    "tampered approval format",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "approval_format", "unknown");
      return {};
    },
  ],
  [
    "tampered DB ciphertext hash",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "db_archive_sha256", "0".repeat(64));
      return {};
    },
  ],
  [
    "tampered Storage ciphertext hash",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "storage_archive_sha256", "0".repeat(64));
      return {};
    },
  ],
  [
    "wrong plaintext total",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "db_plaintext_total_bytes", "1");
      return {};
    },
  ],
  [
    "decompression bomb entry bound",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "bytes.data.sql", "8589934593");
      return {};
    },
  ],
  [
    "Storage ciphertext above 1 TiB",
    (fixture) => {
      replaceManifestValue(fixture.approvedManifest, "storage_archive_bytes", "1099511627777");
      return {};
    },
  ],
  ["insufficient approved staging space", () => ({ env: { FAKE_FREE_KIB: "1024" } })],
]) {
  test(`fails closed on ${name}`, () => {
    const fixture = createFixture();
    try {
      const result = run(fixture, mutate(fixture));
      assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
      assert.equal(existsSync(fixture.forbiddenMarker), false);
    } finally {
      rmSync(fixture.base, { force: true, recursive: true });
    }
  });
}

test("rejects private symlink, wrong mode and repository path", () => {
  for (const variant of ["symlink", "mode", "repo"]) {
    const fixture = createFixture({ insideRepo: variant === "repo" });
    try {
      if (variant === "symlink") {
        const link = path.join(fixture.base, "approved-link.manifest");
        symlinkSync(fixture.approvedManifest, link);
        fixture.approvedManifest = link;
      } else if (variant === "mode") {
        chmodSync(fixture.approvedManifest, 0o644);
      }
      const result = run(fixture);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(fixture.forbiddenMarker), false);
    } finally {
      if (existsSync(fixture.approvedManifest) && fixture.approvedManifest.includes("-link")) {
        unlinkSync(fixture.approvedManifest);
      }
      rmSync(fixture.base, { force: true, recursive: true });
    }
  }
});

test("script has valid Bash syntax and no destructive command path", () => {
  const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(
    source,
    /age --decrypt|docker compose|\n[^#\n]*\bpsql\b|tar -x|db_restore_complete/u,
  );
});
