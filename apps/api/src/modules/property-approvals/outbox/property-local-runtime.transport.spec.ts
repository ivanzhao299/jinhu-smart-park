import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationProjectionInput } from "./property-notification.contracts";
import type { PropertyApprovalRepository } from "../property-approval.repository";
import type { PropertyNotificationProjectionConsumer } from "./property-notification.consumer";
import {
  PropertyInAppNotificationChannel,
  PropertyLocalEventPublisher,
  PropertyLocalRuntimeComposition
} from "./property-local-runtime.transport";
import {
  PropertyEventPublisherRegistry,
  PropertyNotificationChannelRegistry
} from "../property-approval.registries";

describe("Property local runtime transports", () => {
  it("registers production transports and projects approval execution notifications", async () => {
    let projected: NotificationProjectionInput | undefined;
    const consumer = {
      consume: async (input: {
        project: (event: never) => NotificationProjectionInput;
        event: never;
      }) => { projected = input.project(input.event); }
    };
    const publisher = new PropertyLocalEventPublisher(
      { findNotificationRecipients: async () => ({
        requesterId: "11111111-1111-4111-8111-111111111111",
        submitterId: "22222222-2222-4222-8222-222222222222"
      }) } as unknown as PropertyApprovalRepository,
      consumer as unknown as PropertyNotificationProjectionConsumer
    );
    const publishers = new PropertyEventPublisherRegistry();
    const channels = new PropertyNotificationChannelRegistry();
    const inApp = new PropertyInAppNotificationChannel();
    new PropertyLocalRuntimeComposition(publishers, channels, publisher, inApp).onModuleInit();
    await publishers.publish({
      eventId: "33333333-3333-4333-8333-333333333333",
      tenantId: "tenant", parkId: "park", eventType: "housing.lease.executed",
      eventVersion: 1, orderingKey: "housing", sequence: "1", eventOrdinal: 0,
      payload: { approvalRequestId: "44444444-4444-4444-8444-444444444444" },
      payloadHash: "a".repeat(64), attemptCount: 1, claimEpoch: "1",
      claimToken: "55555555-5555-4555-8555-555555555555"
    });
    assert.equal(projected?.notificationType, "housing-approval-executed");
    assert.equal(projected?.recipients.length, 2);
    projected = undefined;
    await publishers.publish({
      eventId: "66666666-6666-4666-8666-666666666666",
      tenantId: "tenant", parkId: "park", eventType: "property.unrouted",
      eventVersion: 1, orderingKey: "property", sequence: "2", eventOrdinal: 0,
      payload: {}, payloadHash: "b".repeat(64), attemptCount: 1, claimEpoch: "1",
      claimToken: "77777777-7777-4777-8777-777777777777"
    });
    assert.equal(projected, undefined);
    await channels.deliver({
      id: "1", scope: { tenantId: "tenant", parkId: "park" }, notificationId: "2",
      recipientUserId: "3", channel: "in_app", version: 1, attemptCount: 1,
      maxAttempts: 3, claimEpoch: "1", claimToken: "4"
    });
  });

  it("projects identity assignment notifications to the assigned verifier", async () => {
    const projected: NotificationProjectionInput[] = [];
    let approvalLookupCount = 0;
    const publisher = new PropertyLocalEventPublisher(
      { findNotificationRecipients: async () => {
        approvalLookupCount += 1;
        return null;
      } } as unknown as PropertyApprovalRepository,
      { consume: async (input: {
        project: (event: never) => NotificationProjectionInput;
        event: never;
      }) => { projected.push(input.project(input.event)); } } as unknown as PropertyNotificationProjectionConsumer
    );
    const event = {
      eventId: "88888888-8888-4888-8888-888888888888",
      tenantId: "tenant", parkId: "park", eventType: "party.identity.claimed",
      eventVersion: 1, orderingKey: "identity", sequence: "1", eventOrdinal: 0,
      payload: {
        submissionId: "99999999-9999-4999-8999-999999999999",
        response: { assignedVerifierId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
      },
      payloadHash: "c".repeat(64), attemptCount: 1, claimEpoch: "1",
      claimToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    };
    await publisher.publish(event);
    await publisher.publish({ ...event, eventType: "party.identity.reassigned" });
    assert.equal(approvalLookupCount, 0);
    assert.equal(projected.length, 2);
    assert.equal(projected[0]?.notificationType, "identity-verification-assigned");
    assert.equal(projected[0]?.recipients[0]?.userId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(projected[0]?.id, projected[1]?.id);

    await publisher.publish({
      ...event,
      eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      payload: { submissionId: event.payload.submissionId, response: {} }
    });
    assert.equal(projected.length, 2);
  });
});
