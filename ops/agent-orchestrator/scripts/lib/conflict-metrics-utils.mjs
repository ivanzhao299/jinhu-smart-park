import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./queue-utils.mjs";

const libDir = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(libDir);
const orchestratorDir = dirname(scriptsDir);
const evolutionDir = join(orchestratorDir, "evolution");
export const conflictMetricsPath = join(evolutionDir, "conflict-metrics.json");

export const READ_MODEL_ONLY_FILES = [
  "ops/agent-orchestrator/queue/task-queue.json",
  "ops/agent-orchestrator/queue/task-locks.json",
  "ops/agent-orchestrator/queue/task-results.json"
];

export function emptyConflictMetrics() {
  return {
    schema_version: 1,
    record_type: "agent_orchestrator_conflict_metrics",
    updated_at: null,
    read_model_policy: {
      source_of_truth: "ops/agent-orchestrator/events/tasks",
      read_model_only: true,
      read_model_only_files: READ_MODEL_ONLY_FILES,
      integration_policy: "restore_queue_json_from_integration_branch_then_rebuild_from_events"
    },
    counters: {
      queue_conflicts: 0,
      integration_conflicts: 0,
      event_rebuilds: 0,
      read_model_rebuilds: 0,
      conflict_avoided: 0
    },
    recent_queue_conflicts: [],
    recent_integration_conflicts: [],
    recent_event_rebuilds: [],
    recent_read_model_rebuilds: [],
    recent_conflict_avoidance: []
  };
}

export async function readConflictMetrics() {
  if (!existsSync(conflictMetricsPath)) {
    return emptyConflictMetrics();
  }
  const metrics = await readJson(conflictMetricsPath);
  return {
    ...emptyConflictMetrics(),
    ...metrics,
    read_model_policy: {
      ...emptyConflictMetrics().read_model_policy,
      ...(metrics.read_model_policy ?? {})
    },
    counters: {
      ...emptyConflictMetrics().counters,
      ...(metrics.counters ?? {})
    },
    recent_queue_conflicts: metrics.recent_queue_conflicts ?? [],
    recent_integration_conflicts: metrics.recent_integration_conflicts ?? [],
    recent_event_rebuilds: metrics.recent_event_rebuilds ?? [],
    recent_read_model_rebuilds: metrics.recent_read_model_rebuilds ?? [],
    recent_conflict_avoidance: metrics.recent_conflict_avoidance ?? []
  };
}

export async function writeConflictMetrics(metrics) {
  await mkdir(evolutionDir, { recursive: true });
  await writeJson(conflictMetricsPath, metrics);
}

function trimRecent(items, limit = 50) {
  return [...items]
    .sort((a, b) => Date.parse(b.occurred_at ?? b.recorded_at ?? "") - Date.parse(a.occurred_at ?? a.recorded_at ?? ""))
    .slice(0, limit);
}

export async function recordConflictMetric(type, details = {}) {
  const metrics = await readConflictMetrics();
  const occurredAt = details.occurred_at ?? new Date().toISOString();
  const entry = {
    metric_id: details.metric_id ?? `${type}:${occurredAt}:${metrics.counters[type] ?? 0}`,
    occurred_at: occurredAt,
    source: details.source ?? "orchestrator",
    branch: details.branch ?? "",
    task_id: details.task_id ?? "",
    agent: details.agent ?? "",
    files: details.files ?? [],
    count: details.count ?? 1,
    reason: details.reason ?? "",
    metadata: details.metadata ?? {}
  };

  if (type === "queue_conflict") {
    metrics.counters.queue_conflicts += entry.count;
    metrics.recent_queue_conflicts = trimRecent([entry, ...metrics.recent_queue_conflicts]);
  } else if (type === "integration_conflict") {
    metrics.counters.integration_conflicts += entry.count;
    metrics.recent_integration_conflicts = trimRecent([entry, ...metrics.recent_integration_conflicts]);
  } else if (type === "event_rebuild") {
    metrics.counters.event_rebuilds += entry.count;
    metrics.recent_event_rebuilds = trimRecent([entry, ...metrics.recent_event_rebuilds]);
  } else if (type === "read_model_rebuild") {
    metrics.counters.read_model_rebuilds += entry.count;
    metrics.recent_read_model_rebuilds = trimRecent([entry, ...metrics.recent_read_model_rebuilds]);
  } else if (type === "conflict_avoided") {
    metrics.counters.conflict_avoided += entry.count;
    metrics.recent_conflict_avoidance = trimRecent([entry, ...metrics.recent_conflict_avoidance]);
  } else {
    throw new Error(`Unsupported conflict metric type: ${type}`);
  }

  metrics.updated_at = occurredAt;
  await writeConflictMetrics(metrics);
  return entry;
}

function recentCount(items = [], days = 7) {
  const floor = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const time = Date.parse(item.occurred_at ?? item.recorded_at ?? "");
    return !Number.isNaN(time) && time >= floor;
  }).length;
}

export function summarizeConflictMetrics(metrics, options = {}) {
  const recentQueueConflicts = recentCount(metrics.recent_queue_conflicts);
  const recentIntegrationConflicts = recentCount(metrics.recent_integration_conflicts);
  const recentEventRebuilds = recentCount(metrics.recent_event_rebuilds);
  const recentReadModelRebuilds = recentCount(metrics.recent_read_model_rebuilds);
  const recentConflictAvoided = recentCount(metrics.recent_conflict_avoidance);
  const readModelOnlyFiles = metrics.read_model_policy?.read_model_only_files ?? [];
  const readModelOnlyCoverage = READ_MODEL_ONLY_FILES.filter((file) => readModelOnlyFiles.includes(file)).length;
  const eventReadModelConsistent = options.eventReadModelConsistent !== false;
  const candidateQueueRisk = Boolean(options.candidateQueueRisk);

  let risk = "LOW";
  const reasons = [];
  if (!eventReadModelConsistent) {
    risk = "HIGH";
    reasons.push("event/read-model inconsistent");
  } else if (recentQueueConflicts >= 3 || recentIntegrationConflicts >= 2) {
    risk = "HIGH";
    reasons.push("repeated recent queue/integration conflicts");
  } else if (candidateQueueRisk || recentQueueConflicts > 0 || recentIntegrationConflicts > 0) {
    risk = "MEDIUM";
    reasons.push(candidateQueueRisk ? "candidate branch touches queue read model" : "recent queue/integration conflict recorded");
  } else {
    reasons.push("event store is source of truth and queue JSON is read-model-only");
  }

  return {
    risk,
    reasons,
    recent_queue_conflicts: recentQueueConflicts,
    recent_integration_conflicts: recentIntegrationConflicts,
    recent_event_rebuilds: recentEventRebuilds,
    recent_read_model_rebuilds: recentReadModelRebuilds,
    recent_conflict_avoided: recentConflictAvoided,
    read_model_only_coverage: {
      covered: readModelOnlyCoverage,
      total: READ_MODEL_ONLY_FILES.length,
      files: READ_MODEL_ONLY_FILES
    },
    counters: metrics.counters,
    read_model_policy: metrics.read_model_policy
  };
}
