import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";

export class LegacyRelationalModelError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRelationalModelError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRelationalModelError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const stableId = (prefix, value) => `${prefix}-${sha256(value).slice(0, 16).toUpperCase()}`;

function readPlainAbsoluteFile(path, label) {
  if (!isAbsolute(path)) fail("SOURCE_PATH_INVALID", `${label}:absolute path required`);
  let real;
  try { real = realpathSync(path); } catch { fail("SOURCE_FILE_MISSING", label); }
  if (!statSync(real).isFile() || lstatSync(path).isSymbolicLink()) fail("SOURCE_PATH_INVALID", label);
  return readFileSync(real);
}

function identifiers(value) {
  return [...value.matchAll(/\[([^\]]+)\]/gu)].map(match => match[1]);
}

export function parseLegacySchemaRelations(schemaText, inventory, { validateInventory = true } = {}) {
  if (validateInventory) validateLegacyAtomicInventory(inventory);
  const tableNames = new Set(inventory.tables.map(table => table.name));
  const primaryKeys = [];
  const tablePattern = /CREATE TABLE \[dbo\]\.\[([^\]]+)\]\(([^]*?)\n\)\s*;?/gu;
  for (const match of schemaText.matchAll(tablePattern)) {
    const table = match[1];
    if (!tableNames.has(table)) fail("SCHEMA_TABLE_NOT_IN_INVENTORY", table);
    const pk = /CONSTRAINT \[([^\]]+)\] PRIMARY KEY(?: CLUSTERED| NONCLUSTERED)?\s*\(([^)]*)\)/u.exec(match[2]);
    if (!pk) continue;
    const columns = identifiers(pk[2]);
    if (!columns.length) fail("PRIMARY_KEY_COLUMNS_EMPTY", table);
    primaryKeys.push({ id: stableId("PK", `${table}\0${columns.join("\0")}`), constraint: pk[1], table, columns, evidence: "declared_constraint" });
  }

  const foreignKeys = [];
  const fkPattern = /ALTER TABLE \[dbo\]\.\[([^\]]+)\][^;]*?CONSTRAINT \[([^\]]+)\] FOREIGN KEY\(([^)]*)\) REFERENCES \[dbo\]\.\[([^\]]+)\] \(([^)]*)\)/gu;
  for (const match of schemaText.matchAll(fkPattern)) {
    const [, table, constraint, sourcePart, targetTable, targetPart] = match;
    const sourceColumns = identifiers(sourcePart);
    const targetColumns = identifiers(targetPart);
    if (!tableNames.has(table) || !tableNames.has(targetTable)) fail("FOREIGN_KEY_TABLE_NOT_IN_INVENTORY", `${table}->${targetTable}`);
    if (!sourceColumns.length || sourceColumns.length !== targetColumns.length) fail("FOREIGN_KEY_COLUMNS_INVALID", constraint);
    foreignKeys.push({ id: stableId("FK", `${table}\0${sourceColumns.join("\0")}\0${targetTable}\0${targetColumns.join("\0")}`), constraint, sourceTable: table, sourceColumns, targetTable, targetColumns, evidence: "declared_constraint" });
  }

  const declared = new Set(foreignKeys.map(item => `${item.sourceTable}\0${item.sourceColumns.join("\0")}`));
  const businessKeys = new Map([
    ["person", ["person", "person"]], ["department", ["departmentcode", "department"]],
    ["job", ["job", "job"]], ["assignment", ["assignment", "assignment"]],
    ["secassignment", ["secassignmentcode", "secassignment"]], ["jobstate", ["jobstatecode", "jobstate"]],
    ["compacttype", ["compacttypecode", "compacttype"]], ["assessment", ["assessmentcode", "assessment"]],
    ["course", ["course", "course"]], ["ticket", ["ticketcode", "ticket"]],
    ["knowhow", ["knowhowcode", "knowhow"]], ["bonus", ["bonuscode", "bonus"]],
    ["awaytype", ["awaytypecode", "awaytype"]],
  ]);
  const inferredRelations = [];
  for (const table of inventory.tables) {
    for (const column of table.columns) {
      const target = businessKeys.get(column.name.toLowerCase());
      if (!target || table.name === target[0] || declared.has(`${table.name}\0${column.name}`) || !tableNames.has(target[0])) continue;
      inferredRelations.push({
        id: stableId("IR", `${table.name}\0${column.name}\0${target[0]}\0${target[1]}`),
        sourceTable: table.name,
        sourceColumns: [column.name],
        targetTable: target[0],
        targetColumns: [target[1]],
        evidence: "business_key_name_candidate",
        reviewStatus: "candidate",
      });
    }
  }
  return {
    primaryKeys: primaryKeys.sort((a, b) => a.table.localeCompare(b.table, "en")),
    foreignKeys: foreignKeys.sort((a, b) => `${a.sourceTable}:${a.constraint}`.localeCompare(`${b.sourceTable}:${b.constraint}`, "en")),
    inferredRelations: inferredRelations.sort((a, b) => `${a.sourceTable}:${a.sourceColumns[0]}`.localeCompare(`${b.sourceTable}:${b.sourceColumns[0]}`, "en")),
  };
}

