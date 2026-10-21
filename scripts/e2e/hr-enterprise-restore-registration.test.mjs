import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, realpath, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {normalizeRestoreSchema, assertSelectedRestoreAcl, fileRootStatIdentity} from '../hr-enterprise/restore-catalog.mjs';
import {withRestoreDirectoryLock, replaceRestoreMarker, restoredMarkerBytes,
  registerRestoredPair} from '../hr-enterprise/register-restored-pair.mjs';
import {sha256} from '../hr-enterprise/verify-restored-pair.mjs';

const source = `-- Frozen synthetic schema excerpt
    CONSTRAINT ck_sys_business_scope_kind CHECK (((scope_kind)::text = ANY ((ARRAY['enterprise'::character varying, 'park'::character varying])::text[]))),
    CONSTRAINT ck_sys_business_scope_status CHECK (((status)::text = ANY ((ARRAY['enabled'::character varying, 'disabled'::character varying])::text[]))),
    CONSTRAINT ck_sys_business_scope_module_status CHECK (((status)::text = ANY ((ARRAY['enabled'::character varying, 'disabled'::character varying])::text[]))),
    CONSTRAINT ck_sys_user_business_scope_membership_status CHECK (((status)::text = ANY ((ARRAY['enabled'::character varying, 'disabled'::character varying])::text[]))),
CREATE TABLE synthetic_schema(id integer);
`;
const restored = `-- Restored synthetic schema excerpt
    CONSTRAINT ck_sys_business_scope_kind CHECK (((scope_kind)::text = ANY (ARRAY[('enterprise'::character varying)::text, ('park'::character varying)::text]))),
    CONSTRAINT ck_sys_business_scope_status CHECK (((status)::text = ANY (ARRAY[('enabled'::character varying)::text, ('disabled'::character varying)::text]))),
    CONSTRAINT ck_sys_business_scope_module_status CHECK (((status)::text = ANY (ARRAY[('enabled'::character varying)::text, ('disabled'::character varying)::text]))),
    CONSTRAINT ck_sys_user_business_scope_membership_status CHECK (((status)::text = ANY (ARRAY[('enabled'::character varying)::text, ('disabled'::character varying)::text]))),
CREATE TABLE synthetic_schema(id integer);
`;

test('only four exact reviewed CHECK deparser forms normalize to the same schema', () => {
  assert.equal(normalizeRestoreSchema(source), normalizeRestoreSchema(restored));
  assert.notEqual(sha256(normalizeRestoreSchema(source)), sha256(normalizeRestoreSchema(restored.replace('id integer', 'id text'))));
});

test('changed, absent or duplicated reviewed CHECK definitions fail closed', () => {
  assert.throws(() => normalizeRestoreSchema(source.replace("'disabled'", "'unexpected'")), /RESTORE_CHECK_DEFINITION/);
  assert.throws(() => normalizeRestoreSchema(source.replace('ck_sys_business_scope_kind', 'unknown_constraint')), /RESTORE_CHECK_DEFINITION/);
  assert.throws(() => normalizeRestoreSchema(source + source), /RESTORE_CHECK_DEFINITION/);
});

