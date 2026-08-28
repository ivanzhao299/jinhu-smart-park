BEGIN;

ALTER TABLE hr_contract
  ADD COLUMN cumulative_term_months integer,
  ADD COLUMN first_signature_date date,
  ADD COLUMN last_signature_date date,
  ADD COLUMN renewal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_contract_cumulative_months CHECK(cumulative_term_months IS NULL OR cumulative_term_months>=0),
  ADD CONSTRAINT ck_hr_contract_renewal_count CHECK(renewal_count>=0),
  ADD CONSTRAINT ck_hr_contract_signature_range CHECK(first_signature_date IS NULL OR last_signature_date IS NULL OR first_signature_date<=last_signature_date),
  ADD CONSTRAINT ck_hr_contract_legacy_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_contract_legacy_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_contract_legacy_source ON hr_contract(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

ALTER TABLE hr_contract_change
  ADD COLUMN legacy_source_identity_sha256 char(64),
  ADD COLUMN legacy_source_row_sha256 char(64),
  ADD CONSTRAINT ck_hr_contract_change_legacy_identity CHECK(legacy_source_identity_sha256 IS NULL OR legacy_source_identity_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_hr_contract_change_legacy_row CHECK(legacy_source_row_sha256 IS NULL OR legacy_source_row_sha256~'^[0-9a-f]{64}$');
CREATE UNIQUE INDEX uq_hr_contract_change_legacy_source ON hr_contract_change(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false;

CREATE TABLE hr_contract_legacy_evidence(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES hr_contract(id),evidence_kind varchar(32) NOT NULL,
  content_sha256 char(64) NOT NULL,mime_type varchar(160),size_bytes bigint,missing_reason varchar(64),
  source_identity_sha256 char(64) NOT NULL,create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_contract_evidence_kind CHECK(evidence_kind IN('controlled_text','file_manifest')),
  CONSTRAINT ck_hr_contract_evidence_hash CHECK(content_sha256~'^[0-9a-f]{64}$' AND source_identity_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_contract_evidence_size CHECK(size_bytes IS NULL OR size_bytes>=0),
  CONSTRAINT ck_hr_contract_evidence_missing CHECK(missing_reason IS NULL OR missing_reason IN('SOURCE_FILE_MISSING','SOURCE_FILE_UNREADABLE','SOURCE_FILE_NOT_EXTRACTED')),
  CONSTRAINT uq_hr_contract_evidence UNIQUE(tenant_id,park_id,source_identity_sha256)
);

CREATE TABLE hr_contract_reminder_policy(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  reminder_kind varchar(32) NOT NULL,window_days integer NOT NULL,recipient_scope varchar(32) NOT NULL,rule_version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,create_by uuid,update_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_contract_reminder_kind CHECK(reminder_kind IN('contract_expiry','probation_expiry')),
  CONSTRAINT ck_hr_contract_reminder_window CHECK(window_days BETWEEN 1 AND 365),
  CONSTRAINT ck_hr_contract_reminder_recipient CHECK(recipient_scope IN('hr','manager','employee')),
  CONSTRAINT uq_hr_contract_reminder_policy UNIQUE(tenant_id,park_id,reminder_kind,window_days,recipient_scope)
);

CREATE TABLE hr_contract_reminder(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES hr_contract(id),employee_id uuid NOT NULL REFERENCES hr_employee(id),
  policy_id uuid NOT NULL REFERENCES hr_contract_reminder_policy(id),rule_version integer NOT NULL,reminder_kind varchar(32) NOT NULL,
  window_days integer NOT NULL,window_date date NOT NULL,due_date date NOT NULL,recipient_scope varchar(32) NOT NULL,recipient_user_id uuid NOT NULL,
  source_date date NOT NULL,source_contract_version integer NOT NULL,dedupe_key char(64) NOT NULL,status varchar(32) NOT NULL DEFAULT 'open',
  read_at timestamptz,read_by uuid,acknowledged_at timestamptz,acknowledged_by uuid,resolved_at timestamptz,resolved_by uuid,cancelled_at timestamptz,cancelled_by uuid,cancel_reason varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_contract_reminder_status CHECK(status IN('open','read','acknowledged','resolved','cancelled')),
  CONSTRAINT ck_hr_contract_reminder_dedupe CHECK(dedupe_key~'^[0-9a-f]{64}$'),
  CONSTRAINT uq_hr_contract_reminder_window UNIQUE(tenant_id,park_id,dedupe_key),
  CONSTRAINT uq_hr_contract_reminder_recipient UNIQUE(tenant_id,park_id,contract_id,reminder_kind,window_date,rule_version,recipient_user_id)
);
CREATE INDEX ix_hr_contract_reminder_due ON hr_contract_reminder(tenant_id,park_id,status,due_date);

CREATE TABLE hr_contract_reminder_action(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  reminder_id uuid NOT NULL REFERENCES hr_contract_reminder(id),sequence_no integer NOT NULL,action varchar(32) NOT NULL,
  actor_user_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),comment_digest char(64),
  CONSTRAINT ck_hr_contract_reminder_action CHECK(action IN('read','acknowledge','resolve','cancel')),
  CONSTRAINT uq_hr_contract_reminder_action UNIQUE(tenant_id,park_id,reminder_id,sequence_no)
);

CREATE TABLE hr_contract_reminder_outbox(
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
  reminder_id uuid NOT NULL REFERENCES hr_contract_reminder(id),recipient_user_id uuid NOT NULL,
  event_kind varchar(32) NOT NULL DEFAULT 'contract_reminder_created',dedupe_key char(64) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',attempt_count integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,last_error_code varchar(64),create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_contract_reminder_outbox_status CHECK(status IN('pending','delivered','failed','cancelled')),
  CONSTRAINT ck_hr_contract_reminder_outbox_dedupe CHECK(dedupe_key~'^[0-9a-f]{64}$'),
  CONSTRAINT uq_hr_contract_reminder_outbox UNIQUE(tenant_id,park_id,dedupe_key)
);

COMMIT;
