export const PROPERTY_BUSINESS_PERMISSIONS = {
  HOMESTAY_MENU: "homestay",
  HOMESTAY_OPERATIONS_PAGE: "homestay:operations",
  HOUSING_RENTAL_MENU: "housing_rental",
  HOUSING_RENTAL_OPERATIONS_PAGE: "housing_rental:operations",

  HOMESTAY_DASHBOARD_PAGE: "homestay:dashboard:page",
  HOMESTAY_TASKS_PAGE: "homestay:tasks:page",
  HOMESTAY_AVAILABILITY_PAGE: "homestay:availability:page",
  HOMESTAY_RATES_PAGE: "homestay:rates:page",
  HOMESTAY_BOOKINGS_PAGE: "homestay:bookings:page",
  HOMESTAY_STAYS_PAGE: "homestay:stays:page",
  HOMESTAY_TURNOVERS_PAGE: "homestay:turnovers:page",
  HOMESTAY_FINANCE_PAGE: "homestay:finance:page",

  HOUSING_DASHBOARD_PAGE: "housing:dashboard:page",
  HOUSING_TASKS_PAGE: "housing:tasks:page",
  HOUSING_TENANTS_PAGE: "housing:tenants:page",
  HOUSING_LEASES_PAGE: "housing:leases:page",
  HOUSING_HANDOVERS_PAGE: "housing:handovers:page",
  HOUSING_BILLING_PAGE: "housing:billing:page",
  HOUSING_FINANCE_PAGE: "housing:finance:page",
  HOUSING_REPAIRS_PAGE: "housing:repairs:page",
  HOUSING_PURCHASES_PAGE: "housing:purchases:page",

  PROPERTY_OPERATION_READ: "property_operation:read",
  PROPERTY_OPERATION_UPDATE: "property_operation:update",
  PROPERTY_OPERATION_TRANSITION_MODE: "property_operation:transition_mode",
  PROPERTY_OCCUPANCY_READ: "property_occupancy:read",
  PROPERTY_OCCUPANCY_CREATE: "property_occupancy:create",
  PROPERTY_OCCUPANCY_ACTIVATE: "property_occupancy:activate",
  PROPERTY_OCCUPANCY_RELEASE: "property_occupancy:release",
  PROPERTY_OCCUPANCY_FORCE_RELEASE: "property_occupancy:force_release",
  PARTY_READ: "party:read",
  PARTY_CREATE: "party:create",
  PARTY_UPDATE: "party:update",
  PARTY_SENSITIVE_READ: "party:sensitive_read",
  PARTY_ROLE_MANAGE: "party_role:manage",
  HOMESTAY_DASHBOARD_READ: "homestay:dashboard:read",
  HOMESTAY_TASK_READ: "homestay:task:read",
  HOMESTAY_RATE_READ: "homestay:rate:read",
  HOMESTAY_RATE_MANAGE: "homestay:rate:manage",
  HOMESTAY_BOOKING_READ: "homestay:booking:read",
  HOMESTAY_BOOKING_CREATE: "homestay:booking:create",
  HOMESTAY_BOOKING_CONFIRM: "homestay:booking:confirm",
  HOMESTAY_BOOKING_CANCEL: "homestay:booking:cancel",
  HOMESTAY_BOOKING_RESCHEDULE: "homestay:booking:reschedule",
  HOMESTAY_STAY_READ: "homestay:stay:read",
  HOMESTAY_STAY_MANAGE: "homestay:stay:manage",
  HOMESTAY_FINANCE_READ: "homestay:finance:read",
  HOMESTAY_FINANCE_REGISTER: "homestay:finance:register",
  HOMESTAY_FINANCE_WAIVE: "homestay:finance:waive",
  HOMESTAY_TURNOVER_READ: "homestay:turnover:read",
  HOMESTAY_TURNOVER_EXECUTE: "homestay:turnover:execute",
  HOUSING_DASHBOARD_READ: "housing:dashboard:read",
  HOUSING_TASK_READ: "housing:task:read",
  HOUSING_TENANT_READ: "housing:tenant:read",
  HOUSING_TENANT_MANAGE: "housing:tenant:manage",
  HOUSING_LEASE_READ: "housing:lease:read",
  HOUSING_LEASE_CREATE: "housing:lease:create",
  HOUSING_LEASE_APPROVE: "housing:lease:approve",
  HOUSING_LEASE_SIGN: "housing:lease:sign",
  HOUSING_LEASE_ACTIVATE: "housing:lease:activate",
  HOUSING_LEASE_CHECKOUT: "housing:lease:checkout",
  HOUSING_HANDOVER_READ: "housing:handover:read",
  HOUSING_HANDOVER_MANAGE: "housing:handover:manage",
  HOUSING_REPAIR_READ: "housing:repair:read",
  HOUSING_REPAIR_MANAGE: "housing:repair:manage",
  HOUSING_FINANCE_READ: "housing:finance:read",
  HOUSING_FINANCE_REGISTER: "housing:finance:register",
  HOUSING_FINANCE_WAIVE: "housing:finance:waive",
  HOUSING_BILLING_READ: "housing:billing:read",
  HOUSING_BILLING_GENERATE: "housing:billing:generate",
  HOUSING_PURCHASE_READ: "housing:purchase:read",
  HOUSING_PURCHASE_MANAGE: "housing:purchase:manage",
  HOUSING_PURCHASE_TRANSFER: "housing:purchase:transfer",

  IDENTITY_SUBMISSIONS_PAGE: "asset:identity-submissions:page",
  PROPERTY_OPERATIONS_PAGE: "asset:property-operations:page",
  PROPERTY_OCCUPANCIES_PAGE: "asset:property-occupancies:page",
  PROPERTY_MODE_TRANSITIONS_PAGE: "asset:property-mode-transitions:page",
  PROPERTY_NOTIFICATIONS_PAGE: "property:notifications:page",
  PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE: "property:event-delivery-incidents:page",
  PROPERTY_APPROVAL_INCIDENTS_PAGE: "property:approval-incidents:page",

  PARTY_IDENTITY_UPDATE: "party:identity_update",
  PARTY_IDENTITY_VERIFY: "party:identity_verify",
  PROPERTY_APPROVAL_CREATE: "property_approval:create",
  PROPERTY_APPROVAL_READ: "property_approval:read",
  PROPERTY_APPROVAL_DECIDE: "property_approval:decide",
  PROPERTY_APPROVAL_WITHDRAW: "property_approval:withdraw",
  PROPERTY_APPROVAL_RETRY: "property_approval:retry",
  PROPERTY_APPROVAL_READ_INCIDENT: "property_approval:read_incident",
  PROPERTY_EVENT_REPLAY: "property_event:replay",
  PROPERTY_EVENT_READ_INCIDENT: "property_event:read_incident",
  PROPERTY_TASK_READ: "property_task:read",
  PROPERTY_TASK_CLAIM: "property_task:claim",
  PROPERTY_TASK_PROCESS: "property_task:process",
  PROPERTY_TASK_RELEASE: "property_task:release",
  PROPERTY_TASK_SUPERVISE: "property_task:supervise",
  PROPERTY_TASK_REBUILD: "property_task:rebuild",
  PROPERTY_NOTIFICATION_READ: "property_notification:read",
  PROPERTY_NOTIFICATION_MARK_READ: "property_notification:mark_read"
} as const;

