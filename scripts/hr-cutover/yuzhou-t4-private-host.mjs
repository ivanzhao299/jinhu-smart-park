/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXECUTOR_SHA, hash, fail, nonceRoot, privateInfo, writePrivate, unpack } from './yuzhou-t4-private-packet.mjs';

const CORE_SHA = '8398471da09dfd2945a763778f71655a7dc4b116';
const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const exact = (x, keys) => { if (!x || Object.keys(x).sort().join(',') !== [...keys].sort().join(',')) fail('TRANSPORT_T4_SHAPE_INVALID'); };
function ownedDirectory(path) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) fail('TRANSPORT_ROOT_UNSAFE');
}
function json(path) { privateInfo(path); return JSON.parse(readFileSync(path, 'utf8')); }
function descriptor(path) { privateInfo(path); return { path, sha256: hash(readFileSync(path)) }; }
function actualParent(nonce) {
  if (!/^[a-f0-9]{32}$/u.test(nonce ?? '')) fail('TRANSPORT_T4_PARENT_NONCE_INVALID');
  const root = `/tmp/jinhu-yuzhou-import-${nonce}`; ownedDirectory(root);
  const prepared = json(resolve(root, 'prepared.json'));
  const configPath = resolve(root, 'private/config.json');
  if (prepared.codeSha !== CORE_SHA || hash(readFileSync(configPath)) !== prepared.configSha256) fail('TRANSPORT_T4_PARENT_CONFIG_DRIFT');
  const config = json(configPath); const planDescriptor = config.artifacts.sealedPlan;
  const plan = json(planDescriptor.path);
  if (hash(readFileSync(planDescriptor.path)) !== planDescriptor.sha256 || plan.triple.codeSha !== CORE_SHA) fail('TRANSPORT_T4_PARENT_PLAN_DRIFT');
  const receiptPath = resolve(root, 'execution-receipt.json');
  return { plan, receipt: json(receiptPath), receiptPath };
}

