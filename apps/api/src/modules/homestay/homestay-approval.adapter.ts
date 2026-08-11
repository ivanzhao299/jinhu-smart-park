import { Injectable, Optional, type OnModuleInit } from "@nestjs/common";
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
  PropertyApprovalOutboxEvent,
  PropertyApprovalVerifiedEffectProof
} from "../property-approvals/property-approval.ports";
import {
  canonicalEffectInvariantHash,
  canonicalEffectLines,
  propertyApprovalCanonicalHash
} from "../property-approvals/property-approval.service";
import { HomestayService } from "./homestay.service";
import { HomestayCancellationExecutorService } from "./homestay-cancellation-executor.service";

type HomestayActionId = "homestay.bookings.cancel.request" | "homestay.finance.refund-or-waive.request";
const ACTIONS: HomestayActionId[] = [
  "homestay.bookings.cancel.request", "homestay.finance.refund-or-waive.request"
];
const POLICY_IDS: Record<HomestayActionId, string> = {
  "homestay.bookings.cancel.request": "b2000000-0000-4000-8000-000000000101",
  "homestay.finance.refund-or-waive.request": "b2000000-0000-4000-8000-000000000102"
};

interface RequestRow {
  tenantId: string;
  parkId: string;
  sourceType: string;
  sourceId: string;
  sourceExpectedVersion: number;
  requesterId: string;
  canonicalPayload: Readonly<Record<string, unknown>>;
}

@Injectable()
export class HomestayApprovalAdapter implements OnModuleInit {
  constructor(
    private readonly policies: FrozenPropertyApprovalPolicyResolver,
    private readonly effects: PropertyApprovalEffectRegistry,
    private readonly proofs: PropertyApprovalEffectProofVerifierRegistryService,
    private readonly homestay: HomestayService,
    @Optional()
    private readonly cancellationExecutor?: HomestayCancellationExecutorService
  ) {}

  onModuleInit(): void {
    for (const actionId of ACTIONS) {
      this.policies.register(actionId, (input) => this.resolvePolicy(actionId, input));
      this.effects.register({
      actionId,
      execute: async (input) => {
        const request = await this.requestRow(input.manager, input.requestId, actionId);
        if (actionId === "homestay.finance.refund-or-waive.request") {
          await this.homestay.executeApprovedFinance({ ...input, request });
        } else await this.mustCancellationExecutor().execute({ ...input, request });
        return {
          receipts: [],
          outboxEvents: [this.outbox(actionId, request, input.requestId, input.executionIdempotencyKey)],
          financialMutationCount: canonicalEffectLines(actionId, input.canonicalPayload)
            .filter((line) => line.lineAmount !== null).length
        };
      },
      reconcile: async (input) => {
        const request = await this.requestRow(input.manager, input.requestId, actionId);
        if (actionId === "homestay.finance.refund-or-waive.request") {
          const rows = await input.manager.query(
            `SELECT count(*)::integer AS count FROM biz_homestay_ledger_entry
              WHERE tenant_id=$1 AND park_id=$2 AND approval_execution_key=$3`,
            [request.tenantId, request.parkId, input.executionIdempotencyKey]
          ) as Array<{ count: number }>;
          const expected = canonicalEffectLines(actionId, request.canonicalPayload).length;
          const count = Number(rows[0]?.count ?? 0);
          if (count === 0) return { state: "absent" as const, financialMutationCount: 0 };
          if (count === expected) return { state: "complete" as const, receipts: [],
            financialMutationCount: count };
          return { state: "partial" as const, reason: "homestay-finance-effect-cardinality",
            evidence: { expected, count } };
        }
        const rows = await input.manager.query(
          `SELECT
             (SELECT count(*)::integer FROM biz_homestay_booking_action_log
               WHERE tenant_id=$1 AND park_id=$2 AND approval_execution_key=$3) AS actions,
             (SELECT count(*)::integer FROM biz_homestay_ledger_entry
               WHERE tenant_id=$1 AND park_id=$2 AND approval_execution_key=$3) AS ledger`,
          [request.tenantId, request.parkId, input.executionIdempotencyKey]
        ) as Array<{ actions: number; ledger: number }>;
        const actions = Number(rows[0]?.actions ?? 0);
        const ledger = Number(rows[0]?.ledger ?? 0);
        if (actions === 0 && ledger === 0) return { state: "absent" as const, financialMutationCount: 0 };
        const expectedLedger = canonicalEffectLines(actionId, request.canonicalPayload)
          .filter((line) => line.lineAmount !== null).length;
        if (actions === 1 && ledger === expectedLedger) return {
          state: "complete" as const,
          receipts: [],
          financialMutationCount: ledger
        };
        return { state: "partial" as const, reason: "homestay-cancel-effect-cardinality",
          evidence: { actions, ledger } };
      }
      });
      const kinds = actionId === "homestay.finance.refund-or-waive.request"
        ? ["homestay.ledger.refund", "homestay.ledger.waiver"]
        : ["homestay.booking.cancel", "homestay.ledger.waiver", "homestay.ledger.charge"];
      for (const effectKind of kinds) {
      this.proofs.register({
        actionId,
        effectKind,
        verify: (input) => this.verify(effectKind, input)
      });
      }
    }
  }

