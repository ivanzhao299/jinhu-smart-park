#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");
const defaultSystemMapPath = join(discoveryDir, "system-map.example.json");
const defaultSchemaPath = join(discoveryDir, "schema-inference.example.json");
const defaultApiPath = join(discoveryDir, "api_inventory.example.json");
const defaultEntityMapPath = join(discoveryDir, "entity-map.example.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/replica-score.mjs [--system-map <file>] [--schema <file>] [--api <file>] [--entity-map <file>] --dry-run");
}

function parseArgs(argv) {
  const args = {
    systemMap: defaultSystemMapPath,
    schema: defaultSchemaPath,
    api: defaultApiPath,
    entityMap: defaultEntityMapPath,
    dryRun: argv.includes("--dry-run")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--system-map") {
      args.systemMap = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--schema") {
      args.schema = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--api") {
      args.api = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--entity-map") {
      args.entityMap = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--dry-run") {
      continue;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      usage();
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.dryRun) throw new Error("replica-score is dry-run only in P0. Pass --dry-run.");
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function replicaScore({ systemMap, schema, api, entityMap }) {
  const pageCount = (systemMap.pages ?? []).length;
  const formCount = (systemMap.forms ?? []).length;
  const endpointCount = (api.endpoints ?? []).length;
  const workflowEntities = (schema.entities ?? []).filter((entity) => (entity.workflow_fields ?? []).length > 0).length;
  const rbacEntities = (schema.entities ?? []).filter((entity) => (entity.rbac_fields ?? []).length > 0).length;
  const mappingConfidence = average((entityMap.mappings ?? []).map((mapping) => Number(mapping.confidence ?? 0)));

  const uiScore = clamp((Math.min(pageCount, 4) * 18) + (Math.min(formCount, 4) * 7) + 20);
  const apiScore = clamp((Math.min(endpointCount, 4) * 18) + 25);
  const workflowScore = clamp((workflowEntities > 0 ? 75 : 55) + Math.min(workflowEntities, 3) * 5);
  const rbacScore = clamp((rbacEntities > 0 ? 70 : 52) + Math.min(rbacEntities, 3) * 6);
  const dataScore = clamp((mappingConfidence * 100) || 45);
  const overall = clamp(average([uiScore, apiScore, workflowScore, rbacScore, dataScore]));

  return {
    ui_score: uiScore,
    api_score: apiScore,
    workflow_score: workflowScore,
    rbac_score: rbacScore,
    data_score: dataScore,
    overall_replica_score: overall,
    coverage: {
      pages: pageCount,
      forms: formCount,
      endpoints: endpointCount,
      mapped_entities: (entityMap.mappings ?? []).length,
      workflow_entities: workflowEntities,
      rbac_entities: rbacEntities
    },
    notes: [
      "Replica score is a planning metric only.",
      "Scores do not approve business-code changes, migrations, deployment, or live crawling.",
      "Low API/RBAC/workflow coverage should trigger evidence collection before implementation."
    ]
  };
}

function printSummary(systemMap, result) {
  console.log("# Replica Score");
  console.log("");
  console.log(`target_id: ${systemMap.target_id}`);
  console.log(`UI Score: ${result.ui_score}`);
  console.log(`API Score: ${result.api_score}`);
  console.log(`Workflow Score: ${result.workflow_score}`);
  console.log(`RBAC Score: ${result.rbac_score}`);
  console.log(`Data Score: ${result.data_score}`);
  console.log(`Overall Replica Score: ${result.overall_replica_score}`);
  console.log("");
  console.log("coverage:");
  for (const [key, value] of Object.entries(result.coverage)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log("");
  console.log("notes:");
  for (const note of result.notes) console.log(`- ${note}`);
  console.log("");
  console.log("Dry-run: no replica score file was written.");
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const [systemMap, schema, api, entityMap] = await Promise.all([
  readJson(resolveRepoPath(args.systemMap)),
  readJson(resolveRepoPath(args.schema)),
  readJson(resolveRepoPath(args.api)),
  readJson(resolveRepoPath(args.entityMap))
]);
printSummary(systemMap, replicaScore({ systemMap, schema, api, entityMap }));
