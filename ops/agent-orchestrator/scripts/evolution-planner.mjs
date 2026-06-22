#!/usr/bin/env node
import { applyEvolutionPlan, buildEvolutionObservation, buildImprovementCandidates, buildTaskCandidates, readEvolutionData } from "./lib/evolution-utils.mjs";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const apply = argv.includes("--apply");
  if (argv.includes("--dry-run") && apply) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return { dryRun, apply };
}

function buildPlannerOutput(data, observation) {
  const improvementCandidates = buildImprovementCandidates(data, observation);
  const taskCandidates = buildTaskCandidates(improvementCandidates);
  return {
    generated_at: new Date().toISOString(),
    source: "evolution-planner.mjs",
    improvement_candidates: improvementCandidates,
    task_candidates: taskCandidates,
    validation_plan: [
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
      "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
      "pnpm typecheck"
    ],
    guardrails: [
      "No deploy",
      "No production migration/seed/reset/cleanup",
      "No business code changes without explicit task approval",
      "No HIGH-risk auto-fix"
    ]
  };
}

function printPlan(plan, mode) {
  console.log("# Evolution Planner");
  console.log("");
  console.log(`generated_at: ${plan.generated_at}`);
  console.log(`mode: ${mode}`);
  console.log("");
  console.log("## Improvement Candidates");
  if (plan.improvement_candidates.length === 0) {
    console.log("- none");
  } else {
    for (const item of plan.improvement_candidates) {
      console.log(`- ${item.improvement_id}: ${item.title}`);
      console.log(`  source_pattern=${item.source_pattern_id}; owner=${item.owner_recommendation}; priority=${item.priority}; risk=${item.risk}; score=${item.score}; active_now=${item.active_now ? "yes" : "no"}`);
      console.log(`  root cause: ${item.root_cause}`);
      console.log(`  proposed solution: ${item.proposed_solution}`);
      console.log(`  auto_fix_allowed=${item.auto_fix_allowed ? "yes" : "no"}; approval=${item.requires_approval ? "yes" : "no"}`);
      console.log(`  validation: ${(item.validation_commands ?? []).join(" ; ") || "none"}`);
    }
  }
  console.log("");
  console.log("## Task Candidates");
  if (plan.task_candidates.length === 0) {
    console.log("- none");
  } else {
    for (const task of plan.task_candidates) {
      console.log(`- ${task.task_id} -> ${task.owner}`);
      console.log(`  title: ${task.title}`);
      console.log(`  priority=${task.priority}; risk=${task.risk}; approval=${task.requires_human_approval ? "yes" : "no"}`);
    }
  }
  console.log("");
  console.log("## Validation Plan");
  for (const command of plan.validation_plan) {
    console.log(`- ${command}`);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const data = await readEvolutionData();
const observation = await buildEvolutionObservation({ apply: false });
const plan = buildPlannerOutput(data, observation);
if (args.apply) {
  await applyEvolutionPlan(plan);
}
printPlan(plan, args.apply ? "apply" : "dry-run");
if (args.dryRun) {
  console.log("");
  console.log("Dry-run: no evolution files were modified and no queue tasks were created.");
}
