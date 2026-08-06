BEGIN;

CREATE TABLE IF NOT EXISTS admin_issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  issue_no varchar(40) NOT NULL UNIQUE,
  title varchar(200) NOT NULL,
  description text NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(40) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','TRIAGED','APPROVED','IN_PROGRESS','VERIFIED','RELEASED','CLOSED','REJECTED')),
  runner_status varchar(40) NOT NULL DEFAULT 'NONE' CHECK (runner_status IN ('NONE','READY','CLAIMED','RUNNING','WAITING_REVIEW','SUCCEEDED','FAILED','HOLD')),
  module_code varchar(80), route varchar(500) NOT NULL, url varchar(1000),
  reporter_id uuid NOT NULL, reporter_name varchar(160) NOT NULL,
  client_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  acceptance_criteria text, approved_by uuid, approved_at timestamptz,
  runner_id varchar(128), lease_token uuid, lease_expires_at timestamptz,
  implementation_commit varchar(64), changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  release_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_summary text,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_admin_issue_scope_status ON admin_issue_reports (tenant_id, park_id, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_admin_issue_runner_ready ON admin_issue_reports (tenant_id, park_id, runner_status, create_time) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_admin_issue_reporter ON admin_issue_reports (tenant_id, park_id, reporter_id, create_time DESC) WHERE is_deleted = false;

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id),
permissions(code, name, action, method, api_path) AS (
  VALUES
    ('admin_issue:create', '提交问题反馈', 'create', 'POST', '/api/v1/admin-issues'),
    ('admin_issue:read', '查看问题反馈', 'read', 'GET', '/api/v1/admin-issues'),
    ('admin_issue:manage', '管理问题修复', 'manage', 'PATCH', '/api/v1/admin-issues/:issueNo/triage'),
    ('admin_issue:runner', '问题修复 Runner', 'runner', 'POST', '/api/v1/admin-issues/:issueNo/runner/*')
)
INSERT INTO sys_permission (
  tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
  api_method, api_path, status, is_system, is_builtin, visible
)
SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
       'ops.admin_issue', permissions.action, 'api', 40, permissions.method,
       permissions.api_path, 'enabled', true, true, true
FROM seed_scope CROSS JOIN permissions
ON CONFLICT (tenant_id, code) WHERE is_deleted = false
DO UPDATE SET name = EXCLUDED.name, action = EXCLUDED.action, api_method = EXCLUDED.api_method,
              api_path = EXCLUDED.api_path, update_time = now(), is_deleted = false;

-- Every existing role may report and read its own issues through the scoped API.
WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false
FROM seed_scope
JOIN sys_role role ON role.tenant_id = seed_scope.tenant_id AND role.park_id = seed_scope.park_id AND role.is_deleted = false
JOIN sys_permission permission ON permission.tenant_id = seed_scope.tenant_id AND permission.park_id = seed_scope.park_id
  AND permission.code = 'admin_issue:create' AND permission.is_deleted = false
ON CONFLICT DO NOTHING;

-- Management is granted only to roles that already manage users; Runner permission is provisioned separately to a service role.
WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted)
SELECT seed_scope.tenant_id, seed_scope.park_id, source_role.role_id, target.id, now(), now(), false
FROM seed_scope
JOIN rel_role_perm source_role ON source_role.tenant_id = seed_scope.tenant_id AND source_role.park_id = seed_scope.park_id AND source_role.is_deleted = false
JOIN sys_permission source ON source.id = source_role.permission_id AND source.code = 'system:user:update' AND source.is_deleted = false
JOIN sys_permission target ON target.tenant_id = seed_scope.tenant_id AND target.park_id = seed_scope.park_id
  AND target.code IN ('admin_issue:read','admin_issue:manage') AND target.is_deleted = false
ON CONFLICT DO NOTHING;

COMMIT;
