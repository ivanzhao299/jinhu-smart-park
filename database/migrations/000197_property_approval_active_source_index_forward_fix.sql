-- PR192 B-2c forward-only correction for approval active-source uniqueness.
-- R0: 705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439
-- This migration changes one index only. It does not own domain effects or data.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $prehistory$
DECLARE
  v_count integer;
  v_primary_filename text;
  v_primary_checksum text;
  v_primary_status text;
  v_standard_filename text;
  v_standard_checksum text;
  v_standard_status text;
  v_self_filename constant text :=
    '000197_property_approval_active_source_index_forward_fix.sql';
BEGIN
  IF to_regclass('public.sys_schema_migration_history') IS NULL
     OR to_regclass('public.schema_migrations') IS NULL
     OR to_regclass('public.biz_property_approval_request') IS NULL
     OR to_regprocedure('public.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'property-approval-active-source-prerequisite-missing'
      USING ERRCODE='42P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sys_schema_migration_history primary_history
    FULL JOIN public.schema_migrations standard_history USING (filename)
    WHERE coalesce(primary_history.filename,standard_history.filename)>='000185_'
      AND coalesce(primary_history.filename,standard_history.filename)<>
        '000197_property_approval_active_source_index_forward_fix.sql'
      AND (
        primary_history.filename IS NULL OR standard_history.filename IS NULL
        OR primary_history.checksum IS DISTINCT FROM standard_history.checksum
        OR primary_history.status IS DISTINCT FROM standard_history.status
        OR primary_history.status IS DISTINCT FROM 'succeeded'
      )
  ) THEN
    RAISE EXCEPTION 'property-approval-active-source-dual-history-drift'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sys_schema_migration_history
    WHERE filename LIKE '000197\_%' ESCAPE '\' AND filename<>v_self_filename
    UNION ALL
    SELECT 1 FROM public.schema_migrations
    WHERE filename LIKE '000197\_%' ESCAPE '\' AND filename<>v_self_filename
  ) THEN
    RAISE EXCEPTION 'property-approval-active-source-unknown-000197-history'
      USING ERRCODE='23514';
  END IF;

  SELECT filename,checksum,status
    INTO v_primary_filename,v_primary_checksum,v_primary_status
  FROM public.sys_schema_migration_history WHERE filename=v_self_filename;
  SELECT filename,checksum,status
    INTO v_standard_filename,v_standard_checksum,v_standard_status
  FROM public.schema_migrations WHERE filename=v_self_filename;
  IF (v_primary_filename IS NULL) IS DISTINCT FROM (v_standard_filename IS NULL)
     OR v_primary_checksum IS DISTINCT FROM v_standard_checksum
     OR v_primary_status IS DISTINCT FROM v_standard_status
     OR (v_primary_filename IS NOT NULL AND (
       v_primary_status NOT IN ('running','succeeded')
     )) THEN
    RAISE EXCEPTION 'property-approval-active-source-self-history-drift'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('000186_property_b_approval_runtime_schema.sql',
       '5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e'),
      ('000193_property_b_runtime_integrity_forward_fix.sql',
       'c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07'),
      ('000194_property_task_projection_contract_correction.sql',
       '93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0'),
      ('000195_property_mutation_receipt_contract_v2.sql',
       '9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4')
  ) expected(filename,checksum)
  JOIN public.sys_schema_migration_history history
    ON history.filename=expected.filename
   AND history.checksum=expected.checksum
   AND history.status='succeeded';
  IF v_count<>4 THEN
    RAISE EXCEPTION 'property-approval-active-source-authority-history-drift'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sys_schema_migration_history
    WHERE filename LIKE '000191\_%' ESCAPE '\'
      AND filename<>'000191_property_b_homestay_effect_schema.sql'
    UNION ALL
    SELECT 1 FROM public.sys_schema_migration_history
    WHERE filename LIKE '000192\_%' ESCAPE '\'
      AND filename<>'000192_property_b_housing_effect_schema.sql'
  ) OR (SELECT count(*) FROM public.sys_schema_migration_history
        WHERE filename LIKE '000191\_%' ESCAPE '\')>1
     OR (SELECT count(*) FROM public.sys_schema_migration_history
        WHERE filename LIKE '000192\_%' ESCAPE '\')>1 THEN
    RAISE EXCEPTION 'property-approval-active-source-effect-history-drift'
      USING ERRCODE='23514';
  END IF;
END
$prehistory$;

LOCK TABLE public.biz_property_approval_request IN SHARE MODE;

DO $preflight$
DECLARE
  v_index_oid oid;
  v_indexdef_sha text;
  v_predicate_sha text;
  v_key_names text[];
  v_old_indexdef_sha constant text :=
    '89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584';
  v_old_predicate_sha constant text :=
    'd47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37';
  v_new_indexdef_sha constant text :=
    'dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c';
  v_new_predicate_sha constant text :=
    '24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda';
BEGIN
  v_index_oid:=to_regclass('public.uq_biz_property_approval_request_active_source');
  IF v_index_oid IS NULL THEN
    RAISE EXCEPTION 'property-approval-active-source-final-index-missing'
      USING ERRCODE='42P01';
  END IF;
  IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL THEN
    RAISE EXCEPTION 'property-approval-active-source-build-index-residue'
      USING ERRCODE='42P07';
  END IF;

  SELECT
    encode(public.digest(convert_to(pg_get_indexdef(index_row.indexrelid),'UTF8'),'sha256'),'hex'),
    encode(public.digest(convert_to(pg_get_expr(index_row.indpred,index_row.indrelid,false),'UTF8'),'sha256'),'hex'),
    ARRAY(
      SELECT attribute.attname
      FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY key(attnum,ordinal)
      JOIN pg_attribute attribute
        ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
      ORDER BY key.ordinal
    )
  INTO v_indexdef_sha,v_predicate_sha,v_key_names
  FROM pg_index index_row
  WHERE index_row.indexrelid=v_index_oid
    AND index_row.indrelid='public.biz_property_approval_request'::regclass
    AND index_row.indisunique
    AND NOT index_row.indisprimary
    AND index_row.indisvalid
    AND index_row.indisready
    AND index_row.indnkeyatts=6
    AND index_row.indnatts=6
    AND index_row.indexprs IS NULL
    AND index_row.indpred IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint constraint_row
                    WHERE constraint_row.conindid=index_row.indexrelid);

  IF v_indexdef_sha IS NULL
     OR v_key_names IS DISTINCT FROM ARRAY[
       'tenant_id','park_id','action_id','source_type','source_id','source_expected_version'
     ]::text[]
     OR NOT (
       (v_indexdef_sha=v_old_indexdef_sha AND v_predicate_sha=v_old_predicate_sha)
       OR (v_indexdef_sha=v_new_indexdef_sha AND v_predicate_sha=v_new_predicate_sha)
     ) THEN
    RAISE EXCEPTION 'property-approval-active-source-index-catalog-drift'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.biz_property_approval_request request
    WHERE request.decision_status IN ('draft','submitted','pending_approval')
       OR (request.decision_status='approved' AND request.execution_status IN (
         'not_started','executing','retry_wait','infra_exhausted'
       ))
    GROUP BY request.tenant_id,request.park_id,request.action_id,
      request.source_type,request.source_id,request.source_expected_version
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'property-approval-active-source-duplicate-active-data'
      USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.biz_property_approval_request request
    WHERE NOT (
      (request.decision_status IN ('draft','submitted','pending_approval')
       AND request.execution_status='not_started')
      OR (request.decision_status='approved' AND request.execution_status IN (
        'not_started','executing','retry_wait','executed','execution_failed','infra_exhausted'
      ))
      OR (request.decision_status IN ('rejected','withdrawn','expired')
       AND request.execution_status='not_required')
    )
  ) THEN
    RAISE EXCEPTION 'property-approval-active-source-invalid-status-pair'
      USING ERRCODE='23514';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
  ON public.biz_property_approval_request
    (tenant_id, park_id, action_id, source_type, source_id, source_expected_version)
  WHERE (
    decision_status IN ('draft', 'submitted', 'pending_approval')
    OR (
      decision_status = 'approved'
      AND execution_status IN (
        'not_started', 'executing', 'retry_wait', 'infra_exhausted'
      )
    )
  );

