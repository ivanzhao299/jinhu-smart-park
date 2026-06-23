#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeResultsByTask,
  nowIso,
  readJson,
  readResultFiles,
  writeJson
} from "./lib/queue-utils.mjs";
import {
  appendCompletionBackfillEvent,
  appendReconciledEvent,
  buildLockReadModel,
  buildQueueReadModel,
  buildResultReadModel,
  EVENT_STORE_PATHS,
  listAllTaskEvents,
  writeCompatibilityReadModels
} from "./lib/event-store-utils.mjs";
import { recordConflictMetric } from "./lib/conflict-metrics-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const aggregateResultsPath = join(orchestratorDir, "queue", "task-results.json");
const perTaskResultsDir = join(orchestratorDir, "results");
const reportsDir = join(orchestratorDir, "reports");
const perTaskResultsRelativeDir = "ops/agent-orchestrator/results";
const reportsRelativeDir = "ops/agent-orchestrator/reports";

const EVIDENCE_RULES = new Map([
  ["TRIAL-20260621-001-A2-FINANCE", {
    agent: "agent-2",
    commit_hash: "31cbe93",
    changed_files: ["docs/release/trial-launch-finance-readiness-evidence-2026-06-21.md"],
    evidence_files: ["docs/release/trial-launch-finance-readiness-evidence-2026-06-21.md"],
    notes: "Finance readiness evidence exists. Preserve detailed command/check evidence from task-results.json or per-task result files when available."
  }],
  ["TRIAL-20260621-001-A3-IOT-SAFETY", {
    agent: "agent-3",
    commit_hash: "00cb697",
    changed_files: [
      "docs/release/trial-launch-agent-3-safety-iot-energy-evidence.md",
      "scripts/e2e/s5b-emergency-permit-smoke.mjs"
    ],
    evidence_files: [
      "docs/release/trial-launch-agent-3-safety-iot-energy-evidence.md",
      "scripts/e2e/s5b-emergency-permit-smoke.mjs"
    ],
    failed_checks: [
      "node scripts/e2e/safety-module-access-smoke.mjs",
      "SAFETY_SMOKE_* node scripts/e2e/safety-module-access-smoke.mjs"
    ],
    notes: "Safety/IoT evidence exists; safety module access matrix remains blocked by NORMAL menu missing /operations/terminal."
  }],
  ["TRIAL-20260621-001-A4-RBAC-MENU", {
    agent: "agent-4",
    commit_hash: "8261c20",
    changed_files: [
      "ops/agent-orchestrator/reports/TRIAL-20260621-001-A4-RBAC-MENU.md",
      "ops/agent-orchestrator/reports/TRIAL-20260621-001-A4-RBAC-MENU-result.json"
    ],
    evidence_files: [
      "ops/agent-orchestrator/reports/TRIAL-20260621-001-A4-RBAC-MENU.md",
      "ops/agent-orchestrator/reports/TRIAL-20260621-001-A4-RBAC-MENU-result.json"
    ],
    notes: "RBAC/menu evidence exists. Production browser sampling remains a human-approved follow-up."
  }],
  ["TRIAL-20260621-001-A5-GATES", {
    agent: "agent-5",
    commit_hash: "fedf4bd",
    changed_files: [
      "docs/release/production-readiness-dry-run-report.md",
      "docs/release/trial-launch-engineering-gates-auth-readiness.md"
    ],
    evidence_files: [
      "docs/release/production-readiness-dry-run-report.md",
      "docs/release/trial-launch-engineering-gates-auth-readiness.md"
    ],
    failed_checks: [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm build",
      "node scripts/e2e/first-release-auth-health.mjs"
    ],
    notes: "Engineering/auth evidence exists and records No-Go gate findings."
  }],
  ["TRIAL-20260621-001-A5-ROLLBACK", {
    agent: "agent-5",
    commit_hash: "",
    changed_files: [
      "docs/release/trial-launch-release-rollback-file-backup-evidence.md"
    ],
    evidence_files: [
      "docs/release/trial-launch-release-rollback-file-backup-evidence.md"
    ],
    notes: "Rollback/file/backup evidence exists when this file is present."
  }]
]);

