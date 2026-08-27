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

test("mapping evidence rejects workstation data, credentials and production import release", () => {
  const path = clone(manifest);
  path.items[0].legacyUrl = "/Users/example/evidence";
  rejects("GROUP_WEB_MAPPING_SENSITIVE_CONTENT", () => verifyLegacyGroupWebModuleMapping(path));
  const released = clone(manifest);
  released.productionImport = "GO";
  rejects("GROUP_WEB_MAPPING_PRODUCTION_IMPORT_NOT_HELD", () => verifyLegacyGroupWebModuleMapping(released));
});
