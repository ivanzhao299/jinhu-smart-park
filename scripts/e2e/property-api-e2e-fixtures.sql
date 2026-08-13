\set ON_ERROR_STOP on

WITH scope AS (
  SELECT :'tenant_id' AS tenant_id, :'park_id' AS park_id
), role_row AS (
  INSERT INTO sys_role (
    tenant_id, park_id, code, name, parent_id, role_path, role_level, level,
    sort_no, role_type, role_scope, data_scope, data_scope_config,
    is_template, is_system, is_builtin, is_super, editable, is_editable,
    is_deletable, is_enabled, status, remark
  )
  SELECT tenant_id, park_id, 'PROPERTY_API_E2E_APPROVER', 'Property API E2E Approver',
         NULL, 'PROPERTY_API_E2E_APPROVER', 1, 1, 399,
         'park', 'park', 'park', '{}'::jsonb,
         false, false, false, false, false, false, true, true, 'enabled',
         'Disposable Release Smoke property API approval actor'
  FROM scope
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false
  DO UPDATE SET
    park_id = EXCLUDED.park_id,
    name = EXCLUDED.name,
    role_path = EXCLUDED.role_path,
    role_level = EXCLUDED.role_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    role_type = EXCLUDED.role_type,
    role_scope = EXCLUDED.role_scope,
    data_scope = EXCLUDED.data_scope,
    data_scope_config = EXCLUDED.data_scope_config,
    is_template = false,
    is_system = false,
    is_builtin = false,
    is_super = false,
    editable = false,
    is_editable = false,
    is_deletable = true,
    is_enabled = true,
    status = 'enabled',
    update_time = clock_timestamp(),
    version = sys_role.version + 1,
    remark = EXCLUDED.remark
  RETURNING id
), permission_rows AS (
  SELECT permission.id
  FROM scope
  JOIN sys_permission permission
    ON permission.tenant_id = scope.tenant_id
   AND permission.park_id = scope.park_id
   AND permission.code IN (
     'asset:identity-submissions:page',
     'party:identity_verify',
     'property_approval:read',
     'property_approval:decide'
   )
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_by, update_by, is_deleted, remark)
SELECT :'tenant_id', :'park_id', role_row.id, permission_rows.id, NULL, NULL, false,
       'Disposable Release Smoke property API approver permission'
FROM role_row
CROSS JOIN permission_rows
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false
DO UPDATE SET
  update_time = clock_timestamp(),
  version = rel_role_perm.version + 1,
  remark = EXCLUDED.remark;

WITH scope AS (
  SELECT :'tenant_id' AS tenant_id, :'park_id' AS park_id
), root_org AS (
  SELECT org.id
  FROM scope
  JOIN sys_org org
    ON org.tenant_id = scope.tenant_id
   AND org.park_id = scope.park_id
   AND org.is_deleted = false
  ORDER BY org.sort_order ASC, org.create_time ASC
  LIMIT 1
), upsert_user AS (
  INSERT INTO sys_user (
    tenant_id, park_id, username, display_name, password_hash,
    mobile, email, is_enabled, status, create_by, update_by, remark
  )
  SELECT tenant_id, park_id, :'approver_username', 'Property Approver CI',
         :'approver_password_hash', '13800005678', 'property.approver.ci@example.com',
         true, 'enabled', NULL, NULL,
         'Disposable Release Smoke property API approver'
  FROM scope
  ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    is_enabled = true,
    status = 'enabled',
    password_failed_count = 0,
    password_failed_window_started_at = NULL,
    password_locked_until = NULL,
    last_password_failed_at = NULL,
    update_time = clock_timestamp(),
    version = sys_user.version + 1,
    remark = EXCLUDED.remark
  RETURNING id
), role_row AS (
  SELECT role.id
  FROM scope
  JOIN sys_role role
    ON role.tenant_id = scope.tenant_id
   AND role.park_id = scope.park_id
   AND role.code = 'PROPERTY_API_E2E_APPROVER'
   AND role.is_deleted = false
)
INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, create_by, update_by, is_deleted, remark)
SELECT :'tenant_id', :'park_id', upsert_user.id, role_row.id, NULL, NULL, false,
       'Disposable Release Smoke property API approver binding'
