CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS sys_data_scope_rule (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  rule_code varchar(128) NOT NULL,
  rule_name varchar(100) NOT NULL,
  dimension varchar(64) NOT NULL,
  scope_type varchar(64) NOT NULL,
  scope_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

ALTER TABLE sys_data_scope_rule
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS park_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS rule_code varchar(128) NOT NULL,
  ADD COLUMN IF NOT EXISTS rule_name varchar(100) NOT NULL,
  ADD COLUMN IF NOT EXISTS dimension varchar(64) NOT NULL,
  ADD COLUMN IF NOT EXISTS scope_type varchar(64) NOT NULL,
  ADD COLUMN IF NOT EXISTS scope_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

CREATE TABLE IF NOT EXISTS rel_role_data_scope (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES sys_role(id),
  rule_id uuid NOT NULL REFERENCES sys_data_scope_rule(id),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

ALTER TABLE rel_role_data_scope
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS park_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS role_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS rule_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS create_by uuid,
  ADD COLUMN IF NOT EXISTS create_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS update_by uuid,
  ADD COLUMN IF NOT EXISTS update_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remark varchar(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_data_scope_rule_dimension'
      AND conrelid = 'sys_data_scope_rule'::regclass
  ) THEN
    ALTER TABLE sys_data_scope_rule
      ADD CONSTRAINT ck_sys_data_scope_rule_dimension CHECK (
        dimension IN (
          'tenant',
          'park',
          'org',
          'building',
          'floor',
          'unit',
          'tenant_company',
          'customer_owner',
          'contract_owner',
          'workorder_handler'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_data_scope_rule_scope_type'
      AND conrelid = 'sys_data_scope_rule'::regclass
  ) THEN
    ALTER TABLE sys_data_scope_rule
      ADD CONSTRAINT ck_sys_data_scope_rule_scope_type CHECK (
        scope_type IN ('all', 'tenant', 'park', 'org', 'org_and_children', 'self', 'assigned', 'custom')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_data_scope_rule_config_object'
      AND conrelid = 'sys_data_scope_rule'::regclass
  ) THEN
    ALTER TABLE sys_data_scope_rule
      ADD CONSTRAINT ck_sys_data_scope_rule_config_object CHECK (jsonb_typeof(scope_config) = 'object');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_data_scope_rule_tenant_code_active
  ON sys_data_scope_rule (tenant_id, rule_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_data_scope_rule_tenant_deleted
  ON sys_data_scope_rule (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_data_scope_rule_scope_deleted
  ON sys_data_scope_rule (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_data_scope_rule_dimension
  ON sys_data_scope_rule (tenant_id, dimension, scope_type, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_role_data_scope_active
  ON rel_role_data_scope (tenant_id, role_id, rule_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_role_data_scope_role
  ON rel_role_data_scope (tenant_id, role_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_role_data_scope_rule
  ON rel_role_data_scope (tenant_id, rule_id, is_deleted);
