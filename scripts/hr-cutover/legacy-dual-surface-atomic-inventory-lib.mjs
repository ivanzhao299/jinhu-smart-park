import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class LegacyDualSurfaceAtomicInventoryError extends Error { constructor(code,detail){super(`${code}: ${detail}`);this.code=code;} }
const fail=(code,detail)=>{throw new LegacyDualSurfaceAtomicInventoryError(code,detail);};
const sha64=value=>typeof value==="string"&&/^[0-9a-f]{64}$/u.test(value);
const fileHash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
const target=(route=null,disposition="missing")=>({route,api:null,entity:null,permission:null,test:null,disposition});
const legacy=(values={})=>({menu:null,page:null,table:null,field:null,rule:null,permission:null,action:null,dataScope:null,...values});
const record=({locator,surface,category,legacyValues,evidenceLevel,evidenceHash=null,missingReason=null,targetValue})=>({locator,surface,category,legacy:legacy(legacyValues),evidenceLevel,evidenceHash,missingReason,target:targetValue});
const securityPattern=/(?:Bearer\s+[A-Za-z0-9._-]+|https?:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)|\/Users\/|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/iu;

function loadSources(root,manifest){
  if(manifest.productionImport!=="HOLD"||manifest.status!=="skeleton_with_existing_evidence")fail("DUAL_SURFACE_BOUNDARY_INVALID",manifest.surface);
  return Object.fromEntries(manifest.sourceContracts.map(source=>{
    const path=resolve(root,source.path);if(!sha64(source.sha256)||fileHash(path)!==source.sha256)fail("DUAL_SURFACE_SOURCE_HASH_DRIFT",source.path);
    return[source.path,JSON.parse(readFileSync(path,"utf8"))];
  }));
}

function clientRecords(manifest,sources){
  const traversal=sources[manifest.sourceContracts[0].path],rows=[];
  for(const family of traversal.menuFamilies)for(const [index,name] of family.entryPoints.entries())rows.push(record({locator:`client:menu-entry:${family.id}:${String(index+1).padStart(2,"0")}`,surface:"client",category:"menu",legacyValues:{menu:name,page:family.id,action:null,dataScope:null},evidenceLevel:"INFERRED",evidenceHash:manifest.sourceContracts[0].sha256,missingReason:"CLIENT_L4_ENTRY_TRAVERSAL_NOT_COMPLETE",targetValue:target(null,"missing_target_binding")}));
  for(const [category,count,prefix] of [["table",162,"table"],["field",2364,"field"],["rule",212,"rule"],["permission",915,"permission"]])for(let ordinal=1;ordinal<=count;ordinal+=1)rows.push(record({locator:`client:${prefix}:${String(ordinal).padStart(4,"0")}`,surface:"client",category,legacyValues:{},evidenceLevel:"MISSING",missingReason:manifest.unreviewedAtomicReason,targetValue:target()}));
  return rows;
}

function groupWebRecords(manifest,sources){
  const mapping=sources[manifest.sourceContracts[0].path],audit=sources[manifest.sourceContracts[1].path],byId=new Map(mapping.items.map(item=>[item.legacyId,item]));
  const menus=mapping.items.map(item=>record({locator:`group-web:menu:${item.legacyId}`,surface:"group_web",category:"menu",legacyValues:{menu:item.name,page:item.legacyUrl,table:item.legacyTable,dataScope:item.ownership},evidenceLevel:"DB",evidenceHash:mapping.sourceInventoryHash,missingReason:null,targetValue:target(item.targetRoutes,"mapped_route_only")}));
  const paths=audit.items.map(item=>{const menu=byId.get(item.legacyId);return record({locator:`group-web:source:${item.legacyId}`,surface:"group_web",category:"action",legacyValues:{menu:menu?.name??null,page:menu?.legacyUrl??null,table:menu?.legacyTable??null,action:"source_path_field_and_state_summary",dataScope:menu?.ownership??null},evidenceLevel:"SOURCE",evidenceHash:item.fieldEvidenceHash,missingReason:null,targetValue:target(menu?.targetRoutes??null,"source_only_target_unverified")});});
  return [...menus,...paths];
}

