import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class LegacyDualSurfaceAtomicInventoryError extends Error { constructor(code,detail){super(`${code}: ${detail}`);this.code=code;} }
const fail=(code,detail)=>{throw new LegacyDualSurfaceAtomicInventoryError(code,detail);};
const sha64=value=>typeof value==="string"&&/^[0-9a-f]{64}$/u.test(value);
const fileHash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
const valueHash=value=>createHash("sha256").update(stable(value)).digest("hex");
const target=(route=null,disposition="missing")=>({route,api:null,entity:null,permission:null,test:null,disposition});
const legacy=(values={})=>({menu:null,page:null,table:null,field:null,rule:null,permission:null,action:null,dataScope:null,...values});
const record=({locator,surface,category,legacyValues,evidenceLevel,evidenceHash=null,missingReason=null,targetValue})=>({locator,surface,category,legacy:legacy(legacyValues),evidenceLevel,evidenceHash,missingReason,target:targetValue});
const securityPattern=/(?:Bearer\s+[A-Za-z0-9._-]+|(?:password|passwd|pwd|secret|token)\s*[:=]\s*\S+|(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3})(?::\d+)?|\/Users\/|[A-Za-z]:[\\/]|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/iu;
const decodeEntities=value=>value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/giu,(_match,hex,decimal)=>String.fromCodePoint(Number.parseInt(hex??decimal,hex?16:10)));
function decodedVariants(input){
 const values=new Set([input]);let current=input;
 for(let depth=0;depth<3;depth+=1){
  const candidates=[decodeEntities(current)];try{candidates.push(decodeURIComponent(current));}catch{/* malformed percent encoding stays inspectable as raw text */}
  if(/^[A-Za-z0-9+/_-]+={0,2}$/u.test(current)&&current.length>=16)try{candidates.push(Buffer.from(current,current.includes("-")||current.includes("_")?"base64url":"base64").toString("utf8"));}catch{/* invalid base64 */}
  if(/^[0-9a-f]+$/iu.test(current)&&current.length>=24&&current.length%2===0)candidates.push(Buffer.from(current,"hex").toString("utf8"));
  const next=candidates.find(value=>typeof value==="string"&&!values.has(value));if(!next)break;for(const value of candidates)if(typeof value==="string")values.add(value);current=next;
 }
 return [...values];
}
function assertNoSensitiveContent(value,label){
 if(typeof value==="string"){for(const candidate of decodedVariants(value))if(securityPattern.test(candidate))fail("DUAL_SURFACE_SENSITIVE_CONTENT",label);return;}
 if(Array.isArray(value)){for(const item of value)assertNoSensitiveContent(item,label);return;}
 if(value&&typeof value==="object")for(const item of Object.values(value))assertNoSensitiveContent(item,label);
}

function loadSources(root,manifest){
  if(manifest.productionImport!=="HOLD"||manifest.status!=="skeleton_with_existing_evidence")fail("DUAL_SURFACE_BOUNDARY_INVALID",manifest.surface);
  if(!Number.isInteger(manifest.inventoryVersion)||manifest.inventoryVersion<1||(manifest.inventoryVersion===1?manifest.previousInventoryHash!==null:!sha64(manifest.previousInventoryHash)))fail("DUAL_SURFACE_CHAIN_INVALID",manifest.surface);
  return Object.fromEntries(manifest.sourceContracts.map(source=>{
    const path=resolve(root,source.path);if(!sha64(source.sha256)||fileHash(path)!==source.sha256)fail("DUAL_SURFACE_SOURCE_HASH_DRIFT",source.path);
    return[source.path,JSON.parse(readFileSync(path,"utf8"))];
  }));
}

function clientRecords(manifest,sources){
  const traversalSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-client-live-traversal-v1.json")),schemaSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-atomic-inventory.schema.json"));if(!traversalSource||!schemaSource)fail("DUAL_SURFACE_SOURCE_AUTHORITY_MISSING","client");
  const traversal=sources[traversalSource.path],schema=sources[schemaSource.path],derived={menuEntries:traversal.menuFamilies.reduce((sum,family)=>sum+family.entryPoints.length,0),tables:schema.properties.tables.minItems,fields:schema.properties.summary.properties.columns.const,rules:schema.properties.routines.minItems,permissions:schema.properties.permissions.properties.expectedAuthorizationRows.const};derived.total=derived.menuEntries+derived.tables+derived.fields+derived.rules+derived.permissions;
  if(JSON.stringify(manifest.expectedCounts)!==JSON.stringify(derived))fail("DUAL_SURFACE_EXPECTED_COUNT_DRIFT","client");
  const rows=[];for(const family of traversal.menuFamilies)for(const [index,name] of family.entryPoints.entries())rows.push(record({locator:`client:menu-entry:${family.id}:${String(index+1).padStart(2,"0")}`,surface:"client",category:"menu",legacyValues:{menu:name,page:family.id,action:null,dataScope:null},evidenceLevel:"INFERRED",evidenceHash:traversalSource.sha256,missingReason:"CLIENT_L4_ENTRY_TRAVERSAL_NOT_COMPLETE",targetValue:target(null,"missing_target_binding")}));
  for(const [category,key,prefix] of [["table","tables","table"],["field","fields","field"],["rule","rules","rule"],["permission","permissions","permission"]])for(let ordinal=1;ordinal<=derived[key];ordinal+=1)rows.push(record({locator:`client:${prefix}:${String(ordinal).padStart(4,"0")}`,surface:"client",category,legacyValues:{},evidenceLevel:"MISSING",missingReason:manifest.unreviewedAtomicReason,targetValue:target()}));
  return{records:rows,authority:{menuEvidenceHash:traversalSource.sha256,derivedCounts:derived,recordEvidenceByLocator:Object.fromEntries(rows.map(row=>[row.locator,{level:row.evidenceLevel,hash:row.evidenceHash}]))}};
}

