#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const VALID_AGENTS = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
const STATUSES = ["READY", "CLAIMED", "IN_PROGRESS", "DONE", "FAILED", "BLOCKED", "AUDITED"];
const ACTIVE_LOCK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "BLOCKED"]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function groupTasksByStatus(tasks) {
  const grouped = new Map(STATUSES.map((status) => [status, []]));
  for (const task of tasks) {
    if (!grouped.has(task.status)) {
      grouped.set(task.status, []);
    }
    grouped.get(task.status).push(task);
  }
  return grouped;
}

function taskById(tasks) {
  return new Map(tasks.map((task) => [task.task_id, task]));
}

function activeLocksFor(agent, locks, tasksById) {
  return (locks ?? []).filter((lock) => {
    if (lock.agent !== agent) return false;
    const task = tasksById.get(lock.task_id);
    return task ? ACTIVE_LOCK_STATUSES.has(task.status) : true;
  });
}

const queue = await readJson(queuePath);
const locks = await readJson(locksPath);
const results = await readJson(resultsPath);
const tasks = queue.tasks ?? [];
const grouped = groupTasksByStatus(tasks);
const tasksById = taskById(tasks);

console.log("# Dispatch Status");
console.log("");
console.log(`Queue updated_at: ${queue.updated_at}`);
console.log(`Locks updated_at: ${locks.updated_at}`);
console.log(`Results updated_at: ${results.updated_at}`);
console.log("");

for (const status of STATUSES) {
  const statusTasks = grouped.get(status) ?? [];
  console.log(`## ${status} tasks (${statusTasks.length})`);
  if (statusTasks.length === 0) {
    console.log("- none");
  } else {
    for (const task of statusTasks) {
      console.log(`- ${task.task_id} | ${task.owner} | ${task.priority} | ${task.title}`);
    }
  }
  console.log("");
}

console.log("## Agent Locks And Claim Readiness");
for (const agent of VALID_AGENTS) {
  const activeLocks = activeLocksFor(agent, locks.locks ?? [], tasksById);
  const readyTasks = tasks.filter((task) => task.owner === agent && task.status === "READY");
  const canClaim = activeLocks.length === 0 && readyTasks.length > 0;
  const lockText = activeLocks.length === 0
    ? "no active lock"
    : activeLocks.map((lock) => `${lock.task_id}@${lock.claimed_at}`).join(", ");
  const reason = canClaim
    ? `yes (${readyTasks.length} READY task(s))`
    : activeLocks.length > 0
      ? "no (active lock)"
      : "no (no READY task)";

  console.log(`- ${agent}: ${lockText}; can claim: ${reason}`);
}
