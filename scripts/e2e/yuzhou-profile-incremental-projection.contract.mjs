/* global process */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {canonicalProfile,projectYuzhouProfile} from '../hr-cutover/yuzhou-profile-incremental-projection.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const source={id:5,person:'EMP',sex:'女',birthday:'2000-02-29T12:01:02.003',handtel:' 13000000000 ',email:'source@example.test',addr:'Address\\Unit',idcard:' ab c ',extension:'pending'};
const row=s=>({sourceTable:'dbo.person.core_residue',sourceKey:String(s.id),sourceIdentitySha256:sha(`dbo.person.core_residue\0${s.id}`),sourceRowSha256:sha(canonicalProfile(s)),source:s,materialized:{idNumberEncrypted:'enc:old-rehearsal-must-not-be-used'}});
const employees=new Map([['EMP',{sourceTable:'dbo.person',sourceKey:`sha256:${sha('dbo.person\0EMP')}`}]]);
test('raw profile adapter preserves exact identity, local DOB and protected raw input; ignores materialized ciphertext',()=>{
 const out=projectYuzhouProfile(row(source),employees);
 assert.equal(out.item.fields.dateOfBirth,'2000-02-29');assert.equal(out.item.fields.idNumber,'ab c');assert.equal(out.item.fields.address,source.addr);
 assert.equal(out.item.sourceKey,`sha256:${sha('dbo.person.core_residue\0'+source.id)}`);assert.notEqual(out.item.sourceKey,out.item.fields.employeeSourceKey);
 assert.ok(!JSON.stringify(out.item).includes('enc:'));assert.equal(out.sourceEvidence.fieldCoverage.find(v=>v.field==='extension').disposition,'pending_api_adapter');
});
test('known unchanged invalid-field admission omits only declared field while changed/new invalid values fail',()=>{
 const invalid={...source,birthday:'unknown',email:'invalid'};
 assert.throws(()=>projectYuzhouProfile(row(invalid),employees),/DATE_INVALID/);
 const out=projectYuzhouProfile(row(invalid),employees,{omittedFields:['dateOfBirth','personalEmail']});
 assert.ok(!Object.hasOwn(out.item.fields,'dateOfBirth'));assert.equal(out.item.fields.gender,'女');
 assert.equal(out.sourceEvidence.fieldCoverage.find(v=>v.field==='birthday').disposition,'pending_unchanged_original_invalid_field');
 assert.throws(()=>projectYuzhouProfile(row({...source,birthday:'2001-02-29T00:00:00'}),employees),/DATE_INVALID/);
 assert.throws(()=>projectYuzhouProfile(row({...source,email:'invalid'}),employees),/EMAIL_INVALID/);
});
test('baseline-only preserves empty fields; source hash, owner, raw encryption and required columns fail closed',()=>{
 const baselineWitness={version:1,proof:'original_t5_whole_set_v1',operationId:'yzprod-import-20261004T130000Z-abcdef123456',bindingSha256:sha('binding')};
 assert.deepEqual(projectYuzhouProfile(row(source),employees,{baselineWitness}).item.fields,{});
 assert.throws(()=>projectYuzhouProfile({...row(source),sourceRowSha256:sha('wrong')},employees));
 assert.throws(()=>projectYuzhouProfile(row({...source,person:'UNKNOWN'}),employees),/EMPLOYEE_MISSING/);
 assert.throws(()=>projectYuzhouProfile(row({...source,idcard:'enc:old'}),employees),/PROTECTED_INPUT_INVALID/);
 const missing={...source};delete missing.email;assert.throws(()=>projectYuzhouProfile(row(missing),employees),/SCHEMA_INVALID/);
});

