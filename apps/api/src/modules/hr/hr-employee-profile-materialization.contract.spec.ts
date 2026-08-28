import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../../.."),read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("000276 adds scoped replay-safe structured provenance without raw gap values",()=>{
  const sql=read("database/migrations/000276_hr_legacy_employee_profile_materialization.sql");
  for(const suffix of ["profile","family","skill","credential"])assert.match(sql,new RegExp(`uq_hr_employee_${suffix}_legacy_source`));
  assert.match(sql,/hr_legacy_employee_materialization_gap/);
  assert.match(sql,/UNKNOWN_SKILL_GRADE/);
  assert.doesNotMatch(sql,/raw_value|source_payload|record_payload/);
});

test("T5 materializes only employee-mapped reviewed domains and preserves unknowns as redacted gaps",()=>{
  const transform=read("scripts/transform-yuzhou-t5-legacy-history.mjs"),load=read("scripts/load-yuzhou-t5-legacy-history.sh"),rollback=read("scripts/rollback-yuzhou-t5-legacy-history.sh");
  assert.match(transform,/YUZHOU_PROFILE_MATERIALIZATION_KEY/);
  assert.match(transform,/UNKNOWN_FIELD_SEMANTICS/);
  assert.match(transform,/UNKNOWN_SKILL_GRADE/);
  assert.doesNotMatch(transform,/proficiency:\s*text\(row\.grade\)/);
  assert.match(load,/YUZHOU_MATERIALIZATION_ACTOR_USER_ID/);
  assert.match(load,/c\.quarantine_code IS NULL/);
  for(const table of ["hr_employee_profile","hr_employee_family","hr_employee_skill","hr_employee_credential","hr_legacy_employee_materialization_gap"])assert.match(load,new RegExp(`INSERT INTO ${table}`));
  assert.doesNotMatch(load,/redacted_evidence[^\n]*payload->'source'/);
  for(const table of ["hr_employee_profile","hr_employee_family","hr_employee_skill","hr_employee_credential","hr_legacy_employee_materialization_gap"])assert.match(rollback,new RegExp(`DELETE FROM ${table}`));
});

test("API decrypts PII only behind exact full permissions and audits gap reads",()=>{
  const controller=read("apps/api/src/modules/hr/hr-lifecycle.controller.ts"),service=read("apps/api/src/modules/hr/hr-lifecycle.service.ts");
  assert.match(controller,/@Get\("legacy-materialization\/gaps"\)[\s\S]*HR_EMPLOYEE_PROFILE_MANAGE/);
  assert.match(service,/hr\.legacy_employee_materialization_gap/);
  assert.match(service,/familyFull = this\.has\(a, HR_PERMISSIONS\.HR_EMPLOYEE_FAMILY_READ\)/);
  assert.match(service,/credentialFull = this\.has\(a, HR_PERMISSIONS\.HR_EMPLOYEE_CREDENTIAL_READ\)/);
  assert.match(service,/familyFull\?\{\.\.\.safe,fullName:this\.sensitive\.decrypt/);
  assert.match(service,/credentialFull\?\{\.\.\.safe,credentialNumber:this\.sensitive\.decrypt/);
});
