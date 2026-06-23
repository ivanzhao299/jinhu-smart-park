import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEventStoreHealth, listAllTaskEvents } from "./event-store-utils.mjs";
import { readConflictMetrics, summarizeConflictMetrics } from "./conflict-metrics-utils.mjs";
import { latestResultFor, mergeResultsByTask, nowIso, readJson, readResultFiles, writeJson } from "./queue-utils.mjs";

const libDir = dirname(fileURLToPath(import.meta.url));
const scriptsDir = dirname(libDir);
const orchestratorDir = dirname(scriptsDir);
const repoRoot = dirname(dirname(orchestratorDir));

export const evolutionDir = join(orchestratorDir, "evolution");
export const failurePatternsPath = join(evolutionDir, "failure-patterns.json");
export const learningLogPath = join(evolutionDir, "learning-log.json");
export const improvementBacklogPath = join(evolutionDir, "improvement-backlog.json");
export const evolutionStatePath = join(evolutionDir, "evolution-state.json");
export const queuePath = join(orchestratorDir, "queue", "task-queue.json");
export const locksPath = join(orchestratorDir, "queue", "task-locks.json");
export const resultsPath = join(orchestratorDir, "queue", "task-results.json");
export const perTaskResultsDir = join(orchestratorDir, "results");
export const runsDir = join(orchestratorDir, "runs");
const generatedGoalDir = join(orchestratorDir, "goal", "generated");
const generatedPlannerDir = join(orchestratorDir, "planner", "generated");

export const EVOLUTION_FORBIDDEN_PATHS = [
  "apps/**",
  "packages/**",
  "database/**",
  "infra/**",
  ".github/**",
  "Dockerfile",
  "Dockerfile.*",
  "docker-compose*",
  "deploy/**",
  "auth/**",
  ".env",
  ".env.*"
];

const EVOLUTION_SCRIPT_PATHS = [
  "ops/agent-orchestrator/scripts/**",
  "ops/agent-orchestrator/evolution/**",
  "ops/agent-orchestrator/events/**",
  "ops/agent-orchestrator/queue/**",
  "ops/agent-orchestrator/reports/**",
  "ops/agent-orchestrator/results/**",
  "docs/release/**",
  "docs/testing/**"
];

const IMPROVEMENT_TEMPLATES = {
  "PATTERN-001": {
    improvement_id: "IMPROVE-RUNTIME-PLAN-ARTIFACT",
    title: "Make agent-run-plan.md an ephemeral runtime artifact",
    root_cause: "Generated runner plans can dirty the main worktree and block integration or finalize even when no business file changed.",
    proposed_solution: "Keep agent-run-plan.md no-write in dry-run flows and let self-repair safely restore it when it is the only dirty runtime artifact.",
    risk: "LOW",
    priority: "P0",
    owner_recommendation: "agent-5",
    allowed_paths: EVOLUTION_SCRIPT_PATHS,
    forbidden_paths: EVOLUTION_FORBIDDEN_PATHS,
    validation_commands: [
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs self-repair --dry-run --reason \"agent-run-plan runtime dirty\"",
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "git diff --check",
      "pnpm typecheck"
    ],
    acceptance_criteria: [
      "Self-repair identifies agent-run-plan.md as a LOW-risk runtime artifact.",
      "Self-repair restores only agent-run-plan.md when it is the sole dirty main-worktree file.",
      "Non-runtime dirty files still block with NO_GO."
    ],
    auto_fix_allowed: true,
    requires_approval: false,
    expected_output_files: [
      "ops/agent-orchestrator/reports/IMPROVE-RUNTIME-PLAN-ARTIFACT.md",
      "ops/agent-orchestrator/results/IMPROVE-RUNTIME-PLAN-ARTIFACT.json",
      "docs/testing/evolution-runtime-plan-artifact-checklist.md"
    ]
  },
  "PATTERN-002": {
    improvement_id: "IMPROVE-COMPLETED-EVENT-BACKFILL",
    title: "Backfill completed events from truthful result artifacts",
    root_cause: "Successful run logs and result artifacts can exist while task.completed events or DONE read-model state are missing.",
    proposed_solution: "Teach complete/reconcile to backfill task.completed events from result artifacts, run logs, and agent commit evidence without re-running agents.",
    risk: "MEDIUM",
    priority: "P0",
    owner_recommendation: "agent-5",
    allowed_paths: EVOLUTION_SCRIPT_PATHS,
    forbidden_paths: EVOLUTION_FORBIDDEN_PATHS,
    validation_commands: [
      "node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --apply",
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
      "pnpm typecheck"
    ],
    acceptance_criteria: [
      "Successful run logs with committed result artifacts can be reconciled into DONE state.",
      "Backfilled task.completed events are idempotent.",
      "No business evidence is fabricated."
    ],
    auto_fix_allowed: false,
    requires_approval: true,
    expected_output_files: [
      "ops/agent-orchestrator/reports/IMPROVE-COMPLETED-EVENT-BACKFILL.md",
      "ops/agent-orchestrator/results/IMPROVE-COMPLETED-EVENT-BACKFILL.json",
      "docs/testing/evolution-completed-event-backfill-checklist.md"
    ]
  },
  "PATTERN-005": {
    improvement_id: "IMPROVE-QUEUE-CONFLICT-REDUCTION",
    title: "Reduce queue bookkeeping conflicts with event-first read models",
    root_cause: "Legacy queue JSON can still conflict with event-store read models during integration and reconciliation.",
    proposed_solution: "Move remaining status-changing paths toward event-first writes and make compatibility JSON a generated read model wherever possible.",
    risk: "MEDIUM",
    priority: "P1",
    owner_recommendation: "agent-5",
    allowed_paths: EVOLUTION_SCRIPT_PATHS,
    forbidden_paths: EVOLUTION_FORBIDDEN_PATHS,
    validation_commands: [
      "node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run",
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
      "pnpm typecheck"
    ],
    acceptance_criteria: [
      "Doctor reports event/read-model consistency after rebuild dry-run.",
      "Queue bookkeeping conflicts are handled through event-first reconcile rules.",
      "Compatibility queue JSON remains readable by existing agent-cycle commands."
    ],
    auto_fix_allowed: false,
    requires_approval: true,
    expected_output_files: [
      "ops/agent-orchestrator/reports/IMPROVE-QUEUE-CONFLICT-REDUCTION.md",
      "ops/agent-orchestrator/results/IMPROVE-QUEUE-CONFLICT-REDUCTION.json",
      "docs/testing/evolution-queue-conflict-reduction-checklist.md"
    ]
  }
};

