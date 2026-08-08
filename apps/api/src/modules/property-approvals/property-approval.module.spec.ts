import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PROJECTION_PORT,
  PROPERTY_MUTATION_RECEIPT_PORT
} from "@jinhu/shared";
import { PropertyApprovalModule } from "./property-approval.module";
import { PropertyApprovalService } from "./property-approval.service";
import { DatabasePropertyMutationReceiptAdapter } from
  "./property-mutation-receipt.adapter";
import { DatabasePropertyApprovalAuthorizationAdapter } from
  "./property-approval.authorization";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectRegistry,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyEventPublisherRegistry,
  PropertyNotificationChannelRegistry
} from "./property-approval.registries";
import {
  PROPERTY_APPROVAL_AUTHORIZATION_PORT,
  PROPERTY_APPROVAL_EFFECT_ADAPTERS,
  PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS,
  PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT,
  PROPERTY_APPROVAL_OUTBOX_PORT,
  PROPERTY_APPROVAL_POLICY_PORT,
  PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT,
  PROPERTY_RUNTIME_CONTROL_PORT
} from "./property-approval.ports";
import { DatabasePropertyRuntimeControlAdapter } from "./property-runtime-control";
import { PropertyApprovalRuntimeOutboxAdapter } from
  "./outbox/property-approval-outbox.adapter";
import { PropertyNotificationProjectionConsumer } from
  "./outbox/property-notification.consumer";
import { DatabasePropertyRuntimeAuthorizationAdapter } from
  "./outbox/property-runtime-authorization.adapter";
import {
  PROPERTY_EVENT_PUBLISHER,
  PROPERTY_INCIDENT_AUTHORIZATION
} from "./outbox/property-event-runtime.contracts";
import {
  PROPERTY_NOTIFICATION_AUTHORIZATION,
  PROPERTY_NOTIFICATION_CHANNEL
} from "./outbox/property-notification.contracts";
import { PropertyApprovalExecutionWorker } from "./property-approval.execution.worker";
import { PropertyApprovalRuntimeScheduler } from "./property-approval.runtime.scheduler";
import { PropertyLocalRuntimeComposition } from "./outbox/property-local-runtime.transport";

type Provider = { provide?: unknown; useExisting?: unknown } | unknown;

describe("PropertyApprovalModule provider authority", () => {
  it("binds every runtime token to one real replaceable singleton", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PropertyApprovalModule
    ) as Provider[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      PropertyApprovalModule
    ) as unknown[];
    const binding = (token: unknown) => providers.find(
      (provider): provider is { provide: unknown; useExisting: unknown } =>
        typeof provider === "object" && provider !== null
        && (provider as { provide?: unknown }).provide === token
    )?.useExisting;
    assert.equal(binding(PROPERTY_APPROVAL_POLICY_PORT), FrozenPropertyApprovalPolicyResolver);
    assert.equal(binding(PROPERTY_APPROVAL_EFFECT_ADAPTERS), PropertyApprovalEffectRegistry);
    assert.equal(
      binding(PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS),
      PropertyApprovalEffectProofVerifierRegistryService
    );
    assert.equal(binding(PROPERTY_RUNTIME_CONTROL_PORT), DatabasePropertyRuntimeControlAdapter);
    assert.equal(
      binding(PROPERTY_MUTATION_RECEIPT_PORT),
      DatabasePropertyMutationReceiptAdapter
    );
    assert.equal(binding(PROPERTY_APPROVAL_COMMAND_PORT), PropertyApprovalService);
    assert.equal(binding(PROPERTY_APPROVAL_PROJECTION_PORT), PropertyApprovalService);
    assert.equal(binding(PROPERTY_APPROVAL_OUTBOX_PORT), PropertyApprovalRuntimeOutboxAdapter);
    assert.equal(
      binding(PROPERTY_APPROVAL_AUTHORIZATION_PORT),
      DatabasePropertyApprovalAuthorizationAdapter
    );
    assert.equal(
      binding(PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT),
      DatabasePropertyApprovalAuthorizationAdapter
    );
    assert.equal(
      binding(PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT),
      DatabasePropertyApprovalAuthorizationAdapter
    );
    assert.equal(
      binding(PROPERTY_INCIDENT_AUTHORIZATION),
      DatabasePropertyRuntimeAuthorizationAdapter
    );
    assert.equal(
      binding(PROPERTY_NOTIFICATION_AUTHORIZATION),
      DatabasePropertyRuntimeAuthorizationAdapter
    );
    assert.equal(binding(PROPERTY_EVENT_PUBLISHER), PropertyEventPublisherRegistry);
    assert.equal(binding(PROPERTY_NOTIFICATION_CHANNEL), PropertyNotificationChannelRegistry);
    assert.ok(providers.includes(PropertyNotificationProjectionConsumer));
    assert.ok(providers.includes(PropertyApprovalExecutionWorker));
    assert.ok(providers.includes(PropertyApprovalRuntimeScheduler));
    assert.ok(providers.includes(PropertyLocalRuntimeComposition));
    for (const publicSurface of [
      FrozenPropertyApprovalPolicyResolver,
      PropertyApprovalEffectRegistry,
      PropertyApprovalEffectProofVerifierRegistryService,
      PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS,
      PROPERTY_RUNTIME_CONTROL_PORT,
      DatabasePropertyRuntimeControlAdapter,
      PROPERTY_MUTATION_RECEIPT_PORT,
      PROPERTY_APPROVAL_COMMAND_PORT,
      PROPERTY_APPROVAL_PROJECTION_PORT,
      PropertyEventPublisherRegistry,
      PropertyNotificationChannelRegistry,
      PropertyNotificationProjectionConsumer
    ]) assert.ok(exports.includes(publicSurface));
    assert.equal(
      providers.filter((provider) => typeof provider === "object" && provider !== null
        && (provider as { provide?: unknown }).provide === PROPERTY_MUTATION_RECEIPT_PORT).length,
      1
    );
    assert.equal(
      providers.filter((provider) => provider === DatabasePropertyMutationReceiptAdapter).length,
      1
    );
    assert.equal(
      exports.filter((value) => value === PROPERTY_MUTATION_RECEIPT_PORT).length,
      1
    );
    assert.equal(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PropertyApprovalModule)
        .some((provider: unknown) => typeof provider === "symbol"
          && provider !== PROPERTY_MUTATION_RECEIPT_PORT
          && String(provider).includes("PROPERTY_MUTATION_RECEIPT_PORT")),
      false
    );
    const moduleSource = readFileSync(require.resolve("./property-approval.module"), "utf8");
    assert.match(
      moduleSource,
      /import \{[\s\S]*PROPERTY_MUTATION_RECEIPT_PORT[\s\S]*\} from "@jinhu\/shared";/u
    );
    assert.doesNotMatch(moduleSource, /PROPERTY_MUTATION_RECEIPT_PORT\s*=\s*Symbol/u);
    assert.equal(
      providers.some((provider) => typeof provider === "function"
        && (provider as { name: string }).name.startsWith("UnconfiguredPropertyApproval")),
      false
    );
  });
});
