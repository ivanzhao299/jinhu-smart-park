import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  TRACK_B_APPROVAL_EFFECT_MANIFEST,
  type TrackBApprovalActionId,
  type TrackBEffectKind
} from "@jinhu/shared";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectRegistry,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyEventPublisherRegistry,
  PropertyNotificationChannelRegistry
} from "./property-approval.registries";

const errorCode = (error: unknown) => {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return typeof response === "object" && response !== null && "errorCode" in response
    ? String((response as { errorCode: unknown }).errorCode)
    : "";
};

describe("property approval public composition registries", () => {
  it("registers only exact fixed action/effect verifier pairs for all 15 kinds", () => {
    const registry = new PropertyApprovalEffectProofVerifierRegistryService();
    const registeredKinds = new Set<string>();
    for (const [actionId, kinds] of Object.entries(TRACK_B_APPROVAL_EFFECT_MANIFEST) as Array<
      [TrackBApprovalActionId, readonly TrackBEffectKind[]]
    >) {
      for (const effectKind of kinds) {
        const verifier = {
          actionId,
          effectKind,
          verify: async () => ({
            domainTable: "fixed_table", domainRowId: randomUUID(),
            owningUniqueName: "fixed_unique", uniqueKeyHash: "a".repeat(64),
            observedCardinality: 1, lineAmount: null, currency: null
          })
        };
        registry.register(verifier);
        assert.equal(registry.get(actionId, effectKind), verifier);
        registeredKinds.add(effectKind);
        assert.throws(() => registry.register(verifier));
      }
    }
    assert.equal(registeredKinds.size, 15);
    assert.equal(registry.get(
      "property.mode-transition.request", "housing.lease.void"
    ), null);
  });

  it("keeps unregistered policies and effects fail closed", async () => {
    const policies = new FrozenPropertyApprovalPolicyResolver();
    const effects = new PropertyApprovalEffectRegistry();
    assert.equal(effects.get("property.mode-transition.request"), null);
    await assert.rejects(policies.resolve({
      manager: {} as never,
      scope: { tenantId: "tenant", parkId: "park" },
      actionId: "property.mode-transition.request",
      sourceType: "property-unit",
      sourceId: randomUUID(),
      requesterId: randomUUID(),
      canonicalPayload: {}
    }), (error) => errorCode(error) === "approval-policy-not-found");
  });

  it("allows an owning domain to register a policy and effect without module edits", async () => {
    const policies = new FrozenPropertyApprovalPolicyResolver();
    const effects = new PropertyApprovalEffectRegistry();
    const policy = {
      policyId: randomUUID(), policyVersion: 1, policyHash: "a".repeat(64),
      stages: [], exclusions: [], effects: []
    };
    policies.register("property.mode-transition.request", async () => policy);
    const effect = {
      actionId: "property.mode-transition.request" as const,
      execute: async () => ({ receipts: [], outboxEvents: [], financialMutationCount: 0 }),
      reconcile: async () => ({ state: "absent" as const, financialMutationCount: 0 as const })
    };
    effects.register(effect);
    assert.equal(await policies.resolve({
      manager: {} as never,
      scope: { tenantId: "tenant", parkId: "park" },
      actionId: "property.mode-transition.request",
      sourceType: "property-unit",
      sourceId: randomUUID(),
      requesterId: randomUUID(),
      canonicalPayload: {}
    }), policy);
    assert.equal(effects.get(effect.actionId), effect);
    assert.throws(() => policies.register(effect.actionId, async () => policy));
    assert.throws(() => effects.register(effect));
  });

  it("keeps external transports fail closed until explicit public registration", async () => {
    const events = new PropertyEventPublisherRegistry();
    const channels = new PropertyNotificationChannelRegistry();
    const published: string[] = [];
    const delivered: string[] = [];
    const event = {
      eventId: randomUUID(), tenantId: "tenant", parkId: "park", eventType: "test",
      eventVersion: 1, orderingKey: "test:1", sequence: "1", eventOrdinal: 0,
      payload: {}, payloadHash: "a".repeat(64), attemptCount: 0, claimEpoch: "0",
      claimToken: randomUUID()
    };
    const delivery = {
      id: randomUUID(), scope: { tenantId: "tenant", parkId: "park" },
      notificationId: randomUUID(), recipientUserId: randomUUID(), channel: "email" as const,
      version: 1, attemptCount: 0, maxAttempts: 8, claimEpoch: "0", claimToken: randomUUID()
    };
    await assert.rejects(events.publish(event),
      (error) => errorCode(error) === "property-runtime-unavailable");
    await assert.rejects(channels.deliver(delivery),
      (error) => errorCode(error) === "property-runtime-unavailable");
    events.register({ publish: async (value) => { published.push(value.eventId); } });
    channels.register("email", {
      deliver: async (value) => { delivered.push(value.notificationId); }
    });
    await events.publish(event);
    await channels.deliver(delivery);
    assert.deepEqual(published, [event.eventId]);
    assert.deepEqual(delivered, [delivery.notificationId]);
  });
});