const ROUTINE_PREFIXES = ["SQL_STORED_PROCEDURE_", "SQL_SCALAR_FUNCTION_", "SQL_INLINE_TABLE_VALUED_FUNCTION_", "SQL_TRIGGER_"];
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export function scanRoutineTableDependencies(routineDirectory, inventory) {
  const realDirectory = realpathSync(routineDirectory);
  if (!statSync(realDirectory).isDirectory() || lstatSync(routineDirectory).isSymbolicLink()) fail("ROUTINE_PATH_INVALID", "routine directory");
  const tableNames = inventory.tables.map(table => table.name).sort((a, b) => b.length - a.length);
  const dependencies = [];
  for (const fileName of readdirSync(realDirectory).sort((a, b) => a.localeCompare(b, "en"))) {
    const prefix = ROUTINE_PREFIXES.find(item => fileName.startsWith(item));
    if (!prefix || !fileName.endsWith("_sql")) fail("ROUTINE_FILE_INVALID", fileName);
    const path = join(realDirectory, fileName);
    if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || !realpathSync(path).startsWith(`${realDirectory}${sep}`)) fail("ROUTINE_FILE_INVALID", fileName);
    const bytes = readFileSync(path);
    const source = bytes.toString("utf8").replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/--[^\r\n]*/gu, " ");
    const tables = tableNames.filter(table => {
      const escaped = regexEscape(table);
      const explicitReference = new RegExp(`(?:\\[dbo\\]\\.\\[${escaped}\\]|\\bdbo\\.\\[?${escaped}\\]?\\b|\\b(?:from|join|update|into|delete\\s+from|alter\\s+table)\\s+(?:dbo\\.)?\\[?${escaped}\\]?\\b|\\b${escaped}\\.\\[?[\\p{L}\\p{N}_]+\\]?)`, "iu");
      return explicitReference.test(source);
    });
    const routine = inventory.routines.find(item => item.sourceArtifactSha256 === sha256(bytes));
    if (!routine) fail("ROUTINE_NOT_IN_INVENTORY", fileName);
    dependencies.push({ routineId: routine.id, kind: routine.kind, routine: routine.name, tables });
  }
  return dependencies;
}

export function buildLegacyRelationalModel({ inventory, schemaBytes, routineDirectory }) {
  const inventoryReport = validateLegacyAtomicInventory(inventory);
  const schemaText = schemaBytes.toString("utf8").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const relations = parseLegacySchemaRelations(schemaText, inventory, { validateInventory: false });
  const routineDependencies = scanRoutineTableDependencies(routineDirectory, inventory);
  return {
    formatVersion: 1,
    modelKind: "yuzhou_hr_legacy_relational_model",
    sourceBinding: { inventorySha256: inventoryReport.inventoryHash, schemaSha256: sha256(schemaBytes) },
    summary: {
      tables: inventoryReport.summary.tables,
      columns: inventoryReport.summary.columns,
      declaredPrimaryKeys: relations.primaryKeys.length,
      declaredForeignKeys: relations.foreignKeys.length,
      inferredBusinessKeyCandidates: relations.inferredRelations.length,
      routines: routineDependencies.length,
      tablesReferencedByRoutines: new Set(routineDependencies.flatMap(item => item.tables)).size,
    },
    ...relations,
    routineDependencies,
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const args = { inventory: null, schema: null, routineDirectory: null, json: false };
  const keys = new Map([["--inventory", "inventory"], ["--schema", "schema"], ["--routine-directory", "routineDirectory"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (keys.has(arg) && argv[index + 1]) args[keys.get(arg)] = argv[++index];
    else if (arg === "--json") args.json = true;
    else fail("CLI_ARGUMENT_INVALID", String(arg));
  }
  for (const key of ["inventory", "schema", "routineDirectory"]) if (!args[key] || !isAbsolute(args[key])) fail("CLI_ARGUMENT_INVALID", `${key} must be absolute`);
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const inventory = JSON.parse(readPlainAbsoluteFile(args.inventory, "inventory").toString("utf8"));
    const report = buildLegacyRelationalModel({ inventory, schemaBytes: readPlainAbsoluteFile(args.schema, "schema"), routineDirectory: args.routineDirectory });
    process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof LegacyRelationalModelError ? error.code : "LEGACY_RELATIONAL_MODEL_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