function parseArgs(argv) {
  const valueAfter = (name, fallback = "") => {
    const index = argv.indexOf(name);
    if (index === -1) return fallback;
    const value = argv[index + 1];
    return value && !value.startsWith("--") ? value : fallback;
  };

  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    fromEvents: argv.includes("--from-events"),
    legacyJson: argv.includes("--legacy-json"),
    source: valueAfter("--source", "reconcile-task-results.mjs"),
    reason: valueAfter("--reason", "reconciled compatibility read model from events"),
    integrationBranch: valueAfter("--integration-branch", "")
  };
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function modelSummary(current, next, label) {
  const countKey = label === "queue" ? "tasks" : label;
  return {
    label,
    changed: stable(current) !== stable(next),
    current_count: Array.isArray(current?.[countKey]) ? current[countKey].length : 0,
    next_count: Array.isArray(next?.[countKey]) ? next[countKey].length : 0
  };
}

function byTaskId(items, key = "task_id") {
  return new Map((items ?? []).map((item) => [item[key], item]));
}

function countByReason(items) {
  return items.reduce((acc, item) => {
    const reason = item.reason ?? "unknown";
    acc[reason] = (acc[reason] ?? 0) + 1;
    return acc;
  }, {});
}

function cleanResultSnapshot(result) {
  const snapshot = { ...(result ?? {}) };
  delete snapshot._artifact_path;
  delete snapshot._artifact_kind;
  return snapshot;
}

function validIso(value) {
  return value && !Number.isNaN(Date.parse(value));
}

function gitPathState(relativePath) {
  if (!relativePath) {
    return { clean: false, reason: "result_artifact_path_missing" };
  }

  const runGit = (args) => spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  const tracked = runGit(["ls-files", "--error-unmatch", "--", relativePath]);
  if (tracked.error) {
    return { clean: false, reason: "git_unavailable", detail: tracked.error.message };
  }
  if (tracked.status !== 0) {
    return { clean: false, reason: "result_artifact_not_tracked" };
  }

  const unstaged = runGit(["diff", "--quiet", "--", relativePath]);
  if (unstaged.error) {
    return { clean: false, reason: "git_unavailable", detail: unstaged.error.message };
  }
  if (unstaged.status !== 0) {
    return { clean: false, reason: "result_artifact_has_unstaged_changes" };
  }

  const staged = runGit(["diff", "--cached", "--quiet", "--", relativePath]);
  if (staged.error) {
    return { clean: false, reason: "git_unavailable", detail: staged.error.message };
  }
  if (staged.status !== 0) {
    return { clean: false, reason: "result_artifact_has_staged_changes" };
  }

  return { clean: true, reason: "" };
}

function changedTaskIdsFromModels({ currentQueue, nextQueue, currentLocks, nextLocks, currentResults, nextResults }) {
  const changed = new Set();
  const currentTasks = byTaskId(currentQueue.tasks);
  const nextTasks = byTaskId(nextQueue.tasks);
  const taskIds = new Set([...currentTasks.keys(), ...nextTasks.keys()]);
  for (const taskId of taskIds) {
    const current = currentTasks.get(taskId);
    const next = nextTasks.get(taskId);
    if (stable(current ?? null) !== stable(next ?? null)) {
      changed.add(taskId);
    }
  }

  const currentResultByTask = byTaskId(currentResults.results);
  const nextResultByTask = byTaskId(nextResults.results);
  const resultTaskIds = new Set([...currentResultByTask.keys(), ...nextResultByTask.keys()]);
  for (const taskId of resultTaskIds) {
    const current = currentResultByTask.get(taskId);
    const next = nextResultByTask.get(taskId);
    if (stable(current ?? null) !== stable(next ?? null)) {
      changed.add(taskId);
    }
  }

  const currentLocksByTask = byTaskId(currentLocks.locks);
  const nextLocksByTask = byTaskId(nextLocks.locks);
  const lockTaskIds = new Set([...currentLocksByTask.keys(), ...nextLocksByTask.keys()]);
  for (const taskId of lockTaskIds) {
    const current = currentLocksByTask.get(taskId);
    const next = nextLocksByTask.get(taskId);
    if (stable(current ?? null) !== stable(next ?? null)) {
      changed.add(taskId);
    }
  }

  return [...changed].sort();
}

