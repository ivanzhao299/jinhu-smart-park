ALTER TABLE sys_code_rule
  DROP CONSTRAINT IF EXISTS ck_sys_code_rule_entity_type;

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
