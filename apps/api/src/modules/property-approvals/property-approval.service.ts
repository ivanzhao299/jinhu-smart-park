import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalSummary,
  CreatePendingPropertyApprovalCommand,
  CreatePendingPropertyApprovalResult,
  EntityManagerPort,
  PropertyApprovalActiveBySourceQuery,
  PropertyApprovalCommandPort,
  PropertyApprovalJsonValue,
  PropertyPaginatedResult,
  PropertyApprovalProjectionPort,
  PropertyApprovalRequestByIdQuery,
  PropertyApprovalRequestProjection,
  PropertyApprovalRequestsBySourceQuery,
  TenantParkScope,
  TrackBApprovalActionId
} from "@jinhu/shared";
import {
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  TRACK_B_APPROVAL_EFFECT_MANIFEST
} from "@jinhu/shared";
import { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  PropertyApprovalAuditEntity,
  PropertyApprovalDecisionEntity,
  PropertyApprovalRequestEntity,
  PropertyExecutionEffectManifestEntity,
  PropertyMutationReceiptEntity
} from "./entities/property-approval.entities";
import type {
  PropertyApprovalAuthorizationPort,
  PropertyApprovalEffectAdapterRegistry,
  PropertyApprovalEffectProofVerifierRegistry,
  PropertyApprovalEffectReceipt,
  PropertyApprovalIncidentAuthorizationPort,
  PropertyApprovalOutboxPort,
  FrozenApprovalPolicy,
  PropertyApprovalPolicyPort,
  PropertyApprovalReadAuthorizationPort,
  PropertyApprovalReadPredicate,
  PropertyRuntimeControlPort
} from "./property-approval.ports";
import {
  PROPERTY_APPROVAL_AUTHORIZATION_PORT,
  PROPERTY_APPROVAL_EFFECT_ADAPTERS,
  PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT,
  PROPERTY_APPROVAL_OUTBOX_PORT,
  PROPERTY_APPROVAL_POLICY_PORT,
  PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT,
  PROPERTY_RUNTIME_CONTROL_PORT,
  PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS
} from "./property-approval.ports";
import { propertyApprovalError, translateApprovalDatabaseError } from "./property-approval.error";
import { PropertyApprovalRepository } from "./property-approval.repository";
import type {
  PersistedApprovalOutboxEvidence,
  PropertyApprovalExecutionAuthority
} from "./property-approval.repository";
import type {
  PropertyApprovalListQueryDto,
  PropertyApprovalDecisionDto,
  PropertyApprovalWithdrawDto,
  SubmitPropertyApprovalCommand
} from "./dto/property-approval.dto";
import { decodeEligibilitySnapshot } from "./property-approval.authorization";

export interface CreatePropertyApprovalDraftCommand {
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  submitterId: string;
  clientKey: string;
  businessIntentKey: string;
  canonicalPayload: Record<string, unknown>;
  payloadSchemaVersion: number;
  amount?: string | null;
  currency?: string | null;
}

export const APPROVAL_EXECUTION_LEASE_MS = 30_000;
export const APPROVAL_EXECUTION_HEARTBEAT_MS = 10_000;
export const APPROVAL_EXECUTION_MAX_ATTEMPTS = 8;

export interface ApprovalExecutionClaim {
  requestId: string;
  claimEpoch: string;
  claimToken: string;
  workerId: string;
  executionVersion: number;
  leaseExpiresAt: Date;
  reconcileRequired: boolean;
}

export class ApprovalExecutionError extends Error {
  constructor(
    readonly category: "business" | "infra" | "commit_unknown",
    readonly stableCode: string,
    readonly redactedMessage: string
  ) {
    super(stableCode);
  }
}

