import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class LegacyDualSurfaceAtomicInventoryError extends Error { constructor(code,detail){super(`${code}: ${detail}`);this.code=code;} }
const fail=(code,detail)=>{throw new LegacyDualSurfaceAtomicInventoryError(code,detail);};
const sha64=value=>typeof value==="string"&&/^[0-9a-f]{64}$/u.test(value);
const fileHash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
const valueHash=value=>createHash("sha256").update(stable(value)).digest("hex");
const target=(route=null,disposition="missing")=>({route,api:null,entity:null,permission:null,test:null,disposition});
const legacy=(values={})=>({menu:null,page:null,table:null,field:null,rule:null,permission:null,action:null,dataScope:null,...values});
const record=({locator,surface,category,legacyValues,evidenceLevel,evidenceHash=null,missingReason=null,targetValue})=>({locator,surface,category,legacy:legacy(legacyValues),evidenceLevel,evidenceHash,missingReason,target:targetValue});
const shortcutCoverageKeys=["page","tabs","dialogs","thirdLevelMenus","fields","actions","states","rules"];
const shortcutListKeys=["pageIds","tabIds","dialogIds","thirdLevelMenuIds","fieldIds","actionIds","stateIds","ruleIds"];
const groupWebShortcutAuthority=Object.freeze({contractHash:"c8326ad75e81811eba11f08fc458715be65479786e0a020e03d66c67b5f95711",bindingHash:"ac1164055853cef37ba00ad68759ea0411ca4b7b8407619155ddfa5f819ca433",identityHash:"8f6c6c260e146336021ee08b814b9c88b0cbfeab8051bf0567f5f0cc5a63c4ce"});
const sourceContractsBySurface=Object.freeze({
  client:["scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json","scripts/hr-cutover/contracts/legacy-atomic-inventory.schema.json"],
  group_web:["scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json","scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json","scripts/hr-cutover/contracts/legacy-group-web-shortcut-cross-reference-v1.json","scripts/hr-cutover/contracts/legacy-web-entry-target-binding-v1.json"]
});
const exactKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
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
  const expectedPaths=sourceContractsBySurface[manifest.surface];
  if(!expectedPaths||!Array.isArray(manifest.sourceContracts)||manifest.sourceContracts.some(source=>!exactKeys(source,["path","sha256"]))||JSON.stringify(manifest.sourceContracts.map(source=>source.path))!==JSON.stringify(expectedPaths))fail("DUAL_SURFACE_SOURCE_SET_INVALID",String(manifest.surface));
  const rootPath=realpathSync(root),rootPrefix=`${rootPath}${sep}`;
  return Object.fromEntries(manifest.sourceContracts.map(source=>{
    const path=resolve(rootPath,source.path),stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile())fail("DUAL_SURFACE_SOURCE_PATH_INVALID",source.path);
    const canonicalPath=realpathSync(path);if(!canonicalPath.startsWith(rootPrefix)||!sha64(source.sha256)||fileHash(canonicalPath)!==source.sha256)fail("DUAL_SURFACE_SOURCE_HASH_DRIFT",source.path);
    return[source.path,JSON.parse(readFileSync(canonicalPath,"utf8"))];
  }));
}

