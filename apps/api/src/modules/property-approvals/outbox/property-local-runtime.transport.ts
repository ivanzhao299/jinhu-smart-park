import { createHash } from "node:crypto";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PropertyApprovalRepository } from "../property-approval.repository";
import {
  PropertyEventPublisherRegistry,
  PropertyNotificationChannelRegistry
} from "../property-approval.registries";
import type {
  PropertyEventEnvelope,
  PropertyEventPublisherPort
} from "./property-event-runtime.contracts";
import type {
  ClaimedNotificationDelivery,
  PropertyNotificationChannelPort
} from "./property-notification.contracts";
import { PropertyNotificationProjectionConsumer } from "./property-notification.consumer";

function stableUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class PropertyInAppNotificationChannel implements PropertyNotificationChannelPort {
  async deliver(_delivery: Readonly<ClaimedNotificationDelivery>): Promise<void> {
    // Projection already persists the in-app notification. Completing this
    // delivery is the durable acknowledgement for the local channel.
  }
}

@Injectable()
export class PropertyLocalEventPublisher implements PropertyEventPublisherPort {
  constructor(
    private readonly approvals: PropertyApprovalRepository,
    private readonly consumer: PropertyNotificationProjectionConsumer
  ) {}

  async publish(event: Readonly<PropertyEventEnvelope>): Promise<void> {
    const canonicalEvent = {
      eventId: event.eventId,
      tenantId: event.tenantId,
      parkId: event.parkId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      orderingKey: event.orderingKey,
      sequence: event.sequence,
      eventOrdinal: event.eventOrdinal,
      payload: event.payload,
      payloadHash: event.payloadHash,
      ...(event.replayDlqId ? { replayDlqId: event.replayDlqId } : {}),
      ...(event.replayDlqVersion == null ? {} : { replayDlqVersion: event.replayDlqVersion })
    };
    if (["party.identity.claimed", "party.identity.reassigned"].includes(event.eventType)) {
      const submissionId = String(event.payload.submissionId ?? "");
      const response = event.payload.response;
      const assignedVerifierId = response && typeof response === "object"
        ? String((response as Record<string, unknown>).assignedVerifierId ?? "")
        : "";
      if (!UUID.test(submissionId) || !UUID.test(assignedVerifierId)) return;
      await this.consumer.consume({
        scope: { tenantId: event.tenantId, parkId: event.parkId },
        event: canonicalEvent,
        project: (canonical) => ({
          id: stableUuid(`notification:${canonical.eventId}`),
          scope: { tenantId: canonical.tenantId, parkId: canonical.parkId },
          eventId: canonical.eventId,
          eventPayloadHash: canonical.payloadHash,
          notificationType: "identity-verification-assigned",
          projectionVersion: 1,
          title: "身份核验任务已分配",
          summary: "新的身份核验任务已分配给你，请打开详情及时处理。",
          severity: "info",
          sourceType: "identity-submission",
          sourceId: submissionId,
          routeId: submissionId,
          retentionUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1_000),
          recipients: [{
            id: stableUuid(`notification-recipient:${canonical.eventId}:${assignedVerifierId}`),
            userId: assignedVerifierId,
            relationVersion: 1,
            bundleSnapshot: { submissionId, eventType: canonical.eventType },
            channels: [{
              id: stableUuid(`notification-delivery:${canonical.eventId}:${assignedVerifierId}:in_app`),
              channel: "in_app" as const
            }]
          }]
        })
      });
      return;
    }
    const approvalRequestId = String(event.payload.approvalRequestId ?? "");
    if (!UUID.test(approvalRequestId)) return;
    const recipients = await this.approvals.findNotificationRecipients(
      { tenantId: event.tenantId, parkId: event.parkId },
      approvalRequestId
    );
    if (!recipients) throw new Error("approval-notification-request-missing");
    const userIds = [...new Set([recipients.requesterId, recipients.submitterId])];
    await this.consumer.consume({
      scope: { tenantId: event.tenantId, parkId: event.parkId },
      event: canonicalEvent,
      project: (canonical) => ({
        id: stableUuid(`notification:${canonical.eventId}`),
        scope: { tenantId: canonical.tenantId, parkId: canonical.parkId },
        eventId: canonical.eventId,
        eventPayloadHash: canonical.payloadHash,
        notificationType: canonical.eventType.startsWith("homestay.")
          ? "homestay-approval-executed"
          : "housing-approval-executed",
        projectionVersion: 1,
        title: "房产业务审批已执行",
        summary: "审批决定对应的领域效果已执行，可打开审批详情核对结果。",
        severity: "info",
        sourceType: "approval",
        sourceId: approvalRequestId,
        routeId: approvalRequestId,
        retentionUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1_000),
        recipients: userIds.map((userId) => ({
          id: stableUuid(`notification-recipient:${canonical.eventId}:${userId}`),
          userId,
          relationVersion: 1,
          bundleSnapshot: { approvalRequestId, eventType: canonical.eventType },
          channels: [{
            id: stableUuid(`notification-delivery:${canonical.eventId}:${userId}:in_app`),
            channel: "in_app" as const
          }]
        }))
      })
    });
  }
}

@Injectable()
export class PropertyLocalRuntimeComposition implements OnModuleInit {
  constructor(
    private readonly publishers: PropertyEventPublisherRegistry,
    private readonly channels: PropertyNotificationChannelRegistry,
    private readonly publisher: PropertyLocalEventPublisher,
    private readonly inApp: PropertyInAppNotificationChannel
  ) {}

  onModuleInit(): void {
    this.publishers.register(this.publisher);
    this.channels.register("in_app", this.inApp);
  }
}
