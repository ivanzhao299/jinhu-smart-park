BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE housing_approver_v2_member (
  member_ordinal smallint PRIMARY KEY,
  permission_code varchar(128) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO housing_approver_v2_member VALUES
  (1,'housing:tasks:page'),
  (2,'property:notifications:page'),
  (3,'property_approval:read'),
  (4,'property_approval:decide'),
  (5,'property_task:read'),
  (6,'property_task:claim'),
  (7,'property_task:process'),
  (8,'property_task:release'),
  (9,'property_notification:read'),
  (10,'property_notification:mark_read'),
  (11,'housing:task:read');

CREATE TEMP TABLE housing_approver_target_role (
  role_id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  protected_template boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO housing_approver_target_role (role_id,tenant_id,park_id,protected_template)
SELECT role.id,btrim(role.tenant_id),btrim(role.park_id),
       COALESCE(role.managed_template_code='PROPERTY_OPERATIONS_APPROVER',false)
FROM sys_role role
WHERE role.is_deleted=false
  AND role.status='enabled'
  AND role.is_enabled=true
  AND (
    (
      role.code='PROPERTY_OPERATIONS_APPROVER'
      AND role.managed_template_code='PROPERTY_OPERATIONS_APPROVER'
      AND role.is_template=true AND role.is_system=true AND role.is_builtin=true
    )
    OR (
      role.managed_template_code IS NULL
      AND role.is_template=false AND role.is_system=false AND role.is_builtin=false
      AND role.remark='Copied from role PROPERTY_OPERATIONS_APPROVER'
      AND EXISTS (
        SELECT 1 FROM rel_role_perm link
        JOIN sys_permission permission ON permission.id=link.permission_id
        WHERE link.tenant_id=role.tenant_id AND link.park_id=role.park_id
          AND link.role_id=role.id AND link.is_deleted=false
          AND permission.tenant_id=role.tenant_id AND permission.code='property_approval:decide'
          AND permission.is_deleted=false
      )
      AND EXISTS (
        SELECT 1 FROM rel_role_perm link
        JOIN sys_permission permission ON permission.id=link.permission_id
        WHERE link.tenant_id=role.tenant_id AND link.park_id=role.park_id
          AND link.role_id=role.id AND link.is_deleted=false
          AND permission.tenant_id=role.tenant_id AND permission.code='housing:tasks:page'
          AND permission.is_deleted=false
      )
    )
  );

DO $$
DECLARE
  target_bundle_id uuid;
  target_definition_version integer;
  target_definition_hash varchar(64);
  predecessor_actual_hash varchar(64);
  target_actual_hash varchar(64);
  predecessor_drift_count integer;
  target_drift_count integer;
  unresolved_tenants text;
  template_drift_count integer;
BEGIN
  SELECT id,definition_version,definition_hash
  INTO target_bundle_id,target_definition_version,target_definition_hash
  FROM sys_property_permission_bundle
  WHERE bundle_code='property-bundle:property-housing-approver'
    AND status='enabled' AND is_deleted=false
  FOR UPDATE;

  IF target_bundle_id IS NULL THEN
    RAISE EXCEPTION 'property-housing-approver-bundle-predecessor-drift'
      USING ERRCODE='23514';
  END IF;

  WITH affected_tenants AS (
    SELECT DISTINCT tenant_id FROM housing_approver_target_role
  ), permission_counts AS (
    SELECT tenant.tenant_id,
      count(permission.id)::integer AS permission_count,
      count(permission.id) FILTER (
        WHERE permission.permission_type='api'
          AND permission.is_enabled=true AND permission.status='enabled'
          AND permission.is_deleted=false
      )::integer AS active_api_permission_count
    FROM affected_tenants tenant
    LEFT JOIN sys_permission permission ON permission.tenant_id=tenant.tenant_id
      AND permission.code='housing:task:read'
    GROUP BY tenant.tenant_id
  )
  SELECT string_agg(
    tenant_id || ':total=' || permission_count::text
      || ':active_api=' || active_api_permission_count::text,
    ', ' ORDER BY tenant_id
  ) INTO unresolved_tenants
  FROM permission_counts
  WHERE permission_count<>1 OR active_api_permission_count<>1;

  IF unresolved_tenants IS NOT NULL THEN
    RAISE EXCEPTION 'property-housing-approver-permission-cardinality-drift tenants=%',
      unresolved_tenants USING ERRCODE='23514';
  END IF;

  SELECT encode(digest(convert_to(
    'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
    || bundle.bundle_name || chr(10)
    || string_agg(lpad(member.member_ordinal::text,4,'0') || chr(9)
      || member.permission_code || chr(10), '' ORDER BY member.member_ordinal),
    'UTF8'), 'sha256'), 'hex')
  INTO predecessor_actual_hash
  FROM sys_property_permission_bundle bundle
  JOIN rel_property_permission_bundle_member member
    ON member.bundle_id=bundle.id AND member.is_deleted=false
  WHERE bundle.id=target_bundle_id
  GROUP BY bundle.bundle_code,bundle.bundle_name;

  WITH actual AS (
    SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), expected AS (
    SELECT member_ordinal,permission_code FROM housing_approver_v2_member WHERE member_ordinal<11
  ), drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) SELECT count(*) INTO predecessor_drift_count FROM drift;

  WITH actual AS (
    SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM housing_approver_v2_member EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM housing_approver_v2_member)
  ) SELECT count(*) INTO target_drift_count FROM drift;

  IF target_definition_version=2
     AND target_definition_hash='7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e'
     AND predecessor_actual_hash='7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e'
     AND target_drift_count=0 THEN
    target_actual_hash := predecessor_actual_hash;
  ELSIF target_definition_version=1
     AND target_definition_hash='ebc48ebd63433714db7049f69135f4296d3ef94be98b94e07e3ee37cea0725ff'
     AND predecessor_actual_hash='ebc48ebd63433714db7049f69135f4296d3ef94be98b94e07e3ee37cea0725ff'
     AND predecessor_drift_count=0 THEN
    INSERT INTO rel_property_permission_bundle_member (
      bundle_id,permission_code,member_ordinal,remark
    ) VALUES (
      target_bundle_id,'housing:task:read',11,
      'Issue #403 housing approver task read repair'
    );

    SELECT encode(digest(convert_to(
      'property-bundle-v1' || chr(10) || bundle.bundle_code || chr(9)
      || bundle.bundle_name || chr(10)
      || string_agg(lpad(member.member_ordinal::text,4,'0') || chr(9)
        || member.permission_code || chr(10), '' ORDER BY member.member_ordinal),
      'UTF8'), 'sha256'), 'hex')
    INTO target_actual_hash
    FROM sys_property_permission_bundle bundle
    JOIN rel_property_permission_bundle_member member
      ON member.bundle_id=bundle.id AND member.is_deleted=false
    WHERE bundle.id=target_bundle_id
    GROUP BY bundle.bundle_code,bundle.bundle_name;

    UPDATE sys_property_permission_bundle
    SET definition_version=2,
        definition_hash='7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e',
        update_time=clock_timestamp(),version=version+1
    WHERE id=target_bundle_id
      AND target_actual_hash='7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e';
  ELSE
    RAISE EXCEPTION 'property-housing-approver-bundle-predecessor-drift version=% stored_hash=% actual_hash=% predecessor_drift=% target_drift=%',
      target_definition_version,target_definition_hash,predecessor_actual_hash,
      predecessor_drift_count,target_drift_count USING ERRCODE='23514';
  END IF;

  IF target_actual_hash<>'7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e' THEN
    RAISE EXCEPTION 'property-housing-approver-bundle-definition-drift' USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO template_drift_count
  FROM housing_approver_target_role target
  JOIN sys_role role ON role.id=target.role_id
  WHERE target.protected_template
    AND NOT (
      role.applied_bundle_codes='["property-bundle:property-homestay-approver","property-bundle:property-housing-approver"]'::jsonb
      AND (
      (role.template_definition_version=1
       AND role.template_definition_hash='ec8371f75e168bb260873f135d9ab1677123714770cff7ccea83e115a8015102'
       AND role.applied_bundle_signature='9bb64e651981515dfbca11fc3d495f3eb4f01551fee54cfd2807b9eadba96972')
      OR
      (role.template_definition_version=2
       AND role.template_definition_hash='38ef71a8cd4b612c1683334f5575678b5d50af9dce4af42faffde0b9da4b68d5'
       AND role.applied_bundle_signature='1474c9b46fbab59394d3e7d43d181c6cc3f2b32dd0fcbd527e8d9b43a060376e')
      )
    );

  IF template_drift_count<>0 THEN
    RAISE EXCEPTION 'property-operations-approver-template-predecessor-drift count=%',
      template_drift_count USING ERRCODE='23514';
  END IF;
