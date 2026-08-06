import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import { PropertyApprovalRuntimeOutboxAdapter } from "./property-approval-outbox.adapter";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";

describe("PropertyApprovalRuntimeOutboxAdapter", () => {
  it("uses the caller manager, a locked counter and stable payload proof", async () => {
    const statements: string[] = [];
    const payload = { b: 2, a: 1 };
    const manager = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT event_id,event_type")) return [];
        if (sql.includes("SELECT next_sequence")) return [{ next_sequence: "4" }];
        if (sql.includes("UPDATE biz_property_event_sequence")) return [[{ next_sequence: "5" }], 1];
        return [];
      }
    } as unknown as EntityManager;
    await new PropertyApprovalRuntimeOutboxAdapter().append(manager, {
      scope: { tenantId: "tenant", parkId: "park" },
      approvalRequestId: "11111111-1111-4111-8111-111111111111",
      executionIdempotencyKey: "execution-1",
      events: [{
        eventId: "22222222-2222-4222-8222-222222222222",
        eventType: "gate.executed",
        eventVersion: 1,
        aggregateType: "gate",
        aggregateId: "33333333-3333-4333-8333-333333333333",
        aggregateVersion: 2,
        orderingKey: "gate:one",
        eventOrdinal: 0,
        payload,
        payloadHash: hashCanonicalPropertyEvent(payload)
      }]
    });
    assert.ok(statements.some((sql) => sql.includes("pg_advisory_xact_lock")));
    assert.ok(statements.some((sql) => sql.includes("FOR UPDATE")));
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO biz_property_outbox")));
    assert.ok(!statements.some((sql) => /\bBEGIN\b/.test(sql)));
  });
});
