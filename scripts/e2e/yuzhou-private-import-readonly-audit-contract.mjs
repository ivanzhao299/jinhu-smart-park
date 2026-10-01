import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAuditArguments, summarizePrivateFailure, auditDatabase, recoverCommittedSummary } from '../hr-cutover/yuzhou-private-import-readonly-audit.mjs';
const args = ['a'.repeat(32), 'b'.repeat(64), 'yzprod-import-20261002T010203Z-abcdefabcdef', 'c'.repeat(64)];
const expected = { codeSha: 'd'.repeat(40), identitySha256: 'e'.repeat(64), targetScopeSha256: 'f'.repeat(64) };
const scope = { tenantId: 'tenant-fixture', parkId: 'park-fixture' };
test('rejects traversal and shell fragments before SSH', () => {
  assert.equal(validateAuditArguments(args).operationId, args[2]);
  for (let i = 0; i < args.length; i++) { const bad = [...args]; bad[i] += "';x"; assert.throws(() => validateAuditArguments(bad)); }
});
test('failure summary excludes private rows and raw messages', () => {
  const result = summarizePrivateFailure("private-person-name phone=123456 password=private-secret\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\ncode: '42501'\nPRODUCTION_IMPORT_FIXTURE_DENIED");
  assert.equal(result.heapExhausted, true); assert.deepEqual(result.sqlStates, ['42501']);
  assert.deepEqual(result.reasonCodes, ['PRODUCTION_IMPORT_FIXTURE_DENIED']);
  assert.doesNotMatch(JSON.stringify(result), /private-person|123456|private-secret/);
});
function clientFor(rows) {
  const calls = [];
  return { calls, async query(sql, params) { assert.match(sql, /^SELECT /u); calls.push({ sql, params }); return { rows: rows[calls.length - 1] }; } };
}
test('reports absent operation without awarding import success', async () => {
  const client = clientFor([[], [], [{ count: 0 }], [{ count: 0 }]]);
  const result = await auditDatabase(client, args[2], args[3], expected, scope);
  assert.equal(result.operationStatus, 'absent'); assert.equal(result.recordCount, 0); assert.equal(result.selectedScopeEmployeeCount, 0);
  assert.deepEqual(client.calls[3].params, ['tenant-fixture', 'park-fixture']);
});
test('recognizes independently observed committed operation', async () => {
  const client = clientFor([[{ status: 'succeeded', code_sha: expected.codeSha, sealed_plan_sha256: args[3], target_identity_sha256: expected.identitySha256, target_scope_sha256: expected.targetScopeSha256 }],
    ['T0', 'T1', 'T2', 'T3'].map(phase => ({ phase, status: 'succeeded', planned_record_count: '10', applied_record_count: '10' })), [{ count: 40 }], [{ count: 3 }]]);
  const result = await auditDatabase(client, args[2], args[3], expected, scope);
  assert.equal(result.operationStatus, 'succeeded'); assert.equal(result.phases.length, 4); assert.equal(result.recordCount, 40);
});
test('rejects wrong target or sealed plan before further queries', async () => {
  for (const key of ['code_sha', 'sealed_plan_sha256', 'target_identity_sha256', 'target_scope_sha256']) {
    const row = { status: 'succeeded', code_sha: expected.codeSha, sealed_plan_sha256: args[3], target_identity_sha256: expected.identitySha256, target_scope_sha256: expected.targetScopeSha256, [key]: 'wrong' };
    const client = clientFor([[row]]); await assert.rejects(auditDatabase(client, args[2], args[3], expected, scope)); assert.equal(client.calls.length, 1);
  }
});
test('forces read-only connection and never invokes the writer', () => {
  const source = readFileSync(new URL('../hr-cutover/yuzhou-private-import-readonly-audit.mjs', import.meta.url), 'utf8');
  assert.match(source, /default_transaction_read_only=on/u);
  assert.doesNotMatch(source, /writePrivate|writeFile|--execute|runHost\(/u);
});

test('recovers genuine aggregate receipt and rejects masked or inconsistent evidence', () => {
  const result = { status: 'SUCCEEDED', mode: 'execute', productionImportExecuted: true, fullProductMigrationComplete: false, sealedPlanSha256: args[3], targetScopeSha256: expected.targetScopeSha256, receiptSha256: 'a'.repeat(64) };
  const recon = { reconciliationStatus: 'PASS', sourceRecordCount: 40, insertedCount: 39, quarantinedCount: 1, employeesInserted: 3, verifiedPhaseCount: 4 };
  const database = { operationRows: 1, operationStatus: 'succeeded', recordCount: 40, selectedScopeEmployeeCount: 3, phases: ['T0','T1','T2','T3'].map(phase => ({ phase, status: 'succeeded', plannedCount: 10, appliedCount: 10 })) };
  const recover = (r = result, a = recon, d = database) => recoverCommittedSummary(r, a, d, expected.codeSha, args[3], expected.targetScopeSha256);
  assert.equal(recover().receiptSha256, result.receiptSha256);
  assert.throws(() => recover({ ...result, receiptSha256: 'masked***' }));
  assert.throws(() => recover(result, { ...recon, insertedCount: 38 }));
  assert.throws(() => recover(result, recon, { ...database, operationStatus: 'authorized' }));
  assert.throws(() => recover({ ...result, sealedPlanSha256: 'b'.repeat(64) }));
});
