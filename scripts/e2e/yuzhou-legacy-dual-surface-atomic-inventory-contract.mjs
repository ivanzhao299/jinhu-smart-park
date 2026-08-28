import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildDualSurfaceAtomicInventories, LegacyDualSurfaceAtomicInventoryError, verifyMaterializedDualSurfaceAtomicInventories } from "../hr-cutover/legacy-dual-surface-atomic-inventory-lib.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const clientManifest=read("scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json"),groupManifest=read("scripts/hr-cutover/contracts/legacy-group-web-atomic-inventory-v1.json");
const hash=value=>createHash("sha256").update(`${JSON.stringify(value,null,2)}\n`).digest("hex");
const shortcutIdentityHash=rows=>hash(rows.map(({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus})=>({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus})));

test("client and Group Web atomic skeletons conserve every frozen source boundary",()=>{
  const result=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest);
  assert.deepEqual(result.report.summary,{client:{total:3721,menuEntries:68,tables:162,fields:2364,rules:212,permissions:915},groupWeb:{total:417,menuEntries:231,sourcePaths:186,shortcutCrossReferences:15}});
  assert.deepEqual(result.report.evidenceLevels,{TRAVERSED:0,DB:231,SOURCE:186,TARGET:0,INFERRED:68,MISSING:3653});
  assert.equal(result.groupWeb.crossReferences.every(row=>row.observationStatus==="pending"&&Object.values(row.coverage).every(value=>value===false)&&row.evidence.sha256.length===0),true);
  assert.equal(result.report.productionImport,"HOLD");
});

test("same-named capabilities remain distinct surface-scoped locators",()=>{
  const {client,groupWeb}=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),clientNames=new Set(client.records.map(row=>row.legacy.menu).filter(Boolean));
  const overlaps=groupWeb.records.filter(row=>clientNames.has(row.legacy.menu));assert.equal(overlaps.length>0,true);
  for(const row of overlaps){const counterpart=client.records.find(item=>item.legacy.menu===row.legacy.menu);assert.match(row.locator,/^group-web:/u);assert.match(counterpart.locator,/^client:/u);assert.notEqual(row.locator,counterpart.locator);}
});

test("cross-surface reuse duplicate locators count shrink and evidence promotion fail closed",()=>{
  const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),cases=[
    ({client})=>{client.records[0].locator="group-web:menu:1";},
    ({client})=>{client.records[1].locator=client.records[0].locator;},
    ({client})=>{client.records.pop();},
    ({client})=>{client.records.find(row=>row.evidenceLevel==="MISSING").evidenceLevel="TRAVERSED";},
    ({client})=>{const row=client.records.find(item=>item.evidenceLevel==="INFERRED");row.evidenceLevel="TRAVERSED";},
    ({groupWeb})=>{groupWeb.records[0].evidenceHash=null;}
  ];
  for(const mutate of cases){const candidate=structuredClone(built);mutate(candidate);assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(candidate.client,candidate.groupWeb),error=>error instanceof LegacyDualSurfaceAtomicInventoryError);}
});

test("Group Web shortcut references cannot enter the client denominator or self-promote",()=>{
  const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),cases=[
    ({client,groupWeb})=>{client.crossReferences=groupWeb.crossReferences;},
    ({groupWeb})=>{groupWeb.crossReferences.pop();},
    ({groupWeb})=>{groupWeb.crossReferences.push(structuredClone(groupWeb.crossReferences[0]));},
    ({groupWeb})=>{groupWeb.crossReferences[1].locator=groupWeb.crossReferences[0].locator;},
    ({groupWeb})=>{groupWeb.crossReferences[0].surface="client";},
    ({groupWeb})=>{groupWeb.crossReferences[0].observationStatus="observed";},
    ({groupWeb})=>{groupWeb.crossReferences[0].coverage.page=true;},
    ({groupWeb})=>{groupWeb.crossReferences[0].canonicalMenuLocators=["client:menu-entry:employee_profile:01"];}
  ];
  for(const mutate of cases){const candidate=structuredClone(built);mutate(candidate);assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(candidate.client,candidate.groupWeb),error=>error instanceof LegacyDualSurfaceAtomicInventoryError);}
});

test("Group Web shortcut source omissions extras and cross-surface substitution fail closed",()=>{
  const missing=structuredClone(groupManifest);missing.sourceContracts=missing.sourceContracts.filter(source=>!source.path.endsWith("legacy-group-web-shortcut-cross-reference-v1.json"));assert.throws(()=>buildDualSurfaceAtomicInventories(root,clientManifest,missing),/DUAL_SURFACE_SOURCE_AUTHORITY_MISSING/u);
  const extra=structuredClone(groupManifest);extra.expectedCounts.shortcutCrossReferences+=1;assert.throws(()=>buildDualSurfaceAtomicInventories(root,clientManifest,extra),/DUAL_SURFACE_EXPECTED_COUNT_DRIFT/u);
  const client=structuredClone(clientManifest);client.sourceContracts[0]=groupManifest.sourceContracts[0];assert.throws(()=>buildDualSurfaceAtomicInventories(root,client,groupManifest),/DUAL_SURFACE_SOURCE_AUTHORITY_MISSING/u);
});

