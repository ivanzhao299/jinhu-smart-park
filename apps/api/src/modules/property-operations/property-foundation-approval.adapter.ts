import { Injectable, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "../property-approvals/property-approval.registries";
import type {
  FrozenApprovalEffect,
  PropertyApprovalEffectAdapter,
  PropertyApprovalOutboxEvent,
  PropertyApprovalVerifiedEffectProof
} from "../property-approvals/property-approval.ports";
import {
  canonicalEffectInvariantHash,
  canonicalEffectLines,
  propertyApprovalCanonicalHash
} from "../property-approvals/property-approval.service";
import { PropertyOccupanciesService } from "./property-occupancies.service";
import { PropertyOperationsService } from "./property-operations.service";

const POLICY_IDS: Record<FoundationActionId, string> = {
  "property.mode-transition.request": "b2000000-0000-4000-8000-000000000001",
  "property.occupancy.force-release.request": "b2000000-0000-4000-8000-000000000002"
};

type FoundationActionId =
  | "property.mode-transition.request"
  | "property.occupancy.force-release.request";

interface ApprovalRequestRow {
  tenantId: string;
  parkId: string;
  actionId: FoundationActionId;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
}

@Injectable()
export class PropertyFoundationApprovalAdapter implements OnModuleInit {
  constructor(
    private readonly policies: FrozenPropertyApprovalPolicyResolver,
    private readonly effects: PropertyApprovalEffectRegistry,
    private readonly proofs: PropertyApprovalEffectProofVerifierRegistryService,
    private readonly operations: PropertyOperationsService,
    private readonly occupancies: PropertyOccupanciesService
  ) {}

  onModuleInit(): void {
    for (const actionId of Object.keys(POLICY_IDS) as FoundationActionId[]) {
      this.policies.register(actionId, (input) => this.resolvePolicy(actionId, input));
      this.effects.register(this.effectAdapter(actionId));
      this.proofs.register({
        actionId,
        effectKind: actionId === "property.mode-transition.request"
          ? "property.mode.transition"
          : "property.occupancy.force.release",
        verify: (input) => this.verify(actionId, input)
      });
    }
  }

  private async resolvePolicy(
    actionId: FoundationActionId,
    input: Parameters<FrozenPropertyApprovalPolicyResolver["resolve"]>[0]
  ) {
    const sourceCreatorId = await this.sourceCreator(
      input.manager,
      input.scope,
      actionId,
      input.sourceId
    );
    const eligibleActorIds = await this.actorIdsWithPermission(
      input.manager,
      input.scope,
      "property_approval:decide"
    );
    const auditorActorIds = await this.actorIdsWithPermission(
      input.manager,
      input.scope,
      "property_approval:read"
    );
    const incidentActorIds = await this.actorIdsWithPermission(
      input.manager,
      input.scope,
      "property_approval:retry"
    );
    const eligibilityPolicySnapshot = {
      requiredPermissions: ["property_approval:decide"],
      eligibleActorIds,
      auditorActorIds,
      incidentActorIds,
      sourceScopes: [{ sourceType: input.sourceType, sourceId: input.sourceId }]
    };
    const definitions = canonicalEffectLines(actionId, input.canonicalPayload);
    const effects = definitions.map((line, effectOrdinal) => {
      const effect: Omit<FrozenApprovalEffect, "invariantHash"> = {
        ...line,
        effectOrdinal,
        owningTable: actionId === "property.mode-transition.request"
          ? "biz_property_mode_transition_log"
          : "biz_property_occupancy_release_audit",
        owningUniqueName: actionId === "property.mode-transition.request"
          ? "uq_property_mode_transition_approval_line"
          : "uq_property_occupancy_release_audit_approval_line",
        expectedCardinality: 2
      };
      return {
        ...effect,
        invariantHash: canonicalEffectInvariantHash(effect, input.canonicalPayload)
      };
    });
    return {
      policyId: POLICY_IDS[actionId],
      policyVersion: 1,
      policyHash: propertyApprovalCanonicalHash({
        owner: "property-foundation",
        actionId,
        version: 1
      }),
      stages: [{
        stageCode: "property-foundation-approval",
        stageOrdinal: 1,
        eligibilityPolicySnapshot,
        eligibilityPolicyVersion: 1,
        eligibilityPolicyHash: propertyApprovalCanonicalHash(eligibilityPolicySnapshot),
        requiredCount: 1
      }],
      exclusions: [{
        actorId: sourceCreatorId,
        reasonCode: "source_creator",
        sourceType: input.sourceType,
        sourceId: input.sourceId
      }],
      effects
    };
  }

  private effectAdapter(actionId: FoundationActionId): PropertyApprovalEffectAdapter {
    return {
      actionId,
      execute: async (input) => {
        const request = await this.requestRow(input.manager, input.requestId, actionId);
        if (actionId === "property.mode-transition.request") {
          await this.operations.executeApprovedModeTransition({ ...input, request });
        } else {
          await this.occupancies.executeApprovedForceRelease({ ...input, request });
        }
        return {
          receipts: [],
          outboxEvents: [this.outboxEvent(request, input.requestId, input.executionIdempotencyKey)],
          financialMutationCount: 0
        };
      },
      reconcile: async (input) => {
        const request = await this.requestRow(input.manager, input.requestId, actionId);
        const evidenceQuery = actionId === "property.mode-transition.request"
          ? `SELECT count(*)::integer AS count,
                    count(aggregate.id)::integer AS "matchingCount"
               FROM biz_property_mode_transition_log audit
               LEFT JOIN biz_property_operation_config aggregate
                 ON aggregate.tenant_id=audit.tenant_id
                AND aggregate.park_id=audit.park_id
                AND aggregate.id=audit.source_config_id
                AND aggregate.unit_id=audit.unit_id
                AND aggregate.version=audit.source_expected_version+1
                AND aggregate.operating_mode=audit.to_mode
                AND aggregate.is_deleted=false
              WHERE audit.tenant_id=$1 AND audit.park_id=$2
                AND audit.approval_execution_key=$3`
          : `SELECT count(*)::integer AS count,
                    count(aggregate.id)::integer AS "matchingCount"
               FROM biz_property_occupancy_release_audit audit
               LEFT JOIN biz_property_occupancy aggregate
                 ON aggregate.tenant_id=audit.tenant_id
                AND aggregate.park_id=audit.park_id
                AND aggregate.id=audit.occupancy_id
                AND aggregate.version=audit.resulting_version
                AND aggregate.status=audit.to_status
                AND aggregate.source_domain=audit.source_domain
                AND aggregate.source_type=audit.source_type
                AND aggregate.source_id=audit.source_id
                AND aggregate.is_deleted=false
              WHERE audit.tenant_id=$1 AND audit.park_id=$2
                AND audit.approval_execution_key=$3`;
        const rows = await input.manager.query(
          evidenceQuery,
          [request.tenantId, request.parkId, input.executionIdempotencyKey]
        ) as Array<{ count: number; matchingCount: number }>;
        const count = Number(rows[0]?.count ?? 0);
        const matchingCount = Number(rows[0]?.matchingCount ?? 0);
        if (count === 0) return { state: "absent" as const, financialMutationCount: 0 as const };
        if (count === 1 && matchingCount === 1) return {
          state: "complete" as const,
          receipts: [],
          financialMutationCount: 0
        };
        return {
          state: "partial" as const,
          reason: "property-foundation-effect-cardinality",
          evidence: { count, matchingCount }
        };
      }
    };
  }

  private async verify(
    actionId: FoundationActionId,
    input: {
      manager: EntityManager;
      scope: TenantParkScope;
      executionIdempotencyKey: string;
      effectLineKey: string;
      expectedCardinality: number;
      owningTable: string;
      owningUniqueName: string;
    }
  ): Promise<PropertyApprovalVerifiedEffectProof> {
    const proofQuery = actionId === "property.mode-transition.request"
      ? `SELECT audit.id::text AS id
           FROM biz_property_mode_transition_log audit
           JOIN biz_property_operation_config aggregate
            ON aggregate.tenant_id=audit.tenant_id
            AND aggregate.park_id=audit.park_id
            AND aggregate.id=audit.source_config_id
            AND aggregate.unit_id=audit.unit_id
            AND aggregate.version=audit.source_expected_version+1
            AND aggregate.operating_mode=audit.to_mode
            AND aggregate.is_deleted=false
          WHERE audit.tenant_id=$1 AND audit.park_id=$2
            AND audit.approval_execution_key=$3
            AND audit.approval_effect_line_key=$4`
      : `SELECT audit.id::text AS id
           FROM biz_property_occupancy_release_audit audit
           JOIN biz_property_occupancy aggregate
             ON aggregate.tenant_id=audit.tenant_id
            AND aggregate.park_id=audit.park_id
            AND aggregate.id=audit.occupancy_id
            AND aggregate.version=audit.resulting_version
            AND aggregate.status=audit.to_status
            AND aggregate.source_domain=audit.source_domain
            AND aggregate.source_type=audit.source_type
            AND aggregate.source_id=audit.source_id
            AND aggregate.is_deleted=false
          WHERE audit.tenant_id=$1 AND audit.park_id=$2
            AND audit.approval_execution_key=$3
            AND audit.approval_effect_line_key=$4`;
    const rows = await input.manager.query(
      proofQuery,
      [
        input.scope.tenantId,
        input.scope.parkId,
        input.executionIdempotencyKey,
        input.effectLineKey
      ]
    ) as Array<{ id: string }>;
    if (rows.length !== 1 || input.expectedCardinality !== 2) {
      throw new Error("property-foundation-effect-proof-mismatch");
    }
    return {
      domainTable: input.owningTable,
      domainRowId: rows[0]!.id,
      owningUniqueName: input.owningUniqueName,
      uniqueKeyHash: propertyApprovalCanonicalHash({
        tenantId: input.scope.tenantId,
        parkId: input.scope.parkId,
        executionIdempotencyKey: input.executionIdempotencyKey,
        effectLineKey: input.effectLineKey
      }),
      observedCardinality: 2,
      lineAmount: null,
      currency: null
    };
  }

  private async requestRow(
    manager: EntityManager,
    requestId: string,
    actionId: FoundationActionId
  ): Promise<ApprovalRequestRow> {
    const rows = await manager.query(
      `SELECT tenant_id AS "tenantId", park_id AS "parkId", action_id AS "actionId",
              source_type AS "sourceType", source_id::text AS "sourceId",
              source_expected_version AS "sourceExpectedVersion"
         FROM biz_property_approval_request
        WHERE id=$1 AND action_id=$2`,
      [requestId, actionId]
    ) as ApprovalRequestRow[];
    if (rows.length !== 1) throw new Error("property-foundation-request-mismatch");
    return rows[0]!;
  }

  private outboxEvent(
    request: ApprovalRequestRow,
    requestId: string,
    executionIdempotencyKey: string
  ): PropertyApprovalOutboxEvent {
    const payload = {
      approvalRequestId: requestId,
      executionIdempotencyKey,
      actionId: request.actionId,
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      sourceExpectedVersion: request.sourceExpectedVersion
    };
    return {
      eventId: randomUUID(),
      eventType: `${request.actionId}.executed`,
      eventVersion: 1,
      aggregateType: request.sourceType,
      aggregateId: request.sourceId,
      aggregateVersion: request.sourceExpectedVersion + 1,
      orderingKey: `${request.sourceType}:${request.sourceId}`,
      eventOrdinal: 0,
      payload,
      payloadHash: propertyApprovalCanonicalHash(payload)
    };
  }

  private async sourceCreator(
    manager: EntityManager,
    scope: TenantParkScope,
    actionId: FoundationActionId,
    sourceId: string
  ): Promise<string> {
    const table = actionId === "property.mode-transition.request"
      ? "biz_property_operation_config"
      : "biz_property_occupancy";
    const rows = await manager.query(
      `SELECT create_by::text AS "actorId" FROM ${table}
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, sourceId]
    ) as Array<{ actorId: string | null }>;
    const actorId = rows[0]?.actorId;
    if (!actorId) throw new Error("property-foundation-source-creator-missing");
    return actorId;
  }

  private async actorIdsWithPermission(
    manager: EntityManager,
    scope: TenantParkScope,
    permissionCode: string
  ): Promise<string[]> {
    const rows = await manager.query(
      `SELECT DISTINCT actor.id::text AS "actorId"
         FROM sys_user actor
         JOIN rel_user_role user_role ON user_role.user_id=actor.id
          AND user_role.tenant_id=actor.tenant_id AND user_role.park_id=actor.park_id
         JOIN sys_role role ON role.id=user_role.role_id
          AND role.tenant_id=user_role.tenant_id
          AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
         JOIN rel_role_perm role_permission ON role_permission.role_id=role.id
          AND role_permission.tenant_id=role.tenant_id AND role_permission.park_id=user_role.park_id
         JOIN sys_permission permission ON permission.id=role_permission.permission_id
          AND permission.tenant_id=role_permission.tenant_id
        WHERE actor.tenant_id::text=$1 AND actor.park_id::text=$2
          AND permission.code=$3 AND actor.is_enabled=true AND actor.status='enabled'
          AND actor.is_deleted=false AND user_role.is_deleted=false
          AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
          AND role_permission.is_deleted=false AND permission.is_enabled=true
          AND permission.status='enabled' AND permission.is_deleted=false
        ORDER BY actor.id::text`,
      [scope.tenantId, scope.parkId, permissionCode]
    ) as Array<{ actorId: string }>;
    return rows.map((row) => row.actorId);
  }
}
