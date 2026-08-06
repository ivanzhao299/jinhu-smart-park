import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { INTERCEPTORS_METADATA, PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import {
  PROPERTY_ACCESS_MANIFEST,
  PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS,
  PROPERTY_BUSINESS_LANDING,
  PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS,
  PROPERTY_BUSINESS_PAGE_PERMISSION_CODES,
  PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES,
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_PERMISSION_BUNDLES,
  PROPERTY_WORKBENCH_REQUIRED_GET_ACTION_IDS,
  HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE,
  SYSTEM_PERMISSIONS,
  SYSTEM_PERMISSION_SEEDS,
  TRACK_A_HIGH_RISK_ACTION_IDS,
  TRACK_B_ACTION_PERMISSION_CODES,
  TRACK_B_PAGE_PERMISSION_CODES,
  TRACK_B_PERMISSION_BUNDLES,
  type HomestayAvailabilityListResponse,
  type HomestayAvailabilityResponse,
  type HomestayBookingDetailResponse,
  type HomestayBookingListItem,
  type HomestayRateCalendarResponse,
  type HomestayTurnoverListItem,
  type HousingHandoverListItem,
  type HousingEmbeddedHandoverResponse,
  type HousingChargePlanResponse,
  type HousingLeaseDetailResponse,
  type HousingLeaseListItem,
  type HousingLedgerEntryResponse,
  type HousingPurchaseDetailResponse,
  type HousingPurchaseListItem,
  type HousingReceivableResponse,
  type HousingRepairListItem,
  type HousingRepairWorkOrderRef,
  type HousingTenantListItem,
  type PropertyAccessManifestEntry,
  type PropertyPermissionBundle,
  findPropertyBusinessSurface,
  validatePropertyAccessManifest,
  validatePropertyPermissionBundles
} from "@jinhu/shared";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import {
  PROPERTY_HIGH_RISK_ACTION_KEY,
  type PropertyHighRiskActionMetadata
} from "../../shared/decorators/property-high-risk-action.decorator";
import { HomestayController } from "../homestay/homestay.controller";
import { HousingController } from "../housing/housing.controller";

interface ControllerEndpoint {
  key: string;
  requiredPermissions: string[];
  anyPermissions: string[];
  hasIdempotencyInterceptor: boolean;
  highRiskAction?: PropertyHighRiskActionMetadata;
}

const EXPECTED_DETAIL_ROUTES = [
  "/homestay/bookings/[bookingId]",
  "/homestay/stays/[stayId]",
  "/homestay/turnovers/[turnoverId]",
  "/housing/handovers/[handoverId]",
  "/housing/leases/[leaseId]",
  "/housing/purchases/[purchaseId]",
  "/housing/repairs/[repairId]"
] as const;

const EXPECTED_GET_ACTION_IDS = [
  "homestay.availability.read",
  "homestay.bookings.detail",
  "homestay.bookings.guest-candidates",
  "homestay.bookings.list",
  "homestay.dashboard.read",
  "homestay.finance.list",
  "homestay.rates.read",
  "homestay.rates.unit-candidates",
  "homestay.stays.detail",
  "homestay.stays.list",
  "homestay.tasks.list",
  "homestay.turnovers.detail",
  "homestay.turnovers.list",
  "homestay.turnovers.work-order-candidates",
  "housing.billing.list",
  "housing.dashboard.read",
  "housing.finance.list",
  "housing.handovers.detail",
  "housing.handovers.list",
  "housing.billing.energy-meter-candidates",
  "housing.leases.detail",
  "housing.leases.list",
  "housing.leases.unit-candidates",
  "housing.purchases.detail",
  "housing.purchases.list",
  "housing.repairs.detail",
  "housing.repairs.list",
  "housing.tasks.list",
  "housing.tenants.list"
] as const;

const EXPECTED_HIGH_RISK_ACTION_IDS = [
  "homestay.bookings.cancel",
  "homestay.finance.refund-or-waive",
  "housing.finance.refund-waive-or-deposit-refund",
  "housing.handovers.complete-move-out-financial",
  "housing.leases.approve",
  "housing.leases.checkout",
  "housing.leases.void",
  "housing.purchases.lifecycle",
  "housing.purchases.transfer"
] as const;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function controllerEndpoints(
  controller: new (...args: never[]) => unknown
): ControllerEndpoint[] {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
  return Object.getOwnPropertyNames(controller.prototype).flatMap((methodName) => {
    if (methodName === "constructor") return [];
    const handler = controller.prototype[methodName as keyof typeof controller.prototype];
    if (typeof handler !== "function") return [];
    const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (requestMethod === undefined) return [];
    const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string;
    const method = RequestMethod[requestMethod];
    const interceptors = (Reflect.getMetadata(INTERCEPTORS_METADATA, handler) ?? []) as Array<{
      constructor?: { name?: string };
    }>;
    return [{
      key: `${method} /${[controllerPath, methodPath].filter(Boolean).join("/")}`,
      requiredPermissions: Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? [],
      anyPermissions: Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler) ?? [],
      hasIdempotencyInterceptor: interceptors.some(
        (interceptor) => interceptor.constructor?.name === "IdempotencyInterceptor"
      ),
      highRiskAction: Reflect.getMetadata(
        PROPERTY_HIGH_RISK_ACTION_KEY,
        handler
      )
    }];
  });
}