DROP INDEX public.uq_biz_property_approval_request_active_source;

ALTER INDEX public.uq_biz_property_approval_request_active_source_v2_build
  RENAME TO uq_biz_property_approval_request_active_source;

DO $postcheck$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_index index_row
  WHERE index_row.indexrelid=to_regclass('public.uq_biz_property_approval_request_active_source')
    AND index_row.indrelid='public.biz_property_approval_request'::regclass
    AND index_row.indisunique AND NOT index_row.indisprimary
    AND index_row.indisvalid AND index_row.indisready
    AND index_row.indnkeyatts=6 AND index_row.indnatts=6
    AND index_row.indexprs IS NULL AND index_row.indpred IS NOT NULL
    AND encode(public.digest(convert_to(pg_get_indexdef(index_row.indexrelid),'UTF8'),'sha256'),'hex')=
      'dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c'
    AND encode(public.digest(convert_to(pg_get_expr(index_row.indpred,index_row.indrelid,false),'UTF8'),'sha256'),'hex')=
      '24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda'
    AND NOT EXISTS (SELECT 1 FROM pg_constraint constraint_row
                    WHERE constraint_row.conindid=index_row.indexrelid);
  IF v_count<>1
     OR to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL THEN
    RAISE EXCEPTION 'property-approval-active-source-postcheck-failed'
      USING ERRCODE='23514';
  END IF;
END
$postcheck$;

COMMIT;
