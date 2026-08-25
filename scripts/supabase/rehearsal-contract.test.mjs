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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateRenderedRehearsal } from "./check-rendered-rehearsal.mjs";
import { validateRuntimeEnv } from "./check-runtime-env.mjs";
import {
  validateImageLockPins,
  validateUpstreamCompose,
  validateUpstreamSnapshot,
} from "./check-upstream-snapshot.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const infraRoot = path.join(root, "infra/supabase");
const prepareScript = path.join(root, "scripts/supabase/prepare-exact-rehearsal.sh");
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

function makeJwt({
  algorithm,
  exp = 4_102_444_800,
  keyId,
  privateKey = null,
  role,
  secret = null,
}) {
  const header = { alg: algorithm, typ: "JWT", ...(keyId ? { kid: keyId } : {}) };
  const payload = { exp, iat: 1_700_000_000, iss: "supabase", role };
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

function withTempDirectory(callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "xtrud-rehearsal-contract-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function parseTemplateEnv() {
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

function createRuntimeEnv(directory, { arch = "arm64", mutate = () => {} } = {}) {
  const entries = parseTemplateEnv();
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
  entries.set("COMPOSE_FILE", "docker-compose.yml:docker-compose.rehearsal.yml");
  entries.set("XTRUD_TARGET_ARCH", arch);
  entries.set("XTRUD_REHEARSAL_API_PORT", "18000");
  entries.set("SUPABASE_PUBLIC_URL", "http://127.0.0.1:18000");
  entries.set("API_EXTERNAL_URL", "http://127.0.0.1:18000/auth/v1");
  entries.set("SITE_URL", "https://app.xtrud.test");
  entries.set(
    "ADDITIONAL_REDIRECT_URLS",
    "https://app.xtrud.test/reset-password,xtrud-rehearsal://reset-password",
  );
  entries.set("PROXY_DOMAIN", "api.xtrud.test");
  entries.set("API_GW_HTTP_PORT", "127.0.0.1:18000");
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
  for (const [service, envName] of Object.entries(imageEnv)) {
    entries.set(envName, lock.images[service][arch]);
  }
  mutate(entries);
  const envPath = path.join(directory, `runtime-${arch}-${randomUUID()}.env`);
  writeFileSync(
    envPath,
    `${[...entries].map(([name, value]) => `${name}=${value}`).join("\n")}\n`,
    {
      mode: 0o600,
    },
  );
  return envPath;
}

function createRenderedConfig(directory, { arch = "arm64", mode = 0o600, mutate = () => {} } = {}) {
  const services = Object.fromEntries(
    Object.entries(lock.images).map(([service, images]) => [
      service,
      { image: images[arch], platform: `linux/${arch}` },
    ]),
  );
  services["api-gw"].ports = [
    { host_ip: "127.0.0.1", protocol: "tcp", published: 18000, target: 8000 },
  ];
  services.auth.environment = { GOTRUE_JWT_KEYS: "private-jwk-fixture" };
  services.realtime.environment = { API_JWT_JWKS: "jwks-fixture" };
  services.storage.environment = { JWT_JWKS: "jwks-fixture" };
  services.functions.environment = { SUPABASE_JWKS: "jwks-fixture", VERIFY_JWT: "false" };
  const config = { name: "xtrud-rehearsal", services };
  mutate(config);
  const configPath = path.join(directory, `compose-${arch}-${randomUUID()}.json`);
  writeFileSync(configPath, `${JSON.stringify(config)}\n`, { mode });
  chmodSync(configPath, mode);
  return configPath;
}

function git(repository, args) {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixtureDigest(service, arch) {
  return createHash("sha256").update(`${service}:${arch}`).digest("hex");
}

function createUpstreamFixture(directory, mutate = () => {}) {
  const fixtureRoot = path.join(directory, `snapshot-${randomUUID()}`);
  const upstreamPath = path.join(fixtureRoot, "upstream");
  const stackPath = path.join(fixtureRoot, "stack");
  const pinsPath = path.join(fixtureRoot, "pins");
  mkdirSync(path.join(upstreamPath, "docker"), { mode: 0o700, recursive: true });
  mkdirSync(stackPath, { mode: 0o700, recursive: true });
  mkdirSync(pinsPath, { mode: 0o700, recursive: true });
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
  const tag = "self-hosted/v-test";
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
          amd64: `${image.source}@sha256:${fixtureDigest(service, "amd64")}`,
          arm64: `${image.source}@sha256:${fixtureDigest(service, "arm64")}`,
        },
      ]),
    ),
  };
  const fixture = {
    checkoutComposePath,
    commit,
    commitPath: path.join(pinsPath, ".supabase-commit"),
    dockerTree,
    dockerTreePath: path.join(pinsPath, ".supabase-docker-tree"),
    imageLockPath: path.join(pinsPath, "image-digests.json"),
    lock: fixtureLock,
    manifestPath: path.join(fixtureRoot, "manifest.json"),
    overlayPath: path.join(pinsPath, "docker-compose.rehearsal.yml"),
    snapshotPath: fixtureRoot,
    stackPath,
    stackComposePath: path.join(stackPath, "docker-compose.yml"),
    stackLockPath: path.join(stackPath, "xtrud-image-digests.json"),
    stackOverlayPath: path.join(stackPath, "docker-compose.rehearsal.yml"),
    tag,
    versionPath: path.join(pinsPath, ".supabase-version"),
  };
  writeFileSync(fixture.commitPath, `${commit}\n`);
  writeFileSync(fixture.dockerTreePath, `${dockerTree}\n`);
  writeFileSync(fixture.versionPath, `${tag}\n`);
  copyFileSync(checkoutComposePath, fixture.stackComposePath);
  writeFileSync(fixture.overlayPath, "services: {}\n");
  copyFileSync(fixture.overlayPath, fixture.stackOverlayPath);
  mutate(fixture);
  writeFileSync(fixture.imageLockPath, `${JSON.stringify(fixture.lock, null, 2)}\n`);
  copyFileSync(fixture.imageLockPath, fixture.stackLockPath);
  writeFileSync(
    fixture.manifestPath,
    `${JSON.stringify(
      {
        format: "xtrud-exact-rehearsal-v1",
        upstream: {
          tag: readFileSync(fixture.versionPath, "utf8").trim(),
          commit: readFileSync(fixture.commitPath, "utf8").trim(),
          dockerTree: readFileSync(fixture.dockerTreePath, "utf8").trim(),
        },
        runnable: false,
        nextGate: "validate private runtime env",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return fixture;
}

function validateFixture(fixture) {
  return validateUpstreamSnapshot({
    commitPath: fixture.commitPath,
    dockerTreePath: fixture.dockerTreePath,
    imageLockPath: fixture.imageLockPath,
    overlayPath: fixture.overlayPath,
    snapshotPath: fixture.snapshotPath,
    versionPath: fixture.versionPath,
  });
}

function renderedValidationArgs(fixture, arch, configPath) {
  return {
    arch,
    configPath,
    snapshotPath: fixture.snapshotPath,
    snapshotValidation: {
      commitPath: fixture.commitPath,
      dockerTreePath: fixture.dockerTreePath,
      imageLockPath: fixture.imageLockPath,
      overlayPath: fixture.overlayPath,
      versionPath: fixture.versionPath,
    },
  };
}

test("tracked image lock is bound to exact tag, commit, docker tree and per-arch digests", () => {
  const result = validateImageLockPins();
  assert.equal(result.tag, readFileSync(path.join(infraRoot, ".supabase-version"), "utf8").trim());
  assert.equal(Object.keys(result.lock.images).length, 11);
});

test("runtime env accepts authentic ES256 keys and exact arm64/amd64 image locks", () =>
  withTempDirectory((directory) => {
    for (const arch of ["arm64", "amd64"]) {
      const envPath = createRuntimeEnv(directory, { arch });
      const result = validateRuntimeEnv({ arch, envPath, mode: "rehearsal" });
      assert.deepEqual(
        { arch: result.arch, images: result.images, mode: result.mode },
        { arch, images: 11, mode: "rehearsal" },
      );
    }
  }));

test("runtime env rejects permissions, symlinks, repository paths and production mode", () =>
  withTempDirectory((directory) => {
    const insecure = createRuntimeEnv(directory);
    chmodSync(insecure, 0o644);
    assert.throws(
      () => validateRuntimeEnv({ arch: "arm64", envPath: insecure, mode: "rehearsal" }),
      /exact mode 0600/u,
    );
    const valid = createRuntimeEnv(directory);
    const link = path.join(directory, "runtime-link.env");
    symlinkSync(valid, link);
    assert.throws(
      () => validateRuntimeEnv({ arch: "arm64", envPath: link, mode: "rehearsal" }),
      /symlink/u,
    );
    assert.throws(
      () =>
        validateRuntimeEnv({
          arch: "arm64",
          envPath: path.join(infraRoot, "rehearsal.env.example"),
          mode: "rehearsal",
        }),
      /outside the repository/u,
    );
    assert.throws(
      () => validateRuntimeEnv({ arch: "arm64", envPath: valid, mode: "production" }),
      /only rehearsal mode/u,
    );
  }));

test("runtime env rejects forged JWTs, inconsistent keys and unsafe auth/function settings", () =>
  withTempDirectory((directory) => {
    const cases = [
      [
        (entries) => {
          const parts = entries.get("ANON_KEY_ASYMMETRIC").split(".");
          parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
          entries.set("ANON_KEY_ASYMMETRIC", parts.join("."));
        },
        /signature/u,
      ],
      [
        (entries) => {
          const parts = entries.get("ANON_KEY").split(".");
          parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
          entries.set("ANON_KEY", parts.join("."));
        },
        /derived from JWT_SECRET/u,
      ],
      [
        (entries) =>
          entries.set(
            "ANON_KEY",
            makeJwt({
              algorithm: "HS256",
              exp: 1,
              role: "anon",
              secret: entries.get("JWT_SECRET"),
            }),
          ),
        /unexpected algorithm or role/u,
      ],
      [
        (entries) => {
          const keys = JSON.parse(entries.get("JWT_KEYS"));
          keys.find((key) => key.kty === "EC").d = Buffer.alloc(32, 7).toString("base64url");
          entries.set("JWT_KEYS", JSON.stringify(keys));
        },
        /private key|does not match/u,
      ],
      [(entries) => entries.set("FUNCTIONS_VERIFY_JWT", "true"), /FUNCTIONS_VERIFY_JWT.*false/u],
      [
        (entries) => entries.set("REALTIME_DB_ENC_KEY", "r".repeat(17)),
        /REALTIME_DB_ENC_KEY.*exactly 16/u,
      ],
      [(entries) => entries.set("VAULT_ENC_KEY", "v".repeat(31)), /VAULT_ENC_KEY.*exactly 32/u],
      [(entries) => entries.set("SMTP_HOST", "<still-a-placeholder>"), /placeholder/u],
      [
        (entries) => entries.set("SMTP_HOST", `$${"{SMTP_HOST:-mutable-default.example}"}`),
        /placeholder/u,
      ],
    ];
    for (const [index, [mutate, pattern]] of cases.entries()) {
      const envPath = createRuntimeEnv(directory, { mutate });
      assert.throws(
        () => validateRuntimeEnv({ arch: "arm64", envPath, mode: "rehearsal" }),
        pattern,
        `runtime auth/function negative case ${index}`,
      );
    }
  }));

test("runtime env rejects domain, redirect, compose and architecture drift", () =>
  withTempDirectory((directory) => {
    const cases = [
      [(entries) => entries.set("PROXY_DOMAIN", "api.xtrud.pro"), /PROXY_DOMAIN|production/u],
      [
        (entries) => entries.set("ADDITIONAL_REDIRECT_URLS", "https://evil.example/reset"),
        /redirect/u,
      ],
      [(entries) => entries.set("COMPOSE_FILE", "docker-compose.yml:evil.yml"), /COMPOSE_FILE/u],
      [(entries) => entries.set("XTRUD_TARGET_ARCH", "amd64"), /XTRUD_TARGET_ARCH/u],
      [(entries) => entries.set("XTRUD_REHEARSAL_API_PORT", "18001"), /REHEARSAL_API_PORT/u],
      [(entries) => entries.set("XTRUD_IMAGE_AUTH", lock.images.auth.source), /image lock/u],
    ];
    for (const [mutate, pattern] of cases) {
      const envPath = createRuntimeEnv(directory, { mutate });
      assert.throws(
        () => validateRuntimeEnv({ arch: "arm64", envPath, mode: "rehearsal" }),
        pattern,
      );
    }
  }));

test("runtime validator CLI never prints secret values", () =>
  withTempDirectory((directory) => {
    const sentinel = `NO_OUTPUT_SENTINEL_${randomUUID()}`;
    const envPath = createRuntimeEnv(directory, {
      mutate: (entries) => entries.set("POSTGRES_PASSWORD", sentinel.repeat(2)),
    });
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts/supabase/check-runtime-env.mjs"),
        "--env",
        envPath,
        "--mode",
        "rehearsal",
        "--arch",
        "arm64",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  }));

test("rendered compose accepts exact arm64/amd64 services, platforms, JWT wiring and port", () =>
  withTempDirectory((directory) => {
    const fixture = createUpstreamFixture(directory);
    for (const arch of ["arm64", "amd64"]) {
      const allowedBind = path.join(fixture.stackPath, `allowed-bind-${arch}`);
      writeFileSync(allowedBind, "fixture");
      const configPath = createRenderedConfig(directory, {
        arch,
        mutate: (config) => {
          config.services.db.volumes = [
            { source: allowedBind, target: "/xtrud-fixture", type: "bind" },
          ];
        },
      });
      assert.deepEqual(
        validateRenderedRehearsal(renderedValidationArgs(fixture, arch, configPath)),
        {
          arch,
          images: 11,
          publishedPorts: 1,
        },
      );
    }
  }));

test("rendered compose rejects permissions, symlinks and repository paths", () =>
  withTempDirectory((directory) => {
    const fixture = createUpstreamFixture(directory);
    const insecure = createRenderedConfig(directory, { mode: 0o644 });
    assert.throws(
      () => validateRenderedRehearsal(renderedValidationArgs(fixture, "arm64", insecure)),
      /exact mode 0600/u,
    );
    const valid = createRenderedConfig(directory);
    const link = path.join(directory, "compose-link.json");
    symlinkSync(valid, link);
    assert.throws(
      () => validateRenderedRehearsal(renderedValidationArgs(fixture, "arm64", link)),
      /symlink/u,
    );
    assert.throws(
      () =>
        validateRenderedRehearsal(
          renderedValidationArgs(fixture, "arm64", path.join(root, "package.json")),
        ),
      /outside the repository/u,
    );
  }));

test("rendered compose rejects service, network, privilege, platform and JWT wiring drift", () =>
  withTempDirectory((directory) => {
    const fixture = createUpstreamFixture(directory);
    const cases = [
      [
        (config) => {
          config.services.injected = { image: "alpine:latest", platform: "linux/arm64" };
        },
        /service set/u,
      ],
      [(config) => (config.services.supavisor.network_mode = "host"), /host networking/u],
      [(config) => (config.services.supavisor.pid = "host"), /host PID|pid/u],
      [(config) => (config.services.supavisor.ipc = "host"), /host IPC|IPC/u],
      [(config) => (config.services.db.privileged = true), /privileged/u],
      [(config) => (config.services.db.cap_add = ["SYS_ADMIN"]), /capabilities/u],
      [(config) => (config.services.db.devices = ["/dev/disk0"]), /host devices/u],
      [(config) => (config.services.db.security_opt = ["seccomp=unconfined"]), /security/u],
      [(config) => (config.services.db.user = "0:0"), /root/u],
      [(config) => (config.services.db.volumes = ["/etc:/host:rw"]), /stack root/u],
      [(config) => (config.services.auth.platform = "linux/amd64"), /platform/u],
      [(config) => delete config.services.storage.environment.JWT_JWKS, /JWT_JWKS/u],
      [(config) => (config.services.functions.environment.VERIFY_JWT = "true"), /VERIFY_JWT/u],
    ];
    for (const [mutate, pattern] of cases) {
      const configPath = createRenderedConfig(directory, { mutate });
      assert.throws(
        () => validateRenderedRehearsal(renderedValidationArgs(fixture, "arm64", configPath)),
        pattern,
      );
    }
  }));

test("rendered compose rejects exposed ports, mutable images and production domains", () =>
  withTempDirectory((directory) => {
    const fixture = createUpstreamFixture(directory);
    const cases = [
      [
        (config) => {
          config.services.supavisor.ports = [
            { host_ip: "0.0.0.0", protocol: "tcp", published: 5432, target: 5432 },
          ];
        },
        /exactly one host port/u,
      ],
      [(config) => (config.services.auth.image = lock.images.auth.source), /digest lock/u],
      [
        (config) => (config.services.auth.environment.SITE_URL = "https://xtrud.pro"),
        /production domain/u,
      ],
    ];
    for (const [mutate, pattern] of cases) {
      const configPath = createRenderedConfig(directory, { mutate });
      assert.throws(
        () => validateRenderedRehearsal(renderedValidationArgs(fixture, "arm64", configPath)),
        pattern,
      );
    }
  }));

test("upstream snapshot accepts exact Git checkout, manifest, copied lock and compose sources", () =>
  withTempDirectory((directory) => {
    const fixture = createUpstreamFixture(directory);
    const composeResult = validateUpstreamCompose({
      commitPath: fixture.commitPath,
      composePath: fixture.checkoutComposePath,
      dockerTreePath: fixture.dockerTreePath,
      imageLockPath: fixture.imageLockPath,
      versionPath: fixture.versionPath,
    });
    assert.equal(composeResult.images, 11);
    const result = validateFixture(fixture);
    assert.equal(result.tag, fixture.tag);
    assert.equal(result.commit, fixture.commit);
    assert.equal(result.dockerTree, fixture.dockerTree);
    assert.equal(result.images, 11);
    assert.match(result.composeSha256, /^[0-9a-f]{64}$/u);
  }));

test("upstream snapshot rejects pin, image-lock and manifest drift", () =>
  withTempDirectory((directory) => {
    const cases = [
      (fixture) => writeFileSync(fixture.commitPath, `${"0".repeat(40)}\n`),
      (fixture) => writeFileSync(fixture.dockerTreePath, `${"1".repeat(40)}\n`),
      (fixture) => writeFileSync(fixture.versionPath, "self-hosted/v-other\n"),
      (fixture) => {
        fixture.lock.upstream.commit = "2".repeat(40);
      },
      (fixture) => {
        fixture.lock.images.auth.arm64 = fixture.lock.images.auth.source;
      },
      (fixture) => {
        fixture.lock.images.auth = { ...fixture.lock.images.studio };
      },
      (fixture) => {
        const changed = "example.invalid/auth:v1";
        fixture.lock.images.auth.source = changed;
        fixture.lock.images.auth.amd64 = `${changed}@sha256:${"3".repeat(64)}`;
        fixture.lock.images.auth.arm64 = `${changed}@sha256:${"4".repeat(64)}`;
      },
    ];
    for (const mutate of cases) {
      const fixture = createUpstreamFixture(directory, mutate);
      assert.throws(() => validateFixture(fixture));
    }
    const manifest = createUpstreamFixture(directory);
    const manifestJson = JSON.parse(readFileSync(manifest.manifestPath, "utf8"));
    manifestJson.runnable = true;
    writeFileSync(manifest.manifestPath, `${JSON.stringify(manifestJson)}\n`);
    assert.throws(() => validateFixture(manifest), /manifest/u);
  }));

test("upstream snapshot rejects tampered or symlinked compose and copied lock", () =>
  withTempDirectory((directory) => {
    const extraService = createUpstreamFixture(directory);
    writeFileSync(
      extraService.checkoutComposePath,
      `${readFileSync(extraService.checkoutComposePath, "utf8")}  injected:\n    build: .\n`,
    );
    assert.throws(
      () =>
        validateUpstreamCompose({
          commitPath: extraService.commitPath,
          composePath: extraService.checkoutComposePath,
          dockerTreePath: extraService.dockerTreePath,
          imageLockPath: extraService.imageLockPath,
          versionPath: extraService.versionPath,
        }),
      /upstream compose services/u,
    );
    const checkoutDrift = createUpstreamFixture(directory);
    writeFileSync(checkoutDrift.checkoutComposePath, "services: {}\n");
    assert.throws(() => validateFixture(checkoutDrift), /byte-match/u);
    const stackDrift = createUpstreamFixture(directory);
    writeFileSync(stackDrift.stackComposePath, "services: {}\n");
    assert.throws(() => validateFixture(stackDrift), /byte-match/u);
    const copiedLockDrift = createUpstreamFixture(directory);
    writeFileSync(copiedLockDrift.stackLockPath, "{}\n");
    assert.throws(() => validateFixture(copiedLockDrift), /byte-match/u);
    const copiedOverlayDrift = createUpstreamFixture(directory);
    writeFileSync(copiedOverlayDrift.stackOverlayPath, "services:\n  injected: {}\n");
    assert.throws(() => validateFixture(copiedOverlayDrift), /overlay.*byte-match/u);
    const symlinked = createUpstreamFixture(directory);
    unlinkSync(symlinked.stackComposePath);
    symlinkSync(symlinked.checkoutComposePath, symlinked.stackComposePath);
    assert.throws(() => validateFixture(symlinked), /symlink/u);
  }));

function createFakeGit(directory) {
  const binDirectory = path.join(directory, "fake-bin");
  const marker = path.join(directory, "git-called");
  mkdirSync(binDirectory, { mode: 0o700 });
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
  return { binDirectory, marker };
}

function createBootstrapEnvironment(directory, marker, binDirectory) {
  const composePath = path.join(directory, "fake-upstream-compose.yml");
  writeFileSync(
    composePath,
    `services:\n${Object.entries(lock.images)
      .map(([service, image]) => `  ${service}:\n    image: ${image.source}`)
      .join("\n")}\n`,
  );
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

test("bootstrap script has valid Bash syntax and prepares one dedicated external snapshot", () =>
  withTempDirectory((directory) => {
    assert.equal(spawnSync("bash", ["-n", prepareScript]).status, 0);
    const { binDirectory, marker } = createFakeGit(directory);
    const env = createBootstrapEnvironment(directory, marker, binDirectory);
    const destination = `/private/tmp/xtrud-exact-stack.${randomUUID()}`;
    try {
      const result = spawnSync("bash", [prepareScript, destination], {
        encoding: "utf8",
        env,
        timeout: 10_000,
      });
      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
      assert.equal(existsSync(marker), true);
      assert.equal(existsSync(path.join(destination, "manifest.json")), true);
      assert.equal(existsSync(path.join(destination, "stack/docker-compose.yml")), true);
      assert.equal(existsSync(`${destination}.partial`), false);
    } finally {
      rmSync(destination, { force: true, recursive: true });
      rmSync(`${destination}.partial`, { force: true, recursive: true });
    }
  }));

test("bootstrap rejects traversal and symlink-parent destinations before Git or cleanup", () =>
  withTempDirectory((directory) => {
    const { binDirectory, marker } = createFakeGit(directory);
    const env = createBootstrapEnvironment(directory, marker, binDirectory);
    const id = randomUUID();
    const prefix = `/private/tmp/xtrud-exact-stack.${id}`;
    const escaped = `/private/tmp/xtrud-escape.${id}`;
    mkdirSync(prefix, { mode: 0o700 });
    try {
      const traversal = `${prefix}/../${path.basename(escaped)}`;
      const result = spawnSync("bash", [prepareScript, traversal], {
        encoding: "utf8",
        env,
        timeout: 10_000,
      });
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(marker), false, "invalid destination reached git");
      assert.equal(existsSync(escaped), false);
      assert.equal(existsSync(`${escaped}.partial`), false);
      const realParent = path.join(directory, "real-parent");
      mkdirSync(realParent, { mode: 0o700 });
      const linkedPrefix = `/private/tmp/xtrud-exact-stack.${randomUUID()}`;
      symlinkSync(realParent, linkedPrefix);
      try {
        const linkedResult = spawnSync("bash", [prepareScript, `${linkedPrefix}/child`], {
          encoding: "utf8",
          env,
          timeout: 10_000,
        });
        assert.notEqual(linkedResult.status, 0);
        assert.equal(existsSync(marker), false, "symlink-parent destination reached git");
        assert.equal(existsSync(path.join(realParent, "child")), false);
      } finally {
        unlinkSync(linkedPrefix);
      }
    } finally {
      rmSync(prefix, { force: true, recursive: true });
      rmSync(escaped, { force: true, recursive: true });
      rmSync(`${escaped}.partial`, { force: true, recursive: true });
    }
  }));
