/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertCleanupEvidence, assertP0Summary, runFinalPair, validatePairContract, validateRuntimeVacancy } from "../hr-cutover/final-rehearsal-pair.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>readFileSync(resolve(root,path),"utf8");
const contract=JSON.parse(read("scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json"));

test("final A/B contract freezes source facts, continuous order and production HOLD",()=>{
  const result=validatePairContract(contract);assert.equal(result.status,"PASS");assert.equal(result.productionImport,"HOLD");assert.match(result.sha256,/^[0-9a-f]{64}$/u);
  assert.deepEqual(contract.sourceFacts.T4,{hotYears:[2024,2025,2026],headers:8342,regularHeaders:8320,adjustmentHeaders:22,items:190374,closes:266,net:"15723009.9100",coldArchiveRows:37750});
  assert.deepEqual(contract.sourceFacts.T2,{contracts:802,changes:357});assert.deepEqual(contract.sourceFacts.T5,{rows:20163});
});

test("fact, order, final-state and import drift fail closed",()=>{
  for(const mutate of [draft=>{draft.sourceFacts.T4.items++;},draft=>{draft.rollbackOrder.reverse();},draft=>{draft.requiredFinalState.residualCount=1;},draft=>{draft.productionImport="GO";}]){
    const draft=structuredClone(contract);mutate(draft);assert.throws(()=>validatePairContract(draft));
  }
});

test("runtime vacancy rejects occupied ports and residual Docker identities before provision",()=>{
 const configs=["A","B"].map((rehearsal,index)=>({target:{postgresPort:15441+index,apiPort:3141+index,webPort:4141+index,composeProject:`jinhu_hr_migration_lab_full_${rehearsal.toLowerCase()}ready`,postgresContainer:`jinhu_hr_migration_lab_full_${rehearsal.toLowerCase()}ready-postgres-1`,volume:`jinhu_hr_migration_lab_full_${rehearsal.toLowerCase()}ready_postgres_data`}}));
 assert.equal(validateRuntimeVacancy(configs).status,"PASS");
 for(const observed of [{busyPorts:[15441]},{composeProjects:[configs[0].target.composeProject]},{containers:[configs[1].target.postgresContainer]},{volumes:[configs[0].target.volume]},{networks:[`${configs[1].target.composeProject}_default`]}])assert.throws(()=>validateRuntimeVacancy(configs,observed),error=>error.code==="FINAL_PAIR_RUNTIME_BUSY");
});

test("P0 HOLD and incomplete cleanup cannot be promoted to final A/B PASS",()=>{
  const p0=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json")),stable=value=>`${JSON.stringify(value,null,2)}\n`,hash=value=>createHash("sha256").update(stable(value)).digest("hex"),observations=p0.checks.map(row=>{const item={id:row.id,actor:row.actor,statusCode:row.outcome==="success"?200:row.outcome==="forbidden"?403:row.outcome==="server_failure"?500:404,responseKind:row.responseKind,responseSha256:"a".repeat(64),responseByteLength:1,supportResponses:row.supportRoutes?.length??0,assertions:Object.fromEntries(row.assertions.map(key=>[key,true])),status:"PASS"};return{...item,evidenceSha256:hash(item)};}),evidence={formatVersion:1,parentRunId:"run-A",triple:{codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},status:"PASS",technicalUat:"PASS",humanUat:"HOLD",p0MatrixSha256:hash(p0),responseEvidenceSha256:hash(observations),requestCount:p0.checks.reduce((sum,row)=>sum+1+(row.supportRoutes?.length??0),0),observedChecks:25,failedChecks:0,observations,productionImport:"HOLD"},summary={formatVersion:1,parentRunId:"run-A",status:"PASS",humanUat:"PASS",productionImport:"HOLD",legacyTaskCard:{p0Execution:"PASS",p0MatrixChecks:25,p0MatrixSha256:hash(p0),p0ObservedChecks:25,p0FailedChecks:0,p0EvidenceSha256:hash(evidence)}};
  assert.deepEqual(assertP0Summary(summary,"A",evidence),{status:"PASS",checkCount:25});
  for(const mutate of [(s,e)=>{s.legacyTaskCard.p0Execution="HOLD";},(s,e)=>{e.observations.pop();},(s,e)=>{s.legacyTaskCard.p0EvidenceSha256="b".repeat(64);},(s,e)=>{s.humanUat="HOLD";}]){const s=structuredClone(summary),e=structuredClone(evidence);mutate(s,e);assert.throws(()=>assertP0Summary(s,"A",e),error=>error.code==="FINAL_PAIR_P0_HOLD");}
  const result={state:"cleaned",residualCount:0,productionImport:"HOLD"},bundle={finalState:"cleaned",productionImport:"HOLD",resourceLedger:[{removed:true,residualCount:0}]};
  assert.deepEqual(assertCleanupEvidence(result,bundle,"B"),{status:"PASS",residualCount:0});
  assert.throws(()=>assertCleanupEvidence(result,{...bundle,resourceLedger:[{removed:false,residualCount:1}]},"B"),error=>error.code==="FINAL_PAIR_CLEANUP_EVIDENCE_INVALID");
});

