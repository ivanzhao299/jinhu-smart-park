BEGIN;
-- Forward-only contract update. Existing source/import/correction evidence is
-- immutable. Only new v2 correction details may advance profile version once.
CREATE FUNCTION hr_personnel_correction_detail_cas_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE op public.hr_personnel_correction_operation%ROWTYPE; expected_after jsonb;
BEGIN
 IF current_database() !~ '^jinhu_hr_correction_lab_[0-9a-f]{24}$' THEN
  RAISE EXCEPTION 'PERSONNEL_CORRECTION_LAB_ONLY';
 END IF;
 SELECT * INTO STRICT op FROM public.hr_personnel_correction_operation WHERE operation_id=NEW.operation_id;
 expected_after := NEW.before_image || NEW.patch;
 IF op.receipt ? 'receiptVersion' THEN
  IF op.receipt->'receiptVersion' IS DISTINCT FROM '2'::jsonb
   OR op.receipt->>'profileVersionPolicy' IS DISTINCT FROM 'monotonic-v1'
   OR op.receipt->'changedMetadata' IS DISTINCT FROM '["version"]'::jsonb
   OR op.binding->>'profileBeforeSha256' IS NULL
   OR op.binding->>'profileBeforeSha256' !~ '^[0-9a-f]{64}$'
   OR op.receipt->>'profileBeforeSha256' IS DISTINCT FROM op.binding->>'profileBeforeSha256'
   OR jsonb_typeof(NEW.before_image->'version') IS DISTINCT FROM 'number'
   OR (NEW.before_image->>'version') !~ '^[1-9][0-9]{0,9}$'
  THEN RAISE EXCEPTION 'PERSONNEL_CORRECTION_DETAIL_INVALID'; END IF;
  -- Reserve one further increment for rollback. Never wrap or restore a version.
  IF (NEW.before_image->>'version')::bigint > 2147483645 THEN
   RAISE EXCEPTION 'PERSONNEL_CORRECTION_DETAIL_INVALID';
  END IF;
  expected_after := expected_after || jsonb_build_object('version',(NEW.before_image->>'version')::integer+1);
 END IF;
 IF op.execution_xid<>pg_current_xact_id()
  OR NEW.binding->>'profileId' IS DISTINCT FROM NEW.profile_id::text
  OR NEW.binding->>'tenantId' IS DISTINCT FROM op.binding->>'tenantId'
  OR NEW.binding->>'parkId' IS DISTINCT FROM op.binding->>'parkId'
  OR NEW.binding->>'operationId' IS DISTINCT FROM op.binding->>'sourceOperationId'
  OR NEW.binding->>'parentOperationId' IS DISTINCT FROM op.binding->>'parentOperationId'
  OR NEW.before_image->>'id' IS DISTINCT FROM NEW.profile_id::text
  OR NEW.after_image->>'id' IS DISTINCT FROM NEW.profile_id::text
  OR NEW.after_image IS DISTINCT FROM expected_after
  OR EXISTS(SELECT 1 FROM jsonb_each(NEW.patch) p WHERE jsonb_typeof(p.value)<>'string'
    OR NEW.before_image->p.key IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'PERSONNEL_CORRECTION_DETAIL_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER correction_insert ON hr_personnel_correction_detail;
CREATE TRIGGER correction_insert BEFORE INSERT ON hr_personnel_correction_detail
 FOR EACH ROW EXECUTE FUNCTION hr_personnel_correction_detail_cas_guard();
REVOKE ALL ON FUNCTION hr_personnel_correction_detail_cas_guard() FROM PUBLIC;
COMMIT;
