import { URL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAuditArguments, summarizePrivateFailure, auditDatabase, recoverCommittedSummary, summarizeSqlErrors, auditQuarantineImpact, remoteAuditSource, inspectCommittedImportIntegrity, inspectContractSuccessorImpact } from '../hr-cutover/yuzhou-private-import-readonly-audit.mjs';
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

test('optional T4 nonce cannot escape its owned directory and SQL errors exclude private values', () => {
  assert.equal(validateAuditArguments([...args, 'e'.repeat(32)]).followonNonce, 'e'.repeat(32));
  assert.throws(() => validateAuditArguments([...args, "../invalid"]));
  const summary = summarizeSqlErrors(`ERROR: column "fixture_column" does not exist\nERROR: invalid input syntax for type integer: 'private-person-value'\nDETAIL: personal-phone=123456`);
  assert.equal(summary[0].column, 'fixture_column');
  assert.doesNotMatch(JSON.stringify(summary), /private-person-value|123456|personal-phone/u);
});

function impactFixture(currentEmployees = [], activeDependents = 0) {
  const rows = [
    { phase:'T0',sourceIdentitySha256:'employee',plannedTargetTable:'hr_employee',disposition:'quarantine',dependencyRefs:[],payload:{employee_code:'private-fixture',employment_status:'departed',departure_date:'2020-01-01'} },
    { phase:'T3',sourceIdentitySha256:'period',plannedTargetTable:'hr_employee_insurance_period',disposition:'quarantine',dependencyRefs:[],payload:{period_year:2018} },
    { phase:'T3',sourceIdentitySha256:'item',plannedTargetTable:'hr_employee_insurance_item',disposition:'quarantine',dependencyRefs:[{role:'period',phase:'T3',sourceIdentitySha256:'period'}],payload:{} },
    { phase:'T3',sourceIdentitySha256:'invalid',plannedTargetTable:'hr_employee_insurance_period',disposition:'quarantine',dependencyRefs:[],payload:{} }
  ];
  const plan = { operationId:args[2], phases:['T0','T3'].map(phase => ({phase,records:rows.filter(r => r.phase === phase)})) };
  const client = clientFor([rows.map(r => ({phase:r.phase,source_identity_sha256:r.sourceIdentitySha256,planned_target_table:r.plannedTargetTable})),currentEmployees,[{count:activeDependents}]]);
  return {plan,client,readBundle:phase => ({records:rows.filter(r => r.phase === phase).map(r => ({sourceIdentitySha256:r.sourceIdentitySha256,payload:r.payload}))})};
}
test('historical quarantine archive retains invalid periods and follows parent dependencies without private output', async () => {
  const f = impactFixture();
  const result = await auditQuarantineImpact(f.client,f.plan,f.readBundle,scope,'2026-10-02');
  assert.equal(result.total,4);
  assert.equal(result.groups.filter(g => g.decision === 'ARCHIVED_HISTORICAL').reduce((n,g) => n+g.count,0),3);
  assert.equal(result.groups.filter(g => g.decision === 'HISTORICAL_UNCERTAINTY_RETAINED').reduce((n,g) => n+g.count,0),1);
  assert.doesNotMatch(JSON.stringify(result),/private-fixture|sourceIdentity|employee_code/);
});
test('current employee or linked account prevents historical employee auto-close', async () => {
  for (const employee of [{employee_code:'private-fixture',employment_status:'active',linked_account:false},{employee_code:'private-fixture',employment_status:'departed',linked_account:true}]) {
    const f = impactFixture([employee]);
    const result = await auditQuarantineImpact(f.client,f.plan,f.readBundle,scope,'2026-10-02');
    assert.equal(result.groups.find(g => g.targetTable === 'hr_employee').decision,'CURRENT_IMPACT_REVIEW');
  }
});
test('committed quarantine drift or active dependent rejects impact classification', async () => {
  const f = impactFixture([],1);
  await assert.rejects(auditQuarantineImpact(f.client,f.plan,f.readBundle,scope,'2026-10-02'),/TRANSPORT_AUDIT_QUARANTINE_DEPENDENTS/);
  const g = impactFixture();g.plan.phases[0].records[0].sourceIdentitySha256='tampered';
  await assert.rejects(auditQuarantineImpact(g.client,g.plan,g.readBundle,scope,'2026-10-02'),/TRANSPORT_AUDIT_QUARANTINE_DRIFT/);
});


