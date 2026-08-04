import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import type {
  CanonicalInboxEvent,
  PropertyEventRuntimeStore
} from "./property-event-runtime.contracts";
import type {
  NotificationProjectionInput,
  PropertyNotificationStore
} from "./property-notification.contracts";
import { PropertyNotificationProjectionConsumer } from "./property-notification.consumer";

describe("PropertyNotificationProjectionConsumer", () => {
  it("projects with the consumeInbox EntityManager and DB canonical event", async () => {
    const manager = { query: async () => [] } as unknown as EntityManager;
    const canonical: CanonicalInboxEvent = {
      eventId: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant",
      parkId: "park",
      eventType: "gate.notification",
      eventVersion: 1,
      orderingKey: "gate:notification",
      sequence: "1",
      eventOrdinal: 0,
      payload: { canonical: true },
      payloadHash: "a".repeat(64)
    };
    let projectedManager: EntityManager | undefined;
    let projected: NotificationProjectionInput | undefined;
    const events = {
      consumeInbox: async (
        _input: unknown,
        handler: (
          value: EntityManager,
          event: Readonly<CanonicalInboxEvent>
        ) => Promise<unknown>
      ) => handler(manager, canonical)
    } as unknown as PropertyEventRuntimeStore;
    const notifications = {
      project: async (value: EntityManager, input: NotificationProjectionInput) => {
        projectedManager = value;
        projected = input;
      }
    } as unknown as PropertyNotificationStore;
    const consumer = new PropertyNotificationProjectionConsumer(events, notifications);
    await consumer.consume({
      scope: { tenantId: "tenant", parkId: "park" },
      event: canonical,
      project: (event) => ({
        id: "22222222-2222-4222-8222-222222222222",
        scope: { tenantId: event.tenantId, parkId: event.parkId },
        eventId: event.eventId,
        eventPayloadHash: event.payloadHash,
        notificationType: "approval-infra-exhausted",
        projectionVersion: 1,
        title: "title",
        summary: "summary",
        severity: "critical",
        sourceType: "approval",
        sourceId: event.eventId,
        routeId: event.eventId,
        retentionUntil: new Date("2027-01-01T00:00:00Z"),
        recipients: []
      })
    });
    assert.equal(projectedManager, manager);
    assert.equal(projected?.eventId, canonical.eventId);
    assert.deepEqual(canonical.payload, { canonical: true });
  });
});