END $$;

UPDATE sys_role role
SET template_definition_version=2,
    template_definition_hash='38ef71a8cd4b612c1683334f5575678b5d50af9dce4af42faffde0b9da4b68d5',
    applied_bundle_signature='1474c9b46fbab59394d3e7d43d181c6cc3f2b32dd0fcbd527e8d9b43a060376e',
    update_time=clock_timestamp(),version=role.version+1,
    remark='Issue #403 managed property-business role template'
FROM housing_approver_target_role target
WHERE target.role_id=role.id AND target.protected_template
  AND (role.template_definition_version,role.template_definition_hash,role.applied_bundle_signature)
    IS DISTINCT FROM (2,'38ef71a8cd4b612c1683334f5575678b5d50af9dce4af42faffde0b9da4b68d5','1474c9b46fbab59394d3e7d43d181c6cc3f2b32dd0fcbd527e8d9b43a060376e');

INSERT INTO rel_role_perm (
  tenant_id,park_id,role_id,permission_id,create_time,update_time,is_deleted,version,remark
)
SELECT target.tenant_id,target.park_id,target.role_id,permission.id,
  clock_timestamp(),clock_timestamp(),false,1,
  'Issue #403 housing approver task read repair'
FROM housing_approver_target_role target
JOIN sys_permission permission ON permission.tenant_id=target.tenant_id
  AND permission.code='housing:task:read' AND permission.permission_type='api'
  AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm existing
  WHERE existing.tenant_id=target.tenant_id AND existing.park_id=target.park_id
    AND existing.role_id=target.role_id AND existing.permission_id=permission.id
    AND existing.is_deleted=false
);

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM housing_approver_target_role target
  WHERE (
    SELECT count(*) FROM rel_role_perm link
    JOIN sys_permission permission ON permission.id=link.permission_id
    WHERE link.tenant_id=target.tenant_id AND link.park_id=target.park_id
      AND link.role_id=target.role_id AND link.is_deleted=false
      AND permission.tenant_id=target.tenant_id AND permission.code='housing:task:read'
      AND permission.permission_type='api' AND permission.is_enabled=true
      AND permission.status='enabled' AND permission.is_deleted=false
  )<>1;

  IF invalid_count<>0 THEN
    RAISE EXCEPTION 'property-housing-approver-role-link-reconcile-incomplete count=%',
      invalid_count USING ERRCODE='23514';
  END IF;
END $$;

COMMIT;
