import { ConflictException, Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import {
  addHousingMoneyAmounts,
  calculateHousingDepositBalance
} from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

export type ExecuteApprovedHousingHandoverInput = {
  manager: EntityManager;
  requestId: string;
  executionIdempotencyKey: string;
  canonicalPayload: Readonly<Record<string, unknown>>;
  sourceExpectedVersion: number;
  request: {
    tenantId: string;
    parkId: string;
    sourceId: string;
    requesterId: string;
  };
};

type LockedLease = { id: string; status: string; version: number; currency: string };
type LockedHandover = {
  id: string; leaseId: string; status: string; version: number; currency: string;
  damageAmount: string; unsettledAmount: string; deductionAmount: string;
  itemSnapshot: unknown; meterReadings: unknown; credentials: unknown;
  photoFileIds: unknown; signatureFileId: string | null;
};
type LockedReceivable = {
  id: string; version: number; amount: string; paidAmount: string;
  waivedAmount: string; status: string; currency: string; isDeleted: boolean;
  leaseId: string; sourceType: string; sourceId: string | null; chargeType: string;
  periodStart: string; periodEnd: string; dueDate: string;
};
type Effect = {
  effectKind: string; effectLineKey: string; effectHash: string;
  lineAmount: string | null; currency: string | null;
};

@Injectable()
export class HousingHandoverApprovalExecutorService {
  constructor(private readonly support: HousingTransactionSupportService) {}

  async execute(input: ExecuteApprovedHousingHandoverInput): Promise<void> {
    const payload = input.canonicalPayload;
    const handoverId = this.approvalUuid(payload.handoverId);
    const leaseId = this.approvalUuid(payload.leaseId);
    if (handoverId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const lease = await this.lockLease(input.manager, scope, leaseId);
    const handover = await this.lockHandover(input.manager, scope, leaseId, handoverId);
    this.assertFrozenSource(input, payload, lease, handover);
    const mode = this.receivableMode(payload);
    const receivable = await this.lockCheckoutReceivable(
      input.manager, scope, leaseId, handoverId, mode, payload
    );
    await this.assertDepositSnapshot(input.manager, scope, leaseId, payload);
    await this.assertNoLegacyFinance(input.manager, scope, leaseId);
    const effects = await this.loadEffects(input, scope);
    const handoverEffect = this.mustEffect(effects, "housing.handover.complete.financial");
    await this.completeHandover(input, scope, handoverId, handoverEffect);
    await this.applyReceivableEffect(
      input, scope, lease, handoverId, mode, receivable, effects
    );
    await this.applyDeductionEffect(input, scope, lease, handoverId, effects);
    await this.updateLeaseAndAudit(input, scope, lease, handoverId, handoverEffect);
  }

  private async lockLease(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ) {
    const rows = typeormQueryRows<LockedLease>(await manager.query(
      `SELECT id::text AS id,status,version,currency FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    await this.support.lockBusinessKey(manager, this.advisoryKey(scope, leaseId));
    return rows[0];
  }

  private async lockHandover(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    handoverId: string
  ) {
    const rows = typeormQueryRows<LockedHandover>(await manager.query(
      `SELECT id::text AS id,lease_id::text AS "leaseId",status,version,currency,
              damage_amount::text AS "damageAmount",unsettled_amount::text AS "unsettledAmount",
              deposit_deduction_amount::text AS "deductionAmount",item_snapshot AS "itemSnapshot",
              meter_readings AS "meterReadings",credentials,photo_file_ids AS "photoFileIds",
              signature_file_id::text AS "signatureFileId"
         FROM biz_housing_handover WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND handover_type='move_out' AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, handoverId]
    ));
    if (rows[0]?.leaseId !== leaseId) throw new ConflictException("Approval source changed");
    return rows[0];
  }

  private assertFrozenSource(
    input: ExecuteApprovedHousingHandoverInput,
    payload: Readonly<Record<string, unknown>>,
    lease: LockedLease | undefined,
    handover: LockedHandover | undefined
  ): asserts lease is LockedLease {
    const deductions = Array.isArray(payload.deductions)
      ? payload.deductions as Array<Record<string, unknown>>
      : [];
    const deductionAmount = deductions.length ? String(deductions[0]!.amount ?? "") : "0.00";
    if (!handover || !lease) throw new ConflictException("Approval source changed");
    const changed = [
      handover.status !== "draft",
      handover.version !== input.sourceExpectedVersion,
      lease.version !== Number(payload.leaseExpectedVersion),
      lease.status !== payload.fromLeaseStatus,
      lease.currency !== payload.currency,
      handover.currency !== lease.currency,
      addHousingMoneyAmounts([handover.damageAmount, handover.unsettledAmount])
        !== payload.checkoutReceivableAmount,
      handover.deductionAmount !== deductionAmount,
      this.snapshotHash(handover.itemSnapshot) !== payload.itemSnapshotHash,
      this.snapshotHash(handover.meterReadings) !== payload.meterReadingsHash,
      this.snapshotHash(handover.credentials) !== payload.credentialsHash,
      this.snapshotHash(handover.photoFileIds) !== payload.photoFileIdsHash,
      handover.signatureFileId !== payload.signatureFileId
    ].some(Boolean);
    if (changed) {
      throw new ConflictException("Approval source changed");
    }
  }

  private receivableMode(payload: Readonly<Record<string, unknown>>) {
    const mode = String(payload.checkoutReceivableMode ?? "");
    if (!["none", "new", "existing"].includes(mode)) {
      throw new ConflictException("Approval source changed");
    }
    return mode as "none" | "new" | "existing";
  }

  private async lockCheckoutReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    handoverId: string,
    mode: "none" | "new" | "existing",
    payload: Readonly<Record<string, unknown>>
  ): Promise<LockedReceivable | null> {
    if (mode === "none") return null;
    await this.support.lockBusinessKey(manager, this.support.receivableBusinessKey(
      scope,
      leaseId,
      {
        sourceType: "housing_handover",
        sourceId: handoverId,
        chargeType: "checkout_charges",
        periodStart: String(payload.checkoutReceivablePeriodStart),
        periodEnd: String(payload.checkoutReceivablePeriodEnd)
      }
    ));
    const id = this.approvalUuid(payload.checkoutReceivableId);
    const rows = typeormQueryRows<LockedReceivable>(await manager.query(
      `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
              waived_amount::text AS "waivedAmount",status,currency,is_deleted AS "isDeleted",
              lease_id::text AS "leaseId",source_type AS "sourceType",source_id::text AS "sourceId",
              charge_type AS "chargeType",period_start::text AS "periodStart",
              period_end::text AS "periodEnd",due_date::text AS "dueDate"
         FROM biz_housing_receivable WHERE tenant_id=$1 AND park_id=$2
          AND (id=$3 OR (lease_id=$4 AND source_type='housing_handover' AND source_id=$5
            AND charge_type='checkout_charges')) ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, id, leaseId, handoverId]
    ));
    if (mode === "new") {
      if (rows.length || payload.checkoutReceivableExpectedVersion !== null) {
        throw new ConflictException("Housing checkout receivable mode changed");
      }
      return null;
    }
    const row = rows[0];
    if (rows.length !== 1 || !row || !this.receivableMatches(row, id, leaseId, handoverId, payload)) {
      throw new ConflictException("Housing checkout receivable mode changed");
    }
    return row;
  }

  private receivableMatches(
    row: LockedReceivable,
    id: string,
    leaseId: string,
    handoverId: string,
    payload: Readonly<Record<string, unknown>>
  ) {
    return [
      !row.isDeleted,
      row.status !== "void",
      row.id === id,
      row.version === Number(payload.checkoutReceivableExpectedVersion),
      row.amount === payload.checkoutReceivableOriginalAmount,
      row.paidAmount === payload.checkoutReceivableOriginalPaidAmount,
      row.waivedAmount === payload.checkoutReceivableOriginalWaivedAmount,
      row.status === payload.checkoutReceivableOriginalStatus,
      row.currency === payload.currency,
      row.leaseId === leaseId,
      row.sourceType === "housing_handover",
      row.sourceId === handoverId,
      row.chargeType === "checkout_charges",
      row.periodStart === payload.checkoutReceivablePeriodStart,
      row.periodEnd === payload.checkoutReceivablePeriodEnd,
      row.dueDate === payload.checkoutReceivableDueDate
    ].every(Boolean);
  }

  private async assertDepositSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    payload: Readonly<Record<string, unknown>>
  ) {
    const contributors = typeormQueryRows<Array<Record<string, unknown>>[number]>(
      await manager.query(
        `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
                status,receivable_id::text AS "receivableId",source_type AS "sourceType",
                source_id::text AS "sourceId" FROM biz_housing_ledger_entry
          WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
            AND status='confirmed' AND is_deleted=false ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, leaseId]
      )
    );
    const balance = calculateHousingDepositBalance(
      contributors as Array<{ entryType: never; amount: string }>
    );
    if (this.snapshotHash(contributors) !== payload.depositContributorsHash
      || balance !== payload.depositBalance) {
      throw new ConflictException("Housing deposit contributors changed after approval submission");
    }
  }

  private async assertNoLegacyFinance(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ) {
    const rows = await manager.query(
      `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
        WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
          AND result.entry_type IN ('refund','waiver','deposit_refund')
          AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ count: number }>;
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
    }
  }

  private async loadEffects(input: ExecuteApprovedHousingHandoverInput, scope: TenantParkScope) {
    const rows = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Effect[];
    return new Map(rows.map((row) => [row.effectKind, row]));
  }

  private async completeHandover(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    handoverId: string,
    effect: Effect
  ) {
    const rows = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_handover SET status='completed',handover_at=clock_timestamp(),
              update_by=$5,update_time=clock_timestamp(),version=version+1,
              approval_execution_key=$6,approval_effect_kind=$7,
              approval_effect_line_key=$8,approval_effect_hash=$9
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status='draft'
        RETURNING version`,
      [scope.tenantId, scope.parkId, handoverId, input.sourceExpectedVersion,
        input.request.requesterId, input.executionIdempotencyKey, effect.effectKind,
        effect.effectLineKey, effect.effectHash]
    ));
    if (rows.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async applyReceivableEffect(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    lease: LockedLease,
    handoverId: string,
    mode: "none" | "new" | "existing",
    current: LockedReceivable | null,
    effects: Map<string, Effect>
  ) {
    const effect = effects.get("housing.receivable.checkout");
    if (!effect) {
      if (mode !== "none") throw new ConflictException("Approval effect manifest missing");
      return;
    }
    const payload = input.canonicalPayload;
    if (effect.lineAmount !== payload.checkoutReceivableAmount
      || effect.currency !== payload.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    const id = this.approvalUuid(payload.checkoutReceivableId);
    const rows = mode === "new"
      ? await this.insertReceivable(input, scope, lease, handoverId, id, effect)
      : await this.updateReceivable(input, scope, current!, id, effect);
    if (rows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private insertReceivable(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    lease: LockedLease,
    handoverId: string,
    id: string,
    effect: Effect
  ) {
    const payload = input.canonicalPayload;
    return typeormQueryRows<{ id: string }>(input.manager.query(
      `INSERT INTO biz_housing_receivable(
         id,tenant_id,park_id,lease_id,charge_plan_id,source_type,source_id,charge_type,
         period_start,period_end,due_date,amount,paid_amount,waived_amount,status,currency,
         create_by,update_by,remark)
       VALUES($1,$2,$3,$4,NULL,'housing_handover',$5,'checkout_charges',$6,$7,$8,$9,$10,$11,
              CASE WHEN $9::numeric=$10::numeric+$11::numeric THEN
                CASE WHEN $10::numeric>0 THEN 'paid' ELSE 'waived' END
                WHEN $10::numeric+$11::numeric>0 THEN 'partial' ELSE 'unpaid' END,
              $12,$13,$13,$14) RETURNING id::text AS id`,
      [id, scope.tenantId, scope.parkId, lease.id, handoverId,
        payload.checkoutReceivablePeriodStart, payload.checkoutReceivablePeriodEnd,
        payload.checkoutReceivableDueDate, effect.lineAmount,
        payload.checkoutReceivablePaidAmount, payload.checkoutReceivableWaivedAmount,
        lease.currency, input.request.requesterId, String(payload.reason ?? "")]
    ));
  }

  private updateReceivable(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    current: LockedReceivable,
    id: string,
    effect: Effect
  ) {
    const payload = input.canonicalPayload;
    return typeormQueryRows<{ id: string }>(input.manager.query(
      `UPDATE biz_housing_receivable SET amount=$6,paid_amount=$7,waived_amount=$8,
              status=CASE WHEN $6::numeric=$7::numeric+$8::numeric THEN
                CASE WHEN $7::numeric>0 THEN 'paid' ELSE 'waived' END
                WHEN $7::numeric+$8::numeric>0 THEN 'partial' ELSE 'unpaid' END,
              update_by=$9,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND amount=$5::numeric AND is_deleted=false RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, id, current.version, current.amount, effect.lineAmount,
        payload.checkoutReceivablePaidAmount, payload.checkoutReceivableWaivedAmount,
        input.request.requesterId]
    ));
  }

  private async applyDeductionEffect(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    lease: LockedLease,
    handoverId: string,
    effects: Map<string, Effect>
  ) {
    const effect = effects.get("housing.ledger.deduction");
    if (!effect) return;
    const payload = input.canonicalPayload;
    const rows = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_ledger_entry(
         tenant_id,park_id,lease_id,receivable_id,entry_type,charge_type,amount,currency,
         source_type,source_id,status,reason,occurred_at,create_by,update_by,
         approval_execution_key,approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,$4,'deposit_deduction','checkout_deduction',$5,$6,
              'housing_handover',$7,'confirmed',$8,clock_timestamp(),$9,$9,$10,$11,$12,$13)
       RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, lease.id, payload.checkoutReceivableId,
        effect.lineAmount, lease.currency, handoverId, String(payload.reason ?? ""),
        input.request.requesterId, input.executionIdempotencyKey, effect.effectKind,
        effect.effectLineKey, effect.effectHash]
    ));
    if (rows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private async updateLeaseAndAudit(
    input: ExecuteApprovedHousingHandoverInput,
    scope: TenantParkScope,
    lease: LockedLease,
    handoverId: string,
    effect: Effect
  ) {
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_lease SET status='checkout_pending',update_by=$5,
              update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
      [scope.tenantId, scope.parkId, lease.id, lease.version, input.request.requesterId]
    ));
    if (updated.length !== 1 || updated[0]!.version !== lease.version + 1) {
      throw new ConflictException("Approval source changed");
    }
    const payload = input.canonicalPayload;
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_lease_effect_audit(
         tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
         effect_line_key,actor_id,occurred_at,effect_hash,lease_id,handover_id,
         from_status,to_status,reason,source_expected_version,resulting_version)
       VALUES($1,$2,$3,'housing.handovers.complete-move-out-financial.request',$4,$5,$6,$7,
              clock_timestamp(),$8,$9,$10,$11,'checkout_pending',$12,$13,$14)
       RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, input.requestId, effect.effectKind,
        input.executionIdempotencyKey, effect.effectLineKey, input.request.requesterId,
        effect.effectHash, lease.id, handoverId, lease.status, String(payload.reason ?? ""),
        lease.version, lease.version + 1]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private mustEffect(effects: Map<string, Effect>, kind: string) {
    const effect = effects.get(kind);
    if (!effect) throw new ConflictException("Approval effect manifest missing");
    return effect;
  }

  private advisoryKey(scope: TenantParkScope, leaseId: string) {
    return ["housing-handover", scope.tenantId, scope.parkId, leaseId, "move_out"].join("|");
  }

  private approvalUuid(value: unknown): string {
    const text = typeof value === "string" ? value : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
      throw new ConflictException("Approval source changed");
    }
    return text;
  }

  private snapshotHash(value: unknown) {
    return propertyApprovalCanonicalHash(value as never);
  }
}
