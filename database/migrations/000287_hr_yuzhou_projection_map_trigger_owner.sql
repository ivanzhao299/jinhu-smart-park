BEGIN;

-- A constrained historical-loader rollback runs through a SECURITY DEFINER
-- procedure. Its legacy_record_map update fires this projection integrity
-- trigger; the trigger must use the same locked-down owner context to read the
-- receipt it is validating. This grants no table privilege to the caller.
CREATE OR REPLACE FUNCTION hr_yuzhou_validate_production_projection_map_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_receipt public.hr_yuzhou_production_import_projection_receipt%ROWTYPE;
BEGIN
  FOR v_receipt IN
    SELECT * FROM public.hr_yuzhou_production_import_projection_receipt
    WHERE legacy_record_map_id=COALESCE(NEW.id,OLD.id)
  LOOP
    PERFORM public.hr_yuzhou_assert_production_projection_record(
      v_receipt.operation_id,v_receipt.phase,v_receipt.source_identity_sha256);
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END$$;

REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_projection_map_trigger() FROM PUBLIC;

COMMIT;
