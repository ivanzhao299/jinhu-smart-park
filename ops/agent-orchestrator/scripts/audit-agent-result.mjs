#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/audit-agent-result.mjs <task_id>");
}

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

function latestResultFor(results, taskId) {
  return [...(results.results ?? [])].reverse().find((result) => result.task_id === taskId);
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
console.log(`Task ${taskId} changed ${changedFiles.length} file(s) within allowed paths and did not hit forbidden paths.`);
