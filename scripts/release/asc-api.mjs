#!/usr/bin/env node
// Запрос к App Store Connect API от имени ключа xtrud — для подачи версии на
// проверку и чтения её состояния (подача — только по слову владельца).
//
//   node scripts/release/asc-api.mjs GET /v1/apps/{app}/appStoreVersions
//   node scripts/release/asc-api.mjs PATCH /v1/... '{"data":{...}}'
//
// {app} в пути заменяется на id приложения из конфига. Ключ — в файле из
// XTRUD_ASC_CONFIG (по умолчанию /root/.config/xtrud/asc.json), в Git его нет.
// Печатает JSON ответа; ошибка — код 1.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const CONFIG_PATH = process.env.XTRUD_ASC_CONFIG ?? "/root/.config/xtrud/asc.json";
const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const [method = "GET", rawPath, body] = process.argv.slice(2);
if (!rawPath) {
  console.error("usage: asc-api.mjs METHOD /v1/path [json-body]");
  process.exit(1);
}
const path = rawPath.replaceAll("{app}", cfg.appId);

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const payload = b64({ iss: cfg.issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const sig = createSign("SHA256")
    .update(`${head}.${payload}`)
    .sign({ key: readFileSync(cfg.keyPath, "utf8"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${head}.${payload}.${sig}`;
}

const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  method,
  headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
  body: body ?? undefined,
});
const text = await res.text();
console.log(text || `(${res.status})`);
process.exit(res.ok ? 0 : 1);