test("runner is a fixed fail-closed sequence and deployment workflows do not invoke historical loaders",()=>{
  const runner=read("scripts/hr-cutover/final-rehearsal-pair.mjs"),deploy=read(".github/workflows/deploy-production.yml");
  const stages=["full-domain-lifecycle.mjs\",[\"provision","full-domain-lifecycle.mjs\",[\"run","run-full-domain-technical-uat.mjs","rehearsal-backup-restore.mjs","pairCompare(manifests[0],manifests[1])","full-domain-lifecycle.mjs\",[\"rollback","full-domain-lifecycle.mjs\",[\"cleanup"];
  let cursor=-1;for(const stage of stages){const next=runner.indexOf(stage,cursor+1);assert(next>cursor,`missing/out-of-order ${stage}`);cursor=next;}
  assert.match(runner,/ALLOW_YUZHOU_FINAL_REHEARSAL!=="yes"/u);assert.match(runner,/FINAL_PAIR_P0_HOLD/u);assert.match(runner,/--recover/u);
  assert.doesNotMatch(deploy,/load-yuzhou|hr:migration:full|ALLOW_YUZHOU_MIGRATION/u);
});

test("pair execution is serial and any stage failure invokes scoped recovery without a PASS result",()=>{
  const configs=["A","B"].map(rehearsal=>({rehearsal,__configPath:`/controlled/${rehearsal}.json`,triple:{codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},target:{root:`/controlled/runtime-${rehearsal}`,auditBundle:`/controlled/audit-${rehearsal}.json`}}));
  const calls=[],hooks={
    execute:(script,args)=>{calls.push(`${configs.find(c=>args.includes(c.__configPath))?.rehearsal}:${script.split("/").at(-1)}:${args[0]??"uat"}`);return args[0]==="cleanup"?{state:"cleaned",residualCount:0,productionImport:"HOLD"}:{};},
    p0Gate:config=>calls.push(`${config.rehearsal}:p0`),manifestHead:config=>({rehearsal:config.rehearsal}),pairCompare:()=>calls.push("pair:compare"),cleanupGate:config=>`${config.rehearsal.toLowerCase()}`.repeat(64).slice(0,64),recovery:config=>calls.push(`${config.rehearsal}:recover`)
  };
  const result=runFinalPair(configs[0],configs[1],contract,hooks);assert.equal(result.status,"PASS");assert.deepEqual(result.rehearsals.map(x=>x.rehearsal),["A","B"]);assert(calls.indexOf("pair:compare")>calls.indexOf("B:p0"));assert(calls.indexOf("pair:compare")<calls.findIndex(row=>row.includes(":rollback")));assert(calls.indexOf("B:full-domain-lifecycle.mjs:rollback")<calls.indexOf("A:full-domain-lifecycle.mjs:rollback"));
  const failureCalls=[];assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:(script,args)=>{if(args.includes(configs[1].__configPath)&&args[0]==="run")throw Object.assign(new Error("fixture"),{code:"FIXTURE_FAIL"});return args[0]==="cleanup"?{state:"cleaned",residualCount:0,productionImport:"HOLD"}:{};},recovery:config=>failureCalls.push(config.rehearsal)}),/fixture/u);
  assert.deepEqual(failureCalls,["A","B"]);
  assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:()=>{throw Object.assign(new Error("stage"),{code:"STAGE_FAIL"});},recovery:()=>{throw Object.assign(new Error("recovery"),{code:"RECOVERY_FAIL"});}}),error=>error.code==="FINAL_PAIR_RECOVERY_FAILED"&&/A:RECOVERY_FAIL,B:RECOVERY_FAIL/u.test(error.message));
});