test("property-business manifest defines 17 canonical surfaces and seven inherited detail routes", () => {
  assert.equal(PROPERTY_BUSINESS_SURFACES.length, 17);
  assert.equal(PROPERTY_ACCESS_MANIFEST.length, 17);

  const detailRoutes = PROPERTY_BUSINESS_SURFACES.flatMap((surface) =>
    surface.detailRoutes.map((route) => ({
      route,
      pageCode: surface.pageCode
    }))
  );
  assert.deepEqual(
    detailRoutes.map((item) => item.route).sort(),
    [...EXPECTED_DETAIL_ROUTES].sort()
  );
  for (const detail of detailRoutes) {
    assert.equal(findPropertyBusinessSurface(detail.route)?.pageCode, detail.pageCode);
  }
  assert.equal(
    PROPERTY_BUSINESS_SURFACES.some((surface) => surface.pageCode.includes("detail")),
    false
  );
});

test("landing priority and compatibility aliases are fixed without granting a canonical page", () => {
  assert.deepEqual(PROPERTY_BUSINESS_LANDING.homestay.orderedFeatureIds, [
    "homestay.dashboard",
    "homestay.tasks",
    "homestay.availability",
    "homestay.rates",
    "homestay.bookings",
    "homestay.stays",
    "homestay.turnovers",
    "homestay.finance"
  ]);
  assert.deepEqual(PROPERTY_BUSINESS_LANDING.housing_rental.orderedFeatureIds, [
    "housing.dashboard",
    "housing.tasks",
    "housing.tenants",
    "housing.leases",
    "housing.handovers",
    "housing.billing",
    "housing.finance",
    "housing.repairs",
    "housing.purchases"
  ]);
  assert.equal(PROPERTY_BUSINESS_LANDING.homestay.legacyAlias, "/homestay");
  assert.equal(PROPERTY_BUSINESS_LANDING.housing_rental.legacyAlias, "/housing");
  assert.deepEqual(PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS, [
    {
      source: "/housing/tenants/[partyId]",
      target: "/assets/parties/[partyId]",
      sourceModule: "housing_rental",
      sourcePagePermission: "housing:tenants:page",
      targetModule: "asset",
      targetPagePermission: "asset:party",
      targetReadPermission: "party:read",
      targetAuthorization: "module-page-read"
    }
  ]);
  assert.equal(
    PROPERTY_BUSINESS_SURFACES.some((surface) =>
      surface.route.startsWith("/assets/parties/")
      || surface.detailRoutes.some((route) =>
        route.startsWith("/assets/parties/")
      )
    ),
    false
  );
});

