BEGIN;

-- Preserve every non-binary source field on the privileged detail surface.
-- List responses remain summary-only in the API so a wide legacy row never
-- turns a normal paginated list into an unbounded payload.
CREATE OR REPLACE FUNCTION hr_legacy_archive_redact_source_fields(p_payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(jsonb_object_agg(item.key,item.value),'{}'::jsonb)
  FROM jsonb_each(COALESCE(p_payload,'{}'::jsonb)) item
  WHERE lower(item.key) NOT IN('password','passwd','pwd','photo','cont','content','blob','binary')
$$;

CREATE OR REPLACE FUNCTION hr_legacy_archive_source_field_projection()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_payload jsonb;
BEGIN
  SELECT source.record_payload INTO source_payload
  FROM hr_legacy_identity_registry registry
  JOIN hr_legacy_archive_materialization_batch materialization
    ON materialization.id=registry.materialization_batch_id
   AND materialization.tenant_id=registry.tenant_id
   AND materialization.park_id=registry.park_id
  JOIN hr_legacy_t5_record source
    ON source.import_batch_id=materialization.source_t5_import_batch_id
   AND source.tenant_id=registry.tenant_id
   AND source.park_id=registry.park_id
   AND source.source_table=registry.source_table
   AND source.source_identity_sha256=registry.source_identity_sha256
  WHERE registry.id=NEW.identity_registry_id
    AND registry.tenant_id=NEW.tenant_id
    AND registry.park_id=NEW.park_id
    AND registry.identity_kind='archive_record';

  IF source_payload IS NOT NULL THEN
    -- The source extractor already excludes credentials and binary photo/file
    -- bodies. Keep that boundary explicit here as a second line of defence.
    source_payload := hr_legacy_archive_redact_source_fields(source_payload);
    NEW.restricted_safe_projection := NEW.restricted_safe_projection
      || jsonb_build_object('legacyFields',source_payload);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_legacy_archive_source_field_projection ON hr_legacy_archive_record;
CREATE TRIGGER trg_hr_legacy_archive_source_field_projection
BEFORE INSERT ON hr_legacy_archive_record
FOR EACH ROW EXECUTE FUNCTION hr_legacy_archive_source_field_projection();

COMMENT ON FUNCTION hr_legacy_archive_source_field_projection() IS
  'Adds complete non-binary legacy source fields to the permission-gated detail projection.';
COMMENT ON FUNCTION hr_legacy_archive_redact_source_fields(jsonb) IS
  'Removes credential and binary source keys case-insensitively before an authorized legacy projection is built.';

COMMIT;
