#!/usr/bin/env node
/**
 * Fail-closed semantic validation for the production release ledger.
 * JSON Schema documents the shape; these checks enforce constraints that a
 * generic format=uri validator cannot express (root-only HTTPS and safe paths).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");

function rootHttpsUrl(value, label, errors) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${label} must be an absolute URL`);
    return;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    errors.push(`${label} must be a root HTTPS origin without credentials/path/query/hash`);
  }
}

export function validateProductionContract(contract) {
  const errors = [];
  if (contract?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!contract?.backend || !contract?.web || !contract?.stores) {
    return [...errors, "backend, web and stores are required"];
  }
  // supabase-cloud убран: Supabase погашен 2026-09-08, вернуться в эту фазу
  // без решения владельца нельзя.
  if (!new Set(["beget-transition", "beget-primary"]).has(contract.backend.phase)) {
    errors.push("backend.phase is invalid");
  }
  rootHttpsUrl(contract.backend.url, "backend.url", errors);
  if (!/^[A-Za-z_][A-Za-z0-9_-]*@[A-Za-z0-9.-]+$/.test(contract.web.sshHost ?? "")) {
    errors.push("web.sshHost must be an explicit user@host target");
  }
  if (
    typeof contract.web.remoteDir !== "string" ||
    !contract.web.remoteDir.startsWith("/") ||
    contract.web.remoteDir.includes("..")
  ) {
    errors.push("web.remoteDir must be an absolute path without '..'");
  }
  if (!Array.isArray(contract.web.domains) || contract.web.domains.length === 0) {
    errors.push("web.domains must be a non-empty array");
  } else {
    contract.web.domains.forEach((domain, index) => {
      rootHttpsUrl(domain, `web.domains[${index}]`, errors);
    });
    if (new Set(contract.web.domains).size !== contract.web.domains.length) {
      errors.push("web.domains must be unique");
    }
  }
  const ios = contract.stores.ios;
  if (
    !ios ||
    typeof ios.latestPublishedVersion !== "string" ||
    !Number.isInteger(ios.latestPublishedBuildNumber) ||
    ios.latestPublishedBuildNumber < 1
  ) {
    errors.push("stores.ios must contain a published version and positive build number");
  }
  const androidCode = contract.stores.android?.latestPublishedVersionCode;
  if (androidCode !== null && (!Number.isInteger(androidCode) || androidCode < 1)) {
    errors.push("stores.android.latestPublishedVersionCode must be null or a positive integer");
  }
  return errors;
}

export function runCli() {
  const contract = JSON.parse(readFileSync(resolve(root, "release/production.json"), "utf8"));
  const errors = validateProductionContract(contract);
  if (errors.length > 0) {
    console.error("Production release contract is invalid:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(
    `Production contract passed: phase=${contract.backend.phase}, domains=${contract.web.domains.length}.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
