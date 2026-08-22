ALTER TABLE migration_batch_item
  DROP CONSTRAINT IF EXISTS ck_migration_batch_item_counts;
ALTER TABLE migration_batch_item
  ADD CONSTRAINT ck_migration_batch_item_counts
  CHECK (
    extracted_count>=0 AND valid_count>=0 AND loaded_count>=0 AND rejected_count>=0
    AND valid_count+rejected_count<=extracted_count
    AND loaded_count<=valid_count
  );

ALTER TABLE migration_batch_item
  ADD CONSTRAINT uq_migration_batch_item_id_batch UNIQUE(id,batch_id);

ALTER TABLE migration_error
  DROP CONSTRAINT IF EXISTS migration_error_batch_item_id_fkey;
ALTER TABLE migration_error
  ADD CONSTRAINT fk_migration_error_item_batch
  FOREIGN KEY(batch_item_id,batch_id) REFERENCES migration_batch_item(id,batch_id);

ALTER TABLE migration_check
  DROP CONSTRAINT IF EXISTS migration_check_batch_item_id_fkey;
ALTER TABLE migration_check
  ADD CONSTRAINT fk_migration_check_item_batch
  FOREIGN KEY(batch_item_id,batch_id) REFERENCES migration_batch_item(id,batch_id);
