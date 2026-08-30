#!/usr/bin/env node

/**
 * Static integrity gate for the historical Supabase migration directory.
 *
 * The repository already contains known migration debt. Deleting or silently
 * renumbering that history would make recovery less predictable, so this gate
 * records exact, reviewed fingerprints in a baseline and rejects every new or
 * stale exception. Secret-like literals are hashed and never printed.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_BASELINE = "supabase/migration-integrity-baseline.json";

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function fileDigest(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function toPosix(value) {
  return value.split("\\").join("/");
}

function relativePath(root, absolutePath) {
  return toPosix(relative(root, absolutePath));
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function decodeSqlString(literal) {
  return literal.slice(1, -1).replaceAll("''", "'");
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "..." ||
    normalized.includes("placeholder") ||
    normalized.includes("replace_me") ||
    normalized.includes("replace-me") ||
    normalized.includes("your-") ||
    normalized.includes("<") ||
    normalized.includes("${")
  );
}

/** Removes SQL comments while preserving strings and dollar-quoted bodies. */
export function stripSqlComments(source) {
  let result = "";
  let index = 0;
  let state = "code";
  let dollarTag = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        result += "\n";
        state = "code";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 2;
        continue;
      }
      if (char === "\n") result += "\n";
      index += 1;
      continue;
    }

    if (state === "single-quote") {
      result += char;
      if (char === "'" && next === "'") {
        result += next;
        index += 2;
        continue;
      }
      if (char === "'") state = "code";
      index += 1;
      continue;
    }

    if (state === "double-quote") {
      result += char;
      if (char === '"' && next === '"') {
        result += next;
        index += 2;
        continue;
      }
      if (char === '"') state = "code";
      index += 1;
      continue;
    }

    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, index)) {
        result += dollarTag;
        index += dollarTag.length;
        state = "code";
      } else {
        result += char;
        index += 1;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }
    if (char === "'") {
      result += char;
      state = "single-quote";
      index += 1;
      continue;
    }
    if (char === '"') {
      result += char;
      state = "double-quote";
      index += 1;
      continue;
    }
    if (char === "$") {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        result += tag;
        dollarTag = tag;
        state = "dollar-quote";
        index += tag.length;
        continue;
      }
    }

    result += char;
    index += 1;
  }

  return result;
}

function walkCodeFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkCodeFiles(absolutePath));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

function finding({ rule, fingerprint, summary, files, locations = [] }) {
  return { rule, fingerprint, summary, files: [...new Set(files)].sort(), locations };
}

function scanDuplicateNumbers(root, migrationFiles) {
  const groups = new Map();
  for (const absolutePath of migrationFiles) {
    const match = /^([0-9]+)_.*\.sql$/.exec(absolutePath.split("/").at(-1));
    if (!match) continue;
    const number = match[1];
    const files = groups.get(number) ?? [];
    files.push(relativePath(root, absolutePath));
    groups.set(number, files);
  }

  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => {
      const sortedFiles = files.sort();
      return finding({
        rule: "duplicate-migration-number",
        fingerprint: `duplicate-migration-number:${number}:${digest(sortedFiles.join("|"))}`,
        summary: `Номер ${number} используется ${sortedFiles.length} файлами`,
        files: sortedFiles,
      });
    });
}

