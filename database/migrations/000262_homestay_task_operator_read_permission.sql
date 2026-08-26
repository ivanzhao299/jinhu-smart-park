BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE homestay_task_operator_v2_member (
  member_ordinal smallint PRIMARY KEY,
  permission_code varchar(128) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO homestay_task_operator_v2_member (member_ordinal, permission_code) VALUES
  (1,'homestay:tasks:page'),
  (2,'property:notifications:page'),
  (3,'property_task:read'),
  (4,'property_task:claim'),
  (5,'property_task:process'),
  (6,'property_task:release'),
  (7,'property_notification:read'),
  (8,'property_notification:mark_read'),
  (9,'homestay:task:read');

DO $$
DECLARE
  target_bundle_id uuid;
  target_definition_version integer;
  target_definition_hash varchar(64);
  unresolved_tenants text;
  predecessor_actual_hash varchar(64);
  target_actual_hash varchar(64);
  predecessor_drift_count integer;
  target_drift_count integer;
BEGIN
  SELECT id,definition_version,definition_hash
  INTO target_bundle_id,target_definition_version,target_definition_hash
  FROM sys_property_permission_bundle
  WHERE bundle_code='property-bundle:property-homestay-task-operator'
    AND status='enabled' AND is_deleted=false
  FOR UPDATE;

  IF target_bundle_id IS NULL THEN
    RAISE EXCEPTION 'property-homestay-task-operator-bundle-predecessor-drift'
      USING ERRCODE='23514';
  END IF;

  WITH affected_tenants AS (
    SELECT DISTINCT role.tenant_id
    FROM sys_role role
    WHERE role.is_deleted=false
      AND role.applied_bundle_codes ? 'property-bundle:property-homestay-task-operator'
  ), permission_counts AS (
    SELECT tenant.tenant_id,
           count(permission.id)::integer AS permission_count,
           count(permission.id) FILTER (
             WHERE permission.permission_type='api'
               AND permission.is_enabled=true
               AND permission.status='enabled'
               AND permission.is_deleted=false
           )::integer AS active_api_permission_count
    FROM affected_tenants tenant
    LEFT JOIN sys_permission permission
      ON permission.tenant_id=tenant.tenant_id
     AND permission.code='homestay:task:read'
    GROUP BY tenant.tenant_id
  )
  SELECT string_agg(
    tenant_id || ':total=' || permission_count::text
      || ':active_api=' || active_api_permission_count::text,
    ', ' ORDER BY tenant_id
  )
  INTO unresolved_tenants
  FROM permission_counts
  WHERE permission_count<>1 OR active_api_permission_count<>1;

  IF unresolved_tenants IS NOT NULL THEN
    RAISE EXCEPTION 'property-homestay-task-operator-permission-cardinality-drift tenants=%',
      unresolved_tenants
      USING ERRCODE='23514';
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
    SELECT member_ordinal,permission_code FROM homestay_task_operator_v2_member
    WHERE member_ordinal<9
  ), drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) SELECT count(*) INTO predecessor_drift_count FROM drift;

  WITH actual AS (
    SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM homestay_task_operator_v2_member EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM homestay_task_operator_v2_member)
  ) SELECT count(*) INTO target_drift_count FROM drift;

  IF target_definition_version=2
     AND target_definition_hash='7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d'
     AND predecessor_actual_hash='7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d'
     AND target_drift_count=0 THEN
    target_actual_hash := predecessor_actual_hash;
  ELSIF target_definition_version=1
     AND target_definition_hash='07dfe5888e0928b439839b28c707bd9f1d557587714dfe473ece846205c3d425'
     AND predecessor_actual_hash='07dfe5888e0928b439839b28c707bd9f1d557587714dfe473ece846205c3d425'
     AND predecessor_drift_count=0 THEN
    INSERT INTO rel_property_permission_bundle_member (
      bundle_id,permission_code,member_ordinal,remark
    ) VALUES (
      target_bundle_id,'homestay:task:read',9,
      'Issue #395 homestay task operator task read repair'
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
    SET definition_version = 2,
        definition_hash = '7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d',
        update_time=clock_timestamp(),version=version+1
    WHERE id=target_bundle_id
      AND target_actual_hash='7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d';
  ELSE
    RAISE EXCEPTION 'property-homestay-task-operator-bundle-predecessor-drift version=% stored_hash=% actual_hash=% predecessor_drift=% target_drift=%',
      target_definition_version,target_definition_hash,predecessor_actual_hash,
      predecessor_drift_count,target_drift_count
      USING ERRCODE='23514';
  END IF;

  WITH actual AS (
    SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM homestay_task_operator_v2_member EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM homestay_task_operator_v2_member)
  ) SELECT count(*) INTO target_drift_count FROM drift;

  IF target_actual_hash<>'7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d'
     OR target_drift_count<>0 OR NOT EXISTS (
       SELECT 1 FROM sys_property_permission_bundle
       WHERE id=target_bundle_id AND definition_version=2
         AND definition_hash='7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d'
         AND status='enabled' AND is_deleted=false
     ) THEN
    RAISE EXCEPTION 'property-homestay-task-operator-bundle-definition-drift'
      USING ERRCODE='23514';
  END IF;
END $$;

COMMIT;
