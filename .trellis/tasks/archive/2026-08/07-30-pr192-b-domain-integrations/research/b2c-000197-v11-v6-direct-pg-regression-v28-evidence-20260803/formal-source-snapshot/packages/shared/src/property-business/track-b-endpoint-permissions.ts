import { PROPERTY_BUSINESS_PERMISSIONS as P } from "./permissions";
import type { TrackBModuleCode } from "./track-b-routes";

export interface PropertyTrackBEndpointPermission {
  method: "GET" | "POST" | "PUT";
  path: `/api/v1/${string}`;
  actionId: string;
  requiredPermissions: readonly string[];
  authorizationAlternatives: readonly PropertyTaskAuthorizationAlternative[];
  requiredModule: TrackBModuleCode;
  surfaceId: string | null;
}

export type PropertyTaskActorPredicate = "current-assignee" | "queue-supervisor";

export interface PropertyTaskAuthorizationAlternative {
  requiredPermissions: readonly string[];
  actorPredicate: PropertyTaskActorPredicate;
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function normalizePermissions(permissions: readonly string[]): readonly string[] {
  return [...new Set(permissions)].sort(compareUtf8);
}

function normalizeAuthorizationAlternatives(
  alternatives: readonly PropertyTaskAuthorizationAlternative[]
): readonly PropertyTaskAuthorizationAlternative[] {
  const normalized = alternatives.map((alternative) => ({
    requiredPermissions: normalizePermissions(alternative.requiredPermissions),
    actorPredicate: alternative.actorPredicate
  }));
  return normalized.sort((left, right) => compareUtf8(
    `${left.actorPredicate}\t${left.requiredPermissions.join("\t")}`,
    `${right.actorPredicate}\t${right.requiredPermissions.join("\t")}`
  ));
}

function row(
  method: PropertyTrackBEndpointPermission["method"],
  path: PropertyTrackBEndpointPermission["path"],
  actionId: string,
  requiredPermissions: readonly string[],
  requiredModule: TrackBModuleCode,
  surfaceId: string | null,
  authorizationAlternatives: readonly PropertyTaskAuthorizationAlternative[] = []
): PropertyTrackBEndpointPermission {
  return {
    method,
    path,
    actionId,
    requiredPermissions: normalizePermissions(requiredPermissions),
    authorizationAlternatives: normalizeAuthorizationAlternatives(authorizationAlternatives),
    requiredModule,
    surfaceId
  };
}

const identity = "asset.identity-submissions";
const operation = "asset.property-operations";
const occupancy = "asset.property-occupancies";
const modeTransition = "asset.property-mode-transitions";
const notification = "property.notifications";
const eventIncident = "property.event-delivery-incidents";
const approvalIncident = "property.approval-incidents";

export const PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST = [
  row("GET", "/api/v1/property/identity-submissions", "party.identity.list",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_READ], "asset", identity),
  row("GET", "/api/v1/property/identity-submissions/:submissionId", "party.identity.read",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_READ], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions", "party.identity.create-draft",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_UPDATE], "asset", identity),
  row("PUT", "/api/v1/property/identity-submissions/:submissionId", "party.identity.update-draft",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_UPDATE], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions/:submissionId/submit", "party.identity.submit",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_UPDATE], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions/:submissionId/claim", "party.identity.claim",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_VERIFY], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions/:submissionId/reassign", "party.identity.reassign",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_VERIFY], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions/:submissionId/withdraw", "party.identity.withdraw",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_UPDATE], "asset", identity),
  row("POST", "/api/v1/property/identity-submissions/:submissionId/decisions", "party.identity.verify",
    [P.IDENTITY_SUBMISSIONS_PAGE, P.PARTY_IDENTITY_VERIFY], "asset", identity),
  row("GET", "/api/v1/property/identity-submissions/:submissionId/audit", "party.identity.audit.read",
    [P.IDENTITY_SUBMISSIONS_PAGE, "audit:read", P.PARTY_SENSITIVE_READ], "asset", identity),

  row("GET", "/api/v1/property/operations", "property.operation.list",
    [P.PROPERTY_OPERATIONS_PAGE, P.PROPERTY_OPERATION_READ], "asset", operation),
  row("GET", "/api/v1/property/units/:unitId/operation", "property.operation.read",
    [P.PROPERTY_OPERATIONS_PAGE, P.PROPERTY_OPERATION_READ], "asset", operation),
  row("PUT", "/api/v1/property/units/:unitId/operation", "property.operation.update",
    [P.PROPERTY_OPERATION_UPDATE], "asset", operation),
  row("POST", "/api/v1/property/units/:unitId/mode-transitions", "property.mode-transition.request",
    [P.PROPERTY_APPROVAL_CREATE, P.PROPERTY_OPERATION_TRANSITION_MODE], "asset", operation),
  row("GET", "/api/v1/property/units/:unitId/mode-transitions", "property.mode-transition.list",
    [P.PROPERTY_MODE_TRANSITIONS_PAGE, P.PROPERTY_APPROVAL_READ],
    "asset", modeTransition),
  row("GET", "/api/v1/property/occupancies", "property.occupancy.list",
    [P.PROPERTY_OCCUPANCIES_PAGE, P.PROPERTY_OCCUPANCY_READ], "asset", occupancy),
  row("GET", "/api/v1/property/occupancies/:occupancyId", "property.occupancy.read",
    [P.PROPERTY_OCCUPANCIES_PAGE, P.PROPERTY_OCCUPANCY_READ], "asset", occupancy),
  row("POST", "/api/v1/property/occupancies/availability",
    "property.occupancy.availability.check",
    [P.PROPERTY_OCCUPANCIES_PAGE, P.PROPERTY_OCCUPANCY_READ],
    "asset", occupancy),
  row("POST", "/api/v1/property/occupancies/:occupancyId/release",
    "property.occupancy.force-release.request",
    [P.PROPERTY_APPROVAL_CREATE, P.PROPERTY_OCCUPANCY_FORCE_RELEASE], "asset", occupancy),

  row("GET", "/api/v1/property/approvals", "property.approval.list",
    [P.PROPERTY_APPROVAL_READ], "asset", null),
  row("GET", "/api/v1/property/approvals/:requestId", "property.approval.read",
    [P.PROPERTY_APPROVAL_READ], "asset", null),
  row("POST", "/api/v1/property/approvals/:requestId/decisions", "property.approval.decide",
    [P.PROPERTY_APPROVAL_DECIDE], "asset", null),
  row("POST", "/api/v1/property/approvals/:requestId/withdraw", "property.approval.withdraw",
    [P.PROPERTY_APPROVAL_WITHDRAW], "asset", null),
  row("POST", "/api/v1/property/approvals/:requestId/retry",
    "property.approval.incident-retry",
    [P.PROPERTY_APPROVAL_INCIDENTS_PAGE, P.PROPERTY_APPROVAL_READ_INCIDENT,
      P.PROPERTY_APPROVAL_RETRY], "asset", approvalIncident),
  row("GET", "/api/v1/property/approval-incidents", "property.approval-incident.list",
    [P.PROPERTY_APPROVAL_INCIDENTS_PAGE, P.PROPERTY_APPROVAL_READ_INCIDENT],
    "asset", approvalIncident),
  row("GET", "/api/v1/property/approval-incidents/:requestId",
    "property.approval-incident.read",
    [P.PROPERTY_APPROVAL_INCIDENTS_PAGE, P.PROPERTY_APPROVAL_READ_INCIDENT],
    "asset", approvalIncident),

  row("GET", "/api/v1/property/tasks", "property.task.list",
    [P.PROPERTY_TASK_READ], "asset", null),
  row("GET", "/api/v1/property/tasks/:taskId", "property.task.read",
    [P.PROPERTY_TASK_READ], "asset", null),
  row("POST", "/api/v1/property/tasks/:taskId/claim", "property.task.claim",
    [P.PROPERTY_TASK_CLAIM], "asset", null),
  row("POST", "/api/v1/property/tasks/:taskId/start", "property.task.start",
    [P.PROPERTY_TASK_PROCESS], "asset", null),
  row("POST", "/api/v1/property/tasks/:taskId/block", "property.task.block",
    [P.PROPERTY_TASK_PROCESS], "asset", null),
  row("POST", "/api/v1/property/tasks/:taskId/unblock", "property.task.unblock",
    [], "asset", null, [
      { requiredPermissions: [P.PROPERTY_TASK_PROCESS], actorPredicate: "current-assignee" },
      { requiredPermissions: [P.PROPERTY_TASK_SUPERVISE], actorPredicate: "queue-supervisor" }
    ]),
  row("POST", "/api/v1/property/tasks/:taskId/release", "property.task.release",
    [], "asset", null, [
      { requiredPermissions: [P.PROPERTY_TASK_RELEASE], actorPredicate: "current-assignee" },
      { requiredPermissions: [P.PROPERTY_TASK_SUPERVISE], actorPredicate: "queue-supervisor" }
    ]),
  row("POST", "/api/v1/property/tasks/internal/rebuild", "property.task.internal-rebuild",
    [P.PROPERTY_TASK_REBUILD], "asset", null),

  row("GET", "/api/v1/property/notifications", "property.notification.list",
    [P.PROPERTY_NOTIFICATIONS_PAGE, P.PROPERTY_NOTIFICATION_READ],
    "asset", notification),
  row("GET", "/api/v1/property/notifications/:notificationId", "property.notification.read",
    [P.PROPERTY_NOTIFICATIONS_PAGE, P.PROPERTY_NOTIFICATION_READ],
    "asset", notification),
  row("POST", "/api/v1/property/notifications/:notificationId/read",
    "property.notification.mark-read",
    [P.PROPERTY_NOTIFICATIONS_PAGE, P.PROPERTY_NOTIFICATION_MARK_READ],
    "asset", notification),

  row("GET", "/api/v1/property/event-delivery-incidents",
    "property.event-delivery-incident.list",
    [P.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE, P.PROPERTY_EVENT_READ_INCIDENT],
    "asset", eventIncident),
  row("GET", "/api/v1/property/event-delivery-incidents/:dlqId",
    "property.event-delivery-incident.read",
    [P.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE, P.PROPERTY_EVENT_READ_INCIDENT],
    "asset", eventIncident),
  row("POST", "/api/v1/property/event-delivery-incidents/:dlqId/replay",
    "property.event.replay",
    [P.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE, P.PROPERTY_EVENT_READ_INCIDENT,
      P.PROPERTY_EVENT_REPLAY], "asset", eventIncident),

  row("POST", "/api/v1/homestay/bookings/:id/cancel", "homestay.bookings.cancel.request",
    [P.HOMESTAY_BOOKING_CANCEL, P.PROPERTY_APPROVAL_CREATE], "homestay", "homestay.bookings"),
  row("POST", "/api/v1/homestay/bookings/:id/ledger",
    "homestay.finance.refund-or-waive.request",
    [P.HOMESTAY_FINANCE_WAIVE, P.PROPERTY_APPROVAL_CREATE],
    "homestay", "homestay.finance"),
  row("POST", "/api/v1/housing/leases/:id/approve", "housing.leases.approve.request",
    [P.HOUSING_LEASE_APPROVE, P.PROPERTY_APPROVAL_CREATE], "housing_rental", "housing.leases"),
  row("POST", "/api/v1/housing/leases/:id/void", "housing.leases.void.request",
    [P.HOUSING_LEASE_CREATE, P.PROPERTY_APPROVAL_CREATE], "housing_rental", "housing.leases"),
  row("POST", "/api/v1/housing/leases/:id/checkout", "housing.leases.checkout.request",
    [P.HOUSING_LEASE_CHECKOUT, P.PROPERTY_APPROVAL_CREATE], "housing_rental", "housing.leases"),
  row("POST", "/api/v1/housing/leases/:id/ledger",
    "housing.finance.refund-waive-or-deposit-refund.request",
    [P.HOUSING_FINANCE_WAIVE, P.PROPERTY_APPROVAL_CREATE],
    "housing_rental", "housing.finance"),
  row("POST", "/api/v1/housing/leases/:id/handovers",
    "housing.handovers.complete-move-out-financial.request",
    [P.HOUSING_HANDOVER_MANAGE, P.PROPERTY_APPROVAL_CREATE],
    "housing_rental", "housing.handovers"),
  row("POST", "/api/v1/housing/purchases/:id/actions", "housing.purchases.lifecycle.request",
    [P.HOUSING_PURCHASE_MANAGE, P.PROPERTY_APPROVAL_CREATE],
    "housing_rental", "housing.purchases"),
  row("POST", "/api/v1/housing/purchases/:id/transfer", "housing.purchases.transfer.request",
    [P.HOUSING_PURCHASE_TRANSFER, P.PROPERTY_APPROVAL_CREATE],
    "housing_rental", "housing.purchases")
] as const satisfies readonly PropertyTrackBEndpointPermission[];

