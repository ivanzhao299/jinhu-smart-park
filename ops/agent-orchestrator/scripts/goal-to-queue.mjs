#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendTaskEvent, listAllTaskEvents, writeCompatibilityReadModels } from "./lib/event-store-utils.mjs";
import { nowIso, pathMatches, readJson, writeJson } from "./lib/queue-utils.mjs";
import { buildImprovementCandidates, readEvolutionData, writeEvolutionData } from "./lib/evolution-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const goalGeneratedDir = join(orchestratorDir, "goal", "generated");
const plannerGeneratedDir = join(orchestratorDir, "planner", "generated");
const registryPath = join(orchestratorDir, "agent-registry", "agent-registry.example.json");
const routerRulesPath = join(orchestratorDir, "agent-router-rules.json");

const DEFAULT_FORBIDDEN_PATHS = [
  "apps/**",
  "packages/**",
  "database/**",
  "infra/**",
  ".github/**",
  "Dockerfile",
  "Dockerfile.*",
  "docker-compose*",
  "deploy/**",
  "auth/**",
  ".env",
  ".env.*"
];

function usage() {
  console.error('Usage: node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "..." --dry-run|--apply');
  console.error("   or: node ops/agent-orchestrator/scripts/goal-to-queue.mjs --from-improvement <improvement_id> --dry-run|--apply");
  console.error("Exactly one mode flag is required. --dry-run is read-only; --apply appends task.created events before rebuilding queue read models.");
}

function parseArgs(argv) {
  const hasDryRun = argv.includes("--dry-run");
  const hasApply = argv.includes("--apply");
  const args = {
    text: "",
    fromImprovement: "",
    dryRun: hasDryRun,
    apply: hasApply,
    mode: hasApply ? "apply" : "dry-run"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--text") {
      args.text = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--from-improvement") {
      args.fromImprovement = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--dry-run" || arg === "--apply") {
      continue;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.text.trim() && !args.fromImprovement.trim()) {
    usage();
    throw new Error("Missing --text or --from-improvement value.");
  }
  if (args.text.trim() && args.fromImprovement.trim()) {
    throw new Error("Use either --text or --from-improvement, not both.");
  }
  if (hasDryRun === hasApply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }

  return args;
}

function stable(value) {
  return JSON.stringify(value);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-")
    .toUpperCase();
}

