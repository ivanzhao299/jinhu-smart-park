export class LegacyWebTopologyError extends Error {
  constructor(code,detail){super(`${code}: ${detail}`);this.name="LegacyWebTopologyError";this.code=code;}
}
const fail=(code,detail)=>{throw new LegacyWebTopologyError(code,detail);};
const exact=(value,keys,label)=>{if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))fail("LEGACY_WEB_TOPOLOGY_SHAPE_INVALID",label);};
const list=(value,label)=>{if(!Array.isArray(value)||!value.length||value.some(item=>typeof item!=="string"||!item)||new Set(value).size!==value.length)fail("LEGACY_WEB_TOPOLOGY_LIST_INVALID",label);return value;};

export function verifyLegacyWebRuntimeTopology(value){
 exact(value,["formatVersion","topologyKind","status","operationMode","surfaces","compatibilityDecision","security","remainingRuntimeGates","productionImport"],"root");
 if(value.formatVersion!==1||value.topologyKind!=="yuzhou_hr_legacy_runtime_topology"||value.status!=="verified_distinct_surfaces"||value.operationMode!=="read_only")fail("LEGACY_WEB_TOPOLOGY_IDENTITY_INVALID","root");
 const serialized=JSON.stringify(value);
 if(/(?:\/Users\/|Downloads\/|(?:pass(?:word)?|token|secret)\s*[=:]|(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(serialized))fail("LEGACY_WEB_TOPOLOGY_SENSITIVE_CONTENT","root");
 if(!Array.isArray(value.surfaces)||value.surfaces.length!==3)fail("LEGACY_WEB_TOPOLOGY_SURFACE_SET_INVALID","count");
 const ids=new Set();
 for(const surface of value.surfaces){exact(surface,["id","runtime","technology","roleModel","entryEvidence"],`surface.${surface?.id}`);list(surface.entryEvidence,`${surface.id}.entryEvidence`);ids.add(surface.id);}
 for(const id of ["desktop_client","classic_group_network","database_web_menu"])if(!ids.has(id))fail("LEGACY_WEB_TOPOLOGY_SURFACE_SET_INVALID",id);
 const classic=value.surfaces.find(item=>item.id==="classic_group_network"),menu=value.surfaces.find(item=>item.id==="database_web_menu");
 if(classic.technology!=="classic_asp_dedicated_iis_site"||!classic.entryEvidence.includes("logincheck.asp"))fail("LEGACY_WEB_CLASSIC_SURFACE_INVALID","classic_group_network");
 if(menu.technology!=="asp_net_menu_contract"||!menu.entryEvidence.includes("Web_GetUserRight"))fail("LEGACY_WEB_MENU_SURFACE_INVALID","database_web_menu");
 exact(value.compatibilityDecision,["functionallyIdentical","desktopAuthority","classicWebAuthority","databaseMenuAuthority","targetStrategy"],"compatibilityDecision");
 if(value.compatibilityDecision.functionallyIdentical!==false||value.compatibilityDecision.targetStrategy!=="one_modern_hr_module_with_atomic_role_scopes")fail("LEGACY_WEB_COMPATIBILITY_DECISION_INVALID","compatibilityDecision");
 exact(value.security,["credentialsRecorded","personalValuesRecorded","screenshotsCommitted","writeActionsExecuted"],"security");
 if(Object.values(value.security).some(flag=>flag!==false))fail("LEGACY_WEB_SECURITY_INVALID","security");
 list(value.remainingRuntimeGates,"remainingRuntimeGates");
 if(value.productionImport!=="HOLD")fail("LEGACY_WEB_PRODUCTION_IMPORT_NOT_HELD",String(value.productionImport));
 return {ok:true,surfaces:value.surfaces.length,runtimeObserved:value.surfaces.filter(item=>item.runtime.startsWith("observed")).length,remainingRuntimeGates:value.remainingRuntimeGates.length,productionImport:value.productionImport};
}