function clientRecords(manifest,sources){
  const traversalSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-client-live-traversal-v1.json")),schemaSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-atomic-inventory.schema.json"));if(!traversalSource||!schemaSource)fail("DUAL_SURFACE_SOURCE_AUTHORITY_MISSING","client");
  const traversal=sources[traversalSource.path],schema=sources[schemaSource.path];
  if(traversal.menuFamilies.some(family=>family.id==="group_web_self_service"))fail("DUAL_SURFACE_CROSS_SURFACE_AUTHORITY","client traversal contains Group Web family");
  const derived={menuEntries:traversal.menuFamilies.reduce((sum,family)=>sum+family.entryPoints.length,0),tables:schema.properties.tables.minItems,fields:schema.properties.summary.properties.columns.const,rules:schema.properties.routines.minItems,authorizationGrantEdges:schema.properties.permissions.properties.expectedAuthorizationGrantEdges.const};derived.total=derived.menuEntries+derived.tables+derived.fields+derived.rules+derived.authorizationGrantEdges;
  if(JSON.stringify(manifest.expectedCounts)!==JSON.stringify(derived))fail("DUAL_SURFACE_EXPECTED_COUNT_DRIFT","client");
  const rows=[];for(const family of traversal.menuFamilies)for(const [index,name] of family.entryPoints.entries())rows.push(record({locator:`client:menu-entry:${family.id}:${String(index+1).padStart(2,"0")}`,surface:"client",category:"menu",legacyValues:{menu:name,page:family.id,action:null,dataScope:null},evidenceLevel:"INFERRED",evidenceHash:traversalSource.sha256,missingReason:"CLIENT_L4_ENTRY_TRAVERSAL_NOT_COMPLETE",targetValue:target(null,"missing_target_binding")}));
  for(const [category,key,prefix] of [["table","tables","table"],["field","fields","field"],["rule","rules","rule"],["authorization-grant-edge","authorizationGrantEdges","authorization-grant-edge"]])for(let ordinal=1;ordinal<=derived[key];ordinal+=1)rows.push(record({locator:`client:${prefix}:${String(ordinal).padStart(4,"0")}`,surface:"client",category,legacyValues:{},evidenceLevel:"MISSING",missingReason:manifest.unreviewedAtomicReason,targetValue:target()}));
  return{records:rows,authority:{menuEvidenceHash:traversalSource.sha256,derivedCounts:derived,recordEvidenceByLocator:Object.fromEntries(rows.map(row=>[row.locator,{level:row.evidenceLevel,hash:row.evidenceHash}]))}};
}

