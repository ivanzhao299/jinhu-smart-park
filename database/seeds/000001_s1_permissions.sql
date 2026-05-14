-- Default S1 permission seed.
-- Replace tenant_id and park_id when seeding a real environment.
WITH seed_scope AS (
  SELECT
    '00000000-0000-4000-8000-000000000001'::uuid AS tenant_id,
    '00000000-0000-4000-8000-000000000101'::uuid AS park_id
),
permissions(code, name, resource, action) AS (
  VALUES
    ('system:org:list', '组织列表', 'system.org', 'list'),
    ('system:org:create', '新增组织', 'system.org', 'create'),
    ('system:org:detail', '组织详情', 'system.org', 'detail'),
    ('system:org:update', '编辑组织', 'system.org', 'update'),
    ('system:org:delete', '删除组织', 'system.org', 'delete'),
    ('system:user:list', '用户列表', 'system.user', 'list'),
    ('system:user:create', '新增用户', 'system.user', 'create'),
    ('system:user:detail', '用户详情', 'system.user', 'detail'),
    ('system:user:update', '编辑用户', 'system.user', 'update'),
    ('system:user:delete', '删除用户', 'system.user', 'delete'),
    ('system:user:reset-password', '重置密码', 'system.user', 'reset-password'),
    ('system:user:assign-roles', '分配角色', 'system.user', 'assign-roles'),
    ('system:user:me', '当前用户', 'system.user', 'me'),
    ('system:role:list', '角色列表', 'system.role', 'list'),
    ('system:role:create', '新增角色', 'system.role', 'create'),
    ('system:role:detail', '角色详情', 'system.role', 'detail'),
    ('system:role:update', '编辑角色', 'system.role', 'update'),
    ('system:role:delete', '删除角色', 'system.role', 'delete'),
    ('system:role:assign-permissions', '角色授权', 'system.role', 'assign-permissions'),
    ('system:permission:list', '权限列表', 'system.permission', 'list'),
    ('system:permission:tree', '权限树', 'system.permission', 'tree'),
    ('system:dict-type:list', '字典类型列表', 'system.dict-type', 'list'),
    ('system:dict-type:create', '新增字典类型', 'system.dict-type', 'create'),
    ('system:dict-type:detail', '字典类型详情', 'system.dict-type', 'detail'),
    ('system:dict-type:update', '编辑字典类型', 'system.dict-type', 'update'),
    ('system:dict-type:delete', '删除字典类型', 'system.dict-type', 'delete'),
    ('system:dict-item:list', '字典项列表', 'system.dict-item', 'list'),
    ('system:dict-item:create', '新增字典项', 'system.dict-item', 'create'),
    ('system:dict-item:detail', '字典项详情', 'system.dict-item', 'detail'),
    ('system:dict-item:update', '编辑字典项', 'system.dict-item', 'update'),
    ('system:dict-item:delete', '删除字典项', 'system.dict-item', 'delete'),
    ('system:attachment:list', '附件列表', 'system.attachment', 'list'),
    ('system:attachment:create', '新增附件', 'system.attachment', 'create'),
    ('system:attachment:detail', '附件详情', 'system.attachment', 'detail'),
    ('system:attachment:delete', '删除附件', 'system.attachment', 'delete'),
    ('file:read', '文件读取', 'system.file', 'read'),
    ('file:upload', '文件上传', 'system.file', 'upload'),
    ('file:download', '文件下载', 'system.file', 'download'),
    ('file:delete', '文件删除', 'system.file', 'delete'),
    ('audit:read', '审计读取', 'system.audit', 'read'),
    ('audit:export', '审计导出', 'system.audit', 'export'),
    ('system:audit:login-log:list', '登录日志列表', 'system.audit', 'login-log:list'),
    ('system:audit:op-log:list', '操作日志列表', 'system.audit', 'op-log:list')
)
INSERT INTO sys_permission (
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  is_enabled,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  permissions.code,
  permissions.name,
  permissions.resource,
  permissions.action,
  true,
  'enabled',
  'S1 permission seed'
FROM permissions
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  is_enabled = true,
  status = 'enabled',
  is_deleted = false,
  update_time = now();
