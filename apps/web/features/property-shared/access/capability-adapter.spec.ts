import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_ACCESS_MANIFEST,
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  TRACK_A_HIGH_RISK_ACTION_IDS
} from "@jinhu/shared";
import {
  projectPropertyCapabilities,
  propertyDetailRouteCount,
  propertySurfaceCount,
  resolveAuthorizedPropertyRoute,
  resolvePropertyRoute
} from "./capability-adapter";

type CapabilityUser = NonNullable<
  Parameters<typeof projectPropertyCapabilities>[0]
>;

function user(overrides: Partial<CapabilityUser> = {}): CapabilityUser {
  return {
    id: "user-a",
    tenant_id: "tenant-a",
    park_id: "park-a",
    data_scope: "tenant",
    permissions: [],
    is_super: false,
    enabled_modules: [
      {
        module_code: "homestay",
        module_name: "民宿",
        module_group: "property",
        enabled: true
      },
      {
        module_code: "asset",
        module_name: "资产",
        module_group: "asset",
        enabled: true
      }
    ],
    data_scopes: [],
    field_policies: [],
    ...overrides
  };
}

test("capability projection defaults to deny and never treats legacy page access as granular access", () => {
  const legacyOnly = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CANCEL,
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ
      ]
    }),
    "homestay.bookings"
  );

  assert.equal(legacyOnly.moduleAvailable, true);
  assert.equal(legacyOnly.pageAllowed, false);
  assert.equal(legacyOnly.actionAllowed("homestay.bookings.cancel"), false);
  assert.equal(legacyOnly.actionAllowed("missing.action"), false);
  assert.equal(legacyOnly.fieldProjection("missing"), "omitted");
  assert.deepEqual(legacyOnly.fileCapability("missing"), {
    canRead: false,
    canDownload: false,
    canUpload: false,
    canDelete: false
  });
  assert.deepEqual(legacyOnly.dataDimensions, []);

  const unknown = projectPropertyCapabilities(user(), "unknown.feature");
  assert.equal(unknown.featureId, null);
  assert.equal(unknown.moduleAvailable, false);
  assert.equal(unknown.pageAllowed, false);
});

test("action capability requires granular page and every composite permission", () => {
  const pageDenied = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
        PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_CONFIRM
      ]
    }),
    "homestay.bookings"
  );
  assert.equal(pageDenied.actionAllowed("homestay.bookings.confirm"), false);

  const missingRequired = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE
      ],
      enabled_modules: [
        {
          module_code: "housing_rental",
          module_name: "住房出租",
          module_group: "property",
          enabled: true
        },
        {
          module_code: "asset",
          module_name: "资产",
          module_group: "asset",
          enabled: true
        }
      ]
    }),
    "housing.purchases"
  );
  assert.equal(missingRequired.actionAllowed("housing.purchases.create"), false);
  const allowed = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASES_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
        "unit:read"
      ],
      enabled_modules: [
        {
          module_code: "housing_rental",
          module_name: "住房出租",
          module_group: "property",
          enabled: true
        },
        {
          module_code: "asset",
          module_name: "资产",
          module_group: "asset",
          enabled: true
        }
      ]
    }),
    "housing.purchases"
  );
  assert.equal(allowed.actionAllowed("housing.purchases.create"), true);
});

test("all Track B approval actions remain blocked even for wildcard users", () => {
  const wildcard = user({
    is_super: true,
    permissions: ["*"],
    enabled_modules: [
      {
        module_code: "homestay",
        module_name: "民宿",
        module_group: "property",
        enabled: true
      },
      {
        module_code: "housing_rental",
        module_name: "住房出租",
        module_group: "property",
        enabled: true
      },
      {
        module_code: "asset",
        module_name: "资产",
        module_group: "asset",
        enabled: true
      }
    ]
  });
  for (const actionId of TRACK_A_HIGH_RISK_ACTION_IDS) {
    const entry = PROPERTY_ACCESS_MANIFEST.find((candidate) =>
      candidate.actions.some((action) => action.actionId === actionId)
    );
    assert.ok(entry, `missing manifest owner for ${actionId}`);
    const capability = projectPropertyCapabilities(
      wildcard,
      entry.featureId
    ).actionCapability(actionId);
    assert.deepEqual(capability, {
      allowed: false,
      approvalRequired: true,
      blockedUntilTrackB: true
    });

    const action = entry.actions.find((candidate) => candidate.actionId === actionId);
    assert.ok(action);
    const normal = user({
      permissions: [
        entry.surface.pageCode,
        action.permission,
        ...(action.requiredPermissions ?? []),
        ...(action.anyPermissions ?? [])
      ],
      enabled_modules: wildcard.enabled_modules
    });
    assert.deepEqual(
      projectPropertyCapabilities(normal, entry.featureId)
        .actionCapability(actionId),
      {
        allowed: false,
        approvalRequired: true,
        blockedUntilTrackB: true
      }
    );
  }
});

