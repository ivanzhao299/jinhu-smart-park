export interface EngineeringEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  eventType: EngineeringEventType;
  tenantId: string;
  projectId: string | null;
  entityId: string;
  actorUserId: string | null;
  occurredAt: string;
  payload: TPayload;
}

export const ENGINEERING_EVENT_TYPES = [
  "EngineeringProjectCreatedEvent",
  "EngineeringProjectSubmittedEvent",
  "EngineeringProjectApprovedEvent",
  "EngineeringProjectStatusChangedEvent",
  "EngineeringPlanCreatedEvent",
  "EngineeringPlanUpdatedEvent",
  "EngineeringPlanProgressUpdatedEvent",
  "EngineeringPlanStatusChangedEvent",
  "EngineeringPlanCompletedEvent",
  "EngineeringPlanDelayedEvent",
  "EngineeringDailyReportCreatedEvent",
  "EngineeringDailyReportUpdatedEvent",
  "EngineeringDailyReportSubmittedEvent",
  "EngineeringDailyReportReviewedEvent",
  "EngineeringDailyReportRejectedEvent",
  "EngineeringDailyReportDeletedEvent",
  "EngineeringInspectionCreatedEvent",
  "EngineeringInspectionUpdatedEvent",
  "EngineeringInspectionSubmittedEvent",
  "EngineeringInspectionDeletedEvent",
  "EngineeringIssueCreatedEvent",
  "EngineeringIssueUpdatedEvent",
  "EngineeringIssueDeletedEvent",
  "EngineeringRectificationCreatedEvent",
  "EngineeringRectificationSubmittedEvent",
  "EngineeringRectificationPassedEvent",
  "EngineeringRectificationRejectedEvent",
  "EngineeringRectificationOverdueEvent",
  "EngineeringAcceptanceCreatedEvent",
  "EngineeringAcceptanceUpdatedEvent",
  "EngineeringAcceptanceSubmittedEvent",
  "EngineeringAcceptancePassedEvent",
  "EngineeringAcceptanceFailedEvent",
  "EngineeringAcceptanceRectificationRequiredEvent",
  "EngineeringAcceptanceClosedEvent",
  "EngineeringAcceptanceDeletedEvent",
  "EngineeringTransferReadyEvent"
] as const;

export type EngineeringEventType = (typeof ENGINEERING_EVENT_TYPES)[number];
