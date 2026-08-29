#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"../..");
const read=name=>readFileSync(resolve(root,name),"utf8");
const migration=read("database/migrations/000256_hr_legacy_t5_history.sql");
const residueMigration=read("database/migrations/000267_hr_legacy_core_residue_domains.sql");
const extract=read("scripts/extract-yuzhou-t5-legacy-history.sh");
const transform=read("scripts/transform-yuzhou-t5-legacy-history.mjs");
const load=read("scripts/load-yuzhou-t5-legacy-history.sh");
const stageItems=read("scripts/hr-cutover/t5-stage-domain-items.mjs");
const rollback=read("scripts/rollback-yuzhou-t5-legacy-history.sh");
const evidence=JSON.parse(read(".trellis/tasks/08-25-hr-t5-employee-lifecycle-operations/research/phase5-source-evidence.json"));

// core residue coverage is part of T5: mapped fields remain authoritative while
// unmapped non-secret fields stay recoverable in the immutable legacy archive.

assert.equal(evidence.source.readOnly,true);
assert.equal(evidence.source.loginIsSa,false);
assert.equal(evidence.accounting.totalRows,20163);
assert.equal(evidence.determinism.extractA.businessSha256,evidence.determinism.extractB.businessSha256);
assert.equal(evidence.determinism.extractA.businessSha256,"8f8526014901d90756e98adc4ccb26f56a970689963fd0b809df77c49f037dce");
assert.equal(evidence.keyedFullDomainDeterminism.businessSha256,"5939691dfdddd5912992328dba58505f92bcfb7bb7de07ada571959a52d37005");
assert.deepEqual(evidence.compatibilityCoverage,{reviewedTables:12,reviewedFields:260,directMappedFields:38,rawArchivedFields:220,securityExcludedFields:2,uncoveredFields:0,payloadSanitization:"nul_to_literal_escape_v1"});
assert.deepEqual(evidence.isolatedDatabaseProof,{sourceRows:20163,loadedRows:19700,quarantinedRows:463,checksPassed:5,rollbackActiveMaps:0,rollbackRecordResidual:0,rollbackFileResidual:0});
assert.deepEqual(evidence.profile.emptyTables,["accept","bonusrecord","course","jobtrain","train"]);
assert.deepEqual(evidence.profile.absentObjects,["jch_1"]);

assert.match(extract,/source database is not read-only/);
assert.match(extract,/sa is forbidden for extraction/);
assert.match(extract,/credential file must be mode 0600/);
assert.match(extract,/umask 077/);
assert.match(extract,/sysadmin login is forbidden/);
for(const table of ["accept","family","his","knowhow","ticket","person","docs","course","train","trainhis","jobtrain","bonuscode","bonusrecord"]){
  assert.match(extract,new RegExp(`FROM dbo\\.${table} ORDER BY`));
}
for(const table of ["person_user","person_user_item","readjust","readjustitem","jobstatecode","compact","compact_c","compacttypecode"]){assert.match(extract,new RegExp(`FROM dbo\\.${table} ORDER BY`));}
assert.doesNotMatch(extract,/SELECT \*/);
assert.match(extract,/c\.name NOT IN\('password','photo'\)/);
assert.doesNotMatch(extract,/printf[^\n]*(?:idcard|handtel|ticketno|cause|fName)/i);
assert.match(transform,/replaceAll\("\\\\","\\\\\\\\"\)/);
assert.match(transform,/productionImport:"HOLD"/);
assert.match(transform,/payloadSanitization:"nul_to_literal_escape_v1"/);
assert.match(transform,/replaceAll\("\\0","\\\\u0000"\)/);
assert.match(transform,/Object\.hasOwn\(row,"password"\)\|\|Object\.hasOwn\(row,"photo"\)/);
for(const projection of ["person.core_residue","readjust.core_residue","compact.core_residue"]){assert.match(transform,new RegExp(projection.replace(".","\\.")));assert.match(stageItems,new RegExp(projection.replace(".","\\.")));}
assert.match(transform,/jch_1:0/);

