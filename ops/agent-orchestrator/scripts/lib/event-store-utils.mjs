import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_LOCK_STATUSES, readJson, writeJson } from "./queue-utils.mjs";

const libDir = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(libDir);
const orchestratorDir = dirname(scriptsDir);
const eventsDir = join(orchestratorDir, "events");
const taskEventsDir = join(eventsDir, "tasks");
const queueDir = join(orchestratorDir, "queue");
const queuePath = join(queueDir, "task-queue.json");
const locksPath = join(queueDir, "task-locks.json");
const resultsPath = join(queueDir, "task-results.json");

const EVENT_SUBDIRS = ["tasks", "results", "locks", "audits"];
const LEGACY_QUEUE_VERSION = 1;

export const EVENT_FIRST_WRITE_PATH_STATUS = {
  "dispatch-ready-agents.mjs": "event-first-compatible: writes task.claimed events and legacy queue/lock JSON",
  "complete-task.mjs": "event-first-compatible: writes task.completed/task.failed events, per-task result artifacts, and legacy result JSON",
  "reconcile-task-results.mjs": "event-read-model-compatible: supports --from-events rebuild of queue/lock/result JSON",
  "audit-all-results.mjs": "json-first: audit events are not written yet",
  "integrate-agent-results.mjs": "json-first: integration/reconciliation events are not written yet"
};

export const EVENT_STORE_PATHS = {
  eventsDir,
  taskEventsDir,
  queuePath,
  locksPath,
  resultsPath
};

export const TASK_EVENT_TYPES = new Set([
  "task.created",
  "task.claimed",
  "task.started",
  "task.completed",
  "task.failed",
  "task.blocked",
  "task.deferred",
  "task.audited",
  "task.integrated",
  "task.reconciled"
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function timestampForFilename(value) {
  const iso = value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
  return iso.replaceAll(":", "").replaceAll(".", "");
}

function safeSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function eventFileName(event) {
  const timestamp = timestampForFilename(event.created_at);
  const type = safeSegment(event.event_type);
  const hash = createHash("sha256").update(event.event_id).digest("hex").slice(0, 12);
  return `${timestamp}-${type}-${hash}.json`;
}

function sortEvents(a, b) {
  const byTime = Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? "");
  if (!Number.isNaN(byTime) && byTime !== 0) return byTime;

  const byFile = String(a._file ?? "").localeCompare(String(b._file ?? ""));
  if (byFile !== 0) return byFile;

  return String(a.event_id ?? "").localeCompare(String(b.event_id ?? ""));
}

function maxIso(values) {
  const valid = values
    .map((value) => Date.parse(value ?? ""))
    .filter((value) => !Number.isNaN(value));
  if (valid.length === 0) {
    return new Date().toISOString();
  }
  return new Date(Math.max(...valid)).toISOString();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value);
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function statusByTask(queue) {
  return new Map((queue.tasks ?? []).map((task) => [task.task_id, task.status]));
}

function resultStatusByTask(results) {
  return new Map((results.results ?? []).map((result) => [result.task_id, result.status]));
}

function lockKeys(locks) {
  return new Set((locks.locks ?? []).map((lock) => `${lock.task_id}|${lock.agent}`));
}

function compareMaps(current, next) {
  const keys = new Set([...current.keys(), ...next.keys()]);
  const missingInReadModel = [];
  const extraInReadModel = [];
  const mismatches = [];

  for (const key of keys) {
    if (!next.has(key)) {
      missingInReadModel.push(key);
    } else if (!current.has(key)) {
      extraInReadModel.push(key);
    } else if (stable(current.get(key)) !== stable(next.get(key))) {
      mismatches.push({
        key,
        current: current.get(key),
        read_model: next.get(key)
      });
    }
  }

  return {
    consistent: missingInReadModel.length === 0 && extraInReadModel.length === 0 && mismatches.length === 0,
    missing_in_read_model: missingInReadModel,
    extra_in_read_model: extraInReadModel,
    mismatches
  };
}

function compareSets(current, next) {
  const missingInReadModel = [...current].filter((key) => !next.has(key));
  const extraInReadModel = [...next].filter((key) => !current.has(key));
  return {
    consistent: missingInReadModel.length === 0 && extraInReadModel.length === 0,
    missing_in_read_model: missingInReadModel,
    extra_in_read_model: extraInReadModel
  };
}

async function readLegacyJson(path, fallback) {
  if (!existsSync(path)) {
    return clone(fallback);
  }
  return readJson(path);
}

export async function ensureEventStore() {
  await mkdir(eventsDir, { recursive: true });
  for (const subdir of EVENT_SUBDIRS) {
    await mkdir(join(eventsDir, subdir), { recursive: true });
  }
}

export function normalizeTaskEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Task event must be an object.");
  }

  if (!event.task_id) {
    throw new Error("Task event missing task_id.");
  }

  if (!event.event_type || !TASK_EVENT_TYPES.has(event.event_type)) {
    throw new Error(`Unsupported task event type: ${event.event_type ?? "(missing)"}`);
  }

  const createdAt = event.created_at && !Number.isNaN(Date.parse(event.created_at))
    ? new Date(event.created_at).toISOString()
    : new Date().toISOString();

  return {
    event_id: event.event_id || randomUUID(),
    event_type: event.event_type,
    task_id: event.task_id,
    owner: event.owner ?? "",
    status_before: event.status_before ?? null,
    status_after: event.status_after ?? null,
    created_at: createdAt,
    actor: event.actor ?? "orchestrator",
    source: event.source ?? "event-store",
    reason: event.reason ?? "",
    changed_files: toArray(event.changed_files),
    result_ref: event.result_ref ?? "",
    audit_ref: event.audit_ref ?? "",
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {}
  };
}

