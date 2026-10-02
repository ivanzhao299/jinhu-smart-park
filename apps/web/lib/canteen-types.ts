/**
 * 园区餐厅（canteen）前端类型定义。
 * 字段命名与 docs/canteen/api.md 冻结契约逐字对齐（snake_case，金额为字符串元）。
 * 分页统一 { items, total, page, page_size }（@jinhu/shared PaginatedResult）。
 */

/** 列表分页查询通用参数 */
export interface CanteenPageQuery {
  page?: number;
  pageSize?: number;
}

/** 档口/餐厅 */
export interface CanteenOutlet {
  id: string;
  outlet_no: string;
  name: string;
  outlet_type: string; // 堂食/档口
  contractor_id?: string | null;
  location?: string | null;
  business_hours?: string | null;
  status: "open" | "suspended" | "closed" | string;
  manager_user_id?: string | null;
}

export interface CreateCanteenOutletInput {
  name: string;
  outlet_type: string;
  contractor_id?: string;
  location?: string;
  business_hours?: string;
  manager_user_id?: string;
}

export interface UpdateCanteenOutletStatusInput {
  status: "open" | "suspended" | "closed";
}

/** 品类 */
export interface CanteenCategory {
  id: string;
  outlet_id: string;
  name: string;
  sort_order: number;
  status: "on" | "off" | string;
}

export interface SaveCanteenCategoryInput {
  name: string;
  sort_order?: number;
  status?: "on" | "off";
}

/** 餐品 */
export interface CanteenDish {
  id: string;
  outlet_id: string;
  category_id: string | null;
  dish_no: string;
  name: string;
  price: string; // numeric(12,2) 字符串
  image_file_id?: string | null;
  unit: string;
  barcode?: string | null;
  daily_stock?: number | null;
  sold_count?: number;
  need_booking?: boolean;
  status: "on_shelf" | "off_shelf" | string;
  shelf_time?: string | null;
  unshelf_time?: string | null;
  category_name?: string | null;
}

export interface SaveCanteenDishInput {
  outlet_id: string;
  category_id?: string | null;
  name: string;
  price: string | number;
  unit?: string;
  barcode?: string;
  daily_stock?: number | null;
  need_booking?: boolean;
  image_file_id?: string | null;
}

export interface UpdateDishShelfInput {
  status: "on_shelf" | "off_shelf";
}

export interface UpdateDishStockInput {
  daily_stock: number | null;
}

/** 订单 */
export interface CanteenOrder {
  id: string;
  order_no: string;
  outlet_id: string;
  outlet_name?: string | null;
  contractor_id?: string | null;
  business_date: string; // YYYY-MM-DD
  meal_period?: string | null; // 早餐/午餐/晚餐
  cashier_user_id?: string | null;
  cashier_session_id?: string | null;
  channel: "qr_pay" | "subsidy" | "mixed" | string;
  total_amount: string;
  discount_amount: string;
  pay_amount: string;
  qr_pay_amount: string;
  subsidy_amount: string;
  status: "pending" | "paid" | "completed" | "cancelled" | "refunded" | "partial_refunded" | string;
  paid_time?: string | null;
  void_time?: string | null;
  void_reason?: string | null;
  refund_status?: string | null;
}

export interface CanteenOrderQuery extends CanteenPageQuery {
  outlet_id?: string;
  business_date?: string;
  status?: string;
  channel?: string;
  contractor_id?: string;
}

/** 订单明细 */
export interface CanteenOrderItem {
  id: string;
  order_id: string;
  dish_id: string;
  dish_name_snapshot: string;
  price_snapshot: string;
  qty: number;
  amount: string;
  category_snapshot?: string | null;
}

/** 支付流水 */
export interface CanteenPayment {
  id: string;
  payment_no: string;
  order_id: string;
  outlet_id: string;
  provider: "wechat" | "alipay" | string;
  trade_type?: string | null;
  code_url?: string | null;
  amount: string;
  currency: string;
  status: "pending" | "paid" | "failed" | "closed" | "refunded" | string;
  provider_transaction_id?: string | null;
  buyer_payer_id?: string | null;
  paid_time?: string | null;
  callback_time?: string | null;
}

/** 支付状态轮询响应 */
export interface CanteenPaymentStatus {
  payment_no: string;
  status: "pending" | "paid" | "failed" | "closed" | string;
  paid_time?: string | null;
}

/** 收银班次 */
export interface CanteenCashierSession {
  id: string;
  session_no: string;
  outlet_id: string;
  outlet_name?: string | null;
  cashier_user_id?: string | null;
  cashier_name?: string | null;
  open_time: string;
  close_time?: string | null;
  opening_float: string;
  qr_pay_total: string;
  subsidy_total: string;
  order_count: number;
  refund_total: string;
  status: "open" | "closed" | string;
  close_snapshot?: Record<string, unknown> | null;
}

export interface OpenCanteenSessionInput {
  outlet_id: string;
  opening_float?: number | string;
}

/** POS 点单购物车条目（前端视图） */
export interface PosCartLine {
  dish_id: string;
  name: string;
  price: string;
  qty: number;
}

/** /pos/checkout/qr 请求体 */
export interface PosCheckoutQrInput {
  outlet_id: string;
  items: Array<{ dish_id: string; qty: number }>;
  channel: "qr_pay";
}

/** /pos/checkout/qr 响应 */
export interface PosCheckoutQrResult {
  order_no: string;
  payment_no: string;
  status: "pending" | string;
  code_url: string;
  pay_amount?: string;
}

/** /pos/checkout/subsidy 请求体（M2） */
export interface PosCheckoutSubsidyInput {
  outlet_id: string;
  employee_code: string;
  items: Array<{ dish_id: string; qty: number }>;
  channel: "subsidy";
  subsidy_apply_amount: number;
}

export interface PosCheckoutSubsidyResult {
  order_no: string;
  status: "paid" | string;
  subsidy_amount: string;
  balance_after: string;
}

/** /pos/lookup-employee 响应 */
export interface PosEmployeeLookup {
  employee_user_id: string;
  employee_no: string;
  name_masked: string;
  period: string;
  period_balance: string;
}
