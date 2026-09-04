#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256=/^[a-f0-9]{64}$/u;
const ROUTE=/^\/[a-z0-9][a-z0-9/_-]*$/u;
const EXPECTED_BINDINGS={
 atomicTraversal:"scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json",
 familyTraversal:"scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json",
 modernMenuCandidates:"apps/web/lib/menu.ts"
};

export class LegacyClientMenuAtomicInventoryError extends Error{
 constructor(code,detail){super(`${code}: ${detail}`);this.name="LegacyClientMenuAtomicInventoryError";this.code=code;}
}
const fail=(code,detail)=>{throw new LegacyClientMenuAtomicInventoryError(code,detail);};
const digest=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>`${JSON.stringify(value)}\n`;
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const keys=(value,expected,label)=>{
 if(!object(value)||!same(Object.keys(value).sort(),[...expected].sort()))fail("CLIENT_MENU_CONTRACT_INVALID",`${label}:keys`);
};

function readBinding(repositoryRoot,binding,key){
 const expected=EXPECTED_BINDINGS[key];
 if(!object(binding)||binding.path!==expected||!SHA256.test(binding.sha256??""))fail("CLIENT_MENU_SOURCE_BINDING_INVALID",key);
 const bytes=readFileSync(resolve(repositoryRoot,binding.path));
 if(digest(bytes)!==binding.sha256)fail("CLIENT_MENU_SOURCE_EVIDENCE_DRIFT",key);
 return bytes;
}

function validateContract(contract){
 keys(contract,["formatVersion","contractKind","contractVersion","surface","status","sourceBindings","expectedCounts","familyTargets","candidatePolicy","containsPersonalData","productionImport"],"contract");
 if(contract.formatVersion!==1||contract.contractKind!=="yuzhou_hr_legacy_client_menu_atomic_inventory"||contract.surface!=="desktop_client"||contract.status!=="STATIC_CANDIDATES_PENDING_RUNTIME_AUTHORITY"||contract.containsPersonalData!==false||contract.productionImport!=="HOLD")fail("CLIENT_MENU_CONTRACT_INVALID","identity or safety boundary");
 if(!same(contract.expectedCounts,{entries:68,families:12}))fail("CLIENT_MENU_COUNT_CONTRACT_INVALID","expected counts");
 if(!object(contract.sourceBindings)||!same(Object.keys(contract.sourceBindings).sort(),Object.keys(EXPECTED_BINDINGS).sort()))fail("CLIENT_MENU_SOURCE_BINDING_INVALID","binding coverage");
 const policy=contract.candidatePolicy;
 if(!object(policy)||policy.sourceRelation!=="familyTraversal.menuFamilies[].entryPoints"||policy.routeEvidence!=="modernMenuCandidates static source only"||policy.missingLivePageAuthorityStatus!=="pending"||policy.missingRoleAuthorityStatus!=="pending"||policy.staticCandidateCompatibilityCredit!==0)fail("CLIENT_MENU_POLICY_INVALID","static candidate policy");
 if(!Array.isArray(contract.familyTargets)||contract.familyTargets.length!==12)fail("CLIENT_MENU_FAMILY_COVERAGE_INVALID","exact family target count");
 const familyIds=new Set();
 for(const target of contract.familyTargets){
  keys(target,["familyId","parentAtomicId","targetType","candidateRoutes"],`family:${target?.familyId}`);
  if(typeof target.familyId!=="string"||familyIds.has(target.familyId)||target.parentAtomicId!==`client.family.${target.familyId}`||!["modern_hr_route_candidate","shared_platform_route_candidate"].includes(target.targetType)||!Array.isArray(target.candidateRoutes)||target.candidateRoutes.length===0||target.candidateRoutes.some(route=>!ROUTE.test(route)))fail("CLIENT_MENU_FAMILY_TARGET_INVALID",String(target?.familyId));
  if(new Set(target.candidateRoutes).size!==target.candidateRoutes.length)fail("CLIENT_MENU_FAMILY_TARGET_INVALID",`${target.familyId}:duplicate route`);
  familyIds.add(target.familyId);
 }
}

