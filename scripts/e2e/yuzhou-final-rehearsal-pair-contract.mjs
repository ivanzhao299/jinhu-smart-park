/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertCleanupEvidence, assertP0Summary, runFinalPair, validatePairContract } from "../hr-cutover/final-rehearsal-pair.mjs";

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

test("P0 HOLD and incomplete cleanup cannot be promoted to final A/B PASS",()=>{
  assert.deepEqual(assertP0Summary({legacyTaskCard:{p0Execution:"PASS",p0MatrixChecks:25}},"A"),{status:"PASS",checkCount:25});
  assert.throws(()=>assertP0Summary({legacyTaskCard:{p0Execution:"HOLD",p0MatrixChecks:25}},"A"),error=>error.code==="FINAL_PAIR_P0_HOLD");
  const result={state:"cleaned",residualCount:0,productionImport:"HOLD"},bundle={finalState:"cleaned",productionImport:"HOLD",resourceLedger:[{removed:true,residualCount:0}]};
  assert.deepEqual(assertCleanupEvidence(result,bundle,"B"),{status:"PASS",residualCount:0});
  assert.throws(()=>assertCleanupEvidence(result,{...bundle,resourceLedger:[{removed:false,residualCount:1}]},"B"),error=>error.code==="FINAL_PAIR_CLEANUP_EVIDENCE_INVALID");
});

test("runner is a fixed fail-closed sequence and deployment workflows do not invoke historical loaders",()=>{
  const runner=read("scripts/hr-cutover/final-rehearsal-pair.mjs"),deploy=read(".github/workflows/deploy-production.yml");
  const stages=["full-domain-lifecycle.mjs\",[\"provision","full-domain-lifecycle.mjs\",[\"run","run-full-domain-technical-uat.mjs","rehearsal-backup-restore.mjs","pairCompare(manifestA,manifest)","full-domain-lifecycle.mjs\",[\"rollback","full-domain-lifecycle.mjs\",[\"cleanup"];
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
  const result=runFinalPair(configs[0],configs[1],contract,hooks);assert.equal(result.status,"PASS");assert.deepEqual(result.rehearsals.map(x=>x.rehearsal),["A","B"]);assert(calls.indexOf("pair:compare")>calls.indexOf("B:p0"));
  const failureCalls=[];assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:(script,args)=>{if(args.includes(configs[1].__configPath)&&args[0]==="run")throw Object.assign(new Error("fixture"),{code:"FIXTURE_FAIL"});return args[0]==="cleanup"?{state:"cleaned",residualCount:0,productionImport:"HOLD"}:{};},recovery:config=>failureCalls.push(config.rehearsal)}),/fixture/u);
  assert.deepEqual(failureCalls,["A","B"]);
  assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:()=>{throw Object.assign(new Error("stage"),{code:"STAGE_FAIL"});},recovery:()=>{throw Object.assign(new Error("recovery"),{code:"RECOVERY_FAIL"});}}),error=>error.code==="FINAL_PAIR_RECOVERY_FAILED"&&/A:RECOVERY_FAIL,B:RECOVERY_FAIL/u.test(error.message));
});
