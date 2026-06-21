#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/\*\*$/, "/")
    .replace(/\/$/, "");
}

function pathMatches(filePath, rulePath) {
  const file = normalizePath(filePath);
  const rule = normalizePath(rulePath);

  if (!file || !rule) {
    return false;
  }

  return file === rule || file.startsWith(`${rule}/`);
}

function auditResult(task, result) {
  const changedFiles = Array.isArray(result.changed_files) ? result.changed_files : [];
  const allowedPaths = Array.isArray(task.allowed_paths) ? task.allowed_paths : [];
  const forbiddenPaths = Array.isArray(task.forbidden_paths) ? task.forbidden_paths : [];
  const failures = [];

  if (allowedPaths.length === 0 && changedFiles.length > 0) {
    failures.push("task has changed_files but no allowed_paths configured");
  }

  for (const file of changedFiles) {
    const isAllowed = allowedPaths.some((allowedPath) => pathMatches(file, allowedPath));
    if (!isAllowed) {
      failures.push(`changed file outside allowed_paths: ${file}`);
    }

    const forbiddenMatch = forbiddenPaths.find((forbiddenPath) => pathMatches(file, forbiddenPath));
    if (forbiddenMatch) {
      failures.push(`changed file hits forbidden_paths (${forbiddenMatch}): ${file}`);
    }
  }

  return failures;
}

const queue = await readJson(queuePath);
const results = await readJson(resultsPath);
const tasksById = new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
const latestDoneResults = new Map();

for (const result of results.results ?? []) {
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

for (const [taskId, result] of latestDoneResults) {
  const task = tasksById.get(taskId);
  if (!task) {
    hasFailure = true;
    console.log(`${taskId}: AUDIT_FAIL`);
    console.log(`Reason: task not found: ${taskId}`);
    continue;
  }

  const failures = auditResult(task, result);
  if (failures.length > 0) {
    hasFailure = true;
    console.log(`${taskId}: AUDIT_FAIL`);
    for (const failure of failures) {
      console.log(`Reason: ${failure}`);
    }
    continue;
  }

  task.status = "AUDITED";
  task.updated_at = auditedAt;
  queueChanged = true;
  console.log(`${taskId}: AUDIT_PASS`);
}

if (queueChanged) {
  queue.updated_at = auditedAt;
  await writeJson(queuePath, queue);
}

if (hasFailure) {
  process.exit(1);
}
