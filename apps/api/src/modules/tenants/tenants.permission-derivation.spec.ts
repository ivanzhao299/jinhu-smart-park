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
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import { TenantModuleEntity } from "../saas-modules/entities/tenant-module.entity";
import { TenantEntity } from "./entities/tenant.entity";
import { UserEntity } from "../users/entities/user.entity";

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
  assert.match(source, /const orderedTenantParks = \[\.\.\.uniqueTenantParks\]\.sort\(\(left, right\) =>\s+assetScopeLockKey\(\{ tenantId: tenant\.tenantId, parkId: left\.parkId \}\)\s+\.localeCompare\(assetScopeLockKey\(\{ tenantId: tenant\.tenantId, parkId: right\.parkId \}\)\)\s+\)/);
  assert.match(source, /await lockAssetScope\(manager, scope\)[\s\S]{0,160}hasCanonicalActiveAssetParkSource\(manager, scope\)/);
  assert.match(source, /const activeTenantParks = uniqueTenantParks\.filter\(\(park\) => activeParkIds\.has\(park\.parkId\)\)/);
  assert.match(source, /const firstAuthorizationPark = activeTenantParks\[0\] \?\? uniqueTenantParks\[0\]/);
  assert.match(source, /activeTenantParks\.some\(\(park\) => park\.parkId === configuredDefaultParkId\)/);
  assert.match(source, /getRepository\(ParkEntity\)\.find/);
  assert.match(source, /authorizationScope/);
  assert.match(source, /getOrCreateTenantAdminRole\(manager, tenant, authorizationParkId/);
  assert.match(source, /for \(const park of orderedTenantParks\)/);
  assert.match(source, /resolvedModuleCodes = activeTenantParks\.length === uniqueTenantParks\.length/);
  assert.match(source, /normalizeCodes\(\[\.\.\.moduleCodes\.filter\(\(code\) => code !== "asset"\), "system"\]\)/);
  assert.match(source, /const parkActive = activeParkIds\.has\(park\.parkId\)/);
  assert.match(source, /const parkModules = parkActive/);
  assert.match(source, /modules\.filter\(\(module\) => moduleCodes\.includes\(module\.moduleCode\)\)/);
  assert.match(source, /module\.moduleCode !== "asset" \|\| moduleCodes\.includes\("asset"\)/);
  assert.match(source, /parkPermissionCodes\.push\(SYSTEM_PERMISSIONS\.PARK_READ, SYSTEM_PERMISSIONS\.PARK_UPDATE\)/);
  assert.match(source, /if \(parkActive\) \{\s*await this\.ensureAssetScopeProvisioning/);
  assert.match(source, /parkId: park\.parkId/);
  assert.match(source, /getRepository\(TenantModuleEntity\)\.update/);
  assert.match(
    source,
    /async update\([\s\S]*dto\.expireTime !== undefined[\s\S]*getRepository\(TenantModuleEntity\)\.update\([\s\S]*expireTime: tenant\.expireTime/
  );
  assert.match(
    source,
    /async updateLoginSettings\([\s\S]*dto\.expireTime !== undefined[\s\S]*assignmentScopes[\s\S]*lockAssetScope\(manager, scope\)[\s\S]*getRepository\(TenantModuleEntity\)\.update/
  );
  assert.match(source, /const enabled = !disabledModuleCodes\.has\(module\.moduleCode\)/);
  assert.match(
    source,
    /if \(!selectedModuleIds\.has\(item\.moduleId\)\)[\s\S]{0,240}withParkStatusSuspension\(item\.featureConfig, false\)/
  );
  assert.doesNotMatch(source, /where: \{ tenantId: tenant\.tenantId, parkId, code: TENANT_ADMIN_ROLE_CODE/);
  assert.doesNotMatch(source, /where: \{ tenantId: targetScope\.tenantId, parkId: targetScope\.parkId, isDeleted: false \}/);
  const assignModulesBlock = source.slice(source.indexOf("async assignModules("), source.indexOf("private async getTenantById"));
  assert.match(assignModulesBlock, /await lockAssetScope\(manager, targetScope\)[\s\S]{0,120}hasCanonicalActiveAssetParkSource\(manager, targetScope\)/);
  assert.doesNotMatch(assignModulesBlock, /getRepository\(ParkEntity\)\.findOne/);
});

test("login settings preserve suspended asset intent without exposing recovery-only system", () => {
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const resolveSelected = (service as unknown as {
    resolveSelectedModuleCodes(modules: TenantModuleEntity[]): string[];
  }).resolveSelectedModuleCodes.bind(service);
  const module = (moduleCode: string, values: Partial<TenantModuleEntity>) => ({
    enabled: false,
    status: "disabled",
    featureConfig: {},
    module: { moduleCode },
    ...values
  } as unknown as TenantModuleEntity);

  assert.deepEqual(resolveSelected([
    module("asset", { featureConfig: { suspendedByParkStatus: true } }),
    module("asset", { id: "unselected-asset" }),
    module("system", {
      enabled: true,
      status: "enabled",
      featureConfig: { recoveryOnlyForParkStatus: true }
    }),
    module("system", { id: "disabled-system" }),
    module("workorder", { id: "duplicate-workorder", enabled: true, status: "enabled" }),
    module("workorder", { enabled: true, status: "enabled" })
  ]), ["asset", "workorder"]);
});

test("generic tenant expiry updates every non-deleted module assignment in the same transaction", async () => {
  const expireTime = new Date(Date.now() + 86_400_000);
  const tenant = {
    id: "tenant-row",
    tenantId: "tenant-a",
    parkId: "0",
    tenantCode: "TENANT_A",
    tenantName: "Tenant A",
    tenantType: "park_operator",
    status: 1,
    expireTime: null,
    maxUsers: 10,
    maxParks: 1,
    websites: [],
    domains: [],
    featureConfig: {},
    createTime: new Date(),
    updateTime: new Date(),
    remark: null
  } as unknown as TenantEntity;
  const moduleUpdates: unknown[] = [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === TenantEntity) return {
        findOne: async () => tenant,
        save: async (value: TenantEntity) => value
      };
      if (entity === TenantModuleEntity) return {
        update: async (where: unknown, value: unknown) => moduleUpdates.push({ where, value }),
        find: async () => []
      };
      if (entity === UserEntity || entity === ParkEntity) return { count: async () => 0 };
      throw new Error("unexpected repository");
    }
  };
  const dataSource = { transaction: async (work: (entityManager: unknown) => unknown) => work(manager) };
  const service = new TenantsService({} as never, dataSource as never, {} as never, {} as never);

  await service.update(
    { isSuper: true, permissions: [] } as never,
    "actor-a",
    tenant.id,
    { expireTime: expireTime.toISOString() }
  );

  assert.deepEqual(moduleUpdates, [{
    where: { tenantId: "tenant-a", isDeleted: false },
    value: { expireTime, updateBy: "actor-a" }
  }]);
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

  assert.match(source, /enabledModuleCodes: this\.resolveSelectedModuleCodes\(modules\)/);
  assert.match(source, /return \[\.\.\.new Set\(modules\.flatMap/);
  assert.match(source, /const enabledModuleCount = new Set\(enabledModuleRows\.map\(\(item\) => item\.moduleId\)\)\.size/);
});

test("tenant asset enablement creates the canonical park projection in the tenant transaction", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const provisioningSource = readFileSync(resolve(__dirname, "../assets/asset-scope-provisioning.ts"), "utf8");

  assert.match(source, /await this\.ensureAssetScopeProvisioning\(manager, \{ tenantId, parkId: park\.parkId \}, moduleCodes, actorId\)/);
  assert.match(source, /await this\.ensureAssetScopeProvisioning\(manager, targetScope, moduleCodes, actorId\)/);
  assert.match(source, /if \(!moduleCodes\.includes\("asset"\)\) return/);
  assert.match(provisioningSource, /manager\.getRepository\(AssetParkEntity\)/);
  assert.match(provisioningSource, /const projection = await ensureAssetParkProjection\(manager, scope, actorId\)/);
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
  assert.match(helperBlock, /this\.isTenantModuleWindowRecoverable\(assignment\)/);
  assert.match(helperBlock, /candidateScopes[\s\S]*await lockAssetScope\(manager, scope\)[\s\S]*const assignments = await assignmentRepository\.find/);
  assert.match(helperBlock, /for \(const parkId of \[\.\.\.eligibleParkIds\]\.sort\(\)\)/);
  assert.doesNotMatch(helperBlock, /hasActiveAssetAssignment/);
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

test("reactivating a park restores only asset authorization suspended by park status", async () => {
  const tenant = { tenantId: "tenant-a", status: 1, expireTime: null } as TenantEntity;
  const systemAssignment = {
    id: "system-link",
    enabled: true,
    status: "enabled",
    featureConfig: { recoveryOnlyForParkStatus: true },
    module: { moduleCode: "system", status: 1, isDeleted: false }
  } as unknown as TenantModuleEntity;
  const assetAssignment = {
    id: "asset-link",
    enabled: false,
    status: "disabled",
    startTime: new Date(Date.now() + 60_000),
    expireTime: new Date(Date.now() + 120_000),
    featureConfig: { suspendedByParkStatus: true },
    module: { moduleCode: "asset", status: 1, isDeleted: false },
    plan: { permissionCodes: ["module:asset"] }
  } as unknown as TenantModuleEntity;
  const workorderAssignment = {
    id: "workorder-link",
    enabled: true,
    status: "enabled",
    startTime: new Date(Date.now() + 60_000),
    expireTime: new Date(Date.now() + 120_000),
    featureConfig: {},
    module: { moduleCode: "workorder", status: 1, isDeleted: false },
    plan: { permissionCodes: ["module:workorder"] }
  } as unknown as TenantModuleEntity;
  const permissions = [{ code: "system:user:me" }, { code: "asset:read" }] as PermissionEntity[];
  const savedAssignments: TenantModuleEntity[] = [];
  let appliedModuleCodes: string[] = [];
  let provisionedModuleCodes: string[] = [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === TenantEntity) return { findOne: async () => tenant };
      if (entity === TenantModuleEntity) return {
        find: async () => [systemAssignment, assetAssignment, workorderAssignment],
        save: async (assignment: TenantModuleEntity) => {
          savedAssignments.push(assignment);
          return assignment;
        }
      };
      if (entity === PermissionEntity) return { find: async () => permissions };
      throw new Error("unexpected repository");
    }
  };
  const service = Object.assign(Object.create(TenantsService.prototype), {
    getOrCreateTenantAdminRole: async () => ({ id: "tenant-admin" }),
    applyTenantAdminPermissions: async (
      _manager: unknown,
      _scope: unknown,
      _role: unknown,
      _permissions: unknown,
      moduleCodes: string[]
    ) => {
      appliedModuleCodes = moduleCodes;
    },
    ensureAssetScopeProvisioning: async (
      _manager: unknown,
      _scope: unknown,
      moduleCodes: string[]
    ) => {
      provisionedModuleCodes = moduleCodes;
    }
  }) as TenantsService;

  await service.reconcileReactivatedParkAuthorization(
    manager as never,
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  assert.deepEqual(savedAssignments, [assetAssignment, systemAssignment]);
  assert.equal(assetAssignment.enabled, true);
  assert.equal(assetAssignment.status, "enabled");
  assert.equal(assetAssignment.featureConfig.suspendedByParkStatus, undefined);
  assert.equal(systemAssignment.enabled, false);
  assert.equal(systemAssignment.status, "disabled");
  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, undefined);
  assert.deepEqual(appliedModuleCodes, ["asset", "workorder"]);
  assert.deepEqual(provisionedModuleCodes, ["asset", "workorder"]);
});

test("removing asset while a park is inactive clears its automatic recovery marker", async () => {
  const assetAssignment = {
    moduleId: "asset-module",
    enabled: false,
    status: "disabled",
    featureConfig: { suspendedByParkStatus: true }
  } as unknown as TenantModuleEntity;
  const saved: TenantModuleEntity[] = [];
  const manager = {
    getRepository: () => ({
      find: async () => [assetAssignment],
      save: async (assignment: TenantModuleEntity) => {
        saved.push(assignment);
        return assignment;
      }
    })
  };
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const upsert = (service as unknown as {
    upsertTenantModules(
      manager: unknown,
      tenant: TenantEntity,
      parkId: string,
      modules: SaaSModuleEntity[],
      plan: null,
      actorId: string,
      expireTime: null,
      featureConfig: Record<string, unknown>
    ): Promise<void>;
  }).upsertTenantModules.bind(service);

  await upsert(manager, { tenantId: "tenant-a" } as TenantEntity, "park-a", [], null, "actor-a", null, {});

  assert.equal(saved.length, 1);
  assert.equal(assetAssignment.enabled, false);
  assert.equal(assetAssignment.status, "disabled");
  assert.equal(assetAssignment.featureConfig.suspendedByParkStatus, undefined);
});

test("removing automatic system recovery authorization clears its marker", async () => {
  const systemAssignment = {
    moduleId: "system-module",
    enabled: true,
    status: "enabled",
    featureConfig: { recoveryOnlyForParkStatus: true }
  } as unknown as TenantModuleEntity;
  const manager = {
    getRepository: () => ({
      find: async () => [systemAssignment],
      save: async (assignment: TenantModuleEntity) => assignment
    })
  };
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const upsert = (service as unknown as {
    upsertTenantModules(
      manager: unknown,
      tenant: TenantEntity,
      parkId: string,
      modules: SaaSModuleEntity[],
      plan: null,
      actorId: string,
      expireTime: null,
      featureConfig: Record<string, unknown>
    ): Promise<void>;
  }).upsertTenantModules.bind(service);

  await upsert(manager, { tenantId: "tenant-a" } as TenantEntity, "park-a", [], null, "actor-a", null, {});

  assert.equal(systemAssignment.enabled, false);
  assert.equal(systemAssignment.status, "disabled");
  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, undefined);
});

test("inactive park module assignment preserves only automatic system recovery authorization", async () => {
  const systemModule = { id: "system-module", moduleCode: "system" } as SaaSModuleEntity;
  const systemAssignment = {
    moduleId: systemModule.id,
    enabled: true,
    status: "enabled",
    featureConfig: { recoveryOnlyForParkStatus: true }
  } as unknown as TenantModuleEntity;
  const manager = {
    getRepository: () => ({
      find: async () => [systemAssignment],
      save: async (assignment: TenantModuleEntity) => assignment
    })
  };
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const upsert = (service as unknown as {
    upsertTenantModules(
      manager: unknown,
      tenant: TenantEntity,
      parkId: string,
      modules: SaaSModuleEntity[],
      plan: null,
      actorId: string,
      expireTime: null,
      featureConfig: Record<string, unknown>,
      disabledModuleCodes: ReadonlySet<string>,
      recoveryOnlyModuleCodes: ReadonlySet<string>
    ): Promise<void>;
  }).upsertTenantModules.bind(service);

  const apply = async (recoveryOnly: boolean) => upsert(
    manager,
    { tenantId: "tenant-a", tenantCode: "TENANT_A" } as TenantEntity,
    "park-a",
    [systemModule],
    null,
    "actor-a",
    null,
    {},
    new Set(),
    recoveryOnly ? new Set(["system"]) : new Set()
  );

  await apply(true);
  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, true);

  await apply(false);
  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, undefined);
});