function emptyPatterns() {
  return {
    schema_version: 1,
    record_type: "agent_orchestrator_failure_patterns",
    updated_at: null,
    patterns: []
  };
}

function emptyLearningLog() {
  return {
    schema_version: 1,
    record_type: "agent_orchestrator_learning_log",
    updated_at: null,
    entries: []
  };
}

function emptyBacklog() {
  return {
    schema_version: 1,
    record_type: "agent_orchestrator_improvement_backlog",
    updated_at: null,
    improvements: []
  };
}

function emptyState() {
  return {
    schema_version: 1,
    record_type: "agent_orchestrator_evolution_state",
    updated_at: null,
    observer_version: "v3-e-mvp",
    last_observed_at: null,
    last_planned_at: null,
    last_run_mode: "uninitialized",
    maturity: {
      current_score: null,
      target_score: null,
      status: "unknown"
    },
    last_summary: {},
    next_action: []
  };
}

async function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback();
  return readJson(path);
}

export async function readEvolutionData() {
  const [failurePatterns, learningLog, improvementBacklog, evolutionState] = await Promise.all([
    readJsonIfExists(failurePatternsPath, emptyPatterns),
    readJsonIfExists(learningLogPath, emptyLearningLog),
    readJsonIfExists(improvementBacklogPath, emptyBacklog),
    readJsonIfExists(evolutionStatePath, emptyState)
  ]);

  return {
    failurePatterns,
    learningLog,
    improvementBacklog,
    evolutionState
  };
}

export async function writeEvolutionData(data) {
  await mkdir(evolutionDir, { recursive: true });
  if (data.failurePatterns) await writeJson(failurePatternsPath, data.failurePatterns);
  if (data.learningLog) await writeJson(learningLogPath, data.learningLog);
  if (data.improvementBacklog) await writeJson(improvementBacklogPath, data.improvementBacklog);
  if (data.evolutionState) await writeJson(evolutionStatePath, data.evolutionState);
}

