#!/usr/bin/env node
/* global process, structuredClone, URL */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { currentState, validateConfig } from "./full-domain-lifecycle.mjs";
import { verifyManifestChain } from "./parent-manifest.mjs";
import { compareRehearsals, computeMappingContractHash } from "./verify-full-domain-contract.mjs";
import { validateYuzhouLiveRoleUatEvidencePair } from "./yuzhou-live-role-uat-evidence-lib.mjs";
import { canonicalYuzhouJobStateMachineJson } from "./yuzhou-job-state-machine-attestation.mjs";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const FULL_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/full-domain-contract-v1.json"),"utf8"));
const DEFAULT_PAIR_CONTRACT=resolve(ROOT,"scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json");
const P0_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"),"utf8"));
const UAT_TASK_CARD=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"),"utf8"));
const UAT_API_MATRIX=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json"),"utf8"));
const UAT_BROWSER_MATRIX=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"),"utf8"));
const TARGET_FIELDS=["database","composeProject","volume","postgresContainer","postgresPort","apiPort","webPort","role","accountNamespace","root","stagingRoot","evidenceRoot","fileRoot","credentialArtifact","materializationKeyArtifact","jobStateDecisionArtifact","jobStateSourcePayloadArtifact","jobStateMachineAttestationArtifact","auditBundle"];
const TARGET_PATH_FIELDS=["root","stagingRoot","evidenceRoot","fileRoot","credentialArtifact","materializationKeyArtifact","jobStateDecisionArtifact","jobStateSourcePayloadArtifact","jobStateMachineAttestationArtifact","auditBundle"];
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const sha256=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>`${JSON.stringify(value,null,2)}\n`;

export function validatePairContract(contract){
  if(contract?.formatVersion!==1||contract.contractKind!=="yuzhou_hr_final_rehearsal_pair"||contract.executionBoundary!=="isolated_lab_only"||contract.productionImport!=="HOLD")fail("FINAL_PAIR_CONTRACT_INVALID","identity/boundary");
  if(JSON.stringify(contract.rehearsalOrder)!==JSON.stringify(["A","B"])||JSON.stringify(contract.domainOrder)!==JSON.stringify(["T0","T1","T2","T3","T4","T5"])||JSON.stringify(contract.rollbackOrder)!==JSON.stringify(["T5","T4","T3","T2","T1","T0"]))fail("FINAL_PAIR_ORDER_INVALID","domain order");
  const expected={T2:{contracts:802,changes:357},T4:{fullYears:[2010,2026],fullRows:46092,fullItems:1078020,fullCloses:1431,fullNet:"102194056.8000",hotRows:8342,coldArchiveRows:37750,coldArchiveItems:887140,coldArchiveCloses:1165,coldArchiveNet:"86471046.8900",coldEmployeeUnmappedRows:34},T5:{rows:20163}};
  if(JSON.stringify(contract.sourceFacts)!==JSON.stringify(expected)||contract.sourceFacts.T4.fullRows!==contract.sourceFacts.T4.hotRows+contract.sourceFacts.T4.coldArchiveRows||contract.sourceFacts.T4.fullItems!==190880+contract.sourceFacts.T4.coldArchiveItems||contract.sourceFacts.T4.fullCloses!==266+contract.sourceFacts.T4.coldArchiveCloses)fail("FINAL_PAIR_FACTS_DRIFT","frozen source facts");
  if(JSON.stringify(contract.requiredStages)!==JSON.stringify(["provision","T0_T5","technical_uat","p0_matrix","backup_restore_fault","pair_compare","T5_T0_rollback","cleanup"]))fail("FINAL_PAIR_STAGES_INVALID","continuous stages");
  if(JSON.stringify(contract.requiredFinalState)!==JSON.stringify({state:"cleaned",residualCount:0,p0Execution:"PASS",productionImport:"HOLD"}))fail("FINAL_PAIR_FINAL_STATE_INVALID","final state");
  return {status:"PASS",sha256:sha256(canonical(contract)),productionImport:"HOLD"};
}

export function validatePairPreflight(configAInput,configBInput,contract,{currentSha,mappingContractHash,worktreeClean=true}={}){
  validatePairContract(contract);
  const rawA=structuredClone(configAInput),rawB=structuredClone(configBInput);delete rawA.__configPath;delete rawA.__ordinal;delete rawB.__configPath;delete rawB.__ordinal;
  const a=validateConfig(rawA),b=validateConfig(rawB);
  if(a.rehearsal!=="A"||b.rehearsal!=="B")fail("FINAL_PAIR_ORDER_INVALID","configs must be A then B");
  if(JSON.stringify(a.triple)!==JSON.stringify(b.triple))fail("FINAL_PAIR_TRIPLE_MISMATCH","C/S/M differs");
  if(a.triple.codeSha!==currentSha||a.triple.mappingContractHash!==mappingContractHash)fail("FINAL_PAIR_TRIPLE_MISMATCH","checkout or mapping bundle differs");
  if(!worktreeClean)fail("FINAL_PAIR_WORKTREE_DIRTY","clean byte-exact checkout required");
  if(a.source.readOnly!==true||b.source.readOnly!==true||a.backend!=="lab"||b.backend!=="lab")fail("FINAL_PAIR_SOURCE_UNSAFE","read-only lab configs required");
  validatePairResourceIsolation(a,b);
  return {status:"PASS",triple:a.triple,contractSha256:sha256(canonical(contract)),productionImport:"HOLD"};
}

