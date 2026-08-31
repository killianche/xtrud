#!/usr/bin/env node

/**
 * Fail-closed npm advisory gate for the Expo SDK compatibility window.
 * Package names and severities are insufficient: a new advisory can land in
 * an already allowlisted package, so exact sources, URLs and ranges are pinned.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "../..");
const baselinePath = resolve(rootDir, "security/npm-audit-baseline.json");
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function advisoryKey(advisory) {
  return [advisory.source, advisory.url, advisory.package, advisory.severity, advisory.range].join(
    "|",
  );
}

export function normalizeAudit(report) {
  const packages = {};
  const advisoryMap = new Map();
  for (const [name, finding] of Object.entries(report.vulnerabilities ?? {})) {
    packages[name] = { severity: finding.severity, range: finding.range };
    for (const via of finding.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const advisory = {
        source: via.source,
        url: via.url,
        package: via.name,
        severity: via.severity,
        range: via.range,
      };
      advisoryMap.set(advisoryKey(advisory), advisory);
    }
  }
  return {
    packages,
    advisories: [...advisoryMap.values()].sort((a, b) =>
      advisoryKey(a).localeCompare(advisoryKey(b)),
    ),
  };
}

export function evaluateAudit(report, baseline, now = new Date()) {
  const errors = [];
  const schemaValid =
    baseline?.schemaVersion === 1 &&
    baseline.packages &&
    typeof baseline.packages === "object" &&
    !Array.isArray(baseline.packages) &&
    Array.isArray(baseline.advisories);
  if (!schemaValid) {
    return { errors: ["baseline schema must contain schemaVersion=1, packages and advisories"] };
  }

  const reviewDeadline = new Date(`${baseline.reviewBy}T23:59:59Z`);
  if (Number.isNaN(reviewDeadline.getTime()) || now > reviewDeadline) {
    errors.push(`npm audit baseline review expired on ${baseline.reviewBy}`);
  }

  for (const [name, allowed] of Object.entries(baseline.packages)) {
    if (!allowed || !(allowed.severity in severityRank) || typeof allowed.range !== "string") {
      errors.push(`invalid package baseline entry: ${name}`);
    }
  }
  for (const advisory of baseline.advisories) {
    if (
      !advisory ||
      !Number.isInteger(advisory.source) ||
      typeof advisory.url !== "string" ||
      typeof advisory.package !== "string" ||
      !(advisory.severity in severityRank) ||
      typeof advisory.range !== "string"
    ) {
      errors.push("invalid advisory baseline entry");
    }
  }

  const current = normalizeAudit(report);
  for (const [name, finding] of Object.entries(current.packages)) {
    const allowed = baseline.packages[name];
    if (!allowed) {
      errors.push(`${name}: new ${finding.severity} finding`);
      continue;
    }
    if (severityRank[finding.severity] > severityRank[allowed.severity]) {
      errors.push(`${name}: severity increased ${allowed.severity} -> ${finding.severity}`);
    }
    if (finding.range !== allowed.range) {
      errors.push(`${name}: vulnerable range changed; baseline review required`);
    }
    if (finding.severity === "critical") {
      errors.push(`${name}: critical findings are never allowed`);
    }
  }

  const allowedAdvisories = new Set(baseline.advisories.map(advisoryKey));
  const currentAdvisories = new Set(current.advisories.map(advisoryKey));
  for (const advisory of current.advisories) {
    if (!allowedAdvisories.has(advisoryKey(advisory))) {
      errors.push(`${advisory.package}: new advisory ${advisory.url}`);
    }
  }

  return {
    errors,
    activePackages: Object.keys(current.packages).sort(),
    resolvedPackages: Object.keys(baseline.packages)
      .filter((name) => !current.packages[name])
      .sort(),
    resolvedAdvisories: baseline.advisories.filter(
      (advisory) => !currentAdvisories.has(advisoryKey(advisory)),
    ),
  };
}

export function runCli() {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!audit.stdout?.trim()) {
    console.error("npm audit did not return JSON.");
    if (audit.stderr?.trim()) console.error(audit.stderr.trim());
    return 2;
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error("npm audit returned invalid JSON.");
    return 2;
  }
  if (report.error) {
    console.error(`npm audit failed: ${report.error.summary ?? report.error.code ?? "unknown"}`);
    return 2;
  }

  const result = evaluateAudit(report, baseline);
  if (result.errors.length > 0) {
    console.error("npm audit baseline regression:");
    result.errors.forEach((error) => {
      console.error(`- ${error}`);
    });
    return 1;
  }
  console.log(
    `npm audit gate passed: ${result.activePackages.length} reviewed findings, 0 unexpected, review by ${baseline.reviewBy}.`,
  );
  if (result.resolvedPackages.length > 0) {
    console.log(`Resolved packages (remove on review): ${result.resolvedPackages.join(", ")}`);
  }
  if (result.resolvedAdvisories.length > 0) {
    console.log(`Resolved advisories (remove on review): ${result.resolvedAdvisories.length}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
