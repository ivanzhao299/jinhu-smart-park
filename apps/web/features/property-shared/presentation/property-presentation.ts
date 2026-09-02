import {
  APPROVAL_DECISION_STATUS_LABELS,
  APPROVAL_EXECUTION_STATUS_LABELS,
  HOMESTAY_BOOKING_STATUS_LABELS,
  HOMESTAY_LEDGER_ENTRY_TYPE_LABELS,
  HOMESTAY_LEDGER_STATUS_LABELS,
  HOMESTAY_TURNOVER_STATUS_LABELS,
  HOUSING_BILLING_SOURCE_LABELS,
  HOUSING_HANDOVER_STATUS_LABELS,
  HOUSING_HANDOVER_TYPE_LABELS,
  HOUSING_LEASE_STATUS_LABELS,
  HOUSING_OCCUPANT_ROLE_LABELS,
  HOUSING_PURCHASE_APPROVAL_STATUS_LABELS,
  HOUSING_PURCHASE_PAYMENT_STATUS_LABELS,
  HOUSING_REPAIR_PRIORITY_LABELS,
  HOUSING_REPAIR_URGENCY_LABELS,
  PROPERTY_OPERATING_MODE_LABELS,
  PROPERTY_SOURCE_TYPE_LABELS,
  PROPERTY_TASK_SOURCE_LABELS,
  PROPERTY_TASK_STATUS_LABELS
} from "@jinhu/shared";

export type PropertyStatusVariant = "success" | "warning" | "info" | "primary" | "danger" | "muted";

function knownLabel(labels: Readonly<Record<string, string>>, value: string | null | undefined, fallback: string): string {
  return value && Object.prototype.hasOwnProperty.call(labels, value) ? (labels[value] ?? fallback) : fallback;
}

export const propertyLabels = {
  operatingMode: (value?: string | null) => knownLabel(PROPERTY_OPERATING_MODE_LABELS, value, value ? "未知经营模式" : "未设置"),
  bookingStatus: (value?: string | null) => knownLabel(HOMESTAY_BOOKING_STATUS_LABELS, value, "未知订单状态"),
  turnoverStatus: (value?: string | null) => knownLabel(HOMESTAY_TURNOVER_STATUS_LABELS, value, "未知周转状态"),
  homestayLedgerType: (value?: string | null) => knownLabel(HOMESTAY_LEDGER_ENTRY_TYPE_LABELS, value, "未知流水类型"),
  homestayLedgerStatus: (value?: string | null) => knownLabel(HOMESTAY_LEDGER_STATUS_LABELS, value, "未知流水状态"),
  leaseStatus: (value?: string | null) => knownLabel(HOUSING_LEASE_STATUS_LABELS, value, "未知租约状态"),
  handoverStatus: (value?: string | null) => knownLabel(HOUSING_HANDOVER_STATUS_LABELS, value, "未知交割状态"),
  handoverType: (value?: string | null) => knownLabel(HOUSING_HANDOVER_TYPE_LABELS, value, "未知交割类型"),
  occupantRole: (value?: string | null) => knownLabel(HOUSING_OCCUPANT_ROLE_LABELS, value, "未知人员角色"),
  repairPriority: (value?: string | null) => knownLabel(HOUSING_REPAIR_PRIORITY_LABELS, value, "未知优先级"),
  repairUrgency: (value?: string | null) => knownLabel(HOUSING_REPAIR_URGENCY_LABELS, value, "未知紧急程度"),
  purchaseApproval: (value?: string | null) => knownLabel(HOUSING_PURCHASE_APPROVAL_STATUS_LABELS, value, "未知审批状态"),
  purchasePayment: (value?: string | null) => knownLabel(HOUSING_PURCHASE_PAYMENT_STATUS_LABELS, value, "未知付款状态"),
  billingSource: (value?: string | null) => knownLabel(HOUSING_BILLING_SOURCE_LABELS, value, "未知计费来源"),
  decisionStatus: (value?: string | null) => knownLabel(APPROVAL_DECISION_STATUS_LABELS, value, "未知审批状态"),
  executionStatus: (value?: string | null) => knownLabel(APPROVAL_EXECUTION_STATUS_LABELS, value, "未知执行状态"),
  taskStatus: (value?: string | null) => knownLabel({
    ...PROPERTY_TASK_STATUS_LABELS,
    pending: "待处理", active: "进行中", exception: "异常", completed: "已完成"
  }, value, "未知任务状态"),
  taskSource: (value?: string | null) => knownLabel(PROPERTY_TASK_SOURCE_LABELS, value, "未知任务来源"),
  sourceType: (value?: string | null) => knownLabel(PROPERTY_SOURCE_TYPE_LABELS, value, "未知业务来源")
} as const;

