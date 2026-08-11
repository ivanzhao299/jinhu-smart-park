import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  activeModuleSelection,
  changedPlanAuthorization,
  changedPlanAuthorizationIfTouched,
  collectAllCandidatePages,
  findPlanAuthorization,
  isRetainedCatalogValue,
  moduleCodesForSelectedPlan,
  provisionablePlans
} from "./plan-catalog-options.logic";

test("tenant settings remove disabled or deleted modules from the submitted selection", () => {
  assert.deepEqual(
    activeModuleSelection(
      ["system", "disabled-module", "asset", "deleted-module", "asset"],
      ["asset", "system"]
    ),
    ["asset", "system"]
  );

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /modules\?page=\$\{modulePage\}&page_size=\$\{pageSize\}&status=enabled/);
  assert.match(source, /activeModuleSelection\(settingsModuleCodes/);
});

test("tenant quota inputs select their value on focus", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /name="maxUsers".*onFocus=\{\(event\) => event\.target\.select\(\)\}/);
  assert.match(source, /name="maxParks".*onFocus=\{\(event\) => event\.target\.select\(\)\}/);
});

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

  assert.deepEqual(changedPlanAuthorization(
    "BASIC",
    ["ASSET", "SYSTEM"],
    "PRO",
    ["SYSTEM", "ASSET"]
  ), { planCode: "PRO", moduleCodes: ["ASSET", "SYSTEM"] });
});

test("unrelated settings saves preserve authorization even when every historical module is inactive", () => {
  assert.deepEqual(changedPlanAuthorizationIfTouched(
    false,
    "DISABLED_PLAN",
    ["deleted-module"],
    "DISABLED_PLAN",
    []
  ), {});

  assert.deepEqual(changedPlanAuthorizationIfTouched(
    true,
    "DISABLED_PLAN",
    ["deleted-module"],
    "BASIC",
    ["asset", "system"]
  ), { planCode: "BASIC", moduleCodes: ["asset", "system"] });

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /settingsAuthorizationTouched && activeModuleCodes\.length === 0/);
  assert.match(source, /调整授权时请至少启用一个当前有效模块/);
});

test("module-only tenants can retain an unbound plan while changing unrelated settings", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /settings\.tenant\.planCode === null/);
  assert.match(source, /未绑定套餐（保留当前模块）/);
  assert.match(source, /required=\{settingsModuleCodes\.length === 0\}/);
});

test("a successful settings save is not reported as failed when list refresh fails", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /登录与授权配置已保存，但列表刷新失败/);
  assert.match(source, /setCatalogReady\(true\)/);
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

test("tenant creation excludes enabled catalog plans without modules", () => {
  assert.deepEqual(
    provisionablePlans([
      { planCode: "EMPTY", moduleCodes: [] },
      { planCode: "BLANK", moduleCodes: [" "] },
      { planCode: "BASIC", moduleCodes: ["system", "asset"] }
    ]).map((plan) => plan.planCode),
    ["BASIC"]
  );

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");
  assert.match(source, /provisionablePlans\(planItems\)/);
});

test("tenant drawers announce submission errors and clear stale errors on edit", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /onChange=\{\(\) => setCreateError\(""\)\}/);
  assert.match(source, /onChange=\{\(\) => setSettingsError\(""\)\}/);
  assert.match(source, /className="status-pill" role="alert">\{createError\}/);
  assert.match(source, /className="status-pill" role="alert">\{settingsError\}/);
});

test("changing the plan in login settings replaces the module selection from that plan", () => {
  const plans = [
    { planCode: "BASIC", moduleCodes: ["system", "asset"] },
    { planCode: "PRO", moduleCodes: ["system", "asset", "safety"] }
  ];
  assert.deepEqual(moduleCodesForSelectedPlan(plans, "PRO", "DISABLED_PLAN", ["system"]), ["system", "asset", "safety"]);
  assert.deepEqual(moduleCodesForSelectedPlan(plans, "DISABLED_PLAN", "DISABLED_PLAN", ["system", "workorder"]), ["system", "workorder"]);
  assert.deepEqual(moduleCodesForSelectedPlan(plans, "", null, ["system", "workorder"]), ["system", "workorder"]);
  assert.equal(moduleCodesForSelectedPlan(plans, "UNKNOWN", "DISABLED_PLAN", ["system"]), null);

  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /function selectSettingsPlan/);
  assert.match(source, /moduleCodesForSelectedPlan/);
  assert.match(source, /settingsPlanCode \|\| null/);
  assert.match(source, /settings\?\.enabledModuleCodes \?\? \[\]/);
});
