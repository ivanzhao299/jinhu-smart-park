BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Forward-only B-1 integrity correction. 000185-000190 remain immutable.
-- Existing receipt rows are intentionally not backfilled here. B-4 owns history
-- reconciliation, constraint validation, and the final NOT NULL contraction.

-- B0_CATALOG_OBJECTS_START
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.observed_cardinality
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.owning_unique_name
-- B0_CATALOG_OBJECT column	public.biz_property_execution_effect_receipt.unique_key_hash
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_cardinality_ff
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_unique_hash_ff
-- B0_CATALOG_OBJECT constraint	public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_unique_name_ff
-- B0_CATALOG_OBJECT function	public.fn_guard_property_outbox_runtime_integrity()
-- B0_CATALOG_OBJECT function	public.fn_validate_property_effect_receipt_proof()
-- B0_CATALOG_OBJECT trigger	public.biz_property_execution_effect_receipt.trg_biz_property_effect_receipt_proof_ff
-- B0_CATALOG_OBJECT trigger	public.biz_property_outbox.trg_biz_property_outbox_runtime_integrity
-- B0_CATALOG_OBJECTS_END

DO $prerequisite_guard$
BEGIN
  IF to_regclass('public.biz_property_execution_effect_receipt') IS NULL
     OR to_regclass('public.biz_property_execution_effect_manifest') IS NULL
     OR to_regclass('public.biz_property_approval_request') IS NULL
     OR to_regclass('public.biz_property_outbox') IS NULL
     OR to_regclass('public.biz_property_runtime_checkpoint') IS NULL THEN
    RAISE EXCEPTION 'property-b-runtime-integrity-prerequisite-missing'
      USING ERRCODE = '42P01';
  END IF;
END;
$prerequisite_guard$;

CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN ('column', 'constraint', 'function', 'trigger')),
  name text NOT NULL,
  PRIMARY KEY (kind, name)
) ON COMMIT DROP;

INSERT INTO b0_catalog_target(kind, name) VALUES
  ('column', 'public.biz_property_execution_effect_receipt.observed_cardinality'),
  ('column', 'public.biz_property_execution_effect_receipt.owning_unique_name'),
  ('column', 'public.biz_property_execution_effect_receipt.unique_key_hash'),
  ('constraint', 'public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_cardinality_ff'),
  ('constraint', 'public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_unique_hash_ff'),
  ('constraint', 'public.biz_property_execution_effect_receipt.ck_biz_property_effect_receipt_unique_name_ff'),
  ('function', 'public.fn_guard_property_outbox_runtime_integrity()'),
  ('function', 'public.fn_validate_property_effect_receipt_proof()'),
  ('trigger', 'public.biz_property_execution_effect_receipt.trg_biz_property_effect_receipt_proof_ff'),
  ('trigger', 'public.biz_property_outbox.trg_biz_property_outbox_runtime_integrity');

CREATE TEMP VIEW b0_guard_catalog AS
SELECT
  'column'::text AS kind,
  n.nspname || '.' || c.relname || '.' || a.attname AS name,
  jsonb_build_object(
    'dataType', format_type(a.atttypid, a.atttypmod),
    'default', coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
    'generated', a.attgenerated::text,
    'identity', a.attidentity::text,
    'notNull', a.attnotnull,
    'ordinal', a.attnum
  ) AS definition,
  col_description(c.oid, a.attnum) AS signature_comment
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
JOIN b0_catalog_target t
  ON t.kind = 'column'
 AND t.name = n.nspname || '.' || c.relname || '.' || a.attname
WHERE a.attnum > 0 AND NOT a.attisdropped
UNION ALL
SELECT
  'constraint',
  n.nspname || '.' || c.relname || '.' || x.conname,
  jsonb_build_object(
    'deferrable', x.condeferrable,
    'definition', pg_get_constraintdef(x.oid, false),
    'initiallyDeferred', x.condeferred,
    'type', x.contype::text,
    'validated', x.convalidated
  ),
  obj_description(x.oid, 'pg_constraint')
FROM pg_constraint x
JOIN pg_class c ON c.oid = x.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN b0_catalog_target t
  ON t.kind = 'constraint'
 AND t.name = n.nspname || '.' || c.relname || '.' || x.conname
UNION ALL
SELECT
  'function',
  n.nspname || '.' || p.proname || '(' ||
    pg_get_function_identity_arguments(p.oid) || ')',
  jsonb_build_object(
    'definition', pg_get_functiondef(p.oid),
    'language', l.lanname,
    'securityDefiner', p.prosecdef,
    'volatility', p.provolatile::text
  ),
  obj_description(p.oid, 'pg_proc')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
JOIN b0_catalog_target t
  ON t.kind = 'function'
 AND t.name = n.nspname || '.' || p.proname || '(' ||
   pg_get_function_identity_arguments(p.oid) || ')'