export function buildEvolutionSummary(data) {
  const patterns = data.failurePatterns?.patterns ?? [];
  const improvements = data.improvementBacklog?.improvements ?? [];
  const entries = data.learningLog?.entries ?? [];
  const open = improvements.filter((item) => item.status !== "RESOLVED");
  const resolved = improvements.filter((item) => item.status === "RESOLVED");
  const repeated = patterns.filter((pattern) => (pattern.occurrences ?? 0) > 1);
  const topRecurringFailures = [...patterns]
    .sort((a, b) => (b.occurrences ?? 0) - (a.occurrences ?? 0))
    .slice(0, 5)
    .map((pattern) => ({
      pattern_id: pattern.pattern_id,
      title: pattern.title,
      occurrences: pattern.occurrences ?? 0,
      risk_level: pattern.risk_level ?? "UNKNOWN",
      status: pattern.status ?? "UNKNOWN"
    }));
  const improvementCandidates = sortImprovementCandidates(normalizeImprovementCandidates(data, null));
  const latestPatternOrLearning = Math.max(
    Date.parse(data.failurePatterns?.updated_at ?? "") || 0,
    Date.parse(data.learningLog?.updated_at ?? "") || 0
  );
  const latestPlan = Date.parse(data.evolutionState?.last_planned_at ?? data.improvementBacklog?.updated_at ?? "") || 0;

  return {
    pattern_count: patterns.length,
    open_improvements: open.length,
    resolved_improvements: resolved.length,
    learning_entries: entries.length,
    repeated_pattern_count: repeated.length,
    top_recurring_failures: topRecurringFailures,
    top_improvement_candidates: improvementCandidates.slice(0, 3).map((item) => ({
      improvement_id: item.improvement_id,
      source_pattern_id: item.source_pattern_id,
      title: item.title,
      priority: item.priority,
      risk: item.risk,
      owner_recommendation: item.owner_recommendation,
      score: item.score
    })),
    highest_priority_improvement: improvementCandidates[0]?.improvement_id ?? "",
    evolution_backlog_stale: latestPatternOrLearning > 0 && latestPlan > 0 ? latestPatternOrLearning > latestPlan : latestPatternOrLearning > 0
  };
}

function runCapture(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? ""
  };
}

function runNodeCapture(script, args = []) {
  return runCapture("node", [script, ...args]);
}

function parseDoctorJson() {
  const result = runNodeCapture("ops/agent-orchestrator/scripts/doctor.mjs", ["--json"]);
  if (result.status !== 0) {
    return {
      status: "ERROR",
      error: [result.stdout, result.stderr, result.error].filter(Boolean).join("\n").trim()
    };
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      status: "ERROR",
      error: `doctor --json was not parseable: ${error.message}`
    };
  }
}

async function recentRunLogs(queue, results, perTaskResults) {
  if (!existsSync(runsDir)) return [];
  const names = await readdir(runsDir);
  const mergedResults = mergeResultsByTask(results.results ?? [], perTaskResults);
  const logs = [];

  for (const name of names.filter((item) => item.endsWith(".run.log"))) {
    const absolute = join(runsDir, name);
    const text = await readFile(absolute, "utf8");
    const info = await stat(absolute);
    const taskId = /^task_id:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? name.replace(/\.run\.log$/, "");
    const agent = /^agent:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
    const exitCodeText = /^exit_code:\s*(\d+)$/m.exec(text)?.[1];
    const exitCode = exitCodeText ? Number.parseInt(exitCodeText, 10) : null;
    const task = (queue.tasks ?? []).find((item) => item.task_id === taskId);
    const result = latestResultFor({ results: mergedResults }, taskId);
    logs.push({
      task_id: taskId,
      agent,
      path: relative(repoRoot, absolute),
      mtime: info.mtime.toISOString(),
      exit_code: exitCode,
      task_status: task?.status ?? "MISSING",
      result_status: result?.status ?? "MISSING"
    });
  }

  return logs.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime)).slice(0, 12);
}

async function listGeneratedJson(dir) {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  const files = [];
  for (const name of names.filter((item) => item.endsWith(".json"))) {
    const absolute = join(dir, name);
    const info = await stat(absolute);
    files.push({
      path: relative(repoRoot, absolute),
      mtime: info.mtime.toISOString()
    });
  }
  return files.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
}

async function inspectGoalToQueueArtifacts() {
  const [goals, plannerOutputs, events] = await Promise.all([
    listGeneratedJson(generatedGoalDir),
    listGeneratedJson(generatedPlannerDir),
    listAllTaskEvents()
  ]);
  const goalToQueueEvents = events.filter((event) => event.source === "goal-to-queue.mjs");
  const createdEvents = goalToQueueEvents.filter((event) => event.event_type === "task.created");
  const goalIds = [...new Set(goalToQueueEvents.map((event) => event.metadata?.source_goal_id).filter(Boolean))];
  const plannerOutputIds = [...new Set(goalToQueueEvents.map((event) => event.metadata?.planner_output_id).filter(Boolean))];

  return {
    goal_created: goals.length > 0,
    planner_output_created: plannerOutputs.length > 0,
    task_queue_generated_from_goal: createdEvents.length > 0,
    generated_goal_count: goals.length,
    generated_planner_output_count: plannerOutputs.length,
    goal_to_queue_task_created_events: createdEvents.length,
    latest_goal: goals[0] ?? null,
    latest_planner_output: plannerOutputs[0] ?? null,
    goal_ids: goalIds,
    planner_output_ids: plannerOutputIds
  };
}

