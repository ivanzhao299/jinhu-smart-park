-- Complete apartment document content, signing evidence and configurable defaults.
BEGIN;

CREATE TABLE biz_apartment_setting (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  default_application_reason varchar(1000) NOT NULL,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);
CREATE UNIQUE INDEX uq_apartment_setting_scope
  ON biz_apartment_setting(tenant_id,park_id) WHERE is_deleted=false;

ALTER TABLE biz_apartment_document_template
  ADD COLUMN title varchar(200),
  ADD COLUMN content_html text,
  ADD COLUMN signature_required boolean NOT NULL DEFAULT true;

UPDATE biz_apartment_document_template
SET title=COALESCE(title,document_type),content_html=COALESCE(content_html,'<p>模板正文待维护</p>')
WHERE title IS NULL OR content_html IS NULL;
ALTER TABLE biz_apartment_document_template ALTER COLUMN title SET NOT NULL;
ALTER TABLE biz_apartment_document_template ALTER COLUMN content_html SET NOT NULL;

ALTER TABLE biz_apartment_document DROP CONSTRAINT ck_apartment_document_signature;
ALTER TABLE biz_apartment_document
  ADD COLUMN document_no varchar(64),
  ADD COLUMN title varchar(200),
  ADD COLUMN content_html text,
  ADD COLUMN status varchar(24) NOT NULL DEFAULT 'pending_signature',
  ADD COLUMN signature_method varchar(16),
  ADD COLUMN signer_user_id uuid,
  ADD COLUMN signer_name varchar(100),
  ADD COLUMN signature_statement varchar(500),
  ADD COLUMN signature_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE biz_apartment_document
SET document_no='LEGACY-'||replace(id::text,'-',''),
    title=COALESCE(title,document_type),
    content_html=COALESCE(content_html,'<p>历史文书正文未生成</p>'),
    status=CASE WHEN signed_file_id IS NULL THEN 'pending_signature' ELSE 'paper_signed' END,
    signature_method=CASE WHEN signed_file_id IS NULL THEN NULL ELSE 'paper' END;
ALTER TABLE biz_apartment_document ALTER COLUMN document_no SET NOT NULL;
ALTER TABLE biz_apartment_document ALTER COLUMN title SET NOT NULL;
ALTER TABLE biz_apartment_document ALTER COLUMN content_html SET NOT NULL;
CREATE UNIQUE INDEX uq_apartment_document_no
  ON biz_apartment_document(tenant_id,park_id,document_no) WHERE is_deleted=false;
ALTER TABLE biz_apartment_document ADD CONSTRAINT ck_apartment_document_status
  CHECK(status IN ('pending_signature','online_signed','paper_signed','void'));
ALTER TABLE biz_apartment_document ADD CONSTRAINT ck_apartment_document_signature_v2 CHECK (
  (status='pending_signature' AND signed_at IS NULL AND signature_method IS NULL)
  OR (status='online_signed' AND signed_at IS NOT NULL AND signature_method='online' AND signed_sha256 IS NOT NULL AND signer_name IS NOT NULL)
  OR (status='paper_signed' AND signed_at IS NOT NULL AND signature_method='paper' AND signed_file_id IS NOT NULL AND signed_sha256 IS NOT NULL)
  OR (status='void' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
);

COMMIT;
