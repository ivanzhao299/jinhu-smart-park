import {readFile, realpath, lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify, isDeepStrictEqual} from 'node:util';
import {basename} from 'node:path';
import process from 'node:process';
import {sha256, regularFile} from './verify-restored-pair.mjs';

const run = promisify(execFile);
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const reviewedChecks = [
  ['ck_sys_business_scope_kind', 'scope_kind', ['enterprise', 'park']],
  ['ck_sys_business_scope_status', 'status', ['enabled', 'disabled']],
  ['ck_sys_business_scope_module_status', 'status', ['enabled', 'disabled']],
  ['ck_sys_user_business_scope_membership_status', 'status', ['enabled', 'disabled']],
];
// Exact PostgreSQL16 deparser forms observed after restoring migration382.
// Their absence permits retained pre382 schemas, not malformed definitions.
const reminderChecks = [
  ['ck_hr_employee_date_reminder_kind', 'reminder_kind', ['birthday', 'hire_anniversary'], ','],
  ['ck_hr_employee_date_reminder_policy', 'leap_day_policy', ['skip', 'feb_28', 'mar_1'], ','],
  ['ck_hr_employee_date_reminder_status', 'status', ['open', 'read', 'acknowledged', 'resolved', 'cancelled'], ','],
  ['ck_hr_employee_date_reminder_action', 'action', ['read', 'acknowledge', 'resolve', 'cancel'], ''],
];

function normalizeExactCheck(text, name, before, after, required) {
  if (!required && !text.includes('CONSTRAINT ' + name + ' ')) return text;
  const lines = text.split('\n');
  requireCondition(lines.filter(line => line.includes('CONSTRAINT ' + name + ' ')).length === 1
    && lines.filter(line => line === before || line === after).length === 1,
  'RESTORE_CHECK_DEFINITION');
  return text.replace(before, after);
}

export async function fileRootStatIdentity(path) {
  const info = await lstat(path);
  requireCondition(info.isDirectory() && await realpath(path) === path, 'RESTORE_FILE_ROOT');
  return sha256(JSON.stringify([info.dev, info.ino]));
}

export function normalizeRestoreSchema(raw) {
  let text = raw.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('--')
    && !line.startsWith('\\restrict ') && !line.startsWith('\\unrestrict ')).join('\n');
  for (const [name, column, values, suffix = ','] of [...reviewedChecks, ...reminderChecks]) {
    const beforeArray = "((ARRAY[" + values.map(v => "'" + v + "'::character varying").join(', ') + "])::text[])";
    const afterArray = "(ARRAY[" + values.map(v => "('" + v + "'::character varying)::text").join(', ') + "])";
    const before = '    CONSTRAINT ' + name + ' CHECK (((' + column + ')::text = ANY ' + beforeArray + '))' + suffix;
    const after = '    CONSTRAINT ' + name + ' CHECK (((' + column + ')::text = ANY ' + afterArray + '))' + suffix;
    text = normalizeExactCheck(text, name, before, after, reviewedChecks.some(([required]) => required === name));
  }
  text = normalizeExactCheck(text, 'ck_hr_employee_date_reminder_recipients',
    "    CONSTRAINT ck_hr_employee_date_reminder_recipients CHECK ((((cardinality(recipient_kinds) >= 1) AND (cardinality(recipient_kinds) <= 3)) AND (recipient_kinds <@ ARRAY['hr'::text, 'manager'::text, 'employee'::text]))),",
    "    CONSTRAINT ck_hr_employee_date_reminder_recipients CHECK (((cardinality(recipient_kinds) >= 1) AND (cardinality(recipient_kinds) <= 3) AND (recipient_kinds <@ ARRAY['hr'::text, 'manager'::text, 'employee'::text]))),",
    false);
  return text;
}

