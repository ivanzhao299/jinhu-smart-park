import {createHash} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {lstat, open, realpath, readdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const markerName = '.jinhu-hr-enterprise-root.json';
const shaPattern = /^[a-f0-9]{64}$/;
const tablePattern = /^[a-z][a-z0-9_]{0,62}$/;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const same = isDeepStrictEqual;
const ordered = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'en')));

export function databaseIdentity(config) {
  return sha256(JSON.stringify([config.host, String(config.port), config.database]));
}

export async function regularFile(path, privateFile = false) {
  requireCondition(isAbsolute(path) && await realpath(path) === path, 'PAIR_FILE_PATH');
  const info = await lstat(path);
  requireCondition(info.isFile() && info.nlink === 1, 'PAIR_REGULAR_FILE_REQUIRED');
  if (privateFile) requireCondition((info.mode & 0o077) === 0, 'PAIR_PRIVATE_CONFIG_REQUIRED');
  return info;
}

export async function digestFile(path) {
  const before = await regularFile(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    requireCondition(before.dev === opened.dev && before.ino === opened.ino, 'PAIR_FILE_CHANGED');
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(path, {fd: handle.fd, autoClose: false})) hash.update(bytes);
    const after = await lstat(path);
    requireCondition(same([before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs],
      [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs]), 'PAIR_FILE_CHANGED');
    return {bytes: before.size, sha256: hash.digest('hex')};
  } finally { await handle.close(); }
}

export async function inventoryFiles(directory) {
  requireCondition(isAbsolute(directory) && directory !== '/' && await realpath(directory) === directory,
    'PAIR_REAL_DIRECTORY_REQUIRED');
  requireCondition((await lstat(directory)).isDirectory(), 'PAIR_REAL_DIRECTORY_REQUIRED');
  const result = {};
  let entries = 0;
  async function visit(path, prefix, depth) {
    requireCondition(depth <= 32, 'PAIR_FILE_DEPTH_LIMIT');
    for (const item of await readdir(path, {withFileTypes: true})) {
      requireCondition(++entries <= 100000, 'PAIR_FILE_COUNT_LIMIT');
      const relative = prefix + item.name;
      requireCondition(!item.name.includes('\\') && item.name !== '__proto__', 'PAIR_FILE_NAME');
      if (item.isDirectory()) await visit(resolve(path, item.name), relative + '/', depth + 1);
      else {
        requireCondition(item.isFile(), 'PAIR_FILE_TYPE');
        result[relative] = await digestFile(resolve(path, item.name));
      }
    }
  }
  await visit(directory, '', 0);
  return ordered(result);
}

export function validateManifest(manifest) {
  requireCondition(manifest?.formatVersion === 1 && manifest.runtimeMode === 'hr_enterprise'
    && manifest.fingerprintFormat === 'postgres-copy-jsonb-text-c-v1', 'PAIR_MANIFEST_FORMAT');
  for (const field of ['sourceDatabaseIdentity', 'sourceFileRootIdentity', 'installManifestSha256']) {
    requireCondition(shaPattern.test(manifest[field]), 'PAIR_MANIFEST_HASH');
  }
  requireCondition(Number.isSafeInteger(manifest.dump?.bytes) && manifest.dump.bytes > 0
    && shaPattern.test(manifest.dump.sha256), 'PAIR_DUMP_MANIFEST');
  requireCondition(manifest.tables && typeof manifest.tables === 'object' && !Array.isArray(manifest.tables)
    && Object.keys(manifest.tables).length > 0 && Object.keys(manifest.tables).length <= 500,
  'PAIR_TABLE_MANIFEST');
  for (const [name, fingerprint] of Object.entries(manifest.tables)) {
    requireCondition(tablePattern.test(name) && Number.isSafeInteger(fingerprint?.rows)
      && fingerprint.rows >= 0 && fingerprint.rows <= 5000000 && shaPattern.test(fingerprint.sha256),
    'PAIR_TABLE_MANIFEST');
  }
  requireCondition(manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files)
    && Object.keys(manifest.files).length > 0 && Object.keys(manifest.files).length <= 100000
    && Object.hasOwn(manifest.files, markerName), 'PAIR_FILES_MANIFEST');
  for (const [name, fingerprint] of Object.entries(manifest.files)) {
    requireCondition(name.length <= 4096 && !name.includes('\\') && !name.includes('\0')
      && name.split('/').every(part => part && !['.', '..', '__proto__'].includes(part))
      && Number.isSafeInteger(fingerprint?.bytes) && fingerprint.bytes >= 0
      && shaPattern.test(fingerprint.sha256), 'PAIR_FILES_MANIFEST');
  }
}

