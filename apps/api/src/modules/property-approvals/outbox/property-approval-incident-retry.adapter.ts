import { Injectable } from "@nestjs/common";
import { PropertyApprovalService } from "../property-approval.service";
import type { PropertyApprovalIncidentRetryPort } from "./property-event-runtime.contracts";

/**
 * Keeps the approval-incident surface on the canonical approval runtime. The
 * primary owner registers this adapter under PROPERTY_APPROVAL_INCIDENT_RETRY;
 * no second retry state machine is introduced here.
 */
@Injectable()
export class PropertyApprovalIncidentRetryAdapter implements PropertyApprovalIncidentRetryPort {
  constructor(private readonly approvalService: PropertyApprovalService) {}

  retry(input: Parameters<PropertyApprovalIncidentRetryPort["retry"]>[0]) {
    return this.approvalService.reconcileExhaustedExecution(
      input.scope,
      input.actor,
      input.requestId,
      input.command
    );
  }
}
