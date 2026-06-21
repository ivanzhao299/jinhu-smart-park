#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditChangedFiles,
  mergeResultsByTask,
  nowIso,
  readJson,
  readResultFiles,
  taskById,
  writeJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const aggregateResultsPath = join(orchestratorDir, "queue", "task-results.json");
const perTaskResultsDir = join(orchestratorDir, "results");

function parseArgs(argv) {
  return {
    write: argv.includes("--write"),
    dryRun: argv.includes("--dry-run") || argv.includes("--no-write") || !argv.includes("--write")
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
let queueChanged = false;
const auditedAt = nowIso();

console.log(`Audit mode: ${args.write ? "write" : "dry-run"}`);

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
    continue;
  }

  console.log(`${taskId}: AUDIT_PASS`);
  if (args.write) {
    task.status = "AUDITED";
    task.updated_at = auditedAt;
    queueChanged = true;
  }
}

if (args.write && queueChanged) {
  queue.updated_at = auditedAt;
  await writeJson(queuePath, queue);
}

if (!args.write) {
  console.log("Dry-run/no-write: task-queue.json was not modified.");
}

if (hasFailure) {
  process.exit(1);
}
