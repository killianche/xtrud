#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, "infra/supabase/.env.example");
const namesPath = resolve(root, "infra/supabase/upstream-v0.8.0.env.names");
const versionPath = resolve(root, "infra/supabase/.supabase-version");

const expectedVersion = "self-hosted/v0.8.0";
const version = readFileSync(versionPath, "utf8").trim();
const requiredNames = readFileSync(namesPath, "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const entries = new Map();
const duplicates = [];
for (const [index, line] of readFileSync(envPath, "utf8").split(/\r?\n/u).entries()) {
  if (!line || line.startsWith("#")) continue;
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
  if (!match) throw new Error(`Invalid env contract line ${index + 1}; expected NAME=value.`);
  if (entries.has(match[1])) duplicates.push(match[1]);
  entries.set(match[1], match[2]);
}

const missing = requiredNames.filter((name) => !entries.has(name));
const failures = [];
if (version !== expectedVersion)
  failures.push(`snapshot is ${version}, expected ${expectedVersion}`);
if (duplicates.length) failures.push(`duplicate names: ${duplicates.join(", ")}`);
if (missing.length) failures.push(`missing upstream names: ${missing.join(", ")}`);
if (entries.get("SUPABASE_PUBLIC_URL") !== "https://api.xtrud.pro") {
  failures.push("SUPABASE_PUBLIC_URL must be the public API origin");
}
if (entries.get("API_EXTERNAL_URL") !== "https://api.xtrud.pro/auth/v1") {
  failures.push("API_EXTERNAL_URL must be the full public Auth URL ending in /auth/v1");
}
if (!entries.get("API_GW_HTTP_PORT")?.startsWith("127.0.0.1:")) {
  failures.push("API_GW_HTTP_PORT must bind the host side of Envoy to loopback");
}

const secretNames = [
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "JWT_KEYS",
  "JWT_JWKS",
  "DASHBOARD_USERNAME",
  "DASHBOARD_PASSWORD",
  "SECRET_KEY_BASE",
  "REALTIME_DB_ENC_KEY",
  "VAULT_ENC_KEY",
  "PG_META_CRYPTO_KEY",
  "LOGFLARE_PUBLIC_ACCESS_TOKEN",
  "LOGFLARE_PRIVATE_ACCESS_TOKEN",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "ANON_KEY_ASYMMETRIC",
  "SERVICE_ROLE_KEY_ASYMMETRIC",
  "SMTP_PASS",
];
for (const name of secretNames) {
  const value = entries.get(name) ?? "";
  if (!/^<[^>]+>$/u.test(value)) failures.push(`${name} must remain a names-only placeholder`);
}

if (failures.length) {
  console.error(`Supabase env contract FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Supabase env contract passed: ${requiredNames.length} upstream names, ${version}, loopback Envoy.`,
);
