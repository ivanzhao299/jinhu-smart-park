/* global process */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { totalmem, freemem } from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { inspectPayrollSimulationInputs } from './inspect-payroll-simulation-inputs.mjs';

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
export async function inspectCommittedImportIntegrity(client, operationId, scope) {
  const connection = await client.connect();
  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await connection.query('SET LOCAL statement_timeout=300000');
    await connection.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
    const readonly = (await connection.query("SELECT current_setting('transaction_read_only') readonly")).rows[0];
    if (readonly.readonly !== 'on') fail('TRANSPORT_AUDIT_NOT_READONLY');
    const core = (await connection.query(`SELECT
      (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1) records,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1) projection_receipts,
      (SELECT count(*)::int FROM (SELECT phase,source_identity_sha256 FROM hr_yuzhou_production_import_record WHERE operation_id=$1 GROUP BY phase,source_identity_sha256 HAVING count(*)>1) d) duplicate_source_keys,
      (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt p LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id WHERE p.operation_id=$1 AND (m.id IS NULL OR NOT m.is_active)) missing_active_maps`, [operationId])).rows[0];
    const payroll = (await connection.query(`SELECT status,
      hr_yuzhou_t4_followon_owned_state(operation_id)=owned_state AS owned_state_matches,
      (SELECT count(*)::int FROM hr_yuzhou_t4_followon_authorization_use a WHERE a.operation_id=o.operation_id AND intent='append') append_authorizations,
      (SELECT count(*)::int FROM hr_yuzhou_t4_followon_authorization_use a WHERE a.operation_id=o.operation_id AND intent='rollback') rollback_authorizations
      FROM hr_yuzhou_t4_followon_operation o WHERE parent_operation_id=$1 ORDER BY created_at`, [operationId])).rows;
    const extensions = (await connection.query(`SELECT status,
      hr_yuzhou_t5_followon_owned_state(operation_id)=owned_state AS owned_state_matches,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_source s WHERE s.operation_id=o.operation_id AND tenant_id=$2 AND park_id=$3) source_rows,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=o.operation_id) projection_receipts,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=o.operation_id AND disposition='quarantine') quarantined_projections,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=o.operation_id AND target_table='sys_file' AND disposition='insert') associated_files,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_authorization_use a WHERE a.operation_id=o.operation_id AND intent='append') append_authorizations,
      (SELECT count(*)::int FROM hr_yuzhou_t5_followon_authorization_use a WHERE a.operation_id=o.operation_id AND intent='rollback') rollback_authorizations,
      (SELECT count(*)::int FROM (SELECT source_table,source_identity_sha256 FROM hr_yuzhou_t5_followon_source s WHERE s.operation_id=o.operation_id GROUP BY source_table,source_identity_sha256 HAVING count(*)>1) d) duplicate_source_keys,
      (SELECT count(*)::int FROM (SELECT target_table,source_identity_sha256 FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=o.operation_id GROUP BY target_table,source_identity_sha256 HAVING count(*)>1) d) duplicate_projection_keys,
      EXISTS(SELECT 1 FROM hr_yuzhou_t4_followon_operation p WHERE p.operation_id=o.payroll_operation_id AND p.parent_operation_id=$1 AND p.status='succeeded') payroll_parent_succeeded
      FROM hr_yuzhou_t5_followon_operation o WHERE parent_operation_id=$1 AND binding->'targetScope'->>'tenantId'=$2 AND binding->'targetScope'->>'parkId'=$3 ORDER BY created_at`, [operationId, scope.tenantId, scope.parkId])).rows;
    const sourceDuplicates = (await connection.query(`SELECT count(*)::int duplicate_active_source_keys FROM (
      SELECT source_system,source_table,source_identity_sha256 FROM legacy_record_map
      WHERE is_active AND source_system='yuzhou-v10' AND batch_id IN (
        SELECT id FROM migration_batch WHERE production_import_operation_id=$1
        OR t4_followon_operation_id IN (SELECT operation_id FROM hr_yuzhou_t4_followon_operation WHERE parent_operation_id=$1)
        OR t5_followon_operation_id IN (SELECT operation_id FROM hr_yuzhou_t5_followon_operation WHERE parent_operation_id=$1))
      GROUP BY source_system,source_table,source_identity_sha256 HAVING count(*)>1) d`, [operationId])).rows[0];
    return { observedAt: new Date().toISOString(), transactionReadOnly: true, hashTimezone: 'Asia/Shanghai', core, payroll, extensions,
      ...sourceDuplicates, replayExecuted: false, physicalFileBytesReverified: false };
  } finally {
    try { await connection.query('ROLLBACK'); } finally { connection.release(); }
  }
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
  const known = /^(?:COALESCE|CASE|record|SELECT|missing|unsupported|date\/time|timestamp|not enough|aggregate|input of|bind message|more than|argument|column|relation|function|operator|permission denied|syntax error|cannot|invalid|current transaction|there is no|deadlock detected|canceling statement|out of memory|could not|duplicate key value|insert or update on table|new row for relation|type)/u;
  return messages.map(message => ({ code: /^T4_[A-Z0-9_]+$/u.test(message) ? message : null,
    category: known.test(message) ? message.replace(/"[^"]*"|'[^']*'/gu, '[redacted]').slice(0,180) : 'UNCLASSIFIED_SQL_ERROR',
    column: message.match(/^column "([a-z_][a-z0-9_]*)"/u)?.[1] ?? null,
    relation: message.match(/^relation "((?:public\.)?hr_[a-z0-9_]+)"/u)?.[1] ?? null }));
}
export async function auditQuarantineImpact(client, plan, readBundle, scope, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today)) fail('TRANSPORT_AUDIT_DATE_INVALID');
  const records = plan.phases.flatMap(phase => phase.records.filter(r => r.disposition === 'quarantine').map(r => ({ ...r, phase: phase.phase })));
  const actual = (await client.query(`SELECT phase,source_identity_sha256,planned_target_table FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND disposition='quarantine' ORDER BY phase,source_identity_sha256`, [plan.operationId])).rows;
  const actualKeys = new Set(actual.map(r => `${r.phase}:${r.source_identity_sha256}:${r.planned_target_table}`));
  if (actual.length !== records.length || records.some(r => !actualKeys.has(`${r.phase}:${r.sourceIdentitySha256}:${r.plannedTargetTable}`))) fail('TRANSPORT_AUDIT_QUARANTINE_DRIFT');
  const payloads = new Map();
  for (const phase of plan.phases) {
    const wanted = new Set(records.filter(r => r.phase === phase.phase).map(r => r.sourceIdentitySha256));
    const bundle = readBundle(phase.phase);
    for (const r of bundle.records) if (wanted.has(r.sourceIdentitySha256)) payloads.set(`${phase.phase}:${r.sourceIdentitySha256}`, r.payload);
  }
  if (payloads.size !== records.length) fail('TRANSPORT_AUDIT_QUARANTINE_DRIFT');
  const employeeRecords = records.filter(r => r.plannedTargetTable === 'hr_employee');
  const codes = employeeRecords.map(r => payloads.get(`${r.phase}:${r.sourceIdentitySha256}`).employee_code);
  if (codes.some(x => typeof x !== 'string' || !x)) fail('TRANSPORT_AUDIT_QUARANTINE_DRIFT');
  const employees = (await client.query(`SELECT employee_code,employment_status,user_id IS NOT NULL AS linked_account FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND employee_code=ANY($3::text[]) AND is_deleted=false`, [scope.tenantId,scope.parkId,codes])).rows;
  const current = new Set(employees.filter(e => e.employment_status !== 'departed' || e.linked_account).map(e => e.employee_code));
  const dependents = (await client.query(`SELECT count(*)::int count FROM hr_yuzhou_production_import_record_dependency d JOIN hr_yuzhou_production_import_record q ON (q.operation_id,q.phase,q.source_identity_sha256)=(d.operation_id,d.depends_on_phase,d.depends_on_source_identity_sha256) JOIN hr_yuzhou_production_import_record c ON (c.operation_id,c.phase,c.source_identity_sha256)=(d.operation_id,d.phase,d.source_identity_sha256) WHERE q.operation_id=$1 AND q.disposition='quarantine' AND c.disposition IN ('insert','merge') AND c.rollback_status='not_started'`, [plan.operationId])).rows[0].count;
  if (dependents !== 0) fail('TRANSPORT_AUDIT_QUARANTINE_DEPENDENTS');
  const isPast = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && value < today;
  const byKey = new Map(records.map(r => [`${r.phase}:${r.sourceIdentitySha256}`,r]));
  const decisions = new Map();
  function classify(r) {
    const key = `${r.phase}:${r.sourceIdentitySha256}`;
    if (decisions.has(key)) return decisions.get(key);
    const p = payloads.get(key); let decision = 'HISTORICAL_UNCERTAINTY_RETAINED';
    if (r.plannedTargetTable === 'hr_employee') {
      decision = current.has(p.employee_code) ? 'CURRENT_IMPACT_REVIEW' : p.employment_status === 'departed' && isPast(p.departure_date) ? 'ARCHIVED_HISTORICAL' : 'CURRENT_IMPACT_REVIEW';
    } else if (r.plannedTargetTable === 'hr_employment_event' && isPast(p.effective_date)) decision = 'ARCHIVED_HISTORICAL';
    else if (r.plannedTargetTable === 'hr_contract' && isPast(p.end_date)) decision = 'ARCHIVED_HISTORICAL';
    else if (r.plannedTargetTable === 'hr_contract_change' && isPast(p.new_end_date)) decision = 'ARCHIVED_HISTORICAL';
    else if (r.plannedTargetTable === 'hr_employee_insurance_period' && Number.isInteger(p.period_year) && p.period_year > 1900 && p.period_year < Number(today.slice(0,4))) decision = 'ARCHIVED_HISTORICAL';
    else if (r.plannedTargetTable === 'hr_employee_insurance_item') {
      const dep = r.dependencyRefs.find(d => d.role === 'period');
      const parent = dep && byKey.get(`${dep.phase}:${dep.sourceIdentitySha256}`);
      if (parent) decision = classify(parent);
    }
    decisions.set(key,decision); return decision;
  }
  const groups = new Map();
  for (const r of records) {
    const decision = classify(r), key = `${r.phase}:${r.plannedTargetTable}:${decision}`;
    const group = groups.get(key) ?? { phase:r.phase,targetTable:r.plannedTargetTable,decision,count:0 };
    group.count++; groups.set(key,group);
  }
  return { asOf:today,source:'committed_operation_and_hash_verified_private_payloads',total:records.length,activeDependents:dependents,currentEmployeeOrAccountMatches:current.size,groups:[...groups.values()],productionBusinessWrites:false };
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
  let quarantineImpact = null;
  try {
    const identity = (await client.query('SELECT current_database() AS database,current_user AS username,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,current_setting(\'default_transaction_read_only\') AS readonly')).rows[0];
    if (identity.database !== binding.database || identity.username !== binding.databaseUser || identity.oid !== binding.serverIdentity.databaseOid || identity.readonly !== 'on') fail('TRANSPORT_AUDIT_DATABASE_IDENTITY_DRIFT');
    database = await auditDatabase(client, operationId, sealedPlanHash, { ...allowed, codeSha: packet.EXECUTOR_SHA }, binding.targetScope);
    if (database.operationStatus === 'succeeded') {
      database.committedImportIntegrity = await inspectCommittedImportIntegrity(client,operationId,binding.targetScope);
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const availability = (await client.query(`SELECT
          (SELECT count(*)::int FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false) employees,
          (SELECT count(*)::int FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND employment_status IN ('preboarding','probation','active','suspended')) current_employees,
          (SELECT count(*)::int FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND user_id IS NOT NULL) account_linked_employees,
          (SELECT count(*)::int FROM hr_contract WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false) contracts,
          (SELECT count(*)::int FROM hr_payroll_legacy_snapshot WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false) payroll_snapshots,
          (SELECT count(*)::int FROM hr_payroll_legacy_snapshot_item WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false) payroll_items,
          (SELECT count(*)::int FROM hr_payroll_legacy_batch WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND status='published') published_history_batches`, [binding.targetScope.tenantId,binding.targetScope.parkId])).rows[0];
        const readable = (await client.query(`SELECT count(*)::int mapped_readable_snapshots,min(period.period_month)::text first_month,max(period.period_month)::text last_month
          FROM hr_payroll_legacy_snapshot snapshot
          JOIN hr_payroll_book_period period ON period.id=snapshot.book_period_id AND period.tenant_id=snapshot.tenant_id AND period.park_id=snapshot.park_id
          JOIN hr_payroll_book book ON book.id=period.book_id AND book.tenant_id=snapshot.tenant_id AND book.park_id=snapshot.park_id
          JOIN hr_payroll_legacy_batch batch ON batch.id=snapshot.batch_id AND batch.tenant_id=snapshot.tenant_id AND batch.park_id=snapshot.park_id
          JOIN hr_employee employee ON employee.id=snapshot.employee_id AND employee.tenant_id=snapshot.tenant_id AND employee.park_id=snapshot.park_id
          WHERE snapshot.tenant_id=$1 AND snapshot.park_id=$2 AND snapshot.is_deleted=false AND snapshot.mapping_status='mapped' AND period.is_deleted=false AND book.is_deleted=false AND batch.is_deleted=false AND employee.is_deleted=false`, [binding.targetScope.tenantId,binding.targetScope.parkId])).rows[0];
        database.historyReadModelAvailability = { ...availability,...readable,authenticatedApiUat:false };
        const plan = descriptor(config.artifacts.sealedPlan);
        if (plan.operationId !== operationId || plan.sealing.sealedPlanSha256 !== sealedPlanHash) fail('TRANSPORT_AUDIT_QUARANTINE_DRIFT');
        const today = (await client.query("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') today")).rows[0].today;
        quarantineImpact = await auditQuarantineImpact(client,plan,phase => descriptor(config.artifacts.payloadBundles[phase]),binding.targetScope,today);
      } finally { await client.query('ROLLBACK'); }
    }
    if (database.operationStatus === 'succeeded' && database.historyReadModelAvailability?.last_month) {
      const dedicated = await client.connect();
      try {
        database.payrollSimulationInputInventory = {
          ...(await inspectPayrollSimulationInputs(dedicated, {
            tenantId: binding.targetScope.tenantId, parkId: binding.targetScope.parkId,
            periodMonth: database.historyReadModelAvailability.last_month,
          })),
          periodSelection: 'LATEST_AVAILABLE_READ_ONLY_DIAGNOSTIC_NOT_BUSINESS_ACCEPTED',
        };
      } finally { dedicated.release(); }
    }

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
      // Observe only the backend holding this exact import scope's advisory lock.
      // Return a fixed technical category; never expose SQL text or bound values.
      const activeTransactions = (await client.query(`SELECT a.state,
        COALESCE(a.wait_event_type,'CPU_OR_IO') wait_type,COALESCE(a.wait_event,'none') wait_event,
        EXTRACT(EPOCH FROM clock_timestamp()-a.query_start)::int statement_seconds,
        EXTRACT(EPOCH FROM clock_timestamp()-a.xact_start)::int transaction_seconds,
        CASE WHEN a.query LIKE '%SELECT EXISTS(SELECT 1 FROM em WHERE n=1%' THEN 'CORE_EMPLOYEE_SCOPE_GUARD'
          WHEN a.query LIKE '%INSERT INTO hr_payroll_legacy_snapshot_item%' THEN 'WAGE_ITEM_INSERT'
          WHEN a.query LIKE '%hr_yuzhou_t4_followon_owned_state%' THEN 'OWNED_STATE_HASH'
          WHEN a.query LIKE '%INSERT INTO legacy_record_map%' THEN 'RECORD_MAP_INSERT'
          WHEN a.query LIKE '%CREATE TEMP TABLE em%' THEN 'CATALOG_AND_SNAPSHOT_INSERT'
          WHEN a.query LIKE '%CREATE TEMP TABLE%' OR a.query LIKE '%jsonb_array_elements($1::jsonb)%' THEN 'SOURCE_STAGE'
          ELSE 'OTHER_T4_STATEMENT' END technical_phase
        FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
        WHERE a.datname=current_database() AND l.locktype='advisory' AND l.granted AND l.objsubid=1
          AND l.classid::bigint=((hashtextextended($1,0)>>32)&4294967295)
          AND l.objid::bigint=(hashtextextended($1,0)&4294967295)`, ['yuzhou-t4:'+b.targetScopeSha256])).rows;
      const claimPath = resolve(followonRoot, 'execution-claimed.json');
      const claimed = existsSync(claimPath); const claim = claimed ? packet.privateInfo(claimPath) : null;
      const logs = spawnSync('docker', ['--host','unix:///var/run/docker.sock','logs','--since',new Date((claim?.mtimeMs ?? Date.now())-120000).toISOString(),'--tail','1000','jinhu-smart-park-prod-postgres'], { encoding: 'utf8', maxBuffer: 2*1024*1024 });
      if (logs.status !== 0) fail('TRANSPORT_AUDIT_POSTGRES_LOG_READ_FAILED');
      followon = { executionCodeSha: b.executionCodeSha, operationRows: operation.length, operationStatus: operation[0]?.status ?? 'absent',
        counts, activeTransactions, executionClaimExists: claimed, executionReceiptExists: existsSync(resolve(followonRoot,'execution-receipt.json')),
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
    failure, database, committedExecutionSummary, followon, quarantineImpact, resources: { hostMemoryBytes: totalmem(), hostFreeMemoryBytes: freemem(), nodeHeapLimitBytes: getHeapStatistics().heap_size_limit }, productionWriteAttempted: false };
}
export function remoteAuditSource() {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const localImport = /^import \{ inspectPayrollSimulationInputs \} from '\.\/inspect-payroll-simulation-inputs\.mjs';$/m;
  if ([...source.matchAll(new RegExp(localImport.source, 'gm'))].length !== 1) fail('TRANSPORT_AUDIT_HELPER_BINDING_INVALID');
  return source.replace(localImport, inspectPayrollSimulationInputs.toString());
}
function dispatch() {
  const e = process.env;
  const args = [e.TRANSPORT_NONCE, e.TRANSPORT_PACKET_SHA256, e.AUDIT_OPERATION_ID, e.AUDIT_SEALED_PLAN_SHA256];
  if (e.AUDIT_FOLLOWON_NONCE) args.push(e.AUDIT_FOLLOWON_NONCE);
  validateAuditArguments(args);
  if (!/^[A-Za-z0-9.-]+$/u.test(e.PROD_SSH_HOST ?? '') || !/^[A-Za-z0-9_-]+$/u.test(e.PROD_SSH_USER ?? '') || !/^\d{1,5}$/u.test(e.PROD_SSH_PORT ?? '')) fail('TRANSPORT_AUDIT_SSH_INVALID');
  const command = `node --input-type=module - ${args.map(x => `'${x}'`).join(' ')}`;
  const output = execFileSync('ssh', ['-p', e.PROD_SSH_PORT, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', `${e.PROD_SSH_USER}@${e.PROD_SSH_HOST}`, command],
    { input: remoteAuditSource(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, timeout: 600000 });
  const result = JSON.parse(output);
  if (result.code !== 'TRANSPORT_READONLY_AUDIT_COMPLETED' || result.productionWriteAttempted !== false) fail('TRANSPORT_AUDIT_RESULT_INVALID');
  return result;
}
if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  try { process.stdout.write(`${JSON.stringify(process.argv[2] === '--dispatch' ? dispatch() : await audit(process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ code: /^TRANSPORT_AUDIT_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'TRANSPORT_AUDIT_FAILED' })}\n`); process.exitCode = 1; }
}
