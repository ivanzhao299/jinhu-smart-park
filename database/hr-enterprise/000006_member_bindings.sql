-- Independent current identity bindings must reference a real same-enterprise member.
-- Historical/unbound employees keep nullable user_id; disabling members preserves facts.
BEGIN;
ALTER TABLE sys_user_business_scope_membership ADD COLUMN scope_key varchar(32) GENERATED ALWAYS AS(replace(scope_id::text,'-','')) STORED;
ALTER TABLE sys_user_business_scope_membership ADD CONSTRAINT uq_hr_enterprise_member_storage_key UNIQUE(tenant_id,scope_key,user_id);
ALTER TABLE hr_employee ADD CONSTRAINT fk_hr_enterprise_employee_member FOREIGN KEY(tenant_id,park_id,user_id) REFERENCES sys_user_business_scope_membership(tenant_id,scope_key,user_id);
ALTER TABLE rel_user_role ADD CONSTRAINT fk_hr_enterprise_role_member FOREIGN KEY(tenant_id,park_id,user_id) REFERENCES sys_user_business_scope_membership(tenant_id,scope_key,user_id);
COMMIT;
