import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebTrainingQueryCapabilityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name="GroupWebTrainingQueryCapabilityError";
    this.code=code;
  }
}
const fail=(code,detail)=>{throw new GroupWebTrainingQueryCapabilityError(code,detail);};
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>sha(`${JSON.stringify(value)}\n`);
const SOURCE_PATHS=[
 "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
 "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json",
 "scripts/hr-cutover/contracts/legacy-web-entry-target-binding-v1.json",
];

function assertContract(contract){
 if(contract?.formatVersion!==1||contract.contractKind!=="yuzhou_hr_group_web_static_interaction_candidate"||contract.contractVersion!=="training-query-1.0.0")fail("GROUP_WEB_TRAINING_CONTRACT_INVALID","identity");
 if(contract.status!=="pending_runtime_parity"||contract.compatibilityScoreContribution!==0||contract.productionImport!=="HOLD")fail("GROUP_WEB_TRAINING_FALSE_COMPLETION","root");
 if(JSON.stringify(contract.coverageCredit)!==JSON.stringify({groupWebNavigableEntries:{numerator:0,denominator:186},legacyInteractionParity:{numerator:0,denominator:6}}))fail("GROUP_WEB_TRAINING_COVERAGE_INVALID","coverageCredit");
 if(!Array.isArray(contract.sourceContracts)||JSON.stringify(contract.sourceContracts.map(row=>row.path))!==JSON.stringify(SOURCE_PATHS))fail("GROUP_WEB_TRAINING_SOURCE_SET_INVALID","paths");
 if(contract.candidate?.id!=="GROUP-WEB-INTERACTION-128-TRAINING-QUERY"||contract.candidate.legacyId!==128||contract.candidate.capabilityKey!=="training_record_query")fail("GROUP_WEB_TRAINING_CANDIDATE_INVALID","identity");
 if(contract.review?.status!=="pending"||contract.review.gapCode!=="GROUP_WEB_TRAINING_QUERY_RUNTIME_PARITY_NOT_OBSERVED"||contract.review.requiredEvidence!=="authenticated read-only employee-role observation of navigation, filter submission, scoped result rendering, empty state and forbidden-scope behavior")fail("GROUP_WEB_TRAINING_REVIEW_INVALID","review");
}

function verifySources(contract,{moduleMapping,sourceAudit,targetBinding,readTarget}){
 assertContract(contract);
 const values=[moduleMapping,sourceAudit,targetBinding];
 for(let index=0;index<SOURCE_PATHS.length;index+=1){
  const source=contract.sourceContracts[index];
  if(source.canonicalSha256!==canonical(values[index]))fail("GROUP_WEB_TRAINING_SOURCE_DRIFT",source.path);
 }
 const module=moduleMapping.items?.find(row=>row.legacyId===128);
 if(JSON.stringify(module)!==JSON.stringify(contract.candidate.legacyModule))fail("GROUP_WEB_TRAINING_MODULE_DRIFT","legacyId=128");
 const audit=sourceAudit.items?.find(row=>row.legacyId===128);
 if(JSON.stringify(audit)!==JSON.stringify(contract.candidate.staticSourceEvidence))fail("GROUP_WEB_TRAINING_AUDIT_DRIFT","legacyId=128");
 if(!audit.entryResolved||audit.traversedAspFiles!==2||audit.forms!==1||audit.controls!==10||audit.requestKeys!==10||audit.formActions!==1||audit.insertStatements!==0||audit.updateStatements!==0||audit.deleteStatements!==0||audit.stateTransitions!==0)fail("GROUP_WEB_TRAINING_STATIC_PROFILE_INVALID","legacyId=128");
 const shortcut=targetBinding.entries?.find(row=>row.name==="培训记录查询"&&row.legacyPath==="trainquery.aspx");
 if(JSON.stringify(shortcut)!==JSON.stringify(contract.candidate.modernTargetCrossReference))fail("GROUP_WEB_TRAINING_TARGET_BINDING_DRIFT","training shortcut");
 if(shortcut.status!=="mapped"||shortcut.targetRoute!=="/hr/training"||shortcut.reasonCode!==null)fail("GROUP_WEB_TRAINING_TARGET_INVALID","training shortcut");
 for(const evidence of shortcut.targetEvidence){
  const text=readTarget(evidence.file);
  if(typeof text!=="string"||!text.includes(evidence.symbol))fail("GROUP_WEB_TRAINING_TARGET_EVIDENCE_MISSING",`${evidence.kind}:${evidence.file}`);
 }
 return {
  status:"PENDING_RUNTIME_PARITY",
  candidateId:contract.candidate.id,
  proven:{sourceEntryIdentity:true,staticPageStructure:true,noStaticMutationStatements:true,modernTargetSymbols:true},
  unproven:{authenticatedNavigation:true,filterSubmission:true,scopedResultRendering:true,emptyState:true,forbiddenScope:true,sourceToShortcutIdentityEquivalence:true},
  coverageCredit:contract.coverageCredit,
  compatibilityScoreContribution:0,
  gapCode:contract.review.gapCode,
  productionImport:"HOLD",
 };
}

export function verifyGroupWebTrainingQueryCapabilitySources(contract,sources){
 return verifySources(contract,sources);
}

export function verifyGroupWebTrainingQueryCapability(root,contract){
 const canonicalRoot=realpathSync(root),prefix=`${canonicalRoot}${sep}`;
 const loaded=[];
 for(const source of contract.sourceContracts??[]){
  const path=resolve(canonicalRoot,source.path),stat=lstatSync(path),real=realpathSync(path);
  if(stat.isSymbolicLink()||!stat.isFile()||!real.startsWith(prefix))fail("GROUP_WEB_TRAINING_SOURCE_PATH_INVALID",source.path);
  const bytes=readFileSync(real);
  if(sha(bytes)!==source.rawSha256)fail("GROUP_WEB_TRAINING_SOURCE_RAW_HASH_DRIFT",source.path);
  loaded.push(JSON.parse(bytes.toString("utf8")));
 }
 const readTarget=relativePath=>{
  const path=resolve(canonicalRoot,relativePath),stat=lstatSync(path),real=realpathSync(path);
  if(stat.isSymbolicLink()||!stat.isFile()||!real.startsWith(prefix))fail("GROUP_WEB_TRAINING_TARGET_PATH_INVALID",relativePath);
  return readFileSync(real,"utf8");
 };
 return verifySources(contract,{moduleMapping:loaded[0],sourceAudit:loaded[1],targetBinding:loaded[2],readTarget});
}
