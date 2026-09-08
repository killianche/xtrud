// Перенос файлов с диска сервера в объектное хранилище S3.
//
// Правила: ничего не удаляет с диска (диск остаётся запасным путём чтения),
// каждый загруженный объект проверяет обратным чтением по размеру, паспорта
// кладёт закрытыми, остальное — публичным. Повторный запуск безопасен:
// уже перенесённые файлы пропускаются.
//
// Настройки берутся из переменных окружения:
//   S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY FILES_ROOT
import { createHash, createHmac } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const cfg = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  root: process.env.FILES_ROOT ?? "/opt/xtrud/files",
};
for (const [k, v] of Object.entries(cfg)) {
  if (!v) {
    console.error(`не задано: ${k}`);
    process.exit(2);
  }
}

/** Закрытый бакет: паспорта не должны стать публичными. */
const PRIVATE_BUCKETS = new Set(["master-verifications"]);
const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const sha256hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");

function signed(method, key, payload, extra = {}) {
  const host = new URL(cfg.endpoint).host;
  const uri = `/${cfg.bucket}/${encodeKey(key)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256hex(payload);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extra,
  };
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, uri, "", canonicalHeaders, signedHeaders, payloadHash].join(
    "\n",
  );
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const key4 = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretKey}`, date), cfg.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", key4).update(toSign).digest("hex");
  return {
    url: `${cfg.endpoint}${uri}`,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function walk(dir, base = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) out.push(rel);
  }
  return out;
}

const keys = await walk(cfg.root);
console.log(`файлов на диске: ${keys.length}`);

let uploaded = 0;
let skipped = 0;
const failed = [];

for (const key of keys) {
  const bucketName = key.split("/")[0] ?? "";
  const ext = path.extname(key).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const local = path.join(cfg.root, key);
  const size = (await stat(local)).size;

  const head = signed("HEAD", key, Buffer.alloc(0));
  const existing = await fetch(head.url, { method: "HEAD", headers: head.headers });
  if (existing.ok && Number(existing.headers.get("content-length")) === size) {
    skipped += 1;
    continue;
  }

  const body = await readFile(local);
  const extra = { "content-type": contentType };
  if (!PRIVATE_BUCKETS.has(bucketName)) extra["x-amz-acl"] = "public-read";
  const put = signed("PUT", key, body, extra);
  const res = await fetch(put.url, {
    method: "PUT",
    headers: put.headers,
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    failed.push(`${key}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    continue;
  }

  // Проверка обратным чтением: загрузили ровно столько байт, сколько было.
  const check = signed("HEAD", key, Buffer.alloc(0));
  const back = await fetch(check.url, { method: "HEAD", headers: check.headers });
  if (!back.ok || Number(back.headers.get("content-length")) !== size) {
    failed.push(`${key}: проверка после загрузки не сошлась`);
    continue;
  }
  uploaded += 1;
  console.log(
    `перенесён: ${key} (${size} Б, ${PRIVATE_BUCKETS.has(bucketName) ? "закрытый" : "публичный"})`,
  );
}

console.log(`\nитог: перенесено ${uploaded}, пропущено ${skipped}, ошибок ${failed.length}`);
for (const f of failed) console.error(`ОШИБКА ${f}`);
process.exit(failed.length > 0 ? 1 : 0);