export function verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb){
  const levels=new Set(["TRAVERSED","DB","SOURCE","TARGET","INFERRED","MISSING"]),categories=new Set(["menu","page","table","field","rule","permission","action","data-scope"]),all=[...client.records,...groupWeb.records],locators=new Set();
  if(client.surface!=="client"||groupWeb.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","surfaces");
  for(const item of all){
    if(typeof item.locator!=="string"||!item.locator.startsWith(`${item.surface==="group_web"?"group-web":"client"}:`)||locators.has(item.locator))fail("DUAL_SURFACE_LOCATOR_INVALID",String(item.locator));locators.add(item.locator);
    if(!levels.has(item.evidenceLevel)||!categories.has(item.category)||Object.keys(item.legacy).sort().join(",")!=="action,dataScope,field,menu,page,permission,rule,table"||Object.keys(item.target).sort().join(",")!=="api,disposition,entity,permission,route,test")fail("DUAL_SURFACE_RECORD_SHAPE_INVALID",item.locator);
    if(item.evidenceLevel==="MISSING"){if(!item.missingReason||item.evidenceHash!==null)fail("DUAL_SURFACE_MISSING_REASON_INVALID",item.locator);}else if(!sha64(item.evidenceHash))fail("DUAL_SURFACE_EVIDENCE_HASH_INVALID",item.locator);
    if(item.evidenceLevel==="TRAVERSED"&&item.missingReason)fail("DUAL_SURFACE_TRAVERSED_UNSUPPORTED",item.locator);
    const expectedLevel=item.locator.startsWith("client:menu-entry:")?"INFERRED":item.locator.startsWith("client:")?"MISSING":item.locator.startsWith("group-web:menu:")?"DB":item.locator.startsWith("group-web:source:")?"SOURCE":null;
    if(item.evidenceLevel!==expectedLevel)fail("DUAL_SURFACE_EVIDENCE_LEVEL_PROMOTION_FORBIDDEN",item.locator);
  }
  if(securityPattern.test(stable(all)))fail("DUAL_SURFACE_SENSITIVE_CONTENT","inventory");
  const count=(rows,category)=>rows.filter(item=>item.category===category).length;
  const summary={client:{total:client.records.length,menuEntries:count(client.records,"menu"),tables:count(client.records,"table"),fields:count(client.records,"field"),rules:count(client.records,"rule"),permissions:count(client.records,"permission")},groupWeb:{total:groupWeb.records.length,menuEntries:count(groupWeb.records,"menu"),sourcePaths:count(groupWeb.records,"action")}};
  if(JSON.stringify(summary.client)!==JSON.stringify({total:3736,menuEntries:83,tables:162,fields:2364,rules:212,permissions:915})||JSON.stringify(summary.groupWeb)!==JSON.stringify({total:417,menuEntries:231,sourcePaths:186}))fail("DUAL_SURFACE_COUNT_CONSERVATION_FAILED",JSON.stringify(summary));
  const evidenceLevels=Object.fromEntries([...levels].map(level=>[level,all.filter(item=>item.evidenceLevel===level).length]));
  return{status:"PASS",summary,evidenceLevels,productionImport:"HOLD"};
}

export function buildDualSurfaceAtomicInventories(root,clientManifest,groupWebManifest){
  if(clientManifest.surface!=="client"||groupWebManifest.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","manifest surface");
  const client={surface:"client",records:clientRecords(clientManifest,loadSources(root,clientManifest))},groupWeb={surface:"group_web",records:groupWebRecords(groupWebManifest,loadSources(root,groupWebManifest))};
  return{client,groupWeb,report:verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb)};
}