@Injectable()
export class PropertyApprovalService
implements PropertyApprovalCommandPort, PropertyApprovalProjectionPort {
  constructor(
    private readonly repository: PropertyApprovalRepository,
    @Inject(PROPERTY_APPROVAL_POLICY_PORT)
    private readonly policyPort: PropertyApprovalPolicyPort,
    @Inject(PROPERTY_APPROVAL_AUTHORIZATION_PORT)
    private readonly authorizationPort: PropertyApprovalAuthorizationPort,
    @Inject(PROPERTY_APPROVAL_EFFECT_ADAPTERS)
    private readonly adapters: PropertyApprovalEffectAdapterRegistry,
    @Inject(PROPERTY_APPROVAL_OUTBOX_PORT)
    private readonly outbox: PropertyApprovalOutboxPort,
    @Inject(PROPERTY_APPROVAL_READ_AUTHORIZATION_PORT)
    private readonly readAuthorization: PropertyApprovalReadAuthorizationPort,
    @Inject(PROPERTY_APPROVAL_INCIDENT_AUTHORIZATION_PORT)
    private readonly incidentAuthorization: PropertyApprovalIncidentAuthorizationPort,
    @Inject(PROPERTY_RUNTIME_CONTROL_PORT)
    private readonly runtimeControls: PropertyRuntimeControlPort,
    @Inject(PROPERTY_APPROVAL_EFFECT_PROOF_VERIFIERS)
    private readonly proofVerifiers: PropertyApprovalEffectProofVerifierRegistry
  ) {}

  async createDraft(
    scope: TenantParkScope,
    command: CreatePropertyApprovalDraftCommand
  ) {
    try {
      return await this.repository.transaction(
        (manager) => this.createDraftWithManager(manager, scope, command)
      );
    } catch (error) {
      if (isHttpException(error)) throw error;
      return translateApprovalDatabaseError(error);
    }
  }

  async createDraftWithManager(
    manager: EntityManager,
    scope: TenantParkScope,
    command: CreatePropertyApprovalDraftCommand,
    options: { conflictSafe?: boolean; strictPort?: boolean } = {}
  ): Promise<PropertyApprovalRequestEntity | null> {
    const canonicalPayload = options.strictPort
      ? command.canonicalPayload
      : normalizeObject(command.canonicalPayload);
    const payloadHash = options.strictPort
      ? propertyApprovalCanonicalHash(canonicalPayload as Record<string, PropertyApprovalJsonValue>)
      : hash(canonicalPayload);
    validateDraft(command, payloadHash, options.strictPort === true);
    if (!options.conflictSafe) {
        const existing = await this.repository.findByClientKey(
          manager,
          scope,
          command.requesterId,
          command.actionId,
          command.clientKey
        );
        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw propertyApprovalError("idempotency-key-conflict");
          }
          return existing;
        }
    }
    const policy = await this.policyPort.resolve({
          manager,
          scope,
          actionId: command.actionId,
          sourceType: command.sourceType,
          sourceId: command.sourceId,
          requesterId: command.requesterId,
          canonicalPayload
        });
    validateFrozenPolicy(
          command.actionId,
          policy,
          command.amount ?? null,
          command.currency ?? null,
          canonicalPayload
        );
    const exclusions = freezeActorExclusions(command, policy.exclusions);
    if (options.strictPort) validateEligibleCheckers(policy, exclusions);
    const now = options.strictPort ? await this.repository.dbNow(manager) : undefined;
    const request = this.repository.requestRepository(manager).create({
          id: options.conflictSafe ? randomUUID() : undefined,
          ...scope,
          actionId: command.actionId,
          sourceType: command.sourceType,
          sourceId: command.sourceId,
          sourceExpectedVersion: command.sourceExpectedVersion,
          requesterId: command.requesterId,
          submitterId: command.submitterId,
          clientIdempotencyKey: command.clientKey,
          businessIntentKey: command.businessIntentKey,
          canonicalPayload,
          payloadSchemaVersion: command.payloadSchemaVersion,
          payloadHash,
          amount: command.amount ?? null,
          currency: command.currency ?? null,
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          policyHash: policy.policyHash,
          decisionStatus: "draft",
          executionStatus: "not_started",
          decisionVersion: 1,
          executionVersion: 1,
          executionIdempotencyKey: `approval-execution:${randomUUID()}`,
          claimEpoch: "0",
          claimToken: null,
          workerId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          attemptCount: 0,
          nextRetryAt: null,
          reconcileRequired: false,
          lastErrorCategory: null,
          lastErrorCode: null,
          lastErrorRedactedMessage: null,
          infraExhaustedAt: null,
          submittedAt: null,
          decidedAt: null,
          executedAt: null,
          createdAt: now,
          updatedAt: now
        });
    const saved = options.conflictSafe
      ? await this.repository.insertRequestOnConflict(manager, request).then(
        (inserted) => inserted ? request : null
      )
      : await this.repository.requestRepository(manager).save(request);
    if (!saved) return null;
        const stageRepository = this.repository.stageRepository(manager);
        await stageRepository.save(
          policy.stages.map((stage) => stageRepository.create({
            ...scope,
            requestId: saved.id,
            ...stage,
            eligibilityPolicySnapshot: stage.eligibilityPolicySnapshot,
            approvedCount: 0,
            rejectedCount: 0,
            stageStatus: "pending" as const,
            version: 1
          }))
        );
        if (exclusions.length > 0) {
          const exclusionRepository = this.repository.exclusionRepository(manager);
          await exclusionRepository.save(
            exclusions.map((exclusion) => exclusionRepository.create({
              ...scope,
              requestId: saved.id,
              ...exclusion
            }))
          );
        }
        const manifestRepository = this.repository.manifestRepository(manager);
        await manifestRepository.save(
          policy.effects.map((effect) => manifestRepository.create({
            ...scope,
            requestId: saved.id,
            ...effect,
            lineAmount: effect.lineAmount ?? null,
            currency: effect.currency ?? null
          }))
        );
        await this.writeAudit(manager, saved, command.requesterId, "property.approval.draft", null, "draft");
    return saved;
  }

  async submit(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    command: SubmitPropertyApprovalCommand
  ) {
    try {
      return await this.repository.transaction(
        (manager) => this.submitWithManager(manager, scope, actor, requestId, command)
      );
    } catch (error) {
      if (isHttpException(error)) throw error;
      return translateApprovalDatabaseError(error);
    }
  }

  async submitWithManager(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    command: SubmitPropertyApprovalCommand,
    options: { strictPort?: boolean } = {}
  ): Promise<PropertyApprovalRequestEntity> {
    assertUuid(requestId);
    validateClientKey(command.clientKey);
    const requestHash = options.strictPort
      ? portSubmitRequestHash(requestId)
      : hash({ requestId, expectedDecisionVersion: command.expectedDecisionVersion });
        const request = await this.repository.lockRequest(manager, scope, requestId);
        if (!request) throw propertyApprovalError("property-resource-not-found");
        const existingMutation = await this.repository.findMutation(manager, {
          scope,
          actorId: actor.sub,
          actionId: "property.approval.submit",
          targetId: requestId,
          clientKey: command.clientKey
        });
        if (existingMutation) {
          if (options.strictPort) {
            if (request.decisionStatus === "draft") {
              throw propertyApprovalError("approval-reconcile-partial");
            }
            assertPortSubmitReceipt(existingMutation, request);
          }
          else assertReplayableMutation(existingMutation, requestHash);
          return request;
        }
        if (request.submitterId !== actor.sub) throw propertyApprovalError("property-action-forbidden");
        if (request.decisionStatus !== "draft") throw propertyApprovalError("approval-already-decided");
        if (request.decisionVersion !== command.expectedDecisionVersion) {
          throw propertyApprovalError("property-version-conflict", {
            latestVersion: request.decisionVersion
          });
        }
    const mutationRepository = this.repository.mutationRepository(manager);
    const mutation = mutationRepository.create({
          id: options.strictPort ? randomUUID() : undefined,
          receiptContractVersion: "legacy-v1",
          identityKind: null,
          businessOccurrenceKey: null,
          taskKey: null,
          identitySourceType: null,
          ...scope,
          actorId: actor.sub,
          actionId: "property.approval.submit",
          targetId: requestId,
          clientKey: command.clientKey,
          requestHash,
          receiptStatus: "started",
          resultRef: null,
          resultHash: null,
          resultVersion: null,
          completedAt: null
    });
    if (options.strictPort) {
      const inserted = await this.repository.insertMutationOnConflict(manager, mutation);
      if (!inserted) {
        const concurrent = await this.repository.findMutation(manager, {
          scope,
          actorId: actor.sub,
          actionId: "property.approval.submit",
          targetId: requestId,
          clientKey: command.clientKey
        });
        if (!concurrent) throw propertyApprovalError("property-runtime-unavailable");
        assertPortSubmitReceipt(concurrent, request);
        return request;
      }
    } else {
      await mutationRepository.save(mutation);
    }
        const expectedStatus = request.decisionStatus;
        const expectedVersion = request.decisionVersion;
        request.decisionStatus = "pending_approval";
        request.decisionVersion = expectedVersion + 1;
    const submittedAt = options.strictPort ? await this.repository.dbNow(manager) : new Date();
        request.submittedAt = submittedAt;
        request.updatedAt = submittedAt;
        requireCas(await this.repository.casDecisionRequest(
          manager,
          scope,
          request.id,
          expectedStatus,
          expectedVersion,
          {
            decisionStatus: request.decisionStatus,
            decisionVersion: request.decisionVersion,
            submittedAt: request.submittedAt,
            updatedAt: request.updatedAt
          }
        ));
        const saved = request;
        await this.writeAudit(manager, saved, actor.sub, "property.approval.submit", "draft", "submitted");
        await this.writeAudit(manager, saved, actor.sub, "property.approval.activate", "submitted", "pending_approval");
    if (options.strictPort) completePortSubmitMutation(mutation, saved);
    else completeMutation(mutation, requestId, "submitted", saved);
        await mutationRepository.save(mutation);
        return saved;
  }

  async createPendingRequest(
    managerPort: EntityManagerPort,
    command: CreatePendingPropertyApprovalCommand
  ): Promise<CreatePendingPropertyApprovalResult> {
    const manager = unwrapApprovalManager(managerPort);
    const normalized = validateAndNormalizePortCommand(command);
    let savepointEstablished = false;
    try {
      await manager.query("SAVEPOINT jinhu_approval_port_v2");
      savepointEstablished = true;
      const identityReplay = await this.resolvePortIdentityReplay(manager, normalized);
      let selected = identityReplay?.request ?? null;
      let createCommand = normalized;
      let disposition: CreatePendingPropertyApprovalResult["disposition"] =
        identityReplay?.disposition ?? "created";
      if (!selected) {
        const active = await this.repository.findActiveBySource(
          manager, normalized.scope, normalized
        );
        if (active.length > 1) throw propertyApprovalError("approval-reconcile-partial");
        if (active[0]) {
          throw propertyApprovalError("property-version-conflict", {
            latestVersion: active[0].decisionVersion
          });
        }
        // The owning domain must already hold its source-row lock on this caller manager.
        // This pre-insert check is the monotonicity authority once terminal rows leave
        // the corrected active partial unique index.
        const terminal = await this.repository.findLatestTerminalBySource(
          manager, normalized.scope, normalized
        );
        if (terminal && normalized.sourceExpectedVersion < terminal.sourceExpectedVersion) {
          throw propertyApprovalError("approval-source-changed", {
            latestVersion: terminal.sourceExpectedVersion
          });
        }
        if (terminal && normalized.sourceExpectedVersion === terminal.sourceExpectedVersion) {
          if (!isRetryableApprovalTerminal(terminal)) {
            throw propertyApprovalError("approval-source-changed", {
              latestVersion: terminal.sourceExpectedVersion
            });
          }
          createCommand = {
            ...normalized,
            businessIntentKey: retryApprovalBusinessIntentKey(normalized)
          };
        }
        selected = await this.createDraftWithManager(manager, normalized.scope, createCommand, {
          conflictSafe: true,
          strictPort: true
        });
        if (!selected) {
          const resolution = await this.resolvePortConflict(manager, createCommand);
          selected = resolution.request;
          disposition = resolution.disposition;
        }
      }
      if (selected.decisionStatus === "draft") {
        selected = await this.submitWithManager(
          manager,
          normalized.scope,
          portActor(normalized),
          selected.id,
          {
            clientKey: selected.clientIdempotencyKey,
            expectedDecisionVersion: 1
          },
          { strictPort: true }
        );
      } else {
        assertLegalTerminalOrActivePair(selected);
        await this.assertPortReplayReceipt(manager, selected);
      }
      await manager.query("RELEASE SAVEPOINT jinhu_approval_port_v2");
      return { disposition, request: projectApprovalRequest(selected) };
    } catch (error) {
      if (savepointEstablished) {
        try {
          await manager.query("ROLLBACK TO SAVEPOINT jinhu_approval_port_v2");
          await manager.query("RELEASE SAVEPOINT jinhu_approval_port_v2");
        } catch {
          throw propertyApprovalError("property-runtime-unavailable", {
            recoveryAction: "retry-with-same-client-key"
          });
        }
      }
      if (isHttpException(error)) throw error;
      const portDatabaseError = classifyPortDatabaseError(error);
      if (portDatabaseError) throw portDatabaseError;
      try {
        return translateApprovalDatabaseError(error);
      } catch (translated) {
        if (isHttpException(translated)) throw translated;
      }
      throw propertyApprovalError("property-runtime-unavailable", {
        recoveryAction: "retry-with-same-client-key"
      });
    }
  }

  private async resolvePortIdentityReplay(
    manager: EntityManager,
    command: CreatePendingPropertyApprovalCommand
  ): Promise<{
    disposition: "replayed-client-key" | "replayed-business-intent";
    request: PropertyApprovalRequestEntity;
  } | null> {
    const payloadHash = propertyApprovalCanonicalHash(command.canonicalPayload);
    const byClient = await this.repository.findByClientKey(
      manager, command.scope, command.requesterId, command.actionId, command.clientKey
    );
    if (byClient) {
      assertExactPortRequest(byClient, command, payloadHash);
      return { disposition: "replayed-client-key", request: byClient };
    }
    const byIntent = await this.repository.findByBusinessIntent(
      manager, command.scope, command.actionId, command.businessIntentKey
    );
    if (byIntent) {
      if (isRetryableApprovalTerminal(byIntent)) return null;
      assertExactPortRequest(byIntent, command, payloadHash);
      return { disposition: "replayed-business-intent", request: byIntent };
    }
    return null;
  }

  async findById(
    managerPort: EntityManagerPort,
    query: PropertyApprovalRequestByIdQuery
  ): Promise<PropertyApprovalRequestProjection | null> {
    const manager = unwrapApprovalManager(managerPort);
    validatePortScope(query.scope);
    assertUuid(query.requestId);
    const request = await this.repository.lockRequest(manager, query.scope, query.requestId);
    return request ? projectApprovalRequest(request) : null;
  }

  async findActiveBySource(
    managerPort: EntityManagerPort,
    query: PropertyApprovalActiveBySourceQuery
  ): Promise<PropertyApprovalRequestProjection | null> {
    const manager = unwrapApprovalManager(managerPort);
    validatePortSourceQuery(query);
    const requests = await this.repository.findActiveBySource(manager, query.scope, query);
    if (requests.length > 1) throw propertyApprovalError("approval-reconcile-partial");
    return requests[0] ? projectApprovalRequest(requests[0]) : null;
  }

  async listBySource(
    managerPort: EntityManagerPort,
    query: PropertyApprovalRequestsBySourceQuery
  ): Promise<readonly PropertyApprovalRequestProjection[]> {
    const manager = unwrapApprovalManager(managerPort);
    validatePortSourceQuery(query);
    return (await this.repository.listBySource(manager, query.scope, query))
      .map(projectApprovalRequest);
  }

  private async resolvePortConflict(
    manager: EntityManager,
    command: CreatePendingPropertyApprovalCommand
  ): Promise<{
    disposition: "replayed-client-key" | "replayed-business-intent";
    request: PropertyApprovalRequestEntity;
  }> {
    const payloadHash = propertyApprovalCanonicalHash(command.canonicalPayload);
    const byClient = await this.repository.findByClientKey(
      manager, command.scope, command.requesterId, command.actionId, command.clientKey
    );
    if (byClient) {
      assertExactPortRequest(byClient, command, payloadHash);
      if (byClient.clientIdempotencyKey !== command.clientKey) {
        throw propertyApprovalError("idempotency-key-conflict");
      }
      return { disposition: "replayed-client-key", request: byClient };
    }
    const byIntent = await this.repository.findByBusinessIntent(
      manager, command.scope, command.actionId, command.businessIntentKey
    );
    if (byIntent && !isRetryableApprovalTerminal(byIntent)) {
      assertExactPortRequest(byIntent, command, payloadHash);
      return { disposition: "replayed-business-intent", request: byIntent };
    }
    const active = await this.repository.findActiveBySource(manager, command.scope, command);
    if (active.length > 1) throw propertyApprovalError("approval-reconcile-partial");
    if (active[0]) {
      throw propertyApprovalError("property-version-conflict", {
        latestVersion: active[0].decisionVersion
      });
    }
    const terminal = await this.repository.findLatestTerminalBySource(
      manager, command.scope, command
    );
    if (
      terminal
      && (
        command.sourceExpectedVersion < terminal.sourceExpectedVersion
        || (command.sourceExpectedVersion === terminal.sourceExpectedVersion
          && !isRetryableApprovalTerminal(terminal))
      )
    ) {
      throw propertyApprovalError("approval-source-changed", {
        latestVersion: terminal.sourceExpectedVersion
      });
    }
    throw propertyApprovalError("property-runtime-unavailable", {
      recoveryAction: "retry-with-same-client-key"
    });
  }

  private async assertPortReplayReceipt(
    manager: EntityManager,
    request: PropertyApprovalRequestEntity
  ): Promise<void> {
    const receipts = await this.repository.findSubmitMutations(
      manager,
      { tenantId: request.tenantId, parkId: request.parkId },
      request.submitterId,
      request.id
    );
    if (receipts.length !== 1) throw propertyApprovalError("approval-reconcile-partial");
    assertPortSubmitReceipt(receipts[0]!, request);
  }

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PropertyApprovalListQueryDto
  ): Promise<PropertyPaginatedResult<ApprovalSummary>> {
    const predicate = await this.readAuthorization.predicate({
      scope,
      actorId: actor.sub,
      permissions: actor.permissions
    });
    const [requests, total] = await this.repository.list(scope, predicate, query);
    const currentStages = await this.repository.findCurrentStages(
      scope,
      requests.map((request) => request.id)
    );
    const decisionCounts = await this.repository.findDecisionCounts(
      scope,
      requests.map((request) => request.id)
    );
    return {
      items: await Promise.all(requests.map(async (request) => ({
        requestId: request.id,
        actionId: request.actionId,
        decisionStatus: request.decisionStatus,
        executionStatus: request.executionStatus,
        requestedAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        allowedActions: await this.allowedActions(
          request,
          currentStages.get(request.id),
          decisionCounts.get(request.id) ?? 0,
          actor,
          predicate
        )
      }))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      allowedActions: []
    };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, requestId: string) {
    assertUuid(requestId);
    const detail = await this.repository.findDetail(scope, requestId);
    if (!detail) throw propertyApprovalError("property-resource-not-found");
    const predicate = await this.readAuthorization.predicate({
      scope,
      actorId: actor.sub,
      permissions: actor.permissions
    });
    if (!predicateAllowsRequest(predicate, detail.request, actor.sub)) {
      throw propertyApprovalError("property-resource-not-found");
    }
    await this.readAuthorization.authorizeSource({
      scope,
      actorId: actor.sub,
      sourceType: detail.request.sourceType,
      sourceId: detail.request.sourceId,
      predicate
    });
    const currentStage = detail.stages.find((stage) => stage.stageStatus === "pending");
    return {
      request: {
        requestId: detail.request.id,
        actionId: detail.request.actionId,
        sourceType: detail.request.sourceType,
        sourceId: detail.request.sourceId,
        sourceExpectedVersion: detail.request.sourceExpectedVersion,
        requesterId: detail.request.requesterId,
        decisionStatus: detail.request.decisionStatus,
        executionStatus: detail.request.executionStatus,
        decisionVersion: detail.request.decisionVersion,
        executionVersion: detail.request.executionVersion,
        amount: detail.request.amount,
        currency: detail.request.currency,
        requestedAt: detail.request.createdAt.toISOString(),
        submittedAt: detail.request.submittedAt?.toISOString() ?? null,
        decidedAt: detail.request.decidedAt?.toISOString() ?? null,
        executedAt: detail.request.executedAt?.toISOString() ?? null,
        updatedAt: detail.request.updatedAt.toISOString(),
        allowedActions: await this.allowedActions(
          detail.request,
          currentStage,
          detail.decisions.length,
          actor,
          predicate
        )
      },
      stages: detail.stages.map((stage) => ({
        stageId: stage.id,
        stageCode: stage.stageCode,
        stageOrdinal: stage.stageOrdinal,
        requiredCount: stage.requiredCount,
        approvedCount: stage.approvedCount,
        rejectedCount: stage.rejectedCount,
        stageStatus: stage.stageStatus,
        version: stage.version,
        eligibilityPolicyHash: stage.eligibilityPolicyHash
      })),
      decisions: predicate.canAudit
        && predicate.auditorRequestIds.includes(detail.request.id)
        ? detail.decisions.map((decision) => ({
            decisionId: decision.id,
            stageId: decision.stageId,
            actorId: decision.actorId,
            decision: decision.decision,
            reason: decision.reason,
            decidedAt: decision.decidedAt.toISOString()
          }))
        : []
    };
  }

  async withdraw(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    command: PropertyApprovalWithdrawDto
  ) {
    assertUuid(requestId);
    if (!command.reason.trim()) throw propertyApprovalError("property-validation-failed");
    validateClientKey(command.clientKey);
    const requestHash = hash({
      requestId,
      reason: command.reason.trim(),
      expectedDecisionVersion: command.expectedDecisionVersion
    });
    const predicate = await this.readAuthorization.predicate({
      scope,
      actorId: actor.sub,
      permissions: actor.permissions
    });
    try {
      return await this.repository.transaction(async (manager) => {
        const request = await this.repository.lockRequest(manager, scope, requestId);
        if (!request) throw propertyApprovalError("property-resource-not-found");
        if (!predicateAllowsRequest(predicate, request, actor.sub)) {
          throw propertyApprovalError("property-resource-not-found");
        }
        await this.readAuthorization.authorizeSource({
          scope,
          actorId: actor.sub,
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          predicate
        });
        const existingMutation = await this.repository.findMutation(manager, {
          scope,
          actorId: actor.sub,
          actionId: "property.approval.withdraw",
          targetId: requestId,
          clientKey: command.clientKey
        });
        if (existingMutation) {
          assertReplayableMutation(existingMutation, requestHash);
          return request;
        }
        if (request.requesterId !== actor.sub || request.decisionStatus !== "pending_approval") {
          throw propertyApprovalError("approval-withdraw-forbidden");
        }
        if (request.decisionVersion !== command.expectedDecisionVersion) {
          throw propertyApprovalError("property-version-conflict", {
            latestVersion: request.decisionVersion
          });
        }
        if (await this.repository.countDecisions(manager, scope, requestId)) {
          throw propertyApprovalError("approval-withdraw-forbidden");
        }
        const mutationRepository = this.repository.mutationRepository(manager);
        const mutation = await mutationRepository.save(mutationRepository.create({
          receiptContractVersion: "legacy-v1",
          ...scope,
          actorId: actor.sub,
          actionId: "property.approval.withdraw",
          targetId: requestId,
          clientKey: command.clientKey,
          requestHash,
          receiptStatus: "started",
          resultRef: null,
          resultHash: null,
          completedAt: null
        }));
        const from = request.decisionStatus;
        const expectedVersion = request.decisionVersion;
        request.decisionStatus = "withdrawn";
        request.executionStatus = "not_required";
        request.decisionVersion = expectedVersion + 1;
        request.decidedAt = new Date();
        request.updatedAt = new Date();
        requireCas(await this.repository.casDecisionRequest(
          manager,
          scope,
          request.id,
          from,
          expectedVersion,
          {
            decisionStatus: request.decisionStatus,
            executionStatus: request.executionStatus,
            decisionVersion: request.decisionVersion,
            decidedAt: request.decidedAt,
            updatedAt: request.updatedAt
          }
        ));
        const saved = request;
        await this.writeAudit(
          manager,
          saved,
          actor.sub,
          "property.approval.withdraw",
          from,
          "withdrawn",
          command.reason
        );
        completeMutation(mutation, requestId, "withdrawn", saved);
        await mutationRepository.save(mutation);
        return saved;
      });
    } catch (error) {
      if (isHttpException(error)) throw error;
      return translateApprovalDatabaseError(error);
    }
  }

  async decide(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    command: PropertyApprovalDecisionDto
  ) {
    assertUuid(requestId);
    assertUuid(command.stageId);
    validateClientKey(command.clientKey);
    const reason = command.reason?.trim() || null;
    if (command.decision === "reject" && !reason) {
      throw propertyApprovalError("property-validation-failed");
    }
    const requestHash = hash({
      decision: command.decision,
      reason,
      stageId: command.stageId,
      expectedStageVersion: command.expectedStageVersion,
      expectedRequestVersion: command.expectedRequestVersion
    });
    try {
      return await this.repository.transaction(async (manager) => {
        const request = await this.repository.lockRequest(manager, scope, requestId);
        if (!request) throw propertyApprovalError("property-resource-not-found");

        const existingMutation = await this.repository.findMutation(manager, {
          scope,
          actorId: actor.sub,
          actionId: "property.approval.decide",
          targetId: requestId,
          clientKey: command.clientKey
        });
        if (existingMutation) {
          if (existingMutation.requestHash !== requestHash) {
            throw propertyApprovalError("idempotency-key-conflict");
          }
          if (existingMutation.receiptStatus === "completed") return request;
          throw propertyApprovalError("property-runtime-unavailable", {
            recoveryAction: "retry-with-same-client-key"
          });
        }

        if (request.decisionStatus !== "pending_approval") {
          throw propertyApprovalError("approval-already-decided");
        }
        if (request.decisionVersion !== command.expectedRequestVersion) {
          throw propertyApprovalError("property-version-conflict", {
            latestVersion: request.decisionVersion
          });
        }

        // Global lock order: request first, then all stages in ordinal order.
        const stages = await this.repository.lockStages(manager, scope, requestId);
        const stage = stages.find((candidate) => candidate.id === command.stageId);
        if (!stage || stage.version !== command.expectedStageVersion) {
          throw propertyApprovalError("property-version-conflict", {
            latestVersion: stage?.version
          });
        }
        const currentStage = stages.find((candidate) => candidate.stageStatus === "pending");
        if (
          !currentStage
          || currentStage.id !== stage.id
          || stages.some((candidate) =>
            candidate.stageOrdinal < stage.stageOrdinal
            && candidate.stageStatus !== "approved"
          )
        ) throw propertyApprovalError("property-action-forbidden");
        if (hash(stage.eligibilityPolicySnapshot) !== stage.eligibilityPolicyHash) {
          throw propertyApprovalError("property-action-forbidden");
        }

        if (
          actor.sub === request.requesterId
          || actor.sub === request.submitterId
          || await this.repository.hasActorExclusion(manager, scope, requestId, actor.sub)
          || await this.repository.hasActorDecision(manager, scope, requestId, actor.sub)
        ) throw propertyApprovalError("approval-actor-separation-required");

        const authorization = await this.authorizationPort.authorizeDecision({
          manager,
          scope,
          actorId: actor.sub,
          requestId,
          actionId: request.actionId,
          stageId: stage.id,
          eligibilityPolicySnapshot: stage.eligibilityPolicySnapshot,
          eligibilityPolicyHash: stage.eligibilityPolicyHash
        });

        const mutationRepository = this.repository.mutationRepository(manager);
        const mutation = await mutationRepository.save(mutationRepository.create({
          receiptContractVersion: "legacy-v1",
          ...scope,
          actorId: actor.sub,
          actionId: "property.approval.decide",
          targetId: requestId,
          clientKey: command.clientKey,
          requestHash,
          receiptStatus: "started",
          resultRef: null,
          resultHash: null,
          completedAt: null
        }));

        const decisionRepository = manager.getRepository(PropertyApprovalDecisionEntity);
        await decisionRepository.save(decisionRepository.create({
          ...scope,
          requestId,
          stageId: stage.id,
          actorId: actor.sub,
          decision: command.decision,
          reason,
          actorPermissionSnapshot: authorization.permissionSnapshot,
          decisionPayloadHash: requestHash,
          supersedesDecisionId: null
        }));

        const fromDecisionStatus = request.decisionStatus;
        const expectedDecisionVersion = request.decisionVersion;
        const expectedStageStatus = stage.stageStatus;
        const expectedStageVersion = stage.version;
        if (command.decision === "reject") {
          stage.rejectedCount += 1;
          stage.stageStatus = "rejected";
          request.decisionStatus = "rejected";
          request.executionStatus = "not_required";
          request.decidedAt = new Date();
        } else {
          stage.approvedCount += 1;
          if (stage.approvedCount >= stage.requiredCount) stage.stageStatus = "approved";
          if (stages.every((candidate) =>
            candidate.id === stage.id
              ? stage.stageStatus === "approved"
              : candidate.stageStatus === "approved"
          )) {
            request.decisionStatus = "approved";
            request.decidedAt = new Date();
          }
        }
        stage.version = expectedStageVersion + 1;
        request.decisionVersion = expectedDecisionVersion + 1;
        request.updatedAt = new Date();
        requireCas(await this.repository.casStage(
          manager,
          scope,
          stage.id,
          expectedStageStatus,
          expectedStageVersion,
          {
            approvedCount: stage.approvedCount,
            rejectedCount: stage.rejectedCount,
            stageStatus: stage.stageStatus,
            version: stage.version
          }
        ));
        requireCas(await this.repository.casDecisionRequest(
          manager,
          scope,
          request.id,
          fromDecisionStatus,
          expectedDecisionVersion,
          {
            decisionStatus: request.decisionStatus,
            executionStatus: request.executionStatus,
            decisionVersion: request.decisionVersion,
            decidedAt: request.decidedAt,
            updatedAt: request.updatedAt
          }
        ));
        const saved = request;
        await this.writeAudit(
          manager,
          saved,
          actor.sub,
          command.decision === "reject"
            ? "property.approval.reject"
            : "property.approval.approve",
          fromDecisionStatus,
          saved.decisionStatus,
          reason
        );
        mutation.receiptStatus = "completed";
        mutation.resultRef = `property-approval:${requestId}`;
        mutation.resultHash = hash({
          requestId,
          decisionStatus: saved.decisionStatus,
          decisionVersion: saved.decisionVersion
        });
        mutation.completedAt = new Date();
        await mutationRepository.save(mutation);
        return saved;
      });
    } catch (error) {
      if (isHttpException(error)) throw error;
      return translateApprovalDatabaseError(error);
    }
  }

  async claimExecution(
    scope: TenantParkScope,
    requestId: string,
    workerId: string
  ): Promise<ApprovalExecutionClaim> {
    assertUuid(requestId);
    if (!workerId.trim() || workerId.length > 128) {
      throw propertyApprovalError("property-validation-failed");
    }
    const result = await this.repository.transaction(async (manager): Promise<
      ApprovalExecutionClaim | "shadow" | null
    > => {
      const request = await this.repository.lockRequest(manager, scope, requestId);
      if (!request) throw propertyApprovalError("property-resource-not-found");
      const controlMode = await this.runtimeControls.approvalMode(manager, scope);
      if (controlMode === "disabled") throw propertyApprovalError("property-runtime-unavailable");
      if (controlMode === "shadow") {
        await this.writeExecutionAudit(
          manager,
          request,
          null,
          "property.approval.execution.shadow-observed",
          request.executionStatus,
          request.executionStatus
        );
        return "shadow";
      }
      const now = await this.repository.dbNow(manager);
      if (request.decisionStatus !== "approved") {
        throw propertyApprovalError("property-action-forbidden");
      }
      const expiredReclaim =
        request.executionStatus === "executing"
        && request.leaseExpiresAt != null
        && request.leaseExpiresAt.getTime() <= now.getTime();
      const dueRetry =
        request.executionStatus === "retry_wait"
        && request.nextRetryAt != null
        && request.nextRetryAt.getTime() <= now.getTime();
      if (
        request.executionStatus !== "not_started"
        && !dueRetry
        && !expiredReclaim
      ) throw propertyApprovalError("property-version-conflict");

      if (request.attemptCount >= APPROVAL_EXECUTION_MAX_ATTEMPTS) {
        const from = request.executionStatus;
        const expectedVersion = request.executionVersion;
        clearClaim(request);
        request.executionStatus = "infra_exhausted";
        request.executionVersion = expectedVersion + 1;
        request.lastErrorCategory = "infra";
        request.lastErrorCode = "approval-max-attempts-exhausted";
        request.lastErrorRedactedMessage = "Approval execution attempts exhausted";
        request.infraExhaustedAt = now;
        request.updatedAt = now;
        requireCas(await this.repository.casExecutionRequest(
          manager,
          scope,
          request.id,
          from,
          expectedVersion,
          executionPatch(request)
        ));
        await this.writeExecutionAudit(
          manager,
          request,
          null,
          "property.approval.execution.exhausted",
          from,
          "infra_exhausted"
        );
        return null;
      }

      const token = randomUUID();
      const from = request.executionStatus;
      const expectedVersion = request.executionVersion;
      const previousFence = expiredReclaim && request.claimToken
        ? { claimEpoch: request.claimEpoch, claimToken: request.claimToken }
        : undefined;
      request.executionStatus = "executing";
      request.executionVersion = expectedVersion + 1;
      request.claimEpoch = (BigInt(request.claimEpoch) + 1n).toString();
      request.claimToken = token;
      request.workerId = workerId;
      request.heartbeatAt = now;
      request.leaseExpiresAt = new Date(now.getTime() + APPROVAL_EXECUTION_LEASE_MS);
      request.attemptCount += 1;
      request.nextRetryAt = null;
      request.reconcileRequired = expiredReclaim;
      request.updatedAt = now;
      requireCas(await this.repository.casExecutionRequest(
        manager,
        scope,
        request.id,
        from,
        expectedVersion,
        executionPatch(request),
        previousFence
      ));
      await this.writeExecutionAudit(
        manager,
        request,
        null,
        expiredReclaim
          ? "property.approval.execution.reclaim"
          : "property.approval.execution.claim",
        from,
        "executing"
      );
      return {
        requestId,
        claimEpoch: request.claimEpoch,
        claimToken: token,
        workerId,
        executionVersion: request.executionVersion,
        leaseExpiresAt: request.leaseExpiresAt,
        reconcileRequired: request.reconcileRequired
      };
    });
    if (result === "shadow") throw propertyApprovalError("property-runtime-unavailable");
    if (!result) throw propertyApprovalError("approval-infra-exhausted");
    return result;
  }

  async heartbeatExecution(
    scope: TenantParkScope,
    claim: ApprovalExecutionClaim
  ): Promise<ApprovalExecutionClaim> {
    assertUuid(claim.requestId);
    assertUuid(claim.claimToken);
    return this.repository.transaction(async (manager) => {
      const request = await this.repository.lockRequest(manager, scope, claim.requestId);
      if (!request) throw propertyApprovalError("property-resource-not-found");
      const now = await this.repository.dbNow(manager);
      assertClaim(request, claim, now);
      const expectedStatus = request.executionStatus;
      const expectedVersion = request.executionVersion;
      request.heartbeatAt = now;
      request.leaseExpiresAt = new Date(now.getTime() + APPROVAL_EXECUTION_LEASE_MS);
      request.executionVersion = expectedVersion + 1;
      request.updatedAt = now;
      requireCas(await this.repository.casExecutionRequest(
        manager,
        scope,
        request.id,
        expectedStatus,
        expectedVersion,
        executionPatch(request),
        { claimEpoch: claim.claimEpoch, claimToken: claim.claimToken }
      ));
      return {
        ...claim,
        executionVersion: request.executionVersion,
        leaseExpiresAt: request.leaseExpiresAt
      };
    });
  }

  async executeClaim(scope: TenantParkScope, claim: ApprovalExecutionClaim) {
    assertUuid(claim.requestId);
    assertUuid(claim.claimToken);
    try {
      return await this.repository.transaction(async (manager) => {
        const request = await this.repository.lockRequest(manager, scope, claim.requestId);
        if (!request) throw propertyApprovalError("property-resource-not-found");
        await this.runtimeControls.requireApprovalEnforce(manager, scope);
        const manifests = await this.repository.lockManifests(manager, scope, request.id);
        const entryAuthority = await this.repository.readExecutionAuthority(
          manager,
          scope,
          request.id,
          request.executionIdempotencyKey
        );
        if (request.executionStatus === "executed") {
          validateExistingExecutedAuthority(request, manifests, entryAuthority);
          return request;
        }
        if (!hasNoExecutionAuthority(entryAuthority)) {
          throw new ApprovalExecutionError(
            "business",
            "approval-reconcile-partial",
            "Non-terminal approval has persisted execution evidence"
          );
        }
        const now = await this.repository.dbNow(manager);
        assertClaim(request, claim, now);
        const adapter = this.adapters.get(request.actionId);
        if (!adapter) throw new ApprovalExecutionError(
          "infra",
          "approval-adapter-unavailable",
          "Approval effect adapter unavailable"
        );
        if (manifests.length === 0) {
          throw new ApprovalExecutionError(
            "business",
            "approval-effect-manifest-missing",
            "Approval effect manifest missing"
          );
        }

        if (request.reconcileRequired) {
          const outcome = await adapter.reconcile({
            manager,
            requestId: request.id,
            executionIdempotencyKey: request.executionIdempotencyKey
          });
          const authority = await this.repository.readExecutionAuthority(
            manager,
            scope,
            request.id,
            request.executionIdempotencyKey
          );
          if (outcome.state === "partial") {
            throw new ApprovalExecutionError(
              "business",
              "approval-reconcile-partial",
              "Approval execution requires manual reconciliation"
            );
          }
          if (outcome.state === "complete") {
            const verifiedReceipts = await this.verifyEffectProofs(manager, request, manifests);
            validateAdapterEffectReceipts(
              request,
              manifests,
              verifiedReceipts,
              outcome.financialMutationCount
            );
            validatePersistedReceiptEvidence(verifiedReceipts, authority);
            if (!hasCompleteExecutionAuthority(request, authority)) {
              throw new ApprovalExecutionError(
                "business",
                "approval-reconcile-partial",
                "Adapter completion is not confirmed by approval/audit/outbox authority"
              );
            }
            return request;
          }
          if (!hasNoExecutionAuthority(authority)) {
            throw new ApprovalExecutionError(
              "business",
              "approval-reconcile-partial",
              "Absent domain outcome conflicts with persisted approval evidence"
            );
          }
          request.reconcileRequired = false;
        }

        const result = await adapter.execute({
          manager,
          requestId: request.id,
          executionIdempotencyKey: request.executionIdempotencyKey,
          canonicalPayload: request.canonicalPayload,
          sourceExpectedVersion: request.sourceExpectedVersion
        });
        const verifiedReceipts = await this.verifyEffectProofs(manager, request, manifests);
        validateAdapterEffectReceipts(
          request,
          manifests,
          verifiedReceipts,
          result.financialMutationCount
        );
        const receiptRepository = this.repository.receiptRepository(manager);
        await receiptRepository.save(
          verifiedReceipts.map((receipt) => receiptRepository.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            requestId: request.id,
            executionIdempotencyKey: request.executionIdempotencyKey,
            manifestId: receipt.manifestId,
            effectKind: receipt.effectKind,
            effectOrdinal: receipt.effectOrdinal,
            effectLineKey: receipt.effectLineKey,
            domainTable: receipt.domainTable,
            domainRowId: receipt.domainRowId,
            effectHash: receipt.effectHash,
            owningUniqueName: receipt.owningUniqueName,
            uniqueKeyHash: receipt.uniqueKeyHash,
            observedCardinality: receipt.observedCardinality,
            lineAmount: receipt.lineAmount ?? null,
            currency: receipt.currency ?? null
          }))
        );
        validateAdapterOutboxEvents(result.outboxEvents, request);
        const executed = await this.markExecuted(
          manager,
          request,
          now,
          "property.approval.execution.executed"
        );
        await this.outbox.append(manager, {
          scope,
          approvalRequestId: request.id,
          executionIdempotencyKey: request.executionIdempotencyKey,
          events: result.outboxEvents
        });
        const persistedAuthority = await this.repository.readExecutionAuthority(
          manager,
          scope,
          request.id,
          request.executionIdempotencyKey
        );
        validatePersistedExecutionAuthority(
          executed,
          verifiedReceipts,
          result.outboxEvents[0]!,
          persistedAuthority
        );
        return executed;
      });
    } catch (error) {
      const classified = classifyExecutionError(error);
      if (classified) {
        if (classified.category === "commit_unknown") throw classified;
        await this.recordExecutionFailure(scope, claim, classified);
        throw propertyApprovalError(
          classified.stableCode === "approval-reconcile-partial"
            ? "approval-reconcile-partial"
            : classified.stableCode === "approval-source-changed"
              ? "approval-source-changed"
            : "approval-execution-failed"
        );
      }
      if (isHttpException(error)) throw error;
      return translateApprovalDatabaseError(error);
    }
  }

  async reconcileExhaustedExecution(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    requestId: string,
    input: {
      expectedExecutionVersion: number;
      clientKey: string;
      incidentId: string;
      reason: string;
    }
  ) {
    assertUuid(requestId);
    if (!input.reason.trim() || !input.incidentId.trim()) {
      throw propertyApprovalError("property-validation-failed");
    }
    validateClientKey(input.clientKey);
    const requestHash = hash({
      expectedExecutionVersion: input.expectedExecutionVersion,
      incidentId: input.incidentId,
      reason: input.reason.trim()
    });
    return this.repository.transaction(async (manager) => {
      const request = await this.repository.lockRequest(manager, scope, requestId);
      if (!request) throw propertyApprovalError("property-resource-not-found");
      await this.incidentAuthorization.authorizeRetry({
        manager,
        scope,
        actorId: actor.sub,
        requestId
      });
      await this.runtimeControls.requireApprovalEnforce(manager, scope);
      const manifests = await this.repository.lockManifests(manager, scope, requestId);
      const entryAuthority = await this.repository.readExecutionAuthority(
        manager,
        scope,
        requestId,
        request.executionIdempotencyKey
      );
      const existingMutation = await this.repository.findMutation(manager, {
        scope,
        actorId: actor.sub,
        actionId: "property.approval.incident-retry",
        targetId: requestId,
        clientKey: input.clientKey
      });
      if (existingMutation) {
        if (existingMutation.requestHash !== requestHash) {
          throw propertyApprovalError("idempotency-key-conflict");
        }
        if (existingMutation.receiptStatus === "completed") {
          if (request.executionStatus === "executed") {
            validateIncidentExecutedAuthority(request, manifests, entryAuthority);
          }
          return {
            request,
            outcome: (request.executionStatus === "executed" ? "complete" : "absent") as
              "complete" | "absent"
          };
        }
        throw propertyApprovalError("property-runtime-unavailable");
      }
      if (request.executionStatus === "executed") {
        validateIncidentExecutedAuthority(request, manifests, entryAuthority);
        return { request, outcome: "complete" as const };
      }
      if (!hasNoExecutionAuthority(entryAuthority)) {
        throw propertyApprovalError("approval-reconcile-partial");
      }
      if (
        request.executionStatus !== "infra_exhausted"
        || request.executionVersion !== input.expectedExecutionVersion
      ) throw propertyApprovalError("property-version-conflict", {
        latestVersion: request.executionVersion
      });
      const adapter = this.adapters.get(request.actionId);
      if (!adapter) throw propertyApprovalError("property-runtime-unavailable");
      const mutationRepository = this.repository.mutationRepository(manager);
      const mutation = await mutationRepository.save(mutationRepository.create({
        receiptContractVersion: "legacy-v1",
        ...scope,
        actorId: actor.sub,
        actionId: "property.approval.incident-retry",
        targetId: requestId,
        clientKey: input.clientKey,
        requestHash,
        receiptStatus: "started",
        resultRef: null,
        resultHash: null,
        completedAt: null
      }));
      const outcome = await adapter.reconcile({
        manager,
        requestId,
        executionIdempotencyKey: request.executionIdempotencyKey
      });
      const authority = await this.repository.readExecutionAuthority(
        manager,
        scope,
        requestId,
        request.executionIdempotencyKey
      );
      const now = await this.repository.dbNow(manager);
      if (outcome.state === "partial") {
        const expectedVersion = request.executionVersion;
        request.lastErrorCode = "approval-reconcile-partial";
        request.lastErrorRedactedMessage = "Approval execution requires manual reconciliation";
        request.executionVersion = expectedVersion + 1;
        request.updatedAt = now;
        requireCas(await this.repository.casExecutionRequest(
          manager,
          scope,
          request.id,
          "infra_exhausted",
          expectedVersion,
          executionPatch(request)
        ));
        await this.writeExecutionAudit(
          manager,
          request,
          actor.sub,
          "property.approval.execution.reconcile-partial",
          "infra_exhausted",
          "infra_exhausted",
          input.incidentId,
          input.reason
        );
        completeMutation(mutation, requestId, "partial", request);
        await mutationRepository.save(mutation);
        return { request, outcome: "partial" as const };
      }
      if (outcome.state === "complete") {
        let authorityComplete = false;
        try {
          const verifiedReceipts = await this.verifyEffectProofs(manager, request, manifests);
          validateAdapterEffectReceipts(
            request,
            manifests,
            verifiedReceipts,
            outcome.financialMutationCount
          );
          validatePersistedReceiptEvidence(verifiedReceipts, authority);
          authorityComplete = hasCompleteExecutionAuthority(request, authority);
        } catch (error) {
          if (!(error instanceof ApprovalExecutionError)) throw error;
        }
        if (!authorityComplete) {
          const expectedVersion = request.executionVersion;
          request.lastErrorCode = "approval-reconcile-partial";
          request.lastErrorRedactedMessage =
            "Adapter completion is not confirmed by approval/audit/outbox authority";
          request.executionVersion = expectedVersion + 1;
          request.updatedAt = now;
          requireCas(await this.repository.casExecutionRequest(
            manager,
            scope,
            request.id,
            "infra_exhausted",
            expectedVersion,
            executionPatch(request)
          ));
          await this.writeExecutionAudit(
            manager,
            request,
            actor.sub,
            "property.approval.execution.reconcile-partial",
            "infra_exhausted",
            "infra_exhausted",
            input.incidentId,
            input.reason
          );
          completeMutation(mutation, requestId, "partial", request);
          await mutationRepository.save(mutation);
          return { request, outcome: "partial" as const };
        }
        return { request, outcome: "complete" as const };
      }
      if (!hasNoExecutionAuthority(authority)) {
        const expectedVersion = request.executionVersion;
        request.lastErrorCode = "approval-reconcile-partial";
        request.lastErrorRedactedMessage =
          "Absent domain outcome conflicts with persisted approval evidence";
        request.executionVersion = expectedVersion + 1;
        request.updatedAt = now;
        requireCas(await this.repository.casExecutionRequest(
          manager,
          scope,
          request.id,
          "infra_exhausted",
          expectedVersion,
          executionPatch(request)
        ));
        await this.writeExecutionAudit(
          manager,
          request,
          actor.sub,
          "property.approval.execution.reconcile-partial",
          "infra_exhausted",
          "infra_exhausted",
          input.incidentId,
          input.reason
        );
        completeMutation(mutation, requestId, "partial", request);
        await mutationRepository.save(mutation);
        return { request, outcome: "partial" as const };
      }
      const expectedVersion = request.executionVersion;
      request.executionStatus = "retry_wait";
      request.nextRetryAt = now;
      request.infraExhaustedAt = null;
      request.lastErrorCategory = null;
      request.lastErrorCode = null;
      request.lastErrorRedactedMessage = null;
      request.reconcileRequired = false;
      request.executionVersion = expectedVersion + 1;
      request.updatedAt = now;
      requireCas(await this.repository.casExecutionRequest(
        manager,
        scope,
        request.id,
        "infra_exhausted",
        expectedVersion,
        executionPatch(request)
      ));
      await this.writeExecutionAudit(
        manager,
        request,
        actor.sub,
        "property.approval.execution.retry-authorized",
        "infra_exhausted",
        "retry_wait",
        input.incidentId,
        input.reason
      );
      completeMutation(mutation, requestId, "absent", request);
      await mutationRepository.save(mutation);
      return { request, outcome: "absent" as const };
    });
  }

  private async markExecuted(
    manager: import("typeorm").EntityManager,
    request: PropertyApprovalRequestEntity,
    now: Date,
    actionId: string,
    actorId: string | null = null,
    incidentId: string | null = null,
    reason: string | null = null
  ) {
    const from = request.executionStatus;
    const expectedVersion = request.executionVersion;
    const fence = request.claimToken
      ? { claimEpoch: request.claimEpoch, claimToken: request.claimToken }
      : undefined;
    request.executionStatus = "executed";
    request.executedAt = now;
    request.reconcileRequired = false;
    request.nextRetryAt = null;
    request.lastErrorCategory = null;
    request.lastErrorCode = null;
    request.lastErrorRedactedMessage = null;
    request.infraExhaustedAt = null;
    clearClaim(request);
    request.executionVersion = expectedVersion + 1;
    request.updatedAt = now;
    requireCas(await this.repository.casExecutionRequest(
      manager,
      { tenantId: request.tenantId, parkId: request.parkId },
      request.id,
      from,
      expectedVersion,
      executionPatch(request),
      fence
    ));
    const saved = request;
    await this.writeExecutionAudit(
      manager,
      saved,
      actorId,
      actionId,
      from,
      "executed",
      incidentId,
      reason
    );
    return saved;
  }

  private async verifyEffectProofs(
    manager: import("typeorm").EntityManager,
    request: PropertyApprovalRequestEntity,
    manifests: readonly PropertyExecutionEffectManifestEntity[]
  ): Promise<PropertyApprovalEffectReceipt[]> {
    return Promise.all(manifests.map(async (manifest) => {
      const verifier = this.proofVerifiers.get(request.actionId, manifest.effectKind);
      if (!verifier) throw new ApprovalExecutionError(
        "infra",
        "approval-proof-verifier-unavailable",
        "Approval effect proof verifier unavailable"
      );
      const proof = await verifier.verify({
        manager,
        scope: { tenantId: request.tenantId, parkId: request.parkId },
        requestId: request.id,
        executionIdempotencyKey: request.executionIdempotencyKey,
        effectLineKey: manifest.effectLineKey,
        expectedCardinality: manifest.expectedCardinality,
        owningTable: manifest.owningTable,
        owningUniqueName: manifest.owningUniqueName
      });
      return {
        manifestId: manifest.id,
        effectKind: manifest.effectKind,
        effectOrdinal: manifest.effectOrdinal,
        effectLineKey: manifest.effectLineKey,
        domainTable: proof.domainTable,
        domainRowId: proof.domainRowId,
        effectHash: manifest.invariantHash,
        owningUniqueName: proof.owningUniqueName,
        uniqueKeyHash: proof.uniqueKeyHash,
        observedCardinality: proof.observedCardinality,
        lineAmount: proof.lineAmount,
        currency: proof.currency
      };
    }));
  }

  private async recordExecutionFailure(
    scope: TenantParkScope,
    claim: ApprovalExecutionClaim,
    error: ApprovalExecutionError
  ): Promise<void> {
    await this.repository.transaction(async (manager) => {
      const request = await this.repository.lockRequest(manager, scope, claim.requestId);
      if (!request) return;
      const now = await this.repository.dbNow(manager);
      // A durable partial proof is a request-level P0 quarantine signal. It is
      // authoritative even when the detecting worker holds a stale claim.
      if (
        error.stableCode !== "approval-reconcile-partial"
        || !["executing", "infra_exhausted"].includes(request.executionStatus)
      ) {
        if (
          error.stableCode === "approval-reconcile-partial"
          && request.executionStatus === "executed"
        ) return;
        // For ordinary failures, a reclaimed/new owner still wins.
        assertClaim(request, claim, now, false);
      }
      const from = request.executionStatus;
      const expectedVersion = request.executionVersion;
      const fence = request.claimToken
        ? { claimEpoch: request.claimEpoch, claimToken: request.claimToken }
        : undefined;
      clearClaim(request);
      request.executionVersion = expectedVersion + 1;
      request.lastErrorCategory = error.category;
      request.lastErrorCode = error.stableCode;
      request.lastErrorRedactedMessage = error.redactedMessage.slice(0, 500);
      if (error.stableCode === "approval-reconcile-partial") {
        request.executionStatus = "infra_exhausted";
        request.lastErrorCategory = "infra";
        request.infraExhaustedAt = now;
      } else if (error.category === "business") {
        request.executionStatus = "execution_failed";
      } else if (request.attemptCount >= APPROVAL_EXECUTION_MAX_ATTEMPTS) {
        request.executionStatus = "infra_exhausted";
        request.lastErrorCategory = "infra";
        request.infraExhaustedAt = now;
      } else {
        request.executionStatus = "retry_wait";
        request.nextRetryAt = new Date(now.getTime() + retryBackoffMs(request.attemptCount));
      }
      request.updatedAt = now;
      requireCas(await this.repository.casExecutionRequest(
        manager,
        scope,
        request.id,
        from,
        expectedVersion,
        executionPatch(request),
        fence
      ));
      await this.writeExecutionAudit(
        manager,
        request,
        null,
        request.executionStatus === "infra_exhausted"
          ? "property.approval.execution.exhausted"
          : "property.approval.execution.failed",
        from,
        request.executionStatus,
        null,
        error.stableCode
      );
    });
  }

  private async writeExecutionAudit(
    manager: import("typeorm").EntityManager,
    request: PropertyApprovalRequestEntity,
    actorId: string | null,
    actionId: string,
    fromExecutionStatus: string,
    toExecutionStatus: string,
    incidentId: string | null = null,
    reason: string | null = null
  ): Promise<void> {
    await this.repository.auditRepository(manager).insert({
      tenantId: request.tenantId,
      parkId: request.parkId,
      requestId: request.id,
      actorId,
      actionId,
      fromDecisionStatus: request.decisionStatus,
      toDecisionStatus: request.decisionStatus,
      fromExecutionStatus,
      toExecutionStatus,
      decisionVersion: request.decisionVersion,
      executionVersion: request.executionVersion,
      incidentId,
      reason,
      payloadHash: request.payloadHash
    } satisfies Partial<PropertyApprovalAuditEntity>);
  }

  private async allowedActions(
    request: PropertyApprovalRequestEntity,
    stage: import("./entities/property-approval.entities").PropertyApprovalStageEntity | undefined,
    decisionCount: number,
    actor: JwtPrincipal,
    predicate: PropertyApprovalReadPredicate
  ): Promise<("property.approval.decide" | "property.approval.withdraw")[]> {
    const actions: ("property.approval.decide" | "property.approval.withdraw")[] = [];
    if (
      request.decisionStatus === "pending_approval"
      && stage
      && predicate.eligibleApproverRequestIds.includes(request.id)
      && hasPermission(actor.permissions, "property_approval:decide")
      && await this.authorizationPort.canDecide({
        scope: { tenantId: request.tenantId, parkId: request.parkId },
        actorId: actor.sub,
        actionId: request.actionId,
        stageId: stage.id,
        eligibilityPolicySnapshot: stage.eligibilityPolicySnapshot,
        eligibilityPolicyHash: stage.eligibilityPolicyHash
      })
    ) {
      actions.push("property.approval.decide");
    }
    if (
      request.decisionStatus === "pending_approval"
      && request.requesterId === actor.sub
      && decisionCount === 0
      && hasPermission(actor.permissions, "property_approval:withdraw")
    ) actions.push("property.approval.withdraw");
    return actions;
  }

  private async writeAudit(
    manager: import("typeorm").EntityManager,
    request: {
      id: string;
      tenantId: string;
      parkId: string;
      decisionVersion: number;
      executionVersion: number;
      executionStatus: string;
      payloadHash: string;
    },
    actorId: string | null,
    actionId: string,
    fromDecisionStatus: string | null,
    toDecisionStatus: string | null,
    reason: string | null = null
  ) {
    await this.repository.auditRepository(manager).insert({
      tenantId: request.tenantId,
      parkId: request.parkId,
      requestId: request.id,
      actorId,
      actionId,
      fromDecisionStatus,
      toDecisionStatus,
      fromExecutionStatus: request.executionStatus,
      toExecutionStatus: request.executionStatus,
      decisionVersion: request.decisionVersion,
      executionVersion: request.executionVersion,
      incidentId: null,
      reason,
      payloadHash: request.payloadHash
    } satisfies Partial<PropertyApprovalAuditEntity>);
  }
}

