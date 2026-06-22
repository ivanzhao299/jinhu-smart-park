#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getIntegrationCandidatesAgainstLocalMain,
  git,
  repoStatus
} from "./lib/git-utils.mjs";
import {
  normalizeAgentConfig,
  readJson,
  VALID_AGENTS
} from "./lib/queue-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const agentsConfigPath = join(orchestratorDir, "agents.config.json");
const queuePath = join(orchestratorDir, "queue", "task-queue.json");
const locksPath = join(orchestratorDir, "queue", "task-locks.json");

const ACTIVE_LOCK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "BLOCKED"]);
const TASK_STATUSES = ["READY", "CLAIMED", "IN_PROGRESS", "DONE", "FAILED", "BLOCKED", "AUDITED"];

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/orchestratorctl.mjs finalize --dry-run|--apply");
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;

  if (argv.includes("--dry-run") && apply) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  return { apply, dryRun };
}

function runVisible(command, args, label) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label ?? command} failed with exit ${result.status ?? 1}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

function formatEntries(entries) {
  return entries.length === 0 ? "none" : entries.map((entry) => `${entry.code} ${entry.path}`).join("; ");
}

function aheadBehindText(status) {
  return `behind=${status.behind ?? "?"}, ahead=${status.ahead ?? "?"}`;
}

