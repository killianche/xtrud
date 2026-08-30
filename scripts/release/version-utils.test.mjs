import assert from "node:assert/strict";
import test from "node:test";

import { compareMarketingVersions } from "./version-utils.mjs";

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
