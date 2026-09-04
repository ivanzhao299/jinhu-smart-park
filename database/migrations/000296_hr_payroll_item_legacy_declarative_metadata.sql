BEGIN;

-- Preserve reviewed, non-expression salary-item metadata exactly while exposing
-- only normalized, non-sensitive projections to the application. Formula and
-- condition bodies remain outside this metadata surface.
ALTER TABLE hr_payroll_item_version
  ADD COLUMN legacy_print_width integer,
  ADD COLUMN legacy_print_width_hash varchar(64),
  ADD COLUMN legacy_tax_flag varchar(2),
  ADD COLUMN legacy_no_decimal_flag varchar(2),
  ADD COLUMN legacy_use_flag varchar(4),
  ADD COLUMN legacy_decimal_length integer,
  ADD COLUMN legacy_decimal_length_hash varchar(64),
  ADD COLUMN legacy_print_report integer,
  ADD COLUMN legacy_print_report_hash varchar(64),
  ADD COLUMN legacy_item_title varchar(24),
  ADD COLUMN legacy_long_description varchar(100),
  ADD COLUMN suppress_decimals boolean,
  ADD COLUMN legacy_metadata_review_required boolean NOT NULL DEFAULT true;

ALTER TABLE hr_payroll_item_version
  ADD CONSTRAINT ck_hr_payroll_item_legacy_declarative_hashes
  CHECK (
    (legacy_print_width_hash IS NULL OR legacy_print_width_hash ~ '^[0-9a-f]{64}$')
    AND (legacy_decimal_length_hash IS NULL OR legacy_decimal_length_hash ~ '^[0-9a-f]{64}$')
    AND (legacy_print_report_hash IS NULL OR legacy_print_report_hash ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT ck_hr_payroll_item_legacy_declarative_review
  CHECK (
    legacy_metadata_review_required
    OR (
      legacy_print_width IS NOT NULL
      AND legacy_print_width_hash IS NOT NULL
      AND legacy_tax_flag IS NOT NULL
      AND taxable IS NOT NULL
      AND legacy_no_decimal_flag IS NOT NULL
      AND suppress_decimals IS NOT NULL
      AND legacy_use_flag IS NOT NULL
      AND legacy_decimal_length IS NOT NULL
      AND legacy_decimal_length_hash IS NOT NULL
      AND legacy_print_report IS NOT NULL
      AND legacy_print_report_hash IS NOT NULL
      AND print_enabled IS NOT NULL
      AND (
        value_type <> 'decimal'
        OR (
          legacy_decimal_length BETWEEN 0 AND 4
          AND decimal_scale = legacy_decimal_length
        )
      )
    )
  );

COMMENT ON COLUMN hr_payroll_item_version.legacy_metadata_review_required IS
  'True when a legacy declarative flag or decimal length cannot be mapped without interpretation; it does not authorize formula execution.';

COMMIT;
