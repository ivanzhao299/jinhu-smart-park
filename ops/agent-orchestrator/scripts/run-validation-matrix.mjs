#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { changedFilesAgainst } from "./lib/git-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(dirname(scriptDir)));

function parseArgs(argv) {
  return {
    plan: argv.includes("--plan") || argv.includes("--dry-run")
  };
}

function runCommand(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const commands = [
  ["node", ["ops/agent-orchestrator/scripts/check-dispatch-status.mjs"]],
  ["node", ["ops/agent-orchestrator/scripts/audit-all-results.mjs", "--dry-run"]],
  ["pnpm", ["typecheck"]]
];

const changedFiles = new Set([
  ...changedFilesAgainst(repoRoot, "origin/main", "HEAD"),
  ...spawnSync("git", ["-C", repoRoot, "diff", "--name-only"], { encoding: "utf8" })
    .stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
]);

if (changedFiles.has("scripts/e2e/s5b-emergency-permit-smoke.mjs")) {
  commands.push(["node", ["scripts/e2e/s5b-emergency-permit-smoke.mjs"]]);
}

console.log(`# Validation Matrix ${args.plan ? "plan" : "run"}`);
console.log("");
for (const [command, commandArgs] of commands) {
  console.log(`- ${[command, ...commandArgs].join(" ")}`);
}

if (args.plan) {
  console.log("");
  console.log("Plan mode: commands were not executed.");
  process.exit(0);
}

console.log("");
for (const [command, commandArgs] of commands) {
  runCommand(command, commandArgs);
}