test("module, page, action, data, field and file layers require their exact contracts", () => {
  const permissions = [
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    "file:read",
    "file:download",
    "file:upload",
    "file:delete"
  ];
  const projection = projectPropertyCapabilities(
    user({
      permissions,
      enabled_modules: [
        {
          module_code: "housing_rental",
          module_name: "住房出租",
          module_group: "property",
          enabled: true
        },
        {
          module_code: "asset",
          module_name: "资产",
          module_group: "asset",
          enabled: true
        }
      ],
      data_scopes: [
        { dimension: "tenant", scope_type: "current" },
        { dimension: "unit", scope_type: "assigned" },
        { dimension: "owner", scope_type: "self" }
      ],
      field_policies: [
        {
          module: "housing_rental",
          entity: "handover",
          field_key: "handover.credentials",
          field_name: "凭证",
          policy_type: "hidden"
        },
        {
          module: "housing_rental",
          entity: "handover",
          field_key: "credentials",
          field_name: "模糊字段",
          policy_type: "visible"
        }
      ]
    }),
    "housing.handovers"
  );

  assert.equal(projection.moduleAvailable, true);
  assert.equal(projection.pageAllowed, true);
  assert.equal(projection.actionAllowed("housing.handovers.complete"), true);
  assert.deepEqual(
    projection.dataDimensions,
    ["tenant", "park", "building", "unit"]
  );
  assert.equal(projection.fieldProjection("handover.credentials"), "omitted");
  assert.equal(projection.fieldProjection("credentials"), "omitted");
  assert.deepEqual(projection.fileCapability("housing_handover_move_in"), {
    canRead: true,
    canDownload: true,
    canUpload: true,
    canDelete: true
  });
});

test("field, file and data projections require the granular page", () => {
  const projection = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_FINANCE_READ,
        "file:read",
        "file:download",
        "file:upload",
        "file:delete"
      ],
      enabled_modules: [
        {
          module_code: "housing_rental",
          module_name: "住房出租",
          module_group: "property",
          enabled: true
        },
        {
          module_code: "asset",
          module_name: "资产",
          module_group: "asset",
          enabled: true
        }
      ],
      data_scopes: [{ dimension: "tenant", scope_type: "all" }]
    }),
    "housing.handovers"
  );
  assert.equal(projection.pageAllowed, false);
  assert.equal(projection.fieldProjection("handover.damage_amount"), "omitted");
  assert.deepEqual(
    projection.fileCapability("housing_handover"),
    { canRead: false, canDownload: false, canUpload: false, canDelete: false }
  );
  assert.deepEqual(projection.dataDimensions, []);
});

test("field projection takes the strict meet of manifest and runtime policy", () => {
  const projection = projectPropertyCapabilities(
    user({
      permissions: [
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVERS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.HOUSING_HANDOVER_MANAGE
      ],
      enabled_modules: [
        {
          module_code: "housing_rental",
          module_name: "住房出租",
          module_group: "property",
          enabled: true
        },
        {
          module_code: "asset",
          module_name: "资产",
          module_group: "asset",
          enabled: true
        }
      ],
      field_policies: [{
        module: "housing_rental",
        entity: "handover",
        field_key: "handover.credentials",
        field_name: "凭证",
        policy_type: "readonly"
      }]
    }),
    "housing.handovers"
  );
  assert.equal(projection.fieldProjection("handover.credentials"), "masked");
});

