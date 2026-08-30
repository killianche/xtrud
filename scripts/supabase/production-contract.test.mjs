import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateRenderedCompose } from "./check-rendered-compose.mjs";
import { validateRuntimeEnv } from "./check-runtime-env.mjs";
import { validateUpstreamSnapshot } from "./check-upstream-snapshot.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const infraRoot = path.join(root, "infra/supabase");
const prepareScript = path.join(root, "scripts/supabase/prepare-exact-stack.sh");
const lock = JSON.parse(readFileSync(path.join(infraRoot, "image-digests.json"), "utf8"));
const imageEnv = {
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

function withTempDirectory(callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "xtrud-production-contract-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function makeJwt({ algorithm, keyId, privateKey = null, role, secret = null }) {
  const header = { alg: algorithm, typ: "JWT", ...(keyId ? { kid: keyId } : {}) };
  const payload = { exp: 4_102_444_800, iat: 1_700_000_000, iss: "supabase", role };
  const signingInput = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url")}`;
  const signature = secret
    ? createHmac("sha256", secret).update(signingInput).digest()
    : sign("sha256", Buffer.from(signingInput), {
        dsaEncoding: "ieee-p1363",
        key: privateKey,
      });
  return `${signingInput}.${signature.toString("base64url")}`;
}

function parseBaseEnv() {
  const entries = new Map();
  for (const rawLine of readFileSync(path.join(infraRoot, ".env.example"), "utf8").split(
    /\r?\n/u,
  )) {
    if (!rawLine || rawLine.startsWith("#")) continue;
    const separator = rawLine.indexOf("=");
    entries.set(rawLine.slice(0, separator), rawLine.slice(separator + 1));
  }
  for (const [name, value] of entries) {
    if (/^<[^>]+>$/u.test(value)) entries.set(name, "x".repeat(64));
  }
  return entries;
}

function createProductionRuntimeEnv(directory, mutate = () => {}) {
  const entries = parseBaseEnv();
  const jwtSecret = "j".repeat(48);
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateEc = privateKey.export({ format: "jwk" });
  const keyId = randomUUID();
  const privateJwk = {
    alg: "ES256",
    crv: privateEc.crv,
    d: privateEc.d,
    ext: true,
    key_ops: ["sign", "verify"],
    kid: keyId,
    kty: "EC",
    use: "sig",
    x: privateEc.x,
    y: privateEc.y,
  };
  const publicJwk = { ...privateJwk, key_ops: ["verify"] };
  delete publicJwk.d;
  const octJwk = { alg: "HS256", k: Buffer.from(jwtSecret).toString("base64url"), kty: "oct" };

  entries.set("JWT_SECRET", jwtSecret);
  entries.set("ANON_KEY", makeJwt({ algorithm: "HS256", role: "anon", secret: jwtSecret }));
  entries.set(
    "SERVICE_ROLE_KEY",
    makeJwt({ algorithm: "HS256", role: "service_role", secret: jwtSecret }),
  );
  entries.set("SUPABASE_PUBLISHABLE_KEY", `sb_publishable_${"p".repeat(40)}`);
  entries.set("SUPABASE_SECRET_KEY", `sb_secret_${"s".repeat(40)}`);
  entries.set("JWT_KEYS", JSON.stringify([privateJwk, octJwk]));
  entries.set("JWT_JWKS", JSON.stringify({ keys: [publicJwk, octJwk] }));
  entries.set(
    "ANON_KEY_ASYMMETRIC",
    makeJwt({ algorithm: "ES256", keyId, privateKey, role: "anon" }),
  );
  entries.set(
    "SERVICE_ROLE_KEY_ASYMMETRIC",
    makeJwt({ algorithm: "ES256", keyId, privateKey, role: "service_role" }),
  );
  entries.set("COMPOSE_FILE", "docker-compose.yml:docker-compose.production.yml");
  entries.set("XTRUD_TARGET_ARCH", "amd64");
  entries.set("SUPABASE_PUBLIC_URL", "https://api.xtrud.pro");
  entries.set("API_EXTERNAL_URL", "https://api.xtrud.pro/auth/v1");
  entries.set("SITE_URL", "https://xtrud.pro");
  entries.set(
    "ADDITIONAL_REDIRECT_URLS",
    "https://xtrud.pro/reset-password,xtrud://reset-password",
  );
  entries.set("PROXY_DOMAIN", "api.xtrud.pro");
  entries.set("API_GW_HTTP_PORT", "127.0.0.1:8000");
  entries.set("ENABLE_ANONYMOUS_USERS", "false");
  entries.set("FUNCTIONS_VERIFY_JWT", "false");
  entries.set("DISABLE_SIGNUP", "false");
  entries.set("ENABLE_EMAIL_SIGNUP", "true");
  entries.set("ENABLE_EMAIL_AUTOCONFIRM", "false");
  entries.set("ENABLE_PHONE_SIGNUP", "false");
  entries.set("ENABLE_PHONE_AUTOCONFIRM", "false");
  entries.set("IMGPROXY_AUTO_WEBP", "true");
  entries.set("POSTGRES_PORT", "5432");
  entries.set("POOLER_PROXY_PORT_TRANSACTION", "6543");
  entries.set("REALTIME_DB_ENC_KEY", "r".repeat(16));
  entries.set("VAULT_ENC_KEY", "v".repeat(32));
  entries.set("STORAGE_BACKEND", "s3");
  entries.set("GLOBAL_S3_BUCKET", "xtrud-production-objects");
  entries.set("GLOBAL_S3_ENDPOINT", "https://s3.storage.beget.cloud");
  entries.set("GLOBAL_S3_PROTOCOL", "https");
  entries.set("GLOBAL_S3_FORCE_PATH_STYLE", "true");
  entries.set("AWS_ACCESS_KEY_ID", "beget-app-access-fixture");
  entries.set("AWS_SECRET_ACCESS_KEY", "beget-app-secret-fixture-value");
  entries.set("S3_PROTOCOL_ACCESS_KEY_ID", "xtrud-protocol-id-fixture");
  entries.set("S3_PROTOCOL_ACCESS_KEY_SECRET", "xtrud-protocol-secret-fixture-value");
  entries.set("REGION", "ru-test-1");
  for (const [service, envName] of Object.entries(imageEnv)) {
    entries.set(envName, lock.images[service].amd64);
  }
  mutate(entries);
  const envPath = path.join(directory, `production-${randomUUID()}.env`);
  writeFileSync(
    envPath,
    `${[...entries].map(([name, value]) => `${name}=${value}`).join("\n")}\n`,
    { mode: 0o600 },
  );
  return envPath;
}

function git(repository, args) {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function createProductionSnapshot(directory) {
  const snapshotPath = path.join(directory, `snapshot-${randomUUID()}`);
  const upstreamPath = path.join(snapshotPath, "upstream");
  const stackPath = path.join(snapshotPath, "stack");
  const pinsPath = path.join(snapshotPath, "pins");
  mkdirSync(path.join(upstreamPath, "docker"), { mode: 0o700, recursive: true });
  mkdirSync(stackPath, { mode: 0o700 });
  mkdirSync(pinsPath, { mode: 0o700 });
  const compose = `services:\n${Object.entries(lock.images)
    .map(([service, image]) => `  ${service}:\n    image: ${image.source}`)
    .join("\n")}\n`;
  const checkoutComposePath = path.join(upstreamPath, "docker/docker-compose.yml");
  writeFileSync(checkoutComposePath, compose);
  execFileSync("git", ["init", "--quiet", upstreamPath]);
  git(upstreamPath, ["add", "docker/docker-compose.yml"]);
  execFileSync(
    "git",
    [
      "-C",
      upstreamPath,
      "-c",
      "user.name=xtrud-test",
      "-c",
      "user.email=xtrud-test@example.test",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { stdio: "ignore" },
  );
  const tag = "self-hosted/v-production-test";
  git(upstreamPath, ["tag", tag]);
  const commit = git(upstreamPath, ["rev-parse", "HEAD"]);
  const dockerTree = git(upstreamPath, ["rev-parse", "HEAD:docker"]);
  const fixtureLock = {
    format: "xtrud-supabase-image-lock-v1",
    upstream: { tag, commit, dockerTree },
    images: Object.fromEntries(
      Object.entries(lock.images).map(([service, image]) => [
        service,
        {
          source: image.source,
          amd64: `${image.source}@sha256:${createHash("sha256").update(`${service}:amd64`).digest("hex")}`,
          arm64: `${image.source}@sha256:${createHash("sha256").update(`${service}:arm64`).digest("hex")}`,
        },
      ]),
    ),
  };
  const commitPath = path.join(pinsPath, ".supabase-commit");
  const dockerTreePath = path.join(pinsPath, ".supabase-docker-tree");
  const versionPath = path.join(pinsPath, ".supabase-version");
  const imageLockPath = path.join(pinsPath, "image-digests.json");
  const overlayPath = path.join(pinsPath, "docker-compose.production.yml");
  writeFileSync(commitPath, `${commit}\n`);
  writeFileSync(dockerTreePath, `${dockerTree}\n`);
  writeFileSync(versionPath, `${tag}\n`);
  writeFileSync(imageLockPath, `${JSON.stringify(fixtureLock)}\n`);
  writeFileSync(overlayPath, "services: {}\n");
  copyFileSync(checkoutComposePath, path.join(stackPath, "docker-compose.yml"));
  copyFileSync(imageLockPath, path.join(stackPath, "xtrud-image-digests.json"));
  copyFileSync(overlayPath, path.join(stackPath, "docker-compose.production.yml"));
  writeFileSync(
    path.join(snapshotPath, "manifest.json"),
    `${JSON.stringify({
      format: "xtrud-exact-production-v1",
      upstream: { tag, commit, dockerTree },
      runnable: false,
      nextGate: "validate private production runtime env",
    })}\n`,
    { mode: 0o600 },
  );
  return {
    snapshotPath,
    validation: { commitPath, dockerTreePath, imageLockPath, overlayPath, versionPath },
  };
}

function createRenderedProduction(directory, mutate = () => {}) {
  const services = Object.fromEntries(
    Object.entries(lock.images).map(([service, images]) => [
      service,
      { image: images.amd64, platform: "linux/amd64" },
    ]),
  );
  services["api-gw"].ports = [
    { host_ip: "127.0.0.1", protocol: "tcp", published: 8000, target: 8000 },
  ];
  services.auth.environment = {
    GOTRUE_JWT_KEYS: "private-jwk-fixture",
    API_EXTERNAL_URL: "https://api.xtrud.pro/auth/v1",
    GOTRUE_SITE_URL: "https://xtrud.pro",
    GOTRUE_URI_ALLOW_LIST: "https://xtrud.pro/reset-password,xtrud://reset-password",
  };
  services.studio.environment = { SUPABASE_PUBLIC_URL: "https://api.xtrud.pro" };
  services.realtime.environment = { API_JWT_JWKS: "jwks-fixture" };
  services.storage.environment = {
    JWT_JWKS: "jwks-fixture",
    STORAGE_BACKEND: "s3",
    GLOBAL_S3_ENDPOINT: "https://s3.storage.beget.cloud",
    GLOBAL_S3_PROTOCOL: "https",
    GLOBAL_S3_FORCE_PATH_STYLE: "true",
    AWS_ACCESS_KEY_ID: "beget-app-access-fixture",
    AWS_SECRET_ACCESS_KEY: "beget-app-secret-fixture-value",
    S3_PROTOCOL_ACCESS_KEY_ID: "xtrud-protocol-id-fixture",
    S3_PROTOCOL_ACCESS_KEY_SECRET: "xtrud-protocol-secret-fixture-value",
    REGION: "ru-test-1",
  };
  services.functions.environment = { SUPABASE_JWKS: "jwks-fixture", VERIFY_JWT: "false" };
  const config = { name: "xtrud-production", services };
  mutate(config);
  const configPath = path.join(directory, `compose-${randomUUID()}.json`);
  writeFileSync(configPath, `${JSON.stringify(config)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return configPath;
}

function createFakeGitEnvironment(directory) {
  const binDirectory = path.join(directory, "fake-bin");
  const marker = path.join(directory, "git-called");
  const composePath = path.join(directory, "fake-upstream-compose.yml");
  mkdirSync(binDirectory, { mode: 0o700 });
  writeFileSync(
    composePath,
    `services:\n${Object.entries(lock.images)
      .map(([service, image]) => `  ${service}:\n    image: ${image.source}`)
      .join("\n")}\n`,
  );
  const fakeGit = path.join(binDirectory, "git");
  writeFileSync(
    fakeGit,
    `#!/bin/sh
set -eu
: > "$XTRUD_FAKE_GIT_MARKER"
if [ "$1" = "clone" ]; then
  for destination do :; done
  mkdir -p "$destination/docker"
  cp "$XTRUD_FAKE_COMPOSE" "$destination/docker/docker-compose.yml"
  exit 0
fi
if [ "$1" = "-C" ]; then
  shift 2
  case "$1 $2" in
    "rev-parse HEAD") printf '%s\\n' "$XTRUD_FAKE_COMMIT" ;;
    "rev-parse HEAD:docker") printf '%s\\n' "$XTRUD_FAKE_DOCKER_TREE" ;;
    "describe --exact-match") printf '%s\\n' "$XTRUD_FAKE_TAG" ;;
    "show HEAD:docker/docker-compose.yml") cat "$XTRUD_FAKE_COMPOSE" ;;
    *) exit 0 ;;
  esac
  exit 0
