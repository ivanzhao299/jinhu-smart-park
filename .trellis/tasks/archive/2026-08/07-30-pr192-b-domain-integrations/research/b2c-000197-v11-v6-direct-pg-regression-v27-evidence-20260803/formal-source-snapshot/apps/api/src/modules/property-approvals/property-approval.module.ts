import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PROPERTY_APPROVAL_ENTITIES } from "./entities/property-approval.entities";
import { PropertyApprovalController } from "./property-approval.controller";
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
import { PropertyApprovalRepository } from "./property-approval.repository";
import { PropertyApprovalService } from "./property-approval.service";
import { DatabasePropertyApprovalAuthorizationAdapter } from
  "./property-approval.authorization";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectRegistry,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyEventPublisherRegistry,
  PropertyNotificationChannelRegistry
} from "./property-approval.registries";
import { PropertyApprovalIncidentRetryAdapter } from
  "./outbox/property-approval-incident-retry.adapter";
import {
  PROPERTY_APPROVAL_INCIDENT_RETRY,
  PROPERTY_EVENT_PUBLISHER,
  PROPERTY_EVENT_RUNTIME_STORE,
  PROPERTY_INCIDENT_AUTHORIZATION
} from "./outbox/property-event-runtime.contracts";
import { TypeOrmPropertyEventRuntimeStore } from
  "./outbox/property-event-runtime.repository";
import { PropertyEventPublisherWorker } from "./outbox/property-event.worker";
import {
  PropertyApprovalIncidentController,
  PropertyApprovalIncidentRetryController,
  PropertyEventIncidentController
} from "./outbox/property-incident.controller";
import { PropertyIncidentService } from "./outbox/property-incident.service";
import {
  PROPERTY_NOTIFICATION_AUTHORIZATION,
  PROPERTY_NOTIFICATION_CHANNEL,
  PROPERTY_NOTIFICATION_STORE
} from "./outbox/property-notification.contracts";
import { PropertyNotificationController } from "./outbox/property-notification.controller";
import { TypeOrmPropertyNotificationStore } from
  "./outbox/property-notification.repository";
import { PropertyNotificationService } from "./outbox/property-notification.service";
import { PropertyNotificationDeliveryWorker } from "./outbox/property-notification.worker";
import { PropertyApprovalRuntimeOutboxAdapter } from
  "./outbox/property-approval-outbox.adapter";
import { PropertyNotificationProjectionConsumer } from
  "./outbox/property-notification.consumer";
import { DatabasePropertyRuntimeAuthorizationAdapter } from
  "./outbox/property-runtime-authorization.adapter";
import { DatabasePropertyRuntimeControlAdapter } from "./property-runtime-control";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PROJECTION_PORT,
  PROPERTY_MUTATION_RECEIPT_PORT
} from "@jinhu/shared";
import { DatabasePropertyMutationReceiptAdapter } from
  "./property-mutation-receipt.adapter";