FROM upsert_user
CROSS JOIN role_row
ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false
DO UPDATE SET
  update_time = clock_timestamp(),
  version = rel_user_role.version + 1,
  remark = EXCLUDED.remark;

WITH scope AS (
  SELECT :'tenant_id' AS tenant_id, :'park_id' AS park_id
), approver AS (
  SELECT id
  FROM sys_user
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND username = :'approver_username'
    AND is_enabled = true
    AND status = 'enabled'
    AND is_deleted = false
)
INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, create_by, update_by, is_deleted, remark)
SELECT scope.tenant_id, approver.id, scope.park_id, true, 'enabled', NULL, NULL, false,
       'Disposable Release Smoke property API approver park binding'
FROM scope
CROSS JOIN approver
ON CONFLICT (tenant_id, user_id, park_id) WHERE is_deleted = false
DO UPDATE SET
  is_default = true,
  status = 'enabled',
  update_time = clock_timestamp(),
  version = rel_user_park.version + 1,
  remark = EXCLUDED.remark;

WITH scope AS (
  SELECT :'tenant_id' AS tenant_id, :'park_id' AS park_id
), approver AS (
  SELECT id
  FROM sys_user
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND username = :'approver_username'
    AND is_enabled = true
    AND status = 'enabled'
    AND is_deleted = false
), root_org AS (
  SELECT org.id
  FROM scope
  JOIN sys_org org
    ON org.tenant_id = scope.tenant_id
   AND org.park_id = scope.park_id
   AND org.is_deleted = false
  ORDER BY org.sort_order ASC, org.create_time ASC
  LIMIT 1
)
INSERT INTO rel_user_org (tenant_id, park_id, user_id, org_id, post_id, is_primary, create_by, update_by, is_deleted, remark)
SELECT scope.tenant_id, scope.park_id, approver.id, root_org.id, NULL, true, NULL, NULL, false,
       'Disposable Release Smoke property API approver org binding'
FROM scope
CROSS JOIN approver
CROSS JOIN root_org
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_user_org existing
  WHERE existing.tenant_id = scope.tenant_id
    AND existing.park_id = scope.park_id
    AND existing.user_id = approver.id
    AND existing.org_id = root_org.id
    AND existing.post_id IS NULL
    AND existing.is_deleted = false
);

SELECT count(*) = 4 AS approver_permissions_ready
FROM sys_user app_user
JOIN rel_user_role user_role
  ON user_role.user_id = app_user.id
 AND user_role.tenant_id = app_user.tenant_id
 AND user_role.park_id = app_user.park_id
 AND user_role.is_deleted = false
JOIN sys_role role
  ON role.id = user_role.role_id
 AND role.tenant_id = app_user.tenant_id
 AND role.park_id = app_user.park_id
 AND role.code = 'PROPERTY_API_E2E_APPROVER'
 AND role.is_super = false
 AND role.is_deleted = false
JOIN rel_role_perm role_permission
  ON role_permission.role_id = role.id
 AND role_permission.tenant_id = role.tenant_id
 AND role_permission.park_id = role.park_id
 AND role_permission.is_deleted = false
JOIN sys_permission permission
  ON permission.id = role_permission.permission_id
 AND permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.code IN (
   'asset:identity-submissions:page',
   'party:identity_verify',
   'property_approval:read',
   'property_approval:decide'
 )
 AND permission.is_deleted = false
WHERE app_user.tenant_id = :'tenant_id'
  AND app_user.park_id = :'park_id'
  AND app_user.username = :'approver_username'
  AND app_user.is_enabled = true
  AND app_user.status = 'enabled'
  AND app_user.is_deleted = false
\gset
\if :approver_permissions_ready
  \echo 'Disposable least-privilege property approver: PASS'
