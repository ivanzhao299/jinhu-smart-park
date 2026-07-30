import assert from "node:assert/strict";
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
  SYSTEM_PERMISSIONS,
  SYSTEM_PERMISSION_SEEDS,
  TRACK_A_HIGH_RISK_ACTION_IDS,
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

test("property-business manifest defines 17 canonical surfaces and six inherited detail routes", () => {
  assert.equal(PROPERTY_BUSINESS_SURFACES.length, 17);
  assert.equal(PROPERTY_ACCESS_MANIFEST.length, 17);

  const detailRoutes = PROPERTY_BUSINESS_SURFACES.flatMap((surface) =>
    surface.detailRoutes.map((route) => ({
      route,
      pageCode: surface.pageCode
    }))
  );
  assert.equal(detailRoutes.length, 6);
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
      sourcePagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
      targetAuthorization: "canonical-target"
    }
  ]);
});

test("root permission exports preserve legacy/action values and seed every granular page once", () => {
  for (const [key, value] of Object.entries(PROPERTY_BUSINESS_PERMISSIONS)) {
    assert.equal(SYSTEM_PERMISSIONS[key as keyof typeof SYSTEM_PERMISSIONS], value);
  }
  assert.deepEqual(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS, [
    "homestay:operations",
    "housing_rental:operations"
  ]);

  assert.equal(new Set(PROPERTY_BUSINESS_PAGE_PERMISSION_CODES).size, 17);
  assert.equal(PROPERTY_BUSINESS_PAGE_PERMISSION_SEEDS.length, 17);
  for (const code of Object.values(PROPERTY_BUSINESS_PERMISSIONS)) {
    assert.equal(
      SYSTEM_PERMISSION_SEEDS.filter((seed) => seed.code === code).length,
      1,
      `${code} must have exactly one seed`
    );
  }
});

test("permission bundles compose capabilities and never translate legacy operations into new pages", () => {
  assert.deepEqual(validatePropertyPermissionBundles(), []);
  const legacy = new Set<string>(PROPERTY_BUSINESS_LEGACY_PAGE_PERMISSIONS);
  for (const bundle of Object.values(PROPERTY_PERMISSION_BUNDLES)) {
    assert.equal(bundle.permissions.some((permission) => legacy.has(permission)), false);
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
    actual.map((endpoint) => endpoint.key),
    "manifest path/method coverage must equal decorated controller routes"
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

test("protected files, sensitive fields, and financial projections are machine-verifiable", () => {
  const policies = PROPERTY_ACCESS_MANIFEST.flatMap((entry) => entry.files);
  const bizTypes = policies.flatMap((policy) => policy.bizTypes);
  assert.equal(policies.length, PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES.length);
  assert.deepEqual([...bizTypes].sort(), [...PROPERTY_BUSINESS_PROTECTED_BIZ_TYPES].sort());
  const expectedReadAnyPermissions: Record<string, readonly string[]> = {
    housing_lease_signature: ["housing:lease:read", "housing:lease:sign"],
    housing_handover: ["housing:handover:manage", "housing:lease:read"],
    housing_handover_move_in: ["housing:handover:manage", "housing:lease:read"],
    housing_handover_move_out: ["housing:handover:manage", "housing:lease:read"],
    housing_repair: ["housing:lease:read", "housing:repair:manage"],
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
    [...TRACK_A_HIGH_RISK_ACTION_IDS].sort()
  );
  for (const action of highRisk) {
    assert.equal(action.approvalPolicy.requirement, "required");
    assert.equal(action.approvalPolicy.enforcement, "blocked-until-track-b");
    assert.ok(action.approvalPolicy.policyId);
  }
});

test("controller high-risk metadata exactly covers the eight Track A action ids", () => {
  const decorated = [
    ...controllerEndpoints(HomestayController),
    ...controllerEndpoints(HousingController)
  ].filter((endpoint) => endpoint.highRiskAction);
  assert.deepEqual(
    decorated.map((endpoint) => endpoint.highRiskAction?.actionId).sort(),
    [...TRACK_A_HIGH_RISK_ACTION_IDS].sort()
  );

  const byActionId = new Map(
    decorated.map((endpoint) => [
      endpoint.highRiskAction?.actionId,
      {
        key: endpoint.key,
        discriminator: endpoint.highRiskAction?.discriminator
      }
    ])
  );
  assert.deepEqual(byActionId.get("homestay.bookings.cancel"), {
    key: "POST /homestay/bookings/:id/cancel",
    discriminator: undefined
  });
  assert.deepEqual(byActionId.get("homestay.finance.refund-or-waive"), {
    key: "POST /homestay/bookings/:id/ledger",
    discriminator: {
      bodyField: "entry_type",
      highRiskValues: ["refund", "waiver"]
    }
  });
  assert.deepEqual(
    byActionId.get("housing.finance.refund-waive-or-deposit-refund"),
    {
      key: "POST /housing/leases/:id/ledger",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver", "deposit_refund"]
      }
    }
  );
  assert.deepEqual(
    [...byActionId.entries()]
      .filter(([, value]) => value.discriminator === undefined)
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