test("deactivating a park suspends asset and creates the system recovery authorization", async () => {
  const tenant = { tenantId: "tenant-a", tenantCode: "TENANT_A", status: 1, expireTime: null } as TenantEntity;
  const assetAssignment = {
    id: "asset-link",
    moduleId: "asset-module",
    planId: "plan-a",
    enabled: true,
    status: "enabled",
    featureConfig: {},
    module: { moduleCode: "asset", status: 1, isDeleted: false },
    plan: { permissionCodes: ["module:asset"] }
  } as unknown as TenantModuleEntity;
  const systemModule = { id: "system-module", moduleCode: "system", status: 1, isDeleted: false } as SaaSModuleEntity;
  const saved: TenantModuleEntity[] = [];
  let appliedModuleCodes: string[] = [];
  let requestedPermissionCodes: string[] = [];
  const assignmentRepository = {
    find: async () => [assetAssignment],
    create: (value: Partial<TenantModuleEntity>) => value as TenantModuleEntity,
    save: async (assignment: TenantModuleEntity) => {
      saved.push(assignment);
      return assignment;
    }
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === TenantEntity) return { findOne: async () => tenant };
      if (entity === TenantModuleEntity) return assignmentRepository;
      if (entity === SaaSModuleEntity) return { findOne: async () => systemModule };
      if (entity === PermissionEntity) return { find: async () => [{ code: "system:user:me" }] };
      throw new Error("unexpected repository");
    }
  };
  const service = Object.assign(Object.create(TenantsService.prototype), {
    getOrCreateTenantAdminRole: async () => ({ id: "tenant-admin" }),
    applyTenantAdminPermissions: async (
      _manager: unknown,
      _scope: unknown,
      _role: unknown,
      _permissions: unknown,
      moduleCodes: string[],
      permissionCodes: string[]
    ) => {
      appliedModuleCodes = moduleCodes;
      requestedPermissionCodes = permissionCodes;
    }
  }) as TenantsService;

  await service.reconcileDeactivatedParkAuthorization(
    manager as never,
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  const systemAssignment = saved.find((assignment) => assignment.moduleId === "system-module");
  assert.equal(assetAssignment.enabled, false);
  assert.equal(assetAssignment.status, "disabled");
  assert.equal(assetAssignment.featureConfig.suspendedByParkStatus, true);
  assert.equal(systemAssignment?.enabled, true);
  assert.equal(systemAssignment?.status, "enabled");
  assert.equal(systemAssignment?.featureConfig.recoveryOnlyForParkStatus, true);
  assert.deepEqual(appliedModuleCodes, []);
  assert.deepEqual(requestedPermissionCodes, ["park:read", "park:update"]);
});

