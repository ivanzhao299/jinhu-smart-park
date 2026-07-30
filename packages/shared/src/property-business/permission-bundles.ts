import {
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PAGE_PERMISSION_CODES,
  PROPERTY_BUSINESS_PERMISSIONS,
  type PropertyBusinessPermissionCode
} from "./permissions";

export interface PropertyPermissionBundle {
  code: string;
  description: string;
  permissions: readonly PropertyBusinessPermissionCode[];
}

export const PROPERTY_PERMISSION_BUNDLES = {
  HOMESTAY_OVERVIEW: {
    code: "property-bundle:homestay-overview",
    description: "民宿看板、任务和房态只读能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASKS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_AVAILABILITY_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_READ,
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
    description: "住房出租看板与任务能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASKS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_READ
    ]
  },
  HOUSING_TENANTS: {
    code: "property-bundle:housing-tenants",
    description: "住房租客查看与维护能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_MANAGE
    ]
  },
  HOUSING_LEASES: {
    code: "property-bundle:housing-leases",
    description: "住房租约查看与生命周期处理能力",
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
    description: "住房交割查看与处理能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ]
  },
  HOUSING_BILLING: {
    code: "property-bundle:housing-billing",
    description: "住房费用计划和账单生成能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_GENERATE
    ]
  },
  HOUSING_FINANCE: {
    code: "property-bundle:housing-finance",
    description: "住房财务查看与登记能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_REGISTER,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_WAIVE
    ]
  },
  HOUSING_REPAIRS: {
    code: "property-bundle:housing-repairs",
    description: "住房报修查看与代录能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIRS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_MANAGE
    ]
  },
  HOUSING_PURCHASES: {
    code: "property-bundle:housing-purchases",
    description: "住房采购查看、维护与转收费能力",
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
    ]
  }
} as const satisfies Record<string, PropertyPermissionBundle>;

export function validatePropertyPermissionBundles(
  bundles: Record<string, PropertyPermissionBundle> = PROPERTY_PERMISSION_BUNDLES
): string[] {
  const issues: string[] = [];
  const bundleCodes = new Set<string>();
  const legacyCodes = new Set<string>(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
  const knownCodes = new Set<string>(Object.values(PROPERTY_BUSINESS_PERMISSIONS));
  const pageCodes = new Set<string>(PROPERTY_BUSINESS_PAGE_PERMISSION_CODES);
  const pageOwners = new Map<string, string>();

  for (const bundle of Object.values(bundles)) {
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
        const previousOwner = pageOwners.get(permission);
        if (previousOwner) {
          issues.push(`Page permission belongs to multiple bundles: ${permission} -> ${previousOwner}, ${bundle.code}`);
        } else {
          pageOwners.set(permission, bundle.code);
        }
      }
    }
    if (pageCount === 0) issues.push(`Bundle has no canonical page permission: ${bundle.code}`);
  }
  for (const pageCode of pageCodes) {
    if (!pageOwners.has(pageCode)) {
      issues.push(`Canonical page permission has no bundle: ${pageCode}`);
    }
  }
  return issues;
}
