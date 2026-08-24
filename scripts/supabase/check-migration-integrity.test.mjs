import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateBaseline, scanIntegrity, stripSqlComments } from "./check-migration-integrity.mjs";

function writeFixture(root, path, contents) {
  const absolutePath = join(root, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
}

function createFixtureProject() {
  const root = mkdtempSync(join(tmpdir(), "xtrud-migration-gate-"));
  writeFixture(root, "supabase/migrations/0001_first.sql", "select 1;\n");
  writeFixture(root, "supabase/migrations/0001_second.sql", "select 2;\n");
  writeFixture(root, "supabase/migrations/0002_notes.sql", "-- documentation only\n/* no SQL */\n");
  writeFixture(
    root,
    "supabase/migrations/0003_endpoint.sql",
    "select 'https://fixtureprojectref.supabase.co/functions/v1/missing-notify';\n",
  );
  writeFixture(
    root,
    "supabase/migrations/0004_secrets.sql",
    [
      "select vault.create_secret('fixture-vault-secret-123456789', 'fixture_name');",
      "select crypt('fixture-password-123456789', gen_salt('bf'));",
      "insert into public.app_secrets (key, value) values ('fixture', 'fixture-value');",
      "select 'sb_secret_fixture_token_123456789';",
    ].join("\n"),
  );
  writeFixture(root, "supabase/functions/present/index.ts", "export default {};\n");
  writeFixture(root, "src/caller.ts", "void supabase.functions.invoke('present', { body: {} });\n");
  return root;
}

test("stripSqlComments keeps comment markers inside SQL strings", () => {
  const sql = [
    "-- leading comment",
    "select '--not a comment' as a, '/*still text*/' as b; /* trailing */",
    "select $$-- dollar body$$;",
  ].join("\n");
  const stripped = stripSqlComments(sql);
  assert.match(stripped, /'--not a comment'/);
  assert.match(stripped, /'\/\*still text\*\/'/);
  assert.match(stripped, /\$\$-- dollar body\$\$/);
  assert.doesNotMatch(stripped, /leading comment|trailing/);
});

test("scanner catches every guarded violation and redacts literal values", () => {
  const root = createFixtureProject();
  try {
    const scan = scanIntegrity({ root });
    const rules = new Set(scan.findings.map(({ rule }) => rule));
    assert.deepEqual(
      rules,
      new Set([
        "comment-only-migration",
        "duplicate-migration-number",
        "hardcoded-supabase-project-url",
        "missing-edge-function-source",
        "plaintext-api-token",
        "plaintext-app-secret-insert",
        "plaintext-password-literal",
        "plaintext-vault-secret",
      ]),
    );

    const serialized = JSON.stringify(scan.findings);
    assert.doesNotMatch(serialized, /fixture-vault-secret-123456789/);
    assert.doesNotMatch(serialized, /fixture-password-123456789/);
    assert.doesNotMatch(serialized, /sb_secret_fixture_token_123456789/);
    assert.match(serialized, /missing-edge-function-source:missing-notify/);
    assert.doesNotMatch(serialized, /missing-edge-function-source:present/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("baseline accepts exact debt and rejects new or stale exceptions", () => {
  const root = createFixtureProject();
  try {
    const { findings, migrationHistory } = scanIntegrity({ root });
    const baseline = {
      schemaVersion: 1,
      migrationHistory,
      allowlist: findings.map(({ rule, fingerprint }) => ({
        rule,
        fingerprint,
        justification: "Fixture finding is intentionally accepted for this isolated gate test.",
        remediation:
          "Remove the fixture violation after the scanner and baseline behavior are verified.",
      })),
    };

    const exact = evaluateBaseline(findings, baseline, migrationHistory);
    assert.equal(exact.newFindings.length, 0);
    assert.equal(exact.staleEntries.length, 0);
    assert.equal(exact.errors.length, 0);

    const withNewFinding = evaluateBaseline(
      [
        ...findings,
        {
          rule: "comment-only-migration",
          fingerprint: "comment-only-migration:supabase/migrations/9999_new.sql",
          summary: "new fixture debt",
          files: ["supabase/migrations/9999_new.sql"],
          locations: [],
        },
      ],
      baseline,
      migrationHistory,
    );
    assert.equal(withNewFinding.newFindings.length, 1);

    const withResolvedFinding = evaluateBaseline(findings.slice(1), baseline, migrationHistory);
    assert.equal(withResolvedFinding.staleEntries.length, 1);

    writeFixture(root, "supabase/migrations/0005_new.sql", "select 5;\n");
    const unregisteredHistory = scanIntegrity({ root });
    assert.match(
      evaluateBaseline(
        unregisteredHistory.findings,
        baseline,
        unregisteredHistory.migrationHistory,
      ).errors.join("\n"),
      /Новая миграция не зарегистрирована/,
    );
    rmSync(join(root, "supabase/migrations/0005_new.sql"));

    writeFixture(root, "supabase/migrations/0001_first.sql", "drop table public.users;\n");
    const changedHistory = scanIntegrity({ root });
    assert.match(
      evaluateBaseline(
        changedHistory.findings,
        baseline,
        changedHistory.migrationHistory,
      ).errors.join("\n"),
      /Историческая миграция изменена/,
    );

    rmSync(join(root, "supabase/migrations/0001_second.sql"));
    const missingHistory = scanIntegrity({ root });
    assert.match(
      evaluateBaseline(
        missingHistory.findings,
        baseline,
        missingHistory.migrationHistory,
      ).errors.join("\n"),
      /Историческая миграция удалена или переименована/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
