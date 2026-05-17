import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import { type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { LeasingContractActionLogEntity } from "../leasing-contract-changes/entities/leasing-contract-action-log.entity";
import { LeasingContractStatusLogEntity } from "../leasing-contracts/entities/leasing-contract-status-log.entity";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingContractUnitEntity } from "../leasing-contracts/entities/leasing-contract-unit.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { CheckoutSettlementDto } from "./dto/checkout-settlement.dto";
import type { CreateLeasingCheckoutDto } from "./dto/create-leasing-checkout.dto";
import type { CreateLeasingRefundDto } from "./dto/create-leasing-refund.dto";
import type { EffectiveLeasingCheckoutDto } from "./dto/effective-leasing-checkout.dto";
import type { LeasingCheckoutActionDto, RejectLeasingCheckoutDto } from "./dto/leasing-checkout-action.dto";
import type { LeasingCheckoutQueryDto } from "./dto/leasing-checkout-query.dto";
import type { LeasingRefundQueryDto } from "./dto/leasing-refund-query.dto";
import type { UpdateLeasingCheckoutDto } from "./dto/update-leasing-checkout.dto";
import { LeasingCheckoutEntity, type LeasingCheckoutApproveRecord } from "./entities/leasing-checkout.entity";
import { LeasingRefundEntity } from "./entities/leasing-refund.entity";

const CONTRACT_STATUS_EFFECTIVE = "75";
const CONTRACT_STATUS_TERMINATED = "90";
const CONTRACT_STATUS_VOID = "91";
const CHECKOUT_STATUS_DRAFT = "10";
const CHECKOUT_STATUS_APPROVING = "30";
const CHECKOUT_STATUS_WAIT_SETTLEMENT = "40";
const CHECKOUT_STATUS_REJECTED = "50";
const CHECKOUT_STATUS_SETTLING = "60";
const CHECKOUT_STATUS_EFFECTIVE = "70";
const SETTLEMENT_STATUS_WAITING = "10";
const SETTLEMENT_STATUS_CONFIRMED = "30";
const REFUND_STATUS_PAID = "30";
const RELEASE_UNIT_STATUS_RENTABLE = "rentable";
const RELEASE_UNIT_STATUS_MAINTENANCE = "maintenance";
const UNIT_STATUS_RENTABLE = 10;
const UNIT_STATUS_MAINTENANCE = 50;
const RECEIVABLE_STATUS_CANCELED = "95";
const INVOICE_STATUS_NONE = "10";
const UNFINISHED_CHECKOUT_STATUSES = [
  CHECKOUT_STATUS_DRAFT,
  CHECKOUT_STATUS_APPROVING,
  CHECKOUT_STATUS_WAIT_SETTLEMENT,
  CHECKOUT_STATUS_SETTLING
];
const SORT_COLUMNS = new Set([
  "checkoutCode",
  "checkoutType",
  "plannedCheckoutDate",
  "actualCheckoutDate",
  "settlementStatus",
  "status",
  "updateTime",
  "createTime"
]);
const REFUND_SORT_COLUMNS = new Set(["refundCode", "refundTime", "refundAmount", "status", "updateTime", "createTime"]);

export interface CheckoutSettlementPreview {
  contract_id: string;
  checkout_id: string;
  unpaid_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    fee_type: string;
    period_start: string;
    period_end: string;
    due_date: string;
    amount_due: string;
    amount_paid: string;
    amount_waived: string;
    amount_remain: string;
    late_fee: string;
  }>;
  summary: {
    unpaid_amount: string;
    late_fee_amount: string;
    deposit_amount: string;
    deduction_amount: string;
    additional_charge_amount: string;
    refund_amount: string;
    amount_due_from_tenant: string;
  };
}

export interface CheckoutEffectiveResult {
  checkout: LeasingCheckoutEntity;
  contract: LeasingContractEntity;
  released_units: Array<{
    unit_id: string;
    unit_code: string;
    before_status: number;
    after_status: number;
  }>;
  canceled_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    before_status: string;
    after_status: string;
    period_start: string;
    period_end: string;
    amount_remain: string;
  }>;
  skipped_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    reason: string;
  }>;
}

