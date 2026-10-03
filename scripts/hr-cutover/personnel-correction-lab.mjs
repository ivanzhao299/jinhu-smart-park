import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { verifyPersonnelCorrectionSnapshot, assertPersonnelCorrectionSnapshotApproval } from './personnel-correction-snapshot.mjs';
import { snapshotCorrectionCtes, snapshotLockSql, correctionCtes, sealSelect, profileBeforeSelect, lockSql, materializeSql, applySql, detailSql, rollbackSql } from './personnel-correction-sql.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{64}$/;
const fail = code => { throw new Error(`PERSONNEL_CORRECTION_${code}`); };
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === expected.split(' ').sort().join('|');
export function correctionExecutionSha256() {
  return hash(['personnel-correction-lab.mjs','personnel-correction-sql.mjs','personnel-correction-snapshot.mjs','personnel-correction-snapshot-contract.mjs',
    '../../database/migrations/000325_hr_personnel_correction_snapshot.sql','../../database/migrations/000328_hr_personnel_correction_profile_cas.sql',
    '../diagnose-yuzhou-personnel-alias.mjs','../../database/migrations/000324_hr_personnel_correction_ledger.sql']
    .map(path => readFileSync(new URL(path, import.meta.url))).reduce((all, bytes) => Buffer.concat([all, bytes]), Buffer.alloc(0)));
}
export function correctionAuthoritySha256(publicKey) {
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') fail('AUTHORITY_INVALID');
  return hash(key.export({ type: 'spki', format: 'der' }));
}

// Configuration belongs to the lab operator, never an HTTP body. The authority
// MUST also match the separate, pre-provisioned database registration after connect.
export function validateCorrectionLabTarget(config) {
  if (!keys(config, 'host port database user password labId authorityPublicKey')
    || config.host !== '127.0.0.1' || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535
    || !/^jinhu_hr_correction_lab_[0-9a-f]{24}$/.test(config.database)
    || !uuid.test(config.labId) || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(config.user)
    || typeof config.password !== 'string') fail('LAB_TARGET_REQUIRED');
}
export function validateCorrectionAuthorization(config, token) {
  validateCorrectionLabTarget(config);
  if (!keys(token, 'payload signature') || typeof token.payload !== 'string' || token.payload.length > 16384
    || typeof token.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(token.signature)) fail('AUTHORIZATION_INVALID');
  let payload;
  try {
    if (!verify(null, Buffer.from(token.payload), config.authorityPublicKey, Buffer.from(token.signature, 'base64'))) fail('AUTHORIZATION_INVALID');
    correctionAuthoritySha256(config.authorityPublicKey);
    payload = JSON.parse(token.payload);
  } catch { fail('AUTHORIZATION_INVALID'); }
  if (!keys(payload, 'version purpose action nonce actorSha256 issuedAt expiresAt target binding')
    || payload.version !== 1 || payload.purpose !== 'ISOLATED_PERSONNEL_CORRECTION'
    || !['apply','rollback'].includes(payload.action) || !uuid.test(payload.nonce)
    || !sha.test(payload.actorSha256) || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)
    || payload.issuedAt > Date.now() || payload.expiresAt <= Date.now()
    || payload.expiresAt <= payload.issuedAt || payload.expiresAt - payload.issuedAt > 3600000) fail('AUTHORIZATION_INVALID');
  const target = payload.target;
  if (!keys(target, 'host port database user labId')
    || Object.keys(target).some(key => target[key] !== config[key])) fail('TARGET_BINDING_INVALID');
  const b = payload.binding;
  if (!keys(b, `operationId idempotencyKey tenantId parkId sourceOperationId parentOperationId triple executionSha256 profileBeforeSha256 seal${b?.snapshot ? ' snapshot' : ''}`)
    || (b.snapshot && (!keys(b.snapshot,'snapshotId manifestSha256') || !uuid.test(b.snapshot.snapshotId) || !sha.test(b.snapshot.manifestSha256)))
    || !sha.test(b.profileBeforeSha256) || !uuid.test(b.operationId) || !uuid.test(b.idempotencyKey)
    || ![b.tenantId,b.parkId].every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v))
    || ![b.sourceOperationId,b.parentOperationId].every(v => typeof v === 'string' && /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/.test(v))
    || !keys(b.triple, 'codeSha sourceSnapshotHash mappingContractHash')
    || !/^[0-9a-f]{40}$/.test(b.triple.codeSha) || !sha.test(b.triple.sourceSnapshotHash)
    || !sha.test(b.triple.mappingContractHash) || b.executionSha256 !== correctionExecutionSha256()) fail('BINDING_INVALID');
  const s = b.seal;
  if (!keys(s, 'sealVersion mappingVersion plannedProfiles nativePlaceFills degreeFills planSha256 beforeSha256 afterSha256')
    || s.sealVersion !== 1 || s.mappingVersion !== 'yuzhou-personnel-alias-null-fill-v1'
    || ![s.plannedProfiles,s.nativePlaceFills,s.degreeFills].every(n => Number.isSafeInteger(n) && n >= 0)
    || s.plannedProfiles < 1 || s.nativePlaceFills > s.plannedProfiles || s.degreeFills > s.plannedProfiles
    || s.nativePlaceFills + s.degreeFills < s.plannedProfiles
    || ![s.planSha256,s.beforeSha256,s.afterSha256].every(v => sha.test(v))) fail('SEAL_INVALID');
  return payload;
}

