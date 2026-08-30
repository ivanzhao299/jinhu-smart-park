#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"../.."); const read=name=>readFileSync(resolve(root,name),"utf8");
const load=read("scripts/load-yuzhou-t5-photo-owner-evidence.sh"),rollback=read("scripts/rollback-yuzhou-t5-photo-owner-evidence.sh"),stage=read("scripts/prepare-yuzhou-photo-owner-stage.mjs");
for(const value of ["isolated_rehearsal","^jinhu_hr_migration_lab_","YUZHOU_T0_RUN_ID","compatible succeeded T0 batch required","ownerSourceIdentitySha256","PHOTO_OWNER_UNMAPPED","PHOTO_OWNER_AMBIGUOUS","T5_FILE_SOURCE_ACCOUNTING","T5_FILE_NO_BINARY_OR_LINK_WRITE","T5_LEGACY_HISTORY","hr_legacy_t5_file_evidence","source_identity_sha256="])assert.match(load,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.doesNotMatch(load,/INSERT INTO (?:sys_file|hr_employee_document|hr_employee|hr_payroll_run|hr_payslip|biz_user_message)\b/);
assert.doesNotMatch(load,/sourceKey|employeeCode|photofile|legacyPath|downloadUrl/);
assert.match(stage,/ownerSourceIdentitySha256: digest\(`dbo\.person\\0\$\{employeeCode\}`\)/);
for(const value of ["ALLOW_YUZHOU_ROLLBACK","isolated_rehearsal","unexpected T5_FILE rollback target","DELETE FROM hr_legacy_t5_file_evidence","T5_FILE evidence rollback residual","mapping_status='rolled_back'"])assert.match(rollback,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.doesNotMatch(rollback,/DELETE FROM (?:sys_file|hr_employee_document|hr_employee|hr_payroll_run|hr_payslip|biz_user_message)\b/);
console.log("Yuzhou T5_FILE photo-owner evidence contract passed.");
