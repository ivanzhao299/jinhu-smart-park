BEGIN;
-- Empty structures only. No target registration, grants, source edits or business backfill.
CREATE TABLE hr_personnel_correction_lab (
 lab_id uuid PRIMARY KEY,
 database_name text NOT NULL UNIQUE CHECK (database_name ~ '^jinhu_hr_correction_lab_[0-9a-f]{24}$'),
 database_user text NOT NULL,
 authority_key_sha256 char(64) NOT NULL CHECK (authority_key_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE hr_personnel_correction_operation (
 operation_id uuid PRIMARY KEY,
 lab_id uuid NOT NULL REFERENCES hr_personnel_correction_lab(lab_id),
 idempotency_key uuid NOT NULL UNIQUE,
 binding_sha256 char(64) NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
 binding jsonb NOT NULL CHECK (jsonb_typeof(binding)='object'),
 actor_sha256 char(64) NOT NULL CHECK (actor_sha256 ~ '^[0-9a-f]{64}$'),
 receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
 execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_personnel_correction_operation_lab ON hr_personnel_correction_operation(lab_id);
CREATE TABLE hr_personnel_correction_detail (
 operation_id uuid NOT NULL REFERENCES hr_personnel_correction_operation(operation_id),
 profile_id uuid NOT NULL,
 binding jsonb NOT NULL CHECK (jsonb_typeof(binding)='object'),
 patch jsonb NOT NULL CHECK (jsonb_typeof(patch)='object' AND patch<>'{}'::jsonb
  AND patch - 'native_place' - 'degree'='{}'::jsonb),
 before_image jsonb NOT NULL CHECK (jsonb_typeof(before_image)='object'),
 after_image jsonb NOT NULL CHECK (jsonb_typeof(after_image)='object'),
 after_xmin text NOT NULL,
 PRIMARY KEY(operation_id,profile_id)
);
CREATE TABLE hr_personnel_correction_rollback (
 operation_id uuid PRIMARY KEY REFERENCES hr_personnel_correction_operation(operation_id),
 binding_sha256 char(64) NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
 actor_sha256 char(64) NOT NULL CHECK (actor_sha256 ~ '^[0-9a-f]{64}$'),
 receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
 execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE hr_personnel_correction_authorization_use (
 nonce uuid PRIMARY KEY,
 authorization_sha256 char(64) NOT NULL UNIQUE CHECK (authorization_sha256 ~ '^[0-9a-f]{64}$'),
 operation_id uuid NOT NULL REFERENCES hr_personnel_correction_operation(operation_id),
 action text NOT NULL CHECK (action IN ('apply','rollback')),
 execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,action)
);
-- Closed lab inserts only; success evidence cannot acquire new detail rows later.
CREATE FUNCTION hr_personnel_correction_insert_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public.hr_personnel_correction_operation%ROWTYPE;
BEGIN
 IF current_database() !~ '^jinhu_hr_correction_lab_[0-9a-f]{24}$' THEN
  RAISE EXCEPTION 'PERSONNEL_CORRECTION_LAB_ONLY';
 END IF;
 IF TG_TABLE_NAME='hr_personnel_correction_lab' THEN
  IF NEW.database_name<>current_database() OR NEW.database_user<>current_user THEN
   RAISE EXCEPTION 'PERSONNEL_CORRECTION_LAB_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='hr_personnel_correction_operation' THEN
  IF NOT EXISTS(SELECT 1 FROM public.hr_personnel_correction_lab l WHERE l.lab_id=NEW.lab_id
   AND l.database_name=current_database() AND l.database_user=current_user)
   OR NEW.execution_xid<>pg_current_xact_id()
   OR NEW.binding->>'operationId' IS DISTINCT FROM NEW.operation_id::text
   OR NEW.binding->>'idempotencyKey' IS DISTINCT FROM NEW.idempotency_key::text
  THEN RAISE EXCEPTION 'PERSONNEL_CORRECTION_OPERATION_INVALID'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT op FROM public.hr_personnel_correction_operation WHERE operation_id=NEW.operation_id;
 IF TG_TABLE_NAME='hr_personnel_correction_detail' THEN
  IF op.execution_xid<>pg_current_xact_id()
   OR NEW.binding->>'profileId' IS DISTINCT FROM NEW.profile_id::text
   OR NEW.binding->>'tenantId' IS DISTINCT FROM op.binding->>'tenantId'
   OR NEW.binding->>'parkId' IS DISTINCT FROM op.binding->>'parkId'
   OR NEW.binding->>'operationId' IS DISTINCT FROM op.binding->>'sourceOperationId'
   OR NEW.binding->>'parentOperationId' IS DISTINCT FROM op.binding->>'parentOperationId'
   OR NEW.before_image->>'id' IS DISTINCT FROM NEW.profile_id::text
   OR NEW.after_image->>'id' IS DISTINCT FROM NEW.profile_id::text
   OR NEW.after_image IS DISTINCT FROM NEW.before_image || NEW.patch
   OR EXISTS(SELECT 1 FROM jsonb_each(NEW.patch) p WHERE jsonb_typeof(p.value)<>'string'
     OR NEW.before_image->p.key IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'PERSONNEL_CORRECTION_DETAIL_INVALID'; END IF;
 ELSIF TG_TABLE_NAME='hr_personnel_correction_rollback' THEN
  IF op.execution_xid=pg_current_xact_id() OR NEW.execution_xid<>pg_current_xact_id()
   OR NEW.binding_sha256<>op.binding_sha256 THEN
   RAISE EXCEPTION 'PERSONNEL_CORRECTION_ROLLBACK_INVALID';
  END IF;
 ELSIF TG_TABLE_NAME='hr_personnel_correction_authorization_use' THEN
  IF NEW.execution_xid<>pg_current_xact_id()
   OR (NEW.action='apply' AND op.execution_xid<>pg_current_xact_id())
   OR (NEW.action='rollback' AND NOT EXISTS(SELECT 1 FROM public.hr_personnel_correction_rollback r
     WHERE r.operation_id=NEW.operation_id AND r.execution_xid=pg_current_xact_id()))
  THEN RAISE EXCEPTION 'PERSONNEL_CORRECTION_AUTHORIZATION_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION hr_personnel_correction_commit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected integer; actual integer; intent text;
BEGIN
 intent := CASE WHEN TG_TABLE_NAME='hr_personnel_correction_operation' THEN 'apply' ELSE 'rollback' END;
 SELECT (o.binding->'seal'->>'plannedProfiles')::integer INTO STRICT expected
  FROM public.hr_personnel_correction_operation o WHERE o.operation_id=NEW.operation_id;
 SELECT count(*) INTO actual FROM public.hr_personnel_correction_detail WHERE operation_id=NEW.operation_id;
 IF expected IS NULL OR expected<1 OR actual<>expected OR NOT EXISTS(
  SELECT 1 FROM public.hr_personnel_correction_authorization_use u WHERE u.operation_id=NEW.operation_id
   AND u.action=intent AND u.execution_xid=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'PERSONNEL_CORRECTION_ATOMIC_RECEIPT_REQUIRED';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER correction_apply_commit AFTER INSERT ON hr_personnel_correction_operation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_personnel_correction_commit_guard();
CREATE CONSTRAINT TRIGGER correction_rollback_commit AFTER INSERT ON hr_personnel_correction_rollback
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_personnel_correction_commit_guard();
CREATE FUNCTION hr_personnel_correction_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'PERSONNEL_CORRECTION_LEDGER_IMMUTABLE';
END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['hr_personnel_correction_lab','hr_personnel_correction_operation',
  'hr_personnel_correction_detail','hr_personnel_correction_rollback','hr_personnel_correction_authorization_use'] LOOP
  EXECUTE format('CREATE TRIGGER correction_insert BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION hr_personnel_correction_insert_guard()',t);
  EXECUTE format('CREATE TRIGGER correction_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION hr_personnel_correction_immutable()',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION hr_personnel_correction_insert_guard(),hr_personnel_correction_commit_guard(),hr_personnel_correction_immutable() FROM PUBLIC;
COMMIT;
