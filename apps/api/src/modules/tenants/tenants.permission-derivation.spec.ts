import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { preferActiveTenantParkRows, TenantsService } from "./tenants.service";
import {
  ensureAssetScopeProvisioned,
  resolveCanonicalAssetParkSource
} from "../assets/asset-scope-provisioning";
import { ParkEntity } from "../parks/entities/park.entity";

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
    { code: "unit:read" },
    { code: "party:read" },
    { code: "party:manage" },
    { code: "file:read" },
    { code: "file:upload" },
    { code: "file:download" },
    { code: "file:delete" },
    { code: "unit:update" },
    { code: "asset:read" }
  ] as never;

  assert.deepEqual(derive(["apartment"], permissions), [
    "apartment",
    "apartment:dashboard",
    "apartment:read",
    "apartment:document_manage",
    "unit:read",
    "party:read",
    "party:manage",
    "file:read",
    "file:upload",
    "file:download"
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
  assert.deepEqual(
    filter(["apartment:*", "unit:read", "party:*", "file:*", "asset:*"], ["apartment"]),
    ["apartment:*", "unit:read", "party:*", "file:*"]
  );
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
  assert.match(source, /const uniqueTenantParks = preferActiveTenantParkRows\(tenantParks\)/);
  assert.match(source, /const activeTenantParks = uniqueTenantParks\.filter\(\(park\) => park\.status === 1\)/);
  assert.match(source, /const firstAuthorizationPark = activeTenantParks\[0\] \?\? uniqueTenantParks\[0\]/);
  assert.match(source, /activeTenantParks\.some\(\(park\) => park\.parkId === configuredDefaultParkId\)/);
  assert.match(source, /getRepository\(ParkEntity\)\.find/);
  assert.match(source, /authorizationScope/);
  assert.match(source, /getOrCreateTenantAdminRole\(manager, tenant, authorizationParkId/);
  assert.match(source, /for \(const park of uniqueTenantParks\)/);
  assert.match(source, /resolvedModuleCodes = activeTenantParks\.length === uniqueTenantParks\.length/);
  assert.match(source, /normalizeCodes\(\[\.\.\.moduleCodes\.filter\(\(code\) => code !== "asset"\), "system"\]\)/);
  assert.match(source, /const parkModules = modules\.filter\(\(module\) => selectedParkModuleCodes\.has\(module\.moduleCode\)\)/);
  assert.match(source, /parkPermissionCodes\.push\(SYSTEM_PERMISSIONS\.PARK_READ, SYSTEM_PERMISSIONS\.PARK_UPDATE\)/);
  assert.match(source, /if \(park\.status === 1\) \{\s*await this\.ensureAssetScopeProvisioning/);
  assert.match(source, /parkId: park\.parkId/);
  assert.match(source, /getRepository\(TenantModuleEntity\)\.update/);
  assert.match(source, /const enabled = !disabledModuleCodes\.has\(module\.moduleCode\)/);
  assert.doesNotMatch(source, /where: \{ tenantId: tenant\.tenantId, parkId, code: TENANT_ADMIN_ROLE_CODE/);
  assert.doesNotMatch(source, /where: \{ tenantId: targetScope\.tenantId, parkId: targetScope\.parkId, isDeleted: false \}/);
});

test("tenant park row convergence prefers the active duplicate regardless of row order", () => {
  const inactive = { id: "inactive", parkId: "park-a", status: 0 } as ParkEntity;
  const active = { id: "active", parkId: "park-a", status: 1 } as ParkEntity;

  assert.deepEqual(preferActiveTenantParkRows([inactive, active]), [active]);
  assert.deepEqual(preferActiveTenantParkRows([active, inactive]), [active]);
});

test("inactive park recovery grants only its explicit read and update permissions outside asset", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const select = (service as unknown as {
    selectPermissions(
      permissions: Array<{ id: string; code: string; parentId: null; isEnabled: boolean; isDeleted: boolean }>,
      moduleCodes: string[],
      requestedPermissionCodes: string[]
    ): Array<{ code: string }>;
  }).selectPermissions.bind(service);
  const permission = (code: string) => ({ id: code, code, parentId: null, isEnabled: true, isDeleted: false });
  const selected = select(
    [permission("system"), permission("system:user:me"), permission("park:read"), permission("park:update"), permission("building:read")],
    ["system"],
    ["park:read", "park:update"]
  );

  assert.deepEqual(selected.map((item) => item.code), ["system", "system:user:me", "park:read", "park:update"]);
});

test("tenant module read models deduplicate park-scoped module bindings", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");

  assert.match(source, /enabledModuleCodes: \[\s*\.\.\.new Set\(/);
  assert.match(source, /const enabledModuleCount = new Set\(enabledModuleRows\.map\(\(item\) => item\.moduleId\)\)\.size/);
});

test("tenant asset enablement creates the canonical park projection in the tenant transaction", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const provisioningSource = readFileSync(resolve(__dirname, "../assets/asset-scope-provisioning.ts"), "utf8");

  assert.match(source, /await this\.ensureAssetScopeProvisioning\(manager, \{ tenantId, parkId: park\.parkId \}, moduleCodes, actorId\)/);
  assert.match(source, /await this\.ensureAssetScopeProvisioning\(manager, targetScope, moduleCodes, actorId\)/);
  assert.match(source, /if \(!moduleCodes\.includes\("asset"\)\) return/);
  assert.match(provisioningSource, /manager\.getRepository\(AssetParkEntity\)/);
  assert.match(provisioningSource, /tenant-asset-park:\$\{scope\.tenantId\}:\$\{scope\.parkId\}/);
  assert.match(provisioningSource, /remark: "Tenant asset park projection"/);
  assert.match(provisioningSource, /ensureTenantAssetRuntimeControls\(manager, scope\)/);
});

test("tenant reactivation provisions every currently eligible asset scope before commit", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const enableBlock = source.slice(source.indexOf("  async enable("), source.indexOf("  async disable("));
  const helperBlock = source.slice(
    source.indexOf("  private async reconcileActiveTenantAssetScopes("),
    source.indexOf("  async disable(")
  );

  assert.match(enableBlock, /this\.dataSource\.transaction\(async \(manager\) =>/);
  assert.match(enableBlock, /this\.isTenantRuntimeActive\(tenant\)/);
  assert.match(enableBlock, /this\.reconcileActiveTenantAssetScopes\(manager, tenant, actorId\)/);
  assert.match(enableBlock, /return this\.toView\(tenant, manager\)/);
  assert.equal((source.match(/!wasRuntimeActive && this\.isTenantRuntimeActive\(tenant\)/g) ?? []).length, 2);
  assert.equal((source.match(/this\.reconcileActiveTenantAssetScopes\(manager, tenant, actorId\)/g) ?? []).length, 3);
  assert.match(helperBlock, /moduleCode: "asset", status: 1, isDeleted: false/);
  assert.match(helperBlock, /enabled: true,\s+status: "enabled",\s+isDeleted: false/);
  assert.match(helperBlock, /assignment\.startTime\.getTime\(\) <= now/);
  assert.match(helperBlock, /assignment\.expireTime\.getTime\(\) > now/);
  assert.match(helperBlock, /where: \{ tenantId: tenant\.tenantId, status: 1, isDeleted: false \}/);
  assert.match(helperBlock, /await lockAssetScope\(manager, scope\)/);
  assert.match(helperBlock, /if \(!await hasActiveAssetAssignment\(manager, scope\)\)/);
  assert.match(helperBlock, /await ensureAssetScopeProvisioned\(manager, scope, actorId\)/);
});

test("tenant asset projection is serialized and restores an existing disabled projection", async () => {
  const saved: Array<Record<string, unknown>> = [];
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const existing = {
    tenantId: "tenant-a",
    parkId: "park-a",
    parkCode: "OLD",
    parkName: "Old park",
    address: null,
    totalArea: "0",
    status: "disabled"
  };
  const ensureProjection = ensureAssetScopeProvisioned as unknown as (
      manager: {
        query(sql: string, parameters: unknown[]): Promise<unknown>;
        getRepository(): {
          find(): Promise<Array<Record<string, unknown>>>;
          create(value: Record<string, unknown>): Record<string, unknown>;
          save(value: Record<string, unknown>): Promise<Record<string, unknown>>;
        };
      },
      scope: { tenantId: string; parkId: string },
      actorId: string
    ) => Promise<void>;

  let repositoryCall = 0;

  await ensureProjection(
    {
      query: async (sql, parameters) => {
        queries.push({ sql, parameters });
        return sql.includes("validControlCount")
          ? [{ controlCount: "12", validControlCount: "12", auditCount: "24", validAuditCount: "24" }]
          : [];
      },
      getRepository: () => {
        repositoryCall += 1;
        if (repositoryCall === 1) {
          return {
            find: async () => [{
              tenantId: "tenant-a",
              parkId: "park-a",
              parkCode: "PARK-A",
              parkName: "Park A",
              address: "No. 1",
              totalArea: "100.00"
            }],
            create: (value) => value,
            save: async (value) => value
          };
        }
        return {
          find: async () => [existing],
          create: (value) => value,
          save: async (value) => {
            saved.push({ ...value });
            return value;
          }
        };
      }
    },
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  assert.match(queries[0]?.sql ?? "", /pg_advisory_xact_lock/);
  assert.deepEqual(queries[0]?.parameters, ["tenant-asset-park:tenant-a:park-a"]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.status, "enabled");
  assert.equal(saved[0]?.parkCode, "PARK-A");
  assert.equal(saved[0]?.parkName, "Park A");
  assert.equal(saved[0]?.updateBy, "actor-a");
});

test("tenant asset source resolution fails closed for ambiguous parks and keeps the reviewed default JH fallback", async () => {
  const resolveSource = resolveCanonicalAssetParkSource as unknown as (
      manager: { getRepository(): { find(): Promise<Array<Record<string, unknown>>> } },
      scope: { tenantId: string; parkId: string }
    ) => Promise<Record<string, unknown>>;

  await assert.rejects(
    resolveSource(
      { getRepository: () => ({ find: async () => [{ parkCode: "A" }, { parkCode: "B" }] }) },
      { tenantId: "tenant-a", parkId: "park-a" }
    ),
    /Asset park source is ambiguous/
  );

  let ambiguousDefaultQueryCount = 0;
  const ambiguousDefaultFallback = await resolveSource(
    { getRepository: () => ({ find: async () => {
      ambiguousDefaultQueryCount += 1;
      return ambiguousDefaultQueryCount === 1
        ? [{ parkCode: "A" }, { parkCode: "JH" }]
        : [{ parkCode: "JH" }];
    } }) },
    { tenantId: "10000001", parkId: "20000001" }
  );
  assert.equal(ambiguousDefaultFallback.parkCode, "JH");

  let queryCount = 0;
  const fallback = await resolveSource({ getRepository: () => ({ find: async () => {
    queryCount += 1;
    return queryCount === 1 ? [] : [{ parkCode: "JH" }];
  } }) }, { tenantId: "10000001", parkId: "20000001" });
  assert.equal(fallback.parkCode, "JH");
});

test("tenant asset provisioning rejects duplicate non-deleted projections before mutation", async () => {
  const ensureProjection = ensureAssetScopeProvisioned as unknown as (
      manager: {
        query(): Promise<unknown>;
        getRepository(): { find(): Promise<Array<Record<string, unknown>>> };
      },
      scope: { tenantId: string; parkId: string },
      actorId: string
    ) => Promise<void>;
  let repositoryCall = 0;

  await assert.rejects(
    ensureProjection(
      {
        query: async () => [],
        getRepository: () => ({
          find: async () => {
            repositoryCall += 1;
            return repositoryCall === 1
              ? [{ parkCode: "PARK-A", parkName: "Park A", address: null, totalArea: "0" }]
              : [{ parkCode: "PARK-A" }, { parkCode: "PARK-B" }];
          }
        })
      },
      { tenantId: "tenant-a", parkId: "park-a" },
      "actor-a"
    ),
    /Asset park projection is ambiguous/
  );
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
