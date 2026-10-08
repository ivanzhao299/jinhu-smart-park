import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, unlinkSync, readFileSync, openSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { run } from '../import-yuzhou-prepared-profile.mjs';

const A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64), D='d'.repeat(64);
const OP='12345678-1234-4234-8234-123456789abc';
const USER='12345678-1234-4234-8234-123456789abd';
const envelope=data=>({code:0,data});
const mkEntry=(index,kind,itemCount,fileSha256)=>({index,kind,itemCount,fields:kind==='alias'?['nativePlace','degree']:[],packageSha256:fileSha256,status:'ready',operationId:null,canPreview:index===0});
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'prepared-profile-command-'));chmodSync(root,0o700);
  const credentials=join(root,'credentials.json'), receipt=join(root,'receipt.json');
  const state={user:'operator',meTenant:'10000001',mePark:'20000001',permissions:['hr:employee_profile:manage','hr:employee_profile:read'],posts:[],cachedStatusOnlyKeys:new Set(),statusOnlyNextRefresh:false,lostPreview:false,lostRefresh:false,dropPreviewBeforeOperation:false,lostCommit:false,dropCommitBeforeApply:false,failRecoveryGet:false,commitResult:null,statusGets:0,operation:null,predecessor:null,plan:['unchanged','unchanged'],batch:{id:A,sourceProfiles:2,aliasProfiles:1,packages:[mkEntry(0,'baseline',2,B),mkEntry(1,'alias',1,C)]}};
  let server;
  const start=async()=>{
    server=createServer(async(req,res)=>{
      const chunks=[];for await(const c of req)chunks.push(c);
      const url=new URL(req.url,'http://127.0.0.1');
      const path=url.pathname.replace(/^\/api\/v1/u,'');
      const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
      if(path==='/auth/login'&&req.method==='POST') { const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(body.username,state.user);assert.equal(body.tenantId,'10000001');assert.equal(body.parkId,'20000001');return send(200,envelope({accessToken:'sentinel-secret-token'})); }
      if(req.headers.authorization!=='Bearer sentinel-secret-token') return send(401,{message:'sentinel-secret-leak'});
      if(path==='/users/me'&&req.method==='GET') return send(200,envelope({id:USER,username:state.user,tenant_id:state.meTenant,park_id:state.mePark,permissions:state.permissions}));
      if(path==='/hr/imports/yuzhou/prepared-profile'&&req.method==='GET') return send(200,envelope([state.batch]));
      if([0,1].some(index=>path===`/hr/imports/yuzhou/prepared-profile/${A}/packages/${index}/preview`)&&req.method==='POST') {
        state.posts.push({path,key:req.headers['x-idempotency-key']});
        if(state.dropPreviewBeforeOperation){state.dropPreviewBeforeOperation=false;req.socket.destroy();return;}
        if(!state.operation) state.operation={id:OP,status:'previewed',packageSha256:D,itemCount:state.plan.length,appliedCount:0,unchangedCount:0,conflictCount:0,plan:state.plan.map(action=>({action,sourceKey:'sentinel-secret-source-row'}))};
        const index=Number(path.match(/packages\/(\d+)\/preview$/u)[1]);state.batch.packages[index].status='previewed';state.batch.packages[index].operationId=OP;
        if(state.lostPreview){state.lostPreview=false;state.cachedStatusOnlyKeys.add(req.headers['x-idempotency-key']);req.socket.destroy();return;}
        if(state.lostRefresh){state.lostRefresh=false;req.socket.destroy();return;}
        if(state.statusOnlyNextRefresh && state.posts.length>1){state.statusOnlyNextRefresh=false;state.cachedStatusOnlyKeys.add(req.headers['x-idempotency-key']);return send(200,envelope({...state.operation,plan:undefined}));}
        if(state.cachedStatusOnlyKeys.has(req.headers['x-idempotency-key'])) return send(200,envelope({...state.operation,plan:undefined}));
        return send(200,envelope(state.operation));
      }
      if(path===`/hr/imports/yuzhou/incremental/${OP}`&&req.method==='GET') {
        state.statusGets++;
        if(state.failRecoveryGet&&state.posts.some(row=>row.path.endsWith('/commit'))) return send(503,{message:'sentinel-secret-leak'});
        return send(200,envelope(state.operation ? {...state.operation,plan:undefined} : {private:'sentinel-secret-leak'}));
      }
      if(path===`/hr/imports/yuzhou/incremental/${USER}`&&req.method==='GET') return send(200,envelope(state.predecessor));
      if(path===`/hr/imports/yuzhou/incremental/${OP}/commit`&&req.method==='POST'){
        state.posts.push({path,key:req.headers['x-idempotency-key']});
        if(state.dropCommitBeforeApply){state.dropCommitBeforeApply=false;req.socket.destroy();return;}
        state.operation={...state.operation,status:'committed',appliedCount:state.plan.filter(action=>action==='update').length,unchangedCount:state.plan.filter(action=>action==='unchanged').length,conflictCount:0,...state.commitResult,plan:undefined};
        const selected=state.batch.packages.find(entry=>entry.operationId===OP);selected.status=state.operation.status;
        if(selected.index===0)state.batch.packages[1].canPreview=state.operation.status==='committed';
        if(state.lostCommit){state.lostCommit=false;req.socket.destroy();return;}
        return send(200,envelope(state.operation));
      }
      return send(404,{message:'sentinel-secret-leak'});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const apiBase=`http://127.0.0.1:${server.address().port}/api/v1`;
    writeFileSync(credentials,JSON.stringify({apiBase,username:state.user,password:'sentinel-secret-password',tenantId:'10000001',parkId:'20000001'}),{mode:0o600});
  };
  const stop=async()=>{if(server)await new Promise(resolve=>server.close(resolve));};
  const args=(mode,extra=[])=>['--mode',mode,'--credentials',credentials,'--receipt',receipt,...extra];
  const preview=()=>args('preview',['--batch-id',A,'--index','0','--expected-file-sha256',B,'--expected-count','2']);
  return {root,credentials,receipt,state,start,stop,args,preview};
}

test('normal auth, catalog, baseline preview, commit and replay use one HTTP writer',async()=>{
  const f=fixture();await f.start();try{
    const catalog=await run(f.args('catalog'));assert.equal(catalog[0].packages[0].fileSha256,B);
    const preview=await run(f.preview());assert.equal(preview.canonicalSha256,D);assert.deepEqual(preview.actions,{create:0,update:0,unchanged:2,conflict:0});
    assert.doesNotMatch(JSON.stringify(preview),/sentinel-secret|sourceKey/);
    const saved=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(saved.previewKey,f.state.posts[0].key);assert.equal(saved.fileSha256,B);assert.equal(saved.canonicalSha256,D);
    assert.equal(statSync(f.root).mode&0o777,0o700);assert.equal(statSync(f.receipt).mode&0o777,0o600);
    const committed=await run(f.args('commit'));assert.equal(committed.status,'committed');assert.deepEqual(committed.results,{applied:0,unchanged:2,conflicts:0});
    await run(f.args('commit'));assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
  }finally{await f.stop();}
});

test('lost preview recovers exact operation through catalog and never changes key',async()=>{
  const f=fixture();await f.start();try{
    f.state.lostPreview=true;await assert.rejects(run(f.preview()),/PREVIEW_UNCERTAIN/);
    const before=JSON.parse(readFileSync(f.receipt,'utf8'));
    const recovered=await run(f.args('status'));assert.equal(recovered.operationId,OP);assert.equal(f.state.posts.length,1);
    const after=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(after.previewKey,before.previewKey);
    await assert.rejects(run(f.args('commit')),/PREVIEW_PLAN_REQUIRED/);
    const refreshed=await run([...f.preview(),'--retry-preview','yes']);assert.deepEqual(refreshed.actions,{create:0,update:0,unchanged:2,conflict:0});
    const refreshedReceipt=JSON.parse(readFileSync(f.receipt,'utf8'));
    assert.notEqual(f.state.posts[0].key,f.state.posts[1].key);assert.equal(refreshedReceipt.planRefreshKey,f.state.posts[1].key);
    assert.equal(refreshedReceipt.previewKey,before.previewKey);
    const committed=await run(f.args('commit'));assert.equal(committed.status,'committed');
  }finally{await f.stop();}
});

test('lost plan refresh keeps its separate key until exact operation is recovered',async()=>{
  const f=fixture();await f.start();try{
    f.state.lostPreview=true;await assert.rejects(run(f.preview()),/PREVIEW_UNCERTAIN/);
    await run(f.args('status'));
    f.state.lostRefresh=true;await assert.rejects(run([...f.preview(),'--retry-preview','yes']),/PREVIEW_UNCERTAIN/);
    const pending=JSON.parse(readFileSync(f.receipt,'utf8'));
    assert.notEqual(pending.planRefreshKey,pending.previewKey);
    assert.equal(f.state.posts[1].key,pending.planRefreshKey);
    const result=await run([...f.preview(),'--retry-preview','yes']);assert.equal(result.operationId,OP);
    assert.equal(f.state.posts[2].key,pending.planRefreshKey);
    assert.equal(JSON.parse(readFileSync(f.receipt,'utf8')).planRefreshKey,pending.planRefreshKey);
  }finally{await f.stop();}
});

test('confirmed status-only refresh rotates its key on the next explicit attempt',async()=>{
  const f=fixture();await f.start();try{
    f.state.lostPreview=true;await assert.rejects(run(f.preview()),/PREVIEW_UNCERTAIN/);
    await run(f.args('status'));f.state.statusOnlyNextRefresh=true;
    await assert.rejects(run([...f.preview(),'--retry-preview','yes']),/PREVIEW_PLAN_REQUIRED/);
    const firstRefreshKey=f.state.posts[1].key;
    const pending=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(pending.planRefreshKey,null);
    const recovered=await run([...f.preview(),'--retry-preview','yes']);assert.equal(recovered.operationId,OP);
    assert.notEqual(f.state.posts[2].key,firstRefreshKey);
    assert.notEqual(f.state.posts[2].key,f.state.posts[0].key);
  }finally{await f.stop();}
});

test('preview transport loss before creation requires explicit same-key retry',async()=>{
  const f=fixture();await f.start();try{
    f.state.dropPreviewBeforeOperation=true;await assert.rejects(run(f.preview()),/PREVIEW_UNCERTAIN/);
    const first=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(first.operationId,null);
    await assert.rejects(run(f.preview()),/PREVIEW_RETRY_EXPLICIT_REQUIRED/);assert.equal(f.state.posts.length,1);
    const recovered=await run([...f.preview(),'--retry-preview','yes']);assert.equal(recovered.operationId,OP);
    assert.equal(f.state.posts.length,2);assert.equal(f.state.posts[0].key,f.state.posts[1].key);
  }finally{await f.stop();}
});

test('lost commit is queried by original ID and terminal replay has zero POST',async()=>{
  const f=fixture();await f.start();try{
    await run(f.preview());f.state.lostCommit=true;
    const status=await run(f.args('commit'));assert.equal(status.status,'committed');assert.equal(f.state.statusGets,2);
    const recovered=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(recovered.phase,'committed');assert.equal(recovered.operationId,OP);
    await run(f.args('commit'));assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
  }finally{await f.stop();}
});

test('lost commit with previewed recovery keeps its key and requires status before explicit retry',async()=>{
  const f=fixture();await f.start();try{
    await run(f.preview());f.state.dropCommitBeforeApply=true;
    await assert.rejects(run(f.args('commit')),/COMMIT_UNCERTAIN/);
    const uncertain=JSON.parse(readFileSync(f.receipt,'utf8'));
    assert.equal(uncertain.phase,'commit-uncertain');assert.equal(uncertain.operationId,OP);
    assert.equal(f.state.statusGets,2);
    await assert.rejects(run(f.args('commit')),/COMMIT_RETRY_EXPLICIT_REQUIRED/);
    assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
    const status=await run(f.args('status'));assert.equal(status.status,'previewed');
    const committed=await run(f.args('commit'));assert.equal(committed.status,'committed');
    const commits=f.state.posts.filter(row=>row.path.endsWith('/commit'));
    assert.equal(commits.length,2);assert.equal(commits[0].key,uncertain.commitKey);assert.equal(commits[1].key,uncertain.commitKey);
  }finally{await f.stop();}
});

test('unavailable status preserves the complete uncertain receipt and commit key',async()=>{
  const f=fixture();await f.start();try{
    await run(f.preview());f.state.lostCommit=true;f.state.failRecoveryGet=true;
    await assert.rejects(run(f.args('commit')),/COMMIT_UNCERTAIN/);
    const before=readFileSync(f.receipt,'utf8');assert.equal(JSON.parse(before).phase,'commit-uncertain');
    await assert.rejects(run(f.args('status')),/HTTP_503/);
    assert.equal(readFileSync(f.receipt,'utf8'),before);
    f.state.failRecoveryGet=false;
    const recovered=await run(f.args('status'));assert.equal(recovered.status,'committed');
    assert.equal(JSON.parse(readFileSync(f.receipt,'utf8')).commitKey,JSON.parse(before).commitKey);
    assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
  }finally{await f.stop();}
});

test('modern conflicts preserve baseline and alias terminal counts without repeating writes',async()=>{
  for(const kind of ['baseline','alias'])for(const lost of [false,true]){
    const f=fixture();await f.start();try{
      let preview=f.preview();
      if(kind==='alias'){
        f.state.batch.packages[0].status='committed';f.state.batch.packages[0].operationId=USER;f.state.batch.packages[1].canPreview=true;
        f.state.predecessor={id:USER,status:'committed',packageSha256:D,itemCount:2,appliedCount:0,unchangedCount:2,conflictCount:0};
        f.state.plan=['update'];
        preview=f.args('preview',['--batch-id',A,'--index','1','--expected-file-sha256',C,'--expected-count','1']);
      }
      await run(preview);f.state.lostCommit=lost;
      f.state.commitResult={status:'conflicted',appliedCount:0,unchangedCount:kind==='baseline'?1:0,conflictCount:1};
      const result=await run(f.args('commit'));
      assert.equal(result.status,'conflicted');assert.equal(result.phase,'conflicted');
      assert.deepEqual(result.results,{applied:0,unchanged:kind==='baseline'?1:0,conflicts:1});
      const terminal=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(terminal.phase,'conflicted');
      assert.deepEqual(await run(f.args('status')),result);assert.deepEqual(await run(f.args('commit')),result);
      assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
      if(kind==='baseline'){
        const next=f.args('preview',['--batch-id',A,'--index','1','--expected-file-sha256',C,'--expected-count','1']);
        next[next.indexOf('--receipt')+1]=join(f.root,'next.json');
        await assert.rejects(run(next),/ORDER_BLOCKED/);
      }
      const child=spawn(process.execPath,['scripts/hr-cutover/import-yuzhou-prepared-profile.mjs',...f.args('status')],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
      assert.equal(await new Promise(resolve=>child.on('exit',resolve)),2);
      assert.equal(JSON.parse(stdout).status,'conflicted');assert.equal(stderr,'');assert.doesNotMatch(stdout,/sentinel-secret|sourceKey/);
    }finally{await f.stop();}
  }
});

test('foreign ID, hash and count do not release uncertain result',async()=>{
  for(const mutation of ['id','packageSha256','itemCount']){
    const f=fixture();await f.start();try{
      await run(f.preview());f.state.lostCommit=true;f.state.failRecoveryGet=true;await assert.rejects(run(f.args('commit')),/COMMIT_UNCERTAIN/);
      f.state.failRecoveryGet=false;
      f.state.operation={...f.state.operation,[mutation]: mutation==='id'?USER:mutation==='packageSha256'?C:1};
      await assert.rejects(run(f.args('status')),/OPERATION_BINDING_INVALID/);
      assert.equal(JSON.parse(readFileSync(f.receipt,'utf8')).phase,'commit-uncertain');
      assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,1);
    }finally{await f.stop();}
  }
});

test('scope, order and preview conflict fail before business writer',async()=>{
  for(const mode of ['scope','order','conflict']){
    const f=fixture();await f.start();try{
      if(mode==='scope')f.state.mePark='other';
      if(mode==='order')f.state.batch.packages[0].canPreview=false;
      if(mode==='conflict')f.state.plan=['unchanged','conflict'];
      await assert.rejects(run(f.preview()),mode==='scope'?/ACTOR_SCOPE_OR_PERMISSION_INVALID/:mode==='order'?/ORDER_BLOCKED/:/PREVIEW_CONFLICT/);
      assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,0);
    }finally{await f.stop();}
  }
});

