/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { totalmem, freemem } from 'node:os';
import { getHeapStatistics } from 'node:v8';

const fail = code => { throw Object.assign(new Error(code), { code }); };
export function validateAuditArguments([nonce, packetHash, operationId, sealedPlanHash, followonNonce]) {
  if (!/^[a-f0-9]{32}$/u.test(nonce ?? '') || !/^[a-f0-9]{64}$/u.test(packetHash ?? '')
    || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(operationId ?? '')
    || !/^[a-f0-9]{64}$/u.test(sealedPlanHash ?? '')) fail('TRANSPORT_AUDIT_ARGUMENT_INVALID');
  if (followonNonce !== undefined && !/^[a-f0-9]{32}$/u.test(followonNonce)) fail('TRANSPORT_AUDIT_ARGUMENT_INVALID');
  return { nonce, packetHash, operationId, sealedPlanHash, followonNonce };
}
export function summarizePrivateFailure(text) {
  return {
    heapExhausted: /heap out of memory|Reached heap limit|Ineffective mark-compacts near heap limit/u.test(text),
    processKilled: /\bSIGKILL\b|\bSIGABRT\b/u.test(text),
    reasonCodes: [...new Set(text.match(/\bPRODUCTION_IMPORT_[A-Z0-9_]+\b/gu) ?? [])].sort(),
    sqlStates: [...new Set([...text.matchAll(/\bcode\s*:\s*['"]([0-9A-Z]{5})['"]/gu)].map(x => x[1]))].sort(),
  };
}
export async function auditDatabase(client, operationId, sealedPlanHash, expected, scope) {
  const op = (await client.query('SELECT status,code_sha,sealed_plan_sha256,target_identity_sha256,target_scope_sha256 FROM hr_yuzhou_production_import_operation WHERE operation_id=$1', [operationId])).rows;
  if (op.length > 1 || op.some(x => x.code_sha !== expected.codeSha || x.sealed_plan_sha256 !== sealedPlanHash
    || x.target_identity_sha256 !== expected.identitySha256 || x.target_scope_sha256 !== expected.targetScopeSha256
    || !['authorized', 'succeeded', 'failed', 'running'].includes(x.status))) fail('TRANSPORT_AUDIT_OPERATION_DRIFT');
  const phases = (await client.query('SELECT phase,status,planned_record_count,applied_record_count FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase', [operationId])).rows;
  if (phases.some(x => !['T0', 'T1', 'T2', 'T3'].includes(x.phase) || !['planned', 'running', 'succeeded', 'rolling_back', 'rolled_back'].includes(x.status))) fail('TRANSPORT_AUDIT_PHASE_DRIFT');
  const records = (await client.query('SELECT count(*)::int AS count FROM hr_yuzhou_production_import_record WHERE operation_id=$1', [operationId])).rows;
  const employees = (await client.query('SELECT count(*)::int AS count FROM hr_employee WHERE tenant_id=$1 AND park_id=$2', [scope.tenantId, scope.parkId])).rows;
  return { operationRows: op.length, operationStatus: op[0]?.status ?? 'absent', recordCount: records[0].count,
    selectedScopeEmployeeCount: employees[0].count, phases: phases.map(x => ({ phase: x.phase, status: x.status, plannedCount: Number(x.planned_record_count), appliedCount: Number(x.applied_record_count) })) };
}
export function recoverCommittedSummary(result, reconciliation, database, codeSha, sealedPlanHash, scopeHash) {
  if (result?.status !== 'SUCCEEDED' || result.mode !== 'execute' || result.productionImportExecuted !== true
    || result.fullProductMigrationComplete !== false || result.sealedPlanSha256 !== sealedPlanHash
    || result.targetScopeSha256 !== scopeHash || !/^[a-f0-9]{64}$/u.test(result.receiptSha256 ?? '')
    || reconciliation?.reconciliationStatus !== 'PASS' || database.operationRows !== 1 || database.operationStatus !== 'succeeded'
    || reconciliation.sourceRecordCount !== database.recordCount || reconciliation.employeesInserted !== database.selectedScopeEmployeeCount
    || reconciliation.insertedCount + reconciliation.quarantinedCount !== database.recordCount
    || database.phases.length !== 4 || database.phases.some(x => x.status !== 'succeeded' || x.plannedCount !== x.appliedCount)
    || reconciliation.verifiedPhaseCount !== 4) fail('TRANSPORT_AUDIT_COMMITTED_RECEIPT_DRIFT');
  return { code: 'TRANSPORT_EXECUTED_EXACT_SCOPE', codeSha, receiptSha256: result.receiptSha256,
    sealedPlanSha256: result.sealedPlanSha256, ...reconciliation };
}
export function summarizeSqlErrors(text) {
  const messages = text.split('\n').map(line => line.match(/\bERROR:\s+(.*)$/u)?.[1]).filter(Boolean);
  const known = /^(?:column|relation|function|operator|permission denied|syntax error|cannot execute|invalid transaction|current transaction|there is no|deadlock detected|canceling statement|out of memory|could not|duplicate key value|insert or update on table|new row for relation|invalid input syntax|type)/u;
  return messages.map(message => ({ code: /^T4_[A-Z0-9_]+$/u.test(message) ? message : null,
    category: known.test(message) ? message.replace(/"[^"]*"|'[^']*'/gu, '[redacted]').slice(0,180) : 'UNCLASSIFIED_SQL_ERROR',
    column: message.match(/^column "([a-z_][a-z0-9_]*)"/u)?.[1] ?? null,
    relation: message.match(/^relation "((?:public\.)?hr_[a-z0-9_]+)"/u)?.[1] ?? null }));
}
async function audit(args) {
  const { nonce, packetHash, operationId, sealedPlanHash, followonNonce } = validateAuditArguments(args);
  const root = `/tmp/jinhu-yuzhou-import-${nonce}`;
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail('TRANSPORT_AUDIT_ROOT_UNSAFE');
  const packet = await import(pathToFileURL(resolve(root, 'yuzhou-private-import-packet.mjs')));
  const host = await import(pathToFileURL(resolve(root, 'yuzhou-private-import-host.mjs')));
  const executor = resolve(root, 'executor'); host.assertExecutorRoot(executor);
  const readPrivate = path => { packet.privateInfo(path); return JSON.parse(readFileSync(path, 'utf8')); };
  const prepared = readPrivate(resolve(root, 'prepared.json'));
  const configPath = resolve(root, 'private/config.json');
  if (prepared.packetSha256 !== packetHash || prepared.codeSha !== packet.EXECUTOR_SHA || prepared.configSha256 !== packet.hash(readFileSync(configPath))) fail('TRANSPORT_AUDIT_PREPARED_DRIFT');
  const config = readPrivate(configPath);
  const descriptor = d => {
    if (!d?.path?.startsWith(`${root}/private/`)) fail('TRANSPORT_AUDIT_DESCRIPTOR_INVALID');
    const v = readPrivate(d.path);
    if (packet.hash(readFileSync(d.path)) !== d.sha256) fail('TRANSPORT_AUDIT_DESCRIPTOR_DRIFT');
    return v;
  };
  const credentials = descriptor(config.execution.postgresCredentials);
  const binding = descriptor(config.execution.databaseBinding).binding;
  const contract = JSON.parse(readFileSync(resolve(executor, 'scripts/hr-cutover/contracts/production-import-execution-v2.json'), 'utf8'));
  const allowed = host.approvedInventoryTarget(contract);
  if (binding.targetIdentitySha256 !== allowed.identitySha256 || binding.targetScope.scopeSha256 !== allowed.targetScopeSha256
    || credentials.host !== '127.0.0.1') fail('TRANSPORT_AUDIT_TARGET_DRIFT');
  const pg = await import(pathToFileURL(resolve(executor, 'node_modules/pg/lib/index.js')));
  const client = new pg.default.Pool({ host: credentials.host, port: credentials.port, database: credentials.database,
    user: credentials.user, password: credentials.password, max: 1, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, options: '-c default_transaction_read_only=on' });
  let database;
  let followon = null;
  try {
    const identity = (await client.query('SELECT current_database() AS database,current_user AS username,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,current_setting(\'default_transaction_read_only\') AS readonly')).rows[0];
    if (identity.database !== binding.database || identity.username !== binding.databaseUser || identity.oid !== binding.serverIdentity.databaseOid || identity.readonly !== 'on') fail('TRANSPORT_AUDIT_DATABASE_IDENTITY_DRIFT');
    database = await auditDatabase(client, operationId, sealedPlanHash, { ...allowed, codeSha: packet.EXECUTOR_SHA }, binding.targetScope);
    if (database.operationStatus === 'succeeded') {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const checksumSql = `SELECT count(*)::text count,
          encode(digest(COALESCE(string_agg(encode(digest(jsonb_build_object('record',to_jsonb(r),'map',to_jsonb(m),'employee',to_jsonb(e))::text,'sha256'),'hex'),'' ORDER BY r.phase,r.source_identity_sha256),''),'sha256'),'hex') sha256
          FROM hr_yuzhou_production_import_record r
          LEFT JOIN hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
          LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
          LEFT JOIN hr_employee e ON r.target_table='hr_employee' AND e.id=r.target_id
          WHERE r.operation_id=$1`;
        await client.query('SET LOCAL statement_timeout=300000');
        const defaultTimezone = (await client.query("SELECT current_setting('TimeZone') AS timezone")).rows[0].timezone;
        const defaults = (await client.query(checksumSql, [operationId])).rows[0];
        await client.query("SELECT set_config('TimeZone','Asia/Shanghai',true)");
        const business = (await client.query(checksumSql, [operationId])).rows[0];
        database.readonlyTimezoneChecksumComparison = { defaultTimezone, defaultRecordSetSha256: defaults.sha256,
          businessTimezone: 'Asia/Shanghai', businessRecordSetSha256: business.sha256,
          defaultCount: Number(defaults.count), businessCount: Number(business.count), sameReadOnlySnapshot: true };
      } finally { await client.query('ROLLBACK'); }
    }


    if (followonNonce) {
      const followonRoot = `/tmp/jinhu-yuzhou-t4-${followonNonce}`;
      const st = lstatSync(followonRoot);
      if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700) fail('TRANSPORT_AUDIT_ROOT_UNSAFE');
      const preparedT4 = readPrivate(resolve(followonRoot, 'prepared.json'));
      const configT4Path = resolve(followonRoot, 'private/config.json');
      if (packet.hash(readFileSync(configT4Path)) !== preparedT4.configSha256) fail('TRANSPORT_AUDIT_PREPARED_DRIFT');
      const cfg = readPrivate(configT4Path);
      const readT4Descriptor = d => {
        if (!d.path.startsWith(`${followonRoot}/private/`) || packet.hash(readFileSync(d.path)) !== d.sha256) fail('TRANSPORT_AUDIT_DESCRIPTOR_DRIFT');
        return readPrivate(d.path);
      };
      const b = readT4Descriptor(cfg.binding);
      if (b.executionCodeSha !== preparedT4.codeSha || b.parent.operationId !== operationId || b.parent.sealedPlanSha256 !== sealedPlanHash
        || b.targetIdentitySha256 !== allowed.identitySha256 || b.targetScopeSha256 !== allowed.targetScopeSha256) fail('TRANSPORT_AUDIT_TARGET_DRIFT');
      const operation = (await client.query('SELECT status,binding_sha256,parent_operation_id FROM hr_yuzhou_t4_followon_operation WHERE operation_id=$1', [b.operationId])).rows;
      const counts = (await client.query(`SELECT
        (SELECT count(*)::int FROM hr_yuzhou_t4_followon_authorization_use WHERE operation_id=$1) authorization_uses,
        (SELECT count(*)::int FROM hr_payroll_legacy_snapshot WHERE tenant_id=$2 AND park_id=$3) snapshots,
        (SELECT count(*)::int FROM hr_payroll_legacy_snapshot_item WHERE tenant_id=$2 AND park_id=$3) snapshot_items,
        (SELECT count(*)::int FROM hr_payroll_legacy_batch WHERE batch_code=$1 AND tenant_id=$2 AND park_id=$3) batches`, [b.operationId, b.targetScope.tenantId, b.targetScope.parkId])).rows[0];
      const claimPath = resolve(followonRoot, 'execution-claimed.json');
      const claimed = existsSync(claimPath); const claim = claimed ? packet.privateInfo(claimPath) : null;
      const logs = spawnSync('docker', ['--host','unix:///var/run/docker.sock','logs','--since',new Date((claim?.mtimeMs ?? Date.now())-120000).toISOString(),'--tail','1000','jinhu-smart-park-prod-postgres'], { encoding: 'utf8', maxBuffer: 2*1024*1024 });
      if (logs.status !== 0) fail('TRANSPORT_AUDIT_POSTGRES_LOG_READ_FAILED');
      followon = { executionCodeSha: b.executionCodeSha, operationRows: operation.length, operationStatus: operation[0]?.status ?? 'absent',
        counts, executionClaimExists: claimed, executionReceiptExists: existsSync(resolve(followonRoot,'execution-receipt.json')),
        sqlErrors: summarizeSqlErrors(`${logs.stdout ?? ''}\n${logs.stderr ?? ''}`) };
    }
  } finally { await client.end(); credentials.password = ''; }
  let committedExecutionSummary = null;
  if (existsSync(resolve(root, 'execution-receipt.json')) && existsSync(resolve(root, 'reconciliation-receipt.json'))) {
    committedExecutionSummary = recoverCommittedSummary(readPrivate(resolve(root, 'execution-receipt.json')),
      readPrivate(resolve(root, 'reconciliation-receipt.json')), database, packet.EXECUTOR_SHA, sealedPlanHash, allowed.targetScopeSha256);
  }
  const failurePath = resolve(root, 'execute-failure.log');
  let failure = null;
  if (existsSync(failurePath)) { packet.privateInfo(failurePath); failure = summarizePrivateFailure(readFileSync(failurePath, 'utf8')); }
  return { code: 'TRANSPORT_READONLY_AUDIT_COMPLETED', codeSha: packet.EXECUTOR_SHA,
    executionClaimExists: existsSync(resolve(root, 'execution-claimed.json')), executionReceiptExists: existsSync(resolve(root, 'execution-receipt.json')),
    failure, database, committedExecutionSummary, followon, resources: { hostMemoryBytes: totalmem(), hostFreeMemoryBytes: freemem(), nodeHeapLimitBytes: getHeapStatistics().heap_size_limit }, productionWriteAttempted: false };
}
function dispatch() {
  const e = process.env;
  const args = [e.TRANSPORT_NONCE, e.TRANSPORT_PACKET_SHA256, e.AUDIT_OPERATION_ID, e.AUDIT_SEALED_PLAN_SHA256];
  if (e.AUDIT_FOLLOWON_NONCE) args.push(e.AUDIT_FOLLOWON_NONCE);
  validateAuditArguments(args);
  if (!/^[A-Za-z0-9.-]+$/u.test(e.PROD_SSH_HOST ?? '') || !/^[A-Za-z0-9_-]+$/u.test(e.PROD_SSH_USER ?? '') || !/^\d{1,5}$/u.test(e.PROD_SSH_PORT ?? '')) fail('TRANSPORT_AUDIT_SSH_INVALID');
  const command = `node --input-type=module - ${args.map(x => `'${x}'`).join(' ')}`;
  const output = execFileSync('ssh', ['-p', e.PROD_SSH_PORT, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', `${e.PROD_SSH_USER}@${e.PROD_SSH_HOST}`, command],
    { input: readFileSync(new URL(import.meta.url)), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, timeout: 600000 });
  const result = JSON.parse(output);
  if (result.code !== 'TRANSPORT_READONLY_AUDIT_COMPLETED' || result.productionWriteAttempted !== false) fail('TRANSPORT_AUDIT_RESULT_INVALID');
  return result;
}
if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  try { process.stdout.write(`${JSON.stringify(process.argv[2] === '--dispatch' ? dispatch() : await audit(process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^TRANSPORT_AUDIT_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_AUDIT_FAILED' })}\n`); process.exitCode = 1; }
}
