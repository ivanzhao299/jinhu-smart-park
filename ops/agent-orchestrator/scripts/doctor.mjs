#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUEUE_CONFLICT_FILES,
  getIntegrationCandidatesAgainstLocalMain,
  git,
  isSameHeadAsMain,
  isBranchMergedInto,
  localBranches,
  repoStatus,
  splitDispatchArtifactStatus
} from "./lib/git-utils.mjs";
import {
  ACTIVE_LOCK_STATUSES,
  TASK_STATUSES,
  detectCodexCli,
  detectCodexExecOptions,
  latestResultFor,
  mergeResultsByTask,
  normalizeAgentConfig,
  nowIso,
  readJson,
  readResultFiles,
  taskById,
  writeJson
} from "./lib/queue-utils.mjs";
import { buildEventStoreHealth } from "./lib/event-store-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");
const resultsPath = join(orchestratorDir, "queue", "task-results.json");
const perTaskResultsDir = join(orchestratorDir, "results");
const runsDir = join(orchestratorDir, "runs");
const runPlanRelativePath = "ops/agent-orchestrator/runs/agent-run-plan.md";
const OLD_PROD_PREFIX = "PROD-20260621-002-";
const V2_PREFIX = "AGENT-PLATFORM-V2-";

const SEVERITY_RANK = new Map([
  ["INFO", 0],
  ["WARN", 1],
  ["ERROR", 2],
  ["BLOCKER", 3]
]);

function parseArgs(argv) {
  const args = {
    json: argv.includes("--json"),
    fixDryRun: argv.includes("--fix-dry-run"),
    fixApply: argv.includes("--fix-apply"),
    deep: argv.includes("--deep")
  };

  if (args.fixDryRun && args.fixApply) {
    throw new Error("Use either --fix-dry-run or --fix-apply, not both.");
  }

  return args;
}

