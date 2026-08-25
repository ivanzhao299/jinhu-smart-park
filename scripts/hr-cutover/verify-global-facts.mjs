#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SQL = resolve(ROOT, "scripts/hr-cutover/sql/verify-global-facts.sql");
const LAB_DB = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const SCHEMA = /^hr_cutover_(?:fixture|facts)_[a-z0-9_]{4,32}$/;
const RUN = /^yzfull-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r[AB]$/;
export class GlobalFactsError extends Error { constructor(code, detail) { super(`${code}: ${detail}`); this.code=code; } }
const fail=(code,detail)=>{throw new GlobalFactsError(code,detail);};

export function verifyGlobalFacts({ container, database, fixtureSchema, runId }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,80}$/.test(container??"") || !LAB_DB.test(database??"") || !SCHEMA.test(fixtureSchema??"") || !RUN.test(runId??"")) fail("GLOBAL_FACTS_ARGUMENT_INVALID","lab identity");
  const inspect=spawnSync("docker",["inspect",container],{encoding:"utf8",stdio:"pipe"});
  if(inspect.status!==0) fail("GLOBAL_FACTS_TARGET_MISSING",container);
  const result=spawnSync("docker",["exec","-i",container,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-v",`fixture_schema=${fixtureSchema}`,"-v",`run_id=${runId}`,"-U","jinhu","-d",database],{input:readFileSync(SQL),encoding:"utf8",stdio:["pipe","pipe","pipe"]});
  if(result.status!==0) fail("GLOBAL_FACTS_QUERY_FAILED",result.stderr.trim().split("\n").at(-1)??"psql");
  const lines=result.stdout.trim().split("\n").filter((line)=>line.startsWith("{"));
  if(lines.length!==1) fail("GLOBAL_FACTS_QUERY_INVALID","expected one JSON result");
  const facts=JSON.parse(lines[0]);
  if(facts.ledgerBalanced!==true) fail("LEDGER_DB_IMBALANCE",runId);
  if(facts.ownerFailureCount!==0) fail("CROSS_DOMAIN_ORPHAN",String(facts.ownerFailureCount));
  if(facts.sideEffectFailureCount!==0) fail("SIDE_EFFECT_OUTSIDE_ALLOWLIST",String(facts.sideEffectFailureCount));
  if(!/^[0-9a-f]{64}$/.test(facts.globalHash??"") || Object.keys(facts.domainHashes??{}).sort().join(",")!=="T0,T1,T2,T3,T4,T5") fail("CANONICAL_DB_FACT_INVALID",runId);
  return facts;
}

const canonical=(value)=>value===null?"null":Array.isArray(value)?`[${value.map(canonical).join(",")}]`:typeof value==="object"?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
export function compareGlobalFacts(a,b){
  if(canonical(a.ledger)!==canonical(b.ledger)) fail("REHEARSAL_LEDGER_MISMATCH","database ledgers differ");
  if(a.globalHash!==b.globalHash||canonical(a.domainHashes)!==canonical(b.domainHashes)) fail("REHEARSAL_CANONICAL_MISMATCH","database canonical facts differ");
  return {ok:true,globalHash:a.globalHash};
}
export function assertManifestFacts(manifest,facts){
  const projected=manifest.globalLedger.map((row)=>({domain:row.domain,sourceObject:row.sourceObject,source:String(row.source),loaded:String(row.loaded),quarantined:String(row.quarantined),approvedIgnored:String(row.approvedIgnored),sourceAmount:row.sourceAmount,loadedAmount:row.loadedAmount,quarantinedAmount:row.quarantinedAmount,approvedIgnoredAmount:row.approvedIgnoredAmount,approvedIgnoredReasonCode:row.approvedIgnoredReasonCode??null,approvalAttestationSha256:row.approvalAttestationSha256??null}));
  const actual=facts.ledger.map((row)=>({domain:row.domain,sourceObject:row.source_object,source:row.source,loaded:row.loaded,quarantined:row.quarantined,approvedIgnored:row.approvedIgnored,sourceAmount:row.sourceAmount,loadedAmount:row.loadedAmount,quarantinedAmount:row.quarantinedAmount,approvedIgnoredAmount:row.approvedIgnoredAmount,approvedIgnoredReasonCode:row.approvedIgnoredReasonCode??null,approvalAttestationSha256:row.approvalAttestationSha256??null}));
  if(JSON.stringify(projected)!==JSON.stringify(actual)) fail("LEDGER_MANIFEST_DB_MISMATCH","manifest ledger is not the PostgreSQL fact set");
  const evidenceHashes=new Set((manifest.evidence??[]).filter((entry)=>entry.kind==="approved_ignored_attestation").map((entry)=>entry.sha256));
  for(const row of actual) if(row.approvedIgnored!=="0"&&!evidenceHashes.has(row.approvalAttestationSha256)) fail("APPROVED_IGNORED_EVIDENCE_MISSING",`${row.domain}:${row.sourceObject}`);
  if(manifest.canonical.globalHash!==facts.globalHash||JSON.stringify(manifest.canonical.domainHashes)!==JSON.stringify(facts.domainHashes)) fail("CANONICAL_MANIFEST_DB_MISMATCH","manifest canonical hashes are not PostgreSQL facts");
  return {ok:true};
}

function parse(argv){const a={};for(let i=0;i<argv.length;i+=1){const k=argv[i];if(["--container","--database","--fixture-schema","--run-id"].includes(k))a[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=argv[++i];else fail("CLI_ARGUMENT_INVALID",k);}return a;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.stdout.write(`${JSON.stringify(verifyGlobalFacts(parse(process.argv.slice(2))))}\n`);}catch(error){process.stderr.write(`${error.code??"GLOBAL_FACTS_ERROR"}: ${error.message}\n`);process.exitCode=1;}}
