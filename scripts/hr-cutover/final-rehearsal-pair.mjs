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

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const FULL_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/full-domain-contract-v1.json"),"utf8"));
const DEFAULT_PAIR_CONTRACT=resolve(ROOT,"scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json");
const P0_CONTRACT=JSON.parse(readFileSync(resolve(ROOT,"scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"),"utf8"));
const TARGET_FIELDS=["database","composeProject","volume","postgresContainer","postgresPort","apiPort","webPort","role","accountNamespace","root","stagingRoot","evidenceRoot","fileRoot","credentialArtifact","auditBundle"];
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
  for(const field of TARGET_FIELDS)if(a.target[field]===b.target[field])fail("FINAL_PAIR_RESOURCE_REUSE",field);
  if(new Set([a.target.postgresPort,a.target.apiPort,a.target.webPort,b.target.postgresPort,b.target.apiPort,b.target.webPort]).size!==6)fail("FINAL_PAIR_RESOURCE_REUSE","ports");
  return {status:"PASS",triple:a.triple,contractSha256:sha256(canonical(contract)),productionImport:"HOLD"};
}

export function validateRuntimeVacancy(configs,{busyPorts=[],composeProjects=[],containers=[],volumes=[],networks=[]}={}){
  const busy=new Set(busyPorts.map(Number)),projects=new Set(composeProjects),containerNames=new Set(containers),volumeNames=new Set(volumes),networkNames=new Set(networks);
  for(const config of configs){
    for(const port of [config.target.postgresPort,config.target.apiPort,config.target.webPort])if(busy.has(port))fail("FINAL_PAIR_RUNTIME_BUSY",`port:${port}`);
    if(projects.has(config.target.composeProject))fail("FINAL_PAIR_RUNTIME_BUSY",`compose:${config.target.composeProject}`);
    if(containerNames.has(config.target.postgresContainer))fail("FINAL_PAIR_RUNTIME_BUSY",`container:${config.target.postgresContainer}`);
    if(volumeNames.has(config.target.volume))fail("FINAL_PAIR_RUNTIME_BUSY",`volume:${config.target.volume}`);
    if(networkNames.has(`${config.target.composeProject}_default`))fail("FINAL_PAIR_RUNTIME_BUSY",`network:${config.target.composeProject}_default`);
  }
  return {status:"PASS",checkedPorts:6,checkedProjects:2,productionImport:"HOLD"};
}

function lines(commandName,args){const result=spawnSync(commandName,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]});if(result.status!==0)fail("FINAL_PAIR_RUNTIME_CHECK_FAILED",commandName);return result.stdout.split("\n").map(row=>row.trim()).filter(Boolean);}
function runtimeSnapshot(configs){
  const busyPorts=[];for(const config of configs)for(const port of [config.target.postgresPort,config.target.apiPort,config.target.webPort])if(spawnSync("nc",["-z","127.0.0.1",String(port)],{stdio:"ignore"}).status===0)busyPorts.push(port);
  const containers=lines("docker",["ps","-a","--format","{{.Names}}"]),volumes=lines("docker",["volume","ls","--format","{{.Name}}"]),networks=lines("docker",["network","ls","--format","{{.Name}}"]),composeProjects=[];
  for(const config of configs)if(lines("docker",["ps","-a","--filter",`label=com.docker.compose.project=${config.target.composeProject}`,"--format","{{.ID}}"]).length)composeProjects.push(config.target.composeProject);
  return {busyPorts,composeProjects,containers,volumes,networks};
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
  return {status:"PASS",checkCount:25};
}
function assertP0Executed(config){
  const summaryPath=resolve(config.target.evidenceRoot,"technical-uat-summary.json"),evidencePath=resolve(config.target.evidenceRoot,"technical-uat-p0-observations.json");
  for(const path of [summaryPath,evidencePath])if(!existsSync(path)||lstatSync(path).isSymbolicLink()||(statSync(path).mode&0o777)!==0o600)fail("FINAL_PAIR_P0_HOLD",`${config.rehearsal}:private P0 evidence missing`);
  const summary=JSON.parse(readFileSync(summaryPath,"utf8")),evidence=JSON.parse(readFileSync(evidencePath,"utf8"));
  if(summary.parentRunId!==config.runId||evidence.parentRunId!==config.runId)fail("FINAL_PAIR_P0_HOLD",`${config.rehearsal}:run identity mismatch`);
  return assertP0Summary(summary,config.rehearsal,evidence);
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

export function runFinalPair(configAInput,configBInput,contract,{execute=command,p0Gate=assertP0Executed,manifestHead=readHead,pairCompare=compareRehearsals,cleanupGate=assertCleanup,recovery=recover}={}){
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
    for(const config of [...configs].reverse()){
      const manifest=manifests.find(row=>row.rehearsal===config.rehearsal)??manifests[config.rehearsal==="A"?0:1];
      execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["rollback","--config",config.__configPath]);
      const cleanup=execute("scripts/hr-cutover/full-domain-lifecycle.mjs",["cleanup","--config",config.__configPath]);
      completed.push({rehearsal:config.rehearsal,manifestSha256:sha256(canonical(manifest)),cleanupAuditSha256:cleanupGate(config,cleanup),residualCount:0});
    }
    completed.sort((a,b)=>a.rehearsal.localeCompare(b.rehearsal));
    return {formatVersion:1,status:"PASS",contractSha256:sha256(canonical(contract)),triple:configs[0].triple,rehearsals:completed,sourceFacts:contract.sourceFacts,productionImport:"HOLD"};
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