function normalizePath(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function isRunPlanDirty(status) {
  return (status.nonRuntimeDirty ?? []).some((entry) => normalizePath(entry.path) === runPlanRelativePath);
}

function formatEntries(entries = []) {
  return entries.length === 0 ? "none" : entries.map((entry) => `${entry.code} ${entry.path}`).join("; ");
}

function addFinding(findings, severity, area, message, suggestedFix = "") {
  findings.push({ severity, area, message, suggested_fix: suggestedFix });
}

function addFix(fixes, type, message, details = {}) {
  fixes.push({
    type,
    risk: "LOW",
    message,
    ...details
  });
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

function safeRepoStatus(id, path) {
  if (!path || !existsSync(path)) {
    return {
      id,
      path,
      exists: false,
      branch: "",
      head: "",
      clean: false,
      runtimeDirty: [],
      nonRuntimeDirty: [],
      statusOutput: "worktree path does not exist",
      ahead: null,
      behind: null,
      includedInOriginMain: false
    };
  }

  try {
    return {
      id,
      exists: true,
      ...repoStatus(path)
    };
  } catch (error) {
    return {
      id,
      path,
      exists: true,
      branch: "",
      head: "",
      clean: false,
      runtimeDirty: [],
      nonRuntimeDirty: [],
      statusOutput: error.message,
      ahead: null,
      behind: null,
      includedInOriginMain: false
    };
  }
}

function inspectWorktrees(config, findings, fixes, queue) {
  const agents = normalizeAgentConfig(config);
  const mainPath = config.main?.path ?? repoRoot;
  const main = safeRepoStatus("main", mainPath);
  const agentRows = [...agents.values()].map((agent) => ({
    ...agent,
    status: safeRepoStatus(agent.id, agent.path)
  }));

  if (!main.exists) {
    addFinding(findings, "BLOCKER", "git", `main worktree path does not exist: ${main.path}`, "Restore the main worktree before running orchestrator automation.");
  } else if (main.branch && main.branch !== "main" && !main.branch.startsWith("integration/")) {
    addFinding(findings, "WARN", "git", `main worktree is on ${main.branch}, not main or integration/*`, "Checkout main before dispatch, execute, integrate, push, or release operations.");
  }

  if (main.nonRuntimeDirty.length > 0) {
    const { dispatchArtifacts, other } = splitDispatchArtifactStatus(main.nonRuntimeDirty);
    const onlyDispatchArtifacts = dispatchArtifacts.length > 0 && other.length === 0;
    const claimedCount = (queue.tasks ?? []).filter((task) => task.status === "CLAIMED").length;
    const onlyRunPlan = main.nonRuntimeDirty.every((entry) => normalizePath(entry.path) === runPlanRelativePath);

    if (onlyDispatchArtifacts) {
      addFinding(
        findings,
        "WARN",
        "git",
        `dispatch artifacts pending commit: ${formatEntries(dispatchArtifacts)}`,
        claimedCount > 0
          ? "Run orchestratorctl.mjs agent-cycle --apply --execute --push --precheck-only or the full apply/execute flow so dispatch artifacts are committed before runner execution."
          : "Review or restore generated dispatch artifacts; no CLAIMED task currently requires a dispatch commit."
      );
    } else {
      addFinding(
        findings,
        "ERROR",
        "git",
        `main worktree has non-runtime dirty files: ${formatEntries(main.nonRuntimeDirty)}`,
        "Commit, restore, or review non-runtime dirty files before executing agents or integrating results."
      );
    }

    if (onlyRunPlan && claimedCount === 0 && isRunPlanDirty(main)) {
      addFix(fixes, "restore_run_plan", "Restore generated agent-run-plan.md in main worktree.", {
        path: runPlanRelativePath
      });
    }
  }

  if ((main.ahead ?? 0) > 0) {
    addFinding(findings, "WARN", "git", `main is ahead of origin/main by ${main.ahead} commit(s).`, "Push main before running agent execution paths that require agent sync, or run without --execute.");
  }

  for (const row of agentRows) {
    const { status } = row;
    if (!status.exists) {
      addFinding(findings, "ERROR", "git", `${row.id} worktree path does not exist: ${row.path}`, "Restore or recreate the missing agent worktree.");
      continue;
    }

    if (status.runtimeDirty.length > 0) {
      addFinding(findings, "INFO", "git", `${row.id} has runtime dirty files: ${formatEntries(status.runtimeDirty)}`, "Use reconcile-worktrees.mjs --apply when runtime backup/removal is approved.");
      addFix(fixes, "runtime_dirty_backup_suggestion", `${row.id} has runtime dirty files; doctor will not delete them automatically.`, {
        agent: row.id,
        files: status.runtimeDirty
      });
    }

    if (status.nonRuntimeDirty.length > 0) {
      addFinding(findings, "ERROR", "git", `${row.id} has non-runtime dirty files: ${formatEntries(status.nonRuntimeDirty)}`, "Commit allowed agent results or restore unintended changes before integration.");
    }
  }

  const candidates = getIntegrationCandidatesAgainstLocalMain(agentRows, main.path);
  const candidateByAgent = new Map(candidates.map((candidate) => [candidate.agent.id, candidate]));
  const agentCommits = [];
  for (const agent of agentRows) {
    if (!agent.status.exists) continue;
    const candidate = candidateByAgent.get(agent.id);
    const commits = candidate?.commits ?? [];
    const files = candidate?.files ?? [];
    const nameStatus = candidate?.nameStatus ?? [];
    const risk = candidate?.risk ?? "NONE";
    const hasQueueBookkeeping = files.some((file) => QUEUE_CONFLICT_FILES.has(file));
    const item = {
      agent: agent.id,
      branch: agent.status.branch,
      baseline: "local main",
      same_head_as_local_main: isSameHeadAsMain(agent.path, main.path),
      local_main_head: candidate?.baselineHead ?? git(main.path, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim(),
      agent_head: candidate?.agentHead ?? git(agent.path, ["rev-parse", "HEAD"], { allowFailure: true }).stdout.trim(),
      remote_ahead: agent.status.ahead,
      remote_behind: agent.status.behind,
      commits,
      files,
      name_status: nameStatus,
      risk,
      queue_bookkeeping_conflict_risk: hasQueueBookkeeping
    };
    agentCommits.push(item);

    if (commits.length > 0) {
      addFinding(
        findings,
        risk === "HIGH" ? "ERROR" : "WARN",
        "integration",
        `${agent.id} has ${commits.length} commit(s) not in local main; risk=${risk}.`,
        risk === "HIGH"
          ? "Human review is required before integration."
          : "Run integrate-agent-results.mjs --dry-run, then --apply when integration is approved."
      );
    }
  }

  let integrationBranches = [];
  if (main.exists) {
    integrationBranches = localBranches(main.path)
      .filter((branch) => branch.startsWith("integration/"))
      .map((branch) => ({
        branch,
        merged_into_main: isBranchMergedInto(main.path, branch, "main")
      }));
    for (const branch of integrationBranches.filter((item) => !item.merged_into_main)) {
      addFinding(findings, "WARN", "integration", `integration branch not merged into main: ${branch.branch}`, "Review the integration branch and merge/push only after validation and human approval.");
    }
  }

  return {
    main,
    agents: Object.fromEntries(agentRows.map((row) => [row.id, row.status])),
    agent_commits: agentCommits,
    integration_branches: integrationBranches
  };
}

function queueCounts(tasks) {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

function inspectQueue({ queue, locks, results, perTaskResults }, findings, fixes) {
  const tasks = queue.tasks ?? [];
  const lockRows = locks.locks ?? [];
  const tasksById = taskById(queue);
  const mergedResults = mergeResultsByTask(results.results ?? [], perTaskResults);
  const resultsByTask = new Map(mergedResults.map((result) => [result.task_id, result]));
  const activeLocks = [];
  const duplicateLocks = [];
  const staleLocks = [];
  const doneTaskLocks = [];
  const missingTaskLocks = [];
  const exactSeen = new Set();
  const pairCounts = new Map();

  for (const [index, lock] of lockRows.entries()) {
    const task = tasksById.get(lock.task_id);
    const exactKey = `${lock.task_id}|${lock.agent}|${lock.claimed_at ?? ""}`;
    const pairKey = `${lock.task_id}|${lock.agent}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);

    if (exactSeen.has(exactKey)) {
      duplicateLocks.push({ index, lock, kind: "exact" });
      addFix(fixes, "dedupe_exact_lock", `Remove exact duplicate lock for ${lock.task_id} / ${lock.agent}.`, {
        task_id: lock.task_id,
        agent: lock.agent,
        claimed_at: lock.claimed_at
      });
    }
    exactSeen.add(exactKey);

    if (!task) {
      missingTaskLocks.push({ index, lock });
      staleLocks.push({ index, lock, reason: "task not found" });
      addFix(fixes, "remove_missing_task_lock", `Remove lock for missing task ${lock.task_id}.`, {
        task_id: lock.task_id,
        agent: lock.agent
      });
      continue;
    }

    if (task.status === "DONE") {
      doneTaskLocks.push({ index, lock });
      staleLocks.push({ index, lock, reason: "DONE task still has lock" });
      addFix(fixes, "remove_done_task_lock", `Remove lock for DONE task ${lock.task_id}.`, {
        task_id: lock.task_id,
        agent: lock.agent
      });
      continue;
    }

    if (!ACTIVE_LOCK_STATUSES.has(task.status)) {
      staleLocks.push({ index, lock, reason: `task status is ${task.status}` });
      continue;
    }

    activeLocks.push({ index, lock, task });
    if (task.owner !== lock.agent) {
      addFinding(findings, "ERROR", "locks", `lock agent ${lock.agent} does not match owner ${task.owner} for ${task.task_id}.`, "Repair task-locks.json before execution.");
    }
  }

  for (const [pairKey, count] of pairCounts) {
    if (count > 1) {
      const [taskId, agent] = pairKey.split("|");
      addFinding(findings, "ERROR", "locks", `duplicate lock entries for ${taskId} / ${agent}: ${count}`, "Run doctor --fix-dry-run; exact duplicates and DONE-task locks can be cleaned with --fix-apply.");
    }
  }

  for (const item of missingTaskLocks) {
    addFinding(findings, "ERROR", "locks", `lock references missing task: ${item.lock.task_id} / ${item.lock.agent}`, "Run doctor --fix-apply to remove locks for missing tasks.");
  }

  for (const item of doneTaskLocks) {
    addFinding(findings, "ERROR", "locks", `DONE task still has active lock: ${item.lock.task_id} / ${item.lock.agent}`, "Run doctor --fix-apply to remove DONE-task locks.");
  }

  for (const item of staleLocks.filter((entry) => entry.reason !== "task not found" && entry.reason !== "DONE task still has lock")) {
    addFinding(findings, "WARN", "locks", `stale lock for ${item.lock.task_id} / ${item.lock.agent}: ${item.reason}`, "Review task state before removing this lock.");
  }

  for (const task of tasks) {
    const matchingActiveLocks = activeLocks.filter((item) => item.lock.task_id === task.task_id && item.lock.agent === task.owner);
    const result = latestResultFor({ results: mergedResults }, task.task_id);

    if (task.status === "CLAIMED" && matchingActiveLocks.length === 0) {
      addFinding(findings, "ERROR", "locks", `CLAIMED task has no matching active lock: ${task.task_id} / ${task.owner}`, "Re-dispatch the task or repair task-locks.json before executing agents.");
    }

    if (result?.status === "DONE" && task.status === "CLAIMED") {
      addFinding(findings, "ERROR", "queue", `task result is DONE but queue is still CLAIMED: ${task.task_id}`, "Run reconcile-task-results.mjs --apply or repair task-queue.json after reviewing evidence.");
    }

    if (task.status === "DONE" && !resultsByTask.has(task.task_id)) {
      addFinding(findings, "WARN", "results", `task-queue marks DONE but no aggregate/per-task result was found: ${task.task_id}`, "Add a truthful task result summary or reconcile from evidence; do not invent missing evidence.");
    }
  }

  const v2Tasks = tasks.filter((task) => task.task_id.startsWith(V2_PREFIX) && ["READY", "CLAIMED", "IN_PROGRESS"].includes(task.status));
  const oldProdClaimed = tasks.filter((task) => task.task_id.startsWith(OLD_PROD_PREFIX) && task.status === "CLAIMED");
  const blockingOldProd = oldProdClaimed.filter((task) => v2Tasks.some((v2Task) => v2Task.owner === task.owner));
  for (const task of blockingOldProd) {
    addFinding(findings, "ERROR", "queue", `old PROD task remains CLAIMED and can block V2 execution for ${task.owner}: ${task.task_id}`, "Mark genuinely completed PROD tasks DONE and remove stale locks before V2 execution.");
  }

  return {
    updated_at: queue.updated_at,
    counts: queueCounts(tasks),
    active_locks: activeLocks.map((item) => item.lock),
    duplicate_locks: duplicateLocks.map((item) => item.lock),
    stale_locks: staleLocks.map((item) => ({ ...item.lock, reason: item.reason })),
    done_task_locks: doneTaskLocks.map((item) => item.lock),
    missing_task_locks: missingTaskLocks.map((item) => item.lock),
    claimed_without_lock: tasks.filter((task) =>
      task.status === "CLAIMED" &&
      !activeLocks.some((item) => item.lock.task_id === task.task_id && item.lock.agent === task.owner)
    ).map((task) => task.task_id),
    done_results_still_claimed: tasks.filter((task) => {
      const result = resultsByTask.get(task.task_id);
      return result?.status === "DONE" && task.status === "CLAIMED";
    }).map((task) => task.task_id),
    done_queue_missing_results: tasks.filter((task) => task.status === "DONE" && !resultsByTask.has(task.task_id)).map((task) => task.task_id),
    old_prod_claimed_blocking_v2: blockingOldProd.map((task) => task.task_id)
  };
}

function eventReadModelIsConsistent(eventStore) {
  const consistency = eventStore.read_model_consistency;
  return Boolean(
    consistency?.queue_status?.consistent &&
    consistency?.locks?.consistent &&
    consistency?.results_status?.consistent
  );
}

async function inspectEventStore({ queue, locks, results }, findings) {
  const health = await buildEventStoreHealth({ queue, locks, results });
  const auditReadModel = health.audit_read_model ?? {};
  const missingDirs = Object.entries(health.paths)
    .filter(([, exists]) => !exists)
    .map(([name]) => name);

  if (missingDirs.length > 0) {
    addFinding(
      findings,
      "WARN",
      "events",
      `event store directories are missing: ${missingDirs.join(", ")}`,
      "Restore ops/agent-orchestrator/events/* directories before relying on event-first queue rebuilds."
    );
  }

  if (health.task_events === 0) {
    addFinding(
      findings,
      "INFO",
      "events",
      "event store has no task events yet.",
      "Run bootstrap-event-store.mjs --dry-run to preview legacy JSON bootstrap events, or wait for event-first dispatch/complete writes."
    );
  }

  if (!health.read_model_consistency.queue_status.consistent) {
    addFinding(
      findings,
      "WARN",
      "events",
      "event queue read model differs from task-queue.json task statuses.",
      "Run rebuild-queue-read-model.mjs --dry-run or reconcile-task-results.mjs --from-events --dry-run before applying any event read-model rebuild."
    );
  }

  if (!health.read_model_consistency.locks.consistent) {
    addFinding(
      findings,
      "WARN",
      "events",
      "event lock read model differs from task-locks.json active locks.",
      "Review event history and run reconcile-task-results.mjs --from-events --dry-run before applying a rebuild."
    );
  }

  if (!health.read_model_consistency.results_status.consistent) {
    addFinding(
      findings,
      "WARN",
      "events",
      "event result read model differs from task-results.json result statuses.",
      "Review result events and per-task result artifacts before applying an event read-model rebuild."
    );
  }

  const auditedTasks = new Set(auditReadModel.audited_tasks ?? []);
  const doneResultsWithoutAudit = (results.results ?? [])
    .filter((result) => result.status === "DONE" && !auditedTasks.has(result.task_id))
    .map((result) => result.task_id);
  if (doneResultsWithoutAudit.length > 0) {
    addFinding(
      findings,
      "INFO",
      "events",
      `DONE result task(s) without task.audited event: ${doneResultsWithoutAudit.slice(0, 8).join(", ")}${doneResultsWithoutAudit.length > 8 ? ", ..." : ""}`,
      "Run audit-all-results.mjs --apply when audit event materialization is approved."
    );
  }

  return {
    ...health,
    read_model_consistent: eventReadModelIsConsistent(health)
  };
}

async function recentRunLogs(findings, queue, results, perTaskResults) {
  let names = [];
  try {
    names = await readdir(runsDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

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
    const log = {
      task_id: taskId,
      agent,
      path: relative(repoRoot, absolute),
      mtime: info.mtime.toISOString(),
      exit_code: exitCode,
      task_status: task?.status ?? "MISSING",
      result_status: result?.status ?? "MISSING"
    };
    logs.push(log);

    if (exitCode !== null && exitCode !== 0) {
      addFinding(findings, "WARN", "runner", `run.log exit_code != 0 for ${taskId}: ${exitCode}`, "Inspect the run log before re-running or integrating this task.");
    }
    if (exitCode === 0 && result?.status !== "DONE") {
      addFinding(findings, "WARN", "runner", `run.log exit 0 but task result is not DONE for ${taskId}.`, "Run complete-task.mjs or reconcile truthful result evidence before integration.");
    }
  }

  logs.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
  return logs.slice(0, 10);
}

function runningCodexProcesses(agents) {
  const result = runCapture("ps", ["-axo", "pid=,command="]);
  if (result.status !== 0) return [];
  const agentPaths = new Map([...agents.values()].map((agent) => [agent.id, agent.path]));

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("codex") && line.includes("exec"))
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      const command = rest.join(" ");
      const promptMatch = /ops\/agent-orchestrator\/runs\/(.+)-(agent-[1-5])\.prompt\.md/.exec(command);
      const agent = promptMatch?.[2] ?? [...agentPaths].find(([, path]) => command.includes(path))?.[0] ?? "";
      return {
        pid,
        command,
        task_id: promptMatch?.[1] ?? "",
        agent
      };
    });
}

async function inspectRunner(config, queue, results, perTaskResults, findings) {
  const codex = detectCodexCli();
  codex.execOptions = detectCodexExecOptions(codex.path);
  if (!codex.found) {
    addFinding(findings, "ERROR", "runner", "Codex CLI not found.", "Set CODEX_CLI or install/repair Codex CLI before agent execution.");
  }

  const agents = normalizeAgentConfig(config);
  const processes = runningCodexProcesses(agents);
  const logs = await recentRunLogs(findings, queue, results, perTaskResults);

  return {
    codex_cli: {
      found: codex.found,
      path: codex.path,
      source: codex.source,
      version: codex.version,
      exec_approval: codex.execOptions.approval.note,
      exec_sandbox: codex.execOptions.sandbox.note
    },
    running_codex_exec: processes,
    recent_run_logs: logs
  };
}

function inspectIntegration(config, worktrees, findings) {
  const mainPath = config.main?.path ?? repoRoot;
  const candidates = worktrees.agent_commits.filter((item) => item.commits.length > 0);
  const dryRun = runNodeCapture("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--dry-run"]);
  const dryRunSummary = [dryRun.stdout, dryRun.stderr]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (dryRun.status !== 0) {
    addFinding(findings, "ERROR", "integration", `integrate-agent-results --dry-run failed with exit ${dryRun.status}.`, dryRunSummary.join(" ") || "Inspect integration dry-run output.");
  }

  const currentBranch = worktrees.main.branch;
  if (currentBranch && currentBranch !== "main" && !currentBranch.startsWith("integration/")) {
    addFinding(findings, "WARN", "integration", `current branch is ${currentBranch}, not main/integration.`, "Checkout main before normal orchestrator flows.");
  }

  return {
    current_branch: currentBranch,
    can_integrate_candidates: candidates.length,
    risk_counts: {
      LOW: candidates.filter((item) => item.risk === "LOW").length,
      MEDIUM: candidates.filter((item) => item.risk === "MEDIUM").length,
      HIGH: candidates.filter((item) => item.risk === "HIGH").length
    },
    queue_bookkeeping_conflict_risk: candidates.some((item) => item.queue_bookkeeping_conflict_risk),
    dry_run_status: dryRun.status,
    dry_run_summary: dryRunSummary,
    integration_branches: worktrees.integration_branches
  };
}

function inspectValidation(args, findings) {
  const checkDispatch = runNodeCapture("ops/agent-orchestrator/scripts/check-dispatch-status.mjs");
  const audit = runNodeCapture("ops/agent-orchestrator/scripts/audit-all-results.mjs", ["--dry-run"]);
  let typecheck = {
    skipped: true,
    status: null,
    note: "doctor does not run pnpm typecheck unless --deep is supplied"
  };

  if (checkDispatch.status !== 0) {
    addFinding(findings, "ERROR", "validation", `check-dispatch-status failed with exit ${checkDispatch.status}.`, "Inspect queue JSON and lock consistency.");
  }

  if (audit.status !== 0) {
    addFinding(findings, "ERROR", "validation", `audit-all-results --dry-run failed with exit ${audit.status}.`, "Fix audit findings before merge/push.");
  }

  if (args.deep) {
    const result = runCapture("pnpm", ["typecheck"]);
    typecheck = {
      skipped: false,
      status: result.status,
      note: result.status === 0 ? "pnpm typecheck passed" : "pnpm typecheck failed",
      output_tail: [result.stdout, result.stderr].filter(Boolean).join("\n").split("\n").slice(-20)
    };
    if (result.status !== 0) {
      addFinding(findings, "ERROR", "validation", "pnpm typecheck failed under doctor --deep.", "Fix typecheck before integration or push.");
    }
  }

  return {
    check_dispatch_status: {
      status: checkDispatch.status,
      passed: checkDispatch.status === 0
    },
    audit_all_results_dry_run: {
      status: audit.status,
      passed: audit.status === 0
    },
    typecheck
  };
}

function cleanLockRows(queue, locks) {
  const tasksById = taskById(queue);
  const seenExact = new Set();
  const removed = [];
  const kept = [];

  for (const lock of locks.locks ?? []) {
    const task = tasksById.get(lock.task_id);
    const exactKey = `${lock.task_id}|${lock.agent}|${lock.claimed_at ?? ""}`;
    let reason = "";

    if (!task) {
      reason = "missing task";
    } else if (task.status === "DONE") {
      reason = "DONE task lock";
    } else if (seenExact.has(exactKey)) {
      reason = "exact duplicate lock";
    }

    if (reason) {
      removed.push({ ...lock, reason });
      continue;
    }

    seenExact.add(exactKey);
    kept.push(lock);
  }

  return { kept, removed };
}

async function applyFixes(diagnosis) {
  const applied = [];
  const mainPath = diagnosis.worktrees.main.path;

  if (diagnosis.fixes.some((fix) => fix.type === "restore_run_plan")) {
    git(mainPath, ["restore", "--", runPlanRelativePath], { allowFailure: true });
    applied.push({ type: "restore_run_plan", path: runPlanRelativePath });
  }

  if (diagnosis.fixes.some((fix) => ["remove_missing_task_lock", "remove_done_task_lock", "dedupe_exact_lock"].includes(fix.type))) {
    const queue = await readJson(queuePath);
    const locks = await readJson(locksPath);
    const { kept, removed } = cleanLockRows(queue, locks);
    if (removed.length > 0) {
      locks.locks = kept;
      locks.updated_at = nowIso();
      await writeJson(locksPath, locks);
      applied.push({ type: "clean_locks", removed });
    }
  }

  return applied;
}

function computeStatus(findings) {
  const max = findings.reduce((rank, finding) => Math.max(rank, SEVERITY_RANK.get(finding.severity) ?? 0), 0);
  if (max >= SEVERITY_RANK.get("ERROR")) return "NO_GO";
  if (max >= SEVERITY_RANK.get("WARN")) return "CONDITIONAL_GO";
  return "GO";
}

function nextActions(diagnosis) {
  const actions = [];
  const fixable = diagnosis.fixes.filter((fix) => fix.type !== "runtime_dirty_backup_suggestion");
  if (fixable.length > 0) {
    actions.push("node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --fix-dry-run");
  }

  if (diagnosis.queue.active_locks.length > 0 && diagnosis.findings.every((finding) => finding.severity !== "ERROR" && finding.severity !== "BLOCKER")) {
    actions.push("node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --apply --execute --precheck-only");
    actions.push("node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute");
  } else if ((diagnosis.queue.counts.READY ?? 0) > 0) {
    actions.push("node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run");
  }

  if (diagnosis.integration.can_integrate_candidates > 0) {
    actions.push("node ops/agent-orchestrator/scripts/integrate-agent-results.mjs --dry-run");
  }

  if (!diagnosis.event_store.read_model_consistent) {
    actions.push("node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --from-events --dry-run");
  }

  if (actions.length === 0) {
    actions.push("node ops/agent-orchestrator/scripts/orchestratorctl.mjs status");
  }

  return actions;
}

async function buildDiagnosis(args, appliedFixes = []) {
  const findings = [];
  const fixes = [];
  const config = await readJson(agentsConfigPath);
  const queue = await readJson(queuePath);
  const locks = await readJson(locksPath);
  const results = await readJson(resultsPath);
  const perTaskResults = await readResultFiles(perTaskResultsDir);

  const worktrees = inspectWorktrees(config, findings, fixes, queue);
  const queueInfo = inspectQueue({ queue, locks, results, perTaskResults }, findings, fixes);
  const eventStore = await inspectEventStore({ queue, locks, results }, findings);
  const runner = await inspectRunner(config, queue, results, perTaskResults, findings);
  const integration = inspectIntegration(config, worktrees, findings);
  const validation = inspectValidation(args, findings);

  const diagnosis = {
    generated_at: new Date().toISOString(),
    status: "GO",
    findings,
    worktrees,
    queue: queueInfo,
    event_store: eventStore,
    locks: {
      total: (locks.locks ?? []).length,
      active: queueInfo.active_locks.length,
      duplicate: queueInfo.duplicate_locks,
      stale: queueInfo.stale_locks
    },
    runner,
    integration,
    validation,
    fixes,
    applied_fixes: appliedFixes,
    next_action: []
  };

  diagnosis.status = computeStatus(findings);
  diagnosis.next_action = nextActions(diagnosis);
  return diagnosis;
}

function printMarkdown(diagnosis, args) {
  console.log("# Orchestrator Doctor");
  console.log("");
  console.log(`Generated at: ${diagnosis.generated_at}`);
  console.log("");
  console.log("## Summary");
  console.log(diagnosis.status);
  console.log("");

  console.log("## Worktrees");
  const rows = [
    ["main", diagnosis.worktrees.main],
    ...Object.entries(diagnosis.worktrees.agents)
  ];
  console.log("| Worktree | Branch | Head | Clean | Ahead | Behind | Runtime Dirty | Non-runtime Dirty |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [id, status] of rows) {
    console.log(`| ${id} | ${status.branch || "(missing)"} | ${status.head || ""} | ${status.clean ? "yes" : "no"} | ${status.ahead ?? "?"} | ${status.behind ?? "?"} | ${formatEntries(status.runtimeDirty)} | ${formatEntries(status.nonRuntimeDirty)} |`);
  }
  console.log("");

  console.log("## Queue / Locks / Results");
  console.log(`READY: ${diagnosis.queue.counts.READY ?? 0}`);
  console.log(`CLAIMED: ${diagnosis.queue.counts.CLAIMED ?? 0}`);
  console.log(`IN_PROGRESS: ${diagnosis.queue.counts.IN_PROGRESS ?? 0}`);
  console.log(`DONE: ${diagnosis.queue.counts.DONE ?? 0}`);
  console.log(`FAILED: ${diagnosis.queue.counts.FAILED ?? 0}`);
  console.log(`BLOCKED: ${diagnosis.queue.counts.BLOCKED ?? 0}`);
  console.log(`Active locks: ${diagnosis.locks.active}`);
  console.log(`Duplicate locks: ${diagnosis.locks.duplicate.length}`);
  console.log(`Stale locks: ${diagnosis.locks.stale.length}`);
  console.log("");

  console.log("## Event Store");
  console.log(`Task events: ${diagnosis.event_store.task_events}`);
  console.log(`Event types: ${JSON.stringify(diagnosis.event_store.event_type_counts)}`);
  console.log(`Audited tasks: ${diagnosis.event_store.audit_read_model?.audited_tasks?.length ?? 0}`);
  console.log(`Integrated tasks: ${diagnosis.event_store.audit_read_model?.integrated_tasks?.length ?? 0}`);
  console.log(`Reconciled tasks: ${diagnosis.event_store.audit_read_model?.reconciled_tasks?.length ?? 0}`);
  console.log(`Audit statuses: ${JSON.stringify(diagnosis.event_store.audit_read_model?.audit_status_counts ?? {})}`);
  console.log(`Queue read model consistent: ${diagnosis.event_store.read_model_consistency.queue_status.consistent ? "yes" : "no"}`);
  console.log(`Lock read model consistent: ${diagnosis.event_store.read_model_consistency.locks.consistent ? "yes" : "no"}`);
  console.log(`Result read model consistent: ${diagnosis.event_store.read_model_consistency.results_status.consistent ? "yes" : "no"}`);
  console.log("Event-first write paths:");
  for (const [script, status] of Object.entries(diagnosis.event_store.event_first_write_paths)) {
    console.log(`- ${script}: ${status}`);
  }
  console.log("");

  console.log("## Runner / Codex CLI");
  console.log(`Codex CLI: ${diagnosis.runner.codex_cli.found ? "found" : "not found"}`);
  console.log(`Codex CLI path: ${diagnosis.runner.codex_cli.path || "(not found)"}`);
  console.log(`Codex CLI version: ${diagnosis.runner.codex_cli.version || "(unavailable)"}`);
  console.log(`Running codex exec: ${diagnosis.runner.running_codex_exec.length}`);
  console.log("Recent run logs:");
  if (diagnosis.runner.recent_run_logs.length === 0) {
    console.log("- none");
  } else {
    for (const log of diagnosis.runner.recent_run_logs) {
      console.log(`- ${log.task_id} | ${log.agent} | exit=${log.exit_code ?? "?"} | task=${log.task_status} | result=${log.result_status} | ${log.path}`);
    }
  }
  console.log("");

  console.log("## Integration");
  console.log(`current branch: ${diagnosis.integration.current_branch || "(unknown)"}`);
  console.log(`candidate agent branches: ${diagnosis.integration.can_integrate_candidates}`);
  console.log(`risk counts: LOW=${diagnosis.integration.risk_counts.LOW}, MEDIUM=${diagnosis.integration.risk_counts.MEDIUM}, HIGH=${diagnosis.integration.risk_counts.HIGH}`);
  console.log(`queue bookkeeping conflict risk: ${diagnosis.integration.queue_bookkeeping_conflict_risk ? "yes" : "no"}`);
  console.log(`integrate dry-run exit: ${diagnosis.integration.dry_run_status}`);
  console.log("");

  console.log("## Validation");
  console.log(`check-dispatch-status: ${diagnosis.validation.check_dispatch_status.passed ? "PASS" : "FAIL"}`);
  console.log(`audit-all-results --dry-run: ${diagnosis.validation.audit_all_results_dry_run.passed ? "PASS" : "FAIL"}`);
  console.log(`pnpm typecheck: ${diagnosis.validation.typecheck.skipped ? "SKIPPED" : diagnosis.validation.typecheck.status === 0 ? "PASS" : "FAIL"} (${diagnosis.validation.typecheck.note})`);
  console.log("");

  console.log("## Findings");
  if (diagnosis.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of diagnosis.findings) {
      console.log(`- severity: ${finding.severity}; area: ${finding.area}; message: ${finding.message}; suggested fix: ${finding.suggested_fix || "none"}`);
    }
  }
  console.log("");

  if (args.fixDryRun || args.fixApply) {
    console.log("## Auto Fix Plan");
    const actionable = diagnosis.fixes.filter((fix) => fix.type !== "runtime_dirty_backup_suggestion");
    if (actionable.length === 0) {
      console.log("- none");
    } else {
      for (const fix of actionable) {
        console.log(`- ${fix.type}: ${fix.message}`);
      }
    }
    if (args.fixApply) {
      console.log("");
      console.log("Applied fixes:");
      if (diagnosis.applied_fixes.length === 0) {
        console.log("- none");
      } else {
        for (const fix of diagnosis.applied_fixes) {
          console.log(`- ${fix.type}`);
        }
      }
    } else {
      console.log("");
      console.log("Fix dry-run: no files were modified.");
    }
    console.log("");
  }

  console.log("## Current Next Action");
  for (const action of diagnosis.next_action) {
    console.log(`- ${action}`);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let diagnosis = await buildDiagnosis(args);
if (args.fixApply) {
  const applied = await applyFixes(diagnosis);
  diagnosis = await buildDiagnosis(args, applied);
}

if (args.json) {
  console.log(JSON.stringify({
    status: diagnosis.status,
    findings: diagnosis.findings,
    worktrees: diagnosis.worktrees,
    queue: diagnosis.queue,
    locks: diagnosis.locks,
    runner: diagnosis.runner,
    integration: diagnosis.integration,
    validation: diagnosis.validation,
    fixes: diagnosis.fixes,
    applied_fixes: diagnosis.applied_fixes,
    next_action: diagnosis.next_action
  }, null, 2));
} else {
  printMarkdown(diagnosis, args);
}
