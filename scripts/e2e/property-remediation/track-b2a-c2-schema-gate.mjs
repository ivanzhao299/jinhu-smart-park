import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { connect as connectTcp, createServer } from "node:net";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  buildEphemeralPostgresRunArgs,
  inspectContainer,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./bootstrap/ephemeral-postgres.mjs";

const receiptIdentityGrammarV1=input=>`b2a-c2-receipt-identity-v1\nreceipt_id\t${input.receiptId}\ntenant_id\t${input.tenantId}\npark_id\t${input.parkId}\nactor_id\t${input.actorId}\naction_id\t${input.actionId}\ntarget_id\t${input.targetId}\nclient_key\t${input.clientKey}\nrequest_hash\t${input.requestHash}\n`;
const receiptIdentitySha256V1=input=>createHash("sha256").update(receiptIdentityGrammarV1(input)).digest("hex");
function createDispatchTimeoutSnapshot({name,remainingBudgetMs,dispatchNs,blockingOperation=true,
  deadlineSafetyMs=25,lockSafetyMs=25}) {
  if(!Number.isInteger(remainingBudgetMs)||remainingBudgetMs<=deadlineSafetyMs+lockSafetyMs)
    throw new Error(`deadline-expired-or-below-safety-before-${name}:${remainingBudgetMs}`);
  const statementTimeoutMs=Math.min(remainingBudgetMs-deadlineSafetyMs,4_999);
  const lockTimeoutMs=Math.min(statementTimeoutMs-lockSafetyMs,4_999);
  if(statementTimeoutMs<=0||lockTimeoutMs<=0||statementTimeoutMs>remainingBudgetMs||lockTimeoutMs>remainingBudgetMs)
    throw new Error(`invalid-dispatch-timeout-snapshot-${name}`);
  return Object.freeze({name,dispatch_ns:String(dispatchNs),remaining_budget_ms:remainingBudgetMs,
    statement_timeout_ms:statementTimeoutMs,lock_timeout_ms:lockTimeoutMs,query_timeout_ms:statementTimeoutMs,
    deadline_safety_ms:deadlineSafetyMs,lock_safety_ms:lockSafetyMs,blocking_operation:blockingOperation,
    lock_timeout_semantics:blockingOperation?"effective-lock-budget":"configured-transaction-setting-no-explicit-lock-operation"});
}
const timeoutSetSql=snapshot=>({statement:`SET LOCAL statement_timeout='${snapshot.statement_timeout_ms}ms'`,
  lock:`SET LOCAL lock_timeout='${snapshot.lock_timeout_ms}ms'`});
function deriveWaitBudgetEvidence({observedNs,deadlineNs,actualWaitMs,effectiveLockTimeoutMs,remainingBudgetMs,
  lowerToleranceMs=250,upperToleranceMs=750}) {
  const deadlineExceeded=BigInt(observedNs)>BigInt(deadlineNs);
  const lowerBoundMet=actualWaitMs>=effectiveLockTimeoutMs-lowerToleranceMs;
  const upperBoundMet=actualWaitMs<=effectiveLockTimeoutMs+upperToleranceMs;
  const configuredWithinRemaining=effectiveLockTimeoutMs>0&&effectiveLockTimeoutMs<=remainingBudgetMs;
  return {waited_until_remaining_budget:!deadlineExceeded&&lowerBoundMet&&upperBoundMet&&configuredWithinRemaining,
    deadline_exceeded:deadlineExceeded,lower_bound_met:lowerBoundMet,upper_bound_met:upperBoundMet,
    configured_within_remaining:configuredWithinRemaining,lower_tolerance_ms:lowerToleranceMs,
    upper_tolerance_ms:upperToleranceMs};
}
function boundedExactAbsencePoll({kind,target,inspect,timeoutMs=10_000,intervalMs=50,
  now=()=>Date.now(),wait=milliseconds=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,milliseconds)}) {
  const startedMs=now(),deadlineMs=startedMs+timeoutMs,timeline=[];
  while(true){const beforeInspectMs=now(),observation=inspect(target,{deadline_ms:deadlineMs,
      remaining_ms:Math.max(0,deadlineMs-beforeInspectMs)}),observedMs=now();
    const elapsedMs=observedMs-startedMs,deadlineExceeded=observedMs>deadlineMs;
    timeline.push({at_ms:observedMs,elapsed_ms:elapsedMs,deadline_exceeded:deadlineExceeded,...observation});
    if(observation.absent===true&&observedMs<=deadlineMs)return {kind,target,absent:true,started_ms:startedMs,deadline_ms:deadlineMs,
      elapsed_ms:elapsedMs,deadline_exceeded:deadlineExceeded,timeline};
    if(observedMs>=deadlineMs)return {kind,target,absent:false,started_ms:startedMs,deadline_ms:deadlineMs,
      elapsed_ms:elapsedMs,deadline_exceeded:deadlineExceeded,
      late_absence_rejected:observation.absent===true&&observedMs>deadlineMs,timeline};
    wait(Math.min(intervalMs,deadlineMs-observedMs));
  }
}
function summarizeAttemptTimeouts(operations) {
  const timed=operations.filter(operation=>operation.remaining_budget_ms!=null);
  const blocking=timed.filter(operation=>operation.blocking_operation===true&&
    operation.statement_timeout_ms!=null&&operation.lock_timeout_ms!=null);
  if(!blocking.length)throw new Error("attempt has no real blocking operation timeout evidence");
  for(const operation of blocking){
    if(!(operation.statement_timeout_ms>0&&operation.lock_timeout_ms>0&&
      operation.statement_timeout_ms<=operation.remaining_budget_ms&&operation.lock_timeout_ms<=operation.remaining_budget_ms))
      throw new Error(`attempt blocking timeout exceeds remaining budget: ${JSON.stringify(operation)}`);
  }
  const source=blocking.reduce((minimum,operation)=>operation.remaining_budget_ms<minimum.remaining_budget_ms?operation:minimum);
  return {remaining_budget_ms:source.remaining_budget_ms,
    minimum_remaining_budget_ms:Math.min(...blocking.map(operation=>operation.remaining_budget_ms)),
    statement_timeout_ms:source.statement_timeout_ms,lock_timeout_ms:source.lock_timeout_ms,
    timeout_source_operation:source.name,blocking_operation_timeouts:blocking.map(operation=>({name:operation.name,
      remaining_budget_ms:operation.remaining_budget_ms,statement_timeout_ms:operation.statement_timeout_ms,
      lock_timeout_ms:operation.lock_timeout_ms,outcome:operation.outcome}))};
}
function deriveNegativeAccessCounts(instrument) {
  const receiptScanDelta=Number(instrument.receipt_scan_delta),headScanDelta=Number(instrument.head_scan_delta);
  if(!Number.isInteger(receiptScanDelta)||receiptScanDelta<0||!Number.isInteger(headScanDelta)||headScanDelta<0)
    throw new Error(`invalid negative DB access instrument: ${JSON.stringify(instrument)}`);
  return {receipt:receiptScanDelta>0?1:0,head:headScanDelta>0?1:0,
    derivation:"pg_stat_xact_user_tables scan delta > 0",instrument:{receipt_scan_delta:receiptScanDelta,head_scan_delta:headScanDelta}};
}

if(process.env.B2A_C2_HELPER_CHILD==="1"){
  const input=JSON.parse(process.env.B2A_C2_HELPER_INPUT);
  const result=input.kind==="attempt-timeouts"?summarizeAttemptTimeouts(input.operations):
    input.kind==="negative-access"?deriveNegativeAccessCounts(input.instrument):
    input.kind==="dispatch-timeout"?(()=>{const snapshot=createDispatchTimeoutSnapshot(input);
      const configured=timeoutSetSql(snapshot),evidence=snapshot;return {configured,evidence,
        configuration_evidence_same_object:evidence===snapshot};})():
    input.kind==="wait-budget"?deriveWaitBudgetEvidence(input):
    input.kind==="absence-poll"?(()=>{let clock=0,index=0;const sequence=input.sequence,inspectRemaining=[];
      const poll=boundedExactAbsencePoll({kind:input.targetKind,target:input.target,timeoutMs:input.timeoutMs,
        intervalMs:input.intervalMs,now:()=>clock,wait:milliseconds=>{clock+=milliseconds;},
        inspect:(_target,context)=>{inspectRemaining.push(context.remaining_ms);
          const observation=sequence[Math.min(index++,sequence.length-1)];clock+=observation.advance_ms??0;
          const {advance_ms:ignored,...result}=observation;return result;}});
      return {...poll,inspect_remaining_ms:inspectRemaining};})():null;
  if(!result)throw new Error(`unknown helper child kind: ${input.kind}`);
  writeFileSync(1,`${JSON.stringify(result)}\n`);process.exit(0);
}

function createLifecycleMachine(target, tempTarget = null) {
  return { target, temp_target:tempTarget, phase:"initialized", created:false, primary_status:0,
    origin_phase:"initialized",terminal_event:null,drop_status:null, temp_status:0, cleanup_calls:0,
    drop_attempted:false, cleanup_result:null, timeline:[] };
}
function transitionLifecycle(machine, event, detail = {}) {
  const allowed={initialized:["create-succeeded","create-failed","signal","cleanup-started"],created:["test-succeeded","test-failed","signal","cleanup-started"],
    tested:["cleanup-started"],failed:["cleanup-started"],signalled:["cleanup-started"],
    "cleanup-started":["cleanup-finished"],cleaned:[]};
  if(!allowed[machine.phase]?.includes(event))throw new Error(`lifecycle-invalid-transition:${machine.phase}:${event}`);
  machine.timeline.push({event,detail});
  if(event==="create-succeeded"){machine.phase="created";machine.created=true;machine.origin_phase="created";}
  else if(event==="create-failed"){machine.phase="failed";machine.origin_phase="create-failed";machine.terminal_event="create-failed";machine.primary_status=detail.status??1;}
  else if(event==="test-succeeded")machine.phase="tested";
  else if(event==="test-failed"){machine.phase="failed";machine.terminal_event="test-failed";machine.primary_status=detail.status??1;}
  else if(event==="signal"){machine.phase="signalled";machine.terminal_event=detail.signal??"signal";machine.primary_status=detail.status??128;}
  else if(event==="cleanup-started")machine.phase="cleanup-started";
  else if(event==="cleanup-finished")machine.phase="cleaned";
}
function runLifecycleCleanup(machine, adapter) {
  if(machine.cleanup_result)return machine.cleanup_result;
  machine.cleanup_calls+=1;
  transitionLifecycle(machine,"cleanup-started");
  let dropEvidence=null,tempEvidence=null;
  if(machine.created&&!machine.drop_attempted){machine.drop_attempted=true;const dropped=adapter.drop();
    machine.drop_status=dropped.status??1;dropEvidence=dropped.evidence??null;}
  const temp=adapter.cleanupTemp();machine.temp_status=temp.status??1;tempEvidence=temp.evidence??null;
  const status=machine.primary_status!==0?machine.primary_status:(machine.drop_status??0)!==0?machine.drop_status:machine.temp_status;
  transitionLifecycle(machine,"cleanup-finished",{status});
  machine.cleanup_result={status,drop_evidence:dropEvidence,temp_evidence:tempEvidence};
  return machine.cleanup_result;
}
function installLifecycleSignalHandlers(machine,cleanup,finish){
  let signalHandled=false;
  for(const signal of ["SIGINT","SIGTERM","SIGHUP"]){process.once(signal,()=>{
    if(signalHandled||machine.phase==="cleaned")return;signalHandled=true;
    transitionLifecycle(machine,"signal",{signal,status:128});const result=cleanup();finish(signal,result);
  });}
  return ()=>signalHandled;
}

if(process.env.B2A_C2_WATCHDOG_CHILD==="1"){
  await new Promise(()=>setInterval(()=>{},1_000));
}

if (process.env.B2A_C2_AMBIGUOUS_CHILD === "1") {
  const require=createRequire(resolve(process.cwd(),"apps/api/package.json"));
  const {Client}=require("pg");
  const truthMode=process.env.B2A_C2_TRUTH_MODE;
  const timeline=[];let downstream=null,upstream=null,armed=false,serverTruth=null;
  let cutDispatched=false,commitBytesDispatched=false,commitForwarded=false,readyForQuerySuppressed=false;
  const errorResponse=()=>{const fields=Buffer.from("SFATAL\0VFATAL\0C08006\0Mconnection failure during COMMIT acknowledgement\0\0","utf8");
    const frame=Buffer.alloc(5+fields.length);frame[0]=0x45;frame.writeUInt32BE(4+fields.length,1);fields.copy(frame,5);return frame;};
  const sendObserved08006AndCut=(socket,upstreamSocket,event)=>{timeline.push({at:new Date().toISOString(),event});
    cutDispatched=true;socket.end(errorResponse(),()=>{upstreamSocket.destroy();});};
  const proxy=createServer(socket=>{
    downstream=socket;upstream=connectTcp({host:"127.0.0.1",port:Number(process.env.B2A_C2_PG_PORT)});
    socket.on("error",()=>{});upstream.on("error",()=>{});
    let frontendBuffer=Buffer.alloc(0),backendBuffer=Buffer.alloc(0);
    socket.on("data",chunk=>{
      if(!armed){upstream.write(chunk);return;}
      frontendBuffer=Buffer.concat([frontendBuffer,chunk]);
      while(frontendBuffer.length>=5){const length=frontendBuffer.readUInt32BE(1),total=1+length;if(frontendBuffer.length<total)return;
        const frame=frontendBuffer.subarray(0,total);frontendBuffer=frontendBuffer.subarray(total);
        const query=frame[0]===0x51?frame.subarray(5,total-1).toString("utf8").trim().toUpperCase():null;
        if(query==="COMMIT"){commitBytesDispatched=true;
          if(truthMode==="not_committed"){
            timeline.push({at:new Date().toISOString(),event:"commit-frame-received-by-proxy-not-forwarded"});
            serverTruth="not_committed";sendObserved08006AndCut(socket,upstream,"error-response-08006-sent-before-not-committed-cut");return;
          }
          commitForwarded=true;timeline.push({at:new Date().toISOString(),event:"commit-frame-received-and-forwarded"});
        }
        upstream.write(frame);
      }
    });
    upstream.on("data",chunk=>{
      if(!armed||truthMode!=="committed"){socket.write(chunk);return;}
      backendBuffer=Buffer.concat([backendBuffer,chunk]);
      while(backendBuffer.length>=5){const length=backendBuffer.readUInt32BE(1),total=1+length;if(backendBuffer.length<total)return;
        const frame=backendBuffer.subarray(0,total);backendBuffer=backendBuffer.subarray(total);
        if(frame[0]===0x5a){readyForQuerySuppressed=true;serverTruth="committed";
          timeline.push({at:new Date().toISOString(),event:"backend-ready-for-query-after-commit-suppressed"});
          sendObserved08006AndCut(socket,upstream,"error-response-08006-sent-after-committed-ready-suppressed");return;}
      }
    });
  });
  await new Promise((resolveListen,rejectListen)=>{proxy.once("error",rejectListen);proxy.listen(0,"127.0.0.1",resolveListen);});
  const proxyPort=proxy.address().port;
  const client=new Client({host:"127.0.0.1",port:proxyPort,ssl:false,
    user:process.env.B2A_C2_PG_USER,password:process.env.B2A_C2_PG_PASSWORD,
    database:process.env.B2A_C2_PG_DATABASE,application_name:process.env.B2A_C2_APPLICATION_NAME});
  let errorCode=null,errorMessage=null,errorSeverity=null,queryResolved=false,commitError=null;
  client.on("error",error=>{errorCode??=error?.code??null;errorMessage??=error?.message??String(error);errorSeverity??=error?.severity??null;});
  try{
    await client.connect();
    await client.query("BEGIN");
    for(const operation of JSON.parse(process.env.B2A_C2_AMBIGUOUS_OPERATIONS)) await client.query(operation);
    armed=true;timeline.push({at:new Date().toISOString(),event:"proxy-armed-before-client-commit-dispatch",truth_mode:truthMode});
    try{const commitPromise=client.query("COMMIT");
      timeline.push({at:new Date().toISOString(),event:"client-commit-query-dispatched"});
      await commitPromise;queryResolved=true;}
    catch(error){commitError={code:error?.code??null,message:error?.message??String(error),severity:error?.severity??null};
      errorCode=commitError.code;errorMessage=commitError.message;errorSeverity=commitError.severity;}
  }catch(error){errorCode=error?.code??null;errorMessage=error?.message??String(error);errorSeverity=error?.severity??null;}
  try{await client.end();}catch{}
  await new Promise(resolveClose=>proxy.close(resolveClose));
  writeFileSync(1,`${JSON.stringify({cut_dispatched:cutDispatched,query_resolved:queryResolved,
    raw_transport_code:errorCode,raw_error_message:errorMessage,raw_error_severity:errorSeverity,
    commit_promise_error:commitError,
    observed_sqlstate:errorCode&&/^[0-9A-Z]{5}$/.test(errorCode)?errorCode:null,
    canonical_transport_class:cutDispatched&&!queryResolved?"08006":null,
    mapping:"proxy emitted a legal PostgreSQL ErrorResponse carrying C=08006 in the signed COMMIT ambiguity window, then cut the transport",
    server_truth:serverTruth,commit_bytes_dispatched:commitBytesDispatched,commit_forwarded:commitForwarded,
    backend_ready_for_query_suppressed:readyForQuerySuppressed,timeline})}\n`);
  process.exit(cutDispatched&&!queryResolved&&serverTruth===truthMode&&commitError?.code==="08006"&&
    commitError?.severity==="FATAL"&&errorCode==="08006"&&errorSeverity==="FATAL"?0:41);
}

if (process.env.B2A_C2_BUDGET_CHILD === "1") {
  const require=createRequire(resolve(process.cwd(),"apps/api/package.json"));
  const {Client}=require("pg");
  const spec=JSON.parse(process.env.B2A_C2_BUDGET_SPEC);
  const digest=value=>createHash("sha256").update(value).digest("hex");
  const uuid=label=>{const hex=digest(label);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;};
  const identity=`${spec.action}:${spec.phase}:${spec.ordinal}`;
  const sourceId=uuid(`source:${identity}`),receiptId=uuid(`receipt:${identity}`);
  const actor="11111111-1111-4111-8111-111111111111";
  const active=["claimed","in_progress","blocked"].includes(spec.status);
  const started=["in_progress","blocked"].includes(spec.status);
  const terminal=["closed","cancelled"].includes(spec.status);
  const rows=Array.from({length:200},(_,index)=>({taskId:uuid(`task:${identity}:${index}`),
    taskKey:digest(`task-key:${identity}:${index}`),assignmentAuthority:"owning",derivedAssignmentId:null,
    sourceType:"test_fixture_source",sourceId,sourceVersion:spec.sourceVersion,
    businessOccurrenceKey:`budget-${identity}-${index}`,taskKind:"fixture",queueCode:"fixture.queue",
    title:`Budget ${spec.action} ${index}`,kindLabel:"Fixture",sourceLabel:"Fixture source",priority:index%101,
    dueAt:null,assignmentStatus:spec.status,assignmentVersion:spec.resultVersion,
    assigneeId:active?actor:null,assigneeDisplay:active?"Fixture actor":null,
    claimedAt:active?"2026-08-01T00:00:00.000Z":null,startedAt:started?"2026-08-01T00:00:00.000Z":null,
    blockedReason:spec.status==="blocked"?"fixture blocked":null,blockedUntil:null,
    outcomeCode:terminal?"completed":null,outcomeSourceVersion:terminal?spec.sourceVersion:null,
    outcomeAt:terminal?"2026-08-01T00:00:00.000Z":null,sourceDeepLink:null,contentHash:"0".repeat(64),
    createdAt:"2026-08-01T00:00:00.000Z",updatedAt:"2026-08-01T00:00:00.000Z"})).sort((a,b)=>a.taskId.localeCompare(b.taskId));
  const targetId=spec.mode==="manual-rebuild"||terminal?sourceId:rows[0].taskId;
  const terminalName=terminal?spec.status:null;
  const resultRef=spec.mode==="manual-rebuild"?`property-task-rebuild/test_fixture_source/${sourceId}/v1`
    :terminal?`property-task-source-terminal/test_fixture_source/${sourceId}/${terminalName}/v${spec.resultVersion}`
    :`property-task/${targetId}/v${spec.resultVersion}`;
  const requestHash=digest(`request:${identity}`),resultHash=digest(`result:${identity}`);
  const clientKey=`budget-${digest(identity).slice(0,32)}`;
  const beginDispatchNs=process.hrtime.bigint(),deadlineNs=beginDispatchNs+5_000_000_000n;
  const remaining=()=>Number((deadlineNs-process.hrtime.bigint())/1_000_000n);
  const stages=["predeclared"],operations=[];
  let commitDispatched=false,ack=false,outcome="failed",errorCode=null,errorMessage=null;
  const connectRemainingMs=remaining(),connectTimeoutMillis=Math.min(Math.max(connectRemainingMs,1),4_999);
  const client=new Client({host:"127.0.0.1",port:Number(process.env.B2A_C2_PG_PORT),
    user:process.env.B2A_C2_PG_USER,password:process.env.B2A_C2_PG_PASSWORD,
    database:process.env.B2A_C2_PG_DATABASE,connectionTimeoutMillis:connectTimeoutMillis,
    application_name:`b2a-c2-budget-${spec.action}-${spec.phase}-${spec.ordinal}`});
  client.on("error",error=>{errorCode??=error?.code??null;errorMessage??=error?.message??String(error);});
  const guardedQuery=async(text,values=[],name="query",queryTimeoutOverride=null)=>{
    const remainingMs=remaining();
    if(remainingMs<=0){const error=new Error(`deadline-expired-before-${name}`);error.code="57014";throw error;}
    const timeoutMs=queryTimeoutOverride??Math.min(remainingMs,4_999);
    return client.query({text,values,query_timeout:timeoutMs});
  };
  const blocking=async(name,sql,params=[])=>{
    const dispatchNs=process.hrtime.bigint();
    const snapshot=createDispatchTimeoutSnapshot({name,remainingBudgetMs:remaining(),dispatchNs,
      blockingOperation:true,deadlineSafetyMs:25,lockSafetyMs:25});
    const configured=timeoutSetSql(snapshot);
    await guardedQuery(configured.statement,[],`${name}-set-statement-timeout`,snapshot.query_timeout_ms);
    await guardedQuery(configured.lock,[],`${name}-set-lock-timeout`,snapshot.query_timeout_ms);
    try{const result=await guardedQuery(sql,params,name,snapshot.query_timeout_ms);operations.push({...snapshot,
      start_ns:snapshot.dispatch_ns,end_ns:process.hrtime.bigint().toString(),outcome:"success"});stages.push(name);return result;}
    catch(error){operations.push({...snapshot,start_ns:snapshot.dispatch_ns,end_ns:process.hrtime.bigint().toString(),
      outcome:"failed",sqlstate:error?.code??null,message:error?.message??String(error)});throw error;}
  };
  let hardTimer=setTimeout(()=>{hardCut=true;client.connection?.stream?.destroy();},Math.max(remaining(),1)),hardCut=false;
  hardTimer.unref?.();stages.push("hard-timer-armed-before-connect");
  try{
    const connectStart=process.hrtime.bigint();stages.push("connect-dispatched");await client.connect();stages.push("connect-ack");
    operations.push({name:"connect",start_ns:connectStart.toString(),end_ns:process.hrtime.bigint().toString(),
      remaining_budget_ms:connectRemainingMs,query_timeout_ms:connectTimeoutMillis,outcome:"success"});
    if(remaining()<=0) throw Object.assign(new Error("deadline-expired-before-begin"),{code:"57014"});
    await guardedQuery("BEGIN",[],"begin");stages.push("begin-ack");
    await blocking("receipt-started",`INSERT INTO biz_property_mutation_receipt
      (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES($1,'10000001','20000001',$2,$3,$4,$5,$6)`,[receiptId,actor,spec.action,targetId,clientKey,requestHash]);
    await blocking("replace-complete",`WITH input AS (SELECT $15::jsonb rows),hashed AS
      (SELECT jsonb_agg(jsonb_set(value,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(value)::text)) ORDER BY value->>'taskId') rows
       FROM input,jsonb_array_elements(rows) e(value))
      SELECT * FROM hashed,LATERAL public.fn_property_task_projection_replace_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,rows)`,
      ['10000001','20000001','test_fixture_source',sourceId,actor,receiptId,spec.mode,spec.action,
       spec.resultVersion,0,requestHash,resultRef,resultHash,spec.mode==="manual-rebuild"?"manual budget fixture":`authority-sync:${spec.action}`,JSON.stringify(rows)]);
    await blocking("receipt-completed",`UPDATE biz_property_mutation_receipt SET receipt_status='completed',
      result_ref=$2,result_hash=$3,completed_at=clock_timestamp() WHERE id=$1`,[receiptId,resultRef,resultHash]);
    const commitStart=process.hrtime.bigint();
    const commitSnapshot=createDispatchTimeoutSnapshot({name:"commit",remainingBudgetMs:remaining(),dispatchNs:commitStart,
      blockingOperation:false,deadlineSafetyMs:25,lockSafetyMs:0});
    const commitConfigured=timeoutSetSql(commitSnapshot);
    await guardedQuery(commitConfigured.statement,[],"commit-set-statement-timeout",commitSnapshot.query_timeout_ms);
    await guardedQuery(commitConfigured.lock,[],"commit-set-lock-timeout",commitSnapshot.query_timeout_ms);
    commitDispatched=true;stages.push("commit-dispatched");
    try{await guardedQuery("COMMIT",[],"commit",commitSnapshot.query_timeout_ms);ack=true;stages.push("commit-ack");operations.push({...commitSnapshot,
      start_ns:commitSnapshot.dispatch_ns,end_ns:process.hrtime.bigint().toString(),outcome:"success"});}
    catch(error){operations.push({...commitSnapshot,start_ns:commitSnapshot.dispatch_ns,end_ns:process.hrtime.bigint().toString(),
      outcome:"ambiguous",sqlstate:error?.code??null,message:error?.message??String(error)});throw error;}
    outcome=process.hrtime.bigint()<=deadlineNs?"success":"late-ack";
  }catch(error){errorCode=error?.code??null;errorMessage=error?.message??String(error);if(!commitDispatched){
      const rollbackRemaining=remaining();
      if(rollbackRemaining>0){const rollbackTimeout=Math.min(rollbackRemaining,4_999),rollbackStart=process.hrtime.bigint();
        try{await client.query({text:"ROLLBACK",query_timeout:rollbackTimeout});stages.push("rollback-ack");
          operations.push({name:"rollback",start_ns:rollbackStart.toString(),end_ns:process.hrtime.bigint().toString(),
            remaining_budget_ms:rollbackRemaining,query_timeout_ms:rollbackTimeout,statement_timeout_ms:null,lock_timeout_ms:null,outcome:"success"});}
        catch(rollbackError){stages.push("rollback-timeout-or-failed");operations.push({name:"rollback",start_ns:rollbackStart.toString(),
          end_ns:process.hrtime.bigint().toString(),remaining_budget_ms:rollbackRemaining,query_timeout_ms:rollbackTimeout,
          statement_timeout_ms:null,lock_timeout_ms:null,outcome:"failed",sqlstate:rollbackError?.code??null,message:rollbackError?.message??String(rollbackError)});}}
      else{hardCut=true;client.connection?.stream?.destroy();stages.push("rollback-by-bounded-disconnect-after-deadline");
        operations.push({name:"rollback",start_ns:process.hrtime.bigint().toString(),end_ns:process.hrtime.bigint().toString(),
          remaining_budget_ms:rollbackRemaining,statement_timeout_ms:0,lock_timeout_ms:0,outcome:"bounded-disconnect"});}
    }else outcome="commit-ambiguous";}
  let receiptStatus="unknown",headSha="0".repeat(64);
  try{if(ack&&remaining()>0){const observationStart=process.hrtime.bigint();stages.push("post-commit-observation-dispatched");
      const receiptObservation=await guardedQuery("SELECT receipt_status FROM biz_property_mutation_receipt WHERE id=$1",[receiptId],"post-commit-receipt-observation");
      receiptStatus=receiptObservation.rows[0]?.receipt_status??"absent";
      const head=await guardedQuery("SELECT id,projection_version FROM biz_property_task_projection_head WHERE source_id=$1 ORDER BY id",[sourceId],"post-commit-head-observation");
      headSha=digest(head.rows.map(row=>`${row.id}:${row.projection_version}\n`).join(""));stages.push("post-commit-observation-ack");
      operations.push({name:"post-commit-observation",start_ns:observationStart.toString(),end_ns:process.hrtime.bigint().toString(),
        remaining_budget_ms:null,outcome:"success"});}}catch(observationError){stages.push("post-commit-observation-bounded-failed");}
  const endRemaining=remaining();
  try{if(endRemaining>0){stages.push("client-end-dispatched");let endTimer;
      await Promise.race([client.end(),new Promise((_,reject)=>{endTimer=setTimeout(()=>reject(new Error("client-end-deadline")),endRemaining);})]);
      if(endTimer)clearTimeout(endTimer);stages.push("client-end-ack");}
    else{hardCut=true;client.connection?.stream?.destroy();stages.push("client-end-bounded-disconnect");}}
  catch{hardCut=true;client.connection?.stream?.destroy();stages.push("client-end-bounded-failed");}
  if(hardTimer)clearTimeout(hardTimer);
  const endNs=process.hrtime.bigint();
  if(outcome==="success"&&endNs>deadlineNs)outcome="late-end";
  const record={ordinal:spec.ordinal,phase:spec.phase,executed:true,begin_dispatch_ns:beginDispatchNs.toString(),
    start_ns:beginDispatchNs.toString(),end_ns:endNs.toString(),duration_ns:(endNs-beginDispatchNs).toString(),
    deadline_ns:deadlineNs.toString(),deadline_exceeded:endNs>deadlineNs,outcome,commit_dispatched:commitDispatched,
    ack,receipt:receiptId,mode:spec.mode,source_sha256:digest(sourceId),head_sha256:headSha,
    receipt_identity_sha256:receiptIdentitySha256V1({receiptId,tenantId:"10000001",parkId:"20000001",
      actorId:actor,actionId:spec.action,targetId,clientKey,requestHash}),
    receipt_status:receiptStatus,payload_sha256:digest(JSON.stringify(rows)),
    rowset_sha256:digest(rows.map(row=>`${row.taskId}\t${row.taskKey}\n`).join("")),stage_markers:stages,
    access_counts:{receipt:stages.includes("receipt-started")?1:0,head:stages.includes("replace-complete")?1:0},
    operations,hard_socket_cut:hardCut,error:{sqlstate:errorCode,message:errorMessage}};
  writeFileSync(1,`${JSON.stringify(record)}\n`);process.exit(0);
}

