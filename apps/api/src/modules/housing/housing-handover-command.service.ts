import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional
} from "@nestjs/common";
import {
  type IdentityVerificationPort,
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions
} from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { PropertyIdentityVerificationService } from
  "../property-identity/property-identity-verification.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import type { CompleteHousingHandoverDto } from "./dto/housing.dto";
import {
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLedgerEntryEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  addHousingMoneyAmounts,
  applyHousingReceivableMutation,
  calculateHousingDepositBalance,
  compareHousingMoney,
  formatHousingMoney
} from "./housing-finance.policy";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

type FrozenCheckoutReceivable = {
  mode: "new" | "existing";
  id: string;
  expectedVersion: number | null;
  originalAmount: string;
  originalPaidAmount: string;
  originalWaivedAmount: string;
  originalStatus: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
};

type DepositContributor = {
  id: string;
  version: number;
  entryType: string;
  amount: string;
  currency: string;
  status: string;
  receivableId: string | null;
  sourceType: string;
  sourceId: string | null;
};

@Injectable()
export class HousingHandoverCommandService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly support: HousingTransactionSupportService,
    private readonly receivableWriter: HousingReceivableWriterService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort,
    @Optional()
    private readonly identityVerifier?: PropertyIdentityVerificationService
  ) {}

  complete(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CompleteHousingHandoverDto,
    clientKey = ""
  ) {
    const financial = this.requiresFinancialApproval(dto);
    this.assertApprovalAvailable(actor, financial);
    return this.dataSource.transaction((manager) =>
      this.completeInTransaction(manager, scope, actor, leaseId, dto, clientKey, financial));
  }

  private async completeInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CompleteHousingHandoverDto,
    clientKey: string,
    financial: boolean
  ) {
    const lease = await this.support.lockLease(manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    if (financial) await this.assertFinancialHandoverHistory(manager, scope, leaseId);
    const repository = manager.getRepository(HousingHandoverEntity);
    let handover = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        handoverType: dto.handover_type,
        isDeleted: false
      },
      lock: { mode: "pessimistic_write" }
    });
    if (handover?.status === "completed") {
      if (financial) throw new ConflictException("Housing handover is already completed");
      return handover;
    }
    this.assertHandoverState(lease, dto);
    if (dto.handover_type === "move_in") {
      await this.assertMoveInIdentity(manager, scope, lease);
    }
    const photoIds = dto.photo_file_ids ?? [];
    await this.assertEvidence(manager, scope, lease.id, dto, photoIds);
    this.assertDeductionLimits(lease.depositAmount, dto);
    handover ??= repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId,
      handoverType: dto.handover_type,
      createBy: actor.sub
    });
    const checkoutCharge = addHousingMoneyAmounts([dto.damage_amount, dto.unsettled_amount]);
    if (compareHousingMoney(dto.deposit_deduction_amount, checkoutCharge) > 0) {
      throw new BadRequestException(
        "Deposit deduction cannot exceed move-out damage and unsettled charges"
      );
    }
    return financial
      ? this.submitFinancialApproval(
          manager, scope, actor, lease, handover, dto, photoIds, checkoutCharge, clientKey
        )
      : this.completeDirect(manager, scope, actor, lease, handover, dto, photoIds, checkoutCharge);
  }

  private async assertMoveInIdentity(
    manager: EntityManager,
    scope: TenantParkScope,
    lease: HousingLeaseEntity
  ) {
    if (!this.identityVerifier) {
      throw new ConflictException("Property identity verification runtime is unavailable");
    }
    const occupants = typeormQueryRows<{ partyId: string }>(await manager.query(
      `SELECT party_id::text AS "partyId"
         FROM rel_housing_lease_occupant
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND is_deleted=false
        ORDER BY party_id
        FOR UPDATE`,
      [scope.tenantId, scope.parkId, lease.id]
    ));
    const partyIds = [...new Set([
      lease.tenantPartyId,
      ...occupants.map((occupant) => occupant.partyId)
    ])].sort();
    const evidence = await (this.identityVerifier as IdentityVerificationPort)
      .verifyForHousingMoveIn({
        manager: { transactionContext: manager },
        scope,
        leaseId: lease.id,
        partyIds,
        expectedConsent: "granted"
      });
    if (evidence.length !== partyIds.length) {
      throw new ConflictException("Housing move-in identity verification is incomplete");
    }
  }

  private requiresFinancialApproval(dto: CompleteHousingHandoverDto) {
    return dto.handover_type === "move_out" && [
      dto.damage_amount,
      dto.unsettled_amount,
      dto.deposit_deduction_amount
    ].some((amount) => compareHousingMoney(amount, "0.00") !== 0);
  }

  private assertApprovalAvailable(actor: JwtPrincipal, required: boolean) {
    if (!required) return;
    assertPropertyHighRiskActionPermissions(actor, [
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
    ]);
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired(
        "housing.handovers.complete-move-out-financial"
      );
      throw new ConflictException("Property approval runtime is unavailable");
    }
  }

  private async assertFinancialHandoverHistory(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ) {
    await this.support.lockBusinessKey(manager, this.advisoryKey(scope, leaseId));
    const rows = typeormQueryRows<{ id: string; status: string; isDeleted: boolean }>(
      await manager.query(
        `SELECT id::text AS id,status,is_deleted AS "isDeleted"
           FROM biz_housing_handover
          WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND handover_type='move_out'
          ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, leaseId]
      )
    );
    if (rows.length > 1 || rows.some((row) => row.isDeleted)
      || rows.some((row) => !["draft", "completed"].includes(row.status))) {
      throw new ConflictException("Housing handover history conflicts with approval submission");
    }
    if (rows[0]?.status === "completed") {
      throw new ConflictException("Housing handover is already completed");
    }
  }

  private assertHandoverState(
    lease: HousingLeaseEntity,
    dto: CompleteHousingHandoverDto
  ) {
    this.support.assertStatus(
      lease,
      dto.handover_type === "move_in"
        ? ["active"]
        : ["active", "expiring", "checkout_pending"]
    );
    if (dto.handover_type === "move_in" && [
      dto.damage_amount,
      dto.unsettled_amount,
      dto.deposit_deduction_amount
    ].some((amount) => compareHousingMoney(amount, "0.00") > 0)) {
      throw new BadRequestException(
        "Move-in handover cannot include damage, unsettled, or deposit deduction amounts"
      );
    }
  }

  private async assertEvidence(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    dto: CompleteHousingHandoverDto,
    photoIds: string[]
  ) {
    await this.support.assertFiles(manager, scope, photoIds, {
      mimePrefix: "image/",
      allowedBizTypes: ["housing_handover", `housing_handover_${dto.handover_type}`],
      bizId: leaseId
    });
    if (photoIds.length) {
      const rows = await manager.query(
        `SELECT 1 FROM biz_housing_handover bound_handover
          WHERE bound_handover.tenant_id=$1 AND bound_handover.park_id=$2
            AND bound_handover.lease_id=$3 AND bound_handover.handover_type<>$4
            AND bound_handover.is_deleted=false AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(bound_handover.photo_file_ids) bound_file_id
               WHERE bound_file_id=ANY($5::text[])) LIMIT 1`,
        [scope.tenantId, scope.parkId, leaseId, dto.handover_type, photoIds]
      ) as unknown[];
      if (rows.length) {
        throw new ConflictException(
          "One or more handover attachments are already bound to another handover"
        );
      }
    }
    if (dto.signature_file_id) {
      await this.support.assertFiles(manager, scope, [dto.signature_file_id], {
        bizType: "housing_handover",
        bizId: leaseId
      });
    }
  }

  private assertDeductionLimits(depositAmount: string, dto: CompleteHousingHandoverDto) {
    if (compareHousingMoney(dto.deposit_deduction_amount, depositAmount) > 0) {
      throw new BadRequestException("Deposit deduction cannot exceed agreed deposit");
    }
  }

  private async submitFinancialApproval(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    handover: HousingHandoverEntity,
    dto: CompleteHousingHandoverDto,
    photoIds: string[],
    checkoutCharge: string,
    clientKey: string
  ) {
    await this.assertNoLegacyFinance(manager, scope, lease.id);
    this.applyHandover(handover, lease, actor, dto, photoIds, "draft");
    handover.currency = lease.currency;
    const draft = await manager.getRepository(HousingHandoverEntity).save(handover);
    const businessDate = await this.businessDate(manager);
    const periodEnd = this.support.addDays(businessDate, 1);
    const checkout = compareHousingMoney(checkoutCharge, "0.00") > 0
      ? await this.freezeCheckoutReceivable(
          manager, scope, lease, draft, dto, checkoutCharge, businessDate, periodEnd
        )
      : null;
    const contributors = await this.depositContributors(manager, scope, lease.id);
    const depositBalance = calculateHousingDepositBalance(
      contributors.map((row) => ({ ...row, isDeleted: false })) as HousingLedgerEntryEntity[]
    );
    if (compareHousingMoney(dto.deposit_deduction_amount, depositBalance) > 0) {
      throw new ConflictException("Deposit deduction exceeds current deposit balance");
    }
    return this.createApprovalRequest(
      manager, scope, actor, lease, draft, dto, checkoutCharge,
      checkout, contributors, depositBalance, businessDate, periodEnd, clientKey
    );
  }

  private async freezeCheckoutReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    lease: HousingLeaseEntity,
    draft: HousingHandoverEntity,
    dto: CompleteHousingHandoverDto,
    checkoutCharge: string,
    businessDate: string,
    periodEnd: string
  ): Promise<FrozenCheckoutReceivable> {
    await this.support.lockBusinessKey(manager, this.support.receivableBusinessKey(
      scope,
      lease.id,
      {
        sourceType: "housing_handover",
        sourceId: draft.id,
        chargeType: "checkout_charges",
        periodStart: businessDate,
        periodEnd
      }
    ));
    const rows = await this.checkoutReceivableRows(manager, scope, lease.id, draft.id);
    if (rows.length > 1 || rows.some((row) => row.isDeleted || row.status === "void")) {
      throw new ConflictException("Housing checkout receivable history conflicts with approval submission");
    }
    const existing = rows[0];
    if (existing && existing.currency !== lease.currency) {
      throw new ConflictException("Housing checkout receivable currency changed");
    }
    const frozen: FrozenCheckoutReceivable = existing ? {
      mode: "existing",
      id: existing.id,
      expectedVersion: existing.version,
      originalAmount: formatHousingMoney(existing.amount),
      originalPaidAmount: formatHousingMoney(existing.paidAmount),
      originalWaivedAmount: formatHousingMoney(existing.waivedAmount),
      originalStatus: existing.status,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      dueDate: existing.dueDate
    } : {
      mode: "new",
      id: randomUUID(),
      expectedVersion: null,
      originalAmount: "0.00",
      originalPaidAmount: "0.00",
      originalWaivedAmount: "0.00",
      originalStatus: "absent",
      periodStart: businessDate,
      periodEnd,
      dueDate: businessDate
    };
    const settlement = addHousingMoneyAmounts([
      frozen.originalPaidAmount,
      frozen.originalWaivedAmount,
      dto.deposit_deduction_amount
    ]);
    if (compareHousingMoney(settlement, checkoutCharge) > 0) {
      throw new ConflictException("Housing checkout settlement exceeds its receivable amount");
    }
    return frozen;
  }

  private checkoutReceivableRows(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    handoverId: string
  ) {
    return manager.query(
      `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
              waived_amount::text AS "waivedAmount",status,currency,is_deleted AS "isDeleted",
              period_start::text AS "periodStart",period_end::text AS "periodEnd",
              due_date::text AS "dueDate"
         FROM biz_housing_receivable
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
          AND source_type='housing_handover' AND source_id=$4
          AND charge_type='checkout_charges' ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId, handoverId]
    ) as Promise<Array<{
      id: string; version: number; amount: string; paidAmount: string; waivedAmount: string;
      status: string; currency: string; isDeleted: boolean; periodStart: string;
      periodEnd: string; dueDate: string;
    }>>;
  }

  private async createApprovalRequest(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    draft: HousingHandoverEntity,
    dto: CompleteHousingHandoverDto,
    checkoutCharge: string,
    checkout: FrozenCheckoutReceivable | null,
    contributors: DepositContributor[],
    depositBalance: string,
    businessDate: string,
    periodEnd: string,
    clientKey: string
  ) {
    const checkoutPayload = this.approvalCheckoutPayload(checkout, businessDate, periodEnd);
    const paidAmount = addHousingMoneyAmounts([
      checkoutPayload.checkoutReceivableOriginalPaidAmount ?? "0.00",
      dto.deposit_deduction_amount
    ]);
    return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
      contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
      scope,
      actionId: "housing.handovers.complete-move-out-financial.request",
      sourceType: "housing-handover",
      sourceId: draft.id,
      sourceExpectedVersion: draft.version,
      requesterId: actor.sub,
      submitterId: actor.sub,
      actorId: actor.sub,
      clientKey,
      businessIntentKey: `housing-handover:${draft.id}:${draft.version}`,
      canonicalPayload: {
        handoverId: draft.id,
        leaseId: lease.id,
        leaseExpectedVersion: lease.version,
        fromLeaseStatus: lease.status,
        reason: dto.remark?.trim() || "完成退租财务交接",
        actorName: actor.realName?.trim() || actor.username,
        itemSnapshotHash: this.snapshotHash(draft.itemSnapshot),
        meterReadingsHash: this.snapshotHash(draft.meterReadings),
        credentialsHash: this.snapshotHash(draft.credentials),
        photoFileIdsHash: this.snapshotHash(draft.photoFileIds),
        signatureFileId: draft.signatureFileId,
        checkoutBusinessDate: businessDate,
        ...checkoutPayload,
        checkoutReceivableAmount: checkoutCharge,
        checkoutReceivablePaidAmount: paidAmount,
        checkoutReceivableWaivedAmount:
          checkoutPayload.checkoutReceivableOriginalWaivedAmount ?? "0.00",
        depositBalance,
        depositContributors: contributors,
        depositContributorsHash: this.snapshotHash(contributors),
        currency: lease.currency,
        ...this.approvalDeductionPayload(draft, lease, dto)
      },
      payloadSchemaVersion: 1,
      amount: addHousingMoneyAmounts([checkoutCharge, dto.deposit_deduction_amount]),
      currency: lease.currency
    });
  }

  private approvalCheckoutPayload(
    checkout: FrozenCheckoutReceivable | null,
    businessDate: string,
    periodEnd: string
  ) {
    if (checkout) {
      return {
        checkoutReceivablePeriodStart: checkout.periodStart,
        checkoutReceivablePeriodEnd: checkout.periodEnd,
        checkoutReceivableDueDate: checkout.dueDate,
        checkoutReceivableMode: checkout.mode,
        checkoutReceivableId: checkout.id,
        checkoutReceivableExpectedVersion: checkout.expectedVersion,
        checkoutReceivableOriginalAmount: checkout.originalAmount,
        checkoutReceivableOriginalPaidAmount: checkout.originalPaidAmount,
        checkoutReceivableOriginalWaivedAmount: checkout.originalWaivedAmount,
        checkoutReceivableOriginalStatus: checkout.originalStatus
      };
    }
    return {
      checkoutReceivablePeriodStart: businessDate,
      checkoutReceivablePeriodEnd: periodEnd,
      checkoutReceivableDueDate: businessDate,
      checkoutReceivableMode: "none" as const,
      checkoutReceivableId: null,
      checkoutReceivableExpectedVersion: null,
      checkoutReceivableOriginalAmount: null,
      checkoutReceivableOriginalPaidAmount: null,
      checkoutReceivableOriginalWaivedAmount: null,
      checkoutReceivableOriginalStatus: null
    };
  }

  private approvalDeductionPayload(
    draft: HousingHandoverEntity,
    lease: HousingLeaseEntity,
    dto: CompleteHousingHandoverDto
  ): Record<string, PropertyApprovalJsonValue> {
    if (compareHousingMoney(dto.deposit_deduction_amount, "0.00") <= 0) return {};
    return {
      deductions: [{
        itemId: draft.id,
        amount: formatHousingMoney(dto.deposit_deduction_amount),
        currency: lease.currency
      }]
    };
  }

  private async completeDirect(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    handover: HousingHandoverEntity,
    dto: CompleteHousingHandoverDto,
    photoIds: string[],
    checkoutCharge: string
  ) {
    this.applyHandover(handover, lease, actor, dto, photoIds, "completed");
    const saved = await manager.getRepository(HousingHandoverEntity).save(handover);
    if (dto.handover_type !== "move_out") return saved;
    let receivable: HousingReceivableEntity | null = null;
    if (compareHousingMoney(checkoutCharge, "0.00") > 0) {
      const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      receivable = await this.receivableWriter.create(manager, scope, actor, lease, {
        chargePlanId: null,
        sourceType: "housing_handover",
        sourceId: saved.id,
        chargeType: "checkout_charges",
        periodStart: date,
        periodEnd: this.support.addDays(date, 1),
        dueDate: date,
        amount: checkoutCharge,
        remark: dto.remark ?? "Move-out damage and unsettled charges"
      });
      await this.applyDirectDeduction(manager, actor, receivable, dto);
    }
    lease.status = "checkout_pending";
    lease.updateBy = actor.sub;
    await manager.getRepository(HousingLeaseEntity).save(lease);
    await this.createDeductionLedger(manager, scope, actor, lease.id, saved.id, receivable, dto);
    return saved;
  }

  private async applyDirectDeduction(
    manager: EntityManager,
    actor: JwtPrincipal,
    receivable: HousingReceivableEntity,
    dto: CompleteHousingHandoverDto
  ) {
    if (compareHousingMoney(dto.deposit_deduction_amount, "0.00") <= 0) return;
    const mutation = applyHousingReceivableMutation(
      receivable.amount,
      receivable.paidAmount,
      receivable.waivedAmount,
      "payment",
      dto.deposit_deduction_amount
    );
    receivable.paidAmount = mutation.paidAmount;
    receivable.waivedAmount = mutation.waivedAmount;
    receivable.status = mutation.status;
    receivable.updateBy = actor.sub;
    await manager.getRepository(HousingReceivableEntity).save(receivable);
  }

  private async createDeductionLedger(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    handoverId: string,
    receivable: HousingReceivableEntity | null,
    dto: CompleteHousingHandoverDto
  ) {
    if (compareHousingMoney(dto.deposit_deduction_amount, "0.00") <= 0) return;
    const repository = manager.getRepository(HousingLedgerEntryEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId,
      receivableId: receivable?.id ?? null,
      entryType: "deposit_deduction",
      chargeType: "checkout_deduction",
      amount: formatHousingMoney(dto.deposit_deduction_amount),
      paymentMethod: null,
      transactionReference: null,
      sourceType: "housing_handover",
      sourceId: handoverId,
      status: "confirmed",
      reason: dto.remark ?? "退租交割押金抵扣",
      occurredAt: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private applyHandover(
    handover: HousingHandoverEntity,
    lease: HousingLeaseEntity,
    actor: JwtPrincipal,
    dto: CompleteHousingHandoverDto,
    photoIds: string[],
    status: "draft" | "completed"
  ) {
    handover.status = status;
    handover.handoverAt = status === "completed" ? new Date() : null;
    handover.itemSnapshot = dto.item_snapshot ?? [];
    handover.meterReadings = dto.meter_readings ?? [];
    handover.credentials = dto.credentials ?? [];
    handover.photoFileIds = photoIds;
    handover.signatureFileId = dto.signature_file_id ?? null;
    handover.damageAmount = formatHousingMoney(dto.damage_amount);
    handover.unsettledAmount = formatHousingMoney(dto.unsettled_amount);
    handover.depositDeductionAmount = formatHousingMoney(dto.deposit_deduction_amount);
    handover.updateBy = actor.sub;
    handover.remark = dto.remark ?? null;
    if (status === "draft") {
      handover.approvalExecutionKey = null;
      handover.approvalEffectKind = null;
      handover.approvalEffectLineKey = null;
      handover.approvalEffectHash = null;
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

  private async businessDate(manager: EntityManager) {
    const [clock] = typeormQueryRows<{ businessDate: string }>(await manager.query(
      `SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Shanghai')::date::text AS "businessDate"`
    ));
    if (!clock?.businessDate) throw new ConflictException("Housing business date is unavailable");
    return clock.businessDate;
  }

  private depositContributors(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ) {
    return manager.query(
      `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
              status,receivable_id::text AS "receivableId",source_type AS "sourceType",
              source_id::text AS "sourceId"
         FROM biz_housing_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
          AND status='confirmed' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Promise<DepositContributor[]>;
  }

  private advisoryKey(scope: TenantParkScope, leaseId: string) {
    return ["housing-handover", scope.tenantId, scope.parkId, leaseId, "move_out"].join("|");
  }

  private snapshotHash(value: unknown) {
    return propertyApprovalCanonicalHash(value as never);
  }
}
