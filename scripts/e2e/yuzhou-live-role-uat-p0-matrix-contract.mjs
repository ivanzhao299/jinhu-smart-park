/* global Response, structuredClone */
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { YuzhouLiveRoleUatP0MatrixError, validateYuzhouLiveRoleUatP0Matrix } from "../hr-cutover/yuzhou-live-role-uat-p0-matrix-lib.mjs";
import { YuzhouLiveRoleUatP0Runner } from "../hr-cutover/yuzhou-live-role-uat-p0-runner.mjs";
import { runYuzhouLiveRoleUatP0Observations } from "../hr-cutover/yuzhou-live-role-uat-p0-observations.mjs";

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
    draft=>{draft.checks[8].assertions[0]="salary_fields_missing";},draft=>{draft.checks[0].actor="employee";}
  ];
  for(const mutate of cases){const draft=structuredClone(matrix);mutate(draft);assert.throws(()=>validateYuzhouLiveRoleUatP0Matrix(draft),error=>error instanceof YuzhouLiveRoleUatP0MatrixError);}
});

test("binary failure probes prove zero sensitive headers and zero bytes before producing hash-only evidence",async()=>{
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify({statusCode:503,message:"audit failed"}),{status:503,headers:{"content-type":"application/json"}})});
  const result=await runner.execute({id:"contract_document_audit_failure",substitutions:{auditFailureFileId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},assert:observed=>({
    no_sensitive_headers:Object.keys(observed.sensitiveHeaders).length===0,
    zero_bytes:observed.byteLength===0,
    storage_not_opened:true
  })});
  assert.equal(result.statusCode,503);assert.deepEqual(result.assertions,{no_sensitive_headers:true,zero_bytes:true,storage_not_opened:true});assert.match(result.responseSha256,/^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(result),/Bearer|aaaaaaaa/u);
});

test("the exact 25 runtime observations are hash-bound, private and remain HOLD on any real probe failure",async()=>{
  const dir=mkdtempSync(resolve(tmpdir(),"jinhu-p0-observations-")),evidencePath=resolve(dir,"p0.json");
  let requests=0;
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>{requests+=1;return new Response(JSON.stringify({statusCode:503,message:"isolated dependency unavailable"}),{status:503,headers:{"content-type":"application/json"}});}});
  const plans=matrix.checks.map(check=>({id:check.id,owner:"rehearsal-A",evidenceSources:["response","db_before_after"],substitutions:Object.fromEntries([...check.route.matchAll(/\{([^}]+)\}/gu)].map(match=>[match[1],"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])),...(check.method==="POST"?{body:{action:"approve"}}:{}),assert:observed=>Object.fromEntries(check.assertions.map(key=>[key,Number.isInteger(observed.status)]))}));
  const triple={codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)};
  const matrixSha256=validateYuzhouLiveRoleUatP0Matrix(matrix).sha256;
  const evidence=await runYuzhouLiveRoleUatP0Observations({runner,matrix,plans,binding:{runId:"rehearsal-A",triple,matrixSha256},evidencePath});
  assert.equal(requests,25);assert.equal(evidence.observedChecks,25);assert.equal(evidence.status,"HOLD");assert.equal(evidence.technicalUat,"HOLD");assert.equal(evidence.humanUat,"HOLD");assert.equal(evidence.productionImport,"HOLD");assert.match(evidence.responseEvidenceSha256,/^[0-9a-f]{64}$/u);assert.equal(lstatSync(evidencePath).mode&0o777,0o600);
  assert.doesNotMatch(readFileSync(evidencePath,"utf8"),/isolated dependency unavailable|Bearer|aaaaaaaa-aaaa/u);
  assert.ok(evidence.observations.every(row=>row.status==="PASS"||typeof row.failureCode==="string"));
  const target=resolve(dir,"target.json"),link=resolve(dir,"linked.json");writeFileSync(target,"{}\n");chmodSync(target,0o600);symlinkSync(target,link);
  await assert.rejects(runYuzhouLiveRoleUatP0Observations({runner,matrix,plans,binding:{runId:"rehearsal-B",triple,matrixSha256},evidencePath}),error=>error.code==="YUZHOU_UAT_P0_PLAN_INVALID");
  await assert.rejects(runYuzhouLiveRoleUatP0Observations({runner,matrix,plans,binding:{runId:"rehearsal-A",triple,matrixSha256},evidencePath:link}),error=>error.code==="YUZHOU_UAT_P0_EVIDENCE_UNSAFE");
});

test("constant callbacks cannot create PASS evidence without the exact primary and support requests",async()=>{
  const matrixSha256=validateYuzhouLiveRoleUatP0Matrix(matrix).sha256,triple={codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)};
  const fake={requestCount:0,execute:async plan=>({id:plan.id,actor:"hr_reviewer",statusCode:200,responseKind:"json",responseSha256:"a".repeat(64),responseByteLength:1,supportResponses:0,assertions:Object.fromEntries(matrix.checks.find(row=>row.id===plan.id).assertions.map(key=>[key,true]))})};
  const plans=matrix.checks.map(check=>({id:check.id,owner:"rehearsal-A",evidenceSources:["response","db_before_after"],assert:()=>Object.fromEntries(check.assertions.map(key=>[key,true]))}));
  await assert.rejects(runYuzhouLiveRoleUatP0Observations({runner:fake,matrix,plans,binding:{runId:"rehearsal-A",triple,matrixSha256}}),error=>error.code==="YUZHOU_UAT_P0_REQUEST_COUNT_MISMATCH");
});

test("support routes are real requests bound to the primary check",async()=>{
  let requests=0;
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>{requests+=1;return new Response(JSON.stringify({data:{id:"safe"}}),{status:200,headers:{"content-type":"application/json"}});}});
  const result=await runner.execute({id:"profile_full_projection",substitutions:{employeeId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},assert:observed=>({full_projection:observed.payload!==null,structured_relations_present:observed.support.length===2,gap_codes_preserved:observed.support[1].status===200,required_audit_written:true})});
  assert.equal(requests,3);assert.equal(result.supportResponses,2);assert.equal(result.responseByteLength>0,true);
});

