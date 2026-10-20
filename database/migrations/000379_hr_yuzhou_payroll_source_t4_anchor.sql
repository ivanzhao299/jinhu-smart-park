BEGIN;
-- One retained T4 archive can supply several independent monthly baselines.
-- No original payroll facts, T4 receipts, maps or frozen hashes are rewritten.
ALTER TABLE hr_yuzhou_payroll_source_generation DROP CONSTRAINT uq_hr_yuzhou_payroll_generation_batch;
ALTER TABLE hr_yuzhou_payroll_source_generation ADD CONSTRAINT uq_hr_yuzhou_payroll_generation_batch_month
  UNIQUE(tenant_id,park_id,legacy_batch_id,period_month);
-- This connector serves one Yuzhou source per park/month. Changing its label
-- must not create a second current roster for the same operational month.
CREATE UNIQUE INDEX uq_hr_yuzhou_payroll_source_current_month
  ON hr_yuzhou_payroll_source_head(tenant_id,park_id,source_system,period_month);
COMMIT;
