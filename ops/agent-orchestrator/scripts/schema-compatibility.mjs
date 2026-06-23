#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");
const defaultSchemaPath = join(discoveryDir, "schema-inference.example.json");
const defaultEntityMapPath = join(discoveryDir, "entity-map.example.json");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/schema-compatibility.mjs [--schema <schema.json>] [--entity-map <entity-map.json>] --dry-run");
}

function parseArgs(argv) {
  const args = {
    schema: defaultSchemaPath,
    entityMap: defaultEntityMapPath,
    dryRun: argv.includes("--dry-run")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--schema") {
      args.schema = argv[index + 1] ?? "";
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
  if (!args.dryRun) throw new Error("schema-compatibility is dry-run only in P0. Pass --dry-run.");
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function score(schema, entityMap) {
  const entities = schema.entities ?? [];
  const mappings = entityMap.mappings ?? [];
  const mapped = mappings.filter((mapping) => Number(mapping.confidence ?? 0) >= 0.7);
  const fieldConfidences = mappings.flatMap((mapping) => (mapping.field_mappings ?? []).map((field) => Number(field.confidence ?? 0)));
  const fkCount = entities.flatMap((entity) => entity.foreign_keys ?? []).length;
  const reviewFkCount = entities.flatMap((entity) => entity.foreign_keys ?? []).filter((fk) => String(fk.references ?? "").includes("review_required")).length;
  const enumCount = (schema.enums ?? []).length;
  const nullableFields = entities.flatMap((entity) => entity.fields ?? []).filter((field) => field.nullable !== false).length;
  const totalFields = entities.flatMap((entity) => entity.fields ?? []).length;

  const entityScore = clamp((mapped.length / Math.max(1, entities.length)) * 100);
  const fieldScore = clamp(average(fieldConfidences) * 100);
  const relationshipScore = clamp(100 - ((reviewFkCount / Math.max(1, fkCount)) * 45));
  const migrationScore = clamp(88 - (enumCount * 2) - ((nullableFields / Math.max(1, totalFields)) * 8));
  const overall = clamp(average([entityScore, fieldScore, relationshipScore, migrationScore]));

  return {
    entity_score: entityScore,
    field_score: fieldScore,
    relationship_score: relationshipScore,
    migration_score: migrationScore,
    overall_compatibility: overall,
    notes: [
      "Compatibility scores are planning signals only and do not approve migration creation.",
      "Relationship score decreases when foreign keys require source-system confirmation.",
      "Migration score assumes forward-only migration review and no destructive changes."
    ]
  };
}

function printSummary(schema, entityMap, result) {
  console.log("# Schema Compatibility Score");
  console.log("");
  console.log(`target_id: ${schema.target_id}`);
  console.log(`schema_inference_id: ${schema.schema_inference_id}`);
  console.log(`entity_map_id: ${entityMap.entity_map_id}`);
  console.log(`Entity Score: ${result.entity_score}`);
  console.log(`Field Score: ${result.field_score}`);
  console.log(`Relationship Score: ${result.relationship_score}`);
  console.log(`Migration Score: ${result.migration_score}`);
  console.log(`Overall Compatibility: ${result.overall_compatibility}`);
  console.log("");
  console.log("notes:");
  for (const note of result.notes) console.log(`- ${note}`);
  console.log("");
  console.log("Dry-run: no compatibility score file was written.");
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const [schema, entityMap] = await Promise.all([
  readJson(resolveRepoPath(args.schema)),
  readJson(resolveRepoPath(args.entityMap))
]);
printSummary(schema, entityMap, score(schema, entityMap));
