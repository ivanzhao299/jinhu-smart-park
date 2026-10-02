/**
 * 园区餐厅（canteen）前端类型定义。
 * 说明（以 M1 真实后端为准）：
 *  - 请求体/查询参数：snake_case（与 dto/canteen.dto.ts 一致，forbidNonWhitelisted）。
 *  - 响应：后端直接返回 TypeORM 实体（camelCase 属性），金额为 numeric→字符串元。
 *  - 订单分页：{ list, total, page, pageSize }（列表读 list）。
 *  - POS checkout/payment-status 走专用 DTO，响应为 snake_case。
 */

/* ---------------- 响应实体（camelCase） ---------------- */

/** 档口 */
export interface CanteenOutlet {
  id: string;
  outletNo: string;
  name: string;
  outletType: string;
  contractorId?: string | null;
  location?: string | null;
  businessHours?: string | null;
  status: "open" | "suspended" | "closed" | string;
  managerUserId?: string | null;
}

/** 品类 */
export interface CanteenCategory {
  id: string;
  outletId: string;
  name: string;
  sortOrder: number;
  status: "on" | "off" | string;
}

/** 餐品（列表不回品类名，前端按 categoryId 映射） */
export interface CanteenDish {
  id: string;
  outletId: string;
  categoryId: string | null;
  dishNo: string;
  name: string;
  price: string;
  imageFileId?: string | null;
  unit: string;
  barcode?: string | null;
  dailyStock?: number | null;
  soldCount?: number;
  needBooking?: boolean;
  status: "on_shelf" | "off_shelf" | string;
  shelfTime?: string | null;
  unshelfTime?: string | null;
}

/** 订单 */
export interface CanteenOrder {
  id: string;
  orderNo: string;
  outletId: string;
  contractorId?: string | null;
  businessDate: string;
  mealPeriod?: string | null;
  cashierUserId?: string | null;
  cashierSessionId?: string | null;
  channel: "qr_pay" | "subsidy" | "mixed" | string;
  totalAmount: string;
  discountAmount: string;
  payAmount: string;
  qrPayAmount: string;
  subsidyAmount: string;
  status: "pending" | "paid" | "completed" | "cancelled" | "refunded" | "partial_refunded" | string;
  paidTime?: string | null;
  voidTime?: string | null;
  voidReason?: string | null;
  refundStatus?: string | null;
}

/** 订单明细 */
export interface CanteenOrderItem {
  id: string;
  orderId: string;
  dishId: string;
  dishNameSnapshot: string;
  priceSnapshot: string;
  qty: number;
  amount: string;
  categorySnapshot?: string | null;
}

/** 支付流水 */
export interface CanteenPayment {
  id: string;
  paymentNo: string;
  orderId: string;
  outletId: string;
  provider: "wechat" | "alipay" | string;
  tradeType?: string | null;
  codeUrl?: string | null;
  amount: string;
  currency: string;
  status: "pending" | "paid" | "failed" | "closed" | "refunded" | string;
  providerTransactionId?: string | null;
  buyerPayerId?: string | null;
  paidTime?: string | null;
  callbackTime?: string | null;
}

/** 支付状态轮询响应（snake_case，专用 DTO） */
export interface CanteenPaymentStatus {
  payment_no: string;
  status: "pending" | "paid" | "failed" | "closed" | string;
  paid_time?: string | null;
  order_status?: string | null;
  amount?: string;
}

/** 收银班次（实体 camelCase） */
export interface CanteenCashierSession {
  id: string;
  sessionNo: string;
  outletId: string;
  cashierUserId?: string | null;
  openTime: string;
  closeTime?: string | null;
  openingFloat: string;
  qrPayTotal: string;
  subsidyTotal: string;
  orderCount: number;
  refundTotal: string;
  status: "open" | "closed" | string;
  closeSnapshot?: Record<string, unknown> | null;
}

/** 订单分页（后端真实形状） */
export interface CanteenPage<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------------- 请求（snake_case） ---------------- */

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

export interface SaveCanteenCategoryInput {
  name: string;
  sort_order?: number;
  status?: "on" | "off";
}

export interface SaveCanteenDishInput {
  outlet_id: string;
  category_id: string;
  name: string;
  price: number;
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

export interface OpenCanteenSessionInput {
  outlet_id: string;
  opening_float?: number | string;
}

/* ---------------- POS 专用（snake_case 请求/响应） ---------------- */
export interface PosCartLine {
  dish_id: string;
  name: string;
  price: string;
  qty: number;
}
export interface PosCheckoutQrInput {
  outlet_id: string;
  items: Array<{ dish_id: string; qty: number }>;
  channel: "qr_pay";
}
export interface PosCheckoutQrResult {
  order_no: string;
  payment_no: string;
  status: "pending" | string;
  code_url: string;
  provider?: string;
  expires_in?: number;
  pay_amount?: string;
}
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
export interface PosEmployeeLookup {
  employee_user_id: string;
  employee_no: string;
  name_masked: string;
  period: string;
  period_balance: string;
}
