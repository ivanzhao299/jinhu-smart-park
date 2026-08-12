-- Reconcile runtime controls for asset scopes created by production seeds
-- after the immutable 000194/000195 correction migrations have succeeded.
-- Existing canonical scopes are validated and preserved; only wholly missing
-- scopes are initialized through the audited v1 -> v2 -> v3 transition.
-- Operational replay: the seed was introduced before the deploy runner preserved
-- workflow-level RUN_PRODUCTION_SEED, so this reviewed no-op change deliberately
-- re-enters the automatic production-seed release path after that fix shipped.

BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.sys_property_runtime_control IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.sys_property_runtime_control_contract_audit IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE production_runtime_control_signed (
  control_key varchar(128) PRIMARY KEY,
  control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL,
  adapter_version integer
) ON COMMIT DROP;
INSERT INTO production_runtime_control_signed VALUES
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

CREATE TEMP TABLE production_runtime_control_scope (
  tenant_key varchar(64) NOT NULL,
  park_key varchar(64) NOT NULL,
  is_active boolean NOT NULL,
  PRIMARY KEY (tenant_key, park_key)
) ON COMMIT DROP;
INSERT INTO production_runtime_control_scope (tenant_key, park_key, is_active)
SELECT btrim(assignment.tenant_id), btrim(assignment.park_id), true
FROM public.rel_tenant_module assignment
JOIN public.sys_module module
  ON module.id=assignment.module_id
 AND module.module_code='asset'
 AND module.status=1
 AND module.is_deleted=false
JOIN public.sys_tenant tenant
  ON btrim(tenant.tenant_id)=btrim(assignment.tenant_id)
 AND tenant.status=1
 AND tenant.is_deleted=false
 AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())
WHERE assignment.enabled=true
  AND assignment.status='enabled'
  AND assignment.is_deleted=false
  AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
GROUP BY btrim(assignment.tenant_id), btrim(assignment.park_id);

-- Runtime-control audits are immutable and their controls are protected by a
-- restrictive foreign key. If an asset assignment is later disabled, retain
-- that scope in the signed contract instead of treating its canonical history
-- as an extra scope. Retained scopes are validation-only and are never seeded.
INSERT INTO production_runtime_control_scope (tenant_key, park_key, is_active)
SELECT persisted.tenant_key, persisted.park_key, false
FROM (
  SELECT control.tenant_id AS tenant_key, control.park_id AS park_key
  FROM public.sys_property_runtime_control control
) persisted
JOIN public.rel_tenant_module assignment
  ON btrim(assignment.tenant_id)=persisted.tenant_key
 AND btrim(assignment.park_id)=persisted.park_key
 AND assignment.is_deleted=false
JOIN public.sys_module module
  ON module.id=assignment.module_id
 AND module.module_code='asset'
 AND module.is_deleted=false
GROUP BY persisted.tenant_key, persisted.park_key
ON CONFLICT (tenant_key,park_key) DO NOTHING;

DO $preflight$
DECLARE
  stage_count integer;