// Match PostgreSQL COPY text escaping used by the retained snapshot audit. Row
// JSON stays inside this process; only counts and SHA-256 leave the verifier.
export const copyRowBytes = text => text.replace(/\\/g, '\\\\').replace(/\t/g, '\\t')
  .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u0008/g, '\\b')
  .replace(/\f/g, '\\f').replace(/\v/g, '\\v') + '\n';

// Caller must already own a consistent transaction. The ordinary content
// checker wraps this in READ ONLY; offline registration holds maintenance locks.
export async function inspectDatabaseSnapshot(db, expectedTables, installSteps) {
  const result = {};
  await db.query("SET LOCAL statement_timeout='30s'");
  await db.query("SET LOCAL lock_timeout='3s'");
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  const {rows: tables} = await db.query("SELECT c.relname name,c.relkind kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname COLLATE \"C\"");
  requireCondition(tables.every(t => t.kind === 'r') && same(tables.map(t => t.name),
    Object.keys(expectedTables).sort()), 'PAIR_DATABASE_TABLE_SET');
  const {rows: modes} = await db.query('SELECT runtime_mode,schema_version FROM public.sys_hr_runtime_schema');
  requireCondition(modes.length === 1 && modes[0].runtime_mode === 'hr_enterprise'
    && modes[0].schema_version === 1, 'PAIR_DATABASE_MODE');
  requireCondition(!tables.some(t => ['biz_park', 'asset_park', 'rel_user_park'].includes(t.name)), 'PAIR_PARK_SCHEMA');
  const {rows: history} = await db.query('SELECT file,sha256 FROM public.sys_hr_enterprise_schema_history ORDER BY file COLLATE "C"');
  requireCondition(same(history, installSteps.map(s => ({file: s.file, sha256: s.sha256}))
    .sort((a, b) => a.file < b.file ? -1 : 1)), 'PAIR_DATABASE_HISTORY');
  for (const name of Object.keys(expectedTables).sort()) {
    requireCondition(tablePattern.test(name), 'PAIR_TABLE_MANIFEST');
    await db.query(`DECLARE pair_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM public."${name}" t ORDER BY (to_jsonb(t)::text) COLLATE "C"`);
    let count = 0;
    const hash = createHash('sha256');
    while (true) {
      const {rows} = await db.query('FETCH FORWARD 1000 FROM pair_rows');
      if (!rows.length) break;
      count += rows.length;
      requireCondition(count <= expectedTables[name].rows, 'PAIR_DATABASE_ROWS');
      for (const {row} of rows) hash.update(copyRowBytes(row));
    }
    await db.query('CLOSE pair_rows');
    result[name] = {rows: count, sha256: hash.digest('hex')};
    requireCondition(same(result[name], expectedTables[name]), 'PAIR_DATABASE_ROWS');
  }
  return result;
}