export async function appendTaskEvent(event) {
  const normalized = normalizeTaskEvent(event);
  await ensureEventStore();

  const taskDir = join(taskEventsDir, safeSegment(normalized.task_id));
  await mkdir(taskDir, { recursive: true });

  const existing = await listTaskEvents(normalized.task_id);
  const duplicate = existing.find((item) => item.event_id === normalized.event_id);
  if (duplicate) {
    return {
      written: false,
      skipped: true,
      reason: "event_id_exists",
      path: duplicate._file,
      event: normalized
    };
  }

  const path = join(taskDir, eventFileName(normalized));
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, { flag: "wx" });
  return {
    written: true,
    skipped: false,
    path,
    event: normalized
  };
}

export async function listTaskEvents(taskId) {
  const taskDir = join(taskEventsDir, safeSegment(taskId));
  if (!existsSync(taskDir)) {
    return [];
  }

  const entries = await readdir(taskDir, { withFileTypes: true });
  const events = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const path = join(taskDir, entry.name);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    events.push({ ...parsed, _file: path });
  }

  return events.sort(sortEvents);
}

export async function listAllTaskEvents() {
  if (!existsSync(taskEventsDir)) {
    return [];
  }

  const entries = await readdir(taskEventsDir, { withFileTypes: true });
  const events = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    events.push(...(await listTaskEvents(entry.name)));
  }

  return events.sort(sortEvents);
}

function applyTaskEvent(task, event) {
  const next = task ?? {};
  const snapshot = event.metadata?.task_snapshot;

  if (snapshot && typeof snapshot === "object") {
    Object.assign(next, clone(snapshot));
  }

  next.task_id = next.task_id ?? event.task_id;
  next.owner = event.owner || next.owner;

  if (event.status_after) {
    next.status = event.status_after;
  }

  if (event.reason) {
    next.status_reason = event.reason;
  }

  next.updated_at = event.created_at ?? next.updated_at;
  return next;
}

export async function buildQueueReadModel() {
  const events = await listAllTaskEvents();
  if (events.length === 0) {
    return readLegacyJson(queuePath, { $schema: "./task-queue.schema.json", version: LEGACY_QUEUE_VERSION, tasks: [] });
  }

  const byTask = new Map();
  const queueOrder = new Map();

  for (const event of events) {
    const current = byTask.get(event.task_id);
    const next = applyTaskEvent(current, event);
    byTask.set(event.task_id, next);

    const order = event.metadata?.queue_index;
    if (Number.isInteger(order) && !queueOrder.has(event.task_id)) {
      queueOrder.set(event.task_id, order);
    }
  }

  const tasks = [...byTask.values()].sort((a, b) => {
    const aOrder = queueOrder.has(a.task_id) ? queueOrder.get(a.task_id) : Number.MAX_SAFE_INTEGER;
    const bOrder = queueOrder.has(b.task_id) ? queueOrder.get(b.task_id) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.task_id).localeCompare(String(b.task_id));
  });

  return {
    $schema: "./task-queue.schema.json",
    version: LEGACY_QUEUE_VERSION,
    updated_at: maxIso(events.map((event) => event.created_at)),
    tasks
  };
}