// Same record/map/employee conservation query as the reviewed T4 parent gate.
// Only its aggregate checksum and counts may leave the host.
export async function observeActualParent(client, plan, receipt) {
  if (receipt.status !== 'SUCCEEDED' || receipt.sealedPlanSha256 !== plan.sealing.sealedPlanSha256
    || receipt.targetScopeSha256 !== plan.targetScope.scopeSha256 || JSON.stringify(receipt.domains) !== JSON.stringify(['T0','T1','T2','T3'])
    || receipt.receiptSha256 !== hash(`${plan.operationId}\0${plan.sealing.sealedPlanSha256}\0succeeded\0T0,T1,T2,T3`)) fail('TRANSPORT_T4_PARENT_RECEIPT_INVALID');
  const op = (await client.query('SELECT * FROM hr_yuzhou_production_import_operation WHERE operation_id=$1', [plan.operationId])).rows[0];
  if (!op || op.status !== 'succeeded' || op.code_sha !== CORE_SHA || op.source_snapshot_sha256 !== plan.triple.sourceSnapshotHash
    || op.mapping_contract_sha256 !== plan.triple.mappingContractHash || op.sealed_plan_sha256 !== receipt.sealedPlanSha256
    || op.target_identity_sha256 !== plan.target.identitySha256 || op.target_scope_sha256 !== plan.targetScope.scopeSha256
    || op.target_tenant_id !== plan.targetScope.tenantId || op.target_park_id !== plan.targetScope.parkId
    || op.final_rehearsal_pair_sha256 !== plan.finalRehearsalPair.artifactSha256) fail('TRANSPORT_T4_PARENT_DATABASE_DRIFT');
  const phases = (await client.query('SELECT phase,status,planned_record_count,applied_record_count,payload_bundle_sha256 FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase', [plan.operationId])).rows;
  if (phases.length !== 4 || phases.some((p, i) => p.phase !== plan.phases[i].phase || p.status !== 'succeeded'
    || Number(p.planned_record_count) !== plan.phases[i].records.length || Number(p.applied_record_count) !== plan.phases[i].records.length
    || p.payload_bundle_sha256 !== plan.phases[i].payloadBundleSha256)) fail('TRANSPORT_T4_PARENT_PHASE_DRIFT');
  const row = (await client.query(`SELECT count(*)::text count,
    count(*) FILTER(WHERE r.rollback_status<>'not_started' OR m.id IS NULL OR NOT m.is_active OR m.source_identity_sha256<>r.source_identity_sha256 OR m.source_row_sha256<>r.source_row_sha256 OR m.target_id IS DISTINCT FROM r.target_id OR (r.target_table='hr_employee' AND (e.id IS NULL OR e.tenant_id<>$2 OR e.park_id<>$3 OR e.is_deleted)))::text invalid,
    encode(digest(COALESCE(string_agg(encode(digest(jsonb_build_object('record',to_jsonb(r),'map',to_jsonb(m),'employee',to_jsonb(e))::text,'sha256'),'hex'),'' ORDER BY r.phase,r.source_identity_sha256),''),'sha256'),'hex') sha256
    FROM hr_yuzhou_production_import_record r
    LEFT JOIN hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
    LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
    LEFT JOIN hr_employee e ON r.target_table='hr_employee' AND e.id=r.target_id
    WHERE r.operation_id=$1`, [plan.operationId, plan.targetScope.tenantId, plan.targetScope.parkId])).rows[0];
  if (row.invalid !== '0' || Number(row.count) !== plan.phases.reduce((n, p) => n + p.records.length, 0)
    || !/^[a-f0-9]{64}$/u.test(row.sha256) || !/^[a-f0-9]{64}$/u.test(op.final_rehearsal_pair_sha256)) fail('TRANSPORT_T4_PARENT_RECORD_DRIFT');
  return { recordSetSha256: row.sha256, finalRehearsalPairSha256: op.final_rehearsal_pair_sha256, recordCount: Number(row.count) };
}

export async function reconcileT4(client, binding, result) {
  const op = (await client.query('SELECT status,binding_sha256,parent_operation_id,owned_state=hr_yuzhou_t4_followon_owned_state(operation_id) AS unchanged FROM hr_yuzhou_t4_followon_operation WHERE operation_id=$1', [binding.operationId])).rows;
  const batch = (await client.query('SELECT status,loaded_row_count,quarantined_row_count,source_amount_total::text,loaded_amount_total::text FROM hr_payroll_legacy_batch WHERE batch_code=$1 AND tenant_id=$2 AND park_id=$3', [binding.operationId, binding.targetScope.tenantId, binding.targetScope.parkId])).rows;
  if (op.length !== 1 || op[0].status !== 'succeeded' || op[0].binding_sha256 !== result.bindingSha256 || op[0].parent_operation_id !== binding.parent.operationId || op[0].unchanged !== true
    || batch.length !== 1 || batch[0].status !== 'staged' || Number(batch[0].loaded_row_count) !== 46092 || Number(batch[0].quarantined_row_count) !== 0
    || batch[0].source_amount_total !== '102194056.8000' || batch[0].loaded_amount_total !== '102194056.8000') fail('TRANSPORT_T4_RECONCILIATION_DRIFT');
  const items = (await client.query("SELECT count(*)::text count FROM hr_payroll_legacy_snapshot_item i JOIN hr_payroll_legacy_snapshot s ON s.id=i.snapshot_id WHERE s.remark='T4 run='||$1 AND s.tenant_id=$2 AND s.park_id=$3", [binding.operationId, binding.targetScope.tenantId, binding.targetScope.parkId])).rows[0];
  if (items.count !== '1078020') fail('TRANSPORT_T4_RECONCILIATION_DRIFT');
  return { reconciliationStatus: 'PASS', sourceRecordCount: 46092, snapshotItems: 1078020, published: false };
}