test('fixed entry applies only pinned exact historical profile facts and accounts absent/changed rows',async()=>{
 const {mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const {assembleYuzhouImportFromStaging}=await import('../hr-cutover/build-yuzhou-import-from-staging.mjs');
 const root=mkdtempSync(join(realpathSync(tmpdir()),'yuzhou-profile-contract-'));
 try {
  const sourcePath=join(root,'source.json'),stage=join(root,'stage'),scope={tenantId:'fixture',parkId:'fixture'};
  writeFileSync(sourcePath,JSON.stringify({sources:[source],scope}),{mode:0o600});
  execFileSync(process.execPath,['scripts/e2e/yuzhou-profile-staging-fixture.mjs','--root',stage,'--source',sourcePath],{stdio:'pipe'});
  const configPath=join(stage,'config.json'),config=JSON.parse(readFileSync(configPath)),original=row(source);
  const artifact={formatVersion:1,artifactKind:'yuzhou_original_profile_exclusions',originalOperationId:'yzprod-import-20261004T130000Z-abcdef123456',originalBindingSha256:sha('binding'),targetScope:scope,entries:[{sourceIdentitySha256:original.sourceIdentitySha256,sourceRowSha256:original.sourceRowSha256,decisionReceiptSha256:sha('receipt'),reasonCode:'ORIGINAL_QUARANTINE'},{sourceIdentitySha256:sha('absent'),sourceRowSha256:sha('absent-row'),decisionReceiptSha256:sha('absent-receipt'),reasonCode:'ORIGINAL_QUARANTINE'}]};
  const artifactPath=join(stage,'exclusions.json');const pin=()=>{writeFileSync(artifactPath,JSON.stringify(artifact),{mode:0o600});config.profileExclusions={path:artifactPath,sha256:sha(readFileSync(artifactPath))};writeFileSync(configPath,JSON.stringify(config),{mode:0o600});};pin();
  const excluded=assembleYuzhouImportFromStaging(configPath);
  assert.equal(excluded.input.profileRecords.length,0);assert.equal(excluded.receipt.profileAccounting.excluded,1);assert.equal(excluded.receipt.profileAccounting.notPresent.length,1);
  assert.equal(excluded.receipt.profileArtifactEvidence[0].verification,'caller_declared_original_receipts_not_independently_authenticated');
  artifact.entries[0].sourceRowSha256=sha('old-different-row');pin();
  const changed=assembleYuzhouImportFromStaging(configPath);assert.equal(changed.input.profileRecords.length,1);assert.equal(changed.receipt.profileAccounting.nonApplicableChanged.length,1);
  artifact.targetScope.parkId='wrong';pin();assert.throws(()=>assembleYuzhouImportFromStaging(configPath));
  artifact.targetScope.parkId='fixture';pin();config.profileExclusions.sha256=sha('wrong');writeFileSync(configPath,JSON.stringify(config),{mode:0o600});assert.throws(()=>assembleYuzhouImportFromStaging(configPath));
  // The fixed entry transports a pinned declaration, not an arbitrary omission map.
  delete config.profileExclusions;
  artifact.artifactKind='yuzhou_original_profile_field_admissions';artifact.entries=[{...artifact.entries[0],sourceRowSha256:original.sourceRowSha256,fields:['personalEmail']}];
  writeFileSync(artifactPath,JSON.stringify(artifact),{mode:0o600});config.profileFieldAdmissions={path:artifactPath,sha256:sha(readFileSync(artifactPath))};writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  const admission=assembleYuzhouImportFromStaging(configPath);
  assert.equal(admission.input.profileAdmissionEvidence.declaration,'caller_attests_original_unchanged_invalid_fields');
  assert.ok(!Object.hasOwn(admission.input,'profileOmittedFields'));
  const {buildYuzhouReusableIncrementalPackage}=await import('../hr-cutover/build-yuzhou-reusable-incremental-package.mjs');
  const built=buildYuzhouReusableIncrementalPackage(admission.input);
  assert.ok(!Object.hasOwn(built.packageDto.items[0].fields,'personalEmail'));
  assert.equal(admission.receipt.profileAccounting.pendingFields.length,1);

 }finally{rmSync(root,{recursive:true,force:true});}
});

test('direct builder binds witness identity and requires exact original-field admission custody',async()=>{
 const {buildYuzhouReusableIncrementalPackage:build,YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256:recipe}=await import('../hr-cutover/build-yuzhou-reusable-incremental-package.mjs');
 const base={recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256:recipe,sourceSystem:'yuzhou-v10',extractedAt:'2026-10-04T12:00:00Z',employeeRecords:[],employeeIndex:[{employeeCode:'EMP',sourceTable:'dbo.person',sourceKey:'EMP'}],records:[],profileRecords:[row(source)]};
 const w={version:1,proof:'original_t5_whole_set_v1',operationId:'yzprod-import-20261004T130000Z-abcdef123456',bindingSha256:sha('binding')};
 assert.throws(()=>build({...base,employeeIndex:[{employeeCode:'EMP',sourceTable:'dbo.person',sourceKey:'OTHER'}]}),/EMPLOYEE_INDEX_INVALID/);
 assert.throws(()=>build({...base,employeeIndex:[{employeeCode:'EMP',sourceTable:'dbo.person',sourceKey:' EMP '}]}),/EMPLOYEE_INDEX_INVALID/);
 const first=build({...base,profileBaselineWitness:w}),second=build({...base,profileBaselineWitness:{...w,bindingSha256:sha('other')}});
 assert.notEqual(first.manifest.manifestId,second.manifest.manifestId);
 assert.equal(first.manifest.profileBaselineWitness.bindingSha256,w.bindingSha256);
 assert.throws(()=>build({...base,profileBaselineWitness:{proof:'arbitrary downgrade'}}),/WITNESS_INVALID/);
 assert.throws(()=>build({...base,profileOmittedFields:{[row(source).sourceIdentitySha256]:['personalEmail']}}),/ADMISSION_INVALID/);
 const invalid={...source,email:'invalid'};
 const artifact={formatVersion:1,artifactKind:'yuzhou_original_profile_field_admissions',originalOperationId:w.operationId,originalBindingSha256:w.bindingSha256,targetScope:{tenantId:'fixture',parkId:'fixture'},entries:[{sourceIdentitySha256:row(invalid).sourceIdentitySha256,sourceRowSha256:row(invalid).sourceRowSha256,decisionReceiptSha256:sha('declared decision'),reasonCode:'ORIGINAL_INVALID_EMAIL',fields:['personalEmail']}]};
 const evidence={declaration:'caller_attests_original_unchanged_invalid_fields',targetScope:artifact.targetScope,artifactCanonicalSha256:sha(canonicalProfile(artifact)),artifact};
 const admitted=build({...base,profileRecords:[row(invalid)],profileAdmissionEvidence:evidence});
 assert.ok(!Object.hasOwn(admitted.packageDto.items[0].fields,'personalEmail'));
 assert.equal(admitted.manifest.profileAdmissionEvidence.declaration,evidence.declaration);
 assert.throws(()=>build({...base,profileRecords:[row(invalid)],profileAdmissionEvidence:{...evidence,declaration:'arbitrary'}}),/ADMISSION_INVALID/);
 assert.throws(()=>build({...base,profileRecords:[row(invalid)],profileAdmissionEvidence:{...evidence,targetScope:{tenantId:'wrong',parkId:'fixture'}}}),/ADMISSION_INVALID/);
 assert.throws(()=>build({...base,profileRecords:[row(invalid)],profileAdmissionEvidence:{...evidence,artifactCanonicalSha256:sha('wrong')}}),/ADMISSION_INVALID/);
 // Same identity but changed full source row disables historical omission.
 assert.throws(()=>build({...base,profileRecords:[row({...invalid,addr:'changed'})],profileAdmissionEvidence:evidence}),/EMAIL_INVALID/);
});

test('modern profile whitelist has an exact supported or pending matrix; aliases never infer dictionaries',async()=>{
 const {readFileSync}=await import('node:fs');
 const {YUZHOU_PROFILE_FIELD_COVERAGE:matrix}=await import('../hr-cutover/yuzhou-profile-incremental-projection.mjs');
 const dto=readFileSync('apps/api/src/modules/hr/dto/hr.dto.ts','utf8').split('export class UpdateHrEmployeeProfileDto {')[1].split('\n}')[0];
 const modern=[...dto.matchAll(/\b(\w+)\?:/gu)].map(match=>match[1]).sort();
 assert.equal(modern.length,33);assert.deepEqual(matrix.map(r=>r.targetField).sort(),modern);
 assert.equal(matrix.filter(r=>r.disposition==='supported').length,8);
 for(const field of ['highestEducation','healthStatus','jobGrade','technicalTitle']) assert.match(matrix.find(r=>r.targetField===field).disposition,/pending/);
 const out=projectYuzhouProfile(row({...source,oldaddr:' 原籍 ',edulevel:' 学士 ',edu:'01',secedu:'本科',physical:'01',grade:'01'}),employees);
 assert.equal(out.item.fields.nativePlace,'原籍');assert.equal(out.item.fields.degree,'学士');
 for(const field of ['edu','secedu','physical','grade']) assert.equal(out.sourceEvidence.fieldCoverage.find(r=>r.field===field).disposition,'pending_api_adapter');
 assert.ok(!Object.hasOwn(out.item.fields,'highestEducation'));
});

test('optional alias schema preserves omission/null and validates exact raw lengths and Unicode',()=>{
 assert.ok(!Object.hasOwn(projectYuzhouProfile(row(source),employees).item.fields,'degree'));
 const nullable=projectYuzhouProfile(row({...source,oldaddr:null,edulevel:'  '}),employees);
 assert.equal(nullable.item.fields.nativePlace,null);assert.equal(nullable.item.fields.degree,null);
 for(const [field,max] of [['oldaddr',50],['edulevel',24]]) {
   assert.doesNotThrow(()=>projectYuzhouProfile(row({...source,[field]:'𠮷'.repeat(max)}),employees));
   assert.throws(()=>projectYuzhouProfile(row({...source,[field]:'x'.repeat(max+1)}),employees),/FIELD_INVALID/);
   for(const value of [1,{},[],true,'bad\0text','\ud800']) assert.throws(()=>projectYuzhouProfile(row({...source,[field]:value}),employees),/SCHEMA_INVALID/);
 }
 const witness={version:1,proof:'original_t5_whole_set_v1',operationId:'yzprod-import-20261004T130000Z-abcdef123456',bindingSha256:sha('binding')};
 const baseline=projectYuzhouProfile(row({...source,oldaddr:'籍贯',edulevel:'学士'}),employees,{baselineWitness:witness});
 assert.deepEqual(baseline.item.fields,{});
 assert.equal(baseline.sourceEvidence.fieldCoverage.find(r=>r.field==='oldaddr').disposition,'pending_initial_field_baseline');
 assert.throws(()=>projectYuzhouProfile(row({...source,oldaddr:'籍贯'}),employees,{omittedFields:['nativePlace']}),/ADMISSION_INVALID/);
});

test('actual staging CLI carries only requested aliases and binds admission to item/package digests',async()=>{
 const {mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(realpathSync(tmpdir()),'yuzhou-alias-cli-'));
 const aliasAcceptance={version:1,proof:'original_t5_alias_fields_v1',operationId:'yzprod-import-20261004T130000Z-abcdef123456',bindingSha256:sha('binding'),fields:['nativePlace','degree']};
 const extended={...source,oldaddr:'原籍',edulevel:'学士'};
 try {
   const input=join(root,'source.json');writeFileSync(input,JSON.stringify({sources:[extended],scope:{tenantId:'fixture',parkId:'fixture'},aliasAcceptance}),{mode:0o600});
   const out=JSON.parse(execFileSync(process.execPath,['scripts/e2e/yuzhou-profile-staging-fixture.mjs','--root',join(root,'stage'),'--source',input],{encoding:'utf8'}));
   const pkg=JSON.parse(readFileSync(out.packagePath)),item=pkg.items[0];
   assert.deepEqual(item.fields,{degree:'学士',nativePlace:'原籍'});assert.deepEqual(item.profileAliasAcceptance,aliasAcceptance);
   assert.equal(item.rowDigest,sha(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields:item.fields,profileAliasAcceptance:aliasAcceptance})));
   assert.notEqual(item.rowDigest,sha(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields:item.fields})));
   const receipt=JSON.parse(readFileSync(join(root,'stage/output/assembly-receipt.json')));assert.equal(receipt.apiInput.profile,1);assert.ok(receipt.mappingReferences.profileAliasAcceptance);
   for(const bad of [null,{...aliasAcceptance,fields:['healthStatus']},{...aliasAcceptance,fields:['degree','degree']},{...aliasAcceptance,extra:'forged snapshot'},{...aliasAcceptance,bindingSha256:'invalid'}]) assert.throws(()=>projectYuzhouProfile(row(extended),employees,{aliasAcceptance:bad}),/ALIAS_ACCEPTANCE_INVALID/);
   assert.throws(()=>projectYuzhouProfile(row(source),employees,{aliasAcceptance}),/ALIAS_ACCEPTANCE_INVALID/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('profile packages preserve finite partition counts and reject duplicate source identities',async()=>{
 const {buildYuzhouReusableIncrementalPackage:build,YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256:recipe}=await import('../hr-cutover/build-yuzhou-reusable-incremental-package.mjs');
 const base={recipeVersion:'yuzhou-reusable-incremental-v2',recipeSha256:recipe,sourceSystem:'yuzhou-v10',extractedAt:'2026-10-04T12:00:00Z',employeeRecords:[],employeeIndex:[{employeeCode:'EMP',sourceTable:'dbo.person',sourceKey:'EMP'}],records:[]};
 const records=Array.from({length:2001},(_,i)=>row({...source,id:i,oldaddr:'原籍',edulevel:'学士'}));
 const out=build({...base,profileRecords:records});assert.deepEqual(out.packageDtos.map(p=>p.items.length),[2000,1]);assert.equal(out.manifest.itemCount,2001);assert.equal(out.coverage.profileFieldCoverage.length,33);
 assert.throws(()=>build({...base,profileRecords:[records[0],records[0]]}),/SOURCE_DUPLICATE/);
 assert.throws(()=>build({...base,recipeSha256:sha('old recipe'),profileRecords:[records[0]]}),/INPUT_INVALID/);
});
