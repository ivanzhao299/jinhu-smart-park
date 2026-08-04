import { ConflictException, Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { HousingPurchaseItemEntity } from "./entities/housing.entities";
import { addHousingMoneyAmounts } from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

type PurchaseTransferInput = {
  manager: EntityManager; requestId: string; executionIdempotencyKey: string;
  canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
  request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
};

type PurchaseTransferSource = {
  purchaseId: string; leaseId: string; receivableId: string;
  purchase: { id: string; version: number; currency: string; approvalStatus: string; paymentStatus: string };
  frozenItems: Array<Record<string, unknown>>;
};

type PurchaseTransferReceivable = {
  id: string; version: number; leaseId: string; currency: string; amount: string;
  paidAmount: string; waivedAmount: string; status: string; isDeleted: boolean;
  sourceType: string; sourceId: string | null; chargeType: string;
  periodStart: string; periodEnd: string; dueDate: string;
};

type PurchaseTransferEffect = {
  effectKind: string; effectLineKey: string; effectHash: string;
  lineAmount: string | null; currency: string | null;
};

@Injectable()
export class HousingPurchaseApprovalExecutorService {
  constructor(private readonly txSupport: HousingTransactionSupportService) {}

  async executeApprovedPurchaseTransfer(input: PurchaseTransferInput): Promise<void> {
    const source = await this.lockTransferSource(input);
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const target = await this.lockTransferReceivable(input, scope, source);
    const effects = await this.loadTransferEffects(input, scope);
    await this.casPurchase(input, scope, source.purchaseId);
    await this.applyTransferItems(input, scope, source, effects.itemEffects);
    await this.writeTransferReceivable(input, scope, source, target);
  }

  private async lockTransferSource(input: PurchaseTransferInput): Promise<PurchaseTransferSource> {
    const payload = input.canonicalPayload;
    const purchaseId = this.approvalUuid(payload.purchaseId);
    const leaseId = this.approvalUuid(payload.leaseId);
    const receivableId = this.approvalUuid(payload.targetReceivableId);
    if (purchaseId !== input.request.sourceId || !Array.isArray(payload.items)) {
      throw new ConflictException("Approval source changed");
    }
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const purchases = await input.manager.query(
      `SELECT id::text AS id, version, currency, approval_status AS "approvalStatus",
              payment_status AS "paymentStatus" FROM biz_housing_purchase
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, purchaseId]
    ) as PurchaseTransferSource["purchase"][];
    const purchase = purchases[0];
    if (!purchase || purchase.version !== input.sourceExpectedVersion
      || purchase.approvalStatus !== "approved" || purchase.paymentStatus === "refunded"
      || purchase.currency !== payload.currency) throw new ConflictException("Approval source changed");
    await this.assertTransferLease(input, scope, leaseId, purchase.currency, payload);
    const frozenItems = payload.items as Array<Record<string, unknown>>;
    await this.assertTransferItems(input, scope, purchaseId, purchase.currency, frozenItems);
    return { purchaseId, leaseId, receivableId, purchase, frozenItems };
  }

  private async assertTransferLease(input: PurchaseTransferInput, scope: TenantParkScope,
    leaseId: string, currency: string, payload: Readonly<Record<string, unknown>>) {
    const leases = await input.manager.query(
      `SELECT version,currency,status FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ version: number; currency: string; status: string }>;
    const lease = leases[0];
    if (!lease || lease.version !== Number(payload.leaseExpectedVersion)
      || lease.currency !== currency || !["active","expiring","checkout_pending"].includes(lease.status)) {
      throw new ConflictException("Approval source changed");
    }
  }

  private async assertTransferItems(input: PurchaseTransferInput, scope: TenantParkScope,
    purchaseId: string, currency: string, frozenItems: Array<Record<string, unknown>>) {
    const frozenItemIds = frozenItems.map((item) => this.approvalUuid(item.purchaseItemId));
    const itemRows = typeormQueryRows<{
      id: string; version: number; amount: string; transferredReceivableId: string | null;
    }>(await input.manager.query(
      `SELECT id::text AS id,version,amount::text AS amount,
              transferred_receivable_id::text AS "transferredReceivableId"
         FROM biz_housing_purchase_item
        WHERE tenant_id=$1 AND park_id=$2 AND purchase_id=$3 AND id=ANY($4::uuid[])
          AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, purchaseId, frozenItemIds]
    ));
    if (itemRows.length !== frozenItems.length) throw new ConflictException("Approval source changed");
    for (const [index, row] of itemRows.entries()) {
      const frozen = frozenItems[index]!;
      const values = [row.id, row.version, row.amount, frozen.currency,
        frozen.transferredReceivableId, row.transferredReceivableId];
      const expected = [frozenItemIds[index], Number(frozen.expectedVersion), frozen.amount,
        currency, null, null];
      if (values.some((value, field) => value !== expected[field])) {
        throw new ConflictException("Approval source changed");
      }
    }
  }

  private async lockTransferReceivable(input: PurchaseTransferInput, scope: TenantParkScope,
    source: PurchaseTransferSource) {
    const payload = input.canonicalPayload;
    const mode = String(payload.targetReceivableMode ?? "");
    if (!["new", "existing"].includes(mode)) throw new ConflictException("Approval source changed");
    await this.mustTxSupport().lockBusinessKey(input.manager,
      this.mustTxSupport().receivableBusinessKey(scope, source.leaseId, {
        sourceType: String(payload.targetReceivableSourceType), sourceId: source.purchaseId,
        chargeType: String(payload.targetReceivableChargeType),
        periodStart: String(payload.targetReceivablePeriodStart),
        periodEnd: String(payload.targetReceivablePeriodEnd)
      }));
    const rows = typeormQueryRows<PurchaseTransferReceivable>(await input.manager.query(
      `SELECT id::text AS id,version,lease_id::text AS "leaseId",currency,amount::text AS amount,
              paid_amount::text AS "paidAmount",waived_amount::text AS "waivedAmount",status,
              is_deleted AS "isDeleted",source_type AS "sourceType",source_id::text AS "sourceId",
              charge_type AS "chargeType",period_start::text AS "periodStart",
              period_end::text AS "periodEnd",due_date::text AS "dueDate"
          FROM biz_housing_receivable
        WHERE tenant_id=$1 AND park_id=$2 AND (id=$3 OR
          (source_type='purchase_transfer' AND source_id=$4 AND charge_type='purchase_recharge'))
        ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, source.receivableId, source.purchaseId]
    ));
    const receivable = rows[0] ?? null;
    if (mode === "new") {
      if (rows.length || payload.targetReceivableExpectedVersion !== null) {
        throw new ConflictException("Purchase transfer receivable mode changed");
      }
    } else {
      this.assertExistingTransferReceivable(rows, receivable, source, payload);
    }
    return { mode, receivable };
  }

  private assertExistingTransferReceivable(rows: PurchaseTransferReceivable[],
    receivable: PurchaseTransferReceivable | null, source: PurchaseTransferSource,
    payload: Readonly<Record<string, unknown>>) {
    if (rows.length !== 1 || !receivable || receivable.isDeleted || receivable.status === "void") {
      throw new ConflictException("Purchase transfer receivable mode changed");
    }
    const values = [receivable.id, receivable.leaseId, receivable.version, receivable.amount,
      receivable.paidAmount, receivable.waivedAmount, receivable.status, receivable.currency,
      receivable.sourceType, receivable.sourceId, receivable.chargeType, receivable.periodStart,
      receivable.periodEnd, receivable.dueDate];
    const expected = [source.receivableId, source.leaseId, Number(payload.targetReceivableExpectedVersion),
      payload.targetReceivableOriginalAmount, payload.targetReceivableOriginalPaidAmount,
      payload.targetReceivableOriginalWaivedAmount, payload.targetReceivableOriginalStatus,
      source.purchase.currency, payload.targetReceivableSourceType, payload.targetReceivableSourceId,
      payload.targetReceivableChargeType, payload.targetReceivablePeriodStart,
      payload.targetReceivablePeriodEnd, payload.targetReceivableDueDate];
    if (values.some((value, index) => value !== expected[index])) {
      throw new ConflictException("Purchase transfer receivable mode changed");
    }
  }

  private async loadTransferEffects(input: PurchaseTransferInput, scope: TenantParkScope) {
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as PurchaseTransferEffect[];
    const itemEffects = new Map(manifests.filter((row) => row.effectKind === "housing.purchase.transfer")
      .map((row) => [row.effectLineKey, row]));
    const receivableEffect = manifests.find((row) => row.effectKind === "housing.receivable.purchase.transfer");
    if (!receivableEffect || receivableEffect.lineAmount !== input.canonicalPayload.aggregateDeltaAmount
      || receivableEffect.currency !== input.canonicalPayload.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    return { itemEffects };
  }

  private async casPurchase(input: PurchaseTransferInput, scope: TenantParkScope, purchaseId: string) {
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_purchase SET update_by=$5,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
      [scope.tenantId, scope.parkId, purchaseId, input.sourceExpectedVersion, input.request.requesterId]
    ));
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async applyTransferItems(input: PurchaseTransferInput, scope: TenantParkScope,
    source: PurchaseTransferSource, effects: Map<string, PurchaseTransferEffect>) {
    for (const item of source.frozenItems) {
      const itemId = this.approvalUuid(item.purchaseItemId);
      const expectedVersion = Number(item.expectedVersion);
      const effect = effects.get(`item:${itemId}`);
      if (!effect) throw new ConflictException("Approval effect manifest missing");
      const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
        `UPDATE biz_housing_purchase_item SET transferred_receivable_id=$5,update_by=$6,
                update_time=clock_timestamp(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND purchase_id=$4 AND version=$7
            AND transferred_receivable_id IS NULL AND amount=$8::numeric AND is_deleted=false
          RETURNING version`,
        [scope.tenantId, scope.parkId, itemId, source.purchaseId, source.receivableId,
          input.request.requesterId, expectedVersion, item.amount]
      ));
      if (updated.length !== 1 || updated[0]!.version !== expectedVersion + 1) {
        throw new ConflictException("Approval source changed");
      }
      await this.writeTransferItemAudit(input, scope, source, item, itemId, expectedVersion, effect);
    }
  }

  private async writeTransferItemAudit(input: PurchaseTransferInput, scope: TenantParkScope,
    source: PurchaseTransferSource, item: Record<string, unknown>, itemId: string,
    expectedVersion: number, effect: PurchaseTransferEffect) {
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_purchase_transfer_effect_audit(
         tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
         effect_line_key,actor_id,occurred_at,effect_hash,purchase_id,purchase_item_id,
         from_purchase_id,to_lease_id,to_receivable_id,currency,purchase_source_expected_version,
         purchase_resulting_version,item_source_expected_version,item_resulting_version,item_amount,reason)
       VALUES($1,$2,$3,'housing.purchases.transfer.request',$4,$5,$6,$7,clock_timestamp(),$8,
              $9,$10,$9,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, input.requestId, effect.effectKind,
        input.executionIdempotencyKey, effect.effectLineKey, input.request.requesterId,
        effect.effectHash, source.purchaseId, itemId, source.leaseId, source.receivableId,
        source.purchase.currency, input.sourceExpectedVersion, input.sourceExpectedVersion + 1,
        expectedVersion, expectedVersion + 1, item.amount, String(input.canonicalPayload.reason ?? "")]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private async writeTransferReceivable(input: PurchaseTransferInput, scope: TenantParkScope,
    source: PurchaseTransferSource,
    target: { mode: string; receivable: PurchaseTransferReceivable | null }) {
    const payload = input.canonicalPayload;
    const nextAmount = addHousingMoneyAmounts([
      String(payload.targetReceivableOriginalAmount), String(payload.aggregateDeltaAmount)
    ]);
    const updated = target.mode === "new"
      ? typeormQueryRows<{ version: number }>(await input.manager.query(
        `INSERT INTO biz_housing_receivable(
           id,tenant_id,park_id,lease_id,charge_plan_id,source_type,source_id,charge_type,
           period_start,period_end,due_date,amount,paid_amount,waived_amount,status,currency,
           create_by,update_by,remark)
         VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,'0.00','0.00','unpaid',$12,$13,$13,$14)
         RETURNING version`,
        [source.receivableId, scope.tenantId, scope.parkId, source.leaseId,
          payload.targetReceivableSourceType, source.purchaseId, payload.targetReceivableChargeType,
          payload.targetReceivablePeriodStart, payload.targetReceivablePeriodEnd,
          payload.targetReceivableDueDate, nextAmount, source.purchase.currency,
          input.request.requesterId, String(payload.reason ?? "")]
      ))
      : await this.updateTransferReceivable(input, scope, source.receivableId,
        target.receivable!, nextAmount);
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async updateTransferReceivable(input: PurchaseTransferInput, scope: TenantParkScope,
    receivableId: string, receivable: PurchaseTransferReceivable, nextAmount: string) {
    const payload = input.canonicalPayload;
    return typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_receivable SET amount=$5,update_by=$6,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND amount=$7::numeric AND paid_amount=$8::numeric AND waived_amount=$9::numeric
          AND status=$10 AND is_deleted=false RETURNING version`,
      [scope.tenantId, scope.parkId, receivableId, receivable.version, nextAmount,
        input.request.requesterId, payload.targetReceivableOriginalAmount,
        payload.targetReceivableOriginalPaidAmount, payload.targetReceivableOriginalWaivedAmount,
        payload.targetReceivableOriginalStatus]
    ));
  }

  async executeApprovedPurchaseLifecycle(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    const payload = input.canonicalPayload;
    const purchaseId = this.approvalUuid(payload.purchaseId);
    if (purchaseId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const rows = await input.manager.query(
      `SELECT approval_status AS "approvalStatus",payment_status AS "paymentStatus",version
       FROM biz_housing_purchase WHERE tenant_id=$1 AND park_id=$2 AND id=$3
        AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, purchaseId]
    ) as Array<{ approvalStatus: string; paymentStatus: string; version: number }>;
    const purchase = rows[0];
    if (!purchase || purchase.version !== input.sourceExpectedVersion
      || purchase.approvalStatus !== payload.beforeApprovalStatus
      || purchase.paymentStatus !== payload.beforePaymentStatus) {
      throw new ConflictException("Approval source changed");
    }
    this.assertApprovedPurchaseLifecycleTransition(payload, purchase);
    if (["refund", "void-draft", "void-approved", "void-rejected"].includes(String(payload.transition))
      && await this.hasTransferredPurchaseItems(input.manager, scope, purchaseId)) {
      throw new ConflictException("Transferred purchase items must be reversed before this transition");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",invariant_hash AS "effectHash"
       FROM biz_property_execution_effect_manifest WHERE tenant_id=$1 AND park_id=$2
        AND request_id=$3 AND effect_kind='housing.purchase.lifecycle'`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string }>;
    const effect = manifests[0];
    if (!effect) throw new ConflictException("Approval effect manifest missing");
    const decisions = typeormQueryRows<{ actorId: string }>(await input.manager.query(
      `SELECT actor_id::text AS "actorId" FROM biz_property_approval_decision
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 AND decision='approve'
        ORDER BY decided_at DESC,id DESC LIMIT 1`,
      [scope.tenantId, scope.parkId, input.requestId]
    ));
    const decisionActor = decisions[0]?.actorId;
    if (!decisionActor) throw new ConflictException("Approval decision evidence missing");
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_purchase SET approval_status=$5,payment_status=$6,remark=$7,
              update_by=$8,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
      [scope.tenantId, scope.parkId, purchaseId, input.sourceExpectedVersion,
        payload.afterApprovalStatus, payload.afterPaymentStatus, String(payload.reason ?? ""),
        decisionActor]
    ));
    if (updated.length !== 1 || updated[0]!.version !== input.sourceExpectedVersion + 1) {
      throw new ConflictException("Approval source changed");
    }
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_purchase_effect_audit(
       tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
       effect_line_key,actor_id,occurred_at,effect_hash,purchase_id,transition,
       before_approval_status,after_approval_status,before_payment_status,after_payment_status,
       reason,source_expected_version,resulting_version)
       VALUES($1,$2,$3,'housing.purchases.lifecycle.request',$4,$5,$6,$7,clock_timestamp(),
        $8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, input.requestId, effect.effectKind,
        input.executionIdempotencyKey, effect.effectLineKey, decisionActor,
        effect.effectHash, purchaseId, payload.transition, purchase.approvalStatus,
        payload.afterApprovalStatus, purchase.paymentStatus, payload.afterPaymentStatus,
        String(payload.reason ?? ""), input.sourceExpectedVersion, input.sourceExpectedVersion + 1]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }
  private approvalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }
  private assertApprovedPurchaseLifecycleTransition(
    payload: Readonly<Record<string, unknown>>,
    purchase: { approvalStatus: string; paymentStatus: string }
  ): void {
    const transition = String(payload.transition ?? "");
    const afterApprovalStatus = String(payload.afterApprovalStatus ?? "");
    const afterPaymentStatus = String(payload.afterPaymentStatus ?? "");
    const transitions: Record<string, readonly [string, string, string, string]> = {
      approve: ["draft", "unpaid", "approved", "unpaid"],
      reject: ["draft", "unpaid", "rejected", "unpaid"],
      pay: ["approved", "unpaid", "approved", "paid"],
      refund: ["approved", "paid", "approved", "refunded"],
      "void-draft": ["draft", "unpaid", "void", "unpaid"],
      "void-approved": ["approved", "unpaid", "void", "unpaid"],
      "void-rejected": ["rejected", "unpaid", "void", "unpaid"]
    };
    const expected = transitions[transition];
    const actual = [purchase.approvalStatus, purchase.paymentStatus,
      afterApprovalStatus, afterPaymentStatus];
    if (!expected || actual.some((value, index) => value !== expected[index])) {
      throw new ConflictException("Approval purchase transition changed");
    }
  }
  private hasTransferredPurchaseItems(
    manager: EntityManager,
    scope: TenantParkScope,
    purchaseId: string
  ): Promise<boolean> {
    return manager.getRepository(HousingPurchaseItemEntity)
      .createQueryBuilder("item")
      .where("item.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("item.purchase_id=:purchaseId", { purchaseId })
      .andWhere("item.is_deleted=false")
      .andWhere("item.transferred_receivable_id IS NOT NULL")
      .getExists();
  }
  private mustTxSupport() {
    return this.txSupport;
  }
}
