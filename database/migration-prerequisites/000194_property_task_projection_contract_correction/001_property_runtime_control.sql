SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS sys_property_runtime_control (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  control_key varchar(128) NOT NULL,
  control_kind varchar(32) NOT NULL,
  target varchar(64) NOT NULL,
  adapter_version integer,
  contract_hash char(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  control_mode varchar(16) NOT NULL DEFAULT 'disabled',
  enabled_by uuid,
  enabled_at timestamptz,
  approval_reference varchar(256),
  disabled_reason varchar(500) NOT NULL DEFAULT 'expand-only',
  create_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_sys_property_runtime_control_kind
    CHECK (control_kind IN (
      'compatibility_read', 'compatibility_write', 'change_capture',
      'mutation_replay', 'shadow_compare', 'enforce'
    )),
  CONSTRAINT ck_sys_property_runtime_control_target
    CHECK (target IN (
      'identity', 'approval', 'event_notification', 'task',
      'property_foundation', 'homestay', 'housing'
    )),
  CONSTRAINT ck_sys_property_runtime_control_mode
    CHECK (control_mode IN ('disabled', 'observe', 'shadow', 'enforce')),
  CONSTRAINT ck_sys_property_runtime_control_hash
    CHECK (contract_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sys_property_runtime_control_version
    CHECK (version > 0 AND (adapter_version IS NULL OR adapter_version > 0)),
  CONSTRAINT ck_sys_property_runtime_control_disabled
    CHECK (
      (enabled = false AND control_mode = 'disabled'
       AND enabled_by IS NULL AND enabled_at IS NULL)
      OR
      (enabled = true AND control_mode <> 'disabled'
       AND enabled_by IS NOT NULL AND enabled_at IS NOT NULL
       AND approval_reference IS NOT NULL)
    ),
  CONSTRAINT uq_sys_property_runtime_control_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_sys_property_runtime_control_key
    UNIQUE (tenant_id, park_id, control_key)
);
CREATE INDEX IF NOT EXISTS idx_sys_property_runtime_control_effective
  ON sys_property_runtime_control
    (tenant_id, park_id, target, control_kind, enabled, control_mode);