BEGIN
  SELECT count(*) INTO stage_count
  FROM (
    SELECT filename,status,checksum FROM public.sys_schema_migration_history
    UNION ALL
    SELECT filename,status,checksum FROM public.schema_migrations
  ) history
  WHERE (filename='000194_property_task_projection_contract_correction.sql'
      AND status='succeeded'
      AND checksum='93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0')
     OR (filename='000195_property_mutation_receipt_contract_v2.sql'
      AND status='succeeded'
      AND checksum='9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4');
  IF stage_count<>4 THEN
    RAISE EXCEPTION 'production-runtime-control-migration-stage-drift'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_runtime_control_scope scope
    WHERE lower(scope.tenant_key) IN
      ('','0','all','global','*','00000000-0000-0000-0000-000000000000')
       OR lower(scope.park_key) IN
      ('','0','all','global','*','00000000-0000-0000-0000-000000000000')
       OR (scope.is_active AND (SELECT count(*) FROM public.sys_tenant tenant
           WHERE btrim(tenant.tenant_id)=scope.tenant_key
             AND tenant.status=1 AND tenant.is_deleted=false
             AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp()))<>1)
       OR (SELECT count(*) FROM public.asset_park park
           WHERE btrim(park.tenant_id)=scope.tenant_key
             AND btrim(park.park_id)=scope.park_key
             AND park.status='enabled' AND park.is_deleted=false)<>1
       OR (SELECT count(*) FROM public.asset_park park
           WHERE btrim(park.tenant_id)=scope.tenant_key
             AND btrim(park.park_id)=scope.park_key
             AND park.is_deleted=false)<>1
  ) THEN
    RAISE EXCEPTION 'production-runtime-control-scope-preflight-failed'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sys_property_runtime_control control
    WHERE NOT EXISTS (
      SELECT 1 FROM production_runtime_control_scope scope
      JOIN production_runtime_control_signed signed ON true
        WHERE scope.tenant_key=control.tenant_id
          AND scope.park_key=control.park_id
          AND signed.control_key=control.control_key)
  ) THEN
    RAISE EXCEPTION 'production-runtime-control-extra-control'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_runtime_control_scope scope
    CROSS JOIN LATERAL (
      SELECT count(*) AS control_count
      FROM public.sys_property_runtime_control control
      WHERE control.tenant_id=scope.tenant_key AND control.park_id=scope.park_key
    ) controls
    CROSS JOIN LATERAL (
      SELECT count(*) AS audit_count
      FROM public.sys_property_runtime_control_contract_audit audit
      WHERE audit.tenant_id=scope.tenant_key AND audit.park_id=scope.park_key
        AND audit.correction_key IN (
          'b2a-contract-correction-000194','b2a-contract-correction-000195')
    ) audits
    WHERE NOT (
      (controls.control_count=0 AND audits.audit_count=0)
      OR (controls.control_count=12 AND audits.audit_count=24)
    )
  ) THEN
    RAISE EXCEPTION 'production-runtime-control-partial-state'
      USING ERRCODE='23514';
  END IF;
END;
$preflight$;

CREATE TEMP TABLE production_runtime_control_missing_scope
ON COMMIT DROP AS
SELECT scope.*
FROM production_runtime_control_scope scope
WHERE scope.is_active
  AND NOT EXISTS (
  SELECT 1 FROM public.sys_property_runtime_control control
  WHERE control.tenant_id=scope.tenant_key AND control.park_id=scope.park_key
);

INSERT INTO public.sys_property_runtime_control (
  tenant_id,park_id,control_key,control_kind,target,adapter_version,
  contract_hash,enabled,control_mode,enabled_by,enabled_at,
  approval_reference,disabled_reason,version
)
SELECT scope.tenant_key,scope.park_key,signed.control_key,signed.control_kind,
  signed.target,signed.adapter_version,
  'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8',
  false,'disabled',NULL,NULL,NULL,'expand-only',1
FROM production_runtime_control_missing_scope scope
CROSS JOIN production_runtime_control_signed signed;

DO $corrections$
DECLARE
  changed_at timestamptz;
  changed_count bigint;
  audit_count bigint;
