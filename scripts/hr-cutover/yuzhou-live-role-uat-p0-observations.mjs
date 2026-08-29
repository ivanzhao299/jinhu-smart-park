import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateYuzhouLiveRoleUatP0Matrix } from "./yuzhou-live-role-uat-p0-matrix-lib.mjs";

const SHA=/^[0-9a-f]{64}$/u,CODE_SHA=/^[0-9a-f]{40}$/u;
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
const hash=value=>createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex");
const safeFailure=error=>{const code=String(error?.code??"YUZHOU_UAT_P0_FAILED"),databaseDiagnostic=String(error?.message??"").match(/operation_[0-9]+_sqlstate_[0-9A-Z]+(?:_constraint_[A-Za-z0-9_]+)?(?:_callsite_[A-Za-z0-9_-]+)?/u)?.[0],detail={failureCode:code};if(databaseDiagnostic)detail.databaseDiagnostic=databaseDiagnostic;if(Number.isInteger(error?.safeDiagnostic?.httpStatus)&&error.safeDiagnostic.httpStatus>=100&&error.safeDiagnostic.httpStatus<=599)detail.httpStatus=error.safeDiagnostic.httpStatus;if(Array.isArray(error?.safeDiagnostic?.failedAssertions))detail.failedAssertions=error.safeDiagnostic.failedAssertions.filter(value=>typeof value==="string"&&/^[a-z][a-z0-9_]{1,80}$/u.test(value));return detail;};

function assertBinding(binding,matrixSha256){
  if(!binding||typeof binding.runId!=="string"||binding.runId.length<8)fail("YUZHOU_UAT_P0_BINDING_INVALID","runId");
  if(!CODE_SHA.test(binding.triple?.codeSha??""))fail("YUZHOU_UAT_P0_BINDING_INVALID","codeSha");
  for(const field of ["sourceSnapshotHash","mappingContractHash"]){if(!SHA.test(binding.triple?.[field]??""))fail("YUZHOU_UAT_P0_BINDING_INVALID",field);}
  if(binding.matrixSha256!==matrixSha256)fail("YUZHOU_UAT_P0_BINDING_INVALID","matrix hash");
}

export async function runYuzhouLiveRoleUatP0Observations({runner,matrix,plans,binding,evidencePath}){
  const identity=validateYuzhouLiveRoleUatP0Matrix(matrix);assertBinding(binding,identity.sha256);
  if(!runner?.execute||!Array.isArray(plans)||plans.length!==identity.checkCount)fail("YUZHOU_UAT_P0_PLAN_INVALID","exact executable plan required");
  const expected=matrix.checks.map(row=>row.id),actual=plans.map(row=>row?.id);
  if(JSON.stringify(actual)!==JSON.stringify(expected)||plans.some(row=>typeof row.assert!=="function"||row.owner!==binding.runId||!Array.isArray(row.evidenceSources)||!row.evidenceSources.includes("response")||!row.evidenceSources.some(source=>source!=="response")))fail("YUZHOU_UAT_P0_PLAN_INVALID","stable ids/order/owner/evidence sources");
  const expectedRequests=matrix.checks.reduce((sum,row)=>sum+1+(row.supportRoutes?.length??0),0),requestCountBefore=runner.requestCount;
  if(!Number.isInteger(requestCountBefore))fail("YUZHOU_UAT_P0_RUNNER_INVALID","request counter required");
  const observations=[];
  for(const plan of plans){
    let prepared=plan;
    try{prepared=plan.prepare?{...plan,...await plan.prepare()}:plan;const observed=await runner.execute(prepared);const row={...observed,status:"PASS"};observations.push({...row,evidenceSha256:hash(row)});}
    catch(error){const failure=safeFailure(error);observations.push({id:plan.id,status:"FAIL",...failure,failureCodeHash:hash(failure.failureCode)});}
    finally{if(plan.cleanup){try{await plan.cleanup();}catch(error){const row=observations.at(-1);row.status="FAIL";delete row.evidenceSha256;row.failureCodeHash=hash(String(error?.code??"YUZHOU_UAT_P0_CLEANUP_FAILED"));}}}
  }
  const requestCount=runner.requestCount-requestCountBefore;
  const responseEvidenceSha256=hash(observations),failedChecks=observations.filter(row=>row.status!=="PASS").length;
  if(failedChecks===0&&requestCount!==expectedRequests)fail("YUZHOU_UAT_P0_REQUEST_COUNT_MISMATCH",`${requestCount}/${expectedRequests}`);
  const evidence={formatVersion:1,parentRunId:binding.runId,triple:binding.triple,p0MatrixSha256:identity.sha256,responseEvidenceSha256,requestCount,status:failedChecks===0?"PASS":"HOLD",observedChecks:observations.length,failedChecks,observations,technicalUat:failedChecks===0?"PASS":"HOLD",humanUat:"HOLD",productionImport:"HOLD"};
  if(typeof evidencePath==="string"){
    const absolute=resolve(evidencePath),parent=dirname(absolute);
    if(!existsSync(parent)||existsSync(absolute))fail("YUZHOU_UAT_P0_EVIDENCE_UNSAFE","new file in existing parent required");
    const canonicalPath=resolve(realpathSync(parent),absolute.slice(parent.length+1));
    writeFileSync(canonicalPath,stable(evidence),{mode:0o600,flag:"wx"});chmodSync(canonicalPath,0o600);
    if(lstatSync(evidencePath).isSymbolicLink()||(lstatSync(evidencePath).mode&0o777)!==0o600)fail("YUZHOU_UAT_P0_EVIDENCE_UNSAFE","0600 regular file required");
    const roundTrip=JSON.parse(readFileSync(evidencePath,"utf8"));if(hash(roundTrip.observations)!==responseEvidenceSha256)fail("YUZHOU_UAT_P0_EVIDENCE_DRIFT","response evidence hash");
  }
  return evidence;
}
