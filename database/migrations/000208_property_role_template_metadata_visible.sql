BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE sys_role
  ADD COLUMN IF NOT EXISTS managed_template_code varchar(64),
  ADD COLUMN IF NOT EXISTS template_definition_version integer,
  ADD COLUMN IF NOT EXISTS template_definition_hash char(64),
  ADD COLUMN IF NOT EXISTS applied_bundle_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_bundle_signature char(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_role_template_definition_version'
  ) THEN
    ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_template_definition_version
      CHECK (template_definition_version IS NULL OR template_definition_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_role_template_definition_hash'
  ) THEN
    ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_template_definition_hash
      CHECK (
        template_definition_hash IS NULL
        OR template_definition_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_role_applied_bundle_codes'
  ) THEN
    ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_applied_bundle_codes
      CHECK (jsonb_typeof(applied_bundle_codes) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_role_applied_bundle_signature'
  ) THEN
    ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_applied_bundle_signature
      CHECK (
        applied_bundle_signature IS NULL
        OR applied_bundle_signature ~ '^[0-9a-f]{64}$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_role_managed_template_definition'
  ) THEN
    ALTER TABLE sys_role ADD CONSTRAINT ck_sys_role_managed_template_definition
      CHECK (
        managed_template_code IS NULL
        OR (
          managed_template_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
          AND template_definition_version IS NOT NULL
          AND template_definition_hash IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_managed_template_tenant
  ON sys_role (tenant_id, managed_template_code)
  WHERE is_deleted = false AND managed_template_code IS NOT NULL;

/* Permission visible data reconciliation is owned by production seed 000014. */
/*
CREATE TEMP TABLE pr262_track_b_visible_definition (
  code varchar(128) PRIMARY KEY,
  permission_type varchar(32) NOT NULL,
  visible boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO pr262_track_b_visible_definition (code, permission_type, visible) VALUES
  ('party:identity_update','api',false),
  ('party:identity_verify','api',false),
  ('property_approval:create','api',false),
  ('property_approval:read','api',false),
  ('property_approval:decide','api',false),
  ('property_approval:withdraw','api',false),
  ('property_approval:retry','api',false),
  ('property_approval:read_incident','api',false),
  ('property_event:read_incident','api',false),
  ('property_event:replay','api',false),
  ('property_task:read','api',false),
  ('property_task:claim','api',false),
  ('property_task:process','api',false),
  ('property_task:release','api',false),
  ('property_task:supervise','api',false),
  ('property_task:rebuild','api',false),
  ('property_notification:read','api',false),
  ('property_notification:mark_read','api',false),
  ('asset:identity-submissions:page','page',true),
  ('asset:property-operations:page','page',true),
  ('asset:property-occupancies:page','page',true),
  ('asset:property-mode-transitions:page','page',true),
  ('property:notifications:page','page',true),
  ('property:event-delivery-incidents:page','page',true),
  ('property:approval-incidents:page','page',true);

UPDATE sys_permission permission
SET visible = expected.visible,
    update_time = clock_timestamp()
FROM pr262_track_b_visible_definition expected
WHERE permission.code = expected.code
  AND permission.permission_type = expected.permission_type
  AND permission.perm_type = CASE expected.permission_type WHEN 'page' THEN 20 ELSE 40 END
  AND permission.is_deleted = false
  AND permission.visible IS DISTINCT FROM expected.visible;

DO $$
DECLARE
  drift_count integer;
BEGIN
  SELECT count(*) INTO drift_count
  FROM sys_permission permission
  JOIN pr262_track_b_visible_definition expected ON expected.code = permission.code
  WHERE permission.is_deleted = false
    AND (
      permission.permission_type IS DISTINCT FROM expected.permission_type
      OR permission.perm_type IS DISTINCT FROM CASE expected.permission_type WHEN 'page' THEN 20 ELSE 40 END
      OR permission.visible IS DISTINCT FROM expected.visible
    );

  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'property-track-b-visible-definition-drift'
      USING ERRCODE = '23514';
  END IF;
END $$;
*/

COMMIT;
