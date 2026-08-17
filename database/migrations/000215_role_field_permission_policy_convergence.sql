CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

CREATE TABLE IF NOT EXISTS public.sys_role_field_policy_convergence_audit (
  migration_key varchar(64) PRIMARY KEY,
  legacy_row_count integer NOT NULL,
  canonical_policy_count integer NOT NULL,
  conflicting_field_count integer NOT NULL,
  resolved_link_count integer NOT NULL,
  active_policy_count integer NOT NULL,
  active_link_count integer NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE tmp_role_field_permission_legacy AS
SELECT
  legacy.resource AS legacy_resource,
  legacy.tenant_id,
  legacy.park_id,
  legacy.role_id,
  CASE
    WHEN legacy.resource LIKE 'biz.leasing_%' THEN 'leasing'
    WHEN legacy.resource LIKE 'rel.leasing_%' THEN 'leasing'
    WHEN legacy.resource LIKE 'biz.work_order%' THEN 'workorder'
    WHEN legacy.resource = 'biz.unit' THEN 'asset'
    WHEN legacy.resource LIKE 'asset.%' THEN 'asset'
    WHEN legacy.resource IN ('system.user', 'system.sys_user') THEN 'system'
    WHEN legacy.resource LIKE 'biz.iot_%' THEN 'iot'
    WHEN legacy.resource IN ('biz.scene_template', 'biz.scene_instance') THEN 'iot'
    WHEN legacy.resource IN (
      'biz.safety_hazard',
      'biz.safety_work_permit',
      'biz.safety_work_permit_check',
      'biz.safety_inspect_plan',
      'biz.safety_inspect_point',
      'biz.safety_inspect_template',
      'biz.safety_inspect_item',
      'biz.safety_inspect_task',
      'biz.safety_emergency_contact',
      'biz.safety_emergency_plan',
      'biz.safety_emergency_event'
    ) THEN 'safety'
    WHEN legacy.resource LIKE 'biz.camera_%' THEN 'video'
    WHEN legacy.resource LIKE 'biz.video_%' THEN 'video'
    WHEN POSITION('.' IN legacy.resource) > 0 THEN SPLIT_PART(legacy.resource, '.', 1)
    WHEN POSITION(':' IN legacy.resource) > 0 THEN SPLIT_PART(legacy.resource, ':', 1)
    ELSE legacy.resource
  END AS module,
  CASE
    WHEN legacy.resource LIKE 'biz.leasing_%' THEN REGEXP_REPLACE(legacy.resource, '^biz[.]', '')
    WHEN legacy.resource LIKE 'rel.leasing_%' THEN REGEXP_REPLACE(legacy.resource, '^rel[.]', 'rel_')
    WHEN legacy.resource LIKE 'biz.work_order%' THEN REGEXP_REPLACE(legacy.resource, '^biz[.]', '')
    WHEN legacy.resource = 'biz.unit' THEN 'unit'
    WHEN legacy.resource LIKE 'asset.%' THEN REGEXP_REPLACE(legacy.resource, '^asset[.]', '')
    WHEN legacy.resource = 'system.user' THEN 'user'
    WHEN legacy.resource = 'system.sys_user' THEN 'user'
    WHEN legacy.resource LIKE 'biz.iot_%' THEN REGEXP_REPLACE(legacy.resource, '^biz[.]', '')
    WHEN legacy.resource = 'biz.scene_template' THEN 'scene_template'
    WHEN legacy.resource = 'biz.scene_instance' THEN 'scene_instance'
    WHEN legacy.resource = 'biz.safety_hazard' THEN 'safety_hazard'
    WHEN legacy.resource = 'biz.safety_work_permit' THEN 'work_permit'
    WHEN legacy.resource = 'biz.safety_work_permit_check' THEN 'work_permit_check'
    WHEN legacy.resource = 'biz.safety_inspect_plan' THEN 'inspect_plan'
    WHEN legacy.resource = 'biz.safety_inspect_point' THEN 'inspect_point'
    WHEN legacy.resource = 'biz.safety_inspect_template' THEN 'inspect_template'
    WHEN legacy.resource = 'biz.safety_inspect_item' THEN 'inspect_item'
    WHEN legacy.resource = 'biz.safety_inspect_task' THEN 'inspect_task'
    WHEN legacy.resource = 'biz.safety_emergency_contact' THEN 'emergency_contact'
    WHEN legacy.resource = 'biz.safety_emergency_plan' THEN 'emergency_plan'
    WHEN legacy.resource = 'biz.safety_emergency_event' THEN 'emergency_event'
    WHEN legacy.resource LIKE 'biz.camera_%' THEN REGEXP_REPLACE(legacy.resource, '^biz[.]', '')
    WHEN legacy.resource LIKE 'biz.video_%' THEN REGEXP_REPLACE(legacy.resource, '^biz[.]', '')
    WHEN POSITION('.' IN legacy.resource) > 0 THEN REGEXP_REPLACE(legacy.resource, '^[^.]+[.]', '')
    WHEN POSITION(':' IN legacy.resource) > 0 THEN REGEXP_REPLACE(legacy.resource, '^[^:]+[:]', '')
    ELSE legacy.resource
  END AS entity,
  legacy.field_key,
  legacy.field_name,
  CASE legacy.access_mode
    WHEN 'none' THEN 'hidden'
    WHEN 'mask' THEN 'masked'
    WHEN 'read' THEN 'readonly'
    WHEN 'write' THEN 'editable'
    ELSE 'readonly'
  END AS policy_type,
  CASE legacy.access_mode
    WHEN 'mask' THEN 'default'
    ELSE NULL
  END AS mask_rule,
  CASE legacy.access_mode
    WHEN 'none' THEN 1
    WHEN 'mask' THEN 2
    WHEN 'read' THEN 3
    WHEN 'write' THEN 4
    ELSE 3
  END AS policy_rank,
  legacy.create_by,
  legacy.create_time,
  legacy.update_by,
  legacy.update_time
FROM rel_role_field_perm legacy
JOIN sys_role role
  ON role.id = legacy.role_id
 AND role.tenant_id = legacy.tenant_id
 AND role.is_deleted = false
WHERE legacy.is_deleted = false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tmp_role_field_permission_legacy legacy
    WHERE legacy.module IN ('biz', 'rel')
  ) THEN
    RAISE EXCEPTION 'Cannot converge deprecated role field permissions: unmapped legacy resources remain';
  END IF;
