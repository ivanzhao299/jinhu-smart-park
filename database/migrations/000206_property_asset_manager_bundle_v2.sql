BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE pr259_asset_manager_member (
  member_ordinal smallint PRIMARY KEY,
  permission_code varchar(128) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO pr259_asset_manager_member (member_ordinal, permission_code) VALUES
  (1,'asset:property-operations:page'),
  (2,'asset:property-occupancies:page'),
  (3,'asset:property-mode-transitions:page'),
  (4,'property:notifications:page'),
  (5,'property_operation:read'),
  (6,'property_operation:update'),
  (7,'property_operation:transition_mode'),
  (8,'property_occupancy:read'),
  (9,'property_occupancy:create'),
  (10,'property_occupancy:activate'),
  (11,'property_occupancy:release'),
  (12,'property_occupancy:force_release'),
  (13,'property_approval:create'),
  (14,'property_approval:read'),
  (15,'property_approval:withdraw'),
  (16,'property_task:read'),
  (17,'property_notification:read'),
  (18,'property_notification:mark_read');

DO $$
DECLARE
  target_bundle_id uuid;
  drift_count integer;
BEGIN
  SELECT id INTO target_bundle_id
  FROM sys_property_permission_bundle
  WHERE bundle_code='property-bundle:property-asset-manager'
    AND is_deleted=false AND status='enabled'
    AND definition_version=1
    AND definition_hash='f1707774b18df2eb04d1d99e4160b9a02def95d3377a12187e2f663662d4f59f'
  FOR UPDATE;

  IF target_bundle_id IS NULL THEN
    RAISE EXCEPTION 'property-asset-manager-bundle-preflight-failed' USING ERRCODE='23514';
  END IF;

  WITH expected(member_ordinal,permission_code) AS (VALUES
    (1,'asset:property-operations:page'),(2,'asset:property-occupancies:page'),
    (3,'asset:property-mode-transitions:page'),(4,'property:notifications:page'),
    (5,'property_operation:read'),(6,'property_operation:update'),
    (7,'property_operation:transition_mode'),(8,'property_occupancy:read'),
    (9,'property_occupancy:force_release'),(10,'property_approval:create'),
    (11,'property_approval:read'),(12,'property_approval:withdraw'),
    (13,'property_task:read'),(14,'property_notification:read'),
    (15,'property_notification:mark_read')
  ), actual AS (
    SELECT member_ordinal::integer,permission_code::text
    FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) SELECT count(*) INTO drift_count FROM drift;

  IF drift_count<>0 THEN
    RAISE EXCEPTION 'property-asset-manager-bundle-preflight-failed' USING ERRCODE='23514';
  END IF;

  UPDATE rel_property_permission_bundle_member
  SET is_deleted=true,version=version+1,
      remark='PR259 property asset manager bundle v1 superseded'
  WHERE bundle_id=target_bundle_id AND is_deleted=false;

  INSERT INTO rel_property_permission_bundle_member(
    bundle_id,permission_code,member_ordinal,remark
  ) SELECT target_bundle_id,permission_code,member_ordinal,
           'PR259 property asset manager bundle v2'
    FROM pr259_asset_manager_member ORDER BY member_ordinal;

  UPDATE sys_property_permission_bundle
  SET definition_version=2,
      definition_hash='171bd526f60587378ee5ff944a84402964e299d683058526ad3f07f973394be7',
      version=version+1,update_time=clock_timestamp(),
      remark='PR259 property asset manager bundle v2'
  WHERE id=target_bundle_id;

  WITH actual AS (
    SELECT member_ordinal,permission_code
    FROM rel_property_permission_bundle_member
    WHERE bundle_id=target_bundle_id AND is_deleted=false
  ), drift AS (
    (SELECT * FROM pr259_asset_manager_member EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM pr259_asset_manager_member)
  ) SELECT count(*) INTO drift_count FROM drift;

  IF drift_count<>0 OR NOT EXISTS (
    SELECT 1 FROM sys_property_permission_bundle
    WHERE id=target_bundle_id AND definition_version=2
      AND definition_hash='171bd526f60587378ee5ff944a84402964e299d683058526ad3f07f973394be7'
      AND status='enabled' AND is_deleted=false
  ) THEN
    RAISE EXCEPTION 'property-asset-manager-bundle-definition-drift' USING ERRCODE='23514';
  END IF;
END $$;

COMMIT;
