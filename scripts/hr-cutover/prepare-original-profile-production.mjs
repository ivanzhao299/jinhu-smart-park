#!/usr/bin/env node
// Manual private preparation transport. No business writer or raw-data artifact.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath, URL } from 'node:url';

const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw new Error('ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED')};
const failurePrefix='ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED';
const readStages=['KEYRING','INPUT','CONNECT','QUERY','QUERY_TIMEOUT','QUERY_LOCK','ENVELOPE','DECRYPT','SOURCE_JSON','OUTPUT'];
const readFailureStages=Object.fromEntries(readStages.map(stage=>[
  `YUZHOU_PROFILE_ALIAS_SOURCE_READ_FAILED_${stage}\n`,`SOURCE_PREPARATION_READ_${stage}`]));
const sourcePreparationStages={
  YUZHOU_PROFILE_DATE_INVALID:'SOURCE_PREPARATION_PROFILE_DATE',
  YUZHOU_PROFILE_EMAIL_INVALID:'SOURCE_PREPARATION_PROFILE_EMAIL',
  YUZHOU_PROFILE_PROTECTED_INPUT_INVALID:'SOURCE_PREPARATION_PROFILE_PROTECTED_INPUT',
  YUZHOU_PROFILE_FIELD_INVALID:'SOURCE_PREPARATION_PROFILE_FIELD',
  YUZHOU_PROFILE_SOURCE_INVALID:'SOURCE_PREPARATION_PROFILE_IDENTITY',
  YUZHOU_PROFILE_SOURCE_SCHEMA_INVALID:'SOURCE_PREPARATION_PROFILE_SCHEMA',
  T5_RETAINED_SOURCE_INVALID:'SOURCE_PREPARATION_RETAINED_SOURCE',
  YUZHOU_PROFILE_ALIAS_SOURCE_SCHEMA_INVALID:'SOURCE_PREPARATION_ENVELOPE_SCHEMA',
  YUZHOU_PROFILE_ALIAS_SOURCE_OBSERVATION_DRIFT:'SOURCE_PREPARATION_OBSERVATION_DRIFT',
  YUZHOU_PROFILE_ALIAS_SOURCE_SOURCE_LEDGER_INVALID:'SOURCE_PREPARATION_SOURCE_LEDGER',
  YUZHOU_PROFILE_ALIAS_SOURCE_SOURCE_LEDGER_DRIFT:'SOURCE_PREPARATION_SOURCE_LEDGER',
  YUZHOU_PROFILE_ALIAS_SOURCE_OPERATION_INVALID:'SOURCE_PREPARATION_ORIGINAL_OPERATION',
  YUZHOU_PROFILE_ALIAS_SOURCE_ROW_SOURCE_RECEIPT_MISMATCH:'SOURCE_PREPARATION_ROW_RECEIPT',
  YUZHOU_PROFILE_ALIAS_SOURCE_ROW_BINDING_INVALID:'SOURCE_PREPARATION_ROW_BINDING',
  YUZHOU_PROFILE_ALIAS_SOURCE_PLAN_DRIFT:'SOURCE_PREPARATION_PLAN_DRIFT',
};
const preparationStages=['BOOTSTRAP_REQUEST','BOOTSTRAP_SOURCE','BOOTSTRAP_LOAD','REQUEST','RELEASE','SOURCE_BYTES','MODULE_LOAD','OBSERVATION','PLAN','PRIVATE_ROOT','PRIVATE_CONFIG','SOURCE_PREPARATION','SOURCE_PREPARATION_READ','SOURCE_PREPARATION_COMMAND',...Object.values(sourcePreparationStages),...Object.values(readFailureStages)];
export function safePreparationFailure(error) {
  const message=typeof error?.message==='string'?error.message:'';
  return preparationStages.some(stage=>message===`${failurePrefix}_${stage}`)?message:failurePrefix;
}
const sharedRules=['hr-yuzhou-training-score-policy.json','hr-yuzhou-record-incremental.ts','hr-yuzhou-family-incremental.ts',
  'hr-yuzhou-incremental.ts','hr.ts','hr-yuzhou-incremental-limits.json','hr-yuzhou-initial-baseline.ts','hr-yuzhou-profile-baseline.ts']
  .map(path=>`packages/shared/src/${path}`);
