#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
export const runtimeDir = join(orchestratorDir, "runtime");

const SOURCE_PATHS = {
  agentRegistry: join(orchestratorDir, "agent-registry", "agent-registry.example.json"),
  agentRouterRules: join(orchestratorDir, "agent-router-rules.json"),
  skillRegistry: join(orchestratorDir, "skills", "skill-registry.json"),
  skillRouterRules: join(orchestratorDir, "skills", "skill-router-rules.json"),
  queue: join(orchestratorDir, "queue", "task-queue.json"),
  locks: join(orchestratorDir, "queue", "task-locks.json"),
  results: join(orchestratorDir, "queue", "task-results.json"),
  evolutionDir: join(orchestratorDir, "evolution"),
  discoveryDir: join(orchestratorDir, "discovery"),
  goalDir: join(orchestratorDir, "goal", "generated"),
  plannerDir: join(orchestratorDir, "planner", "generated"),
  releaseDir: join(repoRoot, "docs", "release"),
  eventsDir: join(orchestratorDir, "events", "tasks")
};

export const MEMORY_FILES = {
  platform: "platform-state.json",
  architecture: "architecture-memory.json",
  agent: "agent-memory.json",
  skill: "skill-memory.json",
  goal: "goal-memory.json",
  evolution: "evolution-memory.json",
  discovery: "discovery-memory.json",
  roadmap: "roadmap-memory.json",
  decision: "decision-log.json",
  handoff: "handoff-summary.md"
};

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/runtime-memory-build.mjs --apply|--dry-run");
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }
  return { dryRun, apply };
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(args, fallback = "") {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) return fallback;
  return result.stdout.trim();
}

function statusCounts(tasks = []) {
  const counts = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

async function readTextIfExists(path, fallback = "") {
  if (!existsSync(path)) return fallback;
  return readFile(path, "utf8");
}

async function readJsonIfExists(path, fallback = {}) {
  const text = await readTextIfExists(path, "");
  if (!text) return fallback;
  return JSON.parse(text);
}

async function listFiles(dir, options = {}) {
  const maxDepth = options.maxDepth ?? 2;
  const allowedExt = options.allowedExt ?? null;
  const result = [];

  async function walk(current, depth) {
    if (!existsSync(current) || depth > maxDepth) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
      } else if (!allowedExt || allowedExt.has(extname(entry.name))) {
        result.push(absolute);
      }
    }
  }

  await walk(dir, 0);
  result.sort();
  return result;
}

async function fingerprintFiles(files) {
  const rows = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = await readFile(file, "utf8");
    rows.push({
      path: relative(repoRoot, file),
      sha256: sha256(text)
    });
  }
  return {
    files: rows,
    aggregate_sha256: sha256(rows.map((row) => `${row.path}:${row.sha256}`).join("\n"))
  };
}

function baseMemory(kind, generatedAt, sourceFingerprint) {
  return {
    schema_version: 1,
    memory_kind: kind,
    generated_at: generatedAt,
    source_fingerprint: sourceFingerprint
  };
}

function compactReleaseDocName(path) {
  return relative(repoRoot, path);
}

async function sourceInventory() {
  const [
    goalFiles,
    plannerFiles,
    evolutionFiles,
    discoveryFiles,
    releaseFiles
  ] = await Promise.all([
    listFiles(SOURCE_PATHS.goalDir, { maxDepth: 1, allowedExt: new Set([".json"]) }),
    listFiles(SOURCE_PATHS.plannerDir, { maxDepth: 1, allowedExt: new Set([".json"]) }),
    listFiles(SOURCE_PATHS.evolutionDir, { maxDepth: 1, allowedExt: new Set([".json"]) }),
    listFiles(SOURCE_PATHS.discoveryDir, { maxDepth: 1, allowedExt: new Set([".json"]) }),
    listFiles(SOURCE_PATHS.releaseDir, { maxDepth: 1, allowedExt: new Set([".md"]) })
  ]);

  return {
    goalFiles,
    plannerFiles,
    evolutionFiles,
    discoveryFiles,
    releaseFiles,
    coreFiles: [
      SOURCE_PATHS.agentRegistry,
      SOURCE_PATHS.agentRouterRules,
      SOURCE_PATHS.skillRegistry,
      SOURCE_PATHS.skillRouterRules,
      SOURCE_PATHS.queue,
      SOURCE_PATHS.locks,
      SOURCE_PATHS.results
    ]
  };
}