test('alias cannot create or preview-conflict and predecessor must be committed with zero conflicts',async()=>{
  for(const action of ['create','conflict']){
    const f=fixture();await f.start();try{
      f.state.batch.packages[0].status='committed';f.state.batch.packages[0].operationId=USER;f.state.batch.packages[1].canPreview=true;
      f.state.predecessor={id:USER,status:'committed',packageSha256:D,itemCount:2,appliedCount:0,unchangedCount:2,conflictCount:0};
      f.state.plan=[action];
      await assert.rejects(run(f.args('preview',['--batch-id',A,'--index','1','--expected-file-sha256',C,'--expected-count','1'])),/PREVIEW_CONFLICT/);
      assert.equal(f.state.posts.filter(row=>row.path.endsWith('/commit')).length,0);
    }finally{await f.stop();}
  }
  const f=fixture();await f.start();try{
    f.state.batch.packages[0].status='committed';f.state.batch.packages[0].operationId=USER;f.state.batch.packages[1].canPreview=true;
    f.state.predecessor={id:USER,status:'conflicted',packageSha256:D,itemCount:2,appliedCount:0,unchangedCount:1,conflictCount:1};
    await assert.rejects(run(f.args('preview',['--batch-id',A,'--index','1','--expected-file-sha256',C,'--expected-count','1'])),/RESULT_POLICY_INVALID|ORDER_BLOCKED/);
    assert.equal(f.state.posts.length,0);
  }finally{await f.stop();}
});

