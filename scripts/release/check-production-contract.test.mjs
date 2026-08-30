import assert from "node:assert/strict";
import test from "node:test";

import { validateProductionContract } from "./check-production-contract.mjs";

const valid = {
  schemaVersion: 1,
  backend: {
    phase: "supabase-cloud",
    url: "https://project.supabase.co",
    clientKeySha256: "a".repeat(64),
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
  broken.backend.url += "/rest/v1";
  broken.web.domains.push("https://xtrud.pro");
  broken.web.remoteDir = "/var/www/../other";
  const errors = validateProductionContract(broken).join("\n");
  assert.match(errors, /backend\.url/);
  assert.match(errors, /domains must be unique/);
  assert.match(errors, /remoteDir/);
});
