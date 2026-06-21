#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentBackupRoot,
  backupAndRemoveRuntimeEntry,
  git,
  repoStatus
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const agentsConfigPath = `${orchestratorDir}/agents.config.json`;
const BACKUP_BASE = "/tmp/jinhu-orchestrator-backup";

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply")
  };
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatEntries(entries) {
  return entries.length === 0 ? "none" : entries.map((entry) => entry.path).join(", ");
}

const args = parseArgs(process.argv.slice(2));
const config = await readJson(agentsConfigPath);
const agents = [...normalizeAgentConfig(config).values()];
const timestamp = timestampForPath();
const statuses = [];

console.log(`# Worktree Reconcile ${args.apply ? "apply" : "dry-run"}`);
console.log("");

for (const agent of agents) {
  const status = repoStatus(agent.path);
  statuses.push({ agent, status });

  console.log(`## ${agent.id}`);
  console.log(`path: ${agent.path}`);
  console.log(`branch: ${status.branch}`);
  console.log(`head: ${status.head}`);
  console.log(`ahead/behind origin/main...HEAD: ${status.behind ?? "?"}\t${status.ahead ?? "?"}`);
  console.log(`included in origin/main: ${status.includedInOriginMain ? "yes" : "no"}`);
  console.log(`runtime dirty: ${formatEntries(status.runtimeDirty)}`);
  console.log(`non-runtime dirty: ${formatEntries(status.nonRuntimeDirty)}`);
  console.log(`planned runtime backup: ${status.runtimeDirty.length > 0 ? agentBackupRoot(BACKUP_BASE, agent.id, timestamp) : "none"}`);
  console.log(`planned reset --hard origin/main: ${status.includedInOriginMain ? "yes" : "no"}`);
  console.log("");
}

const blockers = statuses
  .filter(({ status }) => status.nonRuntimeDirty.length > 0)
  .map(({ agent, status }) => `${agent.id}: ${formatEntries(status.nonRuntimeDirty)}`);

if (blockers.length > 0) {
  console.log("BLOCKED: non-runtime dirty files found.");
  for (const blocker of blockers) {
    console.log(`- ${blocker}`);
  }
  if (args.apply) {
    process.exit(1);
  }
}

if (args.dryRun) {
  console.log("Dry-run: no runtime directories were backed up and no branches were reset.");
  process.exit(0);
}

for (const { agent, status } of statuses) {
  const backupRoot = agentBackupRoot(BACKUP_BASE, agent.id, timestamp);

  if (status.runtimeDirty.length > 0) {
    await mkdir(backupRoot, { recursive: true });
    for (const entry of status.runtimeDirty) {
      const backup = await backupAndRemoveRuntimeEntry(agent.path, entry.path, backupRoot);
      console.log(`BACKED_UP ${agent.id}: ${backup.source} -> ${backup.destination}`);
    }
  }

  if (status.includedInOriginMain) {
    git(agent.path, ["reset", "--hard", "origin/main"]);
    console.log(`RESET ${agent.id}: origin/main`);
  } else {
    console.log(`SKIP_RESET ${agent.id}: branch contains commits not in origin/main`);
  }
}