function scanSqlFile(root, absolutePath) {
  const source = readFileSync(absolutePath, "utf8");
  const file = relativePath(root, absolutePath);
  const findings = [];
  const withoutComments = stripSqlComments(source)
    .replace(/^\uFEFF/, "")
    .trim();

  if (!/[A-Za-z_]/.test(withoutComments)) {
    findings.push(
      finding({
        rule: "comment-only-migration",
        fingerprint: `comment-only-migration:${file}`,
        summary: "Файл не содержит исполняемого SQL",
        files: [file],
      }),
    );
  }

  const urlPattern = /https?:\/\/([a-z0-9-]+)\.supabase\.co\b/gi;
  for (const match of source.matchAll(urlPattern)) {
    const host = match[1];
    const line = lineNumberAt(source, match.index);
    findings.push(
      finding({
        rule: "hardcoded-supabase-project-url",
        fingerprint: `hardcoded-supabase-project-url:${file}:${line}:${digest(host)}`,
        summary: "Захардкожен URL конкретного Supabase Cloud project (host скрыт)",
        files: [file],
        locations: [{ file, line }],
      }),
    );
  }

  const vaultPattern = /vault\.create_secret\s*\(\s*('(?:''|[^'])*')/gi;
  for (const match of source.matchAll(vaultPattern)) {
    const value = decodeSqlString(match[1]);
    if (isPlaceholder(value)) continue;
    const literalIndex = match.index + match[0].lastIndexOf(match[1]);
    const line = lineNumberAt(source, literalIndex);
    findings.push(
      finding({
        rule: "plaintext-vault-secret",
        fingerprint: `plaintext-vault-secret:${file}:${line}:${digest(value)}`,
        summary: "Vault secret задан строковым литералом (значение скрыто)",
        files: [file],
        locations: [{ file, line }],
      }),
    );
  }

  const passwordPattern = /crypt\s*\(\s*('(?:''|[^'])*')\s*,/gi;
  for (const match of source.matchAll(passwordPattern)) {
    const value = decodeSqlString(match[1]);
    if (isPlaceholder(value)) continue;
    const line = lineNumberAt(source, match.index);
    findings.push(
      finding({
        rule: "plaintext-password-literal",
        fingerprint: `plaintext-password-literal:${file}:${line}:${digest(value)}`,
        summary: "Пароль передан в crypt() строковым литералом (значение скрыто)",
        files: [file],
        locations: [{ file, line }],
      }),
    );
  }

  const tokenPatterns = [
    /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  ];
  for (const pattern of tokenPatterns) {
    for (const match of source.matchAll(pattern)) {
      const line = lineNumberAt(source, match.index);
      findings.push(
        finding({
          rule: "plaintext-api-token",
          fingerprint: `plaintext-api-token:${file}:${line}:${digest(match[0])}`,
          summary: "Найден secret/JWT-подобный литерал (значение скрыто)",
          files: [file],
          locations: [{ file, line }],
        }),
      );
    }
  }

  const appSecretInsertPattern =
    /insert\s+into\s+(?:public\.)?app_secrets\b[\s\S]{0,1000}?\bvalues\s*\(/gi;
  for (const match of source.matchAll(appSecretInsertPattern)) {
    const line = lineNumberAt(source, match.index);
    findings.push(
      finding({
        rule: "plaintext-app-secret-insert",
        fingerprint: `plaintext-app-secret-insert:${file}:${line}:${digest(match[0])}`,
        summary: "Миграция вставляет значение в app_secrets; значение не выводится",
        files: [file],
        locations: [{ file, line }],
      }),
    );
  }

  return { source, file, findings };
}

function scanMissingEdgeFunctionSources(root, sqlSources) {
  const references = new Map();
  const addReference = (slug, file, line, kind) => {
    const items = references.get(slug) ?? [];
    items.push({ file, line, kind });
    references.set(slug, items);
  };

  for (const { source, file } of sqlSources) {
    for (const match of source.matchAll(/\/functions\/v1\/([a-z0-9_-]+)/gi)) {
      addReference(match[1], file, lineNumberAt(source, match.index), "sql-endpoint");
    }
  }

  for (const topLevel of ["app", "src"]) {
    for (const absolutePath of walkCodeFiles(join(root, topLevel))) {
      const source = readFileSync(absolutePath, "utf8");
      const file = relativePath(root, absolutePath);
      const pattern = /\.functions\.invoke\(\s*["'`]([a-z0-9_-]+)["'`]/gi;
      for (const match of source.matchAll(pattern)) {
        addReference(match[1], file, lineNumberAt(source, match.index), "client-invoke");
      }
    }
  }

  const functionsRoot = join(root, "supabase/functions");
  return [...references.entries()]
    .filter(([slug]) => !existsSync(join(functionsRoot, slug, "index.ts")))
    .map(([slug, locations]) =>
      finding({
        rule: "missing-edge-function-source",
        fingerprint: `missing-edge-function-source:${slug}`,
        summary: `Edge Function '${slug}' вызывается, но supabase/functions/${slug}/index.ts отсутствует`,
        files: locations.map(({ file }) => file),
        locations,
      }),
    );
}

export function scanIntegrity({ root = DEFAULT_ROOT } = {}) {
  const resolvedRoot = resolve(root);
  const migrationsRoot = join(resolvedRoot, "supabase/migrations");
  if (!existsSync(migrationsRoot) || !statSync(migrationsRoot).isDirectory()) {
    throw new Error(`Каталог миграций не найден: ${migrationsRoot}`);
  }

  const migrationFiles = readdirSync(migrationsRoot)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(migrationsRoot, name));
  const migrationHistory = Object.fromEntries(
    migrationFiles.map((absolutePath) => [
      relativePath(resolvedRoot, absolutePath),
      fileDigest(absolutePath),
    ]),
  );
  const sqlSources = migrationFiles.map((file) => scanSqlFile(resolvedRoot, file));
  const findings = [
    ...scanDuplicateNumbers(resolvedRoot, migrationFiles),
    ...sqlSources.flatMap(({ findings: fileFindings }) => fileFindings),
    ...scanMissingEdgeFunctionSources(resolvedRoot, sqlSources),
  ].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));

  return { root: resolvedRoot, migrationCount: migrationFiles.length, migrationHistory, findings };
}

