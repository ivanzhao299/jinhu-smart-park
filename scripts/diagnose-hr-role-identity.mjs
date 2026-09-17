import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixed identity predicate from production seed 000033. Return counts, never rows.
export const identitySql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH users AS (
 SELECT id,is_enabled FROM sys_user
 WHERE tenant_id='10000001' AND park_id='20000001'
 AND username IN ('wu_enguo','wuenguo') AND display_name='吴恩国' AND is_deleted=false
), roles AS (
 SELECT id FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001'
 AND code='HR_MANAGER' AND is_deleted=false AND is_enabled=true AND is_super=false
)
SELECT json_build_object(
 'matchingUsers',(SELECT count(*) FROM users),
 'enabledUsers',(SELECT count(*) FROM users WHERE is_enabled=true),
 'eligibleRoles',(SELECT count(*) FROM roles),
 'boundUsers',(SELECT count(DISTINCT u.id) FROM users u JOIN rel_user_role ur ON ur.user_id=u.id
 JOIN roles r ON r.id=ur.role_id WHERE ur.tenant_id='10000001' AND ur.park_id='20000001' AND ur.is_deleted=false)
);
ROLLBACK;`;

export function diagnoseIdentity(deployPath, run = execFileSync) {
  if (typeof deployPath !== 'string' || !isAbsolute(deployPath)) throw new Error('HR_ROLE_IDENTITY_PATH_INVALID');
  let value;
  try {
    const output = run('docker', ['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml',
      'exec','-T','postgres','sh','-c',
      'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: deployPath, input: identitySql, encoding: 'utf8', timeout: 15000, maxBuffer: 4096, stdio: ['pipe','pipe','pipe'] });
    value = JSON.parse(output);
  } catch { throw new Error('HR_ROLE_IDENTITY_PROBE_FAILED'); }
  const keys = ['matchingUsers','enabledUsers','eligibleRoles','boundUsers'];
  if (!value || Object.keys(value).length !== keys.length || !keys.every(k => Number.isSafeInteger(value[k]) && value[k] >= 0)
    || value.enabledUsers > value.matchingUsers || value.boundUsers > value.matchingUsers) throw new Error('HR_ROLE_IDENTITY_RESULT_INVALID');
  return { kind: 'hr_role_identity_counts', ...Object.fromEntries(keys.map(k => [k,value[k]])),
    classification: value.matchingUsers === 0 ? 'IDENTITY_MISSING' : value.matchingUsers > 1 ? 'IDENTITY_AMBIGUOUS'
      : value.eligibleRoles !== 1 ? 'ROLE_UNRESOLVED' : 'EXACT_IDENTITY_AND_ROLE', productionImport: 'HOLD' };
}

if (process.argv[1] === '-' || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 3) throw new Error('HR_ROLE_IDENTITY_PATH_INVALID');
    process.stdout.write(JSON.stringify(diagnoseIdentity(process.argv[2]))+'\n');
  } catch (error) {
    const allowed = ['HR_ROLE_IDENTITY_PATH_INVALID','HR_ROLE_IDENTITY_PROBE_FAILED','HR_ROLE_IDENTITY_RESULT_INVALID'];
    process.stderr.write((allowed.includes(error.message) ? error.message : 'HR_ROLE_IDENTITY_PROBE_FAILED')+'\n');
    process.exitCode=1;
  }
}
