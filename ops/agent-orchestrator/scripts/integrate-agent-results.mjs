#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUEUE_CONFLICT_FILES,
  changedFilesAgainst,
  changedFilesNameStatus,
  classifyAgentResultRisk,
  commitsNotIn,
  git,
  repoStatus,
  run
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const reportsDir = join(orchestratorDir, "reports");
const AGENT_ORDER = ["agent-2", "agent-3", "agent-4", "agent-5", "agent-1"];
const RISK_RANK = new Map([["LOW", 0], ["MEDIUM", 1], ["HIGH", 2]]);
const QUEUE_PATHS = [
  "ops/agent-orchestrator/queue/task-queue.json",
  "ops/agent-orchestrator/queue/task-locks.json",
  "ops/agent-orchestrator/queue/task-results.json"
];

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

function statusShort(path) {
  return git(path, ["status", "--short"]).stdout.trim();
}

function printGitStatus(path) {
  const status = statusShort(path);
  console.log("git status --short:");
  console.log(status || "clean");
}

function agentOrderRank(agentId) {
  const rank = AGENT_ORDER.indexOf(agentId);
  return rank === -1 ? AGENT_ORDER.length : rank;
}

function sortCandidates(a, b) {
  const byAgent = agentOrderRank(a.agent.id) - agentOrderRank(b.agent.id);
  if (byAgent !== 0) return byAgent;

  const byRisk = RISK_RANK.get(a.risk) - RISK_RANK.get(b.risk);
  if (byRisk !== 0) return byRisk;

  return a.agent.id.localeCompare(b.agent.id);
}

function collectCandidates(agents) {
  const candidates = [];
  for (const agent of agents) {
    const commits = commitsNotIn(agent.path, "origin/main", "HEAD");
    const files = changedFilesAgainst(agent.path, "origin/main", "HEAD");
    if (commits.length === 0) {
      continue;
    }

    candidates.push({
      agent,
      commits,
      files,
      nameStatus: changedFilesNameStatus(agent.path, "origin/main", "HEAD"),
      risk: classifyAgentResultRisk(files)
    });
  }
  return candidates.sort(sortCandidates);
}