const sourcePath=path=>typeof path==='string' && /^(scripts\/hr-cutover\/[a-zA-Z0-9_./-]+\.(mjs|json|sql)|scripts\/diagnose-(yuzhou-personnel-alias|production-runtime-revision)\.mjs|scripts\/prepare-yuzhou-production-source-manifest\.mjs|packages\/shared\/src\/(hr-yuzhou-[a-z-]+\.(ts|json)|hr\.ts))$/u.test(path)
  && !path.includes('/../') && !path.includes('/./') && !path.includes('//');
export function validatePreparationRequest(request) {
  if(!request || Object.keys(request).sort().join(',')!=='deployPath,expectedRuntimeCommit,files'
    || typeof request.deployPath!=='string' || !/^\/[A-Za-z0-9_./-]+$/u.test(request.deployPath)
    || resolve(request.deployPath)!==request.deployPath || request.deployPath==='/'
    || !/^[a-f0-9]{40}$/u.test(request.expectedRuntimeCommit??'') || !Array.isArray(request.files)
    || request.files.length<3 || request.files.length>1000)fail();
  const paths=new Set();
  for(const file of request.files){
    if(!file || Object.keys(file).sort().join(',')!=='path,sha256' || !sourcePath(file.path)
      || !/^[a-f0-9]{64}$/u.test(file.sha256??'') || paths.has(file.path))fail();
    paths.add(file.path);
  }
  for(const path of ['scripts/hr-cutover/prepare-original-profile-production.mjs',
    'scripts/hr-cutover/prepare-yuzhou-original-profile-alias-input.mjs',
    'scripts/diagnose-yuzhou-personnel-alias.mjs','scripts/diagnose-production-runtime-revision.mjs',
    'scripts/prepare-yuzhou-production-source-manifest.mjs',...sharedRules])if(!paths.has(path))fail();
  return request;
}

