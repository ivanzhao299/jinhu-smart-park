#!/usr/bin/env node
/* global process, structuredClone, URL */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "./full-domain-lifecycle.mjs";
import { verifyManifestChain } from "./parent-manifest.mjs";
import { compareRehearsals, computeMappingContractHash } from "./verify-full-domain-contract.mjs";
import { validateYuzhouLiveRoleUatEvidencePair } from "./yuzhou-live-role-uat-evidence-lib.mjs";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const FULL_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/full-domain-contract-v1.json"),"utf8"));
const DEFAULT_PAIR_CONTRACT=resolve(ROOT,"scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json");
const P0_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"),"utf8"));
const UAT_TASK_CARD=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"),"utf8"));
const UAT_API_MATRIX=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json"),"utf8"));
const UAT_BROWSER_MATRIX=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"),"utf8"));
const TARGET_FIELDS=["database","composeProject","volume","postgresContainer","postgresPort","apiPort","webPort","role","accountNamespace","root","stagingRoot","evidenceRoot","fileRoot","credentialArtifact","materializationKeyArtifact","auditBundle"];
const TARGET_PATH_FIELDS=["root","stagingRoot","evidenceRoot","fileRoot","credentialArtifact","materializationKeyArtifact","auditBundle"];
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const sha256=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>`${JSON.stringify(value,null,2)}\n`;

export function validatePairContract(contract){
  if(contract?.formatVersion!==1||contract.contractKind!=="yuzhou_hr_final_rehearsal_pair"||contract.executionBoundary!=="isolated_lab_only"||contract.productionImport!=="HOLD")fail("FINAL_PAIR_CONTRACT_INVALID","identity/boundary");
  if(JSON.stringify(contract.rehearsalOrder)!==JSON.stringify(["A","B"])||JSON.stringify(contract.domainOrder)!==JSON.stringify(["T0","T1","T2","T3","T4","T5"])||JSON.stringify(contract.rollbackOrder)!==JSON.stringify(["T5","T4","T3","T2","T1","T0"]))fail("FINAL_PAIR_ORDER_INVALID","domain order");
  const expected={T2:{contracts:802,changes:357},T4:{hotYears:[2024,2025,2026],headers:8342,regularHeaders:8320,adjustmentHeaders:22,items:190374,closes:266,net:"15723009.9100",coldArchiveRows:37750},T5:{rows:20163}};
  if(JSON.stringify(contract.sourceFacts)!==JSON.stringify(expected)||contract.sourceFacts.T4.headers!==contract.sourceFacts.T4.regularHeaders+contract.sourceFacts.T4.adjustmentHeaders)fail("FINAL_PAIR_FACTS_DRIFT","frozen source facts");
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
  if(result.status!==0)fail("FINAL_PAIR_STAGE_FAILED",`${script}:${result.stderr.trim().split("\n").at(-1)??result.status}`);
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

export function runFinalPair(configAInput,configBInput,contract,{execute=command,p0Gate=assertP0Executed,manifestHead=readHead,pairCompare=compareRehearsals,uatPairGate=assertTechnicalUatPairEvidence,cleanupGate=assertCleanup,recovery=recover}={}){
  const configs=[structuredClone(configAInput),structuredClone(configBInput)],completed=[],manifests=[];
  try{
    for(const config of configs)execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["provision","--config",config.__configPath]);
    for(const config of configs){
      execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["run","--config",config.__configPath]);
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

function parse(argv){const out={execute:false};for(let i=0;i<argv.length;i+=1){const arg=argv[i];if(arg==="--execute")out.execute=true;else if(["--config-a","--config-b","--contract","--summary"].includes(arg))out[arg.slice(2).replace(/-([a-z])/gu,(_m,x)=>x.toUpperCase())]=argv[++i];else fail("FINAL_PAIR_ARGUMENT_INVALID",arg);}if(!out.configA||!out.configB)fail("FINAL_PAIR_ARGUMENT_INVALID","--config-a and --config-b required");return out;}
function privateJson(path,value){if(existsSync(path))fail("FINAL_PAIR_SUMMARY_EXISTS",path);writeFileSync(path,canonical(value),{mode:0o600,flag:"wx"});chmodSync(path,0o600);}
function inside(parent,child){const rel=relative(parent,child);return rel===""||(!rel.startsWith(`..${sep}`)&&rel!==".."&&!rel.startsWith(sep));}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=parse(process.argv.slice(2)),contractPath=realpathSync(resolve(args.contract??DEFAULT_PAIR_CONTRACT)),contract=JSON.parse(readFileSync(contractPath,"utf8"));
    const configPaths=[realpathSync(resolve(args.configA)),realpathSync(resolve(args.configB))],configs=configPaths.map((path,index)=>({...JSON.parse(readFileSync(path,"utf8")),__configPath:path,__ordinal:index}));
    const git=spawnSync("git",["status","--porcelain=v1","--untracked-files=all"],{cwd:ROOT,encoding:"utf8"}),head=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8"}).stdout.trim();
    const preflight=validatePairPreflight(configs[0],configs[1],contract,{currentSha:head,mappingContractHash:computeMappingContractHash(FULL_CONTRACT),worktreeClean:git.status===0&&!git.stdout.trim()});
    validateRuntimeVacancy(configs,runtimeSnapshot(configs));
    if(!args.execute){process.stdout.write(`${JSON.stringify(preflight)}\n`);process.exit(0);}
    if(process.env.ALLOW_YUZHOU_FINAL_REHEARSAL!=="yes"||!args.summary)fail("FINAL_PAIR_EXECUTION_AUTH_MISSING","explicit lab authorization and --summary required");
    const summary=resolve(args.summary),summaryParentInput=dirname(summary);if(!existsSync(summaryParentInput))fail("FINAL_PAIR_SUMMARY_UNSAFE","parent missing");
    const summaryParent=realpathSync(summaryParentInput),summaryResolved=resolve(summaryParent,basename(summary));for(const config of configs){const runtimeResolved=resolve(realpathSync(dirname(config.target.root)),basename(config.target.root));if(inside(runtimeResolved,summaryResolved))fail("FINAL_PAIR_SUMMARY_UNSAFE","summary must survive isolated cleanup");}
    if((statSync(summaryParent).mode&0o777)!==0o700)fail("FINAL_PAIR_SUMMARY_UNSAFE","private 0700 parent required");
    const result=runFinalPair(configs[0],configs[1],contract);privateJson(summary,result);process.stdout.write(`${JSON.stringify({status:result.status,summary,productionImport:"HOLD"})}\n`);
  }catch(error){process.stderr.write(`${error.code??"FINAL_PAIR_FAILED"}: ${error.message.replace(/^.*?: /u,"")}\n`);process.exitCode=1;}
}