\else
  \echo 'Property API E2E requires a non-super approver with identity and approval permissions.'
  \quit 5
\endif

WITH approver AS (
  SELECT id
  FROM sys_user
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND username = :'approver_username'
    AND is_enabled = true
    AND status = 'enabled'
    AND is_deleted = false
), policy AS (
  SELECT jsonb_build_object(
    'requiredPermissions', jsonb_build_array('asset:identity-submissions:page', 'party:identity_verify'),
    'requiredModules', jsonb_build_array('asset'),
    'relationScope', 'tenant-park-current',
    'dataScope', 'party-submission',
    'actorExclusions', jsonb_build_array('maker'),
    'eligibleVerifierUserIds', jsonb_build_array(id::text),
    'queueSupervisorUserIds', jsonb_build_array(id::text)
  ) AS snapshot
  FROM approver
)
INSERT INTO biz_party_identity_verification_queue (
  tenant_id, park_id, queue_code, display_name, status,
  eligibility_policy_version, eligibility_policy_snapshot,
  eligibility_policy_hash, legacy_backfill, legacy_anomaly, version
)
SELECT :'tenant_id', :'park_id', 'property-api-e2e', 'Disposable property API E2E', 'active',
       1, snapshot, encode(digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex'),
       false, false, 1
FROM policy
ON CONFLICT (tenant_id, park_id, queue_code)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = 'active',
  eligibility_policy_version = biz_party_identity_verification_queue.eligibility_policy_version + 1,
  eligibility_policy_snapshot = EXCLUDED.eligibility_policy_snapshot,
  eligibility_policy_hash = EXCLUDED.eligibility_policy_hash,
  legacy_backfill = false,
  legacy_anomaly = false,
  version = biz_party_identity_verification_queue.version + 1,
  update_time = clock_timestamp();

WITH candidates AS (
  SELECT id, row_number() OVER (ORDER BY unit_code, id) AS ordinal
  FROM biz_unit
  WHERE tenant_id = :'tenant_id'
    AND park_id = :'park_id'
    AND is_deleted = false
), desired AS (
  SELECT id AS unit_id,
         CASE ordinal WHEN 1 THEN 'short_stay' ELSE 'long_rent' END AS operating_mode
  FROM candidates
  WHERE ordinal <= 2
)
INSERT INTO biz_property_operation_config (
  tenant_id, park_id, unit_id, operating_mode, operating_status,
  effective_time, version, remark
)
SELECT :'tenant_id', :'park_id', unit_id, operating_mode, 'enabled',
       transaction_timestamp(), 1, 'disposable property API E2E fixture'
FROM desired
ON CONFLICT (tenant_id, park_id, unit_id) WHERE is_deleted = false
DO UPDATE SET
  operating_mode = EXCLUDED.operating_mode,
  operating_status = 'enabled',
  effective_time = EXCLUDED.effective_time,
  suspend_reason = NULL,
  update_time = transaction_timestamp(),
  version = biz_property_operation_config.version + 1,
  remark = EXCLUDED.remark;

SELECT count(*) FILTER (WHERE operating_mode = 'short_stay') >= 1
   AND count(*) FILTER (WHERE operating_mode = 'long_rent') >= 1 AS fixture_ready
FROM biz_property_operation_config
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND operating_mode IN ('short_stay', 'long_rent')
  AND operating_status = 'enabled'
  AND is_deleted = false
\gset
\if :fixture_ready
  \echo 'Disposable property operation fixtures: PASS'
\else
  \echo 'Property API E2E requires two active units.'
  \quit 3
\endif

SELECT count(*) = 1 AS identity_queue_ready
FROM biz_party_identity_verification_queue
WHERE tenant_id = :'tenant_id'
  AND park_id = :'park_id'
  AND queue_code = 'property-api-e2e'
  AND status = 'active'
  AND legacy_backfill = false
\gset
\if :identity_queue_ready
  \echo 'Disposable identity verification queue: PASS'
\else
  \echo 'Property API E2E requires one active identity verification queue.'
  \quit 4
\endif
