import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import type { ReturnContextPolicy } from "../../../features/property-shared";

export const HOUSING_WORKBENCH_SURFACES = [
  {
    featureId: "housing.dashboard",
    route: "/housing/dashboard",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_PAGE,
    readActionId: "housing.dashboard.read"
  },
  {
    featureId: "housing.tasks",
    route: "/housing/tasks",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASKS_PAGE,
    readActionId: "housing.tasks.list"
  },
  {
    featureId: "housing.tenants",
    route: "/housing/tenants",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
    readActionId: "housing.tenants.list"
  },
  {
    featureId: "housing.leases",
    route: "/housing/leases",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASES_PAGE,
    readActionId: "housing.leases.list"
  },
  {
    featureId: "housing.handovers",
    route: "/housing/handovers",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
    readActionId: "housing.handovers.list"
  },
  {
    featureId: "housing.billing",
    route: "/housing/billing",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_PAGE,
    readActionId: "housing.billing.list"
  },
  {
    featureId: "housing.finance",
    route: "/housing/finance",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_PAGE,
    readActionId: "housing.finance.list"
  },
  {
    featureId: "housing.repairs",
    route: "/housing/repairs",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIRS_PAGE,
    readActionId: "housing.repairs.list"
  },
  {
    featureId: "housing.purchases",
    route: "/housing/purchases",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
    readActionId: "housing.purchases.list"
  }
] as const;

export const HOUSING_DETAIL_ROUTES = {
  leases: "/housing/leases/[leaseId]",
  handovers: "/housing/handovers/[handoverId]",
  repairs: "/housing/repairs/[repairId]",
  purchases: "/housing/purchases/[purchaseId]"
} as const;

export const HOUSING_RUNTIME_APPROVAL_SOURCE_TYPES = [
  "property-operation-config",
  "housing-lease",
  "housing-handover",
  "housing-purchase"
] as const;

export const HOUSING_RUNTIME_TASK_SOURCE_TYPES = [
  "housing_lease",
  "housing_handover",
  "housing_repair",
  "housing_billing",
  "housing_purchase"
] as const;

export const HOUSING_RETURN_CONTEXT_POLICY: ReturnContextPolicy = {
  origin: "https://workbench.local",
  fallbackHref: "/housing/dashboard",
  routes: Object.fromEntries(HOUSING_WORKBENCH_SURFACES.map((surface) => [
    surface.route,
    {
      pathTemplate: surface.route,
      allowedQueryKeys: [
        "page",
        "keyword",
        "status",
        "source_type",
        "handover_type",
        "approval_status",
        "sort",
        "order",
        "taskId",
        "requestId"
      ]
    }
  ]))
};

interface LandingSubject {
  permissions?: readonly string[];
  is_super?: boolean;
  enabled_modules?: ReadonlyArray<{
    module_code?: string;
    enabled?: boolean;
  }>;
}

function hasModule(user: LandingSubject | null, moduleCode: string): boolean {
  return Boolean(user?.enabled_modules?.some(
    (module) => module.module_code === moduleCode && module.enabled !== false
  ));
}

function hasPermission(user: LandingSubject | null, permission: string): boolean {
  return Boolean(
    user
    && (
      user.is_super === true
      || user.permissions?.includes("*")
      || user.permissions?.includes(permission)
    )
  );
}

export function resolveHousingLanding(
  user: LandingSubject | null
): (typeof HOUSING_WORKBENCH_SURFACES)[number]["route"] | null {
  if (!hasModule(user, "housing_rental") || !hasModule(user, "asset")) {
    return null;
  }
  return HOUSING_WORKBENCH_SURFACES.find(
    (surface) => hasPermission(user, surface.pagePermission)
  )?.route ?? null;
}

function isNonZeroDecimal(value: string): boolean {
  return !/^0+(?:\.0+)?$/.test(value.trim());
}

export function isHousingFinancialHandover(input: {
  handoverType: "move_in" | "move_out";
  damageAmount: string;
  unsettledAmount: string;
  depositDeductionAmount: string;
}): boolean {
  return input.handoverType === "move_out"
    && [
      input.damageAmount,
      input.unsettledAmount,
      input.depositDeductionAmount
    ].some(isNonZeroDecimal);
}

export type HousingHandoverType = "move_in" | "move_out";

export function housingHandoverTypes(leaseStatus: string): readonly HousingHandoverType[] {
  if (leaseStatus === "active") return ["move_in", "move_out"];
  if (leaseStatus === "expiring" || leaseStatus === "checkout_pending") return ["move_out"];
  return [];
}
