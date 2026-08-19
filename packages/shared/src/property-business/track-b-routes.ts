import { PROPERTY_BUSINESS_PERMISSIONS } from "./permissions";

export type TrackBModuleCode = "asset" | "homestay" | "housing_rental";

export interface TrackBSurface {
  surfaceId: string;
  route: string;
  detailRoutes: readonly string[];
  requiredModule: TrackBModuleCode;
  pagePermission: string;
}

export const PROPERTY_TRACK_B_SURFACES = [
  {
    surfaceId: "asset.identity-submissions",
    route: "/assets/identity-submissions",
    detailRoutes: ["/assets/identity-submissions/[submissionId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE
  },
  {
    surfaceId: "asset.property-operations",
    route: "/assets/property-operations",
    detailRoutes: ["/assets/property-operations/[unitId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OPERATIONS_PAGE
  },
  {
    surfaceId: "asset.property-occupancies",
    route: "/assets/property-occupancies",
    detailRoutes: ["/assets/property-occupancies/[occupancyId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE
  },
  {
    surfaceId: "asset.property-mode-transitions",
    route: "/assets/property-mode-transitions",
    detailRoutes: [],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE
  },
  {
    surfaceId: "property.notifications",
    route: "/property/notifications",
    detailRoutes: ["/property/notifications/[notificationId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE
  },
  {
    surfaceId: "property.event-delivery-incidents",
    route: "/property/event-delivery-incidents",
    detailRoutes: ["/property/event-delivery-incidents/[dlqId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE
  },
  {
    surfaceId: "property.approval-incidents",
    route: "/property/approval-incidents",
    detailRoutes: ["/property/approval-incidents/[requestId]"],
    requiredModule: "asset",
    pagePermission: PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE
  }
] as const satisfies readonly TrackBSurface[];

export const PROPERTY_TRACK_B_API_ROUTES = {
  identitySubmissions: "/api/v1/property/identity-submissions",
  identitySubmission: "/api/v1/property/identity-submissions/:submissionId",
  identityTerminalCas: "/api/v1/property/identity-submissions/parties/:partyId/terminal-cas",
  identitySubmit: "/api/v1/property/identity-submissions/:submissionId/submit",
  identityClaim: "/api/v1/property/identity-submissions/:submissionId/claim",
  identityReassign: "/api/v1/property/identity-submissions/:submissionId/reassign",
  identityDecisions: "/api/v1/property/identity-submissions/:submissionId/decisions",
  identityWithdraw: "/api/v1/property/identity-submissions/:submissionId/withdraw",
  identityAudit: "/api/v1/property/identity-submissions/:submissionId/audit",
  approvals: "/api/v1/property/approvals",
  approval: "/api/v1/property/approvals/:requestId",
  approvalDecisions: "/api/v1/property/approvals/:requestId/decisions",
  approvalWithdraw: "/api/v1/property/approvals/:requestId/withdraw",
  approvalRetry: "/api/v1/property/approvals/:requestId/retry",
  approvalIncidents: "/api/v1/property/approval-incidents",
  approvalIncident: "/api/v1/property/approval-incidents/:requestId",
  tasks: "/api/v1/property/tasks",
  task: "/api/v1/property/tasks/:taskId",
  taskClaim: "/api/v1/property/tasks/:taskId/claim",
  taskStart: "/api/v1/property/tasks/:taskId/start",
  taskBlock: "/api/v1/property/tasks/:taskId/block",
  taskUnblock: "/api/v1/property/tasks/:taskId/unblock",
  taskRelease: "/api/v1/property/tasks/:taskId/release",
  taskRebuild: "/api/v1/property/tasks/internal/rebuild",
  notifications: "/api/v1/property/notifications",
  notification: "/api/v1/property/notifications/:notificationId",
  notificationRead: "/api/v1/property/notifications/:notificationId/read",
  eventDeliveryIncidents: "/api/v1/property/event-delivery-incidents",
  eventDeliveryIncident: "/api/v1/property/event-delivery-incidents/:dlqId",
  eventReplay: "/api/v1/property/event-delivery-incidents/:dlqId/replay",
  operations: "/api/v1/property/operations",
  operation: "/api/v1/property/units/:unitId/operation",
  modeTransitions: "/api/v1/property/units/:unitId/mode-transitions",
  modeTransitionAudit: "/api/v1/property/mode-transitions",
  occupancies: "/api/v1/property/occupancies",
  occupancy: "/api/v1/property/occupancies/:occupancyId",
  occupancyAvailability: "/api/v1/property/occupancies/availability",
  occupancyActivate: "/api/v1/property/occupancies/:occupancyId/activate",
  occupancyRelease: "/api/v1/property/occupancies/:occupancyId/release"
} as const;
