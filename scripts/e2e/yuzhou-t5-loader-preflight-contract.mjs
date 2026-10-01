#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
const root=resolve(import.meta.dirname,'../..');
const loader=readFileSync(resolve(root,'scripts/load-yuzhou-t5-legacy-history.sh'),'utf8');
const body=loader.match(/node - "\$STAGE" "\$PINNED_BUSINESS_HASH" <<'NODE'\n([\s\S]*?)\nNODE/u)?.[1];
assert.ok(body,'execute the actual loader preflight body');
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const mapping=hash(readFileSync(resolve(root,'scripts/hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json')));
function fixture(t) {
 const dir=mkdtempSync(resolve(tmpdir(),'yuzhou-t5-preflight-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const catalog=[{schema:'dbo',table:'synthetic_only',column:'id'}];
 writeFileSync(resolve(dir,'catalog.raw.json'),JSON.stringify(catalog),{mode:0o600});
 writeFileSync(resolve(dir,'synthetic.jsonl'),'',{mode:0o600});
 const m={formatVersion:1,productionImport:'HOLD',payloadSanitization:'nul_to_literal_escape_v1',catalogSha256:hash(canonical(catalog)),mappingContractSha256:mapping,professionalTitleDictionary:{sourceObject:'dbo.assignment',rows:11,sourceSha256:'a'.repeat(64),semantics:'professional_title_not_position'},domains:{synthetic:{file:'synthetic.jsonl',fileSha256:hash(''),rows:0}}};
 const business=()=>({formatVersion:m.formatVersion,catalogSha256:m.catalogSha256,mappingContractSha256:m.mappingContractSha256,professionalTitleDictionary:m.professionalTitleDictionary,domains:m.domains});
 const pinned=hash(canonical(business()));m.businessSha256=pinned;
 const run=()=>{writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(m),{mode:0o600});return spawnSync(process.execPath,['-',dir,pinned],{input:body,encoding:'utf8'});};
 return {dir,m,run};
}
test('actual loader accepts reviewed mapping and title-bound business identity',t=>{const f=fixture(t);assert.equal(f.run().status,0);});
test('obsolete reviewed mapping is rejected before data transport',t=>{const f=fixture(t);f.m.mappingContractSha256='0d39503e429ec524ba8db09945d7fe8fa51f56e53d751fd67bccec9f83dcaee3';assert.match(f.run().stderr,/reviewed employee mapping contract drift/u);});
test('missing, position-like or altered title dictionary cannot evade the pinned business hash',t=>{
 for(const change of [m=>delete m.professionalTitleDictionary,m=>{m.professionalTitleDictionary.semantics='position';},m=>{m.professionalTitleDictionary.sourceSha256='b'.repeat(64);}]) {const f=fixture(t);change(f.m);assert.notEqual(f.run().status,0);}
});
test('actual loader rejects altered staged bytes',t=>{const f=fixture(t);writeFileSync(resolve(f.dir,'synthetic.jsonl'),'changed');assert.match(f.run().stderr,/staging SHA-256 mismatch/u);});
