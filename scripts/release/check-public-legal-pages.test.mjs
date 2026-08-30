import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  readBackendContract,
  validatePublicLegalRoot,
  validateResetPasswordPage,
} from "./check-public-legal-pages.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const backend = {
  url: "https://example-backend.test",
  clientKeySha256: sha256("sb_publishable_test"),
};

function resetPage(overrides = {}) {
  const url = overrides.url ?? backend.url;
  const key = overrides.key ?? "sb_publishable_test";
  const extra = overrides.extra ?? "";
  return [
    '<meta name="robots" content="noindex,nofollow">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${url}">`,
    '<input type="password" autocomplete="new-password">',
    "<script>",
    `var SUPABASE_URL = "${url}";`,
    `var SUPABASE_PUBLISHABLE_KEY = "${key}";`,
    "window.history.replaceState(null, '', window.location.pathname);",
    extra,
    "</script>",
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
  "электронная почта",
  "номер мобильного телефона",
  "сброс пароля по электронной почте",
  "Встроенного чата",
  "/account-deletion/",
].join(" ");

test("accepts a complete current legal artifact", () => {
  assert.deepEqual(validatePublicLegalRoot(fixture(validPrivacy), backend), []);
});

test("rejects obsolete SMS-only privacy copy", () => {
  const errors = validatePublicLegalRoot(
    fixture(`${validPrivacy} единственный способ авторизации — входа по SMS-коду`),
    backend,
  );
  assert.ok(errors.some((error) => error.includes("obsolete marker")));
});

test("rejects a missing public legal route", () => {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-empty-"));
  assert.ok(
    validatePublicLegalRoot(root, backend).some((error) => error.includes("terms/index.html")),
  );
});

test("requires the public reset-password page", () => {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-empty-"));
  assert.ok(
    validatePublicLegalRoot(root, backend).some((error) =>
      error.includes("reset-password/index.html: missing or empty"),
    ),
  );
});

test("accepts a reset page whose backend constants match the contract", () => {
  assert.deepEqual(validateResetPasswordPage(resetPage(), backend), []);
});

test("rejects a reset page whose Supabase URL drifted from the contract", () => {
  const errors = validateResetPasswordPage(resetPage({ url: "https://api.xtrud.pro" }), backend);
  assert.ok(errors.some((error) => error.includes("does not match release/production.json")));
});

test("rejects a reset page whose publishable key drifted from the contract", () => {
  const errors = validateResetPasswordPage(resetPage({ key: "sb_publishable_other" }), backend);
  assert.ok(errors.some((error) => error.includes("clientKeySha256")));
});

test("rejects a reset page without the backend constants", () => {
  const errors = validateResetPasswordPage("<html></html>", backend);
  assert.ok(errors.some((error) => error.includes("SUPABASE_URL constant not found")));
  assert.ok(errors.some((error) => error.includes("SUPABASE_PUBLISHABLE_KEY constant not found")));
});

test("rejects a third-party origin on the reset page", () => {
  const errors = validateResetPasswordPage(
    resetPage({ extra: '<script src="https://cdn.example.com/supabase.js"></script>' }),
    backend,
  );
  assert.ok(errors.some((error) => error.includes("external origin")));
});

for (const forbidden of [
  "localStorage.setItem('t', token)",
  "sessionStorage.setItem('t', token)",
  "document.cookie = 't=' + token",
  "console.log(token)",
  "node.innerHTML = token",
]) {
  test(`rejects a reset page that leaks the token via ${forbidden.split(/[.(=]/)[0]}`, () => {
    const errors = validateResetPasswordPage(resetPage({ extra: forbidden }), backend);
    assert.ok(errors.some((error) => error.includes("forbidden marker")));
  });
}

test("rejects a reset page that never clears the recovery hash", () => {
  const withoutClear = resetPage().replace(
    "window.history.replaceState(null, '', window.location.pathname);",
    "",
  );
  const errors = validateResetPasswordPage(withoutClear, backend);
  assert.ok(errors.some((error) => error.includes("history.replaceState")));
});

test("the shipped reset page matches the production backend contract", () => {
  const html = readFileSync(join(projectRoot, "public/reset-password/index.html"), "utf8");
  assert.deepEqual(validateResetPasswordPage(html, readBackendContract()), []);
});
