import { createHash } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { validateYuzhouLiveRoleUatP0Matrix } from "./yuzhou-live-role-uat-p0-matrix-lib.mjs";

const SHA=/^[0-9a-f]{64}$/u,CODE_SHA=/^[0-9a-f]{40}$/u;
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
const hash=value=>createHash("sha256").update(typeof value==="string"?value:stable(value)).digest("hex");

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
  if(JSON.stringify(actual)!==JSON.stringify(expected)||plans.some(row=>typeof row.assert!=="function"))fail("YUZHOU_UAT_P0_PLAN_INVALID","stable ids/order/assertions");
  const observations=[];
  for(const plan of plans){
    try{const observed=await runner.execute(plan);observations.push({...observed,status:"PASS"});}
    catch(error){observations.push({id:plan.id,status:"FAIL",failureCodeHash:hash(String(error?.code??"YUZHOU_UAT_P0_FAILED"))});}
  }
  const responseEvidenceSha256=hash(observations),failedChecks=observations.filter(row=>row.status!=="PASS").length;
  const evidence={formatVersion:1,parentRunId:binding.runId,triple:binding.triple,p0MatrixSha256:identity.sha256,responseEvidenceSha256,status:failedChecks===0?"PASS":"HOLD",observedChecks:observations.length,failedChecks,observations,technicalUat:failedChecks===0?"PASS":"HOLD",humanUat:"HOLD",productionImport:"HOLD"};
  if(typeof evidencePath==="string"){
    try{if(lstatSync(evidencePath).isSymbolicLink())fail("YUZHOU_UAT_P0_EVIDENCE_UNSAFE","symlink");}catch(error){if(error?.code!=="ENOENT")throw error;}
    writeFileSync(evidencePath,stable(evidence),{mode:0o600});chmodSync(evidencePath,0o600);
    if(lstatSync(evidencePath).isSymbolicLink()||(lstatSync(evidencePath).mode&0o777)!==0o600)fail("YUZHOU_UAT_P0_EVIDENCE_UNSAFE","0600 regular file required");
    const roundTrip=JSON.parse(readFileSync(evidencePath,"utf8"));if(hash(roundTrip.observations)!==responseEvidenceSha256)fail("YUZHOU_UAT_P0_EVIDENCE_DRIFT","response evidence hash");
  }
  return evidence;
}
