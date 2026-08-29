import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const TARGET_MODEL_URL = new URL("./contracts/production-import-target-model-v1.json", import.meta.url);
const SHA256 = /^[0-9a-f]{64}$/u;
const TABLE = /^[a-z][a-z0-9_]{1,95}$/u;
const COLUMN = /^[a-z][a-z0-9_]{0,63}$/u;
const SOURCE_TABLE = /^dbo\.[a-z][a-z0-9_]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DENIED_COLUMNS = new Set(["id", "tenant_id", "park_id", "create_by", "create_time", "update_by", "update_time", "version", "is_deleted"]);
const ALLOWED_DISPOSITIONS = new Set(["insert", "merge", "quarantine", "skip_approved"]);
const TABLE_KEYS = ["phase", "scopeColumns", "allowedSourceTables", "fieldWhitelist", "requiredFields", "nullableFields", "integerFields", "booleanFields", "decimalStringFields", "dateFields", "timestampFields", "jsonObjectFields", "derivedFields", "foreignKeys", "uniqueKey", "canonicalFields", "allowedDispositions"];

export class ProductionImportTargetModelError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportTargetModelError";
    this.code = code;
  }
}

const fail = (detail, code = "PRODUCTION_IMPORT_TARGET_MODEL_INVALID") => { throw new ProductionImportTargetModelError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical JSON accepts safe integers only", "PRODUCTION_IMPORT_CANONICAL_VALUE_INVALID");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) fail("canonical JSON accepts plain JSON objects only", "PRODUCTION_IMPORT_CANONICAL_VALUE_INVALID");
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

export const stableProductionImportCanonicalJson = value => JSON.stringify(canonicalize(value));

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} keys differ`);
}

function assertStringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some(item => typeof item !== "string") || new Set(value).size !== value.length) fail(`${label} must be a unique string array`);
}

function validateTable(tableName, rule, phaseOrder) {
  if (!TABLE.test(tableName)) fail(`${tableName} name invalid`);
  exactKeys(rule, TABLE_KEYS, tableName);
  if (!phaseOrder.includes(rule.phase)) fail(`${tableName}.phase invalid`);
  if (JSON.stringify(rule.scopeColumns) !== JSON.stringify(["tenant_id", "park_id"])) fail(`${tableName}.scopeColumns must be exact tenant/park`);
  assertStringArray(rule.allowedSourceTables, `${tableName}.allowedSourceTables`, { allowEmpty: false });
  if (rule.allowedSourceTables.some(value => !SOURCE_TABLE.test(value))) fail(`${tableName}.allowedSourceTables invalid`);
  for (const key of ["fieldWhitelist", "requiredFields", "nullableFields", "integerFields", "booleanFields", "decimalStringFields", "dateFields", "timestampFields", "jsonObjectFields", "derivedFields", "uniqueKey", "canonicalFields", "allowedDispositions"]) assertStringArray(rule[key], `${tableName}.${key}`, { allowEmpty: !["fieldWhitelist", "requiredFields", "uniqueKey", "canonicalFields", "allowedDispositions"].includes(key) });
  if (rule.fieldWhitelist.some(field => !COLUMN.test(field) || DENIED_COLUMNS.has(field))) fail(`${tableName}.fieldWhitelist contains a database-owned field`);
  if (rule.derivedFields.some(field => !COLUMN.test(field) || DENIED_COLUMNS.has(field) || rule.fieldWhitelist.includes(field))) fail(`${tableName}.derivedFields invalid`);
  const declared = new Set([...rule.scopeColumns, ...rule.fieldWhitelist, ...rule.derivedFields]);
  for (const key of ["requiredFields", "nullableFields", "uniqueKey", "canonicalFields"]) if (rule[key].some(field => !declared.has(field) || (key !== "uniqueKey" && rule.scopeColumns.includes(field)))) fail(`${tableName}.${key} contains an undeclared field`);
  const typed = ["integerFields", "booleanFields", "decimalStringFields", "dateFields", "timestampFields", "jsonObjectFields"];
  const typedSeen = new Set();
  for (const key of typed) for (const field of rule[key]) {
    if (!rule.fieldWhitelist.includes(field) || typedSeen.has(field)) fail(`${tableName}.${field} type declaration invalid`);
    typedSeen.add(field);
  }
  if (rule.requiredFields.some(field => rule.nullableFields.includes(field))) fail(`${tableName} field cannot be required and nullable`);
  if (rule.fieldWhitelist.some(field => !rule.requiredFields.includes(field) && !rule.nullableFields.includes(field))) fail(`${tableName}.${rule.fieldWhitelist.find(field => !rule.requiredFields.includes(field) && !rule.nullableFields.includes(field))} must be required or explicitly nullable`);
  if (!Array.isArray(rule.foreignKeys) || rule.foreignKeys.length !== rule.derivedFields.length) fail(`${tableName}.foreignKeys must cover every derived field`);
  const roles = new Set();
  for (const foreignKey of rule.foreignKeys) {
    exactKeys(foreignKey, ["column", "dependencyRole", "targetTable", "required"], `${tableName}.foreignKey`);
    if (!rule.derivedFields.includes(foreignKey.column) || !COLUMN.test(foreignKey.dependencyRole) || !TABLE.test(foreignKey.targetTable) || typeof foreignKey.required !== "boolean" || roles.has(foreignKey.dependencyRole)) fail(`${tableName}.foreignKey invalid`);
    roles.add(foreignKey.dependencyRole);
  }
  if (rule.allowedDispositions.some(value => !ALLOWED_DISPOSITIONS.has(value)) || !rule.allowedDispositions.includes("insert") || !rule.allowedDispositions.includes("quarantine") || !rule.allowedDispositions.includes("skip_approved")) fail(`${tableName}.allowedDispositions invalid`);
}

export function validateProductionImportTargetModel(input) {
  exactKeys(input, ["formatVersion", "modelKind", "modelVersion", "canonicalizationVersion", "targetIdDerivation", "businessIdentityDerivation", "targetCanonicalDerivation", "sourceSystem", "phaseOrder", "targetTables"], "targetModel");
  if (input.formatVersion !== 1 || input.modelKind !== "yuzhou_hr_production_import_target_model" || input.canonicalizationVersion !== "yuzhou-production-import-canonical-json-v1" || input.targetIdDerivation !== "yuzhou-hr-production-target-id-sha256-v1" || input.businessIdentityDerivation !== "yuzhou-hr-production-business-identity-sha256-v1" || input.targetCanonicalDerivation !== "yuzhou-hr-production-target-canonical-sha256-v1" || input.sourceSystem !== "yuzhou-v10") fail("target model identity invalid");
  if (JSON.stringify(input.phaseOrder) !== JSON.stringify(["T0", "T1", "T2", "T3"])) fail("phase order invalid");
  if (!isPlainObject(input.targetTables) || Object.keys(input.targetTables).length !== 16) fail("exactly 16 target tables are required");
  for (const [tableName, rule] of Object.entries(input.targetTables)) validateTable(tableName, rule, input.phaseOrder);
  for (const [tableName, rule] of Object.entries(input.targetTables)) for (const foreignKey of rule.foreignKeys) if (!input.targetTables[foreignKey.targetTable]) fail(`${tableName}.${foreignKey.dependencyRole} target absent`);
  return structuredClone(input);
}

export const DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL = validateProductionImportTargetModel(JSON.parse(readFileSync(TARGET_MODEL_URL, "utf8")));

function tableRule(targetTable, model) {
  const rule = model?.targetTables?.[targetTable];
  if (!rule) fail(`${targetTable} not in target model`, "PRODUCTION_IMPORT_TARGET_TABLE_DENIED");
  return rule;
}

function scopedProjection(rule, targetScope, payload, derivedFields, selectedFields) {
  const row = { tenant_id: targetScope.tenantId, park_id: targetScope.parkId };
  for (const field of selectedFields) {
    if (rule.scopeColumns.includes(field)) continue;
    if (rule.derivedFields.includes(field)) row[field] = derivedFields[field] ?? null;
    else row[field] = payload[field] ?? null;
  }
  return row;
}

export function computeProductionImportBusinessIdentityHash(targetTable, targetScope, payload, derivedFields = {}, model = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL) {
  const rule = tableRule(targetTable, model);
  const projection = scopedProjection(rule, targetScope, payload, derivedFields, rule.uniqueKey);
  return sha256(`yuzhou-hr-production-business-identity-sha256-v1\0${targetTable}\0${stableProductionImportCanonicalJson(projection)}`);
}

export function computeProductionImportTargetCanonicalHash(targetTable, targetScope, payload, derivedFields = {}, model = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL) {
  const rule = tableRule(targetTable, model);
  const projection = scopedProjection(rule, targetScope, payload, derivedFields, [...rule.scopeColumns, ...rule.canonicalFields]);
  return sha256(`yuzhou-hr-production-target-canonical-sha256-v1\0${targetTable}\0${stableProductionImportCanonicalJson(projection)}`);
}

export function deriveProductionImportTargetId({ targetScope, targetTable, sourceIdentitySha256 }, model = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL) {
  tableRule(targetTable, model);
  if (!SHA256.test(targetScope?.scopeSha256 ?? "") || !SHA256.test(sourceIdentitySha256 ?? "")) fail("target ID inputs invalid", "PRODUCTION_IMPORT_TARGET_IDENTITY_INVALID");
  const bytes = Buffer.from(sha256(`yuzhou-hr-production-target-id-sha256-v1\0${targetScope.scopeSha256}\0${targetTable}\0${sourceIdentitySha256}`), "hex").subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!UUID.test(id)) fail("derived target ID invalid", "PRODUCTION_IMPORT_TARGET_IDENTITY_INVALID");
  return id;
}