  private mustCancellationExecutor(): HomestayCancellationExecutorService {
    if (!this.cancellationExecutor) {
      throw new Error("Homestay cancellation executor service is unavailable");
    }
    return this.cancellationExecutor;
  }

  private async resolvePolicy(actionId: HomestayActionId, input: {
    manager: EntityManager;
    scope: TenantParkScope;
    sourceType: string;
    sourceId: string;
    canonicalPayload: Readonly<Record<string, unknown>>;
  }) {
    const sourceCreatorId = await this.sourceCreator(input.manager, input.scope, input.sourceId);
    const eligibleActorIds = await this.actors(input.manager, input.scope, "property_approval:decide");
    const auditorActorIds = await this.actors(input.manager, input.scope, "property_approval:read");
    const incidentActorIds = await this.actors(input.manager, input.scope, "property_approval:retry");
    const eligibilityPolicySnapshot = {
      requiredPermissions: ["property_approval:decide"], eligibleActorIds,
      auditorActorIds, incidentActorIds,
      sourceScopes: [{ sourceType: input.sourceType, sourceId: input.sourceId }]
    };
    const effects = canonicalEffectLines(actionId, input.canonicalPayload).map((line, effectOrdinal) => {
      const isBooking = line.effectKind === "homestay.booking.cancel";
      const occupancy = input.canonicalPayload.occupancy;
      const credentials = input.canonicalPayload.credentials;
      const occupancyId = occupancy && typeof occupancy === "object" && !Array.isArray(occupancy)
        ? (occupancy as Record<string, unknown>).id
        : occupancy === null ? null : undefined;
      const credentialIds = Array.isArray(credentials)
        ? credentials.map((credential) => credential && typeof credential === "object"
          && !Array.isArray(credential) ? (credential as Record<string, unknown>).id : undefined)
        : undefined;
      const compoundCardinality = (occupancyId === null || typeof occupancyId === "string")
        && Array.isArray(credentialIds)
        && credentialIds.every((id) => typeof id === "string")
        ? 2 + (occupancyId === null ? 0 : 1) + credentialIds.length
        : 0;
      const effect: Omit<FrozenApprovalEffect, "invariantHash"> = {
        ...line,
        effectOrdinal,
        owningTable: isBooking ? "biz_homestay_booking_action_log" : "biz_homestay_ledger_entry",
        owningUniqueName: isBooking ? "uq_homestay_action_approval_line" : "uq_homestay_ledger_approval_line",
        expectedCardinality: isBooking ? compoundCardinality : 1
      };
      return { ...effect, invariantHash: canonicalEffectInvariantHash(effect, input.canonicalPayload) };
    });
    return {
      policyId: POLICY_IDS[actionId],
      policyVersion: 1,
      policyHash: propertyApprovalCanonicalHash({ owner: "homestay", actionId, version: 1 }),
      stages: [{
        stageCode: "homestay-cancellation-approval", stageOrdinal: 1,
        eligibilityPolicySnapshot, eligibilityPolicyVersion: 1,
        eligibilityPolicyHash: propertyApprovalCanonicalHash(eligibilityPolicySnapshot), requiredCount: 1
      }],
      exclusions: [{ actorId: sourceCreatorId, reasonCode: "source_creator",
        sourceType: input.sourceType, sourceId: input.sourceId },
        ...(actionId === "homestay.finance.refund-or-waive.request"
          ? [{ actorId: await this.paymentRecorder(input.manager, input.scope, input.canonicalPayload),
            reasonCode: "payment_recorder", sourceType: input.sourceType, sourceId: input.sourceId }]
          : [])],
      effects
    };
  }

