import assert from "node:assert/strict";
import test from "node:test";

import { validateProductionContract } from "./check-production-contract.mjs";

const valid = {
  schemaVersion: 1,
  backend: {
    phase: "beget-primary",
    url: "https://api.example.test",
  },
  web: {
    sshHost: "deploy@example.com",
    remoteDir: "/var/www/xtrud",
    domains: ["https://xtrud.pro"],
  },
  stores: {
    ios: { latestPublishedVersion: "1.0.1", latestPublishedBuildNumber: 11 },
    android: { latestPublishedVersionCode: null },
  },
};

test("valid production contract passes", () => {
  assert.deepEqual(validateProductionContract(valid), []);
});

test("backend path, duplicate domains and unsafe remote path fail", () => {
  const broken = structuredClone(valid);
  broken.backend.url += "/v2";
  broken.web.domains.push("https://xtrud.pro");
  broken.web.remoteDir = "/var/www/../other";
  const errors = validateProductionContract(broken).join("\n");
  assert.match(errors, /backend\.url/);
  assert.match(errors, /domains must be unique/);
  assert.match(errors, /remoteDir/);
});

test("the retired supabase-cloud phase is rejected", () => {
  const broken = structuredClone(valid);
  broken.backend.phase = "supabase-cloud";
  assert.match(validateProductionContract(broken).join("\n"), /backend\.phase/);
});
