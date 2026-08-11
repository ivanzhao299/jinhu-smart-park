import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { TenantsService } from "./tenants.service";

test("runtime module grants derive the current homestay and housing permission families", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "homestay:booking:read" },
    { code: "housing:lease:read" },
    { code: "leasing:contract:read" }
  ] as never;
  assert.deepEqual(derive(["homestay"], permissions), ["homestay:booking:read"]);
  assert.deepEqual(derive(["housing_rental"], permissions), ["housing:lease:read"]);
});

test("housing rental module preserves compatibility entry permissions", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const filter = (service as unknown as {
    permissionCodesForModules(permissionCodes: string[], moduleCodes: string[]): string[];
  }).permissionCodesForModules.bind(service);

  assert.deepEqual(
    filter(["housing_rental:operations", "housing_rental:*", "homestay:operations"], ["housing_rental"]),
    ["housing_rental:operations", "housing_rental:*"]
  );
});

test("the default system module grants tenant administration pages without platform tenant management", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "system" },
    { code: "system:org" },
    { code: "system:org:list" },
    { code: "system:user" },
    { code: "system:user:list" },
    { code: "system:tenant" },
    { code: "system:tenant:list" },
    { code: "system:module" },
    { code: "system:module:list" },
    { code: "park:read" }
  ] as never;

  assert.deepEqual(derive(["system"], permissions), [
    "system",
    "system:org",
    "system:org:list",
    "system:user",
    "system:user:list"
  ]);
});

test("the safety module grants every safety permission family used by its menus and APIs", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "safety" },
    { code: "safety:dashboard" },
    { code: "safety_statistics:read" },
    { code: "safety_inspect_task:my" },
    { code: "safety_hazard:read" },
    { code: "safety_emergency:read" },
    { code: "safety_work_permit:read" },
    { code: "video_alert:create_hazard" },
    { code: "workorder:read" }
  ] as never;

  assert.deepEqual(derive(["safety"], permissions), [
    "safety",
    "safety:dashboard",
    "safety_statistics:read",
    "safety_inspect_task:my",
    "safety_hazard:read",
    "safety_emergency:read",
    "safety_work_permit:read"
  ]);
});

test("the work-order module keeps core, SLA, log, and compatibility permissions", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "workorder" },
    { code: "workorder:center" },
    { code: "workorder:read" },
    { code: "workorder_sla:read" },
    { code: "workorder_sla:create" },
    { code: "workorder_log:read" },
    { code: "workorder_log:create" },
    { code: "wo:read" },
    { code: "asset:read" }
  ] as never;

  assert.deepEqual(derive(["workorder"], permissions), [
    "workorder",
    "workorder:center",
    "workorder:read",
    "workorder_sla:read",
    "workorder_sla:create",
    "workorder_log:read",
    "workorder_log:create",
    "wo:read"
  ]);
});

test("the apartment module keeps its menu and API permission family", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "apartment" },
    { code: "apartment:dashboard" },
    { code: "apartment:read" },
    { code: "apartment:document_manage" },
    { code: "asset:read" }
  ] as never;

  assert.deepEqual(derive(["apartment"], permissions), [
    "apartment",
    "apartment:dashboard",
    "apartment:read",
    "apartment:document_manage"
  ]);
});

test("the asset module keeps shared property operations, approvals, tasks, and notifications", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "party:read" },
    { code: "party_role:manage" },
    { code: "property:notifications:page" },
    { code: "property_operation:read" },
    { code: "property_occupancy:activate" },
    { code: "property_approval:decide" },
    { code: "property_event:replay" },
    { code: "property_task:rebuild" },
    { code: "property_notification:mark_read" },
    { code: "workorder:read" }
  ] as never;

  assert.deepEqual(derive(["asset"], permissions), [
    "party:read",
    "party_role:manage",
    "property:notifications:page",
    "property_operation:read",
    "property_occupancy:activate",
    "property_approval:decide",
    "property_event:replay",
    "property_task:rebuild",
    "property_notification:mark_read"
  ]);
});

test("plan module markers cannot grant permissions for a module that is not enabled", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const filter = (service as unknown as {
    permissionCodesForModules(permissionCodes: string[], moduleCodes: string[]): string[];
  }).permissionCodesForModules.bind(service);

  assert.deepEqual(
    filter(["module:system", "module:safety", "asset:read", "system:user:*", "module:system"], ["system"]),
    ["module:system", "system:user:*"]
  );
  assert.deepEqual(
    filter(["safety_hazard:read", "asset:read"], ["system", "safety"]),
    ["safety_hazard:read"]
  );
  assert.deepEqual(filter(["safety:*", "asset:*"], ["safety"]), ["safety:*"]);
  assert.deepEqual(
    filter(["workorder_sla:*", "workorder_log:*", "asset:*"], ["workorder"]),
    ["workorder_sla:*", "workorder_log:*"]
  );
  assert.deepEqual(filter(["apartment:*", "asset:*"], ["apartment"]), ["apartment:*"]);
  assert.deepEqual(
    filter(["property_task:*", "property_approval:*", "workorder:*"], ["asset"]),
    ["property_task:*", "property_approval:*"]
  );
  assert.deepEqual(
    filter(["iot_alert:*", "iot_device:read", "energy_meter:*"], ["system", "iot"]),
    ["iot_alert:*", "iot_device:read"]
  );
});

test("tenant-wide authorization changes converge every tenant park without clearing an omitted default park", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");

  assert.match(source, /dto\.defaultParkId === undefined\s+\? configuredDefaultParkId/);
  assert.match(source, /dto\.defaultParkId !== undefined && defaultParkId/);
  assert.match(source, /tenantParks\.some\(\(park\) => park\.parkId === configuredDefaultParkId\)/);
  assert.match(source, /getRepository\(ParkEntity\)\.find/);
  assert.match(source, /authorizationScope/);
  assert.match(source, /getOrCreateTenantAdminRole\(manager, tenant, authorizationParkId/);
  assert.match(source, /for \(const park of tenantParks\)/);
  assert.match(source, /parkId: park\.parkId/);
  assert.match(source, /getRepository\(TenantModuleEntity\)\.update/);
  assert.doesNotMatch(source, /where: \{ tenantId: tenant\.tenantId, parkId, code: TENANT_ADMIN_ROLE_CODE/);
  assert.doesNotMatch(source, /where: \{ tenantId: targetScope\.tenantId, parkId: targetScope\.parkId, isDeleted: false \}/);
});

test("tenant module read models deduplicate park-scoped module bindings", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");

  assert.match(source, /enabledModuleCodes: \[\s*\.\.\.new Set\(/);
  assert.match(source, /const enabledModuleCount = new Set\(enabledModuleRows\.map\(\(item\) => item\.moduleId\)\)\.size/);
});

test("tenant authorization rejects a malformed park-scoped administrator role", async () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const getOrCreate = (service as unknown as {
    getOrCreateTenantAdminRole(
      manager: { getRepository(): { findOne(): Promise<unknown> } },
      tenant: { tenantId: string },
      parkId: string,
      actorId: string
    ): Promise<unknown>;
  }).getOrCreateTenantAdminRole.bind(service);

  await assert.rejects(
    getOrCreate(
      {
        getRepository: () => ({
          findOne: async () => ({
            roleScope: "park",
            isBuiltin: true,
            isSystem: true
          })
        })
      },
      { tenantId: "tenant-a" },
      "park-b",
      "actor-1"
    ),
    /Tenant administrator role must be a tenant-scoped built-in role/
  );
});
