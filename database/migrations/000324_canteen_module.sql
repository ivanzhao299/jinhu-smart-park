-- 000324_canteen_module.sql
-- 园区餐厅（食堂承包经营）模块 M0 基础：biz_canteen_* 数据模型。
-- 严格对齐 docs/canteen/canteen-design-baseline.md 第 4/5 节与 docs/canteen/data-model.md。
-- 自包含：仅依赖 uuid-ossp 扩展；跨模块引用（party/users/files）为逻辑外键，不建物理 FK，
-- 便于在隔离的 canteen-dev-pg 空库上独立执行 up/down/up。

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. biz_canteen_outlets 餐厅/档口
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_outlets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  outlet_no varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  outlet_type varchar(16) NOT NULL,
  contractor_id varchar(64) NOT NULL,
  location varchar(256),
  business_hours varchar(128),
  status varchar(16) NOT NULL DEFAULT 'open',
  manager_user_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_outlets_status CHECK (status IN ('open','suspended','closed')),
  CONSTRAINT ck_canteen_outlets_type CHECK (outlet_type IN ('dine_in','stall'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_outlets_scope_no
  ON biz_canteen_outlets (tenant_id, outlet_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_outlets_scope_contractor
  ON biz_canteen_outlets (tenant_id, park_id, contractor_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_outlets_scope_status
  ON biz_canteen_outlets (tenant_id, park_id, status) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 2. biz_canteen_categories 品类
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  name varchar(64) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(8) NOT NULL DEFAULT 'on',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_categories_status CHECK (status IN ('on','off'))
);
CREATE INDEX IF NOT EXISTS idx_canteen_categories_scope_outlet_sort
  ON biz_canteen_categories (tenant_id, park_id, outlet_id, sort_order) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 3. biz_canteen_dishes 餐品
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_dishes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  category_id uuid NOT NULL REFERENCES biz_canteen_categories(id),
  dish_no varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  price numeric(12,2) NOT NULL,
  image_file_id uuid,
  unit varchar(16) NOT NULL DEFAULT '份',
  barcode varchar(64),
  daily_stock integer,
  sold_count integer NOT NULL DEFAULT 0,
  need_booking boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'off_shelf',
  shelf_time timestamptz,
  unshelf_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_dishes_price CHECK (price >= 0),
  CONSTRAINT ck_canteen_dishes_stock CHECK (daily_stock IS NULL OR daily_stock >= 0),
  CONSTRAINT ck_canteen_dishes_sold CHECK (sold_count >= 0),
  CONSTRAINT ck_canteen_dishes_status CHECK (status IN ('on_shelf','off_shelf'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_dishes_scope_outlet_no
  ON biz_canteen_dishes (tenant_id, outlet_id, dish_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_dishes_scope_outlet_cat_status
  ON biz_canteen_dishes (tenant_id, park_id, outlet_id, category_id, status) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 4. biz_canteen_qr_codes 收款码登记
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_qr_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  code_type varchar(16) NOT NULL,
  name varchar(64) NOT NULL,
  payload text NOT NULL,
  provider varchar(16),
  status varchar(16) NOT NULL DEFAULT 'active',
  bound_cashier_user_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_qr_codes_type CHECK (code_type IN ('dynamic','static')),
  CONSTRAINT ck_canteen_qr_codes_status CHECK (status IN ('active','disabled'))
);
CREATE INDEX IF NOT EXISTS idx_canteen_qr_codes_scope_outlet_status
  ON biz_canteen_qr_codes (tenant_id, park_id, outlet_id, status) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 5. biz_canteen_cashier_sessions 收银班次/日结
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_cashier_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  session_no varchar(40) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  cashier_user_id uuid NOT NULL,
  open_time timestamptz NOT NULL DEFAULT now(),
  close_time timestamptz,
  opening_float numeric(12,2) NOT NULL DEFAULT 0,
  qr_pay_total numeric(12,2) NOT NULL DEFAULT 0,
  subsidy_total numeric(12,2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  refund_total numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(8) NOT NULL DEFAULT 'open',
  close_snapshot jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_cashier_sessions_amount CHECK (
    opening_float >= 0 AND qr_pay_total >= 0 AND subsidy_total >= 0
    AND refund_total >= 0 AND order_count >= 0
  ),
  CONSTRAINT ck_canteen_cashier_sessions_status CHECK (status IN ('open','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_cashier_sessions_scope_no
  ON biz_canteen_cashier_sessions (tenant_id, session_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_cashier_sessions_scope_outlet_status
  ON biz_canteen_cashier_sessions (tenant_id, park_id, outlet_id, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_cashier_sessions_scope_cashier
  ON biz_canteen_cashier_sessions (tenant_id, park_id, cashier_user_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 6. biz_canteen_orders 订单
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  order_no varchar(40) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  contractor_id varchar(64) NOT NULL,
  business_date date NOT NULL,
  meal_period varchar(16) NOT NULL,
  cashier_user_id uuid NOT NULL,
  cashier_session_id uuid REFERENCES biz_canteen_cashier_sessions(id),
  channel varchar(16) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  pay_amount numeric(12,2) NOT NULL,
  qr_pay_amount numeric(12,2) NOT NULL DEFAULT 0,
  subsidy_amount numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'pending',
  paid_time timestamptz,
  void_time timestamptz,
  void_reason varchar(256),
  refund_status varchar(20),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_orders_amount CHECK (
    total_amount >= 0 AND discount_amount >= 0 AND pay_amount >= 0
    AND qr_pay_amount >= 0 AND subsidy_amount >= 0
  ),
  CONSTRAINT ck_canteen_orders_split CHECK (subsidy_amount + qr_pay_amount = pay_amount),
  CONSTRAINT ck_canteen_orders_channel CHECK (channel IN ('qr_pay','subsidy','mixed')),
  CONSTRAINT ck_canteen_orders_status CHECK (
    status IN ('pending','paid','completed','cancelled','refunded','partial_refunded')
  ),
  CONSTRAINT ck_canteen_orders_refund_status CHECK (
    refund_status IS NULL OR refund_status IN ('none','full','partial')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_orders_scope_no
  ON biz_canteen_orders (tenant_id, order_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_orders_scope_outlet_date
  ON biz_canteen_orders (tenant_id, park_id, outlet_id, business_date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_orders_scope_status
  ON biz_canteen_orders (tenant_id, park_id, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_orders_contractor_date
  ON biz_canteen_orders (tenant_id, contractor_id, business_date) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 7. biz_canteen_order_items 订单明细
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  order_id uuid NOT NULL REFERENCES biz_canteen_orders(id),
  dish_id uuid NOT NULL REFERENCES biz_canteen_dishes(id),
  dish_name_snapshot varchar(128) NOT NULL,
  price_snapshot numeric(12,2) NOT NULL,
  qty integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  category_snapshot varchar(64),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_order_items_qty CHECK (qty > 0),
  CONSTRAINT ck_canteen_order_items_amount CHECK (amount >= 0 AND price_snapshot >= 0)
);
CREATE INDEX IF NOT EXISTS idx_canteen_order_items_scope_order
  ON biz_canteen_order_items (tenant_id, park_id, order_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_order_items_scope_dish
  ON biz_canteen_order_items (tenant_id, park_id, dish_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 8. biz_canteen_payments 扫码支付流水（真实收款）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  payment_no varchar(40) NOT NULL,
  order_id uuid NOT NULL REFERENCES biz_canteen_orders(id),
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  provider varchar(16) NOT NULL,
  trade_type varchar(16) NOT NULL DEFAULT 'native',
  code_url text,
  qr_code_id varchar(64),
  amount numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'CNY',
  status varchar(16) NOT NULL DEFAULT 'pending',
  provider_transaction_id varchar(64),
  buyer_payer_id varchar(128),
  paid_time timestamptz,
  callback_time timestamptz,
  callback_payload jsonb,
  idempotency_key varchar(64) NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_payments_amount CHECK (amount >= 0),
  CONSTRAINT ck_canteen_payments_provider CHECK (provider IN ('wechat','alipay')),
  CONSTRAINT ck_canteen_payments_status CHECK (
    status IN ('pending','paid','failed','closed','refunded')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_payments_scope_no
  ON biz_canteen_payments (tenant_id, payment_no) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_payments_provider_txn
  ON biz_canteen_payments (provider, provider_transaction_id)
  WHERE is_deleted = false AND status = 'paid' AND provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canteen_payments_scope_order
  ON biz_canteen_payments (tenant_id, park_id, order_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_payments_scope_status
  ON biz_canteen_payments (tenant_id, park_id, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_payments_outlet_paid_time
  ON biz_canteen_payments (tenant_id, outlet_id, paid_time) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 9. biz_canteen_wallets 员工补贴钱包
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_wallets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_no varchar(32) NOT NULL,
  period varchar(7) NOT NULL,
  period_grant numeric(12,2) NOT NULL DEFAULT 0,
  period_consumed numeric(12,2) NOT NULL DEFAULT 0,
  period_expired numeric(12,2) NOT NULL DEFAULT 0,
  period_balance numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'active',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_wallets_amount CHECK (
    period_grant >= 0 AND period_consumed >= 0
    AND period_expired >= 0 AND period_balance >= 0
  ),
  CONSTRAINT ck_canteen_wallets_status CHECK (status IN ('active','frozen'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_wallets_scope_employee
  ON biz_canteen_wallets (tenant_id, employee_user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_wallets_scope_period
  ON biz_canteen_wallets (tenant_id, park_id, period) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 10. biz_canteen_subsidy_grants 月度补贴发放单
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_subsidy_grants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  grant_no varchar(40) NOT NULL,
  period varchar(7) NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_no varchar(32) NOT NULL,
  plan_amount numeric(12,2) NOT NULL,
  granted_amount numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'scheduled',
  grant_time timestamptz,
  expire_time timestamptz,
  rule_snapshot jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_subsidy_grants_amount CHECK (plan_amount >= 0 AND granted_amount >= 0),
  CONSTRAINT ck_canteen_subsidy_grants_status CHECK (
    status IN ('scheduled','granted','partially_consumed','consumed','expired')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_subsidy_grants_scope_employee_period
  ON biz_canteen_subsidy_grants (tenant_id, employee_user_id, period) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_subsidy_grants_scope_period_status
  ON biz_canteen_subsidy_grants (tenant_id, park_id, period, status) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 11. biz_canteen_wallet_txns 补贴账户流水（只追加）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_wallet_txns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  txn_no varchar(40) NOT NULL,
  wallet_id uuid NOT NULL REFERENCES biz_canteen_wallets(id),
  grant_id uuid REFERENCES biz_canteen_subsidy_grants(id),
  period varchar(7) NOT NULL,
  employee_user_id uuid NOT NULL,
  type varchar(16) NOT NULL,
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  order_id uuid REFERENCES biz_canteen_orders(id),
  meal_record_id uuid,
  operator_user_id uuid,
  txn_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_wallet_txns_balance CHECK (balance_after >= 0),
  CONSTRAINT ck_canteen_wallet_txns_type CHECK (type IN ('grant','consume','refund','expire'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_wallet_txns_scope_no
  ON biz_canteen_wallet_txns (tenant_id, txn_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_wallet_txns_scope_employee_period_type
  ON biz_canteen_wallet_txns (tenant_id, park_id, employee_user_id, period, type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_wallet_txns_scope_order
  ON biz_canteen_wallet_txns (tenant_id, park_id, order_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 12. biz_canteen_meal_records 员工用餐记录（结算事实）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_meal_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  record_no varchar(40) NOT NULL,
  period varchar(7) NOT NULL,
  business_date date NOT NULL,
  meal_period varchar(16) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  employee_user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES biz_canteen_orders(id),
  total_amount numeric(12,2) NOT NULL,
  subsidy_used numeric(12,2) NOT NULL,
  qr_pay_amount numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'normal',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_meal_records_amount CHECK (
    total_amount >= 0 AND subsidy_used >= 0 AND qr_pay_amount >= 0
  ),
  CONSTRAINT ck_canteen_meal_records_status CHECK (status IN ('normal','voided','refunded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_meal_records_scope_no
  ON biz_canteen_meal_records (tenant_id, record_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_meal_records_scope_period_employee
  ON biz_canteen_meal_records (tenant_id, park_id, period, employee_user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_meal_records_scope_outlet_date
  ON biz_canteen_meal_records (tenant_id, park_id, outlet_id, business_date) WHERE is_deleted = false;
-- 注：承包方维度（contractor_id）经 outlet join 聚合，本表无 contractor_id 列。

-- ---------------------------------------------------------------------------
-- 13. biz_canteen_refunds 退款/撤单
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_refunds (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  refund_no varchar(40) NOT NULL,
  order_id uuid NOT NULL REFERENCES biz_canteen_orders(id),
  payment_id uuid REFERENCES biz_canteen_payments(id),
  wallet_txn_id uuid REFERENCES biz_canteen_wallet_txns(id),
  type varchar(24) NOT NULL,
  amount numeric(12,2) NOT NULL,
  refund_channel varchar(16) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  reason varchar(256) NOT NULL,
  operator_user_id uuid NOT NULL,
  audit_user_id uuid,
  finish_time timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_refunds_amount CHECK (amount >= 0),
  CONSTRAINT ck_canteen_refunds_type CHECK (type IN ('void_before_pay','refund_after_pay')),
  CONSTRAINT ck_canteen_refunds_channel CHECK (refund_channel IN ('original_qr','subsidy')),
  CONSTRAINT ck_canteen_refunds_status CHECK (status IN ('pending','approved','succeeded','failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_refunds_scope_no
  ON biz_canteen_refunds (tenant_id, refund_no) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_refunds_scope_order
  ON biz_canteen_refunds (tenant_id, park_id, order_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 14. biz_canteen_settlements 承包方月度结算单
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_settlements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  settlement_no varchar(40) NOT NULL,
  period varchar(7) NOT NULL,
  outlet_id uuid NOT NULL REFERENCES biz_canteen_outlets(id),
  contractor_id varchar(64) NOT NULL,
  sales_total numeric(12,2) NOT NULL DEFAULT 0,
  qr_pay_total numeric(12,2) NOT NULL DEFAULT 0,
  subsidy_total numeric(12,2) NOT NULL DEFAULT 0,
  refund_total numeric(12,2) NOT NULL DEFAULT 0,
  company_payable numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'draft',
  generated_time timestamptz,
  submitted_time timestamptz,
  reconciled_time timestamptz,
  approved_time timestamptz,
  settled_time timestamptz,
  finance_user_id uuid,
  settle_evidence_file_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_settlements_amount CHECK (
    sales_total >= 0 AND qr_pay_total >= 0 AND subsidy_total >= 0
    AND refund_total >= 0 AND company_payable >= 0
  ),
  CONSTRAINT ck_canteen_settlements_status CHECK (
    status IN ('draft','submitted','reconciling','approved','settled','disputed')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_settlements_scope_outlet_period
  ON biz_canteen_settlements (tenant_id, outlet_id, period) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_settlements_scope_period_status
  ON biz_canteen_settlements (tenant_id, park_id, period, status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_settlements_contractor_period
  ON biz_canteen_settlements (tenant_id, contractor_id, period) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 15. biz_canteen_settlement_items 结算/对账明细
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_settlement_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  settlement_id uuid NOT NULL REFERENCES biz_canteen_settlements(id),
  biz_date date NOT NULL,
  meal_period varchar(16),
  order_count integer NOT NULL DEFAULT 0,
  qr_pay_amount numeric(12,2) NOT NULL DEFAULT 0,
  subsidy_amount numeric(12,2) NOT NULL DEFAULT 0,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  source varchar(16) NOT NULL DEFAULT 'order',
  diff_amount numeric(12,2) NOT NULL DEFAULT 0,
  diff_reason varchar(256),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_settlement_items_amount CHECK (
    order_count >= 0 AND qr_pay_amount >= 0 AND subsidy_amount >= 0
    AND refund_amount >= 0
  ),
  CONSTRAINT ck_canteen_settlement_items_source CHECK (source IN ('order','meal_record'))
);
CREATE INDEX IF NOT EXISTS idx_canteen_settlement_items_scope_settlement
  ON biz_canteen_settlement_items (tenant_id, park_id, settlement_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_canteen_settlement_items_scope_date
  ON biz_canteen_settlement_items (tenant_id, park_id, biz_date) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 16. biz_canteen_status_logs 状态变更日志（追加）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_status_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  entity_type varchar(16) NOT NULL,
  entity_id uuid NOT NULL,
  before_status varchar(20),
  after_status varchar(20) NOT NULL,
  action varchar(32) NOT NULL,
  reason varchar(256),
  operator_user_id uuid,
  operator_name varchar(64),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_status_logs_entity_type CHECK (
    entity_type IN ('order','payment','settlement','grant','refund')
  )
);
CREATE INDEX IF NOT EXISTS idx_canteen_status_logs_scope_entity_time
  ON biz_canteen_status_logs (tenant_id, park_id, entity_type, entity_id, op_time) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 17. biz_canteen_settings 租户/园区维度单行可配置设置
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_canteen_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  monthly_lunch_subsidy numeric(12,2) NOT NULL DEFAULT 300.00,
  grant_day integer NOT NULL DEFAULT 1,
  expiry_mode varchar(16) NOT NULL DEFAULT 'last_day',
  expiry_day integer,
  expiry_time varchar(8) NOT NULL DEFAULT '23:59',
  eligible_rule jsonb NOT NULL DEFAULT '{"employee_type":"regular","status":"active"}'::jsonb,
  funds_company_account boolean NOT NULL DEFAULT true,
  settlement_day integer NOT NULL DEFAULT 1,
  management_fee_enabled boolean NOT NULL DEFAULT false,
  management_fee_rule jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_canteen_settings_subsidy CHECK (monthly_lunch_subsidy >= 0),
  CONSTRAINT ck_canteen_settings_grant_day CHECK (grant_day BETWEEN 1 AND 28),
  CONSTRAINT ck_canteen_settings_expiry_mode CHECK (expiry_mode IN ('last_day','fixed_day')),
  CONSTRAINT ck_canteen_settings_settlement_day CHECK (settlement_day BETWEEN 1 AND 28)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canteen_settings_scope
  ON biz_canteen_settings (tenant_id, park_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- SaaS 模块注册 / 权限点 / 默认授权（参考 homestay 000177 范式）。
-- 仅在 RBAC 底座表（sys_module 等）存在时执行；隔离的 canteen-dev-pg 空库
-- 会跳过本段（plpgsql 晚绑定，前置 RETURN 不触发关系解析）。
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sys_module') IS NULL
     OR to_regclass('public.sys_permission') IS NULL
     OR to_regclass('public.sys_role') IS NULL THEN
    RAISE NOTICE 'canteen: RBAC base tables absent, skipping module/permission seed';
    RETURN;
  END IF;

  -- 模块注册
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  ) VALUES (
    'canteen', '园区餐厅管理', 'business', '园区食堂承包经营、餐补虚拟结算与月度对账',
    '/canteen', 'restaurant', 1, 70, 'Canteen M0 module'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    update_time = now();

  INSERT INTO sys_module_registry (
    tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
    permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
  ) VALUES (
    '10000001', '20000001', 'canteen', '园区餐厅管理', 'business', '1.0.0', '/canteen',
    'canteen:dashboard:view', 'restaurant', 70, true, 'enabled', now(), now(), false, 1, 'Canteen M0 registry'
  )
  ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    route_path = EXCLUDED.route_path,
    permission_code = EXCLUDED.permission_code,
    status = 'enabled',
    update_time = now();

  -- 41 个权限点
  INSERT INTO sys_permission (
    id, tenant_id, park_id, code, name, resource, action,
    permission_type, status, perm_type, level, api_method, api_path, frontend_route, sort_no,
    is_system, is_builtin, is_tenant_custom, visible,
    create_time, update_time, is_deleted, version
  )
  SELECT uuid_generate_v4(), '10000001', '20000001', code, name, resource, action,
    'api', 'enabled', 40, 3, 'GET', api_path, '/canteen', sort_no,
    true, true, false, true, now(), now(), false, 1
  FROM (VALUES
    ('canteen:outlet:view','查看餐厅/档口','biz.canteen_outlet','view','/api/canteen/outlets',7001),
    ('canteen:outlet:create','新建档口','biz.canteen_outlet','create','/api/canteen/outlets',7002),
    ('canteen:outlet:update','编辑档口','biz.canteen_outlet','update','/api/canteen/outlets',7003),
    ('canteen:outlet:status','档口启停','biz.canteen_outlet','status','/api/canteen/outlets',7004),
    ('canteen:category:view','查看品类','biz.canteen_category','view','/api/canteen/categories',7005),
    ('canteen:category:create','新建品类','biz.canteen_category','create','/api/canteen/categories',7006),
    ('canteen:category:update','编辑品类','biz.canteen_category','update','/api/canteen/categories',7007),
    ('canteen:category:delete','删除品类','biz.canteen_category','delete','/api/canteen/categories',7008),
    ('canteen:dish:view','查看餐品','biz.canteen_dish','view','/api/canteen/dishes',7009),
    ('canteen:dish:create','新建餐品','biz.canteen_dish','create','/api/canteen/dishes',7010),
    ('canteen:dish:update','编辑餐品/定价','biz.canteen_dish','update','/api/canteen/dishes',7011),
    ('canteen:dish:shelf','餐品上架/下架','biz.canteen_dish','shelf','/api/canteen/dishes',7012),
    ('canteen:dish:stock','调整每日库存','biz.canteen_dish','stock','/api/canteen/dishes',7013),
    ('canteen:order:view','查看订单与明细','biz.canteen_order','view','/api/canteen/orders',7014),
    ('canteen:order:create','POS 下单/收款','biz.canteen_order','create','/api/canteen/pos/checkout',7015),
    ('canteen:order:cancel','撤单（paid 前）','biz.canteen_order','cancel','/api/canteen/orders',7016),
    ('canteen:order:refund','发起退款','biz.canteen_order','refund','/api/canteen/refunds',7017),
    ('canteen:order:audit','退款/撤单审核','biz.canteen_order','audit','/api/canteen/refunds',7018),
    ('canteen:payment:view','查看支付流水','biz.canteen_payment','view','/api/canteen/payments',7019),
    ('canteen:qrcode:view','查看收款码','biz.canteen_qrcode','view','/api/canteen/qrcodes',7020),
    ('canteen:qrcode:manage','登记/启停收款码','biz.canteen_qrcode','manage','/api/canteen/qrcodes',7021),
    ('canteen:session:open','POS 开班','biz.canteen_session','open','/api/canteen/pos/sessions',7022),
    ('canteen:session:close','结班日结','biz.canteen_session','close','/api/canteen/pos/sessions',7023),
    ('canteen:session:view','查看班次','biz.canteen_session','view','/api/canteen/pos/sessions',7024),
    ('canteen:wallet:view','查看本人补贴钱包','biz.canteen_wallet','view','/api/canteen/wallet/me',7025),
    ('canteen:wallet:lookup','收银按员工查余额','biz.canteen_wallet','lookup','/api/canteen/pos/lookup-employee',7026),
    ('canteen:wallet:manage','管理/冻结钱包','biz.canteen_wallet','manage','/api/canteen/wallet',7027),
    ('canteen:subsidy:grant:view','查看补贴发放单','biz.canteen_subsidy_grant','view','/api/canteen/subsidy/grants',7028),
    ('canteen:subsidy:grant:generate','生成/触发发放','biz.canteen_subsidy_grant','generate','/api/canteen/subsidy/run-grant',7029),
    ('canteen:subsidy:grant:expire','触发月末清零','biz.canteen_subsidy_grant','expire','/api/canteen/subsidy/run-expire',7030),
    ('canteen:meal-record:view','查看员工用餐记录','biz.canteen_meal_record','view','/api/canteen/meal-records',7031),
    ('canteen:refund:view','查看退款单','biz.canteen_refund','view','/api/canteen/refunds',7032),
    ('canteen:settlement:view','查看结算单与明细','biz.canteen_settlement','view','/api/canteen/settlements',7033),
    ('canteen:settlement:generate','生成月度结算','biz.canteen_settlement','generate','/api/canteen/settlements',7034),
    ('canteen:settlement:submit','提交结算','biz.canteen_settlement','submit','/api/canteen/settlements',7035),
    ('canteen:settlement:reconcile','财务核对','biz.canteen_settlement','reconcile','/api/canteen/settlements',7036),
    ('canteen:settlement:approve','审批结算','biz.canteen_settlement','approve','/api/canteen/settlements',7037),
    ('canteen:settlement:settle','付款结账','biz.canteen_settlement','settle','/api/canteen/settlements',7038),
    ('canteen:settlement:dispute','差异挂起/异议','biz.canteen_settlement','dispute','/api/canteen/settlements',7039),
    ('canteen:report:view','查看报表','biz.canteen_report','view','/api/canteen/reports',7040),
    ('canteen:dashboard:view','查看经营看板','biz.canteen_dashboard','view','/api/canteen/dashboard',7041)
  ) AS p(code, name, resource, action, api_path, sort_no)
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_permission existing
    WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
      AND existing.code = p.code AND existing.is_deleted = false
  );

  -- 默认授权：管理员角色全量，审计只读
  INSERT INTO rel_role_perm (
    tenant_id, park_id, role_id, permission_id,
    create_time, update_time, is_deleted, version, remark
  )
  SELECT '10000001', '20000001', role.id, permission.id,
    now(), now(), false, 1, 'Canteen M0 default grant'
  FROM (
    SELECT 'SUPER_ADMIN' AS role_code, code FROM (VALUES
      ('canteen:outlet:view'),('canteen:outlet:create'),('canteen:outlet:update'),('canteen:outlet:status'),
      ('canteen:category:view'),('canteen:category:create'),('canteen:category:update'),('canteen:category:delete'),
      ('canteen:dish:view'),('canteen:dish:create'),('canteen:dish:update'),('canteen:dish:shelf'),('canteen:dish:stock'),
      ('canteen:order:view'),('canteen:order:create'),('canteen:order:cancel'),('canteen:order:refund'),('canteen:order:audit'),
      ('canteen:payment:view'),('canteen:qrcode:view'),('canteen:qrcode:manage'),
      ('canteen:session:open'),('canteen:session:close'),('canteen:session:view'),
      ('canteen:wallet:view'),('canteen:wallet:lookup'),('canteen:wallet:manage'),
      ('canteen:subsidy:grant:view'),('canteen:subsidy:grant:generate'),('canteen:subsidy:grant:expire'),
      ('canteen:meal-record:view'),('canteen:refund:view'),
      ('canteen:settlement:view'),('canteen:settlement:generate'),('canteen:settlement:submit'),
      ('canteen:settlement:reconcile'),('canteen:settlement:approve'),('canteen:settlement:settle'),('canteen:settlement:dispute'),
      ('canteen:report:view'),('canteen:dashboard:view')
    ) AS all_perms(code)
    UNION ALL
    SELECT 'AUDITOR' AS role_code, code FROM (VALUES
      ('canteen:order:view'),('canteen:payment:view'),('canteen:meal-record:view'),
      ('canteen:refund:view'),('canteen:settlement:view'),('canteen:report:view'),('canteen:dashboard:view')
    ) AS auditor_perms(code)
  ) grants
  JOIN sys_role role
    ON role.tenant_id = '10000001' AND role.park_id = '20000001'
   AND role.code = grants.role_code AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = '10000001' AND permission.park_id = '20000001'
   AND permission.code = grants.code AND permission.is_deleted = false
  WHERE NOT EXISTS (
    SELECT 1 FROM rel_role_perm existing
    WHERE existing.tenant_id = '10000001' AND existing.park_id = '20000001'
      AND existing.role_id = role.id AND existing.permission_id = permission.id
      AND existing.is_deleted = false
  );
END $$;

COMMIT;
