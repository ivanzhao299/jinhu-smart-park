BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE
  missing_tables text;
  invalid_rows bigint;
BEGIN
  SELECT string_agg(required.name, ', ' ORDER BY required.name)
  INTO missing_tables
  FROM (VALUES
    ('biz_property_approval_request'),
    ('biz_property_occupancy'),
    ('biz_housing_lease'),
    ('biz_housing_charge_plan'),
    ('biz_housing_receivable'),
    ('biz_housing_ledger_entry'),
    ('biz_housing_handover'),
    ('biz_housing_purchase'),
    ('biz_housing_purchase_item')
  ) AS required(name)
  WHERE to_regclass('public.' || required.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION '000192 missing required tables: %', missing_tables USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM (
    SELECT charge_plan.id
    FROM biz_housing_charge_plan charge_plan
    LEFT JOIN biz_housing_lease lease
      ON lease.tenant_id = charge_plan.tenant_id
     AND lease.park_id = charge_plan.park_id
     AND lease.id = charge_plan.lease_id
    WHERE lease.id IS NULL
    UNION ALL
    SELECT receivable.id
    FROM biz_housing_receivable receivable
    LEFT JOIN biz_housing_lease lease
      ON lease.tenant_id = receivable.tenant_id
     AND lease.park_id = receivable.park_id
     AND lease.id = receivable.lease_id
    WHERE lease.id IS NULL
    UNION ALL
    SELECT ledger.id
    FROM biz_housing_ledger_entry ledger
    LEFT JOIN biz_housing_lease lease
      ON lease.tenant_id = ledger.tenant_id
     AND lease.park_id = ledger.park_id
     AND lease.id = ledger.lease_id
    LEFT JOIN biz_housing_receivable receivable
      ON receivable.tenant_id = ledger.tenant_id
     AND receivable.park_id = ledger.park_id
     AND receivable.id = ledger.receivable_id
    WHERE lease.id IS NULL OR (ledger.receivable_id IS NOT NULL AND receivable.id IS NULL)
    UNION ALL
    SELECT handover.id
    FROM biz_housing_handover handover
    LEFT JOIN biz_housing_lease lease
      ON lease.tenant_id = handover.tenant_id
     AND lease.park_id = handover.park_id
     AND lease.id = handover.lease_id
    WHERE lease.id IS NULL
    UNION ALL
    SELECT item.id
    FROM biz_housing_purchase_item item
    LEFT JOIN biz_housing_purchase purchase
      ON purchase.tenant_id = item.tenant_id
     AND purchase.park_id = item.park_id
     AND purchase.id = item.purchase_id
    LEFT JOIN biz_housing_receivable receivable
      ON receivable.tenant_id = item.tenant_id
     AND receivable.park_id = item.park_id
     AND receivable.id = item.transferred_receivable_id
    WHERE purchase.id IS NULL
       OR (item.transferred_receivable_id IS NOT NULL AND receivable.id IS NULL)
  ) incompatible;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000192 legacy housing scope/owner preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM biz_housing_purchase
  WHERE NOT (
    (approval_status = 'draft' AND payment_status = 'unpaid')
    OR (approval_status = 'approved' AND payment_status IN ('unpaid', 'paid', 'refunded'))
    OR (approval_status = 'rejected' AND payment_status = 'unpaid')
    OR (approval_status = 'void' AND payment_status = 'unpaid')
  );

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION '000192 legacy purchase lifecycle preflight failed: % rows', invalid_rows
      USING ERRCODE = '23514';
  END IF;
END
$preflight$;

ALTER TABLE biz_housing_lease ADD COLUMN currency varchar(8);
ALTER TABLE biz_housing_purchase ADD COLUMN currency varchar(8);
ALTER TABLE biz_housing_charge_plan ADD COLUMN currency varchar(8);
ALTER TABLE biz_housing_receivable ADD COLUMN currency varchar(8);
ALTER TABLE biz_housing_ledger_entry ADD COLUMN currency varchar(8);
ALTER TABLE biz_housing_handover ADD COLUMN currency varchar(8);

UPDATE biz_housing_lease SET currency = 'CNY';
UPDATE biz_housing_purchase SET currency = 'CNY';
UPDATE biz_housing_charge_plan SET currency = 'CNY';
UPDATE biz_housing_receivable SET currency = 'CNY';
UPDATE biz_housing_ledger_entry SET currency = 'CNY';
UPDATE biz_housing_handover SET currency = 'CNY';

ALTER TABLE biz_housing_lease
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD CONSTRAINT ck_housing_lease_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT uq_housing_lease_scope_id UNIQUE (tenant_id, park_id, id),
  ADD CONSTRAINT uq_housing_lease_scope_id_currency UNIQUE (tenant_id, park_id, id, currency);

ALTER TABLE biz_housing_purchase
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD CONSTRAINT ck_housing_purchase_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_housing_purchase_terminal_pair CHECK (
    (approval_status = 'draft' AND payment_status = 'unpaid')
    OR (approval_status = 'approved' AND payment_status IN ('unpaid', 'paid', 'refunded'))
    OR (approval_status = 'rejected' AND payment_status = 'unpaid')
    OR (approval_status = 'void' AND payment_status = 'unpaid')
  ),
  ADD CONSTRAINT uq_housing_purchase_scope_id UNIQUE (tenant_id, park_id, id),
  ADD CONSTRAINT uq_housing_purchase_scope_id_currency UNIQUE (tenant_id, park_id, id, currency);

ALTER TABLE biz_housing_charge_plan
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD CONSTRAINT ck_housing_charge_plan_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT uq_housing_charge_plan_scope_id_currency UNIQUE (tenant_id, park_id, id, currency),
  ADD CONSTRAINT fk_housing_charge_plan_lease_currency
  FOREIGN KEY (tenant_id, park_id, lease_id, currency)
  REFERENCES biz_housing_lease (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE biz_housing_receivable
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD CONSTRAINT ck_housing_receivable_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT uq_housing_receivable_scope_id_currency UNIQUE (tenant_id, park_id, id, currency),
  ADD CONSTRAINT fk_housing_receivable_lease_currency
  FOREIGN KEY (tenant_id, park_id, lease_id, currency)
  REFERENCES biz_housing_lease (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE biz_housing_ledger_entry
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD COLUMN approval_execution_key varchar(128),
  ADD COLUMN approval_effect_kind varchar(128),
  ADD COLUMN approval_effect_line_key varchar(160),
  ADD COLUMN approval_effect_hash char(64),
  ADD CONSTRAINT ck_housing_ledger_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_housing_ledger_approval_link_complete CHECK (
    (approval_execution_key IS NULL AND approval_effect_kind IS NULL
      AND approval_effect_line_key IS NULL AND approval_effect_hash IS NULL)
    OR
    (nullif(btrim(approval_execution_key), '') IS NOT NULL
      AND approval_effect_kind IN (
        'housing.ledger.refund', 'housing.ledger.waiver',
        'housing.ledger.deposit.refund', 'housing.ledger.deduction'
      )
      AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
      AND approval_effect_hash ~ '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT fk_housing_ledger_lease_currency
  FOREIGN KEY (tenant_id, park_id, lease_id, currency)
  REFERENCES biz_housing_lease (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_housing_ledger_receivable_currency
  FOREIGN KEY (tenant_id, park_id, receivable_id, currency)
  REFERENCES biz_housing_receivable (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_housing_ledger_approval_execution
  FOREIGN KEY (tenant_id, park_id, approval_execution_key)
  REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_housing_ledger_approval_line
  ON biz_housing_ledger_entry
    (tenant_id, park_id, approval_execution_key, approval_effect_kind, approval_effect_line_key)
  WHERE approval_execution_key IS NOT NULL;

ALTER TABLE biz_housing_handover
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'CNY',
  ADD COLUMN approval_execution_key varchar(128),
  ADD COLUMN approval_effect_kind varchar(128),
  ADD COLUMN approval_effect_line_key varchar(160),
  ADD COLUMN approval_effect_hash char(64),
  ADD CONSTRAINT ck_housing_handover_currency CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ck_housing_handover_approval_link_complete CHECK (
    (approval_execution_key IS NULL AND approval_effect_kind IS NULL
      AND approval_effect_line_key IS NULL AND approval_effect_hash IS NULL)
    OR
    (nullif(btrim(approval_execution_key), '') IS NOT NULL
      AND approval_effect_kind = 'housing.handover.complete.financial'
      AND nullif(btrim(approval_effect_line_key), '') IS NOT NULL
      AND approval_effect_hash ~ '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT uq_housing_handover_scope_id UNIQUE (tenant_id, park_id, id),
  ADD CONSTRAINT uq_housing_handover_scope_id_currency UNIQUE (tenant_id, park_id, id, currency),
  ADD CONSTRAINT fk_housing_handover_lease_currency
  FOREIGN KEY (tenant_id, park_id, lease_id, currency)
  REFERENCES biz_housing_lease (tenant_id, park_id, id, currency)
  ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_housing_handover_approval_execution
  FOREIGN KEY (tenant_id, park_id, approval_execution_key)
  REFERENCES biz_property_approval_request (tenant_id, park_id, execution_idempotency_key)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_housing_handover_approval_line
  ON biz_housing_handover
    (tenant_id, park_id, approval_execution_key, approval_effect_line_key)
  WHERE approval_execution_key IS NOT NULL;

ALTER TABLE biz_housing_purchase_item
  ADD CONSTRAINT uq_housing_purchase_item_scope_id_purchase
  UNIQUE (tenant_id, park_id, id, purchase_id),
  ADD CONSTRAINT fk_housing_purchase_item_purchase_scope
  FOREIGN KEY (tenant_id, park_id, purchase_id)
  REFERENCES biz_housing_purchase (tenant_id, park_id, id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TABLE biz_housing_lease_effect_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  approval_request_id uuid NOT NULL,
  action_id varchar(160) NOT NULL CHECK (nullif(btrim(action_id), '') IS NOT NULL),
  effect_kind varchar(128) NOT NULL CHECK (nullif(btrim(effect_kind), '') IS NOT NULL),
  approval_execution_key varchar(128) NOT NULL CHECK (nullif(btrim(approval_execution_key), '') IS NOT NULL),
  effect_line_key varchar(160) NOT NULL CHECK (nullif(btrim(effect_line_key), '') IS NOT NULL),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  effect_hash char(64) NOT NULL,
  lease_id uuid NOT NULL,
  handover_id uuid,
  occupancy_id uuid,
  from_status varchar(32) NOT NULL,
  to_status varchar(32) NOT NULL,
  reason varchar(500) NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  source_expected_version integer NOT NULL CHECK (source_expected_version > 0),
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  checkout_at timestamptz,
  occupancy_source_expected_version integer,
  occupancy_resulting_version integer,
  CONSTRAINT ck_housing_lease_effect_audit_hash CHECK (effect_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_housing_lease_effect_audit_contract CHECK (
    resulting_version = source_expected_version + 1
    AND (
      (action_id = 'housing.leases.void.request'
        AND effect_kind = 'housing.lease.void'
        AND from_status IN ('draft', 'pending_approval', 'pending_signature')
        AND to_status = 'void' AND handover_id IS NULL AND checkout_at IS NULL
        AND occupancy_id IS NULL AND occupancy_source_expected_version IS NULL
        AND occupancy_resulting_version IS NULL)
      OR
      (action_id = 'housing.leases.checkout.request'
        AND effect_kind = 'housing.lease.checkout'
        AND from_status = 'checkout_pending' AND to_status = 'terminated'
        AND handover_id IS NULL AND checkout_at IS NOT NULL
        AND ((occupancy_id IS NULL AND occupancy_source_expected_version IS NULL
              AND occupancy_resulting_version IS NULL)
          OR (occupancy_id IS NOT NULL AND occupancy_source_expected_version > 0
              AND occupancy_resulting_version = occupancy_source_expected_version + 1)))
      OR
      (action_id = 'housing.handovers.complete-move-out-financial.request'
        AND effect_kind = 'housing.handover.complete.financial'
        AND from_status IN ('active', 'expiring', 'checkout_pending')
        AND to_status = 'checkout_pending' AND handover_id IS NOT NULL
        AND checkout_at IS NULL AND occupancy_id IS NULL
        AND occupancy_source_expected_version IS NULL AND occupancy_resulting_version IS NULL)
    )
  ),
  CONSTRAINT uq_housing_lease_effect_audit_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_housing_lease_effect_audit_approval_line
    UNIQUE (tenant_id, park_id, approval_execution_key, effect_line_key),
  CONSTRAINT fk_housing_lease_effect_audit_approval_execution
    FOREIGN KEY (tenant_id, park_id, approval_request_id, approval_execution_key)
    REFERENCES biz_property_approval_request (tenant_id, park_id, id, execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_lease_effect_audit_lease
    FOREIGN KEY (tenant_id, park_id, lease_id)
    REFERENCES biz_housing_lease (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_lease_effect_audit_handover
    FOREIGN KEY (tenant_id, park_id, handover_id)
    REFERENCES biz_housing_handover (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_lease_effect_audit_occupancy
    FOREIGN KEY (tenant_id, park_id, occupancy_id)
    REFERENCES biz_property_occupancy (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE biz_housing_purchase_effect_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  approval_request_id uuid NOT NULL,
  action_id varchar(160) NOT NULL CHECK (nullif(btrim(action_id), '') IS NOT NULL),
  effect_kind varchar(128) NOT NULL CHECK (nullif(btrim(effect_kind), '') IS NOT NULL),
  approval_execution_key varchar(128) NOT NULL CHECK (nullif(btrim(approval_execution_key), '') IS NOT NULL),
  effect_line_key varchar(160) NOT NULL CHECK (nullif(btrim(effect_line_key), '') IS NOT NULL),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  effect_hash char(64) NOT NULL,
  purchase_id uuid NOT NULL,
  transition varchar(32) NOT NULL,
  before_approval_status varchar(32) NOT NULL,
  after_approval_status varchar(32) NOT NULL,
  before_payment_status varchar(32) NOT NULL,
  after_payment_status varchar(32) NOT NULL,
  reason varchar(500) NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  source_expected_version integer NOT NULL CHECK (source_expected_version > 0),
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  CONSTRAINT ck_housing_purchase_effect_audit_hash CHECK (effect_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_housing_purchase_effect_audit_transition CHECK (
    action_id = 'housing.purchases.lifecycle.request'
    AND effect_kind = 'housing.purchase.lifecycle'
    AND resulting_version = source_expected_version + 1
    AND (
      (transition = 'approve' AND before_approval_status = 'draft'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'approved'
        AND after_payment_status = 'unpaid')
      OR (transition = 'reject' AND before_approval_status = 'draft'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'rejected'
        AND after_payment_status = 'unpaid')
      OR (transition = 'pay' AND before_approval_status = 'approved'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'approved'
        AND after_payment_status = 'paid')
      OR (transition = 'refund' AND before_approval_status = 'approved'
        AND before_payment_status = 'paid' AND after_approval_status = 'approved'
        AND after_payment_status = 'refunded')
      OR (transition = 'void-draft' AND before_approval_status = 'draft'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'void'
        AND after_payment_status = 'unpaid')
      OR (transition = 'void-approved' AND before_approval_status = 'approved'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'void'
        AND after_payment_status = 'unpaid')
      OR (transition = 'void-rejected' AND before_approval_status = 'rejected'
        AND before_payment_status = 'unpaid' AND after_approval_status = 'void'
        AND after_payment_status = 'unpaid')
    )
  ),
  CONSTRAINT uq_housing_purchase_effect_audit_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_housing_purchase_effect_audit_approval_line
    UNIQUE (tenant_id, park_id, approval_execution_key, effect_line_key),
  CONSTRAINT fk_housing_purchase_effect_audit_approval_execution
    FOREIGN KEY (tenant_id, park_id, approval_request_id, approval_execution_key)
    REFERENCES biz_property_approval_request (tenant_id, park_id, id, execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_purchase_effect_audit_purchase
    FOREIGN KEY (tenant_id, park_id, purchase_id)
    REFERENCES biz_housing_purchase (tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE biz_housing_purchase_transfer_effect_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  approval_request_id uuid NOT NULL,
  action_id varchar(160) NOT NULL CHECK (nullif(btrim(action_id), '') IS NOT NULL),
  effect_kind varchar(128) NOT NULL CHECK (nullif(btrim(effect_kind), '') IS NOT NULL),
  approval_execution_key varchar(128) NOT NULL CHECK (nullif(btrim(approval_execution_key), '') IS NOT NULL),
  effect_line_key varchar(160) NOT NULL CHECK (nullif(btrim(effect_line_key), '') IS NOT NULL),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  effect_hash char(64) NOT NULL,
  purchase_id uuid NOT NULL,
  purchase_item_id uuid NOT NULL,
  from_purchase_id uuid NOT NULL,
  to_lease_id uuid NOT NULL,
  to_receivable_id uuid NOT NULL,
  currency varchar(8) NOT NULL,
  purchase_source_expected_version integer NOT NULL CHECK (purchase_source_expected_version > 0),
  purchase_resulting_version integer NOT NULL CHECK (purchase_resulting_version > 0),
  item_source_expected_version integer NOT NULL CHECK (item_source_expected_version > 0),
  item_resulting_version integer NOT NULL CHECK (item_resulting_version > 0),
  item_amount numeric(18,2) NOT NULL,
  reason varchar(500) NOT NULL CHECK (nullif(btrim(reason), '') IS NOT NULL),
  CONSTRAINT ck_housing_purchase_transfer_effect_audit_hash CHECK (effect_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_housing_purchase_transfer_effect_audit_contract CHECK (
    action_id = 'housing.purchases.transfer.request'
    AND effect_kind = 'housing.purchase.transfer'
    AND purchase_id = from_purchase_id
    AND purchase_resulting_version = purchase_source_expected_version + 1
    AND item_resulting_version = item_source_expected_version + 1
    AND item_amount > 0
    AND currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT uq_housing_purchase_transfer_effect_audit_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_housing_purchase_transfer_effect_audit_approval_line
    UNIQUE (tenant_id, park_id, approval_execution_key, effect_line_key),
  CONSTRAINT fk_housing_purchase_transfer_effect_audit_approval_execution
    FOREIGN KEY (tenant_id, park_id, approval_request_id, approval_execution_key)
    REFERENCES biz_property_approval_request (tenant_id, park_id, id, execution_idempotency_key)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_purchase_transfer_effect_audit_purchase_currency
    FOREIGN KEY (tenant_id, park_id, purchase_id, currency)
    REFERENCES biz_housing_purchase (tenant_id, park_id, id, currency)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_purchase_transfer_effect_audit_item_purchase
    FOREIGN KEY (tenant_id, park_id, purchase_item_id, purchase_id)
    REFERENCES biz_housing_purchase_item (tenant_id, park_id, id, purchase_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_purchase_transfer_effect_audit_lease_currency
    FOREIGN KEY (tenant_id, park_id, to_lease_id, currency)
    REFERENCES biz_housing_lease (tenant_id, park_id, id, currency)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_housing_purchase_transfer_effect_audit_receivable_currency
    FOREIGN KEY (tenant_id, park_id, to_receivable_id, currency)
    REFERENCES biz_housing_receivable (tenant_id, park_id, id, currency)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TRIGGER trg_housing_ledger_approval_link_immutable
BEFORE UPDATE OR DELETE ON biz_housing_ledger_entry
FOR EACH ROW EXECUTE FUNCTION fn_property_b_approval_link_immutable();

CREATE TRIGGER trg_housing_handover_approval_link_immutable
BEFORE UPDATE OR DELETE ON biz_housing_handover
FOR EACH ROW EXECUTE FUNCTION fn_property_b_approval_link_immutable();

CREATE TRIGGER trg_housing_lease_effect_audit_immutable
BEFORE UPDATE OR DELETE ON biz_housing_lease_effect_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

CREATE TRIGGER trg_housing_purchase_effect_audit_immutable
BEFORE UPDATE OR DELETE ON biz_housing_purchase_effect_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

CREATE TRIGGER trg_housing_purchase_transfer_effect_audit_immutable
BEFORE UPDATE OR DELETE ON biz_housing_purchase_transfer_effect_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_approval_immutable();

COMMIT;
