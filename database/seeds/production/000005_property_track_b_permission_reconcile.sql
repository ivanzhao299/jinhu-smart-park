-- Production-safe post-seed reconciliation for the PR192 Track B permission
-- definitions. Migration 000189 deliberately runs before tenant/park seed data
-- exists on a clean install, so this seed replays only its frozen permission
-- definitions into the single production bootstrap scope and grants them only
-- to that scope's built-in SUPER_ADMIN role.

BEGIN;

CREATE TEMP TABLE property_track_b_seed_scope (
  tenant_id varchar(64) PRIMARY KEY,
  park_id varchar(64) NOT NULL
) ON COMMIT DROP;

INSERT INTO property_track_b_seed_scope (tenant_id, park_id)
VALUES ('10000001', '20000001');

DO $$
DECLARE
  tenant_count integer;
  park_count integer;
  asset_assignment_count integer;
  asset_parent_count integer;
  super_admin_count integer;
BEGIN
  SELECT count(*) INTO tenant_count
  FROM property_track_b_seed_scope scope
  JOIN sys_tenant tenant
    ON tenant.tenant_id = scope.tenant_id
   AND tenant.status = 1
   AND tenant.is_deleted = false
   AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp());

  SELECT count(*) INTO park_count
  FROM property_track_b_seed_scope scope
  JOIN biz_park park
    ON park.tenant_id = scope.tenant_id
   AND park.park_id = scope.park_id
   AND park.status = 1
   AND park.is_deleted = false;

  SELECT count(*) INTO asset_assignment_count
  FROM property_track_b_seed_scope scope
  JOIN rel_tenant_module assignment
    ON assignment.tenant_id = scope.tenant_id
   AND assignment.park_id = scope.park_id
   AND assignment.enabled = true
   AND assignment.status = 'enabled'
   AND assignment.is_deleted = false
   AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
   AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.module_code = 'asset'
   AND module.status = 1
   AND module.is_deleted = false;

  SELECT count(*) INTO asset_parent_count
  FROM property_track_b_seed_scope scope
  JOIN sys_permission permission
    ON permission.tenant_id = scope.tenant_id
   AND permission.code = 'asset'
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  SELECT count(*) INTO super_admin_count
  FROM property_track_b_seed_scope scope
  JOIN sys_role role
    ON role.tenant_id = scope.tenant_id
   AND role.park_id = scope.park_id
   AND role.code = 'SUPER_ADMIN'
   AND role.is_system = true
   AND role.is_builtin = true
   AND role.is_super = true
   AND role.is_enabled = true
   AND role.status = 'enabled'
   AND role.is_deleted = false;

  IF tenant_count <> 1
     OR park_count <> 1
     OR asset_assignment_count <> 1
     OR asset_parent_count <> 1
     OR super_admin_count <> 1 THEN
    RAISE EXCEPTION
      'property-track-b-seed-scope-preflight-failed: tenant=%, park=%, asset_assignment=%, asset_parent=%, super_admin=%',
      tenant_count, park_count, asset_assignment_count, asset_parent_count, super_admin_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE property_track_b_expected_definition (
  code varchar(128) PRIMARY KEY,
  name varchar(100) NOT NULL,
  resource varchar(128) NOT NULL,
  action varchar(64) NOT NULL,
  permission_type varchar(32) NOT NULL,
  perm_type integer NOT NULL,
  api_method varchar(16),
  api_path varchar(255),
  frontend_route varchar(255),
  sort_no integer NOT NULL,
  permission_level integer NOT NULL,
  parent_required boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO property_track_b_expected_definition (
  code, name, resource, action, permission_type, perm_type, api_method,
  api_path, frontend_route, sort_no, permission_level, parent_required
)
VALUES
  ('party:identity_update','身份资料录入','biz.party_identity','update','api',40,NULL,NULL,'/assets/identity-submissions',8101,3,false),
  ('party:identity_verify','身份资料核验','biz.party_identity','verify','api',40,'POST','/api/v1/property/identity-submissions/:submissionId/decisions','/assets/identity-submissions',8102,3,false),
  ('property_approval:create','房产业务审批申请','biz.property_approval','create','api',40,NULL,NULL,NULL,8110,3,false),
  ('property_approval:read','房产业务审批读取','biz.property_approval','read','api',40,'GET','/api/v1/property/approvals',NULL,8111,3,false),
  ('property_approval:decide','房产业务审批决定','biz.property_approval','decide','api',40,'POST','/api/v1/property/approvals/:requestId/decisions',NULL,8112,3,false),
  ('property_approval:withdraw','房产业务审批撤回','biz.property_approval','withdraw','api',40,'POST','/api/v1/property/approvals/:requestId/withdraw',NULL,8113,3,false),
  ('property_approval:retry','审批执行重试','biz.property_approval_incident','retry','api',40,'POST','/api/v1/property/approvals/:requestId/retry','/property/approval-incidents',8114,3,false),
  ('property_approval:read_incident','审批事故读取','biz.property_approval_incident','read_incident','api',40,'GET','/api/v1/property/approval-incidents','/property/approval-incidents',8115,3,false),
  ('property_event:read_incident','事件投递事故读取','biz.property_event_dlq','read_incident','api',40,'GET','/api/v1/property/event-delivery-incidents','/property/event-delivery-incidents',8120,3,false),
  ('property_event:replay','事件投递重放','biz.property_event_dlq','replay','api',40,'POST','/api/v1/property/event-delivery-incidents/:dlqId/replay','/property/event-delivery-incidents',8121,3,false),
  ('property_task:read','房产业务任务读取','biz.property_task','read','api',40,'GET','/api/v1/property/tasks',NULL,8130,3,false),
  ('property_task:claim','房产业务任务领取','biz.property_task','claim','api',40,'POST','/api/v1/property/tasks/:taskId/claim',NULL,8131,3,false),
  ('property_task:process','房产业务任务处理','biz.property_task','process','api',40,'POST','/api/v1/property/tasks/:taskId/start',NULL,8132,3,false),
  ('property_task:release','房产业务任务释放','biz.property_task','release','api',40,'POST','/api/v1/property/tasks/:taskId/release',NULL,8133,3,false),
  ('property_task:supervise','房产业务任务督办','biz.property_task','supervise','api',40,'POST','/api/v1/property/tasks/:taskId/unblock',NULL,8134,3,false),
  ('property_task:rebuild','房产业务任务投影重建','biz.property_task_projection','rebuild','api',40,'POST','/api/v1/property/tasks/internal/rebuild',NULL,8135,3,false),
  ('property_notification:read','房产业务通知读取','biz.property_notification','read','api',40,'GET','/api/v1/property/notifications','/property/notifications',8140,3,false),
  ('property_notification:mark_read','房产业务通知标记已读','biz.property_notification','mark_read','api',40,'POST','/api/v1/property/notifications/:notificationId/read','/property/notifications',8141,3,false),
  ('asset:identity-submissions:page','身份核验工作台','asset.identity_submission','page','page',20,NULL,NULL,'/assets/identity-submissions',8201,2,true),
  ('asset:property-operations:page','共享房产控制面','asset.property_operation','page','page',20,NULL,NULL,'/assets/property-operations',8202,2,true),
  ('asset:property-occupancies:page','房产占用工作台','asset.property_occupancy','page','page',20,NULL,NULL,'/assets/property-occupancies',8203,2,true),
  ('asset:property-mode-transitions:page','房产模式变更审计','asset.property_mode_transition','page','page',20,NULL,NULL,'/assets/property-mode-transitions',8204,2,true),
  ('property:notifications:page','房产业务通知','property.notification','page','page',20,NULL,NULL,'/property/notifications',8210,2,true),
  ('property:event-delivery-incidents:page','事件投递事故处置','property.event_delivery_incident','page','page',20,NULL,NULL,'/property/event-delivery-incidents',8211,2,true),
  ('property:approval-incidents:page','审批执行事故处置','property.approval_incident','page','page',20,NULL,NULL,'/property/approval-incidents',8212,2,true);

UPDATE sys_permission permission
SET api_path = '/api/v1/property/occupancies/:occupancyId/release',
    update_time = clock_timestamp(),
    version = permission.version + 1
FROM property_track_b_seed_scope scope
WHERE permission.tenant_id = scope.tenant_id
  AND permission.code = 'property_occupancy:force_release'
  AND permission.is_deleted = false
  AND permission.api_path IS DISTINCT FROM '/api/v1/property/occupancies/:occupancyId/release';

WITH permission_scope AS (
  SELECT scope.tenant_id, scope.park_id, parent.id AS parent_id
  FROM property_track_b_seed_scope scope
  JOIN sys_permission parent
    ON parent.tenant_id = scope.tenant_id
   AND parent.code = 'asset'
   AND parent.is_enabled = true
   AND parent.status = 'enabled'
   AND parent.is_deleted = false
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, parent_id, resource, action,
  permission_path, perm_path, permission_level, level, sort_no,
  permission_type, perm_type, api_method, api_path, frontend_route,
  component_key, icon, field_key, data_dimension,
  is_system, is_builtin, is_tenant_custom, visible, keep_alive, always_show,
  is_enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  uuid_generate_v4(), scope.tenant_id, scope.park_id,
  permission.code, permission.name,
  CASE WHEN permission.parent_required THEN scope.parent_id ELSE NULL END,
  permission.resource, permission.action,
  CASE WHEN permission.permission_type = 'page' THEN 'asset/' || permission.code ELSE permission.code END,
  CASE WHEN permission.permission_type = 'page' THEN 'asset/' || permission.code ELSE permission.code END,
  permission.permission_level, permission.permission_level, permission.sort_no,
  permission.permission_type, permission.perm_type, permission.api_method,
  permission.api_path, permission.frontend_route,
  NULL, NULL, NULL, NULL, true, true, false,
  permission.permission_type = 'api', false, false, true, 'enabled',
  clock_timestamp(), clock_timestamp(), false, 1,
  'PR192 Track B frozen permission definition'
FROM permission_scope scope
CROSS JOIN property_track_b_expected_definition permission
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  drift_count integer;
  force_release_count integer;
BEGIN
  WITH permission_scope AS (
    SELECT scope.tenant_id, scope.park_id, parent.id AS parent_id
    FROM property_track_b_seed_scope scope
    JOIN sys_permission parent
      ON parent.tenant_id = scope.tenant_id
     AND parent.code = 'asset'
     AND parent.is_enabled = true
     AND parent.status = 'enabled'
     AND parent.is_deleted = false
  ),
  expected AS (
    SELECT
      scope.tenant_id, scope.park_id, permission.code, permission.name,
      CASE WHEN permission.parent_required THEN scope.parent_id ELSE NULL END AS parent_id,
      permission.resource, permission.action,
      CASE WHEN permission.permission_type = 'page' THEN 'asset/' || permission.code ELSE permission.code END AS permission_path,
      CASE WHEN permission.permission_type = 'page' THEN 'asset/' || permission.code ELSE permission.code END AS perm_path,
      permission.permission_level, permission.permission_level AS level,
      permission.sort_no, permission.permission_type, permission.perm_type,
      permission.api_method, permission.api_path, permission.frontend_route,
      NULL::varchar AS component_key, NULL::varchar AS icon,
      NULL::varchar AS field_key, NULL::varchar AS data_dimension,
      true AS is_system, true AS is_builtin, false AS is_tenant_custom,
      permission.permission_type = 'api' AS visible,
      false AS keep_alive, false AS always_show, true AS is_enabled,
      'enabled'::varchar AS status, false AS is_deleted, 1 AS version,
      'PR192 Track B frozen permission definition'::varchar AS remark
    FROM permission_scope scope
    CROSS JOIN property_track_b_expected_definition permission
  ),
  actual AS (
    SELECT
      permission.tenant_id, permission.park_id, permission.code, permission.name,
      permission.parent_id, permission.resource, permission.action,
      permission.permission_path, permission.perm_path,
      permission.permission_level, permission.level, permission.sort_no,
      permission.permission_type, permission.perm_type, permission.api_method,
      permission.api_path, permission.frontend_route,
      permission.component_key, permission.icon, permission.field_key,
      permission.data_dimension, permission.is_system, permission.is_builtin,
      permission.is_tenant_custom, permission.visible, permission.keep_alive,
      permission.always_show, permission.is_enabled, permission.status,
      permission.is_deleted, permission.version, permission.remark
    FROM sys_permission permission
    JOIN property_track_b_seed_scope scope
      ON scope.tenant_id = permission.tenant_id
    JOIN property_track_b_expected_definition expected_definition
      ON expected_definition.code = permission.code
    WHERE permission.is_deleted = false
  ),
  drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*) INTO drift_count FROM drift;

  SELECT count(*) INTO force_release_count
  FROM property_track_b_seed_scope scope
  JOIN sys_permission permission
    ON permission.tenant_id = scope.tenant_id
   AND permission.code = 'property_occupancy:force_release'
   AND permission.api_path = '/api/v1/property/occupancies/:occupancyId/release'
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'property-track-b-seed-permission-definition-drift'
      USING ERRCODE = '23514';
  END IF;
  IF force_release_count <> 1 THEN
    RAISE EXCEPTION 'property-track-b-seed-force-release-token-drift'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  scope.tenant_id, scope.park_id, role.id, permission.id,
  clock_timestamp(), clock_timestamp(), false, 1,
  'PR192 Track B post-seed SUPER_ADMIN grant'
FROM property_track_b_seed_scope scope
JOIN sys_role role
  ON role.tenant_id = scope.tenant_id
 AND role.park_id = scope.park_id
 AND role.code = 'SUPER_ADMIN'
 AND role.is_system = true
 AND role.is_builtin = true
 AND role.is_super = true
 AND role.is_enabled = true
 AND role.status = 'enabled'
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = scope.tenant_id
 AND permission.code IN (SELECT code FROM property_track_b_expected_definition)
 AND permission.is_enabled = true
 AND permission.status = 'enabled'
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = scope.tenant_id
    AND existing.park_id = scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);

