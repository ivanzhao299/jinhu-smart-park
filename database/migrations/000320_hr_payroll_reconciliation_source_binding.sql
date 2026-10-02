BEGIN;
ALTER TABLE hr_payroll_reconciliation_source
  ADD CONSTRAINT uq_hr_reconciliation_source_batch UNIQUE(tenant_id,park_id,legacy_batch_id,id);
ALTER TABLE hr_payroll_reconciliation_run
  ADD COLUMN reconciliation_source_id uuid,
  ADD CONSTRAINT fk_hr_reconciliation_run_source FOREIGN KEY(tenant_id,park_id,legacy_batch_id,reconciliation_source_id)
    REFERENCES hr_payroll_reconciliation_source(tenant_id,park_id,legacy_batch_id,id);
CREATE INDEX idx_hr_reconciliation_run_source ON hr_payroll_reconciliation_run(tenant_id,park_id,reconciliation_source_id);
COMMIT;
