import { Injectable, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TenantParkScope, TrackBApprovalActionId } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import {
  FrozenPropertyApprovalPolicyResolver,
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "../property-approvals/property-approval.registries";
import type { FrozenApprovalEffect, PropertyApprovalOutboxEvent,
  PropertyApprovalVerifiedEffectProof } from "../property-approvals/property-approval.ports";
import { canonicalEffectInvariantHash, canonicalEffectLines,
  propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import { HousingService } from "./housing.service";

type HousingActionId = "housing.handovers.complete-move-out-financial.request"
  | "housing.purchases.lifecycle.request"
  | "housing.purchases.transfer.request"
  | "housing.leases.approve.request" | "housing.leases.void.request"
  | "housing.leases.checkout.request"
  | "housing.finance.refund-waive-or-deposit-refund.request";
const ACTIONS: HousingActionId[] = [
  "housing.leases.approve.request", "housing.leases.void.request",
  "housing.leases.checkout.request", "housing.finance.refund-waive-or-deposit-refund.request",
  "housing.handovers.complete-move-out-financial.request",
  "housing.purchases.lifecycle.request",
  "housing.purchases.transfer.request"
];
const POLICY_IDS: Record<HousingActionId, string> = {
  "housing.leases.approve.request": "b2000000-0000-4000-8000-000000000204",
  "housing.leases.void.request": "b2000000-0000-4000-8000-000000000205",
  "housing.leases.checkout.request": "b2000000-0000-4000-8000-000000000206",
  "housing.finance.refund-waive-or-deposit-refund.request": "b2000000-0000-4000-8000-000000000207",
  "housing.handovers.complete-move-out-financial.request": "b2000000-0000-4000-8000-000000000201",
  "housing.purchases.lifecycle.request": "b2000000-0000-4000-8000-000000000203",
  "housing.purchases.transfer.request": "b2000000-0000-4000-8000-000000000202"
};
interface RequestRow { tenantId: string; parkId: string; sourceType: string; sourceId: string;
  sourceExpectedVersion: number; requesterId: string;
  canonicalPayload: Readonly<Record<string, unknown>> }

@Injectable()
export class HousingApprovalAdapter implements OnModuleInit {
  constructor(private readonly policies: FrozenPropertyApprovalPolicyResolver,
    private readonly effects: PropertyApprovalEffectRegistry,
    private readonly proofs: PropertyApprovalEffectProofVerifierRegistryService,
    private readonly housing: HousingService) {}

  onModuleInit(): void {
    for (const actionId of ACTIONS) {
      this.policies.register(actionId, (input) => this.resolvePolicy(actionId, input));
      this.effects.register({
        actionId,
        execute: async (input) => {
          const request = await this.requestRow(input.manager, input.requestId, actionId);
          if (actionId === "housing.purchases.transfer.request") {
            await this.housing.executeApprovedPurchaseTransfer({ ...input, request });
          } else if (actionId === "housing.purchases.lifecycle.request") {
            await this.housing.executeApprovedPurchaseLifecycle({ ...input, request });
          } else if (actionId === "housing.handovers.complete-move-out-financial.request") {
            await this.housing.executeApprovedMoveOutHandover({ ...input, request });
          } else if (actionId === "housing.finance.refund-waive-or-deposit-refund.request") {
            await this.housing.executeApprovedFinance({ ...input, request });
          } else await this.housing.executeApprovedLeaseAction({ ...input, request }, actionId);
          const financialMutationCount = canonicalEffectLines(actionId, input.canonicalPayload)
            .filter((line) => line.lineAmount !== null).length;
          return { receipts: [], outboxEvents: [this.outbox(actionId, request,
            input.requestId, input.executionIdempotencyKey)], financialMutationCount };
        },
        reconcile: async (input) => {
          const request = await this.requestRow(input.manager, input.requestId, actionId);
          if (actionId === "housing.leases.approve.request") {
            const rows = await input.manager.query(
              `SELECT count(*)::integer AS count FROM biz_housing_lease lease
                WHERE lease.tenant_id=$1 AND lease.park_id=$2 AND lease.id=$3
                  AND lease.version=$4 AND lease.status='pending_signature' AND lease.approved_at IS NOT NULL`,
              [request.tenantId, request.parkId, request.sourceId, request.sourceExpectedVersion + 1]
            ) as Array<{ count: number }>;
            return Number(rows[0]?.count ?? 0) === 1
              ? { state: "complete" as const, receipts: [], financialMutationCount: 0 }
              : { state: "absent" as const, financialMutationCount: 0 };
          }
          const table = actionId === "housing.purchases.transfer.request"
            ? "biz_housing_purchase_transfer_effect_audit"
            : actionId === "housing.purchases.lifecycle.request"
              ? "biz_housing_purchase_effect_audit"
              : actionId === "housing.finance.refund-waive-or-deposit-refund.request"
                ? "biz_housing_ledger_entry" : "biz_housing_lease_effect_audit";
          const rows = await input.manager.query(
            `SELECT count(*)::integer AS count FROM ${table}
              WHERE tenant_id=$1 AND park_id=$2 AND approval_execution_key=$3`,
            [request.tenantId, request.parkId, input.executionIdempotencyKey]
          ) as Array<{ count: number }>;
          const count = Number(rows[0]?.count ?? 0);
          if (count === 0) return { state: "absent" as const, financialMutationCount: 0 };
          const expected = actionId === "housing.purchases.transfer.request"
            ? canonicalEffectLines(actionId, request.canonicalPayload)
              .filter((line) => line.effectKind === "housing.purchase.transfer").length
            : 1;
          if (count !== expected) return { state: "partial" as const,
            reason: "housing-effect-cardinality", evidence: { count, expected } };
          const financialRows = await input.manager.query(
            `SELECT count(*)::integer AS count FROM biz_property_execution_effect_manifest
              WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 AND line_amount IS NOT NULL`,
            [request.tenantId, request.parkId, input.requestId]
          ) as Array<{ count: number }>;
          return { state: "complete" as const, receipts: [],
            financialMutationCount: Number(financialRows[0]?.count ?? 0) };
        }
      });
      for (const kind of this.kinds(actionId)) this.proofs.register({ actionId,
        effectKind: kind, verify: (input) => this.verify(kind, input) });
    }
  }

  private async resolvePolicy(actionId: HousingActionId, input: { manager: EntityManager;
    scope: TenantParkScope; sourceType: string; sourceId: string;
    canonicalPayload: Readonly<Record<string, unknown>> }) {
    const actors = await this.sourceActors(input.manager, input.scope, actionId, input.sourceId);
    if (actionId === "housing.finance.refund-waive-or-deposit-refund.request") {
      actors.paymentExecutor = await this.financePaymentRecorder(
        input.manager, input.scope, input.canonicalPayload
      );
    }
    const eligibleActorIds = await this.actorIds(input.manager, input.scope, "property_approval:decide");
    const auditorActorIds = await this.actorIds(input.manager, input.scope, "property_approval:read");
    const incidentActorIds = await this.actorIds(input.manager, input.scope, "property_approval:retry");
    const eligibilityPolicySnapshot = { requiredPermissions: ["property_approval:decide"],
      eligibleActorIds, auditorActorIds, incidentActorIds,
      sourceScopes: [{ sourceType: input.sourceType, sourceId: input.sourceId }] };
    const effects = canonicalEffectLines(actionId, input.canonicalPayload).map((line, effectOrdinal) => {
      const owner = this.owner(line.effectKind, input.canonicalPayload);
      const effect: Omit<FrozenApprovalEffect, "invariantHash"> = { ...line, effectOrdinal,
        owningTable: owner.table, owningUniqueName: owner.unique,
        expectedCardinality: owner.cardinality };
      return { ...effect, invariantHash: canonicalEffectInvariantHash(effect, input.canonicalPayload) };
    });
    const exclusions = [{ actorId: actors.sourceCreator, reasonCode: "source_creator",
      sourceType: input.sourceType, sourceId: input.sourceId }];
    if (actionId === "housing.purchases.transfer.request"
      || actionId === "housing.purchases.lifecycle.request") exclusions.push(
      { actorId: actors.sourceCreator, reasonCode: "purchase_creator",
        sourceType: input.sourceType, sourceId: input.sourceId });
    if (actionId === "housing.purchases.transfer.request") exclusions.push(
      { actorId: actors.paymentExecutor, reasonCode: "payment_executor",
        sourceType: input.sourceType, sourceId: input.sourceId }
    );
    if (actionId === "housing.finance.refund-waive-or-deposit-refund.request") exclusions.push(
      { actorId: actors.paymentExecutor, reasonCode: "payment_recorder",
        sourceType: input.sourceType, sourceId: input.sourceId }
    );
    return { policyId: POLICY_IDS[actionId], policyVersion: 1,
      policyHash: propertyApprovalCanonicalHash({ owner: "housing", actionId, version: 1 }),
      stages: [{ stageCode: "housing-domain-approval", stageOrdinal: 1,
        eligibilityPolicySnapshot, eligibilityPolicyVersion: 1,
        eligibilityPolicyHash: propertyApprovalCanonicalHash(eligibilityPolicySnapshot), requiredCount: 1 }],
      exclusions, effects };
  }

  private async verify(effectKind: string, input: { manager: EntityManager; scope: TenantParkScope;
    requestId: string; executionIdempotencyKey: string; effectLineKey: string; expectedCardinality: number;
    owningTable: string; owningUniqueName: string }): Promise<PropertyApprovalVerifiedEffectProof> {
    let rows: Array<{ id: string; amount?: string; currency?: string; observed?: number }>;
    if (effectKind === "housing.lease.approve") rows = await input.manager.query(
      `SELECT lease.id::text AS id,1 AS observed FROM biz_housing_lease lease
       JOIN biz_property_approval_request request ON request.tenant_id=lease.tenant_id
        AND request.park_id=lease.park_id AND request.id=$3 AND request.source_id=lease.id
       WHERE lease.tenant_id=$1 AND lease.park_id=$2 AND lease.version=request.source_expected_version+1
        AND lease.status='pending_signature' AND lease.approved_at IS NOT NULL`,
      [input.scope.tenantId, input.scope.parkId, input.requestId]);
    else if (effectKind === "housing.lease.void" || effectKind === "housing.lease.checkout") rows = await input.manager.query(
      `SELECT audit.id::text AS id,
              2 + CASE WHEN audit.occupancy_id IS NULL THEN 0 ELSE 1 END AS observed
         FROM biz_housing_lease_effect_audit audit
       JOIN biz_housing_lease lease ON lease.tenant_id=audit.tenant_id AND lease.park_id=audit.park_id
        AND lease.id=audit.lease_id AND lease.version=audit.resulting_version
       WHERE audit.tenant_id=$1 AND audit.park_id=$2 AND audit.approval_execution_key=$3
        AND audit.effect_line_key=$4`, [input.scope.tenantId, input.scope.parkId,
        input.executionIdempotencyKey, input.effectLineKey]);
    else if (effectKind === "housing.handover.complete.financial") rows = await input.manager.query(
      `SELECT audit.id::text AS id, 3 AS observed FROM biz_housing_lease_effect_audit audit
       JOIN biz_housing_handover handover ON handover.tenant_id=audit.tenant_id
        AND handover.park_id=audit.park_id AND handover.id=audit.handover_id AND handover.status='completed'
       JOIN biz_housing_lease lease ON lease.tenant_id=audit.tenant_id AND lease.park_id=audit.park_id
        AND lease.id=audit.lease_id AND lease.status='checkout_pending'
       WHERE audit.tenant_id=$1 AND audit.park_id=$2 AND audit.approval_execution_key=$3
        AND audit.effect_line_key=$4`, [input.scope.tenantId, input.scope.parkId,
        input.executionIdempotencyKey, input.effectLineKey]);
    else if (effectKind === "housing.purchase.transfer") rows = await input.manager.query(
      `SELECT audit.id::text AS id, 2 AS observed FROM biz_housing_purchase_transfer_effect_audit audit
       JOIN biz_housing_purchase_item item ON item.tenant_id=audit.tenant_id
        AND item.park_id=audit.park_id AND item.id=audit.purchase_item_id
        AND item.transferred_receivable_id=audit.to_receivable_id
       WHERE audit.tenant_id=$1 AND audit.park_id=$2 AND audit.approval_execution_key=$3
        AND audit.effect_line_key=$4`, [input.scope.tenantId, input.scope.parkId,
        input.executionIdempotencyKey, input.effectLineKey]);
    else if (effectKind === "housing.purchase.lifecycle") rows = await input.manager.query(
      `SELECT audit.id::text AS id,2 AS observed FROM biz_housing_purchase_effect_audit audit
       JOIN biz_housing_purchase purchase ON purchase.tenant_id=audit.tenant_id
        AND purchase.park_id=audit.park_id AND purchase.id=audit.purchase_id
        AND purchase.version=audit.resulting_version
       WHERE audit.tenant_id=$1 AND audit.park_id=$2 AND audit.approval_execution_key=$3
        AND audit.effect_line_key=$4`, [input.scope.tenantId, input.scope.parkId,
        input.executionIdempotencyKey, input.effectLineKey]);
    else if (effectKind.startsWith("housing.receivable.")) rows = await input.manager.query(
      `SELECT receivable.id::text AS id, manifest.line_amount::text AS amount, receivable.currency,1 AS observed
       FROM biz_property_execution_effect_manifest manifest JOIN biz_housing_receivable receivable
        ON receivable.id=(regexp_match(manifest.effect_line_key,'([0-9a-f-]{36})$'))[1]::uuid
       JOIN biz_property_approval_request request ON request.id=manifest.request_id
       WHERE manifest.tenant_id=$1 AND manifest.park_id=$2 AND manifest.effect_line_key=$4
        AND request.execution_idempotency_key=$3
        AND ((manifest.effect_kind='housing.receivable.checkout'
              AND receivable.amount=manifest.line_amount)
          OR (manifest.effect_kind='housing.receivable.purchase.transfer'
              AND receivable.amount=(request.canonical_payload->>'targetReceivableOriginalAmount')::numeric
                                  + manifest.line_amount))`,
      [input.scope.tenantId, input.scope.parkId, input.executionIdempotencyKey, input.effectLineKey]);
    else rows = await input.manager.query(
      `SELECT id::text AS id,amount::text AS amount,currency,1 AS observed
       FROM biz_housing_ledger_entry WHERE tenant_id=$1 AND park_id=$2
        AND approval_execution_key=$3 AND approval_effect_line_key=$4`,
      [input.scope.tenantId, input.scope.parkId, input.executionIdempotencyKey, input.effectLineKey]);
    const row = rows[0];
    if (rows.length !== 1 || Number(row!.observed) !== input.expectedCardinality) {
      throw new Error("housing-effect-proof-mismatch");
    }
    return { domainTable: input.owningTable, domainRowId: row!.id,
      owningUniqueName: input.owningUniqueName,
      uniqueKeyHash: propertyApprovalCanonicalHash({ ...input.scope,
        executionIdempotencyKey: input.executionIdempotencyKey, effectLineKey: input.effectLineKey }),
      observedCardinality: Number(row!.observed), lineAmount: row!.amount ?? null,
      currency: row!.currency ?? null };
  }

  private owner(kind: string, canonicalPayload: Readonly<Record<string, unknown>>) {
    if (kind === "housing.lease.approve") return { table: "biz_housing_lease",
      unique: "biz_housing_lease_pkey", cardinality: 1 };
    if (kind === "housing.lease.void") return {
      table: "biz_housing_lease_effect_audit",
      unique: "uq_housing_lease_effect_audit_approval_line", cardinality: 2 };
    if (kind === "housing.lease.checkout") return {
      table: "biz_housing_lease_effect_audit",
      unique: "uq_housing_lease_effect_audit_approval_line",
      cardinality: canonicalPayload.occupancyId == null ? 2 : 3 };
    if (kind === "housing.handover.complete.financial") return { table: "biz_housing_lease_effect_audit",
      unique: "uq_housing_lease_effect_audit_approval_line", cardinality: 3 };
    if (kind === "housing.purchase.transfer") return { table: "biz_housing_purchase_transfer_effect_audit",
      unique: "uq_housing_purchase_transfer_effect_audit_approval_line", cardinality: 2 };
    if (kind === "housing.purchase.lifecycle") return { table: "biz_housing_purchase_effect_audit",
      unique: "uq_housing_purchase_effect_audit_approval_line", cardinality: 2 };
    if (kind.startsWith("housing.receivable.")) return { table: "biz_housing_receivable",
      unique: "biz_housing_receivable_pkey", cardinality: 1 };
    return { table: "biz_housing_ledger_entry", unique: "uq_housing_ledger_approval_line", cardinality: 1 };
  }
  private kinds(actionId: HousingActionId) { return actionId === "housing.purchases.transfer.request"
    ? ["housing.purchase.transfer", "housing.receivable.purchase.transfer"]
    : actionId === "housing.purchases.lifecycle.request" ? ["housing.purchase.lifecycle"]
      : actionId === "housing.handovers.complete-move-out-financial.request"
        ? ["housing.handover.complete.financial", "housing.receivable.checkout", "housing.ledger.deduction"]
        : actionId === "housing.leases.approve.request" ? ["housing.lease.approve"]
          : actionId === "housing.leases.void.request" ? ["housing.lease.void"]
            : actionId === "housing.leases.checkout.request" ? ["housing.lease.checkout"]
              : ["housing.ledger.refund", "housing.ledger.waiver", "housing.ledger.deposit.refund"]; }

  private async requestRow(manager: EntityManager, requestId: string, actionId: HousingActionId) {
    const rows = await manager.query(`SELECT tenant_id AS "tenantId",park_id AS "parkId",
      source_type AS "sourceType",source_id::text AS "sourceId",source_expected_version AS "sourceExpectedVersion",
      requester_id::text AS "requesterId",canonical_payload AS "canonicalPayload"
      FROM biz_property_approval_request WHERE id=$1 AND action_id=$2`,
    [requestId, actionId]) as RequestRow[];
    if (rows.length !== 1) throw new Error("housing-approval-request-mismatch");
    return rows[0]!;
  }
  private outbox(actionId: TrackBApprovalActionId, request: RequestRow, requestId: string,
    executionIdempotencyKey: string): PropertyApprovalOutboxEvent {
    const payload = { approvalRequestId: requestId, executionIdempotencyKey, actionId,
      sourceType: request.sourceType, sourceId: request.sourceId,
      sourceExpectedVersion: request.sourceExpectedVersion };
    return { eventId: randomUUID(), eventType: `${actionId}.executed`, eventVersion: 1,
      aggregateType: request.sourceType, aggregateId: request.sourceId,
      aggregateVersion: request.sourceExpectedVersion + 1,
      orderingKey: `${request.sourceType}:${request.sourceId}`, eventOrdinal: 0,
      payload, payloadHash: propertyApprovalCanonicalHash(payload) };
  }
  private async sourceActors(manager: EntityManager, scope: TenantParkScope,
    actionId: HousingActionId, sourceId: string) {
    const table = actionId === "housing.purchases.transfer.request"
      || actionId === "housing.purchases.lifecycle.request"
      ? "biz_housing_purchase"
      : actionId === "housing.handovers.complete-move-out-financial.request"
        ? "biz_housing_handover" : "biz_housing_lease";
    const rows = await manager.query(`SELECT create_by::text AS creator,update_by::text AS executor
      FROM ${table} WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
    [scope.tenantId, scope.parkId, sourceId]) as Array<{ creator: string | null; executor: string | null }>;
    if (!rows[0]?.creator) throw new Error("housing-source-creator-missing");
    return { sourceCreator: rows[0].creator, paymentExecutor: rows[0].executor ?? rows[0].creator };
  }
  private async actorIds(manager: EntityManager, scope: TenantParkScope, permissionCode: string) {
    const rows = await manager.query(`SELECT DISTINCT actor.id::text AS "actorId" FROM sys_user actor
      JOIN rel_user_role ur ON ur.user_id=actor.id AND ur.tenant_id=actor.tenant_id AND ur.park_id=actor.park_id
      JOIN sys_role role ON role.id=ur.role_id AND role.tenant_id=ur.tenant_id
       AND (role.role_scope='tenant' OR role.park_id=ur.park_id)
      JOIN rel_role_perm rp ON rp.role_id=role.id AND rp.tenant_id=role.tenant_id AND rp.park_id=ur.park_id
      JOIN sys_permission p ON p.id=rp.permission_id AND p.tenant_id=rp.tenant_id
      WHERE actor.tenant_id::text=$1 AND actor.park_id::text=$2 AND p.code=$3
       AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
       AND ur.is_deleted=false AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
       AND rp.is_deleted=false AND p.is_enabled=true AND p.status='enabled' AND p.is_deleted=false
      ORDER BY actor.id::text`, [scope.tenantId, scope.parkId, permissionCode]) as Array<{ actorId: string }>;
    return rows.map((row) => row.actorId);
  }

  private async financePaymentRecorder(manager: EntityManager, scope: TenantParkScope,
    payload: Readonly<Record<string, unknown>>) {
    const lines = Array.isArray(payload.lines) ? payload.lines as Array<Record<string, unknown>> : [];
    const receivableId = lines[0]?.receivableId;
    const rows = typeof receivableId === "string" ? await manager.query(
      `SELECT create_by::text AS "actorId" FROM biz_housing_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND receivable_id=$3
          AND entry_type IN ('payment','deposit_receipt') AND status='confirmed'
          AND is_deleted=false ORDER BY occurred_at DESC,id DESC LIMIT 1`,
      [scope.tenantId, scope.parkId, receivableId]
    ) as Array<{ actorId: string | null }> : [];
    if (!rows[0]?.actorId) throw new Error("housing-payment-recorder-missing");
    return rows[0].actorId;
  }
}
