BEGIN;
ALTER TABLE hr_incremental_import_item DROP CONSTRAINT ck_hr_incremental_import_item_domain;
ALTER TABLE hr_incremental_import_item ADD CONSTRAINT ck_hr_incremental_import_item_domain
 CHECK(domain IN ('organization','position','employee','profile','contract'));
COMMIT;
