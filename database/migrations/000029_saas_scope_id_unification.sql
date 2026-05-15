-- S1-RBAC-STD-FIX: unify SaaS isolation IDs.
-- tenant_id and park_id are SaaS/business scope identifiers, not entity UUIDs.
-- Default Jinhu scope:
--   tenant_id = 10000001
--   park_id   = 20000001

DROP VIEW IF EXISTS sys_dict;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('tenant_id', 'park_id')
      AND udt_name = 'uuid'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE varchar(64) USING %I::text',
      rec.table_schema,
      rec.table_name,
      rec.column_name,
      rec.column_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET tenant_id = %L WHERE tenant_id = %L',
      rec.table_schema,
      rec.table_name,
      '10000001',
      '00000000-0000-4000-8000-000000000001'
    );
  END LOOP;

  FOR rec IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'park_id'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET park_id = %L WHERE park_id = %L',
      rec.table_schema,
      rec.table_name,
      '20000001',
      '00000000-0000-4000-8000-000000000101'
    );
  END LOOP;
END $$;

UPDATE sys_tenant
SET park_id = '0',
    tenant_code = 'JH_DEFAULT',
    tenant_name = '金湖科创产业园默认租户',
    tenant_type = 'park_operator',
    status = 1,
    plan_code = 'GROUP',
    update_time = now()
WHERE tenant_id = '10000001'
  AND is_deleted = false;

CREATE OR REPLACE VIEW sys_dict AS
SELECT
  id,
  tenant_id,
  park_id,
  dict_code,
  dict_name,
  status,
  create_by,
  create_time,
  update_by,
  update_time,
  is_deleted,
  version,
  remark
FROM sys_dict_type;
