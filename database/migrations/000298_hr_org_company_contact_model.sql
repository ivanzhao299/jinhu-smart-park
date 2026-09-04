BEGIN;

ALTER TABLE sys_org
  ADD COLUMN IF NOT EXISTS contact_address varchar(500),
  ADD COLUMN IF NOT EXISTS contact_email varchar(254),
  ADD COLUMN IF NOT EXISTS legacy_company_manager_reference varchar(50);

ALTER TABLE sys_org
  ADD CONSTRAINT ck_sys_org_contact_address_nonblank
    CHECK (contact_address IS NULL OR btrim(contact_address) <> ''),
  ADD CONSTRAINT ck_sys_org_contact_email_nonblank
    CHECK (contact_email IS NULL OR btrim(contact_email) <> ''),
  ADD CONSTRAINT ck_sys_org_legacy_company_manager_reference_nonblank
    CHECK (legacy_company_manager_reference IS NULL OR btrim(legacy_company_manager_reference) <> '');

COMMENT ON COLUMN sys_org.contact_address IS
  'Organization contact address. This does not assert a legal or registered address.';
COMMENT ON COLUMN sys_org.contact_email IS
  'Organization business contact email. It is not an employee personal email.';
COMMENT ON COLUMN sys_org.legacy_company_manager_reference IS
  'Protected unresolved Yuzhou company.master reference. It must not populate leader_user_id without reviewed semantic and identity binding.';

COMMIT;
