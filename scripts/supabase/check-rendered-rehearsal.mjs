#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateUpstreamSnapshot } from "./check-upstream-snapshot.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const imageLockPath = resolve(root, "infra/supabase/image-digests.json");

function normalizePort(port) {
  if (typeof port === "string") {
    const match = /^(?:(127\.0\.0\.1):)?(\d+):(\d+)(?:\/(tcp|udp))?$/u.exec(port);
    if (!match) return null;
    return {
      hostIp: match[1] ?? "0.0.0.0",
      published: Number(match[2]),
      target: Number(match[3]),
      protocol: match[4] ?? "tcp",
    };
  }
  if (!port || typeof port !== "object") return null;
  return {
    hostIp: port.host_ip ?? port.hostIp ?? "0.0.0.0",
    published: Number(port.published),
    target: Number(port.target),
    protocol: port.protocol ?? "tcp",
  };
}

function validateServiceVolumes(service, volumes, stackRoot) {
  for (const volume of volumes ?? []) {
    if (typeof volume === "string") {
      const [source, target] = volume.split(":");
      if (!target) continue;
      if (!isAbsolute(source)) {
        if (source.startsWith(".")) {
          throw new Error(`${service} contains an unresolved relative bind mount`);
        }
        continue;
      }
      const resolvedSource = realpathSync(source);
      if (!resolvedSource.startsWith(`${stackRoot}/`)) {
        throw new Error(`${service} bind mount escapes the exact stack root`);
      }
      continue;
    }
    if (!volume || typeof volume !== "object") {
      throw new Error(`${service} contains an unreadable volume definition`);
    }
    if (volume.type === "volume" || volume.type === "tmpfs") continue;
    if (volume.type !== "bind" || !isAbsolute(volume.source ?? "")) {
      throw new Error(`${service} contains an unexpected volume type`);
    }
    const resolvedSource = realpathSync(volume.source);
    if (!resolvedSource.startsWith(`${stackRoot}/`)) {
      throw new Error(`${service} bind mount escapes the exact stack root`);
    }
  }
}

export function validateRenderedRehearsal({
  configPath,
  arch,
  snapshotPath,
  snapshotValidation = {},
}) {
  if (typeof configPath !== "string" || !isAbsolute(configPath)) {
    throw new Error("rendered compose path must be absolute");
  }
  if (!new Set(["amd64", "arm64"]).has(arch)) throw new Error("arch must be amd64 or arm64");
  validateUpstreamSnapshot({ snapshotPath, ...snapshotValidation });
  const resolvedStackRoot = realpathSync(resolve(snapshotPath, "stack"));

  const linkMetadata = lstatSync(configPath);
  if (linkMetadata.isSymbolicLink()) throw new Error("rendered compose must not be a symlink");
  const resolvedConfigPath = realpathSync(configPath);
  if (resolvedConfigPath === root || resolvedConfigPath.startsWith(`${root}/`)) {
    throw new Error("rendered compose must be outside the repository");
  }
  const metadata = statSync(resolvedConfigPath);
  if (!metadata.isFile()) throw new Error("rendered compose must be a regular file");
  if ((metadata.mode & 0o777) !== 0o600)
    throw new Error("rendered compose must have exact mode 0600");

  const config = JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
  const services = config.services ?? {};
  const lock = JSON.parse(readFileSync(imageLockPath, "utf8"));
  const expectedServices = Object.keys(lock.images ?? {}).sort();
  const actualServices = Object.keys(services).sort();
  if (JSON.stringify(actualServices) !== JSON.stringify(expectedServices)) {
    throw new Error("rendered compose service set does not exactly match the image lock");
  }

  for (const service of expectedServices) {
    const expectedImage = lock.images[service]?.[arch];
    if (services[service].image !== expectedImage) {
      throw new Error(`${service} image does not match the ${arch} digest lock`);
    }
    if (services[service].platform !== `linux/${arch}`) {
      throw new Error(`${service} platform does not match linux/${arch}`);
    }
    if (services[service].network_mode === "host") {
      throw new Error(`${service} must not use host networking`);
    }
    if (services[service].pid === "host" || services[service].ipc === "host") {
      throw new Error(`${service} must not share the host PID or IPC namespace`);
    }
    if (services[service].privileged === true) {
      throw new Error(`${service} must not run privileged`);
    }
    if ((services[service].cap_add ?? []).length > 0) {
      throw new Error(`${service} must not add Linux capabilities`);
    }
    if ((services[service].devices ?? []).length > 0) {
      throw new Error(`${service} must not expose host devices`);
    }
    if ((services[service].security_opt ?? []).some((option) => /unconfined/u.test(option))) {
      throw new Error(`${service} must not disable container security profiles`);
    }
    if (/^(?:0|root)(?::|$)/u.test(String(services[service].user ?? ""))) {
      throw new Error(`${service} must not explicitly run as root`);
    }
    if (services[service].cgroup === "host" || services[service].uts === "host") {
      throw new Error(`${service} must not share host cgroup or UTS namespaces`);
    }
    validateServiceVolumes(service, services[service].volumes, resolvedStackRoot);
  }

  const requiredJwtEnv = [
    ["auth", "GOTRUE_JWT_KEYS"],
    ["realtime", "API_JWT_JWKS"],
    ["storage", "JWT_JWKS"],
    ["functions", "SUPABASE_JWKS"],
  ];
  for (const [service, name] of requiredJwtEnv) {
    const value = services[service].environment?.[name];
    if (!value || /^<[^>]+>$/u.test(String(value))) {
      throw new Error(`${service} is missing required ${name} wiring`);
    }
  }
  if (String(services.functions.environment?.VERIFY_JWT) !== "false") {
    throw new Error("functions VERIFY_JWT must be false for route-specific xtrud authorization");
  }

  const published = [];
  for (const [service, definition] of Object.entries(services)) {
    for (const rawPort of definition.ports ?? []) {
      const port = normalizePort(rawPort);
      if (!port) throw new Error(`${service} has an unreadable published port`);
      published.push({ service, ...port });
    }
  }
  if (published.length !== 1) throw new Error("rehearsal must publish exactly one host port");
  const gateway = published[0];
  if (
    gateway.service !== "api-gw" ||
    gateway.hostIp !== "127.0.0.1" ||
    gateway.published !== 18000 ||
    gateway.target !== 8000 ||
    gateway.protocol !== "tcp"
  ) {
    throw new Error("only api-gw 127.0.0.1:18000 -> 8000/tcp may be published");
  }

  const serialized = JSON.stringify(config);
  if (
    /api\.xtrud\.pro|https:\/\/xtrud\.pro|alanbani\.ru|wgeimsajvjkzrrnfrnkb\.supabase\.co|62\.113\.106\.30/u.test(
      serialized,
    )
  ) {
    throw new Error("rendered rehearsal config references a production domain");
  }
  if (/0\.0\.0\.0:5432|0\.0\.0\.0:6543/u.test(serialized)) {
    throw new Error("rendered rehearsal config exposes a database port");
  }

  return { arch, images: expectedServices.length, publishedPorts: published.length };
}

function readCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
  return {
    arch: args.get("--arch"),
    configPath: args.get("--config"),
    snapshotPath: args.get("--snapshot"),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = validateRenderedRehearsal(readCliArgs(process.argv.slice(2)));
    console.log(
      `Supabase rendered rehearsal passed: arch=${result.arch}, images=${result.images}, publishedPorts=${result.publishedPorts}.`,
    );
  } catch (error) {
    console.error(`Supabase rendered rehearsal FAILED: ${error.message}`);
    process.exit(1);
  }
}
