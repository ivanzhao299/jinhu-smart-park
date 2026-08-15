import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { SaaSModulesService } from "./saas-modules.service";

const source = fs.readFileSync(
  path.join(__dirname, "saas-modules.service.ts"),
  "utf8"
);

test("effective module projection consumes hard dependencies and the full active predicate", () => {
  for (const fragment of [
    "sys_module_dependency dependency",
    "dependency.dependency_kind = 'hard'",
    "dependency.is_enabled = true",
    "dependency.is_deleted = false",
    "required_assignment.enabled = true",
    "required_assignment.status = 'enabled'",
    "required_assignment.is_deleted = false",
    "required_assignment.start_time IS NULL OR required_assignment.start_time <= now()",
    "required_assignment.expire_time IS NULL OR required_assignment.expire_time > now()",
    'required_assignment.tenant_id = "tenantModule".tenant_id',
    'required_assignment.park_id = "tenantModule".park_id',
    "required_module.status <> 1",
    "required_module.is_deleted = true"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("module writes take the dependency advisory lock before row locks", () => {
  const helper = source.slice(
    source.indexOf("private async lockModuleDependencyGraph"),
    source.indexOf("private async assertDependenciesActive")
  );
  const advisory = helper.indexOf("pg_advisory_xact_lock");
  const moduleRows = helper.indexOf("FROM sys_module");
  const assignmentRows = helper.indexOf("FROM rel_tenant_module");
  assert.ok(advisory >= 0);
  assert.ok(moduleRows > advisory);
  assert.ok(assignmentRows > moduleRows);
  assert.match(helper, /ORDER BY module_code COLLATE "C"[\s\S]*FOR UPDATE/);
  assert.match(helper, /ORDER BY module\.module_code COLLATE "C"[\s\S]*FOR UPDATE OF assignment/);
});

test("dependent enable and required-module disable both fail with the stable conflict", () => {
  assert.match(source, /private async assertDependenciesActive/);
  assert.match(source, /private async assertNoActiveDependents/);
  assert.match(source, /private async assertProspectiveAssignmentSupportsDependents/);
  assert.match(source, /\$2::timestamptz IS NULL OR \$2::timestamptz <= now\(\)/);
  assert.match(source, /\$3::timestamptz IS NULL OR \$3::timestamptz > now\(\)/);
  assert.equal(
    (source.match(/errorCode: "module-dependency-conflict"/g) ?? []).length >= 3,
    true
  );
  assert.match(source, /dependentModules:/);
  assert.match(source, /requiredModules:/);
});

test("module assignment writes cannot create split enabled and status state", () => {
  assert.match(source, /enabled: enabling,/);
  assert.match(source, /status: enabling \? "enabled" : "disabled"/);
  assert.match(source, /startTime\.getTime\(\) >= expireTime\.getTime\(\)/);
  assert.match(source, /System module authorization cannot start in the future/);
  assert.match(source, /System module authorization cannot expire automatically/);
});

test("system assignments cannot schedule or expire permission-only authorization", () => {
  const assignBlock = source.slice(
    source.indexOf("async assignTenantModule"),
    source.indexOf("async enableTenantModule")
  );
  assert.match(assignBlock, /module\.moduleCode === "system" \? null : entity\.expireTime \?\? null/);

  const assertImmediate = (SaaSModulesService.prototype as unknown as {
    assertSystemAssignmentWindow(moduleCode: string, startTime: Date | null, expireTime: Date | null): void;
  }).assertSystemAssignmentWindow;

  assert.doesNotThrow(() => assertImmediate.call({} as SaaSModulesService, "asset", new Date(Date.now() + 60_000), new Date(Date.now() + 120_000)));
  assert.doesNotThrow(() => assertImmediate.call({} as SaaSModulesService, "system", null, null));
  assert.throws(
    () => assertImmediate.call({} as SaaSModulesService, "system", new Date(Date.now() + 60_000), null),
    /System module authorization cannot start in the future/
  );
  assert.throws(
    () => assertImmediate.call({} as SaaSModulesService, "system", null, new Date(Date.now() + 60_000)),
    /System module authorization cannot expire automatically/
  );
});

test("inactive asset assignment retries preserve the suspended authorization intent", () => {
  const resolveRequestedEnabled = (SaaSModulesService.prototype as unknown as {
    resolveRequestedEnabled(moduleCode: string, requestedStatus: string | undefined, entity: unknown): boolean;
  }).resolveRequestedEnabled;
  const suspended = {
    status: "disabled",
    featureConfig: { suspendedByParkStatus: true }
  };

  assert.equal(resolveRequestedEnabled.call({} as SaaSModulesService, "asset", undefined, suspended), true);
  assert.equal(resolveRequestedEnabled.call({} as SaaSModulesService, "asset", "disabled", suspended), false);
  assert.equal(resolveRequestedEnabled.call({} as SaaSModulesService, "system", undefined, suspended), false);
});

test("asset module assignment and enable paths provision the canonical asset scope in the same transaction", () => {
  assert.equal((source.match(/ensureAssetScopeProvisioned\(manager, scope, actorId\)/g) ?? []).length, 2);
  assert.match(source, /const saved = await repository\.save\(entity\);[\s\S]*ensureAssetScopeProvisioned/);
  assert.match(source, /if \(enabling && module\.moduleCode === "asset"\)/);
  assert.match(source, /if \(parkActive && module\.moduleCode === "asset"\)/);
  assert.equal((source.match(/reconcileInactiveAssetRecovery\(manager, scope, actorId\)/g) ?? []).length, 3);
  assert.match(source, /reconcileDeactivatedParkAuthorization\(manager, scope, actorId\)/);
  assert.doesNotMatch(source, /reconcileExplicitSystemAuthorization\(manager, scope, actorId\)/);
  assert.match(source, /reconcileCurrentTenantAdminPermissions\([\s\S]*?preserveParkRecoveryGrants/);
  assert.equal((source.match(/reconcileSystemAuthorizationAfterWrite\(manager, scope, actorId/g) ?? []).length, 3);
  assert.match(source, /const parkActive = await this\.isParkActive\(manager, scope\)/);
  assert.match(source, /if \(!enabled && !parkActive\)[\s\S]*reconcileInactiveAssetRecovery/);
  assert.match(source, /reconcileExplicitSystemAuthorization\(manager, scope, actorId, !parkActive\)/);
});

test("module writes acquire the asset scope lock before dependency and assignment locks", () => {
  for (const [start, end] of [
    ["async assignTenantModule", "async enableTenantModule"],
    ["async enableTenantModule", "async disableTenantModule"],
    ["async disableTenantModule", "async listEnabledModulesForTenant"]
  ] as const) {
    const block = source.slice(source.indexOf(start), source.indexOf(end));
    const assetLock = block.indexOf("lockAssetScope(manager, scope)");
    const dependencyLock = block.indexOf("lockModuleDependencyGraph(manager, scope)");
    assert.ok(assetLock >= 0);
    assert.ok(dependencyLock > assetLock);
  }
});

test("asset module writes suspend on inactive parks while explicit disable clears the marker", () => {
  assert.match(source, /private async isParkActive/);
  assert.match(source, /return hasCanonicalActiveAssetParkSource\(manager, scope\)/);
  assert.doesNotMatch(source, /getRepository\(ParkEntity\)/);
  assert.doesNotMatch(source, /module\.moduleCode !== "asset" \|\| await this\.isParkActive/);
  assert.equal((source.match(/module\.moduleCode === "system" \? true : await this\.isParkActive\(manager, scope\)/g) ?? []).length, 2);
  assert.equal((source.match(/const parkActive = await this\.isParkActive\(manager, scope\)/g) ?? []).length, 1);
  assert.match(source, /requestedEnabled && module\.moduleCode === "asset" && !parkActive/);
  assert.match(source, /enabled: parkActive/);
  assert.match(source, /status: parkActive \? "enabled" : "disabled"/);
  assert.match(source, /function withParkStatusSuspension/);
  assert.match(source, /delete next\[PARK_STATUS_SUSPENDED_FEATURE\]/);
  assert.equal((source.match(/withParkStatusSuspension\(/g) ?? []).length, 4);
  assert.match(source, /function withExplicitModuleSelection/);
  assert.match(source, /delete next\[PARK_RECOVERY_SYSTEM_FEATURE\]/);
  assert.match(source, /delete next\[PARK_RECOVERY_SYSTEM_SNAPSHOT_FEATURE\]/);
  assert.equal((source.match(/const promotingRecoverySystem = module\.moduleCode === "system"/g) ?? []).length, 2);
  assert.match(source, /startTime: dto\.startTime === undefined\s*\? promotingRecoverySystem \? null/);
  assert.match(source, /expireTime: dto\.expireTime === undefined\s*\? module\.moduleCode === "system" \? null/);
  assert.match(source, /startTime: promotingRecoverySystem \? null : entity\.startTime/);
  assert.match(source, /expireTime: module\.moduleCode === "system" \? null : entity\.expireTime/);
  assert.match(source, /await this\.reconcileSystemAuthorizationAfterWrite\(manager, scope, actorId, false\)[\s\S]*const reconciled = await repository\.findOne/);
  assert.equal((source.match(/withExplicitModuleSelection\(/g) ?? []).length, 4);
});

test("park activity resolution accepts one active source, suspends inactive rows, and rejects missing or ambiguous sources", async () => {
  const isParkActive = (SaaSModulesService.prototype as unknown as {
    isParkActive(manager: unknown, scope: unknown): Promise<boolean>;
  }).isParkActive;
  const scope = { tenantId: "tenant-a", parkId: "park-a" };
  const managerFor = (activeRows: unknown[], existing: boolean) => ({
    getRepository: () => ({ find: async () => activeRows, exists: async () => existing })
  });

  assert.equal(await isParkActive.call({} as SaaSModulesService, managerFor([{}], false), scope), true);
  assert.equal(await isParkActive.call({} as SaaSModulesService, managerFor([], true), scope), false);
  await assert.rejects(
    isParkActive.call({} as SaaSModulesService, managerFor([], false), scope),
    /Park not found/
  );
  await assert.rejects(
    isParkActive.call({} as SaaSModulesService, managerFor([{}, {}], false), scope),
    /Asset park source is ambiguous/
  );
});
