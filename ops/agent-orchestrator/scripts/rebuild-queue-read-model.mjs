#!/usr/bin/env node
import {
  buildLockReadModel,
  buildQueueReadModel,
  buildResultReadModel,
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

const args = parseArgs(process.argv.slice(2));
const events = await listAllTaskEvents();
const currentQueue = await readJson(EVENT_STORE_PATHS.queuePath);
const currentLocks = await readJson(EVENT_STORE_PATHS.locksPath);
const currentResults = await readJson(EVENT_STORE_PATHS.resultsPath);

const nextQueue = await buildQueueReadModel();
const nextLocks = await buildLockReadModel();
const nextResults = await buildResultReadModel();

const summaries = [
  modelSummary(currentQueue, nextQueue, "queue"),
  modelSummary(currentLocks, nextLocks, "locks"),
  modelSummary(currentResults, nextResults, "results")
];

console.log(`# Queue Read Model Rebuild ${args.apply ? "Apply" : "Dry Run"}`);
console.log(`task_events: ${events.length}`);
for (const summary of summaries) {
  console.log(`${summary.label}: changed=${summary.changed} current=${summary.current_count} next=${summary.next_count}`);
}

if (!args.apply) {
  console.log("mode: dry-run; no compatibility JSON files were written");
  process.exit(0);
}

await writeCompatibilityReadModels();
console.log("written: queue/task-queue.json");
console.log("written: queue/task-locks.json");
console.log("written: queue/task-results.json");
