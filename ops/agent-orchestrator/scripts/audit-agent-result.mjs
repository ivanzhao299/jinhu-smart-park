#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditChangedFiles,
  auditableChangedFiles,
  latestResultFor,
  nowIso,
  readJson,
  writeJson
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/audit-agent-result.mjs <task_id>");
}

const taskId = process.argv[2];

if (!taskId) {
  usage();
  process.exit(1);
}

const queue = await readJson(queuePath);
const results = await readJson(resultsPath);
const task = (queue.tasks ?? []).find((item) => item.task_id === taskId);

if (!task) {
  console.log("AUDIT_FAIL");
  console.log(`Reason: task not found: ${taskId}`);
  process.exit(1);
}

const result = latestResultFor(results, taskId);

if (!result) {
  console.log("AUDIT_FAIL");
  console.log(`Reason: no result recorded for task: ${taskId}`);
  process.exit(1);
}

const failures = auditChangedFiles(task, result);

if (failures.length > 0) {
  console.log("AUDIT_FAIL");
  for (const failure of failures) {
    console.log(`Reason: ${failure}`);
  }
  process.exit(1);
}

const auditedAt = nowIso();
task.status = "AUDITED";
task.updated_at = auditedAt;
queue.updated_at = auditedAt;

await writeJson(queuePath, queue);

console.log("AUDIT_PASS");
console.log(`Task ${taskId} changed ${auditableChangedFiles(result).length} audited file(s) within allowed paths and did not hit forbidden paths.`);
