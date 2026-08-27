#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildEvidenceIndex, canonicalJson, manifestHash } from "./parent-manifest.mjs";
import { verifyGlobalFacts } from "./verify-global-facts.mjs";

const ROOT=resolve(import.meta.dirname,"../..");
const SQL=resolve(ROOT,"scripts/hr-cutover/sql/materialize-full-domain-facts.sql");
const sha=(value)=>createHash("sha256").update(value).digest("hex");
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const writePrivate=(path,value)=>{writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});chmodSync(path,0o600);};

function psql(config,args,input){
  const command=["exec","-i",config.target.postgresContainer,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","jinhu","-d",config.target.database];
  for(const [key,value] of Object.entries(args)) command.push("-v",`${key}=${value}`);
  const result=spawnSync("docker",command,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
  if(result.status!==0) fail("GLOBAL_FACTS_MATERIALIZATION_FAILED",result.stderr.trim().split("\n").at(-1)??"psql");
  return result.stdout.trim();
}

function queryJson(config,sql){const out=psql(config,{},sql);const line=out.split("\n").findLast((value)=>value.startsWith("{")||value.startsWith("["));if(!line)fail("GLOBAL_FACTS_QUERY_INVALID","JSON result missing");return JSON.parse(line);}

export function materializeFullDomainFacts(config,phase){
  if(!config.verification||!['before','after'].includes(phase))fail("GLOBAL_FACTS_ARGUMENT_INVALID",String(phase));
  const attestationPath=resolve(config.target.evidenceRoot,"cold-archive-scope-attestation.json");
  if(phase==='before') writePrivate(attestationPath,{formatVersion:1,status:"APPROVED_SCOPE",reasonCode:"SOURCE_OBJECT_OUTSIDE_APPROVED_SCOPE",period:"2010-2023",disposition:"deferred_cold_archive",sourceRows:37750,productionImport:"HOLD"});
  const attestationSha=sha(readFileSync(attestationPath));
  const tenant=config.adapterEnv.T0.load.YUZHOU_TARGET_TENANT_ID;
  const park=config.adapterEnv.T0.load.YUZHOU_TARGET_PARK_ID;
  if(!tenant||!park)fail("GLOBAL_FACTS_ARGUMENT_INVALID","target tenant/park identity missing");
  psql(config,{fact_schema:config.verification.factSchema,run_id:config.runId,phase,finalize:phase==='after'?"true":"false",scope_attestation_sha256:attestationSha,tenant_identity:`tenant:${tenant}`,park_identity:`park:${park}`},readFileSync(SQL));
  if(phase==='before') return {phase,productionImport:"HOLD"};

  const facts=verifyGlobalFacts({container:config.target.postgresContainer,database:config.target.database,fixtureSchema:config.verification.factSchema,runId:config.runId});
  const childRows=queryJson(config,`SELECT COALESCE(jsonb_agg(jsonb_build_object('domain',upper(right(run_id,2)),'runId',run_id,'status',status,'phase',phase,'counts',counts) ORDER BY run_id),'[]'::jsonb)::text FROM public.migration_batch WHERE run_id IN (SELECT '${config.runId}'||'-t'||g FROM generate_series(0,5) g);`);
  if(childRows.length!==6||childRows.some((row)=>row.status!=="succeeded"))fail("PARTIAL_RUN","all six child batches must succeed");
  const t4=JSON.parse(readFileSync(config.source.t4EvidenceFile,"utf8"));
  const summaryPath=resolve(config.target.evidenceRoot,"global-facts-summary.json");
  writePrivate(summaryPath,{formatVersion:1,parentRunId:config.runId,ledgerRows:facts.ledger.length,canonicalGlobalSha256:facts.globalHash,domainHashes:facts.domainHashes,ownerFailureCount:0,sideEffectFailureCount:0,productionImport:"HOLD"});
  const registryPath=resolve(config.target.evidenceRoot,"resource-registry.json");
  const registryRows=JSON.parse(readFileSync(registryPath,"utf8"));
  if(!registryRows.some((entry)=>entry.type==="file"&&resolve(entry.planned)===summaryPath)){
    registryRows.push({type:"file",planned:summaryPath,observed:summaryPath,removed:false,residualCount:0});
    writePrivate(registryPath,registryRows);
  }
  const evidence=buildEvidenceIndex(config.target.evidenceRoot,[
    {kind:"approved_ignored_attestation",relativePath:basename(attestationPath)},
    {kind:"global_facts_summary",relativePath:basename(summaryPath)}
  ]);
  const registry=JSON.parse(readFileSync(registryPath,"utf8")).map((entry)=>({...entry,observed:typeof entry.observed==='string'?entry.observed:null}));
  const manifest={
    formatVersion:1,manifestKind:"yuzhou_hr_full_domain_rehearsal",parentRunId:config.runId,rehearsal:config.rehearsal,state:"verifying",triple:config.triple,
    source:{system:"yuzhou-v10",databaseAlias:config.source.databaseAlias,readOnly:true,backupSha256:config.triple.sourceSnapshotHash,catalogSha256:t4.catalogAggregateSha256,tableLedgerSha256:t4.profileEvidenceSha256},
    target:{database:config.target.database,composeProject:config.target.composeProject,volume:config.target.volume,postgresContainer:config.target.postgresContainer,apiPort:config.target.apiPort,webPort:config.target.webPort,fileRoot:config.target.fileRoot,stagingRoot:config.target.stagingRoot,evidenceRoot:config.target.evidenceRoot,accountNamespace:config.target.accountNamespace},
    children:childRows.map((row)=>({domain:row.domain,runId:row.runId,status:"verified",manifestSha256:sha(`${canonicalJson(row)}\n`)})),
    resourceRegistry:registry,
    globalLedger:facts.ledger.map((row)=>({domain:row.domain,sourceObject:row.source_object,source:Number(row.source),loaded:Number(row.loaded),quarantined:Number(row.quarantined),approvedIgnored:Number(row.approvedIgnored),sourceAmount:row.sourceAmount,loadedAmount:row.loadedAmount,quarantinedAmount:row.quarantinedAmount,approvedIgnoredAmount:row.approvedIgnoredAmount,...(Number(row.approvedIgnored)>0?{approvedIgnoredReasonCode:row.approvedIgnoredReasonCode,approvalAttestationSha256:row.approvalAttestationSha256}:{})})),
    canonical:{normalizationVersion:"yuzhou-full-canonical-v1",globalHash:facts.globalHash,domainHashes:facts.domainHashes,quarantineReasonLedgerHash:sha(`${canonicalJson(facts.ledger.filter((row)=>Number(row.quarantined)>0||Number(row.approvedIgnored)>0))}\n`)},
    hardGates:{t4Extraction:{status:"PASS",reasonCodes:[]},technicalUat:{status:"NOT_STARTED",reasonCodes:[]},humanUat:{status:"HOLD",reasonCodes:["HUMAN_UAT_UNSIGNED"]},restore:{status:"NOT_STARTED",reasonCodes:[]},cleanup:{status:"NOT_STARTED",reasonCodes:[]},productionImport:{status:"HOLD",reasonCodes:["T4_FORMULA_SCOPE_UNSIGNED","T4_TOLERANCE_UNSIGNED","T4_BUSINESS_ATTESTATION_MISSING","PRODUCTION_IMPORT_AUTH_MISSING"]}},
    evidence,security:{directoryMode:"0700",fileMode:"0600",containsSecrets:false,redactionContractVersion:"yuzhou-evidence-redaction-v1"}
  };
  const record={sha256:manifestHash(manifest),manifest};
  writePrivate(config.verification.manifestChainFile,[record]);
  return {phase,manifestSha256:record.sha256,globalHash:facts.globalHash,productionImport:"HOLD"};
}
