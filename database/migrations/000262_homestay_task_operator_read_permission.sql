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
  permission_count integer;
  predecessor_actual_hash varchar(64);
  target_actual_hash varchar(64);
  drift_count integer;
BEGIN
  SELECT id INTO target_bundle_id
  FROM sys_property_permission_bundle
  WHERE bundle_code='property-bundle:property-homestay-task-operator'
    AND definition_version=1
    AND definition_hash='07dfe5888e0928b439839b28c707bd9f1d557587714dfe473ece846205c3d425'
    AND status='enabled' AND is_deleted=false
  FOR UPDATE;

  IF target_bundle_id IS NULL THEN
    RAISE EXCEPTION 'property-homestay-task-operator-bundle-predecessor-drift'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO permission_count
  FROM sys_permission
  WHERE code='homestay:task:read' AND permission_type='api'
    AND is_enabled=true AND status='enabled' AND is_deleted=false;

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

  IF permission_count<>1
     OR predecessor_actual_hash<>'07dfe5888e0928b439839b28c707bd9f1d557587714dfe473ece846205c3d425'
     OR EXISTS (
       (SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
        WHERE bundle_id=target_bundle_id AND is_deleted=false)
       EXCEPT
       (SELECT * FROM (VALUES
         (1::smallint,'homestay:tasks:page'::varchar),(2,'property:notifications:page'),
         (3,'property_task:read'),(4,'property_task:claim'),(5,'property_task:process'),
         (6,'property_task:release'),(7,'property_notification:read'),
         (8,'property_notification:mark_read')
       ) expected(member_ordinal,permission_code))
     ) OR EXISTS (
       (SELECT * FROM (VALUES
         (1::smallint,'homestay:tasks:page'::varchar),(2,'property:notifications:page'),
         (3,'property_task:read'),(4,'property_task:claim'),(5,'property_task:process'),
         (6,'property_task:release'),(7,'property_notification:read'),
         (8,'property_notification:mark_read')
       ) expected(member_ordinal,permission_code))
       EXCEPT
       (SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
        WHERE bundle_id=target_bundle_id AND is_deleted=false)
     ) THEN
    RAISE EXCEPTION 'property-homestay-task-operator-bundle-predecessor-drift'
      USING ERRCODE='23514';
  END IF;

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

  WITH actual AS (
    SELECT member_ordinal,permission_code FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM homestay_task_operator_v2_member EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM homestay_task_operator_v2_member)
  ) SELECT count(*) INTO drift_count FROM drift;

  IF target_actual_hash<>'7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d'
     OR drift_count<>0 OR NOT EXISTS (
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
