#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { validateRenderedCompose } from "./check-rendered-compose.mjs";

export function validateRenderedRehearsal(options) {
  const { profile: _profile, ...legacyResult } = validateRenderedCompose({
    ...options,
    profile: "rehearsal",
  });
  return legacyResult;
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
