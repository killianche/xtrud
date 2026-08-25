#!/usr/bin/env node

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requiredNamesPath = resolve(root, "infra/supabase/upstream-v0.8.0.env.names");
const imageLockPath = resolve(root, "infra/supabase/image-digests.json");

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

const minimumLengths = new Map([
  ["POSTGRES_PASSWORD", 32],
  ["JWT_SECRET", 32],
  ["DASHBOARD_PASSWORD", 32],
  ["SECRET_KEY_BASE", 32],
  ["PG_META_CRYPTO_KEY", 32],
  ["LOGFLARE_PUBLIC_ACCESS_TOKEN", 32],
  ["LOGFLARE_PRIVATE_ACCESS_TOKEN", 32],
  ["S3_PROTOCOL_ACCESS_KEY_ID", 16],
  ["S3_PROTOCOL_ACCESS_KEY_SECRET", 32],
]);

const exactLengths = new Map([
  ["REALTIME_DB_ENC_KEY", 16],
  ["VAULT_ENC_KEY", 32],
]);

const booleanNames = [
  "DISABLE_SIGNUP",
  "ENABLE_EMAIL_SIGNUP",
  "ENABLE_EMAIL_AUTOCONFIRM",
  "ENABLE_ANONYMOUS_USERS",
  "ENABLE_PHONE_SIGNUP",
  "ENABLE_PHONE_AUTOCONFIRM",
  "FUNCTIONS_VERIFY_JWT",
  "IMGPROXY_AUTO_WEBP",
];

const knownUnsafeValues = new Set([
  "your-super-secret-and-long-postgres-password",
  "your-super-secret-jwt-token-with-at-least-32-characters-long",
  "this_password_is_insecure_and_should_be_updated",
  "supabase",
]);

const imageEnvByService = {
  studio: "XTRUD_IMAGE_STUDIO",
  "api-gw": "XTRUD_IMAGE_API_GW",
  auth: "XTRUD_IMAGE_AUTH",
  rest: "XTRUD_IMAGE_REST",
  realtime: "XTRUD_IMAGE_REALTIME",
  storage: "XTRUD_IMAGE_STORAGE",
  imgproxy: "XTRUD_IMAGE_IMGPROXY",
  meta: "XTRUD_IMAGE_META",
  functions: "XTRUD_IMAGE_FUNCTIONS",
  db: "XTRUD_IMAGE_DB",
  supavisor: "XTRUD_IMAGE_SUPAVISOR",
};

function parseEnv(text) {
  const entries = new Map();
  const duplicates = [];
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) throw new Error(`invalid env syntax at line ${index + 1}`);
    if (entries.has(match[1])) duplicates.push(match[1]);
    entries.set(match[1], match[2]);
  }
  if (duplicates.length) throw new Error(`duplicate env names: ${duplicates.join(", ")}`);
  return entries;
}

function requireUrl(entries, name) {
  const value = entries.get(name) ?? "";
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function decodeJwtPart(value, name) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error(`${name} is not a valid JWT`);
  }
}

function validateLegacyJwt(value, expectedRole, secret, name) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error(`${name} is not a valid JWT`);
  const header = decodeJwtPart(parts[0], name);
  const payload = decodeJwtPart(parts[1], name);
  if (
    header.alg !== "HS256" ||
    payload.role !== expectedRole ||
    payload.iss !== "supabase" ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error(`${name} has an unexpected algorithm or role`);
  }
  const actual = Buffer.from(parts[2], "base64url");
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error(`${name} is not derived from JWT_SECRET`);
  }
}

