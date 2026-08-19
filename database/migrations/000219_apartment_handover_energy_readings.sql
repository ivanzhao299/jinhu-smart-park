-- Link apartment handover meter snapshots to the canonical energy reading ledger.
ALTER TABLE energy_reading
  ADD COLUMN IF NOT EXISTS source_domain varchar(32),
  ADD COLUMN IF NOT EXISTS source_type varchar(64),
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uk_energy_reading_source
  ON energy_reading (tenant_id, park_id, meter_id, source_domain, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_energy_reading_source
  ON energy_reading (tenant_id, park_id, source_domain, source_type, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE energy_reading DROP CONSTRAINT IF EXISTS ck_energy_reading_source_complete;
ALTER TABLE energy_reading ADD CONSTRAINT ck_energy_reading_source_complete CHECK (
  (source_domain IS NULL AND source_type IS NULL AND source_id IS NULL)
  OR (length(btrim(source_domain)) > 0 AND length(btrim(source_type)) > 0 AND source_id IS NOT NULL)
);