function printCandidates(candidates) {
  if (candidates.length === 0) {
    console.log("No agent branches contain commits not in origin/main.");
    return;
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
}

function assertApplyPreconditions({ mainPath, candidates }) {
  const mainStatus = repoStatus(mainPath);
  const failures = [];

  if (mainStatus.branch !== "main") {
    failures.push(`main worktree must be on main before integration apply; current branch is ${mainStatus.branch}`);
  }

  if (!mainStatus.clean) {
    failures.push(`main worktree is not clean: ${mainStatus.statusOutput}`);
  }

  for (const candidate of candidates) {
    const status = repoStatus(candidate.agent.path);
    if (!status.clean) {
      failures.push(`${candidate.agent.id} worktree is not clean: ${status.statusOutput}`);
    }
    if (candidate.risk === "HIGH") {
      failures.push(`${candidate.agent.id} contains HIGH-risk changes and requires human confirmation`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

function runNodeScript(script, args = []) {
  console.log(`$ node ${[script, ...args].join(" ")}`);
  const result = run("node", [script, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    allowFailure: true
  });
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function runValidationCommand(command, args = []) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = run(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    allowFailure: true
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

function commitStagedIfAny(mainPath, message) {
  const diff = git(mainPath, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (diff.status === 0) {
    return false;
  }
  git(mainPath, ["commit", "-m", message], { stdio: "inherit" });
  return true;
}

function addAndCommitIfChanged(mainPath, paths, message) {
  git(mainPath, ["add", "--", ...paths], { stdio: "inherit" });
  return commitStagedIfAny(mainPath, message);
}

function reconcileQueue(mainPath, message) {
  runNodeScript("ops/agent-orchestrator/scripts/reconcile-task-results.mjs", ["--apply"]);
  const committed = addAndCommitIfChanged(mainPath, QUEUE_PATHS, message);
  console.log(committed ? `Committed queue reconciliation: ${message}` : "Queue reconciliation produced no commit.");
}

function handleQueueConflicts(mainPath, candidate, conflicts) {
  for (const file of conflicts) {
    git(mainPath, ["checkout", "--ours", file], { stdio: "inherit" });
    git(mainPath, ["add", file], { stdio: "inherit" });
  }

  git(mainPath, ["commit", "--no-edit"], { stdio: "inherit" });
  reconcileQueue(mainPath, `chore(orchestrator): reconcile queue after ${candidate.agent.id} integration`);
}

function mergeCandidate(mainPath, candidate) {
  console.log(`MERGE ${candidate.agent.id}: ${candidate.agent.branch}`);
  const result = run("git", ["merge", "--no-ff", candidate.agent.branch, "--no-edit"], {
    cwd: mainPath,
    allowFailure: true,
    stdio: "inherit"
  });

  if (result.status === 0) {
    console.log(`MERGE_OK ${candidate.agent.id}`);
    printGitStatus(mainPath);
    return;
  }

  const conflicts = unmergedConflicts(mainPath);
  const queueOnly = conflicts.length > 0 && conflicts.every((file) => QUEUE_CONFLICT_FILES.has(file));

  if (!queueOnly) {
    run("git", ["merge", "--abort"], { cwd: mainPath, allowFailure: true, stdio: "inherit" });
    throw new Error(`Non-bookkeeping conflicts while merging ${candidate.agent.id}: ${conflicts.join(", ") || "(unknown conflicts)"}`);
  }

  console.log(`QUEUE_CONFLICT ${candidate.agent.id}: ${conflicts.join(", ")}`);
  console.log("Keeping integration branch versions for queue bookkeeping files, then reconciling task results.");
  handleQueueConflicts(mainPath, candidate, conflicts);
  printGitStatus(mainPath);
}

function runIntegrationValidation() {
  console.log("");
  console.log("## Integration Validation");
  runNodeScript("ops/agent-orchestrator/scripts/check-dispatch-status.mjs");
  runNodeScript("ops/agent-orchestrator/scripts/audit-all-results.mjs", ["--dry-run"]);
  runValidationCommand("pnpm", ["typecheck"]);
}

function renderReport({ generatedAt, integrationBranch, candidates, head, changed }) {
  const rows = candidates.length === 0
    ? "| _none_ | | | |"
    : candidates.map((candidate) =>
      `| ${candidate.agent.id} | ${candidate.risk} | ${candidate.agent.branch} | ${candidate.commits.map((commit) => commit.split(" ")[0]).join(", ")} |`
    ).join("\n");

  const changedLines = changed.length === 0
    ? "- none"
    : changed.map((line) => `- ${line}`).join("\n");

  return `# Integration Auto Report

Generated at: ${generatedAt}

Integration branch: ${integrationBranch}

HEAD: ${head}

## Agent Merge Summary

| Agent | Risk | Branch | Commits |
|---|---|---|---|
${rows}

## Queue Conflict Policy

- Queue bookkeeping conflicts are limited to:
  - ops/agent-orchestrator/queue/task-queue.json
  - ops/agent-orchestrator/queue/task-locks.json
  - ops/agent-orchestrator/queue/task-results.json
- When these files conflict, the integration branch version is kept first.
- \`reconcile-task-results.mjs --apply\` is then run to rebuild queue, lock, and result state from merged result evidence.
- Non-bookkeeping conflicts stop integration and require human review.

## Validation

- node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
- node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
- pnpm typecheck

## Changed Files Versus main

${changedLines}

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by \`integrate-agent-results.mjs --apply\`.
`;
}

async function writeIntegrationReport({ mainPath, generatedAt, integrationBranch, candidates }) {
  const reportPath = join(reportsDir, `integration-auto-${generatedAt}.md`);
  const reportRelativePath = `ops/agent-orchestrator/reports/integration-auto-${generatedAt}.md`;
  const head = git(mainPath, ["log", "--oneline", "-1"]).stdout.trim();
  const changed = git(mainPath, ["diff", "--name-status", "main...HEAD"]).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, renderReport({ generatedAt, integrationBranch, candidates, head, changed }));
  addAndCommitIfChanged(mainPath, [reportRelativePath], `chore(orchestrator): add ${generatedAt} integration report`);
  return reportRelativePath;
}

const args = parseArgs(process.argv.slice(2));
const config = await readJson(agentsConfigPath);
const mainPath = config.main?.path ?? repoRoot;
const agents = [...normalizeAgentConfig(config).values()];
const candidates = collectCandidates(agents);

console.log(`# Agent Result Integration ${args.apply ? "apply" : "dry-run"}`);
console.log("");
printCandidates(candidates);

if (candidates.length === 0) {
  process.exit(0);
}

if (args.dryRun) {
  console.log("Dry-run: no integration branch was created and no merges were attempted.");
  process.exit(0);
}

assertApplyPreconditions({ mainPath, candidates });

const highRisk = candidates.filter((candidate) => candidate.risk === "HIGH");
if (highRisk.length > 0) {
  throw new Error(`HIGH-risk candidates require human confirmation: ${highRisk.map((candidate) => candidate.agent.id).join(", ")}`);
}

const generatedAt = timestampForBranch();
const integrationBranch = `integration/orchestrator-auto-${generatedAt}`;

run("git", ["checkout", "main"], { cwd: mainPath, stdio: "inherit" });
run("git", ["checkout", "-B", integrationBranch, "HEAD"], { cwd: mainPath, stdio: "inherit" });

for (const candidate of candidates) {
  mergeCandidate(mainPath, candidate);
}

reconcileQueue(mainPath, "chore(orchestrator): reconcile queue after agent integration");
runIntegrationValidation();
const reportPath = await writeIntegrationReport({ mainPath, generatedAt, integrationBranch, candidates });

const head = git(mainPath, ["log", "--oneline", "-1"]).stdout.trim();
const changed = git(mainPath, ["diff", "--name-status", "main...HEAD"]).stdout.trim();
console.log("");
console.log(`Integration branch: ${currentBranch(mainPath)}`);
console.log(`HEAD: ${head}`);
console.log(`Integration report: ${reportPath}`);
console.log("Changed files versus main:");
console.log(changed || "none");
