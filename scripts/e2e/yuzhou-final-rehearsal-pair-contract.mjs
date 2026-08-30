/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { assertCleanupEvidence, assertP0Summary, assertTechnicalUatTargetIdentity, runFinalPair, runFinalPairExtract, validateMachineArtifactSources, validateMachineResumeCheckpoint, validateMachineTrustRoots, validatePairContract, validatePairResourceIsolation, validateRuntimeVacancy } from "../hr-cutover/final-rehearsal-pair.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>readFileSync(resolve(root,path),"utf8");
const contract=JSON.parse(read("scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json"));

test("final A/B contract freezes source facts, continuous order and production HOLD",()=>{
  const result=validatePairContract(contract);assert.equal(result.status,"PASS");assert.equal(result.productionImport,"HOLD");assert.match(result.sha256,/^[0-9a-f]{64}$/u);
  assert.deepEqual(contract.sourceFacts.T4,{fullYears:[2010,2026],fullRows:46092,fullItems:1078020,fullCloses:1431,fullNet:"102194056.8000",hotRows:8342,coldArchiveRows:37750,coldArchiveItems:887140,coldArchiveCloses:1165,coldArchiveNet:"86471046.8900",coldEmployeeUnmappedRows:34});
  assert.deepEqual(contract.sourceFacts.T2,{contracts:802,changes:357});assert.deepEqual(contract.sourceFacts.T5,{rows:20163});
});

test("fact, order, final-state and import drift fail closed",()=>{
  for(const mutate of [draft=>{draft.sourceFacts.T4.items++;},draft=>{draft.rollbackOrder.reverse();},draft=>{draft.requiredFinalState.residualCount=1;},draft=>{draft.productionImport="GO";}]){
    const draft=structuredClone(contract);mutate(draft);assert.throws(()=>validatePairContract(draft));
  }
});

test("runtime vacancy rejects occupied ports, Docker identities and controlled paths before provision",()=>{
 const configs=["A","B"].map((rehearsal,index)=>{const project=`jinhu_hr_migration_lab_full_${rehearsal.toLowerCase()}ready`,root=`/controlled/${project}/runtime`,credentials=`/controlled/${project}/credentials`;return{target:{database:project,postgresPort:15441+index,apiPort:3141+index,webPort:4141+index,composeProject:project,postgresContainer:`${project}-postgres-1`,volume:`${project}_postgres_data`,role:`${project}_operator`,accountNamespace:`yzfull_${rehearsal.toLowerCase()}_${project.slice(-12)}`,root,stagingRoot:`${root}/staging`,evidenceRoot:`${root}/evidence`,fileRoot:`${root}/files`,credentialArtifact:`${credentials}/postgres.env`,materializationKeyArtifact:`${credentials}/materialization.key`,jobStateDecisionArtifact:`${credentials}/job-state-decision.json`,jobStateSourcePayloadArtifact:`${credentials}/job-state-source-payload.json`,jobStateMachineAttestationArtifact:`${credentials}/job-state-machine-attestation.json`,auditBundle:`${credentials}/cleanup-audit.json`}};});
 assert.equal(validatePairResourceIsolation(configs[0],configs[1]).status,"PASS");
 assert.equal(validateRuntimeVacancy(configs).status,"PASS");
 for(const observed of [{busyPorts:[15441]},{composeProjects:[configs[0].target.composeProject]},{containers:[configs[1].target.postgresContainer]},{volumes:[configs[0].target.volume]},{networks:[`${configs[1].target.composeProject}_default`]},{occupiedPaths:[configs[0].target.evidenceRoot]}])assert.throws(()=>validateRuntimeVacancy(configs,observed),error=>error.code==="FINAL_PAIR_RUNTIME_BUSY");
 const nested=structuredClone(configs[1]);nested.target.root=`${configs[0].target.root}/${nested.target.composeProject}`;nested.target.stagingRoot=`${nested.target.root}/staging`;nested.target.evidenceRoot=`${nested.target.root}/evidence`;nested.target.fileRoot=`${nested.target.root}/files`;
 assert.throws(()=>validatePairResourceIsolation(configs[0],nested),error=>error.code==="FINAL_PAIR_RESOURCE_OVERLAP");
 const sharedMachine=structuredClone(configs[1]);sharedMachine.target.jobStateDecisionArtifact=configs[0].target.jobStateDecisionArtifact;
 assert.throws(()=>validatePairResourceIsolation(configs[0],sharedMachine),error=>error.code==="FINAL_PAIR_RESOURCE_REUSE");
 const crossedMachine=structuredClone(configs[1]);crossedMachine.target.jobStateSourcePayloadArtifact=`${configs[0].target.jobStateMachineAttestationArtifact}/nested`;
 assert.throws(()=>validatePairResourceIsolation(configs[0],crossedMachine),error=>error.code==="FINAL_PAIR_RESOURCE_OVERLAP");
});