async function appendReconciliationEvents({ args, currentQueue, nextQueue, currentResults, nextResults, changedTaskIds }) {
  const currentTasks = byTaskId(currentQueue.tasks);
  const nextTasks = byTaskId(nextQueue.tasks);
  const currentResultByTask = byTaskId(currentResults.results);
  const nextResultByTask = byTaskId(nextResults.results);
  const eventRefs = [];

  for (const taskId of changedTaskIds) {
    const currentTask = currentTasks.get(taskId);
    const nextTask = nextTasks.get(taskId) ?? currentTask;
    const eventResult = await appendReconciledEvent({
      task: nextTask,
      taskId,
      owner: nextTask?.owner ?? currentTask?.owner,
      statusBefore: currentTask?.status ?? null,
      statusAfter: nextTask?.status ?? currentTask?.status ?? null,
      source: args.source,
      reason: args.reason,
      metadata: {
        integration_branch: args.integrationBranch,
        reconcile_rule: "event_projection_wins",
        current_result_status: currentResultByTask.get(taskId)?.status ?? null,
        next_result_status: nextResultByTask.get(taskId)?.status ?? null
      }
    });
    eventRefs.push({ task_id: taskId, ...eventResult });
  }

  return eventRefs;
}

async function readResultArtifactsFromDir(dir, relativeDir, kind) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const results = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const result = await readJson(join(dir, name));
    if (result?.task_id) {
      results.push({
        ...result,
        _artifact_path: `${relativeDir}/${name}`,
        _artifact_kind: kind
      });
    }
  }
  return results;
}

async function readResultArtifacts() {
  return [
    ...(await readResultArtifactsFromDir(perTaskResultsDir, perTaskResultsRelativeDir, "per-task-result")),
    ...(await readResultArtifactsFromDir(reportsDir, reportsRelativeDir, "report-result"))
  ];
}

function finalEventsByTask(events) {
  const byTask = new Map();
  for (const event of events) {
    if (event.event_type !== "task.completed" && event.event_type !== "task.failed") {
      continue;
    }
    const current = byTask.get(event.task_id) ?? { completed: [], failed: [] };
    if (event.event_type === "task.completed") {
      current.completed.push(event);
    } else {
      current.failed.push(event);
    }
    byTask.set(event.task_id, current);
  }
  return byTask;
}

function taskMapForBackfill(currentQueue, projectedQueue) {
  return new Map([
    ...((currentQueue.tasks ?? []).map((task) => [task.task_id, task])),
    ...((projectedQueue.tasks ?? []).map((task) => [task.task_id, task]))
  ]);
}

function resultBackfillSkipReason({ result, task, finalEvents, gitState }) {
  const status = String(result?.status ?? "").toUpperCase();
  if (status !== "DONE") {
    return "result_status_not_done";
  }
  if (!task) {
    return "task_not_found";
  }
  if (result.agent && result.agent !== task.owner) {
    return "result_agent_owner_mismatch";
  }
  if (!validIso(result.completed_at)) {
    return "result_completed_at_missing_or_invalid";
  }
  if (result.exit_code !== undefined && result.exit_code !== null && Number(result.exit_code) !== 0) {
    return "result_exit_code_not_success";
  }
  if ((finalEvents?.completed ?? []).length > 0) {
    return "task_completed_event_exists";
  }
  if ((finalEvents?.failed ?? []).length > 0) {
    return "task_failed_event_exists";
  }
  if (!gitState.clean) {
    return gitState.reason;
  }
  return "";
}

async function completionBackfillPlan({ currentQueue, projectedQueue, events }) {
  const artifacts = await readResultArtifacts();
  const mergedArtifacts = mergeResultsByTask(artifacts);
  const tasksById = taskMapForBackfill(currentQueue, projectedQueue);
  const finalsByTask = finalEventsByTask(events);
  const candidates = [];
  const skipped = [];

  for (const result of mergedArtifacts) {
    const task = tasksById.get(result.task_id);
    const finalEvents = finalsByTask.get(result.task_id);
    const gitState = gitPathState(result._artifact_path);
    const reason = resultBackfillSkipReason({ result, task, finalEvents, gitState });
    if (reason) {
      skipped.push({
        task_id: result.task_id,
        artifact: result._artifact_path,
        reason
      });
      continue;
    }

    candidates.push({
      task,
      result: cleanResultSnapshot(result),
      resultRef: result._artifact_path
    });
  }

  return {
    artifacts_seen: artifacts.length,
    latest_artifacts_seen: mergedArtifacts.length,
    candidates,
    skipped
  };
}

