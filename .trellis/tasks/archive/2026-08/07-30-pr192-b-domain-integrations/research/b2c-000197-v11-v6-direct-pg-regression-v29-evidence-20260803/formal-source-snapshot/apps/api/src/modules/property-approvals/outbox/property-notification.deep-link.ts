import { BadRequestException } from "@nestjs/common";
import type { PropertyNotificationType } from "./property-notification.contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildPropertyNotificationDeepLink(
  notificationType: PropertyNotificationType,
  routeId: string
): string {
  if (!UUID.test(routeId)) {
    throw new BadRequestException({
      message: "property-validation-failed",
      errorCode: "property-validation-failed",
      retryable: false,
      details: { field: "routeId" }
    });
  }
  const encoded = encodeURIComponent(routeId);
  switch (notificationType) {
    case "identity-verification-assigned":
      return `/assets/identity-submissions/${encoded}`;
    case "homestay-approval-stage-assigned":
      return `/homestay/tasks?requestId=${encoded}`;
    case "housing-approval-stage-assigned":
      return `/housing/tasks?requestId=${encoded}`;
    case "homestay-task-assigned":
      return `/homestay/tasks?taskId=${encoded}`;
    case "housing-task-assigned":
      return `/housing/tasks?taskId=${encoded}`;
    case "property-event-delivery-incident":
      return `/property/event-delivery-incidents/${encoded}`;
    case "approval-infra-exhausted":
      return `/property/approval-incidents/${encoded}`;
  }
}
