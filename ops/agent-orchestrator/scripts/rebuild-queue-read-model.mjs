#!/usr/bin/env node
import {
  buildLockReadModel,
  buildQueueReadModel,
  buildResultReadModel,
  buildEventStoreHealth,
  EVENT_STORE_PATHS,
  listAllTaskEvents,
  writeCompatibilityReadModels
} from "./lib/event-store-utils.mjs";
import { readJson } from "./lib/queue-utils.mjs";

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    apply: flags.has("--apply"),
    dryRun: flags.has("--dry-run") || !flags.has("--apply")
  };
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function modelSummary(current, next, label) {
  const changed = stable(current) !== stable(next);
  const countKey = label === "queue" ? "tasks" : label;
  return {
    label,
    changed,
    current_count: Array.isArray(current?.[countKey]) ? current[countKey].length : 0,
    next_count: Array.isArray(next?.[countKey]) ? next[countKey].length : 0
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

const args = parseArgs(process.argv.slice(2));
const events = await listAllTaskEvents();
const currentQueue = await readJson(EVENT_STORE_PATHS.queuePath);
const currentLocks = await readJson(EVENT_STORE_PATHS.locksPath);
const currentResults = await readJson(EVENT_STORE_PATHS.resultsPath);

const nextQueue = await buildQueueReadModel();
const nextLocks = await buildLockReadModel();
const nextResults = await buildResultReadModel();
const health = await buildEventStoreHealth({
  queue: currentQueue,
  locks: currentLocks,
  results: currentResults
});

const summaries = [
  modelSummary(currentQueue, nextQueue, "queue"),
  modelSummary(currentLocks, nextLocks, "locks"),
  modelSummary(currentResults, nextResults, "results")
];
const consistency = health.read_model_consistency;
const eventReadModelConsistent = Boolean(
  consistency.queue_status.consistent &&
  consistency.locks.consistent &&
  consistency.results_status.consistent
);

console.log(`# Queue Read Model Rebuild ${args.apply ? "Apply" : "Dry Run"}`);
console.log(`task_events: ${events.length}`);
for (const summary of summaries) {
  console.log(`${summary.label}: changed=${summary.changed} current=${summary.current_count} next=${summary.next_count}`);
}
console.log(`event/read-model consistency: ${yesNo(eventReadModelConsistent)}`);
console.log(`consistency detail: queue_status=${yesNo(consistency.queue_status.consistent)} locks=${yesNo(consistency.locks.consistent)} results_status=${yesNo(consistency.results_status.consistent)}`);
console.log("reconcile rule: event projection is the source of truth; review dry-run drift before applying generated compatibility JSON");

if (!args.apply) {
  console.log("mode: dry-run; no compatibility JSON files were written");
  process.exit(0);
}

await writeCompatibilityReadModels();
console.log("written: queue/task-queue.json");
console.log("written: queue/task-locks.json");
console.log("written: queue/task-results.json");