async function appendCompletionBackfills({ args, plan }) {
  const eventRefs = [];
  for (const item of plan.candidates) {
    const eventResult = await appendCompletionBackfillEvent({
      task: item.task,
      result: item.result,
      resultRef: item.resultRef,
      statusBefore: item.task?.status ?? null,
      source: args.source,
      reason: "backfilled task.completed from committed result artifact",
      createdAt: new Date(item.result.completed_at).toISOString()
    });
    eventRefs.push({ task_id: item.result.task_id, ...eventResult });
  }
  return eventRefs;
}

async function reconcileFromEvents(args) {
  const existingEvents = await listAllTaskEvents();
  const currentQueue = await readJson(EVENT_STORE_PATHS.queuePath);
  const currentLocks = await readJson(EVENT_STORE_PATHS.locksPath);
  const currentResults = await readJson(EVENT_STORE_PATHS.resultsPath);
  const projectedQueueBeforeBackfill = await buildQueueReadModel();
  const backfillPlan = await completionBackfillPlan({
    currentQueue,
    projectedQueue: projectedQueueBeforeBackfill,
    events: existingEvents
  });
  const backfillSkips = countByReason(backfillPlan.skipped);
  const backfillEventRefs = args.apply
    ? await appendCompletionBackfills({ args, plan: backfillPlan })
    : [];
  const nextQueue = await buildQueueReadModel();
  const nextLocks = await buildLockReadModel();
  const nextResults = await buildResultReadModel();
  const summaries = [
    modelSummary(currentQueue, nextQueue, "queue"),
    modelSummary(currentLocks, nextLocks, "locks"),
    modelSummary(currentResults, nextResults, "results")
  ];
  const changedTaskIds = changedTaskIdsFromModels({
    currentQueue,
    nextQueue,
    currentLocks,
    nextLocks,
    currentResults,
    nextResults
  });

  console.log("# Reconcile Task Results");
  console.log("");
  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log("Source: events");
  console.log(`Task events: ${existingEvents.length}`);
  console.log(`Result artifacts scanned: ${backfillPlan.artifacts_seen}`);
  console.log(`Latest result artifacts considered: ${backfillPlan.latest_artifacts_seen}`);
  console.log(`Completion backfills planned: ${backfillPlan.candidates.length}`);
  console.log(`Completion backfill skips: ${JSON.stringify(backfillSkips)}`);
  console.log("Reconcile rule: event projection wins; compatibility queue JSON is generated only after event/backfill/reconciled events are evaluated.");
  for (const summary of summaries) {
    console.log(`${summary.label}: changed=${summary.changed} current=${summary.current_count} next=${summary.next_count}`);
  }
  console.log(`Changed task ids: ${changedTaskIds.join(", ") || "none"}`);

  if (args.dryRun) {
    console.log("Dry-run: completion events, queue, locks, and aggregate results were not written.");
    return;
  }

  let eventRefs = [];
  if (changedTaskIds.length > 0) {
    eventRefs = await appendReconciliationEvents({
      args,
      currentQueue,
      nextQueue,
      currentResults,
      nextResults,
      changedTaskIds
    });
  }

  await writeCompatibilityReadModels();
  const writtenBackfills = backfillEventRefs.filter((item) => item.written);
  const skippedBackfills = backfillEventRefs.filter((item) => item.skipped);
  const written = eventRefs.filter((item) => item.written);
  const skipped = eventRefs.filter((item) => item.skipped);
  await recordConflictMetric("event_rebuild", {
    source: args.source,
    branch: args.integrationBranch,
    count: 1,
    reason: "event projection rebuilt before compatibility read-model materialization",
    metadata: {
      task_events: existingEvents.length,
      changed_task_ids: changedTaskIds,
      read_model_only: true
    }
  });
  await recordConflictMetric("read_model_rebuild", {
    source: args.source,
    branch: args.integrationBranch,
    count: 1,
    reason: args.reason,
    metadata: {
      task_events: existingEvents.length,
      changed_task_ids: changedTaskIds,
      completion_backfills_written: writtenBackfills.length,
      reconciliation_events_written: written.length,
      read_model_only: true
    }
  });
  console.log(`Completion backfill events written: ${writtenBackfills.length}`);
  console.log(`Completion backfill events skipped by idempotency/dry-run: ${skippedBackfills.length}`);
  for (const item of writtenBackfills) {
    console.log(`Backfill event: ${item.task_id} ${item.path}`);
  }
  console.log(`Reconciliation events written: ${written.length}`);
  console.log(`Reconciliation events skipped by idempotency/dry-run: ${skipped.length}`);
  for (const item of written) {
    console.log(`Event: ${item.task_id} ${item.path}`);
  }
  console.log("Wrote queue/task-queue.json, queue/task-locks.json, and queue/task-results.json from events.");
}

