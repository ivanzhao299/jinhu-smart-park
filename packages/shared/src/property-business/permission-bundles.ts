import {
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PAGE_PERMISSION_CODES,
  PROPERTY_BUSINESS_PERMISSIONS
} from "./permissions";

export interface PropertyPermissionBundle {
  code: string;
  description: string;
  permissions: readonly string[];
}

export const TRACK_B_PERMISSION_BUNDLES = {
  PARTY_PROFILE_CLERK: {
    code: "property-bundle:property-party-profile-clerk",
    description: "Party 建档",
    permissions: ["asset:party", "party:read", "party:create", "party:update"]
  },
  IDENTITY_OPERATOR: {
    code: "property-bundle:property-identity-operator",
    description: "身份资料录入",
    permissions: [
      "asset:party", "asset:identity-submissions:page", "party:read",
      "party:identity_update", "file:read", "file:upload", "file:download", "file:delete"
    ]
  },
  IDENTITY_VERIFIER: {
    code: "property-bundle:property-identity-verifier",
    description: "身份资料核验",
    permissions: [
      "asset:party", "asset:identity-submissions:page", "party:read",
      "party:identity_verify", "file:read", "file:download"
    ]
  },
  HOMESTAY_TASK_OPERATOR: {
    code: "property-bundle:property-homestay-task-operator",
    description: "民宿任务处理",
    permissions: [
      "homestay:tasks:page", "property:notifications:page", "property_task:read",
      "property_task:claim", "property_task:process", "property_task:release",
      "property_notification:read", "property_notification:mark_read",
      "homestay:task:read"
    ]
  },
  HOUSING_OPERATOR: {
    code: "property-bundle:property-housing-operator",
    description: "住房业务处理",
    permissions: [
      "housing:tasks:page", "property:notifications:page", "property_approval:create",
      "property_approval:read", "property_approval:withdraw", "property_task:read",
      "property_task:claim", "property_task:process", "property_task:release",
      "property_notification:read", "property_notification:mark_read"
    ]
  },
  ASSET_MANAGER: {
    code: "property-bundle:property-asset-manager",
    description: "共享房产控制",
    permissions: [
      "asset:property-operations:page", "asset:property-occupancies:page",
      "asset:property-mode-transitions:page", "property:notifications:page",
      "property_operation:read", "property_operation:update",
      "property_operation:transition_mode", "property_occupancy:read",
      "property_occupancy:create", "property_occupancy:activate",
      "property_occupancy:release",
      "property_occupancy:force_release", "property_approval:create",
      "property_approval:read", "property_approval:withdraw", "property_task:read",
      "property_notification:read", "property_notification:mark_read"
    ]
  },
  HOMESTAY_FINANCE_OPERATOR: {
    code: "property-bundle:property-homestay-finance-operator",
    description: "民宿财务经办",
    permissions: [
      "homestay:finance:page", "homestay:bookings:page", "homestay:finance:read",
      "homestay:finance:register", "homestay:finance:waive", "homestay:booking:read",
      "property:notifications:page", "property_approval:create", "property_approval:read",
      "property_approval:withdraw", "property_notification:read",
      "property_notification:mark_read"
    ]
  },
  HOUSING_FINANCE_OPERATOR: {
    code: "property-bundle:property-housing-finance-operator",
    description: "长租财务经办",
    permissions: [
      "housing:finance:page", "housing:finance:read", "housing:finance:register",
      "housing:finance:waive", "property:notifications:page", "property_approval:create",
      "property_approval:read", "property_approval:withdraw", "property_notification:read",
      "property_notification:mark_read"
    ]
  },
  HOMESTAY_APPROVER: {
    code: "property-bundle:property-homestay-approver",
    description: "民宿审批",
    permissions: [
      "homestay:tasks:page", "property:notifications:page", "property_approval:read",
      "property_approval:decide", "property_task:read", "property_task:claim",
      "property_task:process", "property_task:release", "property_notification:read",
      "property_notification:mark_read"
    ]
  },
  HOUSING_APPROVER: {
    code: "property-bundle:property-housing-approver",
    description: "住房审批",
    permissions: [
      "housing:tasks:page", "property:notifications:page", "property_approval:read",
      "property_approval:decide", "property_task:read", "property_task:claim",
      "property_task:process", "property_task:release", "property_notification:read",
      "property_notification:mark_read", "housing:task:read"
    ]
  },
  HOMESTAY_TASK_SUPERVISOR: {
    code: "property-bundle:property-homestay-task-supervisor",
    description: "民宿任务督办",
    permissions: [
      "homestay:tasks:page", "property:notifications:page", "property_task:read",
      "property_task:supervise", "property_notification:read",
      "property_notification:mark_read"
    ]
  },
  HOUSING_TASK_SUPERVISOR: {
    code: "property-bundle:property-housing-task-supervisor",
    description: "住房任务督办",
    permissions: [
      "housing:tasks:page", "property:notifications:page", "property_task:read",
      "property_task:supervise", "property_notification:read",
      "property_notification:mark_read"
    ]
  },
  AUDITOR: {
    code: "property-bundle:property-auditor",
    description: "房产业务审计",
    permissions: [
      "asset:identity-submissions:page", "asset:property-occupancies:page",
      "asset:property-mode-transitions:page", "party:read", "party:sensitive_read",
      "audit:read", "property_approval:read", "property_task:read"
    ]
  },
  EVENT_DELIVERY_OPERATOR: {
    code: "property-bundle:property-event-delivery-operator",
    description: "事件投递事故处置",
    permissions: [
      "property:event-delivery-incidents:page", "property_event:read_incident",
      "property_event:replay", "audit:read"
    ]
  },
  APPROVAL_INCIDENT_OPERATOR: {
    code: "property-bundle:property-approval-incident-operator",
    description: "审批执行事故处置",
    permissions: [
      "property:approval-incidents:page", "property_approval:read_incident",
      "property_approval:read", "property_approval:retry", "audit:read"
    ]
  },
  TASK_ADMIN: {
    code: "property-bundle:property-task-admin",
    description: "任务投影维护",
    permissions: ["property_task:read", "property_task:rebuild", "audit:read"]
  }
} as const satisfies Record<string, PropertyPermissionBundle>;