function overlaps(left,right){const rel=relative(resolve(left),resolve(right));return rel===""||(!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.startsWith(sep));}
export function validatePairResourceIsolation(a,b){
  for(const field of TARGET_FIELDS)if(a.target[field]===b.target[field])fail("FINAL_PAIR_RESOURCE_REUSE",field);
  if(new Set([a.target.postgresPort,a.target.apiPort,a.target.webPort,b.target.postgresPort,b.target.apiPort,b.target.webPort]).size!==6)fail("FINAL_PAIR_RESOURCE_REUSE","ports");
  for(const leftField of TARGET_PATH_FIELDS)for(const rightField of TARGET_PATH_FIELDS){
    const left=a.target[leftField],right=b.target[rightField];
    if(overlaps(left,right)||overlaps(right,left))fail("FINAL_PAIR_RESOURCE_OVERLAP",`${leftField}:${rightField}`);
  }
  return {status:"PASS",databases:2,ports:6,pathIdentities:TARGET_PATH_FIELDS.length*2,productionImport:"HOLD"};
}

export function validateRuntimeVacancy(configs,{busyPorts=[],composeProjects=[],containers=[],volumes=[],networks=[],occupiedPaths=[]}={}){
  const busy=new Set(busyPorts.map(Number)),projects=new Set(composeProjects),containerNames=new Set(containers),volumeNames=new Set(volumes),networkNames=new Set(networks),paths=new Set(occupiedPaths.map(value=>resolve(value)));
  for(const config of configs){
    for(const port of [config.target.postgresPort,config.target.apiPort,config.target.webPort])if(busy.has(port))fail("FINAL_PAIR_RUNTIME_BUSY",`port:${port}`);
    if(projects.has(config.target.composeProject))fail("FINAL_PAIR_RUNTIME_BUSY",`compose:${config.target.composeProject}`);
    if(containerNames.has(config.target.postgresContainer))fail("FINAL_PAIR_RUNTIME_BUSY",`container:${config.target.postgresContainer}`);
    if(volumeNames.has(config.target.volume))fail("FINAL_PAIR_RUNTIME_BUSY",`volume:${config.target.volume}`);
    if(networkNames.has(`${config.target.composeProject}_default`))fail("FINAL_PAIR_RUNTIME_BUSY",`network:${config.target.composeProject}_default`);
    for(const field of ["root","stagingRoot","evidenceRoot","fileRoot","auditBundle"]){const value=config.target[field];if(typeof value==="string"&&paths.has(resolve(value)))fail("FINAL_PAIR_RUNTIME_BUSY",`${field}:${value}`);}
  }
  return {status:"PASS",checkedPorts:6,checkedProjects:2,checkedRuntimePaths:10,productionImport:"HOLD"};
}

function lines(commandName,args){const result=spawnSync(commandName,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});if(result.status!==0)fail("FINAL_PAIR_RUNTIME_CHECK_FAILED",commandName);return result.stdout.split("\n").map(row=>row.trim()).filter(Boolean);}
function runtimeSnapshot(configs){
  const busyPorts=[];for(const config of configs)for(const port of [config.target.postgresPort,config.target.apiPort,config.target.webPort])if(spawnSync("nc",["-z","127.0.0.1",String(port)],{stdio:"ignore"}).status===0)busyPorts.push(port);
  const containers=lines("docker",["ps","-a","--format","{{.Names}}"]),volumes=lines("docker",["volume","ls","--format","{{.Name}}"]),networks=lines("docker",["network","ls","--format","{{.Name}}"]),composeProjects=[];
  for(const config of configs)if(lines("docker",["ps","-a","--filter",`label=com.docker.compose.project=${config.target.composeProject}`,"--format","{{.ID}}"]).length)composeProjects.push(config.target.composeProject);
  const occupiedPaths=[];for(const config of configs)for(const field of ["root","stagingRoot","evidenceRoot","fileRoot","auditBundle"]){const value=config.target[field];if(existsSync(value))occupiedPaths.push(value);}
  return {busyPorts,composeProjects,containers,volumes,networks,occupiedPaths};
}

