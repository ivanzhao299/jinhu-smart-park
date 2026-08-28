import assert from "node:assert/strict";
import test from "node:test";
import { formatParkRoleSummary } from "../../lib/park-role-summary";

test("park role summaries are bounded for desktop and 390px mobile surfaces", () => {
  assert.equal(formatParkRoleSummary(undefined, "无角色"), null);
  assert.equal(formatParkRoleSummary({ role_names: [], role_count: 0, has_business_role: false }, "无角色"), "无角色");
  assert.equal(formatParkRoleSummary({ role_names: ["运营"], role_count: 1, has_business_role: true }, "无角色"), "运营");
  assert.equal(
    formatParkRoleSummary({ role_names: ["园区运营", "工程管理", "安全巡检"], role_count: 3, has_business_role: true }, "无角色"),
    "园区运营、工程管理等 3 个角色"
  );
});
