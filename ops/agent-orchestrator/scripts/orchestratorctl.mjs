#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  repoStatus
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = `${orchestratorDir}/agents.config.json`;

function usage() {
  console.error(`Usage:
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs status
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs reconcile --dry-run|--apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs integrate --dry-run|--apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs validate
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs full-cycle --dry-run|--apply`);
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function runScript(script, args = []) {
  const result = spawnSync("node", [script, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function formatEntries(entries) {
  return entries.length === 0 ? "none" : entries.map((entry) => `${entry.code} ${entry.path}`).join("; ");
}

async function statusCommand() {
  const config = await readJson(agentsConfigPath);
  const repos = [
    { id: "main", ...(config.main ?? { path: repoRoot }) },
    ...normalizeAgentConfig(config).values()
  ];

  console.log("# Orchestrator Status");
  console.log("");

  for (const repo of repos) {
    const status = repoStatus(repo.path);
    console.log(`## ${repo.id ?? repo.name}`);
    console.log(`path: ${repo.path}`);
    console.log(`branch: ${status.branch}`);
    console.log(`head: ${status.head}`);
    console.log(`clean: ${status.clean ? "yes" : "no"}`);
    console.log(`ahead/behind origin/main...HEAD: ${status.behind ?? "?"}\t${status.ahead ?? "?"}`);
    console.log(`runtime dirty: ${formatEntries(status.runtimeDirty)}`);
    console.log(`non-runtime dirty: ${formatEntries(status.nonRuntimeDirty)}`);
    console.log("");
  }
}

const argv = process.argv.slice(2);
const command = argv[0];
const rest = argv.slice(1);

switch (command) {
  case "status":
    await statusCommand();
    break;
  case "reconcile":
    runScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", [
      hasFlag(rest, "--apply") ? "--apply" : "--dry-run"
    ]);
    break;
  case "integrate":
    runScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", [
      hasFlag(rest, "--apply") ? "--apply" : "--dry-run"
    ]);
    break;
  case "validate":
    runScript("ops/agent-orchestrator/scripts/run-validation-matrix.mjs");
    break;
  case "full-cycle": {
    const apply = hasFlag(rest, "--apply");
    await statusCommand();
    runScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", [apply ? "--apply" : "--dry-run"]);
    runScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", [apply ? "--apply" : "--dry-run"]);
    runScript("ops/agent-orchestrator/scripts/run-validation-matrix.mjs", [apply ? "" : "--plan"].filter(Boolean));
    if (apply) {
      console.log("");
      console.log("Full cycle completed. If validation passed, you may consider manual merge to main / push after human review.");
    }
    break;
  }
  default:
    usage();
    process.exit(1);
}
