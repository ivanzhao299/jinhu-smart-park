import assert from "node:assert/strict";
import test from "node:test";
import { HrService } from "./hr.service";

test("HR directory options expose only enabled park-scoped organization and account projections", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const orgs = {
    find: async (options: Record<string, unknown>) => {
      calls.push(options);
      return [{ id: "org-1", orgCode: "HR", orgName: "人力资源部", status: "enabled" }];
    }
  };
  const users = {
    find: async (options: Record<string, unknown>) => {
      calls.push(options);
      return [{ id: "user-1", username: "hr-owner", displayName: "HR Owner", status: "enabled" }];
    }
  };
  const service = { orgs, users };
  const scope = { tenantId: "tenant-1", parkId: "park-1" };

  const result = await HrService.prototype.directoryOptions.call(service as never, scope);

  assert.deepEqual(result, {
    orgs: [{ id: "org-1", orgCode: "HR", orgName: "人力资源部", status: "enabled" }],
    users: [{ id: "user-1", username: "hr-owner", displayName: "HR Owner", status: "enabled" }]
  });
  assert.deepEqual(calls[0]?.where, { ...scope, isDeleted: false, status: "enabled" });
  assert.deepEqual(calls[0]?.select, { id: true, orgCode: true, orgName: true, status: true });
  assert.deepEqual(calls[1]?.where, { ...scope, isDeleted: false, isEnabled: true, status: "enabled" });
  assert.deepEqual(calls[1]?.select, { id: true, username: true, displayName: true, status: true });
});
