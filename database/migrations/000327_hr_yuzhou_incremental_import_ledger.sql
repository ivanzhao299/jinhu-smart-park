BEGIN;

CREATE TABLE hr_incremental_import_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  source_system varchar(64) NOT NULL, manifest_id varchar(128) NOT NULL, package_sha256 char(64) NOT NULL,
  package_encrypted text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'previewed', item_count integer NOT NULL, applied_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0, conflict_count integer NOT NULL DEFAULT 0, cursor_at timestamptz,
  created_by uuid, committed_by uuid, create_time timestamptz NOT NULL DEFAULT now(), committed_at timestamptz,
  CONSTRAINT uq_hr_incremental_import_operation_package UNIQUE(tenant_id,park_id,source_system,package_sha256),
  CONSTRAINT ck_hr_incremental_import_operation_status CHECK(status IN ('previewed','committing','committed','conflicted'))
);
CREATE TABLE hr_incremental_import_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  source_system varchar(64) NOT NULL, source_table varchar(128) NOT NULL, source_key varchar(256) NOT NULL,
  domain varchar(32) NOT NULL, target_table varchar(128), target_id uuid, last_row_sha256 char(64) NOT NULL,
  field_baseline jsonb NOT NULL DEFAULT '{}'::jsonb, target_baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_facts_encrypted text NOT NULL, source_facts_sha256 char(64) NOT NULL, version integer NOT NULL DEFAULT 1, target_version integer NOT NULL DEFAULT 1,
  last_operation_id uuid NOT NULL REFERENCES hr_incremental_import_operation(id), create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_incremental_import_item_source UNIQUE(tenant_id,park_id,source_system,domain,source_table,source_key),
  CONSTRAINT ck_hr_incremental_import_item_domain CHECK(domain IN ('employee','profile','contract'))
);
CREATE TABLE hr_incremental_import_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES hr_incremental_import_operation(id),
  item_id uuid NOT NULL REFERENCES hr_incremental_import_item(id), revision_no integer NOT NULL, outcome varchar(24) NOT NULL,
  source_row_sha256 char(64) NOT NULL, field_diff jsonb NOT NULL DEFAULT '[]'::jsonb, before_receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_receipt jsonb NOT NULL DEFAULT '{}'::jsonb, create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_incremental_import_revision UNIQUE(item_id,revision_no),
  CONSTRAINT ck_hr_incremental_import_revision_outcome CHECK(outcome IN ('applied','unchanged','conflict'))
);
CREATE INDEX ix_hr_incremental_import_operation_scope ON hr_incremental_import_operation(tenant_id,park_id,create_time DESC);
CREATE INDEX ix_hr_incremental_import_item_target ON hr_incremental_import_item(tenant_id,park_id,target_table,target_id);
COMMIT;
