BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- B-2a C2 forward-only correction. 000185-000193 remain immutable.
-- This migration intentionally has no dependency on the reserved 000191/000192
-- B-2c effect-schema migrations.
-- Signed projection budget addendum final signoff raw:
-- 1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4
-- Signed projection budget candidate raw:
-- 127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4
-- Canonical projection budget digest (1692 bytes):
-- d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45

DO $prerequisite_guard$
BEGIN
  IF to_regclass('public.biz_property_task_assignment') IS NULL
     OR to_regclass('public.biz_property_mutation_receipt') IS NULL
     OR to_regclass('public.sys_property_runtime_control') IS NULL THEN
    RAISE EXCEPTION 'property-task-projection-prerequisite-missing'
      USING ERRCODE = '42P01';
  END IF;
END;
$prerequisite_guard$;

DO $preexisting_object_guard$
DECLARE
  object_count integer;
  catalog_hash text;
  expected_catalog_hash constant text := '1a3bb4bc4907fb1a2e0e00c2bfd7a95ae52b96dab6c2d755d6de33e4f75c7da5';
BEGIN
  SELECT count(*) INTO object_count
  FROM (
    SELECT to_regclass('public.biz_property_task_projection_head') IS NOT NULL AS present
    UNION ALL SELECT to_regclass('public.biz_property_task_projection') IS NOT NULL
    UNION ALL SELECT to_regclass('public.biz_property_task_projection_rebuild_audit') IS NOT NULL
    UNION ALL SELECT to_regclass('public.sys_property_runtime_control_contract_audit') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_task_projection_scalar_v1(text,character)') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_task_projection_row_hash_v1(jsonb)') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_task_projection_audit_immutable()') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_task_projection_generation_exact()') IS NOT NULL
    UNION ALL SELECT to_regprocedure('public.fn_property_runtime_control_contract_audit_immutable()') IS NOT NULL
  ) objects
  WHERE present;

  IF object_count NOT IN (0, 10) THEN
    RAISE EXCEPTION 'property-task-projection-partial-preexisting-objects:%', object_count
      USING ERRCODE = '23514';
  END IF;

  -- A complete pre-existing surface is accepted only when every owned catalog
  -- fact is byte-for-byte identical.  This check runs before any IF NOT EXISTS,
  -- CREATE OR REPLACE, or trigger installation can conceal drift.
  IF object_count = 10 THEN
    IF EXISTS (
      WITH expected(identity,definition_sha256) AS (VALUES
        ('public.fn_property_runtime_control_contract_audit_immutable()',
          'd97a49a8d6c36cdc1b0f1f26255791d6120869456730644a61813d80626fcb40'),
        ('public.fn_property_task_projection_audit_immutable()',
          '85ed8915bda5c5196c897adad1fb8de6c60624e48db61577d9455b90a5f905a6'),
        ('public.fn_property_task_projection_generation_exact()',
          '8494176601ae6cca3cbbf3937f42970f9220273bc659f974777b25fe73c71fdf'),
        ('public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)',
          '50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47'),
        ('public.fn_property_task_projection_row_hash_v1(jsonb)',
          'b99bde85925abbb53a04df855f3483bd9e1448b8861d30daf7fc306092a8d8c4'),
        ('public.fn_property_task_projection_scalar_v1(text,character)',
          '2c51846e9b538aebe0d816a3715d853b48fbe8b685732de2ffe886d523d609a3')
      ), actual AS (
        SELECT n.nspname||'.'||p.oid::regprocedure::text identity,
          encode(digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') definition_sha256
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN (
          'fn_property_task_projection_scalar_v1','fn_property_task_projection_row_hash_v1',
          'fn_property_task_projection_replace_v1','fn_property_task_projection_audit_immutable',
          'fn_property_task_projection_generation_exact',
          'fn_property_runtime_control_contract_audit_immutable'))
      SELECT identity,definition_sha256 FROM expected
      EXCEPT SELECT identity,definition_sha256 FROM actual
    ) THEN
      RAISE EXCEPTION 'property-task-projection-function-definition-drift'
        USING ERRCODE='23514';
    END IF;
    WITH owned_relations AS (
      SELECT c.oid, n.nspname, c.relname, c.relkind, c.relpersistence,
             c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relowner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN (
        'biz_property_task_projection_head','biz_property_task_projection',
        'biz_property_task_projection_rebuild_audit',
        'sys_property_runtime_control_contract_audit')
    ), facts AS (
      SELECT 'relation' AS kind, nspname||'.'||relname AS name,
             concat_ws('|',relkind,relpersistence,relrowsecurity,
               relforcerowsecurity,coalesce((SELECT string_agg(
                 (CASE WHEN acl.grantee=relowner THEN '<owner>' WHEN acl.grantee=0 THEN 'PUBLIC'
                   ELSE pg_get_userbyid(acl.grantee) END)||':'||acl.privilege_type||':'||acl.is_grantable,
                 ',' ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable)
                 FROM aclexplode(coalesce(relacl,acldefault('r',relowner))) acl),'')) AS definition
      FROM owned_relations
      UNION ALL
      SELECT 'column', r.nspname||'.'||r.relname||'.'||a.attname,
             concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),
               a.attnotnull,a.attidentity,a.attgenerated,
               coalesce(pg_get_expr(d.adbin,d.adrelid),''),
               coalesce((SELECT string_agg(acl.privilege_type||':'||acl.is_grantable,','
                 ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable)
                 FROM aclexplode(a.attacl) acl),''),coalesce(a.attcollation::regcollation::text,''))
      FROM owned_relations r JOIN pg_attribute a ON a.attrelid=r.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint', r.nspname||'.'||r.relname||'.'||con.conname,
             concat_ws('|',con.contype,con.condeferrable,con.condeferred,
               con.convalidated,pg_get_constraintdef(con.oid,true))
      FROM owned_relations r JOIN pg_constraint con ON con.conrelid=r.oid
      UNION ALL
      SELECT 'index', ni.nspname||'.'||i.relname,
             concat_ws('|',ix.indisunique,ix.indisprimary,ix.indisvalid,
               ix.indisready,pg_get_indexdef(ix.indexrelid))
      FROM owned_relations r JOIN pg_index ix ON ix.indrelid=r.oid
      JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace ni ON ni.oid=i.relnamespace
      UNION ALL
      SELECT 'function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
             concat_ws('|',p.prokind,p.provolatile,p.prosecdef,p.proleakproof,
               p.proparallel,coalesce(p.proconfig::text,''),coalesce((SELECT string_agg(
                 (CASE WHEN acl.grantee=p.proowner THEN '<owner>' WHEN acl.grantee=0 THEN 'PUBLIC'
                   ELSE pg_get_userbyid(acl.grantee) END)||':'||acl.privilege_type||':'||acl.is_grantable,
                 ',' ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable)
                 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl),''),
               pg_get_functiondef(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'fn_property_task_projection_scalar_v1','fn_property_task_projection_row_hash_v1',
        'fn_property_task_projection_replace_v1','fn_property_task_projection_audit_immutable',
        'fn_property_task_projection_generation_exact',
        'fn_property_runtime_control_contract_audit_immutable')
      UNION ALL
      SELECT 'trigger', r.nspname||'.'||r.relname||'.'||t.tgname,
             concat_ws('|',t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid,true))
      FROM owned_relations r JOIN pg_trigger t ON t.tgrelid=r.oid
      WHERE NOT t.tgisinternal
    )
    SELECT encode(digest(convert_to(string_agg(kind||E'\t'||name||E'\t'||definition||E'\n',''
      ORDER BY kind,name),'UTF8'),'sha256'),'hex') INTO catalog_hash FROM facts;
    IF catalog_hash IS DISTINCT FROM expected_catalog_hash THEN
      RAISE EXCEPTION 'property-task-projection-preexisting-catalog-drift:%', catalog_hash
        USING ERRCODE='23514';
    END IF;
  END IF;