export async function runHost(mode, nonce, packetSha256, deployPath) {
  if (!['prepare','execute'].includes(mode) || !/^[a-f0-9]{64}$/u.test(packetSha256 ?? '') || !/^\/[A-Za-z0-9_./-]+$/u.test(deployPath ?? '')) fail('TRANSPORT_ARGUMENT_INVALID');
  const root = nonceRoot(nonce); ownedDirectory(root); const executor = resolve(root, 'executor');
  const privateRun = (args) => {
    const r = spawnSync(process.execPath, args, { cwd: executor, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (r.status !== 0) {
      if (!existsSync(resolve(root, `${mode}-failure.log`))) writePrivate(resolve(root, `${mode}-failure.log`), `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
      let code; try { code = JSON.parse(r.stdout).reasonCodes?.[0]; } catch { /* raw detail remains private */ }
      fail(/^T4_[A-Z0-9_]+$/u.test(code ?? '') ? code : 'TRANSPORT_T4_SUBPROCESS_FAILED');
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
    const client = new pg.default.Client({ ...credentials, connectionTimeoutMillis: 10000, statement_timeout: 300000, options: '-c default_transaction_read_only=on' });
    await client.connect();
    try {
      const observed = (await client.query('SELECT current_database() AS database,current_user AS "databaseUser",inet_server_addr()::text AS address,inet_server_port() AS port,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid"')).rows[0];
      const socket = JSON.parse(docker(['exec','jinhu-smart-park-prod-postgres','sh','-c', `exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT json_build_object('database',current_database(),'databaseUser',current_user,'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()))"`]));
      if (observed.database !== env.database || observed.databaseUser !== env.user || socket.database !== observed.database || socket.databaseUser !== observed.databaseUser || socket.databaseOid !== observed.databaseOid) fail('TRANSPORT_DATABASE_IDENTITY_MISMATCH');
      const manifest = mode === 'prepare' ? await unpack(resolve(root,'packet.bin'), resolve(root,'transport-key.txt'), nonce, packetSha256, resolve(root,'private')) : json(resolve(root,'private/manifest.json'));
      if (manifest.kind !== 'import') fail('TRANSPORT_T4_PACKET_KIND_INVALID');
      const materials = manifest.materials; exact(materials, materials.kind === 'parent' ? ['kind','parentNonce'] : ['kind','parentNonce','config']);
      const parent = actualParent(materials.parentNonce);
      if (parent.plan.target.identitySha256 !== allowed[0].identitySha256 || parent.plan.targetScope.scopeSha256 !== allowed[0].targetScopeSha256) fail('TRANSPORT_TARGET_DRIFT');
      const parentObserved = await observeActualParent(client, parent.plan, parent.receipt);
      if (materials.kind === 'parent') {
        if (mode !== 'prepare' || manifest.files.length) fail('TRANSPORT_T4_PARENT_PROBE_INVALID');
        writePrivate(resolve(root,'parent-observation.json'), parentObserved);
        return { code: 'TRANSPORT_T4_PARENT_OBSERVED', codeSha: EXECUTOR_SHA, packetSha256, ...parentObserved, receiptSha256: parent.receipt.receiptSha256, sealedPlanSha256: parent.receipt.sealedPlanSha256 };
      }
      if (materials.kind !== 'append') fail('TRANSPORT_T4_PACKET_KIND_INVALID');
      const configPath = resolve(root,'private/config.json');
      if (mode === 'prepare') {
        const config = materials.config; exact(config, ['binding','authorization','stage','runtimeEvidence']);
        const binding = json(config.binding.path);
        if (hash(readFileSync(config.binding.path)) !== config.binding.sha256 || binding.executionCodeSha !== EXECUTOR_SHA
          || binding.parent.operationId !== parent.plan.operationId || binding.parent.receiptSha256 !== parent.receipt.receiptSha256
          || binding.parent.recordSetSha256 !== parentObserved.recordSetSha256 || binding.finalRehearsalPairSha256 !== parentObserved.finalRehearsalPairSha256) fail('TRANSPORT_T4_BINDING_DRIFT');
        const emit = (name, value) => { const path = resolve(root,'private',name); writePrivate(path, value); return descriptor(path); };
        config.parentReceipt = emit('parent-receipt.json', readFileSync(parent.receiptPath));
        config.postgresCredentials = emit('postgres-credentials.json', credentials);
        config.databaseBinding = emit('database-binding.json', { database: observed.database, databaseUser: observed.databaseUser, targetIdentitySha256: allowed[0].identitySha256, targetScope: parent.plan.targetScope, serverIdentity: { address: observed.address, port: observed.port, databaseOid: observed.databaseOid } });
        writePrivate(configPath, config); const configSha256 = hash(readFileSync(configPath));
        const result = privateRun([resolve(executor,'scripts/hr-cutover/execute-production-t4-followon.mjs'),'--config',configPath,'--sha256',configSha256,'--mode','prepare']);
        if (result.status !== 'STRUCTURE_READY' || result.productionImportExecuted !== false || result.published !== false) fail('TRANSPORT_T4_PREPARE_HOLD');
        writePrivate(resolve(root,'prepared.json'), { codeSha: EXECUTOR_SHA, packetSha256, configSha256 });
        return { code: 'TRANSPORT_T4_PREPARED', codeSha: EXECUTOR_SHA, packetSha256, bindingSha256: result.bindingSha256, sourceRecordCount: 46092, snapshotItems: 1078020, published: false };
      }
      const prepared = json(resolve(root,'prepared.json'));
      if (prepared.codeSha !== EXECUTOR_SHA || prepared.packetSha256 !== packetSha256 || prepared.configSha256 !== hash(readFileSync(configPath))) fail('TRANSPORT_PREPARED_BINDING_MISMATCH');
      writePrivate(resolve(root,'execution-claimed.json'), { codeSha: EXECUTOR_SHA, packetSha256 });
      const result = privateRun([resolve(executor,'scripts/hr-cutover/execute-production-t4-followon.mjs'),'--config',configPath,'--sha256',prepared.configSha256,'--mode','execute']);
      writePrivate(resolve(root,'execution-receipt.json'), result);
      if (result.status !== 'SUCCEEDED' || result.published !== false || result.fullProductMigrationComplete !== false) fail('TRANSPORT_T4_EXECUTION_FAILED');
      let reconciliation = { reconciliationStatus: 'REQUIRED' };
      try { const config = json(configPath); reconciliation = await reconcileT4(client, json(config.binding.path), result); }
      catch (error) { writePrivate(resolve(root,'reconciliation-failure.log'), error?.stack ?? 'TRANSPORT_T4_RECONCILIATION_REQUIRED'); }
      writePrivate(resolve(root,'reconciliation-receipt.json'), reconciliation);
      return { code: 'TRANSPORT_T4_EXECUTED', codeSha: EXECUTOR_SHA, bindingSha256: result.bindingSha256, authorizationSha256: result.authorizationSha256, ...reconciliation, published: false };
    } finally { await client.end(); }
  } catch (error) {
    if (!existsSync(resolve(root,`${mode}-failure.log`))) writePrivate(resolve(root,`${mode}-failure.log`), error?.stack ?? 'TRANSPORT_T4_HOST_FAILED');
    throw error;
  } finally { rmSync(resolve(root,'transport-key.txt'), { force: true }); rmSync(resolve(root,'packet.bin'), { force: true }); }
}
function jsonPublic(path) { return JSON.parse(readFileSync(path, 'utf8')); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runHost(...process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^(?:TRANSPORT|T4)_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_T4_HOST_FAILED' })}\n`); process.exitCode = 1; }
}
