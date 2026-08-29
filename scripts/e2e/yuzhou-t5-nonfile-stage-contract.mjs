import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/prepare-yuzhou-t5-nonfile-materialization-stage.mjs"),"utf8");
test("T5 nonfile stage is bound to two matching extractions and excludes photo and docs",()=>{
  for(const value of ["person_core","input=argv[0]===\"--\"?argv.slice(1):argv","family","knowhow","ticket","source business hash mismatch","source catalog hash mismatch","source domain mismatch","sourceCatalogSha256","filesExcluded:[\"photo\",\"docs\"]","nonfileBusinessSha256","businessWriteTarget:\"nonfile_employee_profile_family_skill_credential_only\"","productionImport:\"HOLD\""])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(source,/photo\.jsonl|docs\.jsonl/);
});
