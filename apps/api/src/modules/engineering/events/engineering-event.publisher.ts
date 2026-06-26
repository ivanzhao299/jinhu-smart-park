import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import type { Repository } from "typeorm";
import { EngineeringEventLogEntity } from "../entities/engineering-event-log.entity";
import type { EngineeringEventEnvelope, EngineeringEventType } from "./engineering-event.types";
import { EngineeringProjectStatus } from "../domain/engineering-project.enums";
import { EngineeringProjectAction } from "../domain/engineering-project-state-machine.types";

export interface EngineeringProjectStatusChangedPayload {
  fromStatus: EngineeringProjectStatus;
  toStatus: EngineeringProjectStatus;
  action: EngineeringProjectAction;
  reason: string;
  comment: string | null;
  workflowInstanceId: string | null;
  requestId: string | null;
}

export interface EngineeringProjectStatusChangedEvent
  extends EngineeringEventEnvelope<EngineeringProjectStatusChangedPayload & Record<string, unknown>> {
  eventType: "EngineeringProjectStatusChangedEvent";
  projectId: string;
  fromStatus: EngineeringProjectStatus;
  toStatus: EngineeringProjectStatus;
  action: EngineeringProjectAction;
}

export type EngineeringPlanEventType =
  | "EngineeringPlanCreatedEvent"
  | "EngineeringPlanUpdatedEvent"
  | "EngineeringPlanProgressUpdatedEvent"
  | "EngineeringPlanStatusChangedEvent"
  | "EngineeringPlanCompletedEvent"
  | "EngineeringPlanDelayedEvent";

export interface EngineeringPlanEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringPlanEventType;
  projectId: string;
  planId: string;
}

export type EngineeringDailyReportEventType =
  | "EngineeringDailyReportCreatedEvent"
  | "EngineeringDailyReportUpdatedEvent"
  | "EngineeringDailyReportSubmittedEvent"
  | "EngineeringDailyReportReviewedEvent"
  | "EngineeringDailyReportRejectedEvent"
  | "EngineeringDailyReportDeletedEvent";

export interface EngineeringDailyReportEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringDailyReportEventType;
  projectId: string;
  dailyReportId: string;
}

export type EngineeringInspectionEventType =
  | "EngineeringInspectionCreatedEvent"
  | "EngineeringInspectionUpdatedEvent"
  | "EngineeringInspectionSubmittedEvent"
  | "EngineeringInspectionDeletedEvent";

export interface EngineeringInspectionEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringInspectionEventType;
  projectId: string;
  inspectionId: string;
}

export type EngineeringIssueEventType = "EngineeringIssueCreatedEvent" | "EngineeringIssueUpdatedEvent" | "EngineeringIssueDeletedEvent";

export interface EngineeringIssueEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringIssueEventType;
  projectId: string;
  issueId: string;
}

export type EngineeringRectificationEventType =
  | "EngineeringRectificationCreatedEvent"
  | "EngineeringRectificationSubmittedEvent"
  | "EngineeringRectificationPassedEvent"
  | "EngineeringRectificationRejectedEvent"
  | "EngineeringRectificationOverdueEvent";

export interface EngineeringRectificationEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringRectificationEventType;
  projectId: string;
  rectificationId: string;
  issueId?: string | null;
}

export type EngineeringAcceptanceEventType =
  | "EngineeringAcceptanceCreatedEvent"
  | "EngineeringAcceptanceUpdatedEvent"
  | "EngineeringAcceptanceSubmittedEvent"
  | "EngineeringAcceptancePassedEvent"
  | "EngineeringAcceptanceFailedEvent"
  | "EngineeringAcceptanceRectificationRequiredEvent"
  | "EngineeringAcceptanceClosedEvent"
  | "EngineeringAcceptanceDeletedEvent";

export interface EngineeringAcceptanceEvent extends EngineeringEventEnvelope<Record<string, unknown>> {
  eventType: EngineeringAcceptanceEventType;
  projectId: string;
  acceptanceId: string;
}

