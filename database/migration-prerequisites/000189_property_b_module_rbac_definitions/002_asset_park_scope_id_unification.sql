-- Restore the scope-column type contract established by migration 000029 before
-- the immutable 000189 migration evaluates asset_park. Deliberately baselined
-- legacy databases may have migration history without the historical UUID to
-- varchar conversion having run.

BEGIN;
SET LOCAL search_path = public, pg_catalog;

DO $$
DECLARE
  tenant_type text;
  park_type text;
BEGIN
  SELECT scope_column.udt_name
  INTO tenant_type
  FROM information_schema.columns scope_column
  WHERE scope_column.table_schema = 'public'
    AND scope_column.table_name = 'asset_park'
    AND scope_column.column_name = 'tenant_id';

  SELECT scope_column.udt_name
  INTO park_type
  FROM information_schema.columns scope_column
  WHERE scope_column.table_schema = 'public'
    AND scope_column.table_name = 'asset_park'
    AND scope_column.column_name = 'park_id';

  IF tenant_type IS NULL OR park_type IS NULL THEN
    RAISE EXCEPTION 'asset-park-scope-id-unification-columns-missing'
      USING ERRCODE = '42703';
  END IF;

  IF tenant_type NOT IN ('uuid', 'varchar') OR park_type NOT IN ('uuid', 'varchar') THEN
    RAISE EXCEPTION
      'asset-park-scope-id-unification-unsupported-types: tenant_id=%, park_id=%',
      tenant_type,
      park_type
      USING ERRCODE = '42804';
  END IF;

  IF tenant_type = 'uuid' THEN
    ALTER TABLE public.asset_park
      ALTER COLUMN tenant_id TYPE varchar(64) USING tenant_id::text;
  END IF;

  IF park_type = 'uuid' THEN
    ALTER TABLE public.asset_park
      ALTER COLUMN park_id TYPE varchar(64) USING park_id::text;
  END IF;
END;
$$;

-- Match the canonical sentinel rewrite performed by migration 000029. No other
-- legacy value is guessed or rewritten.
UPDATE public.asset_park
SET tenant_id = '10000001',
    update_time = now()
WHERE tenant_id = '00000000-0000-4000-8000-000000000001';

UPDATE public.asset_park
SET park_id = '20000001',
    update_time = now()
WHERE park_id = '00000000-0000-4000-8000-000000000101';

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM information_schema.columns scope_column
  WHERE scope_column.table_schema = 'public'
    AND scope_column.table_name = 'asset_park'
    AND scope_column.column_name IN ('tenant_id', 'park_id')
    AND (
      scope_column.udt_name <> 'varchar'
      OR scope_column.character_maximum_length IS DISTINCT FROM 64
    );

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'asset-park-scope-id-unification-postcondition-failed'
      USING ERRCODE = '42804';
  END IF;
END;
$$;

COMMIT;
