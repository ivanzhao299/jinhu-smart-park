BEGIN;
-- A separate monthly-source ledger.  It does not alter T4 receipts, legacy
-- batches or their frozen hashes; typed generations are append-only evidence.
CREATE TABLE hr_yuzhou_payroll_source_operation (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 source_system varchar(64) NOT NULL CHECK(source_system='yuzhou-v10'), source_instance varchar(128) NOT NULL,
 period_month date NOT NULL, manifest_id varchar(200) NOT NULL, package_sha256 varchar(64) NOT NULL CHECK(package_sha256 ~ '^[0-9a-f]{64}$'),
 payload_encrypted text NOT NULL, status varchar(16) NOT NULL CHECK(status IN('previewed','committed','rejected')),
 expected_head_version integer NOT NULL CHECK(expected_head_version>=0), expected_head_hash varchar(64), previous_operation_id uuid,
 generation integer, head_hash varchar(64), database_name text, database_oid oid, record_count integer NOT NULL DEFAULT 0, value_count integer NOT NULL DEFAULT 0,
 book_count integer NOT NULL DEFAULT 0, roster_sha256 varchar(64), catalog_sha256 varchar(64), book_set_sha256 varchar(64),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), committed_by uuid, committed_at timestamptz,
 UNIQUE(tenant_id,park_id,source_system,package_sha256), UNIQUE(tenant_id,park_id,id),
 CHECK((status='previewed' AND generation IS NULL AND committed_by IS NULL AND committed_at IS NULL AND head_hash IS NULL)
    OR (status='committed' AND generation IS NOT NULL AND committed_by IS NOT NULL AND committed_at IS NOT NULL AND head_hash ~ '^[0-9a-f]{64}$' AND database_name IS NOT NULL AND database_oid IS NOT NULL)
    OR status='rejected')
);
CREATE TABLE hr_yuzhou_payroll_source_head (
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, source_system varchar(64) NOT NULL CHECK(source_system='yuzhou-v10'), source_instance varchar(128) NOT NULL, period_month date NOT NULL,
 version integer NOT NULL DEFAULT 0 CHECK(version>=0), operation_id uuid, head_hash varchar(64), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,park_id,source_system,source_instance,period_month),
 FOREIGN KEY(operation_id,tenant_id,park_id) REFERENCES hr_yuzhou_payroll_source_operation(id,tenant_id,park_id),
 CHECK((version=0 AND operation_id IS NULL AND head_hash IS NULL) OR (version>0 AND operation_id IS NOT NULL AND head_hash ~ '^[0-9a-f]{64}$'))
);
CREATE TABLE hr_yuzhou_payroll_source_generation (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, operation_id uuid NOT NULL,
 source_instance varchar(128) NOT NULL, period_month date NOT NULL, generation integer NOT NULL CHECK(generation>0),
 roster_sha256 varchar(64) NOT NULL CHECK(roster_sha256 ~ '^[0-9a-f]{64}$'), catalog_sha256 varchar(64) NOT NULL CHECK(catalog_sha256 ~ '^[0-9a-f]{64}$'), book_set_sha256 varchar(64) NOT NULL CHECK(book_set_sha256 ~ '^[0-9a-f]{64}$'),
 record_count integer NOT NULL CHECK(record_count>=0), value_count integer NOT NULL CHECK(value_count>=0), book_count integer NOT NULL CHECK(book_count>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,operation_id), UNIQUE(tenant_id,park_id,source_instance,period_month,generation), UNIQUE(tenant_id,park_id,id),
 FOREIGN KEY(operation_id,tenant_id,park_id) REFERENCES hr_yuzhou_payroll_source_operation(id,tenant_id,park_id)
);
CREATE TABLE hr_yuzhou_payroll_source_record (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, generation_id uuid NOT NULL, scheme integer NOT NULL CHECK(scheme BETWEEN 1 AND 35),
 source_person_identity varchar(256) NOT NULL, employee_mapping_id uuid NOT NULL, source_table varchar(64) NOT NULL, source_row_sha256 varchar(64) NOT NULL CHECK(source_row_sha256 ~ '^[0-9a-f]{64}$'),
 summary jsonb NOT NULL DEFAULT '{}'::jsonb, create_time timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,generation_id,scheme,source_person_identity), UNIQUE(tenant_id,park_id,id),
 FOREIGN KEY(generation_id,tenant_id,park_id) REFERENCES hr_yuzhou_payroll_source_generation(id,tenant_id,park_id),
 FOREIGN KEY(employee_mapping_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id)
);
CREATE TABLE hr_yuzhou_payroll_source_value (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, record_id uuid NOT NULL, column_name varchar(64) NOT NULL,
 value_type varchar(16) NOT NULL CHECK(value_type IN('decimal','text','date')), is_source_null boolean NOT NULL,
 decimal_value numeric(20,4), text_value text, date_value date, source_hash varchar(64) NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'), create_time timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,record_id,column_name), FOREIGN KEY(record_id,tenant_id,park_id) REFERENCES hr_yuzhou_payroll_source_record(id,tenant_id,park_id),
 CHECK((is_source_null AND decimal_value IS NULL AND text_value IS NULL AND date_value IS NULL) OR (NOT is_source_null AND ((value_type='decimal' AND decimal_value IS NOT NULL AND text_value IS NULL AND date_value IS NULL) OR (value_type='text' AND decimal_value IS NULL AND text_value IS NOT NULL AND date_value IS NULL) OR (value_type='date' AND decimal_value IS NULL AND text_value IS NULL AND date_value IS NOT NULL))))
);
CREATE INDEX idx_hr_yuzhou_payroll_source_generation_current ON hr_yuzhou_payroll_source_generation(tenant_id,park_id,source_instance,period_month,generation DESC);
CREATE INDEX idx_hr_yuzhou_payroll_source_record_generation ON hr_yuzhou_payroll_source_record(tenant_id,park_id,generation_id,scheme);
CREATE OR REPLACE FUNCTION hr_yuzhou_payroll_source_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Yuzhou payroll source evidence is append-only'; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION hr_yuzhou_payroll_source_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Yuzhou payroll source operations cannot be deleted'; END IF;
 IF OLD.status<>'previewed' OR NEW.status NOT IN('committed','rejected')
  OR (to_jsonb(NEW)-ARRAY['status','generation','head_hash','database_name','database_oid','record_count','value_count','book_count','roster_sha256','catalog_sha256','book_set_sha256','committed_by','committed_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','generation','head_hash','database_name','database_oid','record_count','value_count','book_count','roster_sha256','catalog_sha256','book_set_sha256','committed_by','committed_at']) THEN
  RAISE EXCEPTION 'Yuzhou payroll source operation identity is immutable';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_yuzhou_payroll_source_operation_guard BEFORE UPDATE OR DELETE ON hr_yuzhou_payroll_source_operation FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_operation_guard();
CREATE TRIGGER trg_hr_yuzhou_payroll_source_generation_append_only BEFORE UPDATE OR DELETE ON hr_yuzhou_payroll_source_generation FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_append_only();
CREATE TRIGGER trg_hr_yuzhou_payroll_source_record_append_only BEFORE UPDATE OR DELETE ON hr_yuzhou_payroll_source_record FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_append_only();
CREATE TRIGGER trg_hr_yuzhou_payroll_source_value_append_only BEFORE UPDATE OR DELETE ON hr_yuzhou_payroll_source_value FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_append_only();
COMMIT;