function command(script,args){
  const result=spawnSync(process.execPath,[resolve(ROOT,script),...args],{cwd:ROOT,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(result.status!==0){
    const diagnostics=`${result.stdout}\n${result.stderr}`.match(/T5_LOAD_STAGE=[a-z_]+/g);
    fail("FINAL_PAIR_STAGE_FAILED",`${script}:${diagnostics?.at(-1)??result.stderr.trim().split("\n").at(-1)??result.status}`);
  }
  const line=result.stdout.trim().split("\n").filter(Boolean).at(-1);return line?JSON.parse(line):{};
}
function readHead(config){
  const chain=JSON.parse(readFileSync(config.verification.manifestChainFile,"utf8")),verified=verifyManifestChain(chain,{evidenceRoot:config.target.evidenceRoot});
  return chain.find(row=>row.sha256===verified.headSha256)?.manifest??fail("FINAL_PAIR_MANIFEST_MISSING",config.rehearsal);
}
export function assertP0Summary(summary,rehearsal,evidence){
  const matrixSha256=sha256(canonical(P0_CONTRACT)),expectedIds=P0_CONTRACT.checks.map(row=>row.id);
  const observations=evidence?.observations;
  const expectedRequests=P0_CONTRACT.checks.reduce((sum,row)=>sum+1+(row.supportRoutes?.length??0),0);
  const observationValid=row=>{
    const check=P0_CONTRACT.checks.find(item=>item.id===row?.id),copy={...row};delete copy.evidenceSha256;
    return check&&row.status==="PASS"&&row.actor===check.actor&&Number.isInteger(row.statusCode)&&/^[0-9a-f]{64}$/u.test(row.responseSha256??"")&&row.responseByteLength>0&&row.supportResponses===(check.supportRoutes?.length??0)&&JSON.stringify(Object.keys(row.assertions??{}))===JSON.stringify(check.assertions)&&Object.values(row.assertions).every(value=>value===true)&&row.evidenceSha256===sha256(canonical(copy));
  };
  if(summary?.formatVersion!==1||summary.status!=="PASS"||summary.productionImport!=="HOLD"||summary.humanUat!=="HOLD"||summary.legacyTaskCard?.p0Execution!=="PASS"||summary.legacyTaskCard.p0MatrixChecks!==25||summary.legacyTaskCard.p0MatrixSha256!==matrixSha256||summary.legacyTaskCard.p0ObservedChecks!==25||summary.legacyTaskCard.p0FailedChecks!==0||!Array.isArray(observations)||evidence?.formatVersion!==1||evidence.status!=="PASS"||evidence.technicalUat!=="PASS"||evidence.humanUat!=="HOLD"||evidence.productionImport!=="HOLD"||evidence.p0MatrixSha256!==matrixSha256||evidence.requestCount!==expectedRequests||evidence.observedChecks!==25||evidence.failedChecks!==0||evidence.responseEvidenceSha256!==sha256(canonical(observations))||JSON.stringify(observations.map(row=>row.id))!==JSON.stringify(expectedIds)||observations.some(row=>!observationValid(row))||summary.legacyTaskCard.p0EvidenceSha256!==sha256(canonical(evidence)))fail("FINAL_PAIR_P0_HOLD",`${rehearsal}:25 immutable P0 observations required while human UAT remains detached HOLD`);
  return {status:"PASS",checkCount:25,humanUat:"HOLD"};
}
function assertP0Executed(config){
  const summaryPath=resolve(config.target.evidenceRoot,"technical-uat-summary.json"),evidencePath=resolve(config.target.evidenceRoot,"technical-uat-p0-observations.json");
  for(const path of [summaryPath,evidencePath])if(!existsSync(path)||lstatSync(path).isSymbolicLink()||(statSync(path).mode&0o777)!==0o600)fail("FINAL_PAIR_P0_HOLD",`${config.rehearsal}:private P0 evidence missing`);
  const summary=JSON.parse(readFileSync(summaryPath,"utf8")),evidence=JSON.parse(readFileSync(evidencePath,"utf8"));
  if(summary.parentRunId!==config.runId||evidence.parentRunId!==config.runId)fail("FINAL_PAIR_P0_HOLD",`${config.rehearsal}:run identity mismatch`);
  return assertP0Summary(summary,config.rehearsal,evidence);
}
function privateEvidencePath(config,relativePath){
  if(typeof relativePath!=="string"||basename(relativePath)!==relativePath)fail("FINAL_PAIR_BROWSER_EVIDENCE_INVALID",`${config.rehearsal}:path`);
  const path=resolve(config.target.evidenceRoot,relativePath);
  if(!existsSync(path)||lstatSync(path).isSymbolicLink()||(statSync(path).mode&0o777)!==0o600)fail("FINAL_PAIR_BROWSER_EVIDENCE_INVALID",`${config.rehearsal}:${relativePath}`);
  return path;
}
function assertManifestEvidence(manifest,config,kind,relativePath,path){
  const bytes=readFileSync(path),digest=sha256(bytes),matches=(manifest?.evidence??[]).filter(row=>row.kind===kind&&row.relativePath===relativePath);
  if(matches.length!==1||matches[0].sha256!==digest||matches[0].bytes!==bytes.length||matches[0].mode!=="0600"||matches[0].redacted!==true)fail("FINAL_PAIR_BROWSER_MANIFEST_UNBOUND",`${config.rehearsal}:${relativePath}`);
}
export function assertTechnicalUatTargetIdentity(evidence,config){if(evidence?.targetIdentityHash!==sha256(JSON.stringify(config.target)))fail("FINAL_PAIR_TARGET_IDENTITY_UNBOUND",config.rehearsal);return {status:"PASS",targetIdentityHash:evidence.targetIdentityHash};}
export function assertTechnicalUatPairEvidence(configs,manifests){
  const pair={},expectedCells=UAT_BROWSER_MATRIX.checks.length*UAT_TASK_CARD.viewports.length;
  for(const config of configs){
    const manifest=manifests.find(row=>row.rehearsal===config.rehearsal)??fail("FINAL_PAIR_MANIFEST_MISSING",config.rehearsal);
    const files={legacy:"technical-uat-legacy-evidence.json",browser:"technical-uat-browser-matrix-observations.json",summary:"technical-uat-summary.json"};
    const paths=Object.fromEntries(Object.entries(files).map(([key,name])=>[key,privateEvidencePath(config,name)]));
    const legacy=JSON.parse(readFileSync(paths.legacy,"utf8")),browser=JSON.parse(readFileSync(paths.browser,"utf8")),summary=JSON.parse(readFileSync(paths.summary,"utf8"));
    assertTechnicalUatTargetIdentity(legacy,config);
    if(summary.parentRunId!==config.runId||summary.status!=="PASS"||summary.humanUat!=="HOLD"||summary.productionImport!=="HOLD"||summary.legacyTaskCard?.browserViewportCells!==expectedCells)fail("FINAL_PAIR_BROWSER_SUMMARY_INVALID",config.rehearsal);
    if(browser.parentRunId!==config.runId||browser.runId!==config.runId||browser.rehearsal!==config.rehearsal||JSON.stringify(browser.triple)!==JSON.stringify(config.triple)||browser.status!=="PASS"||browser.humanAttestation!=="HOLD"||browser.productionImport!=="HOLD"||browser.observedCells!==expectedCells||browser.observations?.length!==expectedCells||!Array.isArray(browser.screenshots)||browser.screenshots.length===0)fail("FINAL_PAIR_BROWSER_EVIDENCE_INVALID",config.rehearsal);
    const actorHashes=Object.fromEntries((legacy.actors??[]).map(actor=>[actor.actor,actor.subjectHash])),proofs=browser.sessionCleanupProofs,expectedProofKeys=new Set(["hr_reviewer","manager","employee"].flatMap(actor=>UAT_TASK_CARD.viewports.map(viewport=>`${actor}:${viewport.id}`)));
    if(!Array.isArray(proofs)||proofs.length!==6||new Set(proofs.map(proof=>`${proof.actor}:${proof.viewportId}`)).size!==6||proofs.some(proof=>!expectedProofKeys.has(`${proof.actor}:${proof.viewportId}`)||proof.runId!==config.runId||proof.rehearsal!==config.rehearsal||JSON.stringify(proof.triple)!==JSON.stringify(config.triple)||proof.actorSubjectHash!==actorHashes[proof.actor]||proof.status!=="PASS"||proof.localStorageEntries!==0||proof.sessionStorageEntries!==0||proof.cookieEntries!==0||proof.sensitiveDomMatches!==0||proof.proofSha256!==sha256(JSON.stringify({runId:proof.runId,rehearsal:proof.rehearsal,triple:proof.triple,actor:proof.actor,actorSubjectHash:proof.actorSubjectHash,viewportId:proof.viewportId,localStorageEntries:proof.localStorageEntries,sessionStorageEntries:proof.sessionStorageEntries,cookieEntries:proof.cookieEntries,sensitiveDomMatches:proof.sensitiveDomMatches,status:proof.status})))||browser.sessionCleanupProofsSha256!==sha256(JSON.stringify(proofs)))fail("FINAL_PAIR_BROWSER_SESSION_PROOF_INVALID",config.rehearsal);
    const browserCellHashes=new Set(browser.observations.map(row=>row.cellEvidenceSha256)),legacyCellHashes=new Set((legacy.items??[]).flatMap(item=>Object.values(item.browser??{}).flatMap(byViewport=>Object.values(byViewport).map(row=>row.cellEvidenceSha256))));
    if(browserCellHashes.size!==expectedCells||legacyCellHashes.size!==expectedCells||[...browserCellHashes].some(hash=>!legacyCellHashes.has(hash)))fail("FINAL_PAIR_BROWSER_CELL_SET_UNBOUND",config.rehearsal);
    const screenshotHashes=new Set();
    for(const descriptor of browser.screenshots){
      if(!/^[0-9a-f]{64}$/u.test(descriptor?.sha256??""))fail("FINAL_PAIR_BROWSER_SCREENSHOT_INVALID",config.rehearsal);
      const path=privateEvidencePath(config,descriptor.relativePath),digest=sha256(readFileSync(path));
      if(digest!==descriptor.sha256||screenshotHashes.has(digest))fail("FINAL_PAIR_BROWSER_SCREENSHOT_INVALID",`${config.rehearsal}:${descriptor.relativePath}`);
      screenshotHashes.add(digest);assertManifestEvidence(manifest,config,"technical_uat_browser_screenshot",descriptor.relativePath,path);
    }
    if(browser.observations.some(row=>!screenshotHashes.has(row.screenshotSha256)))fail("FINAL_PAIR_BROWSER_SCREENSHOT_UNBOUND",config.rehearsal);
    if(new Set(browser.observations.map(row=>row.screenshotSha256)).size!==screenshotHashes.size)fail("FINAL_PAIR_BROWSER_SCREENSHOT_UNBOUND",`${config.rehearsal}:descriptor reuse`);
    assertManifestEvidence(manifest,config,"technical_uat_legacy_evidence",files.legacy,paths.legacy);
    assertManifestEvidence(manifest,config,"technical_uat_browser_matrix_observations",files.browser,paths.browser);
    assertManifestEvidence(manifest,config,"technical_uat_summary",files.summary,paths.summary);
    pair[config.rehearsal]=legacy;
  }
  const result=validateYuzhouLiveRoleUatEvidencePair(pair,UAT_TASK_CARD,configs[0].triple,UAT_API_MATRIX,UAT_BROWSER_MATRIX);
  return {...result,humanUat:"HOLD",productionImport:"HOLD"};
}
export function assertCleanupEvidence(result,bundle,rehearsal){
  if(result?.state!=="cleaned"||result.residualCount!==0||result.productionImport!=="HOLD")fail("FINAL_PAIR_RESIDUAL_NONZERO",rehearsal);
  if(bundle?.finalState!=="cleaned"||bundle.productionImport!=="HOLD"||!Array.isArray(bundle.resourceLedger)||bundle.resourceLedger.some(row=>row.removed!==true||row.residualCount!==0))fail("FINAL_PAIR_CLEANUP_EVIDENCE_INVALID",rehearsal);
  return {status:"PASS",residualCount:0};
}
function assertCleanup(config,result){
  const bundle=JSON.parse(readFileSync(config.target.auditBundle,"utf8"));
  assertCleanupEvidence(result,bundle,config.rehearsal);
  return sha256(readFileSync(config.target.auditBundle));
}
function recover(config){
  if(!existsSync(config.target.root))return;
  const result=spawnSync(process.execPath,[resolve(ROOT,"scripts/hr-cutover/full-domain-lifecycle.mjs"),"cleanup","--config",config.__configPath,"--recover"],{cwd:ROOT,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(result.status!==0)fail("FINAL_PAIR_RECOVERY_FAILED",`${config.rehearsal}:${result.stderr.trim().split("\n").at(-1)??result.status}`);
  const row=JSON.parse(result.stdout.trim().split("\n").filter(Boolean).at(-1)??"{}");
  if(row.residualCount!==0||row.productionImport!=="HOLD")fail("FINAL_PAIR_RECOVERY_FAILED",`${config.rehearsal}:residual`);
}

export function runFinalPair(configAInput,configBInput,contract,{execute=command,resumeOnly=false,machineArtifacts=()=>fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED","two-phase machine artifacts required"),p0Gate=assertP0Executed,manifestHead=readHead,pairCompare=compareRehearsals,uatPairGate=assertTechnicalUatPairEvidence,cleanupGate=assertCleanup,recovery=recover}={}){
  const configs=[structuredClone(configAInput),structuredClone(configBInput)],completed=[],manifests=[];
  try{
    if(!resumeOnly){for(const config of configs)execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["provision","--config",config.__configPath]);for(const config of configs)execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["run","--config",config.__configPath]);}
    for(const config of configs){
      const machine=machineArtifacts(config);if(!machine?.decision||!machine?.payload||!machine?.machineAttestation)fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED",config.rehearsal);
      execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["resume","--config",config.__configPath,"--job-state-decision",machine.decision,"--job-state-source-payload",machine.payload,"--job-state-machine-attestation",machine.machineAttestation]);
      execute("scripts/hr-cutover/run-full-domain-technical-uat.mjs",["--config",config.__configPath]);
      p0Gate(config);
      execute("scripts/hr-cutover/rehearsal-backup-restore.mjs",["--config",config.__configPath,"--fault","REGISTERED_FILE_UNREADABLE"]);
      manifests.push(manifestHead(config));
    }
    pairCompare(manifests[0],manifests[1]);
    uatPairGate(configs,manifests);
    for(const config of [...configs].reverse()){
      const manifest=manifests.find(row=>row.rehearsal===config.rehearsal)??manifests[config.rehearsal==="A"?0:1];
      execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["rollback","--config",config.__configPath]);
      const cleanup=execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["cleanup","--config",config.__configPath]);
      completed.push({rehearsal:config.rehearsal,manifestSha256:sha256(canonical(manifest)),cleanupAuditSha256:cleanupGate(config,cleanup),residualCount:0});
    }
    completed.sort((a,b)=>a.rehearsal.localeCompare(b.rehearsal));
    return {formatVersion:1,status:"PASS",contractSha256:sha256(canonical(contract)),triple:configs[0].triple,rehearsals:completed,sourceFacts:contract.sourceFacts,humanUat:"HOLD",productionImport:"HOLD"};
  }catch(error){
    const recoveryFailures=[];for(const config of configs){try{recovery(config);}catch(recoveryError){recoveryFailures.push(`${config.rehearsal}:${recoveryError.code??"FAILED"}`);}}
    if(recoveryFailures.length)fail("FINAL_PAIR_RECOVERY_FAILED",`${error.code??"STAGE_FAILED"};${recoveryFailures.join(",")}`);
    throw error;
  }
}

