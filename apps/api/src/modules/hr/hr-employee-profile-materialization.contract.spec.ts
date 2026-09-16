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
  const projection=read("scripts/hr-cutover/t5-nonfile-field-projection.mjs");
  assert.match(transform,/import\s*\{[^}]*materializeT5NonfileRecord[^}]*\}\s*from\s*"\.\/hr-cutover\/t5-nonfile-field-projection\.mjs"/);
  assert.match(transform,/const materialize=\(name,row\)=>materializeT5NonfileRecord\(name,row,\{protect,customFieldDefinitions,professionalTitleDictionary\}\)/);
  assert.match(transform,/PARTY_DATA_ENCRYPTION_KEY/);
  assert.match(load,/source_pk_canonical='person='/);
  assert.match(load,/T5_EMPLOYEE_MATERIALIZATION_ACCOUNTING/);
  assert.match(load,/source_batch\.status='succeeded'/);
  for(const block of load.matchAll(/DO \$\$[\s\S]*?END\$\$;/g))assert.doesNotMatch(block[0],/:'(?:tenant|park|actor)'/);
  assert.match(projection,/UNKNOWN_FIELD_SEMANTICS/);
  assert.match(projection,/UNKNOWN_SKILL_GRADE/);
  for(const source of [transform,projection])assert.doesNotMatch(source,/proficiency:\s*text\(row\.grade\)/);
  assert.match(load,/YUZHOU_MATERIALIZATION_ACTOR_USER_ID/);
  assert.match(load,/c\.quarantine_code IS NULL/);
  for(const table of ["hr_employee_profile","hr_employee_family","hr_employee_skill","hr_employee_credential","hr_legacy_employee_materialization_gap"])assert.match(load,new RegExp(`INSERT INTO ${table}`));
  assert.doesNotMatch(load,/redacted_evidence[^\n]*payload->'source'/);
  for(const table of ["hr_employee_profile","hr_employee_family","hr_employee_skill","hr_employee_credential","hr_legacy_employee_materialization_gap"])assert.match(rollback,new RegExp(`DELETE FROM ${table}`));
  assert.match(rollback,/T5 employee materialization rollback residual/);
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