DO $$
DECLARE
  permission_count integer;
  super_admin_grant_count integer;
  bundle_count integer;
  bundle_member_count integer;
  bundle_permission_count integer;
  resolved_bundle_permission_count integer;
BEGIN
  SELECT count(*) INTO permission_count
  FROM property_track_b_seed_scope scope
  JOIN sys_permission permission
    ON permission.tenant_id = scope.tenant_id
   AND permission.code IN (SELECT code FROM property_track_b_expected_definition)
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  SELECT count(*) INTO super_admin_grant_count
  FROM property_track_b_seed_scope scope
  JOIN sys_role role
    ON role.tenant_id = scope.tenant_id
   AND role.park_id = scope.park_id
   AND role.code = 'SUPER_ADMIN'
   AND role.is_deleted = false
  JOIN rel_role_perm grant_relation
    ON grant_relation.tenant_id = scope.tenant_id
   AND grant_relation.park_id = scope.park_id
   AND grant_relation.role_id = role.id
   AND grant_relation.is_deleted = false
  JOIN sys_permission permission
    ON permission.id = grant_relation.permission_id
   AND permission.tenant_id = scope.tenant_id
   AND permission.code IN (SELECT code FROM property_track_b_expected_definition)
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  SELECT count(*) INTO bundle_count
  FROM sys_property_permission_bundle bundle
  WHERE bundle.remark = 'PR192 Track B frozen permission bundle'
    AND bundle.status = 'enabled'
    AND bundle.is_deleted = false;

  SELECT count(*), count(DISTINCT member.permission_code)
  INTO bundle_member_count, bundle_permission_count
  FROM sys_property_permission_bundle bundle
  JOIN rel_property_permission_bundle_member member
    ON member.bundle_id = bundle.id
   AND member.is_deleted = false
  WHERE bundle.remark = 'PR192 Track B frozen permission bundle'
    AND bundle.status = 'enabled'
    AND bundle.is_deleted = false;

  SELECT count(DISTINCT permission.code) INTO resolved_bundle_permission_count
  FROM property_track_b_seed_scope scope
  JOIN sys_property_permission_bundle bundle
    ON bundle.remark = 'PR192 Track B frozen permission bundle'
   AND bundle.status = 'enabled'
   AND bundle.is_deleted = false
  JOIN rel_property_permission_bundle_member member
    ON member.bundle_id = bundle.id
   AND member.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = scope.tenant_id
   AND permission.code = member.permission_code
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  IF permission_count <> 25 OR super_admin_grant_count <> 25 THEN
    RAISE EXCEPTION
      'property-track-b-seed-reconcile-incomplete: permissions=%, super_admin_grants=%',
      permission_count, super_admin_grant_count
      USING ERRCODE = '23514';
  END IF;
  IF bundle_count <> 16
     OR bundle_member_count <> 125
     OR bundle_permission_count <> 52
     OR resolved_bundle_permission_count <> 52 THEN
    RAISE EXCEPTION
      'property-track-b-seed-bundle-resolution-failed: bundles=%, members=%, permissions=%, resolved=%',
      bundle_count, bundle_member_count, bundle_permission_count,
      resolved_bundle_permission_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
