#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildEvidenceIndex, manifestHash, verifyManifestChain, ManifestChainError, writeImmutableManifest } from "../hr-cutover/parent-manifest.mjs";
import { assertManifestFacts, compareGlobalFacts, GlobalFactsError, verifyGlobalFacts } from "../hr-cutover/verify-global-facts.mjs";

const root=resolve(import.meta.dirname,"../..");
const base=JSON.parse(readFileSync(resolve(root,"scripts/hr-cutover/fixtures/valid-parent-manifest.json"),"utf8"));
const container=process.env.YUZHOU_SLICE3_POSTGRES_CONTAINER??"jinhu-smart-park-postgres";
const database="jinhu_hr_migration_lab_full_slice3_fixture";
const schema="hr_cutover_fixture_slice3";
const runA="yzfull-20260826T030000Z-b798b061-rA";
const runB="yzfull-20260826T030000Z-b798b061-rB";
const sha=(value)=>createHash("sha256").update(value).digest("hex");
const exec=(db,sql)=>{const r=spawnSync("docker",["exec","-i",container,"psql","-X","-v","ON_ERROR_STOP=1","-U","jinhu","-d",db],{input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"]});if(r.status!==0)throw new Error(r.stderr);return r.stdout;};
const expect=(code,fn)=>assert.throws(fn,(error)=>(error instanceof ManifestChainError||error instanceof GlobalFactsError)&&error.code===code,`expected ${code}`);
const q=(value)=>`'${value.replaceAll("'","''")}'`;

const sandbox=mkdtempSync(join(tmpdir(),"jinhu_hr_migration_lab_full_slice3_")); chmodSync(sandbox,0o700);
try {
  const evidence=join(sandbox,"evidence"); spawnSync("mkdir",["-m","700",evidence]);
  const attestation=join(evidence,"approved-ignore-attestation.json"); writeFileSync(attestation,'{"status":"APPROVED","reasonCode":"SOURCE_OBJECT_DUPLICATE_EXACT_CONTENT"}\n',{mode:0o600}); chmodSync(attestation,0o600);
  const attestationIndex=buildEvidenceIndex(evidence,[{kind:"approved_ignored_attestation",relativePath:"approved-ignore-attestation.json"}]);
  exec("postgres",`DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database} TEMPLATE template0;`);
  exec(database,`CREATE EXTENSION pgcrypto; CREATE SCHEMA ${schema}; SET search_path=${schema},public;
CREATE TABLE hr_cutover_approval(run_id text,reason_code text,attestation_sha256 text,actual_bytes_sha256 text,detached boolean);
CREATE TABLE hr_cutover_ledger(run_id text,domain text,source_object text,source_count numeric(78,0),loaded_count numeric(78,0),quarantined_count numeric(78,0),approved_ignored_count numeric(78,0),source_amount numeric(38,2),loaded_amount numeric(38,2),quarantined_amount numeric(38,2),approved_ignored_amount numeric(38,2),approved_ignored_reason text,approval_attestation_sha256 text);
CREATE TABLE hr_cutover_canonical_row(run_id text,domain text,source_table text,source_identity_sha256 text,tenant_source_identity text,park_source_identity text,normalized_business_json jsonb,related_source_identity_sha256 text[],target_uuid uuid,created_at timestamptz,sequence_no bigint);
CREATE TABLE hr_cutover_owner_edge(run_id text,owner_kind text,child_domain text,child_source_identity_sha256 text,owner_source_identity_sha256 text,tenant_source_identity text,park_source_identity text,expected_target_table text,map_source_identity_sha256 text);
CREATE TABLE legacy_record_map_fact(run_id text,source_identity_sha256 text,target_table text,tenant_source_identity text,park_source_identity text);
CREATE TABLE hr_cutover_side_effect_snapshot(run_id text,phase text,table_name text,locked boolean,row_hash text);
CREATE TABLE hr_cutover_side_effect_allowlist(run_id text,table_name text);
CREATE TABLE hr_cutover_side_effect_required(run_id text,table_name text);
`);
  for(const run of [runA,runB]){
    const approval=attestationIndex[0].sha256;
    exec(database,`SET search_path=${schema},public;
INSERT INTO hr_cutover_approval VALUES(${q(run)},'SOURCE_OBJECT_DUPLICATE_EXACT_CONTENT',${q(approval)},${q(approval)},true);
INSERT INTO hr_cutover_ledger SELECT ${q(run)},'T'||g, 'dbo.object_'||g, 10, CASE WHEN g=5 THEN 8 ELSE 9 END,1,CASE WHEN g=5 THEN 1 ELSE 0 END,100.00,CASE WHEN g=5 THEN 80.00 ELSE 90.00 END,10.00,CASE WHEN g=5 THEN 10.00 ELSE 0 END,CASE WHEN g=5 THEN 'SOURCE_OBJECT_DUPLICATE_EXACT_CONTENT' END,CASE WHEN g=5 THEN ${q(approval)} END FROM generate_series(0,5) g;
INSERT INTO hr_cutover_canonical_row SELECT ${q(run)},'T'||g,'dbo.object_'||g,encode(digest('source-'||g,'sha256'),'hex'),'tenant-source','park-source',jsonb_build_object('amount','10.00','nullable',NULL),CASE WHEN g=0 THEN ARRAY[]::text[] ELSE ARRAY[encode(digest('source-0','sha256'),'hex')] END,gen_random_uuid(),clock_timestamp(),floor(random()*100000)::bigint FROM generate_series(0,5) g;
INSERT INTO hr_cutover_owner_edge SELECT ${q(run)},(ARRAY['employee','contract','employment_event','attendance_insurance','payroll','file'])[g+1],'T'||g,encode(digest('source-'||g,'sha256'),'hex'),encode(digest('source-0','sha256'),'hex'),'tenant-source','park-source','hr_target_'||g,encode(digest('source-'||g,'sha256'),'hex') FROM generate_series(0,5) g;
INSERT INTO legacy_record_map_fact SELECT ${q(run)},encode(digest('source-'||g,'sha256'),'hex'),'hr_target_'||g,'tenant-source','park-source' FROM generate_series(0,5) g;
INSERT INTO hr_cutover_side_effect_snapshot VALUES(${q(run)},'before','sys_user',true,${q(sha("sys_user"))}),(${q(run)},'after','sys_user',true,${q(sha("sys_user"))}),(${q(run)},'before','migration_batch',true,${q(sha("migration-before"))}),(${q(run)},'after','migration_batch',true,${q(sha("migration-after"))});
INSERT INTO hr_cutover_side_effect_allowlist VALUES(${q(run)},'migration_batch');
INSERT INTO hr_cutover_side_effect_required VALUES(${q(run)},'sys_user');`);
  }
  const factsA=verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA});
  const factsB=verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runB});
  assert.equal(compareGlobalFacts(factsA,factsB).ok,true,"random UUID/time/sequence/run id must not alter canonical hashes");
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_canonical_row SET normalized_business_json=jsonb_set(normalized_business_json,'{nullable}','0'::jsonb) WHERE run_id=${q(runB)} AND domain='T0';`);
  const zeroFacts=verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runB});
  expect("REHEARSAL_CANONICAL_MISMATCH",()=>compareGlobalFacts(factsA,zeroFacts));
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_canonical_row SET normalized_business_json=jsonb_set(normalized_business_json,'{nullable}','null'::jsonb) WHERE run_id=${q(runB)} AND domain='T0';`);
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_ledger SET loaded_amount=loaded_amount-0.01 WHERE run_id=${q(runA)} AND domain='T4';`);
  expect("LEDGER_DB_IMBALANCE",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_ledger SET loaded_amount=loaded_amount+0.01 WHERE run_id=${q(runA)} AND domain='T4'; DELETE FROM hr_cutover_approval WHERE run_id=${q(runA)};`);
  expect("LEDGER_DB_IMBALANCE",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; INSERT INTO hr_cutover_approval SELECT ${q(runA)},reason_code,attestation_sha256,actual_bytes_sha256,detached FROM hr_cutover_approval WHERE run_id=${q(runB)};`);
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_ledger SET approved_ignored_reason='FREE_TEXT_REASON' WHERE run_id=${q(runA)} AND domain='T5';`);
  expect("LEDGER_DB_IMBALANCE",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_ledger SET approved_ignored_reason='SOURCE_OBJECT_DUPLICATE_EXACT_CONTENT' WHERE run_id=${q(runA)} AND domain='T5';`);
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_owner_edge SET tenant_source_identity='other-tenant' WHERE run_id=${q(runA)} AND child_domain='T1';`);
  expect("CROSS_DOMAIN_ORPHAN",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; UPDATE hr_cutover_owner_edge SET tenant_source_identity='tenant-source' WHERE run_id=${q(runA)} AND child_domain='T1'; UPDATE legacy_record_map_fact SET target_table='wrong' WHERE run_id=${q(runA)} AND source_identity_sha256=encode(digest('source-2','sha256'),'hex');`);
  expect("CROSS_DOMAIN_ORPHAN",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; UPDATE legacy_record_map_fact SET target_table='hr_target_2' WHERE run_id=${q(runA)} AND source_identity_sha256=encode(digest('source-2','sha256'),'hex'); UPDATE hr_cutover_side_effect_snapshot SET row_hash='changed' WHERE run_id=${q(runA)} AND phase='after' AND table_name='sys_user';`);
  expect("SIDE_EFFECT_OUTSIDE_ALLOWLIST",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; INSERT INTO hr_cutover_side_effect_allowlist VALUES(${q(runA)},'sys_user');`);
  expect("SIDE_EFFECT_OUTSIDE_ALLOWLIST",()=>verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA}));
  exec(database,`SET search_path=${schema},public; DELETE FROM hr_cutover_side_effect_allowlist WHERE run_id=${q(runA)} AND table_name='sys_user'; UPDATE hr_cutover_side_effect_snapshot SET row_hash=${q(sha("sys_user"))} WHERE run_id=${q(runA)} AND phase='after' AND table_name='sys_user';`);
  const restored=verifyGlobalFacts({container,database,fixtureSchema:schema,runId:runA});
  const claimed=structuredClone(base); claimed.evidence=attestationIndex; claimed.globalLedger=restored.ledger.map((r)=>({domain:r.domain,sourceObject:r.source_object,source:Number(r.source),loaded:Number(r.loaded),quarantined:Number(r.quarantined),approvedIgnored:Number(r.approvedIgnored),sourceAmount:r.sourceAmount,loadedAmount:r.loadedAmount,quarantinedAmount:r.quarantinedAmount,approvedIgnoredAmount:r.approvedIgnoredAmount,...(Number(r.approvedIgnored)>0?{approvedIgnoredReasonCode:r.approvedIgnoredReasonCode,approvalAttestationSha256:r.approvalAttestationSha256}:{})})); claimed.canonical.globalHash=restored.globalHash; claimed.canonical.domainHashes=restored.domainHashes;
  assert.equal(assertManifestFacts(claimed,restored).ok,true); claimed.globalLedger[0].loaded-=1; expect("LEDGER_MANIFEST_DB_MISMATCH",()=>assertManifestFacts(claimed,restored));

  const evidenceDir=evidence; const gate=join(evidenceDir,"gate.json"); writeFileSync(gate,'{"status":"PASS"}\n',{mode:0o600}); chmodSync(gate,0o600);
  const index=buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]); assert.equal(index[0].sha256,sha(readFileSync(gate)));
  const first=structuredClone(base); first.evidence=index; const firstHash=manifestHash(first);
  const second=structuredClone(first); second.supersedesManifestSha256=firstHash; second.canonical.globalHash="9".repeat(64); const secondHash=manifestHash(second);
  assert.equal(verifyManifestChain([{sha256:firstHash,manifest:first},{sha256:secondHash,manifest:second}],{evidenceRoot:evidenceDir}).length,2);
  writeImmutableManifest(join(sandbox,"manifests","first.json"),first); expect("MANIFEST_IMMUTABLE",()=>writeImmutableManifest(join(sandbox,"manifests","first.json"),second));
  const tampered=structuredClone(second); tampered.canonical.globalHash="8".repeat(64); expect("MANIFEST_TAMPERED",()=>verifyManifestChain([{sha256:firstHash,manifest:first},{sha256:secondHash,manifest:tampered}]));
  const fork=structuredClone(second); fork.canonical.globalHash="7".repeat(64); const forkHash=manifestHash(fork); expect("MANIFEST_SUPERSEDE_FORK",()=>verifyManifestChain([{sha256:firstHash,manifest:first},{sha256:secondHash,manifest:second},{sha256:forkHash,manifest:fork}]));
  const broken=structuredClone(second); broken.supersedesManifestSha256="6".repeat(64); expect("MANIFEST_SUPERSEDE_BROKEN",()=>verifyManifestChain([{sha256:firstHash,manifest:first},{sha256:manifestHash(broken),manifest:broken}]));
  const skipped=structuredClone(second); skipped.state="rollback_ready"; skipped.children.forEach((child)=>{child.status="rolled_back";}); expect("MANIFEST_STATE_TRANSITION_INVALID",()=>verifyManifestChain([{sha256:firstHash,manifest:first},{sha256:manifestHash(skipped),manifest:skipped}]));
  const cycleA=structuredClone(first),cycleB=structuredClone(second); const fakeA="a".repeat(64),fakeB="b".repeat(64); cycleA.supersedesManifestSha256=fakeB; cycleB.supersedesManifestSha256=fakeA; expect("MANIFEST_SUPERSEDE_CYCLE",()=>verifyManifestChain([{sha256:fakeA,manifest:cycleA},{sha256:fakeB,manifest:cycleB}]));
  writeFileSync(gate,JSON.stringify({screenshotSha256:`a1234567890123456b${"c".repeat(46)}`})+"\n",{mode:0o600}); chmodSync(gate,0o600); assert.equal(buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]).length,1,"digest-shaped evidence must not be mistaken for PII");
  writeFileSync(gate,'{"mobile":true}\n',{mode:0o600}); chmodSync(gate,0o600); assert.equal(buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]).length,1,"boolean device flags are non-sensitive evidence");
  writeFileSync(gate,'{"mobile":"13800138000"}\n',{mode:0o600}); chmodSync(gate,0o600); expect("SECRET_PATTERN_DETECTED",()=>buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]));
  writeFileSync(gate,'{"employeeName":"unsafe"}\n',{mode:0o600}); chmodSync(gate,0o600); expect("SECRET_PATTERN_DETECTED",()=>buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]));
  writeFileSync(gate,'{"value":"13800138000"}\n',{mode:0o600}); chmodSync(gate,0o600); expect("SECRET_PATTERN_DETECTED",()=>buildEvidenceIndex(evidenceDir,[{kind:"gate",relativePath:"gate.json"}]));
  console.log("Yuzhou full-domain Slice 3 manifest/PostgreSQL fact contracts passed.");
} finally {
  try{exec("postgres",`DROP DATABASE IF EXISTS ${database};`);}catch{}
  rmSync(sandbox,{recursive:true,force:true});
}
