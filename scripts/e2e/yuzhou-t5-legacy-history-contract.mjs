#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"../..");
const read=name=>readFileSync(resolve(root,name),"utf8");
const migration=read("database/migrations/000256_hr_legacy_t5_history.sql");
const extract=read("scripts/extract-yuzhou-t5-legacy-history.sh");
const transform=read("scripts/transform-yuzhou-t5-legacy-history.mjs");
const load=read("scripts/load-yuzhou-t5-legacy-history.sh");
const rollback=read("scripts/rollback-yuzhou-t5-legacy-history.sh");
const evidence=JSON.parse(read(".trellis/tasks/08-25-hr-t5-employee-lifecycle-operations/research/phase5-source-evidence.json"));

assert.equal(evidence.source.readOnly,true);
assert.equal(evidence.source.loginIsSa,false);
assert.equal(evidence.accounting.totalRows,9140);
assert.equal(evidence.determinism.extractA.businessSha256,evidence.determinism.extractB.businessSha256);
assert.equal(evidence.determinism.extractA.businessSha256,"ab16152a6dbcb36219e9f3b1476be0ef3d925391ae6c41fc27b8609cbc4ee96c");
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
assert.doesNotMatch(extract,/SELECT \*/);
assert.doesNotMatch(extract,/printf[^\n]*(?:idcard|handtel|ticketno|cause|fName)/i);
assert.match(transform,/replaceAll\("\\\\","\\\\\\\\"\)/);
assert.match(transform,/productionImport:"HOLD"/);
assert.match(transform,/jch_1:0/);

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
assert.match(load,/YUZHOU_T5_BUSINESS_SHA256/);
assert.match(load,/calculatedBusinessHash/);
assert.match(load,/calculatedCatalogHash/);
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

assert.match(rollback,/ALLOW_YUZHOU_ROLLBACK/);
assert.match(rollback,/unexpected active rollback target table/);
assert.match(rollback,/record rollback proof mismatch/);
assert.match(rollback,/file rollback proof mismatch/);
assert.match(rollback,/target_table='hr_legacy_t5_file_evidence'AND m\.target_id=x\.id AND m\.is_active/);
assert.match(rollback,/target_table='hr_legacy_t5_record'AND m\.target_id=x\.id AND m\.is_active/);
assert.doesNotMatch(rollback,/DELETE FROM (?:hr_employee|sys_user|hr_payroll_run|hr_payslip|hr_performance_|biz_user_message)\b/);
console.log("Yuzhou T5 legacy history contract passed.");