export type PropertyBusinessPermissionCode =
  (typeof PROPERTY_BUSINESS_PERMISSIONS)[keyof typeof PROPERTY_BUSINESS_PERMISSIONS];

export const PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS = [
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_PAGE, name: "民宿运营看板页面", resource: "homestay.dashboard", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASKS_PAGE, name: "民宿任务页面", resource: "homestay.tasks", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_AVAILABILITY_PAGE, name: "民宿房态页面", resource: "homestay.availability", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATES_PAGE, name: "民宿价格页面", resource: "homestay.rates", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKINGS_PAGE, name: "民宿订单页面", resource: "homestay.bookings", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAYS_PAGE, name: "民宿入住页面", resource: "homestay.stays", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVERS_PAGE, name: "民宿周转页面", resource: "homestay.turnovers", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_PAGE, name: "民宿财务页面", resource: "homestay.finance", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_PAGE, name: "长租经营看板页面", resource: "housing.dashboard", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASKS_PAGE, name: "长租经营任务页面", resource: "housing.tasks", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE, name: "长租租客页面", resource: "housing.tenants", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASES_PAGE, name: "长租租约页面", resource: "housing.leases", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE, name: "长租交割页面", resource: "housing.handovers", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_PAGE, name: "长租账单页面", resource: "housing.billing", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_PAGE, name: "长租财务页面", resource: "housing.finance", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIRS_PAGE, name: "长租报修页面", resource: "housing.repairs", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE, name: "长租采购页面", resource: "housing.purchases", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, name: "身份核验工作台", resource: "asset.identity_submission", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE, name: "共享房产控制面", resource: "asset.property_operation", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE, name: "房产占用工作台", resource: "asset.property_occupancy", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE, name: "房产模式变更审计", resource: "asset.property_mode_transition", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE, name: "房产业务通知", resource: "property.notification", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE, name: "事件投递事故处置", resource: "property.event_delivery_incident", action: "page" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE, name: "审批执行事故处置", resource: "property.approval_incident", action: "page" }
] as const;

