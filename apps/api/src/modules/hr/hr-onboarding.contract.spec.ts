import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root=path.resolve(__dirname,"../../../../..");
const read=(relative:string)=>fs.readFileSync(path.join(root,relative),"utf8");

test("onboarding API separates manage, review and confirmation permissions",()=>{
 const controller=read("apps/api/src/modules/hr/hr-onboarding.controller.ts");
 assert.match(controller,/@Controller\("hr\/onboarding-applications"\)/);
 assert.match(controller,/HR_ONBOARDING_READ/);
 assert.match(controller,/HR_ONBOARDING_MANAGE/);
 assert.match(controller,/HR_APPROVAL_PARK_REVIEW/);
 assert.match(controller,/HR_EMPLOYMENT_TRANSITION/);
 assert.equal((controller.match(/@UseInterceptors\(new IdempotencyInterceptor\(\)\)/g)??[]).length,5);
 assert.equal((controller.match(/captureBody:false/g)??[]).length,5);
});

test("onboarding confirmation is locked, atomic and cannot precede approval",()=>{
 const service=read("apps/api/src/modules/hr/hr-onboarding.service.ts");
 assert.match(service,/FOR UPDATE/);
 assert.match(service,/row\.status!=="approved"/);
 assert.match(service,/employment_status!=="preboarding"/);
 assert.match(service,/UPDATE hr_employee SET employment_status/);
 assert.match(service,/INSERT INTO hr_employment_event/);
 assert.match(service,/UPDATE hr_onboarding_application SET status='confirmed'/);
 assert.match(service,/Applicants cannot review their own onboarding application/);
 assert.match(service,/SELECT \$1::varchar,\$2::varchar,\$3::uuid,COALESCE\(MAX\(sequence_no\),0\)\+1/);
 assert.match(service,/WHERE tenant_id=\$1::varchar AND park_id=\$2::varchar AND application_id=\$3::uuid/);
});

test("database owns Yuzhou compatibility uniqueness and append-only evidence",()=>{
 const migration=read("database/migrations/000269_hr_onboarding_application_parity.sql");
 for(const token of ["uq_hr_employee_attendance_card_no","uq_hr_onboarding_active_employee","uq_hr_onboarding_active_card","ck_hr_onboarding_dates","ck_hr_onboarding_review","ck_hr_onboarding_confirm","trg_hr_onboarding_application_guard","HR_ONBOARDING_SUBMITTED_FIELDS_IMMUTABLE","trg_hr_onboarding_action_append_only"])assert.match(migration,new RegExp(token));
 assert.match(migration,/status IN \('draft','submitted','returned','approved','cancelled','confirmed'\)/);
});

test("legacy onboarding evidence is content-addressed and contains no source values",()=>{
 const evidence=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-onboarding-source-evidence-v1.json")) as {legacyId:number;sourceFiles:Array<{path:string;sha256:string}>;verifiedRules:string[];personalValuesRecorded:boolean;credentialsRecorded:boolean;productionImport:string};
 assert.equal(evidence.legacyId,34);assert.equal(evidence.sourceFiles.length,6);assert.ok(evidence.sourceFiles.every(item=>item.path.startsWith("employee/register/")&&/^[a-f0-9]{64}$/.test(item.sha256)));
 assert.ok(evidence.verifiedRules.includes("approval_must_finish_with_agree_before_confirm"));
 assert.equal(evidence.personalValuesRecorded,false);assert.equal(evidence.credentialsRecorded,false);assert.equal(evidence.productionImport,"HOLD");
});