fi
exit 1
`,
    { mode: 0o700 },
  );
  chmodSync(fakeGit, 0o700);
  return {
    ...process.env,
    PATH: `${binDirectory}:${process.env.PATH}`,
    XTRUD_FAKE_COMMIT: readFileSync(path.join(infraRoot, ".supabase-commit"), "utf8").trim(),
    XTRUD_FAKE_COMPOSE: composePath,
    XTRUD_FAKE_DOCKER_TREE: readFileSync(
      path.join(infraRoot, ".supabase-docker-tree"),
      "utf8",
    ).trim(),
    XTRUD_FAKE_GIT_MARKER: marker,
    XTRUD_FAKE_TAG: readFileSync(path.join(infraRoot, ".supabase-version"), "utf8").trim(),
  };
}

test("production runtime accepts exact domains, mobile redirect, image locks and external S3", () =>
  withTempDirectory((directory) => {
    const envPath = createProductionRuntimeEnv(directory);
    const result = validateRuntimeEnv({ arch: "amd64", envPath, mode: "production" });
    assert.equal(result.arch, "amd64");
    assert.equal(result.images, 11);
    assert.equal(result.mode, "production");
    assert.ok(result.names > 0);
  }));

test("production runtime rejects URL, listener, anonymous-user and external-S3 drift", () =>
  withTempDirectory((directory) => {
    const cases = [
      [(entries) => entries.set("SUPABASE_PUBLIC_URL", "https://example.invalid"), /PUBLIC_URL/u],
      [(entries) => entries.set("API_GW_HTTP_PORT", "0.0.0.0:8000"), /Envoy/u],
      [(entries) => entries.set("ENABLE_ANONYMOUS_USERS", "true"), /ANONYMOUS_USERS/u],
      [(entries) => entries.set("GLOBAL_S3_PROTOCOL", "http"), /S3.*https/u],
      [(entries) => entries.set("GLOBAL_S3_ENDPOINT", "http://s3.example"), /HTTPS URL/u],
      [
        (entries) => entries.set("AWS_ACCESS_KEY_ID", entries.get("S3_PROTOCOL_ACCESS_KEY_ID")),
        /credentials must differ/u,
      ],
      [
        (entries) => entries.set("GLOBAL_S3_ENDPOINT", "https://minio.internal"),
        /HTTPS URL|forbidden legacy/u,
      ],
      [(entries) => entries.set("XTRUD_IMAGE_AUTH", lock.images.auth.source), /image lock/u],
    ];
    for (const [mutate, pattern] of cases) {
      const envPath = createProductionRuntimeEnv(directory, mutate);
      assert.throws(
        () => validateRuntimeEnv({ arch: "amd64", envPath, mode: "production" }),
        pattern,
      );
    }
  }));

test("production runtime CLI does not print rejected secret values", () =>
  withTempDirectory((directory) => {
    const sentinel = `NO_OUTPUT_SENTINEL_${randomUUID()}`;
    const envPath = createProductionRuntimeEnv(directory, (entries) => {
      entries.set("AWS_ACCESS_KEY_ID", sentinel);
      entries.set("S3_PROTOCOL_ACCESS_KEY_ID", sentinel);
    });
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts/supabase/check-runtime-env.mjs"),
        "--env",
        envPath,
        "--mode",
        "production",
        "--arch",
        "amd64",
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  }));

test("rendered production accepts exact snapshot, services, loopback Envoy and Beget S3 wiring", () =>
  withTempDirectory((directory) => {
    const snapshot = createProductionSnapshot(directory);
    const configPath = createRenderedProduction(directory);
    assert.deepEqual(
      validateRenderedCompose({
        arch: "amd64",
        configPath,
        profile: "production",
        snapshotPath: snapshot.snapshotPath,
        snapshotValidation: snapshot.validation,
      }),
      { arch: "amd64", images: 11, profile: "production", publishedPorts: 1 },
    );
  }));

test("rendered production rejects listener, storage, legacy backend and database exposure drift", () =>
  withTempDirectory((directory) => {
    const cases = [
      [
        (config) => {
          config.services["api-gw"].ports[0].host_ip = "0.0.0.0";
        },
        /only api-gw/u,
      ],
      [
        (config) => {
          config.services.storage.environment.GLOBAL_S3_PROTOCOL = "http";
        },
        /HTTPS/u,
      ],
      [
        (config) => {
          config.services.storage.environment.GLOBAL_S3_ENDPOINT = "http://s3.storage.beget.cloud";
        },
        /HTTPS URL/u,
      ],
      [
        (config) => {
          config.services.storage.environment.AWS_ACCESS_KEY_ID =
            config.services.storage.environment.S3_PROTOCOL_ACCESS_KEY_ID;
        },
        /distinct/u,
      ],
      [
        (config) => {
          config.services.auth.environment.API_EXTERNAL_URL =
            "https://wgeimsajvjkzrrnfrnkb.supabase.co/auth/v1";
        },
        /API_EXTERNAL_URL|forbidden/u,
      ],
      [
        (config) => {
          config.services.db.ports = [
            { host_ip: "127.0.0.1", protocol: "tcp", published: 5432, target: 5432 },
          ];
        },
        /exactly one host port|database port/u,
      ],
      [
        (config) => {
          config.services.db.labels = { "com.xtrud.restore.target-marker": randomUUID() };
        },
        /restore-only ownership label/u,
      ],
      [
        (config) => {
          config.services.auth.image = lock.images.auth.source;
        },
        /digest lock/u,
      ],
    ];
    for (const [mutate, pattern] of cases) {
      const snapshot = createProductionSnapshot(directory);
      const configPath = createRenderedProduction(directory, mutate);
      assert.throws(
        () =>
          validateRenderedCompose({
            arch: "amd64",
            configPath,
            profile: "production",
            snapshotPath: snapshot.snapshotPath,
            snapshotValidation: snapshot.validation,
          }),
        pattern,
      );
    }
  }));

test("production snapshot format is separate and fail-closed", () =>
  withTempDirectory((directory) => {
    const snapshot = createProductionSnapshot(directory);
    const result = validateUpstreamSnapshot({
      ...snapshot.validation,
      profile: "production",
      snapshotPath: snapshot.snapshotPath,
    });
    assert.equal(result.images, 11);
    assert.throws(
      () =>
        validateUpstreamSnapshot({
          ...snapshot.validation,
          profile: "rehearsal",
          snapshotPath: snapshot.snapshotPath,
        }),
      /rehearsal|ENOENT|manifest/u,
    );
  }));

test("generic prepare CLI validates profile, destination and Bash syntax before network access", () => {
  assert.equal(spawnSync("bash", ["-n", prepareScript]).status, 0);
  assert.notEqual(spawnSync("bash", [prepareScript]).status, 0);
  assert.notEqual(
    spawnSync("bash", [prepareScript, "unknown", "/private/tmp/xtrud-exact-production.bad"]).status,
    0,
  );
  assert.notEqual(
    spawnSync("bash", [prepareScript, "production", "/private/tmp/xtrud-exact-stack.bad"]).status,
    0,
  );
  assert.equal(existsSync("/private/tmp/xtrud-exact-production.bad.partial"), false);
});

test("generic prepare CLI assembles and validates a separate production snapshot", () =>
  withTempDirectory((directory) => {
    const destination = `/private/tmp/xtrud-exact-production.${randomUUID()}`;
    try {
      const result = spawnSync("bash", [prepareScript, "production", destination], {
        encoding: "utf8",
        env: createFakeGitEnvironment(directory),
        timeout: 10_000,
      });
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
      assert.equal(existsSync(path.join(destination, "stack/docker-compose.production.yml")), true);
      assert.equal(existsSync(path.join(destination, "stack/.env.production.example")), true);
      const manifest = JSON.parse(readFileSync(path.join(destination, "manifest.json"), "utf8"));
      assert.equal(manifest.format, "xtrud-exact-production-v1");
      assert.equal(manifest.runnable, false);
    } finally {
      rmSync(destination, { force: true, recursive: true });
      rmSync(`${destination}.partial`, { force: true, recursive: true });
    }
  }));
