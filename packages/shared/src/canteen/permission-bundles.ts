import { CANTEEN_PERMISSIONS as P } from "./permissions";

export interface CanteenPermissionBundle {
  code: string;
  description: string;
  permissions: readonly string[];
}

/**
 * 默认角色包（参考 docs/canteen/permissions.md 第 3/6 节）。
 * platform-admin 由平台侧全量授予，不进业务 bundle。
 */
export const CANTEEN_PERMISSION_BUNDLES = {
  ADMIN: {
    code: "canteen-bundle:canteen-admin",
    description: "餐厅管理员：档口/品类/餐品/定价/订单/退款审核/日结/发放/结算发起",
    permissions: [
      P.OUTLET_VIEW, P.OUTLET_CREATE, P.OUTLET_UPDATE, P.OUTLET_STATUS,
      P.CATEGORY_VIEW, P.CATEGORY_CREATE, P.CATEGORY_UPDATE, P.CATEGORY_DELETE,
      P.DISH_VIEW, P.DISH_CREATE, P.DISH_UPDATE, P.DISH_SHELF, P.DISH_STOCK,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_CANCEL, P.ORDER_REFUND, P.ORDER_AUDIT,
      P.PAYMENT_VIEW,
      P.QRCODE_VIEW, P.QRCODE_MANAGE,
      P.SESSION_OPEN, P.SESSION_CLOSE, P.SESSION_VIEW,
      P.WALLET_VIEW, P.WALLET_LOOKUP, P.WALLET_MANAGE,
      P.SUBSIDY_GRANT_VIEW, P.SUBSIDY_GRANT_GENERATE, P.SUBSIDY_GRANT_EXPIRE,
      P.MEAL_RECORD_VIEW,
      P.REFUND_VIEW,
      P.SETTLEMENT_VIEW, P.SETTLEMENT_GENERATE, P.SETTLEMENT_SUBMIT, P.SETTLEMENT_DISPUTE,
      P.REPORT_VIEW, P.DASHBOARD_VIEW
    ]
  },
  CASHIER: {
    code: "canteen-bundle:canteen-cashier",
    description: "收银员：POS 触摸屏收款、本班查询、受限撤单/退款",
    permissions: [
      P.DISH_VIEW,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_CANCEL, P.ORDER_REFUND,
      P.PAYMENT_VIEW,
      P.SESSION_OPEN, P.SESSION_CLOSE, P.SESSION_VIEW,
      P.WALLET_LOOKUP
    ]
  },
  CONTRACTOR: {
    code: "canteen-bundle:canteen-contractor",
    description: "承包方：本餐厅经营/销售/员工消费只读与对账确认",
    permissions: [
      P.OUTLET_VIEW,
      P.DISH_VIEW,
      P.ORDER_VIEW, P.PAYMENT_VIEW,
      P.SUBSIDY_GRANT_VIEW, P.MEAL_RECORD_VIEW,
      P.SETTLEMENT_VIEW, P.SETTLEMENT_SUBMIT, P.SETTLEMENT_DISPUTE,
      P.REPORT_VIEW, P.DASHBOARD_VIEW
    ]
  },
  FINANCE: {
    code: "canteen-bundle:canteen-finance",
    description: "公司财务：月度结算复核、审批、付款结账与差异处理",
    permissions: [
      P.OUTLET_VIEW,
      P.ORDER_VIEW, P.ORDER_AUDIT, P.PAYMENT_VIEW,
      P.SUBSIDY_GRANT_VIEW, P.MEAL_RECORD_VIEW, P.REFUND_VIEW,
      P.SETTLEMENT_VIEW, P.SETTLEMENT_RECONCILE, P.SETTLEMENT_APPROVE,
      P.SETTLEMENT_SETTLE, P.SETTLEMENT_DISPUTE,
      P.REPORT_VIEW, P.DASHBOARD_VIEW
    ]
  },
  EMPLOYEE: {
    code: "canteen-bundle:canteen-employee",
    description: "员工：本人补贴钱包、发放/消费明细与用餐记录",
    permissions: [
      P.WALLET_VIEW,
      P.SUBSIDY_GRANT_VIEW,
      P.MEAL_RECORD_VIEW
    ]
  }
} as const satisfies Record<string, CanteenPermissionBundle>;

export const CANTEEN_BUNDLE_LIST: readonly CanteenPermissionBundle[] =
  Object.values(CANTEEN_PERMISSION_BUNDLES);