const reminderSource = `
    CONSTRAINT ck_hr_employee_date_reminder_kind CHECK (((reminder_kind)::text = ANY ((ARRAY['birthday'::character varying, 'hire_anniversary'::character varying])::text[]))),
    CONSTRAINT ck_hr_employee_date_reminder_policy CHECK (((leap_day_policy)::text = ANY ((ARRAY['skip'::character varying, 'feb_28'::character varying, 'mar_1'::character varying])::text[]))),
    CONSTRAINT ck_hr_employee_date_reminder_recipients CHECK ((((cardinality(recipient_kinds) >= 1) AND (cardinality(recipient_kinds) <= 3)) AND (recipient_kinds <@ ARRAY['hr'::text, 'manager'::text, 'employee'::text]))),
    CONSTRAINT ck_hr_employee_date_reminder_status CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'read'::character varying, 'acknowledged'::character varying, 'resolved'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT ck_hr_employee_date_reminder_action CHECK (((action)::text = ANY ((ARRAY['read'::character varying, 'acknowledge'::character varying, 'resolve'::character varying, 'cancel'::character varying])::text[])))
`;
const reminderRestored = `
    CONSTRAINT ck_hr_employee_date_reminder_kind CHECK (((reminder_kind)::text = ANY (ARRAY[('birthday'::character varying)::text, ('hire_anniversary'::character varying)::text]))),
    CONSTRAINT ck_hr_employee_date_reminder_policy CHECK (((leap_day_policy)::text = ANY (ARRAY[('skip'::character varying)::text, ('feb_28'::character varying)::text, ('mar_1'::character varying)::text]))),
    CONSTRAINT ck_hr_employee_date_reminder_recipients CHECK (((cardinality(recipient_kinds) >= 1) AND (cardinality(recipient_kinds) <= 3) AND (recipient_kinds <@ ARRAY['hr'::text, 'manager'::text, 'employee'::text]))),
    CONSTRAINT ck_hr_employee_date_reminder_status CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('read'::character varying)::text, ('acknowledged'::character varying)::text, ('resolved'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT ck_hr_employee_date_reminder_action CHECK (((action)::text = ANY (ARRAY[('read'::character varying)::text, ('acknowledge'::character varying)::text, ('resolve'::character varying)::text, ('cancel'::character varying)::text])))
`;

test('current reminder dump and actual PostgreSQL16 restored forms have one exact canonical schema', () => {
  const canonical = normalizeRestoreSchema(source + reminderSource);
  assert.equal(canonical, normalizeRestoreSchema(restored + reminderRestored));
  assert.equal(canonical, normalizeRestoreSchema(canonical));
  // Older frozen schemas still normalize without requiring new reminder tables.
  assert.equal(normalizeRestoreSchema(source), normalizeRestoreSchema(restored));
});

for (const [description, before, after] of [
  ['kind', "'hire_anniversary'", "'unexpected'"],
  ['policy', "'mar_1'", "'unexpected'"],
  ['status', "'resolved'", "'unexpected'"],
  ['action', "'acknowledge'", "'unexpected'"],
  ['recipient cardinality', '<= 3', '<= 4'],
  ['recipient operator', '<@ ARRAY', '@> ARRAY'],
  ['recipient conjunction', 'AND (recipient_kinds', 'OR (recipient_kinds'],
  ['recipient column', 'cardinality(recipient_kinds)', 'cardinality(other_kinds)'],
]) {
  test('changed reminder ' + description + ' fails exact definition validation', () => {
    for (const actual of [reminderSource, reminderRestored]) {
      assert.throws(() => normalizeRestoreSchema(source + actual.replace(before, after)), /RESTORE_CHECK_DEFINITION/);
    }
  });
}

test('duplicate reminder definitions and unrelated schema changes are not normalized away', () => {
  assert.throws(() => normalizeRestoreSchema(source + reminderSource + reminderRestored), /RESTORE_CHECK_DEFINITION/);
  const good = normalizeRestoreSchema(source + reminderSource);
  assert.notEqual(good, normalizeRestoreSchema(restored.replace('id integer', 'id text') + reminderRestored));
  assert.notEqual(good, normalizeRestoreSchema(restored + reminderRestored.replace('ck_hr_employee_date_reminder_kind', 'unreviewed_kind')));
});

test('required installation ACL rejects a broadened source catalog policy too', () => {
  const grants = [{grantee: 'synthetic_reader', privilege: 'EXECUTE', grantable: false}];
  const manifest = {functionCount: 1, functions: [{signature: 'synthetic()', routineKind: 'f',
    securityDefiner: false, config: null, grants}]};
  const actual = [{signature: 'synthetic()', kind: 'f', definer: false, config: null, grants}];
  assertSelectedRestoreAcl(actual, manifest);
  assert.throws(() => assertSelectedRestoreAcl([{...actual[0], grants: [...grants,
    {grantee: 'PUBLIC', privilege: 'EXECUTE', grantable: false}]}], manifest), /RESTORE_REQUIRED_ACL/);
  assert.throws(() => assertSelectedRestoreAcl([], manifest), /RESTORE_REQUIRED_ACL/);
});

