import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { userInfo } from 'node:os';
import test from 'node:test';
import { correctionAuthoritySha256, correctionExecutionSha256, executePersonnelCorrectionLab, validateCorrectionAuthorization } from '../personnel-correction-lab.mjs';
import { correctionCtes, sealSelect } from '../personnel-correction-sql.mjs';
import { personnelAliasSql } from '../../diagnose-yuzhou-personnel-alias.mjs';

const digest = v => createHash('sha256').update(v).digest('hex');
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const target = { host: '127.0.0.1', port: 5432, database: `jinhu_hr_correction_lab_${randomBytes(12).toString('hex')}`,
 user: userInfo().username, labId: randomUUID() };
const baseConfig = { ...target, password: '', authorityPublicKey: publicKey };
const triple = { codeSha: 'a'.repeat(40), sourceSnapshotHash: 'b'.repeat(64), mappingContractHash: 'c'.repeat(64) };
const op = () => `yzprod-import-20261003T000000Z-${randomBytes(6).toString('hex')}`;
const dummyBinding = () => ({ operationId: randomUUID(), idempotencyKey: randomUUID(), tenantId: 'synthetic', parkId: 'lab',
 sourceOperationId: op(), parentOperationId: op(), triple, executionSha256: correctionExecutionSha256(),
 seal: { sealVersion: 1, mappingVersion: 'yuzhou-personnel-alias-null-fill-v1', plannedProfiles: 2, nativePlaceFills: 1,
 degreeFills: 2, planSha256: digest('p'), beforeSha256: digest('b'), afterSha256: digest('a') } });
function authorize(binding, config = baseConfig, overrides = {}, privateKey = keys.privateKey) {
 const { host, port, database, user, labId } = config;
 const payload = JSON.stringify({ version: 1, purpose: 'ISOLATED_PERSONNEL_CORRECTION', action: 'apply', nonce: randomUUID(),
 actorSha256: digest('synthetic-independent-reviewer'), issuedAt: Date.now()-1000, expiresAt: Date.now()+600000,
 target: { host, port, database, user, labId }, binding, ...overrides });
 return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64') };
}

test('production/default/remote targets fail before dependency loading or connection', async () => {
 for (const override of [{ database: 'jinhu' }, { database: 'jinhu_hr_migration_lab_existing' },
  { host: 'example.invalid' }, { host: 'localhost' }, { connectionString: 'postgres://invalid' }, { port: 543 }, { labId: 'yes' }]) {
  await assert.rejects(executePersonnelCorrectionLab({ ...baseConfig, ...override }, authorize(dummyBinding())), /LAB_TARGET_REQUIRED/);
 }
});
test('independent signed credential validates target, C/S/M, execution bytes, action and expiry', () => {
 const b = dummyBinding();
 assert.equal(validateCorrectionAuthorization(baseConfig, authorize(b)).action, 'apply');
 for (const override of [{ action: 'import' }, { purpose: 'IMPORT' }, { expiresAt: Date.now()-1 },
  { issuedAt: Date.now()+10000 }, { nonce: 'true' }, { authorized: true }, { target: { ...target, database: 'other' } }]) {
  assert.throws(() => validateCorrectionAuthorization(baseConfig, authorize(b, baseConfig, override)), /PERSONNEL_CORRECTION_/);
 }
 for (const field of ['executionSha256','sourceOperationId']) {
  assert.throws(() => validateCorrectionAuthorization(baseConfig, authorize({ ...b, [field]: 'invalid' })), /BINDING_INVALID/);
 }
 assert.throws(() => validateCorrectionAuthorization(baseConfig, { authorized: true }), /AUTHORIZATION_INVALID/);
 const token = authorize(b); token.payload += ' ';
 assert.throws(() => validateCorrectionAuthorization(baseConfig, token), /AUTHORIZATION_INVALID/);
});
test('scope parameterization preserves every reviewed observer predicate and all seal bytes', () => {
 const original = personnelAliasSql.slice(personnelAliasSql.indexOf('WITH ops AS ('), personnelAliasSql.indexOf('), hashed AS (')+1);
 const restored = correctionCtes.replaceAll('$1', "'10000001'").replaceAll('$2', "'20000001'")
  .replace('WHERE o.operation_id=$3 AND o.parent_operation_id=$4 AND', 'WHERE');
 assert.equal(restored, original);
 assert.equal((correctionCtes.match(/\$1/g)||[]).length, 4);
 assert.equal((correctionCtes.match(/\$2/g)||[]).length, 4);
});