function receipt(binding, action) {
  return { kind: 'isolated_personnel_correction', productionImport: 'HOLD', action,
    ...binding.seal, receiptVersion: 2, profileVersionPolicy: 'monotonic-v1',
    changedMetadata: ['version'], profileBeforeSha256: binding.profileBeforeSha256 };
}
function assertCount(result, expected) { if (result.rowCount !== expected) fail('ROW_COUNT_CONFLICT'); }

// Intentionally a library only: no command line, production adapter, deploy hook,
// HTTP endpoint, arbitrary SQL callback or authorization issuer is exported.
export async function executePersonnelCorrectionLab(config, token) {
  const payload = validateCorrectionAuthorization(config, token); // before loading pg / connecting
  const b = payload.binding;
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
  const { Client } = require('pg');
  const client = new Client({ host: config.host, port: config.port, database: config.database,
    user: config.user, password: config.password, ssl: false, connectionTimeoutMillis: 5000,
    application_name: 'isolated-personnel-correction' });
  let begun = false;
  try {
    await client.connect();
    await client.query('BEGIN'); begun = true;
    await client.query("SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='10s'; SET LOCAL enable_nestloop=off");
    const registered = await client.query(`SELECT 1 FROM public.hr_personnel_correction_lab
      WHERE lab_id=$1 AND database_name=current_database() AND database_name=$2
      AND database_user=current_user AND database_user=$3 AND authority_key_sha256=$4
      FOR SHARE`, [config.labId,config.database,config.user,correctionAuthoritySha256(config.authorityPublicKey)]);
    if (registered.rowCount !== 1) fail('LAB_REGISTRATION_REQUIRED');
    // One lab writer. Lock before reading committed receipts so concurrent exact retries see them.
    await client.query('SELECT pg_advisory_xact_lock(734192,324)');
    validateCorrectionAuthorization(config, token); // reject expiry while waiting
    const snapshot = b.snapshot ? await verifyPersonnelCorrectionSnapshot(client,config,b) : null;
    const activeCtes = snapshot ? snapshotCorrectionCtes : correctionCtes;
    const bindingJson = JSON.stringify(b);
    const authorizationSha = hash(token.payload + '\n' + token.signature);
    const bound = await client.query("SELECT encode(digest(convert_to($1::jsonb::text,'UTF8'),'sha256'),'hex') hash", [bindingJson]);
    const bindingSha = bound.rows[0].hash;
    const prior = await client.query(`SELECT binding_sha256,receipt,operation_id FROM hr_personnel_correction_operation
      WHERE operation_id=$1 OR idempotency_key=$2`, [b.operationId,b.idempotencyKey]);
    if (prior.rowCount && (prior.rowCount !== 1 || prior.rows[0].binding_sha256 !== bindingSha || prior.rows[0].operation_id !== b.operationId)) fail('IDEMPOTENCY_CONFLICT');
    if (payload.action === 'rollback' && prior.rowCount !== 1) fail('APPLY_REQUIRED');
    const used = await client.query(`SELECT authorization_sha256,operation_id,action FROM hr_personnel_correction_authorization_use
      WHERE nonce=$1 OR authorization_sha256=$2 OR (operation_id=$3 AND action=$4)`, [payload.nonce,authorizationSha,b.operationId,payload.action]);
    const rolled = await client.query('SELECT binding_sha256,receipt FROM hr_personnel_correction_rollback WHERE operation_id=$1', [b.operationId]);
    if (used.rowCount) {
      if (used.rowCount !== 1 || used.rows[0].authorization_sha256 !== authorizationSha
        || used.rows[0].operation_id !== b.operationId || used.rows[0].action !== payload.action) fail('AUTHORIZATION_REUSED');
      if (payload.action === 'apply' && rolled.rowCount) fail('ALREADY_ROLLED_BACK');
      const previous = payload.action === 'apply' ? prior : rolled;
      if (previous.rowCount !== 1 || previous.rows[0].binding_sha256 !== bindingSha) fail('LEDGER_CONFLICT');
      if (snapshot) await assertPersonnelCorrectionSnapshotApproval(client,b.snapshot);
      await client.query('COMMIT'); begun = false;
      return { ...previous.rows[0].receipt, replay: true };
    }
    if ((payload.action === 'apply' && prior.rowCount) || rolled.rowCount) fail('AUTHORIZATION_REUSED');
    await client.query(snapshot ? snapshotLockSql : lockSql);
    if (snapshot) await assertPersonnelCorrectionSnapshotApproval(client,b.snapshot);
    validateCorrectionAuthorization(config, token);
    // Original C/S/M and parent linkage remain part of every execution, separately from the two-field seals.
    const source = await client.query(`SELECT 1 FROM ${snapshot ? 'hr_correction_snapshot.hr_yuzhou_t5_followon_operation' : 'hr_yuzhou_t5_followon_operation'}
      WHERE operation_id=$1 AND parent_operation_id=$2 AND status='succeeded' AND binding->'triple'=$3::jsonb`,
    [b.sourceOperationId,b.parentOperationId,JSON.stringify(b.triple)]);
    if (source.rowCount !== 1) fail('SOURCE_BINDING_CONFLICT');
    const result = receipt(b, payload.action);
    if (payload.action === 'apply') {
      const params = [b.tenantId,b.parkId,b.sourceOperationId,b.parentOperationId,...(snapshot ? [snapshot.originDatabase] : [])];
      const sealed = await client.query(`${activeCtes} ${sealSelect}`, params);
      const equal = await client.query('SELECT $1::jsonb=$2::jsonb ok', [JSON.stringify(sealed.rows[0].seal),JSON.stringify(b.seal)]);
      if (!equal.rows[0].ok) fail('SEAL_CONFLICT');
      const beforeProfile = await client.query(`${activeCtes} ${profileBeforeSelect}`, params);
      if (beforeProfile.rows[0].hash !== b.profileBeforeSha256) fail('PROFILE_BEFORE_CONFLICT');
      await client.query(snapshot ? `CREATE TEMP TABLE correction_rows_private ON COMMIT DROP AS ${activeCtes}
        SELECT c.*,to_jsonb(p) full_before FROM correction_rows c JOIN public.hr_employee_profile p ON p.id=c.profile_id` : materializeSql, params);
      const uniqueness = await client.query(`SELECT count(*)::int n,count(DISTINCT profile_id)::int u,
        count(*) FILTER (WHERE source_cardinality<>1 OR registry_count<>1)::int invalid
        FROM (${activeCtes} SELECT c.profile_id,m.source_cardinality,a.registry_count
          FROM correction_rows c JOIN mapped_owner m ON m.source_identity_sha256=c.source_identity_sha256
          JOIN archive_values a ON a.source_id=m.id) q`, params);
      if (uniqueness.rows[0].n !== b.seal.plannedProfiles || uniqueness.rows[0].u !== b.seal.plannedProfiles
        || uniqueness.rows[0].invalid !== 0) fail('SOURCE_CARDINALITY_CONFLICT');
      await client.query(`INSERT INTO hr_personnel_correction_operation
        (operation_id,idempotency_key,binding_sha256,binding,actor_sha256,receipt,lab_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [b.operationId,b.idempotencyKey,bindingSha,bindingJson,payload.actorSha256,JSON.stringify(result),config.labId]);
      assertCount(await client.query(applySql), b.seal.plannedProfiles);
      assertCount(await client.query(detailSql, [b.operationId]), b.seal.plannedProfiles);
      // Prove actual two-field after images reproduce the authorized PG JSONB seal.
      const after = await client.query(`SELECT encode(digest(convert_to(jsonb_build_object('sealVersion',1,
        'mappingVersion','yuzhou-personnel-alias-null-fill-v1','rows',jsonb_agg(jsonb_build_object('binding',binding,
        'after',jsonb_build_object('native_place',after_image->'native_place','degree',after_image->'degree'))
        ORDER BY (binding->>'sourceIdentitySha256') COLLATE "C",profile_id::text COLLATE "C"))::text,'UTF8'),'sha256'),'hex') hash
        FROM hr_personnel_correction_detail WHERE operation_id=$1`, [b.operationId]);
      if (after.rows[0].hash !== b.seal.afterSha256) fail('AFTER_SEAL_CONFLICT');
    } else {
      assertCount(await client.query(rollbackSql, [b.operationId]), b.seal.plannedProfiles);
      const restored = await client.query(`SELECT count(*)::int n FROM hr_personnel_correction_detail d
        JOIN hr_employee_profile p ON p.id=d.profile_id AND to_jsonb(p)=d.before_image || jsonb_build_object('version',(d.after_image->>'version')::integer+1) WHERE d.operation_id=$1`, [b.operationId]);
      if (restored.rows[0].n !== b.seal.plannedProfiles) fail('ROLLBACK_CONFLICT');
      await client.query(`INSERT INTO hr_personnel_correction_rollback(operation_id,binding_sha256,actor_sha256,receipt)
        VALUES($1,$2,$3,$4)`, [b.operationId,bindingSha,payload.actorSha256,JSON.stringify(result)]);
    }
    await client.query(`INSERT INTO hr_personnel_correction_authorization_use(nonce,authorization_sha256,operation_id,action)
      VALUES($1,$2,$3,$4)`, [payload.nonce,authorizationSha,b.operationId,payload.action]);
    validateCorrectionAuthorization(config, token);
    if (snapshot) await assertPersonnelCorrectionSnapshotApproval(client,b.snapshot);
    await client.query('COMMIT'); begun = false;
    return { ...result, replay: false };
  } catch (error) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    if (/^PERSONNEL_CORRECTION_[A-Z_]+$/.test(error.message)) throw new Error(error.message);
    if (['40001','40P01','55P03'].includes(error.code)) fail('RETRYABLE_CONFLICT');
    fail('DATABASE_FAILURE'); // Never expose server DETAIL, SQL, parameters or personal values.
  } finally { await client.end().catch(() => {}); }
}