const TRACK_B_BUNDLE_CODES = new Set<string>(
  Object.values(TRACK_B_PERMISSION_BUNDLES).map((bundle) => bundle.code)
);

export const PROPERTY_PERMISSION_BUNDLES = {
  HOMESTAY_OVERVIEW: {
    code: "property-bundle:homestay-overview",
    description: "民宿看板、任务和房态只读能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASKS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_AVAILABILITY_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASK_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ
    ]
  },
  HOMESTAY_RATES: {
    code: "property-bundle:homestay-rates",
    description: "民宿价格查看与配置能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATES_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_MANAGE
    ]
  },
  HOMESTAY_BOOKINGS: {
    code: "property-bundle:homestay-bookings",
    description: "民宿订单查看与处理能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKINGS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CREATE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CANCEL,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_RESCHEDULE
    ]
  },
  HOMESTAY_STAYS: {
    code: "property-bundle:homestay-stays",
    description: "民宿接待和入住退房能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAYS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_MANAGE
    ]
  },
  HOMESTAY_TURNOVERS: {
    code: "property-bundle:homestay-turnovers",
    description: "民宿周转任务查看与执行能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVERS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE
    ]
  },
  HOMESTAY_FINANCE: {
    code: "property-bundle:homestay-finance",
    description: "民宿财务查看与登记能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
    ]
  },
  HOUSING_OVERVIEW: {
    code: "property-bundle:housing-overview",
    description: "长租经营看板与任务能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASKS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASK_READ
    ]
  },
  HOUSING_TENANTS: {
    code: "property-bundle:housing-tenants",
    description: "长租租客查看与维护能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE
    ]
  },
  HOUSING_LEASES: {
    code: "property-bundle:housing-leases",
    description: "长租租约查看与生命周期处理能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASES_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CREATE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_APPROVE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_SIGN,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_ACTIVATE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_CHECKOUT
    ]
  },
  HOUSING_HANDOVERS: {
    code: "property-bundle:housing-handovers",
    description: "长租交割查看与处理能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ]
  },
  HOUSING_BILLING: {
    code: "property-bundle:housing-billing",
    description: "长租费用计划和账单生成能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE
    ]
  },
  HOUSING_FINANCE: {
    code: "property-bundle:housing-finance",
    description: "长租财务查看与登记能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE
    ]
  },
  HOUSING_REPAIRS: {
    code: "property-bundle:housing-repairs",
    description: "长租报修查看与代录能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIRS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE
    ]
  },
  HOUSING_PURCHASES: {
    code: "property-bundle:housing-purchases",
    description: "长租采购查看、维护与转收费能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
    ]
  },
  ...TRACK_B_PERMISSION_BUNDLES
} as const satisfies Record<string, PropertyPermissionBundle>;

