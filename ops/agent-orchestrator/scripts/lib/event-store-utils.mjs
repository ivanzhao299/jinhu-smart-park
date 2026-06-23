import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { READ_MODEL_ONLY_FILES } from "./conflict-metrics-utils.mjs";
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
  "claim-task.mjs": "event-first: writes task.claimed events, then rebuilds legacy queue/lock JSON read models",
  "dispatch-ready-agents.mjs": "event-first: writes task.claimed events, then rebuilds legacy queue/lock JSON read models",
  "complete-task.mjs": "event-first: writes task.completed/task.failed events, then rebuilds legacy queue/lock/result JSON read models",
  "audit-all-results.mjs": "event-first foundation: --apply writes task.audited events, then rebuilds legacy queue/lock/result JSON read models",
  "integrate-agent-results.mjs": "event-first foundation: --apply writes task.integrated events for merged agent task results",
  "reconcile-task-results.mjs": "event-first-required when task events exist: rebuilds queue/lock/result JSON from events and records task.reconciled events when apply changes read models"
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
const NON_STATUS_MUTATING_EVENT_TYPES = new Set(["task.integrated"]);
const STATUS_ORDER = new Map([
  ["READY", 0],
  ["CLAIMED", 1],
  ["IN_PROGRESS", 2],
  ["BLOCKED", 2],
  ["DONE", 3],
  ["FAILED", 3],
  ["AUDITED", 4]
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

function stableKey(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deterministicEventId(prefix, value) {
  return `${prefix}:${stableKey(value).slice(0, 24)}`;
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

function projectedStatus(currentStatus, event) {
  const nextStatus = event.status_after ?? null;
  if (!nextStatus) return currentStatus;
  if (NON_STATUS_MUTATING_EVENT_TYPES.has(event.event_type)) return currentStatus;

  const currentRank = STATUS_ORDER.get(currentStatus);
  const nextRank = STATUS_ORDER.get(nextStatus);
  if (
    event.event_type === "task.reconciled"
    && currentRank !== undefined
    && nextRank !== undefined
    && nextRank < currentRank
  ) {
    return currentStatus;
  }

  return nextStatus;
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

function withoutRuntimeFields(event) {
  const snapshot = clone(event);
  delete snapshot._file;
  return snapshot;
}

function normalizeReadTaskEvent(event, path) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error(`Corrupt task event ${path}: event must be a JSON object.`);
  }

  for (const field of ["event_id", "event_type", "task_id", "created_at"]) {
    if (!event[field]) {
      throw new Error(`Corrupt task event ${path}: missing ${field}.`);
    }
  }

  if (!TASK_EVENT_TYPES.has(event.event_type)) {
    throw new Error(`Corrupt task event ${path}: unsupported event_type ${event.event_type}.`);
  }

  if (Number.isNaN(Date.parse(event.created_at))) {
    throw new Error(`Corrupt task event ${path}: invalid created_at ${event.created_at}.`);
  }

  return {
    ...normalizeTaskEvent(event),
    _file: path
  };
}

function dedupeTaskEvents(events) {
  const byId = new Map();
  const deduped = [];

  for (const event of events) {
    const key = event.event_id;
    const previous = byId.get(key);
    if (!previous) {
      byId.set(key, event);
      deduped.push(event);
      continue;
    }

    const previousContent = stable(withoutRuntimeFields(previous));
    const currentContent = stable(withoutRuntimeFields(event));
    if (previousContent !== currentContent) {
      throw new Error(`Conflicting task event_id ${key}: ${previous._file} and ${event._file}.`);
    }
  }

  return deduped;
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
  const idempotencyKey = normalized.metadata?.idempotency_key;
  if (idempotencyKey) {
    const duplicateByKey = existing.find((item) =>
      item.event_type === normalized.event_type &&
      item.source === normalized.source &&
      item.metadata?.idempotency_key === idempotencyKey
    );
    if (duplicateByKey) {
      return {
        written: false,
        skipped: true,
        reason: "idempotency_key_exists",
        path: duplicateByKey._file,
        event: normalized
      };
    }
  }

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

export async function appendAuditEvent({
  task,
  result,
  auditStatus,
  failures = [],
  changedFiles = [],
  actor = "orchestrator",
  source = "audit-all-results.mjs",
  createdAt,
  dryRun = false
}) {
  const taskId = task?.task_id ?? result?.task_id;
  const timestamp = createdAt ?? new Date().toISOString();
  const normalizedAuditStatus = String(auditStatus ?? "").toUpperCase() === "PASS" ? "PASS" : "FAIL";
  const reason = normalizedAuditStatus === "PASS"
    ? "audit passed"
    : failures.join("; ") || "audit failed";
  const idempotencyKey = stableKey({
    event_type: "task.audited",
    source,
    task_id: taskId,
    audit_status: normalizedAuditStatus,
    result_completed_at: result?.completed_at ?? result?.updated_at ?? "",
    changed_files: toArray(changedFiles),
    failures: toArray(failures)
  });

  const event = {
    event_id: deterministicEventId("task.audited", idempotencyKey),
    event_type: "task.audited",
    task_id: taskId,
    owner: task?.owner ?? result?.agent ?? "",
    status_before: task?.status ?? null,
    status_after: normalizedAuditStatus === "PASS" ? "AUDITED" : task?.status ?? null,
    created_at: timestamp,
    actor,
    source,
    reason,
    changed_files: toArray(changedFiles),
    result_ref: taskId ? `ops/agent-orchestrator/results/${taskId}.json` : "",
    metadata: {
      idempotency_key: idempotencyKey,
      audit_status: normalizedAuditStatus,
      failures: toArray(failures),
      result_snapshot: result ? clone(result) : undefined,
      task_snapshot: normalizedAuditStatus === "PASS" && task
        ? { ...clone(task), status: "AUDITED", updated_at: timestamp }
        : task ? clone(task) : undefined
    }
  };

  return dryRun ? { written: false, skipped: true, reason: "dry_run", path: "", event } : appendTaskEvent(event);
}

export async function appendIntegrationEvent({
  task,
  taskId,
  owner,
  agentId,
  agentBranch,
  agentHead,
  integrationBranch,
  mergeCommit,
  changedFiles = [],
  actor = "orchestrator",
  source = "integrate-agent-results.mjs",
  createdAt,
  dryRun = false
}) {
  const resolvedTaskId = task?.task_id ?? taskId;
  const timestamp = createdAt ?? new Date().toISOString();
  const idempotencyKey = stableKey({
    event_type: "task.integrated",
    source,
    task_id: resolvedTaskId,
    agent_id: agentId,
    agent_head: agentHead,
    integration_branch: integrationBranch,
    merge_commit: mergeCommit
  });
  const status = task?.status ?? null;
  const event = {
    event_id: deterministicEventId("task.integrated", idempotencyKey),
    event_type: "task.integrated",
    task_id: resolvedTaskId,
    owner: owner ?? task?.owner ?? agentId ?? "",
    status_before: status,
    status_after: status,
    created_at: timestamp,
    actor,
    source,
    reason: `integrated ${agentId ?? "agent"} result into ${integrationBranch ?? "integration branch"}`,
    changed_files: toArray(changedFiles),
    metadata: {
      idempotency_key: idempotencyKey,
      agent_id: agentId,
      agent_branch: agentBranch,
      agent_head: agentHead,
      integration_branch: integrationBranch,
      merge_commit: mergeCommit,
      task_snapshot: task ? clone(task) : undefined
    }
  };

  return dryRun ? { written: false, skipped: true, reason: "dry_run", path: "", event } : appendTaskEvent(event);
}

export async function appendCompletionBackfillEvent({
  task,
  result,
  resultRef = "",
  statusBefore,
  actor = "orchestrator",
  source = "reconcile-task-results.mjs",
  reason = "backfilled task.completed from committed result artifact",
  changedFiles,
  createdAt,
  dryRun = false
}) {
  const resolvedTaskId = task?.task_id ?? result?.task_id;
  const timestamp = createdAt ?? (
    result?.completed_at && !Number.isNaN(Date.parse(result.completed_at))
      ? new Date(result.completed_at).toISOString()
      : new Date().toISOString()
  );
  const normalizedStatus = String(result?.status ?? "").toUpperCase();
  if (normalizedStatus !== "DONE") {
    throw new Error(`Completion backfill requires a DONE result for ${resolvedTaskId ?? "(missing task)"}.`);
  }

  const idempotencyKey = stableKey({
    event_type: "task.completed",
    source,
    task_id: resolvedTaskId,
    result_ref: resultRef,
    result_completed_at: result?.completed_at ?? "",
    result_agent: result?.agent ?? "",
    commit_hash: result?.commit_hash ?? "",
    changed_files: toArray(changedFiles ?? result?.changed_files)
  });
  const resultSnapshot = clone({ ...result, status: normalizedStatus });
  const taskSnapshot = task
    ? { ...clone(task), status: normalizedStatus, updated_at: timestamp }
    : {
        task_id: resolvedTaskId,
        owner: result?.agent ?? "",
        status: normalizedStatus,
        updated_at: timestamp
      };
  const event = {
    event_id: deterministicEventId("task.completed.backfill", idempotencyKey),
    event_type: "task.completed",
    task_id: resolvedTaskId,
    owner: result?.agent ?? task?.owner ?? "",
    status_before: statusBefore ?? task?.status ?? null,
    status_after: normalizedStatus,
    created_at: timestamp,
    actor,
    source,
    reason,
    changed_files: toArray(changedFiles ?? result?.changed_files),
    result_ref: resultRef,
    metadata: {
      idempotency_key: idempotencyKey,
      backfill: true,
      evidence_artifact: resultRef,
      result_snapshot: resultSnapshot,
      task_snapshot: taskSnapshot
    }
  };

  return dryRun ? { written: false, skipped: true, reason: "dry_run", path: "", event } : appendTaskEvent(event);
}

export async function appendReconciledEvent({
  task,
  taskId,
  owner,
  statusBefore,
  statusAfter,
  actor = "orchestrator",
  source = "reconcile-task-results.mjs",
  reason = "reconciled compatibility read model from events",
  changedFiles = [],
  metadata = {},
  createdAt,
  dryRun = false
}) {
  const resolvedTaskId = task?.task_id ?? taskId;
  const timestamp = createdAt ?? new Date().toISOString();
  const finalStatus = statusAfter ?? task?.status ?? statusBefore ?? null;
  const idempotencyKey = stableKey({
    event_type: "task.reconciled",
    source,
    task_id: resolvedTaskId,
    status_before: statusBefore ?? task?.status ?? null,
    status_after: finalStatus,
    reason,
    metadata
  });
  const event = {
    event_id: deterministicEventId("task.reconciled", idempotencyKey),
    event_type: "task.reconciled",
    task_id: resolvedTaskId,
    owner: owner ?? task?.owner ?? "",
    status_before: statusBefore ?? task?.status ?? null,
    status_after: finalStatus,
    created_at: timestamp,
    actor,
    source,
    reason,
    changed_files: toArray(changedFiles),
    metadata: {
      idempotency_key: idempotencyKey,
      ...metadata,
      task_snapshot: task ? { ...clone(task), status: finalStatus, updated_at: timestamp } : undefined
    }
  };

  return dryRun ? { written: false, skipped: true, reason: "dry_run", path: "", event } : appendTaskEvent(event);
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
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      throw new Error(`Corrupt task event ${path}: invalid JSON (${error.message}).`);
    }
    events.push(normalizeReadTaskEvent(parsed, path));
  }

  return dedupeTaskEvents(events).sort(sortEvents);
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

  return dedupeTaskEvents(events).sort(sortEvents);
}

function applyTaskEvent(task, event) {
  let next = task ? clone(task) : {};
  const previousStatus = next.status;
  const snapshot = event.metadata?.task_snapshot;
  const snapshotHasStatus = snapshot && typeof snapshot === "object" && Boolean(snapshot.status);

  if (!task && !snapshotHasStatus && !event.status_after) {
    return null;
  }

  if (snapshot && typeof snapshot === "object") {
    next = clone(snapshot);
  }

  next.task_id = next.task_id ?? event.task_id;
  next.owner = event.owner || next.owner;

  const nextStatus = projectedStatus(previousStatus ?? next.status, event);
  if (nextStatus) {
    next.status = nextStatus;
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
    if (!next) {
      continue;
    }
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
    read_model_only: true,
    source_of_truth: "ops/agent-orchestrator/events/tasks",
    generated_by: "ops/agent-orchestrator/scripts/lib/event-store-utils.mjs",
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
    const nextStatus = projectedStatus(statusByTask.get(event.task_id), event);
    if (nextStatus) {
      statusByTask.set(event.task_id, nextStatus);
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
    read_model_only: true,
    source_of_truth: "ops/agent-orchestrator/events/tasks",
    generated_by: "ops/agent-orchestrator/scripts/lib/event-store-utils.mjs",
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
    read_model_only: true,
    source_of_truth: "ops/agent-orchestrator/events/tasks",
    generated_by: "ops/agent-orchestrator/scripts/lib/event-store-utils.mjs",
    updated_at: maxIso(events.map((event) => event.created_at)),
    results: [...resultByTask.values()].sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)))
  };
}