test("data dimensions merge exact and tenant or park scopes with backend-isomorphic fallback", () => {
  const base = {
    permissions: [PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_TASKS_PAGE],
    data_scope: "self"
  };
  assert.deepEqual(
    projectPropertyCapabilities(
      user({
        ...base,
        data_scopes: [{ dimension: "unit", scope_type: "custom" }]
      }),
      "homestay.tasks"
    ).dataDimensions,
    ["unit"]
  );
  assert.deepEqual(
    projectPropertyCapabilities(
      user({
        ...base,
        data_scopes: [{ dimension: "park", scope_type: "park" }]
      }),
      "homestay.tasks"
    ).dataDimensions,
    ["tenant", "park", "unit", "assignee"]
  );
  assert.deepEqual(
    projectPropertyCapabilities(
      user({ ...base, data_scopes: [] }),
      "homestay.tasks"
    ).dataDimensions,
    ["tenant", "park", "unit"]
  );
  assert.deepEqual(
    projectPropertyCapabilities(
      user({ ...base, data_scope: "tenant", data_scopes: [] }),
      "homestay.tasks"
    ).dataDimensions,
    ["tenant", "park", "unit"]
  );
  assert.deepEqual(
    projectPropertyCapabilities(
      user({ ...base, data_scope: "custom", data_scopes: [] }),
      "homestay.tasks"
    ).dataDimensions,
    ["tenant", "park", "unit"]
  );
});

test("module availability remains fail-closed for super users and missing dependencies", () => {
  const projection = projectPropertyCapabilities(
    user({
      is_super: true,
      permissions: ["*"],
      enabled_modules: [
        {
          module_code: "homestay",
          module_name: "民宿",
          module_group: "property",
          enabled: true
        }
      ]
    }),
    "homestay.dashboard"
  );
  assert.equal(projection.moduleAvailable, false);
  assert.equal(projection.pageAllowed, false);
});

test("invalidation keys are stable across ordering and change with authorization scope", () => {
  const first = projectPropertyCapabilities(
    user({ permissions: ["b", "a", "a"] }),
    "homestay.dashboard"
  ).invalidationKey;
  const second = projectPropertyCapabilities(
    user({ permissions: ["a", "b"] }),
    "homestay.dashboard"
  ).invalidationKey;
  const otherPark = projectPropertyCapabilities(
    user({ permissions: ["a", "b"], park_id: "park-b" }),
    "homestay.dashboard"
  ).invalidationKey;
  const otherUser = projectPropertyCapabilities(
    user({ id: "user-b", permissions: ["a", "b"] }),
    "homestay.dashboard"
  ).invalidationKey;
  const promoted = projectPropertyCapabilities(
    user({ is_super: true, permissions: ["a", "b"] }),
    "homestay.dashboard"
  ).invalidationKey;
  assert.equal(first, second);
  assert.notEqual(first, otherPark);
  assert.notEqual(first, otherUser);
  assert.notEqual(first, promoted);
});

test("invalidation key fingerprints scope config without exposing its values", () => {
  const first = projectPropertyCapabilities(
    user({
      data_scopes: [{
        dimension: "unit",
        scope_type: "custom",
        scope_config: { unit_ids: ["unit-secret"], building_ids: ["building-secret"] }
      }]
    }),
    "homestay.dashboard"
  ).invalidationKey;
  const reordered = projectPropertyCapabilities(
    user({
      data_scopes: [{
        dimension: "unit",
        scope_type: "custom",
        scope_config: { building_ids: ["building-secret"], unit_ids: ["unit-secret"] }
      }]
    }),
    "homestay.dashboard"
  ).invalidationKey;
  const changed = projectPropertyCapabilities(
    user({
      data_scopes: [{
        dimension: "unit",
        scope_type: "custom",
        scope_config: { building_ids: ["building-secret"], unit_ids: ["unit-other"] }
      }]
    }),
    "homestay.dashboard"
  ).invalidationKey;
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.equal(first.includes("unit-secret"), false);
  assert.equal(first.includes("building-secret"), false);
});

test("route resolver covers the frozen 17 surfaces and 7 inherited detail routes exactly", () => {
  assert.equal(propertySurfaceCount(), 17);
  assert.equal(propertyDetailRouteCount(), 7);

  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    const resolved = resolvePropertyRoute(surface.route);
    assert.equal(resolved.kind, "surface");
    if (resolved.kind === "surface") {
      assert.equal(resolved.featureId, surface.featureId);
      assert.equal(resolved.pagePermission, surface.pageCode);
    }
    for (const pattern of surface.detailRoutes) {
      const actual = pattern.replace(/\[[^\]]+\]/g, "record-1");
      const detail = resolvePropertyRoute(actual);
      assert.equal(detail.kind, "detail");
      if (detail.kind === "detail") {
        assert.equal(detail.featureId, surface.featureId);
        assert.equal(detail.pagePermission, surface.pageCode);
        assert.equal(detail.routePattern, pattern);
      }
    }
  }
});