export function validateTrackBPermissionBundles(
  bundles: Record<string, PropertyPermissionBundle> = TRACK_B_PERMISSION_BUNDLES
): string[] {
  const issues: string[] = [];
  const expected = new Map<string, readonly string[]>(
    Object.values(TRACK_B_PERMISSION_BUNDLES).map((bundle) => [
      bundle.code,
      bundle.permissions as readonly string[]
    ])
  );
  const actual = new Map(Object.values(bundles).map((bundle) => [bundle.code, bundle]));
  if (actual.size !== expected.size) {
    issues.push(`Track B bundle count must be ${expected.size}, received ${actual.size}`);
  }
  for (const [code, permissions] of expected) {
    const bundle = actual.get(code);
    if (!bundle) {
      issues.push(`Missing Track B bundle: ${code}`);
      continue;
    }
    if (new Set(bundle.permissions).size !== bundle.permissions.length) {
      issues.push(`Duplicate Track B bundle permission: ${code}`);
    }
    if (
      bundle.permissions.length !== permissions.length ||
      bundle.permissions.some((permission, index) => permission !== permissions[index])
    ) {
      issues.push(`Track B bundle grants drifted: ${code}`);
    }
  }
  for (const code of actual.keys()) {
    if (!expected.has(code)) issues.push(`Unknown Track B bundle: ${code}`);
  }
  return issues;
}

export function validatePropertyPermissionBundles(
  bundles: Record<string, PropertyPermissionBundle> = PROPERTY_PERMISSION_BUNDLES
): string[] {
  const issues: string[] = [];
  const bundleCodes = new Set<string>();
  const legacyCodes = new Set<string>(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
  const knownCodes = new Set<string>(Object.values(PROPERTY_BUSINESS_PERMISSIONS));
  for (const code of [
    "asset:party", "file:read", "file:upload", "file:download", "file:delete",
    "audit:read"
  ]) knownCodes.add(code);
  const pageCodes = new Set<string>(PROPERTY_BUSINESS_PAGE_PERMISSION_CODES);
  const pageOwners = new Map<string, string>();

  for (const bundle of Object.values(bundles)) {
    const isTrackBBundle = TRACK_B_BUNDLE_CODES.has(bundle.code);
    if (bundleCodes.has(bundle.code)) issues.push(`Duplicate bundle code: ${bundle.code}`);
    bundleCodes.add(bundle.code);
    if (bundle.permissions.length === 0) issues.push(`Bundle has no permissions: ${bundle.code}`);
    const seenPermissions = new Set<string>();
    let pageCount = 0;
    for (const permission of bundle.permissions) {
      if (seenPermissions.has(permission)) {
        issues.push(`Duplicate bundle permission: ${bundle.code} -> ${permission}`);
      }
      seenPermissions.add(permission);
      if (!knownCodes.has(permission)) {
        issues.push(`Unknown bundle permission: ${bundle.code} -> ${permission}`);
      }
      if (legacyCodes.has(permission)) {
        issues.push(`Legacy permission must not grant a bundle: ${bundle.code} -> ${permission}`);
      }
      if (pageCodes.has(permission)) {
        pageCount += 1;
        if (isTrackBBundle) continue;
        const previousOwner = pageOwners.get(permission);
        if (previousOwner) {
          issues.push(`Page permission belongs to multiple bundles: ${permission} -> ${previousOwner}, ${bundle.code}`);
        } else {
          pageOwners.set(permission, bundle.code);
        }
      }
    }
    if (!isTrackBBundle && pageCount === 0) {
      issues.push(`Bundle has no canonical page permission: ${bundle.code}`);
    }
  }
  for (const pageCode of pageCodes) {
    if (
      ([
        PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE
      ] as readonly string[]).includes(pageCode)
    ) continue;
    if (!pageOwners.has(pageCode)) {
      issues.push(`Canonical page permission has no bundle: ${pageCode}`);
    }
  }
  return issues;
}
