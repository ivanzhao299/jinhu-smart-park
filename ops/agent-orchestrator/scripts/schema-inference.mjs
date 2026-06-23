#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orchestratorDir = dirname(scriptDir);
const repoRoot = dirname(dirname(orchestratorDir));
const discoveryDir = join(orchestratorDir, "discovery");

function usage() {
  console.error("Usage: node ops/agent-orchestrator/scripts/schema-inference.mjs --system-map <system_map.json> --dry-run|--apply");
}

function parseArgs(argv) {
  const args = {
    systemMap: "",
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--system-map") {
      args.systemMap = argv[index + 1] ?? "";
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
  if (!args.systemMap.trim()) {
    usage();
    throw new Error("Missing --system-map file.");
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

function resolveRepoPath(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(value) {
  return String(value ?? "entity")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase() || "entity";
}

function typeForField(field) {
  const inputType = String(field.input_type ?? "").toLowerCase();
  const name = String(field.name ?? "").toLowerCase();
  if (inputType === "money" || name.includes("amount") || name.includes("price")) return "decimal";
  if (inputType === "number") return "integer";
  if (inputType === "rich_text" || name.includes("content") || name.includes("description")) return "text";
  if (inputType === "file") return "attachment";
  if (inputType === "user" || name.endsWith("_by") || name.endsWith("_id")) return "uuid";
  if (inputType === "enum" || Array.isArray(field.options)) return "enum";
  if (inputType === "date") return "date";
  if (inputType === "datetime" || name.endsWith("_at")) return "datetime";
  if (inputType === "checkbox" || inputType === "boolean") return "boolean";
  return "string";
}

function entityNameForForm(form, systemMap) {
  const page = (systemMap.pages ?? []).find((item) => item.page_id === form.page_id);
  return normalizeName(page?.primary_table_hint ?? form.title ?? form.form_id);
}

function fieldsFromForm(form) {
  const fields = [
    {
      name: "id",
      type: "uuid",
      nullable: false,
      source: "default_primary_key"
    }
  ];
  for (const field of form.fields ?? []) {
    const inferred = {
      name: normalizeName(field.name),
      type: typeForField(field),
      nullable: field.required === true ? false : true,
      source: "form_field"
    };
    if (Array.isArray(field.options)) {
      inferred.enum_values = field.options;
    }
    fields.push(inferred);
  }
  return fields;
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferEntities(systemMap) {
  const byName = new Map();
  for (const form of systemMap.forms ?? []) {
    const entityName = entityNameForForm(form, systemMap);
    const current = byName.get(entityName) ?? {
      entity_name: entityName,
      source_pages: [],
      fields: [],
      primary_keys: ["id"],
      foreign_keys: [],
      indexes: [],
      attachments: [],
      audit_fields: ["created_at", "updated_at"],
      rbac_fields: [],
      workflow_fields: []
    };
    current.source_pages = mergeUnique([...current.source_pages, form.page_id]);
    const existingFields = new Set(current.fields.map((field) => field.name));
    for (const field of fieldsFromForm(form)) {
      if (!existingFields.has(field.name)) {
        current.fields.push(field);
        existingFields.add(field.name);
      }
      if (field.type === "attachment") current.attachments = mergeUnique([...current.attachments, field.name]);
      if (field.type === "enum" && field.name.includes("status")) current.workflow_fields = mergeUnique([...current.workflow_fields, field.name]);
      if (field.name.includes("tenant")) current.rbac_fields = mergeUnique([...current.rbac_fields, field.name]);
      if (field.name.endsWith("_id") && field.name !== "id") {
        current.foreign_keys.push({
          field: field.name,
          references: "review_required",
          confidence: "LOW"
        });
      }
    }
    if (current.fields.some((field) => field.name === "status")) {
      current.indexes = mergeUnique([...current.indexes, `idx_${entityName}_status`]);
    }
    byName.set(entityName, current);
  }

  for (const table of systemMap.tables ?? []) {
    const entityName = normalizeName(table.table_id ?? table.name);
    const current = byName.get(entityName) ?? {
      entity_name: entityName,
      source_pages: [],
      fields: [{ name: "id", type: "uuid", nullable: false, source: "default_primary_key" }],
      primary_keys: ["id"],
      foreign_keys: [],
      indexes: [],
      attachments: [],
      audit_fields: ["created_at", "updated_at"],
      rbac_fields: [],
      workflow_fields: []
    };
    const existingFields = new Set(current.fields.map((field) => field.name));
    for (const fieldName of table.fields ?? []) {
      const normalized = normalizeName(fieldName);
      if (!existingFields.has(normalized)) {
        current.fields.push({
          name: normalized,
          type: typeForField({ name: normalized }),
          nullable: normalized === "id" ? false : true,
          source: "table_hint"
        });
      }
    }
    byName.set(entityName, current);
  }

  return [...byName.values()];
}

function inferEnums(entities) {
  const enums = [];
  for (const entity of entities) {
    for (const field of entity.fields) {
      if (field.type === "enum") {
        enums.push({
          name: `${entity.entity_name}_${field.name}`,
          values: field.enum_values ?? ["review_required"]
        });
      }
    }
  }
  return enums;
}

function buildInference(systemMap) {
  const entities = inferEntities(systemMap);
  return {
    version: 1,
    schema_inference_id: `SCHEMA-INFERENCE-${systemMap.target_id}`,
    system_map_id: systemMap.system_map_id,
    target_id: systemMap.target_id,
    generated_at: nowIso(),
    entities,
    enums: inferEnums(entities),
    data_quality_notes: [
      "Schema inference is heuristic and must be reviewed before implementation.",
      "MVP does not create migrations, entities, API code, frontend pages, seeds, or production data changes.",
      "Foreign keys marked review_required need source-system confirmation."
    ]
  };
}

function outputPathFor(targetId) {
  return join(discoveryDir, `schema-inference.${targetId}.json`);
}

function printSummary(inference, mode, outputPath) {
  console.log("# Schema Inference");
  console.log("");
  console.log(`mode: ${mode}`);
  console.log(`target_id: ${inference.target_id}`);
  console.log(`system_map_id: ${inference.system_map_id}`);
  console.log(`schema_inference_id: ${inference.schema_inference_id}`);
  console.log(`entities: ${inference.entities.length}`);
  console.log(`enums: ${inference.enums.length}`);
  console.log(`output: ${outputPath}`);
  console.log("");
  console.log("entities:");
  for (const entity of inference.entities) {
    console.log(`- ${entity.entity_name}: fields=${entity.fields.length}; attachments=${entity.attachments.length}; workflow=${entity.workflow_fields.join(", ") || "none"}`);
  }
  console.log("");
  console.log("data_quality_notes:");
  for (const note of inference.data_quality_notes) console.log(`- ${note}`);
  if (mode === "dry-run") {
    console.log("");
    console.log("Dry-run: no schema inference file was written.");
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const systemMap = await readJson(resolveRepoPath(args.systemMap));
const inference = buildInference(systemMap);
const outputPath = outputPathFor(inference.target_id);
if (args.apply) {
  await writeJson(outputPath, inference);
}
printSummary(inference, args.apply ? "apply" : "dry-run", outputPath);
