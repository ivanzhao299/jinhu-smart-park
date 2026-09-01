import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/rollback-yuzhou-t3-attendance-event-quarantine.sh"),"utf8");
test("T3 attendance punch quarantine rollback is lab-only and removes audit records only",()=>{
  for(const value of ["ALLOW_YUZHOU_ROLLBACK","succeeded attendance quarantine batch not found","attendance quarantine rollback accounting drift","counts->>'sourceRows'","ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED","DELETE FROM migration_check","DELETE FROM migration_error","DELETE FROM migration_rollback_point","DELETE FROM migration_batch_item","DELETE FROM migration_batch","attendance quarantine wrote legacy mapping","auditResidual","productionImport','HOLD'"])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(source,/DELETE FROM hr_|UPDATE hr_|INSERT INTO hr_/);
  assert.match(source,/attendanceBusinessRows/);
});
