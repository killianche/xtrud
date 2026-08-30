#!/usr/bin/env node
/**
 * Public store/legal URLs are release artifacts, not documentation-only files.
 * This gate prevents Expo exports from silently omitting a page and catches the
 * obsolete SMS-only/privacy copy that previously reached the public website.
 *
 * public/reset-password/index.html is additionally an auth surface: after the
 * Expo web build is dropped it is the only page that can finish a password
 * recovery on desktop, Android and iOS without the app. It is dependency-free
 * on purpose, so this gate is what keeps its backend constants in sync with
 * release/production.json and blocks a silent supply-chain or storage
 * regression on the page where a user types a new password.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const resetPasswordPage = "reset-password/index.html";
const requiredFiles = [
  "legal.css",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "account-deletion/index.html",
  resetPasswordPage,
];
const requiredPrivacyMarkers = [
  "электронная почта",
  "номер мобильного телефона",
  "сброс пароля по электронной почте",
  "Встроенного чата",
  "/account-deletion/",
];
const forbiddenPrivacyMarkers = [
  "входа по SMS-коду",
  "единственный способ авторизации",
  "Email мы не запрашиваем",
  "Геолокация устройства",
];
// The recovery token must stay in a closure: nothing here may persist it, log
// it or hand it to an HTML sink.
const forbiddenResetMarkers = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document.cookie",
  "console.",
  "innerHTML",
  "outerHTML",
  "document.write",
  "eval(",
];
const requiredResetMarkers = [
  'autocomplete="new-password"',
  'type="password"',
  "history.replaceState",
  "Content-Security-Policy",
  'name="robots" content="noindex,nofollow"',
];

function insideProject(candidate) {
  const path = relative(projectRoot, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

export function readBackendContract(
  contractPath = resolve(projectRoot, "release/production.json"),
) {
  return JSON.parse(readFileSync(contractPath, "utf8")).backend;
}

function readConstant(source, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"\\n]*)"`).exec(source);
  return match ? match[1] : null;
}

/**
 * The page carries the backend URL and the publishable key as two plain
 * constants. Both are verified against release/production.json: the URL
 * literally, the key through the SHA-256 the contract already stores. A Beget
 * migration that touches only one of the two files fails here.
 */
export function validateResetPasswordPage(html, backend) {
  const errors = [];
  const label = resetPasswordPage;

  const url = readConstant(html, "SUPABASE_URL");
  if (url === null) {
    errors.push(`${label}: SUPABASE_URL constant not found`);
  } else if (url !== backend?.url) {
    errors.push(
      `${label}: SUPABASE_URL '${url}' does not match release/production.json backend.url '${backend?.url}'`,
    );
  }

  const key = readConstant(html, "SUPABASE_PUBLISHABLE_KEY");
  if (key === null) {
    errors.push(`${label}: SUPABASE_PUBLISHABLE_KEY constant not found`);
  } else if (createHash("sha256").update(key).digest("hex") !== backend?.clientKeySha256) {
    errors.push(
      `${label}: SUPABASE_PUBLISHABLE_KEY sha256 does not match release/production.json backend.clientKeySha256`,
    );
  }

  // No CDN, no analytics, no third-party origin on a page that takes a
  // password: the backend is the only absolute URL the page may name.
  for (const absolute of html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []) {
    if (typeof backend?.url !== "string" || !absolute.startsWith(backend.url)) {
      errors.push(`${label}: external origin '${absolute}' is not allowed`);
    }
  }

  for (const marker of requiredResetMarkers) {
    if (!html.includes(marker)) errors.push(`${label}: missing marker '${marker}'`);
  }
  for (const marker of forbiddenResetMarkers) {
    if (html.includes(marker)) errors.push(`${label}: forbidden marker '${marker}'`);
  }
  return errors;
}

export function validatePublicLegalRoot(rootDirectory, backend = readBackendContract()) {
  const errors = [];
  for (const file of requiredFiles) {
    const absolute = resolve(rootDirectory, file);
    if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size === 0) {
      errors.push(`${file}: missing or empty`);
    }
  }

  const privacyPath = resolve(rootDirectory, "privacy/index.html");
  if (existsSync(privacyPath)) {
    const privacy = readFileSync(privacyPath, "utf8");
    for (const marker of requiredPrivacyMarkers) {
      if (!privacy.includes(marker)) errors.push(`privacy/index.html: missing marker '${marker}'`);
    }
    for (const marker of forbiddenPrivacyMarkers) {
      if (privacy.includes(marker)) errors.push(`privacy/index.html: obsolete marker '${marker}'`);
    }
  }

  const resetPath = resolve(rootDirectory, resetPasswordPage);
  if (existsSync(resetPath)) {
    errors.push(...validateResetPasswordPage(readFileSync(resetPath, "utf8"), backend));
  }
  return errors;
}

export function runCli(args = process.argv.slice(2)) {
  const rootArgument = args[0] ?? "public";
  const rootDirectory = resolve(projectRoot, rootArgument);
  if (!insideProject(rootDirectory)) {
    console.error("Public legal root must stay inside the repository.");
    return 1;
  }
  const errors = validatePublicLegalRoot(rootDirectory);
  if (errors.length > 0) {
    console.error(`Public legal page gate failed for ${relative(projectRoot, rootDirectory)}:`);
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`Public legal page gate passed: ${requiredFiles.length} file(s).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