test("self-consistent shortcut identity rewrites cannot replace the frozen source authority",()=>{
  const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),drift=structuredClone(built);
  drift.groupWeb.crossReferences[0].entryPoint="rewritten-shortcut";
  drift.groupWeb.evidenceAuthority.shortcutIdentityHash=shortcutIdentityHash(drift.groupWeb.crossReferences);
  drift.groupWeb.evidenceAuthoritySha256=hash(drift.groupWeb.evidenceAuthority);
  assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(drift.client,drift.groupWeb),/DUAL_SURFACE_SHORTCUT_AUTHORITY_DRIFT/u);
});

test("source hash drift and sensitive content fail closed",()=>{
  const drift=structuredClone(clientManifest);drift.sourceContracts[0].sha256="0".repeat(64);assert.throws(()=>buildDualSurfaceAtomicInventories(root,drift,groupManifest),/DUAL_SURFACE_SOURCE_HASH_DRIFT/u);
  const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest);built.client.records[0].legacy.page="/Users/example/private";assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(built.client,built.groupWeb),/DUAL_SURFACE_SENSITIVE_CONTENT/u);
});

test("counts derive from hash-bound authorities rather than manifest self-report",()=>{
 const client=structuredClone(clientManifest);client.expectedCounts.fields+=1;client.expectedCounts.total+=1;assert.throws(()=>buildDualSurfaceAtomicInventories(root,client,groupManifest),/DUAL_SURFACE_EXPECTED_COUNT_DRIFT/u);
 const group=structuredClone(groupManifest);group.expectedCounts.sourcePaths-=1;group.expectedCounts.total-=1;assert.throws(()=>buildDualSurfaceAtomicInventories(root,clientManifest,group),/DUAL_SURFACE_EXPECTED_COUNT_DRIFT/u);
});

test("placeholder hashes and missing-to-implemented R A E P T promotion fail closed",()=>{
 const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),hashDrift=structuredClone(built);hashDrift.groupWeb.records[0].evidenceHash="0".repeat(64);assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(hashDrift.client,hashDrift.groupWeb),/DUAL_SURFACE_EVIDENCE_AUTHORITY_DRIFT/u);
 const promoted=structuredClone(built),row=promoted.client.records.find(item=>item.evidenceLevel==="MISSING");row.target={route:"/hr",api:"GET /hr",entity:"HrEmployee",permission:"hr:employee:read",test:"contract",disposition:"implemented"};assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(promoted.client,promoted.groupWeb),/DUAL_SURFACE_MISSING_TARGET_PROMOTION|DUAL_SURFACE_TARGET_PROMOTION_FORBIDDEN/u);
});

test("percent base64 hex and HTML-entity encoded sensitive values fail closed",()=>{
 const encodings=[encodeURIComponent("http://192.168.77.5/admin"),Buffer.from("/Users/example/private").toString("base64"),Buffer.from("token=private-value").toString("base64url"),Buffer.from("password=secret-value").toString("hex"),"http://&#x31;92.168.77.5/admin"];
 for(const encoded of encodings){const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest);built.client.records[0].legacy.page=encoded;assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(built.client,built.groupWeb),/DUAL_SURFACE_SENSITIVE_CONTENT/u);}
});

test("incremental real traversal requires the prior inventory hash and forbids downgrade",()=>{
 const previous=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),next=structuredClone(previous),row=next.client.records.find(item=>item.evidenceLevel==="MISSING");
 next.client.inventoryVersion=2;next.client.previousInventoryHash=hash(previous.client);next.client.sourceSetSha256="d".repeat(64);row.evidenceLevel="TRAVERSED";row.evidenceHash="e".repeat(64);row.missingReason=null;next.client.evidenceAuthority.recordEvidenceByLocator[row.locator]={level:"TRAVERSED",hash:row.evidenceHash};next.client.evidenceAuthoritySha256=hash(next.client.evidenceAuthority);
 assert.equal(verifyMaterializedDualSurfaceAtomicInventories(next.client,next.groupWeb,{client:previous.client,groupWeb:previous.groupWeb}).status,"PASS");
 assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(next.client,next.groupWeb),/DUAL_SURFACE_CHAIN_INVALID/u);
 const downgrade=structuredClone(next);const inferred=downgrade.client.records.find(item=>item.evidenceLevel==="INFERRED");inferred.evidenceLevel="MISSING";inferred.evidenceHash=null;inferred.missingReason="REGRESSION";downgrade.client.evidenceAuthority.recordEvidenceByLocator[inferred.locator]={level:"MISSING",hash:null};downgrade.client.evidenceAuthoritySha256=hash(downgrade.client.evidenceAuthority);assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(downgrade.client,downgrade.groupWeb,{client:previous.client,groupWeb:previous.groupWeb}),/DUAL_SURFACE_CHAIN_DOWNGRADE/u);
});
