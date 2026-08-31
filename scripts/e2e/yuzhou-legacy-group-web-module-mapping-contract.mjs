import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyGroupWebModuleMappingError, verifyLegacyGroupWebModuleMapping } from "../hr-cutover/legacy-group-web-module-mapping-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
const clone = value => structuredClone(value);
const rejects = (code, callback) => assert.throws(callback, error => error instanceof LegacyGroupWebModuleMappingError && error.code === code);

test("all 231 deployed Group Web modules have an explicit target owner and route", () => {
  assert.deepEqual(verifyLegacyGroupWebModuleMapping(manifest), {
    ok: true,
    items: 231,
    levels: { level1: 12, level2: 100, level3: 119 },
    domains: 12,
    navigable: 186,
    tableBindings: 112,
    viewBindings: 112,
    productionImport: "HOLD"
  });
});

test("the mapping preserves parent topology even where legacy level labels are inconsistent", () => {
  const orphan = clone(manifest);
  orphan.items.find(item => item.level !== 1).parentId = 999999;
  rejects("GROUP_WEB_MAPPING_PARENT_INVALID", () => verifyLegacyGroupWebModuleMapping(orphan));
  const duplicate = clone(manifest);
  duplicate.items[1].legacyId = duplicate.items[0].legacyId;
  rejects("GROUP_WEB_MAPPING_ITEM_INVALID", () => verifyLegacyGroupWebModuleMapping(duplicate));
});

test("module, domain, route and source-table coverage cannot silently shrink", () => {
  const removed = clone(manifest);
  removed.items.pop();
  rejects("GROUP_WEB_MAPPING_ITEM_COUNT_INVALID", () => verifyLegacyGroupWebModuleMapping(removed));
  const route = clone(manifest);
  route.items[0].targetRoutes = [];
  rejects("GROUP_WEB_MAPPING_TARGET_INVALID", () => verifyLegacyGroupWebModuleMapping(route));
  const source = clone(manifest);
  source.items.find(item => item.legacyTable).legacyTable = null;
  rejects("GROUP_WEB_MAPPING_BOUNDARY_INVALID", () => verifyLegacyGroupWebModuleMapping(source));
});

test("existing system-management and contract-reminder capabilities use exact Smart Park routes", () => {
  const routes = new Map(manifest.items.map(item => [item.legacyId, item.targetRoutes]));
  assert.deepEqual(routes.get(258), ["/system/dicts"]);
  assert.deepEqual(routes.get(173), ["/system/dicts"]);
  assert.deepEqual(routes.get(169), ["/system/users"]);
  assert.deepEqual(routes.get(170), ["/system/users"]);
  assert.deepEqual(routes.get(171), ["/system/roles"]);
  assert.deepEqual(routes.get(290), ["/system/permissions"]);
  assert.deepEqual(routes.get(292), ["/system/roles"]);
  assert.deepEqual(routes.get(293), ["/system/data-scopes"]);
  assert.deepEqual(routes.get(175), ["/system/audit"]);
  assert.deepEqual(routes.get(177), ["/system/audit/login-logs"]);
  assert.deepEqual(routes.get(176), ["/system/audit/op-logs"]);
  assert.deepEqual(routes.get(174), ["/admin"]);
  assert.deepEqual(routes.get(181), ["/hr/contracts"]);
  assert.deepEqual(routes.get(166), ["/hr/decision-center"]);
  assert.deepEqual(routes.get(167), ["/hr/decision-center"]);
  assert.deepEqual(routes.get(228), ["/hr/decision-center"]);
  assert.deepEqual(routes.get(229), ["/hr/decision-center"]);
  assert.deepEqual(routes.get(230), ["/hr/decision-center"]);
  assert.deepEqual(routes.get(246), ["/hr/decision-center"]);
});

test("mapping evidence rejects workstation data, credentials and production import release", () => {
  const path = clone(manifest);
  path.items[0].legacyUrl = "/Users/example/evidence";
  rejects("GROUP_WEB_MAPPING_SENSITIVE_CONTENT", () => verifyLegacyGroupWebModuleMapping(path));
  const released = clone(manifest);
  released.productionImport = "GO";
  rejects("GROUP_WEB_MAPPING_PRODUCTION_IMPORT_NOT_HELD", () => verifyLegacyGroupWebModuleMapping(released));
});
