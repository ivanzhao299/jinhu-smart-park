#!/usr/bin/env node
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const VALID_AGENTS = new Set(["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"]);
const VALID_FINAL_STATUSES = new Set(["DONE", "FAILED"]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

function usage() {
  console.error(`Usage:
  node ops/agent-orchestrator/scripts/complete-task.mjs --result result.json
  node ops/agent-orchestrator/scripts/complete-task.mjs --task-id TASK --agent agent-2 --status DONE --commit-hash abc123 --changed-files docs/a.md --commands-run "pnpm typecheck" --passed-checks "pnpm typecheck" --notes "done"`);
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

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token
      .slice(2)
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : true;

    if (value !== true) {
      index += 1;
    }

    if (args[key] === undefined) {
      args[key] = value;
    } else if (Array.isArray(args[key])) {
      args[key].push(value);
    } else {
      args[key] = [args[key], value];
    }
  }

  return args;
}

function toList(value) {
  if (value === undefined || value === true || value === "") {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadPayload(args) {
  if (args.result) {
    const resultPath = isAbsolute(args.result) ? args.result : resolve(process.cwd(), args.result);
    return readJson(resultPath);
  }

  return {
    task_id: args.taskId,
    agent: args.agent,
    status: args.status,
    commit_hash: args.commitHash ?? "",
    changed_files: toList(args.changedFiles),
    commands_run: toList(args.commandsRun),
    passed_checks: toList(args.passedChecks),
    failed_checks: toList(args.failedChecks),
    notes: args.notes === true || args.notes === undefined ? "" : String(args.notes)
  };
}

const args = parseArgs(process.argv.slice(2));
const payload = await loadPayload(args);

payload.changed_files = Array.isArray(payload.changed_files) ? payload.changed_files : toList(payload.changed_files);
payload.commands_run = Array.isArray(payload.commands_run) ? payload.commands_run : toList(payload.commands_run);
payload.passed_checks = Array.isArray(payload.passed_checks) ? payload.passed_checks : toList(payload.passed_checks);
payload.failed_checks = Array.isArray(payload.failed_checks) ? payload.failed_checks : toList(payload.failed_checks);

if (!payload.task_id || !payload.agent) {
  usage();
  console.error("Missing required task_id or agent.");
  process.exit(1);
}

if (!VALID_AGENTS.has(payload.agent)) {
  usage();
  console.error(`Invalid agent: ${payload.agent}`);
  process.exit(1);
}

const inferredStatus = payload.failed_checks.length > 0 ? "FAILED" : "DONE";
payload.status = String(payload.status ?? inferredStatus).toUpperCase();

if (!VALID_FINAL_STATUSES.has(payload.status)) {
  usage();
  console.error(`Invalid status: ${payload.status}. Expected DONE or FAILED.`);
  process.exit(1);
}

const queue = await readJson(queuePath);
const results = await readJson(resultsPath);
const task = (queue.tasks ?? []).find((item) => item.task_id === payload.task_id);

if (!task) {
  console.error(`Task not found: ${payload.task_id}`);
  process.exit(1);
}

if (task.owner !== payload.agent) {
  console.error(`Task ${payload.task_id} is owned by ${task.owner}, not ${payload.agent}`);
  process.exit(1);
}

const completedAt = nowIso();
task.status = payload.status;
task.updated_at = completedAt;
queue.updated_at = completedAt;

results.results ??= [];
results.results.push({
  task_id: payload.task_id,
  agent: payload.agent,
  status: payload.status,
  commit_hash: payload.commit_hash ?? "",
  changed_files: payload.changed_files,
  commands_run: payload.commands_run,
  passed_checks: payload.passed_checks,
  failed_checks: payload.failed_checks,
  notes: payload.notes ?? "",
  completed_at: completedAt
});
results.updated_at = completedAt;

await writeJson(queuePath, queue);
await writeJson(resultsPath, results);

console.log(`RECORDED ${payload.status} for ${payload.task_id} by ${payload.agent}`);