function matchPatterns(patterns, findings) {
  const haystack = findings.map((finding) => `${finding.message ?? ""} ${finding.suggested_fix ?? ""}`).join("\n").toLowerCase();
  return patterns
    .map((pattern) => {
      const hints = pattern.matching_hints ?? [];
      const matchedHints = hints.filter((hint) => haystack.includes(String(hint).toLowerCase()));
      return {
        pattern_id: pattern.pattern_id,
        title: pattern.title,
        risk_level: pattern.risk_level,
        occurrences: pattern.occurrences ?? 0,
        matched_hints: matchedHints,
        currently_detected: matchedHints.length > 0
      };
    })
    .filter((item) => item.currently_detected);
}

function deriveFindings({ doctor, queue, locks, eventStore, logs, integration, conflictMetrics }) {
  const findings = [];
  for (const finding of doctor.findings ?? []) {
    findings.push({
      severity: finding.severity ?? "INFO",
      area: finding.area ?? "doctor",
      message: finding.message ?? "",
      suggested_fix: finding.suggested_fix ?? ""
    });
  }

  if (doctor.error) {
    findings.push({
      severity: "ERROR",
      area: "doctor",
      message: doctor.error,
      suggested_fix: "Fix doctor before relying on resident observer automation."
    });
  }

  if (integration.status !== 0) {
    findings.push({
      severity: "ERROR",
      area: "integration",
      message: `integrate-agent-results --dry-run failed with exit ${integration.status}`,
      suggested_fix: "Inspect integration dry-run before creating an integration branch."
    });
  }

  if (conflictMetrics?.risk === "HIGH") {
    findings.push({
      severity: "ERROR",
      area: "integration",
      message: `Queue conflict frequency risk is HIGH: ${conflictMetrics.reasons.join("; ")}`,
      suggested_fix: "Generate or execute a queue conflict reduction improvement before more parallel integration."
    });
  } else if (conflictMetrics?.risk === "MEDIUM") {
    findings.push({
      severity: "WARN",
      area: "integration",
      message: `Queue conflict frequency risk is MEDIUM: ${conflictMetrics.reasons.join("; ")}`,
      suggested_fix: "Keep integration event-first and rebuild compatibility read models from events."
    });
  }

  const taskById = new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
  const lockPairs = new Map();
  for (const lock of locks.locks ?? []) {
    const key = `${lock.task_id}|${lock.agent}`;
    lockPairs.set(key, (lockPairs.get(key) ?? 0) + 1);
    const task = taskById.get(lock.task_id);
    if (task?.status === "DONE") {
      findings.push({
        severity: "WARN",
        area: "locks",
        message: `DONE task still has active lock: ${lock.task_id}`,
        suggested_fix: "Remove DONE task lock through doctor or reconcile."
      });
    }
  }
  for (const [key, count] of lockPairs) {
    if (count > 1) {
      findings.push({
        severity: "ERROR",
        area: "locks",
        message: `duplicate lock entries for ${key}: ${count}`,
        suggested_fix: "Run doctor --fix-dry-run before --fix-apply."
      });
    }
  }

  for (const log of logs) {
    if (log.exit_code === 0 && log.result_status !== "DONE") {
      findings.push({
        severity: "WARN",
        area: "runner",
        message: `run.log exit 0 but task result is not DONE for ${log.task_id}`,
        suggested_fix: "Reconcile truthful result evidence without re-running the agent."
      });
    }
  }

  const consistency = eventStore.read_model_consistency ?? {};
  if (consistency.queue_status && !consistency.queue_status.consistent) {
    findings.push({
      severity: "WARN",
      area: "events",
      message: "event queue read model differs from task-queue.json",
      suggested_fix: "Run rebuild-queue-read-model.mjs --dry-run."
    });
  }
  if (consistency.locks && !consistency.locks.consistent) {
    findings.push({
      severity: "WARN",
      area: "events",
      message: "event lock read model differs from task-locks.json",
      suggested_fix: "Review event lock read model before apply."
    });
  }
  if (consistency.results_status && !consistency.results_status.consistent) {
    findings.push({
      severity: "WARN",
      area: "events",
      message: "event result read model differs from task-results.json",
      suggested_fix: "Review result artifacts before read-model apply."
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "INFO",
      area: "observer",
      message: "No active failures detected by resident observer.",
      suggested_fix: "Continue normal agent-cycle or observe periodically."
    });
  }

  return findings;
}

function ownerForImprovement(improvement) {
  const text = `${improvement.title ?? ""} ${improvement.pattern_id ?? ""}`.toLowerCase();
  if (text.includes("router") || text.includes("registry") || text.includes("ui")) return "agent-4";
  if (text.includes("validation") || text.includes("typecheck") || text.includes("audit")) return "agent-2";
  if (text.includes("lock") || text.includes("read model") || text.includes("event-derived")) return "agent-3";
  if (text.includes("docs") || text.includes("manual")) return "agent-1";
  return improvement.owner_recommendation ?? "agent-5";
}

