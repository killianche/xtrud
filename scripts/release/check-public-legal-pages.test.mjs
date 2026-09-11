import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validatePublicLegalRoot, validateResetPasswordPage } from "./check-public-legal-pages.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function resetPage(extra = "") {
  return [
    "<!doctype html>",
    '<meta name="robots" content="noindex,nofollow">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'">`,
    '<p>Напишите в <a href="/support/">поддержку</a>.</p>',
    extra,
  ].join("\n");
}

function fixture(privacy, reset = resetPage()) {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-"));
  writeFileSync(join(root, "legal.css"), "body{}", "utf8");
  for (const directory of ["privacy", "terms", "support", "account-deletion", "reset-password"]) {
    mkdirSync(join(root, directory));
    writeFileSync(join(root, directory, "index.html"), "ok", "utf8");
  }
  writeFileSync(join(root, "privacy", "index.html"), privacy, "utf8");
  writeFileSync(join(root, "reset-password", "index.html"), reset, "utf8");
  return root;
}

const validPrivacy = [
  "номер мобильного телефона",
  "Восстановление доступа — через поддержку",
  "Встроенного чата",
  "/account-deletion/",
].join(" ");

test("accepts a complete current legal artifact", () => {
  assert.deepEqual(validatePublicLegalRoot(fixture(validPrivacy)), []);
});

// Сброса пароля по почте нет с 2026-09-03 (восстановление — через
// поддержку), Supabase и сторонние CDN из цепочки убраны: политика не должна
// обещать того, чего нет.
for (const obsolete of [
  "сброс пароля по электронной почте",
  "Провайдер транзакционной почты",
  "images.weserv.nl",
  "Supabase",
]) {
  test(`rejects obsolete privacy copy: ${obsolete}`, () => {
    const errors = validatePublicLegalRoot(fixture(`${validPrivacy} ${obsolete}`));
    assert.ok(errors.some((error) => error.includes("obsolete marker")));
  });
}

test("the shipped privacy page passes the gate", () => {
  const html = readFileSync(join(projectRoot, "public/privacy/index.html"), "utf8");
  const root = fixture(html);
  assert.deepEqual(validatePublicLegalRoot(root), []);
});

test("rejects obsolete SMS-only privacy copy", () => {
  const errors = validatePublicLegalRoot(
    fixture(`${validPrivacy} единственный способ авторизации — входа по SMS-коду`),
  );
  assert.ok(errors.some((error) => error.includes("obsolete marker")));
});

test("rejects a missing public legal route", () => {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-empty-"));
  assert.ok(validatePublicLegalRoot(root).some((error) => error.includes("terms/index.html")));
});

test("requires the public reset-password page", () => {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-empty-"));
  assert.ok(
    validatePublicLegalRoot(root).some((error) =>
      error.includes("reset-password/index.html: missing or empty"),
    ),
  );
});

test("accepts a static reset page that points to support", () => {
  assert.deepEqual(validateResetPasswordPage(resetPage()), []);
});

test("rejects a reset page without the support link", () => {
  const errors = validateResetPasswordPage(resetPage().replace('href="/support/"', 'href="/"'));
  assert.ok(errors.some((error) => error.includes('href="/support/"')));
});

for (const [what, extra] of [
  ["a script", "<script>fetch('/v2/auth/login')</script>"],
  ["a form", '<form action="/x"></form>'],
  ["a password field", '<input type="password">'],
  ["the old Supabase auth path", "<p>/auth/v1/user</p>"],
  ["the old Supabase REST path", "<p>/rest/v1/orders</p>"],
  ["a Supabase constant", "<p>SUPABASE_URL</p>"],
]) {
  test(`rejects a reset page with ${what}`, () => {
    const errors = validateResetPasswordPage(resetPage(extra));
    assert.ok(errors.some((error) => error.includes("forbidden marker")));
  });
}

test("rejects any absolute origin on the reset page", () => {
  const errors = validateResetPasswordPage(resetPage('<a href="https://cdn.example.com/x">x</a>'));
  assert.ok(errors.some((error) => error.includes("absolute URL")));
});

test("the shipped reset page passes the gate", () => {
  const html = readFileSync(join(projectRoot, "public/reset-password/index.html"), "utf8");
  assert.deepEqual(validateResetPasswordPage(html), []);
});
