#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");
const defaultSchemaPath = join(discoveryDir, "schema-inference.example.json");

const ENTITY_ALIASES = [
  {
    target: "Customer Master",
    keywords: ["customer", "client", "客户", "会员", "供应商客户"]
  },
  {
    target: "Notice Center",
    keywords: ["notice", "announcement", "公告", "通知"]
  },
  {
    target: "Workflow Approval",
    keywords: ["approval", "workflow", "审批", "流程"]
  },
  {
    target: "Finance Transaction",
    keywords: ["amount", "payment", "invoice", "finance", "金额", "收款", "发票"]
  }
];

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/entity-mapper.mjs [--schema <schema-inference.json>] --dry-run|--apply");
}

function parseArgs(argv) {
  const args = {
    schema: defaultSchemaPath,
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
  if (args.dryRun === args.apply) throw new Error("Specify exactly one of --dry-run or --apply.");
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function chooseTargetEntity(entity) {
  const haystack = [
    entity.entity_name,
    ...(entity.fields ?? []).map((field) => field.name)
  ].map(normalize).join(" ");

  for (const alias of ENTITY_ALIASES) {
    const hits = alias.keywords.filter((keyword) => haystack.includes(normalize(keyword)));
    if (hits.length > 0) {
      return {
        new_entity: alias.target,
        confidence: Math.min(0.95, 0.68 + (hits.length * 0.07)),
        matched_keywords: hits
      };
    }
  }
  return {
    new_entity: "Review Required Master",
    confidence: 0.45,
    matched_keywords: []
  };
}

function mapField(field) {
  const normalized = normalize(field.name);
  if (normalized === "id") {
    return {
      legacy_field: field.name,
      new_field: "id",
      confidence: 0.95
    };
  }
  const candidates = [
    ["title", "title"],
    ["content", "body"],
    ["amount", "amount"],
    ["status", "status"],
    ["applicant", "applicant_id"],
    ["created_by", "created_by"],
    ["updated_by", "updated_by"]
  ];
  for (const [needle, target] of candidates) {
    if (normalized.includes(needle)) {
      return {
        legacy_field: field.name,
        new_field: target,
        confidence: needle === normalized ? 0.95 : 0.82
      };
    }
  }
  return {
    legacy_field: field.name,
    new_field: "review_required",
    confidence: 0.4
  };
}

function buildEntityMap(schema) {
  const mappings = (schema.entities ?? []).map((entity) => {
    const target = chooseTargetEntity(entity);
    return {
      legacy_entity: entity.entity_name,
      new_entity: target.new_entity,
      confidence: Number(target.confidence.toFixed(2)),
      matched_keywords: target.matched_keywords,
      mapping_reason: target.matched_keywords.length > 0
        ? `Matched alias keywords: ${target.matched_keywords.join(", ")}`
        : "No stable alias match; requires human review.",
      field_mappings: (entity.fields ?? []).map(mapField)
    };
  });

  return {
    version: 1,
    entity_map_id: `ENTITY-MAP-${schema.target_id}`,
    target_id: schema.target_id,
    schema_inference_id: schema.schema_inference_id,
    generated_at: nowIso(),
    mappings,
    unmapped_legacy_entities: mappings.filter((item) => item.confidence < 0.55).map((item) => item.legacy_entity),
    review_notes: [
      "Entity mapping is heuristic and should be reviewed before migration, API, or frontend implementation.",
      "Customer/客户/会员/供应商客户 aliases map to Customer Master when discovered."
    ]
  };
}

function outputPathFor(targetId) {
  return join(discoveryDir, `entity-map.${targetId}.json`);
}

function printSummary(entityMap, mode, outputPath) {
  console.log("# Entity Mapper");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`target_id: ${entityMap.target_id}`);
  console.log(`entity_map_id: ${entityMap.entity_map_id}`);
  console.log(`mappings: ${entityMap.mappings.length}`);
  console.log(`unmapped_legacy_entities: ${entityMap.unmapped_legacy_entities.length}`);
  console.log(`output: ${outputPath}`);
  console.log("");
  console.log("mappings:");
  for (const mapping of entityMap.mappings) {
    console.log(`- ${mapping.legacy_entity} -> ${mapping.new_entity} | confidence=${mapping.confidence}`);
    for (const field of mapping.field_mappings) {
      console.log(`  - ${field.legacy_field} -> ${field.new_field} | confidence=${field.confidence}`);
    }
  }
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no entity_map file was written.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const schema = await readJson(resolveRepoPath(args.schema));
const entityMap = buildEntityMap(schema);
const outputPath = outputPathFor(entityMap.target_id);
if (args.apply) {
  await writeJson(outputPath, entityMap);
}
printSummary(entityMap, args.apply ? "apply" : "dry-run", outputPath);
