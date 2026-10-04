/* global structuredClone */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { buildYuzhouReusableIncrementalPackage, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";
import { canonicalProfile } from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
import { YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE } from "../hr-cutover/yuzhou-insurance-policy-incremental-projection.mjs";
const hash = v => createHash("sha256").update(v).digest("hex");
const raw = (id=7,overrides={}) => {
  const source={id,des:"Synthetic policy",rightscope:null,...Object.fromEntries(YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.slice(3).map((field,i)=>[field.sourceField,i%2?"-1.250":"12.500"])),...overrides};
  return {sourceTable:"dbo.insure_method",sourceKey:String(id),sourceIdentitySha256:hash(`dbo.insure_method\0${id}`),sourceRowSha256:hash(canonicalProfile(source)),source};
};
const input = records => ({recipeVersion:"yuzhou-reusable-incremental-v2",recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:"yuzhou-v10",extractedAt:"2026-10-05T00:00:00Z",employeeIndex:[],employeeRecords:[],records:[],insurancePolicyRecords:records});
test("fixed builder turns all51 verified raw fields into bounded public policy DTO with stable identity and facts",()=>{
  const source=input([raw()]),before=structuredClone(source),built=buildYuzhouReusableIncrementalPackage(source),item=built.packageDto.items[0];
  assert.deepEqual(source,before);assert.equal(item.domain,"insurance_policy");assert.equal(item.sourceKey,`sha256:${source.insurancePolicyRecords[0].sourceIdentitySha256}`);
  assert.equal(item.fields.items.length,6);assert.equal(item.fields.items[0].baseRate,"0.125");assert.equal(item.fields.items[0].baseFixedAmount,"-1.25");
  assert.equal(item.rowDigest,hash(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields:item.fields})));
  assert.equal(built.manifest.itemCount,1);assert.equal(built.coverage.insurancePolicyFieldCoverage.length,51);
  assert.equal(built.manifest.declarations[0].disposition,"api_eligible");
  const later={...source,extractedAt:"2026-10-06T00:00:00Z"};assert.equal(buildYuzhouReusableIncrementalPackage(later).packageDto.items[0].rowDigest,item.rowDigest);
});
test("existing policy witness is detached, bound into package and never silently unmatched",()=>{
  const row=raw(),source=input([row]),witness={operationId:"yzprod-import-20261005T120000Z-123456abcdef",source:row.source,policy:{targetId:randomUUID(),projection:{}},items:Array.from({length:6},()=>({targetId:randomUUID(),projection:{}}))};
  source.insurancePolicyBaselineWitnesses={[`sha256:${row.sourceIdentitySha256}`]:witness};
  const built=buildYuzhouReusableIncrementalPackage(source),saved=structuredClone(built.packageDto.items[0].insurancePolicyBaselineWitness);
  witness.source.des="Changed input";assert.deepEqual(built.packageDto.items[0].insurancePolicyBaselineWitness,saved);
  assert.equal(built.manifest.sourceEvidence[0].originalWitnessSha256,hash(canonicalProfile(saved)));
  const unused=input([raw()]);unused.insurancePolicyBaselineWitnesses={[`sha256:${"0".repeat(64)}`]:saved};
  assert.throws(()=>buildYuzhouReusableIncrementalPackage(unused),/WITNESS_UNMATCHED/u);
});
test("schema drift, raw tampering, duplicate sources and target precision overflow fail before upload",()=>{
  assert.throws(()=>buildYuzhouReusableIncrementalPackage(input([raw(),raw()])),/SOURCE_DUPLICATE/u);
  const changed=raw();changed.source.oldage="13.000";assert.throws(()=>buildYuzhouReusableIncrementalPackage(input([changed])),/SOURCE_INVALID/u);
  assert.throws(()=>buildYuzhouReusableIncrementalPackage(input([raw(7,{unknown:"new fact"})])),/SCHEMA_CHANGED/u);
  assert.throws(()=>buildYuzhouReusableIncrementalPackage(input([raw(7,{oldage:"999999999999999.999"})])),/TARGET_PRECISION_INVALID/u);
});
