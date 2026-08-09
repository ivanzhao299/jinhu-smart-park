BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.sys_property_runtime_control IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE property_runtime_control_target_history (
  already_succeeded boolean NOT NULL
) ON COMMIT DROP;
INSERT INTO property_runtime_control_target_history(already_succeeded)
SELECT count(*) = 2
FROM (
  SELECT filename, checksum, status
  FROM public.sys_schema_migration_history
  UNION ALL
  SELECT filename, checksum, status
  FROM public.schema_migrations
) history
WHERE history.filename = '000194_property_task_projection_contract_correction.sql'
  AND history.status = 'succeeded'
  AND history.checksum = '93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0';

CREATE TEMP TABLE property_runtime_control_signed_manifest (
  control_key varchar(128) PRIMARY KEY,
  control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL,
  adapter_version integer
) ON COMMIT DROP;
INSERT INTO property_runtime_control_signed_manifest VALUES
  ('identity.legacy-read-v1','compatibility_read','identity',1),
  ('identity.legacy-write-v1','compatibility_write','identity',1),
  ('identity.change-capture','change_capture','identity',NULL),
  ('identity.mutation-replay','mutation_replay','identity',NULL),
  ('identity.shadow-compare','shadow_compare','identity',NULL),
  ('identity.enforce','enforce','identity',NULL),
  ('approval.shadow-compare','shadow_compare','approval',NULL),
  ('approval.enforce','enforce','approval',NULL),
  ('event-notification.shadow-compare','shadow_compare','event_notification',NULL),
  ('event-notification.enforce','enforce','event_notification',NULL),
  ('task.shadow-compare','shadow_compare','task',NULL),
  ('task.enforce','enforce','task',NULL);

CREATE TEMP TABLE property_runtime_control_target_scope (
  tenant_key text NOT NULL,
  park_key text NOT NULL,
  PRIMARY KEY (tenant_key, park_key)
) ON COMMIT DROP;
INSERT INTO property_runtime_control_target_scope (tenant_key, park_key)
SELECT btrim(assignment.tenant_id), btrim(assignment.park_id)
FROM public.rel_tenant_module assignment
JOIN public.sys_module module
  ON module.id = assignment.module_id
 AND module.module_code = 'asset'
 AND module.status = 1
 AND module.is_deleted = false
WHERE assignment.enabled = true
  AND assignment.status = 'enabled'
  AND assignment.is_deleted = false
  AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
  AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
GROUP BY btrim(assignment.tenant_id), btrim(assignment.park_id);

DO $scope_guard$
BEGIN
  IF NOT (SELECT already_succeeded FROM property_runtime_control_target_history)
     AND EXISTS (
    SELECT 1
    FROM property_runtime_control_target_scope scope
    WHERE lower(scope.tenant_key) IN
      ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
       OR lower(scope.park_key) IN
      ('', '0', 'all', 'global', '*', '00000000-0000-0000-0000-000000000000')
       OR (
         SELECT count(*)
         FROM public.sys_tenant tenant
         WHERE btrim(tenant.tenant_id) = scope.tenant_key
           AND tenant.status = 1
           AND tenant.is_deleted = false
           AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
       ) <> 1
       OR (
         SELECT count(*)
         FROM public.asset_park park
         WHERE btrim(park.tenant_id) = scope.tenant_key
           AND btrim(park.park_id) = scope.park_key
           AND park.status = 'enabled'
           AND park.is_deleted = false
       ) <> 1
  ) THEN
    RAISE EXCEPTION 'property-runtime-control-scope-reconcile-preflight-failed'
      USING ERRCODE = '23514';
  END IF;
END;
$scope_guard$;