if (process.env.B2A_C2_LIFECYCLE_CHILD === "1") {
  const target=process.env.B2A_C2_LIFECYCLE_TARGET;
  const tempMarker=process.env.B2A_C2_LIFECYCLE_TEMP;
  const run=(binary,status)=>spawnSync(binary,[String(status),target],{encoding:"utf8",env:process.env});
  const machine=createLifecycleMachine(target,tempMarker);
  const adapter={drop:()=>({status:run(process.env.B2A_C2_FAKE_DROP,Number(process.env.B2A_C2_DROP_STATUS??0)).status??1}),
    cleanupTemp:()=>{if(process.env.B2A_C2_TEMP_FAIL==="1")return {status:31};
      if(tempMarker&&existsSync(tempMarker))rmSync(tempMarker);return {status:0};}};
  const cleanup=()=>runLifecycleCleanup(machine,adapter);
  const emit=(result)=>{writeFileSync(1,`${JSON.stringify({target,created:machine.created,
    primary_status:machine.primary_status,drop_status:machine.drop_status,temp_status:machine.temp_status,
    cleanup_calls:machine.cleanup_calls,temp_absent:!existsSync(tempMarker),machine})}\n`);return result.status;};
  installLifecycleSignalHandlers(machine,cleanup,(_signal,result)=>{emit(result);
    process.exit(result.status===0?128:result.status);});
  const create=run(process.env.B2A_C2_FAKE_CREATE,Number(process.env.B2A_C2_CREATE_STATUS??0));
  if((create.status??1)===0){
    transitionLifecycle(machine,"create-succeeded");
    if(tempMarker) writeFileSync(tempMarker,"owned-temp\n",{flag:"wx"});
    const signal=process.env.B2A_C2_SIGNAL;
    if(signal){
      setTimeout(()=>process.kill(process.pid,signal),10);
      await new Promise(()=>{setInterval(()=>{},1_000);});
    }
    const tested=run(process.env.B2A_C2_FAKE_TEST,Number(process.env.B2A_C2_TEST_STATUS??0));
    if((tested.status??1)===0)transitionLifecycle(machine,"test-succeeded");
    else transitionLifecycle(machine,"test-failed",{status:tested.status??1});
  }else transitionLifecycle(machine,"create-failed",{status:create.status??1});
  const finalResult=cleanup();emit(finalResult);process.exit(finalResult.status);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = resolve(root, "database/migrations");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research");
const seed = resolve(root, "database/seeds/000001_s1_production_core.sql");
const migration194 = "000194_property_task_projection_contract_correction.sql";
const exactChain = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  migration194
];
const runId = validateRunId(
  process.env.PROPERTY_B2A_C2_RUN_ID ?? `b2ac2_${randomBytes(8).toString("hex")}`
);
const targetedV11 = process.env.B2A_C2_TARGETED_V11 === "1";
const artifactPath = process.env.PROPERTY_B2A_C2_ARTIFACT_PATH;
if(targetedV11&&artifactPath){
  throw new Error("targeted v11 diagnostic runs cannot write immutable candidate artifacts");
}
if(!targetedV11&&!artifactPath){
  throw new Error("full C2 candidate run requires PROPERTY_B2A_C2_ARTIFACT_PATH and fails closed without it");
}
const containerName = `pr192_b2a_c2_${runId}_db`;
const databaseName = "pr192_b2a_c2_gate";
const postgresUser = "pr192_b2a_c2";
const postgresPassword = `${runId}_local_only`;
const fixtureLabel = "pr192-b2a-c2-schema-gate";
const productionLifecycle = createLifecycleMachine(containerName);
const budgetContract = Object.freeze({
  addendum_final_signoff_raw_sha256: "1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4",
  candidate_raw_sha256: "127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4",
  candidate_evidence_raw_sha256: "38ebd4148083f3439a3456079ecc77a9aff1da41a19d113f61c90d30cd5499c0",
  canonical_budget_digest: "d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45",
  canonical_budget_bytes: 1692,
  max_complete_source_rows: 200,
  transaction_hard_limit_ns: 5_000_000_000n,
  outer_watchdog_ms: 60_000
});
let containerId = null;
let volumeName = null;
let containerIdentity = null;
const gateStartedAt = new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function gitRead(args) {
  const result=spawnSync("git",args,{cwd:root,encoding:"utf8"});
  // WSL sandbox wrappers can attach EPERM metadata after the child already
  // exited successfully. The observable command contract is status + stdout.
  if(result.status===0&&typeof result.stdout==="string") return result.stdout.trim();
  throw result.error??new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}
const docker = (args, options = {}) => runDocker(args, { cwd: root, ...options });
function reservedDependencyEvidence() {
  const reservedFiles = readdirSync(migrations).filter((name) => /^00019[12]_/.test(name)).sort();
  const migrationText = readFileSync(resolve(migrations, migration194), "utf8");
  const sourceReferences = [...migrationText.matchAll(/00019[12]_[A-Za-z0-9_.-]+/g)].map((match) => match[0]);
  const chainReferences = exactChain.filter((name) => /^00019[12]_/.test(name));
  return { reserved_files_delivered_at_c2: reservedFiles, migration_source_references: sourceReferences,
    exact_chain_references: chainReferences,
    proven_zero_dependency: reservedFiles.length === 0 && sourceReferences.length === 0 && chainReferences.length === 0 };
}
function reservationPreflightGate(stage) {
  const evaluate=files=>{const conflicts=files.filter(name=>/^00019[12]_/.test(name)).sort();
    if(conflicts.length)throw new Error(`reserved-191-192-present-before-194:${stage}:${conflicts.join(",")}`);
    return {stage,conflicts,status:"passed"};};
  const actual=evaluate(readdirSync(migrations));let negativeInjection=null;
  try{evaluate([...readdirSync(migrations),"000191_negative_injection.sql"]);}
  catch(caught){negativeInjection={injected:"000191_negative_injection.sql",
    marker:caught instanceof Error?caught.message:String(caught),status:"rejected-before-194"};}
  if(!negativeInjection?.marker.startsWith("reserved-191-192-present-before-194:"))
    throw new Error(`reservation negative injection did not fail closed at ${stage}`);
  return {...actual,negative_injection:negativeInjection};
}