for(const domain of ["employee_profile_raw","employment_change_raw","contract_raw"]){assert.match(residueMigration,new RegExp(domain));}
assert.match(residueMigration,/DROP CONSTRAINT ck_hr_legacy_t5_record_domain/);

for(const table of ["hr_legacy_t5_import_batch","hr_legacy_t5_record","hr_legacy_t5_file_evidence"]){assert.match(migration,new RegExp(`CREATE TABLE ${table}`));}
assert.match(migration,/source_row_count=loaded_row_count\+quarantined_row_count/);
assert.match(migration,/ix_hr_legacy_t5_record_batch[^\n]+tenant_id,park_id,import_batch_id/);
assert.match(migration,/ix_hr_legacy_t5_file_batch[^\n]+tenant_id,park_id,import_batch_id/);
assert.match(migration,/current_setting\('yuzhou\.t5_rollback',true\)/);
assert.match(migration,/legacy_record_map[\s\S]*map\.target_id=OLD\.id[\s\S]*map\.is_active/);
assert.match(migration,/BEFORE INSERT OR UPDATE OR DELETE ON hr_legacy_t5_record/);
assert.match(migration,/mb\.status='succeeded'/);
assert.match(migration,/migration_rollback_point/);
assert.match(migration,/map\.source_row_sha256=OLD\.source_row_sha256/);
assert.match(migration,/staged legacy T5 batch counts are immutable/);
assert.doesNotMatch(migration,/legacy_path\s+varchar|storage_path|download_url/);

assert.match(load,/production import gate is not HOLD/);
assert.match(load,/payload sanitization contract mismatch/);
assert.match(load,/20163/);
assert.match(load,/YUZHOU_T5_BUSINESS_SHA256/);
assert.match(load,/calculatedBusinessHash/);
assert.match(load,/calculatedCatalogHash/);
assert.match(load,/t5-stage-domain-items\.mjs/);
assert.match(load,/jsonb_to_recordset\(:'items'::jsonb\)/);
assert.match(load,/catalog staging mode must be 0600/);
assert.match(load,/staging directory must be mode 0700/);
assert.match(load,/manifest must be mode 0600/);
assert.match(load,/LOCK TABLE hr_employee,sys_user,hr_employee_compensation/);
assert.match(load,/T5_SOURCE_ACCOUNTING/);
assert.match(load,/T5 record-map conservation failed/);
assert.match(load,/T5 per-source conservation failed/);
assert.match(load,/T5_ONLINE_STATE_UNCHANGED/);
assert.match(load,/hr_employee x\) employee_hash/);
assert.match(load,/hr_employee_compensation x\) compensation_hash/);
assert.match(load,/hr_payroll_run x\) payroll_run_hash/);
assert.match(load,/hr_performance_plan x\) performance_plan_hash/);
assert.match(load,/biz_user_message x\) message_hash/);
assert.doesNotMatch(load,/INSERT INTO (?:hr_employee|sys_user|hr_payroll_run|hr_payslip|hr_performance_|biz_user_message)\b/);
assert.match(load,/HISTORY_OWNER_UNRESOLVED/);
assert.match(load,/EMPLOYEE_NOT_MAPPED/);
assert.match(load,/EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS/);
assert.match(load,/EMPLOYEE_PROFILE_IDENTITY_CONFLICT/);

assert.match(rollback,/ALLOW_YUZHOU_ROLLBACK/);
assert.match(rollback,/unexpected active rollback target table/);
assert.match(rollback,/record rollback proof mismatch/);
assert.match(rollback,/file rollback proof mismatch/);
assert.match(rollback,/target_table='hr_legacy_t5_file_evidence'AND m\.target_id=x\.id AND m\.is_active/);
assert.match(rollback,/target_table='hr_legacy_t5_record'AND m\.target_id=x\.id AND m\.is_active/);
assert.doesNotMatch(rollback,/DELETE FROM (?:hr_employee|sys_user|hr_payroll_run|hr_payslip|hr_performance_|biz_user_message)\b/);
console.log("Yuzhou T5 legacy history contract passed.");
