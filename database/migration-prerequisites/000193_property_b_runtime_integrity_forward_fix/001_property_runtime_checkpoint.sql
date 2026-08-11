SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS biz_property_runtime_checkpoint (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  checkpoint_kind varchar(64) NOT NULL,
  checkpoint_key varchar(256) NOT NULL,
  checkpoint_version integer NOT NULL DEFAULT 1,
  cursor_value varchar(512),
  anomaly_count bigint NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'disabled',
  evidence_hash char(64),
  last_run_id uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_biz_property_runtime_checkpoint_kind
    CHECK (checkpoint_kind IN (
      'backfill', 'change_capture', 'mutation_replay', 'shadow_compare',
      'reconcile', 'constraint_validate'
    )),
  CONSTRAINT ck_biz_property_runtime_checkpoint_status
    CHECK (status IN ('disabled', 'running', 'paused', 'completed', 'failed')),
  CONSTRAINT ck_biz_property_runtime_checkpoint_counts
    CHECK (checkpoint_version > 0 AND anomaly_count >= 0 AND version > 0),
  CONSTRAINT ck_biz_property_runtime_checkpoint_evidence
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_biz_property_runtime_checkpoint_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_runtime_checkpoint_key
    UNIQUE (tenant_id, park_id, checkpoint_kind, checkpoint_key)
);
CREATE INDEX IF NOT EXISTS idx_biz_property_runtime_checkpoint_run
  ON biz_property_runtime_checkpoint
    (tenant_id, park_id, status, checkpoint_kind, updated_at, id);
