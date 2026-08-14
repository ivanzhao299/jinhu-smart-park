import { ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { assertPropertyHighRiskActionApprovalRequired } from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import { HousingLeaseEntity, HousingLedgerEntryEntity } from "./entities/housing.entities";
import {
  calculateHousingDepositBalance,
  calculateHousingMoneyBalance,
  compareHousingMoney
} from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { assertHousingLeaseUnitEligible } from "./housing-lease-unit-eligibility";

type LeaseApprovalAction = "housing.leases.approve.request" | "housing.leases.void.request"
  | "housing.leases.checkout.request";

type LeaseApprovalInput = {
  manager: EntityManager; requestId: string; executionIdempotencyKey: string;
  canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
  request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
};

type CheckoutSnapshot = {
  lease: { id: string; unitId: string; status: HousingLeaseEntity["status"];
    version: number; occupancyId: string | null; startDate?: string; endDate?: string };
  occupancy: { id: string; version: number; status: string } | null;
  handover: { id: string; version: number };
  receivables: Array<{
    id: string; version: number; amount: string; paidAmount: string; waivedAmount: string;
    status: string; currency: string; sourceType: string; sourceId: string | null; chargeType: string;
  }>;
  ledgerContributors: Array<{
    id: string; version: number; entryType: string; amount: string; currency: string;
    receivableId: string | null; sourceType: string; sourceId: string | null;
  }>;
};

type LeaseApprovalSource = {
  leaseId: string;
  scope: TenantParkScope;
  lease: CheckoutSnapshot["lease"];
  snapshot: CheckoutSnapshot | null;
};

type ApprovalEvidence = {
  effect: { effectKind: string; effectLineKey: string; effectHash: string };
  decisionActor: string;
};

@Injectable()
export class HousingLeaseApprovalExecutorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccess: PropertyUnitAccessService,
    private readonly support: HousingTransactionSupportService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  async checkout(scope: TenantParkScope, actor: JwtPrincipal, leaseId: string,
    reason: string, clientKey = "") {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.leases.checkout");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.dataSource.transaction((manager) =>
      this.submitCheckout(manager, scope, actor, leaseId, reason, clientKey));
  }

  private async submitCheckout(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    leaseId: string, reason: string, clientKey: string) {
    const snapshot = await this.lockCheckoutSnapshot(manager, scope, leaseId);
    const { lease, occupancy, handover, receivables, ledgerContributors } = snapshot;
    await this.unitAccess.assertAccess(scope, actor, lease.unitId);
    this.support.assertStatus(lease, ["checkout_pending"]);
    const balances = this.checkoutBalances(receivables, ledgerContributors);
    if (compareHousingMoney(balances.outstanding, "0.00") > 0) {
      throw new ConflictException(`Outstanding tenant charges remain: ${balances.outstanding}`);
    }
    if (compareHousingMoney(balances.depositBalance, "0.00") > 0) {
      throw new ConflictException(`Deposit balance must be settled before checkout: ${balances.depositBalance}`);
    }
    return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
      contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
      actionId: "housing.leases.checkout.request", sourceType: "housing-lease",
      sourceId: lease.id, sourceExpectedVersion: lease.version, requesterId: actor.sub,
      submitterId: actor.sub, actorId: actor.sub, clientKey,
      businessIntentKey: `housing-lease-checkout:${lease.id}:${lease.version}`,
      canonicalPayload: { leaseId: lease.id, fromStatus: lease.status, handoverId: handover.id,
        occupancyId: occupancy?.id ?? null, occupancyExpectedVersion: occupancy?.version ?? null,
        occupancyStatus: occupancy?.status ?? null, reason: reason.trim(),
        actorName: actor.realName?.trim() || actor.username,
        receivableContributors: receivables,
        receivableContributorsHash: this.snapshotHash(receivables),
        ledgerContributors, ledgerContributorsHash: this.snapshotHash(ledgerContributors),
        outstandingAmount: balances.outstanding, depositBalance: balances.depositBalance },
      payloadSchemaVersion: 1, amount: null, currency: null
    });
  }

  async execute(input: LeaseApprovalInput, actionId: LeaseApprovalAction): Promise<void> {
    const source = await this.lockApprovalSource(input, actionId);
    const evidence = await this.loadApprovalEvidence(input, source.scope);
    if (actionId === "housing.leases.approve.request") {
      await this.approveLease(input, source, evidence.decisionActor);
      return;
    }
    const occupancy = actionId === "housing.leases.checkout.request"
      ? await this.validateCheckoutAndReleaseOccupancy(input, source, evidence.decisionActor)
      : { sourceVersion: null, resultingVersion: null };
    await this.finishLease(input, actionId, source, evidence, occupancy);
  }

  private async lockApprovalSource(input: LeaseApprovalInput,
    actionId: LeaseApprovalAction): Promise<LeaseApprovalSource> {
    const payload = input.canonicalPayload;
    const leaseId = this.approvalUuid(payload.leaseId);
    if (leaseId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const snapshot = actionId === "housing.leases.checkout.request"
      ? await this.lockCheckoutSnapshot(input.manager, scope, leaseId)
      : null;
    const leases = snapshot ? [snapshot.lease] : typeormQueryRows<CheckoutSnapshot["lease"]>(
      await input.manager.query(
        `SELECT id::text AS id,unit_id::text AS "unitId",status,version,
                occupancy_id::text AS "occupancyId",start_date::text AS "startDate",
                end_date::text AS "endDate"
           FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2 AND id=$3
            AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
      ));
    const lease = leases[0];
    if (!lease || lease.version !== input.sourceExpectedVersion || lease.status !== payload.fromStatus) {
      throw new ConflictException("Approval source changed");
    }
    return { leaseId, scope, lease, snapshot };
  }

  private async loadApprovalEvidence(input: LeaseApprovalInput,
    scope: TenantParkScope): Promise<ApprovalEvidence> {
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash" FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as ApprovalEvidence["effect"][];
    const effect = manifests[0];
    if (!effect) throw new ConflictException("Approval effect manifest missing");
    const decisions = await input.manager.query(
      `SELECT actor_id::text AS "actorId" FROM biz_property_approval_decision
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 AND decision='approve'
        ORDER BY decided_at DESC,id DESC LIMIT 1`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ actorId: string }>;
    const decisionActor = decisions[0]?.actorId;
    if (!decisionActor) throw new ConflictException("Approval decision evidence missing");
    return { effect, decisionActor };
  }

  private async approveLease(input: LeaseApprovalInput, source: LeaseApprovalSource,
    decisionActor: string) {
    if (!source.lease.startDate || !source.lease.endDate) {
      throw new ConflictException("Housing lease period is missing");
    }
    await assertHousingLeaseUnitEligible(input.manager, source.scope, source.lease.unitId, {
      startAt: this.support.businessDateStart(source.lease.startDate).toISOString(),
      endAt: this.support.businessDateStart(this.support.addDays(source.lease.endDate, 1)).toISOString()
    });
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_lease SET status='pending_signature',approval_note=$5,
              approved_by=$6,approved_at=clock_timestamp(),update_by=$6,
              update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status='pending_approval'
        RETURNING version`, [source.scope.tenantId, source.scope.parkId, source.leaseId,
        input.sourceExpectedVersion, input.canonicalPayload.approvalNote, decisionActor]
    ));
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async validateCheckoutAndReleaseOccupancy(input: LeaseApprovalInput,
    source: LeaseApprovalSource, decisionActor: string) {
    const payload = input.canonicalPayload;
    const snapshot = source.snapshot;
    const handoverId = this.approvalUuid(payload.handoverId);
    if (!snapshot || snapshot.handover.id !== handoverId || source.lease.occupancyId !== payload.occupancyId
      || this.snapshotHash(snapshot.receivables) !== payload.receivableContributorsHash
      || this.snapshotHash(snapshot.ledgerContributors) !== payload.ledgerContributorsHash) {
      throw new ConflictException("Approval source changed");
    }
    const balances = this.checkoutBalances(snapshot.receivables, snapshot.ledgerContributors);
    if (compareHousingMoney(balances.outstanding, "0.00") > 0
      || balances.outstanding !== payload.outstandingAmount
      || compareHousingMoney(balances.depositBalance, "0.00") > 0
      || balances.depositBalance !== payload.depositBalance) {
      throw new ConflictException("Housing balances changed after approval submission");
    }
    return this.releaseCheckoutOccupancy(input, source, snapshot, decisionActor);
  }

  private async releaseCheckoutOccupancy(input: LeaseApprovalInput, source: LeaseApprovalSource,
    snapshot: CheckoutSnapshot, decisionActor: string) {
    const payload = input.canonicalPayload;
    if (!source.lease.occupancyId) return { sourceVersion: null, resultingVersion: null };
    const locked = snapshot.occupancy;
    if (!locked || locked.version !== Number(payload.occupancyExpectedVersion)
      || locked.status !== payload.occupancyStatus) throw new ConflictException("Approval source changed");
    const occupancy = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_property_occupancy SET status='completed',release_reason=$6,
              released_at=clock_timestamp(),update_by=$7,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status=$5
          AND is_deleted=false RETURNING version`, [source.scope.tenantId, source.scope.parkId,
        source.lease.occupancyId, Number(payload.occupancyExpectedVersion), payload.occupancyStatus,
        String(payload.reason ?? ""), decisionActor]
    ));
    if (occupancy.length !== 1) throw new ConflictException("Approval source changed");
    return { sourceVersion: Number(payload.occupancyExpectedVersion),
      resultingVersion: occupancy[0]!.version };
  }

  private async finishLease(input: LeaseApprovalInput, actionId: LeaseApprovalAction,
    source: LeaseApprovalSource, evidence: ApprovalEvidence,
    occupancy: { sourceVersion: number | null; resultingVersion: number | null }) {
    const toStatus = actionId === "housing.leases.void.request" ? "void" : "terminated";
    const payload = input.canonicalPayload;
    const updated = typeormQueryRows<{ version: number; checkoutAt: Date | null }>(await input.manager.query(
      `UPDATE biz_housing_lease SET status=$5::varchar,termination_reason=$6,
              checkout_at=CASE WHEN $5::varchar='terminated' THEN clock_timestamp() ELSE checkout_at END,
              update_by=$7,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version,checkout_at AS "checkoutAt"`,
      [source.scope.tenantId, source.scope.parkId, source.leaseId, input.sourceExpectedVersion,
        toStatus, String(payload.reason ?? ""), evidence.decisionActor]
    ));
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_lease_effect_audit(
         tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
         effect_line_key,actor_id,occurred_at,effect_hash,lease_id,occupancy_id,from_status,to_status,
         reason,source_expected_version,resulting_version,checkout_at,
         occupancy_source_expected_version,occupancy_resulting_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id::text AS id`, [source.scope.tenantId, source.scope.parkId, input.requestId,
        actionId, evidence.effect.effectKind, input.executionIdempotencyKey,
        evidence.effect.effectLineKey, evidence.decisionActor, evidence.effect.effectHash,
        source.leaseId, source.lease.occupancyId, source.lease.status, toStatus,
        String(payload.reason ?? ""), input.sourceExpectedVersion, updated[0]!.version,
        updated[0]!.checkoutAt, occupancy.sourceVersion, occupancy.resultingVersion]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private checkoutBalances(receivables: CheckoutSnapshot["receivables"],
    ledger: CheckoutSnapshot["ledgerContributors"]) {
    const active = receivables.filter((item) => item.status !== "void");
    return {
      outstanding: calculateHousingMoneyBalance(active.map((item) => item.amount),
        active.flatMap((item) => [item.paidAmount, item.waivedAmount])),
      depositBalance: calculateHousingDepositBalance(
        ledger as Array<{ entryType: HousingLedgerEntryEntity["entryType"]; amount: string }>)
    };
  }

  private async lockCheckoutSnapshot(manager: EntityManager, scope: TenantParkScope,
    leaseId: string): Promise<CheckoutSnapshot> {
    const pointerRows = typeormQueryRows<{ occupancyId: string | null }>(await manager.query(
      `SELECT occupancy_id::text AS "occupancyId" FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    const pointer = pointerRows[0];
    if (!pointer) throw new NotFoundException("Housing lease not found");
    const occupancyRows = pointer.occupancyId ? typeormQueryRows<{
      id: string; version: number; status: string;
    }>(await manager.query(
      `SELECT id::text AS id,version,status FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, pointer.occupancyId]
    )) : [];
    const occupancy = occupancyRows[0] ?? null;
    if (pointer.occupancyId && !occupancy) throw new ConflictException("Housing occupancy is missing");
    const leaseRows = typeormQueryRows<CheckoutSnapshot["lease"]>(await manager.query(
      `SELECT id::text AS id,unit_id::text AS "unitId",status,version,
              occupancy_id::text AS "occupancyId"
         FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
    ));
    const lease = leaseRows[0];
    if (!lease) throw new NotFoundException("Housing lease not found");
    if (lease.occupancyId !== pointer.occupancyId) {
      throw new ConflictException("Housing occupancy pointer changed while locking checkout");
    }
    const handovers = typeormQueryRows<CheckoutSnapshot["handover"]>(await manager.query(
      `SELECT id::text AS id,version FROM biz_housing_handover
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND handover_type='move_out'
          AND status='completed' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    if (handovers.length !== 1 || !handovers[0]) {
      throw new ConflictException("Completed move-out handover is required");
    }
    const receivables = await this.lockReceivables(manager, scope, leaseId);
    const ledgerContributors = await this.lockLedger(manager, scope, leaseId);
    return { lease, occupancy, handover: handovers[0], receivables, ledgerContributors };
  }

  private lockReceivables(manager: EntityManager, scope: TenantParkScope, leaseId: string) {
    return manager.query(
      `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
              waived_amount::text AS "waivedAmount",status,currency,source_type AS "sourceType",
              source_id::text AS "sourceId",charge_type AS "chargeType"
         FROM biz_housing_receivable WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
          AND is_deleted=false ORDER BY id FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
    ) as Promise<CheckoutSnapshot["receivables"]>;
  }

  private lockLedger(manager: EntityManager, scope: TenantParkScope, leaseId: string) {
    return manager.query(
      `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
              receivable_id::text AS "receivableId",source_type AS "sourceType",
              source_id::text AS "sourceId" FROM biz_housing_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND status='confirmed'
          AND is_deleted=false ORDER BY id FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
    ) as Promise<CheckoutSnapshot["ledgerContributors"]>;
  }

  private approvalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }

  private snapshotHash(value: unknown): string {
    return propertyApprovalCanonicalHash(value as PropertyApprovalJsonValue);
  }
}
