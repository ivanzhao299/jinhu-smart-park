BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- B-2a C3-0/C1.5 forward-only receipt-contract correction.
-- Authoritative plan: c34124caee3846efc2b91fc0fc8a933edc75be9be0f3dd47f1d61ee26998873c
-- Legacy manifest:   4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9
-- Port-v2 manifest:  34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975
-- This migration consumes only the approval/task/control surfaces established
-- by the preceding Track-B migrations; it has no property-domain effect-schema
-- dependency.

DO $environment_preflight$
DECLARE
  v_history_count integer;
BEGIN
  IF current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
    RAISE EXCEPTION 'property-mutation-receipt-server-encoding-not-utf8'
      USING ERRCODE='22023';
  END IF;
  IF to_regclass('public.biz_property_mutation_receipt') IS NULL
     OR to_regclass('public.biz_property_task_projection') IS NULL
     OR to_regclass('public.biz_property_task_projection_rebuild_audit') IS NULL
     OR to_regclass('public.sys_property_runtime_control') IS NULL
     OR to_regclass('public.sys_property_runtime_control_contract_audit') IS NULL
     OR to_regclass('public.sys_schema_migration_history') IS NULL THEN
    RAISE EXCEPTION 'property-mutation-receipt-prerequisite-missing'
      USING ERRCODE='42P01';
  END IF;
  IF (SELECT count(*) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
      WHERE e.extname='pgcrypto' AND n.nspname='public')<>1
     OR to_regprocedure('public.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'property-mutation-receipt-public-pgcrypto-missing'
      USING ERRCODE='42883';
  END IF;
  SELECT count(*) INTO v_history_count
  FROM public.sys_schema_migration_history
  WHERE filename='000194_property_task_projection_contract_correction.sql'
    AND status='succeeded'
    AND checksum='93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0';
  IF v_history_count<>1 THEN
    RAISE EXCEPTION 'property-mutation-receipt-000194-drift'
      USING ERRCODE='23514';
  END IF;
  IF to_regprocedure('public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)') IS NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1')<>1 THEN
    RAISE EXCEPTION 'property-task-projection-replace-signature-drift'
      USING ERRCODE='23514';
  END IF;
END;
$environment_preflight$;

CREATE TEMP TABLE b2a_legacy_receipt_action_v1 (
  action_id varchar(128) PRIMARY KEY
) ON COMMIT DROP;
INSERT INTO b2a_legacy_receipt_action_v1(action_id) VALUES
 ('property.approval.submit'),
 ('property.approval.withdraw'),
 ('property.approval.decide'),
 ('property.approval.incident-retry'),
 ('property.event.replay'),
 ('property.notification.mark-read'),
 ('party.identity.create-draft'),
 ('party.identity.update-draft'),
 ('party.identity.submit'),
 ('party.identity.claim'),
 ('party.identity.reassign'),
 ('party.identity.verify'),
 ('party.identity.withdraw');

CREATE TEMP TABLE b2a_port_v2_receipt_action (
  action_id varchar(128) PRIMARY KEY,
  identity_kind varchar(32) NOT NULL
) ON COMMIT DROP;
INSERT INTO b2a_port_v2_receipt_action(action_id,identity_kind) VALUES
 ('property.task.rebuild','property-task-source-rebuild'),
 ('property.task.claim','property-task'),
 ('property.task.start','property-task'),
 ('property.task.block','property-task'),
 ('property.task.unblock','property-task'),
 ('property.task.release','property-task'),
 ('property.task.source-terminal.closed','property-task'),
 ('property.task.source-terminal.cancelled','property-task');

DO $receipt_preexisting_guard$
DECLARE
  v_extension_columns integer;
  v_constraint_count integer;
  v_trigger_count integer;
  v_writer_hash text;
  v_helper_hash text;
  v_guard_hash text;
  v_constraint_hash text;
  v_trigger_hash text;
  v_old_writer_hash constant text := '50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47';
  v_new_writer_hash constant text := 'ebc66d0059c66d82a6e49c6d3bdfb9f94a0d860301d08c99272258bfa32fd99b';
  v_new_helper_hash constant text := '3da797706a4ba38c5c2ce54d269415fc471c3fe7fe0d9193c61e08bb7c428ffb';
  v_new_guard_hash constant text := 'c9c145f978b66cf1a4371218c887af39c2822bb60255bee907979e3e8d9a02d1';
  v_new_constraint_hash constant text := '060b2fed3a4d74d1b72a9d4045b9742103722dd5d1cbd58df5ad756c5276630f';
  v_new_trigger_hash constant text := '7383a7813985841ffef2df72d63b923a4ffa77f5811eb66e673257efacaac603';
BEGIN
  SELECT encode(public.digest(pg_catalog.convert_to(pg_get_functiondef(
    'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)'::regprocedure),'UTF8'),'sha256'),'hex')
    INTO v_writer_hash;
  SELECT count(*) INTO v_extension_columns
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='biz_property_mutation_receipt'
    AND column_name IN ('receipt_contract_version','identity_kind',
      'business_occurrence_key','task_key','identity_source_type','result_version');
  IF has_function_privilege('public',
       'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)',
       'EXECUTE')
     OR NOT has_function_privilege(CURRENT_USER,
       'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'property-task-projection-writer-acl-drift' USING ERRCODE='23514';
  END IF;
  IF v_extension_columns NOT IN (0,6) THEN
    RAISE EXCEPTION 'property-mutation-receipt-partial-preexisting-drift:%',v_extension_columns
      USING ERRCODE='23514';
  END IF;

  IF v_extension_columns=0 THEN
    IF v_writer_hash IS DISTINCT FROM v_old_writer_hash THEN
      RAISE EXCEPTION 'property-task-projection-000194-preexisting-definition-drift:%',v_writer_hash
        USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.biz_property_mutation_receipt r
      WHERE NOT EXISTS (SELECT 1 FROM b2a_legacy_receipt_action_v1 a
                        WHERE a.action_id=r.action_id)) THEN
      RAISE EXCEPTION 'property-mutation-receipt-legacy-action-history-drift'
        USING ERRCODE='23514';
    END IF;
    IF to_regprocedure('public.fn_property_mutation_receipt_result_hash_v2(character varying,uuid,character varying,character varying,character,character varying,character varying,integer)') IS NOT NULL
       OR to_regprocedure('public.fn_property_mutation_receipt_guard_v2()') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN
            ('fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2'))
       OR EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
            AND NOT t.tgisinternal AND t.tgname='trg_property_mutation_receipt_guard_v2')
       OR EXISTS (SELECT 1 FROM pg_constraint c
          WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
            AND c.conname LIKE '%property_mutation_receipt%_v2') THEN
      RAISE EXCEPTION 'property-mutation-receipt-partial-preexisting-functions'
        USING ERRCODE='23514';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='biz_property_mutation_receipt'
        AND ((column_name='receipt_contract_version' AND
              (data_type<>'character varying' OR character_maximum_length<>16 OR is_nullable<>'NO'
               OR column_default IS DISTINCT FROM '''legacy-v1''::character varying'))
          OR (column_name='identity_kind' AND
              (data_type<>'character varying' OR character_maximum_length<>32 OR is_nullable<>'YES'
               OR column_default IS NOT NULL))
          OR (column_name='business_occurrence_key' AND
              (data_type<>'character varying' OR character_maximum_length<>256 OR is_nullable<>'YES'
               OR column_default IS NOT NULL))
          OR (column_name='task_key' AND
              (data_type<>'character' OR character_maximum_length<>64 OR is_nullable<>'YES'
               OR column_default IS NOT NULL))
          OR (column_name='identity_source_type' AND
              (data_type<>'character varying' OR character_maximum_length<>64 OR is_nullable<>'YES'
               OR column_default IS NOT NULL))
          OR (column_name='result_version' AND
              (data_type<>'integer' OR is_nullable<>'YES' OR column_default IS NOT NULL)))) THEN
      RAISE EXCEPTION 'property-mutation-receipt-preexisting-column-drift'
        USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO v_constraint_count FROM pg_constraint c
    WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
      AND c.conname IN ('ck_biz_property_mutation_receipt_contract_version_v2',
        'ck_biz_property_mutation_receipt_action_version_v2',
        'ck_biz_property_mutation_receipt_identity_v2',
        'ck_biz_property_mutation_receipt_outcome_v2');
    SELECT count(*) INTO v_trigger_count FROM pg_trigger t
    WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
      AND NOT t.tgisinternal AND t.tgname='trg_property_mutation_receipt_guard_v2';
    IF v_constraint_count<>4 OR v_trigger_count<>1
       OR EXISTS (SELECT 1 FROM pg_constraint c
          WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
            AND c.conname IN ('ck_biz_property_mutation_receipt_contract_version_v2',
              'ck_biz_property_mutation_receipt_action_version_v2',
              'ck_biz_property_mutation_receipt_identity_v2',
              'ck_biz_property_mutation_receipt_outcome_v2') AND NOT c.convalidated)
       OR to_regprocedure('public.fn_property_mutation_receipt_result_hash_v2(character varying,uuid,character varying,character varying,character,character varying,character varying,integer)') IS NULL
       OR to_regprocedure('public.fn_property_mutation_receipt_guard_v2()') IS NULL THEN
      RAISE EXCEPTION 'property-mutation-receipt-partial-preexisting-objects'
        USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_property_mutation_receipt_result_hash_v2')<>1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_property_mutation_receipt_guard_v2')<>1
       OR v_writer_hash IS DISTINCT FROM v_new_writer_hash THEN
      RAISE EXCEPTION 'property-mutation-receipt-preexisting-overload-or-writer-drift'
        USING ERRCODE='23514';
    END IF;
    SELECT encode(public.digest(pg_catalog.convert_to(pg_get_functiondef(
      'public.fn_property_mutation_receipt_result_hash_v2(character varying,uuid,character varying,character varying,character,character varying,character varying,integer)'::regprocedure),'UTF8'),'sha256'),'hex'),
      encode(public.digest(pg_catalog.convert_to(pg_get_functiondef(
      'public.fn_property_mutation_receipt_guard_v2()'::regprocedure),'UTF8'),'sha256'),'hex')
      INTO v_helper_hash,v_guard_hash;
    SELECT encode(public.digest(pg_catalog.convert_to(string_agg(c.conname||E'\t'
      ||pg_get_constraintdef(c.oid,true)||E'\n','' ORDER BY c.conname),'UTF8'),'sha256'),'hex')
      INTO v_constraint_hash FROM pg_constraint c
      WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
        AND c.conname IN ('ck_biz_property_mutation_receipt_contract_version_v2',
          'ck_biz_property_mutation_receipt_action_version_v2',
          'ck_biz_property_mutation_receipt_identity_v2',
          'ck_biz_property_mutation_receipt_outcome_v2');
    SELECT encode(public.digest(pg_catalog.convert_to(pg_get_triggerdef(t.oid,true),'UTF8'),'sha256'),'hex')
      INTO v_trigger_hash FROM pg_trigger t
      WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
        AND NOT t.tgisinternal AND t.tgname='trg_property_mutation_receipt_guard_v2';
    IF v_helper_hash IS DISTINCT FROM v_new_helper_hash
       OR v_guard_hash IS DISTINCT FROM v_new_guard_hash
       OR v_constraint_hash IS DISTINCT FROM v_new_constraint_hash
       OR v_trigger_hash IS DISTINCT FROM v_new_trigger_hash
       OR has_function_privilege('public',
          'public.fn_property_mutation_receipt_result_hash_v2(character varying,uuid,character varying,character varying,character,character varying,character varying,integer)',
          'EXECUTE')
       OR has_function_privilege('public','public.fn_property_mutation_receipt_guard_v2()','EXECUTE')
       OR NOT has_function_privilege(CURRENT_USER,
          'public.fn_property_mutation_receipt_result_hash_v2(character varying,uuid,character varying,character varying,character,character varying,character varying,integer)',
          'EXECUTE')
       OR NOT has_function_privilege(CURRENT_USER,'public.fn_property_mutation_receipt_guard_v2()','EXECUTE')
       OR has_function_privilege('public',
          'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)',
          'EXECUTE')
       OR NOT has_function_privilege(CURRENT_USER,
          'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)',
          'EXECUTE') THEN
      RAISE EXCEPTION 'property-mutation-receipt-exact-new-catalog-drift'
        USING ERRCODE='23514';
    END IF;
  END IF;
END;
$receipt_preexisting_guard$;

ALTER TABLE public.biz_property_mutation_receipt
  ADD COLUMN IF NOT EXISTS receipt_contract_version varchar(16) NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS identity_kind varchar(32),
  ADD COLUMN IF NOT EXISTS business_occurrence_key varchar(256),
  ADD COLUMN IF NOT EXISTS task_key char(64),
  ADD COLUMN IF NOT EXISTS identity_source_type varchar(64),
  ADD COLUMN IF NOT EXISTS result_version integer;

CREATE OR REPLACE FUNCTION public.fn_property_mutation_receipt_result_hash_v2(
  p_action_id varchar(128), p_target_id uuid, p_identity_kind varchar(32),
  p_business_occurrence_key varchar(256), p_task_key char(64),
  p_identity_source_type varchar(64), p_result_ref varchar(512),
  p_result_version integer
) RETURNS char(64)
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER CALLED ON NULL INPUT
SET search_path=pg_catalog AS $$
DECLARE
  v_identity_tag text;
BEGIN
  IF p_action_id IS NULL OR p_target_id IS NULL
     OR p_target_id='00000000-0000-0000-0000-000000000000'::uuid
     OR p_result_ref IS NULL OR p_result_version IS NULL
     OR p_result_version NOT BETWEEN 1 AND 2147483647 THEN
    RAISE EXCEPTION 'property-mutation-result-hash-invalid-input'
      USING ERRCODE='22023';
  END IF;
  IF p_identity_kind='property-task' THEN
    IF p_action_id NOT IN ('property.task.claim','property.task.start',
         'property.task.block','property.task.unblock','property.task.release',
         'property.task.source-terminal.closed',
         'property.task.source-terminal.cancelled')
       OR p_business_occurrence_key IS NULL
       OR p_business_occurrence_key !~ '[^ ]'
       OR octet_length(convert_to(p_business_occurrence_key,'UTF8')) NOT BETWEEN 1 AND 256
       OR position(E'\t' in p_business_occurrence_key)>0
       OR position(E'\n' in p_business_occurrence_key)>0
       OR position(E'\r' in p_business_occurrence_key)>0
       OR position(U&'\FFFD' in p_business_occurrence_key)>0
       OR p_task_key IS NULL OR p_task_key !~ '^[0-9a-f]{64}$'
       OR p_identity_source_type IS NOT NULL THEN
      RAISE EXCEPTION 'property-mutation-result-hash-invalid-item-identity'
        USING ERRCODE='22023';
    END IF;
    v_identity_tag := 'property-task:'||p_task_key::text||':'
      ||octet_length(convert_to(p_business_occurrence_key,'UTF8'))::text||':'
      ||p_business_occurrence_key;
  ELSIF p_identity_kind='property-task-source-rebuild' THEN
    IF p_action_id<>'property.task.rebuild'
       OR p_business_occurrence_key IS NOT NULL OR p_task_key IS NOT NULL
       OR p_identity_source_type IS NULL
       OR p_identity_source_type !~ '^[a-z][a-z0-9_]{0,63}$'
       OR octet_length(convert_to(p_identity_source_type,'UTF8')) NOT BETWEEN 1 AND 64 THEN
      RAISE EXCEPTION 'property-mutation-result-hash-invalid-rebuild-identity'
        USING ERRCODE='22023';
    END IF;
    v_identity_tag := 'property-task-source-rebuild:'
      ||octet_length(convert_to(p_identity_source_type,'UTF8'))::text||':'
      ||p_identity_source_type||':'||lower(p_target_id::text);
  ELSE
    RAISE EXCEPTION 'property-mutation-result-hash-invalid-identity-kind'
      USING ERRCODE='22023';
  END IF;
  RETURN encode(public.digest(pg_catalog.convert_to('property-mutation-result-v1'||E'\n'
    ||p_action_id||E'\t'||lower(p_target_id::text)||E'\t'||v_identity_tag||E'\t'
    ||p_result_ref||E'\t'||p_result_version::text||E'\n','UTF8'),'sha256'),'hex')::char(64);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_property_mutation_receipt_result_hash_v2(
  varchar,uuid,varchar,varchar,char,varchar,varchar,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_mutation_receipt_result_hash_v2(
  varchar,uuid,varchar,varchar,char,varchar,varchar,integer) TO CURRENT_USER;

DO $receipt_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=
      'public.biz_property_mutation_receipt'::regclass
      AND conname='ck_biz_property_mutation_receipt_contract_version_v2') THEN
    ALTER TABLE public.biz_property_mutation_receipt
      ADD CONSTRAINT ck_biz_property_mutation_receipt_contract_version_v2
      CHECK ((receipt_contract_version IS NOT NULL
        AND receipt_contract_version IN ('legacy-v1','port-v2')) IS TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=
      'public.biz_property_mutation_receipt'::regclass
      AND conname='ck_biz_property_mutation_receipt_action_version_v2') THEN
    ALTER TABLE public.biz_property_mutation_receipt
      ADD CONSTRAINT ck_biz_property_mutation_receipt_action_version_v2 CHECK ((
        (receipt_contract_version='legacy-v1' AND action_id IN (
          'property.approval.submit','property.approval.withdraw',
          'property.approval.decide','property.approval.incident-retry',
          'property.event.replay','property.notification.mark-read',
          'party.identity.create-draft','party.identity.update-draft',
          'party.identity.submit','party.identity.claim','party.identity.reassign',
          'party.identity.verify','party.identity.withdraw'))
        OR
        (receipt_contract_version='port-v2' AND action_id IN (
          'property.task.rebuild','property.task.claim','property.task.start',
          'property.task.block','property.task.unblock','property.task.release',
          'property.task.source-terminal.closed',
          'property.task.source-terminal.cancelled'))) IS TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=
      'public.biz_property_mutation_receipt'::regclass
      AND conname='ck_biz_property_mutation_receipt_identity_v2') THEN
    ALTER TABLE public.biz_property_mutation_receipt
      ADD CONSTRAINT ck_biz_property_mutation_receipt_identity_v2 CHECK ((
        (receipt_contract_version='legacy-v1'
          AND identity_kind IS NULL AND business_occurrence_key IS NULL
          AND task_key IS NULL AND identity_source_type IS NULL
          AND result_version IS NULL)
        OR
        (receipt_contract_version='port-v2' AND (
          (identity_kind='property-task'
            AND action_id IN ('property.task.claim','property.task.start',
              'property.task.block','property.task.unblock','property.task.release',
              'property.task.source-terminal.closed',
              'property.task.source-terminal.cancelled')
            AND business_occurrence_key IS NOT NULL
            AND business_occurrence_key ~ '[^ ]'
            AND octet_length(convert_to(business_occurrence_key,'UTF8')) BETWEEN 1 AND 256
            AND position(E'\t' in business_occurrence_key)=0
            AND position(E'\n' in business_occurrence_key)=0
            AND position(E'\r' in business_occurrence_key)=0
            AND position(U&'\FFFD' in business_occurrence_key)=0
            AND task_key ~ '^[0-9a-f]{64}$'
            AND identity_source_type IS NULL)
          OR
          (identity_kind='property-task-source-rebuild'
            AND action_id='property.task.rebuild'
            AND business_occurrence_key IS NULL AND task_key IS NULL
            AND identity_source_type ~ '^[a-z][a-z0-9_]{0,63}$'
            AND octet_length(convert_to(identity_source_type,'UTF8')) BETWEEN 1 AND 64)))) IS TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=
      'public.biz_property_mutation_receipt'::regclass
      AND conname='ck_biz_property_mutation_receipt_outcome_v2') THEN
    ALTER TABLE public.biz_property_mutation_receipt
      ADD CONSTRAINT ck_biz_property_mutation_receipt_outcome_v2 CHECK ((
        receipt_contract_version='legacy-v1'
        OR (receipt_contract_version='port-v2' AND (
          (receipt_status='started' AND result_ref IS NULL AND result_hash IS NULL
             AND result_version IS NULL AND completed_at IS NULL)
          OR
          (receipt_status='completed' AND result_ref IS NOT NULL
             AND result_hash IS NOT NULL AND result_version BETWEEN 1 AND 2147483647
             AND completed_at IS NOT NULL
             AND ((action_id='property.task.rebuild'
                    AND result_ref='property-task-rebuild/'||identity_source_type||'/'
                      ||lower(target_id::text)||'/v'||result_version::text)
               OR (action_id IN ('property.task.claim','property.task.start',
                    'property.task.block','property.task.unblock','property.task.release')
                    AND result_ref='property-task/'||lower(target_id::text)
                      ||'/v'||result_version::text)
               OR (action_id='property.task.source-terminal.closed'
                    AND result_ref ~ ('^property-task-source-terminal/[a-z][a-z0-9_]{0,63}/'
                      ||lower(target_id::text)||'/closed/v'||result_version::text||'$'))
               OR (action_id='property.task.source-terminal.cancelled'
                    AND result_ref ~ ('^property-task-source-terminal/[a-z][a-z0-9_]{0,63}/'
                      ||lower(target_id::text)||'/cancelled/v'||result_version::text||'$')))
             AND result_hash=public.fn_property_mutation_receipt_result_hash_v2(
               action_id,target_id,identity_kind,business_occurrence_key,task_key,
               identity_source_type,result_ref,result_version))))) IS TRUE);
  END IF;
END;
$receipt_constraints$;

CREATE OR REPLACE FUNCTION public.fn_property_mutation_receipt_guard_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'property-mutation-receipt-delete-forbidden' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.receipt_status<>'started' OR NEW.result_ref IS NOT NULL
       OR NEW.result_hash IS NOT NULL OR NEW.result_version IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'property-mutation-receipt-insert-must-be-started'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.receipt_status IN ('completed','failed') THEN
    RAISE EXCEPTION 'property-mutation-receipt-terminal-immutable'
      USING ERRCODE='23514';
  END IF;
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.park_id IS DISTINCT FROM OLD.park_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.action_id IS DISTINCT FROM OLD.action_id
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.client_key IS DISTINCT FROM OLD.client_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.receipt_contract_version IS DISTINCT FROM OLD.receipt_contract_version
     OR NEW.identity_kind IS DISTINCT FROM OLD.identity_kind
     OR NEW.business_occurrence_key IS DISTINCT FROM OLD.business_occurrence_key
     OR NEW.task_key IS DISTINCT FROM OLD.task_key
     OR NEW.identity_source_type IS DISTINCT FROM OLD.identity_source_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'property-mutation-receipt-immutable-field'
      USING ERRCODE='23514';
  END IF;
  IF OLD.receipt_contract_version='legacy-v1' THEN
    IF NEW.receipt_status NOT IN ('completed','failed') THEN
      RAISE EXCEPTION 'property-mutation-receipt-legacy-transition-invalid'
        USING ERRCODE='23514';
    END IF;
  ELSIF OLD.receipt_contract_version='port-v2' THEN
    IF NEW.receipt_status<>'completed' THEN
      RAISE EXCEPTION 'property-mutation-receipt-port-v2-transition-invalid'
        USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'property-mutation-receipt-version-invalid'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_property_mutation_receipt_guard_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_mutation_receipt_guard_v2() TO CURRENT_USER;
DO $receipt_trigger_install$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.biz_property_mutation_receipt'::regclass
      AND NOT t.tgisinternal AND t.tgname='trg_property_mutation_receipt_guard_v2') THEN
    CREATE TRIGGER trg_property_mutation_receipt_guard_v2
    BEFORE INSERT OR UPDATE OR DELETE ON public.biz_property_mutation_receipt
    FOR EACH ROW EXECUTE FUNCTION public.fn_property_mutation_receipt_guard_v2();
  END IF;
END;
$receipt_trigger_install$;

-- Replace only two fragments of the exact 000194 writer. The accepted new SHA
-- was independently measured by freeze diagnostic run b2ac30_freeze_20260801a
-- and is frozen below as migration evidence. No catalog comment is a trust root;
-- only the exact old or frozen new definition is accepted, and every third writer
-- state fails before CREATE OR REPLACE.
DO $replace_projection_writer$
DECLARE
  v_oid oid := 'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)'::regprocedure;
  v_definition text;
  v_body text;
  v_hash text;
  v_old_hash constant text := '50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47';
  v_new_hash constant text := 'ebc66d0059c66d82a6e49c6d3bdfb9f94a0d860301d08c99272258bfa32fd99b';
  v_old text := $old$  SELECT r.action_id,r.target_id,r.actor_id
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
  END IF;$old$;
  v_new text := $new$  -- property-mutation-receipt-contract-v2-000195
  SELECT r.action_id,r.target_id,r.actor_id,r.identity_kind,
         r.business_occurrence_key,r.task_key,r.identity_source_type
  INTO v_receipt_action,v_receipt_target,v_receipt_actor,v_receipt_identity_kind,
       v_receipt_occurrence,v_receipt_task_key,v_receipt_source_type
  FROM public.biz_property_mutation_receipt r
  WHERE r.tenant_id=p_tenant_id AND r.park_id=p_park_id AND r.id=p_receipt_id
    AND r.receipt_status='started' AND r.request_hash=p_request_hash
    AND r.receipt_contract_version='port-v2'
    AND r.result_ref IS NULL AND r.result_hash IS NULL
    AND r.result_version IS NULL AND r.completed_at IS NULL;
  IF NOT FOUND OR v_receipt_actor IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'property-task-projection-receipt-conflict' USING ERRCODE='40001';
  END IF;
  IF v_receipt_action IS DISTINCT FROM p_command_action THEN
    RAISE EXCEPTION 'property-task-projection-action-conflict' USING ERRCODE='22023';
  END IF;
  IF p_result_hash IS DISTINCT FROM public.fn_property_mutation_receipt_result_hash_v2(
       v_receipt_action,v_receipt_target,v_receipt_identity_kind,
       v_receipt_occurrence,v_receipt_task_key,v_receipt_source_type,
       p_result_ref,p_result_version) THEN
    RAISE EXCEPTION 'property-task-projection-result-hash-conflict' USING ERRCODE='22023';
  END IF;
  IF p_replace_mode='manual-rebuild' THEN
    IF v_receipt_identity_kind IS DISTINCT FROM 'property-task-source-rebuild'
       OR v_receipt_source_type IS DISTINCT FROM p_source_type THEN
      RAISE EXCEPTION 'property-task-projection-receipt-identity-conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    IF v_receipt_identity_kind IS DISTINCT FROM 'property-task' THEN
      RAISE EXCEPTION 'property-task-projection-receipt-identity-conflict' USING ERRCODE='22023';
    END IF;
  END IF;$new$;
  v_identity_anchor text := $anchor$  IF p_replace_mode='manual-rebuild' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id OR p_result_version<>v_next$anchor$;
  v_identity_new text := $replacement$  -- property-mutation-receipt-snapshot-binding-v2-000195
  IF p_replace_mode<>'manual-rebuild' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
    WHERE value->>'taskKey' IS NOT DISTINCT FROM v_receipt_task_key::text
      AND value->>'businessOccurrenceKey' IS NOT DISTINCT FROM v_receipt_occurrence
      AND (p_command_action IN ('property.task.source-terminal.closed',
                                'property.task.source-terminal.cancelled')
        OR ((value->>'taskId')::uuid IS NOT DISTINCT FROM v_receipt_target
          AND (value->>'assignmentVersion')::integer IS NOT DISTINCT FROM p_result_version))
  ) THEN
    RAISE EXCEPTION 'property-task-projection-receipt-identity-conflict' USING ERRCODE='22023';
  END IF;
  IF p_replace_mode='manual-rebuild' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id OR p_result_version<>v_next$replacement$;
BEGIN
  SELECT pg_get_functiondef(v_oid),p.prosrc
    INTO v_definition,v_body FROM pg_proc p WHERE p.oid=v_oid;
  v_hash:=encode(public.digest(pg_catalog.convert_to(v_definition,'UTF8'),'sha256'),'hex');
  IF v_hash=v_old_hash THEN
    IF length(v_body)-length(replace(v_body,v_old,''))<>length(v_old) THEN
      RAISE EXCEPTION 'property-task-projection-old-fragment-drift' USING ERRCODE='23514';
    END IF;
    v_body:=replace(v_body,v_old,v_new);
    -- Add the variables consumed by the replacement fence to the existing DECLARE.
    v_body:=replace(v_body,
      '  v_receipt_target uuid; v_receipt_actor uuid;',
      '  v_receipt_target uuid; v_receipt_actor uuid;'||E'\n'
      ||'  v_receipt_identity_kind varchar(32); v_receipt_occurrence varchar(256);'||E'\n'
      ||'  v_receipt_task_key char(64); v_receipt_source_type varchar(64);');
    IF position('property-mutation-receipt-contract-v2-000195' in v_body)=0 THEN
      RAISE EXCEPTION 'property-task-projection-replacement-failed' USING ERRCODE='23514';
    END IF;
    IF length(v_body)-length(replace(v_body,v_identity_anchor,''))
         <>length(v_identity_anchor) THEN
      RAISE EXCEPTION 'property-task-projection-identity-anchor-drift' USING ERRCODE='23514';
    END IF;
    v_body:=replace(v_body,v_identity_anchor,v_identity_new);
    EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_property_task_projection_replace_v1('
      ||'p_tenant_id varchar(64),p_park_id varchar(64),p_source_type varchar(64),'
      ||'p_source_id uuid,p_actor_id uuid,p_receipt_id uuid,p_replace_mode varchar(32),'
      ||'p_command_action varchar(128),p_result_version integer,'
      ||'p_expected_projection_version integer,p_request_hash char(64),'
      ||'p_result_ref varchar(512),p_result_hash char(64),p_reason varchar(1000),'
      ||'p_rows jsonb) '
      ||'RETURNS TABLE(previous_projection_version integer, projection_version integer,'
      ||' projected_task_count integer) LANGUAGE plpgsql SECURITY INVOKER '
      ||'SET search_path=pg_catalog,public AS $body$'||v_body||'$body$';
  ELSIF v_hash=v_new_hash THEN
    IF position('property-mutation-receipt-contract-v2-000195' in v_body)=0
       OR position('property-mutation-receipt-snapshot-binding-v2-000195' in v_body)=0 THEN
      RAISE EXCEPTION 'property-task-projection-000195-new-definition-drift:%',v_hash
        USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'property-task-projection-000195-third-state:%',v_hash
      USING ERRCODE='23514';
  END IF;
END;
$replace_projection_writer$;

-- Forward-expand the immutable control audit for a second, explicit correction.
DO $control_audit_contract_forward$
DECLARE
  v_definition text;
  v_default text;
  v_old_definition constant text :=
    'CHECK (correction_key::text = ''b2a-contract-correction-000194''::text)';
  v_new_definition constant text :=
    'CHECK (correction_key::text = ANY (ARRAY[''b2a-contract-correction-000194''::character varying::text, ''b2a-contract-correction-000195''::character varying::text]))';
BEGIN
  SELECT pg_get_constraintdef(c.oid,true) INTO v_definition
  FROM pg_constraint c WHERE c.conrelid=
    'public.sys_property_runtime_control_contract_audit'::regclass
    AND c.conname='ck_sys_property_runtime_control_contract_audit_key';
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO v_default
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.sys_property_runtime_control_contract_audit'::regclass
    AND a.attname='correction_key';
  IF v_definition IS NULL OR v_default IS DISTINCT FROM
       '''b2a-contract-correction-000194''::character varying' THEN
    RAISE EXCEPTION 'property-runtime-control-audit-key-constraint-missing'
      USING ERRCODE='23514';
  END IF;
  IF v_definition=v_new_definition THEN
    NULL;
  ELSIF v_definition=v_old_definition THEN
    ALTER TABLE public.sys_property_runtime_control_contract_audit
      DROP CONSTRAINT ck_sys_property_runtime_control_contract_audit_key;
    ALTER TABLE public.sys_property_runtime_control_contract_audit
      ADD CONSTRAINT ck_sys_property_runtime_control_contract_audit_key CHECK (
        correction_key::text = ANY (ARRAY[
          'b2a-contract-correction-000194'::varchar,
          'b2a-contract-correction-000195'::varchar]::text[]));
  ELSE
    RAISE EXCEPTION 'property-runtime-control-audit-key-constraint-drift'
      USING ERRCODE='23514';
  END IF;
END;
$control_audit_contract_forward$;

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

CREATE TEMP TABLE b2a_qualifying_scope (
  tenant_key text NOT NULL, park_key text NOT NULL,
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

DO $control_contract_correction$
DECLARE
  v_expected bigint; v_actual bigint; v_old bigint; v_new bigint;
  v_old_audits bigint; v_new_audits bigint; v_audit bigint;
  v_updated bigint; v_inserted bigint;
  v_changed_at timestamptz := clock_timestamp();
  v_old_hash constant char(64) := '81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3';
  v_new_hash constant char(64) := 'e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944';
  v_expand_hash constant char(64) := 'a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8';
  v_expand_reason constant varchar(500) := 'expand-only';
  v_old_reason constant varchar(500) := 'b2a-contract-correction-000194';
  v_new_reason constant varchar(500) := 'b2a-contract-correction-000195';
  v_correction constant varchar(64) := 'b2a-contract-correction-000195';
BEGIN
  -- Closed migration states: all-old -> all-new; all-new is an exact no-op.
  -- Any mixed, enabled, shadow, enforce, missing, extra or audit drift fails
  -- the transaction before it can publish a partial control contract.
  LOCK TABLE public.sys_property_runtime_control IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*)*12 INTO v_expected FROM b2a_qualifying_scope;
  PERFORM c.id FROM b2a_qualifying_scope scope
  CROSS JOIN b2a_signed_runtime_control e
  JOIN public.sys_property_runtime_control c
    ON c.tenant_id=scope.tenant_key AND c.park_id=scope.park_key
   AND c.control_key=e.control_key
  ORDER BY c.tenant_id,c.park_id,c.control_key,c.id
  FOR UPDATE OF c;
  IF EXISTS (
    (SELECT scope.tenant_key,scope.park_key,e.control_key
       FROM b2a_qualifying_scope scope CROSS JOIN b2a_signed_runtime_control e
     EXCEPT SELECT c.tenant_id,c.park_id,c.control_key
       FROM public.sys_property_runtime_control c)
    UNION ALL
    (SELECT c.tenant_id,c.park_id,c.control_key
       FROM public.sys_property_runtime_control c
     EXCEPT SELECT scope.tenant_key,scope.park_key,e.control_key
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
  SELECT count(*) FILTER (WHERE c.contract_hash=v_old_hash
                                  AND c.disabled_reason=v_old_reason
                                  AND c.version=2),
         count(*) FILTER (WHERE c.contract_hash=v_new_hash
                                  AND c.disabled_reason=v_new_reason
                                  AND c.version=3)
    INTO v_old,v_new
  FROM public.sys_property_runtime_control c
  JOIN b2a_signed_runtime_control e USING (control_key);
  SELECT count(*) FILTER (WHERE a.correction_key='b2a-contract-correction-000194'),
         count(*) FILTER (WHERE a.correction_key=v_correction)
    INTO v_old_audits,v_new_audits
  FROM public.sys_property_runtime_control_contract_audit a;
  v_audit:=v_new_audits;
  IF EXISTS (
    (SELECT scope.tenant_key,scope.park_key,e.control_key
       FROM b2a_qualifying_scope scope CROSS JOIN b2a_signed_runtime_control e
     EXCEPT
     SELECT a.tenant_id,a.park_id,a.control_key
       FROM public.sys_property_runtime_control_contract_audit a
      WHERE a.correction_key='b2a-contract-correction-000194')
    UNION ALL
    (SELECT a.tenant_id,a.park_id,a.control_key
       FROM public.sys_property_runtime_control_contract_audit a
      WHERE a.correction_key='b2a-contract-correction-000194'
     EXCEPT
     SELECT scope.tenant_key,scope.park_key,e.control_key
       FROM b2a_qualifying_scope scope CROSS JOIN b2a_signed_runtime_control e)
  ) OR EXISTS (
    SELECT 1 FROM public.sys_property_runtime_control_contract_audit a
    JOIN public.sys_property_runtime_control c
      ON c.tenant_id=a.tenant_id AND c.park_id=a.park_id AND c.id=a.control_id
    WHERE a.correction_key='b2a-contract-correction-000194'
      AND (a.control_key<>c.control_key OR a.old_contract_hash<>v_expand_hash
        OR a.new_contract_hash<>v_old_hash OR a.old_version<>1 OR a.new_version<>2
        OR a.old_disabled_reason<>v_expand_reason OR a.new_disabled_reason<>v_old_reason
        OR a.new_update_time<>a.occurred_at OR a.new_update_time<a.old_update_time
        OR a.evidence_hash IS DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
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
    RAISE EXCEPTION 'property-runtime-control-000194-audit-drift' USING ERRCODE='23514';
  END IF;
  IF v_actual<>v_expected OR v_old+v_new<>v_expected OR v_old_audits<>v_expected THEN
    RAISE EXCEPTION 'property-runtime-control-contract-drift' USING ERRCODE='23514';
  END IF;
  IF v_old=v_expected AND v_new=0 AND v_new_audits=0 THEN
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
       (tenant_id,park_id,control_id,control_key,correction_key,
        old_contract_hash,new_contract_hash,old_version,new_version,
        old_disabled_reason,new_disabled_reason,old_update_time,new_update_time,
        evidence_hash,occurred_at)
      SELECT tenant_id,park_id,id,control_key,v_correction,v_old_hash,v_new_hash,
        old_version_value,version,old_reason_value,v_new_reason,old_time_value,update_time,
        encode(public.digest(convert_to('runtime-control-contract-audit-v2'||E'\n'
          ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(v_correction,'S')||E'\t'
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
  ELSIF v_new=v_expected AND v_old=0 AND v_new_audits=v_expected THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'property-runtime-control-mixed-contract-state' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sys_property_runtime_control c
    JOIN public.sys_property_runtime_control_contract_audit a
      ON a.tenant_id=c.tenant_id AND a.park_id=c.park_id AND a.control_id=c.id
    WHERE a.correction_key=v_correction AND
      (a.control_key<>c.control_key OR a.old_contract_hash<>v_old_hash
       OR a.new_contract_hash<>v_new_hash OR a.new_contract_hash<>c.contract_hash
       OR a.old_version+1<>a.new_version OR a.new_version<>c.version
       OR a.old_disabled_reason<>v_old_reason
       OR a.new_disabled_reason<>v_new_reason
       OR a.new_disabled_reason<>c.disabled_reason
       OR a.new_update_time<>c.update_time OR a.occurred_at<>c.update_time
       OR a.new_update_time<a.old_update_time
       OR a.evidence_hash IS DISTINCT FROM encode(public.digest(convert_to(
          'runtime-control-contract-audit-v2'||E'\n'
          ||public.fn_property_task_projection_scalar_v1(a.tenant_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(a.park_id,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(a.control_id::text,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(a.control_key,'S')||E'\t'
          ||public.fn_property_task_projection_scalar_v1(a.correction_key,'S')||E'\t'
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
  SELECT count(*) INTO v_actual FROM public.sys_property_runtime_control c
  JOIN b2a_signed_runtime_control e USING (control_key)
  WHERE c.contract_hash=v_new_hash AND c.disabled_reason=v_new_reason
    AND c.version=3 AND c.control_kind=e.control_kind AND c.target=e.target
    AND c.adapter_version IS NOT DISTINCT FROM e.adapter_version
    AND c.enabled=false AND c.control_mode='disabled' AND c.enabled_by IS NULL
    AND c.enabled_at IS NULL AND c.approval_reference IS NULL;
  IF v_actual<>v_expected OR EXISTS (
    SELECT 1 FROM public.sys_property_runtime_control c
    WHERE c.enabled OR c.control_mode<>'disabled' OR c.enabled_by IS NOT NULL
      OR c.enabled_at IS NOT NULL OR c.approval_reference IS NOT NULL) THEN
    RAISE EXCEPTION 'property-runtime-control-final-disabled-drift'
      USING ERRCODE='23514';
  END IF;
END;
$control_contract_correction$;

REVOKE INSERT, UPDATE, DELETE ON public.biz_property_mutation_receipt FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.sys_property_runtime_control_contract_audit FROM PUBLIC;

COMMIT;