const RISK_SCORE = new Map([
  ["LOW", 1],
  ["MEDIUM", 2],
  ["HIGH", 3]
]);

const PRIORITY_SCORE = new Map([
  ["P0", 4],
  ["P1", 3],
  ["P2", 2],
  ["P3", 1]
]);

function patternById(data) {
  return new Map((data.failurePatterns?.patterns ?? []).map((pattern) => [pattern.pattern_id, pattern]));
}

function existingImprovementById(data) {
  return new Map((data.improvementBacklog?.improvements ?? []).map((item) => [item.improvement_id, item]));
}

function riskFrom(value, fallback = "LOW") {
  return String(value ?? fallback).toUpperCase();
}

function priorityFrom(value, fallback = "P2") {
  return String(value ?? fallback).toUpperCase();
}

function candidateScore(candidate) {
  const occurrences = Number(candidate.occurrence_count ?? 0);
  const severity = RISK_SCORE.get(candidate.risk) ?? 1;
  const priority = PRIORITY_SCORE.get(candidate.priority) ?? 1;
  const active = candidate.active_now ? 4 : 0;
  return occurrences * 10 + severity * 8 + priority * 4 + active;
}

function mergeTemplateWithBacklog(template, pattern, existing = null, activePatternIds = new Set()) {
  const risk = riskFrom(existing?.risk ?? existing?.risk_level ?? template.risk, template.risk);
  const priority = priorityFrom(existing?.priority ?? template.priority, template.priority);
  const acceptanceCriteria = existing?.acceptance_criteria ?? existing?.acceptance ?? template.acceptance_criteria ?? [];
  const validationCommands = existing?.validation_commands ?? existing?.validation_plan ?? template.validation_commands ?? [];
  const candidate = {
    improvement_id: template.improvement_id,
    source_pattern_id: template.source_pattern_id ?? pattern?.pattern_id ?? existing?.source_pattern_id ?? existing?.pattern_id ?? "",
    pattern_id: template.source_pattern_id ?? pattern?.pattern_id ?? existing?.source_pattern_id ?? existing?.pattern_id ?? "",
    title: existing?.title ?? template.title,
    root_cause: existing?.root_cause ?? template.root_cause ?? (pattern?.root_causes ?? []).join("; "),
    proposed_solution: existing?.proposed_solution ?? template.proposed_solution ?? (pattern?.recommended_improvements ?? []).join("; "),
    risk,
    risk_level: risk,
    priority,
    owner_recommendation: existing?.owner_recommendation ?? template.owner_recommendation ?? ownerForImprovement(existing ?? template),
    allowed_paths: existing?.allowed_paths ?? template.allowed_paths ?? EVOLUTION_SCRIPT_PATHS,
    forbidden_paths: existing?.forbidden_paths ?? template.forbidden_paths ?? EVOLUTION_FORBIDDEN_PATHS,
    validation_commands: validationCommands.length > 0 ? validationCommands : [
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "pnpm typecheck"
    ],
    validation_plan: validationCommands.length > 0 ? validationCommands : [
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "pnpm typecheck"
    ],
    acceptance_criteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [
      `Improvement ${template.improvement_id} is addressed or has a documented no-go reason.`,
      "Doctor remains GO or CONDITIONAL_GO with no blocker.",
      "No business code or production operation is touched."
    ],
    auto_fix_allowed: typeof existing?.auto_fix_allowed === "boolean"
      ? existing.auto_fix_allowed
      : typeof template.auto_fix_allowed === "boolean" ? template.auto_fix_allowed : false,
    auto_fix_eligibility: existing?.auto_fix_eligibility ?? pattern?.auto_fix_eligibility ?? "MANUAL_REVIEW",
    requires_approval: typeof existing?.requires_approval === "boolean"
      ? existing.requires_approval
      : typeof template.requires_approval === "boolean" ? template.requires_approval : risk !== "LOW",
    expected_output_files: existing?.expected_output_files ?? template.expected_output_files ?? [],
    status: existing?.status ?? "OPEN",
    occurrence_count: pattern?.occurrences ?? existing?.occurrence_count ?? 0,
    severity: risk,
    impact: pattern?.summary ?? existing?.impact ?? "",
    active_now: activePatternIds.has(pattern?.pattern_id ?? existing?.pattern_id ?? ""),
    last_seen_at: pattern?.last_seen_at ?? existing?.last_seen_at ?? "",
    source: existing ? "backlog" : "failure-pattern-template"
  };
  return {
    ...candidate,
    score: candidateScore(candidate)
  };
}

