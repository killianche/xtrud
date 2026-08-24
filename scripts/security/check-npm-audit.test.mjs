import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit, normalizeAudit } from "./check-npm-audit.mjs";

const advisory = {
  source: 123,
  name: "fixture",
  url: "https://example.test/GHSA-fixture",
  severity: "high",
  range: "<2.0.0",
};
const report = {
  vulnerabilities: {
    fixture: { severity: "high", range: "<2.0.0", via: [advisory] },
  },
};
const normalized = normalizeAudit(report);
const baseline = {
  schemaVersion: 1,
  reviewBy: "2099-01-01",
  packages: normalized.packages,
  advisories: normalized.advisories,
};

test("exact package and advisory baseline passes", () => {
  assert.deepEqual(evaluateAudit(report, baseline, new Date("2026-01-01")).errors, []);
});

test("new advisory in an already allowed package fails", () => {
  const changed = structuredClone(report);
  changed.vulnerabilities.fixture.via.push({
    ...advisory,
    source: 456,
    url: "https://example.test/GHSA-new",
  });
  assert.match(
    evaluateAudit(changed, baseline, new Date("2026-01-01")).errors.join("\n"),
    /new advisory/,
  );
});

test("changed vulnerable range and malformed baseline fail closed", () => {
  const changed = structuredClone(report);
  changed.vulnerabilities.fixture.range = "<3.0.0";
  assert.match(
    evaluateAudit(changed, baseline, new Date("2026-01-01")).errors.join("\n"),
    /range changed/,
  );
  assert.match(evaluateAudit(report, {}, new Date("2026-01-01")).errors[0], /schema/);
});
