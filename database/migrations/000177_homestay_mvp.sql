CREATE TABLE IF NOT EXISTS biz_homestay_rate_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  base_daily_rate numeric(18,2) NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'CNY',
  free_cancel_before_hours integer NOT NULL DEFAULT 24,
  late_cancel_fee_type varchar(16) NOT NULL DEFAULT 'fixed',
  late_cancel_fee_value numeric(18,2) NOT NULL DEFAULT 0,
  checkout_requires_inspection boolean NOT NULL DEFAULT false,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_rate_nonnegative CHECK (
    base_daily_rate >= 0 AND free_cancel_before_hours >= 0 AND late_cancel_fee_value >= 0
  ),
  CONSTRAINT ck_homestay_cancel_fee_type CHECK (late_cancel_fee_type IN ('fixed', 'percentage')),
  CONSTRAINT ck_homestay_cancel_percentage CHECK (
    late_cancel_fee_type <> 'percentage' OR late_cancel_fee_value <= 100
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_rate_config_scope_unit
  ON biz_homestay_rate_config (tenant_id, park_id, unit_id)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_rate_override (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  business_date date NOT NULL,
  daily_rate numeric(18,2) NOT NULL,
  reason varchar(500) NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_override_rate_nonnegative CHECK (daily_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_rate_override_scope_date
  ON biz_homestay_rate_override (tenant_id, park_id, unit_id, business_date)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_booking (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_code varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  booker_party_id uuid REFERENCES biz_party(id),
  occupancy_id uuid REFERENCES biz_property_occupancy(id),
  status varchar(32) NOT NULL DEFAULT 'draft',
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  expected_arrival_time timestamptz,
  actual_check_in_time timestamptz,
  actual_check_out_time timestamptz,
  source_type varchar(32) NOT NULL DEFAULT 'direct',
  channel_name varchar(100),
  external_order_no varchar(100),
  channel_sync_status varchar(32) NOT NULL DEFAULT 'not_applicable',
  guest_count integer NOT NULL DEFAULT 1,
  currency varchar(8) NOT NULL DEFAULT 'CNY',
  room_amount numeric(18,2) NOT NULL DEFAULT 0,
  adjustment_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  cancellation_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancel_reason varchar(500),
  cancelled_at timestamptz,
  no_show_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_booking_status CHECK (
    status IN ('draft', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')
  ),
  CONSTRAINT ck_homestay_booking_period CHECK (arrival_date < departure_date),
  CONSTRAINT ck_homestay_booking_source CHECK (source_type IN ('direct', 'manual', 'ota_reserved')),
  CONSTRAINT ck_homestay_booking_guest_count CHECK (guest_count > 0),
  CONSTRAINT ck_homestay_booking_amount CHECK (room_amount >= 0 AND total_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_booking_scope_code
  ON biz_homestay_booking (tenant_id, park_id, booking_code)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_booking_scope_external
  ON biz_homestay_booking (tenant_id, park_id, channel_name, external_order_no)
  WHERE is_deleted = false AND external_order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homestay_booking_scope_dates
  ON biz_homestay_booking (tenant_id, park_id, arrival_date, departure_date, status)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_booking_night (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  business_date date NOT NULL,
  base_rate numeric(18,2) NOT NULL,
  override_rate numeric(18,2),
  final_rate numeric(18,2) NOT NULL,
  price_source varchar(32) NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_night_rate CHECK (base_rate >= 0 AND final_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_booking_night_scope_date
  ON biz_homestay_booking_night (tenant_id, park_id, booking_id, business_date)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS rel_homestay_booking_guest (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  party_id uuid NOT NULL REFERENCES biz_party(id),
  is_primary boolean NOT NULL DEFAULT false,
  verification_status varchar(32) NOT NULL DEFAULT 'unverified',
  verified_by uuid,
  verified_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_guest_verification CHECK (
    verification_status IN ('unverified', 'verified', 'rejected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_booking_guest_scope
  ON rel_homestay_booking_guest (tenant_id, park_id, booking_id, party_id)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_stay_credential (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  credential_type varchar(32) NOT NULL,
  credential_label varchar(100) NOT NULL,
  credential_reference varchar(100),
  lock_device_id varchar(100),
  temporary_code_task_status varchar(32) NOT NULL DEFAULT 'not_applicable',
  status varchar(32) NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_credential_type CHECK (credential_type IN ('key', 'card', 'voucher')),
  CONSTRAINT ck_homestay_credential_status CHECK (status IN ('issued', 'returned', 'lost', 'void'))
);

CREATE INDEX IF NOT EXISTS idx_homestay_credential_scope_booking
  ON biz_homestay_stay_credential (tenant_id, park_id, booking_id, status)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_ledger_entry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  entry_type varchar(32) NOT NULL,
  charge_type varchar(32) NOT NULL,
  amount numeric(18,2) NOT NULL,
  payment_method varchar(32),
  payment_channel varchar(64),
  transaction_reference varchar(100),
  status varchar(32) NOT NULL DEFAULT 'confirmed',
  reason varchar(500) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_ledger_type CHECK (entry_type IN ('charge', 'payment', 'refund', 'waiver')),
  CONSTRAINT ck_homestay_ledger_amount CHECK (amount > 0),
  CONSTRAINT ck_homestay_ledger_status CHECK (status IN ('registered', 'confirmed', 'void'))
);

CREATE INDEX IF NOT EXISTS idx_homestay_ledger_scope_booking
  ON biz_homestay_ledger_entry (tenant_id, park_id, booking_id, occurred_at)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_turnover_task (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  occupancy_id uuid REFERENCES biz_property_occupancy(id),
  status varchar(32) NOT NULL DEFAULT 'pending',
  assignee_id uuid,
  assignee_name varchar(100),
  started_at timestamptz,
  completed_at timestamptz,
  inspected_at timestamptz,
  photo_file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  consumables jsonb NOT NULL DEFAULT '[]'::jsonb,
  exception_description varchar(1000),
  linked_work_order_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_homestay_turnover_status CHECK (
    status IN ('pending', 'cleaning', 'inspection', 'completed', 'exception')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_homestay_turnover_scope_booking
  ON biz_homestay_turnover_task (tenant_id, park_id, booking_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_homestay_turnover_scope_status
  ON biz_homestay_turnover_task (tenant_id, park_id, status, create_time)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_homestay_booking_action_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  booking_id uuid NOT NULL REFERENCES biz_homestay_booking(id),
  action varchar(32) NOT NULL,
  before_status varchar(32),
  after_status varchar(32),
  reason varchar(500),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_id uuid NOT NULL,
  operator_name varchar(100) NOT NULL,
  action_time timestamptz NOT NULL DEFAULT now(),
  create_time timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homestay_action_scope_booking_time
  ON biz_homestay_booking_action_log (tenant_id, park_id, booking_id, action_time DESC);

WITH homestay_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  ) VALUES (
    'homestay', '民宿管理', 'business', '集中式公寓整套房源短租运营', '/homestay', 'hotel', 1, 69,
    'Homestay MVP module'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM homestay_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'homestay' AND is_deleted = false LIMIT 1
),
target_plans AS (
  SELECT id FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP') AND is_deleted = false
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT target_plans.id, module_row.id, 1, now(), now(), false, 1, 'Homestay MVP module plan grant'
FROM target_plans CROSS JOIN module_row
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1, update_time = now(), remark = EXCLUDED.remark;

WITH module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'homestay' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT '10000001', '20000001', module_row.id, true, 'enabled', now(), now(), false, 1, 'Enable homestay for default UAT tenant'
FROM module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  enabled = true, status = 'enabled', update_time = now(), remark = EXCLUDED.remark;

INSERT INTO sys_module_registry (
  tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
  permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
) VALUES (
  '10000001', '20000001', 'homestay', '民宿管理', 'business', '1.0.0', '/homestay',
  'homestay:dashboard:read', 'hotel', 69, true, 'enabled', now(), now(), false, 1, 'Homestay MVP registry'
)
ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  route_path = EXCLUDED.route_path,
  permission_code = EXCLUDED.permission_code,
  status = 'enabled',
  update_time = now();

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('homestay:dashboard:read', '民宿运营看板', 'biz.homestay_dashboard', 'read', 'GET', '/api/v1/homestay/dashboard', '/homestay', 6901),
    ('homestay:rate:read', '民宿价格读取', 'biz.homestay_rate', 'read', 'GET', '/api/v1/homestay/rates', '/homestay/rates', 6902),
    ('homestay:rate:manage', '民宿价格管理', 'biz.homestay_rate', 'manage', 'PUT', '/api/v1/homestay/rates/:unitId', '/homestay/rates', 6903),
    ('homestay:booking:read', '民宿订单读取', 'biz.homestay_booking', 'read', 'GET', '/api/v1/homestay/bookings', '/homestay/bookings', 6904),
    ('homestay:booking:create', '民宿订单创建', 'biz.homestay_booking', 'create', 'POST', '/api/v1/homestay/bookings', '/homestay/bookings', 6905),
    ('homestay:booking:confirm', '民宿订单确认', 'biz.homestay_booking', 'confirm', 'POST', '/api/v1/homestay/bookings/:id/confirm', '/homestay/bookings', 6906),
    ('homestay:booking:cancel', '民宿订单取消', 'biz.homestay_booking', 'cancel', 'POST', '/api/v1/homestay/bookings/:id/cancel', '/homestay/bookings', 6907),
    ('homestay:booking:reschedule', '民宿订单改期', 'biz.homestay_booking', 'reschedule', 'POST', '/api/v1/homestay/bookings/:id/reschedule', '/homestay/bookings', 6908),
    ('homestay:stay:manage', '民宿入住退房管理', 'biz.homestay_stay', 'manage', 'POST', '/api/v1/homestay/bookings/:id/check-in', '/homestay/operations', 6909),
    ('homestay:finance:read', '民宿财务读取', 'biz.homestay_ledger', 'read', 'GET', '/api/v1/homestay/bookings/:id/ledger', '/homestay/bookings', 6910),
    ('homestay:finance:register', '民宿收退款登记', 'biz.homestay_ledger', 'register', 'POST', '/api/v1/homestay/bookings/:id/ledger', '/homestay/bookings', 6911),
    ('homestay:finance:waive', '民宿费用减免', 'biz.homestay_ledger', 'waive', 'POST', '/api/v1/homestay/bookings/:id/ledger', '/homestay/bookings', 6912),
    ('homestay:turnover:read', '民宿保洁任务读取', 'biz.homestay_turnover', 'read', 'GET', '/api/v1/homestay/turnovers', '/homestay/operations', 6913),
    ('homestay:turnover:execute', '民宿保洁任务执行', 'biz.homestay_turnover', 'execute', 'POST', '/api/v1/homestay/turnovers/:id/actions/:action', '/homestay/operations', 6914)
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, resource, action,
  permission_type, status, perm_type, level, api_method, api_path, frontend_route, sort_no,
  is_system, is_builtin, is_tenant_custom, visible,
  create_time, update_time, is_deleted, version
)
SELECT
  uuid_generate_v4(), '10000001', '20000001', code, name, resource, action,
  'api', 'enabled', 40, 3, api_method, api_path, frontend_route, sort_no,
  true, true, false, true, now(), now(), false, 1
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1 FROM sys_permission existing
  WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
    AND existing.code = permission_rows.code AND existing.is_deleted = false
);

WITH role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES
    ('SUPER_ADMIN'), ('OPERATIONS_OWNER'), ('PROPERTY_MANAGER')
  ) roles(role_code)
  CROSS JOIN (VALUES
    ('homestay:dashboard:read'), ('homestay:rate:read'), ('homestay:rate:manage'),
    ('homestay:booking:read'), ('homestay:booking:create'), ('homestay:booking:confirm'),
    ('homestay:booking:cancel'), ('homestay:booking:reschedule'), ('homestay:stay:manage'),
    ('homestay:finance:read'), ('homestay:finance:register'), ('homestay:finance:waive'),
    ('homestay:turnover:read'), ('homestay:turnover:execute')
  ) permissions(permission_code)
  UNION ALL
  SELECT role_code, permission_code
  FROM (VALUES ('PROPERTY_STAFF')) roles(role_code)
  CROSS JOIN (VALUES
    ('homestay:dashboard:read'), ('homestay:rate:read'), ('homestay:booking:read'),
    ('homestay:booking:create'), ('homestay:booking:confirm'), ('homestay:stay:manage'),
    ('homestay:finance:read'), ('homestay:finance:register'),
    ('homestay:turnover:read'), ('homestay:turnover:execute')
  ) permissions(permission_code)
  UNION ALL
  SELECT 'AUDITOR', permission_code
  FROM (VALUES
    ('homestay:dashboard:read'), ('homestay:rate:read'), ('homestay:booking:read'),
    ('homestay:finance:read'), ('homestay:turnover:read')
  ) permissions(permission_code)
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  '10000001', '20000001', role.id, permission.id,
  now(), now(), false, 1, 'Homestay MVP permission grant'
FROM role_permissions
JOIN sys_role role
  ON role.tenant_id = '10000001' AND role.park_id = '20000001'
 AND role.code = role_permissions.role_code AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = '10000001' AND permission.park_id = '20000001'
 AND permission.code = role_permissions.permission_code AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm existing
  WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
    AND existing.role_id = role.id AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