function groupWebRecords(manifest,sources){
  const mappingSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-group-web-module-mapping-v1.json")),auditSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-group-web-source-audit-v1.json")),shortcutSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-group-web-shortcut-cross-reference-v1.json")),bindingSource=manifest.sourceContracts.find(source=>source.path.endsWith("legacy-web-entry-target-binding-v1.json"));
  if(!mappingSource||!auditSource||!shortcutSource||!bindingSource)fail("DUAL_SURFACE_SOURCE_AUTHORITY_MISSING","group_web");
  const mapping=sources[mappingSource.path],audit=sources[auditSource.path],shortcutContract=sources[shortcutSource.path],binding=sources[bindingSource.path],byId=new Map(mapping.items.map(item=>[item.legacyId,item]));
  const menus=mapping.items.map(item=>record({locator:`group-web:menu:${item.legacyId}`,surface:"group_web",category:"menu",legacyValues:{menu:item.name,page:item.legacyUrl,table:item.legacyTable,dataScope:item.ownership},evidenceLevel:"DB",evidenceHash:mapping.sourceInventoryHash,missingReason:null,targetValue:target(item.targetRoutes,"mapped_route_only")}));
  const paths=audit.items.map(item=>{const menu=byId.get(item.legacyId);return record({locator:`group-web:source:${item.legacyId}`,surface:"group_web",category:"action",legacyValues:{menu:menu?.name??null,page:menu?.legacyUrl??null,table:menu?.legacyTable??null,action:"source_path_field_and_state_summary",dataScope:menu?.ownership??null},evidenceLevel:"SOURCE",evidenceHash:item.fieldEvidenceHash,missingReason:null,targetValue:target(menu?.targetRoutes??null,"source_only_target_unverified")});});
  const shortcutKeys=["formatVersion","contractKind","surface","status","sourceBindingContract","expectedShortcutCount","locatorPrefix","locatorOrdering","stableIdentityFields","atomicChain","observationStatus","gapReasonCode","compatibilityScoreContribution","productionImport"];
  if(!exactKeys(shortcutContract,shortcutKeys)||shortcutContract.formatVersion!==1||shortcutContract.contractKind!=="yuzhou_hr_legacy_group_web_shortcut_cross_reference"||shortcutContract.surface!=="group_web"||shortcutContract.status!=="pending_live_observation"||shortcutContract.sourceBindingContract?.path!==bindingSource.path||shortcutContract.sourceBindingContract?.sha256!==bindingSource.sha256||shortcutContract.expectedShortcutCount!==15||shortcutContract.locatorPrefix!=="group-web:shortcut:"||shortcutContract.locatorOrdering!=="binding_contract_order"||JSON.stringify(shortcutContract.stableIdentityFields)!==JSON.stringify(["name","legacyPath"])||JSON.stringify(shortcutContract.atomicChain)!==JSON.stringify(shortcutCoverageKeys)||shortcutContract.observationStatus!=="pending"||shortcutContract.gapReasonCode!=="GROUP_WEB_SHORTCUT_LIVE_OBSERVATION_PENDING"||shortcutContract.compatibilityScoreContribution!==0||shortcutContract.productionImport!=="HOLD")fail("DUAL_SURFACE_SHORTCUT_CONTRACT_INVALID","group_web");
  if(binding.sourceEntryCount!==15||binding.entries?.length!==15||binding.roleMatrixVerified!==false||binding.compatibilityScoreContribution!==0||binding.productionImport!=="HOLD")fail("DUAL_SURFACE_SHORTCUT_BINDING_INVALID","group_web");
  const shortcutIdentities=new Set();
  const crossReferences=binding.entries.map((entry,index)=>{
    const identity=`${entry.name}\u0000${entry.legacyPath}`;if(shortcutIdentities.has(identity)||typeof entry.name!=="string"||!entry.name||typeof entry.legacyPath!=="string"||!entry.legacyPath)fail("DUAL_SURFACE_SHORTCUT_IDENTITY_INVALID",String(index));shortcutIdentities.add(identity);
    const canonicalMenuLocators=mapping.items.filter(item=>item.targetRoutes?.includes(entry.targetRoute)).map(item=>`group-web:menu:${item.legacyId}`).sort();
    return{locator:`group-web:shortcut:${String(index+1).padStart(3,"0")}`,surface:"group_web",entryPoint:entry.name,legacyPath:entry.legacyPath,targetRoute:entry.targetRoute,canonicalMenuLocators,referenceStatus:canonicalMenuLocators.length?"mapped_to_group_menu":"target_route_only",observationStatus:"pending",coverage:Object.fromEntries(shortcutCoverageKeys.map(key=>[key,false])),...Object.fromEntries(shortcutListKeys.map(key=>[key,[]])),evidence:{mode:"hash_only",sha256:[]},gapReasonCode:"GROUP_WEB_SHORTCUT_LIVE_OBSERVATION_PENDING"};
  });
  const derived={menuEntries:mapping.items.length,sourcePaths:audit.items.length,shortcutCrossReferences:crossReferences.length,total:mapping.items.length+audit.items.length};if(JSON.stringify(manifest.expectedCounts)!==JSON.stringify(derived))fail("DUAL_SURFACE_EXPECTED_COUNT_DRIFT","group_web");
  const records=[...menus,...paths];return {records,crossReferences,authority:{menuEvidenceHash:mapping.sourceInventoryHash,actionEvidenceByLocator:Object.fromEntries(audit.items.map(item=>[`group-web:source:${item.legacyId}`,item.fieldEvidenceHash])),shortcutContractHash:shortcutSource.sha256,shortcutBindingHash:bindingSource.sha256,shortcutIdentityHash:valueHash(crossReferences.map(({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus})=>({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus}))),derivedCounts:derived,recordEvidenceByLocator:Object.fromEntries(records.map(row=>[row.locator,{level:row.evidenceLevel,hash:row.evidenceHash}]))}};
}

function materialized(surface,manifest,built){const evidenceAuthority=built.authority,base={formatVersion:1,surface,inventoryVersion:manifest.inventoryVersion,previousInventoryHash:manifest.previousInventoryHash,sourceSetSha256:valueHash(manifest.sourceContracts),evidenceAuthority,evidenceAuthoritySha256:valueHash(evidenceAuthority),records:built.records};return built.crossReferences?{...base,crossReferences:built.crossReferences}:base;}