@Injectable()
export class EngineeringEventPublisher {
  constructor(
    @InjectRepository(EngineeringEventLogEntity)
    private readonly eventLogsRepository: Repository<EngineeringEventLogEntity>
  ) {}

  async publishProjectStatusChanged(input: {
    tenantId: string;
    parkId: string;
    projectId: string;
    fromStatus: EngineeringProjectStatus;
    toStatus: EngineeringProjectStatus;
    action: EngineeringProjectAction;
    actorUserId: string;
    reason: string;
    comment?: string | null;
    workflowInstanceId?: string | null;
    requestId?: string | null;
  }): Promise<EngineeringProjectStatusChangedEvent> {
    const event: EngineeringProjectStatusChangedEvent = {
      eventId: randomUUID(),
      eventType: "EngineeringProjectStatusChangedEvent",
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.projectId,
      actorUserId: input.actorUserId,
      occurredAt: new Date().toISOString(),
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      action: input.action,
      payload: {
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        action: input.action,
        reason: input.reason,
        comment: input.comment ?? null,
        workflowInstanceId: input.workflowInstanceId ?? null,
        requestId: input.requestId ?? null
      }
    };
    await this.publish(event);
    return event;
  }

  async publishPlanEvent(input: {
    eventType: EngineeringPlanEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    planId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringPlanEvent> {
    const event: EngineeringPlanEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.planId,
      planId: input.planId,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  async publishDailyReportEvent(input: {
    eventType: EngineeringDailyReportEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    dailyReportId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringDailyReportEvent> {
    const event: EngineeringDailyReportEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.dailyReportId,
      dailyReportId: input.dailyReportId,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  async publishInspectionEvent(input: {
    eventType: EngineeringInspectionEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    inspectionId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringInspectionEvent> {
    const event: EngineeringInspectionEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.inspectionId,
      inspectionId: input.inspectionId,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  async publishIssueEvent(input: {
    eventType: EngineeringIssueEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    issueId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringIssueEvent> {
    const event: EngineeringIssueEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.issueId,
      issueId: input.issueId,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  async publishRectificationEvent(input: {
    eventType: EngineeringRectificationEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    rectificationId: string;
    issueId?: string | null;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringRectificationEvent> {
    const event: EngineeringRectificationEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.rectificationId,
      rectificationId: input.rectificationId,
      issueId: input.issueId ?? null,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  async publishAcceptanceEvent(input: {
    eventType: EngineeringAcceptanceEventType;
    tenantId: string;
    parkId: string;
    projectId: string;
    acceptanceId: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<EngineeringAcceptanceEvent> {
    const event: EngineeringAcceptanceEvent = {
      eventId: randomUUID(),
      eventType: input.eventType,
      tenantId: input.tenantId,
      parkId: input.parkId,
      projectId: input.projectId,
      entityId: input.acceptanceId,
      acceptanceId: input.acceptanceId,
      actorUserId: input.actorUserId ?? null,
      occurredAt: new Date().toISOString(),
      payload: input.payload ?? {}
    };
    await this.publish(event);
    return event;
  }

  protected async publish(
    event: (
      | EngineeringProjectStatusChangedEvent
      | EngineeringPlanEvent
      | EngineeringDailyReportEvent
      | EngineeringInspectionEvent
      | EngineeringIssueEvent
      | EngineeringRectificationEvent
      | EngineeringAcceptanceEvent
    ) & {
      eventType: EngineeringEventType;
    }
  ): Promise<void> {
    const eventLog = this.eventLogsRepository.create({
      eventId: event.eventId,
      eventType: event.eventType,
      tenantId: event.tenantId,
      parkId: event.parkId,
      projectId: event.projectId,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload
    });
    await this.eventLogsRepository.save(eventLog);
    // External EventBus adapter boundary. Forward from here when the platform bus is available.
  }
}
