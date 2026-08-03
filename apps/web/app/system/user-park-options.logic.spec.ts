import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { resolveUserParkLabel, resolveUserParkSelection } from "./user-park-options.logic";

test("user park labels show the business name without exposing the internal park id", () => {
  const label = resolveUserParkLabel({ parkName: " 金湖科创产业园 ", tenantName: "默认租户" });

  assert.equal(label, "金湖科创产业园");
  assert.doesNotMatch(label, /20000001/);
});

test("user park labels replace numeric-only historical names with the tenant default label", () => {
  assert.equal(resolveUserParkLabel({ parkName: "11", tenantName: "测试租户01" }), "测试租户01默认园区");
  assert.equal(resolveUserParkLabel({ parkName: "11 12", tenantName: "测试租户01" }), "测试租户01默认园区");
  assert.equal(resolveUserParkLabel({ parkName: "   ", tenantName: "测试租户01" }), "测试租户01默认园区");
  assert.equal(resolveUserParkLabel({ parkName: null, tenantName: "10 000" }), "默认园区");
});

test("user form waits when the selected tenant has no park options", () => {
  assert.equal(resolveUserParkSelection({ tenantId: "tenant-a", defaultParkId: null, parkIds: [] }), null);
});

test("user creation selects the tenant default park and exposes all tenant parks", () => {
  assert.deepEqual(
    resolveUserParkSelection({ tenantId: "tenant-a", defaultParkId: "park-2", parkIds: ["park-1", "park-2"] }),
    { parkId: "park-2", accessibleParkIds: ["park-2", "park-1"] }
  );
});

test("user editing preserves valid assignments and repairs inaccessible defaults", () => {
  assert.deepEqual(
    resolveUserParkSelection(
      { tenantId: "tenant-a", defaultParkId: "park-1", parkIds: ["park-1", "park-2"] },
      { tenantId: "tenant-a", parkId: "park-2", accessibleParkIds: ["park-1", "deleted-park"] }
    ),
    { parkId: "park-2", accessibleParkIds: ["park-2", "park-1"] }
  );
});

test("switching tenants does not leak the previous tenant park assignments", () => {
  assert.deepEqual(
    resolveUserParkSelection(
      { tenantId: "tenant-b", defaultParkId: "park-b", parkIds: ["park-b"] },
      { tenantId: "tenant-a", parkId: "park-a", accessibleParkIds: ["park-a"] }
    ),
    { parkId: "park-b", accessibleParkIds: ["park-b"] }
  );
});

test("returning to an edited user's tenant restores the persisted park assignments", () => {
  const source = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");

  assert.match(source, /editingUser\?\.tenantId === nextTenantId \? editingUser : null/);
});

test("default and accessible park controls share the safe user-facing label resolver", () => {
  const source = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");
  const labelUses = source.match(/resolveUserParkLabel\(\{ parkName: park\.parkName/g) ?? [];

  assert.equal(labelUses.length, 2);
  assert.doesNotMatch(source, /park\.parkName\} \/ \{park\.parkId/);
});
