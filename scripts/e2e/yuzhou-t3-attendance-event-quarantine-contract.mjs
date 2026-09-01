import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/extract-yuzhou-t3-attendance-event-quarantine.sh"),"utf8");

test("T3 attendance punch staging exposes hashes only and quarantines every row before employee mapping",()=>{
  for(const value of ["ALLOW_YUZHOU_MIGRATION","YUZHOU_SQLSERVER_ETL_LOGIN","YUZHOU_SQLSERVER_ETL_PASSWORD","YUZHOU_SQLSERVER_DATABASE","YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID","YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT","YUZHOU_SOURCE_RESTORE_RECEIPT_PATH","YUZHOU_MAPPING_CONTRACT_SHA256","validateSourceRestoreReceipt","sourceRestoreReceiptSha256","sourceCatalogSha256","sourceBusinessSha256","mappingContractSha256","jinhu_yuzhou_migration_lab","sys.databases WHERE name=DB_NAME()","sourceReadOnly!==1","HASHBYTES('SHA2_256'","sourceIdentitySha256","sourceRowSha256","sourcePersonLinked","ATTENDANCE_PUNCH_PERSON_UNMAPPED","ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED","status:\"quarantined\"","eligibleRows:0","businessWriteTarget:\"none\"","productionImport:\"HOLD\""])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const forbidden of ["INSERT INTO","UPDATE ","DELETE FROM","hr_attendance_punch_event","person AS","cardno AS","recordtime AS","inorout AS"])assert.doesNotMatch(script,new RegExp(forbidden));
  assert.match(script,/YUZHOU_SQLSERVER_ETL_LOGIN" != "sa"/);
  assert.match(script,/chmod 700 "\$root"/);
  assert.match(script,/chmod 700 "\$stage"/);
  assert.match(script,/chmod 600 "\$raw"/);
  assert.match(script,/mode:0o600/);
  assert.match(script,/require YUZHOU_BACKUP_SHA256/);
  assert.match(script,/invalid YUZHOU_BACKUP_SHA256/);
  assert.match(script,/sourceSnapshotSha256/);
});