UNION ALL
SELECT
  'trigger',
  n.nspname || '.' || c.relname || '.' || g.tgname,
  jsonb_build_object(
    'definition', pg_get_triggerdef(g.oid, false),
    'enabled', g.tgenabled::text
  ),
  obj_description(g.oid, 'pg_trigger')
FROM pg_trigger g
JOIN pg_class c ON c.oid = g.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN b0_catalog_target t
  ON t.kind = 'trigger'
 AND t.name = n.nspname || '.' || c.relname || '.' || g.tgname
WHERE NOT g.tgisinternal;

DO $preexisting_definition_guard$
DECLARE
  invalid text;
BEGIN
  SELECT string_agg(kind || E'\t' || name, E'\n'
                    ORDER BY kind COLLATE "C", name COLLATE "C")
    INTO invalid
  FROM b0_guard_catalog
  WHERE signature_comment IS DISTINCT FROM
    'b0-catalog-v1:' ||
    encode(digest(convert_to(definition::text, 'UTF8'), 'sha256'), 'hex');

  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION 'b0-preexisting-definition-drift:%', E'\n' || invalid
      USING ERRCODE = '23514';
  END IF;
END;
$preexisting_definition_guard$;

ALTER TABLE public.biz_property_execution_effect_receipt
  ADD COLUMN IF NOT EXISTS owning_unique_name varchar(128),
  ADD COLUMN IF NOT EXISTS unique_key_hash char(64),
  ADD COLUMN IF NOT EXISTS observed_cardinality integer;

DO $receipt_column_shape_guard$
DECLARE
  invalid text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attname)
    INTO invalid
  FROM pg_attribute a
  WHERE a.attrelid = 'public.biz_property_execution_effect_receipt'::regclass
    AND a.attname IN ('owning_unique_name', 'unique_key_hash', 'observed_cardinality')
    AND NOT a.attisdropped
    AND (
      (a.attname = 'owning_unique_name' AND format_type(a.atttypid, a.atttypmod) <> 'character varying(128)')
      OR (a.attname = 'unique_key_hash' AND format_type(a.atttypid, a.atttypmod) <> 'character(64)')
      OR (a.attname = 'observed_cardinality' AND format_type(a.atttypid, a.atttypmod) <> 'integer')
      OR a.attnotnull
    );

  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION 'property-effect-receipt-forward-column-drift:%', invalid
      USING ERRCODE = '23514';
  END IF;
END;
$receipt_column_shape_guard$;

DO $receipt_constraint_expand$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.biz_property_execution_effect_receipt'::regclass
      AND conname = 'ck_biz_property_effect_receipt_unique_hash_ff'
  ) THEN
    ALTER TABLE public.biz_property_execution_effect_receipt
      ADD CONSTRAINT ck_biz_property_effect_receipt_unique_hash_ff
      CHECK (unique_key_hash IS NULL OR unique_key_hash ~ '^[0-9a-f]{64}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.biz_property_execution_effect_receipt'::regclass
      AND conname = 'ck_biz_property_effect_receipt_cardinality_ff'
  ) THEN
    ALTER TABLE public.biz_property_execution_effect_receipt
      ADD CONSTRAINT ck_biz_property_effect_receipt_cardinality_ff
      CHECK (observed_cardinality IS NULL OR observed_cardinality > 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.biz_property_execution_effect_receipt'::regclass
      AND conname = 'ck_biz_property_effect_receipt_unique_name_ff'
  ) THEN
    ALTER TABLE public.biz_property_execution_effect_receipt
      ADD CONSTRAINT ck_biz_property_effect_receipt_unique_name_ff
      CHECK (owning_unique_name IS NULL OR length(trim(owning_unique_name)) > 0)
      NOT VALID;
  END IF;
END;
$receipt_constraint_expand$;

CREATE OR REPLACE FUNCTION public.fn_validate_property_effect_receipt_proof()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  manifest public.biz_property_execution_effect_manifest%ROWTYPE;
  request_execution_key varchar(128);
