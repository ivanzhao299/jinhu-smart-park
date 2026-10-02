/**
 * 园区餐厅（canteen）权限点常量。
 * 与 docs/canteen/permissions.md 第 2 节一一对应，共 41 个 canteen:* 权限点。
 */
export const CANTEEN_PERMISSIONS = {
  OUTLET_VIEW: "canteen:outlet:view",
  OUTLET_CREATE: "canteen:outlet:create",
  OUTLET_UPDATE: "canteen:outlet:update",
  OUTLET_STATUS: "canteen:outlet:status",

  CATEGORY_VIEW: "canteen:category:view",
  CATEGORY_CREATE: "canteen:category:create",
  CATEGORY_UPDATE: "canteen:category:update",
  CATEGORY_DELETE: "canteen:category:delete",

  DISH_VIEW: "canteen:dish:view",
  DISH_CREATE: "canteen:dish:create",
  DISH_UPDATE: "canteen:dish:update",
  DISH_SHELF: "canteen:dish:shelf",
  DISH_STOCK: "canteen:dish:stock",

  ORDER_VIEW: "canteen:order:view",
  ORDER_CREATE: "canteen:order:create",
  ORDER_CANCEL: "canteen:order:cancel",
  ORDER_REFUND: "canteen:order:refund",
  ORDER_AUDIT: "canteen:order:audit",

  PAYMENT_VIEW: "canteen:payment:view",

  QRCODE_VIEW: "canteen:qrcode:view",
  QRCODE_MANAGE: "canteen:qrcode:manage",

  SESSION_OPEN: "canteen:session:open",
  SESSION_CLOSE: "canteen:session:close",
  SESSION_VIEW: "canteen:session:view",

  WALLET_VIEW: "canteen:wallet:view",
  WALLET_LOOKUP: "canteen:wallet:lookup",
  WALLET_MANAGE: "canteen:wallet:manage",

  SUBSIDY_GRANT_VIEW: "canteen:subsidy:grant:view",
  SUBSIDY_GRANT_GENERATE: "canteen:subsidy:grant:generate",
  SUBSIDY_GRANT_EXPIRE: "canteen:subsidy:grant:expire",

  MEAL_RECORD_VIEW: "canteen:meal-record:view",

  REFUND_VIEW: "canteen:refund:view",

  SETTLEMENT_VIEW: "canteen:settlement:view",
  SETTLEMENT_GENERATE: "canteen:settlement:generate",
  SETTLEMENT_SUBMIT: "canteen:settlement:submit",
  SETTLEMENT_RECONCILE: "canteen:settlement:reconcile",
  SETTLEMENT_APPROVE: "canteen:settlement:approve",
  SETTLEMENT_SETTLE: "canteen:settlement:settle",
  SETTLEMENT_DISPUTE: "canteen:settlement:dispute",

  REPORT_VIEW: "canteen:report:view",
  DASHBOARD_VIEW: "canteen:dashboard:view"
} as const;

export type CanteenPermissionCode =
  (typeof CANTEEN_PERMISSIONS)[keyof typeof CANTEEN_PERMISSIONS];

/** 全部 41 个权限点，用于种子/校验。 */
export const CANTEEN_PERMISSION_CODES: readonly string[] = Object.values(CANTEEN_PERMISSIONS);
