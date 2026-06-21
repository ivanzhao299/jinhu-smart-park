#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUEUE_CONFLICT_FILES,
  changedFilesAgainst,
  changedFilesNameStatus,
  classifyRisk,
  commitsNotIn,
  git,
  run
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = `${orchestratorDir}/agents.config.json`;
const RISK_RANK = new Map([["LOW", 0], ["MEDIUM", 1], ["HIGH", 2]]);

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply")
  };
}

function timestampForBranch() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function currentBranch(path) {
  return git(path, ["branch", "--show-current"]).stdout.trim();
}

function unmergedConflicts(path) {
  return git(path, ["diff", "--name-only", "--diff-filter=U"], { allowFailure: true })
    .stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasStagedMerge(path) {
  return git(path, ["status", "--short"]).stdout.trim().length > 0;
}

function runNodeScript(script, args = []) {
  const result = spawnSync("node", [script, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(" ")} failed`);
  }
}

const args = parseArgs(process.argv.slice(2));
const config = await readJson(agentsConfigPath);
const mainPath = config.main?.path ?? repoRoot;
const agents = [...normalizeAgentConfig(config).values()];
const candidates = [];

for (const agent of agents) {
  const commits = commitsNotIn(agent.path, "origin/main", "HEAD");
  const files = changedFilesAgainst(agent.path, "origin/main", "HEAD");
  if (commits.length === 0) {
    continue;
  }
  const risk = classifyRisk(files);
  candidates.push({
    agent,
    commits,
    files,
    nameStatus: changedFilesNameStatus(agent.path, "origin/main", "HEAD"),
    risk
  });
}

candidates.sort((a, b) => {
  const byRisk = RISK_RANK.get(a.risk) - RISK_RANK.get(b.risk);
  if (byRisk !== 0) return byRisk;
  return a.agent.id.localeCompare(b.agent.id);
});

console.log(`# Agent Result Integration ${args.apply ? "apply" : "dry-run"}`);
console.log("");

if (candidates.length === 0) {
  console.log("No agent branches contain commits not in origin/main.");
  process.exit(0);
}

for (const candidate of candidates) {
  console.log(`## ${candidate.agent.id} (${candidate.risk})`);
  console.log(`branch: ${candidate.agent.branch}`);
  console.log("commits:");
  for (const commit of candidate.commits) {
    console.log(`- ${commit}`);
  }
  console.log("changed files:");
  for (const file of candidate.nameStatus) {
    console.log(`- ${file}`);
  }
  console.log("");
}

if (args.dryRun) {
  console.log("Dry-run: no integration branch was created and no merges were attempted.");
  process.exit(0);
}

run("git", ["fetch", "origin"], { cwd: mainPath, stdio: "inherit" });
const integrationBranch = `integration/orchestrator-auto-${timestampForBranch()}`;
run("git", ["checkout", "-B", integrationBranch, "origin/main"], { cwd: mainPath, stdio: "inherit" });

for (const candidate of candidates) {
  console.log(`MERGE ${candidate.agent.id}: ${candidate.agent.branch}`);
  const result = run("git", ["merge", "--no-ff", candidate.agent.branch, "--no-edit"], {
    cwd: mainPath,
    allowFailure: true,
    stdio: "inherit"
  });

  if (result.status === 0) {
    continue;
  }

  const conflicts = unmergedConflicts(mainPath);
  const queueOnly = conflicts.length > 0 && conflicts.every((file) => QUEUE_CONFLICT_FILES.has(file));

  if (!queueOnly) {
    run("git", ["merge", "--abort"], { cwd: mainPath, allowFailure: true, stdio: "inherit" });
    throw new Error(`Business or non-queue conflicts while merging ${candidate.agent.id}: ${conflicts.join(", ")}`);
  }

  for (const file of conflicts) {
    run("git", ["checkout", "--ours", file], { cwd: mainPath, stdio: "inherit" });
    run("git", ["add", file], { cwd: mainPath, stdio: "inherit" });
  }

  if (hasStagedMerge(mainPath)) {
    run("git", ["commit", "--no-edit"], { cwd: mainPath, stdio: "inherit" });
  }

  runNodeScript("ops/agent-orchestrator/scripts/reconcile-task-results.mjs", ["--apply"]);
  run("git", ["add", "ops/agent-orchestrator/queue/task-queue.json", "ops/agent-orchestrator/queue/task-locks.json", "ops/agent-orchestrator/queue/task-results.json"], {
    cwd: mainPath,
    stdio: "inherit"
  });
  run("git", ["commit", "-m", `chore(orchestrator): reconcile queue after ${candidate.agent.id} integration`], {
    cwd: mainPath,
    allowFailure: true,
    stdio: "inherit"
  });
}

const head = git(mainPath, ["log", "--oneline", "-1"]).stdout.trim();
const changed = git(mainPath, ["diff", "--name-status", "origin/main...HEAD"]).stdout.trim();
console.log("");
console.log(`Integration branch: ${currentBranch(mainPath)}`);
console.log(`HEAD: ${head}`);
console.log("Changed files versus origin/main:");
console.log(changed || "none");
