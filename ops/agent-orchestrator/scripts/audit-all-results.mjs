#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditChangedFiles,
  auditableChangedFiles,
  mergeResultsByTask,
  readJson,
  readResultFiles,
  taskById
} from "./lib/queue-utils.mjs";
import {
  appendAuditEvent,
  writeCompatibilityReadModels
} from "./lib/event-store-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const aggregateResultsPath = join(orchestratorDir, "queue", "task-results.json");
const perTaskResultsDir = join(orchestratorDir, "results");

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply") || argv.includes("--write"),
    dryRun: argv.includes("--dry-run") || argv.includes("--no-write") || (!argv.includes("--apply") && !argv.includes("--write"))
  };
}

const args = parseArgs(process.argv.slice(2));
const queue = await readJson(queuePath);
const aggregateResults = await readJson(aggregateResultsPath);
const perTaskResults = await readResultFiles(perTaskResultsDir);
const tasksById = taskById(queue);
const latestDoneResults = new Map();

for (const result of mergeResultsByTask(aggregateResults.results ?? [], perTaskResults)) {
  if (result.status === "DONE") {
    latestDoneResults.set(result.task_id, result);
  }
}

if (latestDoneResults.size === 0) {
  console.log("No DONE results to audit.");
  process.exit(0);
}

let hasFailure = false;
const eventRefs = [];

console.log(`Audit mode: ${args.apply ? "apply" : "dry-run"}`);

for (const [taskId, result] of latestDoneResults) {
  const task = tasksById.get(taskId);
  if (!task) {
    hasFailure = true;
    console.log(`${taskId}: AUDIT_FAIL`);
    console.log(`Reason: task not found: ${taskId}`);
    continue;
  }

  const failures = auditChangedFiles(task, result);
  if (failures.length > 0) {
    hasFailure = true;
    console.log(`${taskId}: AUDIT_FAIL`);
    for (const failure of failures) {
      console.log(`Reason: ${failure}`);
    }
    if (args.apply) {
      const eventResult = await appendAuditEvent({
        task,
        result,
        auditStatus: "FAIL",
        failures,
        changedFiles: auditableChangedFiles(result),
        source: "audit-all-results.mjs"
      });
      eventRefs.push({ task_id: taskId, audit_status: "FAIL", ...eventResult });
    }
    continue;
  }

  console.log(`${taskId}: AUDIT_PASS`);
  if (args.apply) {
    const eventResult = await appendAuditEvent({
      task,
      result,
      auditStatus: "PASS",
      failures: [],
      changedFiles: auditableChangedFiles(result),
      source: "audit-all-results.mjs"
    });
    eventRefs.push({ task_id: taskId, audit_status: "PASS", ...eventResult });
  }
}

if (args.apply) {
  await writeCompatibilityReadModels();
  const written = eventRefs.filter((item) => item.written);
  const skipped = eventRefs.filter((item) => item.skipped);
  console.log(`Audit events written: ${written.length}`);
  console.log(`Audit events skipped by idempotency/dry-run: ${skipped.length}`);
  for (const item of written) {
    console.log(`Event: ${item.task_id} ${item.audit_status} ${item.path}`);
  }
}

if (!args.apply) {
  console.log("Dry-run/no-write: task-queue.json was not modified.");
}

if (hasFailure) {
  process.exit(1);
}
