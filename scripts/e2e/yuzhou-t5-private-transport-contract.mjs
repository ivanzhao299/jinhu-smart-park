import process from 'node:process';
/* global structuredClone, Buffer */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { EXECUTOR_SHA, pack, unpack, hash } from '../hr-cutover/yuzhou-t5-private-packet.mjs';
import { observeActualParent, actualPayrollParent, reconcileT5 } from '../hr-cutover/yuzhou-t5-private-host.mjs';

test('T5 custody preserves authenticated private files and cannot decrypt a core packet', async t => {
  const root = mkdtempSync(resolve(tmpdir(),'yuzhou-t5-transport-test-')); t.after(() => rmSync(root,{recursive:true,force:true}));
  const bytes = Buffer.from('{"syntheticOnly":true}\n'); const path = resolve(root,'source.json'); writeFileSync(path,bytes,{mode:0o600});
  const output = resolve(root,'packet'); const receipt = await pack({kind:'import',materials:{kind:'append',parentNonce:'a'.repeat(32),config:{binding:{path,sha256:hash(bytes)}}}},output);
  const m = await unpack(resolve(output,'packet.bin'),resolve(output,'transport-key.txt'),receipt.nonce,receipt.packetSha256,resolve(root,'received'));
  assert.equal(m.codeSha,EXECUTOR_SHA); assert.deepEqual(readFileSync(m.materials.config.binding.path),bytes);
  const core = await import('../hr-cutover/yuzhou-private-import-packet.mjs');
  await assert.rejects(core.unpack(resolve(output,'packet.bin'),resolve(output,'transport-key.txt'),receipt.nonce,receipt.packetSha256,resolve(root,'wrong-executor')));
});
function parentFixture() {
  const plan = {operationId:'synthetic-operation',triple:{sourceSnapshotHash:'a'.repeat(64),mappingContractHash:'b'.repeat(64)},sealing:{sealedPlanSha256:'c'.repeat(64)},target:{identitySha256:'d'.repeat(64)},targetScope:{scopeSha256:'e'.repeat(64),tenantId:'synthetic-tenant',parkId:'synthetic-park'},finalRehearsalPair:{artifactSha256:'f'.repeat(64)},phases:['T0','T1','T2','T3'].map((phase,i)=>({phase,records:i===0?[{disposition:'insert'},{disposition:'quarantine'}]:[],payloadBundleSha256:String(i).repeat(64)}))};
  const receipt={status:'SUCCEEDED',sealedPlanSha256:plan.sealing.sealedPlanSha256,targetScopeSha256:plan.targetScope.scopeSha256,domains:['T0','T1','T2','T3'],receiptSha256:hash(`${plan.operationId}\0${plan.sealing.sealedPlanSha256}\0succeeded\0T0,T1,T2,T3`)};
  const rows=[[{status:'succeeded',code_sha:'dafe8b54510dada1c7bf90663557c54debc89b16',source_snapshot_sha256:plan.triple.sourceSnapshotHash,mapping_contract_sha256:plan.triple.mappingContractHash,sealed_plan_sha256:receipt.sealedPlanSha256,target_identity_sha256:plan.target.identitySha256,target_scope_sha256:plan.targetScope.scopeSha256,target_tenant_id:plan.targetScope.tenantId,target_park_id:plan.targetScope.parkId,final_rehearsal_pair_sha256:plan.finalRehearsalPair.artifactSha256}],plan.phases.map(p=>({phase:p.phase,status:'succeeded',planned_record_count:String(p.records.length),applied_record_count:String(p.records.length),payload_bundle_sha256:p.payloadBundleSha256})),[{count:'2',invalid:'0',sha256:'9'.repeat(64)}]];
  const calls=[];const client={async query(sql,args){calls.push({sql,args});return {rows:rows[calls.length-1]};}};
  return {plan,receipt,rows,calls,client};
}
test('actual parent observation includes quarantines and emits aggregate evidence only',async()=>{
  const f=parentFixture();assert.deepEqual(await observeActualParent(f.client,f.plan,f.receipt),{recordSetSha256:'9'.repeat(64),finalRehearsalPairSha256:'f'.repeat(64),recordCount:2});
  for(const c of f.calls){assert.match(c.sql,/^SELECT /u);assert.match(c.sql,/WHERE .*operation_id=\$1/u);assert.equal(c.args[0],f.plan.operationId);}
});
test('parent observation rejects a forged success receipt before touching the database',async()=>{
  const f=parentFixture();f.receipt.receiptSha256='0'.repeat(64);
  await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T5_PARENT_RECEIPT_INVALID'});assert.equal(f.calls.length,0);
});
test('source, scope, formal pair, phase payload and map conservation drift are rejected',async()=>{
  for(const key of ['source_snapshot_sha256','target_scope_sha256','target_tenant_id','final_rehearsal_pair_sha256']){
    const f=parentFixture();f.rows[0][0][key]='wrong';await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T5_PARENT_DATABASE_DRIFT'});
  }
  const f=parentFixture();f.rows[1][0].payload_bundle_sha256='wrong';await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T5_PARENT_PHASE_DRIFT'});
  for(const changed of [{invalid:'1'},{count:'1'}]){const f=parentFixture();Object.assign(f.rows[2][0],changed);await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T5_PARENT_RECORD_DRIFT'});}
});
test('T5 reconciliation requires complete originals, projections and real employee photos',async()=>{
  const binding={operationId:'synthetic-t5',parent:{operationId:'synthetic-core'},payrollParent:{operationId:'synthetic-t4'},targetScope:{tenantId:'synthetic-tenant',parkId:'synthetic-park'}},result={bindingSha256:'a'.repeat(64)};
  const good=[[{status:'succeeded',binding_sha256:result.bindingSha256,parent_operation_id:binding.parent.operationId,payroll_operation_id:binding.payrollParent.operationId,unchanged:true}],[{sources:20182,receipts:127449,photos:2149}]];
  async function run(rows){let i=0;return reconcileT5({async query(sql){assert.match(sql,/^SELECT /u);return{rows:rows[i++]};}},binding,result);}
  assert.equal((await run(good)).reconciliationStatus,'PASS');
  for(const[index,key,value]of[[0,'unchanged',false],[0,'payroll_operation_id','other'],[1,'sources',20181],[1,'receipts',127448],[1,'photos',2148]]){const rows=structuredClone(good);rows[index][0][key]=value;await assert.rejects(run(rows),{code:'TRANSPORT_T5_RECONCILIATION_DRIFT'});}
});
test('legitimate empty historical domains remain authenticated empty 0600 files',async t=>{
 const root=mkdtempSync(resolve(tmpdir(),'yuzhou-t5-empty-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=resolve(root,'empty.jsonl');writeFileSync(path,Buffer.alloc(0),{mode:0o600});
 const output=resolve(root,'packet');const receipt=await pack({kind:'import',materials:{stage:{empty:{path,sha256:hash(Buffer.alloc(0))}}}},output);
 const m=await unpack(resolve(output,'packet.bin'),resolve(output,'transport-key.txt'),receipt.nonce,receipt.packetSha256,resolve(root,'received'));
 assert.equal(readFileSync(m.materials.stage.empty.path).length,0);
});
test('T5 workflow pins the executor and host invokes the actual prepare/execute CLI',()=>{
  const root=resolve(import.meta.dirname,'../..');const wf=readFileSync(resolve(root,'.github/workflows/deploy-production.yml'),'utf8');const job=wf.slice(wf.indexOf('\n  t5-private-import:'));
  assert.match(job,new RegExp(`ref: ${EXECUTOR_SHA}`,'u'));assert.doesNotMatch(job,/prod:deploy|scripts\/deploy\.sh|inputs\.ref/u);
  assert.match(job, /actions\/upload-artifact@v4/u);
  assert.match(job, /yuzhou-t5-transport-evidence\.jsonl/u);
  const host=readFileSync(resolve(root,'scripts/hr-cutover/yuzhou-t5-private-host.mjs'),'utf8');
  assert.match(host,/execute-production-t5-followon\.mjs/u);assert.match(host,/'--mode','execute'/u);assert.match(host,/'--mode','prepare'/u);
  assert.doesNotMatch(host,/diagnose-yuzhou-hr-production-target-inventory/u);
  assert.match(host,/options: '-c default_transaction_read_only=on -c timezone=Asia\/Shanghai'/u);
  assert.match(host,/PGOPTIONS: '-c timezone=Asia\/Shanghai'/u);
});

test('payroll parent custody requires the actual succeeded operation and unchanged owned state',async t=>{
 const nonce=randomBytes(16).toString('hex'),root=resolve('/tmp',`jinhu-yuzhou-t4-${nonce}`);mkdirSync(root,{mode:0o700});mkdirSync(resolve(root,'private'),{mode:0o700});t.after(()=>rmSync(root,{recursive:true,force:true}));
 const executor=resolve(root,'synthetic-executor');mkdirSync(resolve(executor,'scripts/hr-cutover'),{recursive:true,mode:0o700});
 const fixtureCode='export const canonicalT4 = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonicalT4).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalT4(value[key])}`).join(",")}}`;';
 writeFileSync(resolve(executor,'scripts/hr-cutover/production-import-t4-followon-binding.mjs'),fixtureCode,{mode:0o600});
 const {canonicalT4}=await import(resolve(executor,'scripts/hr-cutover/production-import-t4-followon-binding.mjs'));
 const triple={codeSha:'a'.repeat(40),sourceSnapshotHash:'b'.repeat(64),mappingContractHash:'c'.repeat(64)};
 const binding={operationId:'synthetic-payroll',executionCodeSha:'d'.repeat(40),parent:{operationId:'synthetic-core'},triple};
 const bindingBytes=Buffer.from(JSON.stringify(binding));const bindingPath=resolve(root,'private/binding.json');writeFileSync(bindingPath,bindingBytes,{mode:0o600});
 const configBytes=Buffer.from(JSON.stringify({binding:{path:bindingPath,sha256:hash(bindingBytes)}}));writeFileSync(resolve(root,'private/config.json'),configBytes,{mode:0o600});writeFileSync(resolve(root,'prepared.json'),JSON.stringify({codeSha:binding.executionCodeSha,configSha256:hash(configBytes)}),{mode:0o600});
 const bindingSha256=hash(canonicalT4(binding));writeFileSync(resolve(root,'execution-receipt.json'),JSON.stringify({status:'SUCCEEDED',bindingSha256}),{mode:0o600});
 const row={status:'succeeded',binding_sha256:bindingSha256,parent_operation_id:'synthetic-core',owned_state:{synthetic:true},unchanged:true};
 const client={async query(sql,args){assert.match(sql,/^SELECT /u);assert.equal(args[0],binding.operationId);return{rows:[row]};}};
 const parent={plan:{operationId:'synthetic-core',triple}};
 const proof=await actualPayrollParent(client,nonce,parent,executor);assert.equal(proof.ownedStateSha256,hash(canonicalT4(row.owned_state)));
 row.unchanged=false;await assert.rejects(actualPayrollParent(client,nonce,parent,executor),{code:'TRANSPORT_T5_PAYROLL_PARENT_DRIFT'});
});

test('full-size private child uses the import-only 8 GiB heap budget', async () => {
  const { importChildArguments, importChildEnvironment } = await import('../hr-cutover/yuzhou-t5-private-host.mjs');
  const { spawnSync } = await import('node:child_process');
  const args = importChildArguments(['entry.mjs', '--config', 'fixture.json']);
  const timezoneChild = spawnSync(process.execPath, ['--input-type=module', '-e', "import pg from 'pg'; process.stdout.write(new pg.Client().connectionParameters.options)"], { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8', env: importChildEnvironment({ ...process.env, PGOPTIONS: '-c timezone=UTC' }) });
  assert.equal(timezoneChild.status, 0, timezoneChild.stderr);
  assert.equal(timezoneChild.stdout, '-c timezone=Asia/Shanghai');
  assert.deepEqual(args.slice(1), ['entry.mjs', '--config', 'fixture.json']);
  const child = spawnSync(process.execPath, [args[0], '--input-type=module', '-e', "import{getHeapStatistics}from'node:v8';process.stdout.write(String(getHeapStatistics().heap_size_limit))"], { encoding: 'utf8' });
  assert.equal(child.status, 0); assert.ok(Number(child.stdout) >= 8 * 1024 ** 3);
});