function groupWebRecords(manifest,sources){
  const mapping=sources[manifest.sourceContracts[0].path],audit=sources[manifest.sourceContracts[1].path],byId=new Map(mapping.items.map(item=>[item.legacyId,item]));
  const menus=mapping.items.map(item=>record({locator:`group-web:menu:${item.legacyId}`,surface:"group_web",category:"menu",legacyValues:{menu:item.name,page:item.legacyUrl,table:item.legacyTable,dataScope:item.ownership},evidenceLevel:"DB",evidenceHash:mapping.sourceInventoryHash,missingReason:null,targetValue:target(item.targetRoutes,"mapped_route_only")}));
  const paths=audit.items.map(item=>{const menu=byId.get(item.legacyId);return record({locator:`group-web:source:${item.legacyId}`,surface:"group_web",category:"action",legacyValues:{menu:menu?.name??null,page:menu?.legacyUrl??null,table:menu?.legacyTable??null,action:"source_path_field_and_state_summary",dataScope:menu?.ownership??null},evidenceLevel:"SOURCE",evidenceHash:item.fieldEvidenceHash,missingReason:null,targetValue:target(menu?.targetRoutes??null,"source_only_target_unverified")});});
  const derived={menuEntries:mapping.items.length,sourcePaths:audit.items.length,total:mapping.items.length+audit.items.length};if(JSON.stringify(manifest.expectedCounts)!==JSON.stringify(derived))fail("DUAL_SURFACE_EXPECTED_COUNT_DRIFT","group_web");
  const records=[...menus,...paths];return {records,authority:{menuEvidenceHash:mapping.sourceInventoryHash,actionEvidenceByLocator:Object.fromEntries(audit.items.map(item=>[`group-web:source:${item.legacyId}`,item.fieldEvidenceHash])),derivedCounts:derived,recordEvidenceByLocator:Object.fromEntries(records.map(row=>[row.locator,{level:row.evidenceLevel,hash:row.evidenceHash}]))}};
}

function materialized(surface,manifest,built){const evidenceAuthority=built.authority;return{formatVersion:1,surface,inventoryVersion:manifest.inventoryVersion,previousInventoryHash:manifest.previousInventoryHash,sourceSetSha256:valueHash(manifest.sourceContracts),evidenceAuthority,evidenceAuthoritySha256:valueHash(evidenceAuthority),records:built.records};}