END;
$preexisting_object_guard$;

CREATE TABLE IF NOT EXISTS public.biz_property_task_projection_head (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  projection_version integer NOT NULL,
  content_hash char(64) NOT NULL,
  last_rebuilt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_rebuilt_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_head_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_head_source
    UNIQUE (tenant_id, park_id, source_type, source_id),
  CONSTRAINT uq_biz_property_task_projection_head_stable
    UNIQUE (tenant_id, park_id, id, source_type, source_id),
  CONSTRAINT ck_biz_property_task_projection_head_version
    CHECK (projection_version > 0),
  CONSTRAINT ck_biz_property_task_projection_head_hash
    CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_head_cas
  ON public.biz_property_task_projection_head
    (tenant_id, park_id, source_type, source_id, projection_version);

CREATE TABLE IF NOT EXISTS public.biz_property_task_projection (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  head_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_key char(64) NOT NULL,
  assignment_authority varchar(8) NOT NULL,
  derived_assignment_id uuid,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  business_occurrence_key varchar(256) NOT NULL,
  task_kind varchar(64) NOT NULL,
  queue_code varchar(128) NOT NULL,
  title varchar(500) NOT NULL,
  kind_label varchar(128) NOT NULL,
  source_label varchar(128) NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  assignment_status varchar(16) NOT NULL,
  assignment_version integer NOT NULL,
  assignee_id uuid,
  assignee_display varchar(200),
  claimed_at timestamptz,
  started_at timestamptz,
  blocked_reason varchar(1000),
  blocked_until timestamptz,
  outcome_code varchar(64),
  outcome_source_version integer,
  outcome_at timestamptz,
  source_deep_link varchar(512),
  projection_version integer NOT NULL,
  content_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_task
    UNIQUE (tenant_id, park_id, task_id),
  CONSTRAINT uq_biz_property_task_projection_occurrence
    UNIQUE (tenant_id, park_id, source_type, source_id, task_kind,
            business_occurrence_key),
  CONSTRAINT fk_biz_property_task_projection_head
    FOREIGN KEY (tenant_id, park_id, head_id, source_type, source_id)
    REFERENCES public.biz_property_task_projection_head
      (tenant_id, park_id, id, source_type, source_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_biz_property_task_projection_assignment
    FOREIGN KEY (tenant_id, park_id, derived_assignment_id)
    REFERENCES public.biz_property_task_assignment(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_property_task_projection_authority
    CHECK ((assignment_authority='derived' AND derived_assignment_id IS NOT NULL)
        OR (assignment_authority='owning' AND derived_assignment_id IS NULL)),
  CONSTRAINT ck_biz_property_task_projection_status
    CHECK (assignment_status IN
      ('open','claimed','in_progress','blocked','closed','cancelled')),
  CONSTRAINT ck_biz_property_task_projection_positive
    CHECK (source_version>0 AND assignment_version>0 AND projection_version>0
           AND priority BETWEEN 0 AND 100),
  CONSTRAINT ck_biz_property_task_projection_keys
    CHECK (task_key ~ '^[0-9a-f]{64}$'
       AND content_hash ~ '^[0-9a-f]{64}$'
       AND length(btrim(business_occurrence_key))>0
       AND business_occurrence_key !~ E'[\\t\\n\\r]'
       AND queue_code ~ '^[a-z][a-z0-9._:-]{0,127}$'),
  CONSTRAINT ck_biz_property_task_projection_blocked
    CHECK ((assignment_status='blocked')=(blocked_reason IS NOT NULL)),
  CONSTRAINT ck_biz_property_task_projection_open
    CHECK (assignment_status<>'open'
      OR (assignee_id IS NULL AND assignee_display IS NULL AND claimed_at IS NULL
          AND started_at IS NULL AND blocked_until IS NULL)),
  CONSTRAINT ck_biz_property_task_projection_active
    CHECK (assignment_status NOT IN ('claimed','in_progress','blocked')
      OR (assignee_id IS NOT NULL AND assignee_display IS NOT NULL
          AND claimed_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_task_projection_lifecycle
    CHECK ((assignment_status<>'claimed'
            OR (started_at IS NULL AND blocked_reason IS NULL AND blocked_until IS NULL))
       AND (assignment_status<>'in_progress'
            OR (started_at IS NOT NULL AND blocked_reason IS NULL AND blocked_until IS NULL))
       AND (assignment_status<>'blocked' OR started_at IS NOT NULL)
       AND (assignment_status NOT IN ('closed','cancelled')
            OR (assignee_id IS NULL AND assignee_display IS NULL
                AND blocked_reason IS NULL AND blocked_until IS NULL))),
  CONSTRAINT ck_biz_property_task_projection_outcome
    CHECK ((assignment_status IN ('closed','cancelled'))=
      (outcome_code IS NOT NULL AND outcome_source_version IS NOT NULL
       AND outcome_at IS NOT NULL)
       AND (outcome_source_version IS NULL OR outcome_source_version>0)),
  CONSTRAINT ck_biz_property_task_projection_logical_time
    CHECK (updated_at>=created_at)
);
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_head
  ON public.biz_property_task_projection
    (tenant_id, park_id, head_id, task_id);
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_active_queue
  ON public.biz_property_task_projection
    (tenant_id, park_id, queue_code, assignment_status, priority DESC,
     due_at ASC NULLS LAST, task_id)
  WHERE assignment_status IN ('open','claimed','in_progress','blocked');
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_assignee
  ON public.biz_property_task_projection
    (tenant_id, park_id, assignee_id, assignment_status, updated_at DESC, task_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_source
  ON public.biz_property_task_projection
    (tenant_id, park_id, source_type, source_id, task_kind,
     business_occurrence_key);

CREATE TABLE IF NOT EXISTS public.biz_property_task_projection_rebuild_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  head_id uuid NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  mutation_receipt_id uuid NOT NULL,
  replace_mode varchar(32) NOT NULL,
  command_action varchar(128) NOT NULL,
  from_projection_version integer NOT NULL,
  to_projection_version integer NOT NULL,
  business_result_version integer NOT NULL,
  projected_task_count integer NOT NULL,
  assignment_mutation_count integer NOT NULL DEFAULT 0,
  reason varchar(1000) NOT NULL,
  request_hash char(64) NOT NULL,
  result_ref varchar(512) NOT NULL,
  result_hash char(64) NOT NULL,
  content_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_rebuild_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_rebuild_audit_version
    UNIQUE (tenant_id, park_id, head_id, to_projection_version),
  CONSTRAINT fk_biz_property_task_projection_rebuild_audit_head
    FOREIGN KEY (tenant_id, park_id, head_id, source_type, source_id)
    REFERENCES public.biz_property_task_projection_head
      (tenant_id, park_id, id, source_type, source_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_task_projection_rebuild_audit_receipt
    FOREIGN KEY (tenant_id, park_id, mutation_receipt_id)
    REFERENCES public.biz_property_mutation_receipt(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_version
    CHECK (from_projection_version>=0
       AND to_projection_version=from_projection_version+1
       AND business_result_version>0),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_counts
    CHECK (projected_task_count>=0 AND assignment_mutation_count=0),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_mode_action
    CHECK ((replace_mode='manual-rebuild' AND command_action='property.task.rebuild')
        OR (replace_mode='authority-sync' AND command_action IN
          ('property.task.claim','property.task.start','property.task.block',
           'property.task.unblock','property.task.release',
           'property.task.source-terminal.closed',
           'property.task.source-terminal.cancelled'))),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_result_ref
    CHECK ((replace_mode='manual-rebuild'
            AND command_action='property.task.rebuild'
            AND business_result_version=to_projection_version
            AND result_ref = 'property-task-rebuild/' || source_type || '/'
              || lower(source_id::text) || '/v' || business_result_version::text)
        OR (replace_mode='authority-sync'
            AND command_action IN
              ('property.task.claim','property.task.start','property.task.block',
               'property.task.unblock','property.task.release')
            AND result_ref ~ ('^property-task/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v'
              || business_result_version::text || '$'))
        OR (replace_mode='authority-sync'
            AND command_action='property.task.source-terminal.closed'
            AND result_ref = 'property-task-source-terminal/' || source_type || '/'
              || lower(source_id::text) || '/closed/v' || business_result_version::text)
        OR (replace_mode='authority-sync'
            AND command_action='property.task.source-terminal.cancelled'
            AND result_ref = 'property-task-source-terminal/' || source_type || '/'
              || lower(source_id::text) || '/cancelled/v' || business_result_version::text)),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_reason
    CHECK (length(btrim(reason))>0
       AND (replace_mode='manual-rebuild'
         OR reason='authority-sync:' || command_action)),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_hashes
    CHECK (request_hash ~ '^[0-9a-f]{64}$'
       AND result_hash ~ '^[0-9a-f]{64}$'
       AND content_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS idx_biz_property_task_projection_rebuild_audit_source
  ON public.biz_property_task_projection_rebuild_audit
    (tenant_id, park_id, source_type, source_id, occurred_at DESC, id);

CREATE TABLE IF NOT EXISTS public.sys_property_runtime_control_contract_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  control_id uuid NOT NULL,
  control_key varchar(128) NOT NULL,
  correction_key varchar(64) NOT NULL DEFAULT 'b2a-contract-correction-000194',
  old_contract_hash char(64) NOT NULL,
  new_contract_hash char(64) NOT NULL,
  old_version integer NOT NULL,
  new_version integer NOT NULL,
  old_disabled_reason varchar(500) NOT NULL,
  new_disabled_reason varchar(500) NOT NULL,
  old_update_time timestamptz NOT NULL,
  new_update_time timestamptz NOT NULL,
  evidence_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT uq_sys_property_runtime_control_contract_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_sys_property_runtime_control_contract_audit_correction
    UNIQUE (tenant_id, park_id, control_id, correction_key),
  CONSTRAINT fk_sys_property_runtime_control_contract_audit_control
    FOREIGN KEY (tenant_id, park_id, control_id)
    REFERENCES public.sys_property_runtime_control(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_key
    CHECK (correction_key='b2a-contract-correction-000194'),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_versions
    CHECK (old_version>0 AND new_version=old_version+1),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_hashes
    CHECK (old_contract_hash ~ '^[0-9a-f]{64}$'
       AND new_contract_hash ~ '^[0-9a-f]{64}$'
       AND evidence_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_times
    CHECK (new_update_time=occurred_at AND new_update_time>=old_update_time)
);
CREATE INDEX IF NOT EXISTS idx_sys_property_runtime_control_contract_audit_control
  ON public.sys_property_runtime_control_contract_audit
    (tenant_id, park_id, control_key, occurred_at, id);

CREATE OR REPLACE FUNCTION public.fn_property_task_projection_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'property-task-projection-audit-immutable' USING ERRCODE='55000';
END;
$$;
CREATE OR REPLACE FUNCTION public.fn_property_runtime_control_contract_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'property-runtime-control-contract-audit-immutable'
    USING ERRCODE='55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_property_task_projection_generation_exact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id varchar(64); v_park_id varchar(64); v_head_id uuid;
  v_source_type varchar(64); v_source_id uuid; v_head_version integer;
BEGIN
  IF TG_TABLE_NAME='biz_property_task_projection_head' THEN
    IF TG_OP='DELETE' THEN
      v_tenant_id:=OLD.tenant_id; v_park_id:=OLD.park_id; v_head_id:=OLD.id;
      v_source_type:=OLD.source_type; v_source_id:=OLD.source_id;
    ELSE
      v_tenant_id:=NEW.tenant_id; v_park_id:=NEW.park_id; v_head_id:=NEW.id;
      v_source_type:=NEW.source_type; v_source_id:=NEW.source_id;
    END IF;
  ELSE
    IF TG_OP='DELETE' THEN
      v_tenant_id:=OLD.tenant_id; v_park_id:=OLD.park_id; v_head_id:=OLD.head_id;
      v_source_type:=OLD.source_type; v_source_id:=OLD.source_id;
    ELSE
      v_tenant_id:=NEW.tenant_id; v_park_id:=NEW.park_id; v_head_id:=NEW.head_id;
      v_source_type:=NEW.source_type; v_source_id:=NEW.source_id;
    END IF;
  END IF;
  SELECT h.projection_version INTO v_head_version
  FROM public.biz_property_task_projection_head h
  WHERE h.tenant_id=v_tenant_id AND h.park_id=v_park_id AND h.id=v_head_id
    AND h.source_type=v_source_type AND h.source_id=v_source_id;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.biz_property_task_projection p
      WHERE p.tenant_id=v_tenant_id AND p.park_id=v_park_id AND p.head_id=v_head_id
        AND p.source_type=v_source_type AND p.source_id=v_source_id) THEN
      RAISE EXCEPTION 'property-task-projection-head-missing' USING ERRCODE='23503';
    END IF;
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.biz_property_task_projection p
    WHERE p.tenant_id=v_tenant_id AND p.park_id=v_park_id AND p.head_id=v_head_id
      AND p.source_type=v_source_type AND p.source_id=v_source_id
      AND p.projection_version IS DISTINCT FROM v_head_version) THEN
    RAISE EXCEPTION 'property-task-projection-generation-mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_biz_property_task_projection_rebuild_audit_immutable
  ON public.biz_property_task_projection_rebuild_audit;
CREATE TRIGGER trg_biz_property_task_projection_rebuild_audit_immutable
BEFORE UPDATE OR DELETE ON public.biz_property_task_projection_rebuild_audit
FOR EACH ROW EXECUTE FUNCTION public.fn_property_task_projection_audit_immutable();
DROP TRIGGER IF EXISTS trg_sys_property_runtime_control_contract_audit_immutable
  ON public.sys_property_runtime_control_contract_audit;
CREATE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable
BEFORE UPDATE OR DELETE ON public.sys_property_runtime_control_contract_audit
FOR EACH ROW EXECUTE FUNCTION public.fn_property_runtime_control_contract_audit_immutable();
DROP TRIGGER IF EXISTS trg_biz_property_task_projection_head_generation_exact
  ON public.biz_property_task_projection_head;
CREATE CONSTRAINT TRIGGER trg_biz_property_task_projection_head_generation_exact
AFTER INSERT OR UPDATE OR DELETE ON public.biz_property_task_projection_head
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.fn_property_task_projection_generation_exact();
DROP TRIGGER IF EXISTS trg_biz_property_task_projection_generation_exact
  ON public.biz_property_task_projection;
CREATE CONSTRAINT TRIGGER trg_biz_property_task_projection_generation_exact
AFTER INSERT OR UPDATE OR DELETE ON public.biz_property_task_projection
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.fn_property_task_projection_generation_exact();

CREATE OR REPLACE FUNCTION public.fn_property_task_projection_scalar_v1(
  p_value text, p_kind char(1)
) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN 'N'
    WHEN p_kind='I' AND p_value ~ '^(0|[1-9][0-9]*)$' THEN 'I' || p_value
    WHEN p_kind='S' THEN 'S' || octet_length(convert_to(p_value,'UTF8'))::text || ':' || p_value
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.fn_property_task_projection_row_hash_v1(p_row jsonb)
RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(digest(convert_to(
    'property-task-projection-content-v1' || E'\n'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskKey','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentAuthority','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'derivedAssignmentId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceType','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'businessOccurrenceKey','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskKind','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'queueCode','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'title','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'kindLabel','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceLabel','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'priority','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'dueAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentStatus','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assigneeId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assigneeDisplay','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'claimedAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'startedAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'blockedReason','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'blockedUntil','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeCode','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeSourceVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceDeepLink','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'createdAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'updatedAt','S') || E'\n',
    'UTF8'),'sha256'),'hex')::char(64)
$$;

-- The exact dual-mode writer is installed after the schema and helper functions.
-- Its body is deliberately validation-heavy so malformed JSON cannot leak native
-- casts and every supported replacement is fenced by a started mutation receipt.
CREATE OR REPLACE FUNCTION public.fn_property_task_projection_replace_v1(
  p_tenant_id varchar(64), p_park_id varchar(64), p_source_type varchar(64),
  p_source_id uuid, p_actor_id uuid, p_receipt_id uuid,
  p_replace_mode varchar(32), p_command_action varchar(128),
  p_result_version integer, p_expected_projection_version integer,
  p_request_hash char(64), p_result_ref varchar(512), p_result_hash char(64),
  p_reason varchar(1000), p_rows jsonb
) RETURNS TABLE(previous_projection_version integer, projection_version integer,
                projected_task_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
#variable_conflict use_variable
DECLARE
  v_head_id uuid; v_previous integer; v_next integer; v_count integer;
  v_affected integer; v_content_hash char(64); v_receipt_action varchar(128);
  v_receipt_target uuid; v_receipt_actor uuid;
BEGIN
  -- budget-addendum-signoff-sha256=1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4
  -- budget-addendum-candidate-sha256=127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4
  -- budget-addendum-digest=d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45;max-complete-source-rows=200
  IF p_source_id IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
     OR p_tenant_id IS NULL OR length(btrim(p_tenant_id))=0
     OR p_park_id IS NULL OR length(btrim(p_park_id))=0
     OR p_source_type IS NULL OR p_source_type !~ '^[a-z][a-z0-9_]{0,63}$'
     OR p_actor_id IS NULL OR p_receipt_id IS NULL
     OR p_source_id='00000000-0000-0000-0000-000000000000'::uuid
     OR p_actor_id='00000000-0000-0000-0000-000000000000'::uuid
     OR p_receipt_id='00000000-0000-0000-0000-000000000000'::uuid
     OR p_replace_mode NOT IN ('manual-rebuild','authority-sync')
     OR NOT ((p_replace_mode='manual-rebuild' AND p_command_action='property.task.rebuild')
       OR (p_replace_mode='authority-sync' AND p_command_action IN
         ('property.task.claim','property.task.start','property.task.block',
          'property.task.unblock','property.task.release',
          'property.task.source-terminal.closed','property.task.source-terminal.cancelled')))
     OR p_result_version IS NULL OR p_result_version<=0
     OR p_expected_projection_version IS NULL OR p_expected_projection_version<0
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_result_hash IS NULL OR p_result_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR length(btrim(p_reason))=0
     OR (p_replace_mode='authority-sync' AND
         p_reason IS DISTINCT FROM 'authority-sync:'||p_command_action)
     OR p_result_ref IS NULL THEN
    RAISE EXCEPTION 'property-task-projection-invalid-input' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
             WHERE jsonb_typeof(value)<>'object') THEN
    RAISE EXCEPTION 'property-task-projection-row-shape' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_rows)>200 THEN
    RAISE EXCEPTION 'property-task-projection-row-limit' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
    WHERE (SELECT count(*) FROM jsonb_object_keys(value))<>30
       OR NOT (value ?& ARRAY['taskId','taskKey','assignmentAuthority',
       'derivedAssignmentId','sourceType','sourceId','sourceVersion',
       'businessOccurrenceKey','taskKind','queueCode','title','kindLabel',
       'sourceLabel','priority','dueAt','assignmentStatus','assignmentVersion',
       'assigneeId','assigneeDisplay','claimedAt','startedAt','blockedReason',
       'blockedUntil','outcomeCode','outcomeSourceVersion','outcomeAt',
       'sourceDeepLink','contentHash','createdAt','updatedAt'])) THEN
    RAISE EXCEPTION 'property-task-projection-row-shape' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(value) WHERE
       jsonb_typeof(value->'taskId')<>'string'
    OR jsonb_typeof(value->'sourceId')<>'string'
    OR jsonb_typeof(value->'taskKey')<>'string'
    OR jsonb_typeof(value->'contentHash')<>'string'
    OR jsonb_typeof(value->'assignmentAuthority')<>'string'
    OR jsonb_typeof(value->'sourceType')<>'string'
    OR jsonb_typeof(value->'businessOccurrenceKey')<>'string'
    OR jsonb_typeof(value->'taskKind')<>'string'
    OR jsonb_typeof(value->'queueCode')<>'string'
    OR jsonb_typeof(value->'title')<>'string'
    OR jsonb_typeof(value->'kindLabel')<>'string'
    OR jsonb_typeof(value->'sourceLabel')<>'string'
    OR jsonb_typeof(value->'assignmentStatus')<>'string'
    OR jsonb_typeof(value->'sourceVersion')<>'number'
    OR jsonb_typeof(value->'assignmentVersion')<>'number'
    OR jsonb_typeof(value->'priority')<>'number'
    OR jsonb_typeof(value->'createdAt')<>'string'
    OR jsonb_typeof(value->'updatedAt')<>'string'
    OR jsonb_typeof(value->'derivedAssignmentId') NOT IN ('string','null')
    OR jsonb_typeof(value->'assigneeId') NOT IN ('string','null')
    OR jsonb_typeof(value->'outcomeSourceVersion') NOT IN ('number','null')
    OR jsonb_typeof(value->'dueAt') NOT IN ('string','null')
    OR jsonb_typeof(value->'claimedAt') NOT IN ('string','null')
    OR jsonb_typeof(value->'startedAt') NOT IN ('string','null')
    OR jsonb_typeof(value->'blockedUntil') NOT IN ('string','null')
    OR jsonb_typeof(value->'outcomeAt') NOT IN ('string','null')
    OR jsonb_typeof(value->'assigneeDisplay') NOT IN ('string','null')
    OR jsonb_typeof(value->'blockedReason') NOT IN ('string','null')
    OR jsonb_typeof(value->'outcomeCode') NOT IN ('string','null')
    OR jsonb_typeof(value->'sourceDeepLink') NOT IN ('string','null')
    OR NOT pg_input_is_valid(value->>'taskId','uuid')
    OR NOT pg_input_is_valid(value->>'sourceId','uuid')
    OR (value->>'derivedAssignmentId' IS NOT NULL AND
        NOT pg_input_is_valid(value->>'derivedAssignmentId','uuid'))
    OR (value->>'assigneeId' IS NOT NULL AND
        NOT pg_input_is_valid(value->>'assigneeId','uuid'))
    OR value->>'sourceVersion' !~ '^[1-9][0-9]*$'
    OR value->>'assignmentVersion' !~ '^[1-9][0-9]*$'
    OR value->>'priority' !~ '^(0|[1-9][0-9]*)$'
    OR (value->>'outcomeSourceVersion' IS NOT NULL AND
        value->>'outcomeSourceVersion' !~ '^[1-9][0-9]*$')
    OR NOT pg_input_is_valid(value->>'sourceVersion','integer')
    OR NOT pg_input_is_valid(value->>'assignmentVersion','integer')
    OR NOT pg_input_is_valid(value->>'priority','integer')
    OR (value->>'outcomeSourceVersion' IS NOT NULL AND
        NOT pg_input_is_valid(value->>'outcomeSourceVersion','integer'))
    OR (value->>'dueAt' IS NOT NULL AND NOT pg_input_is_valid(value->>'dueAt','timestamptz'))
    OR (value->>'claimedAt' IS NOT NULL AND NOT pg_input_is_valid(value->>'claimedAt','timestamptz'))
    OR (value->>'startedAt' IS NOT NULL AND NOT pg_input_is_valid(value->>'startedAt','timestamptz'))
    OR (value->>'blockedUntil' IS NOT NULL AND NOT pg_input_is_valid(value->>'blockedUntil','timestamptz'))
    OR (value->>'outcomeAt' IS NOT NULL AND NOT pg_input_is_valid(value->>'outcomeAt','timestamptz'))
    OR NOT pg_input_is_valid(value->>'createdAt','timestamptz')
    OR NOT pg_input_is_valid(value->>'updatedAt','timestamptz')) THEN
    RAISE EXCEPTION 'property-task-projection-row-invalid' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT (value->>'taskId')::uuid task_id,
      lag((value->>'taskId')::uuid) OVER (ORDER BY ordinality) prior_id
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(value,ordinality)) s
      WHERE prior_id IS NOT NULL AND prior_id>=task_id) THEN
    RAISE EXCEPTION 'property-task-projection-row-order' USING ERRCODE='22023';
  END IF;
  SELECT h.id,h.projection_version INTO v_head_id,v_previous
  FROM public.biz_property_task_projection_head h
  WHERE h.tenant_id=p_tenant_id AND h.park_id=p_park_id
    AND h.source_type=p_source_type AND h.source_id=p_source_id;
  IF FOUND THEN
    IF v_previous<>p_expected_projection_version THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
  ELSE
    IF p_expected_projection_version<>0 THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
    v_head_id:=uuid_generate_v4(); v_previous:=0;
  END IF;
  v_next:=v_previous+1;
  SELECT r.action_id,r.target_id,r.actor_id
  INTO v_receipt_action,v_receipt_target,v_receipt_actor
  FROM public.biz_property_mutation_receipt r
  WHERE r.tenant_id=p_tenant_id AND r.park_id=p_park_id AND r.id=p_receipt_id
    AND r.receipt_status='started' AND r.request_hash=p_request_hash
    AND r.result_ref IS NULL AND r.result_hash IS NULL;
  IF NOT FOUND OR v_receipt_actor IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'property-task-projection-receipt-conflict' USING ERRCODE='40001';
  END IF;
  IF v_receipt_action IS DISTINCT FROM p_command_action THEN
    RAISE EXCEPTION 'property-task-projection-action-conflict' USING ERRCODE='22023';
  END IF;
  IF p_replace_mode='manual-rebuild' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id OR p_result_version<>v_next
      OR p_result_ref IS DISTINCT FROM 'property-task-rebuild/'||p_source_type||'/'
         ||lower(p_source_id::text)||'/v'||p_result_version::text THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSIF p_command_action IN ('property.task.claim','property.task.start',
      'property.task.block','property.task.unblock','property.task.release') THEN
    IF p_result_ref IS DISTINCT FROM 'property-task/'||lower(v_receipt_target::text)
         ||'/v'||p_result_version::text OR NOT EXISTS (SELECT 1
       FROM jsonb_array_elements(p_rows) e(value)
       WHERE (value->>'taskId')::uuid=v_receipt_target
         AND (value->>'assignmentVersion')::integer=p_result_version) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSIF p_command_action IN ('property.task.source-terminal.closed',
                              'property.task.source-terminal.cancelled') THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id OR jsonb_array_length(p_rows)=0
       OR p_result_ref IS DISTINCT FROM 'property-task-source-terminal/'||p_source_type||'/'
          ||lower(p_source_id::text)||'/'||
          (CASE WHEN p_command_action LIKE '%.closed' THEN 'closed' ELSE 'cancelled' END)
          ||'/v'||p_result_version::text
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
          WHERE (value->>'sourceVersion')::integer<>p_result_version
             OR value->>'assignmentStatus'<>CASE WHEN p_command_action LIKE '%.closed'
                 THEN 'closed' ELSE 'cancelled' END) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(value) WHERE
       value->>'sourceType' IS DISTINCT FROM p_source_type
    OR (value->>'sourceId')::uuid IS DISTINCT FROM p_source_id
    OR value->>'taskKey' !~ '^[0-9a-f]{64}$'
    OR value->>'contentHash' !~ '^[0-9a-f]{64}$'
    OR value->>'contentHash' IS DISTINCT FROM public.fn_property_task_projection_row_hash_v1(value)
    OR (value->>'priority')::integer NOT BETWEEN 0 AND 100
    OR value->>'taskId' IS DISTINCT FROM lower((value->>'taskId')::uuid::text)
    OR value->>'sourceId' IS DISTINCT FROM lower((value->>'sourceId')::uuid::text)
    OR value->>'taskId'='00000000-0000-0000-0000-000000000000'
    OR value->>'sourceId'='00000000-0000-0000-0000-000000000000'
    OR (value->>'derivedAssignmentId' IS NOT NULL AND value->>'derivedAssignmentId'
        IS DISTINCT FROM lower((value->>'derivedAssignmentId')::uuid::text))
    OR value->>'derivedAssignmentId'='00000000-0000-0000-0000-000000000000'
    OR (value->>'assigneeId' IS NOT NULL AND value->>'assigneeId'
        IS DISTINCT FROM lower((value->>'assigneeId')::uuid::text))
    OR value->>'assigneeId'='00000000-0000-0000-0000-000000000000'
    OR EXISTS (SELECT 1 FROM unnest(ARRAY[value->>'dueAt',value->>'claimedAt',
          value->>'startedAt',value->>'blockedUntil',value->>'outcomeAt',
          value->>'createdAt',value->>'updatedAt']) timestamp_text
        WHERE timestamp_text IS NOT NULL AND (
          timestamp_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$'
          OR to_char(timestamp_text::timestamptz AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM timestamp_text
        ))) THEN
    RAISE EXCEPTION 'property-task-projection-row-invalid' USING ERRCODE='22023';
  END IF;
  SELECT count(*)::integer, encode(digest(convert_to(COALESCE(string_agg(
    lower((value->>'taskId')::uuid::text)||E'\t'||(value->>'contentHash')||E'\n',''
    ORDER BY ordinality),''),'UTF8'),'sha256'),'hex')::char(64)
  INTO v_count,v_content_hash
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(value,ordinality);
  DELETE FROM public.biz_property_task_projection p WHERE p.tenant_id=p_tenant_id
    AND p.park_id=p_park_id AND p.head_id=v_head_id
    AND p.source_type=p_source_type AND p.source_id=p_source_id;
  INSERT INTO public.biz_property_task_projection (
    tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
    derived_assignment_id,source_type,source_id,source_version,
    business_occurrence_key,task_kind,queue_code,title,kind_label,source_label,
    priority,due_at,assignment_status,assignment_version,assignee_id,
    assignee_display,claimed_at,started_at,blocked_reason,blocked_until,
    outcome_code,outcome_source_version,outcome_at,source_deep_link,
    projection_version,content_hash,created_at,updated_at)
  SELECT p_tenant_id,p_park_id,v_head_id,(value->>'taskId')::uuid,
    (value->>'taskKey')::char(64),value->>'assignmentAuthority',
    NULLIF(value->>'derivedAssignmentId','')::uuid,p_source_type,p_source_id,
    (value->>'sourceVersion')::integer,value->>'businessOccurrenceKey',
    value->>'taskKind',value->>'queueCode',value->>'title',value->>'kindLabel',
    value->>'sourceLabel',(value->>'priority')::integer,
    NULLIF(value->>'dueAt','')::timestamptz,value->>'assignmentStatus',
    (value->>'assignmentVersion')::integer,NULLIF(value->>'assigneeId','')::uuid,
    value->>'assigneeDisplay',NULLIF(value->>'claimedAt','')::timestamptz,
    NULLIF(value->>'startedAt','')::timestamptz,value->>'blockedReason',
    NULLIF(value->>'blockedUntil','')::timestamptz,value->>'outcomeCode',
    NULLIF(value->>'outcomeSourceVersion','')::integer,
    NULLIF(value->>'outcomeAt','')::timestamptz,value->>'sourceDeepLink',v_next,
    (value->>'contentHash')::char(64),(value->>'createdAt')::timestamptz,
    (value->>'updatedAt')::timestamptz
  FROM jsonb_array_elements(p_rows) e(value) ORDER BY (value->>'taskId')::uuid;
  GET DIAGNOSTICS v_affected=ROW_COUNT;
  IF v_affected<>v_count THEN
    RAISE EXCEPTION 'property-task-projection-insert-count' USING ERRCODE='21000';
  END IF;
  IF v_previous=0 THEN
    INSERT INTO public.biz_property_task_projection_head
      (id,tenant_id,park_id,source_type,source_id,projection_version,content_hash,
       last_rebuilt_at,last_rebuilt_by,created_at,updated_at)
    VALUES (v_head_id,p_tenant_id,p_park_id,p_source_type,p_source_id,v_next,
      v_content_hash,clock_timestamp(),p_actor_id,clock_timestamp(),clock_timestamp());
  ELSE
    UPDATE public.biz_property_task_projection_head h SET projection_version=v_next,
      content_hash=v_content_hash,last_rebuilt_at=clock_timestamp(),
      last_rebuilt_by=p_actor_id,updated_at=clock_timestamp()
    WHERE h.tenant_id=p_tenant_id AND h.park_id=p_park_id AND h.id=v_head_id
      AND h.source_type=p_source_type AND h.source_id=p_source_id
      AND h.projection_version=v_previous;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected<>1 THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
  END IF;
  INSERT INTO public.biz_property_task_projection_rebuild_audit
    (tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,
     replace_mode,command_action,from_projection_version,to_projection_version,
     business_result_version,projected_task_count,assignment_mutation_count,
     reason,request_hash,result_ref,result_hash,content_hash)
  VALUES (p_tenant_id,p_park_id,v_head_id,p_source_type,p_source_id,p_actor_id,
    p_receipt_id,p_replace_mode,p_command_action,v_previous,v_next,p_result_version,
    v_count,0,p_reason,p_request_hash,p_result_ref,p_result_hash,v_content_hash);
  RETURN QUERY SELECT v_previous,v_next,v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_property_task_projection_scalar_v1(text,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_property_task_projection_replace_v1(
  varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,
  char,varchar,char,varchar,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_scalar_v1(text,char) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_replace_v1(
  varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,
  char,varchar,char,varchar,jsonb) TO CURRENT_USER;
REVOKE INSERT, UPDATE, DELETE ON public.biz_property_task_projection_head FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.biz_property_task_projection FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.biz_property_task_projection_rebuild_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.sys_property_runtime_control_contract_audit FROM PUBLIC;

CREATE TEMP TABLE b2a_signed_runtime_control (
  control_key varchar(128) PRIMARY KEY, control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL, adapter_version integer
) ON COMMIT DROP;
INSERT INTO b2a_signed_runtime_control VALUES
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

-- Re-derive the signed authority scope from the same active asset-assignment
-- source used by 000189/000190.  Existing controls are evidence to validate,
-- never the authority from which scope is inferred.
CREATE TEMP TABLE b2a_qualifying_scope (
  tenant_key text NOT NULL,
  park_key text NOT NULL,
  PRIMARY KEY (tenant_key,park_key)
) ON COMMIT DROP;
INSERT INTO b2a_qualifying_scope(tenant_key,park_key)
SELECT btrim(assignment.tenant_id),btrim(assignment.park_id)
FROM public.rel_tenant_module assignment
JOIN public.sys_module module ON module.id=assignment.module_id
 AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
WHERE assignment.enabled=true AND assignment.status='enabled'
  AND assignment.is_deleted=false
  AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
  AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
GROUP BY btrim(assignment.tenant_id),btrim(assignment.park_id);

DO $qualifying_scope_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM b2a_qualifying_scope scope
    WHERE lower(scope.tenant_key) IN
      ('','0','all','global','*','00000000-0000-0000-0000-000000000000')
       OR lower(scope.park_key) IN
      ('','0','all','global','*','00000000-0000-0000-0000-000000000000')
       OR (SELECT count(*) FROM public.sys_tenant tenant
           WHERE btrim(tenant.tenant_id)=scope.tenant_key AND tenant.status=1
             AND tenant.is_deleted=false
             AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp()))<>1
       OR (SELECT count(*) FROM public.asset_park park
           WHERE btrim(park.tenant_id)=scope.tenant_key
             AND btrim(park.park_id)=scope.park_key
             AND park.status='enabled' AND park.is_deleted=false)<>1) THEN
    RAISE EXCEPTION 'property-business-scope-preflight-failed' USING ERRCODE='23514';
  END IF;
END;
$qualifying_scope_guard$;

DO $control_contract_correction$
DECLARE
  v_expected bigint; v_actual bigint; v_old bigint; v_new bigint; v_audits bigint;
  v_changed_at timestamptz := clock_timestamp(); v_updated bigint; v_inserted bigint;
  v_old_hash constant char(64) := 'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8';
  v_new_hash constant char(64) := '81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3';
  v_old_reason constant varchar(500) := 'expand-only';
  v_new_reason constant varchar(500) := 'b2a-contract-correction-000194';
BEGIN
  SELECT count(*)*12 INTO v_expected FROM b2a_qualifying_scope;
  IF EXISTS (
    (SELECT scope.tenant_key,scope.park_key,e.control_key
       FROM b2a_qualifying_scope scope CROSS JOIN b2a_signed_runtime_control e
     EXCEPT
     SELECT c.tenant_id,c.park_id,c.control_key
       FROM public.sys_property_runtime_control c
       JOIN b2a_qualifying_scope scope
         ON scope.tenant_key=c.tenant_id AND scope.park_key=c.park_id)
    UNION ALL
    (SELECT c.tenant_id,c.park_id,c.control_key
       FROM public.sys_property_runtime_control c
     EXCEPT
     SELECT scope.tenant_key,scope.park_key,e.control_key
       FROM b2a_qualifying_scope scope CROSS JOIN b2a_signed_runtime_control e)
  ) THEN
    RAISE EXCEPTION 'property-runtime-control-scope-exact-set-drift'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_actual FROM public.sys_property_runtime_control c
    JOIN b2a_signed_runtime_control e USING (control_key)
   WHERE c.control_kind=e.control_kind AND c.target=e.target
     AND c.adapter_version IS NOT DISTINCT FROM e.adapter_version
     AND c.enabled=false AND c.control_mode='disabled' AND c.enabled_by IS NULL
     AND c.enabled_at IS NULL AND c.approval_reference IS NULL;
  SELECT count(*) FILTER (WHERE c.contract_hash=v_old_hash AND c.disabled_reason=v_old_reason),
         count(*) FILTER (WHERE c.contract_hash=v_new_hash AND c.disabled_reason=v_new_reason),
         count(a.*)
    INTO v_old,v_new,v_audits
  FROM public.sys_property_runtime_control c
  JOIN b2a_signed_runtime_control e USING (control_key)
  LEFT JOIN public.sys_property_runtime_control_contract_audit a
    ON a.tenant_id=c.tenant_id AND a.park_id=c.park_id AND a.control_id=c.id
   AND a.correction_key='b2a-contract-correction-000194';
  IF v_actual<>v_expected OR v_old+v_new<>v_expected THEN
    RAISE EXCEPTION 'property-runtime-control-contract-drift'
      USING ERRCODE='23514';
  END IF;
  IF v_old=v_expected AND v_new=0 AND v_audits=0 THEN
    WITH before_change AS MATERIALIZED (
      SELECT c.* FROM public.sys_property_runtime_control c
      JOIN b2a_signed_runtime_control e USING (control_key)
      FOR UPDATE OF c
    ), changed AS (
      UPDATE public.sys_property_runtime_control c SET contract_hash=v_new_hash,
        disabled_reason=v_new_reason,version=c.version+1,update_time=v_changed_at
      FROM before_change b WHERE c.id=b.id
      RETURNING c.*,b.version AS old_version_value,
        b.disabled_reason AS old_reason_value,b.update_time AS old_time_value
    ), inserted AS (
      INSERT INTO public.sys_property_runtime_control_contract_audit
       (tenant_id,park_id,control_id,control_key,old_contract_hash,new_contract_hash,
        old_version,new_version,old_disabled_reason,new_disabled_reason,
        old_update_time,new_update_time,evidence_hash,occurred_at)
      SELECT tenant_id,park_id,id,control_key,v_old_hash,v_new_hash,
        old_version_value,version,old_reason_value,v_new_reason,old_time_value,update_time,
        encode(digest(convert_to('runtime-control-contract-audit-v1'||E'\n'
          ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(v_old_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(v_new_hash,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(old_version_value::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(version::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(old_reason_value,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(v_new_reason,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(old_time_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(to_char(update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n','UTF8'),'sha256'),'hex'),
        update_time FROM changed RETURNING 1
    ) SELECT (SELECT count(*) FROM changed),(SELECT count(*) FROM inserted)
      INTO v_updated,v_inserted;
    IF v_updated<>v_expected OR v_inserted<>v_expected THEN
      RAISE EXCEPTION 'property-runtime-control-correction-count' USING ERRCODE='21000';
    END IF;
  ELSIF v_new=v_expected AND v_old=0 AND v_audits=v_expected THEN
    IF EXISTS (SELECT 1 FROM public.sys_property_runtime_control_contract_audit a
      WHERE a.correction_key='b2a-contract-correction-000194'
        AND NOT EXISTS (SELECT 1 FROM b2a_qualifying_scope scope
          JOIN b2a_signed_runtime_control e ON true
          WHERE scope.tenant_key=a.tenant_id AND scope.park_key=a.park_id
            AND e.control_key=a.control_key))
       OR EXISTS (SELECT 1 FROM public.sys_property_runtime_control c
      JOIN public.sys_property_runtime_control_contract_audit a
        ON a.tenant_id=c.tenant_id AND a.park_id=c.park_id AND a.control_id=c.id
      WHERE a.correction_key='b2a-contract-correction-000194'
        AND (a.control_key<>c.control_key OR a.old_contract_hash<>v_old_hash
          OR a.new_contract_hash<>c.contract_hash OR a.new_contract_hash<>v_new_hash
          OR a.old_version+1<>a.new_version
          OR a.new_version<>c.version OR a.new_disabled_reason<>c.disabled_reason
          OR a.old_disabled_reason<>v_old_reason OR a.new_disabled_reason<>v_new_reason
          OR a.new_update_time<>c.update_time OR a.occurred_at<>c.update_time
          OR a.new_update_time<a.old_update_time
          OR a.evidence_hash IS DISTINCT FROM encode(digest(convert_to(
            'runtime-control-contract-audit-v1'||E'\n'
            ||public.fn_property_task_projection_scalar_v1(a.tenant_id,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.park_id,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.control_id::text,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.control_key,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.old_contract_hash,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.new_contract_hash,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.old_version::text,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.new_version::text,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.old_disabled_reason,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(a.new_disabled_reason,'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(to_char(a.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
            ||public.fn_property_task_projection_scalar_v1(to_char(a.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
            'UTF8'),'sha256'),'hex'))) THEN
      RAISE EXCEPTION 'property-runtime-control-audit-drift' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'property-runtime-control-mixed-contract-state' USING ERRCODE='23514';
  END IF;
END;
$control_contract_correction$;

COMMIT;
