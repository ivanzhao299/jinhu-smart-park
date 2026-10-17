import {createRequire} from 'node:module';
import {readFile, mkdir, lstat, realpath, open, rename, unlink, rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {databaseIdentity, sha256, regularFile, inventoryFiles, preparePairInputs,
  inspectDatabaseSnapshot} from './verify-restored-pair.mjs';
import {observeRestoreCatalog, assertSelectedRestoreAcl, fileRootStatIdentity, dumpRestoreSchema, normalizeRestoreSchema,
  readPinnedRecoveryCatalog} from './restore-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const markerName = '.jinhu-hr-enterprise-root.json';
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
const same = isDeepStrictEqual;

export async function withRestoreDirectoryLock(fileRoot, work) {
  requireCondition(fileRoot !== '/' && await realpath(fileRoot) === fileRoot, 'RESTORE_FILE_ROOT');
  const dir = await lstat(fileRoot);
  requireCondition(dir.isDirectory() && (dir.mode & 0o077) === 0, 'RESTORE_PRIVATE_FILE_ROOT');
  const lock = resolve(dirname(fileRoot), '.hr-restore-lock-' + sha256(fileRoot).slice(0, 24));
  try { await mkdir(lock, {mode: 0o700}); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('RESTORE_REGISTRATION_BUSY'); throw error; }
  const lockIdentity = identity(await lstat(lock)).slice(0, 2);
  try { return await work(); }
  finally {
    requireCondition(same(identity(await lstat(lock)).slice(0, 2), lockIdentity), 'RESTORE_LOCK_CHANGED');
    await rmdir(lock);
  }
}

export async function replaceRestoreMarker(fileRoot, expectedBytes, replacement) {
  const path = resolve(fileRoot, markerName);
  const before = await regularFile(path, true);
  requireCondition((await readFile(path)).equals(expectedBytes), 'RESTORE_MARKER_CONFLICT');
  const temporary = resolve(fileRoot, '.hr-restore-marker-' + randomUUID() + '.tmp');
  let handle;
  let renamed = false;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(replacement);
    await handle.sync();
    await handle.close(); handle = undefined;
    requireCondition(same(identity(before), identity(await lstat(path)))
      && (await readFile(path)).equals(expectedBytes), 'RESTORE_MARKER_CONFLICT');
    await rename(temporary, path); renamed = true;
    const directory = await open(fileRoot, constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    if (handle) await handle.close();
    if (!renamed) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export function restoredMarkerBytes(config, manifest, physicalIdentity) {
  return Buffer.from(JSON.stringify({runtimeMode: 'hr_enterprise', databaseIdentity: databaseIdentity(config.target),
    restore: {formatVersion: 1, pairManifestSha256: config.manifestSha256,
      recoveryCatalogSha256: config.recoveryCatalogSha256, sourceDatabaseIdentity: manifest.sourceDatabaseIdentity,
      sourceMarkerSha256: manifest.files[markerName].sha256, targetPhysicalIdentity: physicalIdentity}}) + '\n');
}

async function requireOfflineTarget(db) {
  // PostgreSQL may cache activity observations for the current transaction.
  await db.query('SELECT pg_stat_clear_snapshot()');
  const {rows: [row]} = await db.query('SELECT count(*)::int count FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()');
  requireCondition(row.count === 0, 'RESTORE_TARGET_NOT_OFFLINE');
}

export async function registerRestoredPair(config) {
  const mode = config.mode ?? 'check';
  requireCondition(['check', 'apply'].includes(mode), 'RESTORE_MODE');
  requireCondition(typeof config.target?.user === 'string' && config.target.user.length > 0
    && typeof config.target.password === 'string' && !Object.hasOwn(config.target, 'ssl'), 'RESTORE_TARGET_CONFIG');
  if (mode === 'apply') requireCondition(/^[a-f0-9]{64}$/.test(config.expectedTargetPhysicalIdentity), 'RESTORE_TARGET_PIN_REQUIRED');
  const {manifest, install} = await preparePairInputs(config);
  const catalog = await readPinnedRecoveryCatalog(config, config.manifestSha256);
  requireCondition(await fileRootStatIdentity(config.fileRoot) !== catalog.sourceFileRootStatIdentity,
    'RESTORE_SOURCE_FILES_ARE_TARGET');
  const acl = JSON.parse(await readFile(resolve(root, 'database/hr-enterprise/function-acl-manifest.json'), 'utf8'));
  return withRestoreDirectoryLock(config.fileRoot, async () => {
    const path = resolve(config.fileRoot, markerName);
    await regularFile(path, true);
    const original = await readFile(path);
    const {Client} = createRequire(resolve(root, 'apps/api/package.json'))('pg');
    const db = new Client({...config.target, connectionTimeoutMillis: 5000, query_timeout: 35000});
    await db.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await db.query("SET LOCAL statement_timeout='30s'");
      await db.query("SET LOCAL lock_timeout='3s'");
      const {rows: [lock]} = await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('jinhu-hr-enterprise-restore-registration',0)) locked");
      requireCondition(lock.locked === true, 'RESTORE_DATABASE_BUSY');
      await requireOfflineTarget(db);
      // Every table name was validated by preparePairInputs. Locks cover normal
      // business DML and existing-table DDL until the marker is durable.
      await db.query('LOCK TABLE ' + Object.keys(manifest.tables).sort().map(name => 'public."' + name + '"').join(',') + ' IN SHARE ROW EXCLUSIVE MODE');
      const actual = await observeRestoreCatalog(db, acl.roles);
      assertSelectedRestoreAcl(actual.routines, acl);
      requireCondition(actual.physicalIdentity !== catalog.sourcePhysicalIdentity, 'RESTORE_SOURCE_IS_TARGET');
      if (mode === 'apply') requireCondition(actual.physicalIdentity === config.expectedTargetPhysicalIdentity, 'RESTORE_TARGET_PIN');
      requireCondition(actual.postgresMajor === catalog.postgresMajor && same(actual.roles, catalog.roles)
        && same(actual.routines, catalog.routines), 'RESTORE_CATALOG_DRIFT');
      const replacement = restoredMarkerBytes(config, manifest, actual.physicalIdentity);
      const replay = original.equals(replacement);
      if (!replay) {
        requireCondition(sha256(original) === manifest.files[markerName].sha256
          && original.length === manifest.files[markerName].bytes, 'RESTORE_MARKER_CONFLICT');
        const saved = JSON.parse(original);
        requireCondition(saved.runtimeMode === 'hr_enterprise' && saved.databaseIdentity === manifest.sourceDatabaseIdentity,
          'RESTORE_SOURCE_MARKER');
      }
      const expectedFiles = {...manifest.files, [markerName]: {bytes: original.length, sha256: sha256(original)}};
      requireCondition(same(await inventoryFiles(config.fileRoot), expectedFiles), 'RESTORE_FILES_DRIFT');
      const {rows: [snapshot]} = await db.query('SELECT pg_export_snapshot() snapshot');
      const schema = await dumpRestoreSchema(config, snapshot.snapshot, actual.postgresMajor);
      requireCondition(sha256(normalizeRestoreSchema(schema)) === catalog.canonicalSchemaSha256, 'RESTORE_SCHEMA_DRIFT');
      const tables = await inspectDatabaseSnapshot(db, manifest.tables, install.steps);
      await requireOfflineTarget(db);
      requireCondition(same(await inventoryFiles(config.fileRoot), expectedFiles), 'RESTORE_FILES_DRIFT');
      // A repeatable-read transaction cannot observe later global-role changes.
      // Use a fresh read-only snapshot, close it, then recheck offline state.
      const fresh = new Client({...config.target, connectionTimeoutMillis: 5000, query_timeout: 35000});
      await fresh.connect();
      try {
        await fresh.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await fresh.query("SET LOCAL statement_timeout='30s'");
        requireCondition(same(actual, await observeRestoreCatalog(fresh, acl.roles)), 'RESTORE_CATALOG_CHANGED');
        await fresh.query('ROLLBACK');
      } finally { await fresh.end(); }
      await requireOfflineTarget(db);
      if (mode === 'apply' && !replay) await replaceRestoreMarker(config.fileRoot, original, replacement);
      else requireCondition((await readFile(path)).equals(original), 'RESTORE_MARKER_CONFLICT');
      await db.query('COMMIT');
      return {status: 'PASS', mode, runtimeRegistration: mode === 'check' ? 'CHECK_ONLY' : replay ? 'VERIFIED_REPLAY' : 'APPLIED',
        pairManifestSha256: config.manifestSha256, recoveryCatalogSha256: config.recoveryCatalogSha256,
        sourceDatabaseIdentity: manifest.sourceDatabaseIdentity, targetDatabaseIdentity: databaseIdentity(config.target),
        targetPhysicalIdentity: actual.physicalIdentity, oldMarkerSha256: sha256(original),
        newMarkerSha256: sha256(mode === 'apply' ? replacement : original),
        tableCount: Object.keys(tables).length, rowCount: Object.values(tables).reduce((n, t) => n + t.rows, 0),
        fileCount: Object.keys(expectedFiles).length, publicRoutineCount: actual.routines.length,
        capabilityRoleCount: actual.roles.length, databaseWrites: 0, markerWrites: mode === 'apply' && !replay ? 1 : 0,
        restoredHttp: 'NOT_EXECUTED', productionRtoRpo: 'NOT_MEASURED', fullProductAcceptance: false};
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { await db.end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 3, 'RESTORE_PRIVATE_CONFIG_ARGUMENT_REQUIRED');
    await regularFile(process.argv[2], true);
    console.log(JSON.stringify(await registerRestoredPair(JSON.parse(await readFile(process.argv[2], 'utf8')))));
  } catch (error) {
    console.error(/^(RESTORE|PAIR)_[A-Z_]+$/.test(error?.message) ? error.message : 'RESTORE_REGISTRATION_FAILED');
    process.exitCode = 1;
  }
}