export function verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb,previousPair=null){
  const levels=new Set(["TRAVERSED","DB","SOURCE","TARGET","INFERRED","MISSING"]),categories=new Set(["menu","page","table","field","rule","authorization-grant-edge","permission","action","data-scope"]),all=[...client.records,...groupWeb.records],locators=new Set();
  if(client.surface!=="client"||groupWeb.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","surfaces");
  if(Object.hasOwn(client,"crossReferences"))fail("DUAL_SURFACE_CROSS_SURFACE_AUTHORITY","client shortcut references forbidden");
  for(const inventory of [client,groupWeb]){
    if(inventory.formatVersion!==1||!Number.isInteger(inventory.inventoryVersion)||inventory.inventoryVersion<1||(inventory.inventoryVersion===1?inventory.previousInventoryHash!==null:!sha64(inventory.previousInventoryHash))||!sha64(inventory.sourceSetSha256)||inventory.evidenceAuthoritySha256!==valueHash(inventory.evidenceAuthority))fail("DUAL_SURFACE_CHAIN_INVALID",inventory.surface);
    if(inventory.inventoryVersion>1){
      const previous=inventory.surface==="client"?previousPair?.client:previousPair?.groupWeb;if(!previous||inventory.previousInventoryHash!==valueHash(previous)||inventory.inventoryVersion!==previous.inventoryVersion+1)fail("DUAL_SURFACE_CHAIN_INVALID",`${inventory.surface}:previous`);
      const priorByLocator=new Map(previous.records.map(row=>[row.locator,row])),rank={MISSING:0,INFERRED:1,DB:2,SOURCE:2,TRAVERSED:3,TARGET:4};
      if(inventory.records.length!==previous.records.length)fail("DUAL_SURFACE_CHAIN_SEMANTIC_DRIFT",`${inventory.surface}:record-count`);
      for(const row of inventory.records){const prior=priorByLocator.get(row.locator);if(!prior||rank[row.evidenceLevel]<rank[prior.evidenceLevel])fail("DUAL_SURFACE_CHAIN_DOWNGRADE",row.locator);if(row.surface!==prior.surface||row.category!==prior.category||valueHash(row.legacy)!==valueHash(prior.legacy)||row.target.disposition!==prior.target.disposition)fail("DUAL_SURFACE_CHAIN_SEMANTIC_DRIFT",row.locator);}
    }
  }
  if(!Array.isArray(groupWeb.crossReferences)||groupWeb.crossReferences.length!==15)fail("DUAL_SURFACE_SHORTCUT_COUNT_INVALID",String(groupWeb.crossReferences?.length));
  const groupMenuLocators=new Set(groupWeb.records.filter(row=>row.category==="menu").map(row=>row.locator));
  const shortcutShape=["locator","surface","entryPoint","legacyPath","targetRoute","canonicalMenuLocators","referenceStatus","observationStatus","coverage",...shortcutListKeys,"evidence","gapReasonCode"];
  for(const shortcut of groupWeb.crossReferences){
    if(!exactKeys(shortcut,shortcutShape)||shortcut.surface!=="group_web"||!/^group-web:shortcut:\d{3}$/u.test(shortcut.locator)||locators.has(shortcut.locator))fail("DUAL_SURFACE_SHORTCUT_LOCATOR_INVALID",String(shortcut.locator));locators.add(shortcut.locator);
    if(shortcut.observationStatus!=="pending"||shortcut.gapReasonCode!=="GROUP_WEB_SHORTCUT_LIVE_OBSERVATION_PENDING"||!exactKeys(shortcut.coverage,shortcutCoverageKeys)||shortcutCoverageKeys.some(key=>shortcut.coverage[key]!==false)||shortcutListKeys.some(key=>!Array.isArray(shortcut[key])||shortcut[key].length)||!exactKeys(shortcut.evidence,["mode","sha256"])||shortcut.evidence.mode!=="hash_only"||!Array.isArray(shortcut.evidence.sha256)||shortcut.evidence.sha256.length)fail("DUAL_SURFACE_SHORTCUT_FALSE_OBSERVATION",shortcut.locator);
    if(!Array.isArray(shortcut.canonicalMenuLocators)||new Set(shortcut.canonicalMenuLocators).size!==shortcut.canonicalMenuLocators.length||shortcut.canonicalMenuLocators.some(locator=>!groupMenuLocators.has(locator))||(shortcut.canonicalMenuLocators.length?shortcut.referenceStatus!=="mapped_to_group_menu":shortcut.referenceStatus!=="target_route_only"))fail("DUAL_SURFACE_SHORTCUT_MENU_REFERENCE_INVALID",shortcut.locator);
  }
  if(groupWeb.inventoryVersion>1){
    const previous=previousPair?.groupWeb;if(!Array.isArray(previous?.crossReferences)||previous.crossReferences.length!==groupWeb.crossReferences.length)fail("DUAL_SURFACE_SHORTCUT_CHAIN_DRIFT","count");
    for(let index=0;index<groupWeb.crossReferences.length;index+=1){
      const current=groupWeb.crossReferences[index],prior=previous.crossReferences[index];
      if(current.locator!==prior.locator||current.entryPoint!==prior.entryPoint||current.legacyPath!==prior.legacyPath||current.targetRoute!==prior.targetRoute)fail("DUAL_SURFACE_SHORTCUT_CHAIN_DRIFT",current.locator);
      if(JSON.stringify(current.canonicalMenuLocators)!==JSON.stringify(prior.canonicalMenuLocators)||current.referenceStatus!==prior.referenceStatus)fail("DUAL_SURFACE_SHORTCUT_CHAIN_DRIFT",`${current.locator}:canonical-menu`);
    }
  }
  const shortcutIdentityHash=valueHash(groupWeb.crossReferences.map(({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus})=>({locator,entryPoint,legacyPath,targetRoute,canonicalMenuLocators,referenceStatus})));
  if(groupWeb.evidenceAuthority.shortcutIdentityHash!==shortcutIdentityHash||groupWeb.inventoryVersion===1&&(groupWeb.evidenceAuthority.shortcutContractHash!==groupWebShortcutAuthority.contractHash||groupWeb.evidenceAuthority.shortcutBindingHash!==groupWebShortcutAuthority.bindingHash||shortcutIdentityHash!==groupWebShortcutAuthority.identityHash))fail("DUAL_SURFACE_SHORTCUT_AUTHORITY_DRIFT","group_web");
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
  assertNoSensitiveContent([...all,...groupWeb.crossReferences],"inventory");
  const count=(rows,category)=>rows.filter(item=>item.category===category).length;
  const summary={client:{total:client.records.length,menuEntries:count(client.records,"menu"),tables:count(client.records,"table"),fields:count(client.records,"field"),rules:count(client.records,"rule"),authorizationGrantEdges:count(client.records,"authorization-grant-edge")},groupWeb:{total:groupWeb.records.length,menuEntries:count(groupWeb.records,"menu"),sourcePaths:count(groupWeb.records,"action"),shortcutCrossReferences:groupWeb.crossReferences.length}};
  if(JSON.stringify(summary.client)!==JSON.stringify({total:3721,menuEntries:68,tables:162,fields:2364,rules:212,authorizationGrantEdges:915})||JSON.stringify(summary.groupWeb)!==JSON.stringify({total:417,menuEntries:231,sourcePaths:186,shortcutCrossReferences:15}))fail("DUAL_SURFACE_COUNT_CONSERVATION_FAILED",JSON.stringify(summary));
  const evidenceLevels=Object.fromEntries([...levels].map(level=>[level,all.filter(item=>item.evidenceLevel===level).length]));
  const clientInventorySha256=valueHash(client),groupWebInventorySha256=valueHash(groupWeb);return{status:"PASS",summary,evidenceLevels,clientInventorySha256,groupWebInventorySha256,combinedInventorySha256:valueHash({clientInventorySha256,groupWebInventorySha256}),productionImport:"HOLD"};
}

export function buildDualSurfaceAtomicInventories(root,clientManifest,groupWebManifest){
  if(clientManifest.surface!=="client"||groupWebManifest.surface!=="group_web")fail("DUAL_SURFACE_IDENTITY_INVALID","manifest surface");
  const client=materialized("client",clientManifest,clientRecords(clientManifest,loadSources(root,clientManifest))),groupWeb=materialized("group_web",groupWebManifest,groupWebRecords(groupWebManifest,loadSources(root,groupWebManifest)));
  return{client,groupWeb,report:verifyMaterializedDualSurfaceAtomicInventories(client,groupWeb)};
}
