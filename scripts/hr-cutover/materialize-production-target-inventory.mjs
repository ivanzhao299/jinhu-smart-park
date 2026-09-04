#!/usr/bin/env node
import { createHash } from "node:crypto";

import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
} from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TARGET_TABLES = Object.freeze(Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables).sort());
const UNVERSIONED_TABLES = new Set(["hr_contract_legacy_evidence"]);

export class ProductionTargetInventoryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionTargetInventoryError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionTargetInventoryError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function validateScope(scope) {
  exactKeys(scope, ["tenantId", "parkId"], "PRODUCTION_IMPORT_TARGET_INVENTORY_SCOPE_INVALID", "targetScope");
  if (!SAFE_SCOPE_ID.test(scope.tenantId ?? "") || !SAFE_SCOPE_ID.test(scope.parkId ?? "")) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_SCOPE_INVALID", "scope values");
  return Object.freeze({ tenantId: scope.tenantId, parkId: scope.parkId, scopeSha256: computeProductionImportTargetScopeHash(scope) });
}

function validateDerivedFields(targetTable, value, rule) {
  exactKeys(value, rule.derivedFields, "PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", `${targetTable}.derivedFields`);
  const foreignKeys = new Map(rule.foreignKeys.map(item => [item.column, item]));
  for (const field of rule.derivedFields) {
    const fieldValue = value[field];
    if (fieldValue === null) {
      if (foreignKeys.get(field)?.required) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", `${targetTable}.${field} required`);
    } else if (!UUID.test(fieldValue ?? "")) {
      fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", `${targetTable}.${field} invalid`);
    }
  }
  return structuredClone(value);
}

function validateRecord(record, targetScope) {
  exactKeys(record, ["targetTable", "targetId", "targetVersion", "targetFields", "derivedFields"], "PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", "record");
  const rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[record.targetTable];
  if (!rule || !UUID.test(record.targetId ?? "") || !Number.isSafeInteger(record.targetVersion) || record.targetVersion < 0) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", "record identity");
  if (UNVERSIONED_TABLES.has(record.targetTable) ? record.targetVersion !== 0 : record.targetVersion < 1) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", `${record.targetTable}.targetVersion`);
  let targetFields;
  try {
    targetFields = normalizeProductionImportTargetFields(record.targetTable, record.targetFields, rule);
  } catch {
    fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID", `${record.targetTable}.targetFields`);
  }
  const derivedFields = validateDerivedFields(record.targetTable, record.derivedFields, rule);
  return Object.freeze({
    targetTable: record.targetTable,
    businessIdentitySha256: computeProductionImportBusinessIdentityHash(record.targetTable, targetScope, targetFields, derivedFields),
    targetId: record.targetId,
    targetCanonicalSha256: computeProductionImportTargetCanonicalHash(record.targetTable, targetScope, targetFields, derivedFields),
    targetVersion: record.targetVersion,
  });
}

/**
 * Converts production-host-only rows for every T0-T3 target table into a
 * portable hash-only inventory. Raw target values are never returned.
 */
