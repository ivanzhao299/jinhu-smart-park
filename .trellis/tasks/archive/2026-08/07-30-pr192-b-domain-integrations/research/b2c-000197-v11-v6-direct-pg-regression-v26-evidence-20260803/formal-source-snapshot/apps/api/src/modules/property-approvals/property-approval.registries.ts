import { Injectable } from "@nestjs/common";
import type { TrackBApprovalActionId } from "@jinhu/shared";
import type {
  FrozenApprovalPolicy,
  PropertyApprovalEffectAdapter,
  PropertyApprovalEffectAdapterRegistry,
  PropertyApprovalEffectProofVerifier,
  PropertyApprovalEffectProofVerifierRegistry,
  PropertyApprovalPolicyPort
} from "./property-approval.ports";
import { propertyApprovalError } from "./property-approval.error";
import type {
  PropertyEventEnvelope,
  PropertyEventPublisherPort
} from "./outbox/property-event-runtime.contracts";
import type {
  ClaimedNotificationDelivery,
  PropertyNotificationChannelName,
  PropertyNotificationChannelPort
} from "./outbox/property-notification.contracts";

export type FrozenApprovalPolicyResolver = (
  input: Parameters<PropertyApprovalPolicyPort["resolve"]>[0]
) => Promise<FrozenApprovalPolicy>;

/**
 * Public composition surface for B-2c owning domains. Unregistered actions
 * remain fail closed; registration never fabricates a domain policy.
 */
@Injectable()
export class FrozenPropertyApprovalPolicyResolver implements PropertyApprovalPolicyPort {
  private readonly resolvers = new Map<TrackBApprovalActionId, FrozenApprovalPolicyResolver>();

  register(actionId: TrackBApprovalActionId, resolver: FrozenApprovalPolicyResolver): void {
    if (this.resolvers.has(actionId)) throw new Error(`approval policy already registered: ${actionId}`);
    this.resolvers.set(actionId, resolver);
  }

  async resolve(input: Parameters<PropertyApprovalPolicyPort["resolve"]>[0]) {
    const resolver = this.resolvers.get(input.actionId);
    if (!resolver) throw propertyApprovalError("approval-policy-not-found");
    return resolver(input);
  }
}

@Injectable()
export class PropertyApprovalEffectProofVerifierRegistryService
implements PropertyApprovalEffectProofVerifierRegistry {
  private readonly verifiers = new Map<string, PropertyApprovalEffectProofVerifier>();

  register(verifier: PropertyApprovalEffectProofVerifier): void {
    const key = `${verifier.actionId}\u0000${verifier.effectKind}`;
    if (this.verifiers.has(key)) throw new Error(`approval proof verifier already registered: ${key}`);
    this.verifiers.set(key, verifier);
  }

  get(
    actionId: TrackBApprovalActionId,
    effectKind: string
  ): PropertyApprovalEffectProofVerifier | null {
    return this.verifiers.get(`${actionId}\u0000${effectKind}`) ?? null;
  }
}

/**
 * Public domain-effect registry. Domain modules register their own atomic
 * adapters during composition; missing actions are deliberately unavailable.
 */
@Injectable()
export class PropertyApprovalEffectRegistry implements PropertyApprovalEffectAdapterRegistry {
  private readonly adapters = new Map<TrackBApprovalActionId, PropertyApprovalEffectAdapter>();

  register(adapter: PropertyApprovalEffectAdapter): void {
    if (this.adapters.has(adapter.actionId)) {
      throw new Error(`approval effect adapter already registered: ${adapter.actionId}`);
    }
    this.adapters.set(adapter.actionId, adapter);
  }

  get(actionId: TrackBApprovalActionId): PropertyApprovalEffectAdapter | null {
    return this.adapters.get(actionId) ?? null;
  }
}

/** Replaceable external transport. It remains fail closed until an owning
 * infrastructure module explicitly registers the publisher. */
@Injectable()
export class PropertyEventPublisherRegistry implements PropertyEventPublisherPort {
  private publisher: PropertyEventPublisherPort | null = null;

  register(publisher: PropertyEventPublisherPort): void {
    if (this.publisher) throw new Error("property event publisher already registered");
    this.publisher = publisher;
  }

  async publish(event: Readonly<PropertyEventEnvelope>): Promise<void> {
    if (!this.publisher) throw propertyApprovalError("property-runtime-unavailable");
    await this.publisher.publish(event);
  }
}

/** Replaceable per-channel transports with an explicit fail-closed default. */
@Injectable()
export class PropertyNotificationChannelRegistry implements PropertyNotificationChannelPort {
  private readonly channels = new Map<
    PropertyNotificationChannelName,
    PropertyNotificationChannelPort
  >();

  register(
    channel: PropertyNotificationChannelName,
    transport: PropertyNotificationChannelPort
  ): void {
    if (this.channels.has(channel)) {
      throw new Error(`property notification channel already registered: ${channel}`);
    }
    this.channels.set(channel, transport);
  }

  async deliver(delivery: Readonly<ClaimedNotificationDelivery>): Promise<void> {
    const transport = this.channels.get(delivery.channel);
    if (!transport) throw propertyApprovalError("property-runtime-unavailable");
    await transport.deliver(delivery);
  }
}
