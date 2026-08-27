import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {LegacyWebEntryBindingError,verifyLegacyWebEntryTargetBinding} from "../hr-cutover/legacy-web-entry-target-binding-lib.mjs";
const root=resolve(import.meta.dirname,"../..");
const manifest=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/contracts/legacy-web-entry-target-binding-v1.json"),"utf8"));
const clone=value=>structuredClone(value);
const expectCode=(code,callback)=>assert.throws(callback,error=>error instanceof LegacyWebEntryBindingError&&error.code===code);

test("all 15 Yuzhou Web entries have a mapped target or an explicit gap",()=>{
  assert.deepEqual(verifyLegacyWebEntryTargetBinding(manifest,{root}),{ok:true,entries:15,mapped:12,gaps:3,roleMatrixVerified:false,compatibilityScoreContribution:0,productionImport:"HOLD"});
});
test("entry substitution and legacy path drift fail closed",()=>{
  const substituted=clone(manifest);substituted.entries[0].name="invented";
  expectCode("BINDING_ENTRY_INVALID",()=>verifyLegacyWebEntryTargetBinding(substituted,{root}));
  const drifted=clone(manifest);drifted.entries[0].legacyPath="other.aspx";
  expectCode("BINDING_ENTRY_INVALID",()=>verifyLegacyWebEntryTargetBinding(drifted,{root}));
});
test("mapped entries require route API permission and test evidence",()=>{
  const missing=clone(manifest);missing.entries[0].targetEvidence=missing.entries[0].targetEvidence.filter(item=>item.kind!=="test");
  expectCode("TARGET_EVIDENCE_INCOMPLETE",()=>verifyLegacyWebEntryTargetBinding(missing,{root}));
  const fabricated=clone(manifest);fabricated.entries[0].targetEvidence[0].symbol="NoSuchRouteSymbol";
  expectCode("TARGET_SYMBOL_MISSING",()=>verifyLegacyWebEntryTargetBinding(fabricated,{root}));
});
test("gaps cannot carry fabricated targets and summary cannot drift",()=>{
  const invented=clone(manifest);invented.entries[1].targetRoute="/hr/photos";
  expectCode("BINDING_GAP_ENTRY_INVALID",()=>verifyLegacyWebEntryTargetBinding(invented,{root}));
  const swapped=clone(manifest);swapped.entries[1].reasonCode="TARGET_EMPLOYMENT_CHANGE_STATISTICS_NOT_IMPLEMENTED";
  expectCode("BINDING_GAP_ENTRY_INVALID",()=>verifyLegacyWebEntryTargetBinding(swapped,{root}));
  const route=clone(manifest);route.entries[0].targetRoute="/hr/invented";
  expectCode("BINDING_MAPPED_ENTRY_INVALID",()=>verifyLegacyWebEntryTargetBinding(route,{root}));
  const drifted=clone(manifest);drifted.summary.mapped++;
  expectCode("BINDING_SUMMARY_DRIFT",()=>verifyLegacyWebEntryTargetBinding(drifted,{root}));
});
test("source binding cannot claim role-matrix completion or release import",()=>{
  const role=clone(manifest);role.roleMatrixVerified=true;
  expectCode("BINDING_EVIDENCE_OVERRATED",()=>verifyLegacyWebEntryTargetBinding(role,{root}));
  const release=clone(manifest);release.productionImport="GO";
  expectCode("BINDING_PRODUCTION_IMPORT_NOT_HELD",()=>verifyLegacyWebEntryTargetBinding(release,{root}));
});
test("credentials private endpoints and workstation paths are forbidden",()=>{
  const secret=clone(manifest);secret.bindingVersion=["pass","word=example"].join("");
  expectCode("BINDING_SENSITIVE_CONTENT_FORBIDDEN",()=>verifyLegacyWebEntryTargetBinding(secret,{root}));
  const path=clone(manifest);path.bindingVersion="/Users/example/private";
  expectCode("BINDING_SENSITIVE_CONTENT_FORBIDDEN",()=>verifyLegacyWebEntryTargetBinding(path,{root}));
  const address=clone(manifest);address.bindingVersion=["192","168","1","9"].join(".");
  expectCode("BINDING_SENSITIVE_CONTENT_FORBIDDEN",()=>verifyLegacyWebEntryTargetBinding(address,{root}));
});
