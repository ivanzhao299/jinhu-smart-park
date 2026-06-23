#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { appendIntegrationEvent, listAllTaskEvents } from "./lib/event-store-utils.mjs";
import {
  readConflictMetrics,
  recordConflictMetric,
  summarizeConflictMetrics
} from "./lib/conflict-metrics-utils.mjs";
import {
  QUEUE_CONFLICT_FILES,
  git,
  getIntegrationCandidatesAgainstLocalMain,
  repoStatus,
  run
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson,
  taskById
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
const EVENT_TASKS_PATH = "ops/agent-orchestrator/events/tasks";
const CONFLICT_METRICS_PATH = "ops/agent-orchestrator/evolution/conflict-metrics.json";

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

function collectCandidates(agents, mainPath) {
  return getIntegrationCandidatesAgainstLocalMain(agents, mainPath).sort(sortCandidates);
}

function printCandidates(candidates) {
  if (candidates.length === 0) {
    console.log("No agent branches contain commits not in local main.");
    return;
  }

  for (const candidate of candidates) {
    console.log(`## ${candidate.agent.id} (${candidate.risk})`);
    console.log(`branch: ${candidate.agent.branch}`);
    console.log(`baseline: ${candidate.baseline} ${candidate.baselineHead.slice(0, 12)}`);
    console.log(`agent head: ${candidate.agentHead.slice(0, 12)}`);
    console.log(`origin/main ahead/behind hint: ahead=${candidate.remote.ahead ?? "unknown"} behind=${candidate.remote.behind ?? "unknown"}`);
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

function taskIdsFromCandidateFiles(candidate) {
  const taskIds = new Set();
  for (const file of candidate.files ?? []) {
    const resultMatch = /^ops\/agent-orchestrator\/results\/([^/]+)\.json$/.exec(file);
    if (resultMatch) taskIds.add(resultMatch[1]);
    const eventMatch = /^ops\/agent-orchestrator\/events\/tasks\/([^/]+)\//.exec(file);
    if (eventMatch) taskIds.add(eventMatch[1]);
  }
  return [...taskIds];
}

function isApprovedExternalProposalTask(task) {
  return Boolean(
    task
    && task.approval_source === "anksen-agent-studio"
    && task.external_proposal_ref
    && task.requires_human_approval === true
  );
}

function highRiskCandidateIsApproved(candidate, tasks) {
  if (candidate.risk !== "HIGH") return true;
  const taskIds = taskIdsFromCandidateFiles(candidate);
  return taskIds.length > 0 && taskIds.every((taskId) => isApprovedExternalProposalTask(tasks.get(taskId)));
}

function assertApplyPreconditions({ mainPath, candidates, tasks }) {
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
    if (candidate.risk === "HIGH" && !highRiskCandidateIsApproved(candidate, tasks)) {
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

function reconcileQueue(mainPath, message, options = {}, stats = null) {
  const args = [
    "--apply",
    "--from-events",
    "--source",
    options.source ?? "integrate-agent-results.mjs",
    "--reason",
    options.reason ?? "reconciled queue after agent integration"
  ];
  if (options.integrationBranch) {
    args.push("--integration-branch", options.integrationBranch);
  }
  runNodeScript("ops/agent-orchestrator/scripts/reconcile-task-results.mjs", args);
  if (stats) {
    stats.read_model_rebuild_count += 1;
  }
  const committed = addAndCommitIfChanged(mainPath, [...QUEUE_PATHS, EVENT_TASKS_PATH, CONFLICT_METRICS_PATH], message);
  console.log(committed ? `Committed queue reconciliation: ${message}` : "Queue reconciliation produced no commit.");
}

function restoreQueueReadModelsFromHead(mainPath) {
  const changed = QUEUE_PATHS.filter((file) =>
    git(mainPath, ["diff", "--quiet", "HEAD", "--", file], { allowFailure: true }).status !== 0
  );

  if (changed.length === 0) {
    return [];
  }

  for (const file of changed) {
    git(mainPath, ["checkout", "HEAD", "--", file], { stdio: "inherit" });
    git(mainPath, ["add", "--", file], { stdio: "inherit" });
  }

  return changed;
}

function stagedOrMergeChangesExist(mainPath) {
  return git(mainPath, ["diff", "--cached", "--quiet"], { allowFailure: true }).status !== 0;
}

function handleQueueConflicts(mainPath, candidate, conflicts, integrationBranch, stats) {
  for (const file of conflicts) {
    git(mainPath, ["checkout", "--ours", file], { stdio: "inherit" });
    git(mainPath, ["add", file], { stdio: "inherit" });
  }

  git(mainPath, ["commit", "--no-edit"], { stdio: "inherit" });
  reconcileQueue(mainPath, `chore(orchestrator): reconcile queue after ${candidate.agent.id} integration`, {
    source: "integration_reconcile",
    reason: `queue bookkeeping conflict after ${candidate.agent.id} integration`,
    integrationBranch
  }, stats);
}

async function mergeCandidate(mainPath, candidate, integrationBranch, stats) {
  console.log(`MERGE ${candidate.agent.id}: ${candidate.agent.branch}`);
  const result = run("git", ["merge", "--no-ff", "--no-commit", candidate.agent.branch], {
    cwd: mainPath,
    allowFailure: true,
    stdio: "inherit"
  });

  if (result.status === 0) {
    const restoredQueueFiles = restoreQueueReadModelsFromHead(mainPath);
    if (restoredQueueFiles.length > 0) {
      stats.conflict_avoided_count += restoredQueueFiles.length;
      stats.restored_queue_files.push(...restoredQueueFiles.map((file) => ({
        agent: candidate.agent.id,
        file,
        reason: "queue read model restored before merge commit"
      })));
      await recordConflictMetric("conflict_avoided", {
        source: "integrate-agent-results.mjs",
        branch: integrationBranch,
        agent: candidate.agent.id,
        files: restoredQueueFiles,
        count: restoredQueueFiles.length,
        reason: "queue read model files restored from integration branch before merge commit",
        metadata: {
          agent_branch: candidate.agent.branch,
          agent_head: candidate.agentHead,
          read_model_only: true
        }
      });
    }

    if (!stagedOrMergeChangesExist(mainPath)) {
      run("git", ["merge", "--abort"], { cwd: mainPath, allowFailure: true, stdio: "inherit" });
      console.log(`MERGE_SKIPPED_EMPTY ${candidate.agent.id}: only generated queue read models differed.`);
      return {
        conflict: false,
        merge_commit: git(mainPath, ["rev-parse", "HEAD"]).stdout.trim(),
        restored_queue_files: restoredQueueFiles,
        skipped_empty: true
      };
    }

    git(mainPath, ["commit", "--no-edit"], { stdio: "inherit" });
    console.log(`MERGE_OK ${candidate.agent.id}`);
    printGitStatus(mainPath);
    return {
      conflict: false,
      merge_commit: git(mainPath, ["rev-parse", "HEAD"]).stdout.trim(),
      restored_queue_files: restoredQueueFiles
    };
  }

  const conflicts = unmergedConflicts(mainPath);
  const queueOnly = conflicts.length > 0 && conflicts.every((file) => QUEUE_CONFLICT_FILES.has(file));

  if (!queueOnly) {
    run("git", ["merge", "--abort"], { cwd: mainPath, allowFailure: true, stdio: "inherit" });
    await recordConflictMetric("integration_conflict", {
      source: "integrate-agent-results.mjs",
      branch: integrationBranch,
      agent: candidate.agent.id,
      files: conflicts,
      count: Math.max(conflicts.length, 1),
      reason: "non-bookkeeping merge conflict during agent integration",
      metadata: {
        agent_branch: candidate.agent.branch,
        agent_head: candidate.agentHead
      }
    });
    throw new Error(`Non-bookkeeping conflicts while merging ${candidate.agent.id}: ${conflicts.join(", ") || "(unknown conflicts)"}`);
  }

  console.log(`QUEUE_CONFLICT ${candidate.agent.id}: ${conflicts.join(", ")}`);
  console.log("Keeping temporary generated queue files to complete the merge, then reconciling from task events.");
  stats.queue_conflict_count += conflicts.length;
  stats.conflict_avoided_count += conflicts.length;
  stats.restored_queue_files.push(...conflicts.map((file) => ({
    agent: candidate.agent.id,
    file,
    reason: "queue conflict resolved by restoring integration branch read model"
  })));
  await recordConflictMetric("queue_conflict", {
    source: "integrate-agent-results.mjs",
    branch: integrationBranch,
    agent: candidate.agent.id,
    files: conflicts,
    count: conflicts.length,
    reason: "queue bookkeeping conflict during agent integration",
    metadata: {
      agent_branch: candidate.agent.branch,
      agent_head: candidate.agentHead,
      read_model_only: true
    }
  });
  await recordConflictMetric("conflict_avoided", {
    source: "integrate-agent-results.mjs",
    branch: integrationBranch,
    agent: candidate.agent.id,
    files: conflicts,
    count: conflicts.length,
    reason: "queue bookkeeping conflict handled by event-first read-model rebuild",
    metadata: {
      agent_branch: candidate.agent.branch,
      agent_head: candidate.agentHead,
      read_model_only: true
    }
  });
  handleQueueConflicts(mainPath, candidate, conflicts, integrationBranch, stats);
  printGitStatus(mainPath);
  return {
    conflict: true,
    merge_commit: git(mainPath, ["rev-parse", "HEAD"]).stdout.trim(),
    restored_queue_files: conflicts
  };
}

function runIntegrationValidation() {
  console.log("");
  console.log("## Integration Validation");
  runNodeScript("ops/agent-orchestrator/scripts/check-dispatch-status.mjs");
  runNodeScript("ops/agent-orchestrator/scripts/audit-all-results.mjs", ["--dry-run"]);
  runValidationCommand("pnpm", ["typecheck"]);
}

function renderReport({ generatedAt, integrationBranch, candidates, head, changed, eventRefs, conflictStats, conflictSummary, eventSourceCount }) {
  const rows = candidates.length === 0
    ? "| _none_ | | | |"
    : candidates.map((candidate) =>
      `| ${candidate.agent.id} | ${candidate.risk} | ${candidate.agent.branch} | ${candidate.commits.map((commit) => commit.split(" ")[0]).join(", ")} |`
    ).join("\n");

  const changedLines = changed.length === 0
    ? "- none"
    : changed.map((line) => `- ${line}`).join("\n");
  const eventLines = eventRefs.length === 0
    ? "- none"
    : eventRefs.map((item) => `- ${item.task_id}: ${item.event_type} ${item.path} (${item.written ? "written" : `skipped:${item.reason}`})`).join("\n");
  const restoredQueueLines = conflictStats.restored_queue_files.length === 0
    ? "- none"
    : conflictStats.restored_queue_files.map((item) => `- ${item.agent}: ${item.file} (${item.reason})`).join("\n");

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
- These files are read-model-only compatibility outputs; the event store is the source of truth.
- Integration restores generated queue JSON from the integration branch before merge commits whenever possible.
- \`reconcile-task-results.mjs --from-events --apply\` is then run so the event projection wins and queue, lock, and result JSON are regenerated.
- Non-bookkeeping conflicts stop integration and require human review.

## Conflict Metrics

- event source count: ${eventSourceCount}
- read model rebuild count: ${conflictStats.read_model_rebuild_count}
- conflict avoided count: ${conflictStats.conflict_avoided_count}
- queue conflicts handled: ${conflictStats.queue_conflict_count}
- queue conflict risk after integration: ${conflictSummary.risk}
- read-model-only coverage: ${conflictSummary.read_model_only_coverage.covered}/${conflictSummary.read_model_only_coverage.total}

Restored queue read-model files:

${restoredQueueLines}

## Validation

- node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
- node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
- pnpm typecheck

## Changed Files Versus main

${changedLines}

## Event Refs

${eventLines}

## Release Gate

No push, deploy, production migration, production seed, database reset, cleanup, or production file operation is performed by \`integrate-agent-results.mjs --apply\`.
`;
}

async function writeIntegrationReport({ mainPath, generatedAt, integrationBranch, candidates, eventRefs, conflictStats }) {
  const reportPath = join(reportsDir, `integration-auto-${generatedAt}.md`);
  const reportRelativePath = `ops/agent-orchestrator/reports/integration-auto-${generatedAt}.md`;
  const head = git(mainPath, ["log", "--oneline", "-1"]).stdout.trim();
  const changed = git(mainPath, ["diff", "--name-status", "main...HEAD"]).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const eventSourceCount = (await listAllTaskEvents()).length;
  const conflictSummary = summarizeConflictMetrics(await readConflictMetrics(), {
    eventReadModelConsistent: true,
    candidateQueueRisk: false
  });

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, renderReport({
    generatedAt,
    integrationBranch,
    candidates,
    head,
    changed,
    eventRefs,
    conflictStats,
    conflictSummary,
    eventSourceCount
  }));
  addAndCommitIfChanged(mainPath, [reportRelativePath], `chore(orchestrator): add ${generatedAt} integration report`);
  return reportRelativePath;
}

async function taskIdsFromCandidate(candidate) {
  const taskIds = new Set();
  for (const file of candidate.files ?? []) {
    const resultMatch = /^ops\/agent-orchestrator\/results\/([^/]+)\.json$/.exec(file);
    if (resultMatch) {
      try {
        const result = await readJson(join(repoRoot, file));
        taskIds.add(result.task_id || resultMatch[1]);
      } catch {
        taskIds.add(resultMatch[1]);
      }
      continue;
    }
    const eventMatch = /^ops\/agent-orchestrator\/events\/tasks\/([^/]+)\//.exec(file);
    if (eventMatch) {
      taskIds.add(eventMatch[1]);
      continue;
    }
    const reportMatch = /^ops\/agent-orchestrator\/reports\/([^/]+)\.md$/.exec(file);
    if (reportMatch && !reportMatch[1].startsWith("integration-auto-")) {
      taskIds.add(reportMatch[1]);
    }
  }
  return [...taskIds].sort();
}

async function appendIntegrationEventsForCandidate({ mainPath, candidate, integrationBranch, mergeInfo }) {
  const queue = await readJson(join(orchestratorDir, "queue", "task-queue.json"));
  const tasks = taskById(queue);
  const taskIds = await taskIdsFromCandidate(candidate);
  const refs = [];

  for (const taskId of taskIds) {
    const task = tasks.get(taskId);
    const eventResult = await appendIntegrationEvent({
      task,
      taskId,
      owner: task?.owner ?? candidate.agent.id,
      agentId: candidate.agent.id,
      agentBranch: candidate.agent.branch,
      agentHead: candidate.agentHead,
      integrationBranch,
      mergeCommit: mergeInfo.merge_commit,
      changedFiles: candidate.files,
      source: "integrate-agent-results.mjs"
    });
    refs.push({
      task_id: taskId,
      event_type: "task.integrated",
      path: eventResult.path ? relative(mainPath, eventResult.path) : "",
      written: eventResult.written,
      reason: eventResult.reason
    });
  }

  const paths = refs.filter((item) => item.path).map((item) => item.path);
  if (paths.length > 0) {
    const committed = addAndCommitIfChanged(
      mainPath,
      paths,
      `chore(orchestrator): record ${candidate.agent.id} integration events`
    );
    console.log(committed ? `Committed integration events for ${candidate.agent.id}.` : `Integration events for ${candidate.agent.id} produced no commit.`);
  }

  return refs;
}

const args = parseArgs(process.argv.slice(2));
const config = await readJson(agentsConfigPath);
const mainPath = config.main?.path ?? repoRoot;
const agents = [...normalizeAgentConfig(config).values()];
const candidates = collectCandidates(agents, mainPath);
const approvalQueue = await readJson(join(orchestratorDir, "queue", "task-queue.json"));
const approvalTasks = taskById(approvalQueue);

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

assertApplyPreconditions({ mainPath, candidates, tasks: approvalTasks });

const highRisk = candidates.filter((candidate) => candidate.risk === "HIGH" && !highRiskCandidateIsApproved(candidate, approvalTasks));
if (highRisk.length > 0) {
  throw new Error(`HIGH-risk candidates require human confirmation: ${highRisk.map((candidate) => candidate.agent.id).join(", ")}`);
}

const generatedAt = timestampForBranch();
const integrationBranch = `integration/orchestrator-auto-${generatedAt}`;
const conflictStats = {
  queue_conflict_count: 0,
  integration_conflict_count: 0,
  read_model_rebuild_count: 0,
  conflict_avoided_count: 0,
  restored_queue_files: []
};

run("git", ["checkout", "main"], { cwd: mainPath, stdio: "inherit" });
run("git", ["checkout", "-B", integrationBranch, "HEAD"], { cwd: mainPath, stdio: "inherit" });

const eventRefs = [];
for (const candidate of candidates) {
  const mergeInfo = await mergeCandidate(mainPath, candidate, integrationBranch, conflictStats);
  eventRefs.push(...(await appendIntegrationEventsForCandidate({
    mainPath,
    candidate,
    integrationBranch,
    mergeInfo
  })));
}

reconcileQueue(mainPath, "chore(orchestrator): reconcile queue after agent integration", {
  source: "integration_final_reconcile",
  reason: "final queue reconciliation after agent integration",
  integrationBranch
}, conflictStats);
runIntegrationValidation();
const reportPath = await writeIntegrationReport({ mainPath, generatedAt, integrationBranch, candidates, eventRefs, conflictStats });

const head = git(mainPath, ["log", "--oneline", "-1"]).stdout.trim();
const changed = git(mainPath, ["diff", "--name-status", "main...HEAD"]).stdout.trim();
console.log("");
console.log(`Integration branch: ${currentBranch(mainPath)}`);
console.log(`HEAD: ${head}`);
console.log(`Integration report: ${reportPath}`);
console.log("Changed files versus main:");
console.log(changed || "none");
