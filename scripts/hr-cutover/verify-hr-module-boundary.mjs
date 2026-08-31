/* global process */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/hr-module-boundary-v1.json");
const stable = value => `${JSON.stringify(value, null, 2)}\n`;

export class HrModuleBoundaryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const fail = code => { throw new HrModuleBoundaryError(code); };
const exact = (actual, expected, code) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
};
const migration = filename => readFileSync(resolve(ROOT, "database/migrations", filename), "utf8");
const mustContain = (source, fragment, code) => {
  if (!source.includes(fragment)) fail(code);
};

export function verifyHrModuleBoundary(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) fail("HR_MODULE_BOUNDARY_INVALID");
  exact(Object.keys(contract).sort(), ["contractKind", "executionStatus", "formatVersion", "ownedDataBoundary", "platformDependencies", "portabilityRules", "productionImport", "sharedMigrationLedger", "storageModel"], "HR_MODULE_BOUNDARY_SHAPE_INVALID");
  if (contract.formatVersion !== 1 || contract.contractKind !== "jinhu_hr_module_portability_boundary" || contract.executionStatus !== "SPEC_FROZEN") fail("HR_MODULE_BOUNDARY_METADATA_INVALID");
  exact(contract.storageModel, {
    physical: "shared_postgresql_database",
    logical: "hr_table_namespace",
    managedTablePrefix: "hr_",
    supportsIndependentExport: true
  }, "HR_MODULE_BOUNDARY_STORAGE_MODEL_INVALID");
  exact(contract.ownedDataBoundary, {
    tableSelection: "all_tables_with_hr_prefix",
    scopeColumns: ["tenant_id", "park_id"],
    excludesPlatformIdentityAndRbac: true,
    excludesPhysicalFilePayload: true
  }, "HR_MODULE_BOUNDARY_OWNED_DATA_INVALID");
  exact(contract.sharedMigrationLedger, {
    tables: ["legacy_source_object", "legacy_record_map", "migration_batch", "migration_batch_item", "migration_error", "migration_check", "migration_rollback_point"],
    sourceSystem: "yuzhou-v10",
    selection: "source_system_and_batch_owned_only",
    requiresExactBatchBinding: true
  }, "HR_MODULE_BOUNDARY_SHARED_LEDGER_INVALID");
  exact(contract.platformDependencies, ["tenant_park_scope_reference", "organization_reference", "login_identity_reference", "rbac_and_audit_integration", "unified_file_reference"], "HR_MODULE_BOUNDARY_PLATFORM_DEPENDENCIES_INVALID");
  exact(contract.portabilityRules, {
    copyPlatformTables: false,
    rehydratePlatformReferencesInTargetScope: true,
    preserveSourceIdentityAndRowHash: true,
    rollbackUsesActiveRecordMapsOnly: true,
    attachmentPayloadsRequireSeparateT5FileSlice: true
  }, "HR_MODULE_BOUNDARY_PORTABILITY_RULES_INVALID");
  if (contract.productionImport !== "HOLD") fail("HR_MODULE_BOUNDARY_PRODUCTION_IMPORT_REACHABLE");

  const foundation = migration("000230_hr_employee_foundation.sql");
  for (const table of ["hr_position", "hr_employee", "hr_employee_profile", "hr_employment_event", "hr_employee_document"]) {
    mustContain(foundation, `CREATE TABLE IF NOT EXISTS ${table}`, "HR_MODULE_BOUNDARY_FOUNDATION_DDL_DRIFT");
  }
  const control = migration("000235_hr_legacy_migration_control.sql");
  for (const table of contract.sharedMigrationLedger.tables) {
    mustContain(control, `CREATE TABLE IF NOT EXISTS ${table}`, "HR_MODULE_BOUNDARY_SHARED_LEDGER_DDL_DRIFT");
  }
  const importControl = migration("000278_hr_yuzhou_production_import_control.sql");
  mustContain(importControl, "CREATE TABLE hr_yuzhou_production_import_operation", "HR_MODULE_BOUNDARY_IMPORT_CONTROL_DDL_DRIFT");
  const receipts = migration("000282_hr_yuzhou_production_import_writer_receipts.sql");
  mustContain(receipts, "CREATE TABLE hr_yuzhou_production_import_projection_receipt", "HR_MODULE_BOUNDARY_RECEIPT_DDL_DRIFT");

  return {
    ok: true,
    storageModel: contract.storageModel.logical,
    sharedLedgerSelection: contract.sharedMigrationLedger.selection,
    productionImport: "HOLD",
    sha256: createHash("sha256").update(stable(contract)).digest("hex")
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] ?? DEFAULT_CONTRACT);
  const result = verifyHrModuleBoundary(JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
