-- =============================================================================
-- 000329_canteen_rbac_roles.sql
-- 园区餐厅管理（canteen）业务角色开通（幂等，可重复执行）
-- 依据：docs/canteen/permissions.md 第 3/6 节 + packages/shared/src/canteen/permission-bundles.ts
-- 范围：5 个业务角色（CANTEEN_ADMIN/CASHIER/CONTRACTOR/FINANCE/EMPLOYEE）+ 76 条角色-权限绑定。
--       不在此迁移创建用户账号（生产用户由管理员界面创建后按 rel_user_role 分配）。
--       不注册 bundle 表（sys_property_permission_bundle 为 property 模块专用，
--       bundle 溯源记录于 sys_role.applied_bundle_codes）。
-- 与 000326 的关系：000326 已注册 41 个 canteen:* 权限点并授予 SUPER_ADMIN（全量）与
--       AUDITOR（只读 7）；本迁移补齐 permissions.md §6 声明的默认业务角色授予。
-- 约束：仅当 RBAC 底座表存在时执行（隔离空库跳过）。
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.sys_role') IS NULL
     OR to_regclass('public.rel_role_perm') IS NULL
     OR to_regclass('public.sys_permission') IS NULL THEN
    RAISE NOTICE 'canteen: RBAC base tables absent, skipping role seed';
    RETURN;
  END IF;

  -- 1) 创建 5 个 canteen 业务角色（幂等）
  INSERT INTO sys_role (
    tenant_id, park_id, code, name, role_type, role_scope, data_scope, data_scope_config,
    is_template, is_system, is_builtin, is_super, editable, is_editable, is_deletable,
    is_enabled, status, role_level, level, sort_no, applied_bundle_codes,
    create_time, update_time, is_deleted, version, remark
  )
  SELECT
    '10000001', '20000001', v.code, v.name, 'park', 'park', 'park', '{}',
    true, false, true, false, true, true, true,
    true, 'enabled', 1, 1, v.sort_no, jsonb_build_array(v.bundle),
    now(), now(), false, 1, 'Canteen module role (permissions.md §6)'
  FROM (VALUES
    ('CANTEEN_ADMIN',      '餐厅管理员',   200, 'canteen-bundle:canteen-admin'),
    ('CANTEEN_CASHIER',    '餐厅收银员',   210, 'canteen-bundle:canteen-cashier'),
    ('CANTEEN_CONTRACTOR', '餐厅承包方',   220, 'canteen-bundle:canteen-contractor'),
    ('CANTEEN_FINANCE',    '餐厅财务',     230, 'canteen-bundle:canteen-finance'),
    ('CANTEEN_EMPLOYEE',   '餐厅员工',     240, 'canteen-bundle:canteen-employee')
  ) AS v(code, name, sort_no, bundle)
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_role existing
    WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
      AND existing.code = v.code AND existing.is_deleted = false
  );

  -- 2) 角色-权限绑定（幂等；权限集与 shared permission-bundles.ts 一致）
  INSERT INTO rel_role_perm (
    tenant_id, park_id, role_id, permission_id,
    create_time, update_time, is_deleted, version, remark
  )
  SELECT
    '10000001', '20000001', role.id, permission.id,
    now(), now(), false, 1, 'Canteen role bundle grant'
  FROM (VALUES
    ('CANTEEN_ADMIN',     'canteen:outlet:view'), ('CANTEEN_ADMIN',     'canteen:outlet:create'),
    ('CANTEEN_ADMIN',     'canteen:outlet:update'),('CANTEEN_ADMIN',    'canteen:outlet:status'),
    ('CANTEEN_ADMIN',     'canteen:category:view'),('CANTEEN_ADMIN',    'canteen:category:create'),
    ('CANTEEN_ADMIN',     'canteen:category:update'),('CANTEEN_ADMIN',  'canteen:category:delete'),
    ('CANTEEN_ADMIN',     'canteen:dish:view'),('CANTEEN_ADMIN',       'canteen:dish:create'),
    ('CANTEEN_ADMIN',     'canteen:dish:update'),('CANTEEN_ADMIN',     'canteen:dish:shelf'),
    ('CANTEEN_ADMIN',     'canteen:dish:stock'),('CANTEEN_ADMIN',      'canteen:order:view'),
    ('CANTEEN_ADMIN',     'canteen:order:create'),('CANTEEN_ADMIN',    'canteen:order:cancel'),
    ('CANTEEN_ADMIN',     'canteen:order:refund'),('CANTEEN_ADMIN',    'canteen:order:audit'),
    ('CANTEEN_ADMIN',     'canteen:payment:view'),('CANTEEN_ADMIN',    'canteen:qrcode:view'),
    ('CANTEEN_ADMIN',     'canteen:qrcode:manage'),('CANTEEN_ADMIN',   'canteen:session:open'),
    ('CANTEEN_ADMIN',     'canteen:session:close'),('CANTEEN_ADMIN',   'canteen:session:view'),
    ('CANTEEN_ADMIN',     'canteen:wallet:view'),('CANTEEN_ADMIN',     'canteen:wallet:lookup'),
    ('CANTEEN_ADMIN',     'canteen:wallet:manage'),('CANTEEN_ADMIN',   'canteen:subsidy:grant:view'),
    ('CANTEEN_ADMIN',     'canteen:subsidy:grant:generate'),('CANTEEN_ADMIN', 'canteen:subsidy:grant:expire'),
    ('CANTEEN_ADMIN',     'canteen:meal-record:view'),('CANTEEN_ADMIN','canteen:refund:view'),
    ('CANTEEN_ADMIN',     'canteen:settlement:view'),('CANTEEN_ADMIN', 'canteen:settlement:generate'),
    ('CANTEEN_ADMIN',     'canteen:settlement:submit'),('CANTEEN_ADMIN','canteen:settlement:dispute'),
    ('CANTEEN_ADMIN',     'canteen:report:view'),('CANTEEN_ADMIN',     'canteen:dashboard:view'),

    ('CANTEEN_CASHIER',   'canteen:dish:view'),('CANTEEN_CASHIER',    'canteen:order:view'),
    ('CANTEEN_CASHIER',   'canteen:order:create'),('CANTEEN_CASHIER',  'canteen:order:cancel'),
    ('CANTEEN_CASHIER',   'canteen:order:refund'),('CANTEEN_CASHIER',  'canteen:payment:view'),
    ('CANTEEN_CASHIER',   'canteen:session:open'),('CANTEEN_CASHIER',  'canteen:session:close'),
    ('CANTEEN_CASHIER',   'canteen:session:view'),('CANTEEN_CASHIER',  'canteen:wallet:lookup'),

    ('CANTEEN_CONTRACTOR','canteen:outlet:view'),('CANTEEN_CONTRACTOR','canteen:dish:view'),
    ('CANTEEN_CONTRACTOR','canteen:order:view'),('CANTEEN_CONTRACTOR', 'canteen:payment:view'),
    ('CANTEEN_CONTRACTOR','canteen:subsidy:grant:view'),('CANTEEN_CONTRACTOR', 'canteen:meal-record:view'),
    ('CANTEEN_CONTRACTOR','canteen:settlement:view'),('CANTEEN_CONTRACTOR', 'canteen:settlement:submit'),
    ('CANTEEN_CONTRACTOR','canteen:settlement:dispute'),('CANTEEN_CONTRACTOR', 'canteen:report:view'),
    ('CANTEEN_CONTRACTOR','canteen:dashboard:view'),

    ('CANTEEN_FINANCE',   'canteen:outlet:view'),('CANTEEN_FINANCE',   'canteen:order:view'),
    ('CANTEEN_FINANCE',   'canteen:order:audit'),('CANTEEN_FINANCE',   'canteen:payment:view'),
    ('CANTEEN_FINANCE',   'canteen:subsidy:grant:view'),('CANTEEN_FINANCE', 'canteen:meal-record:view'),
    ('CANTEEN_FINANCE',   'canteen:refund:view'),('CANTEEN_FINANCE',   'canteen:settlement:view'),
    ('CANTEEN_FINANCE',   'canteen:settlement:reconcile'),('CANTEEN_FINANCE', 'canteen:settlement:approve'),
    ('CANTEEN_FINANCE',   'canteen:settlement:settle'),('CANTEEN_FINANCE', 'canteen:settlement:dispute'),
    ('CANTEEN_FINANCE',   'canteen:report:view'),('CANTEEN_FINANCE',   'canteen:dashboard:view'),

    ('CANTEEN_EMPLOYEE',  'canteen:wallet:view'),('CANTEEN_EMPLOYEE',  'canteen:subsidy:grant:view'),
    ('CANTEEN_EMPLOYEE',  'canteen:meal-record:view')
  ) AS v(role_code, perm_code)
  JOIN sys_role role
    ON role.tenant_id = '10000001' AND role.park_id = '20000001'
   AND role.code = v.role_code AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = '10000001' AND permission.park_id = '20000001'
   AND permission.code = v.perm_code AND permission.is_deleted = false
  WHERE NOT EXISTS (
    SELECT 1 FROM rel_role_perm existing
    WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
      AND existing.role_id = role.id AND existing.permission_id = permission.id
      AND existing.is_deleted = false
  );
END $$;