function validateModernAuthKeys(entries) {
  if (!entries.get("SUPABASE_PUBLISHABLE_KEY")?.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY has an unexpected prefix");
  }
  if (!entries.get("SUPABASE_SECRET_KEY")?.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY has an unexpected prefix");
  }

  let privateKeys;
  let publicJwks;
  try {
    privateKeys = JSON.parse(entries.get("JWT_KEYS"));
    publicJwks = JSON.parse(entries.get("JWT_JWKS"));
  } catch {
    throw new Error("JWT_KEYS and JWT_JWKS must be valid JSON");
  }
  if (!Array.isArray(privateKeys) || !Array.isArray(publicJwks?.keys)) {
    throw new Error("JWT_KEYS/JWT_JWKS have an unexpected structure");
  }

  const expectedOctKey = Buffer.from(entries.get("JWT_SECRET")).toString("base64url");
  const privateOct = privateKeys.find((key) => key.kty === "oct");
  const publicOct = publicJwks.keys.find((key) => key.kty === "oct");
  if (privateOct?.k !== expectedOctKey || publicOct?.k !== expectedOctKey) {
    throw new Error("JWT_KEYS/JWT_JWKS symmetric key does not match JWT_SECRET");
  }

  const privateEc = privateKeys.find((key) => key.kty === "EC" && key.alg === "ES256");
  const publicEc = publicJwks.keys.find((key) => key.kty === "EC" && key.kid === privateEc?.kid);
  if (
    !privateEc?.d ||
    !publicEc ||
    publicEc.d ||
    privateEc.x !== publicEc.x ||
    privateEc.y !== publicEc.y
  ) {
    throw new Error("JWT_KEYS/JWT_JWKS EC keypair is inconsistent");
  }
  let privateKey;
  let derivedPublicEc;
  try {
    privateKey = createPrivateKey({ format: "jwk", key: privateEc });
    derivedPublicEc = createPublicKey(privateKey).export({ format: "jwk" });
  } catch {
    throw new Error("JWT_KEYS contains an invalid EC private key");
  }
  if (derivedPublicEc.x !== publicEc.x || derivedPublicEc.y !== publicEc.y) {
    throw new Error("JWT_KEYS EC private key does not match JWT_JWKS public key");
  }
  const keyConsistencyChallenge = Buffer.from("xtrud-rehearsal-jwk-consistency-v1");
  const keyConsistencySignature = sign("sha256", keyConsistencyChallenge, {
    dsaEncoding: "ieee-p1363",
    key: privateKey,
  });
  const publicKey = createPublicKey({ format: "jwk", key: publicEc });
  if (
    !verify(
      "sha256",
      keyConsistencyChallenge,
      { dsaEncoding: "ieee-p1363", key: publicKey },
      keyConsistencySignature,
    )
  ) {
    throw new Error("JWT_KEYS EC private key does not match JWT_JWKS public key");
  }

  for (const [name, role] of [
    ["ANON_KEY_ASYMMETRIC", "anon"],
    ["SERVICE_ROLE_KEY_ASYMMETRIC", "service_role"],
  ]) {
    const parts = entries.get(name).split(".");
    if (parts.length !== 3) throw new Error(`${name} is not a valid JWT`);
    const header = decodeJwtPart(parts[0], name);
    const payload = decodeJwtPart(parts[1], name);
    if (
      header.alg !== "ES256" ||
      header.kid !== privateEc.kid ||
      payload.role !== role ||
      payload.iss !== "supabase" ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error(`${name} does not match the configured ES256 key role`);
    }
    const valid = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { dsaEncoding: "ieee-p1363", key: publicKey },
      Buffer.from(parts[2], "base64url"),
    );
    if (!valid) throw new Error(`${name} signature does not match JWT_JWKS`);
  }
}

