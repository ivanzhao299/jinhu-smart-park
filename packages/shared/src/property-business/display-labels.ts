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
import type {
  ApprovalDecisionStatus,
  ApprovalExecutionStatus,
  IdentitySubmissionStatus,
  PropertyEventDeliveryIncidentStatus,
  PropertyTaskStatus,
  TrackBApprovalActionId
} from "./track-b-contracts";

// HCD D 类临时定名待产品确认：只影响展示，不改变 API/数据库值。
export const HOMESTAY_GUEST_VERIFICATION_STATUSES = ["unverified", "verified", "rejected"] as const;
export const HOMESTAY_GUEST_VERIFICATION_STATUS_LABELS = {
  unverified: "未核验", verified: "已核验", rejected: "已驳回"
} as const satisfies Record<(typeof HOMESTAY_GUEST_VERIFICATION_STATUSES)[number], string>;

export const HOMESTAY_CREDENTIAL_STATUSES = ["issued", "returned", "lost", "void"] as const;
export const HOMESTAY_CREDENTIAL_STATUS_LABELS = {
  issued: "已发放", returned: "已回收", lost: "已遗失", void: "已作废"
} as const satisfies Record<(typeof HOMESTAY_CREDENTIAL_STATUSES)[number], string>;

export const HOMESTAY_AUDIT_ACTION_LABELS = {
  create: "创建订单", confirm: "确认订单", no_show: "登记未到店", cancel: "取消订单",
  reschedule: "订单改期", check_in: "办理入住", check_out: "办理退房"
} as const;

export const PARTY_VERIFICATION_STATUS_LABELS = {
  unverified: "未核验", verified: "已核验", rejected: "已驳回"
} as const;
export const PARTY_CONSENT_STATUS_LABELS = {
  pending: "待确认", granted: "已同意", withdrawn: "已撤回"
} as const;
export const PARTY_CONSENT_FACT_STATUS_LABELS = {
  pending_evidence: "待补证据", granted: "已取得同意", withdrawn: "已撤回同意", not_applicable: "不适用"
} as const;
export const PARTY_CONSENT_PROVENANCE_LABELS = {
  operator_recorded: "经操作员记录", legacy_unknown: "历史来源未知"
} as const;
export const PARTY_ROLE_TYPE_LABELS = { tenant: "租客" } as const;
export const PARTY_ROLE_SOURCE_TYPE_LABELS = { housing_lease: "长租租约" } as const;
export const PARTY_ROLE_STATUS_LABELS = { active: "生效", inactive: "已停用" } as const;
export const PARTY_SOURCE_DOMAIN_LABELS = {
  commercial_leasing: "园区租赁", homestay: "民宿", housing_rental: "长租住房",
  apartment: "公寓", maintenance: "维修", operations: "运营"
} as const;

export const HOUSING_CHARGE_TYPE_LABELS = {
  rent: "租金", deposit: "押金", electricity: "能耗费", checkout_charges: "退租结算费",
  checkout_deduction: "退租扣款", purchase_recharge: "采购补收"
} as const;
export const HOUSING_PAYMENT_METHOD_LABELS = {
  bank_transfer: "银行转账", cash: "现金", wechat: "微信", alipay: "支付宝", pos: "POS", other: "其他"
} as const;

export const IDENTITY_SUBMISSION_STATUS_LABELS = {
  draft: "草稿", pending_verification: "待核验", verified: "已核验", rejected: "已驳回",
  withdrawn: "已撤回", superseded: "已被替代"
} as const satisfies Record<IdentitySubmissionStatus, string>;
export const PROPERTY_NOTIFICATION_READ_STATUS_LABELS = { unread: "未读", read: "已读" } as const;
export const PROPERTY_NOTIFICATION_TYPE_LABELS = {
  "identity-verification-assigned": "身份核验已分派",
  "homestay-approval-stage-assigned": "民宿审批待处理",
  "housing-approval-stage-assigned": "长租审批待处理",
  "homestay-approval-executed": "民宿审批已执行",
  "housing-approval-executed": "长租审批已执行",
  "homestay-task-assigned": "民宿任务已分派",
  "housing-task-assigned": "长租任务已分派",
  "property-event-delivery-incident": "房产事件投递异常",
  "approval-infra-exhausted": "审批基础设施重试耗尽"
} as const;
export const PROPERTY_EVENT_DELIVERY_INCIDENT_STATUS_LABELS = {
  active: "处理中", replaying: "重放中", resolved: "已解决", quarantined: "已隔离"
} as const satisfies Record<PropertyEventDeliveryIncidentStatus, string>;
export const PROPERTY_EVENT_FAILURE_SIDE_LABELS = { publisher: "发布侧", consumer: "消费侧" } as const;
export const PARTY_IDENTITY_REVEAL_REASON_LABELS = {
  BUSINESS_OPERATION: "业务办理", LEGAL_COMPLIANCE: "法定义务",
  DISPUTE_HANDLING: "争议处理", DATA_SUBJECT_REQUEST: "个人信息主体请求"
} as const;
export const PARTY_IDENTITY_DOCUMENT_TYPE_LABELS = {
  id_card: "身份证", passport: "护照"
} as const;
export const PROPERTY_APPROVAL_ACTION_LABELS = {
  "homestay.bookings.cancel.request": "民宿订单取消",
  "homestay.finance.refund-or-waive.request": "民宿退款或减免",
  "housing.leases.approve.request": "长租租约审批",
  "housing.leases.void.request": "长租租约作废",
  "housing.leases.checkout.request": "长租退租审批",
  "housing.finance.refund-waive-or-deposit-refund.request": "长租退款、减免或押金退还",
  "housing.handovers.complete-move-out-financial.request": "退租交接财务结算",
  "housing.purchases.lifecycle.request": "采购生命周期审批",
  "housing.purchases.transfer.request": "采购费用转应收",
  "property.mode-transition.request": "房源经营模式变更",
  "property.occupancy.force-release.request": "房源占用强制释放"
} as const satisfies Record<TrackBApprovalActionId, string>;

// 当前尚无 Web retention 页面；仅集中保留临时产品术语，不虚构展示入口。
export const PARTY_RETENTION_ACTION_LABELS = {
  restrict_processing: "限制处理", anonymize: "匿名化", delete: "删除", retain_restricted: "限制保留"
} as const;
export const PARTY_RETENTION_LEGAL_REVIEW_STATUS_LABELS = {
  pending_legal_review: "待法务审核", approved: "已批准"
} as const;
export const PARTY_RETENTION_ASSIGNMENT_STATUS_LABELS = {
  pending_classification: "待分类", active: "执行中", due: "到期待执行", held: "法律保全",
  processing_restricted: "已限制处理"
} as const;

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