async function exists(relativePath) {
  try {
    await access(join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readReportResults() {
  let names = [];
  try {
    names = await readdir(reportsDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const results = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const result = await readJson(join(reportsDir, name));
    if (result?.task_id) {
      results.push(result);
    }
  }
  return results;
}

function buildEvidenceResult(task, rule, completedAt) {
  return {
    task_id: task.task_id,
    agent: rule.agent ?? task.owner,
    status: "DONE",
    commit_hash: rule.commit_hash ?? "",
    changed_files: rule.changed_files ?? [],
    commands_run: [],
    passed_checks: [],
    failed_checks: rule.failed_checks ?? [],
    notes: rule.notes ?? "Evidence file exists.",
    completed_at: completedAt
  };
}

const args = parseArgs(process.argv.slice(2));
const taskEvents = await listAllTaskEvents();

if (!args.legacyJson && (args.fromEvents || taskEvents.length > 0)) {
  await reconcileFromEvents(args);
  process.exit(0);
}

if (args.legacyJson && args.apply && taskEvents.length > 0) {
  console.error("Refusing --legacy-json --apply while task events exist.");
  console.error("Use reconcile-task-results.mjs --from-events --dry-run, then --from-events --apply so generated queue JSON is reconciled from the event projection.");
  process.exit(1);
}

const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const aggregateResults = await readJson(aggregateResultsPath);
const perTaskResults = await readResultFiles(perTaskResultsDir);
const reportResults = await readReportResults();
const mergedKnownResults = mergeResultsByTask(aggregateResults.results ?? [], perTaskResults, reportResults);
const knownByTask = new Map(mergedKnownResults.map((result) => [result.task_id, result]));
const reconciledAt = nowIso();
const finalResults = [];
const completedTaskIds = new Set();

for (const task of queue.tasks ?? []) {
  const existing = knownByTask.get(task.task_id);
  const rule = EVIDENCE_RULES.get(task.task_id);
  const evidenceExists = rule
    ? (await Promise.all((rule.evidence_files ?? []).map((file) => exists(file)))).some(Boolean)
    : false;

  if (existing?.status === "DONE" || evidenceExists) {
    const result = existing?.status === "DONE"
      ? existing
      : buildEvidenceResult(task, rule, reconciledAt);
    result.status = "DONE";
    finalResults.push(result);
    task.status = "DONE";
    task.updated_at = reconciledAt;
    completedTaskIds.add(task.task_id);
  } else if (!["READY", "BLOCKED"].includes(task.status)) {
    task.status = "READY";
    task.updated_at = reconciledAt;
  }
}

locks.locks = (locks.locks ?? []).filter((lock) => !completedTaskIds.has(lock.task_id));
locks.updated_at = reconciledAt;
aggregateResults.results = finalResults;
aggregateResults.updated_at = reconciledAt;
queue.updated_at = reconciledAt;

console.log("# Reconcile Task Results");
console.log("");
console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
console.log(`DONE tasks: ${[...completedTaskIds].join(", ") || "none"}`);
console.log(`Remaining locks: ${locks.locks.length}`);

if (args.dryRun) {
  console.log("Dry-run: queue, locks, and aggregate results were not written.");
  process.exit(0);
}

await writeJson(queuePath, queue);
await writeJson(locksPath, locks);
await writeJson(aggregateResultsPath, aggregateResults);
console.log("Wrote queue/task-queue.json, queue/task-locks.json, and queue/task-results.json.");