export const housingLeaseStatusOptions = Object.entries(HOUSING_LEASE_STATUS_LABELS)
  .map(([value, label]) => ({ value, label }));

export const homestayBookingStatusOptions = Object.entries(HOMESTAY_BOOKING_STATUS_LABELS)
  .map(([value, label]) => ({ value, label }));

export const homestayTurnoverStatusOptions = [
  { value: "open", label: "未完成" },
  ...Object.entries(HOMESTAY_TURNOVER_STATUS_LABELS).map(([value, label]) => ({ value, label }))
];

export const workOrderStatusLabels: Readonly<Record<string, string>> = {
  "10": "已提交", "20": "已派单", "30": "已接单", "40": "处理中", "45": "待物料",
  "50": "已完成", "60": "已取消", "70": "已驳回", "80": "已超时", "90": "已暂停",
  "91": "暂停已恢复", "100": "已关闭"
};

export const propertyTaskStatusOptions = ["pending", "active", "exception", "completed"]
  .map((value) => ({ value, label: propertyLabels.taskStatus(value) }));

export const propertyTaskSourceOptions = Object.entries(PROPERTY_TASK_SOURCE_LABELS)
  .map(([value, label]) => ({ value, label }));

export const housingPurchaseApprovalStatusOptions = Object.entries(HOUSING_PURCHASE_APPROVAL_STATUS_LABELS)
  .map(([value, label]) => ({ value, label }));

export function workOrderStatusLabel(value?: string | number | null): string {
  return knownLabel(workOrderStatusLabels, value == null ? null : String(value), "未知工单状态");
}

export function eligibilityReasonLabel(value?: string | null): string {
  return knownLabel({
    OPERATION_MODE_NOT_LONG_RENT: "经营模式不是长租",
    UNIT_USAGE_NOT_ELIGIBLE: "房源用途不支持长租",
    UNIT_NOT_AVAILABLE: "房源当前不可租",
    ACTIVE_OCCUPANCY_EXISTS: "房源已有生效占用"
  }, value, "未知阻断原因");
}

export function homestayPriceSourceLabel(value?: string | null): string {
  return knownLabel({ date_override: "日期覆盖价", base_rate: "基础价" }, value, value ? "未知价格来源" : "价格来源未授权");
}

export function displayEntityName(
  name: string | null | undefined,
  businessCode: string | null | undefined,
  fallback: string
): string {
  const isInternalId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const safeName = name?.trim();
  const safeCode = businessCode?.trim();
  return (safeName && !isInternalId(safeName) ? safeName : "")
    || (safeCode && !isInternalId(safeCode) ? safeCode : "")
    || fallback;
}

export function propertyErrorMessage(error: unknown, fallback = "操作失败，请稍后重试"): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  if (/[㐀-鿿]/u.test(message)) return message;
  if (/forbidden|permission|access denied/i.test(message)) return "当前账号无权执行此操作";
  if (/not found/i.test(message)) return "相关记录不存在或已不可用";
  if (/conflict|already|duplicate/i.test(message)) return "数据状态已变化，请刷新后重试";
  if (/network|fetch|timeout/i.test(message)) return "网络连接异常，请稍后重试";
  if (/validation|invalid|required/i.test(message)) return "提交内容不符合要求，请检查后重试";
  return fallback;
}

export function statusVariant(value?: string | null): PropertyStatusVariant {
  if (["completed", "checked_out", "approved", "paid", "confirmed", "executed", "closed"].includes(value ?? "")) return "success";
  if (["exception", "cancelled", "rejected", "void", "execution_failed", "infra_exhausted"].includes(value ?? "")) return "danger";
  if (["pending", "pending_approval", "pending_signature", "expiring", "retry_wait", "unpaid"].includes(value ?? "")) return "warning";
  if (["active", "checked_in", "cleaning", "inspection", "in_progress", "executing"].includes(value ?? "")) return "primary";
  return "muted";
}
