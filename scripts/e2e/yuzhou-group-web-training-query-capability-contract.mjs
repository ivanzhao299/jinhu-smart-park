/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  GroupWebTrainingQueryCapabilityError,
  verifyGroupWebTrainingQueryCapability,
  verifyGroupWebTrainingQueryCapabilitySources,
} from "../hr-cutover/group-web-training-query-capability.mjs";

const root=resolve(import.meta.dirname,"../..");
const json=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const contract=json("scripts/hr-cutover/contracts/group-web-training-query-capability-v1.json");
const sources=()=>({
 moduleMapping:json(contract.sourceContracts[0].path),
 sourceAudit:json(contract.sourceContracts[1].path),
 targetBinding:json(contract.sourceContracts[2].path),
 readTarget:path=>readFileSync(resolve(root,path),"utf8"),
});
const expectCode=(action,code)=>assert.throws(action,error=>error instanceof GroupWebTrainingQueryCapabilityError&&error.code===code);

test("first Group Web static candidate binds a real legacy training page and modern target",()=>{
 const report=verifyGroupWebTrainingQueryCapability(root,contract);
 assert.equal(report.status,"PENDING_RUNTIME_PARITY");
 assert.deepEqual(report.proven,{sourceEntryIdentity:true,staticPageStructure:true,noStaticMutationStatements:true,modernTargetSymbols:true});
 assert.equal(report.unproven.authenticatedNavigation,true);
 assert.equal(report.unproven.scopedResultRendering,true);
 assert.equal(report.unproven.sourceToShortcutIdentityEquivalence,true);
 assert.equal(report.gapCode,"GROUP_WEB_TRAINING_QUERY_RUNTIME_PARITY_NOT_OBSERVED");
 assert.equal(report.productionImport,"HOLD");
});

test("static source profile is exact and proves no source mutation statement",()=>{
 const evidence=contract.candidate.staticSourceEvidence;
 assert.deepEqual(
  {files:evidence.traversedAspFiles,forms:evidence.forms,controls:evidence.controls,requestKeys:evidence.requestKeys,formActions:evidence.formActions},
  {files:2,forms:1,controls:10,requestKeys:10,formActions:1},
 );
 assert.deepEqual({insert:evidence.insertStatements,update:evidence.updateStatements,delete:evidence.deleteStatements},{insert:0,update:0,delete:0});
});

test("static evidence cannot inflate either runtime denominator",()=>{
 const report=verifyGroupWebTrainingQueryCapability(root,contract);
 assert.deepEqual(report.coverageCredit,{groupWebNavigableEntries:{numerator:0,denominator:186},legacyInteractionParity:{numerator:0,denominator:6}});
 assert.equal(report.compatibilityScoreContribution,0);
 for(const mutation of [
  candidate=>{candidate.status="verified";},
  candidate=>{candidate.compatibilityScoreContribution=1;},
  candidate=>{candidate.coverageCredit.groupWebNavigableEntries.numerator=1;},
  candidate=>{candidate.coverageCredit.legacyInteractionParity.numerator=1;},
 ]){
  const candidate=structuredClone(contract);mutation(candidate);
  expectCode(()=>verifyGroupWebTrainingQueryCapabilitySources(candidate,sources()),mutation.toString().includes("status")||mutation.toString().includes("compatibility")?"GROUP_WEB_TRAINING_FALSE_COMPLETION":"GROUP_WEB_TRAINING_COVERAGE_INVALID");
 }
});

test("source identity profile and target evidence drift fail closed",()=>{
 const moduleDrift=sources();moduleDrift.moduleMapping.items.find(row=>row.legacyId===128).legacyUrl="invented.asp";
 expectCode(()=>verifyGroupWebTrainingQueryCapabilitySources(contract,moduleDrift),"GROUP_WEB_TRAINING_SOURCE_DRIFT");
 const auditDrift=sources();auditDrift.sourceAudit.items.find(row=>row.legacyId===128).controls=9;
 expectCode(()=>verifyGroupWebTrainingQueryCapabilitySources(contract,auditDrift),"GROUP_WEB_TRAINING_SOURCE_DRIFT");
 const targetDrift=sources();targetDrift.readTarget=()=>"";
 expectCode(()=>verifyGroupWebTrainingQueryCapabilitySources(contract,targetDrift),"GROUP_WEB_TRAINING_TARGET_EVIDENCE_MISSING");
});