export async function inspectDatabase(db, expectedTables, installSteps) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const result = await inspectDatabaseSnapshot(db, expectedTables, installSteps);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function preparePairInputs(config) {
  requireCondition(shaPattern.test(config?.manifestSha256), 'PAIR_MANIFEST_PIN');
  await regularFile(config.manifestPath, true);
  const bytes = await readFile(config.manifestPath);
  requireCondition(sha256(bytes) === config.manifestSha256, 'PAIR_MANIFEST_PIN');
  const manifest = JSON.parse(bytes);
  validateManifest(manifest);
  const target = config.target;
  requireCondition(target && typeof target.host === 'string' && target.host.length > 0
    && Number.isInteger(target.port) && target.port > 0 && target.port <= 65535
    && typeof target.database === 'string' && target.database.length > 0
    && target.database !== 'jinhu_smart_park'
    && Object.keys(target).every(key => ['host', 'port', 'database', 'user', 'password', 'ssl'].includes(key)),
  'PAIR_TARGET_CONFIG');
  requireCondition(databaseIdentity(target) !== manifest.sourceDatabaseIdentity, 'PAIR_SOURCE_IS_TARGET');
  requireCondition(sha256(config.fileRoot) !== manifest.sourceFileRootIdentity, 'PAIR_SOURCE_FILES_ARE_TARGET');
  const installBytes = await readFile(resolve(root, 'database/hr-enterprise/install-manifest.json'));
  requireCondition(sha256(installBytes) === manifest.installManifestSha256, 'PAIR_INSTALL_MANIFEST');
  const install = JSON.parse(installBytes);
  for (const step of install.steps) requireCondition(sha256(await readFile(resolve(root, step.file))) === step.sha256,
    'PAIR_INSTALL_SOURCE_DRIFT');
  requireCondition(same(await digestFile(config.dumpPath), manifest.dump), 'PAIR_DUMP_HASH');
  return {manifest, install};
}

export async function verifyRestoredPair(config) {
  requireCondition(config?.mode === 'check' && shaPattern.test(config.manifestSha256), 'PAIR_CHECK_ONLY');
  const {manifest, install} = await preparePairInputs(config);
  const target = config.target;
  const before = await inventoryFiles(config.fileRoot);
  requireCondition(same(before, ordered(manifest.files)), 'PAIR_FILES_HASH');
  const marker = JSON.parse(await readFile(resolve(config.fileRoot, markerName), 'utf8'));
  requireCondition(marker.runtimeMode === 'hr_enterprise' && marker.databaseIdentity === manifest.sourceDatabaseIdentity,
    'PAIR_SOURCE_MARKER');
  const {Client} = createRequire(resolve(root, 'apps/api/package.json'))('pg');
  const db = new Client({...target, connectionTimeoutMillis: 5000, query_timeout: 35000});
  await db.connect();
  let tables;
  try { tables = await inspectDatabase(db, manifest.tables, install.steps); }
  finally { await db.end(); }
  requireCondition(same(before, await inventoryFiles(config.fileRoot)), 'PAIR_FILES_CHANGED');
  return {status: 'PASS', stage: 'RESTORED_PAIR_CONTENT_CHECK', manifestSha256: config.manifestSha256,
    sourceDatabaseIdentity: manifest.sourceDatabaseIdentity, targetDatabaseIdentity: databaseIdentity(target),
    tableCount: Object.keys(tables).length, rowCount: Object.values(tables).reduce((n, t) => n + t.rows, 0),
    fileCount: Object.keys(before).length, fileBytes: Object.values(before).reduce((n, f) => n + f.bytes, 0),
    databaseWrites: 0, fileWrites: 0, runtimeRegistration: 'NOT_EXECUTED',
    schemaAndRoleEquivalence: 'NOT_PROVEN_BY_CONTENT_CHECK', restoredHttp: 'NOT_EXECUTED',
    fullProductAcceptance: false};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 3, 'PAIR_PRIVATE_CONFIG_ARGUMENT_REQUIRED');
    await regularFile(process.argv[2], true);
    const result = await verifyRestoredPair(JSON.parse(await readFile(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(/^PAIR_[A-Z_]+$/.test(error?.message) ? error.message : 'PAIR_CHECK_FAILED');
    process.exitCode = 1;
  }
}