test('remote source embeds exact read-only inventory helper without unresolved local import', () => {
  const source=remoteAuditSource();
  assert.match(source,/async function inspectPayrollSimulationInputs/);
  assert.doesNotMatch(source,/^import \{ inspectPayrollSimulationInputs \} from/m);
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source,/finally \{if\(begun\)await client.query\("ROLLBACK"\);\}/);
  assert.match(source,/dedicated.release\(\)/);
  assert.match(source,/LATEST_AVAILABLE_READ_ONLY_DIAGNOSTIC_NOT_BUSINESS_ACCEPTED/);
  assert.doesNotMatch(source,/simulationReady:true|paymentEnabled:true|--execute/);
});

test('committed integrity uses a dedicated read-only transaction and releases after failure', async () => {
  const calls=[];let released=false;
  const connection={async query(sql) {calls.push(sql);if(sql.includes('current_setting'))return{rows:[{readonly:'off'}]};return{rows:[]};},release(){released=true;}};
  await assert.rejects(inspectCommittedImportIntegrity({async connect(){return connection;}},args[2],scope),/TRANSPORT_AUDIT_NOT_READONLY/);
  assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true);
  assert.equal(calls.some(s=>s.includes('owned_state')),false);
});
test('committed integrity compares retained owned state and counts duplicates without replay', async () => {
 const calls=[];let released=false;
 const rows=[[{readonly:'on'}],[{records:40,projection_receipts:40,duplicate_source_keys:0,missing_active_maps:0}],[{status:'succeeded',owned_state_matches:true}],[{status:'succeeded',owned_state_matches:true,source_rows:10}],[{duplicate_active_source_keys:0}]];
 const connection={async query(sql,params){calls.push({sql,params});if(/^SELECT/u.test(sql))return{rows:rows.shift()};return{rows:[]};},release(){released=true;}};
 const result=await inspectCommittedImportIntegrity({async connect(){return connection;}},args[2],scope);
 assert.equal(result.transactionReadOnly,true);assert.equal(result.replayExecuted,false);
 assert.equal(result.extensions[0].source_rows,10);assert.equal(result.physicalFileBytesReverified,false);
 assert.equal(released,true);assert.equal(calls.at(-1).sql,'ROLLBACK');
 for(const call of calls)assert.match(call.sql,/^(?:SELECT|BEGIN|SET LOCAL|ROLLBACK)/);
 assert.deepEqual(calls.find(c=>c.sql.includes('duplicate_active_source_keys')).params,[args[2]]);
});

const contractCounts={current_range_employees:10,historical_active_contracts:4,employees_with_historical_active:3,ended_before_as_of:1,ending_on_or_after_as_of:2,missing_end_date:1,employees_with_multiple_active:1,employees_with_online_contract:1};
test('contract successor census conserves dated and unknown contracts without exposing rows',async()=>{
 const calls=[];const client={async query(sql,params){calls.push({sql,params});return{rows:[sql.startsWith('SELECT current_setting')?{readonly:'on'}:{...contractCounts,private_person:'fixture-secret'}]};}};
 const result=await inspectContractSuccessorImpact(client,scope,'2026-10-03');assert.equal(result.historical_active_contracts,4);assert.equal(result.productionBusinessWrites,false);assert.equal(result.authenticatedWorkflowAcceptance,false);assert.doesNotMatch(JSON.stringify(result),/fixture-secret|private_person/);assert.deepEqual(calls[1].params,[scope.tenantId,scope.parkId,'2026-10-03']);assert.match(calls[1].sql,/c.tenant_id=\$1 AND c.park_id=\$2/);assert.match(calls[1].sql,/end_date<\$3::date/);assert.match(calls[1].sql,/end_date>=\$3::date/);assert.match(calls[1].sql,/end_date IS NULL/);
});
test('contract successor census refuses write-enabled connections before business query',async()=>{let calls=0;await assert.rejects(inspectContractSuccessorImpact({async query(){calls++;return{rows:[{readonly:'off'}]};}},scope,'2026-10-03'),/NOT_READONLY/);assert.equal(calls,1);});
test('contract successor census rejects inconsistent counts and unsafe dates',async()=>{for(const counts of [{...contractCounts,missing_end_date:2},{...contractCounts,employees_with_historical_active:11},{...contractCounts,ended_before_as_of:-1}]){await assert.rejects(inspectContractSuccessorImpact({async query(sql){return{rows:[sql.startsWith('SELECT current_setting')?{readonly:'on'}:counts]};}},scope,'2026-10-03'),/CONTRACT_COUNTS_INVALID/);}await assert.rejects(inspectContractSuccessorImpact({},scope,"2026-10-03';x"),/CONTRACT_DATE_INVALID/);});