test("route resolver distinguishes legacy, compatibility redirect and unknown paths", () => {
  assert.deepEqual(resolvePropertyRoute("/homestay"), {
    kind: "legacy",
    moduleCode: "homestay",
    legacyPermission: PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
    routePattern: "/homestay"
  });
  assert.deepEqual(resolvePropertyRoute("/housing/tenants/party-1"), {
    kind: "compatibility-redirect",
    sourcePagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
    routePattern: "/housing/tenants/[partyId]",
    redirectTo: "/assets/parties/party-1",
    targetAuthorization: "module-page-read",
    params: { partyId: "party-1" }
  });
  assert.deepEqual(resolvePropertyRoute("/housing"), {
    kind: "legacy",
    moduleCode: "housing_rental",
    legacyPermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_OPERATIONS_PAGE,
    routePattern: "/housing"
  });
  assert.deepEqual(resolvePropertyRoute("/dashboard"), { kind: "non-property" });
  assert.deepEqual(resolvePropertyRoute("/housing-rental"), { kind: "non-property" });
  for (const unsafe of [
    "/housing/tenants/..",
    "/housing/tenants/%2e%2e",
    "/housing/tenants/%2Fadmin",
    "/housing/tenants/%5cadmin",
    "/housing/tenants/%252e%252e",
    "/housing/tenants/%252Fadmin",
    "/housing/tenants/%255cadmin",
    "/housing/tenants/%25252e%25252e",
    "/housing/tenants/%2525252e%2525252e",
    "/housing/tenants/%252525252e%252525252e",
    "/housing\\tenants\\party-1",
    "/housing//tenants/party-1",
    "/housing/tenants/party-1/extra",
    "/homestay/dashboard/",
    "/homestay/bookings/[bookingId]",
    "/homestay/not-a-surface"
  ]) {
    assert.deepEqual(
      resolvePropertyRoute(unsafe),
      { kind: "unknown-property" },
      unsafe
    );
  }
});

test("compatibility redirects encode safe parameters and preserve canonical authorization", () => {
  assert.deepEqual(resolvePropertyRoute("/housing/tenants/张三"), {
    kind: "compatibility-redirect",
    sourcePagePermission: PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
    routePattern: "/housing/tenants/[partyId]",
    redirectTo: "/assets/parties/%E5%BC%A0%E4%B8%89",
    targetAuthorization: "module-page-read",
    params: { partyId: "张三" }
  });
});

test("compatibility redirect fails closed unless source and canonical target access intersect", () => {
  const enabledModules = [
    { module_code: "housing_rental", module_name: "住房", module_group: "property", enabled: true },
    { module_code: "asset", module_name: "资产", module_group: "asset", enabled: true }
  ];
  const allowed = user({
    enabled_modules: enabledModules,
    permissions: [
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE,
      "asset:party",
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ
    ]
  });
  assert.equal(
    resolveAuthorizedPropertyRoute("/housing/tenants/party-1", allowed).kind,
    "compatibility-redirect"
  );
  assert.deepEqual(
    resolveAuthorizedPropertyRoute("/housing/tenants/party-1", null),
    { kind: "unknown-property" }
  );
  for (const missing of [
    { enabled_modules: enabledModules.filter((module) => module.module_code !== "housing_rental") },
    { enabled_modules: enabledModules.filter((module) => module.module_code !== "asset") },
    { permissions: allowed.permissions.filter((permission) => permission !== PROPERTY_BUSINESS_PERMISSIONS.HOUSING_TENANTS_PAGE) },
    { permissions: allowed.permissions.filter((permission) => permission !== "asset:party") },
    { permissions: allowed.permissions.filter((permission) => permission !== PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ) }
  ]) {
    assert.deepEqual(
      resolveAuthorizedPropertyRoute("/housing/tenants/party-1", user({
        enabled_modules: enabledModules,
        permissions: allowed.permissions,
        ...missing
      })),
      { kind: "unknown-property" }
    );
  }
});