export const TRACK_B_ACTION_PERMISSION_CODES = [
  PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
  PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_DECIDE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_WITHDRAW,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_RETRY,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_REPLAY,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_READ,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_CLAIM,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_PROCESS,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_RELEASE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_SUPERVISE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_REBUILD,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_MARK_READ,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT
] as const;

export const TRACK_B_PAGE_PERMISSION_CODES = [
  PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE
] as const;

export interface TrackBPermissionDefinition {
  code: (typeof TRACK_B_ACTION_PERMISSION_CODES)[number];
  resource: string;
  action: string;
  method: "GET" | "POST" | null;
  apiPath: string | null;
  frontendRoute: string | null;
  module: "asset";
}

export const TRACK_B_ACTION_PERMISSION_DEFINITIONS = [
  { code: PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE, resource: "biz.party_identity", action: "update", method: null, apiPath: null, frontendRoute: "/assets/identity-submissions", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY, resource: "biz.party_identity", action: "verify", method: "POST", apiPath: "/api/v1/property/identity-submissions/:submissionId/decisions", frontendRoute: "/assets/identity-submissions", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_CREATE, resource: "biz.property_approval", action: "create", method: null, apiPath: null, frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ, resource: "biz.property_approval", action: "read", method: "GET", apiPath: "/api/v1/property/approvals", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_DECIDE, resource: "biz.property_approval", action: "decide", method: "POST", apiPath: "/api/v1/property/approvals/:requestId/decisions", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_WITHDRAW, resource: "biz.property_approval", action: "withdraw", method: "POST", apiPath: "/api/v1/property/approvals/:requestId/withdraw", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_RETRY, resource: "biz.property_approval_incident", action: "retry", method: "POST", apiPath: "/api/v1/property/approvals/:requestId/retry", frontendRoute: "/property/approval-incidents", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT, resource: "biz.property_approval_incident", action: "read_incident", method: "GET", apiPath: "/api/v1/property/approval-incidents", frontendRoute: "/property/approval-incidents", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT, resource: "biz.property_event_dlq", action: "read_incident", method: "GET", apiPath: "/api/v1/property/event-delivery-incidents", frontendRoute: "/property/event-delivery-incidents", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_REPLAY, resource: "biz.property_event_dlq", action: "replay", method: "POST", apiPath: "/api/v1/property/event-delivery-incidents/:dlqId/replay", frontendRoute: "/property/event-delivery-incidents", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_READ, resource: "biz.property_task", action: "read", method: "GET", apiPath: "/api/v1/property/tasks", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_CLAIM, resource: "biz.property_task", action: "claim", method: "POST", apiPath: "/api/v1/property/tasks/:taskId/claim", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_PROCESS, resource: "biz.property_task", action: "process", method: "POST", apiPath: "/api/v1/property/tasks/:taskId/start", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_RELEASE, resource: "biz.property_task", action: "release", method: "POST", apiPath: "/api/v1/property/tasks/:taskId/release", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_SUPERVISE, resource: "biz.property_task", action: "supervise", method: "POST", apiPath: "/api/v1/property/tasks/:taskId/unblock", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_TASK_REBUILD, resource: "biz.property_task_projection", action: "rebuild", method: "POST", apiPath: "/api/v1/property/tasks/internal/rebuild", frontendRoute: null, module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ, resource: "biz.property_notification", action: "read", method: "GET", apiPath: "/api/v1/property/notifications", frontendRoute: "/property/notifications", module: "asset" },
  { code: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_MARK_READ, resource: "biz.property_notification", action: "mark_read", method: "POST", apiPath: "/api/v1/property/notifications/:notificationId/read", frontendRoute: "/property/notifications", module: "asset" }
] as const satisfies readonly TrackBPermissionDefinition[];

export const PROPERTY_BUSINESS_PAGE_PERMISSION_CODES = PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS
  .map((seed) => seed.code);

export const PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS = [
  PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
  PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_OPERATIONS_PAGE
] as const;
