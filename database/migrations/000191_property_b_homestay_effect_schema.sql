BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE
  missing_tables text;
  invalid_ledger_rows bigint;
BEGIN
  SELECT string_agg(required.name, ', ' ORDER BY required.name)
  INTO missing_tables
  FROM (VALUES
    ('biz_property_approval_request'),
    ('biz_property_operation_config'),
    ('biz_property_mode_transition_log'),
    ('biz_property_occupancy'),
    ('biz_homestay_booking'),
    ('biz_homestay_booking_action_log'),
    ('biz_homestay_ledger_entry')
  ) AS required(name)
  WHERE to_regclass('public.' || required.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION '000191 missing required tables: %', missing_tables USING ERRCODE = '55000';
  END IF;

  SELECT count(*)
  INTO invalid_ledger_rows
  FROM biz_homestay_ledger_entry ledger
  LEFT JOIN biz_homestay_booking booking
    ON booking.tenant_id = ledger.tenant_id
   AND booking.park_id = ledger.park_id
   AND booking.id = ledger.booking_id
  WHERE booking.id IS NULL
     OR booking.currency IS NULL
     OR booking.currency !~ '^[A-Z]{3}$';

  IF invalid_ledger_rows <> 0 THEN
    RAISE EXCEPTION '000191 legacy homestay ledger currency preflight failed: % rows', invalid_ledger_rows
      USING ERRCODE = '23514';
  END IF;
END
$preflight$;

ALTER TABLE biz_property_operation_config
  ADD CONSTRAINT uq_property_operation_config_scope_id
  UNIQUE (tenant_id, park_id, id);

ALTER TABLE biz_property_occupancy
  ADD CONSTRAINT uq_property_occupancy_scope_id
  UNIQUE (tenant_id, park_id, id);

ALTER TABLE biz_homestay_booking
  ADD CONSTRAINT uq_homestay_booking_scope_id
  UNIQUE (tenant_id, park_id, id),
  ADD CONSTRAINT uq_homestay_booking_scope_id_currency
  UNIQUE (tenant_id, park_id, id, currency);

ALTER TABLE biz_homestay_ledger_entry
  ADD CONSTRAINT uq_homestay_ledger_scope_id
  UNIQUE (tenant_id, park_id, id);

ALTER TABLE biz_homestay_booking_action_log
  ADD COLUMN approval_execution_key varchar(128),
  ADD COLUMN approval_effect_kind varchar(128),
  ADD COLUMN approval_effect_line_key varchar(160),
  ADD COLUMN approval_effect_hash char(64),
  ADD CONSTRAINT ck_homestay_action_approval_link_complete CHECK (
    (approval_execution_key IS NULL AND approval_effect_kind IS NULL
      AND approval_effect_line_key IS NULL AND approval_effect_hash IS NULL)
    OR
    (nullif(btrim(approval_execution_key), '') IS NOT NULL
      AND approval_effect_kind ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'
      AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
      AND approval_effect_hash ~ '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT fk_homestay_action_approval_execution
  FOREIGN KEY (tenant_id, park_id, approval_execution_key)
  REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_homestay_action_approval_line
  ON biz_homestay_booking_action_log
    (tenant_id, park_id, approval_execution_key, approval_effect_kind, approval_effect_line_key)
  WHERE approval_execution_key IS NOT NULL;

ALTER TABLE biz_property_mode_transition_log
  ADD COLUMN approval_execution_key varchar(128),
  ADD COLUMN approval_effect_kind varchar(128),
  ADD COLUMN approval_effect_line_key varchar(160),
  ADD COLUMN approval_effect_hash char(64),
  ADD COLUMN source_config_id uuid,
  ADD COLUMN source_expected_version integer,
  ADD CONSTRAINT ck_property_mode_approval_link_complete CHECK (
    (approval_execution_key IS NULL AND approval_effect_kind IS NULL
      AND approval_effect_line_key IS NULL AND approval_effect_hash IS NULL
      AND source_config_id IS NULL AND source_expected_version IS NULL)
    OR
    (nullif(btrim(approval_execution_key), '') IS NOT NULL
      AND approval_effect_kind = 'property.mode.transition'
      AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
      AND approval_effect_hash ~ '^[a-f0-9]{64}$'
      AND source_config_id IS NOT NULL AND source_expected_version > 0)
  ),
  ADD CONSTRAINT fk_property_mode_approval_execution
  FOREIGN KEY (tenant_id, park_id, approval_execution_key)
  REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_property_mode_source_config
  FOREIGN KEY (tenant_id, park_id, source_config_id)
  REFERENCES biz_property_operation_config (tenant_id, park_id, id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_property_mode_transition_approval_line
  ON biz_property_mode_transition_log
    (tenant_id, park_id, approval_execution_key, approval_effect_kind, approval_effect_line_key)
  WHERE approval_execution_key IS NOT NULL;

ALTER TABLE biz_homestay_ledger_entry
  ADD COLUMN currency varchar(8),
  ADD COLUMN source_ledger_entry_id uuid,
  ADD COLUMN approval_execution_key varchar(128),
  ADD COLUMN approval_effect_kind varchar(128),
  ADD COLUMN approval_effect_line_key varchar(160),
  ADD COLUMN approval_effect_hash char(64);

UPDATE biz_homestay_ledger_entry ledger
SET currency = booking.currency
FROM biz_homestay_booking booking
WHERE booking.tenant_id = ledger.tenant_id
  AND booking.park_id = ledger.park_id
  AND booking.id = ledger.booking_id;

ALTER TABLE biz_homestay_ledger_entry
  ALTER COLUMN currency SET NOT NULL,
  ADD CONSTRAINT ck_homestay_ledger_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_homestay_ledger_source_not_self CHECK (
    source_ledger_entry_id IS NULL OR source_ledger_entry_id <> id
  ),
  ADD CONSTRAINT ck_homestay_ledger_approval_link_complete CHECK (
    (approval_execution_key IS NULL AND approval_effect_kind IS NULL
      AND approval_effect_line_key IS NULL AND approval_effect_hash IS NULL)
    OR
    (nullif(btrim(approval_execution_key), '') IS NOT NULL
      AND approval_effect_kind IN (
        'homestay.ledger.refund', 'homestay.ledger.waiver', 'homestay.ledger.charge'
      )
      AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
      AND approval_effect_hash ~ '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT fk_homestay_ledger_booking_currency
  FOREIGN KEY (tenant_id, park_id, booking_id, currency)
  REFERENCES biz_homestay_booking (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_homestay_ledger_source
  FOREIGN KEY (tenant_id, park_id, source_ledger_entry_id)
  REFERENCES biz_homestay_ledger_entry (tenant_id, park_id, id)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_homestay_ledger_approval_execution
  FOREIGN KEY (tenant_id, park_id, approval_execution_key)
  REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_homestay_ledger_approval_line
  ON biz_homestay_ledger_entry
    (tenant_id, park_id, approval_execution_key, approval_effect_kind, approval_effect_line_key)
  WHERE approval_execution_key IS NOT NULL;

CREATE TABLE biz_homestay_legacy_finance_source_map (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  result_ledger_entry_id uuid NOT NULL,
  source_ledger_entry_id uuid NOT NULL,
  source_expected_version integer NOT NULL CHECK (source_expected_version > 0),
  currency varchar(8) NOT NULL,
  mapped_by uuid NOT NULL,
  mapped_at timestamptz NOT NULL,
  reason varchar(500) NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  evidence_hash char(64) NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_homestay_legacy_finance_source_not_self
    CHECK (result_ledger_entry_id <> source_ledger_entry_id),
  CONSTRAINT ck_homestay_legacy_finance_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT uq_homestay_legacy_finance_source_map_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_homestay_legacy_finance_source_map_result
    UNIQUE (tenant_id, park_id, result_ledger_entry_id),
  CONSTRAINT fk_homestay_legacy_finance_result
    FOREIGN KEY (tenant_id, park_id, result_ledger_entry_id)
    REFERENCES biz_homestay_ledger_entry (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_homestay_legacy_finance_source
    FOREIGN KEY (tenant_id, park_id, source_ledger_entry_id)
    REFERENCES biz_homestay_ledger_entry (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE biz_property_occupancy_release_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  occupancy_id uuid NOT NULL,
  reason varchar(500) NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  released_by uuid NOT NULL,
  released_at timestamptz NOT NULL,
  source_domain varchar(32) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id varchar(64) NOT NULL,
  from_status varchar(32) NOT NULL,
  to_status varchar(32) NOT NULL,
  source_expected_version integer NOT NULL CHECK (source_expected_version > 0),
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  approval_execution_key varchar(128) NOT NULL,
  approval_effect_kind varchar(128) NOT NULL,
  approval_effect_line_key varchar(160) NOT NULL,
  approval_effect_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_property_occupancy_release_audit_contract CHECK (
    approval_effect_kind = 'property.occupancy.force.release'
    AND nullif(btrim(approval_execution_key), '') IS NOT NULL
    AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
    AND approval_effect_hash ~ '^[a-f0-9]{64}$'
    AND from_status IN ('held', 'active')
    AND to_status = 'released'
    AND resulting_version = source_expected_version + 1
  ),
  CONSTRAINT uq_property_occupancy_release_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_property_occupancy_release_audit_approval_line
    UNIQUE (tenant_id, park_id, approval_execution_key, approval_effect_kind, approval_effect_line_key),
  CONSTRAINT fk_property_occupancy_release_audit_occupancy
    FOREIGN KEY (tenant_id, park_id, occupancy_id)
    REFERENCES biz_property_occupancy (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_property_occupancy_release_audit_approval_execution
    FOREIGN KEY (tenant_id, park_id, approval_execution_key)
    REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_property_occupancy_release_audit_occupancy_time
  ON biz_property_occupancy_release_audit
    (tenant_id, park_id, occupancy_id, released_at DESC, id DESC);

CREATE OR REPLACE FUNCTION fn_property_b_approval_link_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approval_execution_key IS NOT NULL THEN
      RAISE EXCEPTION 'approval-owned domain row is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.approval_execution_key IS NOT NULL AND (
    NEW.approval_execution_key IS DISTINCT FROM OLD.approval_execution_key
    OR NEW.approval_effect_kind IS DISTINCT FROM OLD.approval_effect_kind
    OR NEW.approval_effect_line_key IS DISTINCT FROM OLD.approval_effect_line_key
    OR NEW.approval_effect_hash IS DISTINCT FROM OLD.approval_effect_hash
  ) THEN
    RAISE EXCEPTION 'approval linkage is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_homestay_action_approval_link_immutable
BEFORE UPDATE OR DELETE ON biz_homestay_booking_action_log
FOR EACH ROW EXECUTE FUNCTION fn_property_b_approval_link_immutable();

CREATE TRIGGER trg_homestay_ledger_approval_link_immutable
BEFORE UPDATE OR DELETE ON biz_homestay_ledger_entry
FOR EACH ROW EXECUTE FUNCTION fn_property_b_approval_link_immutable();

CREATE TRIGGER trg_property_mode_approval_link_immutable
BEFORE UPDATE OR DELETE ON biz_property_mode_transition_log
FOR EACH ROW EXECUTE FUNCTION fn_property_b_approval_link_immutable();

CREATE TRIGGER trg_property_occupancy_release_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_occupancy_release_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

CREATE TRIGGER trg_homestay_legacy_finance_source_map_immutable
BEFORE UPDATE OR DELETE ON biz_homestay_legacy_finance_source_map
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

CREATE OR REPLACE FUNCTION fn_homestay_finance_source_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  result_row biz_homestay_ledger_entry%ROWTYPE;
  source_row biz_homestay_ledger_entry%ROWTYPE;
BEGIN
  SELECT * INTO STRICT result_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.result_ledger_entry_id;

  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id AND park_id = NEW.park_id AND id = NEW.source_ledger_entry_id;

  IF result_row.booking_id <> source_row.booking_id
     OR result_row.currency <> NEW.currency
     OR source_row.currency <> NEW.currency
     OR result_row.entry_type NOT IN ('refund', 'waiver')
     OR (result_row.entry_type = 'refund' AND source_row.entry_type <> 'payment')
     OR (result_row.entry_type = 'waiver' AND source_row.entry_type <> 'charge')
     OR source_row.version <> NEW.source_expected_version
     OR result_row.is_deleted OR source_row.is_deleted
     OR result_row.status <> 'confirmed' OR source_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'invalid homestay legacy finance source mapping' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_homestay_legacy_finance_source_contract
BEFORE INSERT ON biz_homestay_legacy_finance_source_map
FOR EACH ROW EXECUTE FUNCTION fn_homestay_finance_source_contract();

CREATE OR REPLACE FUNCTION fn_homestay_ledger_currency_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  booking_currency varchar(8);
BEGIN
  SELECT currency INTO STRICT booking_currency
  FROM biz_homestay_booking
  WHERE tenant_id = NEW.tenant_id
    AND park_id = NEW.park_id
    AND id = NEW.booking_id
  FOR KEY SHARE;

  IF NEW.currency IS NULL THEN
    NEW.currency := booking_currency;
  ELSIF NEW.currency <> booking_currency THEN
    RAISE EXCEPTION 'homestay ledger currency differs from booking owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_aa_homestay_ledger_currency_owner
BEFORE INSERT OR UPDATE OF booking_id, currency ON biz_homestay_ledger_entry
FOR EACH ROW EXECUTE FUNCTION fn_homestay_ledger_currency_owner();

CREATE OR REPLACE FUNCTION fn_homestay_direct_finance_source_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  source_row biz_homestay_ledger_entry%ROWTYPE;
BEGIN
  IF NEW.source_ledger_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO STRICT source_row
  FROM biz_homestay_ledger_entry
  WHERE tenant_id = NEW.tenant_id
    AND park_id = NEW.park_id
    AND id = NEW.source_ledger_entry_id
  FOR KEY SHARE;

  IF NEW.entry_type NOT IN ('refund', 'waiver')
     OR (NEW.entry_type = 'refund' AND source_row.entry_type <> 'payment')
     OR (NEW.entry_type = 'waiver' AND source_row.entry_type <> 'charge')
     OR NEW.booking_id <> source_row.booking_id
     OR NEW.currency <> source_row.currency
     OR source_row.is_deleted
     OR source_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'invalid homestay direct finance source' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_homestay_direct_finance_source_contract
BEFORE INSERT OR UPDATE OF source_ledger_entry_id, entry_type, booking_id, currency, status, is_deleted
ON biz_homestay_ledger_entry
FOR EACH ROW EXECUTE FUNCTION fn_homestay_direct_finance_source_contract();

COMMIT;
