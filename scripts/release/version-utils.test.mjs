import assert from "node:assert/strict";
import test from "node:test";

import { checkIosBuildNumber, compareMarketingVersions } from "./version-utils.mjs";

test("marketing version comparison rejects a rollback despite a later build", () => {
  assert.ok(compareMarketingVersions("1.0.0", "1.0.1") < 0);
});

test("marketing version comparison accepts equal and newer versions", () => {
  assert.equal(compareMarketingVersions("1.0", "1.0.0"), 0);
  assert.ok(compareMarketingVersions("1.1.0", "1.0.99") > 0);
});

test("marketing version comparison fails closed for invalid formats", () => {
  assert.equal(compareMarketingVersions("1.0.0-beta", "1.0.0"), null);
  assert.equal(compareMarketingVersions("1.0.0.1", "1.0.0"), null);
});

test("build number gate rejects a build already uploaded to TestFlight", () => {
  // Реальный случай 2026-08-30: build 12 лежал в TestFlight, ledger знал только
  // про опубликованный 11, и повторная загрузка 12 прошла бы гейт.
  const failures = checkIosBuildNumber({ build: 12, published: 11, uploaded: 12 });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /уже загружен/u);
});

test("build number gate accepts the next free build", () => {
  assert.deepEqual(checkIosBuildNumber({ build: 13, published: 11, uploaded: 12 }), []);
});

test("build number gate still rejects a published build", () => {
  const failures = checkIosBuildNumber({ build: 10, published: 11, uploaded: 12 });
  assert.ok(failures.some((f) => /меньше опубликованного/u.test(f)));
});

test("build number gate fails closed on an inconsistent ledger", () => {
  const failures = checkIosBuildNumber({ build: 13, published: 11, uploaded: 5 });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /меньше опубликованного/u);
});

test("build number gate works when the ledger has no uploaded build yet", () => {
  assert.deepEqual(checkIosBuildNumber({ build: 12, published: 11, uploaded: undefined }), []);
});