BEGIN
  SELECT *
    INTO manifest
  FROM public.biz_property_execution_effect_manifest
  WHERE tenant_id = NEW.tenant_id
    AND park_id = NEW.park_id
    AND request_id = NEW.request_id
    AND id = NEW.manifest_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'property-effect-receipt-manifest-missing'
      USING ERRCODE = '23503';
  END IF;

  SELECT execution_idempotency_key
    INTO request_execution_key
  FROM public.biz_property_approval_request
  WHERE tenant_id = NEW.tenant_id
    AND park_id = NEW.park_id
    AND id = NEW.request_id;

  IF NEW.owning_unique_name IS NULL
     OR NEW.unique_key_hash IS NULL
     OR NEW.observed_cardinality IS NULL
     OR NEW.unique_key_hash !~ '^[0-9a-f]{64}$'
     OR length(trim(NEW.owning_unique_name)) = 0
     OR NEW.domain_table IS DISTINCT FROM manifest.owning_table
     OR NEW.owning_unique_name IS DISTINCT FROM manifest.owning_unique_name
     OR NEW.effect_kind IS DISTINCT FROM manifest.effect_kind
     OR NEW.effect_ordinal IS DISTINCT FROM manifest.effect_ordinal
     OR NEW.effect_line_key IS DISTINCT FROM manifest.effect_line_key
     OR NEW.effect_hash IS DISTINCT FROM manifest.invariant_hash
     OR NEW.line_amount IS DISTINCT FROM manifest.line_amount
     OR NEW.currency IS DISTINCT FROM manifest.currency
     OR NEW.observed_cardinality IS DISTINCT FROM manifest.expected_cardinality
     OR NEW.execution_idempotency_key IS DISTINCT FROM request_execution_key THEN
    RAISE EXCEPTION 'property-effect-receipt-proof-mismatch'
      USING ERRCODE = '23514';
  END IF;

  -- Deliberately no dynamic lookup of domain_table/domain_row_id. The owning
  -- adapter and B-AR4 integration gate must prove the actual domain row safely.
  RETURN NULL;
END;
$$;

DO $receipt_proof_trigger$
DECLARE
  current_definition text;
BEGIN
  SELECT regexp_replace(pg_get_triggerdef(g.oid, false), '\s+', ' ', 'g')
    INTO current_definition
  FROM pg_trigger g
  WHERE g.tgrelid = 'public.biz_property_execution_effect_receipt'::regclass
    AND g.tgname = 'trg_biz_property_effect_receipt_proof_ff'
    AND NOT g.tgisinternal;

  IF current_definition IS NULL THEN
    EXECUTE $ddl$
      CREATE CONSTRAINT TRIGGER trg_biz_property_effect_receipt_proof_ff
      AFTER INSERT OR UPDATE
      ON public.biz_property_execution_effect_receipt
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_validate_property_effect_receipt_proof()
    $ddl$;
  END IF;
END;
$receipt_proof_trigger$;

CREATE OR REPLACE FUNCTION public.fn_guard_property_outbox_runtime_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'property-outbox-delete-forbidden'
      USING ERRCODE = '55000';
  END IF;

  IF ROW(
       NEW.event_id, NEW.tenant_id, NEW.park_id,
       NEW.event_type, NEW.event_version,
       NEW.aggregate_type, NEW.aggregate_id, NEW.aggregate_version,
       NEW.ordering_key, NEW.sequence, NEW.event_ordinal,
       NEW.approval_request_id, NEW.execution_idempotency_key,
       NEW.payload, NEW.payload_hash, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.event_id, OLD.tenant_id, OLD.park_id,
       OLD.event_type, OLD.event_version,
       OLD.aggregate_type, OLD.aggregate_id, OLD.aggregate_version,
       OLD.ordering_key, OLD.sequence, OLD.event_ordinal,
       OLD.approval_request_id, OLD.execution_idempotency_key,
       OLD.payload, OLD.payload_hash, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'property-outbox-semantic-identity-immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'publishing')
    OR
    (OLD.status = 'publishing'
      AND NEW.status IN ('publishing', 'published', 'retry_wait', 'dlq'))
    OR
    (OLD.status = 'retry_wait' AND NEW.status IN ('publishing', 'dlq'))
    OR
    (OLD.status = 'dlq' AND NEW.status = 'publishing')
  ) THEN
    RAISE EXCEPTION 'property-outbox-lifecycle-transition-invalid:%->%',
      OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.claim_epoch < OLD.claim_epoch
     OR NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'property-outbox-lifecycle-counter-regression'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'publishing' THEN
    IF OLD.status <> 'publishing' THEN
      IF NEW.claim_epoch <> OLD.claim_epoch + 1
         OR NEW.attempt_count <> OLD.attempt_count
         OR NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token THEN
        RAISE EXCEPTION 'property-outbox-claim-fence-invalid'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.claim_epoch = OLD.claim_epoch THEN
      IF NEW.claim_token IS DISTINCT FROM OLD.claim_token
         OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
         OR NEW.attempt_count <> OLD.attempt_count THEN
        RAISE EXCEPTION 'property-outbox-heartbeat-fence-invalid'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.claim_epoch <> OLD.claim_epoch + 1
          OR NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token
          OR NEW.attempt_count <> OLD.attempt_count THEN
      RAISE EXCEPTION 'property-outbox-reclaim-fence-invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'publishing' AND NEW.status = 'published' THEN
    IF NEW.claim_epoch <> OLD.claim_epoch
       OR NEW.attempt_count <> OLD.attempt_count THEN
      RAISE EXCEPTION 'property-outbox-publish-fence-invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'publishing'
        AND NEW.status IN ('retry_wait', 'dlq') THEN
    IF NEW.claim_epoch <> OLD.claim_epoch
       OR NEW.attempt_count <> OLD.attempt_count + 1 THEN
      RAISE EXCEPTION 'property-outbox-failure-attempt-invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'retry_wait' AND NEW.status = 'dlq' THEN
    IF NEW.claim_epoch <> OLD.claim_epoch THEN
      RAISE EXCEPTION 'property-outbox-dlq-fence-invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_biz_property_outbox_runtime_integrity