test("park recovery temporarily exposes a future system assignment and then restores its schedule", async () => {
  const now = Date.now();
  const originalStart = new Date(now + 60_000);
  const originalExpire = new Date(now + 120_000);
  const tenant = { tenantId: "tenant-a", tenantCode: "TENANT_A", status: 1, expireTime: null } as TenantEntity;
  const systemModule = { id: "system-module", moduleCode: "system", status: 1, isDeleted: false } as SaaSModuleEntity;
  const systemAssignment = {
    id: "system-link",
    moduleId: systemModule.id,
    enabled: true,
    status: "enabled",
    startTime: originalStart,
    expireTime: originalExpire,
    featureConfig: {},
    module: systemModule,
    plan: { permissionCodes: ["module:system"] }
  } as unknown as TenantModuleEntity;
  const appliedModuleCodes: string[][] = [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === TenantEntity) return { findOne: async () => tenant };
      if (entity === TenantModuleEntity) return {
        find: async () => [systemAssignment],
        save: async (assignment: TenantModuleEntity) => assignment
      };
      if (entity === SaaSModuleEntity) return { findOne: async () => systemModule };
      if (entity === PermissionEntity) return { find: async () => [{ code: "system:user:me" }] };
      throw new Error("unexpected repository");
    }
  };
  const service = Object.assign(Object.create(TenantsService.prototype), {
    getOrCreateTenantAdminRole: async () => ({ id: "tenant-admin" }),
    applyTenantAdminPermissions: async (
      _manager: unknown,
      _scope: unknown,
      _role: unknown,
      _permissions: unknown,
      moduleCodes: string[]
    ) => {
      appliedModuleCodes.push(moduleCodes);
    },
    ensureAssetScopeProvisioning: async () => undefined
  }) as TenantsService;

  await service.reconcileDeactivatedParkAuthorization(
    manager as never,
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, true);
  assert.deepEqual(systemAssignment.featureConfig.recoverySystemAssignmentSnapshot, {
    enabled: true,
    status: "enabled",
    startTime: originalStart.toISOString(),
    expireTime: originalExpire.toISOString()
  });
  assert.deepEqual(appliedModuleCodes[0], []);

  await service.reconcileReactivatedParkAuthorization(
    manager as never,
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  assert.equal(systemAssignment.enabled, true);
  assert.equal(systemAssignment.status, "enabled");
  assert.equal(systemAssignment.startTime?.toISOString(), originalStart.toISOString());
  assert.equal(systemAssignment.expireTime?.toISOString(), originalExpire.toISOString());
  assert.equal(systemAssignment.featureConfig.recoveryOnlyForParkStatus, undefined);
  assert.equal(systemAssignment.featureConfig.recoverySystemAssignmentSnapshot, undefined);
  assert.deepEqual(appliedModuleCodes[1], ["system"]);
});

