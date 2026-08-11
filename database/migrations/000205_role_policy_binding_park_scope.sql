-- Role data-scope and field-policy definitions remain tenant-wide, while bindings
-- are independently replaceable in each park for shared tenant roles.

DROP INDEX IF EXISTS uq_rel_role_data_scope_active;

CREATE UNIQUE INDEX uq_rel_role_data_scope_active
  ON rel_role_data_scope (tenant_id, park_id, role_id, rule_id)
  WHERE is_deleted = false;

DROP INDEX IF EXISTS uq_rel_role_field_policy_active;

CREATE UNIQUE INDEX uq_rel_role_field_policy_active
  ON rel_role_field_policy (tenant_id, park_id, role_id, field_policy_id)
  WHERE is_deleted = false;
