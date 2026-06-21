#!/usr/bin/env node
import { appendTaskEvent, EVENT_STORE_PATHS, listAllTaskEvents } from "./lib/event-store-utils.mjs";
import { readJson } from "./lib/queue-utils.mjs";

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    apply: flags.has("--apply"),
    dryRun: flags.has("--dry-run") || !flags.has("--apply")
  };
}

function eventTime(...values) {
  const firstValid = values.find((value) => value && !Number.isNaN(Date.parse(value)));
  return firstValid ? new Date(firstValid).toISOString() : new Date().toISOString();
}

function resultEventType(result) {
  return String(result?.status ?? "").toUpperCase() === "FAILED" ? "task.failed" : "task.completed";
}

function statusEventType(status) {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "BLOCKED") return "task.blocked";
  if (normalized === "FAILED") return "task.failed";
  if (normalized === "DONE") return "task.completed";
  if (normalized === "AUDITED") return "task.audited";
  if (normalized === "IN_PROGRESS") return "task.started";
  if (normalized === "CLAIMED") return "task.claimed";
  return "task.created";
}

function makeTaskCreatedEvent(task, index) {
  return {
    event_id: `bootstrap:v1:task:${task.task_id}:created`,
    event_type: "task.created",
    task_id: task.task_id,
    owner: task.owner,
    status_before: null,
    status_after: task.status,
    created_at: eventTime(task.updated_at, task.created_at),
    actor: "orchestrator",
    source: "bootstrap-event-store",
    reason: "bootstrap from ops/agent-orchestrator/queue/task-queue.json",
    changed_files: [],
    metadata: {
      bootstrap: true,
      queue_index: index,
      task_snapshot: task
    }
  };
}

function makeLockEvent(lock, task) {
  return {
    event_id: `bootstrap:v1:lock:${lock.task_id}:${lock.agent}:${lock.claimed_at ?? "unknown"}`,
    event_type: statusEventType(task?.status ?? "CLAIMED") === "task.started" ? "task.started" : "task.claimed",
    task_id: lock.task_id,
    owner: lock.agent,
    status_before: "READY",
    status_after: task?.status ?? "CLAIMED",
    created_at: eventTime(lock.claimed_at, task?.updated_at),
    actor: lock.agent,
    source: "bootstrap-event-store",
    reason: "bootstrap active lock from ops/agent-orchestrator/queue/task-locks.json",
    changed_files: [],
    metadata: {
      bootstrap: true,
      lock_snapshot: lock
    }
  };
}

function makeResultEvent(result, task) {
  const type = resultEventType(result);
  return {
    event_id: `bootstrap:v1:result:${result.task_id}:${result.agent}:${result.completed_at ?? result.commit_hash ?? "unknown"}`,
    event_type: type,
    task_id: result.task_id,
    owner: result.agent,
    status_before: task?.status && task.status !== result.status ? task.status : null,
    status_after: result.status,
    created_at: eventTime(result.completed_at, task?.updated_at),
    actor: result.agent,
    source: "bootstrap-event-store",
    reason: "bootstrap result from ops/agent-orchestrator/queue/task-results.json",
    changed_files: Array.isArray(result.changed_files) ? result.changed_files : [],
    result_ref: `ops/agent-orchestrator/results/${result.task_id}.json`,
    metadata: {
      bootstrap: true,
      result_snapshot: result
    }
  };
}

function countByType(events) {
  return events.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] ?? 0) + 1;
    return acc;
  }, {});
}

const args = parseArgs(process.argv.slice(2));
const queue = await readJson(EVENT_STORE_PATHS.queuePath);
const locks = await readJson(EVENT_STORE_PATHS.locksPath);
const results = await readJson(EVENT_STORE_PATHS.resultsPath);
const tasksById = new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
const plannedEvents = [
  ...(queue.tasks ?? []).map(makeTaskCreatedEvent),
  ...(locks.locks ?? []).map((lock) => makeLockEvent(lock, tasksById.get(lock.task_id))),
  ...(results.results ?? []).map((result) => makeResultEvent(result, tasksById.get(result.task_id)))
];

const existingIds = new Set((await listAllTaskEvents()).map((event) => event.event_id));
const newEvents = plannedEvents.filter((event) => !existingIds.has(event.event_id));
const existingEvents = plannedEvents.filter((event) => existingIds.has(event.event_id));

console.log(`# Event Store Bootstrap ${args.apply ? "Apply" : "Dry Run"}`);
console.log(`planned_events: ${plannedEvents.length}`);
console.log(`existing_bootstrap_events: ${existingEvents.length}`);
console.log(`new_events: ${newEvents.length}`);
console.log(`event_types: ${JSON.stringify(countByType(plannedEvents))}`);

if (!args.apply) {
  console.log("mode: dry-run; no event files were written");
  process.exit(0);
}

let written = 0;
let skipped = 0;
for (const event of newEvents) {
  const result = await appendTaskEvent(event);
  if (result.written) written += 1;
  if (result.skipped) skipped += 1;
}

console.log(`written_events: ${written}`);
console.log(`skipped_events: ${skipped + existingEvents.length}`);
