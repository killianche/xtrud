#!/usr/bin/env node
/**
 * Fail fast when a source/config file references a local static asset that is
 * missing or differs only by letter case. Metro reports these problems late and
 * with a noisy resolver stack; this gate is intentionally dependency-free so CI
 * and release builds can run it before starting Metro.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const SOURCE_ROOTS = ["app", "src"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);
const ASSET_EXTENSION =
  /\.(?:avif|gif|ico|jpe?g|json|lottie|mp3|mp4|otf|png|svg|ttf|wav|webm|webp)$/i;

/** @type {{ source: string; line: number; specifier: string; resolved: string }[]} */
const references = [];
/** @type {{ source: string; line: number; specifier: string; resolved: string; reason: string }[]} */
const failures = [];

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(absolute);
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isInsideRoot(absolute) {
  const rel = relative(ROOT, absolute);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..";
}

/**
 * macOS commonly uses a case-insensitive filesystem while CI uses Linux. Walk
 * each path segment explicitly so `Icon.png` cannot silently satisfy
 * `require('./icon.png')` locally and then fail in CI.
 */
function exactFileStatus(absolute) {
  if (!isInsideRoot(absolute)) return "reference escapes the repository root";
  const segments = relative(ROOT, absolute).split(sep).filter(Boolean);
  let current = ROOT;
  for (const segment of segments) {
    let names;
    try {
      names = readdirSync(current);
    } catch {
      return "parent directory does not exist";
    }
    if (!names.includes(segment)) return "file is missing or path casing differs";
    current = resolve(current, segment);
  }
  try {
    const stat = statSync(current);
    if (!stat.isFile()) return "reference does not resolve to a file";
    if (stat.size === 0) return "asset file is empty";
  } catch {
    return "file does not exist";
  }
  return null;
}

function record(source, text, index, specifier, absolute) {
  const item = {
    source: relative(ROOT, source),
    line: lineNumber(text, index),
    specifier,
    resolved: relative(ROOT, absolute),
  };
  references.push(item);
  const reason = exactFileStatus(absolute);
  if (reason) failures.push({ ...item, reason });
}

function scanSource(source) {
  const text = readFileSync(source, "utf8");
  const patterns = [
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") || !ASSET_EXTENSION.test(specifier)) continue;
      record(source, text, match.index, specifier, resolve(dirname(source), specifier));
    }
  }

  if (extname(source) === ".css") {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const specifier = match[1];
      if (!ASSET_EXTENSION.test(specifier)) continue;
      const absolute = specifier.startsWith("/")
        ? resolve(ROOT, "public", specifier.slice(1))
        : resolve(dirname(source), specifier);
      record(source, text, match.index, specifier, absolute);
    }
  }
}

function scanExpoConfig() {
  const source = resolve(ROOT, "app.json");
  const text = readFileSync(source, "utf8");
  const config = JSON.parse(text);

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
      return;
    }
    if (typeof value !== "string" || !value.startsWith(".") || !ASSET_EXTENSION.test(value)) {
      return;
    }
    const index = text.indexOf(JSON.stringify(value));
    record(source, text, Math.max(index, 0), value, resolve(ROOT, value));
  }

  visit(config);
}

for (const sourceRoot of SOURCE_ROOTS) {
  for (const source of walk(resolve(ROOT, sourceRoot))) scanSource(source);
}
scanExpoConfig();

if (failures.length > 0) {
  console.error("\nStatic asset gate failed:\n");
  for (const failure of failures) {
    console.error(
      `  - ${failure.source}:${failure.line} -> ${failure.specifier}\n` +
        `    resolved: ${failure.resolved}\n` +
        `    reason: ${failure.reason}`,
    );
  }
  console.error(`\n${failures.length} missing/invalid static asset reference(s).\n`);
  process.exit(1);
}

console.log(`Static asset gate passed: ${references.length} local asset reference(s).`);
