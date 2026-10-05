/* global process */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, statSync, rmSync, readdirSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { buildYuzhouProfileAliasBatch, materializeYuzhouProfileAliasBatch } from '../hr-cutover/build-yuzhou-profile-alias-batch.mjs';
import { canonicalProfile } from '../hr-cutover/yuzhou-profile-incremental-projection.mjs';
import { YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from '../hr-cutover/build-yuzhou-reusable-incremental-package.mjs';
import { YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, incrementalPackageBytes } from '../hr-cutover/yuzhou-incremental-package-limits.mjs';
const sha = v => createHash('sha256').update(v).digest('hex');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function aliasBatchFixture(count = 5) {
  const scope = { tenantId:'alias-tenant', parkId:'alias-park' };
  const rows = Array.from({ length:count }, (_, i) => {
    const source = {id:i+1,person:`E${i+1}`,sex:null,birthday:null,handtel:null,email:null,addr:null,idcard:null,oldaddr:'原籍',edulevel:count===5&&[0,2].includes(i)?'学士':null};
    if(count===5&&i===2)source.oldaddr=null;
    if(count===5&&i===3)source.oldaddr=null;
    return {sourceTable:'dbo.person.core_residue',sourceKey:String(source.id),sourceIdentitySha256:sha(`dbo.person.core_residue\0${source.id}`),sourceRowSha256:sha(canonicalProfile(source)),source};
  });
  return {importInput:{recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:'yuzhou-v10',extractedAt:'2026-10-05T10:00:00Z',employeeRecords:[],employeeIndex:rows.map(r=>({employeeCode:r.source.person,sourceTable:'dbo.person',sourceKey:r.source.person})),records:[],profileRecords:rows},
    originalWitness:{version:1,proof:'original_t5_whole_set_v1',operationId:'yzprod-import-20261004T130000Z-abcdef123456',bindingSha256:sha('binding')},
    plannerInput:{contract:JSON.parse(readFileSync(new URL('../hr-cutover/contracts/legacy-personnel-alias-backfill-v1.json',import.meta.url),'utf8')),binding:{codeSha256:sha('code'),sourceEvidenceSha256:sha('evidence'),sourceSnapshotSha256:sha('snapshot'),targetScope:scope},
      employees:rows.map((r,i)=>({id:uuid(i+1),...scope,isDeleted:false,sourceIdentitySha256:sha(`dbo.person\0${r.source.person}`)})),
      profiles:rows.map((r,i)=>({id:uuid(i+count+1),employeeId:uuid(i+1),employeeSourceIdentitySha256:sha(`dbo.person\0${r.source.person}`),...scope,isDeleted:false,sourceIdentitySha256:r.sourceIdentitySha256,nativePlace:count===5&&i===4?'现代籍贯':null,degree:null})),
      sourceRecords:rows.map(r=>({sourceIdentitySha256:r.sourceIdentitySha256,sourceRowSha256:r.sourceRowSha256,oldaddr:r.source.oldaddr,edulevel:r.source.edulevel}))}};
}
test('all baselines precede grouped alias packages; two fields are atomic and modern nonnull preserved',()=>{
  const out=buildYuzhouProfileAliasBatch(aliasBatchFixture());
  assert.equal(out.receipt.sourceProfiles,5);assert.equal(out.receipt.aliasProfiles,3);
  assert.equal(out.receipt.nativePlaceFills,2);assert.equal(out.receipt.degreeFills,2);
  assert.deepEqual(out.packages[0].packageDto.items.map(i=>i.fields),Array.from({length:5},()=>({})));
  const aliases=out.packages.slice(1).flatMap(p=>p.packageDto.items);
  assert.equal(aliases.length,3);assert.equal(new Set(aliases.map(i=>i.sourceKey)).size,3);
  assert.deepEqual(aliases.find(i=>i.sourceKey.endsWith(sha('dbo.person.core_residue\0'+1))).fields,{degree:'学士',nativePlace:'原籍'});
  assert.ok(!aliases.some(i=>i.sourceKey.endsWith(sha('dbo.person.core_residue\0'+5))));
  assert.equal(out.receipt.dispositions.PRESERVED_MODERN_DIFFERENCE,1);
  assert.equal(out.receipt.dispositions.NO_SOURCE_VALUE,1);
  assert.equal(out.receipt.productionImport,'HOLD');assert.equal(out.receipt.authorizationGranted,false);
});
test('more than one API package retains global baseline barrier and exact limits',()=>{
  const out=buildYuzhouProfileAliasBatch(aliasBatchFixture(YUZHOU_INCREMENTAL_MAX_ITEMS+1));
  assert.deepEqual(out.packages.map(p=>p.kind),['baseline','baseline','alias','alias']);
  for(const p of out.packages){assert.ok(p.packageDto.items.length<=YUZHOU_INCREMENTAL_MAX_ITEMS);assert.ok(incrementalPackageBytes(p.packageDto)<=YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES);}
  assert.equal(out.packages.filter(p=>p.kind==='alias').reduce((n,p)=>n+p.packageDto.items.length,0),2001);
});
test('source set, original row, alias value, employee ownership, witness and extra domain tamper fail closed',()=>{
  for(const mutate of [v=>v.importInput.profileRecords.pop(),v=>v.plannerInput.sourceRecords[0].sourceRowSha256=sha('tamper'),v=>v.plannerInput.sourceRecords[0].oldaddr='伪造',v=>{v.plannerInput.employees[0].sourceIdentitySha256=sha('other');v.plannerInput.profiles[0].employeeSourceIdentitySha256=sha('other');},v=>v.originalWitness.extra=true,v=>v.importInput.employeeRecords.push({})]) {
    const input=aliasBatchFixture();mutate(input);assert.throws(()=>buildYuzhouProfileAliasBatch(input));
  }
  const whitespace=aliasBatchFixture();whitespace.importInput.profileRecords[0].source.oldaddr='   ';whitespace.importInput.profileRecords[0].sourceRowSha256=sha(canonicalProfile(whitespace.importInput.profileRecords[0].source));Object.assign(whitespace.plannerInput.sourceRecords[0],{oldaddr:'   ',sourceRowSha256:whitespace.importInput.profileRecords[0].sourceRowSha256});assert.throws(()=>buildYuzhouProfileAliasBatch(whitespace),/EMPTY_SOURCE/);
});
test('private files, order receipt and existing-output protection; CLI errors never contain input',()=>{
  const root=mkdtempSync(resolve(realpathSync(tmpdir()),'alias-batch-'));chmodSync(root,0o700);
  try {
    const inputPath=resolve(root,'input.json'),outputDir=resolve(root,'output');writeFileSync(inputPath,JSON.stringify(aliasBatchFixture()),{mode:0o600});
    const output=materializeYuzhouProfileAliasBatch({inputPath,outputDir});
    const receipt=JSON.parse(readFileSync(output.receiptPath,'utf8'));
    for(const [i,path] of output.packagePaths.entries()){assert.equal(statSync(path).mode&0o777,0o600);assert.equal(sha(readFileSync(path)),receipt.executionOrder[i].packageSha256);}
    assert.equal(statSync(outputDir).mode&0o777,0o700);
    const before=readdirSync(outputDir);assert.throws(()=>materializeYuzhouProfileAliasBatch({inputPath,outputDir}));assert.deepEqual(readdirSync(outputDir),before);
    const link=resolve(root,'linked.json');symlinkSync(inputPath,link);assert.throws(()=>materializeYuzhouProfileAliasBatch({inputPath:link,outputDir:resolve(root,'unsafe')}));
    chmodSync(inputPath,0o644);assert.throws(()=>materializeYuzhouProfileAliasBatch({inputPath,outputDir:resolve(root,'unsafe')}));chmodSync(inputPath,0o600);
    writeFileSync(inputPath,'private-do-not-echo',{mode:0o600});
    const cli=spawnSync(process.execPath,['scripts/hr-cutover/build-yuzhou-profile-alias-batch.mjs','--input',inputPath,'--output',resolve(root,'invalid')],{encoding:'utf8'});
    assert.equal(cli.status,1);assert.equal(cli.stderr,'YUZHOU_PROFILE_ALIAS_BATCH_FAILED\n');assert.equal(cli.stdout,'');assert.deepEqual(readdirSync(root).sort(),['input.json','linked.json','output']);
  } finally {rmSync(root,{recursive:true,force:true});}
});
