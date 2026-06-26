import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EngineeringEventEnvelope } from "./engineering-event.types";
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

@Injectable()
export class EngineeringEventPublisher {
  async publishProjectStatusChanged(input: {
    tenantId: string;
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

  protected async publish(_event: EngineeringProjectStatusChangedEvent): Promise<void> {
    // EventBus adapter boundary. Replace this no-op with the platform EventBus when available.
  }
}
