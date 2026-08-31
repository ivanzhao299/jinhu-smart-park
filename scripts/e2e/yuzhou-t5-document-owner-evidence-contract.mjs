#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"../.."); const read=name=>readFileSync(resolve(root,name),"utf8");
const load=read("scripts/load-yuzhou-t5-document-owner-evidence.sh"),rollback=read("scripts/rollback-yuzhou-t5-document-owner-evidence.sh"),stage=read("scripts/prepare-yuzhou-document-owner-stage.mjs");
for(const value of ["isolated_rehearsal","^jinhu_hr_migration_lab_","YUZHOU_T0_RUN_ID","compatible succeeded T0 batch required","document-owner-evidence.jsonl","DOCUMENT_OWNER_UNMAPPED","T5_DOCUMENT_SOURCE_ACCOUNTING","T5_DOCUMENT_NO_BINARY_OR_LINK_WRITE","T5_LEGACY_HISTORY","hr_legacy_t5_file_evidence","source_identity_sha256="]){assert.match(load,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));}
assert.doesNotMatch(load,/INSERT INTO (?:sys_file|hr_employee_document|hr_employee|hr_payroll_run|hr_payslip|biz_user_message)\b/);
assert.doesNotMatch(load,/fName|FPath|downloadUrl/);
assert.match(stage,/DOCUMENT_OWNER_RESOLVED_ROWS = 989/); assert.match(stage,/DOCUMENT_OWNER_UNMATCHED_ROWS = 14/); assert.match(rollback,/rollback-yuzhou-t5-photo-owner-evidence\.sh/);
console.log("Yuzhou T5_FILE document-owner evidence contract passed.");
