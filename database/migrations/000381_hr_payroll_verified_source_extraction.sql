BEGIN;
-- A trusted offline extractor registers source completeness, not business approval.
-- No HTTP endpoint creates these records. The public importer may only consume
-- an exact scope/month/content match after its ordinary authority/mapping checks.
CREATE TABLE hr_yuzhou_payroll_source_extraction (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 source_system varchar(64) NOT NULL CHECK(source_system='yuzhou-v10'),
 source_instance varchar(128) NOT NULL, period_month date NOT NULL CHECK(extract(day FROM period_month)=1),
 evidence_sha256 varchar(64) NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 books_sha256 varchar(64) NOT NULL CHECK(books_sha256 ~ '^[0-9a-f]{64}$'),
 book_set_sha256 varchar(64) NOT NULL CHECK(book_set_sha256 ~ '^[0-9a-f]{64}$'),
 roster_sha256 varchar(64) NOT NULL CHECK(roster_sha256 ~ '^[0-9a-f]{64}$'),
 catalog_sha256 varchar(64) NOT NULL CHECK(catalog_sha256 ~ '^[0-9a-f]{64}$'),
 manifest_sha256 varchar(64) NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 mapping_sha256 varchar(64) NOT NULL CHECK(mapping_sha256 ~ '^[0-9a-f]{64}$'),
 extractor_sha256 varchar(64) NOT NULL CHECK(extractor_sha256 ~ '^[0-9a-f]{64}$'),
 file_sha256 jsonb NOT NULL CHECK(jsonb_typeof(file_sha256)='object'),
 record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 5000),
 value_count integer NOT NULL CHECK(value_count BETWEEN 1 AND 200000),
 book_count integer NOT NULL CHECK(book_count BETWEEN 1 AND 35),
 registered_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,source_instance,period_month,evidence_sha256,books_sha256,extractor_sha256)
);
CREATE INDEX idx_hr_payroll_extraction_match ON hr_yuzhou_payroll_source_extraction
 (tenant_id,park_id,source_instance,period_month,evidence_sha256,books_sha256);
CREATE TRIGGER trg_hr_payroll_extraction_immutable BEFORE UPDATE OR DELETE
 ON hr_yuzhou_payroll_source_extraction FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_payroll_source_append_only();
REVOKE ALL ON hr_yuzhou_payroll_source_extraction FROM PUBLIC;
COMMIT;
