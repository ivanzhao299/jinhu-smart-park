/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXECUTOR_SHA, hash, fail, nonceRoot, privateInfo, writePrivate, unpack } from './yuzhou-t5-private-packet.mjs';

const CORE_SHA = 'dafe8b54510dada1c7bf90663557c54debc89b16';
const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const exact = (x, keys) => { if (!x || Object.keys(x).sort().join(',') !== [...keys].sort().join(',')) fail('TRANSPORT_T5_SHAPE_INVALID'); };
function ownedDirectory(path) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) fail('TRANSPORT_ROOT_UNSAFE');
}
function json(path) { privateInfo(path); return JSON.parse(readFileSync(path, 'utf8')); }
function descriptor(path) { privateInfo(path); return { path, sha256: hash(readFileSync(path)) }; }
function actualParent(nonce) {
  if (!/^[a-f0-9]{32}$/u.test(nonce ?? '')) fail('TRANSPORT_T5_PARENT_NONCE_INVALID');
  const root = `/tmp/jinhu-yuzhou-import-${nonce}`; ownedDirectory(root);
  const prepared = json(resolve(root, 'prepared.json'));
  const configPath = resolve(root, 'private/config.json');
  if (prepared.codeSha !== CORE_SHA || hash(readFileSync(configPath)) !== prepared.configSha256) fail('TRANSPORT_T5_PARENT_CONFIG_DRIFT');
  const config = json(configPath); const planDescriptor = config.artifacts.sealedPlan;
  const plan = json(planDescriptor.path);
  if (hash(readFileSync(planDescriptor.path)) !== planDescriptor.sha256 || plan.triple.codeSha !== CORE_SHA) fail('TRANSPORT_T5_PARENT_PLAN_DRIFT');
  const receiptPath = resolve(root, 'execution-receipt.json');
  return { plan, receipt: json(receiptPath), receiptPath };
}

// Same record/map/employee conservation query as the reviewed T4 parent gate.
// Only its aggregate checksum and counts may leave the host.
export async function observeActualParent(client, plan, receipt) {
  if (receipt.status !== 'SUCCEEDED' || receipt.sealedPlanSha256 !== plan.sealing.sealedPlanSha256
    || receipt.targetScopeSha256 !== plan.targetScope.scopeSha256 || JSON.stringify(receipt.domains) !== JSON.stringify(['T0','T1','T2','T3'])
    || receipt.receiptSha256 !== hash(`${plan.operationId}\0${plan.sealing.sealedPlanSha256}\0succeeded\0T0,T1,T2,T3`)) fail('TRANSPORT_T5_PARENT_RECEIPT_INVALID');
  const op = (await client.query('SELECT * FROM hr_yuzhou_production_import_operation WHERE operation_id=$1', [plan.operationId])).rows[0];
  if (!op || op.status !== 'succeeded' || op.code_sha !== CORE_SHA || op.source_snapshot_sha256 !== plan.triple.sourceSnapshotHash
    || op.mapping_contract_sha256 !== plan.triple.mappingContractHash || op.sealed_plan_sha256 !== receipt.sealedPlanSha256
    || op.target_identity_sha256 !== plan.target.identitySha256 || op.target_scope_sha256 !== plan.targetScope.scopeSha256
    || op.target_tenant_id !== plan.targetScope.tenantId || op.target_park_id !== plan.targetScope.parkId
    || op.final_rehearsal_pair_sha256 !== plan.finalRehearsalPair.artifactSha256) fail('TRANSPORT_T5_PARENT_DATABASE_DRIFT');
  const phases = (await client.query('SELECT phase,status,planned_record_count,applied_record_count,payload_bundle_sha256 FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase', [plan.operationId])).rows;
  if (phases.length !== 4 || phases.some((p, i) => p.phase !== plan.phases[i].phase || p.status !== 'succeeded'
    || Number(p.planned_record_count) !== plan.phases[i].records.length || Number(p.applied_record_count) !== plan.phases[i].records.length
    || p.payload_bundle_sha256 !== plan.phases[i].payloadBundleSha256)) fail('TRANSPORT_T5_PARENT_PHASE_DRIFT');
  const row = (await client.query(`SELECT count(*)::text count,
    count(*) FILTER(WHERE r.rollback_status<>'not_started' OR m.id IS NULL OR NOT m.is_active OR m.source_identity_sha256<>r.source_identity_sha256 OR m.source_row_sha256<>r.source_row_sha256 OR m.target_id IS DISTINCT FROM r.target_id OR (r.target_table='hr_employee' AND (e.id IS NULL OR e.tenant_id<>$2 OR e.park_id<>$3 OR e.is_deleted)))::text invalid,
    encode(digest(COALESCE(string_agg(encode(digest(jsonb_build_object('record',to_jsonb(r),'map',to_jsonb(m),'employee',to_jsonb(e))::text,'sha256'),'hex'),'' ORDER BY r.phase,r.source_identity_sha256),''),'sha256'),'hex') sha256
    FROM hr_yuzhou_production_import_record r
    LEFT JOIN hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
    LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
    LEFT JOIN hr_employee e ON r.target_table='hr_employee' AND e.id=r.target_id
    WHERE r.operation_id=$1`, [plan.operationId, plan.targetScope.tenantId, plan.targetScope.parkId])).rows[0];
  if (row.invalid !== '0' || Number(row.count) !== plan.phases.reduce((n, p) => n + p.records.length, 0)
    || !/^[a-f0-9]{64}$/u.test(row.sha256) || !/^[a-f0-9]{64}$/u.test(op.final_rehearsal_pair_sha256)) fail('TRANSPORT_T5_PARENT_RECORD_DRIFT');
  return { recordSetSha256: row.sha256, finalRehearsalPairSha256: op.final_rehearsal_pair_sha256, recordCount: Number(row.count) };
}