test("root permission exports preserve legacy/action values and seed every granular page once", () => {
  for (const [key, value] of Object.entries(PROPERTY_BUSINESS_PERMISSIONS)) {
    assert.equal(SYSTEM_PERMISSIONS[key as keyof typeof SYSTEM_PERMISSIONS], value);
  }
  assert.deepEqual(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS, [
    "homestay:operations",
    "housing_rental:operations"
  ]);

  assert.equal(TRACK_B_PAGE_PERMISSION_CODES.length, 7);
  assert.equal(PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS.length, 24);
  assert.equal(
    new Set(PROPERTY_BUSINESS_PAGE_PERMISSION_CODES).size,
    PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS.length
  );
  assert.deepEqual(
    PROPERTY_BUSINESS_PAGE_PERMISSION_CODES.slice(-TRACK_B_PAGE_PERMISSION_CODES.length),
    [...TRACK_B_PAGE_PERMISSION_CODES]
  );
  const migrationOwnedPermissionCodes = new Set<string>(TRACK_B_ACTION_PERMISSION_CODES);
  assert.equal(migrationOwnedPermissionCodes.size, 18);
  for (const code of Object.values(PROPERTY_BUSINESS_PERMISSIONS)) {
    const expectedSeedCount = migrationOwnedPermissionCodes.has(code) ? 0 : 1;
    assert.equal(
      SYSTEM_PERMISSION_SEEDS.filter((seed) => seed.code === code).length,
      expectedSeedCount,
      migrationOwnedPermissionCodes.has(code)
        ? `${code} is owned by migration 000189 and must not be production-seeded`
        : `${code} must have exactly one production seed`
    );
  }

  const definitionSql = readFileSync(
    resolve(
      __dirname,
      "../../../../../database/migrations/000189_property_b_module_rbac_definitions.sql"
    ),
    "utf8"
  );
  const signedCodeBlock = definitionSql.match(
    /INSERT INTO b0_signed_permission_code VALUES([\s\S]+?);\n\nUPDATE/
  )?.[1];
  const signedDefinitionBlock = definitionSql.match(
    /signed_permission\([\s\S]+?\) AS \(\s*VALUES([\s\S]+?)\n\)\nINSERT INTO sys_permission/
  )?.[1];
  assert.ok(signedCodeBlock);
  assert.ok(signedDefinitionBlock);
  const expectedTrackBPermissions = [
    ...TRACK_B_ACTION_PERMISSION_CODES,
    ...TRACK_B_PAGE_PERMISSION_CODES
  ].sort();
  const extractCodes = (block: string) =>
    [...block.matchAll(/^\s*\('([^']+)'/gm)].map((match) => match[1]!).sort();
  assert.deepEqual(extractCodes(signedCodeBlock), expectedTrackBPermissions);
  assert.deepEqual(extractCodes(signedDefinitionBlock), expectedTrackBPermissions);
});

test("response contracts preserve current casing and freeze A-2.5 pagination wrappers", () => {
  const availabilityItem = {
    unit_id: "unit-1",
    unit_code: "A-101",
    unit_name: "庭院房",
    operation_mode: "short_stay",
    room_state: "available"
  } as const;
  const currentAvailability: HomestayAvailabilityResponse = [availabilityItem];
  const targetAvailability: HomestayAvailabilityListResponse = {
    items: [availabilityItem],
    total: 1,
    page: 1,
    page_size: 20
  };
  assert.deepEqual(Object.keys(currentAvailability[0] ?? {}).sort(), [
    "operation_mode",
    "room_state",
    "unit_code",
    "unit_id",
    "unit_name"
  ]);
  assert.deepEqual(Object.keys(targetAvailability).sort(), [
    "items",
    "page",
    "page_size",
    "total"
  ]);

  const rate: HomestayRateCalendarResponse = {
    unit_id: "unit-1",
    currency: "CNY",
    base_daily_rate: "199.00",
    checkout_requires_inspection: true,
    cancellation_policy: {
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "percentage",
      late_cancel_fee_value: "20.00",
      captured_at: "2026-07-30T00:00:00.000Z"
    },
    days: [{
      business_date: "2026-07-30",
      base_rate: "199.00",
      override_rate: null,
      final_rate: "199.00",
      price_source: "base"
    }]
  };
  assert.deepEqual(Object.keys(rate.cancellation_policy).sort(), [
    "captured_at",
    "free_cancel_before_hours",
    "late_cancel_fee_type",
    "late_cancel_fee_value"
  ]);

  const booking: HomestayBookingListItem = {
    id: "booking-1",
    bookingCode: "HS-1",
    unitId: "unit-1",
    unitCode: "A-101",
    unitName: "庭院房",
    arrivalDate: "2026-07-30",
    departureDate: "2026-07-31",
    status: "confirmed",
    guestCount: 1,
    sourceType: "direct",
    roomAmount: "199.00",
    totalAmount: "199.00"
  };
  const turnover: HomestayTurnoverListItem = {
    id: "turnover-1",
    bookingId: booking.id,
    unitId: booking.unitId,
    unitCode: booking.unitCode,
    unitName: booking.unitName,
    status: "pending",
    assigneeId: null,
    assigneeName: null,
    photoFileIds: [],
    consumables: [],
    exceptionDescription: null,
    linkedWorkOrderId: null,
    createTime: "2026-07-30T00:00:00.000Z"
  };
  const bookingDetail: HomestayBookingDetailResponse = {
    booking,
    nights: [],
    guests: [{
      id: "guest-1",
      partyId: "party-1",
      partyDisplayName: "住客一",
      isPrimary: true,
      verificationStatus: "verified"
    }],
    credentials: [{
      id: "credential-1",
      credentialType: "card",
      credentialLabel: "房卡",
      credentialReference: "***",
      status: "issued",
      issuedAt: "2026-07-30T00:00:00.000Z",
      returnedAt: null
    }],
    ledger: [],
    ledger_summary: null,
    finance_visible: false,
    actions: [],
    turnover
  };
  assert.equal("displayName" in bookingDetail.guests[0]!, false);
});

test("housing response contracts cover the current Web sibling fields", () => {
  const readOnlyTenant: HousingTenantListItem = {
    id: "party-read-only",
    displayName: "只读租客",
    verificationStatus: "unverified"
  };
  assert.deepEqual(Object.keys(readOnlyTenant).sort(), [
    "displayName",
    "id",
    "verificationStatus"
  ]);

  const tenant: HousingTenantListItem = {
    id: "party-1",
    displayName: "张三",
    mobile: "138****0000",
    email: null,
    identityNumberMasked: null,
    verificationStatus: "verified"
  };
  assert.equal("status" in tenant, false);

  const lease: HousingLeaseListItem = {
    id: "lease-1",
    leaseCode: "HZ-1",
    unitId: "unit-1",
    unitCode: "A-101",
    unitName: "人才公寓",
    tenantPartyId: tenant.id,
    tenantDisplayName: tenant.displayName,
    startDate: "2026-07-30",
    endDate: "2027-07-29",
    status: "active",
    paymentCycleMonths: 1,
    signatureFileId: null,
    monthlyRent: "2000.00",
    depositAmount: "2000.00"
  };
  const ledger: HousingLedgerEntryResponse = {
    id: "ledger-1",
    leaseId: lease.id,
    receivableId: null,
    entryType: "payment",
    chargeType: "rent",
    amount: "2000.00",
    paymentMethod: "cash",
    status: "confirmed",
    reason: "线下收款",
    occurredAt: "2026-07-30T00:00:00.000Z"
  };
  assert.deepEqual(
    ["paymentMethod", "status", "reason"].map((key) => key in ledger),
    [true, true, true]
  );

  const detail: HousingLeaseDetailResponse = {
    lease,
    occupants: [],
    charge_plans: [],
    receivables: [],
    ledger: [ledger],
    handovers: [{
      id: "handover-1",
      leaseId: lease.id,
      handoverType: "move_in",
      status: "completed",
      handoverAt: "2026-07-30T00:00:00.000Z",
      meterReadings: [],
      itemSnapshot: [],
      credentials: [],
      remark: null,
      damageAmount: "0.00",
      unsettledAmount: "0.00",
      depositDeductionAmount: "0.00",
      photo_files: []
    }],
    pending_handover_files: { move_in: [], move_out: [] },
    repairs: [],
    pending_repair_files: [],
    finance_summary: null
  };
  assert.equal(detail.lease.id, lease.id);
  assert.deepEqual(detail.handovers![0]?.photo_files, []);
  assert.equal("leaseCode" in detail.handovers![0]!, false);
  assert.equal("unitCode" in detail.handovers![0]!, false);

  const handoverList: HousingHandoverListItem = {
    ...detail.handovers![0]!,
    leaseCode: lease.leaseCode,
    unitId: lease.unitId,
    unitCode: lease.unitCode,
    unitName: lease.unitName
  };
  const repair: HousingRepairListItem = {
    id: "repair-1",
    leaseId: lease.id,
    leaseCode: lease.leaseCode,
    unitId: lease.unitId,
    unitCode: lease.unitCode,
    unitName: lease.unitName,
    woCode: "WO-1",
    title: "漏水",
    priority: "high",
    urgency: null,
    status: "pending",
    assigneeName: null,
    overdueFlag: false,
    createTime: "2026-07-30T00:00:00.000Z"
  };
  assert.equal(handoverList.handoverType, "move_in");
  assert.equal(repair.woCode, "WO-1");

  const purchase: HousingPurchaseListItem = {
    id: "purchase-1",
    purchaseCode: "PO-1",
    unitId: lease.unitId,
    vendorName: "供应商",
    purchaseDate: "2026-07-30",
    costCategory: "repair",
    approvalStatus: "draft",
    paymentStatus: "unpaid",
    totalAmount: "100.00",
    transferredItemCount: 0,
    receiptFiles: []
  };
  const purchaseDetail: HousingPurchaseDetailResponse = {
    purchase,
    items: [{
      id: "item-1",
      itemName: "配件",
      quantity: "1.000",
      unit: "件",
      unitPrice: "100.00",
      amount: "100.00",
      transferredReceivableId: null
    }]
  };
  assert.equal(purchaseDetail.items[0]?.amount, "100.00");
});

test("housing field projections allow read-only omission and authorized minimum blocks", () => {
  const readOnlyLease: HousingLeaseListItem = {
    id: "lease-read",
    leaseCode: "HZ-READ",
    unitId: "unit-1",
    unitCode: "A-101",
    unitName: "人才公寓",
    tenantPartyId: "party-1",
    tenantDisplayName: "张三",
    startDate: "2026-07-30",
    endDate: "2027-07-29",
    status: "active",
    paymentCycleMonths: 1
  };
  assert.equal("monthlyRent" in readOnlyLease, false);
  assert.equal("depositAmount" in readOnlyLease, false);
  assert.equal("signatureFileId" in readOnlyLease, false);

  const readOnlyPlan: HousingChargePlanResponse = {
    id: "plan-1",
    leaseId: readOnlyLease.id,
    chargeType: "rent",
    billingSource: "fixed",
    cycleMonths: 1,
    meterId: null,
    enabled: true
  };
  const readOnlyReceivable: HousingReceivableResponse = {
    id: "receivable-1",
    leaseId: readOnlyLease.id,
    chargeType: "rent",
    periodStart: "2026-07-30",
    periodEnd: "2026-08-30",
    dueDate: "2026-07-30",
    status: "pending"
  };
  const readOnlyHandover: HousingEmbeddedHandoverResponse = {
    id: "handover-read",
    leaseId: readOnlyLease.id,
    handoverType: "move_in",
    status: "completed",
    handoverAt: "2026-07-30T00:00:00.000Z",
    meterReadings: [],
    itemSnapshot: [],
    remark: null
  };
  const manageTransferOnlyPurchase: HousingPurchaseDetailResponse = {
    purchase: {
      id: "purchase-manage-only",
      purchaseCode: "PO-MANAGE",
      unitId: "unit-1",
      vendorName: "供应商",
      purchaseDate: "2026-07-30",
      costCategory: "repair",
      approvalStatus: "approved",
      paymentStatus: "unpaid"
    },
    items: [{
      id: "item-manage-only",
      itemName: "配件",
      quantity: "1.000",
      unit: "件",
      transferredReceivableId: null
    }]
  };
  assert.deepEqual(
    ["amount", "unitPrice"].map((key) => key in readOnlyPlan),
    [false, false]
  );
  assert.deepEqual(
    ["amount", "paidAmount", "waivedAmount"].map((key) =>
      key in readOnlyReceivable
    ),
    [false, false, false]
  );
  assert.equal("credentials" in readOnlyHandover, false);
  assert.equal("photo_files" in readOnlyHandover, false);
  assert.equal("totalAmount" in manageTransferOnlyPurchase.purchase, false);
  assert.deepEqual(
    ["unitPrice", "amount"].map((key) =>
      key in manageTransferOnlyPurchase.items[0]!
    ),
    [false, false]
  );

  const authorizedPlan: HousingChargePlanResponse = {
    ...readOnlyPlan,
    amount: "2000.00",
    unitPrice: null
  };
  const authorizedReceivable: HousingReceivableResponse = {
    ...readOnlyReceivable,
    amount: "2000.00",
    paidAmount: "0.00",
    waivedAmount: "0.00"
  };
  const authorizedHandover: HousingEmbeddedHandoverResponse = {
    ...readOnlyHandover,
    credentials: [{ label: "房门钥匙", reference: "***" }],
    damageAmount: "0.00",
    unsettledAmount: "0.00",
    depositDeductionAmount: "0.00",
    photo_files: [{
      id: "file-handover-1",
      originalName: "handover.jpg",
      mimeType: "image/jpeg",
      fileSize: "1024"
    }]
  };
  const authorizedLease: HousingLeaseListItem = {
    ...readOnlyLease,
    monthlyRent: "2000.00",
    depositAmount: "2000.00",
    signatureFileId: "file-signature-1"
  };
  const purchaseReadProjection: HousingPurchaseDetailResponse = {
    purchase: {
      ...manageTransferOnlyPurchase.purchase,
      totalAmount: "100.00"
    },
    items: [{
      ...manageTransferOnlyPurchase.items[0]!,
      unitPrice: "100.00",
      amount: "100.00"
    }]
  };
  assert.equal(authorizedPlan.amount, "2000.00");
  assert.equal(authorizedReceivable.paidAmount, "0.00");
  assert.equal(authorizedHandover.credentials?.[0]?.reference, "***");
  assert.equal(authorizedHandover.photo_files?.[0]?.id, "file-handover-1");
  assert.equal(authorizedLease.signatureFileId, "file-signature-1");
  assert.equal(purchaseReadProjection.purchase.totalAmount, "100.00");
  assert.equal(purchaseReadProjection.items[0]?.unitPrice, "100.00");
  assert.equal(purchaseReadProjection.items[0]?.amount, "100.00");
});

test("permission bundles compose capabilities and never translate legacy operations into new pages", () => {
  assert.deepEqual(validatePropertyPermissionBundles(), []);
  assert.equal(Object.keys(TRACK_B_PERMISSION_BUNDLES).length, 16);
  assert.equal(
    Object.keys(PROPERTY_PERMISSION_BUNDLES).length,
    14 + Object.keys(TRACK_B_PERMISSION_BUNDLES).length
  );
  for (const [key, bundle] of Object.entries(TRACK_B_PERMISSION_BUNDLES)) {
    assert.equal(
      (PROPERTY_PERMISSION_BUNDLES as Record<string, PropertyPermissionBundle>)[key],
      bundle
    );
  }
  const legacy = new Set<string>(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
  for (const bundle of Object.values(PROPERTY_PERMISSION_BUNDLES)) {
    assert.equal(bundle.permissions.some((permission) => legacy.has(permission)), false);
  }
  const owningReadExtensions = {
    HOMESTAY_OVERVIEW: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASK_READ,
    HOMESTAY_STAYS: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_STAY_READ,
    HOUSING_OVERVIEW: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TASK_READ,
    HOUSING_TENANTS: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANT_READ,
    HOUSING_HANDOVERS: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_READ,
    HOUSING_BILLING: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_BILLING_READ,
    HOUSING_REPAIRS: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_REPAIR_READ
  } as const;
  for (const [bundleKey, permission] of Object.entries(owningReadExtensions)) {
    const owners = Object.entries(PROPERTY_PERMISSION_BUNDLES)
      .filter(([, bundle]) =>
        (bundle.permissions as readonly string[]).includes(permission)
      )
      .map(([key]) => key);
    assert.deepEqual(owners, [bundleKey]);
  }
});

test("permission bundle validator rejects duplicate, unknown, legacy, and page-less expansion", () => {
  const invalid = {
    ...PROPERTY_PERMISSION_BUNDLES,
    INVALID: {
      code: "property-bundle:invalid",
      description: "invalid fixture",
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
        "*"
      ]
    }
  } as unknown as Record<string, PropertyPermissionBundle>;
  const issues = validatePropertyPermissionBundles(invalid);
  assert.ok(issues.some((issue) => issue.includes("Duplicate bundle permission")));
  assert.ok(issues.some((issue) => issue.includes("Unknown bundle permission")));
  assert.ok(issues.some((issue) => issue.includes("Legacy permission")));
  assert.ok(issues.some((issue) => issue.includes("no canonical page permission")));
});

test("manifest validator accepts the canonical six-layer contract", () => {
  assert.deepEqual(validatePropertyAccessManifest(), { valid: true, issues: [] });

  const featureIds = new Set(PROPERTY_ACCESS_MANIFEST.map((entry) => entry.featureId));
  assert.equal(featureIds.size, 17);
  for (const entry of PROPERTY_ACCESS_MANIFEST) {
    assert.equal(entry.module.dependencies.includes("asset"), true);
    assert.ok(entry.data.dimensions.includes("tenant"));
    assert.ok(entry.data.dimensions.includes("park"));
  }
});

test("all current homestay and housing mutations have idempotency and approval policies", () => {
  const mutations = PROPERTY_ACCESS_MANIFEST.flatMap((entry) =>
    entry.actions.filter((action) => action.method !== "GET")
  );
  for (const action of mutations) {
    assert.ok(action.idempotency);
    assert.ok(action.approvalPolicy);
  }

  const actualEndpoints = new Set(mutations.map((action) => `${action.method} ${action.path}`));
  const expectedEndpoints = new Set([
    "PUT /homestay/rates/:unitId",
    "POST /homestay/rates/:unitId/overrides",
    "POST /homestay/bookings",
    "POST /homestay/bookings/:id/confirm",
    "POST /homestay/bookings/:id/cancel",
    "POST /homestay/bookings/:id/no-show",
    "POST /homestay/bookings/:id/reschedule",
    "POST /homestay/bookings/:id/guests",
    "POST /homestay/bookings/:id/credentials",
    "POST /homestay/bookings/:id/credentials/:credentialId/return",
    "POST /homestay/bookings/:id/check-in",
    "POST /homestay/bookings/:id/check-out",
    "POST /homestay/bookings/:id/ledger",
    "POST /homestay/turnovers/:id/actions/:action",
    "POST /housing/tenants",
    "POST /housing/leases",
    "POST /housing/leases/:id/submit",
    "POST /housing/leases/:id/approve",
    "POST /housing/leases/:id/sign",
    "POST /housing/leases/:id/activate",
    "POST /housing/leases/:id/void",
    "POST /housing/leases/:id/occupants",
    "PUT /housing/leases/:id/charge-plans",
    "POST /housing/leases/:id/generate-bills",
    "POST /housing/leases/:id/ledger",
    "POST /housing/leases/:id/handovers",
    "POST /housing/leases/:id/repairs",
    "POST /housing/leases/:id/checkout",
    "POST /housing/purchases",
    "POST /housing/purchases/:id/actions",
    "POST /housing/purchases/:id/transfer"
  ]);
  assert.deepEqual([...actualEndpoints].sort(), [...expectedEndpoints].sort());
});

test("manifest endpoint and permission gates exactly cover the real homestay and housing controllers", () => {
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, HomestayController), ["homestay"]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, HousingController), ["housing_rental"]);

  const actual = [
    ...controllerEndpoints(HomestayController),
    ...controllerEndpoints(HousingController)
  ].sort((left, right) => left.key.localeCompare(right.key));
  const manifestByEndpoint = new Map<string, typeof PROPERTY_ACCESS_MANIFEST[number]["actions"][number][]>();
  for (const action of PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.actions)) {
    const key = `${action.method} ${action.path}`;
    const variants = manifestByEndpoint.get(key) ?? [];
    variants.push(action);
    manifestByEndpoint.set(key, variants);
  }

  assert.deepEqual(
    [...manifestByEndpoint.keys()].sort(),
    actual.map((endpoint) => endpoint.key).sort(),
    "manifest must equal the current controllers and frozen A-2.5 contract"
  );

  for (const endpoint of actual) {
    const variants = manifestByEndpoint.get(endpoint.key);
    assert.ok(variants?.length, `missing manifest action for ${endpoint.key}`);
    const firstVariant = variants[0];
    assert.ok(firstVariant);
    const requiredSignatures = new Set(variants.map((action) =>
      JSON.stringify(sortedUnique(action.requiredPermissions ?? []))
    ));
    const anySignatures = new Set(variants.map((action) =>
      JSON.stringify(sortedUnique(action.anyPermissions ?? []))
    ));
    assert.equal(requiredSignatures.size, 1, `${endpoint.key} variants disagree on required permissions`);
    assert.equal(anySignatures.size, 1, `${endpoint.key} variants disagree on any permissions`);

    const declaredRequired = [
      ...(firstVariant.requiredPermissions ?? []),
      ...(firstVariant.anyPermissions ? [] : [firstVariant.permission])
    ];
    assert.deepEqual(
      sortedUnique(declaredRequired),
      sortedUnique(endpoint.requiredPermissions),
      `${endpoint.key} RequirePermissions drift`
    );
    assert.deepEqual(
      sortedUnique(firstVariant.anyPermissions ?? []),
      sortedUnique(endpoint.anyPermissions),
      `${endpoint.key} RequireAnyPermissions drift`
    );
    assert.equal(
      endpoint.hasIdempotencyInterceptor,
      firstVariant.method !== "GET" && firstVariant.idempotency === "required",
      `${endpoint.key} idempotency interceptor drift`
    );
  }
});

