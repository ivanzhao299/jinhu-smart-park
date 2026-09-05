import assert from "node:assert/strict";
import test from "node:test";
import { SmartParkBusinessScopeAdapter } from "./smart-park-business-scope.adapter";

const input = {
  tenantId: "alpha", scopeId: "10000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000001"
};
const row = { tenantId: input.tenantId, scopeId: input.scopeId, parkId: "park-a1" };

test("park adapter returns only the verified tuple and binds all input parameters", async () => {
  const calls: unknown[][] = [];
  const adapter = new SmartParkBusinessScopeAdapter({ query: async (...args: unknown[]) => {
    calls.push(args);
    return [{ ...row, ignored: "not-for-output" }];
  } } as never);
  assert.deepEqual(await adapter.resolveParkScope(input), { ...row, kind: "park" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.[1], [input.tenantId, input.scopeId, input.userId]);
  assert.match(String(calls[0]?.[0]), /^SELECT /u);
  assert.match(String(calls[0]?.[0]), /scope\.scope_kind = 'park'/u);
  assert.match(String(calls[0]?.[0]), /park\.id = binding\.park_row_id/u);
});

test("invalid identities are rejected before querying", async () => {
  const adapter = new SmartParkBusinessScopeAdapter({ query: async () => assert.fail("unexpected query") } as never);
  for (const value of [null, {}, { ...input, tenantId: " alpha" }, { ...input, tenantId: "a".repeat(65) },
    { ...input, scopeId: "park-a1" }, { ...input, userId: "" }]) {
    assert.equal(await adapter.resolveParkScope(value as never), null);
  }
});

test("missing ambiguous foreign or malformed database identities are never accepted", async () => {
  for (const result of [null, {}, [], [row, row], [null], [[row]], [{ ...row, tenantId: "beta" }],
    [{ ...row, scopeId: input.userId }], [{ ...row, parkId: "" }], [{ ...row, parkId: " park-a1" }],
    [{ ...row, parkId: "a".repeat(65) }]]) {
    const adapter = new SmartParkBusinessScopeAdapter({ query: async () => result } as never);
    assert.equal(await adapter.resolveParkScope(input), null);
  }
});

test("query failure remains a safe denial", async () => {
  const adapter = new SmartParkBusinessScopeAdapter({ query: async () => { throw new Error("synthetic database failure"); } } as never);
  assert.equal(await adapter.resolveParkScope(input), null);
});
