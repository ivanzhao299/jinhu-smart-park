#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditChangedFiles,
  auditableChangedFiles,
  latestResultFor,
  readJson
} from "./lib/queue-utils.mjs";
import {
  appendAuditEvent,
  writeCompatibilityReadModels
} from "./lib/event-store-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/audit-agent-result.mjs <task_id> [--json] [--apply|--write]");
}

function parseArgs(argv) {
  const positional = argv.filter((item) => !item.startsWith("--"));
  return {
    taskId: positional[0],
    json: argv.includes("--json"),
    apply: argv.includes("--apply") || argv.includes("--write")
  };
}

function printText(result) {
  console.log(result.audit_status === "PASS" ? "AUDIT_PASS" : "AUDIT_FAIL");
  for (const failure of result.failures) {
    console.log(`Reason: ${failure}`);
  }
  if (result.audit_status === "PASS") {
    console.log(`Task ${result.task_id} changed ${result.changed_files.length} audited file(s) within allowed paths and did not hit forbidden paths.`);
  }
  if (result.event?.written) {
    console.log(`Event: ${result.event.path}`);
  } else if (result.event?.skipped) {
    console.log(`Event skipped: ${result.event.reason}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const taskId = args.taskId;

if (!taskId) {
  usage();
  process.exit(1);
}

const queue = await readJson(queuePath);
const results = await readJson(resultsPath);
const task = (queue.tasks ?? []).find((item) => item.task_id === taskId);

if (!task) {
  const auditResult = {
    task_id: taskId,
    audit_status: "FAIL",
    failures: [`task not found: ${taskId}`],
    changed_files: []
  };
  if (args.json) {
    console.log(JSON.stringify(auditResult, null, 2));
  } else {
    printText(auditResult);
  }
  process.exit(1);
}

const result = latestResultFor(results, taskId);

if (!result) {
  const auditResult = {
    task_id: taskId,
    audit_status: "FAIL",
    failures: [`no result recorded for task: ${taskId}`],
    changed_files: []
  };
  if (args.json) {
    console.log(JSON.stringify(auditResult, null, 2));
  } else {
    printText(auditResult);
  }
  process.exit(1);
}

const failures = auditChangedFiles(task, result);
const auditStatus = failures.length > 0 ? "FAIL" : "PASS";
const auditResult = {
  task_id: taskId,
  audit_status: auditStatus,
  failures,
  changed_files: auditableChangedFiles(result),
  task_status: task.status,
  result_status: result.status
};

if (args.apply) {
  auditResult.event = await appendAuditEvent({
    task,
    result,
    auditStatus,
    failures,
    changedFiles: auditableChangedFiles(result),
    source: "audit-agent-result.mjs"
  });
  await writeCompatibilityReadModels();
}

if (args.json) {
  console.log(JSON.stringify(auditResult, null, 2));
} else {
  printText(auditResult);
}

if (failures.length > 0) {
  process.exit(1);
}