  private async verify(effectKind: string, input: {
    manager: EntityManager; scope: TenantParkScope; executionIdempotencyKey: string;
    requestId: string; effectLineKey: string; expectedCardinality: number;
    owningTable: string; owningUniqueName: string;
  }): Promise<PropertyApprovalVerifiedEffectProof> {
    if (effectKind !== "homestay.booking.cancel") {
      const rows = await input.manager.query(
        `SELECT id::text AS id, amount::text AS amount, currency
           FROM biz_homestay_ledger_entry
          WHERE tenant_id=$1 AND park_id=$2 AND approval_execution_key=$3
            AND approval_effect_kind=$4 AND approval_effect_line_key=$5`,
        [input.scope.tenantId, input.scope.parkId, input.executionIdempotencyKey,
          effectKind, input.effectLineKey]
      ) as Array<{ id: string; amount: string; currency: string }>;
      if (rows.length !== 1) {
        throw new Error("homestay-financial-effect-proof-mismatch");
      }
      return this.proof(input, rows[0]!.id, 1, rows[0]!.amount, rows[0]!.currency);
    }
    const rows = await input.manager.query(
      `SELECT action.id::text AS id, action.booking_id::text AS "bookingId",
              booking.status, booking.version,
              (SELECT count(*)::integer FROM biz_homestay_stay_credential credential
                WHERE credential.tenant_id=action.tenant_id AND credential.park_id=action.park_id
                  AND credential.booking_id=action.booking_id AND credential.status='void'
                  AND credential.is_deleted=false AND credential.id IN (
                    SELECT (value->>'id')::uuid
                    FROM jsonb_array_elements(request.canonical_payload->'credentials') frozen(value)
                  )) AS credentials,
              CASE WHEN request.canonical_payload->'occupancy' = 'null'::jsonb THEN 0 ELSE
                (SELECT count(*)::integer FROM biz_property_occupancy occupancy
                  WHERE occupancy.tenant_id=action.tenant_id AND occupancy.park_id=action.park_id
                    AND occupancy.id=(request.canonical_payload#>>'{occupancy,id}')::uuid
                    AND occupancy.status='cancelled'
                    AND occupancy.is_deleted=false) END AS occupancy
         FROM biz_homestay_booking_action_log action
         JOIN biz_property_approval_request request ON request.tenant_id=action.tenant_id
          AND request.park_id=action.park_id AND request.id=$6
         JOIN biz_homestay_booking booking ON booking.tenant_id=action.tenant_id
          AND booking.park_id=action.park_id AND booking.id=action.booking_id
        WHERE action.tenant_id=$1 AND action.park_id=$2 AND action.approval_execution_key=$3
          AND action.approval_effect_kind=$4 AND action.approval_effect_line_key=$5`,
      [input.scope.tenantId, input.scope.parkId, input.executionIdempotencyKey,
        effectKind, input.effectLineKey, input.requestId]
    ) as Array<{ id: string; bookingId: string; status: string; version: number; credentials: number; occupancy: number }>;
    const row = rows[0];
    const observed = row ? 2 + Number(row.credentials) + Number(row.occupancy) : 0;
    if (rows.length !== 1 || row!.status !== "cancelled" || observed !== input.expectedCardinality) {
      throw new Error("homestay-cancel-effect-proof-mismatch");
    }
    return this.proof(input, row!.id, observed, null, null);
  }