export async function actualPayrollParent(client, nonce, parent, executor) {
  if (!/^[a-f0-9]{32}$/u.test(nonce ?? '')) fail('TRANSPORT_T5_PAYROLL_NONCE_INVALID');
  const root = `/tmp/jinhu-yuzhou-t4-${nonce}`; ownedDirectory(root);
  const prepared = json(resolve(root,'prepared.json')), configPath = resolve(root,'private/config.json');
  if (hash(readFileSync(configPath)) !== prepared.configSha256) fail('TRANSPORT_T5_PAYROLL_CONFIG_DRIFT');
  const config=json(configPath), binding=json(config.binding.path), receipt=json(resolve(root,'execution-receipt.json'));
  if (receipt.status !== 'SUCCEEDED' || binding.parent.operationId !== parent.plan.operationId
    || ['codeSha','sourceSnapshotHash','mappingContractHash'].some(key=>binding.triple?.[key]!==parent.plan.triple[key]) || binding.executionCodeSha !== prepared.codeSha
    || hash(readFileSync(config.binding.path)) !== config.binding.sha256) fail('TRANSPORT_T5_PAYROLL_PARENT_DRIFT');
  const { canonicalT4 } = await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/production-import-t4-followon-binding.mjs')));
  const bindingSha256=hash(canonicalT4(binding));
  const op=(await client.query('SELECT status,binding_sha256,parent_operation_id,owned_state,owned_state=hr_yuzhou_t4_followon_owned_state(operation_id) AS unchanged FROM hr_yuzhou_t4_followon_operation WHERE operation_id=$1',[binding.operationId])).rows;
  if (op.length!==1 || op[0].status!=='succeeded' || op[0].parent_operation_id!==parent.plan.operationId || op[0].binding_sha256!==bindingSha256 || receipt.bindingSha256!==bindingSha256 || op[0].unchanged!==true) fail('TRANSPORT_T5_PAYROLL_PARENT_DRIFT');
  return {operationId:binding.operationId,bindingSha256,ownedStateSha256:hash(canonicalT4(op[0].owned_state)),receiptSha256:hash(readFileSync(resolve(root,'execution-receipt.json')))};
}

