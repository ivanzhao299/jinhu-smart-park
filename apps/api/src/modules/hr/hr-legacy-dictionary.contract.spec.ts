import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {BadRequestException,ConflictException} from "@nestjs/common";
import {validateLegacyDictionaryItems} from "./hr-legacy-dictionary.service";

const root=resolve(__dirname,"../../../../.."),read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const sha=(digit:string)=>digit.repeat(64);

test("dictionary controller separates read manage and approve and protects every write",()=>{
  const source=read("apps/api/src/modules/hr/hr-legacy-dictionary.controller.ts");
  assert.match(source,/@Get\(\)[\s\S]*HR_LEGACY_DICTIONARY_READ/);
  assert.match(source,/@Get\(":id\/items"\)[\s\S]*HR_LEGACY_DICTIONARY_READ/);
  assert.match(source,/@Post\("drafts"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_LEGACY_DICTIONARY_MANAGE[\s\S]*captureBody:false/);
  assert.match(source,/@Put\(":id\/items\/:itemId"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_LEGACY_DICTIONARY_MANAGE[\s\S]*captureBody:false/);
  assert.match(source,/@Post\(":id\/approve"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_LEGACY_DICTIONARY_APPROVE[\s\S]*captureBody:false/);
});

test("dictionary materialization rejects missing duplicate and guessed mappings",()=>{
  const valid={sourceCode:"S1",sourceIdentitySha256:sha("a"),sourceRowSha256:sha("b"),decision:"map",targetDomain:"employment_status",targetValue:"active",reasonCode:"APPROVED_MAPPING"};
  assert.doesNotThrow(()=>validateLegacyDictionaryItems("employee_job_state",[valid],1));
  assert.throws(()=>validateLegacyDictionaryItems("employee_job_state",[valid],2),BadRequestException);
  assert.throws(()=>validateLegacyDictionaryItems("employee_job_state",[valid,{...valid,sourceIdentitySha256:sha("c")}],2),ConflictException);
  assert.throws(()=>validateLegacyDictionaryItems("employee_job_state",[{...valid,targetValue:"departed_by_default"}],1),BadRequestException);
  assert.throws(()=>validateLegacyDictionaryItems("contract_state",[{...valid,targetDomain:"contract_status",targetValue:"needs_review"}],1),BadRequestException);
  assert.throws(()=>validateLegacyDictionaryItems("employment_event_type",[{...valid,targetDomain:"employment_event_type",targetValue:"hire"}],1),BadRequestException);
});

test("migration makes approved evidence append-only scoped and fail-closed",()=>{
  const sql=read("database/migrations/000275_hr_legacy_dictionary_decision.sql");
  for(const signature of [
    "uq_hr_legacy_dictionary_approved","fk_hr_legacy_dictionary_item_version",
    "HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE","HR_LEGACY_DICTIONARY_ITEM_IMMUTABLE",
    "HR_LEGACY_DICTIONARY_UNRESOLVED","hr_resolve_legacy_dictionary",
  ])assert.match(sql,new RegExp(signature));
  assert.match(sql,/FOREIGN KEY \(tenant_id,park_id,version_id\)/);
  assert.match(sql,/matched_count <> 1/);
  assert.match(sql,/hr_legacy_dictionary_items_sha256/);
  assert.match(sql,/HR_LEGACY_DICTIONARY_ITEMS_SHA_MISMATCH/);
  assert.match(sql,/trg_hr_legacy_dictionary_item_touch_version/);
  assert.doesNotMatch(sql,/INSERT INTO hr_employee|INSERT INTO hr_contract|INSERT INTO hr_employment_event/);
});

test("production seed grants dictionary governance only to the HR manager",()=>{
  const seed=read("database/seeds/production/000030_hr_legacy_dictionary_rbac.sql");
  for(const code of ["read","manage","approve"])assert.match(seed,new RegExp(`hr:legacy_dictionary:${code}`));
  assert.match(seed,/role\.code='HR_MANAGER'/);
  assert.match(seed,/role\.code IN \('DEPARTMENT_MANAGER','EMPLOYEE_SELF_SERVICE'\)/);
  assert.match(seed,/permission leaked to team or self role/);
});