export async function buildLockReadModel() {
  const events = await listAllTaskEvents();
  if (events.length === 0) {
    return readLegacyJson(locksPath, { version: LEGACY_QUEUE_VERSION, locks: [] });
  }

  const statusByTask = new Map();
  const lockByTask = new Map();

  for (const event of events) {
    if (event.status_after) {
      statusByTask.set(event.task_id, event.status_after);
    }

    if (event.event_type === "task.claimed" || event.event_type === "task.started") {
      const snapshot = event.metadata?.lock_snapshot;
      lockByTask.set(event.task_id, snapshot && typeof snapshot === "object"
        ? clone(snapshot)
        : {
            task_id: event.task_id,
            agent: event.owner,
            claimed_at: event.created_at
          });
    }
  }

  const locks = [];
  for (const [taskId, lock] of lockByTask.entries()) {
    if (ACTIVE_LOCK_STATUSES.has(statusByTask.get(taskId))) {
      locks.push(lock);
    }
  }

  return {
    version: LEGACY_QUEUE_VERSION,
    updated_at: maxIso(events.map((event) => event.created_at)),
    locks: locks.sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)))
  };
}

export async function buildResultReadModel() {
  const events = await listAllTaskEvents();
  if (events.length === 0) {
    return readLegacyJson(resultsPath, { version: LEGACY_QUEUE_VERSION, results: [] });
  }

  const resultByTask = new Map();

  for (const event of events) {
    if (event.event_type !== "task.completed" && event.event_type !== "task.failed") {
      continue;
    }

    const snapshot = event.metadata?.result_snapshot;
    resultByTask.set(event.task_id, snapshot && typeof snapshot === "object"
      ? clone(snapshot)
      : {
          task_id: event.task_id,
          agent: event.owner,
          status: event.status_after,
          changed_files: toArray(event.changed_files),
          notes: event.reason,
          completed_at: event.created_at
        });
  }

  return {
    version: LEGACY_QUEUE_VERSION,
    updated_at: maxIso(events.map((event) => event.created_at)),
    results: [...resultByTask.values()].sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)))
  };
}

export async function writeCompatibilityReadModels() {
  const queue = await buildQueueReadModel();
  const locks = await buildLockReadModel();
  const results = await buildResultReadModel();

  await writeJson(queuePath, queue);
  await writeJson(locksPath, locks);
  await writeJson(resultsPath, results);

  return { queue, locks, results };
}

export async function buildEventStoreHealth(current = {}) {
  const events = await listAllTaskEvents();
  const currentQueue = current.queue ?? await readLegacyJson(queuePath, { $schema: "./task-queue.schema.json", version: LEGACY_QUEUE_VERSION, tasks: [] });
  const currentLocks = current.locks ?? await readLegacyJson(locksPath, { version: LEGACY_QUEUE_VERSION, locks: [] });
  const currentResults = current.results ?? await readLegacyJson(resultsPath, { version: LEGACY_QUEUE_VERSION, results: [] });
  const nextQueue = await buildQueueReadModel();
  const nextLocks = await buildLockReadModel();
  const nextResults = await buildResultReadModel();

  return {
    paths: {
      events_dir_exists: existsSync(eventsDir),
      tasks_dir_exists: existsSync(taskEventsDir),
      results_dir_exists: existsSync(join(eventsDir, "results")),
      locks_dir_exists: existsSync(join(eventsDir, "locks")),
      audits_dir_exists: existsSync(join(eventsDir, "audits"))
    },
    task_events: events.length,
    event_type_counts: countBy(events, (event) => event.event_type ?? "unknown"),
    read_model_consistency: {
      queue_status: compareMaps(statusByTask(currentQueue), statusByTask(nextQueue)),
      locks: compareSets(lockKeys(currentLocks), lockKeys(nextLocks)),
      results_status: compareMaps(resultStatusByTask(currentResults), resultStatusByTask(nextResults))
    },
    event_first_write_paths: EVENT_FIRST_WRITE_PATH_STATUS
  };
}
