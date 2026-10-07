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
), selected AS (
 SELECT * FROM users WHERE id IN (
  SELECT id FROM sys_user WHERE tenant_id='10000001' AND park_id='20000001'
  AND display_name='吴恩国' AND is_deleted=false
  AND (username='wuenguo' OR (username='wu_enguo' AND NOT EXISTS (
   SELECT 1 FROM sys_user WHERE tenant_id='10000001' AND park_id='20000001'
   AND username='wuenguo' AND display_name='吴恩国' AND is_deleted=false
  )))
 )
), required(code) AS (
 VALUES ('hr'),('hr:employees'),('hr:employee:read'),
 ('hr:employee_profile:read'),('hr:employee_profile:manage')
), roles AS (
 SELECT id FROM sys_role WHERE tenant_id='10000001' AND park_id='20000001'
 AND code='HR_MANAGER' AND is_deleted=false AND is_enabled=true AND is_super=false
), role_capabilities AS (
 SELECT DISTINCT p.code FROM roles r JOIN rel_role_perm rp ON rp.role_id=r.id
 JOIN sys_permission p ON p.id=rp.permission_id JOIN required q ON q.code=p.code
 WHERE rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false
 AND p.tenant_id='10000001' AND p.park_id='20000001' AND p.is_deleted=false AND p.is_enabled=true
), effective_capabilities AS (
 SELECT DISTINCT p.code FROM selected u JOIN rel_user_role ur ON ur.user_id=u.id
 JOIN sys_role r ON r.id=ur.role_id JOIN rel_role_perm rp ON rp.role_id=r.id
 JOIN sys_permission p ON p.id=rp.permission_id JOIN required q ON q.code=p.code
 WHERE u.is_enabled=true AND ur.tenant_id='10000001' AND ur.park_id='20000001' AND ur.is_deleted=false
 AND r.tenant_id='10000001' AND r.is_deleted=false AND r.is_enabled=true AND r.status='enabled'
 AND (r.role_scope='tenant' OR r.park_id='20000001')
 AND rp.tenant_id='10000001' AND rp.park_id='20000001' AND rp.is_deleted=false
 AND p.tenant_id='10000001' AND p.is_deleted=false AND p.is_enabled=true AND p.status='enabled'
)
SELECT json_build_object(
 'matchingUsers',(SELECT count(*) FROM users),
 'enabledUsers',(SELECT count(*) FROM users WHERE is_enabled=true),
 'eligibleRoles',(SELECT count(*) FROM roles),
 'selectedUsers',(SELECT count(*) FROM selected),
 'enabledSelectedUsers',(SELECT count(*) FROM selected WHERE is_enabled=true),
 'selectedBoundUsers',(SELECT count(DISTINCT u.id) FROM selected u JOIN rel_user_role ur ON ur.user_id=u.id
 JOIN roles r ON r.id=ur.role_id WHERE ur.tenant_id='10000001' AND ur.park_id='20000001' AND ur.is_deleted=false),
 'requiredPermissions',(SELECT count(*) FROM required),
 'rolePermissions',(SELECT count(*) FROM role_capabilities),
 'effectivePermissions',(SELECT count(*) FROM effective_capabilities),
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
  const keys = ['matchingUsers','enabledUsers','eligibleRoles','boundUsers','selectedUsers','enabledSelectedUsers','selectedBoundUsers','requiredPermissions','rolePermissions','effectivePermissions'];
  if (!value || Object.keys(value).length !== keys.length || !keys.every(k => Number.isSafeInteger(value[k]) && value[k] >= 0)
    || value.enabledUsers > value.matchingUsers || value.boundUsers > value.matchingUsers || value.selectedUsers > value.matchingUsers
    || value.enabledSelectedUsers > value.selectedUsers || value.selectedBoundUsers > value.selectedUsers
    || value.requiredPermissions !== 5 || value.rolePermissions > 5 || value.effectivePermissions > 5) throw new Error('HR_ROLE_IDENTITY_RESULT_INVALID');
  return { kind: 'hr_role_identity_counts', ...Object.fromEntries(keys.map(k => [k,value[k]])),
    classification: value.matchingUsers === 0 ? 'IDENTITY_MISSING' : value.matchingUsers > 1 ? 'IDENTITY_AMBIGUOUS'
      : value.eligibleRoles !== 1 ? 'ROLE_UNRESOLVED' : 'EXACT_IDENTITY_AND_ROLE', productionImport: 'HOLD',
    selectedClassification: value.selectedUsers === 0 ? 'SELECTED_IDENTITY_MISSING'
      : value.selectedUsers !== 1 ? 'SELECTED_IDENTITY_AMBIGUOUS'
      : value.enabledSelectedUsers !== 1 ? 'SELECTED_IDENTITY_DISABLED'
      : value.eligibleRoles !== 1 ? 'ROLE_UNRESOLVED'
      : value.selectedBoundUsers !== 1 ? 'SELECTED_ROLE_UNBOUND'
      : value.effectivePermissions !== 5 ? 'PROFILE_CAPABILITIES_INCOMPLETE' : 'SELECTED_PROFILE_ACCESS_READY' };
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
