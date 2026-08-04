import { Inject, Injectable } from "@nestjs/common";
import type {
  NotificationListQuery,
  NotificationMarkReadCommand,
  TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { propertyApprovalError } from "../property-approval.error";
import {
  PROPERTY_NOTIFICATION_AUTHORIZATION,
  PROPERTY_NOTIFICATION_STORE,
  type PropertyNotificationAuthorizationPort,
  type PropertyNotificationStore
} from "./property-notification.contracts";

@Injectable()
export class PropertyNotificationService {
  constructor(
    @Inject(PROPERTY_NOTIFICATION_STORE) private readonly store: PropertyNotificationStore,
    @Inject(PROPERTY_NOTIFICATION_AUTHORIZATION)
    private readonly authorization: PropertyNotificationAuthorizationPort
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: NotificationListQuery) {
    const access = await this.authorization.authorize({ scope, actor, operation: "read" });
    const page = await this.store.list(scope, actor.sub, query);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        allowedActions: access.canMarkRead && item.readAt == null
          ? ["property.notification.mark-read" as const] : []
      }))
    };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, notificationId: string) {
    const access = await this.authorization.authorize({
      scope, actor, operation: "read", notificationId
    });
    const notification = await this.store.detail(scope, actor.sub, notificationId);
    if (!notification) throw propertyApprovalError("property-resource-not-found");
    return {
      ...notification,
      allowedActions: access.canMarkRead && notification.readAt == null
        ? ["property.notification.mark-read" as const] : []
    };
  }

  async markRead(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    notificationId: string,
    command: NotificationMarkReadCommand
  ) {
    const notification = await this.store.markRead({
      scope,
      recipientUserId: actor.sub,
      notificationId,
      command,
      authorize: async (manager) => {
        await this.authorization.authorize({
          manager, scope, actor, operation: "mark-read", notificationId
        });
      }
    });
    if (!notification) throw propertyApprovalError("property-resource-not-found");
    return { ...notification, allowedActions: [] };
  }
}