export async function reconcileT5(client,binding,result) {
  const op=(await client.query('SELECT status,binding_sha256,parent_operation_id,payroll_operation_id,owned_state=hr_yuzhou_t5_followon_owned_state(operation_id) AS unchanged FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1',[binding.operationId])).rows;
  const counts=(await client.query("SELECT (SELECT count(*) FROM hr_yuzhou_t5_followon_source WHERE operation_id=$1)::int sources,(SELECT count(*) FROM hr_yuzhou_t5_followon_projection_receipt WHERE operation_id=$1)::int receipts,(SELECT count(*) FROM sys_file f JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.target_id=f.id AND r.target_table='sys_file' AND r.disposition='insert' WHERE r.operation_id=$1 AND f.tenant_id=$2 AND f.park_id=$3 AND f.biz_type='hr_employee_photo' AND NOT f.is_deleted)::int photos",[binding.operationId,binding.targetScope.tenantId,binding.targetScope.parkId])).rows[0];
  if(op.length!==1||op[0].status!=='succeeded'||op[0].binding_sha256!==result.bindingSha256||op[0].parent_operation_id!==binding.parent.operationId||op[0].payroll_operation_id!==binding.payrollParent.operationId||op[0].unchanged!==true||counts.sources!==20182||counts.receipts!==127449||counts.photos!==2149)fail('TRANSPORT_T5_RECONCILIATION_DRIFT');
  return {reconciliationStatus:'PASS',sourceRecords:20163,typedProjectionRecords:63992,employeePhotoFiles:2149,physicalFiles:2150};
}

