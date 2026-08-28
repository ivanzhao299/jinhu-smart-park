import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildDualSurfaceAtomicInventories, LegacyDualSurfaceAtomicInventoryError, verifyMaterializedDualSurfaceAtomicInventories } from "../hr-cutover/legacy-dual-surface-atomic-inventory-lib.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const clientManifest=read("scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json"),groupManifest=read("scripts/hr-cutover/contracts/legacy-group-web-atomic-inventory-v1.json");

test("client and Group Web atomic skeletons conserve every frozen source boundary",()=>{
  const result=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest);
  assert.deepEqual(result.report.summary,{client:{total:3736,menuEntries:83,tables:162,fields:2364,rules:212,permissions:915},groupWeb:{total:417,menuEntries:231,sourcePaths:186}});
  assert.deepEqual(result.report.evidenceLevels,{TRAVERSED:0,DB:231,SOURCE:186,TARGET:0,INFERRED:83,MISSING:3653});
  assert.equal(result.report.productionImport,"HOLD");
});

test("same-named capabilities remain distinct surface-scoped locators",()=>{
  const {client,groupWeb}=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest),clientNames=new Set(client.records.map(row=>row.legacy.menu).filter(Boolean));
  const overlaps=groupWeb.records.filter(row=>clientNames.has(row.legacy.menu));assert.equal(overlaps.length>0,true);
  for(const row of overlaps)assert.match(row.locator,/^group-web:/u);
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

test("source hash drift and sensitive content fail closed",()=>{
  const drift=structuredClone(clientManifest);drift.sourceContracts[0].sha256="0".repeat(64);assert.throws(()=>buildDualSurfaceAtomicInventories(root,drift,groupManifest),/DUAL_SURFACE_SOURCE_HASH_DRIFT/u);
  const built=buildDualSurfaceAtomicInventories(root,clientManifest,groupManifest);built.client.records[0].legacy.page="/Users/example/private";assert.throws(()=>verifyMaterializedDualSurfaceAtomicInventories(built.client,built.groupWeb),/DUAL_SURFACE_SENSITIVE_CONTENT/u);
});