export function buildLegacyClientMenuAtomicInventory({contract,repositoryRoot}){
 validateContract(contract);
 const evidence=Object.fromEntries(Object.entries(contract.sourceBindings).map(([key,binding])=>[key,readBinding(repositoryRoot,binding,key)]));
 const atomic=JSON.parse(evidence.atomicTraversal.toString("utf8"));
 const traversal=JSON.parse(evidence.familyTraversal.toString("utf8"));
 const modernMenu=evidence.modernMenuCandidates.toString("utf8");
 if(atomic.formatVersion!==1||atomic.inventoryKind!=="yuzhou_hr_legacy_desktop_client_atomic_entry_inventory"||atomic.surfaceIsolation?.evidenceCannotComeFrom?.includes("group_web")!==true||!Array.isArray(atomic.entries)||atomic.entries.length!==68)fail("CLIENT_MENU_ATOMIC_SOURCE_INVALID","desktop atomic source");
 if(traversal.formatVersion!==1||traversal.traversalKind!=="yuzhou_hr_legacy_client_live_traversal"||traversal.operationMode!=="read_only"||traversal.atomicInventoryContract?.entries!==68||!Array.isArray(traversal.menuFamilies)||traversal.menuFamilies.length!==12)fail("CLIENT_MENU_FAMILY_SOURCE_INVALID","family traversal source");
 const targetByFamily=new Map(contract.familyTargets.map(target=>[target.familyId,target]));
 const sourceFamilyById=new Map(traversal.menuFamilies.map(family=>[family.id,family]));
 if(targetByFamily.size!==12||sourceFamilyById.size!==12||!same([...targetByFamily.keys()].sort(),[...sourceFamilyById.keys()].sort()))fail("CLIENT_MENU_FAMILY_COVERAGE_INVALID","source and target families differ");
 for(const target of contract.familyTargets)for(const route of target.candidateRoutes)if(!modernMenu.includes(`href: "${route}"`))fail("CLIENT_MENU_ROUTE_CANDIDATE_UNBOUND",`${target.familyId}:${route}`);
 const ids=new Set();
 const ordinals=new Map();
 const entries=atomic.entries.map((entry,index)=>{
  if(!object(entry)||typeof entry.atomicId!=="string"||ids.has(entry.atomicId)||entry.surface!=="desktop_client"||typeof entry.entryPoint!=="string"||!entry.entryPoint||entry.observationStatus!=="pending"||entry.evidence?.mode!=="hash_only"||!Array.isArray(entry.evidence.sha256)||entry.evidence.sha256.some(hash=>!SHA256.test(hash))||entry.gapReasonCode!=="ATOMIC_RUNTIME_OBSERVATION_PENDING")fail("CLIENT_MENU_ATOMIC_ENTRY_INVALID",String(entry?.atomicId));
  ids.add(entry.atomicId);
  const family=sourceFamilyById.get(entry.familyId),target=targetByFamily.get(entry.familyId);
  if(!family||!target||!Array.isArray(family.entryPoints))fail("CLIENT_MENU_PARENT_RELATION_INVALID",entry.atomicId);
  const ordinal=(ordinals.get(entry.familyId)??0)+1;ordinals.set(entry.familyId,ordinal);
  if(family.entryPoints[ordinal-1]!==entry.entryPoint)fail("CLIENT_MENU_PARENT_RELATION_INVALID",entry.atomicId);
  const sourceEntrySha256=digest(canonical(entry));
  const parentRelationSha256=digest(canonical({familyId:entry.familyId,entryPoint:entry.entryPoint,ordinalWithinParent:ordinal}));
  const targetCandidateSha256=digest(canonical({targetType:target.targetType,candidateRoutes:target.candidateRoutes,routeSourceSha256:contract.sourceBindings.modernMenuCandidates.sha256}));
  return {atomicId:entry.atomicId,legacyName:entry.entryPoint,parentAtomicId:target.parentAtomicId,parentFamilyId:entry.familyId,ordinalWithinParent:ordinal,targetType:target.targetType,candidateRoutes:[...target.candidateRoutes],sourceEntrySha256,parentRelationSha256,targetCandidateSha256,legacyEvidenceHashes:[...entry.evidence.sha256],legacyObservationStatus:"pending",livePageAuthority:false,roleAuthority:false,runtimeEquivalenceStatus:"pending",candidateStatus:"STATIC_CANDIDATE_ONLY",gapReasonCode:entry.gapReasonCode,compatibilityCredit:0,sourceOrdinal:index+1};
 });
 for(const family of traversal.menuFamilies)if(ordinals.get(family.id)!==family.entryPoints.length)fail("CLIENT_MENU_PARENT_RELATION_INVALID",`${family.id}:entry count`);
 const body={formatVersion:1,artifactKind:"yuzhou_hr_legacy_client_menu_atomic_inventory_receipt",surface:"desktop_client",sourceEvidence:{atomicTraversalSha256:contract.sourceBindings.atomicTraversal.sha256,familyTraversalSha256:contract.sourceBindings.familyTraversal.sha256,modernMenuCandidatesSha256:contract.sourceBindings.modernMenuCandidates.sha256},summary:{entries:68,families:12,staticCandidates:68,pendingRuntimeAuthority:68,runtimeEquivalent:0,compatibilityCredit:0},entries,containsPersonalData:false,productionImport:"HOLD"};
 return {...body,receiptSha256:digest(canonical(body))};
}

function main(){
 const repositoryRoot=resolve(fileURLToPath(new URL("../../",import.meta.url)));
 const contract=JSON.parse(readFileSync(resolve(repositoryRoot,"scripts/hr-cutover/contracts/legacy-client-menu-atomic-inventory-v1.json"),"utf8"));
 process.stdout.write(`${JSON.stringify(buildLegacyClientMenuAtomicInventory({contract,repositoryRoot}),null,2)}\n`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){process.stderr.write(`${error.code??"CLIENT_MENU_ATOMIC_INVENTORY_FAILED"}\n`);process.exitCode=1;}
}