test("A-2.5 housing tenant GET consumer adopts the read permission", () => {
  const endpoint = controllerEndpoints(HousingController)
    .find((item) => item.key === "GET /housing/tenants");
  assert.ok(endpoint);
  const action = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.actions)
    .find((item) => item.actionId === "housing.tenants.list");
  assert.ok(action);
  assert.equal(action.permission, "housing:tenant:read");
  assert.deepEqual(endpoint.requiredPermissions, [action.permission]);
});

test("protected files, sensitive fields, and financial projections are machine-verifiable", () => {
  const policies = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.files);
  const bizTypes = policies.flatMap((policy) => policy.bizTypes);
  assert.equal(policies.length, PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES.length);
  assert.deepEqual([...bizTypes].sort(), [...PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES].sort());
  const expectedReadAnyPermissions: Record<string, readonly string[]> = {
    housing_lease_signature: ["housing:lease:read", "housing:lease:sign"],
    housing_handover: ["housing:handover:manage", "housing:handover:read", "housing:lease:read"],
    housing_handover_move_in: ["housing:handover:manage", "housing:handover:read", "housing:lease:read"],
    housing_handover_move_out: ["housing:handover:manage", "housing:handover:read", "housing:lease:read"],
    housing_repair: ["housing:lease:read", "housing:repair:manage", "housing:repair:read"],
    housing_purchase: ["housing:purchase:manage", "housing:purchase:read"],
    homestay_turnover: []
  };
  for (const policy of policies) {
    assert.equal(policy.bizTypes.length, 1);
    assert.equal(policy.genericReadPermission, "file:read");
    assert.equal(policy.genericDownloadPermission, "file:download");
    assert.equal(policy.genericUploadPermission, "file:upload");
    assert.equal(policy.genericDeletePermission, "file:delete");
    assert.ok(policy.readPermission);
    assert.ok(policy.referenceScope);
    const bizType = policy.bizTypes[0];
    assert.ok(bizType);
    assert.deepEqual(
      sortedUnique(policy.readAnyPermissions ?? []),
      sortedUnique(expectedReadAnyPermissions[bizType] ?? []),
      `${bizType} domain read permissions drift`
    );
  }

  const protectedFields = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.fields)
    .filter((field) => field.classification === "sensitive" || field.classification === "financial");
  assert.ok(protectedFields.some((field) => field.classification === "sensitive"));
  assert.ok(protectedFields.some((field) => field.classification === "financial"));
  for (const field of protectedFields) {
    assert.ok(field.readPermission);
    if (field.classification === "sensitive") assert.notEqual(field.projection, "full");
  }
});

