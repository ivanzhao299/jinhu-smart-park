/* global Response, structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { YuzhouLiveRoleUatP0MatrixError, validateYuzhouLiveRoleUatP0Matrix } from "../hr-cutover/yuzhou-live-role-uat-p0-matrix-lib.mjs";
import { YuzhouLiveRoleUatP0Runner } from "../hr-cutover/yuzhou-live-role-uat-p0-runner.mjs";

const root=resolve(import.meta.dirname,"../..");
const matrix=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"),"utf8"));
const tokens={hr_reviewer:"reviewer-isolated-token",manager:"manager-isolated-token",employee:"employee-isolated-token"};

test("P0 final matrix freezes approval, profile, contract, insurance, payroll and file-stream gates",()=>{
  const result=validateYuzhouLiveRoleUatP0Matrix(matrix);
  assert.equal(result.status,"PASS");assert.equal(result.checkCount,25);assert.match(result.sha256,/^[0-9a-f]{64}$/u);assert.equal(result.productionImport,"HOLD");
  assert.deepEqual([...new Set(matrix.checks.map(x=>x.actor))],["hr_reviewer","manager","employee"]);
  assert.deepEqual(matrix.viewports,[{id:"desktop",width:1440,height:1000},{id:"phone_390",width:390,height:844}]);
});

test("P0 matrix order, boundary, binary routes and negative proof fail closed",()=>{
  const cases=[
    draft=>{draft.checks.reverse();},draft=>{draft.productionImport="GO";},draft=>{draft.viewports[1].width=391;},
    draft=>{draft.checks.at(-1).route="/hr/contracts";},draft=>{draft.checks[2].assertions=["state_unchanged","audit_checked"];},
    draft=>{draft.checks[8].assertions[0]="salary_fields_missing";}
  ];
  for(const mutate of cases){const draft=structuredClone(matrix);mutate(draft);assert.throws(()=>validateYuzhouLiveRoleUatP0Matrix(draft),error=>error instanceof YuzhouLiveRoleUatP0MatrixError);}
});

test("binary failure probes prove zero sensitive headers and zero bytes before producing hash-only evidence",async()=>{
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(null,{status:503})});
  const result=await runner.execute({id:"contract_document_audit_failure",substitutions:{auditFailureFileId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},assert:observed=>({
    no_sensitive_headers:Object.keys(observed.sensitiveHeaders).length===0,
    zero_bytes:observed.byteLength===0,
    storage_not_opened:true
  })});
  assert.equal(result.statusCode,503);assert.deepEqual(result.assertions,{no_sensitive_headers:true,zero_bytes:true,storage_not_opened:true});assert.match(result.responseSha256,/^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(result),/Bearer|aaaaaaaa/u);
});

test("binary failure probes reject a leaked header or byte and unsafe non-loopback execution",async()=>{
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://localhost/api/v1",tokens,matrix,request:async()=>new Response(new Uint8Array([1]),{status:500,headers:{"content-disposition":"attachment; filename=secret.pdf"}})});
  await assert.rejects(runner.execute({id:"contract_document_storage_failure",substitutions:{storageFailureFileId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},assert:()=>({no_sensitive_headers:true,zero_bytes:true,audit_precedes_storage:true})}),error=>error.code==="YUZHOU_UAT_P0_BINARY_FAILURE_LEAK");
  assert.throws(()=>new YuzhouLiveRoleUatP0Runner({apiBase:"https://park.cnjinhu.com/api/v1",tokens,matrix}),/YUZHOU_UAT_P0_BASE_UNSAFE/u);
});

test("JSON negative probes cannot self-attest through target or sensitive-field leakage",async()=>{
  const target="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const targetLeak=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify({statusCode:404,target}),{status:404,headers:{"content-type":"application/json"}})});
  await assert.rejects(targetLeak.execute({id:"approval_cross_tree_review_hidden",substitutions:{outsideApprovalId:target},body:{action:"approve"},assert:()=>({no_target_disclosure:true,no_state_change:true})}),error=>error.code==="YUZHOU_UAT_P0_JSON_FAILURE_TARGET_DISCLOSURE");
  const sensitiveLeak=new YuzhouLiveRoleUatP0Runner({apiBase:"http://localhost/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify({statusCode:403,baseSalary:"9000.00"}),{status:403,headers:{"content-type":"application/json"}})});
  await assert.rejects(sensitiveLeak.execute({id:"payroll_detail_manager_denied",substitutions:{payrollRunId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},assert:()=>({no_detail_disclosed:true,no_success_audit:true})}),error=>error.code==="YUZHOU_UAT_P0_JSON_FAILURE_SENSITIVE_LEAK");
});

test("hash-only evidence binds the actual response bytes, not only its JSON type",async()=>{
  const run=async payload=>new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}})}).execute({id:"approval_park_pending",assert:()=>({park_rows_scoped:true,required_audit_written:true})});
  const first=await run([{id:"one"}]),second=await run([{id:"two"}]);
  assert.notEqual(first.responseSha256,second.responseSha256);assert.equal(first.responseByteLength,14);
  assert.doesNotMatch(JSON.stringify(first),/\[\{|id.*one/u);
});

test("P0 routes remain bound to exact runtime permission and required-audit implementations",()=>{
  const controller=readFileSync(resolve(root,"apps/api/src/modules/hr/hr.controller.ts"),"utf8");
  const reminders=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-contract-reminder.controller.ts"),"utf8");
  const files=readFileSync(resolve(root,"apps/api/src/modules/files/files.controller.ts"),"utf8");
  const service=readFileSync(resolve(root,"apps/api/src/modules/hr/hr.service.ts"),"utf8");
  for(const atom of ["HR_APPROVAL_PARK_REVIEW","HR_APPROVAL_TEAM_REVIEW","HR_EMPLOYEE_PROFILE_TEAM_READ","HR_EMPLOYEE_PROFILE_SELF_READ","HR_INSURANCE_AMOUNT_READ","HR_PAYROLL_DETAIL_READ"])assert.match(`${controller}${service}`,new RegExp(atom));
  for(const atom of ["HR_CONTRACT_REMINDER_PARK_READ","HR_CONTRACT_REMINDER_TEAM_READ","HR_CONTRACT_REMINDER_SELF_READ","HR_CONTRACT_REMINDER_ACK","HR_CONTRACT_REMINDER_RUN"])assert.match(reminders,new RegExp(atom));
  assert.match(files,/prepareAuditedDownload[\s\S]*openReadStream[\s\S]*setHeader/u);
  assert.match(service,/recordHrSensitiveRead/u);
});
