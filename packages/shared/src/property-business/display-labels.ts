import type {
  HomestayBookingStatus,
  HomestayLedgerEntryType,
  HomestayLedgerStatus,
  HomestayTurnoverStatus,
  HousingBillingSource,
  HousingHandoverStatus,
  HousingHandoverType,
  HousingLeaseStatus,
  HousingOccupantRole,
  HousingPurchaseApprovalStatus,
  HousingPurchasePaymentStatus,
  HousingRepairPriority,
  HousingRepairUrgency,
  PropertyOccupancyStatus,
  PropertyOperatingMode,
  PropertyOperatingStatus
} from "../index";
import type { ApprovalDecisionStatus, ApprovalExecutionStatus, PropertyTaskStatus } from "./track-b-contracts";

export const PROPERTY_OPERATING_MODE_LABELS = {
  none: "不经营", short_stay: "民宿短租", long_rent: "长租经营"
} as const satisfies Record<PropertyOperatingMode, string>;

export const PROPERTY_OPERATING_STATUS_LABELS = {
  enabled: "启用", suspended: "暂停", disabled: "停用"
} as const satisfies Record<PropertyOperatingStatus, string>;

export const PROPERTY_OCCUPANCY_STATUS_LABELS = {
  held: "保留", active: "生效", released: "已释放", completed: "已完成", cancelled: "已取消"
} as const satisfies Record<PropertyOccupancyStatus, string>;

export const HOMESTAY_BOOKING_STATUS_LABELS = {
  draft: "草稿", confirmed: "已确认", checked_in: "已入住", checked_out: "已退房",
  cancelled: "已取消", no_show: "未到店"
} as const satisfies Record<HomestayBookingStatus, string>;

export const HOMESTAY_TURNOVER_STATUS_LABELS = {
  pending: "待周转", cleaning: "清洁中", inspection: "待验收", completed: "已完成", exception: "异常"
} as const satisfies Record<HomestayTurnoverStatus, string>;

export const HOMESTAY_LEDGER_ENTRY_TYPE_LABELS = {
  charge: "费用", payment: "收款", refund: "退款", waiver: "减免"
} as const satisfies Record<HomestayLedgerEntryType, string>;

export const HOMESTAY_LEDGER_STATUS_LABELS = {
  registered: "已登记", confirmed: "已确认", void: "已作废"
} as const satisfies Record<HomestayLedgerStatus, string>;

export const HOUSING_LEASE_STATUS_LABELS = {
  draft: "草稿", pending_approval: "待审批", pending_signature: "待签署", active: "生效中",
  expiring: "即将到期", checkout_pending: "待退租", terminated: "已终止", void: "已作废"
} as const satisfies Record<HousingLeaseStatus, string>;

export const HOUSING_HANDOVER_STATUS_LABELS = {
  draft: "草稿", completed: "已完成"
} as const satisfies Record<HousingHandoverStatus, string>;

export const HOUSING_HANDOVER_TYPE_LABELS = {
  move_in: "入住", move_out: "退租"
} as const satisfies Record<HousingHandoverType, string>;

export const HOUSING_OCCUPANT_ROLE_LABELS = {
  cohabitant: "同住人", emergency_contact: "紧急联系人"
} as const satisfies Record<HousingOccupantRole, string>;

export const HOUSING_REPAIR_PRIORITY_LABELS = {
  low: "低", medium: "中", high: "高"
} as const satisfies Record<HousingRepairPriority, string>;

export const HOUSING_REPAIR_URGENCY_LABELS = {
  low: "低", normal: "一般", urgent: "紧急", critical: "特急"
} as const satisfies Record<HousingRepairUrgency, string>;

export const HOUSING_PURCHASE_APPROVAL_STATUS_LABELS = {
  draft: "草稿", approved: "已批准", rejected: "已驳回", void: "已作废"
} as const satisfies Record<HousingPurchaseApprovalStatus, string>;

export const HOUSING_PURCHASE_PAYMENT_STATUS_LABELS = {
  unpaid: "未付款", paid: "已付款", refunded: "已退款"
} as const satisfies Record<HousingPurchasePaymentStatus, string>;

export const HOUSING_BILLING_SOURCE_LABELS = {
  fixed: "固定金额", manual: "人工金额", energy_meter: "能源表计"
} as const satisfies Record<HousingBillingSource, string>;

export const APPROVAL_DECISION_STATUS_LABELS = {
  draft: "草稿", submitted: "已提交", pending_approval: "待审批", approved: "已批准",
  rejected: "已驳回", withdrawn: "已撤回", expired: "已失效"
} as const satisfies Record<ApprovalDecisionStatus, string>;

export const APPROVAL_EXECUTION_STATUS_LABELS = {
  not_started: "待执行", executing: "执行中", retry_wait: "等待重试", executed: "已执行",
  execution_failed: "执行失败", infra_exhausted: "基础设施重试耗尽", not_required: "无需执行"
} as const satisfies Record<ApprovalExecutionStatus, string>;

export const PROPERTY_TASK_STATUS_LABELS = {
  open: "待领取", claimed: "已领取", in_progress: "处理中", blocked: "已阻塞",
  closed: "已完成", cancelled: "已取消"
} as const satisfies Record<PropertyTaskStatus, string>;

export const PROPERTY_TASK_SOURCE_LABELS = {
  homestay_arrival: "到店", homestay_departure: "离店", homestay_turnover: "房务周转",
  housing_lease: "租约跟进", housing_handover: "住房交接", housing_repair: "长租报修",
  housing_billing: "长租账单", housing_purchase: "长租采购"
} as const;

export const PROPERTY_SOURCE_TYPE_LABELS = {
  leasing_contract: "租赁合同", homestay_booking: "民宿订单", housing_lease: "长租租约",
  apartment_room: "公寓房间", manual_maintenance_lock: "人工维修锁房",
  manual_operations_lock: "人工运营锁房", homestay_turnover: "民宿周转任务"
} as const;