export async function buildAuditReadModel() {
  const events = await listAllTaskEvents();
  const auditsByTask = new Map();
  const integrationsByTask = new Map();
  const reconciliationsByTask = new Map();

  for (const event of events) {
    if (event.event_type === "task.audited") {
      auditsByTask.set(event.task_id, clone(event));
    } else if (event.event_type === "task.integrated") {
      integrationsByTask.set(event.task_id, clone(event));
    } else if (event.event_type === "task.reconciled") {
      reconciliationsByTask.set(event.task_id, clone(event));
    }
  }

  return {
    updated_at: maxIso(events.map((event) => event.created_at)),
    event_type_counts: countBy(events, (event) => event.event_type ?? "unknown"),
    audit_status_counts: countBy([...auditsByTask.values()], (event) => event.metadata?.audit_status ?? "UNKNOWN"),
    audited_tasks: [...auditsByTask.keys()].sort(),
    integrated_tasks: [...integrationsByTask.keys()].sort(),
    reconciled_tasks: [...reconciliationsByTask.keys()].sort(),
    latest_audit_by_task: Object.fromEntries([...auditsByTask.entries()].sort(([left], [right]) => left.localeCompare(right))),
    latest_integration_by_task: Object.fromEntries([...integrationsByTask.entries()].sort(([left], [right]) => left.localeCompare(right))),
    latest_reconciliation_by_task: Object.fromEntries([...reconciliationsByTask.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
}

export async function writeCompatibilityReadModels(options = {}) {
  const includeQueue = options.queue !== false;
  const includeLocks = options.locks !== false;
  const includeResults = options.results !== false;

  const queue = includeQueue ? await buildQueueReadModel() : undefined;
  const locks = includeLocks ? await buildLockReadModel() : undefined;
  const results = includeResults ? await buildResultReadModel() : undefined;

  if (includeQueue) await writeJson(queuePath, queue);
  if (includeLocks) await writeJson(locksPath, locks);
  if (includeResults) await writeJson(resultsPath, results);

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
  const auditReadModel = await buildAuditReadModel();

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
    audit_read_model: auditReadModel,
    read_model_only: {
      enabled: true,
      files: READ_MODEL_ONLY_FILES,
      coverage: READ_MODEL_ONLY_FILES.length,
      total: READ_MODEL_ONLY_FILES.length,
      source_of_truth: "ops/agent-orchestrator/events/tasks"
    },
    read_model_consistency: {
      queue_status: compareMaps(statusByTask(currentQueue), statusByTask(nextQueue)),
      locks: compareSets(lockKeys(currentLocks), lockKeys(nextLocks)),
      results_status: compareMaps(resultStatusByTask(currentResults), resultStatusByTask(nextResults))
    },
    event_first_write_paths: EVENT_FIRST_WRITE_PATH_STATUS
  };
}
