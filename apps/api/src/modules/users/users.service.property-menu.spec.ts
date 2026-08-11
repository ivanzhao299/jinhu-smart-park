import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_BUSINESS_SURFACES,
  SYSTEM_PERMISSIONS,
  type EnabledModuleContext,
  type UserMenuTreeNode
} from "@jinhu/shared";
import type { PermissionEntity } from "../permissions/entities/permission.entity";
import type { RoleEntity } from "../roles/entities/role.entity";
import type { UserRoleEntity } from "../roles/entities/user-role.entity";
import type { UserEntity } from "./entities/user.entity";
import { UsersService } from "./users.service";

const TENANT_ID = "10000001";
const PARK_ID = "20000001";
const OTHER_PARK_ID = "20000002";

type UsersServiceInternals = {
  buildPermissionMenuTree(
    permissions: PermissionEntity[],
    permissionCodes: string[],
    enabledModules: EnabledModuleContext[]
  ): UserMenuTreeNode[];
  buildJwtPrincipal(user: UserEntity): {
    permissions: string[];
    roles: string[];
  };
};

function createService(overrides: {
  usersRepository?: unknown;
  userOrgRepository?: unknown;
  userParkRepository?: unknown;
  parksRepository?: unknown;
  dataScopeService?: unknown;
  fieldPolicyService?: unknown;
  saasModulesService?: unknown;
} = {}): UsersService {
  return new UsersService(
    (overrides.usersRepository ?? {}) as never,
    {} as never,
    {} as never,
    (overrides.userOrgRepository ?? {}) as never,
    (overrides.userParkRepository ?? {}) as never,
    (overrides.parksRepository ?? {}) as never,
    {} as never,
    (overrides.dataScopeService ?? {}) as never,
    (overrides.fieldPolicyService ?? {}) as never,
    (overrides.saasModulesService ?? {}) as never,
    { get: (_key: string, fallback?: string) => fallback } as never
  );
}

function internals(service = createService()): UsersServiceInternals {
  return service as unknown as UsersServiceInternals;
}

function enabledModule(moduleCode: string, enabled = true): EnabledModuleContext {
  return {
    module_code: moduleCode,
    module_name: moduleCode,
    module_group: "property",
    enabled
  };
}

function permission(
  code: string,
  route: string | null,
  overrides: Partial<PermissionEntity> = {}
): PermissionEntity {
  return {
    id: `permission-${code}-${route ?? "none"}`,
    tenantId: TENANT_ID,
    parkId: OTHER_PARK_ID,
    code,
    name: `Seeded ${code}`,
    parentId: null,
    resource: code,
    action: "page",
    permissionPath: null,
    permPath: null,
    permissionLevel: 2,
    level: 2,
    sortNo: 1,
    permissionType: "page",
    permType: 20,
    apiMethod: null,
    apiPath: null,
    frontendRoute: route,
    componentKey: null,
    icon: null,
    fieldKey: null,
    dataDimension: null,
    isSystem: true,
    isBuiltin: true,
    isTenantCustom: false,
    visible: true,
    keepAlive: true,
    alwaysShow: true,
    isEnabled: true,
    status: "enabled",
    isDeleted: false,
    createTime: new Date("2026-07-30T00:00:00.000Z"),
    ...overrides
  } as PermissionEntity;
}

function propertyChildren(menuTree: UserMenuTreeNode[], moduleCode?: string): UserMenuTreeNode[] {
  return menuTree
    .filter((node) => moduleCode === undefined || node.module === moduleCode)
    .flatMap((node) => node.children ?? [])
    .filter((node) => node.module === "homestay" || node.module === "housing_rental");
}

test("property menu projection accepts only explicit page permissions and removes legacy nodes", () => {
  const homestayDashboard = PROPERTY_BUSINESS_SURFACES[0];
  const housingTenants = PROPERTY_BUSINESS_SURFACES.find((surface) => surface.featureId === "housing.tenants")!;
  const service = internals();
  const tree = service.buildPermissionMenuTree(
    [
      permission(homestayDashboard.pageCode, homestayDashboard.route),
      permission(housingTenants.pageCode, housingTenants.route)
    ],
    [
      homestayDashboard.pageCode,
      housingTenants.pageCode,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_OPERATIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ
    ],
    [enabledModule("homestay"), enabledModule("housing_rental"), enabledModule("asset")]
  );

  assert.deepEqual(
    propertyChildren(tree).map((node) => [node.href, node.permission, node.module]),
    [
      [homestayDashboard.route, homestayDashboard.pageCode, "homestay"],
      [housingTenants.route, housingTenants.pageCode, "housing_rental"]
    ]
  );
  assert.equal(propertyChildren(tree).some((node) => node.href === "/homestay" || node.href === "/housing"), false);

  const legacyAndActionOnly = service.buildPermissionMenuTree(
    [],
    [
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_OPERATIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_RENTAL_OPERATIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ
    ],
    [enabledModule("homestay"), enabledModule("housing_rental"), enabledModule("asset")]
  );
  assert.deepEqual(propertyChildren(legacyAndActionOnly), []);
});

