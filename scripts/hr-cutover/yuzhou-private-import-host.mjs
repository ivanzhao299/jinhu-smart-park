/* global process, Buffer */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { totalmem, freemem } from 'node:os';
import { EXECUTOR_SHA, fail, hash, nonceRoot, privateInfo, writePrivate, unpack } from './yuzhou-private-import-packet.mjs';

const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
export function assertImportMemoryCapacity(totalBytes, freeBytes) {
  const gib = 1024 ** 3;
  if (totalBytes < 12 * gib || freeBytes < 9 * gib) fail('TRANSPORT_IMPORT_MEMORY_CAPACITY');
}
export function importNodeArguments(entry, config, execute = false) {
  return ['--max-old-space-size=8192', entry, '--config', config, ...(execute ? ['--execute'] : [])];
}
export function assertRuntime(result) {
  if (result?.status !== 'PASS' || result.expectedCommit !== EXECUTOR_SHA || result.observations?.length !== 2 || result.observations.some(o => o.revision !== EXECUTOR_SHA)) fail('TRANSPORT_RUNTIME_DRIFT');
}
export function assertExecutorRoot(executor) {
  try {
    const options = { cwd: executor, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    if (execFileSync('git', ['rev-parse', 'HEAD'], options).trim() !== EXECUTOR_SHA) fail('TRANSPORT_SOURCE_DRIFT');
    execFileSync('git', ['diff', '--quiet', '--'], options);
    execFileSync('git', ['diff', '--cached', '--quiet', '--'], options);
  } catch { fail('TRANSPORT_SOURCE_DRIFT'); }
}
export function approvedInventoryTarget(contract) {
  const targets = contract?.activation?.allowedTargets;
  if (contract?.activation?.status !== 'PASS' || !Array.isArray(targets) || targets.length !== 1
    || !/^[a-f0-9]{64}$/u.test(targets[0]?.identitySha256 ?? '')
    || !/^[a-f0-9]{64}$/u.test(targets[0]?.targetScopeSha256 ?? '')) fail('TRANSPORT_TARGET_DRIFT');
  return targets[0];
}
export function assertScopedInventory(target, allowed) {
  if (target?.status !== 'PASS' || target.targetIdentitySha256 !== allowed.identitySha256
    || target.targetScopeSha256 !== allowed.targetScopeSha256) fail('TRANSPORT_TARGET_DRIFT');
}
export async function reconcileCoreImport(client, plan, result) {
  const op = (await client.query('SELECT status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,target_scope_sha256 FROM hr_yuzhou_production_import_operation WHERE operation_id=$1', [plan.operationId])).rows;
  if (op.length !== 1 || op[0].status !== 'succeeded' || op[0].code_sha !== EXECUTOR_SHA || op[0].source_snapshot_sha256 !== plan.triple.sourceSnapshotHash || op[0].mapping_contract_sha256 !== plan.triple.mappingContractHash || op[0].sealed_plan_sha256 !== result.sealedPlanSha256 || op[0].target_identity_sha256 !== plan.target.identitySha256 || op[0].target_scope_sha256 !== plan.targetScope.scopeSha256) fail('TRANSPORT_RECONCILIATION_OPERATION_DRIFT');
  const phases = (await client.query('SELECT phase,status,planned_record_count,applied_record_count,payload_bundle_sha256 FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase', [plan.operationId])).rows;
  if (phases.length !== 4 || phases.some((p, i) => p.phase !== plan.phases[i].phase || p.status !== 'succeeded' || Number(p.planned_record_count) !== plan.phases[i].records.length || Number(p.applied_record_count) !== plan.phases[i].records.length || p.payload_bundle_sha256 !== plan.phases[i].payloadBundleSha256)) fail('TRANSPORT_RECONCILIATION_PHASE_DRIFT');
  const rows = (await client.query('SELECT disposition,count(*)::text count,count(*) FILTER(WHERE target_table=\'hr_employee\')::text employees FROM hr_yuzhou_production_import_record WHERE operation_id=$1 GROUP BY disposition ORDER BY disposition', [plan.operationId])).rows;
  const expected = new Map();
  for (const p of plan.phases) for (const row of p.records) {
    const v = expected.get(row.disposition) ?? { count: 0, employees: 0 };
    v.count += 1; v.employees += Number(row.targetTable === 'hr_employee'); expected.set(row.disposition, v);
  }
  if (rows.length !== expected.size || rows.some(r => !expected.has(r.disposition) || Number(r.count) !== expected.get(r.disposition).count || Number(r.employees) !== expected.get(r.disposition).employees)) fail('TRANSPORT_RECONCILIATION_COUNT_DRIFT');
  return { reconciliationStatus: 'PASS', sourceRecordCount: rows.reduce((n, x) => n + Number(x.count), 0), insertedCount: Number(rows.find(x => x.disposition === 'insert')?.count ?? 0), quarantinedCount: Number(rows.find(x => x.disposition === 'quarantine')?.count ?? 0), employeesInserted: Number(rows.find(x => x.disposition === 'insert')?.employees ?? 0), verifiedPhaseCount: phases.length };
}
export async function runHost(mode, nonce, packetSha256, deployPath) {
  if (!['prepare', 'execute'].includes(mode) || !/^[a-f0-9]{64}$/u.test(packetSha256 ?? '') || !/^\/[A-Za-z0-9_./-]+$/u.test(deployPath ?? '')) fail('TRANSPORT_ARGUMENT_INVALID');
  const root = nonceRoot(nonce);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) fail('TRANSPORT_ROOT_UNSAFE');
  const executor = resolve(root, 'executor');
  const log = resolve(root, `${mode}-failure.log`);
  const privateRun = (command, args, options = {}) => {
    const r = spawnSync(command, args, { cwd: executor, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
    if (r.status !== 0) {
      if (!existsSync(log)) writePrivate(log, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
      let code;
      try { code = JSON.parse(r.stdout).reasonCodes?.[0]; } catch { /* Non-CLI diagnostics remain private. */ }
      if (/^PRODUCTION_IMPORT_[A-Z0-9_]+$/u.test(code ?? '')) fail(code);
      fail('TRANSPORT_SUBPROCESS_FAILED');
    }
    return r.stdout;
  };
  try {
    assertExecutorRoot(executor);
    const entry = await import(pathToFileURL(resolve(executor, 'scripts/hr-cutover/execute-production-import.mjs')));
    if (entry.currentRepositorySha(executor) !== EXECUTOR_SHA) fail('TRANSPORT_SOURCE_DRIFT');
    const { observeProductionRuntimeRevision } = await import(pathToFileURL(resolve(executor, 'scripts/diagnose-production-runtime-revision.mjs')));
    let runtime;
    try { runtime = await observeProductionRuntimeRevision(EXECUTOR_SHA); }
    catch { fail('TRANSPORT_RUNTIME_DRIFT'); }
    assertRuntime(runtime);
    const contract = JSON.parse(readFileSync(resolve(executor, 'scripts/hr-cutover/contracts/production-import-execution-v2.json'), 'utf8'));
    const allowed = approvedInventoryTarget(contract);
    // Scope selection comes only from the fixed execution contract. Inventory
    // rows remain inside this host process and never enter the public summary.
    assertScopedInventory(JSON.parse(privateRun('sh', [resolve(executor, 'scripts/diagnose-yuzhou-hr-production-target-inventory.sh'), 'report', deployPath, allowed.targetScopeSha256])), allowed);
    const pg = await import(pathToFileURL(resolve(executor, 'node_modules/pg/lib/index.js')));
    const env = JSON.parse(docker(['exec', 'jinhu-smart-park-prod-api', 'node', '-e', 'process.stdout.write(JSON.stringify({database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD}))']));
    const portLines = docker(['port', 'jinhu-smart-park-prod-postgres', '5432/tcp']).trim().split('\n');
    const port = Number(portLines[0]?.match(/:(\d+)$/u)?.[1]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !env.password || !env.database || !env.user) fail('TRANSPORT_DATABASE_UNAVAILABLE');
    const credentials = { formatVersion: 1, artifactKind: 'yuzhou_hr_production_import_postgres_credentials', host: '127.0.0.1', port, ...env, sslMode: 'disable' };
    const pool = new pg.default.Pool({ host: credentials.host, port, ...env, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000, options: '-c default_transaction_read_only=on' });
    let observed;
    try {
      const result = await pool.query('SELECT current_database() AS database, current_user AS "databaseUser", inet_server_addr()::text AS address, inet_server_port() AS port, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS "databaseOid"');
      observed = result.rows[0];
      if (result.rows.length !== 1 || observed.database !== env.database || observed.databaseUser !== env.user) fail('TRANSPORT_DATABASE_IDENTITY_MISMATCH');
      const socket = JSON.parse(docker(['exec', 'jinhu-smart-park-prod-postgres', 'sh', '-c', `exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT json_build_object('database',current_database(),'databaseUser',current_user,'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()))"`]));
      if (socket.database !== observed.database || socket.databaseUser !== observed.databaseUser || socket.databaseOid !== observed.databaseOid) fail('TRANSPORT_DATABASE_IDENTITY_MISMATCH');
    } finally { await pool.end(); }
    if (mode === 'prepare') {
      const manifest = await unpack(resolve(root, 'packet.bin'), resolve(root, 'transport-key.txt'), nonce, packetSha256, resolve(root, 'private'));
      if (manifest.kind === 'probe') {
        writePrivate(resolve(root, 'probe-receipt.json'), { code: 'TRANSPORT_PROBE_PASS', codeSha: EXECUTOR_SHA, packetSha256 });
        return { code: 'TRANSPORT_PROBE_PASS', codeSha: EXECUTOR_SHA, packetSha256, artifactCount: 0 };
      }
      const { config, runtimeEvidence, cryptoEnvelope, cryptoKeyFiles } = manifest.materials;
      if (!config || Object.hasOwn(config, 'execution') || config.executionIntent !== 'EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE') fail('TRANSPORT_CONFIG_INVALID');
      privateInfo(config.artifacts.sealedPlan.path);
      const plan = JSON.parse(readFileSync(config.artifacts.sealedPlan.path, 'utf8'));
      if (plan.triple.codeSha !== EXECUTOR_SHA || plan.target.identitySha256 !== allowed.identitySha256 || plan.targetScope.scopeSha256 !== allowed.targetScopeSha256) fail('TRANSPORT_PLAN_BINDING_MISMATCH');
      const binding = { formatVersion: 1, artifactKind: 'yuzhou_hr_production_import_database_binding', sealedPlanSha256: plan.sealing.sealedPlanSha256, binding: { database: observed.database, databaseUser: observed.databaseUser, targetIdentitySha256: allowed.identitySha256, targetScope: plan.targetScope, serverIdentity: { address: observed.address, port: observed.port, databaseOid: observed.databaseOid } } };
      const descriptor = (name, value) => {
        const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
        const path = resolve(root, 'private', name); writePrivate(path, bytes);
        return { path, sha256: hash(bytes) };
      };
      config.execution = { runtimeEvidence, cryptoEnvelope, cryptoKeyFiles, databaseBinding: descriptor('database-binding.json', binding), postgresCredentials: descriptor('postgres-credentials.json', credentials) };
      writePrivate(resolve(root, 'private', 'config.json'), config);
      const raw = privateRun(process.execPath, importNodeArguments(resolve(executor, 'scripts/hr-cutover/execute-production-import.mjs'), resolve(root, 'private', 'config.json')));
      const summary = JSON.parse(raw);
      if (summary.status !== 'STRUCTURE_READY' || summary.writeAttempted !== false) fail('TRANSPORT_PREPARE_HOLD');
      writePrivate(resolve(root, 'prepared.json'), { packetSha256, codeSha: EXECUTOR_SHA, configSha256: hash(readFileSync(resolve(root, 'private', 'config.json'))) });
      return { code: 'TRANSPORT_PREPARED', codeSha: EXECUTOR_SHA, packetSha256, recordCount: summary.recordCount };
    }
    privateInfo(resolve(root, 'prepared.json'));
    const prepared = JSON.parse(readFileSync(resolve(root, 'prepared.json'), 'utf8'));
    const configPath = resolve(root, 'private', 'config.json'); privateInfo(configPath);
    if (prepared.packetSha256 !== packetSha256 || prepared.codeSha !== EXECUTOR_SHA || prepared.configSha256 !== hash(readFileSync(configPath))) fail('TRANSPORT_PREPARED_BINDING_MISMATCH');
    assertImportMemoryCapacity(totalmem(), freemem());
    writePrivate(resolve(root, 'execution-claimed.json'), { packetSha256, codeSha: EXECUTOR_SHA });
    const raw = privateRun(process.execPath, importNodeArguments(resolve(executor, 'scripts/hr-cutover/execute-production-import.mjs'), configPath, true));
    const result = JSON.parse(raw);
    writePrivate(resolve(root, 'execution-receipt.json'), result);
    if (result.status !== 'SUCCEEDED' || result.fullProductMigrationComplete !== false) fail('TRANSPORT_EXECUTION_FAILED');
    // Reconcile control receipts through a fresh read-only connection. A failed
    // audit must never cause a retry of an already committed import.
    let reconciliation = { reconciliationStatus: 'REQUIRED' };
    const auditPool = new pg.default.Pool({ host: credentials.host, port, ...env, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000, options: '-c default_transaction_read_only=on' });
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      privateInfo(config.artifacts.sealedPlan.path);
      const bytes = readFileSync(config.artifacts.sealedPlan.path);
      if (hash(bytes) !== config.artifacts.sealedPlan.sha256) fail('TRANSPORT_PLAN_BINDING_MISMATCH');
      reconciliation = await reconcileCoreImport(auditPool, JSON.parse(bytes), result);
    } catch (error) {
      writePrivate(resolve(root, 'reconciliation-failure.log'), error?.stack ?? 'TRANSPORT_RECONCILIATION_REQUIRED');
    } finally {
      try { await auditPool.end(); }
      catch { reconciliation = { reconciliationStatus: 'REQUIRED' }; }
    }
    writePrivate(resolve(root, 'reconciliation-receipt.json'), reconciliation);
    return { code: 'TRANSPORT_EXECUTED_EXACT_SCOPE', codeSha: EXECUTOR_SHA, receiptSha256: result.receiptSha256, sealedPlanSha256: result.sealedPlanSha256, ...reconciliation };
  } catch (error) {
    if (!existsSync(log)) writePrivate(log, error?.stack ?? 'TRANSPORT_HOST_FAILED');
    throw error;
  } finally {
    rmSync(resolve(root, 'transport-key.txt'), { force: true });
    rmSync(resolve(root, 'packet.bin'), { force: true });
    // Retain the owned 0700 plaintext evidence and complete failure logs for the
    // custodian's recovery/retention policy; never upload them to Actions.
    if (existsSync(log)) chmodSync(log, 0o600);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runHost(...process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^(?:TRANSPORT|PRODUCTION_IMPORT)_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_HOST_FAILED' })}\n`); process.exitCode = 1; }
}
