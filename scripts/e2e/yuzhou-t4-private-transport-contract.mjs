/* global structuredClone, Buffer */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { EXECUTOR_SHA, pack, unpack, hash } from '../hr-cutover/yuzhou-t4-private-packet.mjs';
import { observeActualParent, reconcileT4 } from '../hr-cutover/yuzhou-t4-private-host.mjs';

test('T4 custody preserves authenticated private files and cannot decrypt a core packet', async t => {
  const root = mkdtempSync(resolve(tmpdir(),'yuzhou-t4-transport-test-')); t.after(() => rmSync(root,{recursive:true,force:true}));
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
  await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T4_PARENT_RECEIPT_INVALID'});assert.equal(f.calls.length,0);
});
test('source, scope, formal pair, phase payload and map conservation drift are rejected',async()=>{
  for(const key of ['source_snapshot_sha256','target_scope_sha256','target_tenant_id','final_rehearsal_pair_sha256']){
    const f=parentFixture();f.rows[0][0][key]='wrong';await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T4_PARENT_DATABASE_DRIFT'});
  }
  const f=parentFixture();f.rows[1][0].payload_bundle_sha256='wrong';await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T4_PARENT_PHASE_DRIFT'});
  for(const changed of [{invalid:'1'},{count:'1'}]){const f=parentFixture();Object.assign(f.rows[2][0],changed);await assert.rejects(observeActualParent(f.client,f.plan,f.receipt),{code:'TRANSPORT_T4_PARENT_RECORD_DRIFT'});}
});
test('post-commit reconciliation rejects published, mutated or incomplete historical wages',async()=>{
  const binding={operationId:'synthetic-t4',parent:{operationId:'synthetic-core'},targetScope:{tenantId:'synthetic-tenant',parkId:'synthetic-park'}};const result={bindingSha256:'a'.repeat(64)};
  const good=[[{status:'succeeded',binding_sha256:result.bindingSha256,parent_operation_id:binding.parent.operationId,unchanged:true}],[{status:'staged',loaded_row_count:'46092',quarantined_row_count:'0',source_amount_total:'102194056.8000',loaded_amount_total:'102194056.8000'}],[{count:'1078020'}]];
  async function run(rows){let i=0;return reconcileT4({async query(sql){assert.match(sql,/^SELECT /u);return{rows:rows[i++]};}},binding,result);}
  assert.deepEqual(await run(good),{reconciliationStatus:'PASS',sourceRecordCount:46092,snapshotItems:1078020,published:false});
  for(const [index,key,value] of [[0,'unchanged',false],[1,'status','published'],[1,'loaded_row_count','46091'],[2,'count','1078019']]){const rows=structuredClone(good);rows[index][0][key]=value;await assert.rejects(run(rows),{code:'TRANSPORT_T4_RECONCILIATION_DRIFT'});}
});
test('T4 workflow pins the executor and host invokes the actual prepare/execute CLI',()=>{
  const root=resolve(import.meta.dirname,'../..');const wf=readFileSync(resolve(root,'.github/workflows/deploy-production.yml'),'utf8');const job=wf.slice(wf.indexOf('\n  t4-private-import:'));
  assert.match(job,new RegExp(`ref: ${EXECUTOR_SHA}`,'u'));assert.doesNotMatch(job,/prod:deploy|scripts\/deploy\.sh|inputs\.ref/u);
  const host=readFileSync(resolve(root,'scripts/hr-cutover/yuzhou-t4-private-host.mjs'),'utf8');
  assert.match(host,/execute-production-t4-followon\.mjs/u);assert.match(host,/'--mode','execute'/u);assert.match(host,/'--mode','prepare'/u);
  assert.doesNotMatch(host,/diagnose-yuzhou-hr-production-target-inventory/u);
  assert.match(host,/options: '-c default_transaction_read_only=on -c timezone=Asia\/Shanghai'/u);
});
