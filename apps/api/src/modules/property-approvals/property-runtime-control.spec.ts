import assert from "node:assert/strict";
import test from "node:test";
import { TRACK_B_CONTRACT_SHA256 } from "@jinhu/shared";
import { DatabasePropertyRuntimeControlAdapter } from "./property-runtime-control";

const scope = { tenantId: "tenant-a", parkId: "park-a" };

function row(overrides: Record<string, unknown> = {}) {
  return {
    controlKey: "approval.enforce",
    controlKind: "enforce",
    target: "approval",
    adapterVersion: null,
    contractHash: TRACK_B_CONTRACT_SHA256,
    enabled: true,
    controlMode: "enforce",
    enabledBy: "10000000-0000-4000-8000-000000000001",
    enabledAt: new Date(),
    approvalReference: "CAB-1",
    version: 1,
    ...overrides
  };
}

function manager(responses: unknown[][]) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    calls,
    manager: {
      query: async (sql: string, parameters: unknown[]) => {
        calls.push({ sql, parameters });
        return responses.shift() ?? [];
      }
    }
  };
}

test("runtime control reads the exact tenant/park/key row under a shared lock", async () => {
  const context = manager([[row()]]);
  const adapter = new DatabasePropertyRuntimeControlAdapter();
  assert.deepEqual(await adapter.inspect(
    context.manager as never, scope, "approval.enforce"
  ), { effective: true, mode: "enforce", version: 1 });
  assert.deepEqual(context.calls[0]!.parameters, ["tenant-a", "park-a", "approval.enforce"]);
  assert.match(context.calls[0]!.sql, /FOR SHARE/);
  assert.match(context.calls[0]!.sql, /tenant_id=\$1 AND park_id=\$2 AND control_key=\$3/);
});

test("missing, disabled, shadow and enforce states have fail-closed priority semantics", async () => {
  const adapter = new DatabasePropertyRuntimeControlAdapter();
  assert.equal(await adapter.approvalMode(manager([[], []]).manager as never, scope), "disabled");
  assert.equal(await adapter.approvalMode(manager([[], [row({
    controlKey: "approval.shadow-compare", controlKind: "shadow_compare",
    controlMode: "shadow"
  })]]).manager as never, scope), "shadow");
  assert.equal(await adapter.approvalMode(manager([[row()]]).manager as never, scope), "enforce");
  const disabled = row({
    enabled: false, controlMode: "disabled", enabledBy: null, enabledAt: null,
    approvalReference: null
  });
  assert.deepEqual(await adapter.inspect(
    manager([[disabled]]).manager as never, scope, "approval.enforce"
  ), { effective: false, mode: "disabled", version: 1 });
});

test("all exact contract dimensions fail closed independently", async () => {
  const adapter = new DatabasePropertyRuntimeControlAdapter();
  const faults = [
    { controlKey: "event-notification.enforce" },
    { controlKind: "shadow_compare" },
    { target: "event_notification" },
    { adapterVersion: 1 },
    { contractHash: "f".repeat(64) },
    { version: 0 },
    { controlMode: "shadow" },
    { enabledBy: null },
    { enabledAt: null },
    { approvalReference: null }
  ];
  for (const fault of faults) {
    await assert.rejects(
      adapter.inspect(manager([[row(fault)]]).manager as never, scope, "approval.enforce"),
      /property-runtime-unavailable/
    );
  }
  await assert.rejects(
    adapter.inspect(manager([[row(), row()]]).manager as never, scope, "approval.enforce"),
    /property-runtime-unavailable/
  );
});

test("event notification enforces its own fixed target and cannot authorize approval", async () => {
  const adapter = new DatabasePropertyRuntimeControlAdapter();
  assert.deepEqual(await adapter.inspect(
    manager([[row({
      controlKey: "event-notification.enforce", target: "event_notification"
    })]]).manager as never,
    scope,
    "event-notification.enforce"
  ), { effective: true, mode: "enforce", version: 1 });
  await assert.rejects(
    adapter.requireApprovalEnforce(manager([[], []]).manager as never, scope),
    /property-runtime-unavailable/
  );
});
