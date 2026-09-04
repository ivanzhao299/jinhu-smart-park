#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildLegacyClientMenuAtomicInventory,LegacyClientMenuAtomicInventoryError } from "../hr-cutover/legacy-client-menu-atomic-inventory.mjs";

const root=resolve(import.meta.dirname,"../..");
const contractPath=resolve(root,"scripts/hr-cutover/contracts/legacy-client-menu-atomic-inventory-v1.json");
const contract=()=>JSON.parse(readFileSync(contractPath,"utf8"));
const build=value=>buildLegacyClientMenuAtomicInventory({contract:value,repositoryRoot:root});
const rejects=(code,action)=>assert.throws(action,error=>error instanceof LegacyClientMenuAtomicInventoryError&&error.code===code);

test("all 68 desktop client menu entries retain legacy identity and parent order",()=>{
 const receipt=build(contract());
 const source=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json"),"utf8"));
 assert.equal(receipt.entries.length,68);
 assert.equal(new Set(receipt.entries.map(entry=>entry.atomicId)).size,68);
 assert.deepEqual(receipt.entries.map(entry=>[entry.atomicId,entry.legacyName,entry.parentFamilyId]),source.entries.map(entry=>[entry.atomicId,entry.entryPoint,entry.familyId]));
 for(const entry of receipt.entries){
  assert.equal(entry.parentAtomicId,`client.family.${entry.parentFamilyId}`);
  assert.match(entry.sourceEntrySha256,/^[a-f0-9]{64}$/u);
  assert.match(entry.parentRelationSha256,/^[a-f0-9]{64}$/u);
  assert.match(entry.targetCandidateSha256,/^[a-f0-9]{64}$/u);
 }
 assert.match(receipt.receiptSha256,/^[a-f0-9]{64}$/u);
});

test("static modern routes remain candidates and earn no runtime equivalence credit",()=>{
 const receipt=build(contract());
 assert.deepEqual(receipt.summary,{entries:68,families:12,staticCandidates:68,pendingRuntimeAuthority:68,runtimeEquivalent:0,compatibilityCredit:0});
 for(const entry of receipt.entries){
  assert.match(entry.targetType,/^(?:modern_hr|shared_platform)_route_candidate$/u);
  assert.ok(entry.candidateRoutes.length>0);
  assert.equal(entry.legacyObservationStatus,"pending");
  assert.equal(entry.livePageAuthority,false);
  assert.equal(entry.roleAuthority,false);
  assert.equal(entry.runtimeEquivalenceStatus,"pending");
  assert.equal(entry.candidateStatus,"STATIC_CANDIDATE_ONLY");
  assert.equal(entry.compatibilityCredit,0);
 }
 assert.equal(receipt.containsPersonalData,false);
 assert.equal(receipt.productionImport,"HOLD");
});

test("family totals and candidate route bindings are exact",()=>{
 const receipt=build(contract());
 const counts=Object.fromEntries([...new Set(receipt.entries.map(entry=>entry.parentFamilyId))].map(familyId=>[familyId,receipt.entries.filter(entry=>entry.parentFamilyId===familyId).length]));
 assert.deepEqual(counts,{organization_job:3,employee_profile:9,employment_change:6,contract:6,training:5,performance:6,reward_discipline:6,payroll:7,attendance:4,insurance_welfare:4,recruitment:5,permission_log_reminder:7});
 assert.deepEqual(receipt.entries.find(entry=>entry.legacyName==="工资核算设置")?.candidateRoutes,["/hr/compensation","/hr/payroll"]);
 assert.deepEqual(receipt.entries.find(entry=>entry.legacyName==="用户管理")?.candidateRoutes,["/system/users","/system/permissions","/system/dicts","/system/audit/op-logs"]);
});

test("source hash drift, missing family, invented route, or credit promotion fail closed",()=>{
 const hashDrift=contract();hashDrift.sourceBindings.atomicTraversal.sha256="0".repeat(64);rejects("CLIENT_MENU_SOURCE_EVIDENCE_DRIFT",()=>build(hashDrift));
 const missingFamily=contract();missingFamily.familyTargets.pop();rejects("CLIENT_MENU_FAMILY_COVERAGE_INVALID",()=>build(missingFamily));
 const inventedRoute=contract();inventedRoute.familyTargets[0].candidateRoutes=["/hr/invented"];rejects("CLIENT_MENU_ROUTE_CANDIDATE_UNBOUND",()=>build(inventedRoute));
 const promoted=contract();promoted.candidatePolicy.staticCandidateCompatibilityCredit=1;rejects("CLIENT_MENU_POLICY_INVALID",()=>build(promoted));
 const liveClaim=contract();liveClaim.status="VERIFIED";rejects("CLIENT_MENU_CONTRACT_INVALID",()=>build(liveClaim));
});

test("receipt contains structural labels and hashes only",()=>{
 const serialized=JSON.stringify(build(contract()));
 assert.doesNotMatch(serialized,/credential|password|token|employeeName|employeeCode|\/Users\/|Downloads\//iu);
 assert.doesNotMatch(serialized,/group_web/iu);
});
