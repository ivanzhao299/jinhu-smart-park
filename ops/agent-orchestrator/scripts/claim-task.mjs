#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const VALID_AGENTS = new Set(["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"]);
const PRIORITY_RANK = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/claim-task.mjs agent-2");
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

function priorityRank(priority) {
  return PRIORITY_RANK.has(priority) ? PRIORITY_RANK.get(priority) : 99;
}

function createdAtRank(task) {
  const ms = Date.parse(task.created_at ?? "");
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

const agent = process.argv[2];

if (!agent || !VALID_AGENTS.has(agent)) {
  usage();
  console.error(`Invalid agent: ${agent ?? "(missing)"}`);
  process.exit(1);
}

const queue = await readJson(queuePath);
const locks = await readJson(locksPath);

const candidates = (queue.tasks ?? [])
  .filter((task) => task.owner === agent && task.status === "READY")
  .sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;

    const byCreatedAt = createdAtRank(a) - createdAtRank(b);
    if (byCreatedAt !== 0) return byCreatedAt;

    return String(a.task_id).localeCompare(String(b.task_id));
  });

const task = candidates[0];

if (!task) {
  console.log(`No READY task for ${agent}`);
  process.exit(0);
}

const claimedAt = nowIso();
task.status = "CLAIMED";
task.updated_at = claimedAt;
queue.updated_at = claimedAt;

locks.locks ??= [];
locks.locks.push({
  task_id: task.task_id,
  agent,
  claimed_at: claimedAt
});
locks.updated_at = claimedAt;

await writeJson(queuePath, queue);
await writeJson(locksPath, locks);

console.log(`CLAIMED ${task.task_id} for ${agent}`);
console.log(JSON.stringify({
  task_id: task.task_id,
  batch_id: task.batch_id,
  title: task.title,
  owner: task.owner,
  priority: task.priority,
  risk: task.risk,
  status: task.status
}, null, 2));
