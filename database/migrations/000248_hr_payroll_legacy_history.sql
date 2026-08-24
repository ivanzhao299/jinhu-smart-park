BEGIN;

-- T4 stores legacy payroll facts separately from online payroll. No table in this
-- migration contains a payment/disbursement state or an enable-payment flag.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_scope_id
  ON hr_employee(tenant_id, park_id, id);
-- T4 rollback resolves more than one million exact mapped targets by one batch.
-- The generic migration-control indexes do not cover this four-column access path.
CREATE INDEX IF NOT EXISTS idx_legacy_record_map_t4_rollback
  ON legacy_record_map(batch_id,target_table,target_id,is_active);

CREATE TABLE IF NOT EXISTS hr_payroll_book (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  source_system varchar(64) NOT NULL DEFAULT 'yuzhou-v10', legacy_scheme integer NOT NULL, book_name varchar(200),
  source_hash varchar(64) NOT NULL, status varchar(32) NOT NULL DEFAULT 'catalogued',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT ck_hr_payroll_book_scheme CHECK (legacy_scheme BETWEEN 1 AND 35),
  CONSTRAINT ck_hr_payroll_book_hash CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_book_status CHECK (status IN ('catalogued','review_required','approved')),
  CONSTRAINT ck_hr_payroll_book_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_book_source UNIQUE (tenant_id,park_id,source_system,legacy_scheme),
  CONSTRAINT uq_hr_payroll_book_scope_id UNIQUE (tenant_id,park_id,id)
);