export function evaluateBaseline(findings, baseline, migrationHistory = {}) {
  const errors = [];
  if (
    baseline?.schemaVersion !== 1 ||
    !Array.isArray(baseline.allowlist) ||
    !baseline.migrationHistory ||
    typeof baseline.migrationHistory !== "object" ||
    Array.isArray(baseline.migrationHistory)
  ) {
    return {
      accepted: [],
      newFindings: findings,
      staleEntries: [],
      errors: ["Baseline должен иметь schemaVersion=1, объект migrationHistory и массив allowlist"],
    };
  }

  for (const [path, expectedDigest] of Object.entries(baseline.migrationHistory)) {
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(path)) {
      errors.push(`Некорректный historical migration path: ${path}`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
      errors.push(`Некорректный SHA-256 historical migration: ${path}`);
      continue;
    }
    const actualDigest = migrationHistory[path];
    if (!actualDigest) {
      errors.push(`Историческая миграция удалена или переименована: ${path}`);
    } else if (actualDigest !== expectedDigest) {
      errors.push(`Историческая миграция изменена: ${path}`);
    }
  }
  for (const path of Object.keys(migrationHistory)) {
    if (!Object.hasOwn(baseline.migrationHistory, path)) {
      errors.push(`Новая миграция не зарегистрирована в migrationHistory: ${path}`);
    }
  }

  const entries = new Map();
  for (const entry of baseline.allowlist) {
    if (!entry || typeof entry.fingerprint !== "string") {
      errors.push("Каждая allowlist-запись должна иметь fingerprint");
      continue;
    }
    if (entries.has(entry.fingerprint)) {
      errors.push(`Повтор fingerprint в baseline: ${entry.fingerprint}`);
      continue;
    }
    if (typeof entry.justification !== "string" || entry.justification.trim().length < 30) {
      errors.push(`Слишком короткое justification: ${entry.fingerprint}`);
    }
    if (typeof entry.remediation !== "string" || entry.remediation.trim().length < 30) {
      errors.push(`Слишком короткое remediation: ${entry.fingerprint}`);
    }
    entries.set(entry.fingerprint, entry);
  }

  const current = new Map(findings.map((item) => [item.fingerprint, item]));
  const accepted = findings.filter((item) => entries.has(item.fingerprint));
  const newFindings = findings.filter((item) => !entries.has(item.fingerprint));
  const staleEntries = [...entries.values()].filter((entry) => !current.has(entry.fingerprint));

  for (const item of accepted) {
    const entry = entries.get(item.fingerprint);
    if (entry.rule !== item.rule) {
      errors.push(`Rule не совпадает для ${item.fingerprint}`);
    }
  }

  return { accepted, newFindings, staleEntries, errors };
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    baseline: DEFAULT_BASELINE,
    json: false,
    scanOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = resolve(argv[++index]);
    else if (arg === "--baseline") options.baseline = argv[++index];
    else if (arg === "--json") options.json = true;
    else if (arg === "--scan-only") options.scanOnly = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Неизвестный аргумент: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Использование:
  node scripts/supabase/check-migration-integrity.mjs [--json]
  node scripts/supabase/check-migration-integrity.mjs --scan-only --json

Опции:
  --root <path>       корень проекта (нужен для изолированных тестов)
  --baseline <path>   baseline относительно root или абсолютный путь
  --scan-only         только показать redacted findings, не применять allowlist
  --json              JSON-вывод без значений найденных secrets
`);
}

function printFinding(prefix, item) {
  const location = item.locations[0];
  const suffix = location ? ` (${location.file}:${location.line})` : "";
  console.log(`${prefix} [${item.rule}] ${item.summary}${suffix}`);
  console.log(`    fingerprint: ${item.fingerprint}`);
}

export function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  if (options.help) {
    printHelp();
    return 0;
  }

  let scan;
  try {
    scan = scanIntegrity({ root: options.root });
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }

  if (options.scanOnly) {
    if (options.json) console.log(JSON.stringify(scan, null, 2));
    else {
      console.log(`Проверено миграций: ${scan.migrationCount}`);
      for (const item of scan.findings) printFinding("FOUND", item);
    }
    return 0;
  }

  const baselinePath = resolve(options.root, options.baseline);
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch (error) {
    console.error(
      `ERROR: baseline не прочитан (${relativePath(options.root, baselinePath)}): ${error.message}`,
    );
    return 2;
  }
  const evaluation = evaluateBaseline(scan.findings, baseline, scan.migrationHistory);
  const ok =
    evaluation.newFindings.length === 0 &&
    evaluation.staleEntries.length === 0 &&
    evaluation.errors.length === 0;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          migrationCount: scan.migrationCount,
          acceptedBaselineFindings: evaluation.accepted,
          newFindings: evaluation.newFindings,
          staleBaselineEntries: evaluation.staleEntries.map(({ rule, fingerprint }) => ({
            rule,
            fingerprint,
          })),
          baselineErrors: evaluation.errors,
          ok,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Supabase migration integrity: ${scan.migrationCount} файлов`);
    console.log(`Baseline debt: ${evaluation.accepted.length}`);
    for (const item of evaluation.accepted) printFinding("BASELINE", item);
    for (const item of evaluation.newFindings) printFinding("NEW", item);
    for (const entry of evaluation.staleEntries) {
      console.log(`STALE baseline: ${entry.fingerprint}`);
    }
    for (const error of evaluation.errors) console.log(`INVALID baseline: ${error}`);
    console.log(
      ok ? "PASS: новых или устаревших исключений нет" : "FAIL: baseline требует явного review",
    );
  }

  return ok ? 0 : 1;
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (invokedDirectly) process.exitCode = runCli();