test("manifest validator rejects malformed permissions, policies, idempotency, and grouped file types", () => {
  const invalid = structuredClone(PROPERTY_ACCESS_MANIFEST) as PropertyAccessManifestEntry[];
  const mutation = invalid.flatMap((entry) => entry.actions)
    .find((action) => action.method !== "GET");
  assert.ok(mutation);
  mutation.idempotency = "not-required";
  mutation.requiredPermissions = ["homestay:operations"];

  const highRisk = invalid.flatMap((entry) => entry.actions)
    .find((action) => action.highRisk);
  assert.ok(highRisk);
  highRisk.approvalPolicy = {
    requirement: "required",
    enforcement: "available"
  };

  const fileEntry = invalid.find((entry) => entry.files.length > 0);
  assert.ok(fileEntry);
  const filePolicy = fileEntry.files[0];
  assert.ok(filePolicy);
  filePolicy.bizTypes = ["homestay_turnover", "housing_repair"];

  const result = validatePropertyAccessManifest(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("Mutation lacks idempotency policy")));
  assert.ok(result.issues.some((issue) => issue.includes("Legacy") || issue.includes("authorization source")));
  assert.ok(result.issues.some((issue) => issue.includes("Approval-required action is not fail-closed")));
  assert.ok(result.issues.some((issue) => issue.includes("exactly one biz_type")));
});

