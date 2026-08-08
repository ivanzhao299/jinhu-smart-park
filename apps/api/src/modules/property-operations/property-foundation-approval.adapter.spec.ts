import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EntityManager } from "typeorm";
import { PropertyFoundationApprovalAdapter } from "./property-foundation-approval.adapter";

const scope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  parkId: "22222222-2222-4222-8222-222222222222"
};

function verifier(query: (sql: string) => unknown) {
  const adapter = new PropertyFoundationApprovalAdapter(
    {} as never, {} as never, {} as never, {} as never, {} as never
  );
  return {
    verify: (adapter as unknown as { verify(
      actionId: "property.mode-transition.request" | "property.occupancy.force-release.request",
      input: Record<string, unknown>
    ): Promise<unknown> }).verify.bind(adapter),
    manager: { query: async (sql: string) => query(sql) } as unknown as EntityManager
  };
}

function input(manager: EntityManager) {
  return {
    manager,
    scope,
    executionIdempotencyKey: "execution-key",
    effectLineKey: "effect-line",
    expectedCardinality: 2,
    owningTable: "owning-table",
    owningUniqueName: "owning-unique"
  };
}

describe("property foundation approval effect proof", () => {
  test("mode proof requires the resulting operation-config version and mode", async () => {
    const fixture = verifier((sql) => {
      assert.match(sql, /JOIN biz_property_operation_config aggregate/u);
      assert.match(sql, /aggregate\.version=audit\.source_expected_version\+1/u);
      assert.match(sql, /aggregate\.operating_mode=audit\.to_mode/u);
      return [{ id: "33333333-3333-4333-8333-333333333333" }];
    });
    const proof = await fixture.verify("property.mode-transition.request", input(fixture.manager));
    assert.equal((proof as { observedCardinality: number }).observedCardinality, 2);
  });

  test("occupancy proof requires the resulting aggregate state and source identity", async () => {
    const fixture = verifier((sql) => {
      assert.match(sql, /JOIN biz_property_occupancy aggregate/u);
      assert.match(sql, /aggregate\.version=audit\.resulting_version/u);
      assert.match(sql, /aggregate\.status=audit\.to_status/u);
      assert.match(sql, /aggregate\.source_id=audit\.source_id/u);
      return [{ id: "44444444-4444-4444-8444-444444444444" }];
    });
    const proof = await fixture.verify(
      "property.occupancy.force-release.request",
      input(fixture.manager)
    );
    assert.equal((proof as { observedCardinality: number }).observedCardinality, 2);
  });

  test("fails closed when either the audit or matching aggregate is absent", async () => {
    for (const actionId of [
      "property.mode-transition.request",
      "property.occupancy.force-release.request"
    ] as const) {
      const fixture = verifier(() => []);
      await assert.rejects(
        fixture.verify(actionId, input(fixture.manager)),
        /property-foundation-effect-proof-mismatch/u
      );
    }
  });
});
