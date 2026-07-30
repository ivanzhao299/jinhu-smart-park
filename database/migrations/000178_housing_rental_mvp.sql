BEGIN;

CREATE TABLE IF NOT EXISTS biz_housing_lease (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_code varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  tenant_party_id uuid NOT NULL REFERENCES biz_party(id),
  occupancy_id uuid REFERENCES biz_property_occupancy(id),
  status varchar(32) NOT NULL DEFAULT 'draft',
  start_date date NOT NULL,
  end_date date NOT NULL,
  payment_cycle_months integer NOT NULL DEFAULT 1,
  billing_day integer NOT NULL DEFAULT 1,
  monthly_rent numeric(18,2) NOT NULL,
  deposit_amount numeric(18,2) NOT NULL DEFAULT 0,
  first_due_date date NOT NULL,
  tail_period_rule varchar(32) NOT NULL DEFAULT 'prorate',
  approval_note varchar(500),
  approved_by uuid,
  approved_at timestamptz,
  signature_file_id uuid,
  signed_at timestamptz,
  effective_at timestamptz,
  checkout_at timestamptz,
  termination_reason varchar(500),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_lease_status CHECK (status IN (
    'draft','pending_approval','pending_signature','active','expiring',
    'checkout_pending','terminated','void'
  )),
  CONSTRAINT ck_housing_lease_period CHECK (start_date < end_date),
  CONSTRAINT ck_housing_lease_cycle CHECK (payment_cycle_months BETWEEN 1 AND 120),
  CONSTRAINT ck_housing_lease_billing_day CHECK (billing_day BETWEEN 1 AND 28),
  CONSTRAINT ck_housing_lease_amount CHECK (monthly_rent >= 0 AND deposit_amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_lease_scope_code
  ON biz_housing_lease (tenant_id, park_id, lease_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_housing_lease_scope_status
  ON biz_housing_lease (tenant_id, park_id, status, start_date) WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS rel_housing_lease_occupant (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_id uuid NOT NULL REFERENCES biz_housing_lease(id),
  party_id uuid NOT NULL REFERENCES biz_party(id),
  occupant_role varchar(32) NOT NULL DEFAULT 'cohabitant',
  emergency_contact boolean NOT NULL DEFAULT false,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_lease_occupant
  ON rel_housing_lease_occupant (tenant_id, park_id, lease_id, party_id)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_housing_charge_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_id uuid NOT NULL REFERENCES biz_housing_lease(id),
  charge_type varchar(32) NOT NULL,
  billing_source varchar(32) NOT NULL DEFAULT 'fixed',
  cycle_months integer NOT NULL DEFAULT 1,
  amount numeric(18,2),
  unit_price numeric(18,6),
  meter_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_charge_source CHECK (billing_source IN ('fixed','energy_meter','manual')),
  CONSTRAINT ck_housing_charge_cycle CHECK (cycle_months BETWEEN 1 AND 120)
);

CREATE TABLE IF NOT EXISTS biz_housing_receivable (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_id uuid NOT NULL REFERENCES biz_housing_lease(id),
  charge_plan_id uuid REFERENCES biz_housing_charge_plan(id),
  source_type varchar(32) NOT NULL,
  source_id uuid,
  charge_type varchar(32) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  opening_reading numeric(18,6),
  closing_reading numeric(18,6),
  usage_amount numeric(18,6),
  unit_price numeric(18,6),
  amount numeric(18,2) NOT NULL,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  waived_amount numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'unpaid',
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_receivable_period CHECK (period_start < period_end),
  CONSTRAINT ck_housing_receivable_amount CHECK (amount >= 0 AND paid_amount >= 0 AND waived_amount >= 0),
  CONSTRAINT ck_housing_receivable_status CHECK (status IN ('unpaid','partial','paid','waived','void'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_receivable_source_period
  ON biz_housing_receivable (
    tenant_id, park_id, lease_id, charge_type, period_start, period_end, source_type,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_deleted = false AND status <> 'void';

CREATE TABLE IF NOT EXISTS biz_housing_ledger_entry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_id uuid NOT NULL REFERENCES biz_housing_lease(id),
  receivable_id uuid REFERENCES biz_housing_receivable(id),
  entry_type varchar(32) NOT NULL,
  charge_type varchar(32) NOT NULL,
  amount numeric(18,2) NOT NULL,
  payment_method varchar(32),
  transaction_reference varchar(100),
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  source_id uuid,
  status varchar(32) NOT NULL DEFAULT 'confirmed',
  reason varchar(500) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_ledger_type CHECK (entry_type IN (
    'charge','payment','refund','waiver','deposit_receipt','deposit_deduction','deposit_refund'
  )),
  CONSTRAINT ck_housing_ledger_amount CHECK (amount > 0),
  CONSTRAINT ck_housing_ledger_status CHECK (status IN ('confirmed','void'))
);

CREATE TABLE IF NOT EXISTS biz_housing_handover (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  lease_id uuid NOT NULL REFERENCES biz_housing_lease(id),
  handover_type varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  handover_at timestamptz,
  item_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  meter_readings jsonb NOT NULL DEFAULT '[]'::jsonb,
  credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_file_id uuid,
  damage_amount numeric(18,2) NOT NULL DEFAULT 0,
  unsettled_amount numeric(18,2) NOT NULL DEFAULT 0,
  deposit_deduction_amount numeric(18,2) NOT NULL DEFAULT 0,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_handover_type CHECK (handover_type IN ('move_in','move_out')),
  CONSTRAINT ck_housing_handover_status CHECK (status IN ('draft','completed')),
  CONSTRAINT ck_housing_handover_amount CHECK (
    damage_amount >= 0 AND unsettled_amount >= 0 AND deposit_deduction_amount >= 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_handover_type
  ON biz_housing_handover (tenant_id, park_id, lease_id, handover_type)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_housing_purchase (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  purchase_code varchar(64) NOT NULL,
  unit_id uuid REFERENCES biz_unit(id),
  vendor_name varchar(200) NOT NULL,
  purchase_date date NOT NULL,
  cost_category varchar(64) NOT NULL,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  approval_status varchar(32) NOT NULL DEFAULT 'draft',
  payment_status varchar(32) NOT NULL DEFAULT 'unpaid',
  receipt_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_purchase_amount CHECK (total_amount >= 0),
  CONSTRAINT ck_housing_purchase_approval CHECK (approval_status IN ('draft','approved','rejected','void')),
  CONSTRAINT ck_housing_purchase_payment CHECK (payment_status IN ('unpaid','paid','refunded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_housing_purchase_scope_code
  ON biz_housing_purchase (tenant_id, park_id, purchase_code) WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_housing_purchase_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  purchase_id uuid NOT NULL REFERENCES biz_housing_purchase(id),
  item_name varchar(200) NOT NULL,
  quantity numeric(18,3) NOT NULL,
  unit varchar(20),
  unit_price numeric(18,2) NOT NULL,
  amount numeric(18,2) NOT NULL,
  transferred_receivable_id uuid REFERENCES biz_housing_receivable(id),
  create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid, update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_housing_purchase_item_amount CHECK (quantity > 0 AND unit_price >= 0 AND amount >= 0)
);

WITH housing_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  ) VALUES (
    'housing_rental', '住房出租', 'business', '集中式公寓和人才公寓整套长租运营',
    '/housing', 'house', 1, 70, 'Housing rental MVP module'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name, description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix, icon = EXCLUDED.icon, status = 1,
    sort_no = EXCLUDED.sort_no, update_time = now()
  RETURNING id
), module_row AS (
  SELECT id FROM housing_module
  UNION SELECT id FROM sys_module WHERE module_code = 'housing_rental' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT plan.id, module_row.id, 1, now(), now(), false, 1, 'Housing rental MVP module plan grant'
FROM sys_plan plan CROSS JOIN module_row
WHERE plan.plan_code IN ('PROFESSIONAL','ENTERPRISE','GROUP') AND plan.is_deleted = false
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE
SET status = 1, update_time = now(), remark = EXCLUDED.remark;

WITH module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'housing_rental' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT '10000001','20000001',id,true,'enabled',now(),now(),false,1,'Enable housing rental for default UAT tenant'
FROM module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE
SET enabled = true, status = 'enabled', update_time = now(), remark = EXCLUDED.remark;

INSERT INTO sys_module_registry (
  tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
  permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
) VALUES (
  '10000001','20000001','housing_rental','住房出租','business','1.0.0','/housing',
  'housing:dashboard:read','house',70,true,'enabled',now(),now(),false,1,'Housing rental MVP registry'
)
ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE
SET module_name = EXCLUDED.module_name, route_path = EXCLUDED.route_path,
    permission_code = EXCLUDED.permission_code, status = 'enabled', update_time = now();

WITH permission_rows(code, name, resource, action, api_method, api_path, sort_no) AS (
  VALUES
    ('housing:dashboard:read','住房出租看板','biz.housing_dashboard','read','GET','/api/v1/housing/dashboard',7001),
    ('housing:tenant:manage','住房租客管理','biz.party','manage','POST','/api/v1/housing/tenants',7002),
    ('housing:lease:read','住房租约读取','biz.housing_lease','read','GET','/api/v1/housing/leases',7003),
    ('housing:lease:create','住房租约创建','biz.housing_lease','create','POST','/api/v1/housing/leases',7004),
    ('housing:lease:approve','住房租约审批','biz.housing_lease','approve','POST','/api/v1/housing/leases/:id/approve',7005),
    ('housing:lease:sign','住房租约签署登记','biz.housing_lease','sign','POST','/api/v1/housing/leases/:id/sign',7006),
    ('housing:lease:activate','住房租约生效','biz.housing_lease','activate','POST','/api/v1/housing/leases/:id/activate',7007),
    ('housing:lease:checkout','住房退租结算','biz.housing_lease','checkout','POST','/api/v1/housing/leases/:id/checkout',7008),
    ('housing:handover:manage','住房交割管理','biz.housing_handover','manage','POST','/api/v1/housing/leases/:id/handovers',7009),
    ('housing:finance:read','住房财务读取','biz.housing_ledger','read','GET','/api/v1/housing/leases/:id',7010),
    ('housing:finance:register','住房收退款登记','biz.housing_ledger','register','POST','/api/v1/housing/leases/:id/ledger',7011),
    ('housing:finance:waive','住房费用减免','biz.housing_ledger','waive','POST','/api/v1/housing/leases/:id/ledger',7012),
    ('housing:billing:generate','住房周期账单生成','biz.housing_receivable','generate','POST','/api/v1/housing/leases/:id/generate-bills',7013),
    ('housing:purchase:read','住房采购读取','biz.housing_purchase','read','GET','/api/v1/housing/purchases',7014),
    ('housing:purchase:manage','住房采购管理','biz.housing_purchase','manage','POST','/api/v1/housing/purchases',7015),
    ('housing:purchase:transfer','住房采购转收费','biz.housing_purchase','transfer','POST','/api/v1/housing/purchases/:id/transfer',7016),
    ('housing:repair:manage','住房报修代录','biz.work_order','manage','POST','/api/v1/housing/leases/:id/repairs',7017)
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, resource, action, permission_type, status,
  perm_type, level, api_method, api_path, frontend_route, sort_no,
  is_system, is_builtin, is_tenant_custom, visible,
  create_time, update_time, is_deleted, version
)
SELECT uuid_generate_v4(),'10000001','20000001',code,name,resource,action,'api','enabled',
       40,3,api_method,api_path,'/housing',sort_no,true,true,false,true,now(),now(),false,1
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1 FROM sys_permission p
  WHERE p.tenant_id='10000001' AND p.park_id='20000001'
    AND p.code=permission_rows.code AND p.is_deleted=false
);

WITH target_permissions AS (
  SELECT id FROM sys_permission
  WHERE tenant_id='10000001' AND park_id='20000001'
    AND code LIKE 'housing:%' AND is_deleted=false
), target_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id='10000001' AND park_id='20000001'
    AND code IN ('SUPER_ADMIN','OPERATIONS_OWNER','PROPERTY_MANAGER') AND is_deleted=false
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT '10000001','20000001',role.id,permission.id,now(),now(),false,1,'Housing rental MVP permission grant'
FROM target_roles role CROSS JOIN target_permissions permission
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm existing
  WHERE existing.tenant_id='10000001' AND existing.park_id='20000001'
    AND existing.role_id=role.id AND existing.permission_id=permission.id AND existing.is_deleted=false
);

COMMIT;