export function verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb,previousPair=null){
  const levels=new Set(["TRAVERSED","DB","SOURCE","TARGET","INFERRED","MISSING"]),categories=new Set(["menu","page","table","field","rule","permission","action","data-scope"]),all=[...client.records,...groupWeb.records],locators=new Set();
  if(client.surface!=="client"||groupWeb.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","surfaces");
  for(const inventory of [client,groupWeb]){
    if(inventory.formatVersion!==1||!Number.isInteger(inventory.inventoryVersion)||inventory.inventoryVersion<1||(inventory.inventoryVersion===1?inventory.previousInventoryHash!==null:!sha64(inventory.previousInventoryHash))||!sha64(inventory.sourceSetSha256)||inventory.evidenceAuthoritySha256!==valueHash(inventory.evidenceAuthority))fail("DUAL_SURFACE_CHAIN_INVALID",inventory.surface);
    if(inventory.inventoryVersion>1){const previous=inventory.surface==="client"?previousPair?.client:previousPair?.groupWeb;if(!previous||inventory.previousInventoryHash!==valueHash(previous)||inventory.inventoryVersion!==previous.inventoryVersion+1)fail("DUAL_SURFACE_CHAIN_INVALID",`${inventory.surface}:previous`);const priorByLocator=new Map(previous.records.map(row=>[row.locator,row]));const rank={MISSING:0,INFERRED:1,DB:2,SOURCE:2,TRAVERSED:3,TARGET:4};for(const row of inventory.records){const prior=priorByLocator.get(row.locator);if(!prior||rank[row.evidenceLevel]<rank[prior.evidenceLevel])fail("DUAL_SURFACE_CHAIN_DOWNGRADE",row.locator);}}
  }
  for(const item of all){
    if(typeof item.locator!=="string"||!item.locator.startsWith(`${item.surface==="group_web"?"group-web":"client"}:`)||locators.has(item.locator))fail("DUAL_SURFACE_LOCATOR_INVALID",String(item.locator));locators.add(item.locator);
    if(!levels.has(item.evidenceLevel)||!categories.has(item.category)||Object.keys(item.legacy).sort().join(",")!=="action,dataScope,field,menu,page,permission,rule,table"||Object.keys(item.target).sort().join(",")!=="api,disposition,entity,permission,route,test")fail("DUAL_SURFACE_RECORD_SHAPE_INVALID",item.locator);
    if(item.evidenceLevel==="MISSING"){if(!item.missingReason||item.evidenceHash!==null)fail("DUAL_SURFACE_MISSING_REASON_INVALID",item.locator);}else if(!sha64(item.evidenceHash))fail("DUAL_SURFACE_EVIDENCE_HASH_INVALID",item.locator);
    if(item.evidenceLevel==="TRAVERSED"&&item.missingReason)fail("DUAL_SURFACE_TRAVERSED_UNSUPPORTED",item.locator);
    const inventory=item.surface==="client"?client:groupWeb,authority=inventory.evidenceAuthority.recordEvidenceByLocator?.[item.locator];
    const expectedLevel=inventory.inventoryVersion===1?(item.locator.startsWith("client:menu-entry:")?"INFERRED":item.locator.startsWith("client:")?"MISSING":item.locator.startsWith("group-web:menu:")?"DB":item.locator.startsWith("group-web:source:")?"SOURCE":null):authority?.level;
    if(item.evidenceLevel!==expectedLevel)fail("DUAL_SURFACE_EVIDENCE_LEVEL_PROMOTION_FORBIDDEN",item.locator);
    if(!authority||authority.level!==item.evidenceLevel||authority.hash!==item.evidenceHash)fail("DUAL_SURFACE_EVIDENCE_AUTHORITY_DRIFT",item.locator);
    if(item.evidenceLevel==="MISSING"&&(item.target.disposition!=="missing"||Object.entries(item.target).some(([key,value])=>key!=="disposition"&&value!==null)))fail("DUAL_SURFACE_MISSING_TARGET_PROMOTION",item.locator);
    if(["implemented","tested","verified","approved"].includes(item.target.disposition)&&(item.evidenceLevel==="MISSING"||["route","api","entity","permission","test"].some(key=>item.target[key]===null)))fail("DUAL_SURFACE_TARGET_PROMOTION_FORBIDDEN",item.locator);
    if(item.locator.startsWith("client:menu-entry:")&&item.evidenceHash!==client.evidenceAuthority.menuEvidenceHash)fail("DUAL_SURFACE_EVIDENCE_AUTHORITY_DRIFT",item.locator);
    if(item.locator.startsWith("group-web:menu:")&&item.evidenceHash!==groupWeb.evidenceAuthority.menuEvidenceHash)fail("DUAL_SURFACE_EVIDENCE_AUTHORITY_DRIFT",item.locator);
    if(item.locator.startsWith("group-web:source:")&&item.evidenceHash!==groupWeb.evidenceAuthority.actionEvidenceByLocator[item.locator])fail("DUAL_SURFACE_EVIDENCE_AUTHORITY_DRIFT",item.locator);
  }
  assertNoSensitiveContent(all,"inventory");
  const count=(rows,category)=>rows.filter(item=>item.category===category).length;
  const summary={client:{total:client.records.length,menuEntries:count(client.records,"menu"),tables:count(client.records,"table"),fields:count(client.records,"field"),rules:count(client.records,"rule"),permissions:count(client.records,"permission")},groupWeb:{total:groupWeb.records.length,menuEntries:count(groupWeb.records,"menu"),sourcePaths:count(groupWeb.records,"action")}};
  if(JSON.stringify(summary.client)!==JSON.stringify({total:3736,menuEntries:83,tables:162,fields:2364,rules:212,permissions:915})||JSON.stringify(summary.groupWeb)!==JSON.stringify({total:417,menuEntries:231,sourcePaths:186}))fail("DUAL_SURFACE_COUNT_CONSERVATION_FAILED",JSON.stringify(summary));
  const evidenceLevels=Object.fromEntries([...levels].map(level=>[level,all.filter(item=>item.evidenceLevel===level).length]));
  const clientInventorySha256=valueHash(client),groupWebInventorySha256=valueHash(groupWeb);return{status:"PASS",summary,evidenceLevels,clientInventorySha256,groupWebInventorySha256,combinedInventorySha256:valueHash({clientInventorySha256,groupWebInventorySha256}),productionImport:"HOLD"};
}

export function buildDualSurfaceAtomicInventories(root,clientManifest,groupWebManifest){
  if(clientManifest.surface!=="client"||groupWebManifest.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","manifest surface");
  const client=materialized("client",clientManifest,clientRecords(clientManifest,loadSources(root,clientManifest))),groupWeb=materialized("group_web",groupWebManifest,groupWebRecords(groupWebManifest,loadSources(root,groupWebManifest)));
  return{client,groupWeb,report:verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb)};
}
