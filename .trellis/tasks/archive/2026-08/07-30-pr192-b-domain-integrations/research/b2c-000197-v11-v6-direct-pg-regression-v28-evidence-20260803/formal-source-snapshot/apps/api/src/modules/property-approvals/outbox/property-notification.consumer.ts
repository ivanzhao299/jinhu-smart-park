import { Inject, Injectable } from "@nestjs/common";
import {
  PROPERTY_EVENT_RUNTIME_STORE,
  type CanonicalInboxEvent,
  type InboxConsumeInput,
  type PropertyEventRuntimeStore
} from "./property-event-runtime.contracts";
import {
  PROPERTY_NOTIFICATION_STORE,
  type NotificationProjectionInput,
  type PropertyNotificationStore
} from "./property-notification.contracts";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";
import { propertyApprovalError } from "../property-approval.error";

export interface PropertyNotificationConsumeInput {
  event: InboxConsumeInput["event"];
  scope: InboxConsumeInput["scope"];
  project: (event: Readonly<CanonicalInboxEvent>) => NotificationProjectionInput;
}

/**
 * Durable notification projection consumer. The mapper receives only the
 * canonical event locked from the outbox; projection and inbox receipt share
 * the EntityManager owned by consumeInbox.
 */
@Injectable()
export class PropertyNotificationProjectionConsumer {
  static readonly consumerName = "property-notification-projection";
  static readonly consumerVersion = 1;

  constructor(
    @Inject(PROPERTY_EVENT_RUNTIME_STORE)
    private readonly events: PropertyEventRuntimeStore,
    @Inject(PROPERTY_NOTIFICATION_STORE)
    private readonly notifications: PropertyNotificationStore
  ) {}

  consume(input: PropertyNotificationConsumeInput) {
    return this.events.consumeInbox({
      scope: input.scope,
      consumerName: PropertyNotificationProjectionConsumer.consumerName,
      consumerVersion: PropertyNotificationProjectionConsumer.consumerVersion,
      event: input.event
    }, async (manager, canonicalEvent) => {
      const projection = input.project(canonicalEvent);
      if (
        projection.scope.tenantId !== canonicalEvent.tenantId
        || projection.scope.parkId !== canonicalEvent.parkId
        || projection.eventId !== canonicalEvent.eventId
        || projection.eventPayloadHash !== canonicalEvent.payloadHash
      ) throw propertyApprovalError("event-checksum-mismatch");
      await this.notifications.project(manager, projection);
      const resultHash = hashCanonicalPropertyEvent({
        consumerName: PropertyNotificationProjectionConsumer.consumerName,
        eventId: canonicalEvent.eventId,
        notificationId: projection.id,
        notificationType: projection.notificationType,
        projectionVersion: projection.projectionVersion
      });
      return {
        result: { notificationId: projection.id },
        resultHash,
        resultReference: `property-notification:${projection.id}`
      };
    });
  }
}
