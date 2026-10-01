/* global process */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { totalmem, freemem } from 'node:os';
import { getHeapStatistics } from 'node:v8';

const fail = code => { throw Object.assign(new Error(code), { code }); };
export function validateAuditArguments([nonce, packetHash, operationId, sealedPlanHash]) {
  if (!/^[a-f0-9]{32}$/u.test(nonce ?? '') || !/^[a-f0-9]{64}$/u.test(packetHash ?? '')
    || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(operationId ?? '')
    || !/^[a-f0-9]{64}$/u.test(sealedPlanHash ?? '')) fail('TRANSPORT_AUDIT_ARGUMENT_INVALID');
  return { nonce, packetHash, operationId, sealedPlanHash };
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
async function audit(args) {
  const { nonce, packetHash, operationId, sealedPlanHash } = validateAuditArguments(args);
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
  try {
    const identity = (await client.query('SELECT current_database() AS database,current_user AS username,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,current_setting(\'default_transaction_read_only\') AS readonly')).rows[0];
    if (identity.database !== binding.database || identity.username !== binding.databaseUser || identity.oid !== binding.serverIdentity.databaseOid || identity.readonly !== 'on') fail('TRANSPORT_AUDIT_DATABASE_IDENTITY_DRIFT');
    database = await auditDatabase(client, operationId, sealedPlanHash, { ...allowed, codeSha: packet.EXECUTOR_SHA }, binding.targetScope);
  } finally { await client.end(); credentials.password = ''; }
  const failurePath = resolve(root, 'execute-failure.log');
  let failure = null;
  if (existsSync(failurePath)) { packet.privateInfo(failurePath); failure = summarizePrivateFailure(readFileSync(failurePath, 'utf8')); }
  return { code: 'TRANSPORT_READONLY_AUDIT_COMPLETED', codeSha: packet.EXECUTOR_SHA,
    executionClaimExists: existsSync(resolve(root, 'execution-claimed.json')), executionReceiptExists: existsSync(resolve(root, 'execution-receipt.json')),
    failure, database, resources: { hostMemoryBytes: totalmem(), hostFreeMemoryBytes: freemem(), nodeHeapLimitBytes: getHeapStatistics().heap_size_limit }, productionWriteAttempted: false };
}
function dispatch() {
  const e = process.env;
  const args = [e.TRANSPORT_NONCE, e.TRANSPORT_PACKET_SHA256, e.AUDIT_OPERATION_ID, e.AUDIT_SEALED_PLAN_SHA256];
  validateAuditArguments(args);
  if (!/^[A-Za-z0-9.-]+$/u.test(e.PROD_SSH_HOST ?? '') || !/^[A-Za-z0-9_-]+$/u.test(e.PROD_SSH_USER ?? '') || !/^\d{1,5}$/u.test(e.PROD_SSH_PORT ?? '')) fail('TRANSPORT_AUDIT_SSH_INVALID');
  const command = `node --input-type=module - ${args.map(x => `'${x}'`).join(' ')}`;
  const output = execFileSync('ssh', ['-p', e.PROD_SSH_PORT, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', `${e.PROD_SSH_USER}@${e.PROD_SSH_HOST}`, command],
    { input: readFileSync(new URL(import.meta.url)), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, timeout: 120000 });
  const result = JSON.parse(output);
  if (result.code !== 'TRANSPORT_READONLY_AUDIT_COMPLETED' || result.productionWriteAttempted !== false) fail('TRANSPORT_AUDIT_RESULT_INVALID');
  return result;
}
if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  try { process.stdout.write(`${JSON.stringify(process.argv[2] === '--dispatch' ? dispatch() : await audit(process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^TRANSPORT_AUDIT_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_AUDIT_FAILED' })}\n`); process.exitCode = 1; }
}