function normalizeImprovementCandidates(data, observation = null) {
  const activePatternIds = new Set((observation?.patterns ?? []).map((pattern) => pattern.pattern_id));
  const patterns = patternById(data);
  const existing = existingImprovementById(data);
  const candidates = new Map();

  for (const [patternId, template] of Object.entries(IMPROVEMENT_TEMPLATES)) {
    const pattern = patterns.get(patternId);
    const item = existing.get(template.improvement_id);
    candidates.set(template.improvement_id, mergeTemplateWithBacklog(
      { ...template, source_pattern_id: patternId },
      pattern,
      item,
      activePatternIds
    ));
  }

  for (const item of data.improvementBacklog?.improvements ?? []) {
    const templateId = IMPROVEMENT_TEMPLATES[item.source_pattern_id ?? item.pattern_id]?.improvement_id;
    if (item.status === "RESOLVED" && templateId !== item.improvement_id) {
      continue;
    }
    if (candidates.has(item.improvement_id)) continue;
    const pattern = patterns.get(item.source_pattern_id ?? item.pattern_id);
    candidates.set(item.improvement_id, mergeTemplateWithBacklog({
      improvement_id: item.improvement_id,
      source_pattern_id: item.source_pattern_id ?? item.pattern_id,
      title: item.title,
      root_cause: item.root_cause,
      proposed_solution: item.proposed_solution,
      risk: item.risk ?? item.risk_level,
      priority: item.priority,
      owner_recommendation: item.owner_recommendation,
      allowed_paths: item.allowed_paths,
      forbidden_paths: item.forbidden_paths,
      validation_commands: item.validation_commands ?? item.validation_plan,
      acceptance_criteria: item.acceptance_criteria,
      auto_fix_allowed: item.auto_fix_allowed,
      requires_approval: item.requires_approval,
      expected_output_files: item.expected_output_files
    }, pattern, item, activePatternIds));
  }

  const conflictMetrics = observation?.sources?.conflict_metrics;
  const repeatedQueueConflicts = (conflictMetrics?.recent_queue_conflicts ?? 0) >= 2 ||
    (conflictMetrics?.recent_integration_conflicts ?? 0) >= 2 ||
    conflictMetrics?.risk === "HIGH";
  if (repeatedQueueConflicts && !candidates.has("IMPROVE-QUEUE-CONFLICT-REDUCTION-NEXT")) {
    const pattern = patterns.get("PATTERN-005");
    candidates.set("IMPROVE-QUEUE-CONFLICT-REDUCTION-NEXT", mergeTemplateWithBacklog({
      improvement_id: "IMPROVE-QUEUE-CONFLICT-REDUCTION-NEXT",
      source_pattern_id: "PATTERN-005",
      title: "Next queue conflict reduction hardening pass",
      root_cause: "Queue conflict metrics show repeated queue or integration conflicts after event-first adoption.",
      proposed_solution: "Add another targeted event-first hardening task based on conflict-metrics.json and recent integration reports.",
      risk: "MEDIUM",
      priority: "P1",
      owner_recommendation: "agent-5",
      allowed_paths: EVOLUTION_SCRIPT_PATHS,
      forbidden_paths: EVOLUTION_FORBIDDEN_PATHS,
      validation_commands: [
        "node ops/agent-orchestrator/scripts/integrate-agent-results.mjs --dry-run",
        "node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run",
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
        "pnpm typecheck"
      ],
      acceptance_criteria: [
        "Queue conflict metrics risk returns to LOW or has a documented no-go reason.",
        "Read-model-only queue files remain generated from event store.",
        "No business code or production operation is touched."
      ],
      auto_fix_allowed: false,
      requires_approval: true,
      expected_output_files: [
        "ops/agent-orchestrator/reports/IMPROVE-QUEUE-CONFLICT-REDUCTION-NEXT.md",
        "ops/agent-orchestrator/results/IMPROVE-QUEUE-CONFLICT-REDUCTION-NEXT.json",
        "docs/testing/evolution-queue-conflict-reduction-next-checklist.md"
      ]
    }, pattern, null, activePatternIds));
  }

  return [...candidates.values()].filter((item) => item.status !== "RESOLVED");
}

function sortImprovementCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    if ((PRIORITY_SCORE.get(b.priority) ?? 0) !== (PRIORITY_SCORE.get(a.priority) ?? 0)) {
      return (PRIORITY_SCORE.get(b.priority) ?? 0) - (PRIORITY_SCORE.get(a.priority) ?? 0);
    }
    return String(a.improvement_id).localeCompare(String(b.improvement_id));
  });
}

export function buildImprovementCandidates(data, observation = null) {
  return sortImprovementCandidates(normalizeImprovementCandidates(data, observation));
}