const PORT_MAX_VERSION = 2_147_483_647;
const PORT_PURE_FINANCIAL_ACTIONS = new Set<TrackBApprovalActionId>([
  "homestay.finance.refund-or-waive.request",
  "housing.finance.refund-waive-or-deposit-refund.request"
]);
const PORT_COMPOUND_FINANCIAL_ACTIONS = new Set<TrackBApprovalActionId>([
  "homestay.bookings.cancel.request",
  "housing.handovers.complete-move-out-financial.request",
  "housing.purchases.transfer.request"
]);

function unwrapApprovalManager(port: EntityManagerPort): EntityManager {
  const context = port && typeof port === "object" ? port.transactionContext : null;
  if (
    !(context instanceof EntityManager)
    || context.queryRunner?.isTransactionActive !== true
  ) throw propertyApprovalError("property-runtime-unavailable", {
    recoveryAction: "retry-with-same-client-key"
  });
  return context;
}

function portVersion(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= PORT_MAX_VERSION;
}

function portUtf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function hasValidUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function validatePortString(
  value: unknown,
  minBytes: number,
  maxBytes: number
): value is string {
  return typeof value === "string"
    && hasValidUnicodeScalars(value)
    && value.trim() === value
    && portUtf8Length(value) >= minBytes
    && portUtf8Length(value) <= maxBytes;
}

