import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyWebTopologyError,verifyLegacyWebRuntimeTopology } from "../hr-cutover/legacy-web-runtime-topology-lib.mjs";

const root=resolve(import.meta.dirname,"../..");
const manifest=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/contracts/legacy-web-runtime-topology-v1.json"),"utf8"));
const clone=value=>structuredClone(value);
const rejects=(code,callback)=>assert.throws(callback,error=>error instanceof LegacyWebTopologyError&&error.code===code);

test("desktop client, classic Group Network and database Web menu are three distinct legacy surfaces",()=>{
 const report=verifyLegacyWebRuntimeTopology(manifest);
 assert.deepEqual(report,{ok:true,surfaces:3,runtimeObserved:2,remainingRuntimeGates:3,productionImport:"HOLD"});
 assert.equal(manifest.compatibilityDecision.functionallyIdentical,false);
});

test("classic ASP shell and ASP.NET database menu cannot be collapsed into one claimed runtime",()=>{
 const collapsed=clone(manifest);collapsed.surfaces=collapsed.surfaces.filter(item=>item.id!=="database_web_menu");
 rejects("LEGACY_WEB_TOPOLOGY_SURFACE_SET_INVALID",()=>verifyLegacyWebRuntimeTopology(collapsed));
 const relabeled=clone(manifest);relabeled.surfaces.find(item=>item.id==="classic_group_network").technology="asp_net_menu_contract";
 rejects("LEGACY_WEB_CLASSIC_SURFACE_INVALID",()=>verifyLegacyWebRuntimeTopology(relabeled));
});

test("runtime evidence cannot record credentials, personal values, screenshots, writes or release import",()=>{
 for(const key of Object.keys(manifest.security)){const unsafe=clone(manifest);unsafe.security[key]=true;rejects("LEGACY_WEB_SECURITY_INVALID",()=>verifyLegacyWebRuntimeTopology(unsafe));}
 const released=clone(manifest);released.productionImport="GO";rejects("LEGACY_WEB_PRODUCTION_IMPORT_NOT_HELD",()=>verifyLegacyWebRuntimeTopology(released));
 const privatePath=clone(manifest);privatePath.surfaces[0].entryEvidence.push("/Users/example/evidence");rejects("LEGACY_WEB_TOPOLOGY_SENSITIVE_CONTENT",()=>verifyLegacyWebRuntimeTopology(privatePath));
});
