import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const authorizationQueries = [
  ["../homestay/homestay-approval.adapter.ts", 1],
  ["../housing/housing-approval.adapter.ts", 1],
  ["../property-tasks/property-task.access.ts", 1],
  ["../property-operations/property-foundation-approval.adapter.ts", 1],
  ["../property-approvals/property-approval.authorization.ts", 1],
  ["../property-approvals/outbox/property-runtime-authorization.adapter.ts", 1],
  ["../files/file-business-access.service.ts", 1],
  ["../workflow/workflow.service.ts", 1]
] as const;

test("raw RBAC authorization queries accept tenant roles and reject foreign park roles", () => {
  for (const [relativePath, expectedJoinCount] of authorizationQueries) {
    const source = readFileSync(resolve(__dirname, relativePath), "utf8");
    const roleJoins = source.match(
      /JOIN (?:public\.)?sys_role\s+\w+[\s\S]*?(?=(?:LEFT\s+)?JOIN (?:public\.)?rel_role_perm)/g
    ) ?? [];

    assert.equal(roleJoins.length, expectedJoinCount, `${relativePath} role join count changed`);
    for (const roleJoin of roleJoins) {
      assert.match(roleJoin, /role_scope\s*=\s*'tenant'/, relativePath);
      assert.match(roleJoin, /role\.park_id|r\.park_id/, relativePath);
      assert.match(roleJoin, /user_role\.park_id|ur\.park_id/, relativePath);
    }
  }
});