function validatePortScope(scope: TenantParkScope): void {
  if (
    !scope
    || !validatePortString(scope.tenantId, 1, 64)
    || !validatePortString(scope.parkId, 1, 64)
  ) throw propertyApprovalError("property-validation-failed");
}

function validatePortSourceQuery(input: {
  scope: TenantParkScope;
  actionId: TrackBApprovalActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion?: number;
}): void {
  validatePortScope(input.scope);
  if (
    !Object.prototype.hasOwnProperty.call(TRACK_B_APPROVAL_EFFECT_MANIFEST, input.actionId)
    || !validatePortString(input.sourceType, 1, 64)
    || !isUuid(input.sourceId)
    || (input.sourceExpectedVersion !== undefined && !portVersion(input.sourceExpectedVersion))
  ) throw propertyApprovalError("property-validation-failed");
}

function validateAndNormalizePortCommand(
  command: CreatePendingPropertyApprovalCommand
): CreatePendingPropertyApprovalCommand {
  validatePortSourceQuery(command);
  const canonicalPayload = validatePropertyApprovalJsonRoot(command.canonicalPayload);
  const uuids = [
    command.sourceId,
    command.requesterId,
    command.submitterId,
    command.actorId
  ];
  if (
    command.contractVersion !== PROPERTY_APPROVAL_PORT_CONTRACT_VERSION
    || !uuids.every(isUuid)
    || !portVersion(command.sourceExpectedVersion)
    || !portVersion(command.payloadSchemaVersion)
    || !validatePortString(command.businessIntentKey, 1, 128)
    || !/^[\x20-\x7e]{1,128}$/.test(command.clientKey)
    || command.clientKey.trim().length === 0
  ) throw propertyApprovalError("property-validation-failed");
  const requesterId = command.requesterId.toLowerCase();
  const submitterId = command.submitterId.toLowerCase();
  const actorId = command.actorId.toLowerCase();
  if (actorId !== submitterId) throw propertyApprovalError("property-action-forbidden");
  const pairedMoney = (command.amount == null) === (command.currency == null);
  const validMoney = command.amount == null
    || (/^(0|[1-9][0-9]{0,15})\.[0-9]{2}$/.test(command.amount)
      && /^[A-Z]{3}$/.test(command.currency ?? ""));
  if (
    !pairedMoney
    || !validMoney
    || (PORT_PURE_FINANCIAL_ACTIONS.has(command.actionId) && command.amount == null)
    || (!PORT_PURE_FINANCIAL_ACTIONS.has(command.actionId)
      && !PORT_COMPOUND_FINANCIAL_ACTIONS.has(command.actionId)
      && command.amount != null)
  ) throw propertyApprovalError("property-validation-failed");
  return {
    ...command,
    sourceId: command.sourceId.toLowerCase(),
    requesterId,
    submitterId,
    actorId,
    canonicalPayload
  };
}

