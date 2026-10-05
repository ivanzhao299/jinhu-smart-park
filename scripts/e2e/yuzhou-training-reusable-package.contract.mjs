/* global structuredClone, process */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalProfile } from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
import { buildYuzhouReusableIncrementalPackage, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";
const sha=value=>createHash("sha256").update(value).digest("hex");
const row=(id=1,person="SYN-1")=>{
  const source={id,person,organ:null,coursename:"Synthetic training",startdate:"2020-02-29T00:00:00",enddate:"2020-03-01T00:00:00",hours:8,attainment:null,test:null,trainmoney:null,memo:null};
  return {sourceTable:"dbo.trainhis",sourceKey:String(id),sourceIdentitySha256:sha(`dbo.trainhis\0${id}`),sourceRowSha256:sha(canonicalProfile(source)),source};
};
const input=()=>({recipeVersion:"yuzhou-reusable-incremental-v2",recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:"yuzhou-v10",extractedAt:"2026-10-05T00:00:00Z",employeeIndex:[{employeeCode:"SYN-1",sourceTable:"dbo.person",sourceKey:"SYN-1"}],employeeRecords:[],records:[],trainingRecords:[row()]});
test("fixed training builder binds normalized facts and retains unresolved coverage",()=>{
  const source=input(),before=structuredClone(source),built=buildYuzhouReusableIncrementalPackage(source),item=built.packageDto.items[0];
  assert.deepEqual(source,before);assert.equal(item.domain,"training_history");
  assert.equal(item.fields.employeeSourceKey,`sha256:${sha("dbo.person\0SYN-1")}`);
  assert.equal(item.rowDigest,sha(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields:item.fields})));
  assert.equal(item.fields.hours,"8");assert.equal(Object.keys(item.fields).length,8);
  assert.equal(built.manifest.declarations[0].pendingFields.length,3);
  assert.equal(built.coverage.sourceFieldCoverage[0].fieldCoverage.filter(v=>v.disposition==="supported").length,7);
  source.extractedAt="2026-11-05T00:00:00Z";
  assert.deepEqual(buildYuzhouReusableIncrementalPackage(source).packageDto.items,built.packageDto.items);
});
test("training rejects drift, duplicate identity, missing owner and malformed input",()=>{
  for(const mutate of [s=>s.trainingRecords.push(s.trainingRecords[0]),s=>{s.trainingRecords[0].source.hours=9;},s=>{s.employeeIndex=[];},s=>{s.trainingRecords={};}]){
    const source=input();mutate(source);assert.throws(()=>buildYuzhouReusableIncrementalPackage(source));
  }
});
test("training package chunking and same-pack employee dependencies remain deterministic",()=>{
  const source=input();source.trainingRecords=Array.from({length:2001},(_,i)=>row(i+1));
  const built=buildYuzhouReusableIncrementalPackage(source);
  assert.deepEqual(built.packageDtos.map(p=>p.items.length),[2000,1]);
  source.trainingRecords.reverse();assert.deepEqual(buildYuzhouReusableIncrementalPackage(source).packageDtos,built.packageDtos);
  const dir=mkdtempSync(join(tmpdir(),"yuzhou-training-package-"));
  try{
    execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",dir,"--contract-type-id","00000000-0000-5000-8000-000000000001","--employee-only","yes"],{stdio:"pipe"});
    const source=JSON.parse(readFileSync(join(dir,"input.json"),"utf8"));source.trainingRecords=[row(1,"CLI-E-001")];
    const items=buildYuzhouReusableIncrementalPackage(source).packageDto.items;
    const parent=items.findIndex(i=>i.domain==="employee"),child=items.findIndex(i=>i.domain==="training_history");
    assert.ok(parent>=0&&child>parent);assert.equal(items[child].fields.employeeSourceKey,items[parent].sourceKey);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