function countTasks(queue) {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
  for (const task of queue.tasks ?? []) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

function activeLockCount(queue, locks) {
  const tasksById = new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
  return (locks.locks ?? []).filter((lock) => {
    const task = tasksById.get(lock.task_id);
    return task ? ACTIVE_LOCK_STATUSES.has(task.status) : true;
  }).length;
}

async function collectState() {
  const config = await readJson(agentsConfigPath);
  const agentsById = normalizeAgentConfig(config);
  const agents = VALID_AGENTS.map((id) => agentsById.get(id)).filter(Boolean);
  const mainPath = config.main?.path ?? repoRoot;
  const mainStatus = repoStatus(mainPath);
  const agentStatuses = agents.map((agent) => ({ agent, status: repoStatus(agent.path) }));
  const queue = await readJson(queuePath);
  const locks = await readJson(locksPath);
  const candidates = getIntegrationCandidatesAgainstLocalMain(agents, mainPath);
  const counts = countTasks(queue);
  const activeLocks = activeLockCount(queue, locks);

  return {
    config,
    agents,
    mainPath,
    mainStatus,
    agentStatuses,
    queue,
    locks,
    candidates,
    counts,
    activeLocks
  };
}

function collectPrecheckFailures(state) {
  const failures = [];

  if (state.mainStatus.branch !== "main") {
    failures.push(`current branch is ${state.mainStatus.branch}, expected main`);
  }

  if (state.mainStatus.nonRuntimeDirty.length > 0) {
    failures.push(`main has non-runtime dirty files: ${formatEntries(state.mainStatus.nonRuntimeDirty)}`);
  }

  if (state.mainStatus.runtimeDirty.length > 0) {
    failures.push(`main has runtime dirty files that finalize will not remove: ${formatEntries(state.mainStatus.runtimeDirty)}`);
  }

  for (const { agent, status } of state.agentStatuses) {
    if (status.nonRuntimeDirty.length > 0) {
      failures.push(`${agent.id} has non-runtime dirty files: ${formatEntries(status.nonRuntimeDirty)}`);
    }
  }

  if (state.candidates.length > 0) {
    failures.push(`candidate agent branches exist: ${state.candidates.map((candidate) => candidate.agent.id).join(", ")}`);
  }

  return failures;
}

function readDoctorJson() {
  const result = runCapture("node", ["ops/agent-orchestrator/scripts/doctor.mjs", "--json"]);
  if (result.error || result.status !== 0) {
    return {
      status: "NO_GO",
      failed: `doctor --json failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
      json: null
    };
  }

  try {
    return {
      status: JSON.parse(result.stdout).status ?? "NO_GO",
      failed: "",
      json: JSON.parse(result.stdout)
    };
  } catch (error) {
    return {
      status: "NO_GO",
      failed: `doctor --json output was not valid JSON: ${error.message}`,
      json: null
    };
  }
}

function buildNextAction(result) {
  if (result.finalize === "FAIL") {
    return "Fix failed_checks, then rerun node ops/agent-orchestrator/scripts/orchestratorctl.mjs finalize --apply";
  }
  if (result.READY_count > 0) {
    return "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run";
  }
  return "No immediate action; wait for the next approved goal or task queue.";
}

function buildFinalizeResult({ mode, state, finalState, pushed, syncedAgents, failedChecks, doctorStatus }) {
  const effectiveState = finalState ?? state;
  const agentsClean = effectiveState.agentStatuses.every(({ status }) => status.clean);
  const mainClean = effectiveState.mainStatus.clean;
  const candidateCount = effectiveState.candidates.length;
  const failed = [...failedChecks];

  if (!mainClean) {
    failed.push("main worktree is not clean after finalize");
  }
  if (!agentsClean) {
    failed.push("one or more agent worktrees are not clean after finalize");
  }
  if (candidateCount > 0) {
    failed.push("candidate agent branches remain after finalize");
  }
  if (doctorStatus === "NO_GO") {
    failed.push("doctor returned NO_GO");
  }

  const result = {
    mode,
    finalize: failed.length === 0 ? "PASS" : "FAIL",
    pushed: pushed ? "yes" : "no",
    synced_agents: syncedAgents ? "yes" : "no",
    doctor: doctorStatus,
    main_head: effectiveState.mainStatus.head,
    main_clean: mainClean ? "yes" : "no",
    agents_clean: agentsClean ? "yes" : "no",
    ahead_behind: `main(${aheadBehindText(effectiveState.mainStatus)})`,
    READY_count: effectiveState.counts.READY ?? 0,
    CLAIMED_count: effectiveState.counts.CLAIMED ?? 0,
    DONE_count: effectiveState.counts.DONE ?? 0,
    active_locks: effectiveState.activeLocks,
    candidate_agent_branches: candidateCount,
    failed_checks: [...new Set(failed)],
    next_action: ""
  };
  result.next_action = buildNextAction(result);
  return result;
}

function printFinalizeResult(result) {
  console.log("");
  console.log("# FINALIZE RESULT");
  console.log(`mode: ${result.mode}`);
  console.log(`finalize: ${result.finalize}`);
  console.log(`pushed: ${result.pushed}`);
  console.log(`synced_agents: ${result.synced_agents}`);
  console.log(`doctor: ${result.doctor}`);
  console.log(`main_head: ${result.main_head}`);
  console.log(`main_clean: ${result.main_clean}`);
  console.log(`agents_clean: ${result.agents_clean}`);
  console.log(`ahead_behind: ${result.ahead_behind}`);
  console.log(`READY count: ${result.READY_count}`);
  console.log(`CLAIMED count: ${result.CLAIMED_count}`);
  console.log(`DONE count: ${result.DONE_count}`);
  console.log(`active_locks: ${result.active_locks}`);
  console.log(`candidate_agent_branches: ${result.candidate_agent_branches}`);
  console.log(`failed_checks: ${result.failed_checks.length > 0 ? result.failed_checks.join("; ") : "none"}`);
  console.log(`next_action: ${result.next_action}`);
}

function printPlan(state) {
  console.log("# Orchestrator Finalize dry-run");
  console.log("");
  console.log("Planned apply steps:");
  console.log("- confirm current branch is main");
  console.log("- stop on non-runtime dirty files or candidate agent branches");
  console.log(`- push origin/main: ${(state.mainStatus.ahead ?? 0) > 0 ? "yes" : "no"}`);
  console.log("- run reconcile-worktrees.mjs --apply to handle approved runtime dirt before sync");
  console.log("- run ./ops/agent-orchestrator/sync-agents-from-main.sh");
  console.log("- run ./ops/agent-orchestrator/check-status.sh");
  console.log("- run orchestrator doctor");
  console.log("- print FINALIZE RESULT");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
  }

  let state = await collectState();
  let finalState = null;
  let pushed = false;
  let syncedAgents = false;
  const failedChecks = collectPrecheckFailures(state);

  if (args.dryRun) {
    printPlan(state);
    const doctor = readDoctorJson();
    if (doctor.failed) failedChecks.push(doctor.failed);
    const result = buildFinalizeResult({
      mode: "dry-run",
      state,
      finalState: state,
      pushed,
      syncedAgents,
      failedChecks,
      doctorStatus: doctor.status
    });
    printFinalizeResult(result);
    process.exit(result.finalize === "PASS" ? 0 : 1);
  }

  console.log("# Orchestrator Finalize apply");
  console.log("");
  console.log("Guardrails: no deploy, no production migration, no production seed, no reset, no cleanup, no business-code auto-commit.");

  try {
    if (failedChecks.length > 0) {
      throw new Error("precheck failed");
    }

    if ((state.mainStatus.ahead ?? 0) > 0) {
      runVisible("git", ["-C", state.mainPath, "push", "origin", "main"], "git push origin main");
      pushed = true;
      runVisible("git", ["-C", state.mainPath, "fetch", "origin", "main"], "git fetch origin main");
    } else {
      console.log("main is not ahead of origin/main; push not needed.");
    }

    runVisible("node", ["ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", "--apply"], "reconcile-worktrees --apply");
    runVisible("bash", ["./ops/agent-orchestrator/sync-agents-from-main.sh"], "sync-agents-from-main.sh");
    syncedAgents = true;
    runVisible("bash", ["./ops/agent-orchestrator/check-status.sh"], "check-status.sh");
    runVisible("node", ["ops/agent-orchestrator/scripts/doctor.mjs"], "doctor");
  } catch (error) {
    if (failedChecks.length === 0) {
      failedChecks.push(error.message);
    }
  }

  finalState = await collectState();
  const doctor = readDoctorJson();
  if (doctor.failed) failedChecks.push(doctor.failed);
  const result = buildFinalizeResult({
    mode: "apply",
    state,
    finalState,
    pushed,
    syncedAgents,
    failedChecks,
    doctorStatus: doctor.status
  });
  printFinalizeResult(result);
  process.exit(result.finalize === "PASS" ? 0 : 1);
}

await main();