test('real PostgreSQL disposable synthetic correction transactions', { skip: process.env.HR_CORRECTION_PG_TEST !== '1' }, async t => {
 const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
 const { Client } = require('pg');
 const config = { ...baseConfig, port: Number(process.env.HR_CORRECTION_PG_PORT || 5432),
  user: process.env.HR_CORRECTION_PG_USER || baseConfig.user, password: process.env.HR_CORRECTION_PG_PASSWORD || '' };
 // Do not accept a database name, URL, remote host or existing lab from the environment.
 validateCorrectionAuthorization(config, authorize(dummyBinding(), config));
 const admin = new Client({ host: config.host, port: config.port, user: config.user, password: config.password, database: 'postgres' });
 let client; let created = false;
 try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${config.database}" TEMPLATE template0`); created = true;
  client = new Client({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database });
  await client.connect();
  await client.query(readFileSync(new URL('./personnel-correction-fixture.sql', import.meta.url), 'utf8'));
  await client.query(readFileSync(new URL('../../../database/migrations/000324_hr_personnel_correction_ledger.sql', import.meta.url), 'utf8'));
  await client.query('INSERT INTO hr_personnel_correction_lab(lab_id,database_name,database_user,authority_key_sha256) VALUES($1,$2,$3,$4)',
   [config.labId,config.database,config.user,correctionAuthoritySha256(publicKey)]);
  const insert = async (table, row) => {
   // Test-only identifiers are compile-time fixture keys; values are always bound.
   const names = Object.keys(row);
   await client.query(`INSERT INTO ${table} (${names.join(',')}) VALUES(${names.map((_,i) => `$${i+1}`).join(',')})`, Object.values(row));
  };
  let counter = 0;
  async function fixture() {
   const b = { ...dummyBinding(), tenantId: `synthetic_${++counter}` };
   const followBatch = randomUUID(), coreBatch = randomUUID();
   await insert('hr_yuzhou_production_import_operation', { operation_id: b.parentOperationId, status: 'succeeded', target_tenant_id: b.tenantId,
    target_park_id: b.parkId, code_sha: triple.codeSha, source_snapshot_sha256: triple.sourceSnapshotHash,
    mapping_contract_sha256: triple.mappingContractHash, sealed_plan_sha256: digest('parent-plan'), target_identity_sha256: digest('target'),
    target_scope_sha256: digest('scope'), execution_contract_version: 2 });
   await insert('hr_yuzhou_t5_followon_operation', { operation_id: b.sourceOperationId, parent_operation_id: b.parentOperationId, status: 'succeeded',
    binding: { targetScope: { tenantId: b.tenantId, parkId: b.parkId }, triple, parent: { sealedPlanSha256: digest('parent-plan') },
     targetIdentitySha256: digest('target'), targetScopeSha256: digest('scope') } });
   await insert('migration_batch', { id: followBatch, t5_followon_operation_id: b.sourceOperationId, run_id: b.sourceOperationId,
    execution_context: 't5_production_followon', status: 'succeeded', target_database: config.database });
   await insert('migration_batch', { id: coreBatch, execution_context: 'production_import', status: 'succeeded',
    production_import_operation_id: b.parentOperationId, production_import_phase: 'T0' });
   await insert('hr_yuzhou_production_import_phase', { operation_id: b.parentOperationId, phase: 'T0', status: 'succeeded' });
   const profiles = [];
   for (let i=0;i<3;i++) {
    const employee = randomUUID(), map = randomUUID(), source = randomUUID(), registry = randomUUID(), archive = randomUUID(), profile = randomUUID();
    const identity = digest(`synthetic-${counter}-${i}`), rowHash = digest(`row-${counter}-${i}`), owner = digest(`owner-${counter}-${i}`);
    profiles.push(profile);
    await insert('hr_employee', { id: employee, tenant_id: b.tenantId, park_id: b.parkId, is_deleted: false });
    await insert('legacy_record_map', { id: map, target_id: employee, target_table: 'hr_employee', source_system: 'yuzhou-v10', source_table: 'dbo.person',
     is_active: true, mapping_status: 'loaded', source_pk_canonical: `sha256:${owner}`, source_identity_sha256: owner, source_row_sha256: rowHash, batch_id: coreBatch });
    await insert('hr_yuzhou_production_import_record', { operation_id: b.parentOperationId, phase: 'T0', source_identity_sha256: owner,
     source_row_sha256: rowHash, source_system: 'yuzhou-v10', source_table: 'dbo.person', source_pk_canonical: `sha256:${owner}`,
     target_table: 'hr_employee', target_id: employee, disposition: 'insert', rollback_status: 'not_started' });
    await insert('hr_yuzhou_production_import_projection_receipt', { operation_id: b.parentOperationId, phase: 'T0', source_identity_sha256: owner,
     legacy_record_map_id: map, migration_batch_id: coreBatch });
    await insert('hr_yuzhou_t5_followon_source', { id: source, operation_id: b.sourceOperationId, tenant_id: b.tenantId, park_id: b.parkId,
     source_domain: 'person_core', source_table: 'dbo.person.core_residue', source_identity_sha256: identity, source_row_sha256: rowHash,
     owner_status: 'mapped', employee_id: employee, owner_record_map_id: map });
    await insert('hr_legacy_identity_registry', { id: registry, tenant_id: b.tenantId, park_id: b.parkId, source_system: 'yuzhou-v10',
     source_table: 'dbo.person.core_residue', source_identity_sha256: identity, source_row_sha256: rowHash, mapping_status: 'mapped',
     owner_employee_id: employee, owner_record_map_id: map, owner_source_system: 'yuzhou-v10', owner_source_table: 'dbo.person', owner_source_identity_sha256: owner });
    await insert('hr_legacy_archive_record', { id: archive, identity_registry_id: registry, tenant_id: b.tenantId, park_id: b.parkId,
     restricted_safe_projection: { legacyFields: { oldaddr: 'Synthetic origin', edulevel: 'Synthetic degree' } } });
    await insert('hr_employee_profile', { id: profile, tenant_id: b.tenantId, park_id: b.parkId, employee_id: employee, is_deleted: false,
     legacy_source_identity_sha256: identity, legacy_source_row_sha256: rowHash, native_place: [null,'','Modern origin'][i], degree: i===2?'Modern degree':null, note: 'unchanged' });
    for (const [table,id] of [['hr_yuzhou_t5_followon_source',source],['hr_legacy_identity_registry',registry],['hr_legacy_archive_record',archive],['hr_employee_profile',profile]]) {
     await insert('hr_yuzhou_t5_followon_projection_receipt', { operation_id: b.sourceOperationId, target_table: table, target_id: id,
      source_identity_sha256: identity, source_row_sha256: rowHash, disposition: 'insert' });
    }
   }
   b.seal = (await client.query(`${correctionCtes} ${sealSelect}`, [b.tenantId,b.parkId,b.sourceOperationId,b.parentOperationId])).rows[0].seal;
   assert.equal(b.seal.plannedProfiles,2); assert.equal(b.seal.nativePlaceFills,1); assert.equal(b.seal.degreeFills,2);
   return { b, profiles, token: authorize(b, config) };
  }
  const run = token => executePersonnelCorrectionLab(config, token);
  const ledgerCount = async b => Number((await client.query('SELECT count(*) n FROM hr_personnel_correction_operation WHERE operation_id=$1', [b.operationId])).rows[0].n);
  const profileHash = async b => (await client.query("SELECT encode(digest(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'sha256'),'hex') hash FROM hr_employee_profile p WHERE tenant_id=$1", [b.tenantId])).rows[0].hash;
  const lineageTables = ['hr_yuzhou_t5_followon_source','hr_yuzhou_t5_followon_operation',
   'hr_yuzhou_production_import_operation','hr_yuzhou_t5_followon_projection_receipt','legacy_record_map',
   'hr_yuzhou_production_import_record','hr_yuzhou_production_import_phase','hr_yuzhou_production_import_projection_receipt',
   'migration_batch','hr_legacy_identity_registry','hr_legacy_archive_record','hr_employee'];
  const lineageHash = async () => {
   const hashes = [];
   for (const table of lineageTables) hashes.push((await client.query(`SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY to_jsonb(s)::text)::text) hash FROM ${table} s`)).rows[0].hash);
   return digest(JSON.stringify(hashes));
  };
  await t.test('atomic apply, NULL-only fill, unchanged original lineage, aggregate-only receipt, exact replay, rollback and rollback replay', async () => {
   const f = await fixture(), before = await profileHash(f.b);
   const sourceBefore = await lineageHash();
   const first = await run(f.token); assert.equal(first.replay,false); assert.equal(first.plannedProfiles,2);
   assert.doesNotMatch(JSON.stringify(first), /Synthetic|profileId|employeeId|tenantId|operationId/);
   assert.equal((await run(f.token)).replay,true);
   assert.equal((await client.query('SELECT native_place FROM hr_employee_profile WHERE id=$1', [f.profiles[1]])).rows[0].native_place,'');
   assert.equal(await lineageHash(),sourceBefore);
   const rollback = authorize(f.b,config,{ action: 'rollback' });
   assert.equal((await run(rollback)).action,'rollback'); assert.equal(await profileHash(f.b),before);
   assert.equal((await run(rollback)).replay,true); assert.equal(await lineageHash(),sourceBefore);
   await assert.rejects(run(f.token), /ALREADY_ROLLED_BACK/);
   assert.equal(await ledgerCount(f.b),1);
  });
  await t.test('different binding conflicts and nonce/action reuse cannot authorize a second operation', async () => {
   const f = await fixture(); await run(f.token);
   await assert.rejects(run(authorize({ ...f.b, seal: { ...f.b.seal, beforeSha256: digest('wrong') } },config)), /IDEMPOTENCY_CONFLICT/);
   await assert.rejects(run(authorize(f.b,config)), /AUTHORIZATION_REUSED/);
   const other = await fixture(), nonce = JSON.parse(f.token.payload).nonce;
   await assert.rejects(run(authorize(other.b,config,{ nonce })), /AUTHORIZATION_REUSED/);
   await assert.rejects(run(authorize(f.b,config,{ nonce, action: 'rollback' })), /AUTHORIZATION_REUSED/);
   assert.equal(await ledgerCount(other.b),0);
  });
  const driftCases = [
   ['scope', f => client.query('UPDATE hr_employee_profile SET park_id=$1 WHERE id=$2', ['other',f.profiles[0]])],
   ['source', f => client.query('UPDATE hr_yuzhou_t5_followon_source SET source_row_sha256=$1 WHERE operation_id=$2', [digest('drift'),f.b.sourceOperationId])],
   ['receipt', f => client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET disposition='quarantine' WHERE operation_id=$1 AND target_table='hr_employee_profile'", [f.b.sourceOperationId])],
   ['owner', f => client.query('UPDATE legacy_record_map SET is_active=false WHERE target_id=(SELECT employee_id FROM hr_employee_profile WHERE id=$1)', [f.profiles[0]])],
   ['target before write', f => client.query("UPDATE hr_employee_profile SET native_place='Later modern' WHERE id=$1", [f.profiles[0]])],
   ['deleted target', f => client.query('UPDATE hr_employee_profile SET is_deleted=true WHERE id=$1', [f.profiles[0]])],
   ['duplicate active profile', f => client.query('INSERT INTO hr_employee_profile SELECT gen_random_uuid(),tenant_id,park_id,employee_id,is_deleted,legacy_source_identity_sha256,legacy_source_row_sha256,native_place,degree,note FROM hr_employee_profile WHERE id=$1', [f.profiles[0]])],
   ['archive value', f => client.query("UPDATE hr_legacy_archive_record SET restricted_safe_projection=jsonb_build_object('legacyFields',jsonb_build_object('oldaddr','changed','edulevel','changed')) WHERE tenant_id=$1", [f.b.tenantId])],
   ['parent receipt', f => client.query("UPDATE hr_yuzhou_production_import_record SET rollback_status='rolled_back' WHERE operation_id=$1", [f.b.parentOperationId])],
  ];
  for (const [name,mutate] of driftCases) await t.test(`${name} drift fails atomically`, async () => {
   const f = await fixture(); await mutate(f); const before = await profileHash(f.b);
   await assert.rejects(run(f.token), /SEAL_CONFLICT/); assert.equal(await profileHash(f.b),before); assert.equal(await ledgerCount(f.b),0);
  });
  await t.test('exact C/S/M mismatch is rejected', async () => {
   const f = await fixture(); await assert.rejects(run(authorize({ ...f.b, triple: { ...triple, sourceSnapshotHash: digest('drift') } },config)), /SOURCE_BINDING_CONFLICT/);
  });
  await t.test('ledger failure rolls back business rows, receipt, details and nonce; safe same token retry succeeds', async () => {
   const f = await fixture(), before = await profileHash(f.b);
   await client.query("CREATE FUNCTION synthetic_ledger_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER synthetic_failure BEFORE INSERT ON hr_personnel_correction_detail FOR EACH ROW EXECUTE FUNCTION synthetic_ledger_failure()");
   await assert.rejects(run(f.token), /DATABASE_FAILURE/);
   assert.equal(await profileHash(f.b),before); assert.equal(await ledgerCount(f.b),0);
   assert.equal(Number((await client.query('SELECT count(*) n FROM hr_personnel_correction_authorization_use WHERE operation_id=$1', [f.b.operationId])).rows[0].n),0);
   await client.query('DROP TRIGGER synthetic_failure ON hr_personnel_correction_detail; DROP FUNCTION synthetic_ledger_failure()');
   assert.equal((await run(f.token)).replay,false);
  });
  await t.test('concurrent identical retries commit one ledger and return replay', async () => {
   const f = await fixture(); const results = await Promise.all([run(f.token),run(f.token)]);
   assert.equal(results.filter(r => !r.replay).length,1); assert.equal(results.filter(r => r.replay).length,1); assert.equal(await ledgerCount(f.b),1);
  });
  for (const change of ["note='modern edit'", 'note=note', "native_place='modern edit'"]) await t.test('conditional rollback refuses later whole-row edit or version change', async () => {
   const f = await fixture(); await run(f.token);
   await client.query(`UPDATE hr_employee_profile SET ${change} WHERE id=$1`, [f.profiles[0]]);
   const before = await profileHash(f.b);
   await assert.rejects(run(authorize(f.b,config,{ action: 'rollback' })), /ROW_COUNT_CONFLICT/);
   assert.equal(await profileHash(f.b),before);
   assert.equal(Number((await client.query('SELECT count(*) n FROM hr_personnel_correction_rollback WHERE operation_id=$1', [f.b.operationId])).rows[0].n),0);
  });
  await t.test('trusted DB registration rejects caller self-signing and wrong lab registration', async () => {
   const f = await fixture(), rogue = generateKeyPairSync('ed25519');
   const rogueConfig = { ...config, authorityPublicKey: rogue.publicKey.export({ type: 'spki', format: 'pem' }) };
   await assert.rejects(executePersonnelCorrectionLab(rogueConfig,authorize(f.b,rogueConfig,{},rogue.privateKey)), /LAB_REGISTRATION_REQUIRED/);
   const wrong = { ...config, labId: randomUUID() };
   await assert.rejects(executePersonnelCorrectionLab(wrong,authorize(f.b,wrong)), /LAB_REGISTRATION_REQUIRED/);
   assert.equal(await ledgerCount(f.b),0);
  });
  await t.test('duplicate source identity is refused even if the two-field seal still matches', async () => {
   const f = await fixture();
   await client.query('INSERT INTO hr_yuzhou_t5_followon_source SELECT gen_random_uuid(),operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,owner_status,employee_id,owner_record_map_id FROM hr_yuzhou_t5_followon_source WHERE operation_id=$1 LIMIT 1', [f.b.sourceOperationId]);
   await assert.rejects(run(f.token), /SOURCE_CARDINALITY_CONFLICT/); assert.equal(await ledgerCount(f.b),0);
  });
  await t.test('each sealed count and hash is independently enforced', async () => {
   const f = await fixture();
   for (const key of ['planSha256','beforeSha256','afterSha256']) {
    await assert.rejects(run(authorize({ ...f.b, seal: { ...f.b.seal, [key]: digest('incorrect') } },config)), /SEAL_CONFLICT/);
   }
   await assert.rejects(run(authorize({ ...f.b, seal: { ...f.b.seal, plannedProfiles: 3, degreeFills: 3 } },config)), /SEAL_CONFLICT/);
   assert.equal(await ledgerCount(f.b),0);
  });
  await t.test('operation and parent scope cannot be widened by a signed request', async () => {
   const f = await fixture();
   await assert.rejects(run(authorize({ ...f.b, tenantId: 'unrelated' },config)), /SEAL_CONFLICT/);
   await assert.rejects(run(authorize({ ...f.b, sourceOperationId: op() },config)), /SOURCE_BINDING_CONFLICT/);
   await assert.rejects(run(authorize({ ...f.b, parentOperationId: op() },config)), /SOURCE_BINDING_CONFLICT/);
  });
  await t.test('authorization expiring while awaiting the writer lock is refused without consumption', async () => {
   const f = await fixture();
   await client.query('BEGIN; SELECT pg_advisory_xact_lock(734192,324)');
   const short = authorize(f.b,config,{ issuedAt: Date.now()-1, expiresAt: Date.now()+250 });
   // Attach rejection handling immediately, even if connection/setup outlasts expiry.
   const result = assert.rejects(run(short), /AUTHORIZATION_INVALID/);
   await new Promise(resolve => setTimeout(resolve, 400));
   await client.query('COMMIT'); await result;
   assert.equal(await ledgerCount(f.b),0);
  });
  await t.test('successful operations cannot gain new details and incomplete operations cannot commit', async () => {
   const f = await fixture(); await run(f.token);
   await assert.rejects(client.query(`INSERT INTO hr_personnel_correction_detail
    SELECT operation_id,gen_random_uuid(),binding,patch,before_image,after_image,after_xmin
    FROM hr_personnel_correction_detail WHERE operation_id=$1 LIMIT 1`, [f.b.operationId]), /DETAIL_INVALID/);
   const fresh = await fixture();
   await client.query('BEGIN');
   await client.query(`INSERT INTO hr_personnel_correction_operation(operation_id,lab_id,idempotency_key,binding_sha256,binding,actor_sha256,receipt)
    VALUES($1,$2,$3,$4,$5,$6,'{}')`, [fresh.b.operationId,config.labId,fresh.b.idempotencyKey,digest('synthetic'),JSON.stringify(fresh.b),digest('actor')]);
   await assert.rejects(client.query('COMMIT'), /ATOMIC_RECEIPT_REQUIRED/);
   await client.query('ROLLBACK');
   assert.equal(await ledgerCount(fresh.b),0);
  });
  await t.test('append-only ledger rejects UPDATE DELETE and TRUNCATE including empty tables; PUBLIC has no writes', async () => {
   for (const table of ['lab','operation','detail','rollback','authorization_use']) {
    for (const sql of [`UPDATE hr_personnel_correction_${table} SET ${table==='lab'?'lab_id=lab_id':'operation_id=operation_id'} WHERE false`,
     `DELETE FROM hr_personnel_correction_${table} WHERE false`, `TRUNCATE hr_personnel_correction_${table} CASCADE`]) {
     await assert.rejects(client.query(sql));
    }
   }
   const grants = await client.query("SELECT count(*)::int n FROM information_schema.table_privileges WHERE table_name LIKE 'hr_personnel_correction_%' AND grantee='PUBLIC'");
   assert.equal(grants.rows[0].n,0);
  });
 } finally {
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE "${config.database}"`);
  await admin.end();
 }
});
