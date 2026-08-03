import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { collectAllCandidatePages, isRetainedCatalogValue } from "./plan-catalog-options.logic";

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

test("tenant creation waits until plan and module catalogs are ready", () => {
  const source = readFileSync(resolve(__dirname, "tenants/page.tsx"), "utf8");

  assert.match(source, /if \(!catalogReady\)/);
  assert.match(source, /disabled=\{!catalogReady\} onClick=\{openCreate\}/);
});
