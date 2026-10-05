import test from 'node:test';
import process from 'node:process';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { prepareOnProductionHost, productionPreparationBootstrap, validatePreparationRequest, runProductionPreparation, safePreparationFailure } from '../prepare-original-profile-production.mjs';
import { describeYuzhouImportInterface } from '../describe-yuzhou-import-interface.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const entry='scripts/hr-cutover/prepare-original-profile-production.mjs';
const paths=[entry,'scripts/hr-cutover/prepare-yuzhou-original-profile-alias-input.mjs','scripts/diagnose-yuzhou-personnel-alias.mjs','scripts/diagnose-production-runtime-revision.mjs','scripts/prepare-yuzhou-production-source-manifest.mjs'];
paths.push(...['hr-yuzhou-training-score-policy.json','hr-yuzhou-record-incremental.ts','hr-yuzhou-family-incremental.ts',
  'hr-yuzhou-incremental.ts','hr.ts','hr-yuzhou-incremental-limits.json','hr-yuzhou-initial-baseline.ts','hr-yuzhou-profile-baseline.ts'].map(path=>`packages/shared/src/${path}`));
function fixture(){
  const root=realpathSync(mkdtempSync(join(tmpdir(),'private-profile-host-'))),deployPath=join(root,'deployment');
  mkdirSync(join(deployPath,'scripts/hr-cutover'),{recursive:true});
  mkdirSync(join(deployPath,'packages/shared/src'),{recursive:true});
  const content=[readFileSync(new URL('../prepare-original-profile-production.mjs',import.meta.url),'utf8'),
    `export const validateOriginalProfileAliasExpected=()=>{};export const prepareOriginalProfileAliasInput=()=>({productionImport:'HOLD',writerPresent:false,aliasProfiles:2});`,
    `export const diagnosePersonnelAlias=()=>({originalBaselineSetStatus:'OBSERVED_INTACT_FOR_API_RECHECK',correctionPlanStatus:'MATCHED_SUBSET_FOR_REVIEW',sourceSetSha256:'${'a'.repeat(64)}',profileMatchedCount:2,correctionPlan:{plannedProfiles:2,nativePlaceFills:2,degreeFills:1,planSha256:'${'b'.repeat(64)}',beforeSha256:'${'c'.repeat(64)}'}});`,'export const observer=true;','export const manifest=true;'];
  const files=paths.map((path,i)=>{const text=content[i]??(path.endsWith('.json')?'{}':'export {};');writeFileSync(join(deployPath,path),text);return {path,sha256:sha(text)}});
  const request={deployPath,files,expectedRuntimeCommit:'d'.repeat(40)};
  writeFileSync(join(deployPath,'.release.json'),JSON.stringify({commit:request.expectedRuntimeCommit}));
  return {root,request};
}
test('actual bootstrap validates source then prepares private config outside deployment; outputs only receipt',()=>{
  const {root,request}=fixture();try{
    const result=spawnSync(process.execPath,['--input-type=module','-e',productionPreparationBootstrap],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{productionImport:'HOLD',writerPresent:false,aliasProfiles:2});
    assert.doesNotMatch(result.stdout,/deploy|private|config|employee|\/tmp/);
    const privateRoot=join(root,'.jinhu-hr-private-profile-input');assert.equal(statSync(privateRoot).mode&0o777,0o700);
    const control=join(privateRoot,readdirSync(privateRoot)[0]);assert.equal(statSync(control).mode&0o777,0o700);
    assert.equal(statSync(join(control,'config.json')).mode&0o777,0o600);
    const config=JSON.parse(readFileSync(join(control,'config.json'),'utf8'));
    assert.equal(config.expected.aliasProfiles,2);assert.equal(config.expectedRuntimeCommit,request.expectedRuntimeCommit);
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('source or release drift fails before import/private output; unsafe private root remains untouched',async()=>{
  const {root,request}=fixture();let imports=0;try{
    const load=async()=>{imports++;throw Error('must never import')};
    writeFileSync(join(request.deployPath,paths[2]),'tampered');
    await assert.rejects(prepareOnProductionHost(request,{load}),/PRIVATE_PREPARATION_FAILED/);
    assert.equal(imports,0);assert.equal(existsSync(join(root,'.jinhu-hr-private-profile-input')),false);
    writeFileSync(join(request.deployPath,'.release.json'),JSON.stringify({commit:'e'.repeat(40)}));
    await assert.rejects(prepareOnProductionHost(request,{load}));assert.equal(imports,0);
  }finally{rmSync(root,{recursive:true,force:true})}
  const shared=fixture();try{
    writeFileSync(join(shared.request.deployPath,'packages/shared/src/hr-yuzhou-training-score-policy.json'),'{"drift":true}');
    let loads=0;await assert.rejects(prepareOnProductionHost(shared.request,{load:async()=>{loads++;throw Error()}}),/PRIVATE_PREPARATION_FAILED/);
    assert.equal(loads,0);assert.equal(existsSync(join(shared.root,'.jinhu-hr-private-profile-input')),false);
  }finally{rmSync(shared.root,{recursive:true,force:true})}
  const other=fixture();try{
    const foreign=join(other.root,'foreign');mkdirSync(foreign,{mode:0o700});writeFileSync(join(foreign,'keep'),'safe');
    symlinkSync(foreign,join(other.root,'.jinhu-hr-private-profile-input'));
    await assert.rejects(prepareOnProductionHost(other.request),/PRIVATE_PREPARATION_FAILED/);
    assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'safe');assert.deepEqual(readdirSync(foreign),['keep']);
  }finally{rmSync(other.root,{recursive:true,force:true})}
});
test('request and SSH argument boundaries reject unexpected paths, hashes, files and destination options',()=>{
  const {root,request}=fixture();try{
    for(const edit of [r=>{r.deployPath='/tmp/../foreign'},r=>{r.files[0].path='../foreign'},r=>{r.files[0].sha256='wrong'},r=>{r.files.push(r.files[0])},r=>{r.files.pop()},r=>{r.extra=true}]){
      const r=JSON.parse(JSON.stringify(request));edit(r);assert.throws(()=>validatePreparationRequest(r));
    }
    for(const bad of [{PROD_SSH_HOST:'-oProxyCommand=bad'},{PROD_SSH_USER:'user;bad'},{PROD_SSH_PORT:'0'},{EXPECTED_RUNTIME_COMMIT:'$bad'}]){
      assert.throws(()=>runProductionPreparation({PROD_SSH_HOST:'host',PROD_SSH_USER:'user',PROD_SSH_PORT:'22',EXPECTED_RUNTIME_COMMIT:'a'.repeat(40),...bad},()=>{throw Error('must not run')}),/PRIVATE_PREPARATION_FAILED/);
    }
    let ssh=false;
    const result=runProductionPreparation({PROD_SSH_HOST:'host',PROD_SSH_USER:'user',PROD_SSH_PORT:'22',PROD_DEPLOY_PATH:'/production/app',EXPECTED_RUNTIME_COMMIT:'a'.repeat(40)},(binary,args,options)=>{
      if(binary==='git')return paths.join('\n');
      assert.equal(binary,'ssh');ssh=true;assert.ok(args.includes('BatchMode=yes'));
      assert.match(args.at(-1),/^node --input-type=module -e '/);assert.equal(options.timeout,90000);
      assert.equal(JSON.parse(options.input).files.length,paths.length);
      const actual=spawnSync('sh',['-c',args.at(-1)],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
      assert.equal(actual.status,0,actual.stderr);assert.equal(JSON.parse(actual.stdout).writerPresent,false);
      return '{"writerPresent":false}\n';
    });assert.equal(ssh,true);assert.equal(result,'{"writerPresent":false}\n');
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('manual production workflow has same deployment mutex and no deploy, credentials creation or data artifacts',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/prepare-original-profile-input.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/environment: production/);assert.match(workflow,/group: deploy-production/);
  assert.match(workflow,/package-manager-cache: false/);
  assert.match(workflow,/validate-production-deploy-path.sh/);assert.match(workflow,/original-profile-production.test.mjs/);
  assert.equal(describeYuzhouImportInterface().originalProfileSourcePreparation.productionWorkflow,'.github/workflows/prepare-original-profile-input.yml');
  const builder=readFileSync(new URL('../build-yuzhou-reusable-incremental-package.mjs',import.meta.url),'utf8');
  const ruleFiles=builder.match(/const ruleFiles = \[([^\]]+)\]/u)?.[1];assert.ok(ruleFiles);
  for(const match of ruleFiles.matchAll(/"\.\.\/\.\.\/(packages\/shared\/src\/[^"\n]+)"/gu))assert.ok(paths.includes(match[1]),`shared recipe rule must be sealed: ${match[1]}`);
  assert.doesNotMatch(workflow,/upload-artifact|workflow_run|branches:|db:migrate|db:seed|prod:deploy|docker|password|token/i);
});

test('phase-only failures survive real SSH transport while private errors and paths never escape',()=>{
  const {root,request}=fixture();try{
    const path=paths[2],text="export const diagnosePersonnelAlias=()=>{throw Error('synthetic-private-row /private/location secret-value')};";
    writeFileSync(join(request.deployPath,path),text);request.files.find(file=>file.path===path).sha256=sha(text);
    const actual=spawnSync(process.execPath,['--input-type=module','-e',productionPreparationBootstrap],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
    assert.equal(actual.status,1);assert.equal(actual.stdout,'');
    assert.equal(actual.stderr,'ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_OBSERVATION\n');
    assert.equal(existsSync(join(root,'.jinhu-hr-private-profile-input')),false);
    writeFileSync(join(request.deployPath,paths[3]),'drift');
    const drift=spawnSync(process.execPath,['--input-type=module','-e',productionPreparationBootstrap],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
    assert.equal(drift.status,1);assert.equal(drift.stderr,'ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_SOURCE_BYTES\n');
    const env={PROD_SSH_HOST:'host',PROD_SSH_USER:'user',PROD_SSH_PORT:'22',PROD_DEPLOY_PATH:'/production/app',EXPECTED_RUNTIME_COMMIT:'a'.repeat(40)};
    for(const [stderr,expected] of [[actual.stderr,'ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_OBSERVATION'],[actual.stderr+'private-row','ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED'],['private-row /secret/path','ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED']]){
      assert.throws(()=>runProductionPreparation(env,(binary)=>{
        if(binary==='git')return paths.join('\n');
        throw Object.assign(Error('private-row /secret/path'),{stderr});
      }),error=>error.message===expected);
    }
    assert.equal(safePreparationFailure(Error('ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_SECRET_VALUE')),'ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED');
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('collector failures expose only reviewed fixed substage codes, never error text',()=>{
  for(const [message,stage] of [['YUZHOU_PROFILE_DATE_INVALID','SOURCE_PREPARATION_PROFILE_DATE'],['YUZHOU_PROFILE_ALIAS_SOURCE_OPERATION_INVALID','SOURCE_PREPARATION_ORIGINAL_OPERATION'],['YUZHOU_PROFILE_DATE_INVALID private-row /private/path','SOURCE_PREPARATION'],['toString','SOURCE_PREPARATION']]){
    const {root,request}=fixture();try{
      const path=paths[1],text=`export const validateOriginalProfileAliasExpected=()=>{};export const prepareOriginalProfileAliasInput=()=>{throw Error(${JSON.stringify(message)})};`;
      writeFileSync(join(request.deployPath,path),text);request.files.find(file=>file.path===path).sha256=sha(text);
      const actual=spawnSync(process.execPath,['--input-type=module','-e',productionPreparationBootstrap],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
      assert.equal(actual.status,1);assert.equal(actual.stdout,'');assert.equal(actual.stderr,`ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_${stage}\n`);
    }finally{rmSync(root,{recursive:true,force:true})}
  }
});

 test('fixed reader substages survive host bootstrap and transport; appended private output is rejected',()=>{
  for(const stage of ['KEYRING','INPUT','CONNECT','QUERY','QUERY_TIMEOUT','QUERY_LOCK','ENVELOPE','DECRYPT','SOURCE_JSON','OUTPUT']){
    for(const suffix of ['', 'private-row']){
      const {root,request}=fixture();try{
        const path=paths[1],stderr=`YUZHOU_PROFILE_ALIAS_SOURCE_READ_FAILED_${stage}\n${suffix}`;
        const text=`export const validateOriginalProfileAliasExpected=()=>{};export const prepareOriginalProfileAliasInput=()=>{throw Object.assign(Error('private-row'),{status:1,stderr:${JSON.stringify(stderr)}})};`;
        writeFileSync(join(request.deployPath,path),text);request.files.find(file=>file.path===path).sha256=sha(text);
        const actual=spawnSync(process.execPath,['--input-type=module','-e',productionPreparationBootstrap],{input:JSON.stringify(request),encoding:'utf8',timeout:5000});
        const expected=suffix?'SOURCE_PREPARATION_COMMAND':`SOURCE_PREPARATION_READ_${stage}`;
        assert.equal(actual.status,1);assert.equal(actual.stdout,'');assert.equal(actual.stderr,`ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_${expected}\n`);
        assert.equal(safePreparationFailure(Error(actual.stderr.trim())),actual.stderr.trim());
      }finally{rmSync(root,{recursive:true,force:true})}
    }
  }
});