export async function prepareOnProductionHost(request,{load=async path=>import(pathToFileURL(path))}={}) {
  let stage='REQUEST';
  try {
    validatePreparationRequest(request);
    stage='RELEASE';
    if(realpathSync(request.deployPath)!==request.deployPath)fail();
    if(JSON.parse(readFileSync(join(request.deployPath,'.release.json'),'utf8')).commit!==request.expectedRuntimeCommit)fail();
    stage='SOURCE_BYTES';
    for(const file of request.files){const path=join(request.deployPath,file.path),stat=lstatSync(path);
      if(!stat.isFile() || stat.isSymbolicLink() || realpathSync(path)!==path || sha(readFileSync(path))!==file.sha256)fail();}
    // Import only after all reviewed source bytes match the workflow checkout.
    stage='MODULE_LOAD';
    const observer=await load(join(request.deployPath,'scripts/diagnose-yuzhou-personnel-alias.mjs'));
    const collector=await load(join(request.deployPath,'scripts/hr-cutover/prepare-yuzhou-original-profile-alias-input.mjs'));
    stage='OBSERVATION';
    const observation=observer.diagnosePersonnelAlias(request.deployPath);
    if(observation.originalBaselineSetStatus!=='OBSERVED_INTACT_FOR_API_RECHECK'
      || observation.correctionPlanStatus!=='MATCHED_SUBSET_FOR_REVIEW')fail();
    stage='PLAN';
    const expected={sourceSetSha256:observation.sourceSetSha256,profileCount:observation.profileMatchedCount,
      aliasProfiles:observation.correctionPlan.plannedProfiles,nativePlaceFills:observation.correctionPlan.nativePlaceFills,
      degreeFills:observation.correctionPlan.degreeFills,planSha256:observation.correctionPlan.planSha256,beforeSha256:observation.correctionPlan.beforeSha256};
    collector.validateOriginalProfileAliasExpected(expected);
    // Sibling of the deployment directory: outside Web assets and rsync --delete.
    stage='PRIVATE_ROOT';
    const privateRoot=join(dirname(request.deployPath),'.jinhu-hr-private-profile-input');
    try{mkdirSync(privateRoot,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    const stat=lstatSync(privateRoot);
    if(!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(privateRoot)!==privateRoot || (stat.mode&0o777)!==0o700)fail();
    stage='PRIVATE_CONFIG';
    const control=mkdtempSync(join(privateRoot,'preparation-'));const configPath=join(control,'config.json');
    writeFileSync(configPath,JSON.stringify({deployPath:request.deployPath,expectedRuntimeCommit:request.expectedRuntimeCommit,expected}),{flag:'wx',mode:0o600});
    stage='SOURCE_PREPARATION';
    return collector.prepareOriginalProfileAliasInput({configPath,outputDir:join(control,'result')});
  } catch(error) {
    if(stage==='SOURCE_PREPARATION') {
      if(Object.hasOwn(sourcePreparationStages,error?.message))stage=sourcePreparationStages[error.message];
      else if(Object.hasOwn(readFailureStages,error?.stderr))stage=readFailureStages[error.stderr];
      else if(error?.stderr==='YUZHOU_PROFILE_ALIAS_SOURCE_READ_FAILED\n')stage='SOURCE_PREPARATION_READ';
      else if(error?.status!==undefined || error?.code==='ETIMEDOUT')stage='SOURCE_PREPARATION_COMMAND';
    }
    throw new Error(`${failurePrefix}_${stage}`);
  }
}

export const productionPreparationBootstrap=String.raw`
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{input+=chunk;if(input.length>262144)process.exit(1)});
process.stdin.on('end',async()=>{let stage='BOOTSTRAP_REQUEST';try{
 const fs=await import('node:fs'),crypto=await import('node:crypto'),url=await import('node:url');
 const request=JSON.parse(input),entry='scripts/hr-cutover/prepare-original-profile-production.mjs';
 if(!/^\/[A-Za-z0-9_./-]+$/.test(request.deployPath)||request.deployPath.includes('/../')||request.deployPath.includes('/./')||request.deployPath.includes('//'))throw Error();
 stage='BOOTSTRAP_SOURCE';
 const file=request.files.find(x=>x.path===entry),path=request.deployPath+'/'+entry;
 if(!file||fs.realpathSync(path)!==path||crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')!==file.sha256)throw Error();
 stage='BOOTSTRAP_LOAD';
 const {prepareOnProductionHost,safePreparationFailure}=await import(url.pathToFileURL(path));
 try {
 process.stdout.write(JSON.stringify(await prepareOnProductionHost(request))+'\n');
 }catch(error){process.stderr.write(safePreparationFailure(error)+'\n');process.exitCode=1;}
}catch{process.stderr.write('ORIGINAL_PROFILE_PRIVATE_PREPARATION_FAILED_'+stage+'\n');process.exitCode=1;}});`;

export function runProductionPreparation(env=process.env,run=execFileSync) {
  if(!/^[a-f0-9]{40}$/u.test(env.EXPECTED_RUNTIME_COMMIT??'') || !/^[A-Za-z0-9_.-]+$/u.test(env.PROD_SSH_HOST??'')
    || env.PROD_SSH_HOST.startsWith('-') || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/u.test(env.PROD_SSH_USER??'')
    || !/^\d{1,5}$/u.test(env.PROD_SSH_PORT??'') || Number(env.PROD_SSH_PORT)<1 || Number(env.PROD_SSH_PORT)>65535)fail();
  const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const files=run('git',['ls-files','scripts/hr-cutover','scripts/diagnose-yuzhou-personnel-alias.mjs','scripts/diagnose-production-runtime-revision.mjs','scripts/prepare-yuzhou-production-source-manifest.mjs','packages/shared/src'],{cwd:root,encoding:'utf8'})
    .trim().split('\n').filter(path=>sourcePath(path) && !path.includes('/tests/') && !path.endsWith('.spec.mjs'))
    .map(path=>({path,sha256:sha(readFileSync(join(root,path)))}));
  const request=validatePreparationRequest({deployPath:env.PROD_DEPLOY_PATH,expectedRuntimeCommit:env.EXPECTED_RUNTIME_COMMIT,files});
  const command=`node --input-type=module -e '${productionPreparationBootstrap.replaceAll("'","'\\''")}'`;
  try {return run('ssh',['-p',env.PROD_SSH_PORT,'-o','BatchMode=yes','-o','ConnectTimeout=30','-o','ServerAliveInterval=30',
    '-o','ServerAliveCountMax=2',`${env.PROD_SSH_USER}@${env.PROD_SSH_HOST}`,command],
  {cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:90000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});
  }catch(error){
    const stderr=typeof error?.stderr==='string'?error.stderr:'';
    const code=stderr.endsWith('\n')?stderr.slice(0,-1):stderr;
    throw new Error(safePreparationFailure({message:code}));
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{process.stdout.write(runProductionPreparation());}catch(error){process.stderr.write(safePreparationFailure(error)+'\n');process.exitCode=1;}
}
