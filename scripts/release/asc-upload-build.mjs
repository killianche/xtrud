// Загрузка IPA в App Store Connect напрямую с VDS через официальный
// build-uploads API (App Store Connect API 4.1). Нужен, когда EAS Submit
// зависает в очереди: Transporter и altool требуют macOS, а Mac владельца
// не трогаем. Проверено 2026-09-02 на сборке 20.
//
//   node scripts/release/asc-upload-build.mjs <путь к .ipa>
//
// Версия и номер сборки берутся из app.json — те же, что попали в IPA
// (Apple сверяет их с бинарником и при расхождении переводит загрузку в FAILED).
// Ключ API и идентификаторы — в /root/.config/xtrud/asc.json (вне репозитория):
//   { keyId, issuerId, keyPath, appId }
//
// Протокол (developer.apple.com/documentation/appstoreconnectapi/build-uploads):
//   POST /v1/buildUploads → POST /v1/buildUploadFiles → PUT каждой части по
//   uploadOperations (без JWT, URL подписаны) → PATCH buildUploadFiles/{id}
//   uploaded:true + sourceFileChecksums.file MD5 → опрос buildUploads/{id}
//   до COMPLETE или FAILED.

import { createHash, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const CONFIG_PATH = process.env.XTRUD_ASC_CONFIG ?? "/root/.config/xtrud/asc.json";
const ipaPath = process.argv[2];
if (!ipaPath) {
  console.error("использование: node scripts/release/asc-upload-build.mjs <путь к .ipa>");
  process.exit(2);
}

const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const appJson = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8"));
const shortVersion = appJson.expo.version;
const buildNumber = appJson.expo.ios.buildNumber;

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const p = b64({ iss: cfg.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const s = createSign("SHA256")
    .update(`${h}.${p}`)
    .sign({ key: readFileSync(cfg.keyPath, "utf8"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${h}.${p}.${s}`;
}

async function api(path, init = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

function fail(step, r) {
  console.error(`${step}: HTTP ${r.status}`, JSON.stringify(r.body?.errors ?? r.body).slice(0, 600));
  process.exit(1);
}

const buf = readFileSync(ipaPath);
const md5 = createHash("md5").update(buf).digest("hex");
console.log(`IPA ${basename(ipaPath)}: ${buf.length} байт, md5 ${md5}`);
console.log(`версия ${shortVersion}, сборка ${buildNumber} (из app.json)`);

let r = await api("/v1/buildUploads", {
  method: "POST",
  body: JSON.stringify({
    data: {
      type: "buildUploads",
      attributes: { cfBundleShortVersionString: shortVersion, cfBundleVersion: buildNumber, platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: cfg.appId } } },
    },
  }),
});
if (!r.ok) fail("buildUploads", r);
const uploadId = r.body.data.id;
console.log("загрузка создана:", uploadId);

r = await api("/v1/buildUploadFiles", {
  method: "POST",
  body: JSON.stringify({
    data: {
      type: "buildUploadFiles",
      attributes: { assetType: "ASSET", fileName: basename(ipaPath), fileSize: buf.length, uti: "com.apple.ipa" },
      relationships: { buildUpload: { data: { type: "buildUploads", id: uploadId } } },
    },
  }),
});
if (!r.ok) fail("buildUploadFiles", r);
const fileId = r.body.data.id;
const ops = r.body.data.attributes.uploadOperations ?? [];
console.log(`файл зарезервирован: ${fileId}, частей: ${ops.length}`);

for (const op of ops) {
  const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
  const res = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
  console.log(`  часть ${op.partNumber ?? "?"}: ${op.offset}+${op.length} → ${res.status}`);
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
}

r = await api(`/v1/buildUploadFiles/${fileId}`, {
  method: "PATCH",
  body: JSON.stringify({
    data: {
      type: "buildUploadFiles",
      id: fileId,
      attributes: { uploaded: true, sourceFileChecksums: { file: { algorithm: "MD5", hash: md5 } } },
    },
  }),
});
if (!r.ok) fail("commit", r);
console.log("подтверждено:", r.body.data.attributes.assetDeliveryState?.state);

for (let i = 0; i < 90; i++) {
  r = await api(`/v1/buildUploads/${uploadId}`);
  const s = r.body?.data?.attributes?.state ?? {};
  console.log(`  ${new Date().toISOString().slice(11, 19)} ${s.state}`);
  for (const e of s.errors ?? []) console.error("   ошибка:", e.code, e.description);
  for (const w of s.warnings ?? []) console.log("   предупреждение:", w.code, w.description);
  if (s.state === "COMPLETE") {
    console.log("сборка доставлена; дальше она обрабатывается в App Store Connect (processingState → VALID)");
    process.exit(0);
  }
  if (s.state === "FAILED") process.exit(1);
  await new Promise((res) => setTimeout(res, 20000));
}
console.error("не дождались итогового состояния за 30 минут");
process.exit(1);