test("binary failure probes reject a leaked header or byte and unsafe non-loopback execution",async()=>{
  const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://localhost/api/v1",tokens,matrix,request:async()=>new Response(new Uint8Array([1]),{status:500,headers:{"content-disposition":"attachment; filename=secret.pdf"}})});
  await assert.rejects(runner.execute({id:"contract_document_storage_failure",substitutions:{storageFailureFileId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},assert:()=>({no_sensitive_headers:true,zero_bytes:true,audit_precedes_storage:true})}),error=>error.code==="YUZHOU_UAT_P0_BINARY_FAILURE_LEAK");
  assert.throws(()=>new YuzhouLiveRoleUatP0Runner({apiBase:"https://park.cnjinhu.com/api/v1",tokens,matrix}),/YUZHOU_UAT_P0_BASE_UNSAFE/u);
});

test("binary Nest error envelopes remain non-file bytes but cannot contain target or sensitive fields",async()=>{
  const target="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for(const payload of [{statusCode:503,target},{statusCode:503,originalName:"private.pdf"}]){
    const runner=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify(payload),{status:503,headers:{"content-type":"application/json"}})});
    await assert.rejects(runner.execute({id:"contract_document_audit_failure",substitutions:{auditFailureFileId:target},assert:()=>({no_sensitive_headers:true,zero_bytes:true,storage_not_opened:true})}),error=>error.code==="YUZHOU_UAT_P0_BINARY_FAILURE_SENSITIVE_LEAK");
  }
});

test("JSON negative probes cannot self-attest through target or sensitive-field leakage",async()=>{
  const target="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const targetLeak=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify({statusCode:404,target}),{status:404,headers:{"content-type":"application/json"}})});
  await assert.rejects(targetLeak.execute({id:"approval_cross_tree_review_hidden",substitutions:{outsideApprovalId:target},body:{action:"approve"},assert:()=>({no_target_disclosure:true,no_state_change:true})}),error=>error.code==="YUZHOU_UAT_P0_JSON_FAILURE_TARGET_DISCLOSURE");
  const sensitiveLeak=new YuzhouLiveRoleUatP0Runner({apiBase:"http://localhost/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify({statusCode:403,baseSalary:"9000.00"}),{status:403,headers:{"content-type":"application/json"}})});
  await assert.rejects(sensitiveLeak.execute({id:"payroll_detail_manager_denied",substitutions:{payrollRunId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},assert:()=>({no_detail_disclosed:true,no_success_audit:true})}),error=>error.code==="YUZHOU_UAT_P0_JSON_FAILURE_SENSITIVE_LEAK");
});

test("hash-only evidence binds the actual response bytes, not only its JSON type",async()=>{
  const run=async payload=>new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}})}).execute({id:"approval_park_pending",assert:observed=>({park_rows_scoped:observed.status===200,required_audit_written:true})});
  const first=await run([{id:"one"}]),second=await run([{id:"two"}]);
  assert.notEqual(first.responseSha256,second.responseSha256);assert.equal(first.responseByteLength,14);
  assert.doesNotMatch(JSON.stringify(first),/\[\{|id.*one/u);
});

test("runtime plans reject constant assertions, missing fixture ownership and unrestored faults",async()=>{
  const ok=new YuzhouLiveRoleUatP0Runner({apiBase:"http://127.0.0.1/api/v1",tokens,matrix,request:async()=>new Response(JSON.stringify([]),{status:200,headers:{"content-type":"application/json"}})});
  await assert.rejects(ok.execute({id:"approval_park_pending",assert:()=>({park_rows_scoped:true,required_audit_written:true})}),error=>error.code==="YUZHOU_UAT_P0_ASSERTION_UNOBSERVED");
  const triple={codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},matrixSha256=validateYuzhouLiveRoleUatP0Matrix(matrix).sha256;
  const plans=matrix.checks.map(check=>({id:check.id,owner:"wrong-run",evidenceSources:["response","db_before_after"],assert:observed=>Object.fromEntries(check.assertions.map(key=>[key,Number.isInteger(observed.status)]))}));
  await assert.rejects(runYuzhouLiveRoleUatP0Observations({runner:ok,matrix,plans,binding:{runId:"right-run",triple,matrixSha256}}),error=>error.code==="YUZHOU_UAT_P0_PLAN_INVALID");
  const owned=plans.map(plan=>({...plan,owner:"right-run",substitutions:Object.fromEntries([...(matrix.checks.find(check=>check.id===plan.id)?.route.matchAll(/\{([^}]+)\}/gu)??[])].map(match=>[match[1],"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]))}));
  owned[0]={...owned[0],cleanup:async()=>{const error=new Error("fault remained");error.code="P0_FAULT_NOT_RESTORED";throw error;}};
  const result=await runYuzhouLiveRoleUatP0Observations({runner:ok,matrix,plans:owned,binding:{runId:"right-run",triple,matrixSha256}});
  assert.equal(result.status,"HOLD");assert.equal(result.observations[0].status,"FAIL");assert.doesNotMatch(JSON.stringify(result),/fault remained/u);
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