test("high-risk Track A contract declares approval-required and blocked-until-Track-B policy", () => {
  const highRisk = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.actions)
    .filter((action) => action.highRisk);
  assert.deepEqual(
    highRisk.map((action) => action.actionId).sort(),
    [...EXPECTED_HIGH_RISK_ACTION_IDS].sort()
  );
  assert.deepEqual(
    [...TRACK_A_HIGH_RISK_ACTION_IDS].sort(),
    [...EXPECTED_HIGH_RISK_ACTION_IDS].sort()
  );
  for (const action of highRisk) {
    assert.equal(action.approvalPolicy.requirement, "required");
    assert.equal(action.approvalPolicy.enforcement, "blocked-until-track-b");
    assert.ok(action.approvalPolicy.policyId);
  }
});

test("A-2.5 freezes exact GET actions and the ninth move-out financial discriminator", () => {
  const gets = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.actions)
    .filter((action) => action.method === "GET");
  assert.deepEqual(
    gets.map((action) => action.actionId).sort(),
    [...EXPECTED_GET_ACTION_IDS].sort()
  );
  assert.deepEqual(
    [...PROPERTY_WORKBENCH_REQUIRED_GET_ACTION_IDS].sort(),
    [...EXPECTED_GET_ACTION_IDS].sort()
  );
  const moveOut = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.actions)
    .find((action) =>
      action.actionId === "housing.handovers.complete-move-out-financial"
    );
  assert.ok(moveOut);
  assert.deepEqual(moveOut.variantPredicate, {
    allEquals: { handover_type: "move_out" },
    anyNonZero: [
      "damage_amount",
      "unsettled_amount",
      "deposit_deduction_amount"
    ]
  });
});