function goalIdForText(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("agent studio") && normalized.includes("98")) {
    return "GOAL-AGENT-STUDIO-98";
  }
  return `GOAL-${slugify(text).slice(0, 48) || createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
}

function plannerOutputId(goalId) {
  return `PLAN-${goalId}`;
}

function improvementGoalId(improvementId) {
  return `GOAL-EVOLUTION-${slugify(improvementId).slice(0, 60)}`;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function matchedKeywords(text, keywords = []) {
  const haystack = normalizeText(text);
  return keywords.filter((keyword) => {
    const normalized = normalizeText(keyword).trim();
    return normalized && haystack.includes(normalized);
  });
}

function registryAgents(registry) {
  return new Map((registry.agents ?? []).map((agent) => [agent.agent_id, agent]));
}

function routerAgents(routerRules) {
  return new Map(Object.entries(routerRules.agents ?? {}));
}

function chooseOwner(candidate, registry, routerRules) {
  const registryById = registryAgents(registry);
  if (candidate.preferred_owner && registryById.has(candidate.preferred_owner)) {
    const agent = registryById.get(candidate.preferred_owner);
    return {
      owner: candidate.preferred_owner,
      domain: candidate.domain ?? agent.domains?.[0] ?? "",
      allowed_paths: candidate.allowed_paths ?? agent.allowed_paths ?? [],
      forbidden_paths: candidate.forbidden_paths ?? agent.forbidden_paths ?? DEFAULT_FORBIDDEN_PATHS,
      reason: `preferred owner ${candidate.preferred_owner} validated against Agent Registry`
    };
  }

  const text = `${candidate.title} ${candidate.domain ?? ""} ${(candidate.acceptance ?? []).join(" ")}`;
  const scored = [...routerAgents(routerRules)].map(([agentId, rule]) => {
    const matches = matchedKeywords(text, rule.keywords ?? []);
    return {
      agentId,
      rule,
      score: matches.length * 10,
      matches
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.rule.fallback_priority ?? 0) - Number(a.rule.fallback_priority ?? 0);
  });

  const selected = scored.find((item) => item.score > 0) ?? scored.find((item) => item.agentId === "agent-5");
  const registryAgent = registryById.get(selected.agentId);
  return {
    owner: selected.agentId,
    domain: candidate.domain ?? selected.rule.domain ?? registryAgent?.domains?.[0] ?? "planning",
    allowed_paths: candidate.allowed_paths ?? registryAgent?.allowed_paths ?? selected.rule.allowed_paths ?? [],
    forbidden_paths: candidate.forbidden_paths ?? registryAgent?.forbidden_paths ?? DEFAULT_FORBIDDEN_PATHS,
    reason: selected.score > 0
      ? `router keyword match: ${selected.matches.join(", ")}`
      : "fallback to agent-5 planning"
  };
}

function goalState({ goalId, text, timestamp }) {
  return {
    version: 1,
    goal_id: goalId,
    goal_title: "Raise Agent Studio maturity to 98%",
    goal_text: text,
    current_maturity: 95,
    target_maturity: 98,
    current_state: "Agent Studio has event-first task writes, guarded parallel 2 execution, Resident Observer, Goal Engine, Planner Agent, Agent Registry, Self-Repair, and Finalize.",
    target_state: "Natural-language goals can produce reviewed planner output, READY queue tasks, event-store task.created records, and an agent-cycle dry-run without manual queue assembly.",
    capability_scores: [
      {
        capability_id: "goal-to-queue",
        name: "Goal to Queue Loop",
        current_score: 40,
        target_score: 90,
        evidence: [
          "Goal Engine, Planner, Registry schemas exist",
          "Event Store and agent-cycle dry-run exist"
        ],
        gap_summary: "Need executable goal-to-queue bridge from goal text to task.created events and READY queue tasks.",
        risk_level: "MEDIUM"
      },
      {
        capability_id: "autonomous-loop",
        name: "Approval-gated Autonomous Loop",
        current_score: 70,
        target_score: 90,
        evidence: [
          "Self-Repair and Finalize are available",
          "Resident Observer can summarize recurring failures"
        ],
        gap_summary: "Need dry-run autonomous-loop that chains goal-to-queue, observe, agent-cycle plan, and doctor.",
        risk_level: "MEDIUM"
      }
    ],
    gaps: [
      {
        gap_id: "GAP-GOAL-QUEUE-BRIDGE",
        capability_id: "goal-to-queue",
        summary: "Natural-language goals are not yet materialized as READY queue tasks.",
        impact: "The platform still needs a manual bridge from goal planning to agent-cycle.",
        recommended_agent: "agent-5",
        priority: "P0",
        risk_level: "MEDIUM",
        required_approval: false
      },
      {
        gap_id: "GAP-PLANNER-QUEUE-VALIDATION",
        capability_id: "goal-to-queue",
        summary: "Generated planner output needs a validation matrix before execution.",
        impact: "Generated tasks could be malformed or assigned to the wrong lane without checks.",
        recommended_agent: "agent-2",
        priority: "P1",
        risk_level: "MEDIUM",
        required_approval: false
      }
    ],
    milestones: [
      {
        milestone_id: "V3-F-M1",
        title: "Goal to queue dry-run is reviewable",
        target_maturity: 97,
        exit_criteria: [
          "goal-to-queue --dry-run outputs goal_id and planner_output_id",
          "task candidates include owners, risks, expected files, and validation commands"
        ]
      },
      {
        milestone_id: "V3-F-M2",
        title: "Goal to queue apply writes event-first tasks",
        target_maturity: 98,
        exit_criteria: [
          "task.created events are written",
          "queue read model has READY tasks",
          "agent-cycle --dry-run sees claimable work"
        ]
      }
    ],
    recommended_tasks: [],
    risks: [
      {
        risk_id: "RISK-GOAL-QUEUE-SCOPE",
        summary: "Generated tasks could overreach into business or production paths.",
        risk_level: "HIGH",
        mitigation: "Default forbidden paths block apps, packages, database, infra, CI, Docker, deploy, auth, and production operations."
      }
    ],
    status: "READY_FOR_REVIEW",
    created_at: timestamp,
    updated_at: timestamp
  };
}

function goalStateFromImprovement({ goalId, improvement, timestamp }) {
  return {
    version: 1,
    goal_id: goalId,
    goal_title: improvement.title,
    goal_text: `Implement improvement ${improvement.improvement_id}: ${improvement.title}`,
    current_maturity: 95,
    target_maturity: 98,
    current_state: "Evolution Center can observe recurring failure patterns and maintain an improvement backlog.",
    target_state: "Evolution Planner improvement candidates can be reviewed and converted into event-first READY tasks.",
    capability_scores: [
      {
        capability_id: "evolution-planner",
        name: "Evolution Planner Improvement Task Generation",
        current_score: 70,
        target_score: 90,
        evidence: [
          `source pattern: ${improvement.source_pattern_id}`,
          `occurrences: ${improvement.occurrence_count}`
        ],
        gap_summary: improvement.root_cause,
        risk_level: improvement.risk
      }
    ],
    gaps: [
      {
        gap_id: `GAP-${improvement.improvement_id}`,
        capability_id: "evolution-planner",
        summary: improvement.root_cause,
        impact: improvement.impact,
        recommended_agent: improvement.owner_recommendation,
        priority: improvement.priority,
        risk_level: improvement.risk,
        required_approval: improvement.requires_approval
      }
    ],
    milestones: [
      {
        milestone_id: `MILESTONE-${improvement.improvement_id}`,
        title: improvement.title,
        target_maturity: 98,
        exit_criteria: improvement.acceptance_criteria
      }
    ],
    recommended_tasks: [],
    risks: [
      {
        risk_id: `RISK-${improvement.improvement_id}`,
        summary: improvement.risk === "LOW"
          ? "Low-risk orchestrator platform improvement."
          : "Medium-risk orchestrator state-flow improvement requiring review before apply.",
        risk_level: improvement.risk,
        mitigation: "Default forbidden paths block business, database, infra, CI, Docker, deploy, auth, and production operations."
      }
    ],
    status: "READY_FOR_REVIEW",
    created_at: timestamp,
    updated_at: timestamp
  };
}

function plannerTemplates(goalId, batchId) {
  return [
    {
      task_id: "AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING",
      title: "Goal Engine CLI hardening",
      preferred_owner: "agent-5",
      domain: "goal-engine-platform",
      priority: "P0",
      risk: "MEDIUM",
      allowed_paths: [
        "ops/agent-orchestrator/scripts/**",
        "ops/agent-orchestrator/goal/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**",
        "docs/release/**",
        "docs/testing/**"
      ],
      acceptance: [
        "Document and harden Goal Engine CLI behavior for dry-run/apply boundaries.",
        "No business code or production operation is touched.",
        "Goal-to-queue commands remain idempotent and event-first."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
        "pnpm typecheck"
      ],
      expected_output_files: [
        "docs/release/agent-studio-v3-goal-engine-cli-hardening.md",
        "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING.md",
        "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING.json"
      ]
    },
    {
      task_id: "AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION",
      title: "Planner Output validation",
      preferred_owner: "agent-3",
      domain: "planner-runtime",
      priority: "P0",
      risk: "MEDIUM",
      allowed_paths: [
        "ops/agent-orchestrator/planner/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**",
        "docs/release/**",
        "docs/testing/**"
      ],
      acceptance: [
        "Planner output is checked against expected task candidate fields.",
        "Planner runtime explains owner assignment and expected outputs.",
        "No queue writes happen in dry-run mode."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
        "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs"
      ],
      expected_output_files: [
        "docs/testing/agent-studio-v3-planner-output-validation.md",
        "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.md",
        "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.json"
      ]
    },
    {
      task_id: "AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER",
      title: "Agent Registry runtime adapter design",
      preferred_owner: "agent-4",
      domain: "agent-registry-runtime-adapter",
      priority: "P1",
      risk: "MEDIUM",
      allowed_paths: [
        "ops/agent-orchestrator/agent-registry/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**",
        "docs/release/**",
        "docs/testing/**"
      ],
      acceptance: [
        "Agent Registry and router rules have a compatible runtime adapter design.",
        "Owner recommendations explain registry and fallback behavior.",
        "No worker agent pool expansion is introduced."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/route-natural-language-task.mjs --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor"
      ],
      expected_output_files: [
        "docs/release/agent-studio-v3-agent-registry-runtime-adapter.md",
        "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER.md",
        "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER.json"
      ]
    },
    {
      task_id: "AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION",
      title: "Goal-to-Queue validation matrix",
      preferred_owner: "agent-2",
      domain: "validation-goal-queue",
      priority: "P0",
      risk: "MEDIUM",
      allowed_paths: [
        "docs/release/**",
        "docs/testing/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**"
      ],
      acceptance: [
        "Validation matrix covers goal generation, planner output, task.created events, read-model rebuild, and agent-cycle dry-run.",
        "Audit/typecheck/doctor checks are listed as base gates.",
        "No business code or production operation is touched."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
        "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
        "pnpm typecheck"
      ],
      expected_output_files: [
        "docs/testing/agent-studio-v3-goal-to-queue-validation-matrix.md",
        "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION.md",
        "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION.json"
      ]
    },
    {
      task_id: "AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS",
      title: "Agent Studio V3 user workflow docs",
      preferred_owner: "agent-1",
      domain: "product-docs-runtime-index",
      priority: "P1",
      risk: "LOW",
      allowed_paths: [
        "docs/release/**",
        "docs/testing/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**"
      ],
      acceptance: [
        "User workflow explains natural-language goal to queue to agent-cycle dry-run.",
        "Docs distinguish Resident Observer from worker agents.",
        "No business code or production operation is touched."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs autonomous-loop --text \"继续把 Agent Studio 提升到 98%\" --dry-run"
      ],
      expected_output_files: [
        "docs/release/agent-studio-v3-goal-to-queue-user-workflow.md",
        "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.md",
        "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.json"
      ]
    }
  ].map((task) => ({
    ...task,
    batch_id: batchId,
    source_goal_id: goalId,
    forbidden_paths: DEFAULT_FORBIDDEN_PATHS,
    requires_human_approval: false
  }));
}

function buildPlannerOutput({ goalId, plannerId, goalText, tasks, timestamp }) {
  const assignments = new Map();
  for (const task of tasks) {
    assignments.set(task.owner, [...(assignments.get(task.owner) ?? []), task.task_id]);
  }

  return {
    version: 1,
    planner_output_id: plannerId,
    source_goal_id: goalId,
    req_summary: {
      title: "Goal to Queue automatic closure",
      body: `Turn the natural-language goal "${goalText}" into event-first READY tasks and a dry-run agent-cycle plan.`,
      non_goals: [
        "No agent execution in goal-to-queue",
        "No deploy or production operation",
        "No business code changes"
      ]
    },
    tech_summary: {
      title: "Event-first task.created generation",
      body: "Generate task candidates, assign owners through the registry/router layer, append task.created events, and rebuild compatibility queue read models.",
      non_goals: [
        "No dispatch or claim",
        "No Codex runner execution",
        "No merge or push"
      ]
    },
    tasks,
    agent_assignments: [...assignments.entries()].map(([agent, taskIds]) => ({
      agent,
      task_ids: taskIds,
      reason: "Assigned by Goal-to-Queue planner template and validated against Agent Registry."
    })),
    risk_assessment: {
      overall_risk: "MEDIUM",
      requires_human_approval: false,
      blocked_paths: DEFAULT_FORBIDDEN_PATHS,
      notes: [
        "Generated tasks are orchestrator/platform work only.",
        "Future task execution still flows through agent-cycle, audit, integration, and finalize."
      ]
    },
    validation_commands: [
      "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run",
      "pnpm typecheck"
    ],
    expected_outputs: tasks.flatMap((task) => task.expected_output_files.map((path) => ({
      task_id: task.task_id,
      path
    }))),
    dispatch_plan: tasks.map((task) => ({
      task_id: task.task_id,
      owner: task.owner,
      mode: "READY only; dispatch later through agent-cycle"
    })),
    created_at: timestamp
  };
}

function taskForQueue(task, timestamp) {
  const {
    preferred_owner: _preferredOwner,
    expected_output_files: expectedOutputFiles,
    ...rest
  } = task;

  return {
    ...rest,
    status: "READY",
    expected_output_files: expectedOutputFiles,
    created_at: timestamp,
    updated_at: timestamp
  };
}

function validateGeneratedTask(task) {
  const allowedPaths = Array.isArray(task.allowed_paths) ? task.allowed_paths : [];
  const forbiddenPaths = Array.isArray(task.forbidden_paths) ? task.forbidden_paths : [];
  const expectedFiles = Array.isArray(task.expected_output_files) ? task.expected_output_files : [];
  const validationCommands = Array.isArray(task.validation_commands) ? task.validation_commands : [];

  if (!task.task_id || !task.owner || !task.status) {
    throw new Error(`Generated task is missing required queue identity fields: ${task.task_id ?? "(missing task_id)"}`);
  }
  if (allowedPaths.length === 0) {
    throw new Error(`Generated task ${task.task_id} has no allowed_paths.`);
  }
  if (forbiddenPaths.length === 0) {
    throw new Error(`Generated task ${task.task_id} has no forbidden_paths.`);
  }
  if (expectedFiles.length === 0) {
    throw new Error(`Generated task ${task.task_id} has no expected_output_files.`);
  }
  if (validationCommands.length === 0) {
    throw new Error(`Generated task ${task.task_id} has no validation_commands.`);
  }

  for (const file of expectedFiles) {
    const isAllowed = allowedPaths.some((allowedPath) => pathMatches(file, allowedPath));
    if (!isAllowed) {
      throw new Error(`Generated task ${task.task_id} expects file outside allowed_paths: ${file}`);
    }

    const forbiddenMatch = forbiddenPaths.find((forbiddenPath) => pathMatches(file, forbiddenPath));
    if (forbiddenMatch) {
      throw new Error(`Generated task ${task.task_id} expects file blocked by forbidden_paths (${forbiddenMatch}): ${file}`);
    }
  }
}

function validateGeneratedArtifacts(artifacts) {
  for (const task of artifacts.tasks) {
    validateGeneratedTask(task);
  }
  return artifacts;
}

async function buildArtifacts(text) {
  const timestamp = nowIso();
  const goalId = goalIdForText(text);
  const plannerId = plannerOutputId(goalId);
  const batchId = "AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE";
  const [registry, routerRules] = await Promise.all([
    readJson(registryPath),
    readJson(routerRulesPath)
  ]);
  const goal = goalState({ goalId, text, timestamp });
  const templates = plannerTemplates(goalId, batchId);
  const queueTasks = templates.map((candidate) => {
    const owner = chooseOwner(candidate, registry, routerRules);
    return taskForQueue({
      ...candidate,
      owner: owner.owner,
      domain: owner.domain,
      allowed_paths: owner.allowed_paths,
      forbidden_paths: owner.forbidden_paths,
      owner_assignment_reason: owner.reason
    }, timestamp);
  });
  goal.recommended_tasks = queueTasks.map((task) => ({
    task_id: task.task_id,
    title: task.title,
    owner: task.owner,
    priority: task.priority,
    risk_level: task.risk,
    expected_output: task.expected_output_files.join(", ")
  }));
  const planner = buildPlannerOutput({ goalId, plannerId, goalText: text, tasks: queueTasks, timestamp });
  return validateGeneratedArtifacts({
    timestamp,
    goalId,
    plannerId,
    batchId,
    goal,
    planner,
    tasks: queueTasks
  });
}

function taskFromImprovement(improvement, batchId, goalId, timestamp) {
  return taskForQueue({
    task_id: `EVOLUTION-${improvement.improvement_id}`,
    batch_id: batchId,
    source_goal_id: goalId,
    source_improvement_id: improvement.improvement_id,
    source_pattern_id: improvement.source_pattern_id,
    title: improvement.title,
    owner: improvement.owner_recommendation,
    domain: `evolution-${normalizeText(improvement.source_pattern_id).replace(/[^a-z0-9-]/g, "-")}`,
    priority: improvement.priority,
    risk: improvement.risk,
    allowed_paths: improvement.allowed_paths,
    forbidden_paths: improvement.forbidden_paths,
    acceptance: improvement.acceptance_criteria,
    validation_commands: improvement.validation_commands,
    expected_output_files: improvement.expected_output_files,
    requires_human_approval: improvement.requires_approval,
    owner_assignment_reason: `Evolution Planner recommendation from ${improvement.source_pattern_id}`
  }, timestamp);
}

async function buildArtifactsFromImprovement(improvementId) {
  const timestamp = nowIso();
  const data = await readEvolutionData();
  const candidates = buildImprovementCandidates(data, null);
  const improvement = candidates.find((item) => item.improvement_id === improvementId);
  if (!improvement) {
    throw new Error(`Improvement not found in Evolution Planner candidates/backlog: ${improvementId}`);
  }

  const goalId = improvementGoalId(improvement.improvement_id);
  const plannerId = plannerOutputId(goalId);
  const batchId = "EVOLUTION-IMPROVEMENT-BACKLOG";
  const task = taskFromImprovement(improvement, batchId, goalId, timestamp);
  const goal = goalStateFromImprovement({ goalId, improvement, timestamp });
  goal.recommended_tasks = [{
    task_id: task.task_id,
    title: task.title,
    owner: task.owner,
    priority: task.priority,
    risk_level: task.risk,
    expected_output: task.expected_output_files.join(", ")
  }];
  const planner = buildPlannerOutput({
    goalId,
    plannerId,
    goalText: goal.goal_text,
    tasks: [task],
    timestamp
  });

  return validateGeneratedArtifacts({
    timestamp,
    goalId,
    plannerId,
    batchId,
    goal,
    planner,
    tasks: [task],
    source_improvement_id: improvement.improvement_id
  });
}

async function writeGeneratedArtifact(path, value) {
  if (existsSync(path)) {
    return { path, written: false, reason: "already_exists" };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, value);
  return { path, written: true, reason: "created" };
}

async function appendTaskCreatedEvents(artifacts) {
  const existingEvents = await listAllTaskEvents();
  const existingIds = new Set(existingEvents.map((event) => event.task_id));
  const eventResults = [];

  for (const [index, task] of artifacts.tasks.entries()) {
    const idempotencyKey = `goal-to-queue:${artifacts.goalId}:${artifacts.plannerId}:${task.task_id}`;
    const event = {
      event_id: `task.created:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`,
      event_type: "task.created",
      task_id: task.task_id,
      owner: task.owner,
      status_before: existingIds.has(task.task_id) ? "EXISTS" : null,
      status_after: "READY",
      created_at: artifacts.timestamp,
      actor: "orchestrator",
      source: "goal-to-queue.mjs",
      reason: `Generated from ${artifacts.goalId} / ${artifacts.plannerId}`,
      changed_files: [],
      metadata: {
        idempotency_key: idempotencyKey,
        source_goal_id: artifacts.goalId,
        planner_output_id: artifacts.plannerId,
        queue_index: 10000 + index,
        task_snapshot: task
      }
    };
    eventResults.push(await appendTaskEvent(event));
  }

  return eventResults;
}

async function recordEvolutionLearning(artifacts) {
  const data = await readEvolutionData();
  const originalLearningLog = stable(data.learningLog);
  const originalEvolutionState = stable(data.evolutionState);
  const learningId = `LEARN-${artifacts.goalId}-QUEUE`;
  const alreadyRecorded = (data.learningLog.entries ?? []).some((entry) => entry.learning_id === learningId);
  if (!alreadyRecorded) {
    data.learningLog.entries = [
      ...(data.learningLog.entries ?? []),
      {
        learning_id: learningId,
        pattern_id: "NONE",
        observed_at: artifacts.timestamp,
        source: "goal-to-queue.mjs",
        incident: `Goal ${artifacts.goalId} was converted into ${artifacts.tasks.length} READY task candidates.`,
        root_cause: "V3-F closed the manual gap between natural-language goal intake and event-first task queue creation.",
        resolution: "Persist goal/planner artifacts, append task.created events, rebuild queue read models, and preview agent-cycle.",
        evidence_refs: [
          `ops/agent-orchestrator/goal/generated/${artifacts.goalId}.json`,
          `ops/agent-orchestrator/planner/generated/${artifacts.plannerId}.json`
        ],
        follow_up: "Run agent-cycle --dry-run, then wait for explicit approval before executing agents.",
        status: "ACTIVE"
      }
    ];
    data.learningLog.updated_at = artifacts.timestamp;
  }

  const nextSummary = {
    ...(data.evolutionState.last_summary ?? {}),
    last_goal_id: artifacts.goalId,
    last_planner_output_id: artifacts.plannerId,
    last_goal_to_queue_task_count: artifacts.tasks.length
  };
  const nextAction = [
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run"
  ];
  const stateChanged = data.evolutionState.last_run_mode !== "goal_to_queue_apply" ||
    stable(data.evolutionState.last_summary ?? {}) !== stable(nextSummary) ||
    stable(data.evolutionState.next_action ?? []) !== stable(nextAction);

  if (stateChanged) {
    data.evolutionState.updated_at = artifacts.timestamp;
    data.evolutionState.last_run_mode = "goal_to_queue_apply";
    data.evolutionState.last_summary = nextSummary;
    data.evolutionState.next_action = nextAction;
  }

  const writes = {};
  if (stable(data.learningLog) !== originalLearningLog) {
    writes.learningLog = data.learningLog;
  }
  if (stable(data.evolutionState) !== originalEvolutionState) {
    writes.evolutionState = data.evolutionState;
  }

  const writtenFiles = Object.keys(writes);
  if (writtenFiles.length > 0) {
    await writeEvolutionData(writes);
  }

  return {
    written: writtenFiles.length > 0,
    files: writtenFiles,
    reason: writtenFiles.length > 0 ? "updated" : "already_current"
  };
}

async function applyArtifacts(artifacts) {
  const goalPath = join(goalGeneratedDir, `${artifacts.goalId}.json`);
  const plannerPath = join(plannerGeneratedDir, `${artifacts.plannerId}.json`);
  const goalWrite = await writeGeneratedArtifact(goalPath, artifacts.goal);
  const plannerWrite = await writeGeneratedArtifact(plannerPath, artifacts.planner);
  const events = await appendTaskCreatedEvents(artifacts);
  const readModels = await writeCompatibilityReadModels();
  const evolution = await recordEvolutionLearning(artifacts);
  return {
    goal_write: goalWrite,
    planner_write: plannerWrite,
    events,
    read_models: {
      queue_tasks: readModels.queue.tasks.length,
      locks: readModels.locks.locks.length,
      results: readModels.results.results.length
    },
    evolution
  };
}

function printSummary(artifacts, mode, applyResult = null) {
  const owners = [...new Set(artifacts.tasks.map((task) => task.owner))];
  const risks = [...new Set(artifacts.tasks.map((task) => task.risk))];

  console.log("# Goal to Queue");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`goal_id: ${artifacts.goalId}`);
  console.log(`planner_output_id: ${artifacts.plannerId}`);
  console.log(`generated task count: ${artifacts.tasks.length}`);
  console.log(`suggested owners: ${owners.join(", ")}`);
  console.log(`risk levels: ${risks.join(", ")}`);
  console.log("");

  console.log("## Task Candidates");
  for (const task of artifacts.tasks) {
    console.log(`- ${task.task_id} -> ${task.owner} | ${task.priority}/${task.risk} | ${task.title}`);
    console.log(`  domain: ${task.domain}`);
    console.log(`  owner reason: ${task.owner_assignment_reason}`);
    console.log(`  expected files: ${task.expected_output_files.join(", ")}`);
    console.log(`  validation commands: ${task.validation_commands.join(" ; ")}`);
  }
  console.log("");

  if (applyResult) {
    console.log("## Apply Result");
    console.log(`goal artifact: ${applyResult.goal_write.reason} ${applyResult.goal_write.path}`);
    console.log(`planner artifact: ${applyResult.planner_write.reason} ${applyResult.planner_write.path}`);
    console.log("task.created events:");
    for (const event of applyResult.events) {
      console.log(`- ${event.event.task_id}: ${event.written ? "written" : "skipped"} ${event.reason ?? ""} ${event.path ?? ""}`.trim());
    }
    console.log(`read model queue tasks: ${applyResult.read_models.queue_tasks}`);
    console.log(`read model locks: ${applyResult.read_models.locks}`);
    console.log(`read model results: ${applyResult.read_models.results}`);
    console.log(`evolution learning/state: ${applyResult.evolution.written ? "written" : "skipped"} ${applyResult.evolution.reason}`);
  } else {
    console.log("Dry-run: no goal, planner, event, queue, lock, result, or evolution files were modified.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const artifacts = args.fromImprovement
  ? await buildArtifactsFromImprovement(args.fromImprovement)
  : await buildArtifacts(args.text);
const applyResult = args.apply ? await applyArtifacts(artifacts) : null;
printSummary(artifacts, args.mode, applyResult);
