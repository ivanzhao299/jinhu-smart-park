import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {resolve} from "node:path";

const root=resolve(__dirname,"../../../../.."),read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("probation API separates assignment review and employment confirmation",()=>{
 const controller=read("apps/api/src/modules/hr/hr-probation.controller.ts");
 assert.match(controller,/HR_LIFECYCLE_READ/);
 assert.match(controller,/HR_LIFECYCLE_ASSIGN/);
 assert.match(controller,/HR_LIFECYCLE_REVIEW/);
 assert.match(controller,/HR_EMPLOYMENT_TRANSITION/);
 assert.equal((controller.match(/@UseInterceptors\(new IdempotencyInterceptor\(\)\)/g)??[]).length,5);
 assert.doesNotMatch(controller,/captureBody:true/);
});

test("probation confirmation is one locked batch with immutable events and no payroll effects",()=>{
 const service=read("apps/api/src/modules/hr/hr-probation.service.ts");
 assert.match(service,/FOR UPDATE/);
 assert.match(service,/employment_status='active'/);
 assert.match(service,/event_type,effective_date/);
 assert.match(service,/"confirmed","approved","confirmed"/);
 assert.match(service,/\$1::varchar[\s\S]*tenant_id=\$1::varchar/);
 assert.doesNotMatch(service,/hr_payroll|hr_performance|payslip|salary/);
});

test("probation schema freezes submitted facts participants and append-only actions",()=>{
 const migration=read("database/migrations/000271_hr_probation_confirmation_parity.sql");
 assert.match(migration,/participant_snapshot jsonb/);
 assert.match(migration,/HR_PROBATION_SUBMITTED_FACTS_IMMUTABLE/);
 assert.match(migration,/HR_PROBATION_PARTICIPANT_FROZEN/);
 assert.match(migration,/HR probation evidence is append-only/);
 assert.match(migration,/uq_hr_probation_employee_active/);
});

test("legacy probation evidence is content addressed and contains no source values",()=>{
 const evidence=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-probation-confirmation-source-evidence-v1.json"));
 assert.equal(evidence.legacyId,36);assert.equal(evidence.legacyFieldEvidenceHash,"0d2dc3193b08211f178816baf77f64f6a5bf01c5fae96a476c35e8d87736b26a");
 assert.equal(evidence.personalValuesRecorded,false);assert.equal(evidence.credentialsRecorded,false);assert.equal(evidence.targetControls.productionImport,"HOLD");
 assert.ok(evidence.sourceFiles.every((row:{path:string;sha256:string})=>!row.path.startsWith("/")&&/^[a-f0-9]{64}$/.test(row.sha256)));
});