test("park recovery rejects malformed system assignment snapshots", () => {
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const resolveSnapshot = (service as unknown as {
    resolveRecoverySystemSnapshot(featureConfig: Record<string, unknown>): unknown;
  }).resolveRecoverySystemSnapshot.bind(service);

  assert.throws(
    () => resolveSnapshot({
      recoverySystemAssignmentSnapshot: {
        enabled: true,
        status: "enabled",
        startTime: "not-a-date",
        expireTime: null
      }
    }),
    /Recovery system assignment snapshot is invalid/
  );
});

test("reactivating a park does not restore an expired suspended asset assignment", async () => {
  const tenant = { tenantId: "tenant-a", status: 1, expireTime: null } as TenantEntity;
  const expiredAsset = {
    id: "asset-link",
    enabled: false,
    status: "disabled",
    startTime: null,
    expireTime: new Date(Date.now() - 1_000),
    featureConfig: { suspendedByParkStatus: true },
    module: { moduleCode: "asset", status: 1, isDeleted: false }
  } as unknown as TenantModuleEntity;
  let saveCount = 0;
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === TenantEntity) return { findOne: async () => tenant };
      if (entity === TenantModuleEntity) return {
        find: async () => [expiredAsset],
        save: async () => {
          saveCount += 1;
        }
      };
      throw new Error("unexpected repository");
    }
  };
  const service = Object.create(TenantsService.prototype) as TenantsService;

  await service.reconcileReactivatedParkAuthorization(
    manager as never,
    { tenantId: "tenant-a", parkId: "park-a" },
    "actor-a"
  );

  assert.equal(saveCount, 0);
  assert.equal(expiredAsset.enabled, false);
  assert.equal(expiredAsset.featureConfig.suspendedByParkStatus, true);
});

test("reactivating a park restores a future-dated asset assignment before its window opens", () => {
  const service = Object.create(TenantsService.prototype) as TenantsService;
  const recoverable = (service as unknown as {
    isTenantModuleWindowRecoverable(assignment: TenantModuleEntity, now: number): boolean;
  }).isTenantModuleWindowRecoverable.bind(service);
  const now = Date.now();
  const futureAssignment = {
    startTime: new Date(now + 60_000),
    expireTime: new Date(now + 120_000)
  } as TenantModuleEntity;

  assert.equal(recoverable(futureAssignment, now), true);
  assert.equal(recoverable({ ...futureAssignment, expireTime: new Date(now - 1) } as TenantModuleEntity, now), false);
});