BEFORE UPDATE OR DELETE ON public.biz_property_outbox
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_property_outbox_runtime_integrity();

REVOKE DELETE ON public.biz_property_outbox FROM PUBLIC;

DO $schema_verification$
DECLARE
  invalid text;
  trigger_definition text;
BEGIN
  SELECT string_agg(required.name, ',' ORDER BY required.name)
    INTO invalid
  FROM (VALUES
    ('observed_cardinality', 'integer'),
    ('owning_unique_name', 'character varying(128)'),
    ('unique_key_hash', 'character(64)')
  ) AS required(name, data_type)
  LEFT JOIN pg_attribute a
    ON a.attrelid = 'public.biz_property_execution_effect_receipt'::regclass
   AND a.attname = required.name
   AND NOT a.attisdropped
  WHERE a.attname IS NULL
     OR format_type(a.atttypid, a.atttypmod) <> required.data_type
     OR a.attnotnull;

  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION 'property-effect-receipt-forward-schema-invalid:%', invalid
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('ck_biz_property_effect_receipt_unique_hash_ff'),
      ('ck_biz_property_effect_receipt_cardinality_ff'),
      ('ck_biz_property_effect_receipt_unique_name_ff')
    ) AS required(name)
    LEFT JOIN pg_constraint c
      ON c.conrelid = 'public.biz_property_execution_effect_receipt'::regclass
     AND c.conname = required.name
    WHERE c.oid IS NULL OR c.contype <> 'c' OR c.convalidated
  ) THEN
    RAISE EXCEPTION 'property-effect-receipt-forward-constraint-invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_get_triggerdef(g.oid, false)
    INTO trigger_definition
  FROM pg_trigger g
  WHERE g.tgrelid = 'public.biz_property_execution_effect_receipt'::regclass
    AND g.tgname = 'trg_biz_property_effect_receipt_proof_ff'
    AND NOT g.tgisinternal;

  IF trigger_definition IS NULL
     OR trigger_definition NOT LIKE '%DEFERRABLE INITIALLY DEFERRED%' THEN
    RAISE EXCEPTION 'property-effect-receipt-proof-trigger-invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger g
    WHERE g.tgrelid = 'public.biz_property_outbox'::regclass
      AND g.tgname = 'trg_biz_property_outbox_runtime_integrity'
      AND NOT g.tgisinternal
      AND g.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'property-outbox-runtime-integrity-trigger-invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$schema_verification$;

DO $signature_guard$
DECLARE
  unresolved text;
  object_row record;
  signature text;
  relation_name text;
  object_name text;
BEGIN
  SELECT string_agg(target.kind || E'\t' || target.name, E'\n'
                    ORDER BY target.kind COLLATE "C", target.name COLLATE "C")
    INTO unresolved
  FROM b0_catalog_target target
  LEFT JOIN b0_guard_catalog actual
    ON actual.kind = target.kind AND actual.name = target.name
  WHERE actual.name IS NULL;

  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'b0-catalog-object-missing:%', E'\n' || unresolved
      USING ERRCODE = '23514';
  END IF;

  FOR object_row IN
    SELECT kind, name, definition
    FROM b0_guard_catalog
    ORDER BY kind COLLATE "C", name COLLATE "C"
  LOOP
    signature := 'b0-catalog-v1:' ||
      encode(
        digest(convert_to(object_row.definition::text, 'UTF8'), 'sha256'),
        'hex'
      );

    IF object_row.kind = 'column' THEN
      EXECUTE format('COMMENT ON COLUMN %s IS %L', object_row.name, signature);
    ELSIF object_row.kind = 'function' THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', object_row.name, signature);
    ELSE
      relation_name := regexp_replace(object_row.name, '\.[^.]+$', '');
      object_name := regexp_replace(object_row.name, '^.*\.', '');
      IF object_row.kind = 'constraint' THEN
        EXECUTE format(
          'COMMENT ON CONSTRAINT %I ON %s IS %L',
          object_name, relation_name, signature
        );
      ELSIF object_row.kind = 'trigger' THEN
        EXECUTE format(
          'COMMENT ON TRIGGER %I ON %s IS %L',
          object_name, relation_name, signature
        );
      END IF;
    END IF;
  END LOOP;
END;
$signature_guard$;

COMMIT;