async function eventSummary() {
  const taskDirs = existsSync(SOURCE_PATHS.eventsDir)
    ? (await readdir(SOURCE_PATHS.eventsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory())
    : [];
  let eventCount = 0;
  const eventTypes = {};
  for (const dirent of taskDirs) {
    const files = await listFiles(join(SOURCE_PATHS.eventsDir, dirent.name), { maxDepth: 0, allowedExt: new Set([".json"]) });
    eventCount += files.length;
    for (const file of files) {
      const event = await readJsonIfExists(file, {});
      if (event.event_type) {
        eventTypes[event.event_type] = (eventTypes[event.event_type] ?? 0) + 1;
      }
    }
  }
  return {
    task_count: taskDirs.length,
    event_count: eventCount,
    event_types: eventTypes
  };
}

async function buildPlatformState(generatedAt, inventory) {
  const [queue, locks, results] = await Promise.all([
    readJsonIfExists(SOURCE_PATHS.queue, { tasks: [] }),
    readJsonIfExists(SOURCE_PATHS.locks, { locks: [] }),
    readJsonIfExists(SOURCE_PATHS.results, { results: [] })
  ]);
  const sourceFingerprint = await fingerprintFiles([...inventory.coreFiles, ...inventory.evolutionFiles, ...inventory.discoveryFiles]);
  return {
    ...baseMemory("platform_state", generatedAt, sourceFingerprint),
    project: "jinhu-smart-park / ANKSEN Agent Studio",
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    head_summary: git(["log", "-1", "--oneline"]),
    working_tree_clean: git(["status", "--short"]) === "",
    queue: {
      counts: statusCounts(queue.tasks ?? []),
      active_locks: (locks.locks ?? []).length,
      aggregate_results: (results.results ?? []).length
    },
    event_store: await eventSummary(),
    guardrails: [
      "No deploy without explicit approval.",
      "No production migration/seed/reset/cleanup.",
      "No apps/packages/database/infra/.github/Docker/deploy/auth changes from memory build.",
      "No FINALIZE RESULT, no DONE."
    ]
  };
}

async function buildArchitectureMemory(generatedAt, inventory) {
  const sourceFingerprint = await fingerprintFiles([SOURCE_PATHS.queue, ...inventory.releaseFiles.slice(0, 30)]);
  const releaseDocs = inventory.releaseFiles.map(compactReleaseDocName);
  return {
    ...baseMemory("architecture_memory", generatedAt, sourceFingerprint),
    bounded_contexts: [
      "Agent Orchestrator",
      "Event Store / Queue Read Model",
      "Goal Engine / Planner Agent",
      "Agent Registry / Skill Router",
      "Resident Observer / Evolution Center",
      "Legacy Discovery / Replica Engine",
      "Runtime Memory Center"
    ],
    platform_modules: [
      "ops/agent-orchestrator/scripts/orchestratorctl.mjs",
      "ops/agent-orchestrator/events/",
      "ops/agent-orchestrator/queue/",
      "ops/agent-orchestrator/goal/",
      "ops/agent-orchestrator/planner/",
      "ops/agent-orchestrator/evolution/",
      "ops/agent-orchestrator/discovery/",
      "ops/agent-orchestrator/skills/",
      "ops/agent-orchestrator/runtime/"
    ],
    dependencies: [
      "Node.js scripts",
      "Codex CLI",
      "pnpm typecheck",
      "git worktrees: main + agent-1..agent-5"
    ],
    release_docs_index: releaseDocs.filter((path) =>
      path.includes("AGENT_") ||
      path.includes("agent-platform") ||
      path.includes("EVOLUTION") ||
      path.includes("production-readiness")
    ).slice(0, 80)
  };
}

async function buildAgentMemory(generatedAt) {
  const [registry, rules] = await Promise.all([
    readJsonIfExists(SOURCE_PATHS.agentRegistry, { agents: [] }),
    readJsonIfExists(SOURCE_PATHS.agentRouterRules, { agents: {} })
  ]);
  const sourceFingerprint = await fingerprintFiles([SOURCE_PATHS.agentRegistry, SOURCE_PATHS.agentRouterRules]);
  return {
    ...baseMemory("agent_memory", generatedAt, sourceFingerprint),
    agents: registry.agents ?? [],
    router_rules: rules.agents ?? {},
    routing_policy: rules.routing_policy ?? {},
    default_forbidden_paths: rules.default_forbidden_paths ?? []
  };
}

async function buildSkillMemory(generatedAt) {
  const [registry, rules] = await Promise.all([
    readJsonIfExists(SOURCE_PATHS.skillRegistry, { skills: [] }),
    readJsonIfExists(SOURCE_PATHS.skillRouterRules, { rules: [] })
  ]);
  const sourceFingerprint = await fingerprintFiles([SOURCE_PATHS.skillRegistry, SOURCE_PATHS.skillRouterRules]);
  return {
    ...baseMemory("skill_memory", generatedAt, sourceFingerprint),
    skills: registry.skills ?? [],
    rules: rules.rules ?? [],
    routing_policy: rules.routing_policy ?? {}
  };
}

async function readJsonFiles(files) {
  const rows = [];
  for (const file of files) {
    rows.push({
      path: relative(repoRoot, file),
      data: await readJsonIfExists(file, {})
    });
  }
  return rows;
}

async function buildGoalMemory(generatedAt, inventory) {
  const sourceFingerprint = await fingerprintFiles([...inventory.goalFiles, ...inventory.plannerFiles]);
  const goals = await readJsonFiles(inventory.goalFiles);
  const plannerOutputs = await readJsonFiles(inventory.plannerFiles);
  return {
    ...baseMemory("goal_memory", generatedAt, sourceFingerprint),
    goals: goals.map((item) => ({
      path: item.path,
      goal_id: item.data.goal_id,
      goal_title: item.data.goal_title,
      status: item.data.status,
      current_maturity: item.data.current_maturity,
      target_maturity: item.data.target_maturity,
      recommended_tasks: (item.data.recommended_tasks ?? []).map((task) => task.task_id ?? task.title ?? task)
    })),
    planner_outputs: plannerOutputs.map((item) => ({
      path: item.path,
      planner_output_id: item.data.planner_output_id,
      source_goal_id: item.data.source_goal_id,
      task_count: (item.data.tasks ?? []).length,
      expected_outputs: item.data.expected_outputs ?? []
    }))
  };
}

async function buildEvolutionMemory(generatedAt, inventory) {
  const sourceFingerprint = await fingerprintFiles(inventory.evolutionFiles);
  const data = Object.fromEntries((await readJsonFiles(inventory.evolutionFiles)).map((item) => [item.path, item.data]));
  const backlog = Object.values(data).find((item) => item.record_type === "agent_orchestrator_improvement_backlog") ?? {};
  const patterns = Object.values(data).find((item) => item.record_type === "agent_orchestrator_failure_patterns") ?? {};
  const learning = Object.values(data).find((item) => item.record_type === "agent_orchestrator_learning_log") ?? {};
  return {
    ...baseMemory("evolution_memory", generatedAt, sourceFingerprint),
    pattern_count: (patterns.patterns ?? []).length,
    open_improvements: (backlog.improvements ?? []).filter((item) => item.status !== "RESOLVED").length,
    resolved_improvements: (backlog.improvements ?? []).filter((item) => item.status === "RESOLVED").length,
    learning_entries: (learning.entries ?? []).length,
    top_improvements: (backlog.improvements ?? []).slice(0, 10).map((item) => ({
      improvement_id: item.improvement_id,
      title: item.title,
      priority: item.priority,
      risk: item.risk,
      owner_recommendation: item.owner_recommendation,
      status: item.status
    })),
    source_files: Object.keys(data).sort()
  };
}

async function buildDiscoveryMemory(generatedAt, inventory) {
  const sourceFingerprint = await fingerprintFiles(inventory.discoveryFiles);
  const data = await readJsonFiles(inventory.discoveryFiles);
  return {
    ...baseMemory("discovery_memory", generatedAt, sourceFingerprint),
    targets: data.filter((item) => item.data.target_id && item.data.target_type).map((item) => ({
      path: item.path,
      target_id: item.data.target_id,
      target_name: item.data.target_name,
      target_type: item.data.target_type,
      authorization_status: item.data.authorization_status,
      source_mode: item.data.source_mode
    })),
    artifacts: data.map((item) => ({
      path: item.path,
      target_id: item.data.target_id,
      artifact_id: item.data.system_map_id ?? item.data.schema_inference_id ?? item.data.replica_plan_id ?? item.data.api_inventory_id ?? item.data.entity_map_id ?? item.data.$id ?? item.data.record_type ?? null,
      kind: item.data.system_map_id ? "system_map"
        : item.data.schema_inference_id ? "schema_inference"
          : item.data.replica_plan_id ? "replica_plan"
            : item.data.api_inventory_id ? "api_inventory"
              : item.data.entity_map_id ? "entity_map"
                : item.path.endsWith(".schema.json") ? "schema"
                  : "json"
    })),
    safety_summary: [
      "Discovery is fixture/manual manifest only unless explicitly authorized.",
      "No real external crawling is part of Runtime Memory build.",
      "Replica planning remains dry-run and requires human approval before migration/business code."
    ]
  };
}

async function buildRoadmapMemory(generatedAt, inventory) {
  const roadmapFiles = inventory.releaseFiles.filter((file) => {
    const name = relative(repoRoot, file);
    return /AGENT_PLATFORM|AGENT_ORCHESTRATOR|EVOLUTION|agent-platform|agent-studio/i.test(name);
  });
  const sourceFingerprint = await fingerprintFiles(roadmapFiles);
  return {
    ...baseMemory("roadmap_memory", generatedAt, sourceFingerprint),
    maturity: {
      current_platform_stage: "V3-G P0 complete; Runtime Memory Center MVP in progress",
      next_target: "Use runtime memory as first-read context for new Codex-Orchestrator windows."
    },
    roadmap_files: roadmapFiles.map((file) => relative(repoRoot, file)),
    phases: [
      "V2 Event-first Queue and Parallel 2",
      "V3 Goal Engine / Planner / Agent Registry",
      "V3-E Resident Observer / Evolution Center",
      "V3-F Goal to Queue closed loop",
      "V3-G Legacy Discovery / Replica Engine",
      "Runtime Memory Center"
    ]
  };
}

async function buildDecisionLog(generatedAt, inventory) {
  const sourceFingerprint = await fingerprintFiles([SOURCE_PATHS.queue, SOURCE_PATHS.skillRegistry, ...inventory.releaseFiles.slice(0, 20)]);
  return {
    ...baseMemory("decision_log", generatedAt, sourceFingerprint),
    decisions: [
      {
        decision_id: "DECISION-NO-FINALIZE-NO-DONE",
        status: "ACTIVE",
        decision: "No FINALIZE RESULT, no DONE.",
        rationale: "Every platform cycle must end with push/sync/status/doctor evidence."
      },
      {
        decision_id: "DECISION-EVENT-FIRST-QUEUE",
        status: "ACTIVE",
        decision: "Event Store is the source of truth; queue JSON is compatibility read model.",
        rationale: "Reduces multi-agent queue bookkeeping conflicts."
      },
      {
        decision_id: "DECISION-PARALLEL-2-GUARDED",
        status: "ACTIVE",
        decision: "Parallel 2 is enabled when event/read-model health is consistent; higher parallelism remains guarded.",
        rationale: "Preserves integration and audit safety."
      },
      {
        decision_id: "DECISION-DISCOVERY-FIXTURE-FIRST",
        status: "ACTIVE",
        decision: "Legacy Discovery P0 is fixture/manual-manifest only; no live crawling by default.",
        rationale: "Keeps authorization, rate limiting, and target-system safety explicit."
      },
      {
        decision_id: "DECISION-RUNTIME-MEMORY-FIRST",
        status: "ACTIVE",
        decision: "New main-agent sessions should read Runtime Memory before relying on long chat history.",
        rationale: "Moves project continuity into auditable files."
      }
    ],
    source_notes: [
      "Generated from current orchestrator state, release plans, skill/agent registries, and queue/event status."
    ]
  };
}

function markdownList(values) {
  if (!values || values.length === 0) return "- none";
  return values.map((value) => `- ${value}`).join("\n");
}

function buildHandoffSummary(memory) {
  const platform = memory.platform;
  const queue = platform.queue.counts;
  const roadmap = memory.roadmap;
  const discovery = memory.discovery;
  const evolution = memory.evolution;
  return `# Runtime Memory Handoff Summary

Generated at: ${platform.generated_at}

## Current State
- Branch: ${platform.branch}
- Head: ${platform.head_summary}
- Working tree clean at build time: ${platform.working_tree_clean ? "yes" : "no"}
- Queue: READY ${queue.READY ?? 0}, CLAIMED ${queue.CLAIMED ?? 0}, DONE ${queue.DONE ?? 0}, BLOCKED ${queue.BLOCKED ?? 0}
- Active locks: ${platform.queue.active_locks}
- Event store: ${platform.event_store.event_count} task events across ${platform.event_store.task_count} tasks

## What To Read First
1. \`ops/agent-orchestrator/runtime/platform-state.json\`
2. \`ops/agent-orchestrator/runtime/agent-memory.json\`
3. \`ops/agent-orchestrator/runtime/skill-memory.json\`
4. \`ops/agent-orchestrator/runtime/roadmap-memory.json\`
5. \`ops/agent-orchestrator/runtime/decision-log.json\`

## Platform Modules
${markdownList(memory.architecture.platform_modules)}

## Agent Roles
${markdownList((memory.agent.agents ?? []).map((agent) => `${agent.agent_id}: ${agent.display_name} — ${agent.role}`))}

## Skill Runtime Surface
${markdownList((memory.skill.skills ?? []).map((skill) => `${skill.skill_type}: ${skill.display_name} via ${skill.default_runtime}`))}

## Roadmap
- Current stage: ${roadmap.maturity.current_platform_stage}
- Next target: ${roadmap.maturity.next_target}
${markdownList(roadmap.phases)}

## Discovery / Replica State
- Targets: ${discovery.targets.length}
- Artifacts: ${discovery.artifacts.length}
${markdownList(discovery.safety_summary)}

## Evolution Center
- Patterns: ${evolution.pattern_count}
- Open improvements: ${evolution.open_improvements}
- Resolved improvements: ${evolution.resolved_improvements}
- Learning entries: ${evolution.learning_entries}

## Guardrails
${markdownList(platform.guardrails)}

## Standard Commands
- \`node ops/agent-orchestrator/scripts/runtime-memory-read.mjs --summary\`
- \`node ops/agent-orchestrator/scripts/runtime-memory-validate.mjs\`
- \`node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor\`
- \`node ops/agent-orchestrator/scripts/orchestratorctl.mjs finalize --apply\`

## Next Action
Use Runtime Memory as the first context source in a new Codex-Orchestrator window, then run \`doctor\` before any task execution.
`;
}

export async function buildRuntimeMemory() {
  const generatedAt = nowIso();
  const inventory = await sourceInventory();
  const platform = await buildPlatformState(generatedAt, inventory);
  const architecture = await buildArchitectureMemory(generatedAt, inventory);
  const agent = await buildAgentMemory(generatedAt);
  const skill = await buildSkillMemory(generatedAt);
  const goal = await buildGoalMemory(generatedAt, inventory);
  const evolution = await buildEvolutionMemory(generatedAt, inventory);
  const discovery = await buildDiscoveryMemory(generatedAt, inventory);
  const roadmap = await buildRoadmapMemory(generatedAt, inventory);
  const decision = await buildDecisionLog(generatedAt, inventory);
  const memory = {
    platform,
    architecture,
    agent,
    skill,
    goal,
    evolution,
    discovery,
    roadmap,
    decision
  };
  return {
    ...memory,
    handoff: buildHandoffSummary(memory)
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeRuntimeMemory(memory) {
  await mkdir(runtimeDir, { recursive: true });
  await writeJson(join(runtimeDir, MEMORY_FILES.platform), memory.platform);
  await writeJson(join(runtimeDir, MEMORY_FILES.architecture), memory.architecture);
  await writeJson(join(runtimeDir, MEMORY_FILES.agent), memory.agent);
  await writeJson(join(runtimeDir, MEMORY_FILES.skill), memory.skill);
  await writeJson(join(runtimeDir, MEMORY_FILES.goal), memory.goal);
  await writeJson(join(runtimeDir, MEMORY_FILES.evolution), memory.evolution);
  await writeJson(join(runtimeDir, MEMORY_FILES.discovery), memory.discovery);
  await writeJson(join(runtimeDir, MEMORY_FILES.roadmap), memory.roadmap);
  await writeJson(join(runtimeDir, MEMORY_FILES.decision), memory.decision);
  await writeFile(join(runtimeDir, MEMORY_FILES.handoff), memory.handoff);
}

export function runtimeSummary(memory) {
  return {
    generated_at: memory.platform.generated_at,
    branch: memory.platform.branch,
    head: memory.platform.head_summary,
    agents: memory.agent.agents?.length ?? 0,
    skills: memory.skill.skills?.length ?? 0,
    goals: memory.goal.goals?.length ?? 0,
    planner_outputs: memory.goal.planner_outputs?.length ?? 0,
    discovery_artifacts: memory.discovery.artifacts?.length ?? 0,
    open_improvements: memory.evolution.open_improvements,
    roadmap_phases: memory.roadmap.phases?.length ?? 0,
    decisions: memory.decision.decisions?.length ?? 0
  };
}

function printSummary(memory, mode) {
  const summary = runtimeSummary(memory);
  console.log("# Runtime Memory Build");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`generated_at: ${summary.generated_at}`);
  console.log(`branch: ${summary.branch}`);
  console.log(`head: ${summary.head}`);
  console.log(`agents: ${summary.agents}`);
  console.log(`skills: ${summary.skills}`);
  console.log(`goals: ${summary.goals}`);
  console.log(`planner_outputs: ${summary.planner_outputs}`);
  console.log(`discovery_artifacts: ${summary.discovery_artifacts}`);
  console.log(`open_improvements: ${summary.open_improvements}`);
  console.log(`roadmap_phases: ${summary.roadmap_phases}`);
  console.log(`decisions: ${summary.decisions}`);
  console.log(`runtime_dir: ${runtimeDir}`);
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no Runtime Memory files were written.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const memory = await buildRuntimeMemory();
  if (args.apply) {
    await writeRuntimeMemory(memory);
  }
  printSummary(memory, args.apply ? "apply" : "dry-run");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
