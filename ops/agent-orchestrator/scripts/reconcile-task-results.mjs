#!/usr/bin/env node
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
  buildLockReadModel,
  buildQueueReadModel,
  buildResultReadModel,
  EVENT_STORE_PATHS,
  listAllTaskEvents,
  writeCompatibilityReadModels
} from "./lib/event-store-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const aggregateResultsPath = join(orchestratorDir, "queue", "task-results.json");
const perTaskResultsDir = join(orchestratorDir, "results");
const reportsDir = join(orchestratorDir, "reports");

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
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    fromEvents: argv.includes("--from-events")
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

async function reconcileFromEvents(args) {
  const events = await listAllTaskEvents();
  const currentQueue = await readJson(EVENT_STORE_PATHS.queuePath);
  const currentLocks = await readJson(EVENT_STORE_PATHS.locksPath);
  const currentResults = await readJson(EVENT_STORE_PATHS.resultsPath);
  const nextQueue = await buildQueueReadModel();
  const nextLocks = await buildLockReadModel();
  const nextResults = await buildResultReadModel();
  const summaries = [
    modelSummary(currentQueue, nextQueue, "queue"),
    modelSummary(currentLocks, nextLocks, "locks"),
    modelSummary(currentResults, nextResults, "results")
  ];

  console.log("# Reconcile Task Results");
  console.log("");
  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log("Source: events");
  console.log(`Task events: ${events.length}`);
  for (const summary of summaries) {
    console.log(`${summary.label}: changed=${summary.changed} current=${summary.current_count} next=${summary.next_count}`);
  }

  if (args.dryRun) {
    console.log("Dry-run: queue, locks, and aggregate results were not written.");
    return;
  }

  await writeCompatibilityReadModels();
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

if (args.fromEvents) {
  await reconcileFromEvents(args);
  process.exit(0);
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
