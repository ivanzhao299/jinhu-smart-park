SET search_path = public, pg_catalog;

CREATE TEMP VIEW property_prerequisite_runtime_catalog AS
SELECT 'table'::text AS kind, n.nspname||'.'||c.relname AS name,
  jsonb_build_object(
    'persistence', c.relpersistence::text,
    'partitionKey', coalesce(pg_get_partkeydef(c.oid), ''),
    'rlsEnabled', c.relrowsecurity
  ) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('biz_property_runtime_checkpoint', 'sys_property_runtime_control')
  AND c.relkind = 'r'
UNION ALL
SELECT 'column', n.nspname||'.'||c.relname||'.'||a.attname,
  jsonb_build_object(
    'dataType', format_type(a.atttypid, a.atttypmod),
    'default', coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
    'generated', a.attgenerated::text,
    'identity', a.attidentity::text,
    'notNull', a.attnotnull,
    'ordinal', a.attnum
  )
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname IN ('biz_property_runtime_checkpoint', 'sys_property_runtime_control')
  AND a.attnum > 0
  AND NOT a.attisdropped
UNION ALL
SELECT 'constraint', n.nspname||'.'||c.relname||'.'||x.conname,
  jsonb_build_object(
    'deferrable', x.condeferrable,
    'definition', pg_get_constraintdef(x.oid, false),
    'initiallyDeferred', x.condeferred,
    'type', x.contype::text
  )
FROM pg_constraint x
JOIN pg_class c ON c.oid = x.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('biz_property_runtime_checkpoint', 'sys_property_runtime_control')
UNION ALL
SELECT 'index', ni.nspname||'.'||i.relname,
  jsonb_build_object(
    'definition', pg_get_indexdef(i.oid),
    'primary', x.indisprimary,
    'unique', x.indisunique,
    'valid', x.indisvalid
  )
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace ni ON ni.oid = i.relnamespace
JOIN pg_namespace nt ON nt.oid = t.relnamespace
WHERE nt.nspname = 'public'
  AND t.relname IN ('biz_property_runtime_checkpoint', 'sys_property_runtime_control');

DO $runtime_catalog_signature$
DECLARE
  actual_count integer;
  actual_hash text;
  object_row record;
  signature text;
  relation_name text;
  object_name text;
BEGIN
  SELECT count(*),
    encode(digest(convert_to(
      string_agg(
        kind||E'\t'||name||E'\t'||definition_hash,
        E'\n' ORDER BY kind COLLATE "C", name COLLATE "C"
      ),
      'UTF8'
    ), 'sha256'), 'hex')
  INTO actual_count, actual_hash
  FROM (
    SELECT kind, name,
      encode(digest(convert_to(definition::text, 'UTF8'), 'sha256'), 'hex')
        AS definition_hash
    FROM property_prerequisite_runtime_catalog
  ) hashed;

  IF actual_count <> 57
     OR actual_hash <> '8eac5a2f9fd0b9985623786274d28283e82f4d0409e7a350f29e33f57e1f1692' THEN
    RAISE EXCEPTION 'property-forward-declared-runtime-catalog-drift:%:%',
      actual_count, actual_hash
      USING ERRCODE = '23514';
  END IF;

  FOR object_row IN
    SELECT kind, name,
      encode(digest(convert_to(definition::text, 'UTF8'), 'sha256'), 'hex')
        AS definition_hash
    FROM property_prerequisite_runtime_catalog
    ORDER BY kind COLLATE "C", name COLLATE "C"
  LOOP
    signature := 'b0-catalog-v1:'||object_row.definition_hash;
    IF object_row.kind = 'table' THEN
      EXECUTE format('COMMENT ON TABLE %s IS %L', object_row.name, signature);
    ELSIF object_row.kind = 'column' THEN
      EXECUTE format('COMMENT ON COLUMN %s IS %L', object_row.name, signature);
    ELSIF object_row.kind = 'index' THEN
      EXECUTE format('COMMENT ON INDEX %s IS %L', object_row.name, signature);
    ELSIF object_row.kind = 'constraint' THEN
      relation_name := regexp_replace(object_row.name, '\.[^.]+$', '');
      object_name := substring(object_row.name from '[^.]+$');
      EXECUTE format(
        'COMMENT ON CONSTRAINT %I ON %s IS %L',
        object_name,
        relation_name,
        signature
      );
    END IF;
  END LOOP;
END;
$runtime_catalog_signature$;
