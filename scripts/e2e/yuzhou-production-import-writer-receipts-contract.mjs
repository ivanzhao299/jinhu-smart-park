#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const sql=readFileSync(resolve(root,"database/migrations/000282_hr_yuzhou_production_import_writer_receipts.sql"),"utf8");

assert.match(sql,/execution_context varchar\(32\) NOT NULL DEFAULT 'lab_rehearsal'/u);
assert.match(sql,/execution_context='lab_rehearsal'[\s\S]*target_database ~ '\^jinhu_hr_migration_lab_/u);
assert.match(sql,/execution_context='production_import'[\s\S]*production_import_operation_id IS NOT NULL[\s\S]*production_import_phase IN \('T0','T1','T2','T3'\)/u);
assert.match(sql,/FOREIGN KEY\(production_import_operation_id,production_import_phase\)[\s\S]*hr_yuzhou_production_import_phase/u);
assert.match(sql,/current_setting\('transaction_isolation'\)<>'serializable'/u);
assert.match(sql,/NEW\.target_database<>current_database\(\)/u);
assert.match(sql,/execution_contract_version<>2 OR v_operation\.status<>'running'/u);
assert.match(sql,/NEW\.source_snapshot_sha256<>v_operation\.source_snapshot_sha256/u);
assert.match(sql,/NEW\.run_id<>NEW\.production_import_operation_id\|\|'-'\|\|lower\(NEW\.production_import_phase\)/u);
assert.match(sql,/NEW\.tool_version<>'prod-import-v2@'\|\|v_operation\.code_sha/u);
assert.match(sql,/HR_PRODUCTION_IMPORT_PHASE_ORDER_INVALID/u);

for(const column of ["source_system","source_table","source_pk_canonical","business_identity_sha256","expected_target_version_before","target_version_after"]){
  assert.match(sql,new RegExp(`ADD COLUMN ${column}\\b`,'u'));
}
assert.match(sql,/CREATE TABLE hr_yuzhou_production_import_projection_receipt/u);
assert.match(sql,/UNIQUE\(legacy_record_map_id\)/u);
assert.match(sql,/v_map\.source_pk_canonical<>v_record\.source_pk_canonical/u);
assert.match(sql,/source_pk_canonical='sha256:'\|\|source_identity_sha256/u);
assert.match(sql,/v_map\.target_id IS DISTINCT FROM v_record\.target_id/u);
assert.match(sql,/HR_PRODUCTION_IMPORT_CAS_VERSION_RECEIPT_INVALID/u);
assert.match(sql,/HR_PRODUCTION_IMPORT_BUSINESS_IDENTITY_RECEIPT_INVALID/u);
assert.match(sql,/HR_PRODUCTION_IMPORT_QUARANTINE_PROJECTION_INVALID/u);
assert.match(sql,/HR_PRODUCTION_IMPORT_PROJECTION_ROLLBACK_MISMATCH/u);
assert.match(sql,/CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_record_exact[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
assert.match(sql,/CREATE CONSTRAINT TRIGGER trg_hr_yuzhou_prod_projection_map_exact[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
assert.match(sql,/registry\.mapping_status IN \('mapped','resolved'\)[\s\S]*HR_LEGACY_T0_OWNER_MAP_REFERENCED/u);
assert.match(sql,/REVOKE ALL ON hr_yuzhou_production_import_projection_receipt FROM PUBLIC/u);
assert.doesNotMatch(sql,/ALTER TABLE hr_yuzhou_production_import_operation[\s\S]*execution_contract_version smallint NOT NULL DEFAULT 1/u);

console.log("Production import writer receipt contract passed: explicit context, immutable source/CAS, bidirectional projection, reverse T0 owner protection");