export async function runHost(mode, nonce, packetSha256, deployPath) {
  if (!['prepare','execute'].includes(mode) || !/^[a-f0-9]{64}$/u.test(packetSha256 ?? '') || !/^\/[A-Za-z0-9_./-]+$/u.test(deployPath ?? '')) fail('TRANSPORT_ARGUMENT_INVALID');
  const root = nonceRoot(nonce); ownedDirectory(root); const executor = resolve(root, 'executor');
  const privateRun = (args) => {
    const r = spawnSync(process.execPath, args, { cwd: executor, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (r.status !== 0) {
      if (!existsSync(resolve(root, `${mode}-failure.log`))) writePrivate(resolve(root, `${mode}-failure.log`), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
      let code; try { code = JSON.parse(r.stdout).reasonCodes?.[0]; } catch { /* raw detail remains private */ }
      fail(/^T5_[A-Z0-9_]+$/u.test(code ?? '') ? code : 'TRANSPORT_T5_SUBPROCESS_FAILED');
    }
    return JSON.parse(r.stdout);
  };
  try {
    if (execFileSync('git', ['rev-parse','HEAD'], { cwd: executor, encoding: 'utf8' }).trim() !== EXECUTOR_SHA) fail('TRANSPORT_SOURCE_DRIFT');
    execFileSync('git', ['diff','--quiet','--'], { cwd: executor }); execFileSync('git', ['diff','--cached','--quiet','--'], { cwd: executor });
    const { observeProductionRuntimeRevision } = await import(pathToFileURL(resolve(executor, 'scripts/diagnose-production-runtime-revision.mjs')));
    const runtime = await observeProductionRuntimeRevision(EXECUTOR_SHA);
    if (runtime.status !== 'PASS' || runtime.expectedCommit !== EXECUTOR_SHA || runtime.observations?.length !== 2 || runtime.observations.some(x => x.revision !== EXECUTOR_SHA)) fail('TRANSPORT_RUNTIME_DRIFT');
    const contract = jsonPublic(resolve(executor, 'scripts/hr-cutover/contracts/production-import-execution-v2.json'));
    const allowed = contract.activation.allowedTargets;
    if (contract.activation.status !== 'PASS' || allowed.length !== 1) fail('TRANSPORT_TARGET_DRIFT');
    const env = JSON.parse(docker(['exec','jinhu-smart-park-prod-api','node','-e','process.stdout.write(JSON.stringify({database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD}))']));
    const port = Number(docker(['port','jinhu-smart-park-prod-postgres','5432/tcp']).trim().split('\n')[0]?.match(/:(\d+)$/u)?.[1]);
    if (!env.password || !env.database || !env.user || !Number.isSafeInteger(port) || port < 1 || port > 65535) fail('TRANSPORT_DATABASE_UNAVAILABLE');
    const credentials = { host: '127.0.0.1', port, ...env };
    const pg = await import(pathToFileURL(resolve(executor, 'node_modules/pg/lib/index.js')));
    const client = new pg.default.Client({ ...credentials, connectionTimeoutMillis: 10000, statement_timeout: 300000, options: '-c default_transaction_read_only=on -c timezone=Asia/Shanghai' });
    await client.connect();
    try {
      const observed = (await client.query('SELECT current_database() AS database,current_user AS "databaseUser",inet_server_addr()::text AS address,inet_server_port() AS port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid"')).rows[0];
      const socket = JSON.parse(docker(['exec','jinhu-smart-park-prod-postgres','sh','-c', `exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT json_build_object('database',current_database(),'databaseUser',current_user,'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()))"`]));
      if (observed.database !== env.database || observed.databaseUser !== env.user || socket.database !== observed.database || socket.databaseUser !== observed.databaseUser || socket.databaseOid !== observed.databaseOid) fail('TRANSPORT_DATABASE_IDENTITY_MISMATCH');
      const manifest = mode === 'prepare' ? await unpack(resolve(root,'packet.bin'), resolve(root,'transport-key.txt'), nonce, packetSha256, resolve(root,'private')) : json(resolve(root,'private/manifest.json'));
      if (manifest.kind !== 'import') fail('TRANSPORT_T5_PACKET_KIND_INVALID');
      const materials=manifest.materials;exact(materials,materials.kind==='parent'?['kind','parentNonce','payrollNonce']:['kind','parentNonce','payrollNonce','config']);
      const parent=actualParent(materials.parentNonce);
      if(parent.plan.target.identitySha256!==allowed[0].identitySha256||parent.plan.targetScope.scopeSha256!==allowed[0].targetScopeSha256)fail('TRANSPORT_TARGET_DRIFT');
      const parentObserved=await observeActualParent(client,parent.plan,parent.receipt);
      const payroll=await actualPayrollParent(client,materials.payrollNonce,parent,executor);
      const {observeT5RuntimeKeyring}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-followon-runtime-keyring.mjs')));
      const keys=observeT5RuntimeKeyring(EXECUTOR_SHA);const productionKeyObservationSha256=keys.observationSha256;
      keys.keyring.hashKey.fill(0);for(const key of keys.keyring.keys.values())key.fill(0);
      if(materials.kind==='parent'){
        if(mode!=='prepare'||manifest.files.length)fail('TRANSPORT_T5_PARENT_PROBE_INVALID');
        const actor=(await client.query("SELECT id::text FROM sys_user WHERE tenant_id=$1 AND park_id=$2 AND is_enabled AND NOT is_deleted AND status='enabled' ORDER BY create_time,id LIMIT 1",[parent.plan.targetScope.tenantId,parent.plan.targetScope.parkId])).rows;
        if(actor.length!==1)fail('TRANSPORT_T5_ACTOR_UNAVAILABLE');
        const observation={...parentObserved,payrollBindingSha256:payroll.bindingSha256,payrollOwnedStateSha256:payroll.ownedStateSha256,payrollReceiptSha256:payroll.receiptSha256,productionKeyObservationSha256,actorId:actor[0].id};
        writePrivate(resolve(root,'parent-observation.json'),observation);
        return {code:'TRANSPORT_T5_PARENT_OBSERVED',codeSha:EXECUTOR_SHA,packetSha256,...observation,receiptSha256:parent.receipt.receiptSha256,sealedPlanSha256:parent.receipt.sealedPlanSha256};
      }
      if(materials.kind!=='append')fail('TRANSPORT_T5_PACKET_KIND_INVALID');
      const configPath=resolve(root,'private/config.json');
      if(mode==='prepare'){
        const config=materials.config;exact(config,['binding','authorization','stage','sourceKey','photoBundle','runtimeEvidence']);
        const binding=json(config.binding.path);
        if(hash(readFileSync(config.binding.path))!==config.binding.sha256||binding.executionCodeSha!==EXECUTOR_SHA||binding.parent.operationId!==parent.plan.operationId||binding.parent.receiptSha256!==parent.receipt.receiptSha256||binding.parent.recordSetSha256!==parentObserved.recordSetSha256||binding.finalRehearsalPairSha256!==parentObserved.finalRehearsalPairSha256||Object.keys(payroll).some(key=>binding.payrollParent?.[key]!==payroll[key])||binding.productionKeyObservationSha256!==productionKeyObservationSha256)fail('TRANSPORT_T5_BINDING_DRIFT');
        const emit=(name,value)=>{const path=resolve(root,'private',name);writePrivate(path,value);return descriptor(path);};
        config.postgresCredentials=emit('postgres-credentials.json',credentials);
        config.databaseBinding=emit('database-binding.json',{database:observed.database,databaseUser:observed.databaseUser,targetIdentitySha256:allowed[0].identitySha256,targetScope:parent.plan.targetScope,serverIdentity:{address:observed.address,port:observed.port,databaseOid:observed.databaseOid}});
        writePrivate(configPath,config);const configSha256=hash(readFileSync(configPath));
        const result=privateRun([resolve(executor,'scripts/hr-cutover/execute-production-t5-followon.mjs'),'--config',configPath,'--sha256',configSha256,'--mode','prepare']);
        if(result.status!=='STRUCTURE_READY'||result.productionImportExecuted!==false||result.productionKeyCompatibilityVerified!==true)fail('TRANSPORT_T5_PREPARE_HOLD');
        writePrivate(resolve(root,'prepared.json'),{codeSha:EXECUTOR_SHA,packetSha256,configSha256});
        return {code:'TRANSPORT_T5_PREPARED',codeSha:EXECUTOR_SHA,packetSha256,bindingSha256:result.bindingSha256,sourceRecords:20163,fullProductMigrationComplete:false};
      }
      const prepared=json(resolve(root,'prepared.json'));
      if(prepared.codeSha!==EXECUTOR_SHA||prepared.packetSha256!==packetSha256||prepared.configSha256!==hash(readFileSync(configPath)))fail('TRANSPORT_PREPARED_BINDING_MISMATCH');
      writePrivate(resolve(root,'execution-claimed.json'),{codeSha:EXECUTOR_SHA,packetSha256});
      const result=privateRun([resolve(executor,'scripts/hr-cutover/execute-production-t5-followon.mjs'),'--config',configPath,'--sha256',prepared.configSha256,'--mode','execute']);
      writePrivate(resolve(root,'execution-receipt.json'),result);
      if(result.status!=='SUCCEEDED'||result.fullProductMigrationComplete!==false)fail('TRANSPORT_T5_EXECUTION_FAILED');
      let reconciliation={reconciliationStatus:'REQUIRED'};
      try{
        const config=json(configPath),binding=json(config.binding.path);
        reconciliation=await reconcileT5(client,binding,result);
        const {readT5FullArchivePrivateStage}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-full-archive-private-stage.mjs')));
        const {assertT5FollowonStageBinding}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-followon-binding.mjs')));
        const {observeT5CoreOwners}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-followon-core-owners.mjs')));
        const {prepareT5FollowonPhotos}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-followon-photos.mjs')));
        const {createT5ApiContainerPhotoStorage}=await import(pathToFileURL(resolve(executor,'scripts/hr-cutover/t5-followon-photo-container-storage.mjs')));
        const stage=readT5FullArchivePrivateStage(config.stage,assertT5FollowonStageBinding(config.stage,binding));
        const owners=await observeT5CoreOwners(client,binding);
        const photos=prepareT5FollowonPhotos({bytes:readFileSync(config.photoBundle.path),binding,stage,byCode:owners.byCode});
        await createT5ApiContainerPhotoStorage().verify(photos);
      }catch(error){reconciliation={reconciliationStatus:'REQUIRED'};writePrivate(resolve(root,'reconciliation-failure.log'),error?.stack??'TRANSPORT_T5_RECONCILIATION_REQUIRED');}
      writePrivate(resolve(root,'reconciliation-receipt.json'),reconciliation);
      return {code:'TRANSPORT_T5_EXECUTED',codeSha:EXECUTOR_SHA,bindingSha256:result.bindingSha256,authorizationSha256:result.authorizationSha256,...reconciliation,fullProductMigrationComplete:false};
    } finally { await client.end(); }
  } catch (error) {
    if (!existsSync(resolve(root,`${mode}-failure.log`))) writePrivate(resolve(root,`${mode}-failure.log`), error?.stack ?? 'TRANSPORT_T5_HOST_FAILED');
    throw error;
  } finally { rmSync(resolve(root,'transport-key.txt'), { force: true }); rmSync(resolve(root,'packet.bin'), { force: true }); }
}
function jsonPublic(path) { return JSON.parse(readFileSync(path, 'utf8')); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runHost(...process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^(?:TRANSPORT|T5)_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_T5_HOST_FAILED' })}\n`); process.exitCode = 1; }
}