  private proof(input: { scope: TenantParkScope; executionIdempotencyKey: string;
    effectLineKey: string; owningTable: string; owningUniqueName: string }, domainRowId: string,
  observedCardinality: number, lineAmount: string | null,
  currency: string | null): PropertyApprovalVerifiedEffectProof {
    return { domainTable: input.owningTable, domainRowId,
      owningUniqueName: input.owningUniqueName,
      uniqueKeyHash: propertyApprovalCanonicalHash({ ...input.scope,
        executionIdempotencyKey: input.executionIdempotencyKey, effectLineKey: input.effectLineKey }),
      observedCardinality, lineAmount, currency };
  }

  private async requestRow(manager: EntityManager, requestId: string,
    actionId: HomestayActionId): Promise<RequestRow> {
    const rows = await manager.query(
      `SELECT tenant_id AS "tenantId", park_id AS "parkId", source_type AS "sourceType",
              source_id::text AS "sourceId", source_expected_version AS "sourceExpectedVersion",
              requester_id::text AS "requesterId",canonical_payload AS "canonicalPayload"
         FROM biz_property_approval_request WHERE id=$1 AND action_id=$2`,
      [requestId, actionId]
    ) as RequestRow[];
    if (rows.length !== 1) throw new Error("homestay-approval-request-mismatch");
    return rows[0]!;
  }

  private outbox(actionId: HomestayActionId, request: RequestRow, requestId: string,
    executionIdempotencyKey: string): PropertyApprovalOutboxEvent {
    const payload = { approvalRequestId: requestId, executionIdempotencyKey,
      actionId, sourceType: request.sourceType, sourceId: request.sourceId,
      sourceExpectedVersion: request.sourceExpectedVersion };
    return { eventId: randomUUID(), eventType: `${actionId}.executed`, eventVersion: 1,
      aggregateType: request.sourceType, aggregateId: request.sourceId,
      aggregateVersion: request.sourceExpectedVersion + 1,
      orderingKey: `${request.sourceType}:${request.sourceId}`, eventOrdinal: 0,
      payload, payloadHash: propertyApprovalCanonicalHash(payload) };
  }

  private async paymentRecorder(manager: EntityManager, scope: TenantParkScope,
    payload: Readonly<Record<string, unknown>>) {
    const lines = Array.isArray(payload.lines) ? payload.lines as Array<Record<string, unknown>> : [];
    const sourceId = lines[0]?.sourceLedgerEntryId;
    const rows = typeof sourceId === "string" ? await manager.query(
      `SELECT create_by::text AS "actorId" FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, sourceId]
    ) as Array<{ actorId: string | null }> : [];
    if (!rows[0]?.actorId) throw new Error("homestay-payment-recorder-missing");
    return rows[0].actorId;
  }

  private async sourceCreator(manager: EntityManager, scope: TenantParkScope, sourceId: string) {
    const rows = await manager.query(
      `SELECT create_by::text AS "actorId" FROM biz_homestay_booking
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, sourceId]
    ) as Array<{ actorId: string | null }>;
    if (!rows[0]?.actorId) throw new Error("homestay-source-creator-missing");
    return rows[0].actorId;
  }

  private async actors(manager: EntityManager, scope: TenantParkScope, permissionCode: string) {
    const rows = await manager.query(
      `SELECT DISTINCT actor.id::text AS "actorId" FROM sys_user actor
       JOIN rel_user_role ur ON ur.user_id=actor.id AND ur.tenant_id=actor.tenant_id AND ur.park_id=actor.park_id
       JOIN sys_role role ON role.id=ur.role_id AND role.tenant_id=ur.tenant_id
       JOIN rel_role_perm rp ON rp.role_id=role.id AND rp.tenant_id=role.tenant_id AND rp.park_id=ur.park_id
       JOIN sys_permission permission ON permission.id=rp.permission_id AND permission.tenant_id=rp.tenant_id
       WHERE actor.tenant_id::text=$1 AND actor.park_id::text=$2 AND permission.code=$3
         AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
         AND ur.is_deleted=false AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
         AND rp.is_deleted=false AND permission.is_enabled=true AND permission.status='enabled'
         AND permission.is_deleted=false ORDER BY actor.id::text`,
      [scope.tenantId, scope.parkId, permissionCode]
    ) as Array<{ actorId: string }>;
    return rows.map((row) => row.actorId);
  }
}
