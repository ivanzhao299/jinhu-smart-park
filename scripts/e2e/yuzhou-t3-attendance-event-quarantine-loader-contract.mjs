import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/load-yuzhou-t3-attendance-event-quarantine.sh"),"utf8");

test("T3 attendance punch quarantine loader is lab-only, audit-only, and conservation-bound",()=>{
  for(const value of ["ALLOW_YUZHOU_MIGRATION","controlled attendance staging directory required","^jinhu_hr_migration_lab_","^jinhu_hr_migration_lab_core_","wrong PostgreSQL compose project","current attendance source binding is required","sourceSnapshotSha256!==snapshot","sourceRestoreReceiptSha256!==receipt","sourceCatalogSha256!==catalog","sourceBusinessSha256!==business","mappingContractSha256!==mapping","migration_batch","migration_batch_item","migration_error","migration_check","migration_rollback_point","T3_ATTENDANCE_PUNCH_QUARANTINE_CONSERVATION","delete_migration_audit_only","businessWriteTarget','none'","productionImport','HOLD'"])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const forbidden of ["INSERT INTO hr_","UPDATE hr_","DELETE FROM hr_","hr_attendance_punch_event","legacy_record_map","UPDATE hr_employee","biz_user_message","hr_payroll_run","hr_payslip"])assert.doesNotMatch(script,new RegExp(forbidden));
  assert.match(script,/current_database\(\)<>current_setting\('yuzhou\.attendance_quarantine_db'\)/);
  assert.match(script,/duplicate migration run/);
});