export function materializeProductionTargetInventory(input) {
  exactKeys(input, ["targetIdentityMaterial", "targetScope", "records"], "PRODUCTION_IMPORT_TARGET_INVENTORY_INPUT_INVALID", "input");
  if (typeof input.targetIdentityMaterial !== "string" || input.targetIdentityMaterial.length === 0 || !Array.isArray(input.records)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INPUT_INVALID", "input values");
  const targetScope = validateScope(input.targetScope);
  const records = input.records.map(record => validateRecord(record, targetScope));
  const identities = new Set();
  const ids = new Set();
  for (const record of records) {
    const identity = `${record.targetTable}:${record.businessIdentitySha256}`;
    const id = `${record.targetTable}:${record.targetId}`;
    if (identities.has(identity) || ids.has(id)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_DUPLICATE", identity);
    identities.add(identity);
    ids.add(id);
  }
  records.sort((left, right) => left.targetTable.localeCompare(right.targetTable) || left.businessIdentitySha256.localeCompare(right.businessIdentitySha256));
  return Object.freeze({
    formatVersion: 1,
    kind: "yuzhou_hr_production_target_inventory_readonly",
    status: "PASS",
    productionImport: "HOLD",
    executionReachable: false,
    targetIdentitySha256: sha256(`yuzhou-hr-production-target-v1:${input.targetIdentityMaterial}`),
    targetScopeSha256: targetScope.scopeSha256,
    targetTableCounts: Object.fromEntries(TARGET_TABLES.map(table => [table, records.filter(record => record.targetTable === table).length])),
    records,
  });
}

function sqlValue(alias, field, rule) {
  const column = `${alias}."${field}"`;
  if (rule.decimalStringFields.includes(field) || rule.dateFields.includes(field)) return `${column}::text`;
  if (rule.timestampFields.includes(field)) {
    return `CASE WHEN ${column} IS NULL THEN NULL ELSE to_char(${column},'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00' END`;
  }
  return column;
}

function jsonObject(expressions) {
  return expressions.length === 0 ? `'{}'::jsonb` : `jsonb_build_object(${expressions.flatMap(([key, value]) => [`'${key}'`, value]).join(",")})`;
}

/** Builds the fixed, read-only PostgreSQL projection consumed by the host shell. */
export function buildProductionTargetInventorySql() {
  const selects = TARGET_TABLES.map((targetTable, index) => {
    const rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[targetTable];
    const alias = `t${index}`;
    const targetFields = jsonObject(rule.fieldWhitelist.map(field => [field, sqlValue(alias, field, rule)]));
    const derivedFields = jsonObject(rule.derivedFields.map(field => [field, `${alias}."${field}"::text`]));
    const version = UNVERSIONED_TABLES.has(targetTable) ? "0" : `${alias}.version`;
    const live = UNVERSIONED_TABLES.has(targetTable) ? "" : ` AND ${alias}.is_deleted=false`;
    return `SELECT '${targetTable}'::text AS target_table,${alias}.id::text AS target_id,${version}::integer AS target_version,${targetFields} AS target_fields,${derivedFields} AS derived_fields FROM public."${targetTable}" ${alias} JOIN single_scope scope ON ${alias}.tenant_id::text=scope.tenant_id AND ${alias}.park_id::text=scope.park_id WHERE true${live}`;
  });
  return `BEGIN TRANSACTION READ ONLY;\nSET LOCAL search_path = public, pg_catalog;\nWITH hr_scope AS (\n  SELECT DISTINCT btrim(assignment.tenant_id::text) AS tenant_id,btrim(assignment.park_id::text) AS park_id\n  FROM rel_tenant_module assignment JOIN sys_module module ON module.id=assignment.module_id AND module.module_code='hr' AND module.is_deleted=false\n  WHERE assignment.enabled=true AND assignment.status='enabled' AND assignment.is_deleted=false\n    AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())\n    AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())\n), validated AS (\n  SELECT scope.tenant_id,scope.park_id FROM hr_scope scope\n  WHERE EXISTS (SELECT 1 FROM sys_tenant tenant WHERE btrim(tenant.tenant_id::text)=scope.tenant_id AND tenant.status=1 AND tenant.is_deleted=false AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp()))\n    AND EXISTS (SELECT 1 FROM biz_park park WHERE btrim(park.tenant_id::text)=scope.tenant_id AND btrim(park.park_id::text)=scope.park_id AND park.status=1 AND park.is_deleted=false)\n), single_scope AS (\n  SELECT max(tenant_id) AS tenant_id,max(park_id) AS park_id FROM validated HAVING count(*)=1\n), target_rows AS (\n  ${selects.join("\n  UNION ALL\n  ")}\n)\nSELECT jsonb_build_object(\n  'targetIdentityMaterial',concat_ws(E'\\x1f',current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),scope.tenant_id,scope.park_id),\n  'targetScope',jsonb_build_object('tenantId',scope.tenant_id,'parkId',scope.park_id),\n  'records',coalesce((SELECT jsonb_agg(jsonb_build_object('targetTable',target_table,'targetId',target_id,'targetVersion',target_version,'targetFields',target_fields,'derivedFields',derived_fields) ORDER BY target_table,target_id) FROM target_rows),'[]'::jsonb)\n)::text FROM single_scope scope;\nCOMMIT;\n`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv[2] === "--sql" && process.argv.length === 3) {
    process.stdout.write(buildProductionTargetInventorySql());
  } else if (process.argv.length === 2) {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { body += chunk; });
    process.stdin.on("end", () => {
      try { process.stdout.write(`${JSON.stringify(materializeProductionTargetInventory(JSON.parse(body)))}\n`); }
      catch (error) { process.stderr.write(`${error instanceof ProductionTargetInventoryError ? error.code : "PRODUCTION_IMPORT_TARGET_INVENTORY_FAILED"}\n`); process.exitCode = 1; }
    });
  } else {
    process.stderr.write("PRODUCTION_IMPORT_TARGET_INVENTORY_ARGUMENT_INVALID\n");
    process.exitCode = 2;
  }
}