END $$;

CREATE TEMP TABLE tmp_role_field_policy_canonical AS
SELECT DISTINCT ON (tenant_id, module, entity, field_key)
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  create_by,
  create_time,
  update_by,
  update_time
FROM tmp_role_field_permission_legacy
ORDER BY tenant_id, module, entity, field_key, policy_rank, create_time;

CREATE TEMP TABLE tmp_role_field_policy_conflicts AS
SELECT
  tenant_id,
  module,
  entity,
  field_key,
  COUNT(DISTINCT policy_type) AS policy_type_count,
  ARRAY_AGG(DISTINCT policy_type ORDER BY policy_type) AS policy_types
FROM tmp_role_field_permission_legacy
GROUP BY tenant_id, module, entity, field_key
HAVING COUNT(DISTINCT policy_type) > 1;

CREATE TEMP TABLE tmp_role_field_policy_existing_reconciliations AS
SELECT
  canonical.tenant_id,
  canonical.module,
  canonical.entity,
  canonical.field_key,
  canonical.policy_type AS canonical_policy_type,
  canonical.mask_rule AS canonical_mask_rule,
  policy.id AS existing_policy_id,
  policy.policy_type AS existing_policy_type,
  policy.mask_rule AS existing_mask_rule,
  policy.status AS existing_status
FROM tmp_role_field_policy_canonical canonical
JOIN sys_field_policy policy
  ON policy.tenant_id = canonical.tenant_id
 AND policy.module = canonical.module
 AND policy.entity = canonical.entity
 AND policy.field_key = canonical.field_key
 AND policy.is_deleted = false
WHERE policy.status <> 'enabled'
   OR policy.policy_type <> canonical.policy_type
   OR policy.mask_rule IS DISTINCT FROM canonical.mask_rule;

