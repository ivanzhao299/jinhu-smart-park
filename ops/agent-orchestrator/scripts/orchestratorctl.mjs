#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFilesAgainst,
  changedFilesNameStatus,
  classifyAgentResultRisk,
  commitsNotIn,
  git,
  repoStatus
} from "./lib/git-utils.mjs";
import {
  detectCodexCli,
  detectCodexExecOptions,
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
const resultsPath = join(orchestratorDir, "queue", "task-results.json");
const ACTIVE_LOCK_STATUSES = new Set(["CLAIMED", "IN_PROGRESS", "BLOCKED"]);
const RISK_RANK = new Map([["LOW", 0], ["MEDIUM", 1], ["HIGH", 2]]);
const AGENT_INTEGRATION_ORDER = ["agent-2", "agent-3", "agent-4", "agent-5", "agent-1"];

function usage() {
  console.error(`Usage:
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs status
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs reconcile --dry-run|--apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs integrate --dry-run|--apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs validate
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor [--json|--fix-dry-run|--fix-apply] [--deep]
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs full-cycle --dry-run|--apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --push
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute --push`);
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function runScript(script, args = []) {
  const result = spawnSync("node", [script, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runScriptResult(script, args = []) {
  console.log(`$ node ${[script, ...args].join(" ")}`);
  const result = spawnSync("node", [script, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
  return result.status ?? 1;
}

function requireScript(script, args = []) {
  const status = runScriptResult(script, args);
  if (status !== 0) {
    throw new Error(`${script} ${args.join(" ")} failed with exit ${status}`);
  }
}

function formatEntries(entries) {
  return entries.length === 0 ? "none" : entries.map((entry) => `${entry.code} ${entry.path}`).join("; ");
}

function parseAgentCycleArgs(argv) {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const apply = argv.includes("--apply");
  const execute = argv.includes("--execute");
  const push = argv.includes("--push");

  if (argv.includes("--dry-run") && (apply || execute || push)) {
    throw new Error("Use either --dry-run or --apply mode, not both.");
  }
  if (execute && !apply) {
    throw new Error("--execute requires --apply.");
  }
  if (push && !apply) {
    throw new Error("--push requires --apply.");
  }

  return { dryRun, apply, execute, push };
}

function commandMode(args) {
  if (args.dryRun) return "dry-run";
  if (args.apply && args.execute && args.push) return "apply-execute-push";
  if (args.apply && args.execute) return "apply-execute";
  if (args.apply && args.push) return "apply-push";
  return "apply-plan";
}

function activeLockAgents(queue, locks) {
  const tasks = new Map((queue.tasks ?? []).map((task) => [task.task_id, task]));
  const agents = new Set();
  for (const lock of locks.locks ?? []) {
    const task = tasks.get(lock.task_id);
    if (!task || ACTIVE_LOCK_STATUSES.has(task.status)) {
      agents.add(lock.agent);
    }
  }
  return agents;
}

function readyTasks(queue) {
  return (queue.tasks ?? []).filter((task) => task.status === "READY");
}

function claimableReadyTasks(queue, locks, agentsById, agentStatusesById) {
  const activeAgents = activeLockAgents(queue, locks);
  return readyTasks(queue).filter((task) => {
    if (!VALID_AGENTS.includes(task.owner)) return false;
    if (activeAgents.has(task.owner)) return false;
    if (!agentsById.has(task.owner)) return false;
    const status = agentStatusesById.get(task.owner);
    return status && status.nonRuntimeDirty.length === 0;
  });
}

function collectIntegrationCandidates(agents) {
  const candidates = [];
  for (const agent of agents) {
    const commits = commitsNotIn(agent.path, "origin/main", "HEAD");
    if (commits.length === 0) continue;

    const files = changedFilesAgainst(agent.path, "origin/main", "HEAD");
    candidates.push({
      agent,
      commits,
      files,
      nameStatus: changedFilesNameStatus(agent.path, "origin/main", "HEAD"),
      risk: classifyAgentResultRisk(files)
    });
  }

  candidates.sort((a, b) => {
    const byAgent = AGENT_INTEGRATION_ORDER.indexOf(a.agent.id) - AGENT_INTEGRATION_ORDER.indexOf(b.agent.id);
    if (byAgent !== 0) return byAgent;

    const byRisk = RISK_RANK.get(a.risk) - RISK_RANK.get(b.risk);
    if (byRisk !== 0) return byRisk;
    return a.agent.id.localeCompare(b.agent.id);
  });

  return candidates;
}

function printIntegrationCandidates(candidates) {
  console.log("");
  console.log("## Agent Result Candidates");
  if (candidates.length === 0) {
    console.log("- none");
    return;
  }

  for (const candidate of candidates) {
    console.log(`- ${candidate.agent.id} | ${candidate.risk} | ${candidate.commits.length} commit(s)`);
    for (const line of candidate.nameStatus) {
      console.log(`  - ${line}`);
    }
  }
}

function worktreeHasChanges(path) {
  return git(path, ["status", "--short"]).stdout.trim().length > 0;
}

function currentBranch(path) {
  return git(path, ["branch", "--show-current"]).stdout.trim();
}

function printOutcome(status, reason) {
  console.log("");
  console.log(`# Agent Cycle Result: ${status}`);
  if (reason) {
    console.log(reason);
  }
}

async function statusCommand() {
  const config = await readJson(agentsConfigPath);
  const repos = [
    { id: "main", ...(config.main ?? { path: repoRoot }) },
    ...normalizeAgentConfig(config).values()
  ];

  console.log("# Orchestrator Status");
  console.log("");

  for (const repo of repos) {
    const status = repoStatus(repo.path);
    console.log(`## ${repo.id ?? repo.name}`);
    console.log(`path: ${repo.path}`);
    console.log(`branch: ${status.branch}`);
    console.log(`head: ${status.head}`);
    console.log(`clean: ${status.clean ? "yes" : "no"}`);
    console.log(`ahead/behind origin/main...HEAD: ${status.behind ?? "?"}\t${status.ahead ?? "?"}`);
    console.log(`runtime dirty: ${formatEntries(status.runtimeDirty)}`);
    console.log(`non-runtime dirty: ${formatEntries(status.nonRuntimeDirty)}`);
    console.log("");
  }
}

async function readAgentCycleState() {
  const config = await readJson(agentsConfigPath);
  const queue = await readJson(queuePath);
  const locks = await readJson(locksPath);
  const results = await readJson(resultsPath);
  const agentsById = normalizeAgentConfig(config);
  const agents = [...agentsById.values()];
  const mainPath = config.main?.path ?? repoRoot;
  const mainStatus = repoStatus(mainPath);
  const agentStatuses = agents.map((agent) => ({ agent, status: repoStatus(agent.path) }));
  const agentStatusesById = new Map(agentStatuses.map((item) => [item.agent.id, item.status]));
  const codex = detectCodexCli();
  codex.execOptions = detectCodexExecOptions(codex.path);

  return {
    config,
    queue,
    locks,
    results,
    agents,
    agentsById,
    mainPath,
    mainStatus,
    agentStatuses,
    agentStatusesById,
    codex
  };
}

function printAgentCyclePrecheck(state, args) {
  const ready = readyTasks(state.queue);
  const claimable = claimableReadyTasks(state.queue, state.locks, state.agentsById, state.agentStatusesById);

  console.log(`# Agent Cycle ${commandMode(args)}`);
  console.log("");
  console.log("Guardrails: no production deploy, no production migration/seed, no database reset/cleanup, no hidden merge, no hidden push, no HIGH-risk auto handling.");
  console.log("");
  console.log("## Preflight");
  console.log(`main path: ${state.mainPath}`);
  console.log(`main branch: ${state.mainStatus.branch}`);
  console.log(`main head: ${state.mainStatus.head}`);
  console.log(`main clean: ${state.mainStatus.clean ? "yes" : "no"}`);
  console.log(`main ahead origin/main: ${state.mainStatus.ahead ?? "?"}`);
  console.log(`main behind origin/main: ${state.mainStatus.behind ?? "?"}`);
  console.log(`main runtime dirty: ${formatEntries(state.mainStatus.runtimeDirty)}`);
  console.log(`main non-runtime dirty: ${formatEntries(state.mainStatus.nonRuntimeDirty)}`);
  console.log(`Codex CLI: ${state.codex.found ? "found" : "not found"}`);
  console.log(`Codex CLI path: ${state.codex.path || "(not found)"}`);
  console.log(`Codex CLI version: ${state.codex.version || "(unavailable)"}`);
  console.log(`Codex exec approval: ${state.codex.execOptions.approval.note}`);
  console.log(`Codex exec sandbox: ${state.codex.execOptions.sandbox.note}`);
  console.log("JSON parse: ok (task-queue, task-locks, task-results)");
  console.log(`READY tasks: ${ready.length}`);
  console.log(`claimable READY tasks this cycle: ${claimable.length}`);
  console.log("");
  console.log("## Agent Worktrees");
  for (const { agent, status } of state.agentStatuses) {
    console.log(`- ${agent.id}: clean=${status.clean ? "yes" : "no"} branch=${status.branch} head=${status.head}`);
    console.log(`  runtime dirty: ${formatEntries(status.runtimeDirty)}`);
    console.log(`  non-runtime dirty: ${formatEntries(status.nonRuntimeDirty)}`);
  }
}

async function runReadOnlyPlans() {
  console.log("");
  console.log("## Read-Only Pipeline Plan");
  requireScript("ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs", ["--dry-run"]);
  requireScript("ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs", ["--dry-run", "--no-write"]);
  requireScript("ops/agent-orchestrator/scripts/commit-agent-results.mjs", ["--dry-run"]);
  requireScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--dry-run"]);
  requireScript("ops/agent-orchestrator/scripts/run-validation-matrix.mjs", ["--plan"]);
}

function precheckBlockers(state, args) {
  const blockers = [];
  if (!state.mainStatus.clean) {
    blockers.push("main worktree is not clean");
  }

  for (const { agent, status } of state.agentStatuses) {
    if (status.nonRuntimeDirty.length > 0) {
      blockers.push(`${agent.id} has non-runtime dirty files: ${formatEntries(status.nonRuntimeDirty)}`);
    }
  }

  if (args.execute && !state.codex.found) {
    blockers.push("Codex CLI not found; cannot execute agents");
  }

  if (args.execute && (state.mainStatus.ahead ?? 0) > 0 && !args.push) {
    blockers.push("main has commits ahead of origin/main; pass --push before agent execution so agents can be synced");
  }

  return blockers;
}

async function pushMainIfNeeded(state) {
  const ahead = state.mainStatus.ahead ?? 0;
  if (ahead <= 0) {
    console.log("main is not ahead of origin/main; push not needed.");
    return;
  }

  console.log(`Pushing ${ahead} main commit(s) to origin/main.`);
  git(state.mainPath, ["push", "origin", "main"], { stdio: "inherit" });
}

async function commitDispatchState(mainPath) {
  git(mainPath, [
    "add",
    "ops/agent-orchestrator/queue/task-queue.json",
    "ops/agent-orchestrator/queue/task-locks.json",
    "ops/agent-orchestrator/runs/dispatch-report.md",
    ":(glob)ops/agent-orchestrator/runs/*.prompt.md"
  ], { stdio: "inherit" });

  if (!worktreeHasChanges(mainPath)) {
    console.log("Dispatch produced no git changes; no dispatch commit needed.");
    return false;
  }

  git(mainPath, ["commit", "-m", "chore(orchestrator): dispatch ready agent tasks"], { stdio: "inherit" });
  return true;
}

async function dispatchReadyTasksIfAllowed(state, args) {
  const claimable = claimableReadyTasks(state.queue, state.locks, state.agentsById, state.agentStatusesById);
  if (claimable.length === 0) {
    console.log("No claimable READY tasks; dispatch apply skipped.");
    requireScript("ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs", ["--dry-run"]);
    return false;
  }

  if (!args.push) {
    console.log("Claimable READY tasks exist, but dispatch apply is skipped without --push because agent sync requires origin/main.");
    requireScript("ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs", ["--dry-run"]);
    return false;
  }

  requireScript("ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs", []);
  const committed = await commitDispatchState(state.mainPath);
  if (committed) {
    git(state.mainPath, ["push", "origin", "main"], { stdio: "inherit" });
    requireScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", ["--apply"]);
  }
  return committed;
}

function printManualMergeCommands(mainPath, integrationBranch) {
  console.log("");
  console.log("Validation passed. Push was not requested, so main was not merged or pushed automatically.");
  console.log("Manual commands after review:");
  console.log(`  git -C ${mainPath} checkout main`);
  console.log(`  git -C ${mainPath} merge --ff-only ${integrationBranch}`);
  console.log(`  git -C ${mainPath} push origin main`);
  console.log("  ./ops/agent-orchestrator/check-status.sh");
}

async function mergeIntegrationToMainAndPush(state, integrationBranch) {
  console.log("");
  console.log(`Merging ${integrationBranch} back to main and pushing origin/main.`);
  git(state.mainPath, ["checkout", "main"], { stdio: "inherit" });
  git(state.mainPath, ["merge", "--ff-only", integrationBranch], { stdio: "inherit" });
  git(state.mainPath, ["push", "origin", "main"], { stdio: "inherit" });
  requireScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", ["--apply"]);
  requireScript("ops/agent-orchestrator/scripts/check-dispatch-status.mjs", []);
}

async function integrateExistingAgentCommits(state, args) {
  const candidates = collectIntegrationCandidates(state.agents);
  printIntegrationCandidates(candidates);

  const highRisk = candidates.filter((candidate) => candidate.risk === "HIGH");
  if (highRisk.length > 0) {
    printOutcome("NO_GO", `HIGH-risk agent changes require human confirmation before integration:\n- ${highRisk.map((item) => item.agent.id).join("\n- ")}`);
    process.exit(1);
  }

  requireScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--dry-run"]);

  if (candidates.length === 0) {
    printOutcome(args.push ? "GO" : "CONDITIONAL_GO", "No agent commits to integrate.");
    return;
  }

  requireScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", ["--apply"]);
  const integrationBranch = currentBranch(state.mainPath);

  if (args.push) {
    await mergeIntegrationToMainAndPush(state, integrationBranch);
    printOutcome("GO", "Agent cycle completed, integration validated, main pushed, and agents reconciled.");
  } else {
    printManualMergeCommands(state.mainPath, integrationBranch);
    printOutcome("CONDITIONAL_GO", "Integration branch is ready after validation. Human review is still required before merge/push.");
  }
}

async function agentCycleCommand(rest) {
  let args;
  try {
    args = parseAgentCycleArgs(rest);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const state = await readAgentCycleState();
  printAgentCyclePrecheck(state, args);

  if (args.dryRun) {
    await runReadOnlyPlans();
    printOutcome("CONDITIONAL_GO", "Dry-run only; no files were modified.");
    return;
  }

  if (!args.execute) {
    const blockers = precheckBlockers(state, args);
    if (blockers.length > 0) {
      printOutcome("NO_GO", `Integration apply stopped by preflight blocker(s):\n- ${blockers.join("\n- ")}`);
      process.exit(1);
    }
    await integrateExistingAgentCommits(state, args);
    return;
  }

  const blockers = precheckBlockers(state, args);
  if (blockers.length > 0) {
    printOutcome("NO_GO", `Execution stopped by preflight blocker(s):\n- ${blockers.join("\n- ")}`);
    process.exit(1);
  }

  if (args.push) {
    await pushMainIfNeeded(state);
  }

  requireScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", ["--apply"]);

  const refreshedBeforeDispatch = await readAgentCycleState();
  await dispatchReadyTasksIfAllowed(refreshedBeforeDispatch, args);

  requireScript("ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs", ["--apply", "--execute"]);
  requireScript("ops/agent-orchestrator/scripts/commit-agent-results.mjs", ["--apply"]);

  const refreshedAfterCommit = await readAgentCycleState();
  await integrateExistingAgentCommits(refreshedAfterCommit, args);
}

const argv = process.argv.slice(2);
const command = argv[0];
const rest = argv.slice(1);

switch (command) {
  case "status":
    await statusCommand();
    break;
  case "reconcile":
    runScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", [
      hasFlag(rest, "--apply") ? "--apply" : "--dry-run"
    ]);
    break;
  case "integrate":
    runScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", [
      hasFlag(rest, "--apply") ? "--apply" : "--dry-run"
    ]);
    break;
  case "validate":
    runScript("ops/agent-orchestrator/scripts/run-validation-matrix.mjs");
    break;
  case "doctor":
    runScript("ops/agent-orchestrator/scripts/doctor.mjs", rest);
    break;
  case "full-cycle": {
    const apply = hasFlag(rest, "--apply");
    await statusCommand();
    runScript("ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", [apply ? "--apply" : "--dry-run"]);
    runScript("ops/agent-orchestrator/scripts/integrate-agent-results.mjs", [apply ? "--apply" : "--dry-run"]);
    runScript("ops/agent-orchestrator/scripts/run-validation-matrix.mjs", [apply ? "" : "--plan"].filter(Boolean));
    if (apply) {
      console.log("");
      console.log("Full cycle completed. If validation passed, you may consider manual merge to main / push after human review.");
    }
    break;
  }
  case "agent-cycle":
    await agentCycleCommand(rest);
    break;
  default:
    usage();
    process.exit(1);
}