function validatePropertyApprovalJsonRoot(
  value: Readonly<Record<string, PropertyApprovalJsonValue>>
): Readonly<Record<string, PropertyApprovalJsonValue>> {
  validatePropertyApprovalJson(value, new Set<object>(), true);
  return value;
}

function validatePropertyApprovalJson(
  value: unknown,
  ancestors: Set<object>,
  root = false
): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!hasValidUnicodeScalars(value)) throw propertyApprovalError("property-validation-failed");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw propertyApprovalError("property-validation-failed");
    }
    return;
  }
  if (typeof value !== "object") throw propertyApprovalError("property-validation-failed");
  if (ancestors.has(value)) throw propertyApprovalError("property-validation-failed");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (root || Object.getOwnPropertySymbols(value).length > 0) {
        throw propertyApprovalError("property-validation-failed");
      }
      const names = Object.getOwnPropertyNames(value).filter((name) => name !== "length");
      if (names.length !== value.length) throw propertyApprovalError("property-validation-failed");
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw propertyApprovalError("property-validation-failed");
        }
        validatePropertyApprovalJson(descriptor.value, ancestors);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw propertyApprovalError("property-validation-failed");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw propertyApprovalError("property-validation-failed");
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (!hasValidUnicodeScalars(key)) throw propertyApprovalError("property-validation-failed");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw propertyApprovalError("property-validation-failed");
      }
      validatePropertyApprovalJson(descriptor.value, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function propertyApprovalCanonicalText(value: PropertyApprovalJsonValue): string {
  validatePropertyApprovalJson(value, new Set<object>());
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => propertyApprovalCanonicalText(item)).join(",")}]`;
  }
  const objectValue = value as { readonly [key: string]: PropertyApprovalJsonValue };
  const keys = Object.keys(objectValue).sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
  );
  return `{${keys.map((key) =>
    `${JSON.stringify(key)}:${propertyApprovalCanonicalText(objectValue[key]!)}`
  ).join(",")}}`;
}

export function propertyApprovalCanonicalHash(value: PropertyApprovalJsonValue): string {
  return createHash("sha256").update(propertyApprovalCanonicalText(value), "utf8").digest("hex");
}

function portSubmitRequestHash(requestId: string): string {
  return propertyApprovalCanonicalHash({
    expectedDecisionVersion: 1,
    requestId: requestId.toLowerCase()
  });
}

function portSubmitResultHash(requestId: string): string {
  return propertyApprovalCanonicalHash({
    executionStatus: "not_started",
    executionVersion: 1,
    outcome: "submitted",
    requestId: requestId.toLowerCase()
  });
}

function completePortSubmitMutation(
  mutation: PropertyMutationReceiptEntity,
  request: PropertyApprovalRequestEntity
): void {
  mutation.receiptStatus = "completed";
  mutation.resultRef = `property-approval:${request.id}:submitted`;
  mutation.resultHash = portSubmitResultHash(request.id);
  mutation.resultVersion = null;
  mutation.completedAt = request.submittedAt;
}

function assertPortSubmitReceipt(
  receipt: PropertyMutationReceiptEntity,
  request: PropertyApprovalRequestEntity
): void {
  const expectedRef = `property-approval:${request.id}:submitted`;
  if (receipt.receiptStatus !== "completed") {
    throw propertyApprovalError("property-runtime-unavailable", {
      recoveryAction: "retry-with-same-client-key"
    });
  }
  if (
    receipt.receiptContractVersion !== "legacy-v1"
    || receipt.identityKind !== null
    || receipt.businessOccurrenceKey !== null
    || receipt.taskKey !== null
    || receipt.identitySourceType !== null
    || receipt.tenantId !== request.tenantId
    || receipt.parkId !== request.parkId
    || receipt.actorId !== request.submitterId
    || receipt.actionId !== "property.approval.submit"
    || receipt.targetId !== request.id
    || receipt.clientKey !== request.clientIdempotencyKey
    || receipt.requestHash !== portSubmitRequestHash(request.id)
    || receipt.resultRef !== expectedRef
    || receipt.resultHash !== portSubmitResultHash(request.id)
    || receipt.resultVersion !== null
    || receipt.completedAt == null
  ) throw propertyApprovalError("idempotency-key-conflict");
}

function validateEligibleCheckers(
  policy: FrozenApprovalPolicy,
  exclusions: readonly import("./property-approval.ports").FrozenApprovalExclusion[]
): void {
  if (!portVersion(policy.policyVersion)) {
    throw propertyApprovalError("approval-policy-not-found");
  }
  if (policy.effects.some((effect) =>
    !Number.isSafeInteger(effect.effectOrdinal)
    || effect.effectOrdinal < 0
    || effect.effectOrdinal > PORT_MAX_VERSION - 1
  )) throw propertyApprovalError("approval-policy-not-found");
  const excluded = new Set(exclusions.map((item) => item.actorId.toLowerCase()));
  for (const stage of policy.stages) {
    if (!portVersion(stage.eligibilityPolicyVersion)) {
      throw propertyApprovalError("approval-policy-not-found");
    }
    let snapshot: ReturnType<typeof decodeEligibilitySnapshot>;
    try {
      snapshot = decodeEligibilitySnapshot(
        stage.eligibilityPolicySnapshot,
        stage.eligibilityPolicyHash
      );
    } catch {
      throw propertyApprovalError("approval-policy-not-found");
    }
    const eligible = snapshot.eligibleActorIds.filter(
      (actorId) => !excluded.has(actorId.toLowerCase())
    );
    if (eligible.length === 0) throw propertyApprovalError("approval-no-eligible-approver");
  }
}

function assertExactPortRequest(
  request: PropertyApprovalRequestEntity,
  command: CreatePendingPropertyApprovalCommand,
  payloadHash: string
): void {
  if (
    request.tenantId !== command.scope.tenantId
    || request.parkId !== command.scope.parkId
    || request.actionId !== command.actionId
    || request.sourceType !== command.sourceType
    || request.sourceId !== command.sourceId
    || request.sourceExpectedVersion !== command.sourceExpectedVersion
    || request.requesterId !== command.requesterId
    || request.submitterId !== command.submitterId
    || request.submitterId !== command.actorId
    || (
      request.businessIntentKey !== command.businessIntentKey
      && request.businessIntentKey !== retryApprovalBusinessIntentKey(command)
    )
    || request.payloadSchemaVersion !== command.payloadSchemaVersion
    || request.payloadHash !== payloadHash
    || request.amount !== command.amount
    || request.currency !== command.currency
  ) throw propertyApprovalError("idempotency-key-conflict");
}

function isRetryableApprovalTerminal(request: PropertyApprovalRequestEntity): boolean {
  return (request.decisionStatus === "rejected" || request.decisionStatus === "withdrawn")
    && request.executionStatus === "not_required";
}

function retryApprovalBusinessIntentKey(
  command: Pick<CreatePendingPropertyApprovalCommand, "businessIntentKey" | "clientKey">
): string {
  return `approval-retry:${createHash("sha256")
    .update(command.businessIntentKey)
    .update("\0")
    .update(command.clientKey)
    .digest("hex")}`;
}

function assertLegalTerminalOrActivePair(request: PropertyApprovalRequestEntity): void {
  const valid = request.decisionStatus === "draft"
    || request.decisionStatus === "submitted"
    || request.decisionStatus === "pending_approval"
    ? request.executionStatus === "not_started"
    : request.decisionStatus === "approved"
      ? [
        "not_started", "executing", "retry_wait", "executed",
        "execution_failed", "infra_exhausted"
      ].includes(request.executionStatus)
      : ["rejected", "withdrawn", "expired"].includes(request.decisionStatus)
        && request.executionStatus === "not_required";
  if (!valid) throw propertyApprovalError("approval-reconcile-partial");
}

function projectApprovalRequest(
  request: PropertyApprovalRequestEntity
): PropertyApprovalRequestProjection {
  return {
    requestId: request.id,
    tenantId: request.tenantId,
    parkId: request.parkId,
    actionId: request.actionId,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    sourceExpectedVersion: request.sourceExpectedVersion,
    requesterId: request.requesterId,
    submitterId: request.submitterId,
    businessIntentKey: request.businessIntentKey,
    payloadSchemaVersion: request.payloadSchemaVersion,
    payloadHash: request.payloadHash,
    amount: request.amount,
    currency: request.currency,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    policyHash: request.policyHash,
    decisionStatus: request.decisionStatus,
    executionStatus: request.executionStatus,
    decisionVersion: request.decisionVersion,
    executionVersion: request.executionVersion,
    submittedAt: request.submittedAt?.toISOString() ?? null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    executedAt: request.executedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString()
  };
}

function portActor(command: CreatePendingPropertyApprovalCommand): JwtPrincipal {
  return {
    sub: command.actorId,
    username: "property-approval-port",
    tenantId: command.scope.tenantId,
    parkId: command.scope.parkId,
    roles: [],
    permissions: []
  };
}

export const PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS = [
  "uq_biz_property_approval_stage_scope_id",
  "uq_biz_property_approval_stage_request_id",
  "uq_biz_property_approval_stage_code",
  "uq_biz_property_approval_stage_ordinal",
  "uq_biz_property_approval_exclusion_scope_id",
  "uq_biz_property_approval_exclusion_actor_reason",
  "uq_biz_property_effect_manifest_scope_id",
  "uq_biz_property_effect_manifest_request_id",
  "uq_biz_property_effect_manifest_ordinal",
  "uq_biz_property_effect_manifest_line"
] as const;

const PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINT_SET = new Set<string>(
  PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS
);

export function classifyPortDatabaseError(
  error: unknown
): ReturnType<typeof propertyApprovalError> | null {
  const value = error as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = value.code ?? value.driverError?.code;
  if (code !== "23505") return null;
  const constraint = value.constraint ?? value.driverError?.constraint ?? "";
  if (PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINT_SET.has(constraint)) {
    return propertyApprovalError("approval-reconcile-partial");
  }
  return propertyApprovalError("property-runtime-unavailable", {
    recoveryAction: "retry-with-same-client-key"
  });
}

const HISTORICAL_ACTOR_REASONS = {
  SOURCE_CREATOR: "source_creator",
  PAYMENT_RECORDER: "payment_recorder",
  PURCHASE_CREATOR: "purchase_creator",
  PAYMENT_EXECUTOR: "payment_executor"
} as const;

export function freezeActorExclusions(
  command: CreatePropertyApprovalDraftCommand,
  resolverExclusions: readonly import("./property-approval.ports").FrozenApprovalExclusion[]
): import("./property-approval.ports").FrozenApprovalExclusion[] {
  const requiredHistorical = new Set<string>([HISTORICAL_ACTOR_REASONS.SOURCE_CREATOR]);
  if (
    command.actionId === "homestay.finance.refund-or-waive.request"
    || command.actionId === "housing.finance.refund-waive-or-deposit-refund.request"
  ) requiredHistorical.add(HISTORICAL_ACTOR_REASONS.PAYMENT_RECORDER);
  if (
    command.actionId === "housing.purchases.lifecycle.request"
    || command.actionId === "housing.purchases.transfer.request"
  ) requiredHistorical.add(HISTORICAL_ACTOR_REASONS.PURCHASE_CREATOR);
  if (command.actionId === "housing.purchases.transfer.request") {
    requiredHistorical.add(HISTORICAL_ACTOR_REASONS.PAYMENT_EXECUTOR);
  }
  if (
    resolverExclusions.some((item) =>
      !isUuid(item.actorId)
      || !item.reasonCode.trim()
      || !item.sourceType.trim()
      || !isUuid(item.sourceId)
    )
    || [...requiredHistorical].some((reason) =>
      !resolverExclusions.some((item) => item.reasonCode === reason)
    )
  ) throw propertyApprovalError("approval-policy-not-found", {
    reason: "approval-required-historical-actor-missing"
  });
  const combined = [
    ...resolverExclusions,
    {
      actorId: command.requesterId,
      reasonCode: "requester",
      sourceType: command.sourceType,
      sourceId: command.sourceId
    },
    {
      actorId: command.submitterId,
      reasonCode: "submitter",
      sourceType: command.sourceType,
      sourceId: command.sourceId
    }
  ];
  return [...new Map(combined.map((item) => [
    `${item.actorId}:${item.reasonCode}`,
    item
  ])).values()];
}

function validateDraft(
  command: CreatePropertyApprovalDraftCommand,
  payloadHash: string,
  strictPort = false
): void {
  if (
    !isUuid(command.sourceId)
    || !isUuid(command.requesterId)
    || !isUuid(command.submitterId)
    || (strictPort
      ? !portVersion(command.sourceExpectedVersion)
      : command.sourceExpectedVersion < 1)
    || (strictPort
      ? !portVersion(command.payloadSchemaVersion)
      : command.payloadSchemaVersion < 1)
    || !command.clientKey.trim()
    || command.clientKey.length > 128
    || !command.businessIntentKey.trim()
    || command.businessIntentKey.length > 128
    || !/^[0-9a-f]{64}$/.test(payloadHash)
  ) throw propertyApprovalError("property-validation-failed");
  validateClientKey(command.clientKey);
  if ((command.amount == null) !== (command.currency == null)) {
    throw propertyApprovalError("property-validation-failed");
  }
  if (command.currency != null && !/^[A-Z]{3}$/.test(command.currency)) {
    throw propertyApprovalError("property-validation-failed");
  }
  if (command.amount != null) {
    const amountPattern = strictPort
      ? /^(0|[1-9]\d{0,15})\.\d{2}$/
      : /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;
    if (!amountPattern.test(command.amount)) {
      throw propertyApprovalError("property-validation-failed");
    }
  }
}

export function validateFrozenPolicy(
  actionId: TrackBApprovalActionId,
  policy: FrozenApprovalPolicy,
  requestAmount: string | null = null,
  requestCurrency: string | null = null,
  canonicalPayload: Readonly<Record<string, unknown>> = {}
): void {
  if (
    !isUuid(policy.policyId)
    || policy.policyVersion < 1
    || !/^[0-9a-f]{64}$/.test(policy.policyHash)
    || policy.stages.length === 0
    || policy.effects.length === 0
  ) throw propertyApprovalError("approval-policy-not-found");
  const allowedEffects = new Set<string>(TRACK_B_APPROVAL_EFFECT_MANIFEST[actionId]);
  const effectOrdinals = policy.effects.map((effect) => effect.effectOrdinal);
  const effectLines = policy.effects.map((effect) => effect.effectLineKey);
  if (
    policy.effects.some((effect) => !allowedEffects.has(effect.effectKind))
    || new Set(effectOrdinals).size !== effectOrdinals.length
    || effectOrdinals.some((value, index) => value !== index)
    || new Set(effectLines).size !== effectLines.length
    || policy.effects.some((effect) =>
      !EFFECT_AUTHORITIES[effect.effectKind]
      || effect.effectOrdinal < 0
      || effect.expectedCardinality < 1
      || !effect.effectLineKey
      || !effect.owningTable
      || !effect.owningUniqueName
      || effect.owningTable !== EFFECT_AUTHORITIES[effect.effectKind]!.owningTable
      || effect.owningUniqueName !== EFFECT_AUTHORITIES[effect.effectKind]!.owningUniqueName
      || !EFFECT_AUTHORITIES[effect.effectKind]!.lineKey.test(effect.effectLineKey)
      || (FINANCIAL_EFFECT_KINDS.has(effect.effectKind)
        !== EFFECT_AUTHORITIES[effect.effectKind]!.financial)
      || !/^[0-9a-f]{64}$/.test(effect.invariantHash)
      || effect.invariantHash !== canonicalEffectInvariantHash(effect, canonicalPayload)
      || effect.expectedCardinality !== effectCardinality(effect.effectKind, canonicalPayload)
    )
  ) throw propertyApprovalError("approval-policy-not-found", {
    reason: "approval-effect-manifest-action-mismatch"
  });
  validateEffectFinancialSemantics(
    actionId,
    policy,
    requestAmount,
    requestCurrency
  );
  const canonicalLines = canonicalEffectLines(actionId, canonicalPayload);
  if (
    canonicalLines.length !== policy.effects.length
    || policy.effects.some((effect, index) =>
      canonicalLines[index]?.effectKind !== effect.effectKind
      || canonicalLines[index]?.effectLineKey !== effect.effectLineKey
      || canonicalLines[index]?.lineAmount !== (effect.lineAmount ?? null)
      || canonicalLines[index]?.currency !== (effect.currency ?? null)
      || effect.effectOrdinal !== index
    )
  ) throw propertyApprovalError("approval-policy-not-found", {
    reason: "approval-effect-line-payload-mismatch"
  });
  const ordinals = policy.stages.map((stage) => stage.stageOrdinal);
  if (
    new Set(ordinals).size !== ordinals.length
    || [...ordinals].sort((a, b) => a - b).some((value, index) => value !== index + 1)
    || policy.stages.some((stage) =>
      stage.requiredCount < 1
      || stage.eligibilityPolicyVersion < 1
      || !/^[0-9a-f]{64}$/.test(stage.eligibilityPolicyHash)
    )
  ) throw propertyApprovalError("approval-policy-not-found");
}

export function canonicalEffectInvariantHash(
  effect: Pick<
    import("./property-approval.ports").FrozenApprovalEffect,
    | "effectKind"
    | "effectOrdinal"
    | "effectLineKey"
    | "owningTable"
    | "owningUniqueName"
    | "expectedCardinality"
    | "lineAmount"
    | "currency"
  >,
  canonicalPayload: Readonly<Record<string, unknown>> = {}
): string {
  return propertyApprovalCanonicalHash({
    effectKind: effect.effectKind,
    effectOrdinal: effect.effectOrdinal,
    effectLineKey: effect.effectLineKey,
    owningTable: effect.owningTable,
    owningUniqueName: effect.owningUniqueName,
    expectedCardinality: effect.expectedCardinality,
    lineAmount: effect.lineAmount ?? null,
    currency: effect.currency ?? null,
    canonicalPayload: canonicalPayload as Record<string, PropertyApprovalJsonValue>
  } as PropertyApprovalJsonValue);
}

export function canonicalEffectLines(
  actionId: TrackBApprovalActionId,
  payload: Readonly<Record<string, unknown>>
): Array<{ effectKind: string; effectLineKey: string; lineAmount: string | null; currency: string | null }> {
  const uuid = (field: string) => {
    const value = payload[field];
    if (typeof value !== "string" || !isUuid(value)) {
      throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-effect-line-payload-missing"
      });
    }
    return value;
  };
  const lines = (field: string) => {
    const value = payload[field];
    if (!Array.isArray(value) || value.length === 0) {
      throw propertyApprovalError("approval-policy-not-found", {
        reason: "approval-effect-line-payload-missing"
      });
    }
    return value as Array<Record<string, unknown>>;
  };
  const financial = (line: Record<string, unknown>) => {
    if (typeof line.amount !== "string"
      || !/^(0|[1-9]\d*)\.\d{2}$/.test(line.amount)
      || typeof line.currency !== "string"
      || !/^[A-Z]{3}$/.test(line.currency)) {
      throw propertyApprovalError("approval-policy-not-found", {
        reason: "approval-effect-line-financial-payload-invalid"
      });
    }
    if (decimalCents(line.amount) <= 0n) {
      throw propertyApprovalError("approval-policy-not-found", {
        reason: "approval-effect-line-financial-payload-invalid"
      });
    }
    return { lineAmount: line.amount, currency: line.currency };
  };
  const nonNegativeMoney = (field: string) => {
    const value = payload[field];
    if (typeof value !== "string" || !/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
      throw propertyApprovalError("approval-policy-not-found", {
        reason: "approval-effect-line-financial-payload-invalid"
      });
    }
    return value;
  };
  const payloadCurrency = () => {
    const value = payload.currency;
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
      throw propertyApprovalError("approval-policy-not-found", {
        reason: "approval-effect-line-financial-payload-invalid"
      });
    }
    return value;
  };
  const plain = { lineAmount: null, currency: null } as const;
  let result: Array<{
    effectKind: string; effectLineKey: string; lineAmount: string | null; currency: string | null
  }> = [];
  switch (actionId) {
    case "homestay.bookings.cancel.request": {
      const bookingId = uuid("bookingId");
      const roomWaiverAmount = nonNegativeMoney("roomWaiverAmount");
      const cancellationFeeAmount = nonNegativeMoney("cancellationFeeAmount");
      const hasWaiver = decimalCents(roomWaiverAmount) > 0n;
      const hasFee = decimalCents(cancellationFeeAmount) > 0n;
      const currency = hasWaiver || hasFee ? payloadCurrency() : null;
      result = [
        { effectKind: "homestay.booking.cancel", effectLineKey: `booking:${bookingId}`, ...plain },
        ...(hasWaiver ? [{
          effectKind: "homestay.ledger.waiver",
          effectLineKey: `ledger:waiver:booking:${bookingId}:room-cancellation`,
          lineAmount: roomWaiverAmount,
          currency
        }] : []),
        ...(hasFee ? [{
          effectKind: "homestay.ledger.charge",
          effectLineKey: `ledger:charge:booking:${bookingId}:cancellation-fee`,
          lineAmount: cancellationFeeAmount,
          currency
        }] : [])
      ];
      break;
    }
    case "homestay.finance.refund-or-waive.request":
      result = lines("lines").map((line) => {
        const entryType = line.entryType;
        if ((entryType !== "refund" && entryType !== "waiver")
          || typeof line.sourceLedgerEntryId !== "string"
          || !isUuid(line.sourceLedgerEntryId)) throw propertyApprovalError("approval-policy-not-found");
        return {
          effectKind: `homestay.ledger.${entryType}`,
          effectLineKey: `ledger:${entryType}:${line.sourceLedgerEntryId}`,
          ...financial(line)
        };
      });
      break;
    case "housing.leases.approve.request":
      result = [{ effectKind: "housing.lease.approve", effectLineKey: `lease:${uuid("leaseId")}`, ...plain }];
      break;
    case "housing.leases.void.request":
      result = [{ effectKind: "housing.lease.void", effectLineKey: `lease:${uuid("leaseId")}`, ...plain }];
      break;
    case "housing.leases.checkout.request":
      result = [{ effectKind: "housing.lease.checkout", effectLineKey: `lease:${uuid("leaseId")}`, ...plain }];
      break;
    case "housing.finance.refund-waive-or-deposit-refund.request":
      result = lines("lines").map((line) => {
        const entryType = line.entryType;
        if (!(["refund", "waiver", "deposit-refund"] as unknown[]).includes(entryType)
          || typeof line.receivableId !== "string"
          || !isUuid(line.receivableId)) throw propertyApprovalError("approval-policy-not-found");
        const kind = entryType === "deposit-refund" ? "deposit.refund" : entryType;
        return {
          effectKind: `housing.ledger.${kind}`,
          effectLineKey: `ledger:${entryType}:${line.receivableId}`,
          ...financial(line)
        };
      });
      break;
    case "housing.handovers.complete-move-out-financial.request": {
      const handoverId = uuid("handoverId");
      const checkoutReceivableAmount = nonNegativeMoney("checkoutReceivableAmount");
      result = [{
        effectKind: "housing.handover.complete.financial",
        effectLineKey: `handover:${handoverId}`,
        ...plain
      }, ...(decimalCents(checkoutReceivableAmount) > 0n ? [{
        effectKind: "housing.receivable.checkout",
        effectLineKey: `receivable:checkout:${uuid("checkoutReceivableId")}`,
        lineAmount: checkoutReceivableAmount,
        currency: payloadCurrency()
      }] : []), ...((payload.deductions == null ? [] : lines("deductions")).map((line) => {
        if (typeof line.itemId !== "string" || !isUuid(line.itemId)) {
          throw propertyApprovalError("approval-policy-not-found");
        }
        if (line.itemId !== handoverId) throw propertyApprovalError("approval-policy-not-found");
        return { effectKind: "housing.ledger.deduction", effectLineKey: `deduction:${line.itemId}`, ...financial(line) };
      }))];
      break;
    }
    case "housing.purchases.lifecycle.request":
      result = [{ effectKind: "housing.purchase.lifecycle", effectLineKey: `purchase:${uuid("purchaseId")}`, ...plain }];
      break;
    case "housing.purchases.transfer.request":
      result = [...lines("items").map((line) => {
        if (typeof line.purchaseItemId !== "string" || !isUuid(line.purchaseItemId)) {
          throw propertyApprovalError("approval-policy-not-found");
        }
        return { effectKind: "housing.purchase.transfer", effectLineKey: `item:${line.purchaseItemId}`, ...plain };
      }), {
        effectKind: "housing.receivable.purchase.transfer",
        effectLineKey: `receivable:purchase-transfer:${uuid("targetReceivableId")}`,
        ...financial({ amount: payload.aggregateDeltaAmount, currency: payload.currency })
      }];
      break;
    case "property.mode-transition.request":
      result = [{ effectKind: "property.mode.transition", effectLineKey: `unit:${uuid("unitId")}`, ...plain }];
      break;
    case "property.occupancy.force-release.request":
      result = [{
        effectKind: "property.occupancy.force.release",
        effectLineKey: `occupancy:${uuid("occupancyId")}`,
        ...plain
      }];
      break;
  }
  if (new Set(result.map((line) => line.effectLineKey)).size !== result.length) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-effect-line-payload-duplicate"
    });
  }
  return result;
}

const FINANCIAL_EFFECT_KINDS = new Set([
  "homestay.ledger.charge",
  "homestay.ledger.refund",
  "homestay.ledger.waiver",
  "housing.ledger.refund",
  "housing.ledger.waiver",
  "housing.ledger.deposit.refund",
  "housing.ledger.deduction",
  "housing.receivable.checkout",
  "housing.receivable.purchase.transfer"
]);

const EFFECT_AUTHORITIES: Record<string, {
  owningTable: string;
  owningUniqueName: string;
  expectedCardinality: number;
  lineKey: RegExp;
  financial: boolean;
}> = {
  "homestay.booking.cancel": {
    owningTable: "biz_homestay_booking_action_log",
    owningUniqueName: "uq_homestay_action_approval_line",
    expectedCardinality: 2,
    lineKey: /^booking:[0-9a-f-]{36}$/,
    financial: false
  },
  "homestay.ledger.refund": {
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:refund:[0-9a-f-]{36}$/,
    financial: true
  },
  "homestay.ledger.waiver": {
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:waiver:(?:[0-9a-f-]{36}|booking:[0-9a-f-]{36}:room-cancellation)$/,
    financial: true
  },
  "homestay.ledger.charge": {
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:charge:booking:[0-9a-f-]{36}:cancellation-fee$/,
    financial: true
  },
  "housing.lease.approve": {
    owningTable: "biz_housing_lease",
    owningUniqueName: "biz_housing_lease_pkey",
    expectedCardinality: 1,
    lineKey: /^lease:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.lease.void": {
    owningTable: "biz_housing_lease_effect_audit",
    owningUniqueName: "uq_housing_lease_effect_audit_approval_line",
    expectedCardinality: 2,
    lineKey: /^lease:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.lease.checkout": {
    owningTable: "biz_housing_lease_effect_audit",
    owningUniqueName: "uq_housing_lease_effect_audit_approval_line",
    expectedCardinality: 2,
    lineKey: /^lease:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.ledger.refund": {
    owningTable: "biz_housing_ledger_entry",
    owningUniqueName: "uq_housing_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:refund:[0-9a-f-]{36}$/,
    financial: true
  },
  "housing.ledger.waiver": {
    owningTable: "biz_housing_ledger_entry",
    owningUniqueName: "uq_housing_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:waiver:[0-9a-f-]{36}$/,
    financial: true
  },
  "housing.ledger.deposit.refund": {
    owningTable: "biz_housing_ledger_entry",
    owningUniqueName: "uq_housing_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^ledger:deposit-refund:[0-9a-f-]{36}$/,
    financial: true
  },
  "housing.handover.complete.financial": {
    owningTable: "biz_housing_lease_effect_audit",
    owningUniqueName: "uq_housing_lease_effect_audit_approval_line",
    expectedCardinality: 3,
    lineKey: /^handover:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.receivable.checkout": {
    owningTable: "biz_housing_receivable",
    owningUniqueName: "biz_housing_receivable_pkey",
    expectedCardinality: 1,
    lineKey: /^receivable:checkout:[0-9a-f-]{36}$/,
    financial: true
  },
  "housing.ledger.deduction": {
    owningTable: "biz_housing_ledger_entry",
    owningUniqueName: "uq_housing_ledger_approval_line",
    expectedCardinality: 1,
    lineKey: /^deduction:[0-9a-f-]{36}$/,
    financial: true
  },
  "housing.purchase.lifecycle": {
    owningTable: "biz_housing_purchase_effect_audit",
    owningUniqueName: "uq_housing_purchase_effect_audit_approval_line",
    expectedCardinality: 2,
    lineKey: /^purchase:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.purchase.transfer": {
    owningTable: "biz_housing_purchase_transfer_effect_audit",
    owningUniqueName: "uq_housing_purchase_transfer_effect_audit_approval_line",
    expectedCardinality: 2,
    lineKey: /^item:[0-9a-f-]{36}$/,
    financial: false
  },
  "housing.receivable.purchase.transfer": {
    owningTable: "biz_housing_receivable",
    owningUniqueName: "biz_housing_receivable_pkey",
    expectedCardinality: 1,
    lineKey: /^receivable:purchase-transfer:[0-9a-f-]{36}$/,
    financial: true
  },
  "property.mode.transition": {
    owningTable: "biz_property_mode_transition_log",
    owningUniqueName: "uq_property_mode_transition_approval_line",
    expectedCardinality: 2,
    lineKey: /^unit:[0-9a-f-]{36}$/,
    financial: false
  },
  "property.occupancy.force.release": {
    owningTable: "biz_property_occupancy_release_audit",
    owningUniqueName: "uq_property_occupancy_release_audit_approval_line",
    expectedCardinality: 2,
    lineKey: /^occupancy:[0-9a-f-]{36}$/,
    financial: false
  }
};

const MULTI_LINE_ACTIONS = new Set<TrackBApprovalActionId>([
  "homestay.bookings.cancel.request",
  "homestay.finance.refund-or-waive.request",
  "housing.finance.refund-waive-or-deposit-refund.request",
  "housing.handovers.complete-move-out-financial.request",
  "housing.purchases.transfer.request"
]);

function effectCardinality(
  effectKind: string,
  payload: Readonly<Record<string, unknown>> = {}
): number {
  if (effectKind === "homestay.booking.cancel") {
    const occupancy = payload.occupancy;
    const credentials = payload.credentials;
    const occupancyId = occupancy && typeof occupancy === "object" && !Array.isArray(occupancy)
      ? (occupancy as Record<string, unknown>).id
      : occupancy === null ? null : undefined;
    const credentialIds = Array.isArray(credentials)
      ? credentials.map((credential) => credential && typeof credential === "object"
        && !Array.isArray(credential) ? (credential as Record<string, unknown>).id : undefined)
      : undefined;
    if (!(occupancyId === null || (typeof occupancyId === "string" && isUuid(occupancyId)))
      || !Array.isArray(credentialIds)
      || credentialIds.some((id) => typeof id !== "string" || !isUuid(id))) {
      return 0;
    }
    return 2 + (occupancyId === null ? 0 : 1) + credentialIds.length;
  }
  if (effectKind === "housing.lease.checkout") {
    const occupancyId = payload.occupancyId;
    if (!(occupancyId == null || (typeof occupancyId === "string" && isUuid(occupancyId)))) {
      return 0;
    }
    return 2 + (occupancyId == null ? 0 : 1);
  }
  return EFFECT_AUTHORITIES[effectKind]?.expectedCardinality ?? 0;
}

function validateEffectFinancialSemantics(
  actionId: TrackBApprovalActionId,
  policy: FrozenApprovalPolicy,
  requestAmount: string | null,
  requestCurrency: string | null
): void {
  if (!MULTI_LINE_ACTIONS.has(actionId) && policy.effects.length !== 1) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-effect-line-count-invalid"
    });
  }
  const financialEffects = policy.effects.filter((effect) =>
    FINANCIAL_EFFECT_KINDS.has(effect.effectKind)
  );
  const nonFinancialEffects = policy.effects.filter((effect) =>
    !FINANCIAL_EFFECT_KINDS.has(effect.effectKind)
  );
  const pureFinance =
    actionId === "homestay.finance.refund-or-waive.request"
    || actionId === "housing.finance.refund-waive-or-deposit-refund.request";
  if (pureFinance && (
    financialEffects.length === 0 || nonFinancialEffects.length !== 0
  )) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-financial-lines-required"
    });
  }
  if (
    actionId === "housing.handovers.complete-move-out-financial.request"
    && (
      nonFinancialEffects.length !== 1
      || nonFinancialEffects[0]?.effectKind !== "housing.handover.complete.financial"
    )
  ) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-handover-line-required"
    });
  }
  const compoundFinance = actionId === "homestay.bookings.cancel.request"
    || actionId === "housing.handovers.complete-move-out-financial.request"
    || actionId === "housing.purchases.transfer.request";
  if (!pureFinance
    && !compoundFinance
    && financialEffects.length !== 0
  ) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-unexpected-financial-line"
    });
  }
  if (nonFinancialEffects.some((effect) =>
    effect.lineAmount != null || effect.currency != null
  )) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-nonfinancial-line-has-amount"
    });
  }
  if (financialEffects.length === 0) {
    if (pureFinance) throw propertyApprovalError("approval-policy-not-found");
    return;
  }
  if (
    requestAmount == null
    || requestCurrency == null
    || !/^[A-Z]{3}$/.test(requestCurrency)
  ) throw propertyApprovalError("approval-policy-not-found", {
    reason: "approval-request-financial-total-missing"
  });
  let total = 0n;
  for (const effect of financialEffects) {
    if (
      effect.lineAmount == null
      || effect.currency !== requestCurrency
      || decimalCents(effect.lineAmount) <= 0n
    ) throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-financial-line-invalid"
    });
    total += decimalCents(effect.lineAmount);
  }
  if (total !== decimalCents(requestAmount)) {
    throw propertyApprovalError("approval-policy-not-found", {
      reason: "approval-financial-total-mismatch"
    });
  }
}

function decimalCents(value: string): bigint {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw propertyApprovalError("property-validation-failed");
  }
  const [whole, fraction] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction!);
}

export function normalizeObject(value: Record<string, unknown>): Record<string, unknown> {
  return normalizeValue(value) as Record<string, unknown>;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeValue(item)])
    );
  }
  return value;
}

export function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizeValue(value))).digest("hex");
}

function isHttpException(error: unknown): error is { getStatus(): number } {
  return Boolean(error && typeof (error as { getStatus?: unknown }).getStatus === "function");
}

function clearClaim(request: PropertyApprovalRequestEntity): void {
  request.claimToken = null;
  request.workerId = null;
  request.leaseExpiresAt = null;
  request.heartbeatAt = null;
}

function executionPatch(
  request: PropertyApprovalRequestEntity
) {
  return {
    executionStatus: request.executionStatus,
    executionVersion: request.executionVersion,
    claimEpoch: request.claimEpoch,
    claimToken: request.claimToken,
    workerId: request.workerId,
    leaseExpiresAt: request.leaseExpiresAt,
    heartbeatAt: request.heartbeatAt,
    attemptCount: request.attemptCount,
    nextRetryAt: request.nextRetryAt,
    reconcileRequired: request.reconcileRequired,
    lastErrorCategory: request.lastErrorCategory,
    lastErrorCode: request.lastErrorCode,
    lastErrorRedactedMessage: request.lastErrorRedactedMessage,
    infraExhaustedAt: request.infraExhaustedAt,
    executedAt: request.executedAt,
    updatedAt: request.updatedAt
  };
}

function requireCas(updated: boolean): void {
  if (!updated) throw propertyApprovalError("property-version-conflict");
}

function assertClaim(
  request: PropertyApprovalRequestEntity,
  claim: ApprovalExecutionClaim,
  now: Date,
  requireLiveLease = true
): void {
  if (
    request.executionStatus !== "executing"
    || request.claimEpoch !== claim.claimEpoch
    || request.claimToken !== claim.claimToken
    || request.workerId !== claim.workerId
    || request.executionVersion !== claim.executionVersion
    || (requireLiveLease
      && (!request.leaseExpiresAt || request.leaseExpiresAt.getTime() <= now.getTime()))
  ) throw propertyApprovalError("property-version-conflict");
}

export function validateEffectReceipts(
  request: PropertyApprovalRequestEntity,
  manifests: readonly PropertyExecutionEffectManifestEntity[],
  receipts: readonly PropertyApprovalEffectReceipt[],
  financialMutationCount: number
): void {
  validateManifestIntegrity(manifests, request.canonicalPayload ?? {}, request.actionId);
  const receiptByLine = new Map<string, PropertyApprovalEffectReceipt>();
  const uniqueProofs = new Set<string>();
  for (const receipt of receipts) {
    const uniqueProof = `${receipt.owningUniqueName}:${receipt.uniqueKeyHash}`;
    if (receiptByLine.has(receipt.effectLineKey) || uniqueProofs.has(uniqueProof)) {
      throw new ApprovalExecutionError(
        "business",
        "approval-reconcile-partial",
        "Approval effect uniqueness proof duplicated"
      );
    }
    receiptByLine.set(receipt.effectLineKey, receipt);
    uniqueProofs.add(uniqueProof);
  }
  if (receipts.length !== manifests.length) throw new ApprovalExecutionError(
    "business",
    "approval-reconcile-partial",
    "Approval effect cardinality mismatch"
  );
  for (const manifest of manifests) {
    const receipt = receiptByLine.get(manifest.effectLineKey);
    if (
      !receipt
      || receipt.manifestId !== manifest.id
      || receipt.effectKind !== manifest.effectKind
      || receipt.effectOrdinal !== manifest.effectOrdinal
      || receipt.effectHash !== manifest.invariantHash
      || receipt.domainTable !== manifest.owningTable
      || receipt.owningUniqueName !== manifest.owningUniqueName
      || !/^[0-9a-f]{64}$/.test(receipt.uniqueKeyHash)
      || receipt.observedCardinality !== manifest.expectedCardinality
      || !isUuid(receipt.domainRowId)
      || !sameAmount(receipt.lineAmount ?? null, manifest.lineAmount)
      || (receipt.currency ?? null) !== manifest.currency
    ) throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Approval effect invariant mismatch"
    );
  }
  const financialReceipts = receipts.filter((receipt) =>
    FINANCIAL_EFFECT_KINDS.has(receipt.effectKind)
  );
  if (financialReceipts.length === 0) {
    if (
      financialMutationCount !== 0
      || receipts.some((receipt) => receipt.lineAmount != null || receipt.currency != null)
    ) throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Non-financial approval changed financial rows"
    );
    return;
  }
  if (
    request.amount == null
    || request.currency == null
    || financialMutationCount !== financialReceipts.reduce(
      (count, receipt) => count + receipt.observedCardinality,
      0
    )
    || financialReceipts.some((receipt) =>
      receipt.lineAmount == null
      || receipt.currency !== request.currency
      || decimalCents(receipt.lineAmount) <= 0n
    )
    || financialReceipts.reduce(
      (sum, receipt) => sum + decimalCents(receipt.lineAmount!),
      0n
    ) !== decimalCents(request.amount)
  ) throw new ApprovalExecutionError(
    "business",
    "approval-reconcile-partial",
    "Financial receipt total/currency/cardinality mismatch"
  );
}

function validateAdapterEffectReceipts(
  request: PropertyApprovalRequestEntity,
  manifests: readonly PropertyExecutionEffectManifestEntity[],
  receipts: readonly PropertyApprovalEffectReceipt[],
  financialMutationCount: number
): void {
  try {
    validateEffectReceipts(request, manifests, receipts, financialMutationCount);
  } catch (error) {
    if (error instanceof ApprovalExecutionError) throw error;
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Approval adapter effect proof is malformed"
    );
  }
}

function validateAdapterOutboxEvents(
  events: readonly import("./property-approval.ports").PropertyApprovalOutboxEvent[],
  request: PropertyApprovalRequestEntity
): void {
  try {
    validateOutboxEvents(events, request);
  } catch (error) {
    if (error instanceof ApprovalExecutionError) throw error;
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Approval adapter outbox proof is malformed"
    );
  }
}

function validateOutboxEvents(
  events: readonly import("./property-approval.ports").PropertyApprovalOutboxEvent[],
  request: PropertyApprovalRequestEntity
): void {
  const event = events[0];
  if (
    events.length !== 1
    || !event
    || !isUuid(event.eventId)
    || event.eventType !== `${request.actionId}.executed`
    || event.eventVersion !== 1
    || event.aggregateType !== request.sourceType
    || event.aggregateId !== request.sourceId
    || event.aggregateVersion !== request.sourceExpectedVersion + 1
    || event.orderingKey !== `${request.sourceType}:${request.sourceId}`
    || event.eventOrdinal !== 0
    || event.payload.approvalRequestId !== request.id
    || event.payload.executionIdempotencyKey !== request.executionIdempotencyKey
    || event.payload.actionId !== request.actionId
    || event.payload.sourceType !== request.sourceType
    || event.payload.sourceId !== request.sourceId
    || event.payload.sourceExpectedVersion !== request.sourceExpectedVersion
    || event.payloadHash !== hash(event.payload)
  ) throw new ApprovalExecutionError(
    "business",
    "approval-reconcile-partial",
    "Approval outbox event proof invalid"
  );
}

function validateManifestIntegrity(
  manifests: readonly Pick<
    PropertyExecutionEffectManifestEntity,
    | "effectKind"
    | "effectOrdinal"
    | "effectLineKey"
    | "owningTable"
    | "owningUniqueName"
    | "expectedCardinality"
    | "lineAmount"
    | "currency"
    | "invariantHash"
  >[],
  canonicalPayload: Readonly<Record<string, unknown>>,
  actionId: TrackBApprovalActionId
): void {
  const ordinals = manifests.map((manifest) => manifest.effectOrdinal);
  const canonicalLines = canonicalEffectLines(actionId, canonicalPayload);
  if (
    manifests.length === 0
    || new Set(ordinals).size !== ordinals.length
    || ordinals.some((value, index) => value !== index)
    || manifests.some((manifest) =>
      !EFFECT_AUTHORITIES[manifest.effectKind]
      || manifest.owningTable !== EFFECT_AUTHORITIES[manifest.effectKind]!.owningTable
      || manifest.owningUniqueName !== EFFECT_AUTHORITIES[manifest.effectKind]!.owningUniqueName
      || manifest.expectedCardinality
        !== effectCardinality(manifest.effectKind, canonicalPayload)
      || !EFFECT_AUTHORITIES[manifest.effectKind]!.lineKey.test(manifest.effectLineKey)
      || manifest.invariantHash !== canonicalEffectInvariantHash(manifest, canonicalPayload)
    )
    || canonicalLines.length !== manifests.length
    || manifests.some((manifest, index) =>
      canonicalLines[index]?.effectKind !== manifest.effectKind
      || canonicalLines[index]?.effectLineKey !== manifest.effectLineKey
      || canonicalLines[index]?.lineAmount !== (manifest.lineAmount ?? null)
      || canonicalLines[index]?.currency !== (manifest.currency ?? null)
    )
  ) throw new ApprovalExecutionError(
    "business",
    "approval-reconcile-partial",
    "Approval effect manifest integrity mismatch"
  );
}

function hasNoExecutionAuthority(
  authority: PropertyApprovalExecutionAuthority
): boolean {
  return authority.receipts.length === 0
    && authority.executedAudits.length === 0
    && authority.outbox.length === 0;
}

function validateExistingExecutedAuthority(
  request: PropertyApprovalRequestEntity,
  manifests: readonly PropertyExecutionEffectManifestEntity[],
  authority: PropertyApprovalExecutionAuthority
): void {
  validateManifestIntegrity(manifests, request.canonicalPayload, request.actionId);
  validatePersistedManifestReceipts(request, manifests, authority);
  if (!hasCompleteExecutionAuthority(request, authority)) {
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Existing executed approval authority is incomplete"
    );
  }
}

function validateIncidentExecutedAuthority(
  request: PropertyApprovalRequestEntity,
  manifests: readonly PropertyExecutionEffectManifestEntity[],
  authority: PropertyApprovalExecutionAuthority
): void {
  try {
    validateExistingExecutedAuthority(request, manifests, authority);
  } catch (error) {
    if (error instanceof ApprovalExecutionError) {
      throw propertyApprovalError("approval-reconcile-partial");
    }
    throw error;
  }
}

function validatePersistedManifestReceipts(
  request: PropertyApprovalRequestEntity,
  manifests: readonly PropertyExecutionEffectManifestEntity[],
  authority: PropertyApprovalExecutionAuthority
): void {
  if (authority.receipts.length !== manifests.length) {
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted receipt cardinality differs from frozen manifest"
    );
  }
  for (const manifest of manifests) {
    const receipt = authority.receipts.find((candidate) =>
      candidate.manifestId === manifest.id
      && candidate.effectLineKey === manifest.effectLineKey
    );
    if (
      !receipt
      || receipt.effectKind !== manifest.effectKind
      || receipt.effectOrdinal !== manifest.effectOrdinal
      || receipt.domainTable !== manifest.owningTable
      || receipt.owningUniqueName !== manifest.owningUniqueName
      || !isUuid(receipt.domainRowId)
      || receipt.effectHash !== manifest.invariantHash
      || !/^[0-9a-f]{64}$/.test(receipt.uniqueKeyHash)
      || receipt.observedCardinality !== manifest.expectedCardinality
      || !sameAmount(receipt.lineAmount, manifest.lineAmount)
      || receipt.currency !== manifest.currency
    ) throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted receipt differs from frozen manifest"
    );
  }
  const financialReceipts = authority.receipts.filter((receipt) =>
    FINANCIAL_EFFECT_KINDS.has(receipt.effectKind)
  );
  if (financialReceipts.length === 0) {
    if (authority.receipts.some((receipt) =>
      receipt.lineAmount != null || receipt.currency != null
    )) throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted non-financial receipt has financial values"
    );
    return;
  }
  try {
    if (
      request.amount == null
      || request.currency == null
      || financialReceipts.some((receipt) =>
        receipt.lineAmount == null
        || receipt.currency !== request.currency
        || decimalCents(receipt.lineAmount) <= 0n
      )
      || financialReceipts.reduce(
        (sum, receipt) => sum + decimalCents(receipt.lineAmount!),
        0n
      ) !== decimalCents(request.amount)
    ) throw new Error("financial-total-mismatch");
  } catch {
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted financial receipt total or currency is invalid"
    );
  }
}

function hasCompleteExecutionAuthority(
  request: PropertyApprovalRequestEntity,
  authority: PropertyApprovalExecutionAuthority
): boolean {
  return request.executionStatus === "executed"
    && request.executedAt != null
    && authority.receipts.length > 0
    && authority.executedAudits.length === 1
    && authority.executedAudits[0]?.payloadHash === request.payloadHash
    && authority.executedAudits[0]?.executionVersion === request.executionVersion
    && authority.outbox.length === 1
    && isAuthoritativeOutbox(request, authority.outbox[0]!);
}

function validatePersistedReceiptEvidence(
  adapterReceipts: readonly PropertyApprovalEffectReceipt[],
  authority: PropertyApprovalExecutionAuthority
): void {
  if (adapterReceipts.length !== authority.receipts.length) {
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted receipt cardinality mismatch"
    );
  }
  for (const adapterReceipt of adapterReceipts) {
    const persisted = authority.receipts.find((receipt) =>
      receipt.effectKind === adapterReceipt.effectKind
      && receipt.effectOrdinal === adapterReceipt.effectOrdinal
      && receipt.effectLineKey === adapterReceipt.effectLineKey
    );
    if (
      !persisted
      || persisted.manifestId !== adapterReceipt.manifestId
      || persisted.domainTable !== adapterReceipt.domainTable
      || persisted.domainRowId !== adapterReceipt.domainRowId
      || persisted.effectHash !== adapterReceipt.effectHash
      || persisted.owningUniqueName !== adapterReceipt.owningUniqueName
      || persisted.uniqueKeyHash !== adapterReceipt.uniqueKeyHash
      || persisted.observedCardinality !== adapterReceipt.observedCardinality
      || !sameAmount(persisted.lineAmount, adapterReceipt.lineAmount ?? null)
      || persisted.currency !== (adapterReceipt.currency ?? null)
    ) throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Persisted receipt differs from domain effect proof"
    );
  }
}

export function validatePersistedExecutionAuthority(
  request: PropertyApprovalRequestEntity,
  adapterReceipts: readonly PropertyApprovalEffectReceipt[],
  expectedEvent: import("./property-approval.ports").PropertyApprovalOutboxEvent,
  authority: PropertyApprovalExecutionAuthority
): void {
  validatePersistedReceiptEvidence(adapterReceipts, authority);
  if (!hasCompleteExecutionAuthority(request, authority)) {
    throw new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Approval terminal/audit/outbox authority incomplete"
    );
  }
  validatePersistedOutbox(request, expectedEvent, authority.outbox[0]!);
}

function validatePersistedOutbox(
  request: PropertyApprovalRequestEntity,
  expected: import("./property-approval.ports").PropertyApprovalOutboxEvent,
  persisted: PersistedApprovalOutboxEvidence
): void {
  if (
    persisted.eventId !== expected.eventId
    || persisted.eventType !== expected.eventType
    || persisted.eventVersion !== expected.eventVersion
    || persisted.aggregateType !== expected.aggregateType
    || persisted.aggregateId !== expected.aggregateId
    || persisted.aggregateVersion !== expected.aggregateVersion
    || persisted.orderingKey !== expected.orderingKey
    || BigInt(persisted.sequence) < 1n
    || persisted.eventOrdinal !== 0
    || persisted.approvalRequestId !== request.id
    || persisted.executionIdempotencyKey !== request.executionIdempotencyKey
    || hash(persisted.payload) !== persisted.payloadHash
    || persisted.payloadHash !== expected.payloadHash
    || JSON.stringify(normalizeValue(persisted.payload))
      !== JSON.stringify(normalizeValue(expected.payload))
    || persisted.status !== "pending"
  ) throw new ApprovalExecutionError(
    "business",
    "approval-reconcile-partial",
    "Persisted outbox identity/payload/order proof invalid"
  );
}

function isAuthoritativeOutbox(
  request: PropertyApprovalRequestEntity,
  persisted: PersistedApprovalOutboxEvidence
): boolean {
  return isUuid(persisted.eventId)
    && persisted.eventType === `${request.actionId}.executed`
    && persisted.eventVersion === 1
    && persisted.aggregateType === request.sourceType
    && persisted.aggregateId === request.sourceId
    && persisted.aggregateVersion === request.sourceExpectedVersion + 1
    && persisted.orderingKey === `${request.sourceType}:${request.sourceId}`
    && BigInt(persisted.sequence) >= 1n
    && persisted.eventOrdinal === 0
    && persisted.approvalRequestId === request.id
    && persisted.executionIdempotencyKey === request.executionIdempotencyKey
    && persisted.payload.approvalRequestId === request.id
    && persisted.payload.executionIdempotencyKey === request.executionIdempotencyKey
    && persisted.payload.actionId === request.actionId
    && persisted.payload.sourceType === request.sourceType
    && persisted.payload.sourceId === request.sourceId
    && persisted.payload.sourceExpectedVersion === request.sourceExpectedVersion
    && hash(persisted.payload) === persisted.payloadHash
    && ["pending", "publishing", "retry_wait", "published", "dlq"].includes(persisted.status);
}

function classifyExecutionError(error: unknown): ApprovalExecutionError | null {
  if (error instanceof ApprovalExecutionError) return error;
  const value = error as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = value?.code ?? value?.driverError?.code;
  const constraint = value?.constraint ?? value?.driverError?.constraint ?? "";
  if (code === "40001" || code === "40P01") {
    return new ApprovalExecutionError(
      "infra",
      "approval-database-concurrency-conflict",
      "Approval database concurrency conflict"
    );
  }
  if (code === "23503") {
    return new ApprovalExecutionError(
      "business",
      "approval-source-changed",
      "Approval source changed"
    );
  }
  if (
    code === "23505"
    && (
      constraint.includes("effect_receipt")
      || constraint.includes("effect_manifest")
      || constraint.includes("outbox")
    )
  ) {
    return new ApprovalExecutionError(
      "business",
      "approval-reconcile-partial",
      "Approval effect uniqueness conflict"
    );
  }
  if (code) return null;
  if (error instanceof Error) {
    return new ApprovalExecutionError(
      "infra",
      "approval-adapter-unexpected",
      "Approval effect adapter failed"
    );
  }
  return null;
}

function retryBackoffMs(attemptCount: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.max(0, attemptCount - 1));
}

function sameAmount(left: string | null, right: string | null): boolean {
  return left == null || right == null
    ? left == null && right == null
    : decimalCents(left) === decimalCents(right);
}

function completeMutation(
  mutation: PropertyMutationReceiptEntity,
  requestId: string,
  outcome: string,
  request: PropertyApprovalRequestEntity
): void {
  mutation.receiptStatus = "completed";
  mutation.resultRef = `property-approval:${requestId}:${outcome}`;
  mutation.resultHash = hash({
    requestId,
    outcome,
    executionStatus: request.executionStatus,
    executionVersion: request.executionVersion
  });
  mutation.completedAt = new Date();
}

function assertReplayableMutation(
  mutation: PropertyMutationReceiptEntity,
  requestHash: string
): void {
  if (mutation.requestHash !== requestHash) {
    throw propertyApprovalError("idempotency-key-conflict");
  }
  if (mutation.receiptStatus !== "completed") {
    throw propertyApprovalError("property-runtime-unavailable", {
      recoveryAction: "retry-with-same-client-key"
    });
  }
}

function validateClientKey(value: string): void {
  if (
    value.length < 1
    || value.length > 128
    || !/^[\x20-\x7e]+$/.test(value)
    || !value.trim()
  ) throw propertyApprovalError("property-validation-failed");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assertUuid(value: string): void {
  if (!isUuid(value)) throw propertyApprovalError("property-validation-failed");
}

export function hasPermission(
  granted: readonly string[],
  required: string
): boolean {
  return granted.some((permission) =>
    permission === "*"
    || permission === required
    || (permission.endsWith("*") && required.startsWith(permission.slice(0, -1)))
  );
}

function predicateAllowsRequest(
  predicate: PropertyApprovalReadPredicate,
  request: PropertyApprovalRequestEntity,
  actorId: string
): boolean {
  return predicate.canReadAll
    || predicate.requesterId === actorId
      && predicate.requesterRequestIds.includes(request.id)
      && request.requesterId === actorId
    || predicate.eligibleApproverRequestIds.includes(request.id)
    || predicate.auditorRequestIds.includes(request.id);
}