INSERT INTO sys_field_policy (
  id,
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  status,
  create_by,
  create_time,
  update_by,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  'enabled',
  create_by,
  COALESCE(create_time, now()),
  update_by,
  COALESCE(update_time, now()),
  false,
  1,
  'Migrated from deprecated rel_role_field_perm'
FROM tmp_role_field_policy_canonical
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  policy_type = CASE
    WHEN (
      CASE sys_field_policy.policy_type
        WHEN 'hidden' THEN 1
        WHEN 'masked' THEN 2
        WHEN 'readonly' THEN 3
        WHEN 'editable' THEN 4
        WHEN 'visible' THEN 5
        ELSE 5
      END
    ) <= (
      CASE EXCLUDED.policy_type
        WHEN 'hidden' THEN 1
        WHEN 'masked' THEN 2
        WHEN 'readonly' THEN 3
        WHEN 'editable' THEN 4
        WHEN 'visible' THEN 5
        ELSE 5
      END
    )
      THEN sys_field_policy.policy_type
    ELSE EXCLUDED.policy_type
  END,
  mask_rule = CASE
    WHEN (
      CASE
        WHEN (
          CASE sys_field_policy.policy_type
            WHEN 'hidden' THEN 1
            WHEN 'masked' THEN 2
            WHEN 'readonly' THEN 3
            WHEN 'editable' THEN 4
            WHEN 'visible' THEN 5
            ELSE 5
          END
        ) <= (
          CASE EXCLUDED.policy_type
            WHEN 'hidden' THEN 1
            WHEN 'masked' THEN 2
            WHEN 'readonly' THEN 3
            WHEN 'editable' THEN 4
            WHEN 'visible' THEN 5
            ELSE 5
          END
        )
          THEN sys_field_policy.policy_type
        ELSE EXCLUDED.policy_type
      END
    ) = 'masked'
      THEN COALESCE(EXCLUDED.mask_rule, sys_field_policy.mask_rule, 'default')
    ELSE NULL
  END,
  status = 'enabled',
  update_by = COALESCE(EXCLUDED.update_by, sys_field_policy.update_by),
  update_time = now(),
  version = sys_field_policy.version + 1,
  remark = LEFT(
    CONCAT_WS('; ', NULLIF(sys_field_policy.remark, ''), 'Reconciled from deprecated rel_role_field_perm without relaxing legacy restrictions'),
    500
  );

CREATE TEMP TABLE tmp_role_field_policy_resolved_links AS
SELECT DISTINCT ON (legacy.tenant_id, legacy.park_id, legacy.role_id, policy.id)
  legacy.tenant_id,
  legacy.park_id,
  legacy.role_id,
  policy.id AS field_policy_id,
  legacy.create_by,
  legacy.create_time,
  legacy.update_by,
  legacy.update_time
FROM tmp_role_field_permission_legacy legacy
JOIN sys_field_policy policy
  ON policy.tenant_id = legacy.tenant_id
 AND policy.module = legacy.module
 AND policy.entity = legacy.entity
 AND policy.field_key = legacy.field_key
 AND policy.is_deleted = false
ORDER BY legacy.tenant_id, legacy.park_id, legacy.role_id, policy.id, legacy.create_time;

INSERT INTO rel_role_field_policy (
  id,
  tenant_id,
  park_id,
  role_id,
  field_policy_id,
  create_by,
  create_time,
  update_by,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  tenant_id,
  park_id,
  role_id,
  field_policy_id,
  create_by,
  COALESCE(create_time, now()),
  update_by,
  COALESCE(update_time, now()),
  false,
  1,
  'Migrated from deprecated rel_role_field_perm'
FROM tmp_role_field_policy_resolved_links
ON CONFLICT (tenant_id, park_id, role_id, field_policy_id) WHERE is_deleted = false DO NOTHING;

INSERT INTO public.sys_role_field_policy_convergence_audit (
  migration_key,
  legacy_row_count,
  canonical_policy_count,
  conflicting_field_count,
  resolved_link_count,
  active_policy_count,
  active_link_count,
  details
)
SELECT
  '000215-role-field-permission-policy-convergence',
  (SELECT COUNT(*) FROM tmp_role_field_permission_legacy),
  (SELECT COUNT(*) FROM tmp_role_field_policy_canonical),
  (SELECT COUNT(*) FROM tmp_role_field_policy_conflicts),
  (SELECT COUNT(*) FROM tmp_role_field_policy_resolved_links),
  (
    SELECT COUNT(*)
    FROM tmp_role_field_policy_canonical canonical
    JOIN sys_field_policy policy
      ON policy.tenant_id = canonical.tenant_id
     AND policy.module = canonical.module
     AND policy.entity = canonical.entity
     AND policy.field_key = canonical.field_key
     AND policy.is_deleted = false
  ),
  (
    SELECT COUNT(*)
    FROM tmp_role_field_policy_resolved_links resolved
    JOIN rel_role_field_policy link
      ON link.tenant_id = resolved.tenant_id
     AND link.park_id = resolved.park_id
     AND link.role_id = resolved.role_id
     AND link.field_policy_id = resolved.field_policy_id
     AND link.is_deleted = false
  ),
  jsonb_build_object(
    'policy_precedence', jsonb_build_array('hidden', 'masked', 'readonly', 'editable'),
	    'access_mode_mapping', jsonb_build_object(
	      'none', 'hidden',
	      'mask', 'masked',
	      'read', 'readonly',
	      'write', 'editable'
	    ),
	    'existing_policy_reconciliations', COALESCE((
	      SELECT jsonb_agg(sample)
	      FROM (
	        SELECT jsonb_build_object(
	          'tenant_id', tenant_id,
	          'module', module,
	          'entity', entity,
	          'field_key', field_key,
	          'existing_policy_type', existing_policy_type,
	          'existing_mask_rule', existing_mask_rule,
	          'existing_status', existing_status,
	          'canonical_policy_type', canonical_policy_type,
	          'canonical_mask_rule', canonical_mask_rule
	        ) AS sample
	        FROM tmp_role_field_policy_existing_reconciliations
	        ORDER BY tenant_id, module, entity, field_key
	        LIMIT 20
	      ) samples
	    ), '[]'::jsonb),
	    'resource_mapping_samples', COALESCE((
	      SELECT jsonb_agg(sample)
	      FROM (
	        SELECT jsonb_build_object(
	          'legacy_resource', mapped.legacy_resource,
	          'module', mapped.module,
	          'entity', mapped.entity
	        ) AS sample
	        FROM (
	          SELECT DISTINCT legacy_resource, module, entity
	          FROM tmp_role_field_permission_legacy
	          ORDER BY legacy_resource, module, entity
	          LIMIT 20
	        ) mapped
	      ) samples
	    ), '[]'::jsonb),
	    'conflict_samples', COALESCE((
	      SELECT jsonb_agg(sample)
	      FROM (
        SELECT jsonb_build_object(
          'tenant_id', tenant_id,
          'module', module,
          'entity', entity,
          'field_key', field_key,
          'policy_types', policy_types
        ) AS sample
        FROM tmp_role_field_policy_conflicts
        ORDER BY tenant_id, module, entity, field_key
        LIMIT 20
      ) samples
    ), '[]'::jsonb)
  )
ON CONFLICT (migration_key) DO UPDATE SET
  legacy_row_count = EXCLUDED.legacy_row_count,
  canonical_policy_count = EXCLUDED.canonical_policy_count,
  conflicting_field_count = EXCLUDED.conflicting_field_count,
  resolved_link_count = EXCLUDED.resolved_link_count,
  active_policy_count = EXCLUDED.active_policy_count,
  active_link_count = EXCLUDED.active_link_count,
  details = EXCLUDED.details,
  update_time = now();

COMMENT ON TABLE rel_role_field_perm IS 'Deprecated legacy field-permission write model. Runtime field policy authority is sys_field_policy plus rel_role_field_policy.';
COMMENT ON TABLE public.sys_role_field_policy_convergence_audit IS 'Audits deprecated rel_role_field_perm convergence into sys_field_policy plus rel_role_field_policy.';

COMMIT;
