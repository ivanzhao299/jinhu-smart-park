import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { changedPlanAuthorization, collectAllCandidatePages, findPlanAuthorization, isRetainedCatalogValue } from "./plan-catalog-options.logic";

test("tenant plan selector loads every catalog page", async () => {
  const requestedPages: number[] = [];
  const items = await collectAllCandidatePages(async (page, pageSize) => {
    requestedPages.push(page);
    assert.equal(pageSize, 100);
    return page === 1
      ? { items: [{ planCode: "BASIC" }, { planCode: "PRO" }], total: 3 }
      : { items: [{ planCode: "ENTERPRISE" }], total: 3 };
  }, (item) => item.planCode);

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(items.map((item) => item.planCode), ["BASIC", "PRO", "ENTERPRISE"]);
});

test("tenant plan selector deduplicates unstable page overlap and stops on an empty page", async () => {
  const items = await collectAllCandidatePages(async (page) => page === 1
    ? { items: [{ planCode: "BASIC" }, { planCode: "PRO" }], total: 4 }
    : page === 2
      ? { items: [{ planCode: "PRO" }], total: 4 }
      : { items: [], total: 4 }, (item) => item.planCode, 2);

  assert.deepEqual(items.map((item) => item.planCode), ["BASIC", "PRO"]);
});

test("tenant settings retain a current plan that is absent from the enabled catalog", () => {
  assert.equal(isRetainedCatalogValue(["BASIC", "PRO"], "DISABLED_PLAN"), true);
  assert.equal(isRetainedCatalogValue(["BASIC", "PRO"], "PRO"), false);
  assert.equal(isRetainedCatalogValue(["BASIC", "PRO"], null), false);

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /当前绑定，已停用/);
  assert.doesNotMatch(source, /value=\{settings\.tenant\.planCode\} disabled/);
});

test("unchanged tenant authorization is omitted instead of re-resolving a historical plan", () => {
  assert.deepEqual(changedPlanAuthorization(
    "DISABLED_PLAN",
    ["WORKORDER", "ASSET"],
    "DISABLED_PLAN",
    ["ASSET", "WORKORDER", "ASSET"]
  ), {});

  assert.deepEqual(changedPlanAuthorization(
    "DISABLED_PLAN",
    ["ASSET"],
    "DISABLED_PLAN",
    ["ASSET", "WORKORDER"]
  ), { moduleCodes: ["ASSET", "WORKORDER"] });

  assert.deepEqual(changedPlanAuthorization(
    "DISABLED_PLAN",
    ["ASSET"],
    "PRO",
    ["ASSET", "WORKORDER"]
  ), { planCode: "PRO", moduleCodes: ["ASSET", "WORKORDER"] });
});

test("tenant creation waits until plan and module catalogs are ready", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /if \(!catalogReady\)/);
  assert.match(source, /disabled=\{!catalogReady\} onClick=\{openCreate\}/);
});

test("tenant creation selects a concrete plan with its modules and quotas", () => {
  const plans = [
    { planCode: "BASIC", moduleCodes: ["system", "asset"], maxUsers: 20, maxParks: 1 },
    { planCode: "PRO", moduleCodes: ["system", "asset", "safety"], maxUsers: 100, maxParks: 5 }
  ];

  assert.deepEqual(findPlanAuthorization(plans, "PRO"), plans[1]);
  assert.equal(findPlanAuthorization(plans, "MISSING"), null);

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /无可用套餐，无法开通租户/);
  assert.match(source, /planCode: createPlanCode/);
  assert.match(source, /selectCreatePlan/);
  assert.doesNotMatch(source, /<option value="">未绑定套餐<\/option>/);
});

test("changing the plan in login settings replaces the module selection from that plan", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /function selectSettingsPlan/);
  assert.match(source, /setSettingsModuleCodes\(plan\.moduleCodes\)/);
  assert.match(source, /settingsPlanCode \|\| null/);
});
