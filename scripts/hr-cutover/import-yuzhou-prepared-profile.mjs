#!/usr/bin/env node
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_COUNT = 2000;
const FIXED = { tenantId: '10000001', parkId: '20000001' };
const MANAGE = 'hr:employee_profile:manage';
const READ = 'hr:employee_profile:read';
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || i + 1 >= argv.length || Object.hasOwn(args, key)) fail('ARGUMENT_INVALID');
    args[key] = argv[i + 1];
  }
  const allowed = ['--mode','--credentials','--receipt','--batch-id','--index','--expected-file-sha256','--expected-count','--retry-preview'];
  if (Object.keys(args).some(key => !allowed.includes(key)) || !['catalog','preview','status','commit'].includes(args['--mode']) || !args['--credentials']) fail('ARGUMENT_INVALID');
  if (args['--mode'] !== 'catalog' && !args['--receipt']) fail('ARGUMENT_INVALID');
  if (args['--mode'] === 'preview' && (!SHA.test(args['--batch-id'] ?? '') || !/^(0|[1-9]\d?)$/u.test(args['--index'] ?? '') || !SHA.test(args['--expected-file-sha256'] ?? '') || !/^[1-9]\d{0,3}$/u.test(args['--expected-count'] ?? '') || Number(args['--expected-count']) > MAX_COUNT)) fail('SELECTION_INVALID');
  if (args['--retry-preview'] !== undefined && (args['--mode'] !== 'preview' || args['--retry-preview'] !== 'yes')) fail('ARGUMENT_INVALID');
  if (args['--mode'] !== 'preview' && ['--batch-id','--index','--expected-file-sha256','--expected-count'].some(key => key in args)) fail('ARGUMENT_INVALID');
  return args;
}

function privateDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) fail('PRIVATE_DIRECTORY_INVALID');
}
function privateRead(path, limit) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > limit || lstatSync(path).ino !== stat.ino) fail('PRIVATE_FILE_INVALID');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}
function privateJson(path, limit) { let text; try { text = privateRead(path, limit); } catch (error) { if (error.code === 'ENOENT') throw error; fail('PRIVATE_FILE_INVALID'); } try { return JSON.parse(text); } catch { fail('PRIVATE_FILE_INVALID'); } }
function validateBase(value) {
  if (!exactKeys(value, ['apiBase','username','password','tenantId','parkId']) || value.tenantId !== FIXED.tenantId || value.parkId !== FIXED.parkId || typeof value.username !== 'string' || !value.username.trim() || value.username !== value.username.trim() || value.username.length > 128 || typeof value.password !== 'string' || !value.password) fail('CREDENTIALS_INVALID');
  let url;
  try { url = new URL(value.apiBase); } catch { fail('API_BASE_INVALID'); }
  const production = url.href === 'https://park.cnjinhu.com/api/v1';
  const loopback = url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && /^\/api\/v1$/u.test(url.pathname) && url.port;
  if (!production && !loopback || url.username || url.password || url.search || url.hash) fail('API_BASE_INVALID');
  return url.href;
}
async function request(base, token, method, path, body, key) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {method, redirect:'manual', signal:AbortSignal.timeout(15000), headers:{'accept':'application/json', ...(body ? {'content-type':'application/json'} : {}), ...(token ? {authorization:`Bearer ${token}`} : {}), ...(key ? {'X-Idempotency-Key':key} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
  } catch { fail('NETWORK_UNCERTAIN'); }
  if (response.status >= 300 && response.status < 400) fail('HTTP_REDIRECT_REJECTED');
  if (!response.ok) fail(`HTTP_${response.status}`);
  let envelope;
  try { envelope = await response.json(); } catch { fail('RESPONSE_INVALID'); }
  if (!object(envelope) || envelope.code !== 0 || !Object.hasOwn(envelope,'data')) fail('RESPONSE_INVALID');
  return envelope.data;
}
function catalog(value) {
  if (!Array.isArray(value) || value.length > 8) fail('CATALOG_INVALID');
  const batches = new Set();
  return value.map(batch => {
    if (!object(batch) || !SHA.test(batch.id ?? '') || batches.has(batch.id) || !count(batch.sourceProfiles) || batch.sourceProfiles < 1 || batch.sourceProfiles > 20000 || !count(batch.aliasProfiles) || batch.aliasProfiles < 1 || batch.aliasProfiles > batch.sourceProfiles || !Array.isArray(batch.packages) || batch.packages.length < 1 || batch.packages.length > 32) fail('CATALOG_INVALID');
    batches.add(batch.id);
    let alias = false, baselineItems = 0, aliasItems = 0;
    const packages = batch.packages.map((entry,index) => {
      if (!object(entry) || entry.index !== index || !['baseline','alias'].includes(entry.kind) || !count(entry.itemCount) || entry.itemCount < 1 || entry.itemCount > MAX_COUNT || !SHA.test(entry.packageSha256 ?? '') || !Array.isArray(entry.fields) || new Set(entry.fields).size !== entry.fields.length || entry.fields.some(field => !['nativePlace','degree'].includes(field)) || !['ready','previewed','committed','conflicted'].includes(entry.status) || entry.operationId !== null && !UUID.test(entry.operationId ?? '') || typeof entry.canPreview !== 'boolean') fail('CATALOG_INVALID');
      if (entry.kind === 'alias') alias = true;
      if (entry.kind === 'baseline' && (alias || entry.fields.length) || entry.kind === 'alias' && !entry.fields.length || index === 0 && entry.kind !== 'baseline') fail('CATALOG_ORDER_INVALID');
      if (entry.status === 'ready' && entry.operationId !== null || entry.status !== 'ready' && entry.operationId === null) fail('CATALOG_INVALID');
      if (entry.kind === 'baseline') baselineItems += entry.itemCount; else aliasItems += entry.itemCount;
      return {index,kind:entry.kind,itemCount:entry.itemCount,fields:[...entry.fields],fileSha256:entry.packageSha256,status:entry.status,operationId:entry.operationId,canPreview:entry.canPreview};
    });
    if (baselineItems !== batch.sourceProfiles || aliasItems !== batch.aliasProfiles) fail('CATALOG_COUNT_INVALID');
    return {id:batch.id,sourceProfiles:batch.sourceProfiles,aliasProfiles:batch.aliasProfiles,packages};
  });
}
function operation(value, expected) {
  if (!object(value) || !UUID.test(value.id ?? '') || !['previewed','committed','conflicted'].includes(value.status) || !SHA.test(value.packageSha256 ?? '') || !count(value.itemCount) || value.itemCount < 1 || value.itemCount > MAX_COUNT || value.itemCount !== expected.itemCount || expected.operationId && value.id !== expected.operationId || expected.canonicalSha256 && value.packageSha256 !== expected.canonicalSha256) fail('OPERATION_BINDING_INVALID');
  let actions = null;
  if (value.plan !== undefined) {
    if (!Array.isArray(value.plan) || value.plan.length !== value.itemCount) fail('PLAN_INVALID');
    actions = {create:0,update:0,unchanged:0,conflict:0};
    for (const row of value.plan) {
      if (!object(row) || !Object.hasOwn(actions,row.action)) fail('PLAN_INVALID');
      actions[row.action]++;
    }
    if (expected.kind === 'baseline' && (actions.create || actions.update || actions.conflict) || expected.kind === 'alias' && (actions.create || actions.conflict)) fail('PREVIEW_CONFLICT');
  }
  let results = null;
  if (value.status !== 'previewed') {
    if (![value.appliedCount,value.unchangedCount,value.conflictCount].every(count) || value.appliedCount + value.unchangedCount + value.conflictCount !== value.itemCount || value.status === 'committed' && value.conflictCount !== 0 || value.status === 'conflicted' && value.conflictCount === 0) fail('RESULT_CONSERVATION_INVALID');
    results = {applied:value.appliedCount,unchanged:value.unchangedCount,conflicts:value.conflictCount};
    if (expected.kind === 'baseline' && results.applied) fail('RESULT_POLICY_INVALID');
  }
  return {id:value.id,status:value.status,canonicalSha256:value.packageSha256,itemCount:value.itemCount,actions,results};
}
function assertReceipt(value) {
  const keys=['version','batchId','index','kind','itemCount','fileSha256','previewKey','commitKey','operationId','canonicalSha256','phase','status','actions','results'];
  if (exactKeys(value,keys)) value.planRefreshKey=null; // Local receipts written before plan refresh support.
  if (!exactKeys(value,[...keys,'planRefreshKey']) || value.version !== 1 || !SHA.test(value.batchId ?? '') || !count(value.index) || value.index > 31 || !['baseline','alias'].includes(value.kind) || !count(value.itemCount) || value.itemCount < 1 || value.itemCount > MAX_COUNT || !SHA.test(value.fileSha256 ?? '') || !UUID.test(value.previewKey ?? '') || value.planRefreshKey !== null && !UUID.test(value.planRefreshKey ?? '') || value.commitKey !== null && !UUID.test(value.commitKey ?? '') || value.operationId !== null && !UUID.test(value.operationId ?? '') || value.canonicalSha256 !== null && !SHA.test(value.canonicalSha256 ?? '') || !['preview-intent','preview-uncertain','previewed','commit-intent','commit-uncertain','committed','conflicted'].includes(value.phase)) fail('RECEIPT_INVALID');
  if ((value.operationId === null) !== (value.canonicalSha256 === null)) fail('RECEIPT_INVALID');
  if (value.status !== null && !['previewed','committed','conflicted'].includes(value.status)) fail('RECEIPT_INVALID');
  if (value.actions !== null && (!object(value.actions) || !['create','update','unchanged','conflict'].every(key=>count(value.actions[key])) || Object.keys(value.actions).length !== 4 || Object.values(value.actions).reduce((a,b)=>a+b,0) !== value.itemCount)) fail('RECEIPT_INVALID');
  if (value.results !== null && (!object(value.results) || !['applied','unchanged','conflicts'].every(key=>count(value.results[key])) || Object.keys(value.results).length !== 3 || Object.values(value.results).reduce((a,b)=>a+b,0) !== value.itemCount)) fail('RECEIPT_INVALID');
  if (['commit-intent','commit-uncertain'].includes(value.phase) && (!value.operationId || !value.commitKey)) fail('RECEIPT_INVALID');
  return value;
}
function createReceiptStore(path) {
  const parent = dirname(resolve(path));
  mkdirSync(parent,{recursive:true,mode:0o700}); privateDirectory(parent);
  const absolute = resolve(path), lock = `${absolute}.lock`;
  let lockFd;
  try { lockFd = openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600); } catch { fail('RECEIPT_BUSY'); }
  const release = () => { closeSync(lockFd); unlinkSync(lock); };
  const read = () => { try { return assertReceipt(privateJson(absolute,65536)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const write = value => {
    assertReceipt(value);
    try { privateRead(absolute,65536); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = `${absolute}.${randomUUID()}.tmp`;
    const fd = openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try { writeFileSync(fd,JSON.stringify(value)+'\n'); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary,absolute);
    const parentFd=openSync(parent,constants.O_RDONLY);
    try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
  };
  return {read,write,release};
}
function matchSelection(receipt, batch, selected) {
  if (receipt.batchId !== batch.id || receipt.index !== selected.index || receipt.kind !== selected.kind || receipt.itemCount !== selected.itemCount || receipt.fileSha256 !== selected.fileSha256) fail('RECEIPT_SELECTION_MISMATCH');
}
async function currentOperation(base,token,receipt) {
  const raw = await request(base,token,'GET',`/hr/imports/yuzhou/incremental/${receipt.operationId}`);
  return operation(raw,receipt);
}
function applyOperation(receipt,op) {
  receipt.operationId = op.id; receipt.canonicalSha256 = op.canonicalSha256; receipt.status = op.status; receipt.actions = op.actions ?? receipt.actions; receipt.results = op.results;
  receipt.phase = op.status === 'previewed' ? 'previewed' : op.status;
}
function safeCatalog(batches) { return batches.map(batch => ({id:batch.id,sourceProfiles:batch.sourceProfiles,aliasProfiles:batch.aliasProfiles,packages:batch.packages.map(p=>({index:p.index,kind:p.kind,itemCount:p.itemCount,fields:p.fields,fileSha256:p.fileSha256,status:p.status,operationId:p.operationId,canPreview:p.canPreview}))})); }
function safeReceipt(receipt) { return {batchId:receipt.batchId,index:receipt.index,kind:receipt.kind,itemCount:receipt.itemCount,fileSha256:receipt.fileSha256,operationId:receipt.operationId,canonicalSha256:receipt.canonicalSha256,phase:receipt.phase,status:receipt.status,actions:receipt.actions,results:receipt.results}; }
async function refreshPlan(base,token,receipt,store) {
  receipt.planRefreshKey ??= randomUUID();
  store.write(receipt);
  let raw;
  try { raw=await request(base,token,'POST',`/hr/imports/yuzhou/prepared-profile/${receipt.batchId}/packages/${receipt.index}/preview`,null,receipt.planRefreshKey); }
  catch { fail('PREVIEW_UNCERTAIN'); }
  const refreshed=operation(raw,receipt);
  if (refreshed.status !== 'previewed' || !refreshed.actions) {
    // A complete status-only replay proves this key cannot provide a plan. A
    // network error above retains the key so an uncertain request is retried.
    receipt.planRefreshKey=null;store.write(receipt);fail('PREVIEW_PLAN_REQUIRED');
  }
  applyOperation(receipt,refreshed);store.write(receipt);
}

export async function run(argv) {
  const args = parseArgs(argv);
  privateDirectory(dirname(resolve(args['--credentials'])));
  const credentials = privateJson(resolve(args['--credentials']),8192);
  const base = validateBase(credentials);
  const login = await request(base,null,'POST','/auth/login',{tenantId:credentials.tenantId,parkId:credentials.parkId,username:credentials.username,password:credentials.password});
  if (!object(login) || typeof login.accessToken !== 'string' || !login.accessToken || login.requiresContextSelection) fail('LOGIN_INVALID');
  const token = login.accessToken;
  const me = await request(base,token,'GET','/users/me');
  if (!object(me) || me.username !== credentials.username || me.tenant_id !== FIXED.tenantId || me.park_id !== FIXED.parkId || !UUID.test(me.id ?? '') || !Array.isArray(me.permissions) || !(me.is_super === true || me.permissions.includes('*') || me.permissions.includes(MANAGE)) || !(me.is_super === true || me.permissions.includes('*') || me.permissions.includes(READ) || me.permissions.includes(MANAGE))) fail('ACTOR_SCOPE_OR_PERMISSION_INVALID');
  const batches = catalog(await request(base,token,'GET','/hr/imports/yuzhou/prepared-profile'));
  if (args['--mode'] === 'catalog') return safeCatalog(batches);
  const store = createReceiptStore(args['--receipt']);
  try {
    let receipt = store.read();
    if (args['--mode'] === 'preview') {
      const batch = batches.find(row=>row.id===args['--batch-id']);
      const index = Number(args['--index']); const selected = batch?.packages[index];
      if (!batch || !selected || selected.fileSha256 !== args['--expected-file-sha256'] || selected.itemCount !== Number(args['--expected-count'])) fail('SELECTION_MISMATCH');
      if (receipt) matchSelection(receipt,batch,selected);
      else {
        if (!selected.canPreview || selected.status === 'conflicted') fail('ORDER_BLOCKED');
        if (index > 0) { const prior = batch.packages[index-1]; if (prior.status !== 'committed' || !prior.operationId) fail('ORDER_BLOCKED'); const preceding = await request(base,token,'GET',`/hr/imports/yuzhou/incremental/${prior.operationId}`); const priorOp = operation(preceding,{operationId:prior.operationId,itemCount:prior.itemCount,kind:prior.kind}); if (priorOp.status !== 'committed' || priorOp.results.conflicts) fail('ORDER_BLOCKED'); }
        receipt={version:1,batchId:batch.id,index,kind:selected.kind,itemCount:selected.itemCount,fileSha256:selected.fileSha256,previewKey:randomUUID(),planRefreshKey:null,commitKey:null,operationId:null,canonicalSha256:null,phase:'preview-intent',status:null,actions:null,results:null}; store.write(receipt);
      }
      if (receipt.operationId) {
        if (selected.operationId !== receipt.operationId) fail('CATALOG_OPERATION_MISMATCH');
        const op=await currentOperation(base,token,receipt); applyOperation(receipt,op); store.write(receipt);
        if (args['--retry-preview']==='yes' && op.status==='previewed' && !receipt.actions) await refreshPlan(base,token,receipt,store);
        return safeReceipt(receipt);
      }
      if (selected.operationId) {
        const raw = await request(base,token,'GET',`/hr/imports/yuzhou/incremental/${selected.operationId}`);
        const op = operation(raw,{...receipt,operationId:selected.operationId}); applyOperation(receipt,op); store.write(receipt);
        if (args['--retry-preview']==='yes' && op.status==='previewed' && !receipt.actions) await refreshPlan(base,token,receipt,store);
        return safeReceipt(receipt);
      }
      if (receipt.phase === 'preview-uncertain' && args['--retry-preview'] !== 'yes') fail('PREVIEW_RETRY_EXPLICIT_REQUIRED');
      receipt.phase='preview-uncertain';store.write(receipt);
      let raw;
      try { raw=await request(base,token,'POST',`/hr/imports/yuzhou/prepared-profile/${batch.id}/packages/${index}/preview`,null,receipt.previewKey); }
      catch { fail('PREVIEW_UNCERTAIN'); }
      const op=operation(raw,receipt); applyOperation(receipt,op);store.write(receipt);return safeReceipt(receipt);
    }
    if (!receipt) fail('RECEIPT_MISSING');
    const batch=batches.find(row=>row.id===receipt.batchId), selected=batch?.packages[receipt.index];
    if (!batch || !selected) fail('CATALOG_SELECTION_MISSING'); matchSelection(receipt,batch,selected);
    if (!receipt.operationId && selected.operationId) {
      const recovered=operation(await request(base,token,'GET',`/hr/imports/yuzhou/incremental/${selected.operationId}`),{...receipt,operationId:selected.operationId});
      applyOperation(receipt,recovered);store.write(receipt);
    }
    if (!receipt.operationId) fail('PREVIEW_RECOVERY_REQUIRED');
    if (selected.operationId !== receipt.operationId) fail('CATALOG_OPERATION_MISMATCH');
    const op=await currentOperation(base,token,receipt);
    if (args['--mode']==='status') { applyOperation(receipt,op);store.write(receipt);return safeReceipt(receipt); }
    if (op.status !== 'previewed') { applyOperation(receipt,op);store.write(receipt);return safeReceipt(receipt); }
    if (receipt.phase==='commit-intent' || receipt.phase==='commit-uncertain') { receipt.phase='commit-uncertain';store.write(receipt);fail('COMMIT_RETRY_EXPLICIT_REQUIRED'); }
    if (receipt.phase!=='previewed' || !receipt.actions) fail('PREVIEW_PLAN_REQUIRED');
    if (selected.kind==='baseline' && (receipt.actions.create || receipt.actions.update || receipt.actions.conflict) || selected.kind==='alias' && (receipt.actions.create || receipt.actions.conflict)) fail('PREVIEW_CONFLICT');
    if (!selected.canPreview || selected.status==='conflicted') fail('ORDER_BLOCKED');
    if (receipt.index>0) { const prior=batch.packages[receipt.index-1]; if (prior.status!=='committed' || !prior.operationId) fail('ORDER_BLOCKED'); const previous=operation(await request(base,token,'GET',`/hr/imports/yuzhou/incremental/${prior.operationId}`),{operationId:prior.operationId,itemCount:prior.itemCount,kind:prior.kind}); if (previous.status!=='committed' || previous.results.conflicts) fail('ORDER_BLOCKED'); }
    receipt.commitKey ??= randomUUID(); receipt.phase='commit-intent';store.write(receipt);
    let committed;
    try { committed=await request(base,token,'POST',`/hr/imports/yuzhou/incremental/${receipt.operationId}/commit`,null,receipt.commitKey); }
    catch {
      receipt.phase='commit-uncertain';store.write(receipt);
      // A lost response is never permission to repeat the POST. Only a bound
      // terminal GET can resolve this attempt; previewed remains uncertain.
      let recovered;
      try { recovered=await currentOperation(base,token,receipt); } catch { fail('COMMIT_UNCERTAIN'); }
      if (recovered.status==='previewed') fail('COMMIT_UNCERTAIN');
      applyOperation(receipt,recovered);store.write(receipt);return safeReceipt(receipt);
    }
    const result=operation(committed,receipt);if(result.status==='previewed') fail('COMMIT_RESULT_INVALID');applyOperation(receipt,result);store.write(receipt);return safeReceipt(receipt);
  } finally { store.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then(value=>{process.stdout.write(JSON.stringify(value)+'\n');if(value.status==='conflicted')process.exitCode=2;}).catch(error=>{process.stderr.write(`${/^([A-Z][A-Z0-9_]*|HTTP_[0-9]{3})$/u.test(error?.message ?? '') ? error.message : 'IMPORT_COMMAND_FAILED'}\n`);process.exitCode=1;});
}
