CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE sys_code_rule
  ADD COLUMN IF NOT EXISTS entity_type varchar(64),
  ADD COLUMN IF NOT EXISTS pattern varchar(128) NOT NULL DEFAULT '{PREFIX}{SEQ:6}',
  ADD COLUMN IF NOT EXISTS current_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reset_policy varchar(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS example_code varchar(128);

UPDATE sys_code_rule
SET
  entity_type = COALESCE(
    entity_type,
    CASE
      WHEN target_entity IN (
        'park',
        'building',
        'floor',
        'room',
        'unit',
        'zone',
        'asset',
        'device',
        'camera',
        'iot_point',
        'robot',
        'cleaning_robot',
        'inspection_robot',
        'workorder',
        'contract',
        'bill'
      ) THEN target_entity
      ELSE NULL
    END
  ),
  current_seq = COALESCE(NULLIF(current_seq, 0), current_sequence, 0),
  reset_policy = COALESCE(NULLIF(reset_policy, ''), reset_strategy, 'none'),
  example_code = COALESCE(example_code, sample_code)
WHERE entity_type IS NULL
   OR current_seq = 0
   OR reset_policy IS NULL
   OR example_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_code_rule_entity_type'
      AND conrelid = 'sys_code_rule'::regclass
  ) THEN
    ALTER TABLE sys_code_rule
      ADD CONSTRAINT ck_sys_code_rule_entity_type CHECK (
        entity_type IN (
          'park',
          'building',
          'floor',
          'room',
          'unit',
          'zone',
          'asset',
          'device',
          'camera',
          'iot_point',
          'robot',
          'cleaning_robot',
          'inspection_robot',
          'workorder',
          'workorder_log',
          'safety_inspect_point',
          'safety_inspect_template',
          'safety_inspect_plan',
          'safety_inspect_task',
          'safety_hazard',
          'safety_hazard_log',
          'safety_emergency_contact',
          'safety_emergency_plan',
          'safety_emergency_event',
          'safety_emergency_log',
          'safety_work_permit',
          'safety_work_permit_log',
          'leasing_lead',
          'contract',
          'contract_change',
          'renewal_contract',
          'checkout',
          'refund',
          'bill',
          'receivable',
          'payment',
          'invoice',
          'waiver'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_sys_code_rule_reset_policy'
      AND conrelid = 'sys_code_rule'::regclass
  ) THEN
    ALTER TABLE sys_code_rule
      ADD CONSTRAINT ck_sys_code_rule_reset_policy CHECK (reset_policy IN ('none', 'daily', 'monthly', 'yearly'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_code_rule_scope_entity_active
  ON sys_code_rule (tenant_id, park_id, entity_type)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_code_rule_scope_entity
  ON sys_code_rule (tenant_id, park_id, entity_type, is_deleted);

ALTER TABLE biz_park ADD COLUMN IF NOT EXISTS code varchar(64);
ALTER TABLE biz_building ADD COLUMN IF NOT EXISTS code varchar(64);
ALTER TABLE biz_floor ADD COLUMN IF NOT EXISTS code varchar(64);
ALTER TABLE biz_unit ADD COLUMN IF NOT EXISTS code varchar(64);

UPDATE biz_park SET code = park_code WHERE code IS NULL;
UPDATE biz_building SET code = building_code WHERE code IS NULL;
UPDATE biz_floor SET code = floor_code WHERE code IS NULL;
UPDATE biz_unit SET code = unit_code WHERE code IS NULL;
