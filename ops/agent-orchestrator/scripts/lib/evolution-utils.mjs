import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEventStoreHealth } from "./event-store-utils.mjs";
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

  return {
    pattern_count: patterns.length,
    open_improvements: open.length,
    resolved_improvements: resolved.length,
    learning_entries: entries.length,
    top_recurring_failures: topRecurringFailures
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

function deriveFindings({ doctor, queue, locks, eventStore, logs, integration }) {
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

export function buildImprovementCandidates(data, observation = null) {
  const activePatternIds = new Set((observation?.patterns ?? []).map((pattern) => pattern.pattern_id));
  return (data.improvementBacklog?.improvements ?? [])
    .filter((item) => item.status !== "RESOLVED")
    .map((item) => ({
      improvement_id: item.improvement_id,
      pattern_id: item.pattern_id,
      title: item.title,
      priority: item.priority ?? "P2",
      risk_level: item.risk_level ?? "LOW",
      owner_recommendation: ownerForImprovement(item),
      active_now: activePatternIds.has(item.pattern_id),
      auto_fix_eligibility: item.auto_fix_eligibility ?? "MANUAL_REVIEW",
      validation_plan: item.validation_plan ?? []
    }));
}

export function buildTaskCandidates(improvements) {
  return improvements.map((item) => ({
    task_id: `EVOLUTION-${item.improvement_id}`,
    title: item.title,
    owner: item.owner_recommendation,
    priority: item.priority,
    risk: item.risk_level,
    requires_human_approval: item.risk_level !== "LOW",
    allowed_paths: [
      "ops/agent-orchestrator/scripts",
      "ops/agent-orchestrator/evolution",
      "ops/agent-orchestrator/reports",
      "ops/agent-orchestrator/results",
      "docs/release",
      "docs/testing"
    ],
    forbidden_paths: [
      "apps",
      "packages",
      "database",
      "infra",
      ".github",
      "Dockerfile",
      "docker-compose",
      "deploy",
      "auth"
    ],
    acceptance: [
      `Improvement ${item.improvement_id} is addressed or has a documented no-go reason.`,
      "Doctor remains GO or CONDITIONAL_GO with no blocker.",
      "No business code or production operation is touched."
    ],
    validation_commands: item.validation_plan
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
  const [doctor, checkDispatch, audit, integration, eventStore, logs] = await Promise.all([
    Promise.resolve(parseDoctorJson()),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/check-dispatch-status.mjs")),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/audit-all-results.mjs", ["--dry-run"])),
    Promise.resolve(runNodeCapture("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--dry-run"])),
    buildEventStoreHealth({ queue, locks, results }),
    recentRunLogs(queue, results, perTaskResults)
  ]);

  const findings = deriveFindings({ doctor, queue, locks, eventStore, logs, integration });
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
  data.evolutionState.updated_at = timestamp;
  data.evolutionState.last_planned_at = timestamp;
  data.evolutionState.last_run_mode = "planner_apply";
  data.evolutionState.last_summary = {
    ...(data.evolutionState.last_summary ?? {}),
    planned_task_candidates: plan.task_candidates.length,
    planned_improvement_candidates: plan.improvement_candidates.length
  };
  data.evolutionState.next_action = [
    "Review suggested tasks before queue insertion.",
    "Do not run agent-cycle until improvement tasks are explicitly approved."
  ];
  data.improvementBacklog.updated_at = timestamp;
  data.improvementBacklog.improvements = (data.improvementBacklog.improvements ?? []).map((item) => {
    const planned = plan.improvement_candidates.find((candidate) => candidate.improvement_id === item.improvement_id);
    return planned ? { ...item, last_planned_at: timestamp, last_owner_recommendation: planned.owner_recommendation } : item;
  });
  await writeEvolutionData(data);
}