function reviewHoldEvidence(config){if(currentState(config)!=="review_hold")fail("FINAL_PAIR_REVIEW_HOLD_REQUIRED",config.rehearsal);const path=resolve(config.target.evidenceRoot,"lifecycle-journal.jsonl"),bytes=readFileSync(path),rows=bytes.toString("utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)),extracts=rows.filter(row=>row.kind==="child"&&row.domain==="T0"&&row.phase==="extract"&&row.status==="verified"),gate=rows.findLast(row=>row.kind==="state"&&row.state==="review_hold");if(extracts.length!==1||!extracts[0].extractManifestSha256||!extracts[0].extractBindingSha256||gate?.gate!=="MACHINE_ATTESTATION_REQUIRED"||gate.checkpointVersion!==2||gate.trustedRootSha256!==config.machineAttestation?.trustedRootSha256)fail("FINAL_PAIR_T0_CHECKPOINT_INVALID",config.rehearsal);return{state:"review_hold",gate:"MACHINE_ATTESTATION_REQUIRED",checkpointVersion:2,trustedRootSha256:gate.trustedRootSha256,t0ExtractManifestSha256:extracts[0].extractManifestSha256,t0ExtractBindingSha256:extracts[0].extractBindingSha256,journalSha256:sha256(bytes)};}
export function runFinalPairExtract(configAInput,configBInput,{execute=command,checkpointEvidence=reviewHoldEvidence}={}){const configs=[structuredClone(configAInput),structuredClone(configBInput)];try{for(const config of configs)execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["provision","--config",config.__configPath]);for(const config of configs){const result=execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["run","--config",config.__configPath]);if(result?.state!=="review_hold"||result.gate!=="MACHINE_ATTESTATION_REQUIRED"||result.checkpointVersion!==2||result.trustedRootSha256!==config.machineAttestation?.trustedRootSha256)fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED",config.rehearsal);}const runs=configs.map(config=>({rehearsal:config.rehearsal,runId:config.runId,configSha256:sha256(canonical({runId:config.runId,triple:config.triple,target:config.target})),...checkpointEvidence(config)}));const checkpointRootSha256=sha256(`yuzhou-final-rehearsal-pair-checkpoint-v2\0${canonicalYuzhouJobStateMachineJson({triple:configs[0].triple,runs})}`);return{formatVersion:2,checkpointKind:"yuzhou_final_rehearsal_pair_machine_gate",status:"REVIEW_HOLD",triple:configs[0].triple,runs,checkpointRootSha256,productionImport:"HOLD"};}catch(error){for(const config of configs)recover(config);throw error;}}

export function validateMachineResumeCheckpoint(checkpoint,configs,{checkpointEvidence=reviewHoldEvidence}={}){
  const checkpointRootSha256=sha256(`yuzhou-final-rehearsal-pair-checkpoint-v2\0${canonicalYuzhouJobStateMachineJson({triple:checkpoint?.triple,runs:checkpoint?.runs})}`);
  const invalid=checkpoint?.formatVersion!==2||checkpoint.checkpointKind!=="yuzhou_final_rehearsal_pair_machine_gate"||checkpoint.checkpointRootSha256!==checkpointRootSha256||checkpoint.status!=="REVIEW_HOLD"||checkpoint.productionImport!=="HOLD"||JSON.stringify(checkpoint.triple)!==JSON.stringify(configs[0].triple)||checkpoint.runs?.length!==2||configs.some(config=>{const row=checkpoint.runs.find(item=>item.rehearsal===config.rehearsal);if(!row||row.runId!==config.runId||row.configSha256!==sha256(canonical({runId:config.runId,triple:config.triple,target:config.target}))||row.state!=="review_hold"||row.gate!=="MACHINE_ATTESTATION_REQUIRED"||row.checkpointVersion!==2||row.trustedRootSha256!==config.machineAttestation?.trustedRootSha256)return true;const actual=checkpointEvidence(config);return row.t0ExtractManifestSha256!==actual.t0ExtractManifestSha256||row.t0ExtractBindingSha256!==actual.t0ExtractBindingSha256||row.journalSha256!==actual.journalSha256;});
  if(invalid)fail("FINAL_PAIR_CHECKPOINT_INVALID","checkpoint v2 drift; legacy v1 can only rollback or cleanup");
  return{status:"PASS",checkpointRootSha256,productionImport:"HOLD"};
}

function parse(argv){const out={execute:false};for(let i=0;i<argv.length;i+=1){const arg=argv[i];if(arg==="--execute")out.execute=true;else if(["--config-a","--config-b","--contract","--summary","--phase","--checkpoint","--decision-a","--payload-a","--machine-attestation-a","--decision-b","--payload-b","--machine-attestation-b"].includes(arg))out[arg.slice(2).replace(/-([a-z])/gu,(_m,x)=>x.toUpperCase())]=argv[++i];else fail("FINAL_PAIR_ARGUMENT_INVALID",arg);}if(!out.configA||!out.configB)fail("FINAL_PAIR_ARGUMENT_INVALID","--config-a and --config-b required");return out;}
function privateJson(path,value){if(existsSync(path))fail("FINAL_PAIR_SUMMARY_EXISTS",path);writeFileSync(path,canonical(value),{mode:0o600,flag:"wx"});chmodSync(path,0o600);}
function mode(path){return(statSync(path).mode&0o777).toString(8).padStart(4,"0");}
function inside(parent,child){const rel=relative(parent,child);return rel===""||(!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.startsWith(sep));}

function canonicalPlannedPath(input){
  let cursor=resolve(input);const missing=[];
  while(!existsSync(cursor)){const parent=dirname(cursor);if(parent===cursor)return resolve(input);missing.unshift(basename(cursor));cursor=parent;}
  return resolve(realpathSync(cursor),...missing);
}
function validateMachineRoot(records,rehearsal,uid){
  const roots=new Set(records.map(record=>dirname(record.path)));
  if(roots.size!==1)fail("FINAL_PAIR_REVIEW_ROOT_SCATTERED",rehearsal);
  const root=[...roots][0];
  let info;
  try{info=lstatSync(root);}catch{fail("FINAL_PAIR_REVIEW_ROOT_UNSAFE",rehearsal);}
  if(info.isSymbolicLink()||!info.isDirectory()||(info.mode&0o777)!==0o700||(uid!==undefined&&info.uid!==uid)||realpathSync(root)!==root)fail("FINAL_PAIR_REVIEW_ROOT_UNSAFE",rehearsal);
  for(const record of records){
    if(record.requested!==record.path)fail("FINAL_PAIR_REVIEW_ROOT_UNSAFE",record.label);
    let cursor=dirname(record.path);
    while(true){
      const directory=lstatSync(cursor),permissions=directory.mode&0o777;
      if(directory.isSymbolicLink()||!directory.isDirectory()||(uid!==undefined&&directory.uid!==uid)||(cursor===root?permissions!==0o700:(permissions&0o022)!==0)||realpathSync(cursor)!==cursor)fail("FINAL_PAIR_REVIEW_ROOT_UNSAFE",record.label);
      if(cursor===root)break;
      const parent=dirname(cursor);if(parent===cursor||!inside(root,parent))fail("FINAL_PAIR_REVIEW_ROOT_UNSAFE",record.label);cursor=parent;
    }
  }
  return root;
}

export function validateMachineArtifactSources(machineByRehearsal,configs,{summaryPath,uid=process.getuid?.()}={}){
  const records=[],identities=new Set();
  const summary=summaryPath?canonicalPlannedPath(summaryPath):null;
  const installed=new Set(configs.flatMap(config=>[config.target.jobStateDecisionArtifact,config.target.jobStateSourcePayloadArtifact,config.target.jobStateMachineAttestationArtifact]).filter(value=>typeof value==="string").map(canonicalPlannedPath));
  const forbidden=[...configs.flatMap(config=>[config.target.root,config.target.stagingRoot,config.target.evidenceRoot]),summary?dirname(summary):null].filter(value=>typeof value==="string"&&value!=="").map(canonicalPlannedPath);
  for(const config of configs){
    const machine=machineByRehearsal?.[config.rehearsal];
    for(const kind of ["decision","payload","machineAttestation"]){
      const input=machine?.[kind],label=`${config.rehearsal}:${kind}`;
      if(typeof input!=="string"||input.trim()==="")fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED",label);
      const requested=resolve(input);
      let requestedStat,path,fileStat;
      try{requestedStat=lstatSync(requested);path=realpathSync(requested);fileStat=statSync(path);}catch{fail("FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE",`${label}:missing`);}
      if(requestedStat.isSymbolicLink()||!fileStat.isFile()||fileStat.nlink!==1||(fileStat.mode&0o777)!==0o600||(uid!==undefined&&fileStat.uid!==uid))fail("FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE",label);
      if(installed.has(path))fail("FINAL_PAIR_REVIEW_ARTIFACT_INSTALL_TARGET",label);
      if(forbidden.some(root=>inside(root,path)))fail("FINAL_PAIR_REVIEW_ARTIFACT_RUNTIME_PATH",label);
      const identity=`${fileStat.dev}:${fileStat.ino}`;
      if(identities.has(identity))fail("FINAL_PAIR_REVIEW_ARTIFACT_REUSE",label);
      identities.add(identity);records.push({rehearsal:config.rehearsal,kind,label,requested,path,identity});
    }
  }
  if(records.length!==6)fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED","six A/B machine artifacts required");
  if(new Set(records.map(row=>row.path)).size!==6)fail("FINAL_PAIR_REVIEW_ARTIFACT_REUSE","realpath");
  const roots=Object.fromEntries(configs.map(config=>[config.rehearsal,validateMachineRoot(records.filter(row=>row.rehearsal===config.rehearsal),config.rehearsal,uid)]));
  if(inside(roots.A,roots.B)||inside(roots.B,roots.A))fail("FINAL_PAIR_REVIEW_ROOT_OVERLAP","A:B");
  return{status:"PASS",artifactCount:6,reviewRoots:2,productionImport:"HOLD"};
}

export function validateMachineTrustRoots(machineByRehearsal,configs){
  for(const config of configs){
    const machine=machineByRehearsal[config.rehearsal],trustedRoot=config.machineAttestation?.trustedRootSha256;
    const decision=JSON.parse(readFileSync(machine.decision,"utf8")),attestation=JSON.parse(readFileSync(machine.machineAttestation,"utf8"));
    if(decision.expectedCheckpointRootSha256!==trustedRoot||decision.checkpointRootSha256!==trustedRoot||attestation.trustedCheckpointRootSha256!==trustedRoot)fail("FINAL_PAIR_MACHINE_TRUST_ROOT_MISMATCH",config.rehearsal);
  }
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=parse(process.argv.slice(2)),contractPath=realpathSync(resolve(args.contract??DEFAULT_PAIR_CONTRACT)),contract=JSON.parse(readFileSync(contractPath,"utf8"));
    const configPaths=[realpathSync(resolve(args.configA)),realpathSync(resolve(args.configB))],configs=configPaths.map((path,index)=>({...JSON.parse(readFileSync(path,"utf8")),__configPath:path,__ordinal:index}));
    const git=spawnSync("git",["status","--porcelain=v1","--untracked-files=all"],{cwd:ROOT,encoding:"utf8"}),head=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8"}).stdout.trim();
    const preflight=validatePairPreflight(configs[0],configs[1],contract,{currentSha:head,mappingContractHash:computeMappingContractHash(FULL_CONTRACT),worktreeClean:git.status===0&&!git.stdout.trim()});
    if(args.phase!=="resume")validateRuntimeVacancy(configs,runtimeSnapshot(configs));
    if(!args.execute){process.stdout.write(`${JSON.stringify(preflight)}\n`);process.exit(0);}
    if(process.env.ALLOW_YUZHOU_FINAL_REHEARSAL!=="yes"||!args.summary)fail("FINAL_PAIR_EXECUTION_AUTH_MISSING","explicit lab authorization and --summary required");
    const summary=resolve(args.summary),summaryParentInput=dirname(summary);if(!existsSync(summaryParentInput))fail("FINAL_PAIR_SUMMARY_UNSAFE","parent missing");
    const summaryParent=realpathSync(summaryParentInput),summaryResolved=resolve(summaryParent,basename(summary));for(const config of configs){const runtimeResolved=resolve(realpathSync(dirname(config.target.root)),basename(config.target.root));if(inside(runtimeResolved,summaryResolved))fail("FINAL_PAIR_SUMMARY_UNSAFE","summary must survive isolated cleanup");}
    if((statSync(summaryParent).mode&0o777)!==0o700)fail("FINAL_PAIR_SUMMARY_UNSAFE","private 0700 parent required");
    if(!["extract","resume"].includes(args.phase))fail("FINAL_PAIR_PHASE_REQUIRED","--phase extract|resume required");
    if(args.phase==="extract"){const checkpoint=runFinalPairExtract(configs[0],configs[1]);privateJson(summary,checkpoint);process.stdout.write(`${JSON.stringify({status:"REVIEW_HOLD",checkpoint:summary,productionImport:"HOLD"})}\n`);process.exit(0);}
    const checkpointPath=realpathSync(resolve(args.checkpoint??""));if(mode(checkpointPath)!=="0600")fail("FINAL_PAIR_CHECKPOINT_INVALID","0600 checkpoint required");const checkpoint=JSON.parse(readFileSync(checkpointPath,"utf8"));validateMachineResumeCheckpoint(checkpoint,configs);
    const machineByRehearsal={A:{decision:args.decisionA,payload:args.payloadA,machineAttestation:args.machineAttestationA},B:{decision:args.decisionB,payload:args.payloadB,machineAttestation:args.machineAttestationB}};
    if(Object.values(machineByRehearsal).some(machine=>!machine.decision||!machine.payload||!machine.machineAttestation))fail("FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED","six A/B machine artifacts required before resume");
    validateMachineArtifactSources(machineByRehearsal,configs,{summaryPath:summaryResolved});
    validateMachineTrustRoots(machineByRehearsal,configs);
    const result=runFinalPair(configs[0],configs[1],contract,{resumeOnly:true,machineArtifacts:config=>machineByRehearsal[config.rehearsal]});privateJson(summary,result);process.stdout.write(`${JSON.stringify({status:result.status,summary,productionImport:"HOLD"})}\n`);
  }catch(error){process.stderr.write(`${error.code??"FINAL_PAIR_FAILED"}: ${error.message.replace(/^.*?: /u,"")}\n`);process.exitCode=1;}
}