test("resume machine artifacts are six private independent external files with isolated A/B roots",()=>{
  const sandbox=mkdtempSync(join(realpathSync(tmpdir()),"yuzhou-pair-artifacts-"));
  const makeFixture=()=>{
    const nonce=Math.random().toString(16).slice(2),control=join(sandbox,nonce),summaryRoot=join(control,"summary"),reviewRoots={A:join(control,"review-a"),B:join(control,"review-b")};
    mkdirSync(summaryRoot,{recursive:true,mode:0o700});
    const reviews={};
    for(const rehearsal of ["A","B"]){mkdirSync(reviewRoots[rehearsal],{recursive:true,mode:0o700});reviews[rehearsal]={};for(const kind of ["decision","payload","machineAttestation"]){const path=join(reviewRoots[rehearsal],`${kind}.json`);writeFileSync(path,"{}\n",{mode:0o600});chmodSync(path,0o600);reviews[rehearsal][kind]=path;}}
    const configs=["A","B"].map(rehearsal=>{const runtime=join(control,`runtime-${rehearsal.toLowerCase()}`),credentials=join(control,`install-${rehearsal.toLowerCase()}`);return{rehearsal,target:{root:runtime,stagingRoot:join(runtime,"staging"),evidenceRoot:join(runtime,"evidence"),jobStateDecisionArtifact:join(credentials,"decision.json"),jobStateSourcePayloadArtifact:join(credentials,"payload.json"),jobStateMachineAttestationArtifact:join(credentials,"machine-attestation.json")}};});
    return{reviews,configs,summaryPath:join(summaryRoot,"result.json"),reviewRoots};
  };
  try{
    const valid=makeFixture();assert.deepEqual(validateMachineArtifactSources(valid.reviews,valid.configs,{summaryPath:valid.summaryPath}),{status:"PASS",artifactCount:6,reviewRoots:2,productionImport:"HOLD"});
    const missing=makeFixture();missing.reviews.A.decision="";assert.throws(()=>validateMachineArtifactSources(missing.reviews,missing.configs,{summaryPath:missing.summaryPath}),error=>error.code==="FINAL_PAIR_MACHINE_ATTESTATION_REQUIRED");
    const reused=makeFixture();reused.reviews.B.decision=reused.reviews.A.decision;assert.throws(()=>validateMachineArtifactSources(reused.reviews,reused.configs,{summaryPath:reused.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_REUSE");
    const hardlinked=makeFixture(),hardlink=join(hardlinked.reviewRoots.B,"decision-hardlink.json");rmSync(hardlinked.reviews.B.decision);linkSync(hardlinked.reviews.A.decision,hardlink);hardlinked.reviews.B.decision=hardlink;assert.throws(()=>validateMachineArtifactSources(hardlinked.reviews,hardlinked.configs,{summaryPath:hardlinked.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE");
    const linked=makeFixture(),symlink=join(linked.reviewRoots.A,"decision-link.json");symlinkSync(linked.reviews.A.decision,symlink);linked.reviews.A.decision=symlink;assert.throws(()=>validateMachineArtifactSources(linked.reviews,linked.configs,{summaryPath:linked.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE");
    const permissive=makeFixture();chmodSync(permissive.reviews.A.payload,0o640);assert.throws(()=>validateMachineArtifactSources(permissive.reviews,permissive.configs,{summaryPath:permissive.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE");
    const owner=makeFixture();assert.throws(()=>validateMachineArtifactSources(owner.reviews,owner.configs,{summaryPath:owner.summaryPath,uid:process.getuid()+1}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_UNSAFE");
    const publicRoot=makeFixture();chmodSync(publicRoot.reviewRoots.A,0o755);assert.throws(()=>validateMachineArtifactSources(publicRoot.reviews,publicRoot.configs,{summaryPath:publicRoot.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ROOT_UNSAFE");
    const writableRoot=makeFixture();chmodSync(writableRoot.reviewRoots.B,0o770);assert.throws(()=>validateMachineArtifactSources(writableRoot.reviews,writableRoot.configs,{summaryPath:writableRoot.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ROOT_UNSAFE");
    const linkedParent=makeFixture(),parentAlias=join(linkedParent.reviewRoots.A,"..","review-a-alias");symlinkSync(linkedParent.reviewRoots.A,parentAlias);for(const kind of ["decision","payload","machineAttestation"])linkedParent.reviews.A[kind]=join(parentAlias,`${kind}.json`);assert.throws(()=>validateMachineArtifactSources(linkedParent.reviews,linkedParent.configs,{summaryPath:linkedParent.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ROOT_UNSAFE");
    const scattered=makeFixture(),scatteredRoot=join(scattered.reviewRoots.A,"fragment");mkdirSync(scatteredRoot,{mode:0o700});const scatteredMachine=join(scatteredRoot,"machine-attestation.json");writeFileSync(scatteredMachine,"{}\n",{mode:0o600});scattered.reviews.A.machineAttestation=scatteredMachine;assert.throws(()=>validateMachineArtifactSources(scattered.reviews,scattered.configs,{summaryPath:scattered.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ROOT_SCATTERED");
    const nested=makeFixture();const nestedRoot=join(nested.reviewRoots.A,"nested-b");mkdirSync(nestedRoot,{mode:0o700});for(const kind of ["decision","payload","machineAttestation"]){const path=join(nestedRoot,`${kind}.json`);writeFileSync(path,"{}\n",{mode:0o600});nested.reviews.B[kind]=path;}assert.throws(()=>validateMachineArtifactSources(nested.reviews,nested.configs,{summaryPath:nested.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ROOT_OVERLAP");
    const install=makeFixture();install.configs[1].target.jobStateDecisionArtifact=install.reviews.A.decision;assert.throws(()=>validateMachineArtifactSources(install.reviews,install.configs,{summaryPath:install.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_INSTALL_TARGET");
    const runtime=makeFixture();runtime.configs[1].target.root=runtime.reviewRoots.A;assert.throws(()=>validateMachineArtifactSources(runtime.reviews,runtime.configs,{summaryPath:runtime.summaryPath}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_RUNTIME_PATH");
    const summary=makeFixture();assert.throws(()=>validateMachineArtifactSources(summary.reviews,summary.configs,{summaryPath:join(summary.reviewRoots.A,"result.json")}),error=>error.code==="FINAL_PAIR_REVIEW_ARTIFACT_RUNTIME_PATH");
  }finally{rmSync(sandbox,{recursive:true,force:true});}
});

test("technical UAT target identity must be derived from the exact rehearsal config",()=>{const config={rehearsal:"A",target:{database:"lab",root:"/isolated/A"}},hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"),evidence={targetIdentityHash:hash(config.target)};assert.equal(assertTechnicalUatTargetIdentity(evidence,config).status,"PASS");assert.throws(()=>assertTechnicalUatTargetIdentity({...evidence,targetIdentityHash:"0".repeat(64)},config),error=>error.code==="FINAL_PAIR_TARGET_IDENTITY_UNBOUND");});

test("P0 HOLD and incomplete cleanup cannot be promoted to final A/B PASS",()=>{
  const p0=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json")),stable=value=>`${JSON.stringify(value,null,2)}\n`,hash=value=>createHash("sha256").update(stable(value)).digest("hex"),observations=p0.checks.map(row=>{const item={id:row.id,actor:row.actor,statusCode:row.outcome==="success"?200:row.outcome==="forbidden"?403:row.outcome==="server_failure"?500:404,responseKind:row.responseKind,responseSha256:"a".repeat(64),responseByteLength:1,supportResponses:row.supportRoutes?.length??0,assertions:Object.fromEntries(row.assertions.map(key=>[key,true])),status:"PASS"};return{...item,evidenceSha256:hash(item)};}),evidence={formatVersion:1,parentRunId:"run-A",triple:{codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},status:"PASS",technicalUat:"PASS",humanUat:"HOLD",p0MatrixSha256:hash(p0),responseEvidenceSha256:hash(observations),requestCount:p0.checks.reduce((sum,row)=>sum+1+(row.supportRoutes?.length??0),0),observedChecks:25,failedChecks:0,observations,productionImport:"HOLD"},summary={formatVersion:1,parentRunId:"run-A",status:"PASS",humanUat:"HOLD",productionImport:"HOLD",legacyTaskCard:{p0Execution:"PASS",p0MatrixChecks:25,p0MatrixSha256:hash(p0),p0ObservedChecks:25,p0FailedChecks:0,p0EvidenceSha256:hash(evidence)}};
  assert.deepEqual(assertP0Summary(summary,"A",evidence),{status:"PASS",checkCount:25,humanUat:"HOLD"});
  for(const mutate of [(s,e)=>{s.legacyTaskCard.p0Execution="HOLD";},(s,e)=>{e.observations.pop();},(s,e)=>{s.legacyTaskCard.p0EvidenceSha256="b".repeat(64);},(s,e)=>{s.humanUat="PASS";}]){const s=structuredClone(summary),e=structuredClone(evidence);mutate(s,e);assert.throws(()=>assertP0Summary(s,"A",e),error=>error.code==="FINAL_PAIR_P0_HOLD");}
  const result={state:"cleaned",residualCount:0,productionImport:"HOLD"},bundle={finalState:"cleaned",productionImport:"HOLD",resourceLedger:[{removed:true,residualCount:0}]};
  assert.deepEqual(assertCleanupEvidence(result,bundle,"B"),{status:"PASS",residualCount:0});
  assert.throws(()=>assertCleanupEvidence(result,{...bundle,resourceLedger:[{removed:false,residualCount:1}]},"B"),error=>error.code==="FINAL_PAIR_CLEANUP_EVIDENCE_INVALID");
});

test("runner is a fixed fail-closed sequence and deployment workflows do not invoke historical loaders",()=>{
  const runner=read("scripts/hr-cutover/final-rehearsal-pair.mjs"),technicalUat=read("scripts/hr-cutover/run-full-domain-technical-uat.mjs"),deploy=read(".github/workflows/deploy-production.yml");
  const stages=["full-domain-lifecycle.mjs\",[\"provision","full-domain-lifecycle.mjs\",[\"run","full-domain-lifecycle.mjs\",[\"resume","run-full-domain-technical-uat.mjs","rehearsal-backup-restore.mjs","pairCompare(manifests[0],manifests[1])","full-domain-lifecycle.mjs\",[\"rollback","full-domain-lifecycle.mjs\",[\"cleanup"];
  let cursor=-1;for(const stage of stages){const next=runner.indexOf(stage,cursor+1);assert(next>cursor,`missing/out-of-order ${stage}`);cursor=next;}
  assert.match(runner,/ALLOW_YUZHOU_FINAL_REHEARSAL!=="yes"/u);assert.match(runner,/FINAL_PAIR_P0_HOLD/u);assert.match(runner,/--recover/u);
  assert.match(runner,/assertTechnicalUatPairEvidence/u);assert.match(runner,/FINAL_PAIR_BROWSER_MANIFEST_UNBOUND/u);assert.match(runner,/FINAL_PAIR_BROWSER_SESSION_PROOF_INVALID/u);
  assert.match(technicalUat,/materializationKeyArtifact/u);assert.match(technicalUat,/PARTY_DATA_ENCRYPTION_KEY:partyDataEncryptionKey/u);
  assert.doesNotMatch(deploy,/load-yuzhou|hr:migration:full|ALLOW_YUZHOU_MIGRATION/u);
});

test("pair execution is serial and any stage failure invokes scoped recovery without a PASS result",()=>{
  const configs=["A","B"].map(rehearsal=>({rehearsal,__configPath:`/controlled/${rehearsal}.json`,triple:{codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},target:{root:`/controlled/runtime-${rehearsal}`,auditBundle:`/controlled/audit-${rehearsal}.json`}}));
  const calls=[],hooks={
    machineArtifacts:config=>({decision:`/${config.rehearsal}/decision`,payload:`/${config.rehearsal}/payload`,machineAttestation:`/${config.rehearsal}/machine-attestation`}),
    execute:(script,args)=>{calls.push(`${configs.find(c=>args.includes(c.__configPath))?.rehearsal}:${script.split("/").at(-1)}:${args[0]??"uat"}`);return args[0]==="cleanup"?{state:"cleaned",residualCount:0,productionImport:"HOLD"}:{};},
    p0Gate:config=>calls.push(`${config.rehearsal}:p0`),manifestHead:config=>({rehearsal:config.rehearsal}),pairCompare:()=>calls.push("pair:compare"),uatPairGate:()=>calls.push("pair:browser-evidence"),cleanupGate:config=>`${config.rehearsal.toLowerCase()}`.repeat(64).slice(0,64),recovery:config=>calls.push(`${config.rehearsal}:recover`)
  };
  const result=runFinalPair(configs[0],configs[1],contract,hooks);assert.equal(result.status,"PASS");assert.equal(result.humanUat,"HOLD");assert.equal(result.productionImport,"HOLD");assert.deepEqual(result.rehearsals.map(x=>x.rehearsal),["A","B"]);assert(calls.indexOf("pair:compare")>calls.indexOf("B:p0"));assert(calls.indexOf("pair:browser-evidence")>calls.indexOf("pair:compare"));assert(calls.indexOf("pair:browser-evidence")<calls.findIndex(row=>row.includes(":rollback")));assert(calls.indexOf("B:full-domain-lifecycle.mjs:rollback")<calls.indexOf("A:full-domain-lifecycle.mjs:rollback"));
  const gateFailureCalls=[];assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,uatPairGate:()=>{throw Object.assign(new Error("browser evidence"),{code:"BROWSER_EVIDENCE_FAIL"});},recovery:config=>gateFailureCalls.push(config.rehearsal)}),/browser evidence/u);assert.deepEqual(gateFailureCalls,["A","B"]);
  const failureCalls=[];assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:(script,args)=>{if(args.includes(configs[1].__configPath)&&args[0]==="run")throw Object.assign(new Error("fixture"),{code:"FIXTURE_FAIL"});return args[0]==="cleanup"?{state:"cleaned",residualCount:0,productionImport:"HOLD"}:{};},recovery:config=>failureCalls.push(config.rehearsal)}),/fixture/u);
  assert.deepEqual(failureCalls,["A","B"]);
  assert.throws(()=>runFinalPair(configs[0],configs[1],contract,{...hooks,execute:()=>{throw Object.assign(new Error("stage"),{code:"STAGE_FAIL"});},recovery:()=>{throw Object.assign(new Error("recovery"),{code:"RECOVERY_FAIL"});}}),error=>error.code==="FINAL_PAIR_RECOVERY_FAILED"&&/A:RECOVERY_FAIL,B:RECOVERY_FAIL/u.test(error.message));
});

test("lab pair exposes a durable A/B review-hold checkpoint before any resume",()=>{
  const configs=["A","B"].map(rehearsal=>({rehearsal,runId:`run-${rehearsal}`,__configPath:`/controlled/${rehearsal}.json`,triple:{codeSha:"a".repeat(40),sourceSnapshotHash:"b".repeat(64),mappingContractHash:"c".repeat(64)},machineAttestation:{checkpointVersion:2,trustedRootSha256:(rehearsal==="A"?"1":"2").repeat(64)},target:{database:`lab-${rehearsal}`}})),calls=[];
  const checkpoint=runFinalPairExtract(configs[0],configs[1],{execute:(script,args)=>{calls.push(`${args[0]}:${args.at(-1)}`);return args[0]==="run"?{state:"review_hold",gate:"MACHINE_ATTESTATION_REQUIRED",checkpointVersion:2,trustedRootSha256:configs.find(config=>config.__configPath===args.at(-1)).machineAttestation.trustedRootSha256}:{state:"provisioned"};},checkpointEvidence:config=>({state:"review_hold",gate:"MACHINE_ATTESTATION_REQUIRED",checkpointVersion:2,trustedRootSha256:config.machineAttestation.trustedRootSha256,t0ExtractManifestSha256:"d".repeat(64),t0ExtractBindingSha256:"e".repeat(64),journalSha256:"f".repeat(64)})});
  assert.equal(checkpoint.formatVersion,2);assert.equal(checkpoint.checkpointKind,"yuzhou_final_rehearsal_pair_machine_gate");assert.match(checkpoint.checkpointRootSha256,/^[0-9a-f]{64}$/u);assert.equal(checkpoint.status,"REVIEW_HOLD");assert.equal(checkpoint.productionImport,"HOLD");assert.deepEqual(calls,["provision:/controlled/A.json","provision:/controlled/B.json","run:/controlled/A.json","run:/controlled/B.json"]);assert(!calls.some(row=>row.startsWith("resume:")));
  const evidence=config=>checkpoint.runs.find(row=>row.rehearsal===config.rehearsal);assert.equal(validateMachineResumeCheckpoint(checkpoint,configs,{checkpointEvidence:evidence}).status,"PASS");
  assert.throws(()=>validateMachineResumeCheckpoint({...checkpoint,formatVersion:1},configs,{checkpointEvidence:evidence}),error=>error.code==="FINAL_PAIR_CHECKPOINT_INVALID"&&/rollback or cleanup/u.test(error.message));
  const drift=structuredClone(checkpoint);drift.runs[0].trustedRootSha256="9".repeat(64);assert.throws(()=>validateMachineResumeCheckpoint(drift,configs,{checkpointEvidence:evidence}),error=>error.code==="FINAL_PAIR_CHECKPOINT_INVALID");
});

test("machine resume roots bind decision roots and v2 attestation trusted root",()=>{
  const sandbox=mkdtempSync(join(tmpdir(),"yuzhou-final-root-"));
  try{
    const machines={},configs=[];
    for(const rehearsal of ["A","B"]){const trustedRoot=(rehearsal==="A"?"1":"2").repeat(64),decision=join(sandbox,`${rehearsal}-decision.json`),payload=join(sandbox,`${rehearsal}-payload.json`),attestation=join(sandbox,`${rehearsal}-attestation.json`);writeFileSync(decision,JSON.stringify({expectedCheckpointRootSha256:trustedRoot,checkpointRootSha256:trustedRoot}),{mode:0o600});writeFileSync(payload,"{}",{mode:0o600});writeFileSync(attestation,JSON.stringify({trustedCheckpointRootSha256:trustedRoot}),{mode:0o600});machines[rehearsal]={decision,payload,machineAttestation:attestation};configs.push({rehearsal,machineAttestation:{trustedRootSha256:trustedRoot}});}
    assert.doesNotThrow(()=>validateMachineTrustRoots(machines,configs));
    writeFileSync(machines.A.machineAttestation,JSON.stringify({trustedCheckpointRootSha256:"9".repeat(64)}));
    assert.throws(()=>validateMachineTrustRoots(machines,configs),error=>error.code==="FINAL_PAIR_MACHINE_TRUST_ROOT_MISMATCH");
  }finally{rmSync(sandbox,{recursive:true,force:true});}
});
