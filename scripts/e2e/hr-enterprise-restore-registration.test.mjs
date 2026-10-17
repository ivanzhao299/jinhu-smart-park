import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, realpath, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
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