test('CLI writes only redacted error codes even when server body contains sentinel',async()=>{
  const f=fixture();await f.start();try{
    f.state.permissions=[];
    const child=spawn(process.execPath,['scripts/hr-cutover/import-yuzhou-prepared-profile.mjs',...f.args('catalog')],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk.toString());
    const code=await new Promise(resolve=>child.on('exit',resolve));assert.equal(code,1);assert.match(output,/ACTOR_SCOPE_OR_PERMISSION_INVALID/);
    assert.doesNotMatch(output,/sentinel-secret|password|Bearer|\/tmp\/|private/iu);
  }finally{await f.stop();}
});

test('private file and concurrent receipt lock guards',async()=>{
  const f=fixture();await f.start();try{
    chmodSync(f.credentials,0o644);await assert.rejects(run(f.args('catalog')),/PRIVATE_FILE_INVALID/);chmodSync(f.credentials,0o600);
    const bad=join(f.root,'bad.json');writeFileSync(bad,'{}',{mode:0o600});const link=join(f.root,'link.json');symlinkSync(bad,link);
    await assert.rejects(run(['--mode','catalog','--credentials',link]),/PRIVATE_FILE_INVALID/);
    const fd=openSync(`${f.receipt}.lock`,'wx',0o600);try{await assert.rejects(run(f.preview()),/RECEIPT_BUSY/);}finally{closeSync(fd);unlinkSync(`${f.receipt}.lock`);}
    await run(f.preview());chmodSync(f.receipt,0o644);await assert.rejects(run(f.args('status')),/PRIVATE_FILE_INVALID/);
  }finally{await f.stop();}
});
