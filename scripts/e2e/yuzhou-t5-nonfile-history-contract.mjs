#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"../..");
const load=readFileSync(resolve(root,"scripts/load-yuzhou-t5-nonfile-history.sh"),"utf8");
const rollback=readFileSync(resolve(root,"scripts/rollback-yuzhou-t5-nonfile-history.sh"),"utf8");
const provisionActor=readFileSync(resolve(root,"scripts/provision-yuzhou-t5-nonfile-actor.sh"),"utf8");
const rollbackActor=readFileSync(resolve(root,"scripts/rollback-yuzhou-t5-nonfile-actor.sh"),"utf8");

for(const value of ["t5-nonfile-stage-domain-items.mjs","7752","dbo.person.core_residue","dbo.family","dbo.knowhow","dbo.ticket","T5_NONFILE_FILES_EXCLUDED","T5_NONFILE_NO_FILE_EVIDENCE","T5_NONFILE_ONLINE_STATE_UNCHANGED","sourceCatalogSha256","nonfile_employee_profile_family_skill_credential_only","filesExcluded", "jinhu_hr_migration_lab_core_"])assert.match(load,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.match(load,/LOCK TABLE hr_employee,sys_user,hr_employee_compensation/);
assert.match(load,/T5 nonfile record-map conservation failed/);
assert.match(load,/T5 nonfile per-source conservation failed/);
assert.match(load,/INSERT INTO hr_legacy_t5_record/);
assert.match(load,/INSERT INTO hr_employee_profile/);
assert.match(load,/INSERT INTO hr_employee_family/);
assert.match(load,/INSERT INTO hr_employee_skill/);
assert.match(load,/INSERT INTO hr_employee_credential/);
assert.doesNotMatch(load,/INSERT INTO hr_legacy_t5_file_evidence/);
assert.doesNotMatch(load,/dbo\.person\.photo|dbo\.docs/);
assert.match(rollback,/ALLOW_YUZHOU_ROLLBACK/);
assert.match(rollback,/archive materialization must roll back first/);
assert.match(rollback,/nonfile batch has prohibited file evidence/);
assert.match(rollback,/DELETE FROM hr_legacy_t5_record/);
assert.doesNotMatch(rollback,/hr_legacy_t5_file_evidence\s+x USING/);
assert.match(provisionActor,/nonfile migration run already exists/);
assert.match(provisionActor,/isolated nonfile migration actor/);
assert.match(provisionActor,/jinhu_hr_migration_lab_core_/);
assert.match(rollbackActor,/nonfile migration rollback must finish first/);
assert.match(rollbackActor,/nonfile materialization actor still referenced/);
console.log("Yuzhou T5 nonfile history contract passed.");