export const PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256 =
  "6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd" as const;

export function validatePropertyTrackBEndpointPermissionManifest(
  manifest: readonly PropertyTrackBEndpointPermission[] =
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST
): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const item of manifest) {
    const key = `${item.method}\t${item.path}\t${item.actionId}`;
    if (keys.has(key)) issues.push(`Duplicate Track B endpoint row: ${key}`);
    keys.add(key);
    if (!item.path.startsWith("/api/v1/")) {
      issues.push(`Non-canonical Track B endpoint path: ${item.path}`);
    }
    if (
      item.requiredPermissions.length === 0
      && item.authorizationAlternatives.length === 0
    ) {
      issues.push(`Track B endpoint has no permission or authorization alternative: ${key}`);
    }
    const sorted = [...new Set(item.requiredPermissions)].sort();
    if (
      sorted.length !== item.requiredPermissions.length ||
      sorted.some((value, index) => value !== item.requiredPermissions[index])
    ) {
      issues.push(`Track B endpoint permissions are not unique/sorted: ${key}`);
    }
    const normalizedAlternatives = normalizeAuthorizationAlternatives(
      item.authorizationAlternatives
    );
    if (
      normalizedAlternatives.length !== item.authorizationAlternatives.length
      || normalizedAlternatives.some((alternative, index) => {
        const current = item.authorizationAlternatives[index];
        return current == null
          || alternative.actorPredicate !== current.actorPredicate
          || alternative.requiredPermissions.length !== current.requiredPermissions.length
          || alternative.requiredPermissions.some(
            (permission, permissionIndex) =>
              permission !== current.requiredPermissions[permissionIndex]
          );
      })
    ) {
      issues.push(`Track B endpoint alternatives are not unique/sorted: ${key}`);
    }
    const alternativeKeys = new Set<string>();
    for (const alternative of item.authorizationAlternatives) {
      const alternativeKey = `${alternative.actorPredicate}\t${alternative.requiredPermissions.join("\t")}`;
      if (alternative.requiredPermissions.length === 0) {
        issues.push(`Track B endpoint has an empty permission alternative: ${key}`);
      }
      if (
        alternative.actorPredicate !== "current-assignee"
        && alternative.actorPredicate !== "queue-supervisor"
      ) {
        issues.push(`Track B endpoint has an unknown actor predicate: ${key}`);
      }
      if (alternativeKeys.has(alternativeKey)) {
        issues.push(`Track B endpoint has a duplicate permission alternative: ${key}`);
      }
      alternativeKeys.add(alternativeKey);
    }
  }
  return issues;
}