export function validateRuntimeEnv({ envPath, mode, arch }) {
  if (!isAbsolute(envPath)) throw new Error("runtime env path must be absolute");
  if (mode !== "rehearsal")
    throw new Error("only rehearsal mode is supported until production overlay review");
  if (!new Set(["amd64", "arm64"]).has(arch)) throw new Error("arch must be amd64 or arm64");

  const linkMetadata = lstatSync(envPath);
  if (linkMetadata.isSymbolicLink()) throw new Error("runtime env must not be a symlink");
  const resolvedEnvPath = realpathSync(envPath);
  if (resolvedEnvPath === root || resolvedEnvPath.startsWith(`${root}/`)) {
    throw new Error("runtime env must be outside the repository");
  }
  const metadata = statSync(resolvedEnvPath);
  if (!metadata.isFile()) throw new Error("runtime env must be a regular file");
  if ((metadata.mode & 0o777) !== 0o600) throw new Error("runtime env must have exact mode 0600");

  const entries = parseEnv(readFileSync(resolvedEnvPath, "utf8"));
  const requiredNames = readFileSync(requiredNamesPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const missing = requiredNames.filter((name) => !entries.has(name));
  if (missing.length) throw new Error(`missing required env names: ${missing.join(", ")}`);

  const placeholders = [...entries]
    .filter(([, value]) => /^<[^>]+>$/u.test(value) || value.includes("${"))
    .map(([name]) => name);
  if (placeholders.length) {
    throw new Error(`runtime env contains placeholders: ${placeholders.join(", ")}`);
  }

  for (const name of secretNames) {
    const value = entries.get(name) ?? "";
    if (!value) throw new Error(`${name} is unset`);
    if (knownUnsafeValues.has(value)) throw new Error(`${name} uses a known unsafe default`);
  }
  for (const [name, minimum] of minimumLengths) {
    if ((entries.get(name) ?? "").length < minimum) {
      throw new Error(`${name} is shorter than ${minimum} characters`);
    }
  }
  for (const [name, exact] of exactLengths) {
    if ((entries.get(name) ?? "").length !== exact) {
      throw new Error(`${name} must be exactly ${exact} characters`);
    }
  }
  for (const name of booleanNames) {
    if (!new Set(["true", "false"]).has(entries.get(name))) {
      throw new Error(`${name} must be true or false`);
    }
  }
  if (entries.get("FUNCTIONS_VERIFY_JWT") !== "false") {
    throw new Error(
      "FUNCTIONS_VERIFY_JWT must be false for the current route-authorized xtrud functions",
    );
  }
  validateLegacyJwt(entries.get("ANON_KEY"), "anon", entries.get("JWT_SECRET"), "ANON_KEY");
  validateLegacyJwt(
    entries.get("SERVICE_ROLE_KEY"),
    "service_role",
    entries.get("JWT_SECRET"),
    "SERVICE_ROLE_KEY",
  );
  validateModernAuthKeys(entries);
  if (!/^\d+$/u.test(entries.get("POSTGRES_PORT") ?? "")) {
    throw new Error("POSTGRES_PORT must remain an internal numeric port");
  }
  if (!/^\d+$/u.test(entries.get("POOLER_PROXY_PORT_TRANSACTION") ?? "")) {
    throw new Error("POOLER_PROXY_PORT_TRANSACTION must remain an internal numeric port");
  }

  const publicUrl = requireUrl(entries, "SUPABASE_PUBLIC_URL");
  const authUrl = requireUrl(entries, "API_EXTERNAL_URL");
  const siteUrl = requireUrl(entries, "SITE_URL");
  if (authUrl.href !== `${publicUrl.href.replace(/\/$/u, "")}/auth/v1`) {
    throw new Error("API_EXTERNAL_URL must be SUPABASE_PUBLIC_URL plus /auth/v1");
  }

  const lock = JSON.parse(readFileSync(imageLockPath, "utf8"));
  if (lock.format !== "xtrud-supabase-image-lock-v1") throw new Error("unknown image lock format");
  if (entries.get("XTRUD_TARGET_ARCH") !== arch) {
    throw new Error("XTRUD_TARGET_ARCH does not match --arch");
  }
  for (const [service, envName] of Object.entries(imageEnvByService)) {
    const expected = lock.images?.[service]?.[arch];
    if (!expected || entries.get(envName) !== expected) {
      throw new Error(`${envName} does not match the ${arch} image lock`);
    }
  }

  if (publicUrl.href !== "http://127.0.0.1:18000/") {
    throw new Error("rehearsal API must use http://127.0.0.1:18000");
  }
  if (!siteUrl.hostname.endsWith(".test")) throw new Error("rehearsal SITE_URL must use .test");
  if (!(entries.get("PROXY_DOMAIN") ?? "").endsWith(".test")) {
    throw new Error("rehearsal PROXY_DOMAIN must use .test");
  }
  for (const rawRedirect of (entries.get("ADDITIONAL_REDIRECT_URLS") ?? "").split(",")) {
    let redirect;
    try {
      redirect = new URL(rawRedirect);
    } catch {
      throw new Error("ADDITIONAL_REDIRECT_URLS contains an invalid URL");
    }
    if (redirect.protocol !== "xtrud-rehearsal:" && !redirect.hostname.endsWith(".test")) {
      throw new Error("rehearsal redirects must use .test or xtrud-rehearsal://");
    }
  }
  const allUrls = [
    entries.get("SUPABASE_PUBLIC_URL"),
    entries.get("API_EXTERNAL_URL"),
    entries.get("SITE_URL"),
    entries.get("ADDITIONAL_REDIRECT_URLS"),
  ].join(",");
  if (/xtrud\.pro|alanbani\.ru/u.test(allUrls)) {
    throw new Error("rehearsal env must not reference production domains");
  }
  if (entries.get("API_GW_HTTP_PORT") !== "127.0.0.1:18000") {
    throw new Error("rehearsal Envoy must bind to 127.0.0.1:18000");
  }
  if (entries.get("XTRUD_REHEARSAL_API_PORT") !== "18000") {
    throw new Error("XTRUD_REHEARSAL_API_PORT must be 18000");
  }
  if (entries.get("COMPOSE_FILE") !== "docker-compose.yml:docker-compose.rehearsal.yml") {
    throw new Error("COMPOSE_FILE must contain only the exact base and rehearsal overlay");
  }

  return { arch, mode, names: entries.size, images: Object.keys(imageEnvByService).length };
}

function readCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
  return { arch: args.get("--arch"), envPath: args.get("--env"), mode: args.get("--mode") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = validateRuntimeEnv(readCliArgs(process.argv.slice(2)));
    console.log(
      `Supabase runtime env passed: mode=${result.mode}, arch=${result.arch}, names=${result.names}, images=${result.images}.`,
    );
  } catch (error) {
    console.error(`Supabase runtime env FAILED: ${error.message}`);
    process.exit(1);
  }
}
