import type {
  NotificationDetail,
  NotificationListItem,
  NotificationListQuery,
  NotificationMarkReadCommand,
  PropertyNotificationDeliveryStatus,
  PropertyPaginatedResult,
  TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import type { EntityManager } from "typeorm";

export const PROPERTY_NOTIFICATION_STORE = Symbol("PROPERTY_NOTIFICATION_STORE");
export const PROPERTY_NOTIFICATION_AUTHORIZATION = Symbol("PROPERTY_NOTIFICATION_AUTHORIZATION");
export const PROPERTY_NOTIFICATION_CHANNEL = Symbol("PROPERTY_NOTIFICATION_CHANNEL");

export type PropertyNotificationType =
  | "identity-verification-assigned"
  | "homestay-approval-stage-assigned"
  | "housing-approval-stage-assigned"
  | "homestay-approval-executed"
  | "housing-approval-executed"
  | "homestay-task-assigned"
  | "housing-task-assigned"
  | "property-event-delivery-incident"
  | "approval-infra-exhausted";

export type PropertyNotificationChannelName = "in_app" | "email" | "sms" | "webhook";

export interface NotificationProjectionInput {
  id: string;
  scope: TenantParkScope;
  eventId: string;
  eventPayloadHash: string;
  notificationType: PropertyNotificationType;
  projectionVersion: number;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  sourceType: string;
  sourceId: string;
  routeId: string;
  retentionUntil: Date;
  recipients: readonly {
    id: string;
    userId: string;
    relationVersion: number;
    bundleSnapshot: Record<string, unknown>;
    channels: readonly { id: string; channel: PropertyNotificationChannelName }[];
  }[];
}

export interface ClaimedNotificationDelivery {
  id: string;
  scope: TenantParkScope;
  notificationId: string;
  recipientUserId: string;
  channel: PropertyNotificationChannelName;
  version: number;
  attemptCount: number;
  maxAttempts: number;
  claimEpoch: string;
  claimToken: string;
}

export interface PropertyNotificationStore {
  project(manager: EntityManager, input: NotificationProjectionInput): Promise<void>;
  list(
    scope: TenantParkScope,
    recipientUserId: string,
    query: NotificationListQuery
  ): Promise<PropertyPaginatedResult<NotificationListItem, never>>;
  detail(
    scope: TenantParkScope,
    recipientUserId: string,
    notificationId: string
  ): Promise<NotificationDetail | null>;
  markRead(input: {
    scope: TenantParkScope;
    recipientUserId: string;
    notificationId: string;
    command: NotificationMarkReadCommand;
    authorize: (manager: EntityManager) => Promise<void>;
  }): Promise<NotificationDetail | null>;
  claimDeliveries(input: {
    limit: number; leaseSeconds: number;
  }): Promise<ClaimedNotificationDelivery[]>;
  completeDelivery(delivery: ClaimedNotificationDelivery): Promise<boolean>;
  failDelivery(input: {
    delivery: ClaimedNotificationDelivery;
    errorCode: string;
    retryAt: Date;
  }): Promise<PropertyNotificationDeliveryStatus | "stale-claim">;
}

export interface PropertyNotificationAuthorizationPort {
  authorize(input: {
    manager?: EntityManager;
    scope: TenantParkScope;
    actor: JwtPrincipal;
    operation: "read" | "mark-read";
    notificationId?: string;
  }): Promise<{ canMarkRead: boolean }>;
}

export interface PropertyNotificationChannelPort {
  deliver(delivery: Readonly<ClaimedNotificationDelivery>): Promise<void>;
}
