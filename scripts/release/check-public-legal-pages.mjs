#!/usr/bin/env node
/**
 * Public store/legal URLs are release artifacts, not documentation-only files.
 * This gate prevents Expo exports from silently omitting a page and catches the
 * obsolete SMS-only/privacy copy that previously reached the public website.
 *
 * public/reset-password/index.html used to finish a password recovery against
 * Supabase Auth. Supabase was shut down on 2026-09-08 and recovery goes through
 * support (DECISION 2026-09-03, docs/PASSWORD_RECOVERY_RUNBOOK.md), so the page
 * is static text now. This gate keeps it that way: no script, no form, no
 * password field, no API or Supabase reference, no absolute origin — and the
 * support link has to be there, because pointing to support is its only job.
 */

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
// Nothing on the reset page may accept a password or talk to a backend.
const forbiddenResetMarkers = [
  "<script",
  "<form",
  'type="password"',
  "/auth/v1",
  "/rest/v1",
  "apikey",
  "SUPABASE",
];
const requiredResetMarkers = [
  "Content-Security-Policy",
  'name="robots" content="noindex,nofollow"',
  'href="/support/"',
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

/**
 * The reset page is plain text pointing to support. It names no absolute
 * origin at all: every link stays relative to the site.
 */
export function validateResetPasswordPage(html) {
  const errors = [];
  const label = resetPasswordPage;

  for (const absolute of html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []) {
    errors.push(`${label}: absolute URL '${absolute}' is not allowed`);
  }
  for (const marker of requiredResetMarkers) {
    if (!html.includes(marker)) errors.push(`${label}: missing marker '${marker}'`);
  }
  for (const marker of forbiddenResetMarkers) {
    if (html.includes(marker)) errors.push(`${label}: forbidden marker '${marker}'`);
  }
  return errors;
}

export function validatePublicLegalRoot(rootDirectory) {
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
    errors.push(...validateResetPasswordPage(readFileSync(resetPath, "utf8")));
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
