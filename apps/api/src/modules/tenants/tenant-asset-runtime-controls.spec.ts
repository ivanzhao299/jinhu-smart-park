import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureTenantAssetRuntimeControls,
  TENANT_ASSET_RUNTIME_CONTROLS
} from "./tenant-asset-runtime-controls";

const readyState = {
  controlCount: "12",
  validControlCount: "12",
  auditCount: "24",
  validAuditCount: "24"
};

test("tenant asset runtime control manifest remains the signed twelve-control set", () => {
  assert.equal(TENANT_ASSET_RUNTIME_CONTROLS.length, 12);
  assert.deepEqual(TENANT_ASSET_RUNTIME_CONTROLS.map((item) => item.controlKey), [
    "identity.legacy-read-v1",
    "identity.legacy-write-v1",
    "identity.change-capture",
    "identity.mutation-replay",
    "identity.shadow-compare",
    "identity.enforce",
    "approval.shadow-compare",
    "approval.enforce",
    "event-notification.shadow-compare",
    "event-notification.enforce",
    "task.shadow-compare",
    "task.enforce"
  ]);
});

test("tenant asset runtime controls preserve a fully audited canonical scope", async () => {
  const queries: string[] = [];
  await ensureTenantAssetRuntimeControls(
    {
      query: async (sql: string) => {
        queries.push(sql);
        return [readyState];
      }
    } as never,
    { tenantId: "tenant-a", parkId: "park-a" }
  );
  assert.equal(queries.length, 1);
});

test("tenant asset runtime controls initialize only a wholly missing scope through both audited corrections", async () => {
  const queries: string[] = [];
  let stateReads = 0;
  await ensureTenantAssetRuntimeControls(
    {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('AS "validControlCount"')) {
          stateReads += 1;
          return [stateReads === 1
            ? { controlCount: "0", validControlCount: "0", auditCount: "0", validAuditCount: "0" }
            : readyState];
        }
        if (sql.includes('AS "changedCount"')) {
          return [{ changedCount: "12", auditCount: "12" }];
        }
        return [];
      }
    } as never,
    { tenantId: "tenant-a", parkId: "park-a" }
  );

  assert.equal(queries.length, 5);
  assert.match(queries[1] ?? "", /INSERT INTO public\.sys_property_runtime_control/);
  assert.match(queries[2] ?? "", /sys_property_runtime_control_contract_audit/);
  assert.match(queries[3] ?? "", /sys_property_runtime_control_contract_audit/);
});

test("tenant asset runtime controls reject partial state without writing", async () => {
  let calls = 0;
  await assert.rejects(
    ensureTenantAssetRuntimeControls(
      {
        query: async () => {
          calls += 1;
          return [{ controlCount: "1", validControlCount: "0", auditCount: "0", validAuditCount: "0" }];
        }
      } as never,
      { tenantId: "tenant-a", parkId: "park-a" }
    ),
    /partial or inconsistent/
  );
  assert.equal(calls, 1);
});