@Module({
  imports: [TypeOrmModule.forFeature([...PROPERTY_APPROVAL_ENTITIES])],
  controllers: [
    PropertyApprovalController,
    PropertyEventIncidentController,
    PropertyApprovalIncidentController,
    PropertyApprovalIncidentRetryController,
    PropertyNotificationController
  ],
  providers: [
    PropertyApprovalRepository,
    PropertyApprovalService,
    TypeOrmPropertyEventRuntimeStore,
    TypeOrmPropertyNotificationStore,
    PropertyIncidentService,
    PropertyNotificationService,
    PropertyApprovalIncidentRetryAdapter,
    PropertyApprovalRuntimeOutboxAdapter,
    PropertyNotificationProjectionConsumer,
    DatabasePropertyApprovalAuthorizationAdapter,
    DatabasePropertyRuntimeAuthorizationAdapter,
    FrozenPropertyApprovalPolicyResolver,
    PropertyApprovalEffectRegistry,
    PropertyApprovalEffectProofVerifierRegistryService,
    PropertyEventPublisherRegistry,
    PropertyNotificationChannelRegistry,
    DatabasePropertyRuntimeControlAdapter,
    DatabasePropertyMutationReceiptAdapter,
    // These workers have explicit run() entry points and no lifecycle hook.
    // A scheduler may invoke the exported singleton; module creation never
    // starts a second loop or performs background work.
    PropertyEventPublisherWorker,
    PropertyNotificationDeliveryWorker,
    {
      provide: PROPERTY_APPROVAL_POLICY_PORT,
      useExisting: FrozenPropertyApprovalPolicyResolver
    },
    {
      provide: PROPERTY_APPROVAL_AUTHORIZATION_PORT,
      useExisting: DatabasePropertyApprovalAuthorizationAdapter
    },
    {
      provide: PROPERTY_APPROVAL_EFFECT_ADAPTERS,
      useExisting: PropertyApprovalEffectRegistry
    },
    {
      provide: PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS,
      useExisting: PropertyApprovalEffectProofVerifierRegistryService
    },
    {
      provide: PROPERTY_APPROVAL_OUTBOX_PORT,
      useExisting: PropertyApprovalRuntimeOutboxAdapter
    },
    {
      provide: PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT,
      useExisting: DatabasePropertyApprovalAuthorizationAdapter
    },
    {
      provide: PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT,
      useExisting: DatabasePropertyApprovalAuthorizationAdapter
    },
    {
      provide: PROPERTY_EVENT_RUNTIME_STORE,
      useExisting: TypeOrmPropertyEventRuntimeStore
    },
    {
      provide: PROPERTY_APPROVAL_INCIDENT_RETRY,
      useExisting: PropertyApprovalIncidentRetryAdapter
    },
    {
      provide: PROPERTY_NOTIFICATION_STORE,
      useExisting: TypeOrmPropertyNotificationStore
    },
    {
      provide: PROPERTY_EVENT_PUBLISHER,
      useExisting: PropertyEventPublisherRegistry
    },
    {
      provide: PROPERTY_INCIDENT_AUTHORIZATION,
      useExisting: DatabasePropertyRuntimeAuthorizationAdapter
    },
    {
      provide: PROPERTY_NOTIFICATION_AUTHORIZATION,
      useExisting: DatabasePropertyRuntimeAuthorizationAdapter
    },
    {
      provide: PROPERTY_NOTIFICATION_CHANNEL,
      useExisting: PropertyNotificationChannelRegistry
    },
    {
      provide: PROPERTY_RUNTIME_CONTROL_PORT,
      useExisting: DatabasePropertyRuntimeControlAdapter
    },
    {
      provide: PROPERTY_MUTATION_RECEIPT_PORT,
      useExisting: DatabasePropertyMutationReceiptAdapter
    },
    {
      provide: PROPERTY_APPROVAL_COMMAND_PORT,
      useExisting: PropertyApprovalService
    },
    {
      provide: PROPERTY_APPROVAL_PROJECTION_PORT,
      useExisting: PropertyApprovalService
    }
  ],
  exports: [
    PropertyApprovalService,
    PropertyApprovalRepository,
    PROPERTY_APPROVAL_POLICY_PORT,
    PROPERTY_APPROVAL_AUTHORIZATION_PORT,
    PROPERTY_APPROVAL_EFFECT_ADAPTERS,
    PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS,
    PROPERTY_APPROVAL_OUTBOX_PORT,
    PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT,
    PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT,
    PROPERTY_EVENT_RUNTIME_STORE,
    PROPERTY_EVENT_PUBLISHER,
    PROPERTY_INCIDENT_AUTHORIZATION,
    PROPERTY_APPROVAL_INCIDENT_RETRY,
    PROPERTY_NOTIFICATION_STORE,
    PROPERTY_NOTIFICATION_AUTHORIZATION,
    PROPERTY_NOTIFICATION_CHANNEL,
    FrozenPropertyApprovalPolicyResolver,
    PropertyApprovalEffectRegistry,
    PropertyApprovalEffectProofVerifierRegistryService,
    PropertyEventPublisherRegistry,
    PropertyNotificationChannelRegistry,
    PropertyNotificationProjectionConsumer,
    PROPERTY_RUNTIME_CONTROL_PORT,
    PROPERTY_MUTATION_RECEIPT_PORT,
    PROPERTY_APPROVAL_COMMAND_PORT,
    PROPERTY_APPROVAL_PROJECTION_PORT,
    DatabasePropertyRuntimeControlAdapter,
    PropertyEventPublisherWorker,
    PropertyNotificationDeliveryWorker
  ]
})
export class PropertyApprovalModule {}
