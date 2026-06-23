#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");
const specsDir = join(orchestratorDir, "specs");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/replica-planner.mjs --schema <schema-inference.json> --dry-run|--apply");
}

function parseArgs(argv) {
  const args = {
    schema: "",
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--schema") {
      args.schema = argv[index + 1] ?? "";
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
  if (!args.schema.trim()) {
    usage();
    throw new Error("Missing --schema file.");
  }
  if (args.dryRun === args.apply) {
    throw new Error("Specify exactly one of --dry-run or --apply.");
  }
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function nowIso() {
  return new Date().toISOString();
}

function taskCandidates(inference) {
  const targetId = inference.target_id;
  return [
    {
      task_id: `REPLICA-${targetId}-A5-PLAN`,
      owner: "agent-5",
      title: "Replica architecture and delivery plan",
      skill_type: "replica_planning",
      runtime: "codex-cli",
      priority: "P0",
      risk: "MEDIUM",
      allowed_paths: [
        "docs/release/**",
        "docs/testing/**",
        "ops/agent-orchestrator/discovery/**",
        "ops/agent-orchestrator/specs/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**"
      ],
      forbidden_paths: [
        "apps/**",
        "packages/**",
        "database/**",
        "infra/**",
        ".github/**",
        "Dockerfile",
        "Dockerfile.*",
        "docker-compose*",
        "deploy/**",
        "auth/**"
      ],
      acceptance: [
        "Review inferred entities and replica scope.",
        "Do not create migrations or modify business code without approval.",
        "Produce a staged implementation plan with rollback and validation gates."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
        "pnpm typecheck"
      ],
      expected_output_files: [
        `ops/agent-orchestrator/reports/REPLICA-${targetId}-A5-PLAN.md`,
        `ops/agent-orchestrator/results/REPLICA-${targetId}-A5-PLAN.json`
      ],
      requires_human_approval: true
    },
    {
      task_id: `REPLICA-${targetId}-A2-VALIDATION`,
      owner: "agent-2",
      title: "Replica validation matrix",
      skill_type: "validation_testing",
      runtime: "codex-cli",
      priority: "P1",
      risk: "LOW",
      allowed_paths: [
        "docs/release/**",
        "docs/testing/**",
        "ops/agent-orchestrator/reports/**",
        "ops/agent-orchestrator/results/**"
      ],
      forbidden_paths: [
        "apps/**",
        "packages/**",
        "database/**",
        "infra/**",
        ".github/**",
        "Dockerfile",
        "Dockerfile.*",
        "docker-compose*",
        "deploy/**",
        "auth/**"
      ],
      acceptance: [
        "Define validation coverage for schema, API, frontend, RBAC, migration draft, and rollback review.",
        "Keep the plan dry-run and evidence-based."
      ],
      validation_commands: [
        "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
        "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
        "pnpm typecheck"
      ],
      expected_output_files: [
        `docs/testing/replica-${targetId.toLowerCase()}-validation-matrix.md`,
        `ops/agent-orchestrator/reports/REPLICA-${targetId}-A2-VALIDATION.md`,
        `ops/agent-orchestrator/results/REPLICA-${targetId}-A2-VALIDATION.json`
      ],
      requires_human_approval: false
    }
  ];
}

function buildReplicaPlan(inference) {
  const entityNames = inference.entities.map((entity) => entity.entity_name);
  const targetId = inference.target_id;
  return {
    version: 1,
    replica_plan_id: `REPLICA-PLAN-${targetId}`,
    schema_inference_id: inference.schema_inference_id,
    target_id: targetId,
    generated_at: nowIso(),
    req: {
      title: `Replica plan for ${targetId}`,
      summary: `Reconstruct the authorized legacy system scope represented by ${inference.schema_inference_id}.`,
      target_entities: entityNames,
      non_goals: [
        "No live crawling in MVP",
        "No business code changes in planner",
        "No migration creation",
        "No production data operation"
      ]
    },
    tech: {
      database_plan: inference.entities.map((entity) => ({
        entity: entity.entity_name,
        fields: entity.fields.map((field) => `${field.name}:${field.type}`),
        migration_status: "draft_only_requires_human_approval"
      })),
      api_plan: inference.entities.map((entity) => ({
        entity: entity.entity_name,
        routes: [
          `GET /replica/${entity.entity_name}`,
          `GET /replica/${entity.entity_name}/:id`,
          `POST /replica/${entity.entity_name}`
        ],
        status: "draft_only"
      })),
      frontend_page_plan: inference.entities.map((entity) => ({
        entity: entity.entity_name,
        pages: [
          "list",
          "detail",
          ...(entity.workflow_fields.length > 0 ? ["state transition"] : [])
        ]
      })),
      rbac_plan: inference.entities.map((entity) => `MENU_REPLICA_${entity.entity_name.toUpperCase()}`),
      migration_plan: [
        "Draft only; no migration file is created by this MVP.",
        "Forward-only migration and rollback review require explicit approval."
      ],
      validation_plan: [
        "schema inference review",
        "API contract review",
        "frontend smoke plan",
        "RBAC visibility plan",
        "migration draft review",
        "rollback plan review"
      ]
    },
    task_candidates: taskCandidates(inference),
    ready_task_generation: {
      apply_default: false,
      requires_human_approval: true,
      reason: "Replica tasks can lead to schema/API/frontend work and must be reviewed before queue insertion."
    }
  };
}

function reqMarkdown(plan) {
  return `# ${plan.req.title}

## Summary
${plan.req.summary}

## Target Entities
${plan.req.target_entities.map((entity) => `- ${entity}`).join("\n")}

## Non-goals
${plan.req.non_goals.map((item) => `- ${item}`).join("\n")}

## Approval Boundary
This document is a replica planning artifact only. It does not approve migration creation, business-code changes, production operations, or live crawling.
`;
}

function techMarkdown(plan) {
  return `# TECH ${plan.replica_plan_id}

## Database Plan
${plan.tech.database_plan.map((item) => `- ${item.entity}: ${item.fields.join(", ")} (${item.migration_status})`).join("\n")}

## API Plan
${plan.tech.api_plan.map((item) => `- ${item.entity}: ${item.routes.join("; ")}`).join("\n")}

## Frontend Page Plan
${plan.tech.frontend_page_plan.map((item) => `- ${item.entity}: ${item.pages.join(", ")}`).join("\n")}

## RBAC Plan
${plan.tech.rbac_plan.map((item) => `- ${item}`).join("\n")}

## Migration Plan
${plan.tech.migration_plan.map((item) => `- ${item}`).join("\n")}

## Validation Plan
${plan.tech.validation_plan.map((item) => `- ${item}`).join("\n")}

## Safety
No migration, deploy, production operation, or business-code modification is performed by this planner.
`;
}

function outputPathsFor(targetId) {
  return {
    plan: join(discoveryDir, `replica-plan.${targetId}.json`),
    req: join(specsDir, `REQ-REPLICA-${targetId}.md`),
    tech: join(specsDir, `TECH-REPLICA-${targetId}.md`)
  };
}

function printSummary(plan, mode, paths) {
  console.log("# Replica Planner");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`target_id: ${plan.target_id}`);
  console.log(`schema_inference_id: ${plan.schema_inference_id}`);
  console.log(`replica_plan_id: ${plan.replica_plan_id}`);
  console.log(`entities: ${plan.req.target_entities.length}`);
  console.log(`task_candidates: ${plan.task_candidates.length}`);
  console.log(`plan_output: ${paths.plan}`);
  console.log(`req_output: ${paths.req}`);
  console.log(`tech_output: ${paths.tech}`);
  console.log("");
  console.log("task candidates:");
  for (const task of plan.task_candidates) {
    console.log(`- ${task.task_id} -> ${task.owner} | ${task.skill_type} | ${task.priority}/${task.risk}`);
  }
  console.log("");
  console.log("safety:");
  console.log("- no live crawling");
  console.log("- no Agent execution");
  console.log("- no migration creation");
  console.log("- no business-code modification");
  console.log("- no production operation");
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no replica plan, REQ, TECH, queue, or event files were written.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const inference = await readJson(resolveRepoPath(args.schema));
const plan = buildReplicaPlan(inference);
const paths = outputPathsFor(plan.target_id);
if (args.apply) {
  await writeJson(paths.plan, plan);
  await writeText(paths.req, reqMarkdown(plan));
  await writeText(paths.tech, techMarkdown(plan));
}
printSummary(plan, args.apply ? "apply" : "dry-run", paths);