export async function observeRestoreCatalog(db, capabilityRoles) {
  await db.query('SET LOCAL search_path=pg_catalog,public');
  const {rows: [identity]} = await db.query("SELECT system_identifier::text cluster_id,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,current_setting('server_version_num')::int version_num FROM pg_control_system()");
  requireCondition(/^\d+$/.test(identity.cluster_id) && /^\d+$/.test(identity.database_oid), 'RESTORE_PHYSICAL_IDENTITY');
  const {rows: roles} = await db.query('SELECT rolname name,rolcanlogin login,rolinherit inherit,rolsuper super,rolcreatedb "createDB",rolcreaterole "createRole",rolreplication replication,rolbypassrls "bypassRLS" FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"', [capabilityRoles]);
  requireCondition(isDeepStrictEqual(roles.map(r => r.name), [...capabilityRoles].sort(ascii))
    && roles.every(r => Object.entries(r).every(([key, value]) => key === 'name' || value === false)), 'RESTORE_CAPABILITY_ROLES');
  const {rows: [memberships]} = await db.query('SELECT count(*)::int count FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid OR r.oid=m.member WHERE r.rolname=ANY($1::text[])', [capabilityRoles]);
  requireCondition(memberships.count === 0, 'RESTORE_CAPABILITY_MEMBERSHIPS');
  const {rows} = await db.query(`SELECT p.oid::regprocedure::text signature,p.prokind kind,p.prosecdef definer,p.proconfig config,pg_get_functiondef(p.oid) definition,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,a.privilege_type) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.grantee<>p.proowner),'[]'::jsonb) grants
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`);
  const routines = rows.map(({definition, ...row}) => ({...row, definitionSha256: sha256(definition),
    grants: row.grants.sort((a, b) => ascii(a.grantee, b.grantee) || ascii(a.privilege, b.privilege))}))
    .sort((a, b) => ascii(a.signature, b.signature));
  return {physicalIdentity: sha256(JSON.stringify([identity.cluster_id, identity.database_oid])),
    postgresMajor: Math.floor(identity.version_num / 10000), roles, routines};
}

export function assertSelectedRestoreAcl(routines, manifest) {
  const bySignature = new Map(routines.map(row => [row.signature, row]));
  requireCondition(manifest.functions.length === manifest.functionCount, 'RESTORE_REQUIRED_ACL');
  const sorted = grants => [...grants].sort((a, b) => ascii(a.grantee, b.grantee) || ascii(a.privilege, b.privilege));
  for (const expected of manifest.functions) {
    const actual = bySignature.get(expected.signature);
    requireCondition(actual && actual.kind === expected.routineKind && actual.definer === expected.securityDefiner
      && isDeepStrictEqual(actual.config, expected.config)
      && isDeepStrictEqual(sorted(actual.grants), sorted(expected.grants)), 'RESTORE_REQUIRED_ACL');
  }
}

export async function dumpRestoreSchema(config, snapshot, postgresMajor) {
  requireCondition(/^[0-9A-Fa-f-]+$/.test(snapshot), 'RESTORE_SNAPSHOT');
  const executable = await realpath(config.pgDumpExecutable);
  requireCondition(basename(executable) === 'pg_dump', 'RESTORE_PGDUMP_TOOL');
  await regularFile(executable);
  const {stdout: version} = await run(executable, ['--version'], {timeout: 5000, maxBuffer: 4096});
  requireCondition(Number(/^pg_dump \(PostgreSQL\) (\d+)\./.exec(version)?.[1]) === postgresMajor,
    'RESTORE_PGDUMP_VERSION');
  const target = config.target;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  Object.assign(env, {PGPASSWORD: target.password ?? '', PGPASSFILE: '/dev/null',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000'});
  const {stdout} = await run(executable, ['--host', target.host, '--port', String(target.port), '--username', target.user,
    '--dbname', target.database, '--no-password', '--schema-only', '--no-owner', '--no-privileges', '--snapshot', snapshot],
  {env, timeout: 60000, maxBuffer: 16 * 1024 * 1024});
  return stdout;
}

export async function readPinnedRecoveryCatalog(config, pairManifestSha256) {
  requireCondition(/^[a-f0-9]{64}$/.test(config.recoveryCatalogSha256), 'RESTORE_CATALOG_PIN');
  await regularFile(config.recoveryCatalogPath, true);
  const bytes = await readFile(config.recoveryCatalogPath);
  requireCondition(sha256(bytes) === config.recoveryCatalogSha256, 'RESTORE_CATALOG_PIN');
  const catalog = JSON.parse(bytes);
  requireCondition(catalog.formatVersion === 1 && catalog.pairManifestSha256 === pairManifestSha256
    && /^[a-f0-9]{64}$/.test(catalog.sourcePhysicalIdentity)
    && /^[a-f0-9]{64}$/.test(catalog.sourceFileRootStatIdentity)
    && /^[a-f0-9]{64}$/.test(catalog.sourceSchemaSha256)
    && /^[a-f0-9]{64}$/.test(catalog.canonicalSchemaSha256)
    && Number.isInteger(catalog.postgresMajor) && Array.isArray(catalog.roles)
    && Array.isArray(catalog.routines) && catalog.routines.length >= 324, 'RESTORE_CATALOG_FORMAT');
  await regularFile(config.sourceSchemaPath, true);
  const schema = await readFile(config.sourceSchemaPath);
  requireCondition(sha256(schema) === catalog.sourceSchemaSha256
    && sha256(normalizeRestoreSchema(schema.toString('utf8'))) === catalog.canonicalSchemaSha256,
  'RESTORE_SOURCE_SCHEMA_PIN');
  return catalog;
}
