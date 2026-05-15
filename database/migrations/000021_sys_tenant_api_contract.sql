DO $$
DECLARE
  current_status_type text;
BEGIN
  SELECT data_type
    INTO current_status_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'sys_tenant'
     AND column_name = 'status';

  ALTER TABLE sys_tenant
    ALTER COLUMN status DROP DEFAULT;

  IF current_status_type <> 'integer' THEN
    ALTER TABLE sys_tenant
      ALTER COLUMN status TYPE integer
      USING CASE
        WHEN status::text IN ('1', 'enabled') THEN 1
        WHEN status::text IN ('2', 'expired') THEN 2
        ELSE 0
      END;
  END IF;

  ALTER TABLE sys_tenant
    ALTER COLUMN status SET DEFAULT 1;

  ALTER TABLE sys_tenant
    ALTER COLUMN status SET NOT NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_tenant_code_contract_active
  ON sys_tenant (tenant_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_tenant_status_contract
  ON sys_tenant (status, is_deleted);