test("wildcard projects all 17 canonical pages but never bypasses current park module availability", () => {
  const service = internals();
  const bothModules = service.buildPermissionMenuTree(
    [],
    ["*"],
    [enabledModule("homestay"), enabledModule("housing_rental"), enabledModule("asset")]
  );
  assert.equal(propertyChildren(bothModules).length, 17);
  assert.deepEqual(
    propertyChildren(bothModules).map((node) => node.href),
    PROPERTY_BUSINESS_SURFACES.map((surface) => surface.route)
  );

  const homestayOnly = service.buildPermissionMenuTree(
    [],
    ["*"],
    [enabledModule("homestay"), enabledModule("housing_rental", false), enabledModule("asset")]
  );
  assert.equal(propertyChildren(homestayOnly, "homestay").length, 8);
  assert.equal(propertyChildren(homestayOnly, "housing_rental").length, 0);

  const noModules = service.buildPermissionMenuTree([], ["*"], []);
  assert.deepEqual(propertyChildren(noModules), []);
});

test("seeded property metadata is preferred and any route, type, module, or duplicate drift fails closed", () => {
  const surface = PROPERTY_BUSINESS_SURFACES[0];
  const service = internals();
  const project = (definitions: PermissionEntity[]) =>
    propertyChildren(
      service.buildPermissionMenuTree(
        definitions,
        [surface.pageCode],
        [enabledModule("homestay"), enabledModule("asset")]
      )
    );

  const valid = project([
    permission(surface.pageCode, surface.route, { name: "数据库运营总览", icon: "seeded-dashboard" })
  ]);
  assert.deepEqual(
    valid.map(({ label, href, icon }) => ({ label, href, icon })),
    [{ label: "数据库运营总览", href: surface.route, icon: "seeded-dashboard" }]
  );

  assert.deepEqual(project([permission(surface.pageCode, "/homestay/not-canonical")]), []);
  assert.deepEqual(project([permission(surface.pageCode, "/housing/dashboard")]), []);
  assert.deepEqual(project([
    permission(surface.pageCode, surface.route, { permissionType: "api" })
  ]), []);
  assert.deepEqual(project([permission(surface.pageCode, surface.route, { permType: 40 })]), []);
  assert.deepEqual(project([
    permission(surface.pageCode, surface.route, { action: "read" })
  ]), []);
  assert.deepEqual(project([
    permission(surface.pageCode, surface.route, { id: "duplicate-a" }),
    permission(surface.pageCode, surface.route, { id: "duplicate-b" })
  ]), []);
});

test("principal and menu permissions share current tenant and park relation filtering", () => {
  const dashboard = PROPERTY_BUSINESS_SURFACES[0];
  const acceptedDefinition = permission(dashboard.pageCode, dashboard.route, {
    parkId: OTHER_PARK_ID
  });
  const crossTenantDefinition = permission(PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_BOOKING_READ, null, {
    id: "cross-tenant-definition",
    tenantId: "other-tenant"
  });
  const currentRole = role("current-role", PARK_ID, [
    rolePermission("grant-current", PARK_ID, acceptedDefinition),
    rolePermission("grant-other-park", OTHER_PARK_ID, permission(PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ, null)),
    rolePermission("grant-cross-tenant-definition", PARK_ID, crossTenantDefinition)
  ]);
  const otherParkRole = role("other-park-role", OTHER_PARK_ID, [
    rolePermission("grant-other-role", OTHER_PARK_ID, permission(PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ, null))
  ]);
  const user = {
    id: "user-1",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    username: "operator",
    displayName: "Operator",
    roleLinks: [
      userRole("link-current", PARK_ID, currentRole),
      userRole("link-other-park", OTHER_PARK_ID, otherParkRole)
    ]
  } as UserEntity;

  const principal = internals().buildJwtPrincipal(user);
  assert.deepEqual(principal.roles, ["current-role"]);
  assert.deepEqual(principal.permissions, [dashboard.pageCode, SYSTEM_PERMISSIONS.USER_ME]);
});

