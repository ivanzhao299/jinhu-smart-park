import { Injectable } from "@nestjs/common";
import type {
  PropertyApprovalAuthorizationPort,
  PropertyApprovalEffectAdapterRegistry,
  PropertyApprovalIncidentAuthorizationPort,
  PropertyApprovalOutboxPort,
  PropertyApprovalPolicyPort,
  PropertyApprovalReadAuthorizationPort
} from "./property-approval.ports";
import { propertyApprovalError } from "./property-approval.error";

/**
 * Fail-closed until B-2c registers an owning-domain policy resolver.
 */
@Injectable()
export class UnconfiguredPropertyApprovalPolicyPort implements PropertyApprovalPolicyPort {
  async resolve(): Promise<never> {
    throw propertyApprovalError("approval-policy-not-found");
  }
}

@Injectable()
export class UnconfiguredPropertyApprovalEffectAdapterRegistry
implements PropertyApprovalEffectAdapterRegistry {
  get(): null {
    return null;
  }
}

@Injectable()
export class UnconfiguredPropertyApprovalOutboxPort
implements PropertyApprovalOutboxPort {
  async append(
    _manager: import("typeorm").EntityManager,
    input: { events: readonly unknown[] }
  ): Promise<void> {
    if (input.events.length > 0) throw propertyApprovalError("property-runtime-unavailable");
  }
}

/** Fail-closed until the current RBAC/scope eligibility adapter is registered. */
@Injectable()
export class UnconfiguredPropertyApprovalAuthorizationPort
implements PropertyApprovalAuthorizationPort {
  async authorizeDecision(): Promise<never> {
    throw propertyApprovalError("property-action-forbidden");
  }

  async canDecide(): Promise<boolean> {
    return false;
  }
}

@Injectable()
export class UnconfiguredPropertyApprovalReadAuthorizationPort
implements PropertyApprovalReadAuthorizationPort {
  async predicate(): Promise<never> {
    throw propertyApprovalError("property-action-forbidden");
  }

  async authorizeSource(): Promise<never> {
    throw propertyApprovalError("property-resource-not-found");
  }
}

@Injectable()
export class UnconfiguredPropertyApprovalIncidentAuthorizationPort
implements PropertyApprovalIncidentAuthorizationPort {
  async authorizeRetry(): Promise<never> {
    throw propertyApprovalError("property-action-forbidden");
  }
}
