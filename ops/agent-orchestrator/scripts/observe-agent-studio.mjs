#!/usr/bin/env node
import { buildEvolutionObservation } from "./lib/evolution-utils.mjs";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const apply = argv.includes("--apply");
  if (argv.includes("--dry-run") && apply) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return { dryRun, apply };
}

function printObservation(observation) {
  console.log("# Evolution Summary");
  console.log("");
  console.log(`generated_at: ${observation.generated_at}`);
  console.log(`mode: ${observation.mode}`);
  console.log(`patterns: ${observation.summary.pattern_count}`);
  console.log(`open_improvements: ${observation.summary.open_improvements}`);
  console.log(`resolved_improvements: ${observation.summary.resolved_improvements}`);
  console.log(`learning_entries: ${observation.summary.learning_entries}`);
  console.log(`doctor: ${observation.sources.doctor.status}`);
  console.log(`event_store_task_events: ${observation.sources.event_store.task_events}`);
  console.log("");

  console.log("## Findings");
  for (const finding of observation.findings) {
    console.log(`- ${finding.severity} [${finding.area}] ${finding.message}`);
    if (finding.suggested_fix) console.log(`  suggested_fix: ${finding.suggested_fix}`);
  }
  console.log("");

  console.log("## Patterns");
  if (observation.patterns.length === 0) {
    console.log("- none currently detected");
  } else {
    for (const pattern of observation.patterns) {
      console.log(`- ${pattern.pattern_id}: ${pattern.title} (${pattern.risk_level}) hints=${pattern.matched_hints.join(", ")}`);
    }
  }
  console.log("");

  console.log("## Root Causes");
  if (observation.root_causes.length === 0) {
    console.log("- none currently detected");
  } else {
    for (const item of observation.root_causes) {
      console.log(`- ${item.pattern_id}: ${item.root_causes.join("; ") || "not recorded"}`);
    }
  }
  console.log("");

  console.log("## Improvement Backlog");
  if (observation.improvements.length === 0) {
    console.log("- none");
  } else {
    for (const improvement of observation.improvements) {
      console.log(`- ${improvement.improvement_id}: ${improvement.title}`);
      console.log(`  owner=${improvement.owner_recommendation}; priority=${improvement.priority}; risk=${improvement.risk_level}; auto_fix=${improvement.auto_fix_eligibility}; active_now=${improvement.active_now ? "yes" : "no"}`);
    }
  }
  console.log("");

  console.log("## Suggested Tasks");
  if (observation.suggested_tasks.length === 0) {
    console.log("- none");
  } else {
    for (const task of observation.suggested_tasks) {
      console.log(`- ${task.task_id} -> ${task.owner} (${task.priority}/${task.risk}) ${task.title}`);
    }
  }
  console.log("");

  console.log("## Source Health");
  console.log(`check-dispatch-status: ${observation.sources.check_dispatch_status.passed ? "PASS" : "FAIL"}`);
  console.log(`audit-all-results --dry-run: ${observation.sources.audit_all_results_dry_run.passed ? "PASS" : "FAIL"}`);
  console.log(`integrate-agent-results --dry-run: ${observation.sources.integrate_agent_results_dry_run.passed ? "PASS" : "FAIL"}`);
  console.log(`queue READY/CLAIMED/DONE/AUDITED: ${observation.sources.queue.ready}/${observation.sources.queue.claimed}/${observation.sources.queue.done}/${observation.sources.queue.audited}`);
  console.log(`goal created: ${observation.sources.goal_to_queue.goal_created ? "yes" : "no"}`);
  console.log(`planner output created: ${observation.sources.goal_to_queue.planner_output_created ? "yes" : "no"}`);
  console.log(`task queue generated from goal: ${observation.sources.goal_to_queue.task_queue_generated_from_goal ? "yes" : "no"}`);
  console.log(`goal-to-queue task.created events: ${observation.sources.goal_to_queue.goal_to_queue_task_created_events}`);
  console.log(`locks: ${observation.sources.locks.total}`);
  console.log(`recent run logs: ${observation.sources.run_logs.length}`);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const observation = await buildEvolutionObservation({ apply: args.apply });
printObservation(observation);
if (args.dryRun) {
  console.log("");
  console.log("Dry-run: no evolution files were modified.");
}
