import { PROPERTY_BUSINESS_PERMISSIONS } from "./permissions";

export type PropertyBusinessModuleCode = "homestay" | "housing_rental";

export const HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE = "/workorders/[id]";

export interface PropertyBusinessSurfaceRoute {
  featureId: string;
  moduleCode: PropertyBusinessModuleCode;
  menuCode: string;
  pageCode: string;
  route: string;
  detailRoutes: readonly string[];
}

export const PROPERTY_BUSINESS_SURFACES = [
  {
    featureId: "homestay.dashboard",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_DASHBOARD_PAGE,
    route: "/homestay/dashboard",
    detailRoutes: []
  },
  {
    featureId: "homestay.tasks",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASKS_PAGE,
    route: "/homestay/tasks",
    detailRoutes: []
  },
  {
    featureId: "homestay.availability",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_AVAILABILITY_PAGE,
    route: "/homestay/availability",
    detailRoutes: []
  },
  {
    featureId: "homestay.rates",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATES_PAGE,
    route: "/homestay/rates",
    detailRoutes: []
  },
  {
    featureId: "homestay.bookings",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKINGS_PAGE,
    route: "/homestay/bookings",
    detailRoutes: ["/homestay/bookings/[bookingId]"]
  },
  {
    featureId: "homestay.stays",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAYS_PAGE,
    route: "/homestay/stays",
    detailRoutes: ["/homestay/stays/[stayId]"]
  },
  {
    featureId: "homestay.turnovers",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TURNOVERS_PAGE,
    route: "/homestay/turnovers",
    detailRoutes: ["/homestay/turnovers/[turnoverId]"]
  },
  {
    featureId: "homestay.finance",
    moduleCode: "homestay",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_FINANCE_PAGE,
    route: "/homestay/finance",
    detailRoutes: []
  },
  {
    featureId: "housing.dashboard",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_DASHBOARD_PAGE,
    route: "/housing/dashboard",
    detailRoutes: []
  },
  {
    featureId: "housing.tasks",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASKS_PAGE,
    route: "/housing/tasks",
    detailRoutes: []
  },
  {
    featureId: "housing.tenants",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
    route: "/housing/tenants",
    detailRoutes: []
  },
  {
    featureId: "housing.leases",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASES_PAGE,
    route: "/housing/leases",
    detailRoutes: ["/housing/leases/[leaseId]"]
  },
  {
    featureId: "housing.handovers",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
    route: "/housing/handovers",
    detailRoutes: ["/housing/handovers/[handoverId]"]
  },
  {
    featureId: "housing.billing",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_PAGE,
    route: "/housing/billing",
    detailRoutes: []
  },
  {
    featureId: "housing.finance",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_PAGE,
    route: "/housing/finance",
    detailRoutes: []
  },
  {
    featureId: "housing.repairs",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIRS_PAGE,
    route: "/housing/repairs",
    detailRoutes: ["/housing/repairs/[repairId]"]
  },
  {
    featureId: "housing.purchases",
    moduleCode: "housing_rental",
    menuCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_MENU,
    pageCode: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
    route: "/housing/purchases",
    detailRoutes: ["/housing/purchases/[purchaseId]"]
  }
] as const satisfies readonly PropertyBusinessSurfaceRoute[];

export const PROPERTY_BUSINESS_LANDING = {
  homestay: {
    moduleCode: "homestay",
    legacyAlias: "/homestay",
    legacyPermission: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
    orderedFeatureIds: [
      "homestay.dashboard",
      "homestay.tasks",
      "homestay.availability",
      "homestay.rates",
      "homestay.bookings",
      "homestay.stays",
      "homestay.turnovers",
      "homestay.finance"
    ]
  },
  housing_rental: {
    moduleCode: "housing_rental",
    legacyAlias: "/housing",
    legacyPermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_OPERATIONS_PAGE,
    orderedFeatureIds: [
      "housing.dashboard",
      "housing.tasks",
      "housing.tenants",
      "housing.leases",
      "housing.handovers",
      "housing.billing",
      "housing.finance",
      "housing.repairs",
      "housing.purchases"
    ]
  }
} as const;

export interface PropertyBusinessCompatibilityRedirect {
  source: string;
  target: string;
  sourceModule: PropertyBusinessModuleCode;
  sourcePagePermission: string;
  targetModule: "asset";
  targetPagePermission: string;
  targetReadPermission: string;
  targetAuthorization: "module-page-read";
}

export const PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS:
  readonly PropertyBusinessCompatibilityRedirect[] = [
    {
      source: "/housing/tenants/[partyId]",
      target: "/assets/parties/[partyId]",
      sourceModule: "housing_rental",
      sourcePagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
      targetModule: "asset",
      targetPagePermission: "asset:party",
      targetReadPermission: PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
      targetAuthorization: "module-page-read"
    }
  ];

export interface PropertyCompatibilityAccess {
  enabledModules: readonly string[];
  permissions: readonly string[];
  isSuper?: boolean;
}

export function canResolvePropertyCompatibilityRedirect(
  redirect: PropertyBusinessCompatibilityRedirect,
  access: PropertyCompatibilityAccess
): boolean {
  const modules = new Set(access.enabledModules);
  const permissions = new Set(access.permissions);
  const hasPermission = (permission: string) =>
    access.isSuper === true || permissions.has("*") || permissions.has(permission);
  return modules.has(redirect.sourceModule)
    && modules.has(redirect.targetModule)
    && hasPermission(redirect.sourcePagePermission)
    && hasPermission(redirect.targetPagePermission)
    && hasPermission(redirect.targetReadPermission);
}

export function findPropertyBusinessSurface(path: string): PropertyBusinessSurfaceRoute | undefined {
  return PROPERTY_BUSINESS_SURFACES.find((surface) =>
    surface.route === path || (surface.detailRoutes as readonly string[]).includes(path)
  );
}