test("disabled role and permission status fail closed even when isEnabled remains true", () => {
  const dashboard = PROPERTY_BUSINESS_SURFACES[0];
  const enabledDefinition = permission(dashboard.pageCode, dashboard.route);
  const statusDisabledDefinition = permission(
    PROPERTY_BUSINESS_PERMISSIONS.HOMESTAY_RATE_READ,
    null,
    { status: "disabled", isEnabled: true }
  );
  const enabledRole = role("enabled-role", PARK_ID, [
    rolePermission("grant-enabled", PARK_ID, enabledDefinition),
    rolePermission("grant-status-disabled-permission", PARK_ID, statusDisabledDefinition)
  ]);
  const statusDisabledRole = role("status-disabled-role", PARK_ID, [
    rolePermission(
      "grant-status-disabled-role",
      PARK_ID,
      permission(PROPERTY_BUSINESS_PERMISSIONS.HOUSING_LEASE_READ, null)
    )
  ], { status: "disabled", isEnabled: true });
  const user = {
    id: "user-status-filter",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    username: "operator",
    displayName: "Operator",
    roleLinks: [
      userRole("link-enabled", PARK_ID, enabledRole),
      userRole("link-status-disabled", PARK_ID, statusDisabledRole)
    ]
  } as UserEntity;

  const principal = internals().buildJwtPrincipal(user);
  assert.deepEqual(principal.roles, ["enabled-role"]);
  assert.deepEqual(principal.permissions, [dashboard.pageCode, SYSTEM_PERMISSIONS.USER_ME]);
});

test("current user context resolves enabled modules for the current park before returning one menu projection", async () => {
  const dashboard = PROPERTY_BUSINESS_SURFACES[0];
  const definition = permission(dashboard.pageCode, dashboard.route);
  const currentRole = role("current-role", PARK_ID, [
    rolePermission("grant-current", PARK_ID, definition)
  ]);
  const user = {
    id: "user-1",
    tenantId: TENANT_ID,
    parkId: PARK_ID,
    username: "operator",
    displayName: "Operator",
    mobile: null,
    email: null,
    avatarUrl: null,
    gender: null,
    lastLoginIp: null,
    lastLoginTime: null,
    roleLinks: [userRole("link-current", PARK_ID, currentRole)]
  } as UserEntity;
  const moduleCalls: Array<[string, string]> = [];
  const service = createService({
    usersRepository: { findOne: async () => user },
    userOrgRepository: { findOne: async () => null },
    userParkRepository: { find: async () => [] },
    parksRepository: { find: async () => [] },
    dataScopeService: { getUserDataScopes: async () => [] },
    fieldPolicyService: {
      getUserFieldPolicies: async () => [],
      applyFieldPolicies: async (_scope: unknown, _principal: unknown, _module: string, _entity: string, value: unknown) => value
    },
    saasModulesService: {
      listEnabledModulesForTenant: async (tenantId: string, parkId: string) => {
        moduleCalls.push([tenantId, parkId]);
        return [enabledModule("homestay"), enabledModule("asset")];
      }
    }
  });

  const context = await service.getCurrentUserContext(
    { tenantId: TENANT_ID, parkId: PARK_ID },
    user.id
  );
  assert.deepEqual(moduleCalls, [[TENANT_ID, PARK_ID]]);
  assert.strictEqual(context.menu_tree, context.menus);
  assert.deepEqual(
    propertyChildren(context.menu_tree ?? []).map((node) => node.href),
    [dashboard.route]
  );
});

function rolePermission(id: string, parkId: string, definition: PermissionEntity) {
  return {
    id,
    tenantId: TENANT_ID,
    parkId,
    isDeleted: false,
    permission: definition
  };
}

function role(
  code: string,
  parkId: string,
  permissionLinks: ReturnType<typeof rolePermission>[],
  overrides: Partial<RoleEntity> = {}
): RoleEntity {
  return {
    id: `role-${code}-${parkId}`,
    tenantId: TENANT_ID,
    parkId,
    code,
    name: code,
    isDeleted: false,
    isEnabled: true,
    status: "enabled",
    isSuper: false,
    dataScope: "40",
    permissionLinks,
    ...overrides
  } as RoleEntity;
}

function userRole(id: string, parkId: string, currentRole: RoleEntity): UserRoleEntity {
  return {
    id,
    tenantId: TENANT_ID,
    parkId,
    isDeleted: false,
    role: currentRole
  } as UserRoleEntity;
}
