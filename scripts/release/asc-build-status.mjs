#!/usr/bin/env node
// Статус сборки iOS в App Store Connect: обработка, TestFlight, группы.
//
//   node scripts/release/asc-build-status.mjs [номер сборки]
//
// Без номера — buildNumber из app.json. Ключ API — в файле из
// XTRUD_ASC_CONFIG (по умолчанию /root/.config/xtrud/asc.json), в Git его нет.
// Выход 0 — сборка VALID; 1 — нет такой сборки или обработка не прошла;
// 2 — ещё обрабатывается. Нужен навыку xtrud-release (.claude/skills).

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const CONFIG_PATH = process.env.XTRUD_ASC_CONFIG ?? "/root/.config/xtrud/asc.json";
const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const appJson = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8"));
const buildNumber = process.argv[2] ?? appJson.expo.ios.buildNumber;

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const body = b64({ iss: cfg.issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const sig = createSign("SHA256")
    .update(`${head}.${body}`)
    .sign({ key: readFileSync(cfg.keyPath, "utf8"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${head}.${body}.${sig}`;
}

const token = jwt();
async function asc(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const list = await asc(
  `/v1/builds?filter[app]=${cfg.appId}&filter[version]=${buildNumber}&fields[builds]=version,processingState,expired,uploadedDate`,
);
const build = list.data[0];
if (!build) {
  console.log(`Сборки ${buildNumber} в App Store Connect нет.`);
  process.exit(1);
}
const a = build.attributes;
const beta = await asc(`/v1/builds/${build.id}/buildBetaDetail`);
console.log(
  `Сборка ${buildNumber}: ${a.processingState}, загружена ${a.uploadedDate}, просрочена: ${a.expired}`,
);
console.log(`TestFlight: ${JSON.stringify(beta.data.attributes)}`);
process.exit(a.processingState === "VALID" ? 0 : a.processingState === "PROCESSING" ? 2 : 1);
