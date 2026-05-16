ALTER TABLE sys_field_policy
  DROP CONSTRAINT IF EXISTS ck_sys_field_policy_mask_rule;

ALTER TABLE sys_field_policy
  ADD CONSTRAINT ck_sys_field_policy_mask_rule CHECK (
    mask_rule IS NULL OR mask_rule IN ('mobile', 'email', 'id_card', 'bank_account', 'amount', 'custom', 'file_name', 'default')
  );
