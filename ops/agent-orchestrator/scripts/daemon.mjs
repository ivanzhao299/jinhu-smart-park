#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "./lib/git-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const daemonDir = join(orchestratorDir, "daemon");
const daemonRunsDir = join(daemonDir, "runs");
const statePath = join(daemonDir, "state.json");

function parseArgs(argv) {
  const modes = {
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    watch: argv.includes("--watch"),
    fixDryRun: argv.includes("--fix-dry-run"),
    fixApply: argv.includes("--fix-apply"),
    autoCycle: argv.includes("--auto-cycle")
  };
  const selected = Object.entries(modes).filter(([, enabled]) => enabled).map(([name]) => name);

  if (selected.length === 0) {
    modes.dryRun = true;
    selected.push("dryRun");
  }

  if (selected.length > 1) {
    throw new Error("Select exactly one daemon mode: --dry-run, --once, --watch, --fix-dry-run, --fix-apply, or --auto-cycle.");
  }

  const intervalIndex = argv.indexOf("--interval");
  const interval = intervalIndex === -1
    ? 30
    : Number.parseInt(argv[intervalIndex + 1] ?? "", 10);

  if (![10, 30, 60].includes(interval)) {
    throw new Error("--interval must be one of: 10, 30, 60.");
  }

  return {
    ...modes,
    mode: selected[0],
    interval
  };
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });

  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? ""
  };
}

function runNode(script, args = [], options = {}) {
  return run("node", [script, ...args], options);
}

function runRequired(command, args, actionLog) {
  const commandText = `${command} ${args.join(" ")}`;
  actionLog.push(`$ ${commandText}`);
  const result = run(command, args, { stdio: "pipe" });
  actionLog.push(result.stdout.trim() || "(stdout empty)");
  if (result.stderr.trim()) {
    actionLog.push("stderr:");
    actionLog.push(result.stderr.trim());
  }
  if (result.status !== 0) {
    throw new Error(`${commandText} failed with exit ${result.status}`);
  }
  return result;
}

