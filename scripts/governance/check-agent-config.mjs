/**
 * Защищает Codex entrypoint от повторного превращения в копию CLAUDE.md.
 * Проверяет только governance-слой; продуктовые документы остаются источниками
 * истины и намеренно не копируются в agent adapters.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const errors = [];

function read(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`missing required file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/AGENT_WORKFLOW.md",
  "PROJECT_OPERATIONS.md",
  "STATUS.md",
  ".claude/rules/working-rules.md",
  ".claude/rules/agent-delegation.md",
  ".claude/rules/design-quality.md",
  ".claude/rules/design-enforcement.md",
  "docs/SIMPLE_FLOW.md",
  "PRODUCT_CONTEXT.md",
  "src/lib/product-scope.ts",
  "CATEGORIES_AND_PROFILES.md",
  "UI_PATTERNS.md",
  "DESIGN.md",
  "CROSS_PLATFORM_RULES.md",
  "docs/UI_ICONS.md",
  "src/lib/avatar.ts",
  "README.md",
  "package.json",
];

for (const file of requiredFiles) read(file);

const agents = read("AGENTS.md");
const claude = read("CLAUDE.md");
const readme = read("README.md");
const workflow = read("docs/AGENT_WORKFLOW.md");
const agentLines = agents.split("\n").length;
const claudeLines = claude.split("\n").length;

if (agentLines > 120) {
  errors.push(`AGENTS.md must stay a short adapter (got ${agentLines} lines, max 120)`);
}
if (claudeLines > 80) {
  errors.push(`CLAUDE.md must stay a short adapter (got ${claudeLines} lines, max 80)`);
}
if (!claude.includes("AGENTS.md") || !claude.includes("docs/AGENT_WORKFLOW.md")) {
  errors.push("CLAUDE.md must route through AGENTS.md and docs/AGENT_WORKFLOW.md");
}
if (!readme.includes("[AGENTS.md](AGENTS.md)")) {
  errors.push("README.md must identify AGENTS.md as the AI entrypoint");
}

const forbiddenPathCase = /\.Codex\//;
if (forbiddenPathCase.test(`${agents}\n${workflow}`)) {
  errors.push("use the real lowercase .codex/ path; .Codex/ does not exist");
}

const stalePatterns = [
  [/Geist-шрифт/iu, "Geist as the active project font"],
  [/только\s+[`'*_]*shapes/iu, "DiceBear shapes as avatar fallback"],
  [/shapes\s+для\s+аватар/iu, "DiceBear shapes as avatar fallback"],
  [/DiceBear\s+`?shapes`?/iu, "DiceBear shapes as avatar fallback"],
];

const codexDir = resolve(root, ".codex/agents");
const codexFiles = existsSync(codexDir)
  ? readdirSync(codexDir)
      .filter((name) => name.endsWith(".toml"))
      .sort()
  : [];

if (codexFiles.length === 0) errors.push("no .codex/agents/*.toml adapters found");

for (const filename of codexFiles) {
  const relativePath = `.codex/agents/${filename}`;
  const content = read(relativePath);
  const lines = content.split("\n").length;
  const expectedName = filename.replace(/\.toml$/, "");
  const roleSource = `.claude/agents/${expectedName}.md`;

  if (lines > 60) {
    errors.push(`${relativePath} duplicates role instructions (${lines} lines, max 60)`);
  }
  if (!content.includes(`name = "${expectedName}"`)) {
    errors.push(`${relativePath} has no matching name = "${expectedName}"`);
  }
  if (!content.includes('developer_instructions = """')) {
    errors.push(`${relativePath} has no developer_instructions block`);
  }
  if (!content.includes("AGENTS.md") || !content.includes("docs/AGENT_WORKFLOW.md")) {
    errors.push(`${relativePath} must route through AGENTS.md and docs/AGENT_WORKFLOW.md`);
  }
  if (forbiddenPathCase.test(content)) {
    errors.push(`${relativePath}: use the real lowercase .codex/ path`);
  }
  if (!existsSync(resolve(root, roleSource))) {
    errors.push(`${relativePath} has no tracked role source ${roleSource}`);
  }

  for (const [pattern, label] of stalePatterns) {
    if (pattern.test(content)) errors.push(`${relativePath}: stale rule: ${label}`);
  }
}

for (const [pattern, label] of stalePatterns) {
  if (pattern.test(agents)) errors.push(`AGENTS.md: stale rule: ${label}`);
}

const designGovernanceFiles = [
  ".claude/agents/xtrud-designer.md",
  "UI_PATTERNS.md",
  "docs/UI_ICONS.md",
];

for (const relativePath of designGovernanceFiles) {
  const content = read(relativePath);
  for (const [pattern, label] of stalePatterns) {
    if (pattern.test(content)) errors.push(`${relativePath}: stale rule: ${label}`);
  }
}

const designerSources = [
  read(".codex/agents/xtrud-designer.toml"),
  read(".claude/agents/xtrud-designer.md"),
];
for (const content of designerSources) {
  if (!/системн/iu.test(content) || !content.includes("src/lib/avatar.ts")) {
    errors.push("xtrud designer adapters must route typography and avatars to current sources");
  }
}

if (!agents.includes("docs/AGENT_WORKFLOW.md")) {
  errors.push("AGENTS.md must link docs/AGENT_WORKFLOW.md");
}
if (!workflow.includes("origin/main")) {
  errors.push("docs/AGENT_WORKFLOW.md must define the origin/main release source");
}
if (!workflow.includes("forward-only")) {
  errors.push("docs/AGENT_WORKFLOW.md must define forward-only backend migrations");
}

if (errors.length > 0) {
  console.error("Agent governance check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Agent governance check passed: AGENTS.md ${agentLines} lines, ${codexFiles.length} thin adapters.`,
);