BEGIN
  changed_at:=clock_timestamp();
  WITH before_change AS MATERIALIZED (
    SELECT control.*
    FROM public.sys_property_runtime_control control
    JOIN production_runtime_control_missing_scope scope
      ON scope.tenant_key=control.tenant_id AND scope.park_key=control.park_id
    JOIN production_runtime_control_signed signed USING (control_key)
    FOR UPDATE OF control
  ), changed AS (
    UPDATE public.sys_property_runtime_control control
    SET contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3',
        disabled_reason='b2a-contract-correction-000194',
        version=2,update_time=changed_at
    FROM before_change prior WHERE control.id=prior.id
    RETURNING control.*,prior.contract_hash AS old_hash,
      prior.disabled_reason AS old_reason,prior.version AS old_version,
      prior.update_time AS old_time
  ), inserted AS (
    INSERT INTO public.sys_property_runtime_control_contract_audit (
      tenant_id,park_id,control_id,control_key,correction_key,
      old_contract_hash,new_contract_hash,old_version,new_version,
      old_disabled_reason,new_disabled_reason,old_update_time,new_update_time,
      evidence_hash,occurred_at
    )
    SELECT tenant_id,park_id,id,control_key,'b2a-contract-correction-000194',
      old_hash,contract_hash,old_version,version,old_reason,disabled_reason,
      old_time,update_time,
      encode(public.digest(pg_catalog.convert_to(
        'runtime-control-contract-audit-v1'||E'\n'
        ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_hash,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(contract_hash,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_version::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(version::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_reason,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(disabled_reason,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(to_char(old_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(to_char(update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
        'UTF8'),'sha256'),'hex'),update_time
    FROM changed RETURNING 1
  )
  SELECT (SELECT count(*) FROM changed),(SELECT count(*) FROM inserted)
  INTO changed_count,audit_count;
  IF changed_count<>audit_count OR changed_count<>(SELECT count(*)*12 FROM production_runtime_control_missing_scope) THEN
    RAISE EXCEPTION 'production-runtime-control-000194-correction-count'
      USING ERRCODE='21000';
  END IF;

  changed_at:=clock_timestamp();
  WITH before_change AS MATERIALIZED (
    SELECT control.*
    FROM public.sys_property_runtime_control control
    JOIN production_runtime_control_missing_scope scope
      ON scope.tenant_key=control.tenant_id AND scope.park_key=control.park_id
    JOIN production_runtime_control_signed signed USING (control_key)
    FOR UPDATE OF control
  ), changed AS (
    UPDATE public.sys_property_runtime_control control
    SET contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944',
        disabled_reason='b2a-contract-correction-000195',
        version=3,update_time=changed_at
    FROM before_change prior WHERE control.id=prior.id
    RETURNING control.*,prior.contract_hash AS old_hash,
      prior.disabled_reason AS old_reason,prior.version AS old_version,
      prior.update_time AS old_time
  ), inserted AS (
    INSERT INTO public.sys_property_runtime_control_contract_audit (
      tenant_id,park_id,control_id,control_key,correction_key,
      old_contract_hash,new_contract_hash,old_version,new_version,
      old_disabled_reason,new_disabled_reason,old_update_time,new_update_time,
      evidence_hash,occurred_at
    )
    SELECT tenant_id,park_id,id,control_key,'b2a-contract-correction-000195',
      old_hash,contract_hash,old_version,version,old_reason,disabled_reason,
      old_time,update_time,
      encode(public.digest(pg_catalog.convert_to(
        'runtime-control-contract-audit-v2'||E'\n'
        ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1('b2a-contract-correction-000195','S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_hash,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(contract_hash,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_version::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(version::text,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(old_reason,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(disabled_reason,'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(to_char(old_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
        ||public.fn_property_task_projection_scalar_v1(to_char(update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
        'UTF8'),'sha256'),'hex'),update_time
    FROM changed RETURNING 1
  )
  SELECT (SELECT count(*) FROM changed),(SELECT count(*) FROM inserted)
  INTO changed_count,audit_count;
  IF changed_count<>audit_count OR changed_count<>(SELECT count(*)*12 FROM production_runtime_control_missing_scope) THEN
    RAISE EXCEPTION 'production-runtime-control-000195-correction-count'
      USING ERRCODE='21000';
  END IF;
END;
$corrections$;

DO $postcondition$
BEGIN
  IF EXISTS (
    (SELECT scope.tenant_key,scope.park_key,signed.control_key
       FROM production_runtime_control_scope scope
       CROSS JOIN production_runtime_control_signed signed
     EXCEPT
     SELECT control.tenant_id,control.park_id,control.control_key
       FROM public.sys_property_runtime_control control)
    UNION ALL
    (SELECT control.tenant_id,control.park_id,control.control_key
       FROM public.sys_property_runtime_control control
     EXCEPT
     SELECT scope.tenant_key,scope.park_key,signed.control_key
       FROM production_runtime_control_scope scope
       CROSS JOIN production_runtime_control_signed signed)
  ) OR EXISTS (
    SELECT 1 FROM public.sys_property_runtime_control control
    JOIN production_runtime_control_signed signed USING (control_key)
    WHERE control.control_kind IS DISTINCT FROM signed.control_kind
       OR control.target IS DISTINCT FROM signed.target
       OR control.adapter_version IS DISTINCT FROM signed.adapter_version
       OR control.contract_hash IS DISTINCT FROM 'e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'::char(64)
       OR control.enabled IS DISTINCT FROM false
       OR control.control_mode IS DISTINCT FROM 'disabled'
       OR control.enabled_by IS NOT NULL OR control.enabled_at IS NOT NULL
       OR control.approval_reference IS NOT NULL
       OR control.disabled_reason IS DISTINCT FROM 'b2a-contract-correction-000195'
       OR control.version<>3
  ) OR EXISTS (
    (SELECT scope.tenant_key,scope.park_key,signed.control_key,correction.correction_key
       FROM production_runtime_control_scope scope
       CROSS JOIN production_runtime_control_signed signed
       CROSS JOIN (VALUES
         ('b2a-contract-correction-000194'),('b2a-contract-correction-000195')
       ) correction(correction_key)
     EXCEPT
     SELECT audit.tenant_id,audit.park_id,audit.control_key,audit.correction_key
       FROM public.sys_property_runtime_control_contract_audit audit
       WHERE audit.correction_key IN (
         'b2a-contract-correction-000194','b2a-contract-correction-000195'))
    UNION ALL
    (SELECT audit.tenant_id,audit.park_id,audit.control_key,audit.correction_key
       FROM public.sys_property_runtime_control_contract_audit audit
       WHERE audit.correction_key IN (
         'b2a-contract-correction-000194','b2a-contract-correction-000195')
     EXCEPT
     SELECT scope.tenant_key,scope.park_key,signed.control_key,correction.correction_key
       FROM production_runtime_control_scope scope
       CROSS JOIN production_runtime_control_signed signed
       CROSS JOIN (VALUES
         ('b2a-contract-correction-000194'),('b2a-contract-correction-000195')
       ) correction(correction_key))
  ) OR EXISTS (
    SELECT 1
    FROM public.sys_property_runtime_control_contract_audit audit
    JOIN public.sys_property_runtime_control control
      ON control.tenant_id=audit.tenant_id
     AND control.park_id=audit.park_id
     AND control.id=audit.control_id
    WHERE (audit.correction_key='b2a-contract-correction-000194' AND (
        audit.control_key<>control.control_key
        OR audit.old_contract_hash<>'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'
        OR audit.new_contract_hash<>'81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
        OR audit.old_version<>1 OR audit.new_version<>2
        OR audit.old_disabled_reason<>'expand-only'
        OR audit.new_disabled_reason<>'b2a-contract-correction-000194'
        OR audit.new_update_time<>audit.occurred_at
        OR audit.new_update_time<audit.old_update_time
        OR audit.evidence_hash IS DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
          'runtime-control-contract-audit-v1'||E'\n'
          ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
          'UTF8'),'sha256'),'hex')
      )) OR (audit.correction_key='b2a-contract-correction-000195' AND (
        audit.control_key<>control.control_key
        OR audit.old_contract_hash<>'81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
        OR audit.new_contract_hash<>'e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
        OR audit.new_contract_hash<>control.contract_hash
        OR audit.old_version<>2 OR audit.new_version<>3
        OR audit.new_version<>control.version
        OR audit.old_disabled_reason<>'b2a-contract-correction-000194'
        OR audit.new_disabled_reason<>'b2a-contract-correction-000195'
        OR audit.new_disabled_reason<>control.disabled_reason
        OR audit.old_update_time IS DISTINCT FROM (
          SELECT prior.new_update_time
          FROM public.sys_property_runtime_control_contract_audit prior
          WHERE prior.tenant_id=audit.tenant_id AND prior.park_id=audit.park_id
            AND prior.control_id=audit.control_id
            AND prior.correction_key='b2a-contract-correction-000194')
        OR audit.new_update_time<>control.update_time
        OR audit.occurred_at<>control.update_time
        OR audit.new_update_time<audit.old_update_time
        OR audit.evidence_hash IS DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
          'runtime-control-contract-audit-v2'||E'\n'
          ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.correction_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
          'UTF8'),'sha256'),'hex')
      ))
  ) THEN
    RAISE EXCEPTION 'production-runtime-control-postcondition-failed'
      USING ERRCODE='23514';
  END IF;
END;
$postcondition$;

COMMIT;