test("housing repair rows link through the canonical minimal work-order contract", () => {
  const reference: HousingRepairWorkOrderRef = {
    id: "00000000-0000-4000-8000-000000000021",
    woCode: "WO-2026-001",
    title: "卫生间漏水",
    status: "20"
  };
  assert.deepEqual(Object.keys(reference).sort(), ["id", "status", "title", "woCode"]);
  assert.equal(HOUSING_REPAIR_WORK_ORDER_DETAIL_ROUTE, "/workorders/[id]");
});

test("controller high-risk metadata adopts all nine A-2.5 actions", () => {
  const decorated = [
    ...controllerEndpoints(HomestayController),
    ...controllerEndpoints(HousingController)
  ].filter((endpoint) => endpoint.highRiskAction);
  assert.deepEqual(
    decorated.map((endpoint) => endpoint.highRiskAction?.actionId).sort(),
    [...EXPECTED_HIGH_RISK_ACTION_IDS].sort()
  );

  const byActionId = new Map(
    decorated.map((endpoint) => [
      endpoint.highRiskAction?.actionId,
      {
        key: endpoint.key,
        discriminator: endpoint.highRiskAction?.discriminator,
        variantPredicate: endpoint.highRiskAction?.variantPredicate
      }
    ])
  );
  assert.deepEqual(byActionId.get("homestay.bookings.cancel"), {
    key: "POST /homestay/bookings/:id/cancel",
    discriminator: undefined,
    variantPredicate: undefined
  });
  assert.deepEqual(byActionId.get("homestay.finance.refund-or-waive"), {
    key: "POST /homestay/bookings/:id/ledger",
    discriminator: {
      bodyField: "entry_type",
      highRiskValues: ["refund", "waiver"]
    },
    variantPredicate: undefined
  });
  assert.deepEqual(
    byActionId.get("housing.finance.refund-waive-or-deposit-refund"),
    {
      key: "POST /housing/leases/:id/ledger",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver", "deposit_refund"]
      },
      variantPredicate: undefined
    }
  );
  assert.deepEqual(
    byActionId.get("housing.handovers.complete-move-out-financial"),
    {
      key: "POST /housing/leases/:id/handovers",
      discriminator: undefined,
      variantPredicate: {
        allEquals: { handover_type: "move_out" },
        anyNonZero: [
          "damage_amount",
          "unsettled_amount",
          "deposit_deduction_amount"
        ]
      }
    }
  );
  assert.deepEqual(
    [...byActionId.entries()]
      .filter(([, value]) =>
        value.discriminator === undefined
        && value.variantPredicate === undefined
      )
      .map(([actionId, value]) => `${actionId} ${value.key}`)
      .sort(),
    [
      "homestay.bookings.cancel POST /homestay/bookings/:id/cancel",
      "housing.leases.approve POST /housing/leases/:id/approve",
      "housing.leases.checkout POST /housing/leases/:id/checkout",
      "housing.leases.void POST /housing/leases/:id/void",
      "housing.purchases.lifecycle POST /housing/purchases/:id/actions",
      "housing.purchases.transfer POST /housing/purchases/:id/transfer"
    ]
  );
});
