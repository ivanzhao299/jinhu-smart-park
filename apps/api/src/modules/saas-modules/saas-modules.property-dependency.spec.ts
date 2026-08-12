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
});

test("asset module assignment and enable paths provision the canonical asset scope in the same transaction", () => {
  assert.equal((source.match(/ensureAssetScopeProvisioned\(manager, scope, actorId\)/g) ?? []).length, 2);
  assert.match(source, /const saved = await repository\.save\(entity\);[\s\S]*ensureAssetScopeProvisioned/);
  assert.match(source, /if \(enabling && module\.moduleCode === "asset"\)/);
  assert.match(source, /if \(parkActive && module\.moduleCode === "asset"\)/);
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
  assert.match(source, /await resolveCanonicalAssetParkSource\(manager, scope\)/);
  assert.doesNotMatch(source, /getRepository\(ParkEntity\)/);
  assert.match(source, /requestedEnabled && module\.moduleCode === "asset" && !parkActive/);
  assert.match(source, /enabled: parkActive/);
  assert.match(source, /status: parkActive \? "enabled" : "disabled"/);
  assert.match(source, /function withParkStatusSuspension/);
  assert.match(source, /delete next\[PARK_STATUS_SUSPENDED_FEATURE\]/);
  assert.equal((source.match(/withParkStatusSuspension\(/g) ?? []).length, 4);
});

test("park activity resolution accepts one active source, suspends inactive rows, and rejects missing or ambiguous sources", async () => {
  const isParkActive = (SaaSModulesService.prototype as unknown as {
    isParkActive(manager: unknown, scope: unknown): Promise<boolean>;
  }).isParkActive;
  const scope = { tenantId: "tenant-a", parkId: "park-a" };
  const managerFor = (activeRows: unknown[], existingRows: unknown[]) => ({
    getRepository: () => ({ find: async () => activeRows }),
    query: async () => existingRows
  });

  assert.equal(await isParkActive.call({} as SaaSModulesService, managerFor([{}], []), scope), true);
  assert.equal(await isParkActive.call({} as SaaSModulesService, managerFor([], [{}]), scope), false);
  await assert.rejects(
    isParkActive.call({} as SaaSModulesService, managerFor([], []), scope),
    /Park not found/
  );
  await assert.rejects(
    isParkActive.call({} as SaaSModulesService, managerFor([{}, {}], []), scope),
    /Asset park source is ambiguous/
  );
});
