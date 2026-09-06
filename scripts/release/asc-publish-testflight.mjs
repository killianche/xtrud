// Публикация уже загруженной сборки в TestFlight с VDS или из GitHub Actions:
//   1. дождаться, пока Apple обработает сборку (processingState = VALID);
//   2. записать «Что нового» для тестировщиков;
//   3. отправить на проверку TestFlight (betaAppReviewSubmissions);
//   4. добавить сборку в группу тестировщиков.
//
//   node scripts/release/asc-publish-testflight.mjs --group <betaGroupId> [--notes-file <path>]
//
// Номер сборки и версия — из app.json (те же, что попали в IPA). Ключ API —
// в файле из XTRUD_ASC_CONFIG (по умолчанию /root/.config/xtrud/asc.json):
//   { keyId, issuerId, keyPath, appId }
// Ничего секретного на экран не выводится.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const CONFIG_PATH = process.env.XTRUD_ASC_CONFIG ?? "/root/.config/xtrud/asc.json";
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const groupId = arg("--group");
const notesFile = arg("--notes-file");
if (!groupId) {
  console.error(
    "использование: node scripts/release/asc-publish-testflight.mjs --group <betaGroupId> [--notes-file <path>]",
  );
  process.exit(2);
}

const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const appJson = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8"));
const buildNumber = String(appJson.expo.ios.buildNumber);
const version = String(appJson.expo.version);

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const payload = b64({ iss: cfg.issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer
    .sign({ key: readFileSync(cfg.keyPath, "utf8"), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${header}.${payload}.${sig}`;
}

async function asc(path, init = {}) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(
      `ASC ${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Ждём обработку. Обычно 5–15 минут; предел — 40 минут.
let build = null;
for (let attempt = 1; attempt <= 80; attempt += 1) {
  const list = await asc(
    `/v1/builds?filter[app]=${cfg.appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.version]=${version}&limit=5&fields[builds]=version,processingState`,
  );
  build = (list.data ?? []).find((b) => b.attributes.version === buildNumber) ?? null;
  const state = build?.attributes.processingState ?? "ещё не появилась";
  console.log(
    `  ${new Date().toISOString().slice(11, 19)} сборка ${version} (${buildNumber}): ${state}`,
  );
  if (state === "VALID") break;
  if (state === "FAILED" || state === "INVALID") {
    console.error("Apple отклонил сборку при обработке.");
    process.exit(1);
  }
  await sleep(30_000);
}
if (build?.attributes.processingState !== "VALID") {
  console.error("Сборка не стала VALID за отведённое время.");
  process.exit(1);
}

// 2. «Что нового».
if (notesFile) {
  const whatsNew = readFileSync(notesFile, "utf8").trim();
  const loc = await asc(
    `/v1/builds/${build.id}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale`,
  );
  const existing =
    (loc.data ?? []).find((l) => l.attributes.locale === "ru") ?? (loc.data ?? [])[0];
  if (existing) {
    await asc(`/v1/betaBuildLocalizations/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: { type: "betaBuildLocalizations", id: existing.id, attributes: { whatsNew } },
      }),
    });
  } else {
    await asc("/v1/betaBuildLocalizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "betaBuildLocalizations",
          attributes: { locale: "ru", whatsNew },
          relationships: { build: { data: { type: "builds", id: build.id } } },
        },
      }),
    });
  }
  console.log("заметки для тестировщиков записаны");
}

// 3. Проверка TestFlight (для новой версии Apple смотрит первую сборку).
try {
  const sub = await asc("/v1/betaAppReviewSubmissions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "betaAppReviewSubmissions",
        relationships: { build: { data: { type: "builds", id: build.id } } },
      },
    }),
  });
  console.log("отправлена на проверку TestFlight:", sub.data?.attributes?.betaReviewState);
} catch (error) {
  // Повторная отправка той же сборки возвращает 409 — это не ошибка.
  if (!String(error.message).includes("409")) throw error;
  console.log("уже была отправлена на проверку TestFlight");
}

// 4. Группа тестировщиков.
await asc(`/v1/betaGroups/${groupId}/relationships/builds`, {
  method: "POST",
  body: JSON.stringify({ data: [{ type: "builds", id: build.id }] }),
});
const details = await asc(`/v1/buildBetaDetails?filter[build]=${build.id}`);
console.log("добавлена в группу; состояние:", JSON.stringify(details.data?.[0]?.attributes ?? {}));