export function buildTaskCandidates(improvements) {
  return improvements.map((item) => ({
    task_id: `EVOLUTION-${item.improvement_id}`,
    title: item.title,
    owner: item.owner_recommendation,
    priority: item.priority,
    risk: item.risk,
    requires_human_approval: item.requires_approval,
    allowed_paths: item.allowed_paths,
    forbidden_paths: item.forbidden_paths,
    acceptance: item.acceptance_criteria,
    validation_commands: item.validation_commands,
    expected_output_files: item.expected_output_files,
    source_pattern_id: item.source_pattern_id,
    source_improvement_id: item.improvement_id
  }));
}

export async function buildEvolutionObservation({ apply = false } = {}) {
  const data = await readEvolutionData();
  const [queue, locks, results, perTaskResults] = await Promise.all([
    readJson(queuePath),
    readJson(locksPath),
    readJson(resultsPath),
    readResultFiles(perTaskResultsDir)
  ]);
  const [doctor, checkDispatch, audit, integration, eventStore, logs, goalToQueue, rawConflictMetrics] = await Promise.all([
    Promise.resolve(parseDoctorJson()),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/check-dispatch-status.mjs")),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/audit-all-results.mjs", ["--dry-run"])),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--dry-run"])),
    buildEventStoreHealth({ queue, locks, results }),
    recentRunLogs(queue, results, perTaskResults),
    inspectGoalToQueueArtifacts(),
    readConflictMetrics()
  ]);
  const consistency = eventStore.read_model_consistency ?? {};
  const eventReadModelConsistent = Boolean(
    consistency.queue_status?.consistent &&
    consistency.locks?.consistent &&
    consistency.results_status?.consistent
  );
  const conflictMetrics = summarizeConflictMetrics(rawConflictMetrics, {
    eventReadModelConsistent,
    candidateQueueRisk: Boolean(doctor.integration?.queue_bookkeeping_conflict_risk)
  });

  const findings = deriveFindings({ doctor, queue, locks, eventStore, logs, integration, conflictMetrics });
  const patterns = matchPatterns(data.failurePatterns?.patterns ?? [], findings);
  const summary = buildEvolutionSummary(data);
  const improvementCandidates = buildImprovementCandidates(data, { patterns });
  const taskCandidates = buildTaskCandidates(improvementCandidates);
  const generatedAt = nowIso();
  const observation = {
    generated_at: generatedAt,
    mode: apply ? "apply" : "dry-run",
    summary,
    findings,
    patterns,
    root_causes: patterns.map((pattern) => ({
      pattern_id: pattern.pattern_id,
      title: pattern.title,
      root_causes: (data.failurePatterns.patterns ?? []).find((item) => item.pattern_id === pattern.pattern_id)?.root_causes ?? []
    })),
    improvements: improvementCandidates,
    suggested_tasks: taskCandidates,
    sources: {
      doctor: {
        status: doctor.status ?? "UNKNOWN",
        finding_count: (doctor.findings ?? []).length,
        error: doctor.error ?? ""
      },
      check_dispatch_status: {
        status: checkDispatch.status,
        passed: checkDispatch.status === 0
      },
      audit_all_results_dry_run: {
        status: audit.status,
        passed: audit.status === 0
      },
      integrate_agent_results_dry_run: {
        status: integration.status,
        passed: integration.status === 0
      },
      event_store: {
        task_events: eventStore.task_events,
        event_type_counts: eventStore.event_type_counts,
        read_model_consistency: eventStore.read_model_consistency
      },
      conflict_metrics: conflictMetrics,
      queue: {
        ready: (queue.tasks ?? []).filter((task) => task.status === "READY").length,
        claimed: (queue.tasks ?? []).filter((task) => task.status === "CLAIMED").length,
        done: (queue.tasks ?? []).filter((task) => task.status === "DONE").length,
        audited: (queue.tasks ?? []).filter((task) => task.status === "AUDITED").length
      },
      locks: {
        total: (locks.locks ?? []).length
      },
      run_logs: logs,
      goal_to_queue: goalToQueue,
      self_repair_history: {
        available: existsSync(join(orchestratorDir, "daemon")),
        note: "MVP observer records self-repair availability; structured self-repair event ingestion is planned."
      }
    }
  };

  if (apply) {
    data.evolutionState.updated_at = generatedAt;
    data.evolutionState.last_observed_at = generatedAt;
    data.evolutionState.last_run_mode = "observe_apply";
    data.evolutionState.last_summary = {
      status: doctor.status ?? "UNKNOWN",
      ...summary,
      active_patterns: patterns.map((pattern) => pattern.pattern_id),
      finding_count: findings.length
    };
    data.evolutionState.next_action = taskCandidates.length > 0
      ? ["node ops/agent-orchestrator/scripts/evolution-planner.mjs --dry-run"]
      : ["node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor"];
    data.learningLog.updated_at = generatedAt;
    data.learningLog.entries = [
      ...(data.learningLog.entries ?? []),
      {
        learning_id: `OBS-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
        pattern_id: patterns[0]?.pattern_id ?? "NONE",
        observed_at: generatedAt,
        source: "observe-agent-studio.mjs",
        incident: findings[0]?.message ?? "No active failures detected.",
        root_cause: patterns[0]
          ? ((data.failurePatterns.patterns ?? []).find((item) => item.pattern_id === patterns[0].pattern_id)?.root_causes ?? []).join("; ")
          : "No active root cause.",
        resolution: "Observation recorded for resident evolution center.",
        evidence_refs: ["ops/agent-orchestrator/scripts/observe-agent-studio.mjs"],
        follow_up: observation.suggested_tasks[0]?.task_id ?? "Continue monitoring.",
        status: "ACTIVE"
      }
    ];
    await writeEvolutionData(data);
  }

  return observation;
}

export async function applyEvolutionPlan(plan) {
  const data = await readEvolutionData();
  const timestamp = nowIso();
  const existingById = new Map((data.improvementBacklog.improvements ?? []).map((item) => [item.improvement_id, item]));
  const plannedIds = new Set(plan.improvement_candidates.map((item) => item.improvement_id));
  const mergedImprovements = [];

  for (const candidate of plan.improvement_candidates) {
    const existing = existingById.get(candidate.improvement_id);
    mergedImprovements.push({
      ...(existing ?? {}),
      improvement_id: candidate.improvement_id,
      source_pattern_id: candidate.source_pattern_id,
      pattern_id: candidate.source_pattern_id,
      title: candidate.title,
      root_cause: candidate.root_cause,
      proposed_solution: candidate.proposed_solution,
      status: existing?.status ?? "OPEN",
      priority: candidate.priority,
      risk: candidate.risk,
      risk_level: candidate.risk,
      owner_recommendation: candidate.owner_recommendation,
      allowed_paths: candidate.allowed_paths,
      forbidden_paths: candidate.forbidden_paths,
      validation_commands: candidate.validation_commands,
      validation_plan: candidate.validation_commands,
      acceptance_criteria: candidate.acceptance_criteria,
      auto_fix_allowed: candidate.auto_fix_allowed,
      auto_fix_eligibility: candidate.auto_fix_eligibility,
      requires_approval: candidate.requires_approval,
      expected_output_files: candidate.expected_output_files,
      occurrence_count: candidate.occurrence_count,
      impact: candidate.impact,
      score: candidate.score,
      last_planned_at: timestamp,
      last_owner_recommendation: candidate.owner_recommendation,
      updated_at: timestamp,
      created_at: existing?.created_at ?? timestamp
    });
  }

  for (const item of data.improvementBacklog.improvements ?? []) {
    if (!plannedIds.has(item.improvement_id)) {
      mergedImprovements.push(item);
    }
  }

  data.evolutionState.updated_at = timestamp;
  data.evolutionState.last_planned_at = timestamp;
  data.evolutionState.last_run_mode = "planner_apply";
  data.evolutionState.last_summary = {
    ...(data.evolutionState.last_summary ?? {}),
    planned_task_candidates: plan.task_candidates.length,
    planned_improvement_candidates: plan.improvement_candidates.length,
    top_improvement_candidates: plan.improvement_candidates.slice(0, 3).map((item) => item.improvement_id)
  };
  data.evolutionState.next_action = [
    "Review suggested tasks before queue insertion.",
    "Use goal-to-queue --from-improvement <improvement_id> --dry-run before creating READY improvement tasks.",
    "Do not run agent-cycle until improvement tasks are explicitly approved."
  ];
  data.improvementBacklog.updated_at = timestamp;
  data.improvementBacklog.improvements = mergedImprovements;
  data.learningLog.updated_at = timestamp;
  data.learningLog.entries = [
    ...(data.learningLog.entries ?? []),
    {
      learning_id: `EVOPLAN-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      pattern_id: plan.improvement_candidates[0]?.source_pattern_id ?? "NONE",
      observed_at: timestamp,
      source: "evolution-planner.mjs",
      incident: `Evolution Planner generated ${plan.improvement_candidates.length} improvement candidate(s) from failure patterns and backlog.`,
      root_cause: plan.improvement_candidates[0]?.root_cause ?? "No recurring failure candidate was available.",
      resolution: "Upsert improvement-backlog candidates and require explicit approval before queue insertion.",
      evidence_refs: [
        "ops/agent-orchestrator/evolution/failure-patterns.json",
        "ops/agent-orchestrator/evolution/improvement-backlog.json"
      ],
      follow_up: plan.improvement_candidates[0]
        ? `node ops/agent-orchestrator/scripts/goal-to-queue.mjs --from-improvement ${plan.improvement_candidates[0].improvement_id} --dry-run`
        : "Continue observing.",
      status: "ACTIVE"
    }
  ];
  await writeEvolutionData(data);
}