DO $existing_guard$
BEGIN
  IF NOT (SELECT already_succeeded FROM property_runtime_control_target_history)
     AND EXISTS (
    SELECT 1
    FROM public.sys_property_runtime_control control
    WHERE NOT EXISTS (
      SELECT 1
      FROM property_runtime_control_target_scope scope
      JOIN property_runtime_control_signed_manifest signed ON true
      WHERE scope.tenant_key = control.tenant_id
        AND scope.park_key = control.park_id
        AND signed.control_key = control.control_key
    )
  ) THEN
    RAISE EXCEPTION 'property-runtime-control-scope-reconcile-extra-control'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (SELECT already_succeeded FROM property_runtime_control_target_history)
     AND EXISTS (
    SELECT 1
    FROM public.sys_property_runtime_control control
    JOIN property_runtime_control_target_scope scope
      ON scope.tenant_key = control.tenant_id
     AND scope.park_key = control.park_id
    JOIN property_runtime_control_signed_manifest signed
      ON signed.control_key = control.control_key
    WHERE control.control_kind IS DISTINCT FROM signed.control_kind
       OR control.target IS DISTINCT FROM signed.target
       OR control.adapter_version IS DISTINCT FROM signed.adapter_version
       OR control.contract_hash IS DISTINCT FROM
          'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'::char(64)
       OR control.enabled IS DISTINCT FROM false
       OR control.control_mode IS DISTINCT FROM 'disabled'
       OR control.enabled_by IS NOT NULL
       OR control.enabled_at IS NOT NULL
       OR control.approval_reference IS NOT NULL
       OR control.disabled_reason IS DISTINCT FROM 'expand-only'
       OR control.version <> 1
  ) THEN
    RAISE EXCEPTION 'property-runtime-control-scope-reconcile-definition-drift'
      USING ERRCODE = '23514';
  END IF;
END;
$existing_guard$;

INSERT INTO public.sys_property_runtime_control (
  tenant_id, park_id, control_key, control_kind, target, adapter_version,
  contract_hash, enabled, control_mode, enabled_by, enabled_at,
  approval_reference, disabled_reason, version
)
SELECT
  scope.tenant_key,
  scope.park_key,
  signed.control_key,
  signed.control_kind,
  signed.target,
  signed.adapter_version,
  'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',
  false,
  'disabled',
  NULL,
  NULL,
  NULL,
  'expand-only',
  1
FROM property_runtime_control_target_scope scope
CROSS JOIN property_runtime_control_signed_manifest signed
WHERE NOT (SELECT already_succeeded FROM property_runtime_control_target_history)
ON CONFLICT (tenant_id, park_id, control_key) DO NOTHING;

DO $postcondition$
BEGIN
  IF NOT (SELECT already_succeeded FROM property_runtime_control_target_history)
     AND EXISTS (
    (SELECT
       scope.tenant_key,
       scope.park_key,
       signed.control_key,
       signed.control_kind,
       signed.target,
       signed.adapter_version,
       'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'::char(64),
       false,
       'disabled'::varchar,
       NULL::uuid,
       NULL::timestamptz,
       NULL::varchar,
       'expand-only'::varchar,
       1
     FROM property_runtime_control_target_scope scope
     CROSS JOIN property_runtime_control_signed_manifest signed
     EXCEPT
     SELECT
       control.tenant_id,
       control.park_id,
       control.control_key,
       control.control_kind,
       control.target,
       control.adapter_version,
       control.contract_hash,
       control.enabled,
       control.control_mode,
       control.enabled_by,
       control.enabled_at,
       control.approval_reference,
       control.disabled_reason,
       control.version
     FROM public.sys_property_runtime_control control)
    UNION ALL
    (SELECT
       control.tenant_id,
       control.park_id,
       control.control_key,
       control.control_kind,
       control.target,
       control.adapter_version,
       control.contract_hash,
       control.enabled,
       control.control_mode,
       control.enabled_by,
       control.enabled_at,
       control.approval_reference,
       control.disabled_reason,
       control.version
     FROM public.sys_property_runtime_control control
     EXCEPT
     SELECT
       scope.tenant_key,
       scope.park_key,
       signed.control_key,
       signed.control_kind,
       signed.target,
       signed.adapter_version,
       'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'::char(64),
       false,
       'disabled'::varchar,
       NULL::uuid,
       NULL::timestamptz,
       NULL::varchar,
       'expand-only'::varchar,
       1
     FROM property_runtime_control_target_scope scope
     CROSS JOIN property_runtime_control_signed_manifest signed)
  ) THEN
    RAISE EXCEPTION 'property-runtime-control-scope-reconcile-postcondition-failed'
      USING ERRCODE = '23514';
  END IF;
END;
$postcondition$;

COMMIT;
