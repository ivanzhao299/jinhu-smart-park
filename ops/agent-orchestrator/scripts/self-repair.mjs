#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const DEFAULT_MAX_ROUNDS = 3;
const RUN_PLAN_RELATIVE_PATH = "ops/agent-orchestrator/runs/agent-run-plan.md";

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/self-repair.mjs --dry-run|--apply [--reason <text>] [--max-rounds 3]");
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  const reasonIndex = argv.indexOf("--reason");
  const maxRoundsIndex = argv.indexOf("--max-rounds");
  const maxRounds = maxRoundsIndex === -1
    ? DEFAULT_MAX_ROUNDS
    : Number.parseInt(argv[maxRoundsIndex + 1] ?? "", 10);

  if (argv.includes("--dry-run") && apply) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 3) {
    throw new Error("--max-rounds must be an integer from 1 to 3.");
  }

  return {
    apply,
    dryRun,
    reason: reasonIndex === -1 ? "unspecified failure" : argv[reasonIndex + 1] ?? "unspecified failure",
    maxRounds
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
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

function commandText(command, args) {
  return `${command} ${args.join(" ")}`;
}

function runLogged(command, args, actions, options = {}) {
  const text = commandText(command, args);
  actions.push(`$ ${text}`);
  console.log(`$ ${text}`);
  const result = run(command, args, { stdio: options.stdio ?? "inherit" });
  actions.push(`exit=${result.status}`);
  return result;
}

function runDoctorJson() {
  const result = run("node", ["ops/agent-orchestrator/scripts/doctor.mjs", "--json"]);
  if (result.status !== 0) {
    return {
      ok: false,
      diagnosis: null,
      error: `doctor --json failed with exit ${result.status}: ${result.stderr.trim() || result.stdout.trim()}`
    };
  }

  try {
    return {
      ok: true,
      diagnosis: JSON.parse(result.stdout),
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      diagnosis: null,
      error: `doctor --json produced invalid JSON: ${error.message}`
    };
  }
}

function runCheckStatus() {
  return run("bash", ["./ops/agent-orchestrator/check-status.sh"]);
}

function hasHighRiskOrBusinessDirty(diagnosis) {
  const mainDirty = diagnosis?.worktrees?.main?.nonRuntimeDirty ?? [];
  const agents = Object.values(diagnosis?.worktrees?.agents ?? {});
  const agentDirty = agents.flatMap((agent) => agent.nonRuntimeDirty ?? []);
  const allDirty = [...mainDirty, ...agentDirty].map((entry) => String(entry.path ?? entry));
  const highRiskDirty = allDirty.some((path) =>
    path.startsWith("apps/") ||
    path.startsWith("packages/") ||
    path.startsWith("database/") ||
    path.startsWith("infra/") ||
    path.startsWith(".github/") ||
    path === "Dockerfile" ||
    path.startsWith("Dockerfile.") ||
    path.startsWith("docker-compose") ||
    path.includes("deploy") ||
    path.includes("auth")
  );

  return highRiskDirty || (diagnosis?.integration?.risk_counts?.HIGH ?? 0) > 0;
}

function normalizePath(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function mainDirtyEntries(diagnosis) {
  return diagnosis?.worktrees?.main?.nonRuntimeDirty ?? [];
}

function isRunPlanEntry(entry) {
  return normalizePath(entry.path ?? entry) === RUN_PLAN_RELATIVE_PATH;
}

function hasRunPlanDirty(diagnosis) {
  return mainDirtyEntries(diagnosis).some((entry) => isRunPlanEntry(entry));
}

function hasMainDirtyOutsideRunPlan(diagnosis) {
  return mainDirtyEntries(diagnosis).some((entry) => !isRunPlanEntry(entry));
}

function needsReadModelRepair(diagnosis) {
  if (!diagnosis) return false;
  if (diagnosis.event_store && diagnosis.event_store.read_model_consistent === false) return true;
  return (diagnosis.findings ?? []).some((finding) =>
    ["queue", "locks", "event-store", "validation"].includes(finding.area) &&
    ["ERROR", "BLOCKER"].includes(finding.severity)
  );
}

function actionableDoctorFixCount(diagnosis) {
  return (diagnosis?.fixes ?? []).filter((fix) => fix.type !== "runtime_dirty_backup_suggestion").length;
}

function statusIsRepairable(diagnosis, checkStatus) {
  if (!diagnosis) return true;
  if (hasHighRiskOrBusinessDirty(diagnosis)) return false;
  if (actionableDoctorFixCount(diagnosis) > 0) return true;
  if (needsReadModelRepair(diagnosis)) return true;
  if (checkStatus.status !== 0) return true;
  if (diagnosis.status === "NO_GO") return true;
  return false;
}

function printDiagnosis(round, diagnosis, checkStatus) {
  console.log("");
  console.log(`## Self-Repair Diagnosis Round ${round}`);
  if (!diagnosis) {
    console.log("doctor: unavailable");
  } else {
    console.log(`doctor: ${diagnosis.status}`);
    console.log(`READY: ${diagnosis.queue?.counts?.READY ?? "?"}`);
    console.log(`CLAIMED: ${diagnosis.queue?.counts?.CLAIMED ?? "?"}`);
    console.log(`active_locks: ${diagnosis.locks?.active ?? "?"}`);
    console.log(`candidate_agent_branches: ${diagnosis.integration?.can_integrate_candidates ?? "?"}`);
    console.log(`doctor actionable fixes: ${actionableDoctorFixCount(diagnosis)}`);
    console.log(`event/read-model consistent: ${diagnosis.event_store?.read_model_consistent === false ? "no" : "yes"}`);
    console.log(`run_plan_dirty: ${hasRunPlanDirty(diagnosis) ? "yes" : "no"}`);
  }
  console.log(`check-status: ${checkStatus.status === 0 ? "PASS" : `FAIL exit=${checkStatus.status}`}`);
}

function parseFinalizePass(output) {
  return /^finalize:\s+PASS$/m.test(output);
}

function runFinalFinalize(actions) {
  console.log("");
  console.log("## Finalize After Self-Repair");
  const command = "node";
  const args = ["ops/agent-orchestrator/scripts/finalize.mjs", "--apply", "--no-self-repair"];
  const text = commandText(command, args);
  actions.push(`$ ${text}`);
  console.log(`$ ${text}`);
  const result = run(command, args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  actions.push(`exit=${result.status}`);
  return {
    status: result.status,
    passed: result.status === 0 && parseFinalizePass(result.stdout)
  };
}

function printResult({ mode, success, rounds, actions, reason, finalFinalize, skippedReason = "" }) {
  console.log("");
  console.log("# SELF-REPAIR RESULT");
  console.log(`mode: ${mode}`);
  console.log(`self_repair: ${success ? "PASS" : "FAIL"}`);
  console.log(`trigger_reason: ${reason}`);
  console.log(`rounds: ${rounds}`);
  console.log(`finalize_rerun: ${finalFinalize ? "yes" : "no"}`);
  console.log(`finalize_pass: ${finalFinalize?.passed ? "yes" : "no"}`);
  console.log(`skipped_reason: ${skippedReason || "none"}`);
  console.log("actions:");
  if (actions.length === 0) {
    console.log("- none");
  } else {
    for (const action of actions) {
      console.log(`- ${action}`);
    }
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  usage();
  console.error(error.message);
  process.exit(1);
}

const actions = [];
console.log(`# Orchestrator Self-Repair ${args.apply ? "apply" : "dry-run"}`);
console.log("");
console.log(`trigger reason: ${args.reason}`);
console.log(`max rounds: ${args.maxRounds}`);
console.log("Guardrails: LOW-risk repair only; no deploy, production migration, seed, reset, cleanup, business-code commit, merge, or HIGH-risk auto handling.");

if (args.dryRun) {
  const doctor = runDoctorJson();
  const checkStatus = runCheckStatus();
  printDiagnosis(1, doctor.diagnosis, checkStatus);
  const repairable = doctor.ok && statusIsRepairable(doctor.diagnosis, checkStatus);
  const plannedActions = [];
  if (doctor.ok && (doctor.diagnosis.fixes ?? []).some((fix) => fix.type === "restore_run_plan")) {
    plannedActions.push(`would restore ${RUN_PLAN_RELATIVE_PATH}`);
  }
  plannedActions.push(
    "would run doctor --fix-apply when actionable LOW-risk fixes exist",
    "would run reconcile-worktrees.mjs --apply",
    "would run reconcile-task-results.mjs --apply when queue/event read model repair is needed",
    "would rerun finalize --apply after repair"
  );
  printResult({
    mode: "dry-run",
    success: doctor.ok && !hasHighRiskOrBusinessDirty(doctor.diagnosis),
    rounds: 0,
    actions: plannedActions,
    reason: args.reason,
    finalFinalize: null,
    skippedReason: repairable ? "" : doctor.error || "not repairable by LOW-risk self-repair"
  });
  process.exit(doctor.ok && !hasHighRiskOrBusinessDirty(doctor.diagnosis) ? 0 : 1);
}

let rounds = 0;
let blockedReason = "";

for (let round = 1; round <= args.maxRounds; round += 1) {
  rounds = round;
  const doctor = runDoctorJson();
  const checkStatus = runCheckStatus();
  printDiagnosis(round, doctor.diagnosis, checkStatus);

  if (!doctor.ok) {
    blockedReason = doctor.error;
  } else if (hasHighRiskOrBusinessDirty(doctor.diagnosis)) {
    blockedReason = "HIGH-risk or business-path dirty state requires human repair";
    break;
  } else if (hasRunPlanDirty(doctor.diagnosis) && hasMainDirtyOutsideRunPlan(doctor.diagnosis)) {
    blockedReason = `${RUN_PLAN_RELATIVE_PATH} is dirty together with other main non-runtime dirty files; human review is required`;
    break;
  }

  const repairable = doctor.ok && statusIsRepairable(doctor.diagnosis, checkStatus);
  if (!repairable) {
    console.log("No LOW-risk repair action needed before final finalize.");
    break;
  }

  if (doctor.ok && actionableDoctorFixCount(doctor.diagnosis) > 0) {
    runLogged("node", ["ops/agent-orchestrator/scripts/doctor.mjs", "--fix-apply"], actions);
  }

  runLogged("node", ["ops/agent-orchestrator/scripts/reconcile-worktrees.mjs", "--apply"], actions);

  if (doctor.ok && needsReadModelRepair(doctor.diagnosis)) {
    runLogged("node", ["ops/agent-orchestrator/scripts/reconcile-task-results.mjs", "--apply"], actions);
  }
}

if (blockedReason) {
  printResult({
    mode: "apply",
    success: false,
    rounds,
    actions,
    reason: args.reason,
    finalFinalize: null,
    skippedReason: blockedReason
  });
  process.exit(1);
}

const finalFinalize = runFinalFinalize(actions);
printResult({
  mode: "apply",
  success: finalFinalize.passed,
  rounds,
  actions,
  reason: args.reason,
  finalFinalize
});

process.exit(finalFinalize.passed ? 0 : 1);