CREATE TABLE IF NOT EXISTS hr_payroll_item_definition (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  book_id uuid NOT NULL, legacy_item_name varchar(64) NOT NULL, item_code varchar(96) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_item_definition_book FOREIGN KEY (tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_item_definition_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_item_definition_name UNIQUE (tenant_id,park_id,book_id,legacy_item_name),
  CONSTRAINT uq_hr_payroll_item_definition_code UNIQUE (tenant_id,park_id,book_id,item_code),
  CONSTRAINT uq_hr_payroll_item_definition_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_item_definition_book_fk ON hr_payroll_item_definition(tenant_id,park_id,book_id);

CREATE TABLE IF NOT EXISTS hr_payroll_item_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  item_definition_id uuid NOT NULL, version_no integer NOT NULL, display_name varchar(200) NOT NULL,
  value_type varchar(16) NOT NULL, legacy_item_type varchar(64) NOT NULL, legacy_add_or_sub varchar(32) NOT NULL,
  item_category varchar(32) NOT NULL, decimal_scale integer, sort_no integer NOT NULL DEFAULT 0,
  taxable boolean, print_enabled boolean, enabled boolean NOT NULL DEFAULT true, source_hash varchar(64) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_item_version_definition FOREIGN KEY (tenant_id,park_id,item_definition_id) REFERENCES hr_payroll_item_definition(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_item_version_no CHECK (version_no > 0),
  CONSTRAINT ck_hr_payroll_item_version_type CHECK (value_type IN ('decimal','text','date')),
  CONSTRAINT ck_hr_payroll_item_version_category CHECK (item_category IN ('earning','deduction','employer_contribution','summary','informational','unclassified')),
  CONSTRAINT ck_hr_payroll_item_version_scale CHECK ((value_type='decimal' AND decimal_scale BETWEEN 0 AND 4) OR (value_type<>'decimal' AND decimal_scale IS NULL)),
  CONSTRAINT ck_hr_payroll_item_version_hash CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_item_version_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_item_version_no UNIQUE (tenant_id,park_id,item_definition_id,version_no),
  CONSTRAINT uq_hr_payroll_item_version_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_item_version_definition_fk ON hr_payroll_item_version(tenant_id,park_id,item_definition_id);

CREATE TABLE IF NOT EXISTS hr_payroll_formula_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  book_id uuid NOT NULL, item_version_id uuid, legacy_formula_id integer NOT NULL, version_no integer NOT NULL,
  raw_expression text NOT NULL, raw_condition text, expression_hash varchar(64) NOT NULL,
  parser_version varchar(32), parse_status varchar(32) NOT NULL DEFAULT 'manual_review', dsl_ast jsonb,
  dependency_codes jsonb NOT NULL DEFAULT '[]'::jsonb, calculation_order integer NOT NULL DEFAULT 1,
  reviewed_by uuid, reviewed_at timestamptz, review_reason varchar(1000),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_formula_book FOREIGN KEY (tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_formula_item FOREIGN KEY (tenant_id,park_id,item_version_id) REFERENCES hr_payroll_item_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_formula_ids CHECK (legacy_formula_id > 0 AND version_no > 0 AND calculation_order > 0),
  CONSTRAINT ck_hr_payroll_formula_hash CHECK (expression_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_formula_status CHECK (parse_status IN ('parsed','manual_review','rejected','approved_for_simulation')),
  CONSTRAINT ck_hr_payroll_formula_ast CHECK ((parse_status IN ('parsed','approved_for_simulation') AND dsl_ast IS NOT NULL AND parser_version IS NOT NULL) OR parse_status IN ('manual_review','rejected')),
  CONSTRAINT ck_hr_payroll_formula_review CHECK ((parse_status IN ('rejected','approved_for_simulation') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL) OR parse_status IN ('parsed','manual_review')),
  CONSTRAINT ck_hr_payroll_formula_item_resolution CHECK (item_version_id IS NOT NULL OR parse_status IN ('manual_review','rejected')),
  CONSTRAINT ck_hr_payroll_formula_dependencies CHECK (jsonb_typeof(dependency_codes)='array'),
  CONSTRAINT ck_hr_payroll_formula_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_formula_version UNIQUE (tenant_id,park_id,legacy_formula_id,version_no),
  CONSTRAINT uq_hr_payroll_formula_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_formula_book_fk ON hr_payroll_formula_version(tenant_id,park_id,book_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_formula_item_fk ON hr_payroll_formula_version(tenant_id,park_id,item_version_id);

CREATE TABLE IF NOT EXISTS hr_payroll_book_period (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  book_id uuid NOT NULL, period_month date NOT NULL, legacy_close_state integer NOT NULL, source_hash varchar(64) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_book_period_book FOREIGN KEY (tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_book_period_month CHECK (period_month=date_trunc('month',period_month)::date),
  CONSTRAINT ck_hr_payroll_book_period_state CHECK (legacy_close_state IN (0,1)),
  CONSTRAINT ck_hr_payroll_book_period_hash CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_book_period_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_book_period UNIQUE (tenant_id,park_id,book_id,period_month),
  CONSTRAINT uq_hr_payroll_book_period_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_book_period_book_fk ON hr_payroll_book_period(tenant_id,park_id,book_id);

CREATE TABLE IF NOT EXISTS hr_payroll_book_membership (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,book_id uuid NOT NULL,employee_id uuid,
 legacy_membership_id integer NOT NULL,legacy_employee_hash varchar(64) NOT NULL,mapping_status varchar(32) NOT NULL,source_hash varchar(64) NOT NULL,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT fk_hr_payroll_book_membership_book FOREIGN KEY(tenant_id,park_id,book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
 CONSTRAINT fk_hr_payroll_book_membership_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT ck_hr_payroll_book_membership_hash CHECK(legacy_employee_hash~'^[0-9a-f]{64}$' AND source_hash~'^[0-9a-f]{64}$'),
 CONSTRAINT ck_hr_payroll_book_membership_status CHECK(mapping_status IN('mapped','employee_unmapped') AND ((mapping_status='mapped' AND employee_id IS NOT NULL) OR (mapping_status='employee_unmapped' AND employee_id IS NULL))),
 CONSTRAINT ck_hr_payroll_book_membership_not_deleted CHECK(is_deleted=false),CONSTRAINT uq_hr_payroll_book_membership UNIQUE(tenant_id,park_id,legacy_membership_id),CONSTRAINT uq_hr_payroll_book_membership_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_book_membership_book_fk ON hr_payroll_book_membership(tenant_id,park_id,book_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_book_membership_employee_fk ON hr_payroll_book_membership(tenant_id,park_id,employee_id);
CREATE TABLE IF NOT EXISTS hr_payroll_tax_rule_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,legacy_tax_id integer NOT NULL,version_no integer NOT NULL DEFAULT 1,
 base_amount numeric(20,4),lower_limit numeric(20,4),upper_limit numeric(20,4),tax_percent numeric(20,4),offset_amount numeric(20,4),source_hash varchar(64) NOT NULL,
 create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,remark varchar(500),
 CONSTRAINT ck_hr_payroll_tax_rule_ids CHECK(legacy_tax_id>0 AND version_no>0),CONSTRAINT ck_hr_payroll_tax_rule_hash CHECK(source_hash~'^[0-9a-f]{64}$'),
 CONSTRAINT ck_hr_payroll_tax_rule_scale CHECK((base_amount IS NULL OR scale(base_amount)<=4)AND(lower_limit IS NULL OR scale(lower_limit)<=4)AND(upper_limit IS NULL OR scale(upper_limit)<=4)AND(tax_percent IS NULL OR scale(tax_percent)<=4)AND(offset_amount IS NULL OR scale(offset_amount)<=4)),
 CONSTRAINT ck_hr_payroll_tax_rule_not_deleted CHECK(is_deleted=false),CONSTRAINT uq_hr_payroll_tax_rule UNIQUE(tenant_id,park_id,legacy_tax_id,version_no),CONSTRAINT uq_hr_payroll_tax_rule_scope_id UNIQUE(tenant_id,park_id,id)
);

CREATE TABLE IF NOT EXISTS hr_payroll_legacy_batch (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  batch_code varchar(64) NOT NULL, source_system varchar(64) NOT NULL DEFAULT 'yuzhou-v10',
  source_backup_hash varchar(64) NOT NULL, catalog_hash varchar(64) NOT NULL, manifest_hash varchar(64) NOT NULL,
  source_row_count bigint NOT NULL, loaded_row_count bigint NOT NULL DEFAULT 0, quarantined_row_count bigint NOT NULL DEFAULT 0,
  source_amount_total numeric(20,4), loaded_amount_total numeric(20,4), status varchar(32) NOT NULL DEFAULT 'unpublished',
  replaces_batch_id uuid, published_at timestamptz, published_by uuid,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_legacy_batch_replaces FOREIGN KEY (tenant_id,park_id,replaces_batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_legacy_batch_hashes CHECK (source_backup_hash ~ '^[0-9a-f]{64}$' AND catalog_hash ~ '^[0-9a-f]{64}$' AND manifest_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_legacy_batch_counts CHECK (source_row_count>=0 AND loaded_row_count>=0 AND quarantined_row_count>=0 AND loaded_row_count+quarantined_row_count<=source_row_count),
  CONSTRAINT ck_hr_payroll_legacy_batch_amounts CHECK ((source_amount_total IS NULL OR abs(source_amount_total)<10000000000000000) AND (loaded_amount_total IS NULL OR abs(loaded_amount_total)<10000000000000000)),
  CONSTRAINT ck_hr_payroll_legacy_batch_amount_scale CHECK ((source_amount_total IS NULL OR scale(source_amount_total)<=4) AND (loaded_amount_total IS NULL OR scale(loaded_amount_total)<=4)),
  CONSTRAINT ck_hr_payroll_legacy_batch_status CHECK (status IN ('unpublished','staged','failed','published')),
  CONSTRAINT ck_hr_payroll_legacy_batch_published CHECK ((status='published' AND published_at IS NOT NULL AND published_by IS NOT NULL AND loaded_row_count+quarantined_row_count=source_row_count) OR (status<>'published' AND published_at IS NULL AND published_by IS NULL)),
  CONSTRAINT ck_hr_payroll_legacy_batch_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_legacy_batch_code UNIQUE (tenant_id,park_id,batch_code),
  CONSTRAINT uq_hr_payroll_legacy_batch_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_batch_replaces_fk ON hr_payroll_legacy_batch(tenant_id,park_id,replaces_batch_id);

CREATE TABLE IF NOT EXISTS hr_payroll_legacy_snapshot (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  batch_id uuid NOT NULL, book_period_id uuid NOT NULL, employee_id uuid,
  legacy_source_table varchar(16) NOT NULL, legacy_employee_hash varchar(64) NOT NULL, legacy_department_hash varchar(64),
  source_content_group_hash varchar(64) NOT NULL, source_multiplicity integer NOT NULL DEFAULT 1,
  mapping_status varchar(32) NOT NULL, gross_amount numeric(20,4), deduction_amount numeric(20,4),
  tax_amount numeric(20,4), net_amount numeric(20,4), source_hash varchar(64) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_legacy_snapshot_batch FOREIGN KEY (tenant_id,park_id,batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_legacy_snapshot_period FOREIGN KEY (tenant_id,park_id,book_period_id) REFERENCES hr_payroll_book_period(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_legacy_snapshot_employee FOREIGN KEY (tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_table CHECK (legacy_source_table ~ '^salary(0[1-9]|[12][0-9]|3[0-5])$'),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_hashes CHECK (legacy_employee_hash ~ '^[0-9a-f]{64}$' AND (legacy_department_hash IS NULL OR legacy_department_hash ~ '^[0-9a-f]{64}$') AND source_content_group_hash ~ '^[0-9a-f]{64}$' AND source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_multiplicity CHECK (source_multiplicity>0),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_mapping CHECK (mapping_status IN ('mapped','employee_unmapped','duplicate_source','quarantined') AND ((mapping_status='mapped' AND employee_id IS NOT NULL) OR mapping_status<>'mapped')),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_amounts CHECK ((gross_amount IS NULL OR abs(gross_amount)<10000000000000000) AND (deduction_amount IS NULL OR abs(deduction_amount)<10000000000000000) AND (tax_amount IS NULL OR abs(tax_amount)<10000000000000000) AND (net_amount IS NULL OR abs(net_amount)<10000000000000000)),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_amount_scale CHECK ((gross_amount IS NULL OR scale(gross_amount)<=4) AND (deduction_amount IS NULL OR scale(deduction_amount)<=4) AND (tax_amount IS NULL OR scale(tax_amount)<=4) AND (net_amount IS NULL OR scale(net_amount)<=4)),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_legacy_snapshot_source UNIQUE (tenant_id,park_id,batch_id,legacy_source_table,source_content_group_hash),
  CONSTRAINT uq_hr_payroll_legacy_snapshot_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_batch_fk ON hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_period_fk ON hr_payroll_legacy_snapshot(tenant_id,park_id,book_period_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_employee_fk ON hr_payroll_legacy_snapshot(tenant_id,park_id,employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_content_group ON hr_payroll_legacy_snapshot(source_content_group_hash);

CREATE TABLE IF NOT EXISTS hr_payroll_legacy_snapshot_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  snapshot_id uuid NOT NULL, item_version_id uuid, legacy_column_name varchar(64) NOT NULL, value_type varchar(16) NOT NULL,
  is_source_null boolean NOT NULL, raw_value text, decimal_value numeric(20,4), text_value text, date_value date,
  sort_no integer NOT NULL DEFAULT 0, source_hash varchar(64) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_legacy_snapshot_item_snapshot FOREIGN KEY (tenant_id,park_id,snapshot_id) REFERENCES hr_payroll_legacy_snapshot(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_legacy_snapshot_item_version FOREIGN KEY (tenant_id,park_id,item_version_id) REFERENCES hr_payroll_item_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_type CHECK (value_type IN ('decimal','text','date','unmapped')),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_value CHECK ((is_source_null AND raw_value IS NULL AND decimal_value IS NULL AND text_value IS NULL AND date_value IS NULL) OR (NOT is_source_null AND raw_value IS NOT NULL AND ((value_type='decimal' AND decimal_value IS NOT NULL AND text_value IS NULL AND date_value IS NULL) OR (value_type='text' AND decimal_value IS NULL AND text_value IS NOT NULL AND date_value IS NULL) OR (value_type='date' AND decimal_value IS NULL AND text_value IS NULL AND date_value IS NOT NULL) OR (value_type='unmapped' AND decimal_value IS NULL AND text_value IS NULL AND date_value IS NULL)))),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_mapping CHECK ((value_type='unmapped' AND item_version_id IS NULL) OR (value_type<>'unmapped' AND item_version_id IS NOT NULL)),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_amount CHECK (decimal_value IS NULL OR abs(decimal_value)<10000000000000000),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_scale CHECK (decimal_value IS NULL OR scale(decimal_value)<=4),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_hash CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_legacy_snapshot_item_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_legacy_snapshot_item UNIQUE (tenant_id,park_id,snapshot_id,legacy_column_name),
  CONSTRAINT uq_hr_payroll_legacy_snapshot_item_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_item_snapshot_fk ON hr_payroll_legacy_snapshot_item(tenant_id,park_id,snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_legacy_snapshot_item_version_fk ON hr_payroll_legacy_snapshot_item(tenant_id,park_id,item_version_id);

CREATE TABLE IF NOT EXISTS hr_payroll_review_case (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  batch_id uuid NOT NULL, snapshot_id uuid, formula_version_id uuid, case_type varchar(32) NOT NULL,
  subject_hash varchar(64) NOT NULL, evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb, status varchar(16) NOT NULL DEFAULT 'open',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500),
  CONSTRAINT fk_hr_payroll_review_case_batch FOREIGN KEY (tenant_id,park_id,batch_id) REFERENCES hr_payroll_legacy_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_review_case_snapshot FOREIGN KEY (tenant_id,park_id,snapshot_id) REFERENCES hr_payroll_legacy_snapshot(tenant_id,park_id,id),
  CONSTRAINT fk_hr_payroll_review_case_formula FOREIGN KEY (tenant_id,park_id,formula_version_id) REFERENCES hr_payroll_formula_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_review_case_type CHECK (case_type IN ('employee_unmapped','item_unmapped','formula_unsafe','period_invalid','amount_unbalanced','duplicate_source','other')),
  CONSTRAINT ck_hr_payroll_review_case_hash CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_payroll_review_case_evidence CHECK (jsonb_typeof(evidence_summary)='object'),
  CONSTRAINT ck_hr_payroll_review_case_status CHECK (status IN ('open','superseded')),
  CONSTRAINT ck_hr_payroll_review_case_not_deleted CHECK (is_deleted = false),
  CONSTRAINT uq_hr_payroll_review_case_subject UNIQUE (tenant_id,park_id,batch_id,case_type,subject_hash),
  CONSTRAINT uq_hr_payroll_review_case_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_review_case_batch_fk ON hr_payroll_review_case(tenant_id,park_id,batch_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_review_case_snapshot_fk ON hr_payroll_review_case(tenant_id,park_id,snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_review_case_formula_fk ON hr_payroll_review_case(tenant_id,park_id,formula_version_id);

CREATE OR REPLACE FUNCTION hr_payroll_legacy_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='published' THEN RAISE EXCEPTION 'Published legacy payroll batch is immutable'; END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Legacy payroll batch deletion requires the dedicated rollback procedure';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_hr_payroll_legacy_batch_guard ON hr_payroll_legacy_batch;
CREATE TRIGGER trg_hr_payroll_legacy_batch_guard BEFORE UPDATE OR DELETE ON hr_payroll_legacy_batch FOR EACH ROW EXECUTE FUNCTION hr_payroll_legacy_batch_guard();

CREATE OR REPLACE FUNCTION hr_payroll_legacy_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_status varchar(32);
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Legacy payroll facts are append-only'; END IF;
  IF TG_TABLE_NAME='hr_payroll_legacy_snapshot_item' THEN
    SELECT b.status INTO batch_status FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_legacy_batch b ON b.id=s.batch_id AND b.tenant_id=s.tenant_id AND b.park_id=s.park_id WHERE s.id=CASE WHEN TG_OP='INSERT' THEN NEW.snapshot_id ELSE OLD.snapshot_id END AND s.tenant_id=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END AND s.park_id=CASE WHEN TG_OP='INSERT' THEN NEW.park_id ELSE OLD.park_id END;
  ELSIF TG_TABLE_NAME='hr_payroll_review_case' THEN
    SELECT status INTO batch_status FROM hr_payroll_legacy_batch WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.batch_id ELSE OLD.batch_id END AND tenant_id=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END AND park_id=CASE WHEN TG_OP='INSERT' THEN NEW.park_id ELSE OLD.park_id END;
  ELSE
    SELECT status INTO batch_status FROM hr_payroll_legacy_batch WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.batch_id ELSE OLD.batch_id END AND tenant_id=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END AND park_id=CASE WHEN TG_OP='INSERT' THEN NEW.park_id ELSE OLD.park_id END;
  END IF;
  IF TG_OP='INSERT' THEN
    IF batch_status IS NULL OR batch_status='published' THEN RAISE EXCEPTION 'Published or unknown legacy payroll batch rejects new facts'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Legacy payroll fact deletion requires the dedicated rollback procedure';
END $$;
DROP TRIGGER IF EXISTS trg_hr_payroll_legacy_snapshot_guard ON hr_payroll_legacy_snapshot;
DROP TRIGGER IF EXISTS trg_hr_payroll_legacy_snapshot_item_guard ON hr_payroll_legacy_snapshot_item;
DROP TRIGGER IF EXISTS trg_hr_payroll_review_case_guard ON hr_payroll_review_case;
CREATE TRIGGER trg_hr_payroll_legacy_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_legacy_snapshot FOR EACH ROW EXECUTE FUNCTION hr_payroll_legacy_fact_guard();
CREATE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_legacy_snapshot_item FOR EACH ROW EXECUTE FUNCTION hr_payroll_legacy_fact_guard();
CREATE TRIGGER trg_hr_payroll_review_case_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_review_case FOR EACH ROW EXECUTE FUNCTION hr_payroll_legacy_fact_guard();

CREATE OR REPLACE FUNCTION hr_payroll_catalog_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legacy payroll catalog versions are append-only'; END $$;
DROP TRIGGER IF EXISTS trg_hr_payroll_item_version_guard ON hr_payroll_item_version;
DROP TRIGGER IF EXISTS trg_hr_payroll_formula_version_guard ON hr_payroll_formula_version;
DROP TRIGGER IF EXISTS trg_hr_payroll_book_period_guard ON hr_payroll_book_period;
DROP TRIGGER IF EXISTS trg_hr_payroll_book_guard ON hr_payroll_book;
DROP TRIGGER IF EXISTS trg_hr_payroll_item_definition_guard ON hr_payroll_item_definition;
DROP TRIGGER IF EXISTS trg_hr_payroll_book_membership_guard ON hr_payroll_book_membership;
DROP TRIGGER IF EXISTS trg_hr_payroll_tax_rule_version_guard ON hr_payroll_tax_rule_version;
CREATE TRIGGER trg_hr_payroll_item_version_guard BEFORE UPDATE OR DELETE ON hr_payroll_item_version FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_formula_version_guard BEFORE UPDATE OR DELETE ON hr_payroll_formula_version FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_book_period_guard BEFORE UPDATE OR DELETE ON hr_payroll_book_period FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_book_guard BEFORE UPDATE OR DELETE ON hr_payroll_book FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_item_definition_guard BEFORE UPDATE OR DELETE ON hr_payroll_item_definition FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_book_membership_guard BEFORE UPDATE OR DELETE ON hr_payroll_book_membership FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();
CREATE TRIGGER trg_hr_payroll_tax_rule_version_guard BEFORE UPDATE OR DELETE ON hr_payroll_tax_rule_version FOR EACH ROW EXECUTE FUNCTION hr_payroll_catalog_append_only_guard();

CREATE OR REPLACE PROCEDURE rollback_yuzhou_t4_payroll_history(p_run_id varchar, p_expected_database varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE control_batch uuid; legacy_batch uuid; mapped_count bigint; present_count bigint;
BEGIN
  IF session_user <> 'yuzhou_t4_loader' THEN RAISE EXCEPTION 'T4 rollback requires dedicated loader role'; END IF;
  IF current_database() <> p_expected_database OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'Unsafe T4 rollback target'; END IF;
  LOCK TABLE public.legacy_record_map IN SHARE ROW EXCLUSIVE MODE;
  SELECT id INTO control_batch FROM public.migration_batch WHERE run_id=p_run_id AND target_database=current_database() AND status IN ('succeeded','failed') FOR UPDATE;
  IF control_batch IS NULL THEN RAISE EXCEPTION 'Rollbackable T4 migration batch not found'; END IF;
  SELECT l.id INTO legacy_batch FROM public.hr_payroll_legacy_batch l JOIN public.legacy_record_map m ON m.target_id=l.id AND m.target_table='hr_payroll_legacy_batch' AND m.batch_id=control_batch AND m.is_active WHERE l.batch_code=p_run_id FOR UPDATE;
  IF legacy_batch IS NULL THEN RAISE EXCEPTION 'Active T4 legacy batch record map not found'; END IF;
  IF (SELECT status FROM public.hr_payroll_legacy_batch WHERE id=legacy_batch) NOT IN ('unpublished','staged','failed') THEN RAISE EXCEPTION 'Published T4 payroll history cannot be rolled back'; END IF;
  SELECT count(*) INTO mapped_count FROM public.legacy_record_map WHERE batch_id=control_batch AND is_active AND target_id IS NOT NULL AND target_table IN (
    'hr_payroll_legacy_batch','hr_payroll_book','hr_payroll_item_definition','hr_payroll_item_version','hr_payroll_formula_version',
    'hr_payroll_book_period','hr_payroll_book_membership','hr_payroll_tax_rule_version','hr_payroll_legacy_snapshot',
    'hr_payroll_legacy_snapshot_item','hr_payroll_review_case'
  );
  SELECT
    (SELECT count(*) FROM public.hr_payroll_review_case x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_review_case' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_legacy_snapshot_item x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_legacy_snapshot_item' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_legacy_snapshot x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_legacy_snapshot' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_formula_version x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_formula_version' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_item_version x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_item_version' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_item_definition x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_item_definition' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_book_period x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_book_period' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_book_membership x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_book_membership' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_tax_rule_version x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_tax_rule_version' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+
    (SELECT count(*) FROM public.hr_payroll_book x JOIN public.legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_payroll_book' AND m.batch_id=control_batch AND m.is_active WHERE x.remark='T4 run='||p_run_id)+1 INTO present_count;
  IF present_count <> mapped_count THEN RAISE EXCEPTION 'T4 rollback target drift: mapped %, present %',mapped_count,present_count; END IF;

  ALTER TABLE public.hr_payroll_review_case DISABLE TRIGGER trg_hr_payroll_review_case_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot_item DISABLE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot DISABLE TRIGGER trg_hr_payroll_legacy_snapshot_guard;
  ALTER TABLE public.hr_payroll_formula_version DISABLE TRIGGER trg_hr_payroll_formula_version_guard;
  ALTER TABLE public.hr_payroll_item_version DISABLE TRIGGER trg_hr_payroll_item_version_guard;
  ALTER TABLE public.hr_payroll_item_definition DISABLE TRIGGER trg_hr_payroll_item_definition_guard;
  ALTER TABLE public.hr_payroll_book_membership DISABLE TRIGGER trg_hr_payroll_book_membership_guard;
  ALTER TABLE public.hr_payroll_tax_rule_version DISABLE TRIGGER trg_hr_payroll_tax_rule_version_guard;
  ALTER TABLE public.hr_payroll_book_period DISABLE TRIGGER trg_hr_payroll_book_period_guard;
  ALTER TABLE public.hr_payroll_book DISABLE TRIGGER trg_hr_payroll_book_guard;
  ALTER TABLE public.hr_payroll_legacy_batch DISABLE TRIGGER trg_hr_payroll_legacy_batch_guard;
  DELETE FROM public.hr_payroll_review_case x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_review_case' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_snapshot_item x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_legacy_snapshot_item' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_snapshot x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_legacy_snapshot' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_formula_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_formula_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_item_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_item_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_item_definition x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_item_definition' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book_membership x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book_membership' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_tax_rule_version x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_tax_rule_version' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book_period x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book_period' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_book x USING public.legacy_record_map m WHERE m.batch_id=control_batch AND m.target_table='hr_payroll_book' AND m.target_id=x.id AND m.is_active;
  DELETE FROM public.hr_payroll_legacy_batch WHERE id=legacy_batch;
  ALTER TABLE public.hr_payroll_review_case ENABLE TRIGGER trg_hr_payroll_review_case_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot_item ENABLE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard;
  ALTER TABLE public.hr_payroll_legacy_snapshot ENABLE TRIGGER trg_hr_payroll_legacy_snapshot_guard;
  ALTER TABLE public.hr_payroll_formula_version ENABLE TRIGGER trg_hr_payroll_formula_version_guard;
  ALTER TABLE public.hr_payroll_item_version ENABLE TRIGGER trg_hr_payroll_item_version_guard;
  ALTER TABLE public.hr_payroll_item_definition ENABLE TRIGGER trg_hr_payroll_item_definition_guard;
  ALTER TABLE public.hr_payroll_book_membership ENABLE TRIGGER trg_hr_payroll_book_membership_guard;
  ALTER TABLE public.hr_payroll_tax_rule_version ENABLE TRIGGER trg_hr_payroll_tax_rule_version_guard;
  ALTER TABLE public.hr_payroll_book_period ENABLE TRIGGER trg_hr_payroll_book_period_guard;
  ALTER TABLE public.hr_payroll_book ENABLE TRIGGER trg_hr_payroll_book_guard;
  ALTER TABLE public.hr_payroll_legacy_batch ENABLE TRIGGER trg_hr_payroll_legacy_batch_guard;
  UPDATE public.legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE batch_id=control_batch AND is_active;
  UPDATE public.migration_batch_item SET phase='rollback',status='succeeded',finished_at=now(),update_time=now() WHERE batch_id=control_batch;
  UPDATE public.migration_rollback_point SET cleanup_manifest=cleanup_manifest||jsonb_build_object('deletedMappedTargets',mapped_count),verified_at=now() WHERE batch_id=control_batch AND rollback_code='T4_PAYROLL_HISTORY';
  UPDATE public.migration_batch SET phase='rollback',status='rolled_back',finished_at=now(),update_time=now() WHERE id=control_batch;
  IF EXISTS(SELECT 1 FROM public.legacy_record_map WHERE batch_id=control_batch AND is_active) THEN RAISE EXCEPTION 'T4 rollback left active record maps'; END IF;
END $$;
REVOKE ALL ON PROCEDURE rollback_yuzhou_t4_payroll_history(varchar,varchar) FROM PUBLIC;

COMMIT;