function runDoctor(extraArgs = []) {
  const result = runNode("ops/agent-orchestrator/scripts/doctor.mjs", ["--json", ...extraArgs]);
  if (result.status !== 0) {
    throw new Error(`doctor ${extraArgs.join(" ")} failed with exit ${result.status}: ${result.stderr || result.stdout}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`doctor returned non-JSON output: ${error.message}`);
  }
}

function severityCount(diagnosis, severity) {
  return (diagnosis.findings ?? []).filter((finding) => finding.severity === severity).length;
}

function hasBlockingFinding(diagnosis) {
  return (diagnosis.findings ?? []).some((finding) => ["BLOCKER", "ERROR"].includes(finding.severity));
}

function actionableFixes(diagnosis) {
  return (diagnosis.fixes ?? []).filter((fix) => fix.type !== "runtime_dirty_backup_suggestion");
}

function hasRunningCodex(diagnosis) {
  return (diagnosis.runner?.running_codex_exec ?? []).length > 0;
}

function hasHighRiskIntegration(diagnosis) {
  return (diagnosis.integration?.risk_counts?.HIGH ?? 0) > 0;
}

function dirtyAgentCount(diagnosis) {
  return Object.values(diagnosis.worktrees?.agents ?? {}).filter((status) => (status.nonRuntimeDirty ?? []).length > 0).length;
}

function buildPlan(diagnosis) {
  const actions = [];
  const fixes = actionableFixes(diagnosis);
  const activeLocks = diagnosis.locks?.active ?? 0;
  const ready = diagnosis.queue?.counts?.READY ?? 0;
  const candidates = diagnosis.integration?.can_integrate_candidates ?? 0;
  const mainAhead = diagnosis.worktrees?.main?.ahead ?? 0;
  const currentBranch = diagnosis.integration?.current_branch ?? diagnosis.worktrees?.main?.branch ?? "";
  const validationPassed =
    diagnosis.validation?.check_dispatch_status?.passed &&
    diagnosis.validation?.audit_all_results_dry_run?.passed;

  if (fixes.length > 0) {
    actions.push({
      kind: "fix",
      command: "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --fix-dry-run",
      reason: `${fixes.length} LOW-risk doctor fix(es) available`
    });
  }

  if (mainAhead > 0) {
    actions.push({
      kind: "push-main",
      command: "git push origin main",
      reason: `main is ahead of origin/main by ${mainAhead} commit(s)`
    });
  }

  if (activeLocks > 0 && hasRunningCodex(diagnosis)) {
    actions.push({
      kind: "wait-codex",
      command: "wait",
      reason: "CLAIMED tasks exist but codex exec is already running"
    });
  } else if (activeLocks > 0) {
    actions.push({
      kind: "execute-claimed",
      command: "node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --apply --execute",
      reason: `${activeLocks} active lock(s) can be executed serially`
    });
  }

  if (dirtyAgentCount(diagnosis) > 0 && !hasRunningCodex(diagnosis)) {
    actions.push({
      kind: "commit-agent-results",
      command: "node ops/agent-orchestrator/scripts/commit-agent-results.mjs --apply",
      reason: "agent worktrees have dirty result files; commit-agent-results will enforce LOW/MEDIUM path boundaries"
    });
  }

  if (candidates > 0) {
    actions.push({
      kind: "integrate",
      command: "node ops/agent-orchestrator/scripts/integrate-agent-results.mjs --apply",
      reason: `${candidates} agent branch candidate(s) can be integrated if risk is LOW/MEDIUM`
    });
  }

  if (currentBranch.startsWith("integration/") && validationPassed) {
    actions.push({
      kind: "merge-integration",
      command: "git checkout main && git merge --ff-only <integration-branch> && git push origin main",
      reason: "current integration branch has passing dispatch/audit validation"
    });
  }

  if (ready > 0 && activeLocks === 0) {
    actions.push({
      kind: "dispatch-or-agent-cycle",
      command: "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run",
      reason: `${ready} READY task(s) remain; preview dispatch/agent-cycle before execution`
    });
  }

  if (actions.length === 0) {
    actions.push({
      kind: "observe",
      command: "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      reason: "no immediate daemon action found"
    });
  }

  return actions;
}

function printSummary(title, diagnosis, plan) {
  console.log(`# ${title}`);
  console.log("");
  console.log(`status: ${diagnosis.status}`);
  console.log(`findings: INFO=${severityCount(diagnosis, "INFO")} WARN=${severityCount(diagnosis, "WARN")} ERROR=${severityCount(diagnosis, "ERROR")} BLOCKER=${severityCount(diagnosis, "BLOCKER")}`);
  console.log(`queue: READY=${diagnosis.queue?.counts?.READY ?? 0} CLAIMED=${diagnosis.queue?.counts?.CLAIMED ?? 0} DONE=${diagnosis.queue?.counts?.DONE ?? 0}`);
  console.log(`locks: active=${diagnosis.locks?.active ?? 0} duplicate=${diagnosis.locks?.duplicate?.length ?? 0} stale=${diagnosis.locks?.stale?.length ?? 0}`);
  console.log(`codex exec running: ${(diagnosis.runner?.running_codex_exec ?? []).length}`);
  console.log(`integration candidates: ${diagnosis.integration?.can_integrate_candidates ?? 0}`);
  console.log("");
  console.log("## Suggested Next Actions");
  for (const action of plan) {
    console.log(`- ${action.kind}: ${action.command}`);
    console.log(`  reason: ${action.reason}`);
  }
}

async function writeDaemonLog({ mode, diagnosis, plan, actionLog, error = "" }) {
  await mkdir(daemonRunsDir, { recursive: true });
  const file = join(daemonRunsDir, `${timestamp()}.log`);
  const content = [
    `mode: ${mode}`,
    `run_at: ${new Date().toISOString()}`,
    `status: ${diagnosis?.status ?? "UNKNOWN"}`,
    `branch: ${diagnosis?.worktrees?.main?.branch ?? ""}`,
    `head: ${diagnosis?.worktrees?.main?.head ?? ""}`,
    `error: ${error}`,
    "",
    "## Plan",
    ...(plan ?? []).map((action) => `- ${action.kind}: ${action.command} (${action.reason})`),
    "",
    "## Actions",
    ...(actionLog.length > 0 ? actionLog : ["- none"]),
    ""
  ].join("\n");
  await writeFile(file, content);
  return file;
}

async function writeState({ mode, diagnosis, plan, lastAction = "", error = "" }) {
  await mkdir(daemonDir, { recursive: true });
  const state = {
    last_run_at: new Date().toISOString(),
    last_status: diagnosis?.status ?? "UNKNOWN",
    last_action: lastAction,
    last_error: error,
    last_branch: diagnosis?.worktrees?.main?.branch ?? "",
    last_head: diagnosis?.worktrees?.main?.head ?? "",
    active_codex_processes: diagnosis?.runner?.running_codex_exec ?? [],
    next_action: (plan ?? []).map((action) => action.command),
    mode
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function autoCycleAllowed(diagnosis) {
  if (hasHighRiskIntegration(diagnosis)) {
    return { allowed: false, reason: "HIGH-risk integration candidate exists" };
  }
  if ((diagnosis.findings ?? []).some((finding) => finding.severity === "BLOCKER")) {
    return { allowed: false, reason: "BLOCKER finding exists" };
  }
  return { allowed: true, reason: "" };
}

async function runAutoCycle(diagnosis, plan) {
  const actionLog = [];
  const allowed = autoCycleAllowed(diagnosis);
  if (!allowed.allowed) {
    throw new Error(`auto-cycle stopped: ${allowed.reason}`);
  }

  if (hasBlockingFinding(diagnosis)) {
    actionLog.push("doctor status is NO_GO; auto-cycle will not run mutating actions.");
    return actionLog;
  }

  for (const action of plan) {
    if (action.kind === "observe" || action.kind === "wait-codex" || action.kind === "dispatch-or-agent-cycle") {
      actionLog.push(`skip ${action.kind}: ${action.reason}`);
      continue;
    }

    if (action.kind === "push-main") {
      runRequired("git", ["-C", repoRoot, "push", "origin", "main"], actionLog);
    } else if (action.kind === "execute-claimed") {
      runRequired("node", ["ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs", "--apply", "--execute"], actionLog);
    } else if (action.kind === "commit-agent-results") {
      runRequired("node", ["ops/agent-orchestrator/scripts/commit-agent-results.mjs", "--apply"], actionLog);
    } else if (action.kind === "integrate") {
      runRequired("node", ["ops/agent-orchestrator/scripts/integrate-agent-results.mjs", "--apply"], actionLog);
    } else if (action.kind === "merge-integration") {
      const integrationBranch = diagnosis.integration.current_branch;
      git(repoRoot, ["checkout", "main"], { stdio: "inherit" });
      git(repoRoot, ["merge", "--ff-only", integrationBranch], { stdio: "inherit" });
      runRequired("node", ["ops/agent-orchestrator/scripts/run-validation-matrix.mjs"], actionLog);
      runRequired("git", ["-C", repoRoot, "push", "origin", "main"], actionLog);
      runRequired("node", ["ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", "--apply"], actionLog);
    } else if (action.kind === "fix") {
      runRequired("node", ["ops/agent-orchestrator/scripts/doctor.mjs", "--fix-apply"], actionLog);
    }
  }

  return actionLog;
}

async function runIteration(args) {
  if (args.fixApply) {
    const diagnosis = runDoctor(["--fix-apply"]);
    const plan = buildPlan(diagnosis);
    const applied = diagnosis.applied_fixes ?? [];
    printSummary("Orchestrator Daemon fix-apply", diagnosis, plan);
    console.log("");
    console.log("Applied fixes:");
    if (applied.length === 0) {
      console.log("- none");
    } else {
      for (const fix of applied) {
        console.log(`- ${fix.type}`);
      }
      const logFile = await writeDaemonLog({
        mode: "fix-apply",
        diagnosis,
        plan,
        actionLog: applied.map((fix) => `applied ${fix.type}`)
      });
      await writeState({ mode: "fix-apply", diagnosis, plan, lastAction: "doctor --fix-apply" });
      console.log(`daemon log: ${logFile}`);
    }
    return diagnosis;
  }

  const diagnosis = runDoctor(args.fixDryRun ? ["--fix-dry-run"] : []);
  const plan = buildPlan(diagnosis);

  if (args.dryRun) {
    printSummary("Orchestrator Daemon dry-run", diagnosis, plan);
    console.log("");
    console.log("Dry-run: no files were modified and no actions were executed.");
    return diagnosis;
  }

  if (args.fixDryRun) {
    printSummary("Orchestrator Daemon fix-dry-run", diagnosis, plan);
    console.log("");
    console.log("Auto-fix candidates:");
    const fixes = actionableFixes(diagnosis);
    if (fixes.length === 0) {
      console.log("- none");
    } else {
      for (const fix of fixes) {
        console.log(`- ${fix.type}: ${fix.message}`);
      }
    }
    console.log("Fix dry-run: no files were modified.");
    return diagnosis;
  }

  if (args.autoCycle) {
    printSummary("Orchestrator Daemon auto-cycle", diagnosis, plan);
    const actionLog = [];
    let error = "";
    try {
      actionLog.push(...(await runAutoCycle(diagnosis, plan)));
    } catch (runError) {
      error = runError.message;
      console.log("");
      console.log(`# Auto-cycle Result: NO_GO`);
      console.log(error);
    }
    const logFile = await writeDaemonLog({ mode: "auto-cycle", diagnosis, plan, actionLog, error });
    await writeState({ mode: "auto-cycle", diagnosis, plan, lastAction: actionLog.at(-1) ?? "", error });
    console.log("");
    console.log(`daemon log: ${logFile}`);
    return diagnosis;
  }

  printSummary("Orchestrator Daemon once", diagnosis, plan);
  console.log("");
  console.log("Once mode: observed state only; no files were modified and no actions were executed.");
  return diagnosis;
}

async function watch(args) {
  console.log(`# Orchestrator Daemon watch`);
  console.log(`interval: ${args.interval}s`);
  console.log("Press Ctrl+C to stop.");
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("");
    console.log("Stopping daemon watch.");
  });

  while (!stopping) {
    await runIteration({ ...args, watch: false, once: true });
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, args.interval * 1000));
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (args.watch) {
  await watch(args);
} else {
  await runIteration(args);
}
