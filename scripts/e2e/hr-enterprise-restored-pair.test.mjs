import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, chmod, symlink, link, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sha256, databaseIdentity, copyRowBytes, inventoryFiles, validateManifest,
  inspectDatabase, verifyRestoredPair} from '../hr-enterprise/verify-restored-pair.mjs';

const hash = sha256('synthetic');
const manifest = () => ({formatVersion: 1, runtimeMode: 'hr_enterprise',
  fingerprintFormat: 'postgres-copy-jsonb-text-c-v1', sourceDatabaseIdentity: hash,
  sourceFileRootIdentity: hash, installManifestSha256: hash,
  dump: {bytes: 1, sha256: hash}, tables: {synthetic: {rows: 0, sha256: sha256('')}},
  files: {'.jinhu-hr-enterprise-root.json': {bytes: 1, sha256: hash}}});

test('COPY fingerprint retains JSON escape semantics, UTF8 and control bytes', () => {
  assert.equal(copyRowBytes('工资\\path\t\n\r\b\f\v'), '工资\\\\path\\t\\n\\r\\b\\f\\v\n');
  assert.equal(copyRowBytes('{"label": "synthetic"}'), '{"label": "synthetic"}\n');
});

test('runtime identity matches host/port/database tuple and distinguishes restored target', () => {
  const c = {host: '127.0.0.1', port: 5432, database: 'synthetic_source'};
  assert.equal(databaseIdentity(c), sha256(JSON.stringify([c.host, '5432', c.database])));
  assert.notEqual(databaseIdentity(c), databaseIdentity({...c, database: 'synthetic_target'}));
});

test('manifest rejects empty table/file proof, unsafe names and invalid counts', () => {
  validateManifest(manifest());
  for (const mutate of [m => {m.tables = {};}, m => {m.files = {};},
    m => {m.tables['injected";DROP TABLE t;--'] = m.tables.synthetic;},
    m => {m.tables.synthetic.rows = -1;}, m => {m.tables.synthetic.sha256 = 'bad';},
    m => {m.files['../escape'] = {bytes: 1, sha256: hash};},
    m => {m.files['/absolute'] = {bytes: 1, sha256: hash};},
    m => {m.fingerprintFormat = 'unknown';}, m => {m.sourceDatabaseIdentity = 'bad';},
    m => {m.tables.synthetic.rows = 5000001;}]) {
    const m = manifest(); mutate(m); assert.throws(() => validateManifest(m), /^Error: PAIR_/);
  }
});

test('inventory observes exact content and refuses symbolic and hard links', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'hr-pair-test-'));
  const root = await (await import('node:fs/promises')).realpath(parent);
  try {
    await mkdir(resolve(root, 'nested'));
    await writeFile(resolve(root, 'nested/file'), 'synthetic');
    assert.deepEqual(await inventoryFiles(root), {'nested/file': {bytes: 9, sha256: hash}});
    await symlink(resolve(root, 'nested/file'), resolve(root, 'alias'));
    await assert.rejects(inventoryFiles(root), /PAIR_FILE_TYPE/);
    await rm(resolve(root, 'alias'));
    await link(resolve(root, 'nested/file'), resolve(root, 'hard'));
    await assert.rejects(inventoryFiles(root), /PAIR_REGULAR_FILE_REQUIRED/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('check rejects apply and an unpinned manifest before any connection', async () => {
  await assert.rejects(verifyRestoredPair({mode: 'apply', manifestSha256: hash}), /PAIR_CHECK_ONLY/);
  const directory = await mkdtemp(resolve(tmpdir(), 'hr-pair-config-'));
  const root = await (await import('node:fs/promises')).realpath(directory);
  try {
    const path = resolve(root, 'manifest.json'); await writeFile(path, JSON.stringify(manifest()), {mode: 0o600});
    await assert.rejects(verifyRestoredPair({mode: 'check', manifestPath: path, manifestSha256: hash}), /PAIR_MANIFEST_PIN/);
    await chmod(path, 0o644);
    await assert.rejects(verifyRestoredPair({mode: 'check', manifestPath: path, manifestSha256: hash}), /PAIR_PRIVATE_CONFIG_REQUIRED/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('database rejection rolls back the explicit read-only snapshot', async () => {
  const queries = [];
  const db = {query: async sql => {
    queries.push(sql);
    return {rows: sql.startsWith('SELECT c.relname') ? [{name: 'unexpected', kind: 'r'}] : []};
  }};
  await assert.rejects(inspectDatabase(db, manifest().tables, []), /PAIR_DATABASE_TABLE_SET/);
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.some(sql => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/.test(sql)), false);
});

test('CLI refuses missing private configuration without dumping stacks or paths', () => {
  const r = spawnSync(process.execPath, ['scripts/hr-enterprise/verify-restored-pair.mjs'], {encoding: 'utf8'});
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'PAIR_PRIVATE_CONFIG_ARGUMENT_REQUIRED\n');
});
