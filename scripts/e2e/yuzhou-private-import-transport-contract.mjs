/* global Buffer, process, structuredClone */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync, statSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXECUTOR_SHA, hash, pack, unpack, validateManifest, nonceRoot, privateInfo } from '../hr-cutover/yuzhou-private-import-packet.mjs';
import { assertExecutorRoot, assertRuntime, approvedInventoryTarget, assertScopedInventory, reconcileCoreImport } from '../hr-cutover/yuzhou-private-import-host.mjs';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'yuzhou-transport-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const artifact = resolve(root, 'source.json');
  const bytes = Buffer.from('{"synthetic":"private-fixture-only"}\n');
  writeFileSync(artifact, bytes, { mode: 0o600 });
  return { root, artifact, bytes, output: resolve(root, 'packet'), request: { kind: 'import', materials: { config: { artifacts: { example: { path: artifact, sha256: hash(bytes) } } } } } };
}
test('authenticated packet round trip preserves bytes and restricts paths/permissions', async t => {
  const f = fixture(t); const r = await pack(f.request, f.output);
  const destination = resolve(f.root, 'received');
  const m = await unpack(resolve(f.output, 'packet.bin'), resolve(f.output, 'transport-key.txt'), r.nonce, r.packetSha256, destination);
  assert.deepEqual(readFileSync(m.materials.config.artifacts.example.path), f.bytes);
  assert.equal(statSync(destination).mode & 0o777, 0o700);
  assert.equal(statSync(m.materials.config.artifacts.example.path).mode & 0o777, 0o600);
  assert.equal(existsSync(resolve(destination, 'authenticated.tmp')), false);
  assert.equal(readFileSync(resolve(f.output, 'packet.bin')).includes(f.bytes), false);
});
test('empty probe packet traverses same authenticated transport without business artifacts', async t => {
  const f = fixture(t); const r = await pack({ kind: 'probe' }, f.output);
  const m = await unpack(resolve(f.output, 'packet.bin'), resolve(f.output, 'transport-key.txt'), r.nonce, r.packetSha256, resolve(f.root, 'received'));
  assert.equal(m.kind, 'probe'); assert.deepEqual(m.files, []); assert.equal(m.materials, null);
});
test('changed ciphertext fails authentication even with recomputed ciphertext checksum', async t => {
  const f = fixture(t); const r = await pack(f.request, f.output);
  const packet = resolve(f.output, 'packet.bin'); const b = readFileSync(packet); b[25] ^= 1; writeFileSync(packet, b);
  const destination = resolve(f.root, 'received');
  await assert.rejects(unpack(packet, resolve(f.output, 'transport-key.txt'), r.nonce, hash(b), destination));
  assert.equal(existsSync(destination), false);
});
test('wrong nonce and packet hash reject and leave no unpacked artifact', async t => {
  const f = fixture(t); const r = await pack(f.request, f.output); const destination = resolve(f.root, 'received');
  await assert.rejects(unpack(resolve(f.output, 'packet.bin'), resolve(f.output, 'transport-key.txt'), 'f'.repeat(32), r.packetSha256, destination));
  await assert.rejects(unpack(resolve(f.output, 'packet.bin'), resolve(f.output, 'transport-key.txt'), r.nonce, '0'.repeat(64), destination), { code: 'TRANSPORT_PACKET_HASH_MISMATCH' });
  assert.equal(existsSync(destination), false);
});
test('manifest rejects traversal, absolute files, source revision drift and unbound descriptors', () => {
  const m = { version: 1, codeSha: EXECUTOR_SHA, nonce: 'a'.repeat(32), kind: 'import', files: [{ name: 'artifact-0.bin', bytes: 1, sha256: 'b'.repeat(64) }], materials: { item: { path: 'artifact-0.bin', sha256: 'b'.repeat(64) } } };
  assert.equal(validateManifest(m, m.nonce), 1);
  for (const name of ['../escape', '/tmp/escape', 'artifact-0.bin/../../escape']) { const n = structuredClone(m); n.files[0].name = name; assert.throws(() => validateManifest(n, n.nonce)); }
  const n = structuredClone(m); n.materials.item.path = '../escape'; assert.throws(() => validateManifest(n, n.nonce));
  assert.throws(() => validateManifest({ ...m, codeSha: '0'.repeat(40) }, m.nonce));
  assert.throws(() => nonceRoot('../escape'));
});
test('private file protections reject public mode and symlinks; source hash cannot be invented', async t => {
  const f = fixture(t); chmodSync(f.artifact, 0o644); assert.throws(() => privateInfo(f.artifact)); chmodSync(f.artifact, 0o600);
  const link = resolve(f.root, 'link'); symlinkSync(f.artifact, link); assert.throws(() => privateInfo(link));
  f.request.materials.config.artifacts.example.sha256 = '0'.repeat(64);
  await assert.rejects(pack(f.request, f.output), { code: 'TRANSPORT_SOURCE_HASH_MISMATCH' });
});
test('runtime and source drift fail closed before a writer can be invoked', t => {
  const f = fixture(t);
  assert.throws(() => assertExecutorRoot(f.root), { code: 'TRANSPORT_SOURCE_DRIFT' });
  const observation = { status: 'PASS', expectedCommit: EXECUTOR_SHA, observations: [{ revision: EXECUTOR_SHA }, { revision: EXECUTOR_SHA }] };
  assertRuntime(observation);
  observation.observations[1].revision = '0'.repeat(40);
  assert.throws(() => assertRuntime(observation), { code: 'TRANSPORT_RUNTIME_DRIFT' });
});
test('real original CLI is spawned in prepare mode and rejects malformed material without dependencies', t => {
  const f = fixture(t);
  const r = spawnSync(process.execPath, ['scripts/hr-cutover/execute-production-import.mjs', '--config', f.artifact], { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8' });
  assert.equal(r.status, 1);
  const result = JSON.parse(r.stdout);
  assert.equal(result.mode, 'prepare'); assert.equal(result.productionImport, 'HOLD');
  assert.ok(result.reasonCodes.includes('PRODUCTION_IMPORT_ENTRYPOINT_CONFIG_INVALID'));
});
test('scoped inventory accepts the approved target among multiple scopes and rejects status/hash drift', () => {
  const allowed = { identitySha256: 'a'.repeat(64), targetScopeSha256: 'b'.repeat(64) };
  const contract = { activation: { status: 'PASS', allowedTargets: [allowed] } };
  assert.equal(approvedInventoryTarget(contract), allowed);
  const inventory = { status: 'PASS', targetIdentitySha256: allowed.identitySha256, targetScopeSha256: allowed.targetScopeSha256, validScopeCount: 3, records: [{ fixture: 'private-row-must-stay-on-host' }] };
  assert.equal(assertScopedInventory(inventory, allowed), undefined);
  for (const changed of [{ status: 'HOLD' }, { targetIdentitySha256: 'c'.repeat(64) }, { targetScopeSha256: 'c'.repeat(64) }]) {
    assert.throws(() => assertScopedInventory({ ...inventory, ...changed }, allowed), { code: 'TRANSPORT_TARGET_DRIFT' });
  }
  for (const targets of [[], [allowed, { ...allowed }]]) {
    assert.throws(() => approvedInventoryTarget({ activation: { status: 'PASS', allowedTargets: targets } }), { code: 'TRANSPORT_TARGET_DRIFT' });
  }
  assert.throws(() => approvedInventoryTarget({ activation: { status: 'HOLD', allowedTargets: [allowed] } }), { code: 'TRANSPORT_TARGET_DRIFT' });
});
test('workflow separates transport from deployment and pins executor; host uses real CLI only', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = readFileSync(resolve(root, '.github/workflows/deploy-production.yml'), 'utf8');
  const host = readFileSync(resolve(root, 'scripts/hr-cutover/yuzhou-private-import-host.mjs'), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  private-import:'));
  assert.match(job, new RegExp(`ref: ${EXECUTOR_SHA}`, 'u'));
  assert.doesNotMatch(job, /prod:deploy|scripts\/deploy\.sh|inputs\.ref|inputs\.url/u);
  assert.match(workflow, /prepare-yuzhou-private-import\|execute-yuzhou-private-import\)/u);
  assert.match(host, /privateRun\(process\.execPath, \[resolve\(executor, 'scripts\/hr-cutover\/execute-production-import\.mjs'\), '--config', configPath, '--execute'\]\)/u);
  assert.match(host, /assertScopedInventory\(JSON\.parse\(privateRun\('sh', \[resolve\(executor, 'scripts\/diagnose-yuzhou-hr-production-target-inventory\.sh'\), 'report', deployPath, allowed\.targetScopeSha256\]\)\), allowed\)/u);
  assert.doesNotMatch(host, /diagnose-yuzhou-hr-production-target\.sh/u);
  assert.doesNotMatch(host, /executeSealedProductionImport|loadPg:|dependencies:/u);
});

function reconciliationFixture() {
  const plan = { operationId: 'synthetic-only-operation', triple: { sourceSnapshotHash: 'a'.repeat(64), mappingContractHash: 'b'.repeat(64) }, target: { identitySha256: 'c'.repeat(64) }, targetScope: { scopeSha256: 'd'.repeat(64) }, phases: ['T0','T1','T2','T3'].map((phase, i) => ({ phase, payloadBundleSha256: String(i).repeat(64), records: i === 0 ? [{ disposition: 'insert', targetTable: 'hr_employee' }, { disposition: 'quarantine', plannedTargetTable: 'hr_employee' }] : [] })) };
  const result = { sealedPlanSha256: 'e'.repeat(64) };
  const responses = [
    [{ status: 'succeeded', code_sha: EXECUTOR_SHA, source_snapshot_sha256: plan.triple.sourceSnapshotHash, mapping_contract_sha256: plan.triple.mappingContractHash, sealed_plan_sha256: result.sealedPlanSha256, target_identity_sha256: plan.target.identitySha256, target_scope_sha256: plan.targetScope.scopeSha256 }],
    plan.phases.map(p => ({ phase: p.phase, status: 'succeeded', planned_record_count: String(p.records.length), applied_record_count: String(p.records.length), payload_bundle_sha256: p.payloadBundleSha256 })),
    [{ disposition: 'insert', count: '1', employees: '1' }, { disposition: 'quarantine', count: '1', employees: '0' }],
  ];
  const calls = [];
  const client = { async query(sql, args) { calls.push({sql,args}); return { rows: responses[calls.length - 1] }; } };
  return { plan, result, responses, client, calls };
}
test('post-commit audit counts actual control records using only operation-bound SELECTs', async () => {
  const f = reconciliationFixture();
  assert.deepEqual(await reconcileCoreImport(f.client, f.plan, f.result), { reconciliationStatus: 'PASS', sourceRecordCount: 2, insertedCount: 1, quarantinedCount: 1, employeesInserted: 1, verifiedPhaseCount: 4 });
  assert.equal(f.calls.length, 3);
  for (const c of f.calls) { assert.match(c.sql, /^SELECT /u); assert.match(c.sql, /WHERE operation_id=\$1/u); assert.deepEqual(c.args, [f.plan.operationId]); }
});
test('post-commit audit rejects wrong scope, source, seal, phase digest and record counts', async () => {
  for (const key of ['target_scope_sha256','source_snapshot_sha256','sealed_plan_sha256','code_sha']) {
    const f = reconciliationFixture(); f.responses[0][0][key] = 'f'.repeat(64);
    await assert.rejects(reconcileCoreImport(f.client, f.plan, f.result), { code: 'TRANSPORT_RECONCILIATION_OPERATION_DRIFT' });
  }
  for (const key of ['payload_bundle_sha256', 'applied_record_count', 'status']) {
    const f = reconciliationFixture(); f.responses[1][0][key] = 'wrong';
    await assert.rejects(reconcileCoreImport(f.client, f.plan, f.result), { code: 'TRANSPORT_RECONCILIATION_PHASE_DRIFT' });
  }
  for (const key of ['count','employees']) {
    const f = reconciliationFixture(); f.responses[2][0][key] = '99';
    await assert.rejects(reconcileCoreImport(f.client, f.plan, f.result), { code: 'TRANSPORT_RECONCILIATION_COUNT_DRIFT' });
  }
});