function psql(input, { tuplesOnly = false, allowFailure = false } = {}) {
  return docker([
    "exec", "-i", containerId, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
    "-U", postgresUser, "-d", databaseName
  ], { input: `\\set VERBOSITY verbose\n${input}`, allowFailure });
}
function query(sql) {
  return psql(sql, { tuplesOnly: true }).stdout.trim();
}
function launchDetachedPsqlWorker(label,sql) {
  if(!/^[a-z0-9-]+$/.test(label))throw new Error(`invalid detached worker label: ${label}`);
  const stem=`/tmp/${runId}-${label}`,hostSql=resolve("/tmp",`${runId}-${label}.sql`);
  writeFileSync(hostSql,`\\set VERBOSITY verbose\n${sql}\n`,{flag:"wx"});
  try{docker(["cp",hostSql,`${containerId}:${stem}.sql`]);}finally{rmSync(hostSql);}
  const command=`psql -X -v ON_ERROR_STOP=1 -U ${postgresUser} -d ${databaseName} -f ${stem}.sql >${stem}.stdout 2>${stem}.stderr; worker_status=$?; printf '%s\\n' "$worker_status" >${stem}.exit`;
  docker(["exec","-d",containerId,"sh","-c",command]);
  return {label,stem};
}
function detachedPsqlWorkerDiagnostic(worker) {
  const read=suffix=>{const result=docker(["exec",containerId,"cat",`${worker.stem}.${suffix}`],{allowFailure:true});
    return {status:result.status??1,text:(result.stdout??"").trim(),stderr:(result.stderr??"").trim()};};
  const exit=read("exit"),stdout=read("stdout"),stderr=read("stderr");
  return {label:worker.label,exit_code:exit.status===0&&/^\d+$/.test(exit.text)?Number(exit.text):null,
    stdout:stdout.text,stderr:stderr.text,exit_probe_status:exit.status};
}
function receiptWorkerActivity(apps) {
  return JSON.parse(query(`SELECT coalesce(json_agg(row_to_json(activity) ORDER BY application_name),'[]'::json)::text
    FROM (SELECT application_name,pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) blocking_pids,
      left(query,500) query FROM pg_stat_activity WHERE application_name IN ('${apps.join("','")}')) activity;`));
}
function waitForReceiptWorkerOutcomes(workers,apps,{timeoutMs=10_000}={}) {
  const started=Date.now(),timeline=[];
  while(Date.now()-started<timeoutMs){const value=query("SELECT count(*)::text FROM b2a_c2_receipt_acquire_observation;");
    timeline.push({at:new Date().toISOString(),value,activity:receiptWorkerActivity(apps)});
    if(value==="2")return {value,timeline,worker_diagnostics:workers.map(detachedPsqlWorkerDiagnostic)};
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
  }
  throw new Error(`receipt acquire outcomes timeout: ${JSON.stringify({timeline:timeline.slice(-10),
    activity:receiptWorkerActivity(apps),workers:workers.map(detachedPsqlWorkerDiagnostic)})}`);
}
function waitForDetachedWorkerExits(workers,apps,{timeoutMs=5_000}={}) {
  const started=Date.now();let diagnostics=[];
  while(Date.now()-started<timeoutMs){diagnostics=workers.map(detachedPsqlWorkerDiagnostic);
    if(diagnostics.every(worker=>worker.exit_code!==null))return diagnostics;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
  }
  throw new Error(`detached worker exit timeout: ${JSON.stringify({workers:diagnostics,activity:receiptWorkerActivity(apps)})}`);
}
const sqlLiteral=value=>value===null?"NULL":`'${String(value).replaceAll("'","''")}'`;
function receiptAcquireSql(input) {
  const expectedResultRef=sqlLiteral(input.expectedResultRef??null),expectedResultHash=sqlLiteral(input.expectedResultHash??null);
  return `WITH expected AS (SELECT
      ${sqlLiteral(input.receiptId)}::uuid receipt_id,${sqlLiteral(input.tenantId)}::varchar tenant_id,
      ${sqlLiteral(input.parkId)}::varchar park_id,${sqlLiteral(input.actorId)}::uuid actor_id,
      ${sqlLiteral(input.actionId)}::varchar action_id,${sqlLiteral(input.targetType)}::varchar semantic_target_type,
      ${sqlLiteral(input.targetId)}::uuid target_id,${sqlLiteral(input.clientKey)}::varchar client_key,
      ${sqlLiteral(input.requestHash)}::char(64) request_hash,${sqlLiteral(input.acquireMode)}::varchar acquire_mode,
      ${expectedResultRef}::varchar expected_result_ref,${expectedResultHash}::char(64) expected_result_hash),
    locked AS MATERIALIZED (SELECT r.* FROM biz_property_mutation_receipt r,expected e
      WHERE r.id=e.receipt_id OR (r.tenant_id=e.tenant_id AND r.park_id=e.park_id AND r.actor_id=e.actor_id
        AND r.action_id=e.action_id AND r.target_id=e.target_id AND r.client_key=e.client_key) FOR UPDATE),
    evaluated AS (SELECT l.*,
      l.id=e.receipt_id receipt_id_match,l.tenant_id=e.tenant_id tenant_match,l.park_id=e.park_id park_match,l.actor_id=e.actor_id actor_match,
      l.action_id=e.action_id action_match,(CASE WHEN l.action_id='property.task.rebuild'
        OR l.action_id LIKE 'property.task.source-terminal.%' THEN 'source' ELSE 'task' END)=e.semantic_target_type semantic_target_type_match,
      l.target_id=e.target_id target_id_match,l.client_key=e.client_key client_key_match,
      l.request_hash=e.request_hash request_hash_match,l.result_ref IS NOT DISTINCT FROM e.expected_result_ref result_ref_match,
      l.result_hash IS NOT DISTINCT FROM e.expected_result_hash result_hash_match
      FROM locked l,expected e),
    inserted AS (INSERT INTO biz_property_mutation_receipt
       (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      SELECT receipt_id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash FROM expected e
      WHERE e.acquire_mode='execute-or-replay' AND NOT EXISTS(SELECT 1 FROM locked)
      ON CONFLICT DO NOTHING RETURNING id),
    any_existing AS (SELECT count(*)::int count FROM biz_property_mutation_receipt r,expected e WHERE r.id=e.receipt_id)
    SELECT json_build_object(
      'outcome',CASE
        WHEN EXISTS(SELECT 1 FROM inserted) THEN 'execute'
        WHEN NOT EXISTS(SELECT 1 FROM locked) AND (SELECT count FROM any_existing)>0 THEN 'identity-conflict'
        WHEN NOT EXISTS(SELECT 1 FROM locked) THEN 'fail-closed-absent'
        WHEN EXISTS(SELECT 1 FROM evaluated WHERE NOT(receipt_id_match AND tenant_match AND park_match AND actor_match AND action_match
          AND semantic_target_type_match AND target_id_match AND client_key_match AND request_hash_match)) THEN 'identity-conflict'
        WHEN EXISTS(SELECT 1 FROM evaluated WHERE receipt_status='completed' AND result_ref_match AND result_hash_match)
          THEN 'replay-completed'
        WHEN EXISTS(SELECT 1 FROM evaluated WHERE receipt_status='completed') THEN 'completed-result-conflict'
        ELSE 'fail-closed-'||(SELECT receipt_status FROM evaluated) END,
      'receipt_insert_count',(SELECT count(*) FROM inserted),'receipt_lock_count',(SELECT count(*) FROM locked),
      'existing_id_count',(SELECT count FROM any_existing),'locked_status',(SELECT receipt_status FROM evaluated),
      'field_matches',(SELECT json_build_object('receipt_id',receipt_id_match,'tenant_id',tenant_match,'park_id',park_match,'actor_id',actor_match,
        'action_id',action_match,'semantic_target_type',semantic_target_type_match,'target_id',target_id_match,'client_key',client_key_match,
        'request_hash',request_hash_match,'result_ref',result_ref_match,'result_hash',result_hash_match) FROM evaluated))::text AS evidence_json`;
}
function receiptAcquireState(input) {
  return JSON.parse(query(`${receiptAcquireSql(input)};`));
}
function completeReceiptExactSql(input) {
  return `WITH updated AS (UPDATE biz_property_mutation_receipt r SET receipt_status='completed',
      result_ref=${sqlLiteral(input.resultRef)},result_hash=${sqlLiteral(input.resultHash)},completed_at=clock_timestamp()
    WHERE r.id=${sqlLiteral(input.receiptId)}::uuid AND r.tenant_id=${sqlLiteral(input.tenantId)}
      AND r.park_id=${sqlLiteral(input.parkId)} AND r.actor_id=${sqlLiteral(input.actorId)}::uuid
      AND r.action_id=${sqlLiteral(input.actionId)}
      AND (CASE WHEN r.action_id='property.task.rebuild' OR r.action_id LIKE 'property.task.source-terminal.%'
      THEN 'source' ELSE 'task' END)=${sqlLiteral(input.targetType)}
      AND r.target_id=${sqlLiteral(input.targetId)}::uuid AND r.client_key=${sqlLiteral(input.clientKey)}
      AND r.request_hash=${sqlLiteral(input.requestHash)}::char(64) AND r.receipt_status='started'
      AND r.result_ref IS NULL AND r.result_hash IS NULL RETURNING 1)
    SELECT count(*)::int AS complete_count FROM updated`;
}
function completeReceiptExact(input) {
  return Number(query(`${completeReceiptExactSql(input)};`));
}
function executeReceiptStateMachineTransaction(input, businessSql) {
  const result=psql(`BEGIN;
${receiptAcquireSql(input)}
\\gset acquire_
SELECT CASE WHEN (:'acquire_evidence_json'::jsonb->>'outcome')='execute' THEN 'true' ELSE 'false' END AS execute
\\gset acquire_
\\if :acquire_execute
${businessSql};
${completeReceiptExactSql(input)}
\\gset completion_
\\else
SELECT 0::int AS complete_count
\\gset completion_
\\endif
COMMIT;
SELECT json_build_object('acquire',:'acquire_evidence_json'::jsonb,
  'completion_update_count',:'completion_complete_count'::int)::text;`,{tuplesOnly:true});
  return JSON.parse(result.stdout.trim().split("\n").filter(Boolean).at(-1));
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
function observedSqlstate(result) {
  return result.stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1]??null;
}
function validateEvidenceDag(dag,requiredNodes=[]) {
  const nodes=dag.nodes;if(new Set(nodes).size!==nodes.length)throw new Error("evidence-dag-duplicate-node");
  for(const required of requiredNodes)if(!nodes.includes(required))throw new Error(`evidence-dag-required-node-missing:${required}`);
  const adjacency=new Map(nodes.map(node=>[node,[]])),indegree=new Map(nodes.map(node=>[node,0]));
  for(const [from,to] of dag.edges){if(!adjacency.has(from)||!adjacency.has(to))throw new Error(`evidence-dag-dangling-edge:${from}->${to}`);
    adjacency.get(from).push(to);indegree.set(to,indegree.get(to)+1);}
  const queue=nodes.filter(node=>indegree.get(node)===0),visited=[];
  while(queue.length){const node=queue.shift();visited.push(node);for(const next of adjacency.get(node)){
      indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)queue.push(next);}}
  if(visited.length!==nodes.length)throw new Error("evidence-dag-cycle");
  return {status:"passed",traversal:"kahn-topological",visited_count:visited.length,topological_order:visited};
}
function validateDetachedHashChain({mainBytes,sidecarPayloads,watchdogBytes,manifest}) {
  if(manifest.main.sha256!==sha256(mainBytes)||manifest.main.byte_length!==Buffer.byteLength(mainBytes))
    throw new Error("artifact-hash-chain-main-mismatch");
  for(const sidecar of sidecarPayloads){const row=manifest.sidecars.find(item=>item.id===sidecar.id);
    if(!row||row.sha256!==sha256(sidecar.bytes)||row.byte_length!==Buffer.byteLength(sidecar.bytes))
      throw new Error(`artifact-hash-chain-sidecar-mismatch:${sidecar.id}`);}
  if(manifest.watchdog.sha256!==sha256(watchdogBytes)||manifest.watchdog.byte_length!==Buffer.byteLength(watchdogBytes))
    throw new Error("artifact-hash-chain-watchdog-mismatch");
  return {status:"passed",main:true,sidecar_count:sidecarPayloads.length,watchdog:true,manifest_detached:true};
}
function waitReady() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const logs = docker(["logs", "--tail", "100", containerId], { allowFailure: true });
    const ready = docker([
      "exec", containerId, "pg_isready", "-U", postgresUser, "-d", databaseName
    ], { allowFailure: true });
    if (`${logs.stdout}${logs.stderr}`.includes(
      "PostgreSQL init process complete; ready for start up."
    ) && ready.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("ephemeral PostgreSQL readiness timeout");
}
function start() {
  if (inspectContainer(containerName, { cwd: root })) {
    throw new Error(`exact fixture already exists: ${containerName}`);
  }
  const created = docker(buildEphemeralPostgresRunArgs({
    containerName, databaseName, fixtureLabel, runId, postgresUser, postgresPassword
  }));
  // Docker returned success: cleanup now owns the exact labelled name even if
  // subsequent inspect/identity validation fails before containerId is set.
  globalThis.__b2aC2Created = true;
  transitionLifecycle(productionLifecycle,"create-succeeded",{container_name:containerName});
  const inspected = inspectContainer(containerName, { cwd: root });
  containerId = resolveCreatedContainerId(created.stdout, inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  const exact = assertExactEphemeralPostgresContainer(inspected, {
    containerName, databaseName, fixtureLabel, runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE, requireLoopbackPort: true
  });
  containerIdentity = {
    image_reference: OFFICIAL_POSTGRES_IMAGE,
    image_digest: inspected?.Image ?? null,
    container_id: containerId,
    container_name: containerName,
    volume_name: exact.volumeName,
    host_port: exact.hostPort
  };
  volumeName = exact.volumeName;
  waitReady();
}
function inspectExactContainerAbsence(exactId,exactName,{deadline_ms:deadlineMs}) {
  const inspectOne=target=>{const result=runBoundedExactDockerInspect(["inspect","--type","container",target],deadlineMs);
    if(result.status!==0)return /No such (object|container)/i.test(result.stderr??"")?
      {absent:true,status:result.status,stderr:(result.stderr??"").trim()}:
      {absent:false,status:result.status,stderr:(result.stderr??"").trim(),inspect_error:true,
        command_error:result.error?.message??null};
    try{const [row]=JSON.parse(result.stdout);return {absent:false,status:0,id:row?.Id??null,name:row?.Name??null};}
    catch(error){return {absent:false,status:0,inspect_error:true,error:error.message};}};
  const byId=inspectOne(exactId),byName=inspectOne(exactName);
  const collision=(!byName.absent&&byName.id!==exactId)||(!byId.absent&&byId.id!==exactId);
  return {absent:byId.absent&&byName.absent&&!collision,id_absent:byId.absent,name_absent:byName.absent,
    collision,by_id:byId,by_name:byName};
}
const exactInspectCommandTimeoutMs=2_000;
function runBoundedExactDockerInspect(args,deadlineMs) {
  const timeoutMs=Math.max(1,Math.min(exactInspectCommandTimeoutMs,deadlineMs-Date.now()));
  return spawnSync("docker",args,{cwd:root,encoding:"utf8",maxBuffer:40*1024*1024,
    timeout:timeoutMs,killSignal:"SIGKILL"});
}
function inspectExactVolumeAbsence(exactVolume,{deadline_ms:deadlineMs}) {
  const result=runBoundedExactDockerInspect(["volume","inspect",exactVolume],deadlineMs);
  if(result.status!==0)return /no such volume/i.test(result.stderr??"")?
    {absent:true,status:result.status,stderr:(result.stderr??"").trim()}:
    {absent:false,status:result.status,stderr:(result.stderr??"").trim(),inspect_error:true,
      command_error:result.error?.message??null};
  try{const [row]=JSON.parse(result.stdout);return {absent:false,status:0,name:row?.Name??null,
    collision:row?.Name!==exactVolume};}catch(error){return {absent:false,status:0,inspect_error:true,error:error.message};}
}
function cleanup() {
  const lifecycle=runLifecycleCleanup(productionLifecycle,{drop:()=>{
    const errors=[],exactExisting=inspectContainer(containerName,{cwd:root});
    let cleanupTarget=containerId,exactVolume=volumeName;
    if(exactExisting){try{const exact=assertExactEphemeralPostgresContainer(exactExisting,{containerName,databaseName,
        fixtureLabel,runId,expectedImage:OFFICIAL_POSTGRES_IMAGE,requireLoopbackPort:false,requireRunning:false});
        if(cleanupTarget&&cleanupTarget!==exact.containerId)throw new Error("cleanup exact container id/name mismatch");
        cleanupTarget=exact.containerId;exactVolume??=exact.volumeName;
      }catch(error){errors.push(error.message);}}
    if(globalThis.__b2aC2Created&&!cleanupTarget)errors.push("created fixture has no validated exact cleanup target");
    const containerRm=cleanupTarget?docker(["rm","-f","-v",cleanupTarget],{allowFailure:true}):
      {status:null,stdout:"",stderr:"",skipped:"no-validated-exact-container"};
    const containerPoll=cleanupTarget?boundedExactAbsencePoll({kind:"container",target:{id:cleanupTarget,name:containerName},
      inspect:(_target,context)=>inspectExactContainerAbsence(cleanupTarget,containerName,context)}):
      {kind:"container",target:{id:null,name:containerName},absent:!exactExisting,timeline:[]};
    if(!containerPoll.absent)errors.push("exact container remained present after bounded removal deadline");
    let volumeRm={status:null,stdout:"",stderr:"",skipped:"no-validated-exact-anonymous-volume"};
    let volumePoll={kind:"anonymous-volume",target:exactVolume,absent:exactVolume?false:true,timeline:[]};
    if(exactVolume){volumeRm=docker(["volume","rm",exactVolume],{allowFailure:true});
      volumePoll=boundedExactAbsencePoll({kind:"anonymous-volume",target:exactVolume,
        inspect:(_target,context)=>inspectExactVolumeAbsence(exactVolume,context)});
      if(!volumePoll.absent)errors.push("exact anonymous volume remained present after bounded removal deadline");}
    const commandEvidence=command=>({status:command.status,stdout:command.stdout??"",stderr:command.stderr??"",
      skipped:command.skipped??null});
    return {status:containerPoll.absent&&volumePoll.absent&&errors.length===0?0:1,
      evidence:{container_absent:containerPoll.absent,anonymous_volume_absent:volumePoll.absent,errors,
        removal_commands:{container_rm:commandEvidence(containerRm),volume_rm:commandEvidence(volumeRm)},
        absence_polls:{container:containerPoll,anonymous_volume:volumePoll},
        nonzero_rm_allowed_only_when_final_exact_absent:true}};
  },cleanupTemp:()=>({status:0,evidence:{owned_temp_targets:[]}})});
  const dropEvidence=lifecycle.drop_evidence??{container_absent:!inspectContainer(containerName,{cwd:root}),
    anonymous_volume_absent:true,errors:[]};
  return {...dropEvidence,status:lifecycle.status,lifecycle_status:lifecycle.status,
    drop_status:productionLifecycle.drop_status,temp_status:productionLifecycle.temp_status,
    drop_evidence:lifecycle.drop_evidence,temp_evidence:lifecycle.temp_evidence};
}
installLifecycleSignalHandlers(productionLifecycle,cleanup,(signal,result)=>{
  process.stderr.write(`${signal}: ${JSON.stringify(result)}\n`);
  process.exit(result.lifecycle_status);
});

function catalogFingerprint() {
  return query(`WITH owned_relations AS (
    SELECT c.oid,n.nspname,c.relname,c.relkind,c.relpersistence,c.relrowsecurity,
           c.relforcerowsecurity,c.relacl,c.relowner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN
       ('biz_property_task_projection_head','biz_property_task_projection',
        'biz_property_task_projection_rebuild_audit','sys_property_runtime_control_contract_audit')
  ), facts AS (
    SELECT 'relation' kind,nspname||'.'||relname name,
      concat_ws('|',relkind,relpersistence,relrowsecurity,relforcerowsecurity,
        coalesce((SELECT string_agg((CASE WHEN acl.grantee=relowner THEN '<owner>'
          WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)||':'||
          acl.privilege_type||':'||acl.is_grantable,',' ORDER BY acl.grantee,
          acl.privilege_type,acl.is_grantable)
          FROM aclexplode(coalesce(relacl,acldefault('r',relowner))) acl),'')) definition
      FROM owned_relations
    UNION ALL SELECT 'column',r.nspname||'.'||r.relname||'.'||a.attname,
      concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        a.attidentity,a.attgenerated,coalesce(pg_get_expr(d.adbin,d.adrelid),''),
        coalesce((SELECT string_agg(acl.privilege_type||':'||acl.is_grantable,','
          ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable)
          FROM aclexplode(a.attacl) acl),''),coalesce(a.attcollation::regcollation::text,''))
      FROM owned_relations r JOIN pg_attribute a ON a.attrelid=r.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',r.nspname||'.'||r.relname||'.'||con.conname,
      concat_ws('|',con.contype,con.condeferrable,con.condeferred,con.convalidated,
        pg_get_constraintdef(con.oid,true))
      FROM owned_relations r JOIN pg_constraint con ON con.conrelid=r.oid
    UNION ALL SELECT 'index',ni.nspname||'.'||i.relname,
      concat_ws('|',ix.indisunique,ix.indisprimary,ix.indisvalid,ix.indisready,
        pg_get_indexdef(ix.indexrelid))
      FROM owned_relations r JOIN pg_index ix ON ix.indrelid=r.oid
      JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace ni ON ni.oid=i.relnamespace
    UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      concat_ws('|',p.prokind,p.provolatile,p.prosecdef,p.proleakproof,p.proparallel,
        coalesce(p.proconfig::text,''),coalesce((SELECT string_agg((CASE
          WHEN acl.grantee=p.proowner THEN '<owner>' WHEN acl.grantee=0 THEN 'PUBLIC'
          ELSE pg_get_userbyid(acl.grantee) END)||':'||acl.privilege_type||':'||acl.is_grantable,
          ',' ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable)
          FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl),''),
        pg_get_functiondef(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('fn_property_task_projection_scalar_v1','fn_property_task_projection_row_hash_v1',
        'fn_property_task_projection_replace_v1','fn_property_task_projection_audit_immutable',
        'fn_property_task_projection_generation_exact','fn_property_runtime_control_contract_audit_immutable')
    UNION ALL SELECT 'trigger',r.nspname||'.'||r.relname||'.'||t.tgname,
      concat_ws('|',t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid,true))
      FROM owned_relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
  ), grammar AS (
    SELECT string_agg(kind||E'\\t'||name||E'\\t'||definition||E'\\n',''
      ORDER BY kind,name) bytes FROM facts)
  SELECT encode(digest(convert_to(bytes,'UTF8'),'sha256'),'hex') FROM grammar;`);
}
function functionDefinitionEvidence() {
  const rows = JSON.parse(query(`SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.identity),'[]'::json)::text
    FROM (SELECT p.oid::regprocedure::text identity,
      encode(digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') definition_sha256,
      p.prokind,p.provolatile,p.prosecdef,p.proleakproof,p.proparallel,p.proconfig,p.proacl,
      pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('fn_property_task_projection_scalar_v1','fn_property_task_projection_row_hash_v1',
       'fn_property_task_projection_replace_v1','fn_property_task_projection_audit_immutable',
       'fn_property_task_projection_generation_exact','fn_property_runtime_control_contract_audit_immutable')) x;`));
  assertEqual(String(rows.length), "6", "six exact function definitions");
  const grammar = `b-property-task-projection-function-v1\n${rows.map((row) =>
    `function\tpublic.${row.identity}\t${row.definition_sha256}\n`).join("")}`;
  return { rows, grammar, grammar_sha256: sha256(grammar) };
}
function rawCatalogEvidence() {
  return JSON.parse(query(`WITH owned AS (SELECT c.oid,c.relname,c.relkind,c.relpersistence,
      c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
       ('biz_property_task_projection_head','biz_property_task_projection',
        'biz_property_task_projection_rebuild_audit','sys_property_runtime_control_contract_audit'))
    SELECT json_build_object(
      'relations',(SELECT json_agg(row_to_json(r) ORDER BY r.relname) FROM owned r),
      'columns',(SELECT json_agg(row_to_json(x) ORDER BY x.relname,x.attnum) FROM
        (SELECT o.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) data_type,
          a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) default_expr
         FROM owned o JOIN pg_attribute a ON a.attrelid=o.oid LEFT JOIN pg_attrdef d
           ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped) x),
      'constraints',(SELECT json_agg(row_to_json(x) ORDER BY x.relname,x.conname) FROM
        (SELECT o.relname,c.conname,c.contype,c.condeferrable,c.condeferred,c.convalidated,
          pg_get_constraintdef(c.oid,true) definition FROM owned o JOIN pg_constraint c ON c.conrelid=o.oid) x),
      'indexes',(SELECT json_agg(row_to_json(x) ORDER BY x.index_name) FROM
        (SELECT i.relname index_name,ix.indisunique,ix.indisprimary,ix.indisvalid,ix.indisready,
          pg_get_indexdef(ix.indexrelid) definition FROM owned o JOIN pg_index ix ON ix.indrelid=o.oid
          JOIN pg_class i ON i.oid=ix.indexrelid) x),
      'triggers',(SELECT json_agg(row_to_json(x) ORDER BY x.relname,x.tgname) FROM
        (SELECT o.relname,t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,
          pg_get_triggerdef(t.oid,true) definition FROM owned o JOIN pg_trigger t ON t.tgrelid=o.oid
          WHERE NOT t.tgisinternal) x))::text;`));
}
function securityControlEvidence() {
  return JSON.parse(query(`SELECT json_build_object(
    'controls',(SELECT coalesce(json_agg(row_to_json(c) ORDER BY c.tenant_id,c.park_id,c.control_key),'[]'::json)
      FROM (SELECT tenant_id,park_id,control_key,control_kind,target,adapter_version,
        contract_hash,enabled,control_mode,enabled_by,enabled_at,approval_reference,
        disabled_reason,version,update_time FROM sys_property_runtime_control) c),
    'controlAudits',(SELECT coalesce(json_agg(row_to_json(a) ORDER BY a.tenant_id,a.park_id,a.control_key),'[]'::json)
      FROM (SELECT tenant_id,park_id,control_id,control_key,correction_key,
        old_contract_hash,new_contract_hash,old_version,new_version,old_disabled_reason,
        new_disabled_reason,old_update_time,new_update_time,evidence_hash,occurred_at
        FROM sys_property_runtime_control_contract_audit) a),
    'relationAcl',(SELECT coalesce(json_agg(row_to_json(r) ORDER BY r.relname),'[]'::json)
      FROM (SELECT c.relname,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('biz_property_task_projection_head','biz_property_task_projection',
           'biz_property_task_projection_rebuild_audit','sys_property_runtime_control_contract_audit')) r),
    'functionAcl',(SELECT coalesce(json_agg(row_to_json(f) ORDER BY f.identity),'[]'::json)
      FROM (SELECT p.oid::regprocedure::text identity,p.proacl FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname LIKE 'fn_property_task_projection_%'
           OR (n.nspname='public' AND p.proname='fn_property_runtime_control_contract_audit_immutable')) f)
  )::text;`));
}
function databaseEnvironmentEvidence() {
  return JSON.parse(query(`SELECT json_build_object(
    'postgresql_version',version(),
    'server_version_num',current_setting('server_version_num'),
    'pg_settings',(SELECT json_object_agg(name,setting ORDER BY name) FROM pg_settings WHERE name IN
      ('block_size','data_checksums','default_transaction_isolation','fsync','full_page_writes',
       'deadlock_timeout','lock_timeout','max_connections','shared_buffers','statement_timeout','synchronous_commit','wal_level')),
    'database_name',current_database(),'database_user',current_user,
    'encoding',current_setting('server_encoding'),'timezone',current_setting('TimeZone'))::text;`));
}
function fixtureEvidence() {
  const fixtureGrammar=`b2a-c2-fixture-v1\nseed\t${sha256(readFileSync(seed))}\ntenant\t10000001\npark\t20000001\nactor\t11111111-1111-4111-8111-111111111111\n`;
  return {raw_sha256:sha256(fixtureGrammar),grammar:fixtureGrammar,complete_source_rows:200,rows:{
    tenants:Number(query("SELECT count(DISTINCT tenant_id) FROM sys_property_runtime_control WHERE tenant_id='10000001';")),
    parks:Number(query("SELECT count(*) FROM asset_park WHERE tenant_id='10000001' AND park_id='20000001';")),
    controls:Number(query("SELECT count(*) FROM sys_property_runtime_control;")),
    receipts:Number(query("SELECT count(*) FROM biz_property_mutation_receipt;")),
    projection_heads:Number(query("SELECT count(*) FROM biz_property_task_projection_head;")),
    projections:Number(query("SELECT count(*) FROM biz_property_task_projection;")),
    replacement_audits:Number(query("SELECT count(*) FROM biz_property_task_projection_rebuild_audit;"))}};
}
function baselineFiles() {
  return readdirSync(migrations).filter((name) => {
    const number = Number(name.match(/^(\d{6})_.*\.sql$/)?.[1]);
    return Number.isInteger(number) && number <= 182 && number !== 175;
  }).sort();
}
function applyFile(filename) {
  psql(readFileSync(resolve(migrations, filename), "utf8"));
}
function ensureHistoryStores() {
  psql(`CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (
      id bigserial PRIMARY KEY,filename varchar(255) NOT NULL UNIQUE,checksum varchar(64) NOT NULL,
      status varchar(16) NOT NULL CHECK(status IN ('running','succeeded','failed')),
      started_at timestamptz NOT NULL,finished_at timestamptz,error_message text,
      executed_by varchar(255) NOT NULL,batch_id varchar(32) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.schema_migrations (LIKE public.sys_schema_migration_history INCLUDING ALL);`);
}
function recordHistory(filename) {
  const checksum = sha256(readFileSync(resolve(migrations, filename)));
  for (const store of ["sys_schema_migration_history", "schema_migrations"]) {
    psql(`INSERT INTO public.${store}
      (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
      VALUES ('${filename}','${checksum}','succeeded',clock_timestamp(),clock_timestamp(),NULL,
        'b2a-c2-isolated-runner','${runId.slice(0,32)}');`);
  }
}
function historyReservationGuardSql(stage) {
  return `DO \$history_guard\$
    DECLARE reserved_count integer; mismatch_count integer;
    BEGIN
      WITH primary_reserved AS (
        SELECT filename,checksum,status FROM sys_schema_migration_history WHERE filename ~ '^00019[12]_'
      ), standard_reserved AS (
        SELECT filename,checksum,status FROM schema_migrations WHERE filename ~ '^00019[12]_'
      ), mismatch AS (
        SELECT coalesce(primary_reserved.filename,standard_reserved.filename) filename
        FROM primary_reserved FULL JOIN standard_reserved USING(filename)
        WHERE primary_reserved.filename IS NULL OR standard_reserved.filename IS NULL
          OR primary_reserved.checksum IS DISTINCT FROM standard_reserved.checksum
          OR primary_reserved.status IS DISTINCT FROM standard_reserved.status
      )
      SELECT (SELECT count(*) FROM primary_reserved)+(SELECT count(*) FROM standard_reserved),
        (SELECT count(*) FROM mismatch) INTO reserved_count,mismatch_count;
      IF mismatch_count<>0 THEN
        RAISE EXCEPTION 'reserved-history-store-inconsistent-before-194:${stage}' USING ERRCODE='23514';
      END IF;
      IF reserved_count<>0 THEN
        RAISE EXCEPTION 'reserved-history-row-before-194:${stage}' USING ERRCODE='23514';
      END IF;
    END \$history_guard\$;`;
}
function historyReservationPreflightGate(stage) {
  psql(historyReservationGuardSql(stage));
  const observed=JSON.parse(query(`SELECT json_build_object(
    'primary_reserved',(SELECT count(*) FROM sys_schema_migration_history WHERE filename ~ '^00019[12]_'),
    'standard_reserved',(SELECT count(*) FROM schema_migrations WHERE filename ~ '^00019[12]_'))::text;`));
  return {stage,status:"passed",primary_reserved:Number(observed.primary_reserved),
    standard_reserved:Number(observed.standard_reserved),stores_consistent:true};
}
function historyReservationNegativeGate() {
  const row=(store,filename,checksum,status="succeeded")=>`INSERT INTO ${store}
    (filename,checksum,status,started_at,finished_at,error_message,executed_by,batch_id)
    VALUES ('${filename}','${checksum}','${status}',clock_timestamp(),clock_timestamp(),NULL,
      'b2a-c2-reservation-negative','${runId.slice(0,32)}');`;
  const cases=[
    {name:"primary-only-reserved-row",expected:"reserved-history-store-inconsistent-before-194",
      sql:row("sys_schema_migration_history","000191_negative_primary.sql","1".repeat(64))},
    {name:"standard-only-reserved-row",expected:"reserved-history-store-inconsistent-before-194",
      sql:row("schema_migrations","000192_negative_standard.sql","2".repeat(64))},
    {name:"dual-store-inconsistent-reserved-row",expected:"reserved-history-store-inconsistent-before-194",
      sql:`${row("sys_schema_migration_history","000191_negative_mismatch.sql","3".repeat(64))}
        ${row("schema_migrations","000191_negative_mismatch.sql","4".repeat(64))}`},
    {name:"dual-store-consistent-reserved-row",expected:"reserved-history-row-before-194",
      sql:`${row("sys_schema_migration_history","000192_negative_consistent.sql","5".repeat(64))}
        ${row("schema_migrations","000192_negative_consistent.sql","5".repeat(64))}`}
  ];
  const results=cases.map(injection=>{
    const result=psql(`BEGIN;${injection.sql}${historyReservationGuardSql(`negative-${injection.name}`)}COMMIT;`,
      {allowFailure:true});
    const diagnostic=`${result.stdout??""}\n${result.stderr??""}`;
    if((result.status??0)===0||!diagnostic.includes(injection.expected))
      throw new Error(`history reservation injection did not fail closed: ${injection.name}:${diagnostic}`);
    const fresh=JSON.parse(query(`SELECT json_build_object(
      'primary',(SELECT count(*) FROM sys_schema_migration_history WHERE filename ~ '^00019[12]_'),
      'standard',(SELECT count(*) FROM schema_migrations WHERE filename ~ '^00019[12]_'))::text;`));
    if(Number(fresh.primary)!==0||Number(fresh.standard)!==0)
      throw new Error(`history reservation injection polluted fresh path: ${injection.name}:${JSON.stringify(fresh)}`);
    return {case:injection.name,expected_marker:injection.expected,observed_status:result.status,
      rollback_verified:fresh,status:"rejected-before-194"};
  });
  return {schema_version:"b2a-c2-history-reservation-negative-v1",cases:results,
    fresh_normal_path:historyReservationPreflightGate("negative-suite-restored-fresh"),status:"passed"};
}
function migrationFileAndHistoryEvidence(filename) {
  const fileSha=sha256(readFileSync(resolve(migrations,filename)));
  const rows=JSON.parse(query(`SELECT json_build_object(
    'primary',(SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.filename),'[]'::json) FROM
      (SELECT filename,checksum,status,executed_by,batch_id FROM sys_schema_migration_history WHERE filename=${sqlLiteral(filename)})x),
    'standard',(SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.filename),'[]'::json) FROM
      (SELECT filename,checksum,status,executed_by,batch_id FROM schema_migrations WHERE filename=${sqlLiteral(filename)})x))::text;`));
  return {filename,file_sha256:fileSha,history:rows};
}
function migrationHistoryEvidence() {
  const chainSql=exactChain.map(filename=>`'${filename}'`).join(",");
  return JSON.parse(query(`SELECT json_build_object(
    'primary',(SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.filename),'[]'::json) FROM
      (SELECT filename,checksum,status FROM sys_schema_migration_history WHERE filename IN (${chainSql})) x),
    'standard',(SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.filename),'[]'::json) FROM
      (SELECT filename,checksum,status FROM schema_migrations WHERE filename IN (${chainSql})) x),
    'reserved191Primary',(SELECT count(*) FROM sys_schema_migration_history WHERE filename LIKE '000191_%'),
    'reserved192Primary',(SELECT count(*) FROM sys_schema_migration_history WHERE filename LIKE '000192_%'),
    'reserved191Standard',(SELECT count(*) FROM schema_migrations WHERE filename LIKE '000191_%'),
    'reserved192Standard',(SELECT count(*) FROM schema_migrations WHERE filename LIKE '000192_%'))::text;`));
}
function bootstrap() {
  for (const filename of baselineFiles()) applyFile(filename);
  psql(readFileSync(seed, "utf8"));
  applyFile("000183_property_business_granular_rbac.sql");
  applyFile("000184_property_workbench_read_permissions.sql");
  psql(`
    BEGIN;
    INSERT INTO sys_tenant(tenant_id,park_id,tenant_code,tenant_name,tenant_type,status,max_users,max_parks,plan_code,remark)
    VALUES ('10000002','0','B2A_C2_SECOND','B2a C2 second qualifying tenant','park_operator',1,0,0,'GROUP','multi-scope gate');
    INSERT INTO asset_park
      (tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2A_C2_GATE','B2a C2 isolated park',
            'enabled',false,1,'B2a C2 isolated qualifying scope');
    INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000002','20000002','B2A_C2_GATE_2','B2a C2 isolated second park',
            'enabled',false,1,'B2a C2 isolated second qualifying scope');
    INSERT INTO rel_tenant_module(tenant_id,park_id,tenant_code,module_id,status,enabled,is_deleted,version,remark)
    SELECT '10000002','20000002','B2A_C2_SECOND',m.id,'enabled',true,false,1,'multi-scope asset assignment'
    FROM sys_module m WHERE m.module_code='asset' AND m.status=1 AND m.is_deleted=false ORDER BY m.id LIMIT 1;
    CREATE TEMP TABLE b2a_c2_permission_fixture_map(
      source_id uuid PRIMARY KEY,
      fixture_id uuid NOT NULL UNIQUE
    ) ON COMMIT DROP;
    INSERT INTO b2a_c2_permission_fixture_map(source_id,fixture_id)
    SELECT permission.id,uuid_generate_v4()
    FROM sys_permission permission
    WHERE permission.tenant_id='10000001'
      AND permission.is_enabled=true
      AND permission.status='enabled'
      AND permission.is_deleted=false;
    INSERT INTO sys_permission(
      id,tenant_id,park_id,code,name,parent_id,resource,action,
      permission_path,perm_path,permission_level,level,sort_no,
      permission_type,perm_type,api_method,api_path,frontend_route,
      component_key,icon,keep_alive,always_show,field_key,data_dimension,
      is_system,is_builtin,is_tenant_custom,visible,is_enabled,status,
      create_by,create_time,update_by,update_time,is_deleted,version,remark
    )
    SELECT fixture.fixture_id,'10000002','20000002',permission.code,permission.name,NULL,
      permission.resource,permission.action,permission.permission_path,permission.perm_path,
      permission.permission_level,permission.level,permission.sort_no,permission.permission_type,
      permission.perm_type,permission.api_method,permission.api_path,permission.frontend_route,
      permission.component_key,permission.icon,permission.keep_alive,permission.always_show,
      permission.field_key,permission.data_dimension,permission.is_system,permission.is_builtin,
      permission.is_tenant_custom,permission.visible,permission.is_enabled,permission.status,
      permission.create_by,permission.create_time,permission.update_by,permission.update_time,
      false,permission.version,'B2A C2 exact production permission subtree fixture'
    FROM sys_permission permission
    JOIN b2a_c2_permission_fixture_map fixture ON fixture.source_id=permission.id;
    UPDATE sys_permission target
    SET parent_id=parent_fixture.fixture_id
    FROM b2a_c2_permission_fixture_map child_fixture
    JOIN sys_permission source ON source.id=child_fixture.source_id
    JOIN b2a_c2_permission_fixture_map parent_fixture ON parent_fixture.source_id=source.parent_id
    WHERE target.id=child_fixture.fixture_id;
    DO \$fixture\$
    DECLARE
      source_count integer;
      fixture_count integer;
      unresolved_parent_count integer;
      semantic_drift_count integer;
    BEGIN
      SELECT count(*) INTO source_count FROM b2a_c2_permission_fixture_map;
      SELECT count(*) INTO fixture_count
      FROM sys_permission permission
      WHERE permission.tenant_id='10000002'
        AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false;
      SELECT count(*) INTO unresolved_parent_count
      FROM b2a_c2_permission_fixture_map child_fixture
      JOIN sys_permission source ON source.id=child_fixture.source_id
      LEFT JOIN b2a_c2_permission_fixture_map parent_fixture ON parent_fixture.source_id=source.parent_id
      WHERE source.parent_id IS NOT NULL AND parent_fixture.fixture_id IS NULL;
      WITH source_semantics AS (
        SELECT permission.code,permission.name,parent.code AS parent_code,
          permission.resource,permission.action,permission.permission_path,permission.perm_path,
          permission.permission_level,permission.level,permission.sort_no,permission.permission_type,
          permission.perm_type,permission.api_method,permission.api_path,permission.frontend_route,
          permission.component_key,permission.icon,permission.keep_alive,permission.always_show,
          permission.field_key,permission.data_dimension,permission.is_system,permission.is_builtin,
          permission.is_tenant_custom,permission.visible,permission.is_enabled,permission.status,permission.version
        FROM sys_permission permission
        LEFT JOIN sys_permission parent ON parent.id=permission.parent_id
        WHERE permission.tenant_id='10000001'
          AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
      ),
      fixture_semantics AS (
        SELECT permission.code,permission.name,parent.code AS parent_code,
          permission.resource,permission.action,permission.permission_path,permission.perm_path,
          permission.permission_level,permission.level,permission.sort_no,permission.permission_type,
          permission.perm_type,permission.api_method,permission.api_path,permission.frontend_route,
          permission.component_key,permission.icon,permission.keep_alive,permission.always_show,
          permission.field_key,permission.data_dimension,permission.is_system,permission.is_builtin,
          permission.is_tenant_custom,permission.visible,permission.is_enabled,permission.status,permission.version
        FROM sys_permission permission
        LEFT JOIN sys_permission parent ON parent.id=permission.parent_id
        WHERE permission.tenant_id='10000002'
          AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
      ),
      drift AS (
        (SELECT * FROM source_semantics EXCEPT SELECT * FROM fixture_semantics)
        UNION ALL
        (SELECT * FROM fixture_semantics EXCEPT SELECT * FROM source_semantics)
      )
      SELECT count(*) INTO semantic_drift_count FROM drift;
      IF source_count=0 OR fixture_count<>source_count OR unresolved_parent_count<>0 OR semantic_drift_count<>0 THEN
        RAISE EXCEPTION 'b2a-c2-second-scope-permission-subtree-fixture-failed'
          USING ERRCODE='23514';
      END IF;
    END;
    \$fixture\$;
    COMMIT;
  `);
  ensureHistoryStores();
  for (const filename of exactChain.slice(0, -1)) {
    applyFile(filename);
    recordHistory(filename);
  }
}
function catalogGate() {
  assertEqual(query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN
      ('biz_property_task_projection_head','biz_property_task_projection',
       'biz_property_task_projection_rebuild_audit',
       'sys_property_runtime_control_contract_audit') AND c.relkind='r';`), "4", "four tables");
  assertEqual(query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('fn_property_task_projection_scalar_v1','fn_property_task_projection_row_hash_v1',
       'fn_property_task_projection_replace_v1','fn_property_task_projection_audit_immutable',
       'fn_property_task_projection_generation_exact',
       'fn_property_runtime_control_contract_audit_immutable');`), "6", "six functions");
  assertEqual(query(`SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
    ('trg_biz_property_task_projection_rebuild_audit_immutable',
     'trg_sys_property_runtime_control_contract_audit_immutable',
     'trg_biz_property_task_projection_head_generation_exact',
     'trg_biz_property_task_projection_generation_exact');`), "4", "four triggers");
  assertEqual(query(`SELECT prosecdef::text||'|'||provolatile::text||'|'||coalesce(array_to_string(proconfig,','),'')
    FROM pg_proc WHERE oid='public.fn_property_task_projection_replace_v1(varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,char,varchar,char,varchar,jsonb)'::regprocedure;`),
    "false|v|search_path=pg_catalog, public", "replace security contract");
  assertEqual(query(`SELECT count(*) FROM pg_depend d JOIN pg_class c ON c.oid=d.objid
    WHERE c.relname IN ('biz_property_task_projection_head','biz_property_task_projection',
      'biz_property_task_projection_rebuild_audit','sys_property_runtime_control_contract_audit')
      AND pg_describe_object(d.classid,d.objid,d.objsubid) ~ '00019(1|2)';`), "0", "191/192 dependency");
}
function driftRejectionGate() {
  const expected = catalogFingerprint();
  const cases = [
    ["function-volatility", "ALTER FUNCTION public.fn_property_task_projection_replace_v1(varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,char,varchar,char,varchar,jsonb) STABLE;", "ALTER FUNCTION public.fn_property_task_projection_replace_v1(varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,char,varchar,char,varchar,jsonb) VOLATILE;"],
    ["function-overload", "CREATE FUNCTION public.fn_property_task_projection_scalar_v1(text,text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1';", "DROP FUNCTION public.fn_property_task_projection_scalar_v1(text,text);"],
    ["index-missing", "DROP INDEX public.idx_biz_property_task_projection_source;", "CREATE INDEX idx_biz_property_task_projection_source ON public.biz_property_task_projection (tenant_id,park_id,source_type,source_id,task_kind,business_occurrence_key);"],
    ["trigger-disabled", "ALTER TABLE public.biz_property_task_projection DISABLE TRIGGER trg_biz_property_task_projection_generation_exact;", "ALTER TABLE public.biz_property_task_projection ENABLE TRIGGER trg_biz_property_task_projection_generation_exact;"],
    ["function-acl", "REVOKE EXECUTE ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb) FROM CURRENT_USER;", "GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb) TO CURRENT_USER;"],
    ["column-default", "ALTER TABLE public.biz_property_task_projection_head ALTER COLUMN projection_version SET DEFAULT 1;", "ALTER TABLE public.biz_property_task_projection_head ALTER COLUMN projection_version DROP DEFAULT;"]
  ];
  return cases.map(([name, driftSql, restoreSql]) => {
    const before = catalogFingerprint();
    assertEqual(before, expected, `${name} before catalog`);
    psql(driftSql);
    const drifted = catalogFingerprint();
    if (drifted === expected) throw new Error(`${name}: catalog fingerprint did not change`);
    const migrationAttempt = psql(readFileSync(resolve(migrations, migration194), "utf8"), { allowFailure: true });
    const expectedMarker=migrationAttempt.stderr.includes("property-task-projection-function-definition-drift")
      ? "property-task-projection-function-definition-drift"
      : "property-task-projection-preexisting-catalog-drift";
    if (migrationAttempt.status === 0 || !migrationAttempt.stderr.includes(expectedMarker)) {
      throw new Error(`${name}: migration did not fail closed: ${migrationAttempt.stderr}`);
    }
    psql(restoreSql);
    const restored = catalogFingerprint();
    assertEqual(restored, expected, `${name} restored catalog`);
    const restoredFunctionGrammar=functionDefinitionEvidence().grammar_sha256;
    assertEqual(restoredFunctionGrammar,"62af6e29ce78590b1c90621eefb5319ef101f7375b347fc4f6dc5a0341704c1f",`${name} restored function grammar`);
    return { name, before_sha256: before, drifted_sha256: drifted,
      migration_status: migrationAttempt.status, expected_error: expectedMarker,
      after_restore_sha256: restored,after_restore_function_grammar_sha256:restoredFunctionGrammar,status: "passed" };
  });
}
function controlSnapshot() {
  return JSON.parse(query(`SELECT json_build_object(
    'controlCount',(SELECT count(*) FROM sys_property_runtime_control),
    'controlSha',(SELECT encode(digest(convert_to(coalesce(string_agg(to_jsonb(c)::text||E'\\n','' ORDER BY tenant_id,park_id,control_key),''),'UTF8'),'sha256'),'hex') FROM sys_property_runtime_control c),
    'auditCount',(SELECT count(*) FROM sys_property_runtime_control_contract_audit),
    'auditSha',(SELECT encode(digest(convert_to(coalesce(string_agg(to_jsonb(a)::text||E'\\n','' ORDER BY tenant_id,park_id,control_key),''),'UTF8'),'sha256'),'hex') FROM sys_property_runtime_control_contract_audit a))::text;`));
}
function controlStateGate() {
  const migrationSql=readFileSync(resolve(migrations,migration194),"utf8");
  const results=[];
  psql(`ALTER TABLE sys_property_runtime_control_contract_audit DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
    DELETE FROM sys_property_runtime_control_contract_audit WHERE correction_key='b2a-contract-correction-000194';
    ALTER TABLE sys_property_runtime_control_contract_audit ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;
    UPDATE sys_property_runtime_control SET contract_hash='a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',
      disabled_reason='expand-only';`);
  const allOldBefore=controlSnapshot();
  const allOldFunctions=functionDefinitionEvidence();
  assertEqual(allOldFunctions.grammar_sha256,"62af6e29ce78590b1c90621eefb5319ef101f7375b347fc4f6dc5a0341704c1f","all-old pre-migration function grammar");
  try{applyFile(migration194);}catch(caught){throw new Error(`all-old migration: ${caught instanceof Error?caught.message:String(caught)}; definitions=${JSON.stringify(allOldFunctions.rows.map(({identity,definition_sha256})=>({identity,definition_sha256})))}`);}
  const allOldAfter=controlSnapshot();
  const qualifyingScopeCount=Number(query(`SELECT count(*) FROM (SELECT btrim(a.tenant_id),btrim(a.park_id)
    FROM rel_tenant_module a JOIN sys_module m ON m.id=a.module_id AND m.module_code='asset' AND m.status=1 AND m.is_deleted=false
    WHERE a.enabled=true AND a.status='enabled' AND a.is_deleted=false
      AND (a.start_time IS NULL OR a.start_time<=clock_timestamp())
      AND (a.expire_time IS NULL OR a.expire_time>clock_timestamp()) GROUP BY btrim(a.tenant_id),btrim(a.park_id))s;`));
  if(qualifyingScopeCount<2)throw new Error(`multi-scope gate requires at least 2 qualifying scopes, got ${qualifyingScopeCount}`);
  const perScopeRows=JSON.parse(query(`SELECT json_agg(row_to_json(x) ORDER BY tenant_id,park_id)::text FROM
    (SELECT tenant_id,park_id,count(*)::int row_count,count(DISTINCT control_key)::int distinct_key_count
       FROM sys_property_runtime_control GROUP BY tenant_id,park_id)x;`));
  if(perScopeRows.length!==qualifyingScopeCount||perScopeRows.some(row=>row.row_count!==12||row.distinct_key_count!==12))
    throw new Error(`multi-scope exact 12-row/key mismatch: ${JSON.stringify(perScopeRows)}`);
  const signedControlCountPerScope=12;
  const expectedAuditCount=qualifyingScopeCount*signedControlCountPerScope;
  if(allOldAfter.auditCount!==expectedAuditCount||allOldAfter.auditCount!==allOldBefore.controlCount)
    throw new Error(`all-old multi-scope control conversion audit count ${JSON.stringify({qualifyingScopeCount,signedControlCountPerScope,expectedAuditCount,actual:allOldAfter.auditCount})}`);
  results.push({case:"all-old",qualifying_scope_count:qualifyingScopeCount,
    signed_control_count_per_scope:signedControlCountPerScope,expected_audit_count:expectedAuditCount,
    per_scope_rows:perScopeRows,before:allOldBefore,after:allOldAfter,status:"converted-exact"});
  const allNewBefore=controlSnapshot();
  assertEqual(functionDefinitionEvidence().grammar_sha256,"62af6e29ce78590b1c90621eefb5319ef101f7375b347fc4f6dc5a0341704c1f","all-new pre-migration function grammar");
  try{applyFile(migration194);}catch(caught){throw new Error(`all-new migration: ${caught instanceof Error?caught.message:String(caught)}`);}
  const allNewAfter=controlSnapshot();
  if(JSON.stringify(allNewBefore)!==JSON.stringify(allNewAfter)) throw new Error("all-new rerun changed controls");
  results.push({case:"all-new",before:allNewBefore,after:allNewAfter,status:"no-op-exact"});
  const negatives=[
    ["mixed-old-new",`UPDATE sys_property_runtime_control SET contract_hash='a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',disabled_reason='expand-only' WHERE control_key='task.enforce';`],
    ["all-old-with-existing-audit",`UPDATE sys_property_runtime_control SET contract_hash='a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',disabled_reason='expand-only';`],
    ["missing-control",`ALTER TABLE sys_property_runtime_control_contract_audit DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable; DELETE FROM sys_property_runtime_control_contract_audit WHERE control_key='task.enforce'; DELETE FROM sys_property_runtime_control WHERE control_key='task.enforce'; ALTER TABLE sys_property_runtime_control_contract_audit ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;`],
    ["extra-unknown-control",`INSERT INTO sys_property_runtime_control(tenant_id,park_id,control_key,control_kind,target,contract_hash,enabled,control_mode,disabled_reason,version) VALUES('10000001','20000001','task.unknown-extra','enforce','task','81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3',false,'disabled','b2a-contract-correction-000194',1);`],
    ["nonqualifying-scope-unknown-control",`INSERT INTO sys_property_runtime_control(tenant_id,park_id,control_key,control_kind,target,contract_hash,enabled,control_mode,disabled_reason,version) VALUES('nonqualifying-tenant','nonqualifying-park','task.unknown-nonqualifying','enforce','task','81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3',false,'disabled','b2a-contract-correction-000194',1);`],
    ["enabled-control",`UPDATE sys_property_runtime_control SET enabled=true,control_mode='enforce',enabled_by='11111111-1111-4111-8111-111111111111',enabled_at=clock_timestamp(),approval_reference='fixture-approval' WHERE control_key='task.enforce';`],
    ["config-drift",`UPDATE sys_property_runtime_control SET control_kind='enforce' WHERE control_key='identity.legacy-read-v1';`],
    ["adapter-version-drift",`UPDATE sys_property_runtime_control SET adapter_version=999 WHERE control_key='task.enforce';`],
    ["target-drift",`UPDATE sys_property_runtime_control SET target='housing' WHERE control_key='task.enforce';`],
    ["disabled-metadata-drift",`UPDATE sys_property_runtime_control SET disabled_reason='unexpected' WHERE control_key='task.enforce';`],
    ["audit-missing",`ALTER TABLE sys_property_runtime_control_contract_audit DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable; DELETE FROM sys_property_runtime_control_contract_audit WHERE control_key='task.enforce'; ALTER TABLE sys_property_runtime_control_contract_audit ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;`],
    ["audit-evidence-hash",`ALTER TABLE sys_property_runtime_control_contract_audit DISABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable; UPDATE sys_property_runtime_control_contract_audit SET evidence_hash=repeat('0',64) WHERE control_key='task.enforce'; ALTER TABLE sys_property_runtime_control_contract_audit ENABLE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable;`]
  ];
  for(const [name,setup] of negatives){
    const before=controlSnapshot();
    const attempted=psql(`BEGIN; ${setup}\n${migrationSql}`,{allowFailure:true});
    if(attempted.status===0||!/(property-runtime-control|property-task-projection-preexisting-catalog-drift)/.test(attempted.stderr))
      throw new Error(`${name}: control drift did not fail closed: ${attempted.stderr}`);
    const after=controlSnapshot();
    if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error(`${name}: failed transaction changed controls`);
    const sqlstate=observedSqlstate(attempted);
    if(sqlstate!=="23514") throw new Error(`${name}: expected observed 23514, got ${sqlstate}`);
    results.push({case:name,before,after,sqlstate,stderr_marker:(attempted.stderr.match(/property-[a-z-]+/)??[])[0]??null,status:"rejected-rollback-exact"});
  }
  return results;
}
let snapshotGrammarCache=null;
function scopedSnapshot({sources=[],receipts=[],assignments=[]}) {
  const list=(values)=>values.length?values.map(value=>`'${value}'`).join(","):"NULL";
  const definitions=[
    ["authority","biz_property_task_assignment",`id IN (${list(assignments)})`,"id::text"],
    ["assignment","biz_property_task_assignment",`id IN (${list(assignments)})`,"id::text"],
    ["audit","biz_property_task_assignment_audit",`assignment_id IN (${list(assignments)})`,"id::text"],
    ["head","biz_property_task_projection_head",`source_id IN (${list(sources)})`],
    ["projection","biz_property_task_projection",`source_id IN (${list(sources)})`],
    ["replacement_audit","biz_property_task_projection_rebuild_audit",`source_id IN (${list(sources)})`],
    ["receipt","biz_property_mutation_receipt",`id IN (${list(receipts)})`],
  ];
  const objects={};
  for(const [name,table,predicate] of definitions) objects[name]=JSON.parse(query(`SELECT json_build_object('count',count(*),'sha256',
      encode(digest(convert_to(coalesce(string_agg(to_jsonb(t)::text||E'\\n','' ORDER BY id::text),''),'UTF8'),'sha256'),'hex'))::text
      FROM public.${table} t WHERE ${predicate};`));
  if(!snapshotGrammarCache){
    const lines=definitions.map(([name,table])=>{const columns=query(`SELECT string_agg(attname,',' ORDER BY attnum)
      FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attnum>0 AND NOT attisdropped;`);
      return `${name}\tpublic.${table}\tcolumns=${columns}\tencoding=postgresql16-to_jsonb-canonical-text\tsort=id::text\trow_lf=true`;
    });
    const text=`b2a-c2-object-snapshot-v2\nauthority_semantics\ttest-fixture-owning-authority-is-biz_property_task_assignment\n${lines.join("\n")}\n`;
    snapshotGrammarCache={text,sha256:sha256(text)};
  }
  const valueGrammar=`b2a-c2-object-snapshot-value-v1\n${Object.entries(objects).map(([name,value])=>`${name}\t${value.count}\t${value.sha256}\n`).join("")}`;
  return {objects,snapshot_hash_grammar:snapshotGrammarCache.text,
    snapshot_hash_grammar_sha256:snapshotGrammarCache.sha256,snapshot_value_sha256:sha256(valueGrammar)};
}
function negativeObjects(before,after) {
  return Object.fromEntries(Object.keys(before.objects).map(name=>[name,{
    pre_count:before.objects[name].count,post_count:after.objects[name].count,
    pre_sha256:before.objects[name].sha256,post_sha256:after.objects[name].sha256
  }]));
}
function negativeCase({injectionId,marker,injectionPoint,expectedSqlstate,observedSqlstate,
  blockerTimeline=[],stageMarkers=[],accessInstrument,before,after,extra={}}) {
  return {injection_id:injectionId,marker,injection_point:injectionPoint,expected_sqlstate:expectedSqlstate,
    observed_sqlstate:observedSqlstate,blocker_timeline:blockerTimeline,stage_markers:stageMarkers,
    access_counts:deriveNegativeAccessCounts(accessInstrument),objects:negativeObjects(before,after),
    snapshot_hash_grammar:before.snapshot_hash_grammar,
    snapshot_hash_grammar_sha256:before.snapshot_hash_grammar_sha256,
    rollback_proved:before.snapshot_value_sha256===after.snapshot_value_sha256,...extra,status:"passed"};
}
function captureSqlState(body) {
  return query(`CREATE FUNCTION pg_temp.b2a_c2_capture() RETURNS text LANGUAGE plpgsql AS $capture$
    DECLARE state text; message text;
    BEGIN
      BEGIN ${body} RETURN '00000|unexpected-success';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
        RETURN state||'|'||message;
      END;
    END $capture$;
    SELECT pg_temp.b2a_c2_capture();`);
}
function captureSqlStateTrace(body) {
  return JSON.parse(query(`CREATE FUNCTION pg_temp.b2a_c2_capture_trace() RETURNS jsonb LANGUAGE plpgsql AS $capture$
    DECLARE state text; message text; receipt_before bigint; head_before bigint; receipt_after bigint; head_after bigint;
    BEGIN
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_mutation_receipt'::regclass),0) INTO receipt_before;
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_task_projection_head'::regclass),0) INTO head_before;
      BEGIN ${body} state:='00000';message:='unexpected-success';
      EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;END;
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_mutation_receipt'::regclass),0) INTO receipt_after;
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_task_projection_head'::regclass),0) INTO head_after;
      RETURN jsonb_build_object('sqlstate',state,'message',message,
        'receipt_scan_delta',receipt_after-receipt_before,'head_scan_delta',head_after-head_before);
    END $capture$;
    SELECT pg_temp.b2a_c2_capture_trace()::text;`));
}
function pollQuery(sql,predicate,{timeoutMs=5_000,intervalMs=25,label="poll"}={}) {
  const started=Date.now();const timeline=[];
  while(Date.now()-started<timeoutMs){const value=query(sql);timeline.push({at:new Date().toISOString(),value});
    if(predicate(value)) return {value,timeline};
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,intervalMs);
  }
  throw new Error(`${label} timeout: ${JSON.stringify(timeline.slice(-10))}`);
}
function faultInjectionGate() {
  const actor="11111111-1111-4111-8111-111111111111";
  const oversizeRows=`(SELECT jsonb_agg('{}'::jsonb) FROM generate_series(1,201))`;
  const invoke=({source,receipt,mode="manual-rebuild",action="property.task.rebuild",resultVersion=1,expected=0,rows="'[]'::jsonb"})=>
    `PERFORM * FROM public.fn_property_task_projection_replace_v1(
      '10000001','20000001','test_fixture_source','${source}','${actor}','${receipt}',
      '${mode}','${action}',${resultVersion},${expected},'${"a".repeat(64)}',
      'property-task-rebuild/test_fixture_source/${source}/v${resultVersion}','${"b".repeat(64)}',
      'fault injection fixture',${rows});`;
  const results=[];
  const oversizeSource="a0000000-0000-4000-8000-000000000001",oversizeReceipt="a0000000-0000-4000-8000-000000000002";
  let before=scopedSnapshot({sources:[oversizeSource],receipts:[oversizeReceipt]});
  let accessTrace=captureSqlStateTrace(invoke({source:oversizeSource,receipt:oversizeReceipt,rows:oversizeRows}));
  let captured=`${accessTrace.sqlstate}|${accessTrace.message}`;
  let after=scopedSnapshot({sources:[oversizeSource],receipts:[oversizeReceipt]});
  if(!captured.startsWith("22023|property-task-projection-row-limit")||before.snapshot_value_sha256!==after.snapshot_value_sha256)
    throw new Error(`oversize-preaccess fault failed: ${captured}`);
  results.push(negativeCase({injectionId:"oversize-preaccess",marker:"oversize-preaccess",
    injectionPoint:"after top-level/object validation and final array count; before receipt/head access",
    expectedSqlstate:"22023",observedSqlstate:"22023",stageMarkers:["top-level-array-validated",
      "object-cardinality-validated","final-count-201","rejected-before-receipt-head"],
    accessInstrument:accessTrace,before,after}));

  const lateSource="a0000000-0000-4000-8000-000000000011",lateReceipt="a0000000-0000-4000-8000-000000000012";
  before=scopedSnapshot({sources:[lateSource],receipts:[lateReceipt]});
  accessTrace=captureSqlStateTrace(`INSERT INTO biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES('${lateReceipt}','10000001','20000001','${actor}','property.task.rebuild','${lateSource}','fault-late','${"a".repeat(64)}');
      ${invoke({source:lateSource,receipt:lateReceipt})}
      RAISE EXCEPTION 'b2a-c2-late-precommit' USING ERRCODE='P0001';`);
  captured=`${accessTrace.sqlstate}|${accessTrace.message}`;
  after=scopedSnapshot({sources:[lateSource],receipts:[lateReceipt]});
  if(!captured.startsWith("P0001|b2a-c2-late-precommit")||before.snapshot_value_sha256!==after.snapshot_value_sha256)
    throw new Error(`late-precommit fault failed: ${captured}`);
  results.push(negativeCase({injectionId:"late-precommit-after-projection-head-audit",
    marker:"late-precommit-after-projection-head-audit",
    injectionPoint:"after projection/head/replacement audit writes; before receipt completion and COMMIT dispatch",
    expectedSqlstate:"P0001",observedSqlstate:"P0001",stageMarkers:["receipt-started","projection-written",
      "head-written","replacement-audit-written","fault-raised-before-receipt-completion","rollback-observed"],
    accessInstrument:accessTrace,before,after,extra:{commit_dispatched:false}}));

  const authoritySource="a0000000-0000-4000-8000-000000000021",authorityReceipt="a0000000-0000-4000-8000-000000000022",assignment="a0000000-0000-4000-8000-000000000023";
  psql(`INSERT INTO biz_property_task_assignment(id,tenant_id,park_id,task_key,task_key_version,task_kind,source_type,source_id,source_version_at_generation)
    VALUES('${assignment}','10000001','20000001','fault-authority',1,'fixture','test_fixture_source','${authoritySource}',1);`);
  before=scopedSnapshot({sources:[authoritySource],receipts:[authorityReceipt],assignments:[assignment]});
  accessTrace=captureSqlStateTrace(`UPDATE biz_property_task_assignment SET version=version+1,updated_at=clock_timestamp() WHERE id='${assignment}';
    ${invoke({source:authoritySource,receipt:authorityReceipt,rows:oversizeRows})}`);
  captured=`${accessTrace.sqlstate}|${accessTrace.message}`;
  after=scopedSnapshot({sources:[authoritySource],receipts:[authorityReceipt],assignments:[assignment]});
  if(!captured.startsWith("22023|property-task-projection-row-limit")||before.snapshot_value_sha256!==after.snapshot_value_sha256)
    throw new Error(`post-authority-oversize fault failed: ${captured}`);
  results.push(negativeCase({injectionId:"post-authority-oversize",marker:"post-authority-oversize",
    injectionPoint:"after owning authority mutation; final 201-row function guard",
    expectedSqlstate:"22023",observedSqlstate:"22023",stageMarkers:["authority-mutated",
      "prospective-count-201","function-rejected-before-receipt-head","rollback-observed"],
    accessInstrument:accessTrace,before,after}));

  const lockSource="a0000000-0000-4000-8000-000000000031",seedReceipt="a0000000-0000-4000-8000-000000000032",waitReceipt="a0000000-0000-4000-8000-000000000033";
  const lockTask="a0000000-0000-4000-8000-000000000034";
  const lockRow={taskId:lockTask,taskKey:sha256("fault-lock-task"),assignmentAuthority:"owning",
    derivedAssignmentId:null,sourceType:"test_fixture_source",sourceId:lockSource,sourceVersion:1,
    businessOccurrenceKey:"fault-lock-task",taskKind:"fixture",queueCode:"fixture.queue",title:"Fault lock task",
    kindLabel:"Fixture",sourceLabel:"Fixture source",priority:0,dueAt:null,assignmentStatus:"open",
    assignmentVersion:1,assigneeId:null,assigneeDisplay:null,claimedAt:null,startedAt:null,blockedReason:null,
    blockedUntil:null,outcomeCode:null,outcomeSourceVersion:null,outcomeAt:null,sourceDeepLink:null,
    contentHash:"0".repeat(64),createdAt:"2026-08-01T00:00:00.000Z",updatedAt:"2026-08-01T00:00:00.000Z"};
  const lockRows=`(SELECT jsonb_build_array(jsonb_set(row,'{contentHash}',to_jsonb(
    public.fn_property_task_projection_row_hash_v1(row)::text))) FROM (SELECT '${JSON.stringify(lockRow)}'::jsonb row) fixture)`;
  const seeded=captureSqlState(`INSERT INTO biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
    VALUES('${seedReceipt}','10000001','20000001','${actor}','property.task.rebuild','${lockSource}','fault-lock-seed','${"a".repeat(64)}');
    ${invoke({source:lockSource,receipt:seedReceipt,rows:lockRows})}`);
  if(seeded!=="00000|unexpected-success") throw new Error(`forced-lock seed failed: ${seeded}`);
  before=scopedSnapshot({sources:[lockSource],receipts:[waitReceipt]});
  const injectionId=`forced-lock-delete-replace-wait-${runId}`;
  const holderApp=`b2a-c2-lock-holder-${runId}`,waiterApp=`b2a-c2-lock-waiter-${runId}`;
  psql(`CREATE TABLE IF NOT EXISTS b2a_c2_fault_observation(injection_id text PRIMARY KEY,
    observed_sqlstate text NOT NULL,marker text NOT NULL,receipt_scan_delta bigint NOT NULL,
    head_scan_delta bigint NOT NULL,remaining_budget_ms integer NOT NULL,statement_timeout_ms integer NOT NULL,
    lock_timeout_ms integer NOT NULL,wait_started_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());`);
  docker(["exec","-d",containerId,"psql","-X","-v","ON_ERROR_STOP=1","-U",postgresUser,"-d",databaseName,"-c",
    `BEGIN; SET application_name='${holderApp}'; SELECT task_id FROM biz_property_task_projection WHERE source_id='${lockSource}' FOR UPDATE; SELECT pg_sleep(30); ROLLBACK;`]);
  const holderLatch=pollQuery(`SELECT coalesce((SELECT pid::text FROM pg_stat_activity WHERE application_name='${holderApp}'
    AND state='active' AND wait_event='PgSleep'),'');`,value=>/^\d+$/.test(value),{label:"holder row-lock latch"});
  const holderPid=holderLatch.value;
  const forcedBeginNs=process.hrtime.bigint(),forcedDeadlineNs=forcedBeginNs+5_000_000_000n;
  const forcedRemaining=()=>Number((forcedDeadlineNs-process.hrtime.bigint())/1_000_000n);
  const forcedDispatchNs=process.hrtime.bigint();
  const forcedSnapshot=createDispatchTimeoutSnapshot({name:"forced-lock-delete-replace-wait",
    remainingBudgetMs:forcedRemaining(),dispatchNs:forcedDispatchNs,blockingOperation:true,
    deadlineSafetyMs:200,lockSafetyMs:100});
  const remainingAtWaiterDispatch=forcedSnapshot.remaining_budget_ms;
  const effectiveStatementTimeoutMs=forcedSnapshot.statement_timeout_ms;
  const effectiveLockTimeoutMs=forcedSnapshot.lock_timeout_ms;
  docker(["exec","-d",containerId,"psql","-X","-v","ON_ERROR_STOP=1","-U",postgresUser,"-d",databaseName,"-c",
    `BEGIN; SET application_name='${waiterApp}'; SET LOCAL statement_timeout='${effectiveStatementTimeoutMs}ms';
    SET LOCAL lock_timeout='${effectiveLockTimeoutMs}ms'; DO \$waiter\$ DECLARE state text;message text;
      receipt_before bigint;head_before bigint;receipt_after bigint;head_after bigint;wait_started timestamptz:=clock_timestamp(); BEGIN
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_mutation_receipt'::regclass),0) INTO receipt_before;
      SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
        WHERE relid='biz_property_task_projection_head'::regclass),0) INTO head_before;
      BEGIN
        INSERT INTO biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
        VALUES('${waitReceipt}','10000001','20000001','${actor}','property.task.rebuild','${lockSource}','fault-lock-wait','${"a".repeat(64)}');
        ${invoke({source:lockSource,receipt:waitReceipt,resultVersion:2,expected:1,rows:lockRows})}
        RAISE EXCEPTION 'forced-lock-unexpected-success' USING ERRCODE='P0001';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
        SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
          WHERE relid='biz_property_mutation_receipt'::regclass),0) INTO receipt_after;
        SELECT coalesce((SELECT seq_scan+idx_scan FROM pg_stat_xact_user_tables
          WHERE relid='biz_property_task_projection_head'::regclass),0) INTO head_after;
        INSERT INTO b2a_c2_fault_observation(injection_id,observed_sqlstate,marker,receipt_scan_delta,
          head_scan_delta,remaining_budget_ms,statement_timeout_ms,lock_timeout_ms,wait_started_at)
        VALUES('${injectionId}',state,message,receipt_after-receipt_before,head_after-head_before,
          ${remainingAtWaiterDispatch},${effectiveStatementTimeoutMs},${effectiveLockTimeoutMs},wait_started);
      END;
    END \$waiter\$; COMMIT;`]);
  const waiterBlocked=pollQuery(`SELECT coalesce((SELECT json_build_object('pid',a.pid,'wait_event_type',a.wait_event_type,
      'wait_event',a.wait_event,'blocking_pids',pg_blocking_pids(a.pid),'projection_relation_lock',EXISTS(
        SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.relation='biz_property_task_projection'::regclass))::text
      FROM pg_stat_activity a WHERE a.application_name='${waiterApp}'),'');`,value=>{
        try{const parsed=JSON.parse(value);return parsed.wait_event_type==="Lock"&&parsed.blocking_pids.map(String).includes(holderPid)&&parsed.projection_relation_lock===true;}catch{return false;}
      },{label:"waiter exact DELETE lock"});
  const observed=pollQuery(`SELECT coalesce((SELECT json_build_object('sqlstate',observed_sqlstate,'marker',marker,
      'receipt_scan_delta',receipt_scan_delta,'head_scan_delta',head_scan_delta,'remaining_budget_ms',remaining_budget_ms,
      'statement_timeout_ms',statement_timeout_ms,'lock_timeout_ms',lock_timeout_ms,
      'wait_elapsed_ms',extract(epoch FROM(recorded_at-wait_started_at))*1000)::text
    FROM b2a_c2_fault_observation WHERE injection_id='${injectionId}'),'');`,value=>{
      try{return JSON.parse(value).sqlstate==="55P03";}catch{return false;}
    },{timeoutMs:Math.max(6_000,remainingAtWaiterDispatch+2_000),label:"waiter 55P03"});
  const forcedObservation=JSON.parse(observed.value),forcedObservedNs=process.hrtime.bigint();
  const waitBudgetEvidence=deriveWaitBudgetEvidence({observedNs:forcedObservedNs,deadlineNs:forcedDeadlineNs,
    actualWaitMs:Number(forcedObservation.wait_elapsed_ms),effectiveLockTimeoutMs,
    remainingBudgetMs:remainingAtWaiterDispatch});
  captured=`${forcedObservation.sqlstate}|${forcedObservation.marker}`;
  psql(`SELECT pg_terminate_backend(${holderPid});`);
  after=scopedSnapshot({sources:[lockSource],receipts:[waitReceipt]});
  if(!captured.startsWith("55P03|")||before.snapshot_value_sha256!==after.snapshot_value_sha256||
    forcedObservation.statement_timeout_ms!==effectiveStatementTimeoutMs||
    forcedObservation.lock_timeout_ms!==effectiveLockTimeoutMs||
    effectiveStatementTimeoutMs>remainingAtWaiterDispatch||effectiveLockTimeoutMs>remainingAtWaiterDispatch||
    !waitBudgetEvidence.waited_until_remaining_budget)
    throw new Error(`forced-lock fault failed: ${captured}`);
  results.push(negativeCase({injectionId,marker:"forced-lock-delete-replace-wait",
    injectionPoint:"projection DELETE/replacement write",expectedSqlstate:"55P03",observedSqlstate:"55P03",
    blockerTimeline:{holder_latch:holderLatch.timeline,waiter_blocked:waiterBlocked.timeline,result:observed.timeline,
      holder_pid:holderPid,waiter_observation:JSON.parse(waiterBlocked.value)},stageMarkers:["fixture-seeded",
      "holder-row-lock-latched","waiter-lock-observed","lock-timeout-observed","holder-released"],
    accessInstrument:forcedObservation,before,after,extra:{blocked_relation:"biz_property_task_projection",
      blocked_operation:"DELETE replacement",deadline_evidence:{begin_dispatch_ns:forcedBeginNs.toString(),
        deadline_ns:forcedDeadlineNs.toString(),dispatch_ns:forcedSnapshot.dispatch_ns,observed_ns:forcedObservedNs.toString(),
        remaining_budget_ms:remainingAtWaiterDispatch,effective_statement_timeout_ms:effectiveStatementTimeoutMs,
        effective_lock_timeout_ms:effectiveLockTimeoutMs,actual_wait_elapsed_ms:Number(forcedObservation.wait_elapsed_ms),
        ...waitBudgetEvidence,rollback_snapshot_exact:before.snapshot_value_sha256===after.snapshot_value_sha256}}}));
  return results;
}
function ambiguousCommitGate() {
  const actor="11111111-1111-4111-8111-111111111111";
  const runCase=({name,source,receipt,truthMode})=>{
    const requestHash="c".repeat(64),resultHash="d".repeat(64);
    const resultRef=`property-task-rebuild/test_fixture_source/${source}/v1`;
    const operations=[`INSERT INTO biz_property_mutation_receipt
      (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES('${receipt}','10000001','20000001','${actor}','property.task.rebuild','${source}',
        'ambiguous-${name}','${requestHash}')`,
      `SELECT * FROM public.fn_property_task_projection_replace_v1(
        '10000001','20000001','test_fixture_source','${source}','${actor}','${receipt}',
        'manual-rebuild','property.task.rebuild',1,0,'${requestHash}','${resultRef}',
        '${resultHash}','ambiguous commit fixture','[]'::jsonb)`,
      `UPDATE biz_property_mutation_receipt SET receipt_status='completed',result_ref='${resultRef}',
        result_hash='${resultHash}',completed_at=clock_timestamp() WHERE id='${receipt}'`];
    const identity={receipt_id:receipt,tenant_id:"10000001",park_id:"20000001",actor_id:actor,
      action_id:"property.task.rebuild",semantic_target_type:"source",target_id:source,
      client_key:`ambiguous-${name}`,request_hash:requestHash};
    const logicalIdentityGrammar=receiptIdentityGrammarV1({receiptId:receipt,tenantId:identity.tenant_id,
      parkId:identity.park_id,actorId:identity.actor_id,actionId:identity.action_id,targetId:identity.target_id,
      clientKey:identity.client_key,requestHash:identity.request_hash});
    const logicalIdentitySha=sha256(logicalIdentityGrammar);
    const before=scopedSnapshot({sources:[source],receipts:[receipt]});
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:root,encoding:"utf8",timeout:10_000,
      env:{...process.env,B2A_C2_AMBIGUOUS_CHILD:"1",B2A_C2_PG_PORT:String(containerIdentity.host_port),
        B2A_C2_PG_USER:postgresUser,B2A_C2_PG_PASSWORD:postgresPassword,B2A_C2_PG_DATABASE:databaseName,
        B2A_C2_APPLICATION_NAME:`b2a-c2-${name}-${runId}`,B2A_C2_TRUTH_MODE:truthMode,
        B2A_C2_AMBIGUOUS_OPERATIONS:JSON.stringify(operations)}});
    if(child.status!==0) throw new Error(`${name}: ambiguous child failed status=${child.status}, stderr=${child.stderr}`);
    const transport=JSON.parse(child.stdout.trim().split("\n").filter(Boolean).at(-1));
    const afterFault=scopedSnapshot({sources:[source],receipts:[receipt]});
    const receiptStateAtRecovery=query(`SELECT coalesce((SELECT receipt_status||'|'||result_ref||'|'||result_hash
      FROM biz_property_mutation_receipt WHERE id='${receipt}'),'absent');`);
    const headVersionAtRecovery=query(`SELECT coalesce((SELECT projection_version::text FROM biz_property_task_projection_head
      WHERE source_id='${source}'),'absent');`);
    const reconciled=receiptStateAtRecovery===`completed|${resultRef}|${resultHash}`&&headVersionAtRecovery==="1"?"committed"
      :receiptStateAtRecovery==="absent"&&headVersionAtRecovery==="absent"?"not_committed":"inconsistent";
    if(transport.observed_sqlstate!=="08006"||transport.raw_transport_code!=="08006"||
      transport.raw_error_severity!=="FATAL"||transport.query_resolved||reconciled!==truthMode)
      throw new Error(`${name}: truth reconciliation failed ${JSON.stringify({transport,reconciled,receiptStateAtRecovery,headVersionAtRecovery})}`);
    if(truthMode==="not_committed"&&before.snapshot_value_sha256!==afterFault.snapshot_value_sha256)
      throw new Error(`${name}: non-forwarded COMMIT did not roll back exact`);
    const acquireInput={receiptId:receipt,tenantId:"10000001",parkId:"20000001",actorId:actor,
      actionId:"property.task.rebuild",targetType:"source",targetId:source,clientKey:`ambiguous-${name}`,
      requestHash,acquireMode:"execute-or-replay",expectedResultRef:resultRef,expectedResultHash:resultHash,
      resultRef,resultHash};
    let acquired;
    let recoveryOutcome,completionUpdateCount=0;
    if(reconciled==="committed"){
      acquired=receiptAcquireState(acquireInput);
      if(acquired.outcome!=="replay-completed"||acquired.receipt_insert_count!==0)
        throw new Error(`${name}: completed exact acquire mismatch ${JSON.stringify(acquired)}`);
      recoveryOutcome="replayed-completed";
    }else{
      const recovered=executeReceiptStateMachineTransaction(acquireInput,operations[1]);
      acquired=recovered.acquire;completionUpdateCount=recovered.completion_update_count;
      if(acquired.outcome!=="execute"||acquired.receipt_insert_count!==1)
        throw new Error(`${name}: absent execute-or-replay mismatch ${JSON.stringify(acquired)}`);
      if(completionUpdateCount!==1)throw new Error(`${name}: full-identity completion CAS affected ${completionUpdateCount}`);
      recoveryOutcome="executed-after-absent";
    }
    const afterRecovery=scopedSnapshot({sources:[source],receipts:[receipt]});
    const receiptInsertCount=Number(query(`SELECT count(*) FROM biz_property_mutation_receipt WHERE id='${receipt}';`));
    const logicalActionCount=Number(query(`SELECT count(*) FROM biz_property_task_projection_rebuild_audit
      WHERE source_id='${source}' AND mutation_receipt_id='${receipt}';`));
    const finalHeadVersion=query(`SELECT coalesce((SELECT projection_version::text FROM biz_property_task_projection_head
      WHERE source_id='${source}'),'absent');`);
    if(receiptInsertCount!==1||logicalActionCount!==1||finalHeadVersion!=="1")
      throw new Error(`${name}: recovery cardinality mismatch ${JSON.stringify({receiptInsertCount,logicalActionCount,finalHeadVersion})}`);
    return {case:name,acquire_mode:"execute-or-replay",truth:reconciled,transport,before,after_fault:afterFault,
      after_recovery:afterRecovery,logical_identity:identity,logical_identity_sha256:logicalIdentitySha,
      logical_identity_grammar:logicalIdentityGrammar,
      locked_state:{receipt:receiptStateAtRecovery,head_version:headVersionAtRecovery},
      receipt_insert_count:receiptInsertCount,new_logical_action_count:reconciled==="committed"?0:1,
      recovery_outcome:recoveryOutcome,completion_update_count:completionUpdateCount,
      recovery:{outcome:recoveryOutcome,acquire:acquired,receipt_insert_count:receiptInsertCount,
        new_logical_action_count:reconciled==="committed"?0:1,total_logical_action_count:logicalActionCount,
        final_head_version:finalHeadVersion},status:"passed"};
  };
  return [
    runCase({name:"commit-ambiguous-committed",source:"a0000000-0000-4000-8000-000000000041",receipt:"a0000000-0000-4000-8000-000000000042",truthMode:"committed"}),
    runCase({name:"commit-ambiguous-not-committed",source:"a0000000-0000-4000-8000-000000000051",receipt:"a0000000-0000-4000-8000-000000000052",truthMode:"not_committed"})
  ];
}
function auditConstraintMatrixGate() {
  const cases=[
    ["audit-version","-1","0","1","0","'property.task.rebuild'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v1'"],
    ["audit-projected-count","99","100","100","-1","'property.task.rebuild'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'"],
    ["audit-assignment-mutation","99","100","100","0","'property.task.rebuild'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'","1"],
    ["audit-mode-action","99","100","100","0","'property.task.claim'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'"],
    ["audit-command-result-ref-bad-uuid","99","100","100","0","'property.task.claim'","'authority-sync'","'authority-sync:property.task.claim'","repeat('a',64)","'property-task/not-a-uuid/v100'"],
    ["audit-command-result-ref-bad-version","99","100","100","0","'property.task.claim'","'authority-sync'","'authority-sync:property.task.claim'","repeat('a',64)","'property-task/11111111-1111-4111-8111-111111111111/v99'"],
    ["audit-terminal-reverse-mode-action","99","100","100","0","'property.task.source-terminal.closed'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'"],
    ["audit-terminal-result-ref-bad-source-type","99","100","100","0","'property.task.source-terminal.closed'","'authority-sync'","'authority-sync:property.task.source-terminal.closed'","repeat('a',64)","'property-task-source-terminal/wrong-source/'||lower(source_id::text)||'/closed/v100'"],
    ["audit-terminal-result-ref-bad-source-id","99","100","100","0","'property.task.source-terminal.closed'","'authority-sync'","'authority-sync:property.task.source-terminal.closed'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/11111111-1111-4111-8111-111111111111/closed/v100'"],
    ["audit-terminal-result-ref-bad-terminal-token","99","100","100","0","'property.task.source-terminal.cancelled'","'authority-sync'","'authority-sync:property.task.source-terminal.cancelled'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/closed/v100'"],
    ["audit-closed-result-version-forged","99","100","99","0","'property.task.source-terminal.closed'","'authority-sync'","'authority-sync:property.task.source-terminal.closed'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/closed/v100'"],
    ["audit-closed-result-ref-forged","99","100","100","0","'property.task.source-terminal.closed'","'authority-sync'","'authority-sync:property.task.source-terminal.closed'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/closed/v99'"],
    ["audit-cancelled-result-version-forged","99","100","99","0","'property.task.source-terminal.cancelled'","'authority-sync'","'authority-sync:property.task.source-terminal.cancelled'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/cancelled/v100'"],
    ["audit-cancelled-result-ref-forged","99","100","100","0","'property.task.source-terminal.cancelled'","'authority-sync'","'authority-sync:property.task.source-terminal.cancelled'","repeat('a',64)","'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/cancelled/v99'"],
    ["audit-result-ref","99","100","100","0","'property.task.rebuild'","'manual-rebuild'","'manual matrix'","repeat('a',64)","'invalid-result-ref'"],
    ["audit-reason","99","100","100","0","'property.task.rebuild'","'manual-rebuild'","'   '","repeat('a',64)","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'"],
    ["audit-hashes","99","100","100","0","'property.task.rebuild'","'manual-rebuild'","'manual matrix'","'INVALID'","'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'"]
  ];
  const results=cases.map(([name,from,to,business,count,action,mode,reason,requestHash,resultRef,assignmentMutation="0"])=>{
    const attempt=psql(`BEGIN;WITH base AS (SELECT * FROM biz_property_task_projection_rebuild_audit ORDER BY occurred_at,id LIMIT 1)
      INSERT INTO biz_property_task_projection_rebuild_audit
       (id,tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,replace_mode,
        command_action,from_projection_version,to_projection_version,business_result_version,projected_task_count,
        assignment_mutation_count,reason,request_hash,result_ref,result_hash,content_hash)
      SELECT uuid_generate_v4(),tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,
        ${mode},${action},${from},${to},${business},${count},${assignmentMutation},${reason},${requestHash},${resultRef},
        repeat('b',64),repeat('c',64) FROM base;COMMIT;`,{allowFailure:true});
    const sqlstate=observedSqlstate(attempt);
    if(attempt.status===0||sqlstate!=="23514")throw new Error(`${name}: expected DB CHECK 23514: ${attempt.stderr}`);
    return {case:name,layer:"database-check",expected_sqlstate:"23514",observed_sqlstate:sqlstate,status:"rejected-as-required"};
  });
  const directPositiveCases=[
    ["audit-manual-positive","property.task.rebuild","manual-rebuild",
      "'property-task-rebuild/'||source_type||'/'||lower(source_id::text)||'/v100'","'manual direct positive'"],
    ...["claim","start","block","unblock","release"].map(action=>[`audit-${action}-positive`,`property.task.${action}`,
      "authority-sync","'property-task/11111111-1111-4111-8111-111111111111/v100'",`'authority-sync:property.task.${action}'`]),
    ...["closed","cancelled"].map(terminal=>[`audit-${terminal}-positive`,`property.task.source-terminal.${terminal}`,
      "authority-sync",`'property-task-source-terminal/'||source_type||'/'||lower(source_id::text)||'/${terminal}/v100'`,
      `'authority-sync:property.task.source-terminal.${terminal}'`])];
  for(const [name,action,mode,resultRef,reason] of directPositiveCases){
    const attempt=psql(`BEGIN;WITH base AS (SELECT * FROM biz_property_task_projection_rebuild_audit ORDER BY occurred_at,id LIMIT 1)
      INSERT INTO biz_property_task_projection_rebuild_audit
       (id,tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,replace_mode,
        command_action,from_projection_version,to_projection_version,business_result_version,projected_task_count,
        assignment_mutation_count,reason,request_hash,result_ref,result_hash,content_hash)
      SELECT uuid_generate_v4(),tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,
        '${mode}','${action}',99,100,100,0,0,${reason},repeat('a',64),${resultRef},repeat('b',64),repeat('c',64)
      FROM base;ROLLBACK;`,{allowFailure:true});
    if(attempt.status!==0)throw new Error(`${name}: expected direct DB-row positive: ${attempt.stderr}`);
    results.push({case:name,layer:"database-check",expected_sqlstate:"00000",observed_sqlstate:"00000",status:"accepted-then-rolled-back"});
  }
  for(const [name,sql,marker] of [
    ["replacement-audit-update-immutable","UPDATE biz_property_task_projection_rebuild_audit SET reason=reason;","property-task-projection-audit-immutable"],
    ["replacement-audit-delete-immutable","DELETE FROM biz_property_task_projection_rebuild_audit;","property-task-projection-audit-immutable"],
    ["control-audit-update-immutable","UPDATE sys_property_runtime_control_contract_audit SET evidence_hash=evidence_hash;","property-runtime-control-contract-audit-immutable"],
    ["control-audit-delete-immutable","DELETE FROM sys_property_runtime_control_contract_audit;","property-runtime-control-contract-audit-immutable"]]){
    const attempt=psql(sql,{allowFailure:true}),sqlstate=observedSqlstate(attempt);
    if(attempt.status===0||sqlstate!=="55000"||!attempt.stderr.includes(marker))throw new Error(`${name}: immutable gate mismatch ${attempt.stderr}`);
    results.push({case:name,layer:"database-trigger",expected_sqlstate:"55000",observed_sqlstate:sqlstate,marker,status:"rejected-as-required"});
  }
  return results;
}
function acquireModeMatrixGate() {
  const completed="a0000000-0000-4000-8000-000000000042";
  const started="a1000000-0000-4000-8000-000000000001",failed="a1000000-0000-4000-8000-000000000002";
  const terminalCompleted="a1000000-0000-4000-8000-000000000003",terminalTarget="a1000000-0000-4000-8000-000000000013";
  const terminalRef=`property-task-source-terminal/test_fixture_source/${terminalTarget}/closed/v3`;
  psql(`INSERT INTO biz_property_mutation_receipt
    (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash,receipt_status,result_ref,result_hash,completed_at)
    VALUES
    ('${started}','10000001','20000001','11111111-1111-4111-8111-111111111111','property.task.rebuild',
      'a1000000-0000-4000-8000-000000000011','matrix-started','${"1".repeat(64)}','started',NULL,NULL,NULL),
    ('${failed}','10000001','20000001','11111111-1111-4111-8111-111111111111','property.task.rebuild',
      'a1000000-0000-4000-8000-000000000012','matrix-failed','${"2".repeat(64)}','failed',NULL,NULL,NULL),
    ('${terminalCompleted}','10000001','20000001','11111111-1111-4111-8111-111111111111',
      'property.task.source-terminal.closed','${terminalTarget}','matrix-terminal-completed','${"3".repeat(64)}',
      'completed','${terminalRef}','${"4".repeat(64)}',clock_timestamp());`);
  const manualBase={receiptId:completed,tenantId:"10000001",parkId:"20000001",actorId:"11111111-1111-4111-8111-111111111111",
    actionId:"property.task.rebuild",targetType:"source",targetId:"a0000000-0000-4000-8000-000000000041",
    clientKey:"ambiguous-commit-ambiguous-committed",requestHash:"c".repeat(64),
    expectedResultRef:"property-task-rebuild/test_fixture_source/a0000000-0000-4000-8000-000000000041/v1",expectedResultHash:"d".repeat(64)};
  const terminalBase={receiptId:terminalCompleted,tenantId:"10000001",parkId:"20000001",actorId:manualBase.actorId,
    actionId:"property.task.source-terminal.closed",targetType:"source",targetId:terminalTarget,
    clientKey:"matrix-terminal-completed",requestHash:"3".repeat(64),expectedResultRef:terminalRef,expectedResultHash:"4".repeat(64)};
  const definitions=[
    ["ordinary-completed-execute-or-replay",{...manualBase,acquireMode:"execute-or-replay"},"replay-completed"],
    ["ordinary-completed-existing-only",{...manualBase,acquireMode:"existing-only"},"replay-completed"],
    ["ordinary-started-failclosed",{...manualBase,receiptId:started,targetId:"a1000000-0000-4000-8000-000000000011",clientKey:"matrix-started",requestHash:"1".repeat(64),expectedResultRef:null,expectedResultHash:null,acquireMode:"execute-or-replay"},"fail-closed-started"],
    ["ordinary-failed-failclosed",{...manualBase,receiptId:failed,targetId:"a1000000-0000-4000-8000-000000000012",clientKey:"matrix-failed",requestHash:"2".repeat(64),expectedResultRef:null,expectedResultHash:null,acquireMode:"execute-or-replay"},"fail-closed-failed"],
    ["terminal-active-execute-or-replay",{...terminalBase,receiptId:"a1000000-0000-4000-8000-000000000004",targetId:"a1000000-0000-4000-8000-000000000014",clientKey:"matrix-terminal-active",requestHash:"5".repeat(64),expectedResultRef:null,expectedResultHash:null,acquireMode:"execute-or-replay"},"execute"],
    ["same-terminal-existing-only",{...terminalBase,acquireMode:"existing-only"},"replay-completed"],
    ["absent-existing-only-failclosed",{...terminalBase,receiptId:"a1000000-0000-4000-8000-000000000005",targetId:"a1000000-0000-4000-8000-000000000015",clientKey:"matrix-terminal-absent",requestHash:"6".repeat(64),expectedResultRef:null,expectedResultHash:null,acquireMode:"existing-only"},"fail-closed-absent"]];
  const cases=definitions.map(([name,input,expected])=>{const before=Number(query("SELECT count(*) FROM biz_property_mutation_receipt;"));
    const observed=receiptAcquireState(input),after=Number(query("SELECT count(*) FROM biz_property_mutation_receipt;"));
    if(observed.outcome!==expected)throw new Error(`${name}: expected ${expected}, got ${JSON.stringify(observed)}`);
    const expectedInsert=expected==="execute"?1:0;if(after-before!==expectedInsert||observed.receipt_insert_count!==expectedInsert)
      throw new Error(`${name}: receipt count mismatch`);
    return {case:name,input,observed,receipt_count_before:before,receipt_count_after:after,
      receipt_insert_count:after-before,replay_count:expected==="replay-completed"?1:0,status:"passed"};});
  const mismatchOverrides={receipt_id:{receiptId:"a1000000-0000-4000-8000-000000000099"},
    tenant_id:{tenantId:"wrong-tenant"},park_id:{parkId:"wrong-park"},
    actor_id:{actorId:"22222222-2222-4222-8222-222222222222"},action_id:{actionId:"property.task.source-terminal.cancelled"},
    target_type:{targetType:"task"},target_id:{targetId:"a1000000-0000-4000-8000-000000000099"},
    client_key:{clientKey:"wrong-client-key"},request_hash:{requestHash:"9".repeat(64)},
    result_ref:{expectedResultRef:"wrong-result-ref"},result_hash:{expectedResultHash:"8".repeat(64)}};
  const mismatch_cases=Object.entries(mismatchOverrides).map(([dimension,override])=>{
    const before=Number(query("SELECT count(*) FROM biz_property_mutation_receipt;"));
    const observed=receiptAcquireState({...manualBase,...override,acquireMode:"existing-only"});
    const after=Number(query("SELECT count(*) FROM biz_property_mutation_receipt;"));
    if(!["identity-conflict","completed-result-conflict"].includes(observed.outcome)||after!==before)
      throw new Error(`receipt-${dimension}-mismatch replayed or mutated: ${JSON.stringify(observed)}`);
    return {case:`receipt-${dimension}-mismatch`,dimension,observed,receipt_insert_count:0,replay_count:0,status:"rejected-as-required"};});
  return {cases,mismatch_cases,status:"passed"};
}
function receiptAcquireConcurrencyGate() {
  const winnerCommitLatchKey=19420260812,receiptId="a2000000-0000-4000-8000-000000000001";
  const sourceId="a2000000-0000-4000-8000-000000000002",actorId="11111111-1111-4111-8111-111111111111";
  const input={receiptId,tenantId:"10000001",parkId:"20000001",actorId,actionId:"property.task.rebuild",
    targetType:"source",targetId:sourceId,clientKey:"same-key-concurrent-acquire",requestHash:"7".repeat(64),
    acquireMode:"execute-or-replay",expectedResultRef:null,expectedResultHash:null};
  const apps=[`b2a-c2-receipt-acquire-a-${runId}`,`b2a-c2-receipt-acquire-b-${runId}`];
  psql(`CREATE TABLE b2a_c2_receipt_acquire_observation(worker text PRIMARY KEY,evidence jsonb NOT NULL);`);
  const holderApp=`b2a-c2-receipt-acquire-holder-${runId}`;
  const holderWorker=launchDetachedPsqlWorker("receipt-acquire-holder",
    `SET application_name='${holderApp}';SELECT pg_advisory_lock(${winnerCommitLatchKey});SELECT pg_sleep(30);`);
  const holder=pollQuery(`SELECT coalesce((SELECT pid::text FROM pg_stat_activity WHERE application_name='${holderApp}'
    AND wait_event='PgSleep'),'');`,value=>/^\d+$/.test(value),{label:"receipt acquire holder latch"});
  const winnerWorker=launchDetachedPsqlWorker("receipt-acquire-winner",`BEGIN;
    SET application_name='${apps[0]}';
    ${receiptAcquireSql(input)}
    \\gset winner_
    CREATE TEMP TABLE b2a_c2_winner_evidence(evidence jsonb NOT NULL) ON COMMIT DROP;
    INSERT INTO b2a_c2_winner_evidence VALUES (:'winner_evidence_json'::jsonb);
    DO \$winner\$ BEGIN
      IF (SELECT evidence->>'outcome' FROM b2a_c2_winner_evidence)<>'execute' THEN
        RAISE EXCEPTION 'receipt-race-winner-did-not-execute' USING ERRCODE='23514';
      END IF;
    END \$winner\$;
    SELECT pg_advisory_xact_lock_shared(${winnerCommitLatchKey});
    INSERT INTO b2a_c2_receipt_acquire_observation(worker,evidence)
    SELECT '${apps[0]}',evidence FROM b2a_c2_winner_evidence;
    COMMIT;`);
  const winnerBlocked=pollQuery(`SELECT coalesce((SELECT json_build_object('pid',pid,'wait_event_type',wait_event_type,
      'wait_event',wait_event,'blocking_pids',pg_blocking_pids(pid))::text FROM pg_stat_activity
      WHERE application_name='${apps[0]}'),'');`,value=>{try{const row=JSON.parse(value);
        return row.wait_event_type==="Lock"&&row.wait_event==="advisory"&&row.blocking_pids.map(String).includes(holder.value);
      }catch{return false;}},{label:"receipt winner commit latch"});
  const winnerPid=String(JSON.parse(winnerBlocked.value).pid);
  const loserWorker=launchDetachedPsqlWorker("receipt-acquire-loser",`BEGIN;
    SET application_name='${apps[1]}';
    ${receiptAcquireSql(input)}
    \\gset first_
    SELECT CASE WHEN (:'first_evidence_json'::jsonb->>'outcome')='fail-closed-absent' THEN 'true' ELSE 'false' END AS retry
    \\gset loser_
    \\if :loser_retry
      ${receiptAcquireSql(input)}
      \\gset final_
    \\else
      SELECT :'first_evidence_json'::text AS evidence_json
      \\gset final_
    \\endif
    INSERT INTO b2a_c2_receipt_acquire_observation(worker,evidence)
    VALUES('${apps[1]}',:'final_evidence_json'::jsonb);
    COMMIT;`);
  const loserBlocked=pollQuery(`SELECT coalesce((SELECT json_build_object('pid',pid,'wait_event_type',wait_event_type,
      'wait_event',wait_event,'blocking_pids',pg_blocking_pids(pid))::text FROM pg_stat_activity
      WHERE application_name='${apps[1]}'),'');`,value=>{try{const row=JSON.parse(value);
        return row.wait_event_type==="Lock"&&row.blocking_pids.map(String).includes(winnerPid);
      }catch{return false;}},{label:"receipt loser transaction latch"});
  psql(`SELECT pg_terminate_backend(${holder.value});`);
  const workers=[winnerWorker,loserWorker];
  const observed=waitForReceiptWorkerOutcomes(workers,apps);
  const workerDiagnostics=waitForDetachedWorkerExits(workers,apps);
  if(workerDiagnostics.some(worker=>worker.exit_code!==0))
    throw new Error(`receipt acquire worker failed: ${JSON.stringify({workerDiagnostics,activity:receiptWorkerActivity(apps)})}`);
  const outcomes=JSON.parse(query(`SELECT json_agg(row_to_json(x) ORDER BY worker)::text FROM
    (SELECT worker,evidence->>'outcome' outcome,(evidence->>'receipt_insert_count')::int receipt_insert_count,
       (evidence->>'receipt_lock_count')::int receipt_lock_count
       FROM b2a_c2_receipt_acquire_observation)x;`));
  const winnerCount=outcomes.filter(row=>row.outcome==="execute"&&row.receipt_insert_count===1).length;
  const loser=outcomes.find(row=>row.outcome!=="execute");
  if(winnerCount!==1||!loser||!["replay-completed","fail-closed-started"].includes(loser.outcome)||
    loser.receipt_insert_count!==0||loser.receipt_lock_count!==1||outcomes.some(row=>row.outcome==="fail-closed-absent")||
    Number(query(`SELECT count(*) FROM biz_property_mutation_receipt WHERE id='${receiptId}';`))!==1)
    throw new Error(`same-key receipt acquire winner cardinality: ${JSON.stringify(outcomes)}`);
  return {schema_version:"b2a-c2-receipt-acquire-concurrency-v12",identity_grammar:receiptIdentityGrammarV1(input),
    identity_sha256:receiptIdentitySha256V1(input),holder_latch:holder.timeline,
    winner_commit_latch:winnerBlocked.timeline,loser_transaction_latch:loserBlocked.timeline,
    outcome_latch:observed.timeline,worker_diagnostics:workerDiagnostics,
    holder_worker_diagnostic:detachedPsqlWorkerDiagnostic(holderWorker),outcomes,winner_count:1,loser_outcome:loser.outcome,
    loser_lock_verified:true,receipt_count:1,status:"passed"};
}
function fakeLifecycleGate() {
  // Use the Linux gate host's writable ephemeral root explicitly. A Windows
  // TMP/TEMP inherited through WSL can resolve to a read-only mounted drive and
  // would make the lifecycle gate fail before it can exercise cleanup.
  const fixtureDir=mkdtempSync("/tmp/b2a-c2-lifecycle-");
  const logPath=resolve(fixtureDir,"commands.log");
  const makeFake=(name)=>{const path=resolve(fixtureDir,name);writeFileSync(path,
    `#!/bin/sh\nprintf '%s:%s\\n' '${name}' "$2" >> "$B2A_C2_LIFECYCLE_LOG"\nexit "$1"\n`,{flag:"wx"});chmodSync(path,0o700);return path;};
  const fakeCreate=makeFake("create"),fakeTest=makeFake("test"),fakeDrop=makeFake("drop");
  const cases = [
    ["create-fail", { createStatus: 17 }, 17,0],
    ["test-fail-drop-pass", { testStatus: 23 }, 23,1],
    ["test-fail-drop-fail-primary-preserved", { testStatus: 23,dropStatus:29 },23,1],
    ["test-pass-drop-fail", { dropStatus: 29 },29,1],
    ["temp-cleanup-fail", { tempFail:true },31,1],
    ["SIGINT", { signal:"SIGINT" },128,1],
    ["SIGINT-drop-fail-primary-preserved", { signal:"SIGINT",dropStatus:29 },128,1],
    ["SIGTERM", { signal:"SIGTERM" },128,1],
    ["SIGTERM-temp-fail-primary-preserved", { signal:"SIGTERM",tempFail:true },128,1],
    ["SIGHUP", { signal:"SIGHUP" },128,1],
    ["success", {},0,1]
  ];
  try{return cases.map(([name,input,expectedStatus,expectedDropCalls],index)=>{
    const target=`b2a_c2_${runId}_${index}_${randomBytes(4).toString("hex")}`;
    const tempMarker=resolve(fixtureDir,`${target}.tmp`);
    const beforeLog=existsSync(logPath)?readFileSync(logPath,"utf8").split("\n").filter(Boolean).length:0;
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{encoding:"utf8",timeout:10_000,
      env:{...process.env,B2A_C2_LIFECYCLE_CHILD:"1",B2A_C2_LIFECYCLE_TARGET:target,
        B2A_C2_LIFECYCLE_TEMP:tempMarker,B2A_C2_LIFECYCLE_LOG:logPath,
        B2A_C2_FAKE_CREATE:fakeCreate,B2A_C2_FAKE_TEST:fakeTest,B2A_C2_FAKE_DROP:fakeDrop,
        B2A_C2_CREATE_STATUS:String(input.createStatus??0),B2A_C2_TEST_STATUS:String(input.testStatus??0),
        B2A_C2_DROP_STATUS:String(input.dropStatus??0),B2A_C2_TEMP_FAIL:input.tempFail?"1":"0",
        ...(input.signal?{B2A_C2_SIGNAL:input.signal}:{})}});
    const childLine=child.stdout.trim().split("\n").filter(Boolean).at(-1);
    if(!childLine) throw new Error(`${name}: lifecycle child emitted no result: status=${child.status}, signal=${child.signal}, stderr=${child.stderr}`);
    const actual=JSON.parse(childLine);
    const commands=(existsSync(logPath)?readFileSync(logPath,"utf8").split("\n").filter(Boolean):[]).slice(beforeLog);
    const dropCalls=commands.filter(line=>line===`drop:${target}`).length;
    assertEqual(String(child.status),String(expectedStatus),`${name} exit status`);
    assertEqual(String(dropCalls),String(expectedDropCalls),`${name} exact drop calls`);
    if(name==="create-fail"&&commands.some(line=>line.startsWith("drop:")))throw new Error("create-fail invoked drop");
    const tempAbsentAfterChild=!existsSync(tempMarker);
    if(existsSync(tempMarker))rmSync(tempMarker);
    return {name,target,input,expected_status:expectedStatus,observed_status:child.status,
      commands,drop_calls:dropCalls,child:actual,temp_absent_after_child:tempAbsentAfterChild,
      parent_fixture_cleanup_required:!tempAbsentAfterChild,status:"passed"};
  });}finally{rmSync(fixtureDir,{recursive:true,force:true});}
}
function percentile95(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}
function planNodes(value, nodes = []) {
  if (!value || typeof value !== "object") return nodes;
  if (value["Node Type"]) nodes.push(value);
  for (const child of value.Plans ?? []) planNodes(child, nodes);
  return nodes;
}
function deterministicUuid(label) {
  const hex = sha256(label);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function budgetActionGate() {
  const actionCases = [
    { action: "property.task.rebuild", mode: "manual-rebuild", status: "open", resultVersion: 1, sourceVersion: 1 },
    { action: "property.task.claim", mode: "authority-sync", status: "claimed", resultVersion: 2, sourceVersion: 1 },
    { action: "property.task.start", mode: "authority-sync", status: "in_progress", resultVersion: 2, sourceVersion: 1 },
    { action: "property.task.block", mode: "authority-sync", status: "blocked", resultVersion: 2, sourceVersion: 1 },
    { action: "property.task.unblock", mode: "authority-sync", status: "in_progress", resultVersion: 2, sourceVersion: 1 },
    { action: "property.task.release", mode: "authority-sync", status: "open", resultVersion: 2, sourceVersion: 1 },
    { action: "property.task.source-terminal.closed", mode: "authority-sync", status: "closed", resultVersion: 3, sourceVersion: 3 },
    { action: "property.task.source-terminal.cancelled", mode: "authority-sync", status: "cancelled", resultVersion: 3, sourceVersion: 3 }
  ];
  const actions=actionCases.map(spec=>({...spec,representative_or_self:"self",
    equivalence_signature_ref:null,equivalence_mapping_status:"not-required-all-eight-executed",
    evidence_scope:"function-fixture-only",
    production_full_action_deadline_status:"pending_C4",
    warmup_count:5,declared_attempts:20,recorded_attempts:20,executed_attempts:0,excluded_attempts:0,replacement_attempts:0,
    attempts:Array.from({length:20},(_,index)=>({ordinal:index+1,phase:"measured",executed:false,
      outcome:"not-executed",reason:"predeclared-awaiting-execution"})),warmups:[]}));
  const childEnv=spec=>({...process.env,B2A_C2_BUDGET_CHILD:"1",B2A_C2_BUDGET_SPEC:JSON.stringify(spec),
    B2A_C2_PG_PORT:String(containerIdentity.host_port),B2A_C2_PG_USER:postgresUser,
    B2A_C2_PG_PASSWORD:postgresPassword,B2A_C2_PG_DATABASE:databaseName});
  const runOne=spec=>{
    const started=process.hrtime.bigint();
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:root,encoding:"utf8",
      timeout:budgetContract.outer_watchdog_ms,env:childEnv(spec),maxBuffer:4*1024*1024});
    const ended=process.hrtime.bigint();
    const line=child.stdout?.trim().split("\n").filter(Boolean).at(-1);
    if(child.error?.code==="ETIMEDOUT") return {ordinal:spec.ordinal,phase:spec.phase,executed:true,
      begin_dispatch_ns:started.toString(),start_ns:started.toString(),end_ns:ended.toString(),
      duration_ns:(ended-started).toString(),deadline_exceeded:true,outcome:"outer-watchdog-timeout",
      commit_dispatched:null,ack:false,stage_markers:["predeclared","outer-watchdog-fired"],
      access_counts:{receipt:null,head:null},harness:{status:child.status,signal:child.signal,error:child.error.message}};
    if(!line) return {ordinal:spec.ordinal,phase:spec.phase,executed:true,begin_dispatch_ns:started.toString(),
      start_ns:started.toString(),end_ns:ended.toString(),duration_ns:(ended-started).toString(),
      outcome:"harness-failed",commit_dispatched:null,ack:false,stage_markers:["predeclared","child-no-record"],
      access_counts:{receipt:null,head:null},harness:{status:child.status,signal:child.signal,stderr:child.stderr}};
    try{const parsed=JSON.parse(line),timeoutSummary=summarizeAttemptTimeouts(parsed.operations??[]);
      return {...parsed,...timeoutSummary,
        harness:{status:child.status,signal:child.signal,outer_watchdog_ms:budgetContract.outer_watchdog_ms}};}
    catch(error){return {ordinal:spec.ordinal,phase:spec.phase,executed:true,begin_dispatch_ns:started.toString(),
      start_ns:started.toString(),end_ns:ended.toString(),duration_ns:(ended-started).toString(),outcome:"record-parse-failed",
      commit_dispatched:null,ack:false,stage_markers:["predeclared","record-parse-failed"],access_counts:{receipt:null,head:null},
      harness:{status:child.status,signal:child.signal,stderr:child.stderr,parse_error:error.message}};}
  };
  let gateFailure=null;
  outer:for(const action of actions){
    for(let warmup=1;warmup<=5;warmup+=1){
      const record=runOne({...action,phase:"warmup",ordinal:warmup});action.warmups.push(record);
      if(record.outcome!=="success"){gateFailure=`${action.action}:warmup:${warmup}:${record.outcome}`;break outer;}
    }
    for(let index=0;index<20;index+=1){
      const record=runOne({...action,phase:"measured",ordinal:index+1});action.attempts[index]=record;
      action.executed_attempts=index+1;
      if(record.outcome!=="success"){gateFailure=`${action.action}:measured:${index+1}:${record.outcome}`;break outer;}
    }
  }
  for(const action of actions){
    const complete=action.attempts.filter(attempt=>attempt.executed);
    if(complete.length===20){const durations=complete.map(attempt=>BigInt(attempt.duration_ns)).sort((a,b)=>a<b?-1:a>b?1:0);
      action.nearest_rank_p95_ns_all_20=durations[18].toString();action.max_ns_all_20=durations[19].toString();}
    delete action.mode;delete action.status;delete action.resultVersion;delete action.sourceVersion;
  }
  return {actions,gate_failure:gateFailure,outer_watchdog:{configured_ms:budgetContract.outer_watchdog_ms,
    execution:"spawnSync timeout kills the exact budget child and retains a timeout record"}};
}
function watchdogInjectionGate() {
  const started=process.hrtime.bigint();
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:root,encoding:"utf8",
    timeout:budgetContract.outer_watchdog_ms,env:{...process.env,B2A_C2_WATCHDOG_CHILD:"1"}});
  const ended=process.hrtime.bigint();
  const record={schema_version:"b2a-c2-watchdog-injection-v1",run_id:runId,
    configured_watchdog_ms:budgetContract.outer_watchdog_ms,injection:"non-terminating-exact-child",
    child_error_code:child.error?.code??null,child_status:child.status,child_signal:child.signal,
    stdout_bytes:Buffer.byteLength(child.stdout??""),stderr_bytes:Buffer.byteLength(child.stderr??""),
    duration_ns:(ended-started).toString(),retained_outcome:"outer-watchdog-timeout",
    exact_child_terminated:child.error?.code==="ETIMEDOUT",status:child.error?.code==="ETIMEDOUT"?"passed":"failed"};
  if(record.status!=="passed")throw new Error(`watchdog injection did not time out exact child: ${JSON.stringify(record)}`);
  return record;
}
function performanceGate() {
  const rows = 2_000_000;
  const started = Date.now();
  psql(`ALTER DATABASE ${databaseName} SET max_parallel_workers_per_gather=0;
    ALTER DATABASE ${databaseName} SET max_parallel_maintenance_workers=0;
    ALTER DATABASE ${databaseName} SET maintenance_work_mem='32MB';`);
  psql(`ALTER TABLE biz_property_task_projection_head DISABLE TRIGGER USER;
    ALTER TABLE biz_property_task_projection DISABLE TRIGGER USER;
    INSERT INTO biz_property_task_projection_head
      (id,tenant_id,park_id,source_type,source_id,projection_version,content_hash,last_rebuilt_by)
    SELECT ('70000000-0000-4000-8000-'||lpad(to_hex(g),12,'0'))::uuid,
      '10000001','20000001','test_fixture_source',
      ('71000000-0000-4000-8000-'||lpad(to_hex(g),12,'0'))::uuid,1,
      repeat('0',64)::char(64),'11111111-1111-4111-8111-111111111111'::uuid
    FROM generate_series(0,999) g;
    INSERT INTO biz_property_task_projection
      (tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
       derived_assignment_id,source_type,source_id,source_version,
       business_occurrence_key,task_kind,queue_code,title,kind_label,source_label,
       priority,due_at,assignment_status,assignment_version,assignee_id,
       assignee_display,claimed_at,projection_version,content_hash,created_at,updated_at)
    SELECT '10000001','20000001',
      ('70000000-0000-4000-8000-'||lpad(to_hex(g%1000),12,'0'))::uuid,
      ('72000000-0000-4000-8000-'||lpad(to_hex(g),12,'0'))::uuid,
      encode(digest(g::text,'sha256'),'hex')::char(64),'owning',NULL,
      'test_fixture_source',
      ('71000000-0000-4000-8000-'||lpad(to_hex(g%1000),12,'0'))::uuid,
      1,'perf-'||g,'fixture','fixture.queue.'||(g%100),
      'Performance task '||g,'Fixture','Fixture source',(g%101),
      CASE WHEN g%3=0 THEN clock_timestamp()+(g%30)*interval '1 day' ELSE NULL END,
      'claimed',1,('73000000-0000-4000-8000-'||lpad(to_hex(g%100),12,'0'))::uuid,
      'Fixture actor '||(g%100),clock_timestamp(),1,repeat('0',64)::char(64),clock_timestamp(),clock_timestamp()
    FROM generate_series(0,${rows - 1}) g;
    ALTER TABLE biz_property_task_projection ENABLE TRIGGER USER;
    ALTER TABLE biz_property_task_projection_head ENABLE TRIGGER USER;
    ANALYZE biz_property_task_projection;`);
  psql("VACUUM (ANALYZE) biz_property_task_projection;");
  assertEqual(query("SELECT count(*) FROM biz_property_task_projection WHERE task_id::text LIKE '72000000-0000-4000-8000-%';"), String(rows), "2M projection fixture");
  const cases = [
    { name: "list", sql: `SELECT task_id FROM biz_property_task_projection WHERE tenant_id='10000001'
      AND park_id='20000001' AND queue_code='fixture.queue.7'
      AND assignment_status='claimed'
      ORDER BY priority DESC,due_at ASC NULLS LAST,task_id LIMIT 50`, matchSql:
      `SELECT count(*) FROM biz_property_task_projection WHERE tenant_id='10000001' AND park_id='20000001' AND queue_code='fixture.queue.7' AND assignment_status='claimed'` },
    { name: "count", sql: `SELECT count(*) FROM biz_property_task_projection WHERE tenant_id='10000001'
      AND park_id='20000001' AND queue_code='fixture.queue.7'
      AND assignment_status='claimed'`, matchSql:
      `SELECT count(*) FROM biz_property_task_projection WHERE tenant_id='10000001' AND park_id='20000001' AND queue_code='fixture.queue.7' AND assignment_status='claimed'` },
    { name: "assignee", sql: `SELECT task_id FROM biz_property_task_projection WHERE tenant_id='10000001'
      AND park_id='20000001' AND assignee_id='73000000-0000-4000-8000-000000000007'
      AND assignment_status='claimed' ORDER BY updated_at DESC,task_id LIMIT 50`, matchSql:
      `SELECT count(*) FROM biz_property_task_projection WHERE tenant_id='10000001' AND park_id='20000001' AND assignee_id='73000000-0000-4000-8000-000000000007' AND assignment_status='claimed'` },
    { name: "source", sql: `SELECT task_id FROM biz_property_task_projection WHERE tenant_id='10000001'
      AND park_id='20000001' AND source_type='test_fixture_source'
      AND source_id='71000000-0000-4000-8000-000000000007'
      ORDER BY task_kind,business_occurrence_key LIMIT 50`, matchSql:
      `SELECT count(*) FROM biz_property_task_projection WHERE tenant_id='10000001' AND park_id='20000001' AND source_type='test_fixture_source' AND source_id='71000000-0000-4000-8000-000000000007'` }
  ];
  const results = [];
  for (const { name, sql, matchSql } of cases) {
    for (let warmup = 0; warmup < 3; warmup += 1) query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql};`);
    const samples = [];
    const rawPlans = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const raw = JSON.parse(query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql};`));
      rawPlans.push(raw);
      const rootPlan = raw[0];
      const nodes = planNodes(rootPlan.Plan);
      const seqScans = nodes.filter((node) => node["Node Type"] === "Seq Scan");
      // PostgreSQL reports inclusive block totals at each plan node; summing
      // child nodes double-counts the same buffers.  The root Plan is the exact
      // query-level shared-block authority required by the signed threshold.
      const sharedBlocks = (rootPlan.Plan["Shared Hit Blocks"] ?? 0)
        + (rootPlan.Plan["Shared Read Blocks"] ?? 0);
      if (seqScans.length) throw new Error(`${name}: Seq Scan present`);
      if (sharedBlocks > 20_000) throw new Error(`${name}: shared blocks ${sharedBlocks}`);
      samples.push({ execution_ms: rootPlan["Execution Time"], shared_blocks: sharedBlocks });
    }
    const p95 = percentile95(samples.map((sample) => sample.execution_ms));
    if (p95 > 200) throw new Error(`${name}: p95 ${p95}ms exceeds 200ms`);
    const matchedRows = Number(query(matchSql));
    results.push({ name, sql, binds: {}, matched_rows: matchedRows,
      selectivity: matchedRows / rows, p95_ms: p95,
      max_shared_blocks: Math.max(...samples.map((s) => s.shared_blocks)),
      plan_node_types: [...new Set(planNodes(rawPlans.at(-1)[0].Plan).map((node) => node["Node Type"]))],
      samples, raw_explain_json: rawPlans });
  }
  return {
    rows, fixture_build_ms: Date.now() - started,
    fixture_hash: query(`SELECT encode(digest(convert_to(count(*)::text||':'||min(task_id::text)||':'||max(task_id::text),'UTF8'),'sha256'),'hex') FROM biz_property_task_projection WHERE task_id::text LIKE '72000000-0000-4000-8000-%';`),
    environment: JSON.parse(query(`SELECT json_build_object(
      'serverVersion',current_setting('server_version'),'blockSize',current_setting('block_size'),
      'sharedBuffers',current_setting('shared_buffers'),'effectiveCacheSize',current_setting('effective_cache_size'),
      'maxParallelWorkersPerGather',current_setting('max_parallel_workers_per_gather'),
      'maxParallelMaintenanceWorkers',current_setting('max_parallel_maintenance_workers'),
      'maintenanceWorkMem',current_setting('maintenance_work_mem'),
      'randomPageCost',current_setting('random_page_cost'),'effectiveIoConcurrency',current_setting('effective_io_concurrency'))::text;`)),
    thresholds: { no_seq_scan: true, p95_ms: 200, shared_blocks: 20_000 },
    results
  };
}
function behaviorGate() {
  const auditCountBefore=Number(query(`SELECT count(*) FROM biz_property_task_projection_rebuild_audit;`));
  const actor = "11111111-1111-4111-8111-111111111111";
  const source = "22222222-2222-4222-8222-222222222222";
  const receipt = "33333333-3333-4333-8333-333333333333";
  const requestHash = "a".repeat(64);
  const resultHash = "b".repeat(64);
  psql(`INSERT INTO biz_property_mutation_receipt
    (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
    VALUES ('${receipt}','10000001','20000001','${actor}','property.task.rebuild',
      '${source}','manual-1','${requestHash}');`);
  const replace = query(`WITH base AS (SELECT jsonb_build_object(
      'taskId','44444444-4444-4444-8444-444444444444','taskKey','${"c".repeat(64)}',
      'assignmentAuthority','owning','derivedAssignmentId',NULL,'sourceType','test_fixture_source',
      'sourceId','${source}','sourceVersion',1,'businessOccurrenceKey','fixture-1',
      'taskKind','fixture','queueCode','fixture.queue','title','Fixture task',
      'kindLabel','Fixture','sourceLabel','Fixture source','priority',0,'dueAt',NULL,
      'assignmentStatus','open','assignmentVersion',1,'assigneeId',NULL,
      'assigneeDisplay',NULL,'claimedAt',NULL,'startedAt',NULL,'blockedReason',NULL,
      'blockedUntil',NULL,'outcomeCode',NULL,'outcomeSourceVersion',NULL,'outcomeAt',NULL,
      'sourceDeepLink',NULL,'contentHash','${"0".repeat(64)}',
      'createdAt','2026-08-01T00:00:00.000Z','updatedAt','2026-08-01T00:00:00.000Z') row),
    hashed AS (SELECT jsonb_set(row,'{contentHash}',to_jsonb(
      public.fn_property_task_projection_row_hash_v1(row)::text)) row FROM base)
    SELECT previous_projection_version||'|'||projection_version||'|'||projected_task_count
    FROM hashed, LATERAL public.fn_property_task_projection_replace_v1(
      '10000001','20000001','test_fixture_source','${source}','${actor}','${receipt}',
      'manual-rebuild','property.task.rebuild',1,0,'${requestHash}',
      'property-task-rebuild/test_fixture_source/${source}/v1','${resultHash}',
      'manual fixture',jsonb_build_array(row));`);
  assertEqual(replace, "0|1|1", "manual replace");
  assertEqual(query(`SELECT count(*)||'|'||min(projection_version)||'|'||
    (SELECT count(*) FROM biz_property_task_projection_rebuild_audit WHERE source_id='${source}')
    FROM biz_property_task_projection WHERE source_id='${source}';`), "1|1|1", "projection generation and audit");
  const forged = psql(`SELECT * FROM public.fn_property_task_projection_replace_v1(
    '10000001','20000001','test_fixture_source','${source}',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${receipt}','manual-rebuild',
    'property.task.rebuild',2,1,'${requestHash}',
    'property-task-rebuild/test_fixture_source/${source}/v2','${resultHash}',
    'manual fixture','[]'::jsonb);`, { allowFailure: true });
  if (forged.status === 0 || !forged.stderr.includes("property-task-projection-receipt-conflict")) {
    throw new Error("forged actor was not rejected");
  }
  const immutable = psql(`UPDATE biz_property_task_projection_rebuild_audit SET reason='x';`,
    { allowFailure: true });
  if (immutable.status === 0 || !immutable.stderr.includes("property-task-projection-audit-immutable")) {
    throw new Error("replacement audit was mutable");
  }
  const behaviorResults = [{ case: "manual-rebuild", status: "passed" }];
  const insertReceipt = (id, action, target, actorId = actor, hash = sha256(id)) => {
    psql(`INSERT INTO biz_property_mutation_receipt
      (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
      VALUES ('${id}','10000001','20000001','${actorId}','${action}',
        '${target}','fixture-${id}','${hash}');`);
    return hash;
  };
  const invoke = ({ sourceId, taskId, receiptId, action, mode = "authority-sync",
    resultVersion = 2, expected = 0, status = "open", sourceVersion = 1,
    derivedAssignmentId = null, assigneeId = null, timestamp = "2026-08-01T00:00:00.000Z",
    allowFailure = false }) => {
    const terminal = action.endsWith(".closed") ? "closed" : action.endsWith(".cancelled") ? "cancelled" : null;
    const row = {
      taskId, taskKey: sha256(taskId), assignmentAuthority: derivedAssignmentId ? "derived" : "owning",
      derivedAssignmentId, sourceType: "test_fixture_source", sourceId, sourceVersion,
      businessOccurrenceKey: `fixture-${taskId}`, taskKind: "fixture", queueCode: "fixture.queue",
      title: "Fixture task", kindLabel: "Fixture", sourceLabel: "Fixture source", priority: 0,
      dueAt: null, assignmentStatus: terminal ?? status, assignmentVersion: resultVersion,
      assigneeId, assigneeDisplay: assigneeId ? "Fixture actor" : null,
      claimedAt: assigneeId ? timestamp : null,
      startedAt: ["in_progress", "blocked"].includes(status) ? timestamp : null,
      blockedReason: status === "blocked" ? "fixture blocked" : null, blockedUntil: null,
      outcomeCode: terminal ? "completed" : null,
      outcomeSourceVersion: terminal ? sourceVersion : null,
      outcomeAt: terminal ? timestamp : null, sourceDeepLink: null,
      contentHash: "0".repeat(64), createdAt: timestamp, updatedAt: timestamp
    };
    const request = sha256(receiptId);
    const target = terminal ? sourceId : taskId;
    insertReceipt(receiptId, action, target, actor, request);
    const resultRef = terminal
      ? `property-task-source-terminal/test_fixture_source/${sourceId}/${terminal}/v${resultVersion}`
      : `property-task/${taskId}/v${resultVersion}`;
    return psql(`WITH input AS (SELECT '${JSON.stringify(row)}'::jsonb row),
      hashed AS (SELECT jsonb_set(row,'{contentHash}',to_jsonb(
        public.fn_property_task_projection_row_hash_v1(row)::text)) row FROM input)
      SELECT * FROM hashed,LATERAL public.fn_property_task_projection_replace_v1(
        '10000001','20000001','test_fixture_source','${sourceId}','${actor}','${receiptId}',
        '${mode}','${action}',${resultVersion},${expected},'${request}','${resultRef}',
        '${sha256(resultRef)}','authority-sync:${action}',jsonb_build_array(row));`, { allowFailure });
  };
  const commands = [
    ["claim", "claimed", "11111111-1111-4111-8111-111111111111"],
    ["start", "in_progress", "11111111-1111-4111-8111-111111111111"],
    ["block", "blocked", "11111111-1111-4111-8111-111111111111"],
    ["unblock", "in_progress", "11111111-1111-4111-8111-111111111111"],
    ["release", "open", null]
  ];
  commands.forEach(([name, rowStatus, rowAssignee], index) => {
    const hex = (index + 1).toString(16).padStart(12, "0");
    const outcome = invoke({
      sourceId: `81000000-0000-4000-8000-${hex}`,
      taskId: `82000000-0000-4000-8000-${hex}`,
      receiptId: `83000000-0000-4000-8000-${hex}`,
      action: `property.task.${name}`, status: rowStatus, assigneeId: rowAssignee
    });
    if (outcome.status !== 0) throw new Error(`authority-sync ${name} failed: ${outcome.stderr}`);
    behaviorResults.push({ case: `authority-sync-${name}`, status: "passed" });
  });
  ["closed", "cancelled"].forEach((terminal, index) => {
    const hex = (index + 20).toString(16).padStart(12, "0");
    const outcome = invoke({
      sourceId: `84000000-0000-4000-8000-${hex}`,
      taskId: `85000000-0000-4000-8000-${hex}`,
      receiptId: `86000000-0000-4000-8000-${hex}`,
      action: `property.task.source-terminal.${terminal}`, resultVersion: 3, sourceVersion: 3
    });
    if (outcome.status !== 0) throw new Error(`terminal ${terminal} failed: ${outcome.stderr}`);
    behaviorResults.push({ case: `source-terminal-${terminal}`, status: "passed" });
  });
  assertEqual(query(`SELECT (count(*)-${auditCountBefore})||'|'||sum(assignment_mutation_count)
    FROM biz_property_task_projection_rebuild_audit;`), "8|0", "eight replacements and zero assignment mutation");
  const malformedCases = [
    ["uppercase-derived-uuid", { derivedAssignmentId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["uppercase-assignee-uuid", { assigneeId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["24-hour-alias", { timestamp: "2026-08-01T24:00:00.000Z" }],
    ["leap-second-alias", { timestamp: "2026-08-01T23:59:60.000Z" }],
    ["calendar-alias", { timestamp: "2026-02-31T00:00:00.000Z" }]
  ];
  malformedCases.forEach(([name, overrides], index) => {
    const hex = (index + 40).toString(16).padStart(12, "0");
    const outcome = invoke({
      sourceId: `87000000-0000-4000-8000-${hex}`,
      taskId: `88000000-0000-4000-8000-${hex}`,
      receiptId: `89000000-0000-4000-8000-${hex}`,
      action: "property.task.claim", status: "claimed",
      assigneeId: "11111111-1111-4111-8111-111111111111", allowFailure: true,
      ...overrides
    });
    if (outcome.status === 0 || !outcome.stderr.includes("property-task-projection-row-invalid")) {
      throw new Error(`${name} was not rejected: ${outcome.stderr}`);
    }
    behaviorResults.push({ case: name, status: "rejected-as-required" });
  });
  const batchSource = "90000000-0000-4000-8000-000000000001";
  const batchReceipt = "90000000-0000-4000-8000-000000000002";
  const batchRequest = insertReceipt(batchReceipt, "property.task.rebuild", batchSource);
  const batchRows = Array.from({ length: 200 }, (_, index) => ({
    taskId: `91000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    taskKey: sha256(`batch-${index}`), assignmentAuthority: "owning", derivedAssignmentId: null,
    sourceType: "test_fixture_source", sourceId: batchSource, sourceVersion: 1,
    businessOccurrenceKey: `batch-${index}`, taskKind: "fixture", queueCode: "fixture.queue",
    title: `Batch task ${index}`, kindLabel: "Fixture", sourceLabel: "Fixture source", priority: 0,
    dueAt: null, assignmentStatus: "open", assignmentVersion: 1, assigneeId: null,
    assigneeDisplay: null, claimedAt: null, startedAt: null, blockedReason: null,
    blockedUntil: null, outcomeCode: null, outcomeSourceVersion: null, outcomeAt: null,
    sourceDeepLink: null, contentHash: "0".repeat(64),
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z"
  }));
  const batchRef = `property-task-rebuild/test_fixture_source/${batchSource}/v1`;
  const batchStarted = Date.now();
  const batchResult = psql(`WITH input AS (SELECT '${JSON.stringify(batchRows)}'::jsonb rows),
    hashed AS (SELECT jsonb_agg(jsonb_set(value,'{contentHash}',to_jsonb(
      public.fn_property_task_projection_row_hash_v1(value)::text)) ORDER BY value->>'taskId') rows
      FROM input,jsonb_array_elements(rows) e(value))
    SELECT * FROM hashed,LATERAL public.fn_property_task_projection_replace_v1(
      '10000001','20000001','test_fixture_source','${batchSource}','${actor}','${batchReceipt}',
      'manual-rebuild','property.task.rebuild',1,0,'${batchRequest}','${batchRef}',
      '${sha256(batchRef)}','manual batch budget',rows);`);
  const batchTransactionMs = Date.now() - batchStarted;
  if (batchResult.status !== 0 || batchTransactionMs > 5_000) {
    throw new Error(`200-row replacement budget failed: status=${batchResult.status}, ms=${batchTransactionMs}, stderr=${batchResult.stderr}`);
  }
  assertEqual(query(`SELECT count(*) FROM biz_property_task_projection WHERE source_id='${batchSource}';`), "200", "200-row replacement batch");
  behaviorResults.push({ case: "replacement-batch-budget", status: "passed",
    batch_rows: 200, transaction_ms: batchTransactionMs, threshold_ms: 5_000 });
  return behaviorResults;
}

function functionContractMatrixGate() {
  const actor="11111111-1111-4111-8111-111111111111";
  const baseRow=({sourceId,taskId,action,resultVersion})=>{
    const terminal=action.endsWith(".closed")?"closed":action.endsWith(".cancelled")?"cancelled":null;
    const status=terminal??({claim:"claimed",start:"in_progress",block:"blocked",unblock:"in_progress",release:"open"}[action.split(".").at(-1)]??"open");
    const active=["claimed","in_progress","blocked"].includes(status);
    return {taskId,taskKey:sha256(`matrix-task:${taskId}`),assignmentAuthority:"owning",derivedAssignmentId:null,
      sourceType:"test_fixture_source",sourceId,sourceVersion:terminal?resultVersion:1,
      businessOccurrenceKey:`matrix-${taskId}`,taskKind:"fixture",queueCode:"fixture.queue",title:"Matrix task",
      kindLabel:"Fixture",sourceLabel:"Fixture source",priority:0,dueAt:null,assignmentStatus:status,
      assignmentVersion:resultVersion,assigneeId:active?actor:null,assigneeDisplay:active?"Fixture actor":null,
      claimedAt:active?"2026-08-01T00:00:00.000Z":null,
      startedAt:["in_progress","blocked"].includes(status)?"2026-08-01T00:00:00.000Z":null,
      blockedReason:status==="blocked"?"matrix blocked":null,blockedUntil:null,
      outcomeCode:terminal?"completed":null,outcomeSourceVersion:terminal?resultVersion:null,
      outcomeAt:terminal?"2026-08-01T00:00:00.000Z":null,sourceDeepLink:null,contentHash:"0".repeat(64),
      createdAt:"2026-08-01T00:00:00.000Z",updatedAt:"2026-08-01T00:00:00.000Z"};
  };
  let ordinal=0;
  const runNegative=(name,configure,expectedSqlstate,marker)=>{
    ordinal+=1;const hex=ordinal.toString(16).padStart(12,"0");
    const cfg={sourceId:`b1000000-0000-4000-8000-${hex}`,taskId:`b2000000-0000-4000-8000-${hex}`,
      receiptId:`b3000000-0000-4000-8000-${hex}`,action:"property.task.rebuild",mode:"manual-rebuild",
      resultVersion:1,expectedVersion:0,actorId:actor,receiptActor:actor,receiptStatus:"started",
      callRequestHash:sha256(`matrix-request:${name}`),receiptRequestHash:null,receiptAction:null,receiptTarget:null,receiptResultRef:null,receiptResultHash:null,
      reason:"matrix manual",rows:null,rawRowsSql:null,skipReceipt:false,resultRef:null};
    configure(cfg);cfg.receiptRequestHash??=sha256(`matrix-request:${name}`);cfg.receiptAction??=cfg.action;
    cfg.receiptTarget??=(cfg.action==="property.task.rebuild"||cfg.action.includes("source-terminal")?cfg.sourceId:cfg.taskId);
    const terminal=cfg.action.endsWith(".closed")?"closed":cfg.action.endsWith(".cancelled")?"cancelled":null;
    cfg.resultRef??=(cfg.mode==="manual-rebuild"?`property-task-rebuild/test_fixture_source/${cfg.sourceId}/v${cfg.resultVersion}`:
      terminal?`property-task-source-terminal/test_fixture_source/${cfg.sourceId}/${terminal}/v${cfg.resultVersion}`:
      `property-task/${cfg.taskId}/v${cfg.resultVersion}`);
    cfg.rows??=[baseRow(cfg)];
    const resultHash=sha256(cfg.resultRef),before=scopedSnapshot({sources:[cfg.sourceId],receipts:[cfg.receiptId]});
    const receiptInsert=cfg.skipReceipt?"":`INSERT INTO biz_property_mutation_receipt
      (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash,receipt_status,result_ref,result_hash,completed_at)
      VALUES('${cfg.receiptId}','10000001','20000001','${cfg.receiptActor}','${cfg.receiptAction}',
        '${cfg.receiptTarget}','matrix-${name}','${cfg.receiptRequestHash}','${cfg.receiptStatus}',
        ${sqlLiteral(cfg.receiptResultRef)},${sqlLiteral(cfg.receiptResultHash)},
        ${cfg.receiptStatus==="completed"?"clock_timestamp()":"NULL"});`;
    const rowsCte=cfg.rawRowsSql?`input AS (SELECT ${cfg.rawRowsSql} rows),prepared AS (SELECT rows FROM input)`:
      `input AS (SELECT '${JSON.stringify(cfg.rows)}'::jsonb rows),prepared AS
       (SELECT jsonb_agg(jsonb_set(value,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(value)::text))
          ORDER BY ordinality) rows FROM input,jsonb_array_elements(rows) WITH ORDINALITY e(value,ordinality))`;
    const attempted=psql(`BEGIN;${receiptInsert}WITH ${rowsCte}
      SELECT * FROM prepared,LATERAL public.fn_property_task_projection_replace_v1(
       '10000001','20000001','test_fixture_source','${cfg.sourceId}','${cfg.actorId}','${cfg.receiptId}',
       '${cfg.mode}','${cfg.action}',${cfg.resultVersion},${cfg.expectedVersion},'${cfg.callRequestHash}',
       '${cfg.resultRef}','${resultHash}','${cfg.reason}',rows);COMMIT;`,{allowFailure:true});
    const after=scopedSnapshot({sources:[cfg.sourceId],receipts:[cfg.receiptId]}),sqlstate=observedSqlstate(attempted);
    if(attempted.status===0||sqlstate!==expectedSqlstate||!attempted.stderr.includes(marker)||
      before.snapshot_value_sha256!==after.snapshot_value_sha256)
      throw new Error(`${name}: matrix mismatch ${JSON.stringify({sqlstate,marker,stderr:attempted.stderr})}`);
    return {case:name,expected_sqlstate:expectedSqlstate,observed_sqlstate:sqlstate,marker,
      constraint_name:attempted.stderr.match(/CONSTRAINT NAME:\s+([^\n]+)/)?.[1]??null,
      attempted_row_count:1,persisted_delta:0,before_sha256:before.snapshot_value_sha256,
      after_sha256:after.snapshot_value_sha256,status:"rejected-as-required"};
  };
  const definitions=[];
  const add=(name,configure,state,marker)=>definitions.push(runNegative(name,configure,state,marker));
  add("manual-target-forged",c=>c.receiptTarget="b9000000-0000-4000-8000-000000000001","22023","property-task-projection-result-ref-conflict");
  add("manual-result-version-forged",c=>c.resultVersion=2,"22023","property-task-projection-result-ref-conflict");
  add("manual-result-ref-forged",c=>c.resultRef="property-task-rebuild/test_fixture_source/b9000000-0000-4000-8000-000000000002/v1","22023","property-task-projection-result-ref-conflict");
  add("mode-action-forged",c=>{c.mode="authority-sync";c.reason="authority-sync:property.task.rebuild";},"22023","property-task-projection-invalid-input");
  add("command-reverse-manual-mode-action",c=>{c.action="property.task.claim";c.mode="manual-rebuild";c.resultVersion=2;},"22023","property-task-projection-invalid-input");
  add("terminal-reverse-manual-mode-action",c=>{c.action="property.task.source-terminal.closed";c.mode="manual-rebuild";c.resultVersion=3;},"22023","property-task-projection-invalid-input");
  add("authority-reason-forged",c=>{c.action="property.task.claim";c.mode="authority-sync";c.resultVersion=2;c.reason="wrong";},"22023","property-task-projection-invalid-input");
  for(const command of ["claim","start","block","unblock","release"]){
    add(`${command}-target-forged`,c=>{c.action=`property.task.${command}`;c.mode="authority-sync";c.resultVersion=2;
      c.reason=`authority-sync:property.task.${command}`;c.receiptTarget="b9000000-0000-4000-8000-000000000003";},"22023","property-task-projection-result-ref-conflict");
    add(`${command}-assignment-version-forged`,c=>{c.action=`property.task.${command}`;c.mode="authority-sync";c.resultVersion=2;
      c.reason=`authority-sync:property.task.${command}`;c.rows=[baseRow(c)];c.rows[0].assignmentVersion=3;},"22023","property-task-projection-result-ref-conflict");
  }
  for(const terminal of ["closed","cancelled"]){
    add(`${terminal}-target-forged`,c=>{c.action=`property.task.source-terminal.${terminal}`;c.mode="authority-sync";c.resultVersion=3;
      c.reason=`authority-sync:${c.action}`;c.receiptTarget="b9000000-0000-4000-8000-000000000004";},"22023","property-task-projection-result-ref-conflict");
    add(`${terminal}-row-status-forged`,c=>{c.action=`property.task.source-terminal.${terminal}`;c.mode="authority-sync";c.resultVersion=3;
      c.reason=`authority-sync:${c.action}`;c.rows=[baseRow(c)];c.rows[0].assignmentStatus="open";},"22023","property-task-projection-result-ref-conflict");
    add(`${terminal}-source-version-forged`,c=>{c.action=`property.task.source-terminal.${terminal}`;c.mode="authority-sync";c.resultVersion=3;
      c.reason=`authority-sync:${c.action}`;c.rows=[baseRow(c)];c.rows[0].sourceVersion=2;},"22023","property-task-projection-result-ref-conflict");
    add(`${terminal}-result-version-forged`,c=>{c.action=`property.task.source-terminal.${terminal}`;c.mode="authority-sync";c.resultVersion=4;
      c.resultRef=`property-task-source-terminal/test_fixture_source/${c.sourceId}/${terminal}/v3`;c.reason=`authority-sync:${c.action}`;},"22023","property-task-projection-result-ref-conflict");
    add(`${terminal}-result-ref-forged`,c=>{c.action=`property.task.source-terminal.${terminal}`;c.mode="authority-sync";c.resultVersion=3;
      c.resultRef=`property-task-source-terminal/test_fixture_source/${c.sourceId}/${terminal}/v99`;c.reason=`authority-sync:${c.action}`;},"22023","property-task-projection-result-ref-conflict");
  }
  add("receipt-absent",c=>c.skipReceipt=true,"40001","property-task-projection-receipt-conflict");
  add("receipt-completed",c=>{c.receiptStatus="completed";c.receiptResultRef="existing";c.receiptResultHash="a".repeat(64);},"40001","property-task-projection-receipt-conflict");
  add("receipt-failed",c=>c.receiptStatus="failed","40001","property-task-projection-receipt-conflict");
  add("receipt-request-hash",c=>c.receiptRequestHash="a".repeat(64),"40001","property-task-projection-receipt-conflict");
  add("receipt-started-result-present",c=>{c.receiptResultRef="existing";c.receiptResultHash="a".repeat(64);},"40001","property-task-projection-receipt-conflict");
  add("receipt-actor-forged",c=>c.receiptActor="22222222-2222-4222-8222-222222222222","40001","property-task-projection-receipt-conflict");
  add("receipt-action-forged",c=>c.receiptAction="property.task.claim","22023","property-task-projection-action-conflict");
  add("rows-null",c=>c.rawRowsSql="NULL::jsonb","22023","property-task-projection-invalid-input");
  add("rows-nonarray",c=>c.rawRowsSql="'{}'::jsonb","22023","property-task-projection-invalid-input");
  add("rows-nonobject",c=>c.rawRowsSql="'[1]'::jsonb","22023","property-task-projection-row-shape");
  add("rows-missing-key",c=>{c.rows=[baseRow(c)];delete c.rows[0].title;c.rawRowsSql=`'${JSON.stringify(c.rows)}'::jsonb`;},"22023","property-task-projection-row-shape");
  add("rows-extra-key",c=>{c.rows=[baseRow(c)];c.rows[0].extra="x";c.rawRowsSql=`'${JSON.stringify(c.rows)}'::jsonb`;},"22023","property-task-projection-row-shape");
  add("rows-type",c=>{c.rows=[baseRow(c)];c.rows[0].priority="0";c.rawRowsSql=`'${JSON.stringify(c.rows)}'::jsonb`;},"22023","property-task-projection-row-invalid");
  add("rows-cast",c=>{c.rows=[baseRow(c)];c.rows[0].taskId="not-a-uuid";c.rawRowsSql=`'${JSON.stringify(c.rows)}'::jsonb`;},"22023","property-task-projection-row-invalid");
  add("rows-source",c=>{c.rows=[baseRow(c)];c.rows[0].sourceId="b9000000-0000-4000-8000-000000000005";},"22023","property-task-projection-row-invalid");
  add("rows-content-hash",c=>{c.rows=[baseRow(c)];c.rows[0].contentHash="a".repeat(64);c.rawRowsSql=`'${JSON.stringify(c.rows)}'::jsonb`;},"22023","property-task-projection-row-invalid");
  add("rows-order",c=>{const first=baseRow(c),second={...first,taskId:"b0000000-0000-4000-8000-000000000001",taskKey:"a".repeat(64),businessOccurrenceKey:"second"};c.rows=[first,second];},"22023","property-task-projection-row-order");
  add("rows-duplicate",c=>{const first=baseRow(c);c.rows=[first,{...first}];},"22023","property-task-projection-row-order");
  add("head-absent-expected-nonzero",c=>c.expectedVersion=1,"40001","property-task-projection-version-conflict");
  return {schema_version:"b2a-c2-function-contract-matrix-v11",cases:definitions,
    declared_case_count:definitions.length,executed_case_count:definitions.length,
    passed_case_count:definitions.length,failed_case_count:0,status:"passed"};
}
function headVersionConcurrencyGate() {
  const actor="11111111-1111-4111-8111-111111111111";
  const source="c1000000-0000-4000-8000-000000000001",r1="c2000000-0000-4000-8000-000000000001",
    r2="c2000000-0000-4000-8000-000000000002",r3="c2000000-0000-4000-8000-000000000003";
  const apply=(receipt,version,expected)=>psql(`BEGIN;INSERT INTO biz_property_mutation_receipt
    (id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
    VALUES('${receipt}','10000001','20000001','${actor}','property.task.rebuild','${source}',
      'head-sequence-${version}','${sha256(`head-sequence-${version}`)}');
    SELECT * FROM public.fn_property_task_projection_replace_v1('10000001','20000001','test_fixture_source',
      '${source}','${actor}','${receipt}','manual-rebuild','property.task.rebuild',${version},${expected},
      '${sha256(`head-sequence-${version}`)}','property-task-rebuild/test_fixture_source/${source}/v${version}',
      '${sha256(`head-result-${version}`)}','head sequence','[]'::jsonb);COMMIT;`,{allowFailure:true});
  for(const [receipt,version,expected] of [[r1,1,0],[r2,2,1]]){const result=apply(receipt,version,expected);
    if(result.status!==0)throw new Error(`head sequence v${version}: ${result.stderr}`);}
  assertEqual(query(`SELECT projection_version||'|'||(SELECT count(*) FROM biz_property_task_projection_rebuild_audit
    WHERE source_id='${source}') FROM biz_property_task_projection_head WHERE source_id='${source}';`),"2|2","head second +1");
  const before=scopedSnapshot({sources:[source],receipts:[r3]}),stale=apply(r3,3,0),after=scopedSnapshot({sources:[source],receipts:[r3]});
  if(stale.status===0||observedSqlstate(stale)!=="40001"||!stale.stderr.includes("property-task-projection-version-conflict")||
    before.snapshot_value_sha256!==after.snapshot_value_sha256)throw new Error(`head stale conflict: ${stale.stderr}`);

  const concurrentSource="c1000000-0000-4000-8000-000000000010",barrierKey=19420260801;
  const apps=[`b2a-c2-head-race-a-${runId}`,`b2a-c2-head-race-b-${runId}`];
  const receipts=["c2000000-0000-4000-8000-000000000010","c2000000-0000-4000-8000-000000000011"];
  psql(`CREATE TABLE b2a_c2_head_race_observation(worker text PRIMARY KEY,sqlstate text NOT NULL,marker text NOT NULL);`);
  const holderApp=`b2a-c2-head-race-holder-${runId}`;
  docker(["exec","-d",containerId,"psql","-X","-v","ON_ERROR_STOP=1","-U",postgresUser,"-d",databaseName,"-c",
    `SET application_name='${holderApp}';SELECT pg_advisory_lock(${barrierKey});SELECT pg_sleep(30);`]);
  const holder=pollQuery(`SELECT coalesce((SELECT pid::text FROM pg_stat_activity WHERE application_name='${holderApp}'
    AND wait_event='PgSleep'),'');`,value=>/^\d+$/.test(value),{label:"head race holder latch"});
  apps.forEach((app,index)=>docker(["exec","-d",containerId,"psql","-X","-v","ON_ERROR_STOP=1","-U",postgresUser,"-d",databaseName,"-c",
    `BEGIN;SET application_name='${app}';SELECT pg_advisory_xact_lock_shared(${barrierKey});
     DO \$race\$ DECLARE state text:='00000';message text:='success';BEGIN
       BEGIN
         INSERT INTO biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
         VALUES('${receipts[index]}','10000001','20000001','${actor}','property.task.rebuild','${concurrentSource}',
           'head-race-${index}','${sha256(`head-race-${index}`)}');
         PERFORM * FROM public.fn_property_task_projection_replace_v1('10000001','20000001','test_fixture_source',
           '${concurrentSource}','${actor}','${receipts[index]}','manual-rebuild','property.task.rebuild',1,0,
           '${sha256(`head-race-${index}`)}','property-task-rebuild/test_fixture_source/${concurrentSource}/v1',
           '${sha256(`head-race-result-${index}`)}','head race','[]'::jsonb);
       EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;END;
       INSERT INTO b2a_c2_head_race_observation(worker,sqlstate,marker)VALUES('${app}',state,message);
     END \$race\$;COMMIT;` ]));
  const blocked=pollQuery(`SELECT count(*)::text FROM pg_stat_activity WHERE application_name IN ('${apps.join("','")}')
    AND wait_event_type='Lock' AND wait_event='advisory';`,value=>value==="2",{label:"two head race waiters latched"});
  psql(`SELECT pg_terminate_backend(${holder.value});`);
  const observed=pollQuery(`SELECT count(*)::text FROM b2a_c2_head_race_observation;`,value=>value==="2",{timeoutMs:10_000,label:"head race outcomes"});
  const outcomes=JSON.parse(query(`SELECT json_agg(row_to_json(x) ORDER BY worker)::text FROM
    (SELECT worker,sqlstate,marker FROM b2a_c2_head_race_observation)x;`));
  if(outcomes.filter(row=>row.sqlstate==="00000").length!==1||outcomes.filter(row=>row.sqlstate!=="00000").length!==1)
    throw new Error(`head race winner cardinality: ${JSON.stringify(outcomes)}`);
  const rawLoser=outcomes.find(row=>row.sqlstate!=="00000");
  if(rawLoser?.sqlstate!=="23505")throw new Error(`head race raw C2 loser must remain 23505: ${JSON.stringify(outcomes)}`);
  assertEqual(query(`SELECT (SELECT count(*) FROM biz_property_task_projection_head WHERE source_id='${concurrentSource}')||'|'||
    (SELECT count(*) FROM biz_property_task_projection_rebuild_audit WHERE source_id='${concurrentSource}')||'|'||
    (SELECT count(*) FROM biz_property_task_projection WHERE source_id='${concurrentSource}')||'|'||
    (SELECT count(*) FROM biz_property_mutation_receipt WHERE target_id='${concurrentSource}');`),"1|1|0|1","head race no orphan");
  return {schema_version:"b2a-c2-head-version-concurrency-v11",sequential:{versions:[1,2],audit_count:2,
    stale_expected_sqlstate:"40001",stale_observed_sqlstate:observedSqlstate(stale),rollback_exact:true},
    concurrent_absent:{holder_latch:holder.timeline,waiter_latch:blocked.timeline,outcome_latch:observed.timeline,
      outcomes,winner_count:1,loser_count:1,head_count:1,audit_count:1,projection_count:0,receipt_count:1,
      c2_raw_conflict_boundary:{raw_loser_sqlstate:"23505",normalization_owner:"pending_C4",
        required_adapter_behavior:["read-committed-winner","normalize-to-exact-replay-or-version-conflict","never-return-http-500"],
        evidence_requirement:"real adapter concurrency test must prove winner reread and normalized API outcome before C4 admission"}},status:"passed"};
}

let status = "failed";
let error = null;
let catalogSha256 = null;
let performance = null;
let functions = null;
let securityControls = null;
let migration190 = null;
let migration190Before = null;
let behaviorResults = null;
const fakeLifecycleResults = fakeLifecycleGate();
let driftResults = null;
let rawCatalog = null;
let budgetActions = null;
let budgetExecution = null;
let historyBefore = null;
let historyAfter = null;
let historyReservationNegative = null;
let historyReservationPreflight = null;
let reservationPreflight = null;
let controlStateResults = null;
let faultResults = null;
let ambiguousResults = null;
let acquireModeMatrix = null;
let receiptAcquireConcurrency = null;
let contractMatrix = null;
let functionContractMatrix = null;
let headVersionConcurrency = null;
let databaseEnvironment = null;
let fixture = null;
let watchdogInjection = null;
let cleanupResult = { container_absent: false, anonymous_volume_absent: false, errors: [] };
try {
  reservationPreflight={start:reservationPreflightGate("start")};
  watchdogInjection = targetedV11?{schema_version:"b2a-c2-watchdog-injection-v1",status:"skipped-targeted-diagnostic"}:
    watchdogInjectionGate();
  start();
  bootstrap();
  migration190Before=migrationFileAndHistoryEvidence("000190_property_b_migration_compatibility_control.sql");
  assertEqual(migration190Before.file_sha256,"da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a",
    "000190 signed raw sha before 000194");
  for(const store of ["primary","standard"]){const rows=migration190Before.history[store];
    if(rows.length!==1||rows[0].checksum!==migration190Before.file_sha256||rows[0].status!=="succeeded")
      throw new Error(`000190 ${store} prehistory mismatch: ${JSON.stringify(rows)}`);}
  historyBefore = migrationHistoryEvidence();
  historyReservationNegative=historyReservationNegativeGate();
  historyReservationPreflight=historyReservationPreflightGate("before-194-apply");
  reservationPreflight.before_194=reservationPreflightGate("before-194-apply");
  applyFile(migration194);
  recordHistory(migration194);
  catalogGate();
  catalogSha256 = catalogFingerprint();
  driftResults = driftRejectionGate();
  controlStateResults = controlStateGate();
  faultResults = faultInjectionGate();
  ambiguousResults = ambiguousCommitGate();
  acquireModeMatrix = acquireModeMatrixGate();
  receiptAcquireConcurrency = receiptAcquireConcurrencyGate();
  performance = targetedV11?{schema_version:"b2a-c2-performance-v11",status:"skipped-targeted-diagnostic"}:performanceGate();
  budgetExecution = targetedV11?{actions:[],gate_failure:null,outer_watchdog:{status:"skipped-targeted-diagnostic"}}:
    budgetActionGate();
  budgetActions = budgetExecution.actions;
  if(budgetExecution.gate_failure) throw new Error(`budget-action-gate:${budgetExecution.gate_failure}`);
  behaviorResults = behaviorGate();
  functionContractMatrix = functionContractMatrixGate();
  headVersionConcurrency = headVersionConcurrencyGate();
  contractMatrix = auditConstraintMatrixGate();
  const before = query(`SELECT contract_hash||'|'||version||'|'||disabled_reason||'|'||update_time
    FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key;`);
  applyFile(migration194);
  const after = query(`SELECT contract_hash||'|'||version||'|'||disabled_reason||'|'||update_time
    FROM sys_property_runtime_control ORDER BY tenant_id,park_id,control_key;`);
  assertEqual(after, before, "rerun control no-op");
  historyAfter = migrationHistoryEvidence();
  functions = functionDefinitionEvidence();
  rawCatalog = rawCatalogEvidence();
  securityControls = securityControlEvidence();
  databaseEnvironment = databaseEnvironmentEvidence();
  fixture = fixtureEvidence();
  const migration190After=migrationFileAndHistoryEvidence("000190_property_b_migration_compatibility_control.sql");
  if(JSON.stringify(migration190After)!==JSON.stringify(migration190Before))
    throw new Error(`000190 file/history changed across 000194: ${JSON.stringify({migration190Before,migration190After})}`);
  migration190={before:migration190Before,after:migration190After,expected_raw_sha256:
    "da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a",unchanged:true};
  transitionLifecycle(productionLifecycle,"test-succeeded");
  status = "passed";
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
  if(productionLifecycle.phase==="initialized")transitionLifecycle(productionLifecycle,"create-failed",{status:1,error});
  else if(productionLifecycle.phase==="created")transitionLifecycle(productionLifecycle,"test-failed",{status:1,error});
} finally {
  cleanupResult = cleanup();
  cleanupResult = {...cleanupResult,
    volume_absent:cleanupResult.anonymous_volume_absent,temp_files_absent:true,
    volume:{name:volumeName,absent:cleanupResult.anonymous_volume_absent},
    temp:{exact_targets:[],absent:true},
    exact_targets:[
      {type:"container",name:containerName,id:containerId,status:cleanupResult.container_absent?"absent":"present"},
      {type:"volume",name:volumeName,id:volumeName,status:cleanupResult.anonymous_volume_absent?"absent":"present"}],
    lifecycle_machine:productionLifecycle};
  if (!cleanupResult.container_absent || !cleanupResult.anonymous_volume_absent || cleanupResult.errors.length) {
    status = "failed";
    error ??= `cleanup failed: ${JSON.stringify(cleanupResult)}`;
  }
}
const migrationBytes = readFileSync(resolve(migrations, migration194));
const reservedDependency = reservedDependencyEvidence();
const evidence = {
  schemaVersion: "property-remediation-b2a-c2-schema-gate-v12",
  schema_version: "property-remediation-b2a-c2-schema-gate-v12",
  runId,
  startedAt: gateStartedAt,
  finishedAt: new Date().toISOString(),
  baseCommit: gitRead(["rev-parse", "HEAD"]),
  status, run_id: runId, chain: exactChain,
  run_scope:targetedV11?"targeted-v12-diagnostic":"full-v12-candidate",
  contract: {
    addendum_raw_sha256: budgetContract.candidate_raw_sha256,
    addendum_final_signoff_raw_sha256:budgetContract.addendum_final_signoff_raw_sha256,
    canonical_budget_digest: budgetContract.canonical_budget_digest,
    ...budgetContract,
    transaction_hard_limit_ns: budgetContract.transaction_hard_limit_ns.toString(),
    input_raw_sha256: {
      c1_final_signoff: "1856d7a5903fc5022a6904e6e21c92be16056a84ef2250846b31fc7baa775056",
      correction_plan: "b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da",
      b_contract: "81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3",
      endpoint_manifest: "6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd",
      old_b_schema_expand: "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874"
    },
    receipt_identity_contract: {
      grammar:"b2a-c2-receipt-identity-v1",
      ordered_fields:["receipt_id","tenant_id","park_id","actor_id","action_id","target_id","client_key","request_hash"],
      stored_identity_fields:["id","tenant_id","park_id","actor_id","action_id","target_id","client_key","request_hash"],
      signed_unique_fields:["tenant_id","park_id","actor_id","action_id","target_id","client_key"],
      semantic_target_type:{stored:false,derived_from:"action_id",mapping:{
        "property.task.rebuild":"source","property.task.source-terminal.*":"source","property.task.*":"task"},
        statement:"semantic_target_type is derived evidence only and is not a physical mutation-receipt identity column"}
    },
    worst_path_equivalence:{mapping_status:"candidate-unsigned-not-consumed",all_eight_actions_measured_as_self:true,
      candidate_path:".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-worst-path-dominance-equivalence-mapping-candidate.md",
      detached_mapping_path:".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-worst-path-dominance-equivalence-mapping-v1.json",
      detached_mapping_raw_sha256:"9533d059976416486b85996b66c2c8670b39ced7e0521b9c758b6e7cabe4ceeb",
      production_full_action_deadline_status:"pending_C4"}
  },
  migration_sha256: sha256(migrationBytes),
  runner: { raw_sha256:sha256(readFileSync(fileURLToPath(import.meta.url))) },
  migration: { raw_sha256:sha256(migrationBytes),filename:migration194 },
  function: { definition_sha256:functions?.rows?.find(row=>row.identity.startsWith("fn_property_task_projection_replace_v1("))?.definition_sha256??null,
    expected_definition_sha256:"50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47",rows:functions?.rows??[] },
  fixture,
  catalog_sha256: catalogSha256,
  old_b_schema_expand_sha256: "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874",
  function_definitions: functions,
  raw_catalog: rawCatalog,
  security_controls: securityControls,
  migration_000190: migration190,
  migration_history_before: historyBefore,
  migration_history_after: historyAfter,
  history_reservation_negative:historyReservationNegative,
  history_reservation_preflight:historyReservationPreflight,
  behavior_results: behaviorResults,
  contract_matrix: contractMatrix,
  function_contract_matrix:functionContractMatrix,
  head_version_concurrency:headVersionConcurrency,
  actions: budgetActions,
  action_execution: budgetExecution ? {gate_failure:budgetExecution.gate_failure,
    outer_watchdog:budgetExecution.outer_watchdog} : null,
  watchdog_injection:watchdogInjection,
  fake_lifecycle_results: fakeLifecycleResults,
  drift_rejection_results: driftResults,
  control_state_results: controlStateResults,
  fault_injection_results: faultResults,
  commit_ambiguous_results: ambiguousResults,
  negative_cases: faultResults,
  commit_ambiguous: {cases:ambiguousResults,acquire_mode_matrix:acquireModeMatrix},
  receipt_acquire_concurrency:receiptAcquireConcurrency,
  no_191_192_dependency: reservedDependency.proven_zero_dependency,
  reserved_191_192_dependency_evidence: reservedDependency,
  reservation_preflight:reservationPreflight,
  cleanup: cleanupResult,
  performance_2m_status: targetedV11?"skipped-targeted-diagnostic":performance?"candidate-passed":"failed",
  performance,
  deadline: { limit_ns: budgetContract.transaction_hard_limit_ns.toString(), clock: "process.hrtime.bigint.monotonic" },
  environment: {
    ...containerIdentity,
    container_image_reference:containerIdentity?.image_reference??null,
    container_image_digest:containerIdentity?.image_digest??null,
    postgresql_version:databaseEnvironment?.postgresql_version??null,
    pg_settings:databaseEnvironment?.pg_settings??null,
    cpu_model: cpus()[0]?.model ?? null,
    cpu_count: cpus().length,
    ram_bytes: totalmem(),
    ram_free_bytes_at_artifact: freemem(),
    os: `${platform()} ${release()}`,
    postgresql: performance?.environment ?? null
  },
  env: {...containerIdentity,database:databaseEnvironment,
    pg_settings:databaseEnvironment?.pg_settings??null,cpu_model:cpus()[0]?.model??null,
    cpu_count:cpus().length,ram_bytes:totalmem(),os:`${platform()} ${release()}`},
  worktree: {
    branch: gitRead(["branch", "--show-current"]),
    dirty: gitRead(["status", "--porcelain"]).length > 0,
    disclosure: "shared dirty worktree; unrelated user and agent changes preserved"
  },
  pending: {
    production_caller_deadline_status: "pending_C4",
    real_adapter_admission_status: "pending_B2c",
    head_absent_raw_23505_normalization:{owner:"pending_C4",required:"read winner then normalize to replay/version-conflict",
      prohibited:"raw 23505 as HTTP 500",evidence:"real adapter concurrent absent-head test"}
  },
  review: {
    architecture_database: "pending",
    test_security: "pending",
    product_rbac_interaction: "pending",
    open_p0_p1: "not_computed"
  },
  evidence_dag: {
    nodes:["contract","runner","migration","function","fixture","actions","negative_cases","commit_ambiguous","cleanup",
      "candidate-main","watchdog-artifact","detached-manifest","review"],
    edges:[
      ["contract","runner"],["contract","migration"],["migration","function"],["fixture","actions"],
      ["runner","negative_cases"],["runner","commit_ambiguous"],["runner","watchdog-artifact"],
      ["actions","candidate-main"],["negative_cases","candidate-main"],["commit_ambiguous","candidate-main"],
      ["cleanup","candidate-main"],["candidate-main","detached-manifest"],
      ["watchdog-artifact","detached-manifest"],["detached-manifest","review"]],
    runner_raw_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    static_test_raw_sha256: sha256(readFileSync(resolve(root,"scripts/e2e/property-remediation/tests/b2a-c2-schema-contract.spec.mjs"))),
    migration_raw_sha256: Object.fromEntries(exactChain.map(name=>[name,sha256(readFileSync(resolve(migrations,name)))]))
  },
  independent_review_status: "pending",
  candidate_findings: status === "passed" ? [] : [`P1: ${error}`],
  error
};
if (catalogSha256 && functions) {
  const grammar = `b-property-task-projection-schema-v1\nold-b-schema-expand\t53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874\ncatalog\t${catalogSha256}\nfunctions\t${functions.grammar_sha256}\n`;
  evidence.projection_schema_grammar = grammar;
  evidence.projection_schema_sha256 = sha256(grammar);
}
const sidecarPayloads=!targetedV11&&artifactPath&&status==="passed"&&rawCatalog&&functions&&securityControls&&performance?[
  {id:"catalog-sidecar",kind:"catalog",suffix:".catalog.json",media_type:"application/json",
    bytes:`${JSON.stringify(rawCatalog,null,2)}\n`},
  {id:"functions-sidecar",kind:"functions",suffix:".functions.json",media_type:"application/json",
    bytes:`${JSON.stringify(functions,null,2)}\n`},
  {id:"security-sidecar",kind:"security-controls",suffix:".security-controls.json",media_type:"application/json",
    bytes:`${JSON.stringify(securityControls,null,2)}\n`},
  {id:"performance-sidecar",kind:"performance",suffix:".performance.json",media_type:"application/json",
    bytes:`${JSON.stringify(performance,null,2)}\n`},
  {id:"projection-grammar-sidecar",kind:"projection-schema-grammar",suffix:".projection-schema.grammar",media_type:"text/plain",
    bytes:evidence.projection_schema_grammar}
]:[];
evidence.sidecars=sidecarPayloads.map(sidecar=>({id:sidecar.id,kind:sidecar.kind,
  path:`${artifactPath}${sidecar.suffix}`,resolved_path:resolve(root,`${artifactPath}${sidecar.suffix}`),
  sha256:sha256(sidecar.bytes),byte_length:Buffer.byteLength(sidecar.bytes),
  media_type:sidecar.media_type}));
evidence.evidence_dag.nodes.push("catalog","security","control","performance","history",
  ...evidence.sidecars.map(sidecar=>sidecar.id));
evidence.evidence_dag.edges.push(["migration","catalog"],["catalog","security"],["security","control"],
  ["control","history"],["catalog","performance"],
  ...evidence.sidecars.map(sidecar=>[sidecar.kind==="catalog"?"catalog":
    sidecar.kind==="functions"?"function":sidecar.kind==="performance"?"performance":
    sidecar.kind==="security-controls"?"security":"catalog",sidecar.id]),
  ...evidence.sidecars.map(sidecar=>[sidecar.id,"detached-manifest"]));
evidence.evidence_dag.validation=validateEvidenceDag(evidence.evidence_dag,
  ["candidate-main","watchdog-artifact","detached-manifest",...evidence.sidecars.map(sidecar=>sidecar.id)]);
if (artifactPath) {
  const resolvedArtifact = resolve(root, artifactPath);
  if (!resolvedArtifact.startsWith(`${research}/`)) {
    throw new Error("PROPERTY_B2A_C2_ARTIFACT_PATH must be inside the task research directory");
  }
  mkdirSync(dirname(resolvedArtifact), { recursive: true });
  const mainBytes=`${JSON.stringify(evidence,null,2)}\n`;
  if (status === "passed" && rawCatalog && functions && securityControls && performance) {
    if(sidecarPayloads.length!==5)throw new Error(`full C2 candidate requires five materialized sidecars, got ${sidecarPayloads.length}`);
    const watchdogBytes=`${JSON.stringify(watchdogInjection,null,2)}\n`;
    const manifest={schema_version:"b2a-c2-v12-detached-manifest-v1",run_id:runId,
      main:{path:artifactPath,sha256:sha256(mainBytes),byte_length:Buffer.byteLength(mainBytes)},
      sidecars:evidence.sidecars,watchdog:{path:`${artifactPath}.watchdog.json`,resolved_path:`${resolvedArtifact}.watchdog.json`,sha256:sha256(watchdogBytes),
        byte_length:Buffer.byteLength(watchdogBytes)},self_reference:false,review_status:"pending"};
    manifest.hash_chain_validation=validateDetachedHashChain({mainBytes,sidecarPayloads,watchdogBytes,manifest});
    writeFileSync(resolvedArtifact,mainBytes,{flag:"wx"});
    for(const sidecar of sidecarPayloads)writeFileSync(`${resolvedArtifact}${sidecar.suffix}`,sidecar.bytes,{flag:"wx"});
    writeFileSync(`${resolvedArtifact}.watchdog.json`,watchdogBytes,{flag:"wx"});
    writeFileSync(`${resolvedArtifact}.manifest.json`,`${JSON.stringify(manifest,null,2)}\n`,{flag:"wx"});
  }else writeFileSync(resolvedArtifact,mainBytes,{flag:"wx"});
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (status !== "passed") process.exitCode = 1;
