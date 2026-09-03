#!/usr/bin/env node
import { createHash } from "node:crypto";

import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
} from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_SCOPE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const T0_TABLES = new Set(["sys_org", "hr_position", "hr_employee"]);

export class ProductionT0TargetInventoryError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = code => { throw new ProductionT0TargetInventoryError(code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value, keys) {
  return isPlainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateScope(scope) {
  if (!exactKeys(scope, ["tenantId", "parkId"]) || !SAFE_SCOPE_ID.test(scope.tenantId ?? "") || !SAFE_SCOPE_ID.test(scope.parkId ?? "")) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_SCOPE_INVALID");
  return { tenantId: scope.tenantId, parkId: scope.parkId, scopeSha256: computeProductionImportTargetScopeHash(scope) };
}

function validateRecord(record, targetScope) {
  if (!exactKeys(record, ["targetTable", "targetId", "targetVersion", "targetFields", "derivedFields"]) || !T0_TABLES.has(record.targetTable) || !UUID.test(record.targetId ?? "") || !Number.isSafeInteger(record.targetVersion) || record.targetVersion < 0) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
  const rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[record.targetTable];
  if (!rule || !exactKeys(record.targetFields, rule.fieldWhitelist) || !exactKeys(record.derivedFields, rule.derivedFields)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
  for (const field of rule.fieldWhitelist) {
    const value = record.targetFields[field];
    if (value === null) {
      if (!rule.nullableFields.includes(field)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
    } else if (rule.integerFields.includes(field)) {
      if (!Number.isSafeInteger(value)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
    } else if (typeof value !== "string") {
      fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
    }
  }
  for (const field of rule.derivedFields) if (record.derivedFields[field] !== null && !UUID.test(record.derivedFields[field])) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID");
  return {
    targetTable: record.targetTable,
    businessIdentitySha256: computeProductionImportBusinessIdentityHash(record.targetTable, targetScope, record.targetFields, record.derivedFields),
    targetId: record.targetId,
    targetCanonicalSha256: computeProductionImportTargetCanonicalHash(record.targetTable, targetScope, record.targetFields, record.derivedFields),
    targetVersion: record.targetVersion,
  };
}

/**
 * Converts a production-host-only T0 row projection into a portable hash-only
 * inventory. Raw target fields must be piped directly into this function and
 * are never returned, written, or accepted from a caller after materializing.
 */
export function materializeProductionT0TargetInventory(input) {
  if (!exactKeys(input, ["targetIdentityMaterial", "targetScope", "records"]) || typeof input.targetIdentityMaterial !== "string" || input.targetIdentityMaterial.length === 0 || !Array.isArray(input.records)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INPUT_INVALID");
  const targetScope = validateScope(input.targetScope);
  const records = input.records.map(record => validateRecord(record, targetScope));
  const identities = new Set();
  const ids = new Set();
  for (const record of records) {
    const identity = `${record.targetTable}:${record.businessIdentitySha256}`;
    const id = `${record.targetTable}:${record.targetId}`;
    if (identities.has(identity) || ids.has(id)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_DUPLICATE");
    identities.add(identity);
    ids.add(id);
  }
  records.sort((left, right) => left.targetTable.localeCompare(right.targetTable) || left.businessIdentitySha256.localeCompare(right.businessIdentitySha256));
  const targetTableCounts = Object.fromEntries([...T0_TABLES].sort().map(table => [table, records.filter(record => record.targetTable === table).length]));
  return Object.freeze({
    formatVersion: 1,
    kind: "yuzhou_hr_production_t0_target_inventory_readonly",
    status: "PASS",
    productionImport: "HOLD",
    executionReachable: false,
    targetIdentitySha256: sha256(`yuzhou-hr-production-target-v1:${input.targetIdentityMaterial}`),
    targetScopeSha256: targetScope.scopeSha256,
    targetTableCounts,
    records,
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let body = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { body += chunk; });
  process.stdin.on("end", () => {
    try {
      process.stdout.write(`${JSON.stringify(materializeProductionT0TargetInventory(JSON.parse(body)))}\n`);
    } catch (error) {
      process.stderr.write(`${error?.code ?? "PRODUCTION_IMPORT_TARGET_INVENTORY_FAILED"}\n`);
      process.exitCode = 1;
    }
  });
}