@Injectable()
export class LeasingCheckoutsService {
  constructor(
    @InjectRepository(LeasingCheckoutEntity)
    private readonly checkoutsRepository: Repository<LeasingCheckoutEntity>,
    @InjectRepository(LeasingRefundEntity)
    private readonly refundsRepository: Repository<LeasingRefundEntity>,
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(LeasingContractActionLogEntity)
    private readonly contractActionLogsRepository: Repository<LeasingContractActionLogEntity>,
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivablesRepository: Repository<LeasingReceivableEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingCheckoutQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingCheckoutEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items: await this.secureList(scope, actor, items), total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingCheckoutEntity> {
    return this.secureOne(scope, actor, await this.findOne(scope, id, actor));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, contractId: string, dto: CreateLeasingCheckoutDto): Promise<LeasingCheckoutEntity> {
    const contract = await this.findContract(scope, actor, contractId);
    this.assertContractCanCheckout(contract);
    await Promise.all([
      this.assertNoUnfinishedCheckout(scope, contract.id),
      this.assertDictValue(scope, "leasing_checkout_type", dto.checkout_type),
      this.assertDictValue(scope, "leasing_release_unit_status", dto.release_unit_status),
      this.assertDictValue(scope, "leasing_checkout_status", CHECKOUT_STATUS_DRAFT),
      this.assertDictValue(scope, "leasing_settlement_status", SETTLEMENT_STATUS_WAITING)
    ]);
    const checkoutCode = await this.resolveCheckoutCode(scope, actor.sub, dto.checkout_code);
    await this.assertCheckoutCodeAvailable(scope, checkoutCode);
    const entity = this.checkoutsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: checkoutCode,
      checkoutCode,
      contractId: contract.id,
      parkTenantId: contract.parkTenantId,
      checkoutType: dto.checkout_type,
      plannedCheckoutDate: this.dateOnly(dto.planned_checkout_date),
      actualCheckoutDate: dto.actual_checkout_date ? this.dateOnly(dto.actual_checkout_date) : null,
      reason: dto.reason.trim(),
      releaseUnitStatus: dto.release_unit_status,
      unpaidAmount: "0.00",
      lateFeeAmount: "0.00",
      depositAmount: this.decimal(this.toNumber(contract.depositAmount)),
      deductionAmount: "0.00",
      additionalChargeAmount: "0.00",
      refundAmount: "0.00",
      amountDueFromTenant: "0.00",
      settlementRemark: this.emptyToNull(dto.settlement_remark),
      settlementStatus: SETTLEMENT_STATUS_WAITING,
      status: CHECKOUT_STATUS_DRAFT,
      submitTime: null,
      approveTime: null,
      approveBy: null,
      rejectReason: null,
      approveRecords: [this.createApproveRecord(actor, "create", null, CHECKOUT_STATUS_DRAFT, dto.reason)],
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.checkoutsRepository.save(entity);
    await this.createActionLog(this.checkoutsRepository.manager, scope, actor, saved, null, CHECKOUT_STATUS_DRAFT, "create", `创建退租申请 ${checkoutCode}`);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingCheckoutDto): Promise<LeasingCheckoutEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHECKOUT_STATUS_DRAFT) {
      throw new BadRequestException("Only draft checkout can be edited");
    }
    if (dto.checkout_code && dto.checkout_code !== entity.checkoutCode) {
      await this.assertCheckoutCodeAvailable(scope, dto.checkout_code);
      entity.checkoutCode = dto.checkout_code;
      entity.code = dto.checkout_code;
    }
    if (dto.checkout_type) {
      await this.assertDictValue(scope, "leasing_checkout_type", dto.checkout_type);
      entity.checkoutType = dto.checkout_type;
    }
    if (dto.planned_checkout_date) entity.plannedCheckoutDate = this.dateOnly(dto.planned_checkout_date);
    if (dto.actual_checkout_date !== undefined) entity.actualCheckoutDate = dto.actual_checkout_date ? this.dateOnly(dto.actual_checkout_date) : null;
    if (dto.reason !== undefined) {
      if (!dto.reason.trim()) throw new BadRequestException("reason is required");
      entity.reason = dto.reason.trim();
    }
    if (dto.release_unit_status) {
      await this.assertDictValue(scope, "leasing_release_unit_status", dto.release_unit_status);
      entity.releaseUnitStatus = dto.release_unit_status;
    }
    if (dto.settlement_remark !== undefined) entity.settlementRemark = this.emptyToNull(dto.settlement_remark);
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    entity.approveRecords = [...(entity.approveRecords ?? []), this.createApproveRecord(actor, "update", CHECKOUT_STATUS_DRAFT, CHECKOUT_STATUS_DRAFT, "更新退租申请草稿")];
    await this.checkoutsRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (![CHECKOUT_STATUS_DRAFT, CHECKOUT_STATUS_REJECTED].includes(entity.status)) {
      throw new BadRequestException("Only draft or rejected checkout can be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    entity.approveRecords = [...(entity.approveRecords ?? []), this.createApproveRecord(actor, "delete", entity.status, entity.status, "删除退租申请")];
    await this.checkoutsRepository.save(entity);
    return { id };
  }

  async submit(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingCheckoutActionDto): Promise<LeasingCheckoutEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (![CHECKOUT_STATUS_DRAFT, CHECKOUT_STATUS_REJECTED].includes(entity.status)) {
      throw new BadRequestException("Only draft or rejected checkout can be submitted");
    }
    if (!entity.plannedCheckoutDate) throw new BadRequestException("planned_checkout_date is required");
    if (!entity.releaseUnitStatus) throw new BadRequestException("release_unit_status is required");
    await this.findContract(scope, actor, entity.contractId);
    return this.changeStatus(scope, actor, entity, CHECKOUT_STATUS_APPROVING, "submit", dto.opinion ?? "提交退租审批");
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingCheckoutActionDto): Promise<LeasingCheckoutEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHECKOUT_STATUS_APPROVING) {
      throw new BadRequestException("Only approving checkout can be approved");
    }
    return this.changeStatus(scope, actor, entity, CHECKOUT_STATUS_WAIT_SETTLEMENT, "approve", dto.opinion ?? "退租审批通过，进入待结算");
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RejectLeasingCheckoutDto): Promise<LeasingCheckoutEntity> {
    const rejectReason = dto.reject_reason?.trim();
    if (!rejectReason) throw new BadRequestException("reject_reason is required");
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHECKOUT_STATUS_APPROVING) {
      throw new BadRequestException("Only approving checkout can be rejected");
    }
    entity.rejectReason = rejectReason;
    return this.changeStatus(scope, actor, entity, CHECKOUT_STATUS_REJECTED, "reject", dto.opinion ?? rejectReason, rejectReason);
  }

  async previewSettlement(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CheckoutSettlementDto): Promise<CheckoutSettlementPreview> {
    const checkout = await this.findOne(scope, id, actor);
    this.assertCheckoutCanSettle(checkout);
    const preview = await this.buildSettlementPreview(scope, checkout, dto);
    await this.createActionLog(this.contractActionLogsRepository.manager, scope, actor, checkout, checkout.status, checkout.status, "preview_settlement", "退租结算预览");
    return this.secureSettlementPreview(scope, actor, preview);
  }

  async confirmSettlement(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CheckoutSettlementDto): Promise<LeasingCheckoutEntity> {
    let saved!: LeasingCheckoutEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      const checkout = await this.lockCheckout(manager, scope, id);
      this.assertCheckoutCanSettle(checkout);
      const preview = await this.buildSettlementPreview(scope, checkout, dto, manager);
      const beforeStatus = checkout.status;
      checkout.unpaidAmount = preview.summary.unpaid_amount;
      checkout.lateFeeAmount = preview.summary.late_fee_amount;
      checkout.depositAmount = preview.summary.deposit_amount;
      checkout.deductionAmount = preview.summary.deduction_amount;
      checkout.additionalChargeAmount = preview.summary.additional_charge_amount;
      checkout.refundAmount = preview.summary.refund_amount;
      checkout.amountDueFromTenant = preview.summary.amount_due_from_tenant;
      checkout.settlementRemark = this.emptyToNull(dto.settlement_remark) ?? checkout.settlementRemark;
      checkout.settlementStatus = SETTLEMENT_STATUS_CONFIRMED;
      checkout.status = CHECKOUT_STATUS_SETTLING;
      checkout.updateBy = actor.sub;
      saved = await manager.getRepository(LeasingCheckoutEntity).save(checkout);
      await this.createActionLog(manager, scope, actor, saved, beforeStatus, CHECKOUT_STATUS_SETTLING, "confirm_settlement", "退租结算已确认");
    });
    return this.detail(scope, saved.id, actor);
  }

  async createRefund(scope: TenantParkScope, actor: JwtPrincipal, checkoutId: string, dto: CreateLeasingRefundDto): Promise<LeasingRefundEntity> {
    const refundAmount = this.toNumber(dto.refund_amount);
    if (refundAmount <= 0) throw new BadRequestException("refund_amount must be greater than 0");
    await Promise.all([
      this.assertDictValue(scope, "leasing_refund_method", dto.refund_method),
      this.assertDictValue(scope, "leasing_refund_status", REFUND_STATUS_PAID)
    ]);
    if (dto.receipt_file_id) await this.mustFindFile(scope, dto.receipt_file_id);

    let saved!: LeasingRefundEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      const checkout = await this.lockCheckout(manager, scope, checkoutId);
      if (checkout.settlementStatus !== SETTLEMENT_STATUS_CONFIRMED || this.toNumber(checkout.refundAmount) <= 0) {
        throw new BadRequestException("Only settled checkout with refundable amount can register refund");
      }
      const alreadyRefunded = await this.sumRefundedAmount(scope, checkout.id, manager);
      const available = this.toNumber(checkout.refundAmount) - alreadyRefunded;
      if (refundAmount > available + 0.000001) {
        throw new BadRequestException("refund_amount exceeds available refundable amount");
      }
      const refundCode = await this.resolveRefundCode(scope, actor.sub, dto.refund_code);
      await this.assertRefundCodeAvailable(scope, refundCode, manager);
      const refund = manager.getRepository(LeasingRefundEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: refundCode,
        refundCode,
        checkoutId: checkout.id,
        contractId: checkout.contractId,
        parkTenantId: checkout.parkTenantId,
        refundAmount: this.decimal(refundAmount),
        refundMethod: dto.refund_method,
        refundTime: new Date(dto.refund_time),
        receiverName: this.emptyToNull(dto.receiver_name),
        receiverBankAccount: this.emptyToNull(dto.receiver_bank_account),
        bankSerial: this.emptyToNull(dto.bank_serial),
        receiptFileId: dto.receipt_file_id ?? null,
        status: REFUND_STATUS_PAID,
        remark: this.emptyToNull(dto.remark),
        createBy: actor.sub,
        updateBy: actor.sub
      });
      saved = await manager.getRepository(LeasingRefundEntity).save(refund);
      const nextRefunded = alreadyRefunded + refundAmount;
      if (nextRefunded + 0.000001 >= this.toNumber(checkout.refundAmount)) {
        checkout.settlementStatus = "40";
        checkout.updateBy = actor.sub;
        await manager.getRepository(LeasingCheckoutEntity).save(checkout);
      }
      await this.createActionLog(manager, scope, actor, checkout, checkout.status, checkout.status, "refund", `登记退款 ${refundCode}`, {
        bizType: "refund",
        bizId: saved.id,
        remark: `refund:${refundCode}`
      });
    });
    return this.refundDetail(scope, saved.id, actor);
  }

  async effective(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: EffectiveLeasingCheckoutDto): Promise<CheckoutEffectiveResult> {
    const actualCheckoutDate = this.dateOnly(dto.actual_checkout_date);
    if (!actualCheckoutDate) throw new BadRequestException("actual_checkout_date is required");
    let result!: CheckoutEffectiveResult;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      const checkout = await this.lockCheckout(manager, scope, id);
      if (checkout.status !== CHECKOUT_STATUS_SETTLING || ![SETTLEMENT_STATUS_CONFIRMED, "40"].includes(checkout.settlementStatus)) {
        throw new BadRequestException("Only settled checkout can become effective");
      }
      if (checkout.contract.status !== CONTRACT_STATUS_EFFECTIVE) {
        throw new BadRequestException("Only effective contract can be terminated by checkout");
      }
      const opTime = new Date();
      const reason = dto.opinion?.trim() || "退租生效，合同终止并释放房源";
      const releaseUnitStatus = this.resolveReleaseUnitRentalStatus(checkout.releaseUnitStatus);
      const contractBeforeStatus = checkout.contract.status;
      const checkoutBeforeStatus = checkout.status;

      const unitLinks = await manager.getRepository(LeasingContractUnitEntity)
        .createQueryBuilder("rel")
        .innerJoinAndSelect("rel.unit", "unit")
        .setLock("pessimistic_write")
        .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("rel.contract_id = :contractId", { contractId: checkout.contractId })
        .andWhere("rel.status = :status", { status: 1 })
        .andWhere("rel.is_deleted = false")
        .andWhere("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("unit.is_deleted = false")
        .getMany();
      if (unitLinks.length === 0) {
        throw new BadRequestException("Contract has no active unit links to release");
      }

      const futureReceivables = await manager.getRepository(LeasingReceivableEntity)
        .createQueryBuilder("receivable")
        .setLock("pessimistic_write")
        .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("receivable.contract_id = :contractId", { contractId: checkout.contractId })
        .andWhere("receivable.period_start > :actualCheckoutDate", { actualCheckoutDate })
        .andWhere("receivable.amount_remain > 0")
        .andWhere("receivable.status <> :canceledStatus", { canceledStatus: RECEIVABLE_STATUS_CANCELED })
        .andWhere("receivable.is_deleted = false")
        .orderBy("receivable.period_start", "ASC")
        .getMany();

      const releasedUnits: CheckoutEffectiveResult["released_units"] = [];
      const canceledReceivables: CheckoutEffectiveResult["canceled_receivables"] = [];
      const skippedReceivables: CheckoutEffectiveResult["skipped_receivables"] = [];

      checkout.actualCheckoutDate = actualCheckoutDate;
      checkout.status = CHECKOUT_STATUS_EFFECTIVE;
      checkout.updateBy = actor.sub;
      checkout.approveRecords = [
        ...(checkout.approveRecords ?? []),
        this.createApproveRecord(actor, "effective", checkoutBeforeStatus, CHECKOUT_STATUS_EFFECTIVE, reason)
      ];
      await manager.getRepository(LeasingCheckoutEntity).save(checkout);

      checkout.contract.status = CONTRACT_STATUS_TERMINATED;
      if (actualCheckoutDate >= checkout.contract.startDate && actualCheckoutDate < checkout.contract.endDate) {
        checkout.contract.endDate = actualCheckoutDate;
      }
      checkout.contract.updateBy = actor.sub;
      const savedContract = await manager.getRepository(LeasingContractEntity).save(checkout.contract);
      await manager.getRepository(LeasingContractStatusLogEntity).save(
        manager.getRepository(LeasingContractStatusLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          contractId: checkout.contractId,
          beforeStatus: contractBeforeStatus,
          afterStatus: CONTRACT_STATUS_TERMINATED,
          action: "terminate",
          reason,
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          opTime,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: `退租生效：${checkout.checkoutCode}`
        })
      );

      for (const link of unitLinks) {
        link.status = 0;
        link.updateBy = actor.sub;
        await manager.getRepository(LeasingContractUnitEntity).save(link);

        const beforeUnitStatus = link.unit.rentalStatus;
        link.unit.rentalStatus = releaseUnitStatus;
        link.unit.lockReason = null;
        link.unit.lockExpireTime = null;
        link.unit.statusUpdateTime = opTime;
        link.unit.statusUpdateBy = actor.sub;
        link.unit.updateBy = actor.sub;
        await manager.getRepository(UnitEntity).save(link.unit);
        await manager.getRepository(UnitStatusLogEntity).save(
          manager.getRepository(UnitStatusLogEntity).create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            unitId: link.unit.id,
            beforeStatus: beforeUnitStatus,
            afterStatus: releaseUnitStatus,
            reason,
            sourceType: "contract",
            operatorId: actor.sub,
            operatorName: this.actorName(actor),
            opTime,
            createBy: actor.sub,
            updateBy: actor.sub,
            remark: `退租生效：${checkout.checkoutCode}`
          })
        );
        releasedUnits.push({
          unit_id: link.unit.id,
          unit_code: link.unit.unitCode,
          before_status: beforeUnitStatus,
          after_status: releaseUnitStatus
        });
      }

      for (const receivable of futureReceivables) {
        const skipReason = this.futureReceivableSkipReason(receivable);
        if (skipReason) {
          skippedReceivables.push({
            receivable_id: receivable.id,
            ar_code: receivable.arCode,
            reason: skipReason
          });
          continue;
        }
        const beforeStatus = receivable.status;
        const previousRemain = receivable.amountRemain;
        receivable.status = RECEIVABLE_STATUS_CANCELED;
        receivable.amountRemain = "0.00";
        receivable.overdueDays = 0;
        receivable.updateBy = actor.sub;
        await manager.getRepository(LeasingReceivableEntity).save(receivable);
        await this.createReceivableStatusLog(manager, scope, actor, receivable, beforeStatus, RECEIVABLE_STATUS_CANCELED, "void", `退租生效取消未来应收：${checkout.checkoutCode}`);
        canceledReceivables.push({
          receivable_id: receivable.id,
          ar_code: receivable.arCode,
          before_status: beforeStatus,
          after_status: RECEIVABLE_STATUS_CANCELED,
          period_start: receivable.periodStart,
          period_end: receivable.periodEnd,
          amount_remain: previousRemain
        });
      }

      await this.createActionLog(manager, scope, actor, checkout, checkoutBeforeStatus, CHECKOUT_STATUS_EFFECTIVE, "effective", reason);
      result = {
        checkout,
        contract: savedContract,
        released_units: releasedUnits,
        canceled_receivables: canceledReceivables,
        skipped_receivables: skippedReceivables
      };
    });
    return {
      checkout: await this.secureOne(scope, actor, result.checkout),
      contract: await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", result.contract),
      released_units: result.released_units,
      canceled_receivables: result.canceled_receivables,
      skipped_receivables: result.skipped_receivables
    };
  }

  async listCheckoutRefunds(scope: TenantParkScope, actor: JwtPrincipal, checkoutId: string): Promise<LeasingRefundEntity[]> {
    await this.findOne(scope, checkoutId, actor);
    const rows = await this.refundsRepository
      .createQueryBuilder("refund")
      .leftJoinAndSelect("refund.checkout", "checkout")
      .leftJoinAndSelect("refund.contract", "contract")
      .leftJoinAndSelect("refund.parkTenant", "parkTenant")
      .where("refund.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("refund.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("refund.checkout_id = :checkoutId", { checkoutId })
      .andWhere("refund.is_deleted = false")
      .orderBy("refund.refundTime", "DESC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_refund", rows);
  }

  async listRefunds(scope: TenantParkScope, query: LeasingRefundQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingRefundEntity>> {
    const builder = this.refundScopedBuilder(scope);
    await this.applyRefundDataScope(builder, actor);
    this.applyRefundQuery(builder, query);
    this.applyRefundSort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return {
      items: await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_refund", items),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  async refundDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingRefundEntity> {
    const builder = this.refundScopedBuilder(scope).andWhere("refund.id = :id", { id });
    await this.applyRefundDataScope(builder, actor);
    const refund = await builder.getOne();
    if (!refund) throw new NotFoundException("Leasing refund not found");
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_refund", refund);
  }

  private async changeStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: LeasingCheckoutEntity,
    afterStatus: string,
    action: "submit" | "approve" | "reject",
    opinion?: string | null,
    rejectReason?: string | null
  ): Promise<LeasingCheckoutEntity> {
    const beforeStatus = entity.status;
    let saved!: LeasingCheckoutEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      entity.status = afterStatus;
      entity.updateBy = actor.sub;
      if (action === "submit") entity.submitTime = new Date();
      if (action === "approve") {
        entity.approveTime = new Date();
        entity.approveBy = actor.sub;
        entity.rejectReason = null;
        entity.settlementStatus = SETTLEMENT_STATUS_WAITING;
      }
      if (action === "reject") {
        entity.approveTime = new Date();
        entity.approveBy = actor.sub;
        entity.rejectReason = rejectReason ?? opinion ?? null;
      }
      entity.approveRecords = [
        ...(entity.approveRecords ?? []),
        this.createApproveRecord(actor, action, beforeStatus, afterStatus, opinion, rejectReason)
      ];
      saved = await manager.getRepository(LeasingCheckoutEntity).save(entity);
      await this.createActionLog(manager, scope, actor, saved, beforeStatus, afterStatus, action, opinion ?? rejectReason ?? null);
    });
    return this.detail(scope, saved.id, actor);
  }

  private async buildSettlementPreview(
    scope: TenantParkScope,
    checkout: LeasingCheckoutEntity,
    dto: CheckoutSettlementDto,
    manager?: EntityManager
  ): Promise<CheckoutSettlementPreview> {
    const repository = manager?.getRepository(LeasingReceivableEntity) ?? this.receivablesRepository;
    const cutoffDate = checkout.actualCheckoutDate ?? checkout.plannedCheckoutDate;
    const query = repository
      .createQueryBuilder("receivable")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.contract_id = :contractId", { contractId: checkout.contractId })
      .andWhere("receivable.period_start <= :cutoffDate", { cutoffDate })
      .andWhere("receivable.amount_remain > 0")
      .andWhere("receivable.is_deleted = false")
      .orderBy("receivable.period_start", "ASC");
    if (manager) query.setLock("pessimistic_write");
    const receivables = await query.getMany();
    const unpaidReceivables = receivables.map((receivable) => ({
      receivable_id: receivable.id,
      ar_code: receivable.arCode,
      fee_type: receivable.feeType,
      period_start: receivable.periodStart,
      period_end: receivable.periodEnd,
      due_date: receivable.dueDate,
      amount_due: receivable.amountDue,
      amount_paid: receivable.amountPaid,
      amount_waived: receivable.amountWaived,
      amount_remain: receivable.amountRemain,
      late_fee: receivable.lateFee
    }));
    const lateFeeAmount = receivables.reduce((sum, receivable) => sum + this.toNumber(receivable.lateFee), 0);
    const unpaidAmount = receivables.reduce((sum, receivable) => {
      return sum + Math.max(0, this.toNumber(receivable.amountRemain) - this.toNumber(receivable.lateFee));
    }, 0);
    const depositAmount = this.toNumber(checkout.contract?.depositAmount ?? checkout.depositAmount);
    const deductionAmount = this.assertNonNegative(dto.deduction_amount ?? checkout.deductionAmount, "deduction_amount");
    const additionalChargeAmount = this.assertNonNegative(dto.additional_charge_amount ?? checkout.additionalChargeAmount, "additional_charge_amount");
    const tenantPayable = unpaidAmount + lateFeeAmount + deductionAmount + additionalChargeAmount;
    const refundAmount = Math.max(depositAmount - tenantPayable, 0);
    const amountDueFromTenant = Math.max(tenantPayable - depositAmount, 0);
    return {
      contract_id: checkout.contractId,
      checkout_id: checkout.id,
      unpaid_receivables: unpaidReceivables,
      summary: {
        unpaid_amount: this.decimal(unpaidAmount),
        late_fee_amount: this.decimal(lateFeeAmount),
        deposit_amount: this.decimal(depositAmount),
        deduction_amount: this.decimal(deductionAmount),
        additional_charge_amount: this.decimal(additionalChargeAmount),
        refund_amount: this.decimal(refundAmount),
        amount_due_from_tenant: this.decimal(amountDueFromTenant)
      }
    };
  }

  private async secureSettlementPreview(scope: TenantParkScope, actor: JwtPrincipal | undefined, preview: CheckoutSettlementPreview): Promise<CheckoutSettlementPreview> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return preview;
    const policies = (await this.fieldPolicyService.getUserFieldPolicies(scope, actor))
      .filter((policy) => policy.module === "leasing" && ["leasing_checkout", "leasing_receivable"].includes(policy.entity));
    const cloned = JSON.parse(JSON.stringify(preview)) as CheckoutSettlementPreview;
    for (const policy of policies) {
      if (!["hidden", "masked"].includes(policy.policy_type)) continue;
      this.applyNestedFieldPolicy(cloned, policy.field_key, policy.policy_type, policy.mask_rule);
    }
    return cloned;
  }

  private applyNestedFieldPolicy(target: unknown, fieldKey: string, policyType: string, maskRule?: string | null): void {
    if (Array.isArray(target)) {
      target.forEach((item) => this.applyNestedFieldPolicy(item, fieldKey, policyType, maskRule));
      return;
    }
    if (!target || typeof target !== "object") return;
    const record = target as Record<string, unknown>;
    const candidates = this.fieldKeyCandidates(fieldKey);
    for (const key of candidates) {
      if (key in record) record[key] = policyType === "hidden" ? null : this.fieldPolicyService.maskValue(record[key], maskRule);
    }
    Object.values(record).forEach((value) => this.applyNestedFieldPolicy(value, fieldKey, policyType, maskRule));
  }

  private fieldKeyCandidates(fieldKey: string): string[] {
    const normalized = fieldKey.trim();
    const leaf = normalized.split(".").filter(Boolean).at(-1) ?? normalized;
    return [...new Set([normalized, this.toCamelCase(normalized), leaf, this.toCamelCase(leaf), this.toSnakeCase(leaf)])];
  }

  private assertCheckoutCanSettle(checkout: LeasingCheckoutEntity): void {
    if (checkout.status !== CHECKOUT_STATUS_WAIT_SETTLEMENT) {
      throw new BadRequestException("Only approved checkout waiting settlement can be settled");
    }
  }

  private resolveReleaseUnitRentalStatus(releaseUnitStatus: string): number {
    if (releaseUnitStatus === RELEASE_UNIT_STATUS_RENTABLE) return UNIT_STATUS_RENTABLE;
    if (releaseUnitStatus === RELEASE_UNIT_STATUS_MAINTENANCE) return UNIT_STATUS_MAINTENANCE;
    throw new BadRequestException("release_unit_status is not supported for checkout effective");
  }

  private futureReceivableSkipReason(receivable: LeasingReceivableEntity): string | null {
    if (this.toNumber(receivable.amountPaid) > 0) return "已收款，不自动取消";
    if (this.toNumber(receivable.amountWaived) > 0) return "已豁免，不自动取消";
    if (receivable.invoiceStatus !== INVOICE_STATUS_NONE) return "已开票或部分开票，不自动取消";
    return null;
  }

  private async createReceivableStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivable: LeasingReceivableEntity,
    beforeStatus: string | null,
    afterStatus: string,
    action: LeasingReceivableStatusLogEntity["action"],
    reason: string
  ): Promise<void> {
    const repository = manager.getRepository(LeasingReceivableStatusLogEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      receivableId: receivable.id,
      beforeStatus,
      afterStatus,
      action,
      reason,
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async lockCheckout(manager: EntityManager, scope: TenantParkScope, id: string): Promise<LeasingCheckoutEntity> {
    const checkout = await manager.getRepository(LeasingCheckoutEntity)
      .createQueryBuilder("checkout")
      .innerJoinAndSelect("checkout.contract", "contract")
      .setLock("pessimistic_write")
      .where("checkout.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("checkout.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("checkout.id = :id", { id })
      .andWhere("checkout.is_deleted = false")
      .getOne();
    if (!checkout) throw new NotFoundException("Leasing checkout not found");
    return checkout;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingCheckoutEntity> {
    return this.checkoutsRepository
      .createQueryBuilder("checkout")
      .leftJoinAndSelect("checkout.contract", "contract")
      .leftJoinAndSelect("checkout.parkTenant", "parkTenant")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("checkout.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("checkout.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("checkout.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingCheckoutEntity> {
    const builder = this.scopedBuilder(scope).andWhere("checkout.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Leasing checkout not found");
    return entity;
  }

  private async findContract(scope: TenantParkScope, actor: JwtPrincipal, contractId: string): Promise<LeasingContractEntity> {
    const builder = this.contractsRepository
      .createQueryBuilder("contract")
      .leftJoinAndSelect("contract.parkTenant", "parkTenant")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contract.id = :contractId", { contractId })
      .andWhere("contract.is_deleted = false");
    await this.applyContractDataScope(builder, actor);
    const contract = await builder.getOne();
    if (!contract) throw new NotFoundException("Leasing contract not found");
    return contract;
  }

  private assertContractCanCheckout(contract: LeasingContractEntity): void {
    if ([CONTRACT_STATUS_TERMINATED, CONTRACT_STATUS_VOID].includes(contract.status)) {
      throw new BadRequestException("Terminated or void contracts cannot start checkout");
    }
    if (contract.status !== CONTRACT_STATUS_EFFECTIVE) {
      throw new BadRequestException("Only effective contracts can start checkout");
    }
  }

  private async assertNoUnfinishedCheckout(scope: TenantParkScope, contractId: string): Promise<void> {
    const exists = await this.checkoutsRepository
      .createQueryBuilder("checkout")
      .where("checkout.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("checkout.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("checkout.contract_id = :contractId", { contractId })
      .andWhere("checkout.status IN (:...statuses)", { statuses: UNFINISHED_CHECKOUT_STATUSES })
      .andWhere("checkout.is_deleted = false")
      .getExists();
    if (exists) throw new ConflictException("An unfinished checkout already exists for this contract");
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingCheckoutEntity>, query: LeasingCheckoutQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("checkout.checkout_code ILIKE :keyword")
          .orWhere("checkout.reason ILIKE :keyword")
          .orWhere("contract.contract_code ILIKE :keyword")
          .orWhere("contract.contract_name ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.contract_id) builder.andWhere("checkout.contract_id = :contractId", { contractId: query.contract_id });
    if (query.park_tenant_id) builder.andWhere("checkout.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.checkout_type) builder.andWhere("checkout.checkout_type = :checkoutType", { checkoutType: query.checkout_type });
    if (query.settlement_status) builder.andWhere("checkout.settlement_status = :settlementStatus", { settlementStatus: query.settlement_status });
    if (query.status) builder.andWhere("checkout.status = :status", { status: query.status });
    if (query.planned_start) builder.andWhere("checkout.planned_checkout_date >= :plannedStart", { plannedStart: query.planned_start });
    if (query.planned_end) builder.andWhere("checkout.planned_checkout_date <= :plannedEnd", { plannedEnd: query.planned_end });
  }

  private applySort(builder: SelectQueryBuilder<LeasingCheckoutEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("checkout.updateTime", "DESC").addOrderBy("checkout.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("checkout.updateTime", "DESC").addOrderBy("checkout.createTime", "DESC");
      return;
    }
    builder.orderBy(`checkout.${field}`, direction);
  }

  private refundScopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingRefundEntity> {
    return this.refundsRepository
      .createQueryBuilder("refund")
      .leftJoinAndSelect("refund.checkout", "checkout")
      .leftJoinAndSelect("refund.contract", "contract")
      .leftJoinAndSelect("refund.parkTenant", "parkTenant")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("refund.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("refund.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("refund.is_deleted = false");
  }

  private applyRefundQuery(builder: SelectQueryBuilder<LeasingRefundEntity>, query: LeasingRefundQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("refund.refund_code ILIKE :keyword")
          .orWhere("refund.receiver_name ILIKE :keyword")
          .orWhere("refund.bank_serial ILIKE :keyword")
          .orWhere("checkout.checkout_code ILIKE :keyword")
          .orWhere("contract.contract_code ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.checkout_id) builder.andWhere("refund.checkout_id = :checkoutId", { checkoutId: query.checkout_id });
    if (query.contract_id) builder.andWhere("refund.contract_id = :contractId", { contractId: query.contract_id });
    if (query.park_tenant_id) builder.andWhere("refund.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.status) builder.andWhere("refund.status = :status", { status: query.status });
    if (query.refund_start) builder.andWhere("refund.refund_time >= :refundStart", { refundStart: `${query.refund_start}T00:00:00.000Z` });
    if (query.refund_end) builder.andWhere("refund.refund_time <= :refundEnd", { refundEnd: `${query.refund_end}T23:59:59.999Z` });
  }

  private applyRefundSort(builder: SelectQueryBuilder<LeasingRefundEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("refund.refundTime", "DESC").addOrderBy("refund.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!REFUND_SORT_COLUMNS.has(field)) {
      builder.orderBy("refund.refundTime", "DESC").addOrderBy("refund.createTime", "DESC");
      return;
    }
    builder.orderBy(`refund.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingCheckoutEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "checkout", "park_id", parkFilter, "checkoutParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "checkout", "park_tenant_id", tenantCompanyFilter, "checkoutParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "checkout");
  }

  private async applyContractDataScope(builder: SelectQueryBuilder<LeasingContractEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_id", parkFilter, "contractParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_tenant_id", tenantCompanyFilter, "contractParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "contract");
  }

  private async applyRefundDataScope(builder: SelectQueryBuilder<LeasingRefundEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "refund", "park_id", parkFilter, "refundParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "refund", "park_tenant_id", tenantCompanyFilter, "refundParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "refund");
  }

  private applyConfiguredIdScopeFilter<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    alias: string,
    column: string,
    filter: DataScopeFilter,
    parameterName: string
  ): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(`${alias}.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
      return;
    }
    if (filter.scope_types.includes("custom")) builder.andWhere("1 = 0");
  }

  private applyOwnerDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter,
    alias: string
  ): void {
    if (contractOwnerFilter.unrestricted) return;
    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: `${alias}.create_by IN (:...${alias}OwnerScopeIds)`, params: { [`${alias}OwnerScopeIds`]: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "contract.create_by IN (:...contractOwnerScopeIds)", params: { contractOwnerScopeIds: contractOwnerFilter.allowed_ids } });
    }
    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: "sourceLead.id IS NOT NULL" });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "sourceLead.follow_user_id IN (:...customerOwnerScopeIds)", params: { customerOwnerScopeIds: customerOwnerFilter.allowed_ids } });
    }
    if (clauses.length === 0) {
      builder.andWhere("1 = 0");
      return;
    }
    builder.andWhere(new Brackets((qb) => {
      clauses.forEach((clause, index) => {
        if (index === 0) qb.where(clause.sql, clause.params);
        else qb.orWhere(clause.sql, clause.params);
      });
    }));
  }

  private async secureList(scope: TenantParkScope, actor: JwtPrincipal | undefined, items: LeasingCheckoutEntity[]): Promise<LeasingCheckoutEntity[]> {
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_checkout", items);
  }

  private async secureOne(scope: TenantParkScope, actor: JwtPrincipal | undefined, item: LeasingCheckoutEntity): Promise<LeasingCheckoutEntity> {
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_checkout", item);
  }

  private async createActionLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: LeasingCheckoutEntity,
    beforeStatus: string | null,
    afterStatus: string | null,
    action: LeasingContractActionLogEntity["action"],
    reason?: string | null,
    options?: {
      bizType?: LeasingContractActionLogEntity["bizType"];
      bizId?: string | null;
      remark?: string | null;
    }
  ): Promise<void> {
    const log = manager.getRepository(LeasingContractActionLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      contractId: entity.contractId,
      bizType: options?.bizType ?? "checkout",
      bizId: options?.bizId ?? entity.id,
      changeId: null,
      beforeStatus,
      afterStatus,
      action,
      reason: this.emptyToNull(reason ?? undefined),
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: options?.remark ?? `checkout:${entity.checkoutCode}`
    });
    await manager.getRepository(LeasingContractActionLogEntity).save(log);
  }

  private createApproveRecord(
    actor: JwtPrincipal,
    action: LeasingCheckoutApproveRecord["action"],
    fromStatus: string | null,
    toStatus: string,
    opinion?: string | null,
    rejectReason?: string | null
  ): LeasingCheckoutApproveRecord {
    return {
      action,
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: new Date().toISOString(),
      fromStatus,
      toStatus,
      opinion: opinion ?? null,
      rejectReason: rejectReason ?? null
    };
  }

  private async resolveCheckoutCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    return (await this.codeRulesService.generateCode("checkout", scope.tenantId, scope.parkId, actorId)).code;
  }

  private async assertCheckoutCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.checkoutsRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, checkoutCode: code, isDeleted: false }
    });
    if (exists) throw new ConflictException("checkout_code already exists");
  }

  private async resolveRefundCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    return (await this.codeRulesService.generateCode("refund", scope.tenantId, scope.parkId, actorId)).code;
  }

  private async assertRefundCodeAvailable(scope: TenantParkScope, code: string, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(LeasingRefundEntity) ?? this.refundsRepository;
    const exists = await repository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, refundCode: code, isDeleted: false }
    });
    if (exists) throw new ConflictException("refund_code already exists");
  }

  private async sumRefundedAmount(scope: TenantParkScope, checkoutId: string, manager?: EntityManager): Promise<number> {
    const repository = manager?.getRepository(LeasingRefundEntity) ?? this.refundsRepository;
    const raw = await repository
      .createQueryBuilder("refund")
      .select("COALESCE(SUM(refund.refund_amount), 0)", "total")
      .where("refund.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("refund.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("refund.checkout_id = :checkoutId", { checkoutId })
      .andWhere("refund.is_deleted = false")
      .getRawOne<{ total: string }>();
    return this.toNumber(raw?.total);
  }

  private async mustFindFile(scope: TenantParkScope, fileId: string): Promise<FileEntity> {
    const file = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id = :fileId", { fileId })
      .andWhere("file.is_deleted = false")
      .andWhere("file.status = :status", { status: 1 })
      .getOne();
    if (!file) throw new BadRequestException("receipt_file_id is not a valid file");
    return file;
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, rawValue?: string): Promise<void> {
    const value = rawValue?.trim();
    if (!value) return;
    const exists = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.item_value = :value", { value })
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .getExists();
    if (!exists) throw new BadRequestException(`${dictCode} value is not enabled`);
  }

  private dateOnly(value: string): string {
    return value.slice(0, 10);
  }

  private assertNonNegative(value: unknown, field: string): number {
    const numberValue = this.toNumber(value);
    if (numberValue < 0) throw new BadRequestException(`${field} must be greater than or equal to 0`);
    return numberValue;
  }

  private decimal(value: number): string {
    return Number(value).toFixed(2);
  }

  private toNumber(value: unknown): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private toCamelCase(value: string): string {
    return value.replace(/[_-]([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase());
  }

  private toSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private emptyToNull(value?: string): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }
}