async function ownedDirectory(work) {
  const directory = await realpath(await mkdtemp(resolve(tmpdir(), 'hr-restore-register-')));
  try { return await work(directory); } finally { await rm(directory, {recursive: true, force: true}); }
}

test('physical file-root identity is stable for one directory and differs for another', async () => {
  await ownedDirectory(async source => ownedDirectory(async target => {
    assert.equal(await fileRootStatIdentity(source), await fileRootStatIdentity(source));
    assert.notEqual(await fileRootStatIdentity(source), await fileRootStatIdentity(target));
  }));
});

test('managed directory lock rejects concurrent writers and releases on success/failure', async () => {
  await ownedDirectory(async directory => {
    await withRestoreDirectoryLock(directory, async () => {
      await assert.rejects(withRestoreDirectoryLock(directory, () => {}), /RESTORE_REGISTRATION_BUSY/);
    });
    await assert.rejects(withRestoreDirectoryLock(directory, () => { throw new Error('synthetic failure'); }), /synthetic failure/);
    assert.equal(await withRestoreDirectoryLock(directory, () => 'available'), 'available');
  });
});

test('marker replacement preserves exact bytes on conflict and installs only the selected binding', async () => {
  await ownedDirectory(async directory => {
    const path = resolve(directory, '.jinhu-hr-enterprise-root.json');
    const original = Buffer.from('synthetic original\n');
    const replacement = Buffer.from('synthetic replacement\n');
    await writeFile(path, original, {mode: 0o600});
    await assert.rejects(replaceRestoreMarker(directory, Buffer.from('wrong source'), replacement), /RESTORE_MARKER_CONFLICT/);
    assert.deepEqual(await readFile(path), original);
    await withRestoreDirectoryLock(directory, () => replaceRestoreMarker(directory, original, replacement));
    assert.deepEqual(await readFile(path), replacement);
    assert.deepEqual(await readdir(directory), ['.jinhu-hr-enterprise-root.json']);
  });
});

test('deterministic restored binding binds pair/catalog/source and actual physical target', () => {
  const config = {target: {host: '127.0.0.1', port: 5432, database: 'synthetic_target'},
    manifestSha256: sha256('pair'), recoveryCatalogSha256: sha256('catalog')};
  const manifest = {sourceDatabaseIdentity: sha256('source'), files: {'.jinhu-hr-enterprise-root.json': {sha256: sha256('old marker')}}};
  const physical = sha256('physical');
  const result = restoredMarkerBytes(config, manifest, physical);
  assert.deepEqual(result, restoredMarkerBytes(config, manifest, physical));
  assert.notDeepEqual(result, restoredMarkerBytes(config, manifest, sha256('other physical target')));
  const decoded = JSON.parse(result);
  assert.equal(decoded.runtimeMode, 'hr_enterprise');
  assert.equal(decoded.restore.sourceMarkerSha256, sha256('old marker'));
  assert.equal(decoded.restore.pairManifestSha256, config.manifestSha256);
  assert.equal(decoded.restore.targetPhysicalIdentity, physical);
});

test('apply requires a specific target pin; invalid modes fail before any connection', async () => {
  await assert.rejects(registerRestoredPair({mode: 'unknown'}), /RESTORE_MODE/);
  await assert.rejects(registerRestoredPair({mode: 'apply', target: {user: 'synthetic', password: ''}}), /RESTORE_TARGET_PIN_REQUIRED/);
});

test('CLI requires explicit private configuration and emits only a fixed error', () => {
  const r = spawnSync(process.execPath, ['scripts/hr-enterprise/register-restored-pair.mjs'], {encoding: 'utf8'});
  assert.equal(r.status, 1); assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'RESTORE_PRIVATE_CONFIG_ARGUMENT_REQUIRED\n');
});
