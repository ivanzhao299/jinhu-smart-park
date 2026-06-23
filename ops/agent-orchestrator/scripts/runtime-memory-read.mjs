#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MEMORY_FILES, runtimeDir } from "./runtime-memory-build.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);

const SECTION_FILES = {
  platform: MEMORY_FILES.platform,
  architecture: MEMORY_FILES.architecture,
  agent: MEMORY_FILES.agent,
  skill: MEMORY_FILES.skill,
  goal: MEMORY_FILES.goal,
  evolution: MEMORY_FILES.evolution,
  discovery: MEMORY_FILES.discovery,
  roadmap: MEMORY_FILES.roadmap,
  decision: MEMORY_FILES.decision
};

function usage() {
  console.error(`Usage:
  node ops/agent-orchestrator/scripts/runtime-memory-read.mjs --summary
  node ops/agent-orchestrator/scripts/runtime-memory-read.mjs --section agent|skill|roadmap|platform|architecture|goal|evolution|discovery|decision`);
}

function parseArgs(argv) {
  const summary = argv.includes("--summary");
  const sectionIndex = argv.indexOf("--section");
  const section = sectionIndex >= 0 ? argv[sectionIndex + 1] : "";
  if (summary && section) {
    throw new Error("Use either --summary or --section, not both.");
  }
  if (!summary && !section) {
    throw new Error("Missing --summary or --section.");
  }
  if (section && !SECTION_FILES[section]) {
    throw new Error(`Unknown section: ${section}`);
  }
  return { summary, section };
}

async function readJsonMemory(fileName) {
  const path = join(runtimeDir, fileName);
  if (!existsSync(path)) {
    throw new Error(`Runtime Memory file not found: ${path}. Run runtime-memory-build.mjs --apply first.`);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function readHandoff() {
  const path = join(runtimeDir, MEMORY_FILES.handoff);
  if (!existsSync(path)) {
    throw new Error(`Runtime Memory handoff summary not found: ${path}. Run runtime-memory-build.mjs --apply first.`);
  }
  return readFile(path, "utf8");
}

function printSummary({ platform, agent, skill, goal, evolution, discovery, roadmap, decision, handoff }) {
  console.log("# Runtime Memory Summary");
  console.log("");
  console.log(`runtime_dir: ${runtimeDir}`);
  console.log(`generated_at: ${platform.generated_at}`);
  console.log(`branch: ${platform.branch}`);
  console.log(`head: ${platform.head_summary}`);
  console.log(`working_tree_clean_at_build: ${platform.working_tree_clean ? "yes" : "no"}`);
  console.log(`queue_READY: ${platform.queue.counts.READY ?? 0}`);
  console.log(`queue_CLAIMED: ${platform.queue.counts.CLAIMED ?? 0}`);
  console.log(`queue_DONE: ${platform.queue.counts.DONE ?? 0}`);
  console.log(`queue_BLOCKED: ${platform.queue.counts.BLOCKED ?? 0}`);
  console.log(`active_locks: ${platform.queue.active_locks}`);
  console.log(`event_count: ${platform.event_store.event_count}`);
  console.log(`agents: ${(agent.agents ?? []).length}`);
  console.log(`skills: ${(skill.skills ?? []).length}`);
  console.log(`goals: ${(goal.goals ?? []).length}`);
  console.log(`planner_outputs: ${(goal.planner_outputs ?? []).length}`);
  console.log(`discovery_artifacts: ${(discovery.artifacts ?? []).length}`);
  console.log(`open_improvements: ${evolution.open_improvements}`);
  console.log(`roadmap_phases: ${(roadmap.phases ?? []).length}`);
  console.log(`decisions: ${(decision.decisions ?? []).length}`);
  console.log("");
  console.log("## Handoff Preview");
  console.log(handoff.split("\n").slice(0, 30).join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.section) {
    const data = await readJsonMemory(SECTION_FILES[args.section]);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const [platform, agent, skill, goal, evolution, discovery, roadmap, decision, handoff] = await Promise.all([
    readJsonMemory(MEMORY_FILES.platform),
    readJsonMemory(MEMORY_FILES.agent),
    readJsonMemory(MEMORY_FILES.skill),
    readJsonMemory(MEMORY_FILES.goal),
    readJsonMemory(MEMORY_FILES.evolution),
    readJsonMemory(MEMORY_FILES.discovery),
    readJsonMemory(MEMORY_FILES.roadmap),
    readJsonMemory(MEMORY_FILES.decision),
    readHandoff()
  ]);
  printSummary({ platform, agent, skill, goal, evolution, discovery, roadmap, decision, handoff });
}

try {
  await main();
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
