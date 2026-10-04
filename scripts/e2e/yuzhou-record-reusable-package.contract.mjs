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
const skill=(id=1,person="SYN-1")=>({id,person,knowhow:"Synthetic skill",grade:"Synthetic grade",memo:null});
const credential=()=>({id:2,person:"SYN-1",tickettype:null,ticket:"Synthetic credential",ticketno:"SYN-NUMBER",org:null,getdate:"2020-02-29",validdate:"2030-01-01",memo:null,ticketfilename:null});
const row=(table,source)=>({sourceTable:table,sourceKey:String(source.id),sourceIdentitySha256:sha(`${table}\0${source.id}`),sourceRowSha256:sha(canonicalProfile(source)),source});
const input=()=>({recipeVersion:"yuzhou-reusable-incremental-v2",recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:"yuzhou-v10",extractedAt:"2026-10-04T08:00:00Z",employeeIndex:[{employeeCode:"SYN-1",sourceTable:"dbo.person",sourceKey:"SYN-1"}],employeeRecords:[],records:[],recordRecords:[row("dbo.ticket",credential()),row("dbo.knowhow",skill())]});

test("fixed entry produces digest-valid skill/credential DTOs and preserves extraction",()=>{
  const source=input(),before=structuredClone(source),built=buildYuzhouReusableIncrementalPackage(source);
  assert.deepEqual(source,before);
  assert.deepEqual(built.packageDto.items.map(item=>item.domain),["skill","credential"]);
  for(const item of built.packageDto.items){
    assert.equal(item.fields.employeeSourceKey,`sha256:${sha("dbo.person\0SYN-1")}`);
    assert.equal(item.rowDigest,sha(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields:item.fields})));
  }
  assert.equal(built.manifest.declarations.length,2);
  assert.ok(built.manifest.declarations.every(value=>value.disposition==="api_eligible"&&value.admission==="server_original_or_new_source_proof_required"));
  assert.equal(built.coverage.pendingSourceRecords.length,0);
  assert.equal(built.coverage.recordFieldCoverage.skill.find(value=>value.targetField==="proficiency").disposition,"pending_semantic_binding");
  const again=structuredClone(source);again.recordRecords.reverse();
  assert.deepEqual(buildYuzhouReusableIncrementalPackage(again).packageDtos,built.packageDtos);
  again.extractedAt="2026-10-05T08:00:00Z";
  assert.deepEqual(buildYuzhouReusableIncrementalPackage(again).packageDto.items,built.packageDto.items);
});

test("pending invalid dates, masks and attachment are retained without destructive clear",()=>{
  const source=input();source.recordRecords=[row("dbo.ticket",{...credential(),getdate:"invalid",ticketno:"SYN***",ticketfilename:"synthetic/private/file.pdf"})];
  const built=buildYuzhouReusableIncrementalPackage(source),item=built.packageDto.items[0];
  assert.equal("acquiredDate" in item.fields,false);assert.equal("credentialNumber" in item.fields,false);
  assert.equal("attachmentAssociation" in item.fields,false);
  const fields=built.coverage.sourceFieldCoverage[0].fieldCoverage;
  assert.equal(fields.find(value=>value.targetField==="acquiredDate").disposition,"pending_invalid_date");
  assert.equal(fields.find(value=>value.targetField==="credentialNumber").disposition,"pending_masked_value");
  assert.ok(built.manifest.declarations[0].pendingFields.includes("attachmentAssociation"));
  assert.equal(JSON.stringify(built).includes("synthetic/private/file.pdf"),false);
});

test("entry rejects source drift, duplicates, missing owner, malformed lists and invalid required fields",()=>{
  for(const mutate of [source=>{source.recordRecords[0].source.ticket="tampered";},source=>source.recordRecords.push(source.recordRecords[0]),source=>{source.employeeIndex=[];},source=>{source.recordRecords={};},source=>{source.recipeSha256="0".repeat(64);},source=>{source.recordRecords=[row("dbo.knowhow",{...skill(),knowhow:null})];}]){
    const source=input();mutate(source);assert.throws(()=>buildYuzhouReusableIncrementalPackage(source));
  }
});

test("record batches retain every source exactly once across the 2000-item boundary",()=>{
  const source=input();source.recordRecords=Array.from({length:2001},(_,index)=>row("dbo.knowhow",skill(index+1)));
  const built=buildYuzhouReusableIncrementalPackage(source);
  assert.deepEqual(built.packageDtos.map(value=>value.items.length),[2000,1]);
  assert.equal(new Set(built.packageDtos.flatMap(value=>value.items.map(item=>item.sourceKey))).size,2001);
  source.recordRecords.reverse();assert.deepEqual(buildYuzhouReusableIncrementalPackage(source).packageDtos,built.packageDtos);
});

test("same-pack employee precedes child records using existing verified employee fixture",()=>{
  const root=mkdtempSync(join(tmpdir(),"yuzhou-record-package-"));
  try{
    execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",root,"--contract-type-id","00000000-0000-5000-8000-000000000001","--employee-only","yes"],{stdio:"pipe"});
    const source=JSON.parse(readFileSync(join(root,"input.json"),"utf8"));
    source.recordRecords=[row("dbo.knowhow",skill(1,"CLI-E-001")),row("dbo.ticket",{...credential(),person:"CLI-E-001"})];
    const built=buildYuzhouReusableIncrementalPackage(source),items=built.packageDto.items;
    const employeeIndex=items.findIndex(item=>item.domain==="employee");
    for(const domain of ["skill","credential"]){
      const childIndex=items.findIndex(item=>item.domain===domain);
      assert.ok(employeeIndex>=0&&childIndex>employeeIndex);
      assert.equal(items[childIndex].fields.employeeSourceKey,items[employeeIndex].sourceKey);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
