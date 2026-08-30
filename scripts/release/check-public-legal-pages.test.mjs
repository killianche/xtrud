import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validatePublicLegalRoot } from "./check-public-legal-pages.mjs";

function fixture(privacy) {
  const root = mkdtempSync(join(tmpdir(), "xtrud-legal-"));
  writeFileSync(join(root, "legal.css"), "body{}", "utf8");
  for (const directory of ["privacy", "terms", "support", "account-deletion"]) {
    mkdirSync(join(root, directory));
    writeFileSync(join(root, directory, "index.html"), "ok", "utf8");
  }
  writeFileSync(join(root, "privacy", "index.html"), privacy, "utf8");
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
  assert.deepEqual(validatePublicLegalRoot(fixture(validPrivacy)), []);
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
