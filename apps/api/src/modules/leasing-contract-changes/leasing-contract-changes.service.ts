import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import { type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import type { LeasingContractChangeActionDto, RejectLeasingContractChangeDto } from "./dto/leasing-contract-change-action.dto";
import type { CreateLeasingContractChangeDto } from "./dto/create-leasing-contract-change.dto";
import type { LeasingContractChangeQueryDto } from "./dto/leasing-contract-change-query.dto";
import type { UpdateLeasingContractChangeDto } from "./dto/update-leasing-contract-change.dto";
import { LeasingContractActionLogEntity } from "./entities/leasing-contract-action-log.entity";
import { LeasingContractChangeEntity, type LeasingContractChangeApproveRecord } from "./entities/leasing-contract-change.entity";

const CONTRACT_STATUS_SIGNED = "70";
const CONTRACT_STATUS_EFFECTIVE = "75";
const CONTRACT_STATUS_TERMINATED = "90";
const CONTRACT_STATUS_VOID = "91";
const CHANGE_STATUS_DRAFT = "10";
const CHANGE_STATUS_APPROVING = "30";
const CHANGE_STATUS_APPROVED = "40";
const CHANGE_STATUS_REJECTED = "50";
const CHANGE_STATUS_EFFECTIVE = "60";
const DEFAULT_RECEIVABLE_POLICY = "manual_review";
const RECEIVABLE_STATUS_GENERATED = "20";
const RECEIVABLE_STATUS_PARTIAL_PAID = "40";
const RECEIVABLE_STATUS_SETTLED = "50";
const RECEIVABLE_STATUS_OVERDUE = "60";
const RECEIVABLE_STATUS_OVERDUE_PARTIAL = "70";
const RECEIVABLE_STATUS_WAIVED = "80";
const RECEIVABLE_STATUS_REFUNDED = "90";
const INVOICE_STATUS_NOT_INVOICED = "10";
const RENT_FEE_TYPE = "10";
const DEPOSIT_FEE_TYPE = "20";
const PROPERTY_FEE_TYPE = "30";
const SORT_COLUMNS = new Set(["changeCode", "changeType", "effectiveDate", "status", "updateTime", "createTime"]);
const SNAPSHOT_KEYS = [
  "contract_id",
  "contract_code",
  "contract_name",
  "start_date",
  "end_date",
  "rent_unit_price",
  "total_area",
  "rent_per_month",
  "total_amount",
  "deposit_months",
  "deposit_amount",
  "free_rent_months",
  "payment_period",
  "payment_advance_days",
  "property_fee_unit_price",
  "late_fee_rule",
  "other_fee_rules",
  "remark"
] as const;
const EDITABLE_SNAPSHOT_KEYS = new Set([
  "start_date",
  "end_date",
  "rent_unit_price",
  "rent_per_month",
  "deposit_months",
  "deposit_amount",
  "payment_period",
  "property_fee_unit_price",
  "remark"
]);
const MONEY_KEYS = new Set(["rent_unit_price", "rent_per_month", "total_amount", "deposit_amount", "property_fee_unit_price"]);
const NON_NEGATIVE_NUMBER_KEYS = new Set([
  "rent_unit_price",
  "total_area",
  "rent_per_month",
  "total_amount",
  "deposit_months",
  "deposit_amount",
  "free_rent_months",
  "payment_advance_days",
  "property_fee_unit_price"
]);

export interface ReceivableImpactRow {
  receivable_id: string;
  ar_code: string;
  fee_type: string;
  period_start: string;
  period_end: string;
  old_amount_due: string;
  new_amount_due: string;
  diff_amount: string;
  can_adjust: boolean;
  reason: string;
}

export interface BlockedReceivableImpactRow {
  receivable_id: string;
  ar_code: string;
  reason: string;
}

export interface FinanceImpactPreview {
  contract_id: string;
  change_id: string;
  affected_receivables: ReceivableImpactRow[];
  blocked_receivables: BlockedReceivableImpactRow[];
  summary: {
    increase_amount: string;
    decrease_amount: string;
    blocked_count: number;
  };
}

@Injectable()
export class LeasingContractChangesService {
  constructor(
    @InjectRepository(LeasingContractChangeEntity)
    private readonly changesRepository: Repository<LeasingContractChangeEntity>,
    @InjectRepository(LeasingContractActionLogEntity)
    private readonly contractActionLogsRepository: Repository<LeasingContractActionLogEntity>,
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivablesRepository: Repository<LeasingReceivableEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingContractChangeQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingContractChangeEntity>> {
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

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingContractChangeEntity> {
    return this.secureOne(scope, actor, await this.findOne(scope, id, actor));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, contractId: string, dto: CreateLeasingContractChangeDto): Promise<LeasingContractChangeEntity> {
    const contract = await this.findContract(scope, actor, contractId);
    this.assertContractCanChange(contract);
    const effectiveDate = this.dateOnly(dto.effective_date);
    this.assertEffectiveDate(contract, effectiveDate);
    await Promise.all([
      this.assertDictValue(scope, "leasing_contract_change_type", dto.change_type),
      this.assertDictValue(scope, "leasing_receivable_adjust_policy", dto.receivable_policy ?? DEFAULT_RECEIVABLE_POLICY),
      this.assertDictValue(scope, "leasing_contract_change_status", CHANGE_STATUS_DRAFT)
    ]);
    const beforeSnapshot = this.snapshotContract(contract);
    const afterSnapshot = await this.resolveAfterSnapshot(scope, beforeSnapshot, dto.after_snapshot);
    const changeCode = await this.resolveChangeCode(scope, actor.sub, dto.change_code);
    await this.assertChangeCodeAvailable(scope, changeCode);
    const entity = this.changesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: changeCode,
      changeCode,
      contractId: contract.id,
      parkTenantId: contract.parkTenantId,
      changeType: dto.change_type,
      changeReason: dto.change_reason.trim(),
      effectiveDate,
      beforeSnapshot,
      afterSnapshot,
      financeImpact: this.buildFinanceImpact(beforeSnapshot, afterSnapshot, dto.receivable_policy ?? DEFAULT_RECEIVABLE_POLICY),
      receivablePolicy: dto.receivable_policy ?? DEFAULT_RECEIVABLE_POLICY,
      status: CHANGE_STATUS_DRAFT,
      submitTime: null,
      approveTime: null,
      approveBy: null,
      rejectReason: null,
      approveRecords: [this.createApproveRecord(actor, "create", null, CHANGE_STATUS_DRAFT, "创建合同变更草稿")],
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    let saved!: LeasingContractChangeEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingContractChangeEntity).save(entity);
      await this.createActionLog(manager, scope, actor, saved, null, CHANGE_STATUS_DRAFT, "create", "创建合同变更草稿");
    });
    return this.secureOne(scope, actor, await this.findOne(scope, saved.id, actor));
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingContractChangeDto): Promise<LeasingContractChangeEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHANGE_STATUS_DRAFT) {
      throw new BadRequestException("Only draft contract change can be edited");
    }
    if (dto.change_code && dto.change_code !== entity.changeCode) {
      await this.assertChangeCodeAvailable(scope, dto.change_code);
      entity.changeCode = dto.change_code;
      entity.code = dto.change_code;
    }
    if (dto.change_type) {
      await this.assertDictValue(scope, "leasing_contract_change_type", dto.change_type);
      entity.changeType = dto.change_type;
    }
    if (dto.change_reason !== undefined) {
      if (!dto.change_reason.trim()) throw new BadRequestException("change_reason is required");
      entity.changeReason = dto.change_reason.trim();
    }
    if (dto.effective_date) {
      const contract = entity.contract ?? (await this.findContract(scope, actor, entity.contractId));
      const effectiveDate = this.dateOnly(dto.effective_date);
      this.assertEffectiveDate(contract, effectiveDate);
      entity.effectiveDate = effectiveDate;
    }
    if (dto.receivable_policy) {
      await this.assertDictValue(scope, "leasing_receivable_adjust_policy", dto.receivable_policy);
      entity.receivablePolicy = dto.receivable_policy;
    }
    if (dto.after_snapshot) {
      entity.afterSnapshot = await this.resolveAfterSnapshot(scope, entity.beforeSnapshot, dto.after_snapshot);
    }
    entity.financeImpact = this.buildFinanceImpact(entity.beforeSnapshot, entity.afterSnapshot, entity.receivablePolicy);
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    entity.approveRecords = [...(entity.approveRecords ?? []), this.createApproveRecord(actor, "update", CHANGE_STATUS_DRAFT, CHANGE_STATUS_DRAFT, "更新合同变更草稿")];
    await this.changesRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (![CHANGE_STATUS_DRAFT, CHANGE_STATUS_REJECTED].includes(entity.status)) {
      throw new BadRequestException("Only draft or rejected contract change can be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.changesRepository.save(entity);
    return { id };
  }

  async previewFinanceImpact(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<FinanceImpactPreview> {
    const entity = await this.findOne(scope, id, actor);
    let preview!: FinanceImpactPreview;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      preview = await this.buildReceivableFinanceImpact(scope, entity, manager);
      entity.financeImpact = preview as unknown as Record<string, unknown>;
      entity.updateBy = actor.sub;
      await manager.getRepository(LeasingContractChangeEntity).save(entity);
      await this.createActionLog(manager, scope, actor, entity, entity.status, entity.status, "preview_finance", "合同变更财务影响预览");
    });
    const secured = await this.secureFinanceImpact(scope, actor, preview);
    return secured as unknown as FinanceImpactPreview;
  }

  async submitForApproval(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractChangeActionDto): Promise<LeasingContractChangeEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (![CHANGE_STATUS_DRAFT, CHANGE_STATUS_REJECTED].includes(entity.status)) {
      throw new BadRequestException("Only draft or rejected contract changes can be submitted");
    }
    await this.buildAndStoreFinanceImpact(scope, actor, entity);
    return this.changeStatus(scope, actor, entity, CHANGE_STATUS_APPROVING, "submit", dto.opinion ?? "提交合同变更审批");
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractChangeActionDto): Promise<LeasingContractChangeEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHANGE_STATUS_APPROVING) {
      throw new BadRequestException("Only approving contract changes can be approved");
    }
    return this.changeStatus(scope, actor, entity, CHANGE_STATUS_APPROVED, "approve", dto.opinion ?? "审批通过");
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RejectLeasingContractChangeDto): Promise<LeasingContractChangeEntity> {
    const rejectReason = dto.reject_reason?.trim();
    if (!rejectReason) throw new BadRequestException("reject_reason is required");
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHANGE_STATUS_APPROVING) {
      throw new BadRequestException("Only approving contract changes can be rejected");
    }
    entity.rejectReason = rejectReason;
    return this.changeStatus(scope, actor, entity, CHANGE_STATUS_REJECTED, "reject", dto.opinion ?? rejectReason, rejectReason);
  }

  async effective(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractChangeActionDto): Promise<LeasingContractChangeEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== CHANGE_STATUS_APPROVED) {
      throw new BadRequestException("Only approved contract changes can be effective");
    }

    let savedChange!: LeasingContractChangeEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      const changeRepo = manager.getRepository(LeasingContractChangeEntity);
      const contractRepo = manager.getRepository(LeasingContractEntity);
      const change = await changeRepo
        .createQueryBuilder("change")
        .leftJoinAndSelect("change.contract", "contract")
        .where("change.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("change.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("change.id = :id", { id })
        .andWhere("change.is_deleted = false")
        .setLock("pessimistic_write")
        .getOne();
      if (!change) throw new NotFoundException("Leasing contract change not found");
      if (change.status !== CHANGE_STATUS_APPROVED) {
        throw new BadRequestException("Only approved contract changes can be effective");
      }
      const contract = await contractRepo
        .createQueryBuilder("contract")
        .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contract.id = :contractId", { contractId: change.contractId })
        .andWhere("contract.is_deleted = false")
        .setLock("pessimistic_write")
        .getOne();
      if (!contract) throw new NotFoundException("Leasing contract not found");
      this.assertContractCanChange(contract);

      const preview = await this.buildReceivableFinanceImpact(scope, change, manager);
      change.financeImpact = preview as unknown as Record<string, unknown>;
      this.applyAfterSnapshotToContract(contract, change.afterSnapshot, actor);
      await contractRepo.save(contract);

      if (change.receivablePolicy === "adjust_future") {
        await this.applyFutureReceivableAdjustments(scope, actor, change, preview, manager);
      }

      const beforeStatus = change.status;
      change.status = CHANGE_STATUS_EFFECTIVE;
      change.approveTime = new Date();
      change.approveBy = actor.sub;
      change.updateBy = actor.sub;
      change.approveRecords = [
        ...(change.approveRecords ?? []),
        this.createApproveRecord(actor, "effective", beforeStatus, CHANGE_STATUS_EFFECTIVE, dto.opinion ?? "合同变更已生效")
      ];
      savedChange = await changeRepo.save(change);
      await this.createActionLog(manager, scope, actor, savedChange, beforeStatus, CHANGE_STATUS_EFFECTIVE, "effective", dto.opinion ?? "合同变更已生效");
    });

    return this.detail(scope, savedChange.id, actor);
  }

  private async buildAndStoreFinanceImpact(scope: TenantParkScope, actor: JwtPrincipal, entity: LeasingContractChangeEntity): Promise<FinanceImpactPreview> {
    const preview = await this.buildReceivableFinanceImpact(scope, entity);
    entity.financeImpact = preview as unknown as Record<string, unknown>;
    entity.updateBy = actor.sub;
    await this.changesRepository.save(entity);
    return preview;
  }

  private async changeStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: LeasingContractChangeEntity,
    afterStatus: string,
    action: "submit" | "approve" | "reject",
    opinion?: string | null,
    rejectReason?: string | null
  ): Promise<LeasingContractChangeEntity> {
    const beforeStatus = entity.status;
    let saved!: LeasingContractChangeEntity;
    await this.contractActionLogsRepository.manager.transaction(async (manager) => {
      entity.status = afterStatus;
      entity.updateBy = actor.sub;
      if (action === "submit") entity.submitTime = new Date();
      if (action === "approve") {
        entity.approveTime = new Date();
        entity.approveBy = actor.sub;
        entity.rejectReason = null;
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
      saved = await manager.getRepository(LeasingContractChangeEntity).save(entity);
      await this.createActionLog(manager, scope, actor, saved, beforeStatus, afterStatus, action, opinion ?? rejectReason ?? null);
    });
    return this.detail(scope, saved.id, actor);
  }

  private async buildReceivableFinanceImpact(
    scope: TenantParkScope,
    entity: LeasingContractChangeEntity,
    manager?: EntityManager
  ): Promise<FinanceImpactPreview> {
    const repository = manager?.getRepository(LeasingReceivableEntity) ?? this.receivablesRepository;
    const query = repository
      .createQueryBuilder("receivable")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.contract_id = :contractId", { contractId: entity.contractId })
      .andWhere("receivable.period_start >= :effectiveDate", { effectiveDate: entity.effectiveDate })
      .andWhere("receivable.is_deleted = false")
      .orderBy("receivable.period_start", "ASC")
      .addOrderBy("receivable.fee_type", "ASC");
    if (manager) query.setLock("pessimistic_write");
    const receivables = await query.getMany();
    const affected: ReceivableImpactRow[] = [];
    const blocked: BlockedReceivableImpactRow[] = [];
    let increaseAmount = 0;
    let decreaseAmount = 0;
    for (const receivable of receivables) {
      const oldAmount = this.toNumber(receivable.amountDue);
      const newAmount = this.calculateReceivableAmountAfterChange(receivable, entity.beforeSnapshot, entity.afterSnapshot);
      const diff = this.roundMoney(newAmount - oldAmount);
      const blockReason = this.receivableBlockReason(receivable);
      if (blockReason) {
        blocked.push({ receivable_id: receivable.id, ar_code: receivable.arCode, reason: blockReason });
        continue;
      }
      if (diff > 0) increaseAmount += diff;
      if (diff < 0) decreaseAmount += Math.abs(diff);
      affected.push({
        receivable_id: receivable.id,
        ar_code: receivable.arCode,
        fee_type: receivable.feeType,
        period_start: receivable.periodStart,
        period_end: receivable.periodEnd,
        old_amount_due: this.decimal(oldAmount),
        new_amount_due: this.decimal(newAmount),
        diff_amount: this.decimal(diff),
        can_adjust: entity.receivablePolicy === "adjust_future",
        reason: entity.receivablePolicy === "adjust_future" ? "未来未收款账单" : "当前策略不自动调整"
      });
    }
    return {
      contract_id: entity.contractId,
      change_id: entity.id,
      affected_receivables: affected,
      blocked_receivables: blocked,
      summary: {
        increase_amount: this.decimal(increaseAmount),
        decrease_amount: this.decimal(decreaseAmount),
        blocked_count: blocked.length
      }
    };
  }

  private calculateReceivableAmountAfterChange(receivable: LeasingReceivableEntity, beforeSnapshot: Record<string, unknown>, afterSnapshot: Record<string, unknown>): number {
    const oldAmount = this.toNumber(receivable.amountDue);
    if (receivable.feeType === RENT_FEE_TYPE) {
      const beforeMonthly = this.toNumber(beforeSnapshot.rent_per_month ?? beforeSnapshot.rentPerMonth);
      const afterMonthly = this.toNumber(afterSnapshot.rent_per_month ?? afterSnapshot.rentPerMonth);
      if (beforeMonthly <= 0) return this.roundMoney(afterMonthly > 0 ? afterMonthly : oldAmount);
      return this.roundMoney(afterMonthly * (oldAmount / beforeMonthly));
    }
    if (receivable.feeType === DEPOSIT_FEE_TYPE) {
      return this.roundMoney(this.toNumber(afterSnapshot.deposit_amount ?? afterSnapshot.depositAmount ?? oldAmount));
    }
    if (receivable.feeType === PROPERTY_FEE_TYPE) {
      const beforeUnitPrice = this.toNumber(beforeSnapshot.property_fee_unit_price ?? beforeSnapshot.propertyFeeUnitPrice);
      const afterUnitPrice = this.toNumber(afterSnapshot.property_fee_unit_price ?? afterSnapshot.propertyFeeUnitPrice);
      const beforeArea = this.toNumber(beforeSnapshot.total_area ?? beforeSnapshot.totalArea);
      const afterArea = this.toNumber(afterSnapshot.total_area ?? afterSnapshot.totalArea ?? beforeArea);
      const beforeBase = beforeUnitPrice * beforeArea;
      if (beforeBase <= 0) return this.roundMoney(afterUnitPrice * afterArea);
      return this.roundMoney(afterUnitPrice * afterArea * (oldAmount / beforeBase));
    }
    return this.roundMoney(oldAmount);
  }

  private receivableBlockReason(receivable: LeasingReceivableEntity): string | null {
    if (this.toNumber(receivable.amountPaid) > 0) return "已收款或部分收款，不允许自动调整";
    if (receivable.invoiceStatus !== INVOICE_STATUS_NOT_INVOICED) return "已开票或部分开票，不允许自动调整";
    if (this.toNumber(receivable.amountWaived) > 0) return "已豁免，不允许自动调整";
    if ([RECEIVABLE_STATUS_PARTIAL_PAID, RECEIVABLE_STATUS_SETTLED, RECEIVABLE_STATUS_OVERDUE_PARTIAL, RECEIVABLE_STATUS_WAIVED, RECEIVABLE_STATUS_REFUNDED].includes(receivable.status)) {
      return "应收状态不允许自动调整";
    }
    return null;
  }

  private async applyFutureReceivableAdjustments(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: LeasingContractChangeEntity,
    preview: FinanceImpactPreview,
    manager: EntityManager
  ): Promise<void> {
    const receivableRepository = manager.getRepository(LeasingReceivableEntity);
    const adjustableRows = preview.affected_receivables.filter((row) => row.can_adjust);
    for (const row of adjustableRows) {
      const receivable = await receivableRepository.findOne({
        where: { id: row.receivable_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!receivable) continue;
      const blockReason = this.receivableBlockReason(receivable);
      if (blockReason) continue;
      const beforeStatus = receivable.status;
      receivable.amountDue = row.new_amount_due;
      receivable.amountRemain = this.decimal(Math.max(0, this.toNumber(receivable.amountDue) + this.toNumber(receivable.lateFee) - this.toNumber(receivable.amountPaid) - this.toNumber(receivable.amountWaived)));
      receivable.overdueDays = this.calculateOverdueDays(receivable.dueDate);
      receivable.status = this.deriveReceivableStatus(receivable);
      receivable.updateBy = actor.sub;
      await receivableRepository.save(receivable);
      await this.createReceivableStatusLog(manager, scope, actor, receivable, beforeStatus, receivable.status, "adjust", `合同变更 ${entity.changeCode} 生效调整未来应收`);
    }
  }

  private applyAfterSnapshotToContract(contract: LeasingContractEntity, afterSnapshot: Record<string, unknown>, actor: JwtPrincipal): void {
    contract.startDate = String(afterSnapshot.start_date ?? afterSnapshot.startDate ?? contract.startDate);
    contract.endDate = String(afterSnapshot.end_date ?? afterSnapshot.endDate ?? contract.endDate);
    contract.rentUnitPrice = this.decimal(this.toNumber(afterSnapshot.rent_unit_price ?? afterSnapshot.rentUnitPrice ?? contract.rentUnitPrice));
    contract.rentPerMonth = this.decimal(this.toNumber(afterSnapshot.rent_per_month ?? afterSnapshot.rentPerMonth ?? contract.rentPerMonth));
    contract.totalAmount = this.decimal(this.toNumber(afterSnapshot.total_amount ?? afterSnapshot.totalAmount ?? contract.totalAmount));
    contract.depositMonths = this.decimal(this.toNumber(afterSnapshot.deposit_months ?? afterSnapshot.depositMonths ?? contract.depositMonths));
    contract.depositAmount = this.decimal(this.toNumber(afterSnapshot.deposit_amount ?? afterSnapshot.depositAmount ?? contract.depositAmount));
    contract.paymentPeriod = this.emptyToNull(String(afterSnapshot.payment_period ?? afterSnapshot.paymentPeriod ?? contract.paymentPeriod ?? ""));
    contract.propertyFeeUnitPrice = this.decimal(this.toNumber(afterSnapshot.property_fee_unit_price ?? afterSnapshot.propertyFeeUnitPrice ?? contract.propertyFeeUnitPrice));
    if (afterSnapshot.remark !== undefined) contract.remark = this.emptyToNull(String(afterSnapshot.remark ?? ""));
    contract.updateBy = actor.sub;
  }

  private deriveReceivableStatus(receivable: LeasingReceivableEntity): string {
    const remain = this.toNumber(receivable.amountRemain);
    const paid = this.toNumber(receivable.amountPaid);
    const overdue = this.calculateOverdueDays(receivable.dueDate) > 0;
    if (remain <= 0) return RECEIVABLE_STATUS_SETTLED;
    if (overdue && paid > 0) return RECEIVABLE_STATUS_OVERDUE_PARTIAL;
    if (paid > 0) return RECEIVABLE_STATUS_PARTIAL_PAID;
    if (overdue) return RECEIVABLE_STATUS_OVERDUE;
    return RECEIVABLE_STATUS_GENERATED;
  }

  private calculateOverdueDays(dueDate: string): number {
    const due = new Date(`${dueDate}T00:00:00.000Z`).getTime();
    const todayValue = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
    if (!Number.isFinite(due) || due >= todayValue) return 0;
    return Math.floor((todayValue - due) / 86_400_000);
  }

  private monthsBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) return 0;
    return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1);
  }

  private async createActionLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: LeasingContractChangeEntity,
    beforeStatus: string | null,
    afterStatus: string | null,
    action: LeasingContractActionLogEntity["action"],
    reason?: string | null
  ): Promise<void> {
    const log = manager.getRepository(LeasingContractActionLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      contractId: entity.contractId,
      bizType: "contract_change",
      bizId: entity.id,
      changeId: entity.id,
      beforeStatus,
      afterStatus,
      action,
      reason: this.emptyToNull(reason ?? undefined),
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: null
    });
    await manager.getRepository(LeasingContractActionLogEntity).save(log);
  }

  private async createReceivableStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivable: LeasingReceivableEntity,
    beforeStatus: string | null,
    afterStatus: string,
    action: LeasingReceivableStatusLogEntity["action"],
    reason?: string | null
  ): Promise<void> {
    const log = manager.getRepository(LeasingReceivableStatusLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      receivableId: receivable.id,
      beforeStatus,
      afterStatus,
      action,
      reason: this.emptyToNull(reason ?? undefined),
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: null
    });
    await manager.getRepository(LeasingReceivableStatusLogEntity).save(log);
  }

  private async secureFinanceImpact(scope: TenantParkScope, actor: JwtPrincipal | undefined, preview: FinanceImpactPreview): Promise<Record<string, unknown>> {
    if (!actor || actor.isSuper) return preview as unknown as Record<string, unknown>;
    const policies = (await this.fieldPolicyService.getUserFieldPolicies(scope, actor))
      .filter((policy) => policy.module === "leasing" && policy.entity === "leasing_receivable");
    return this.maskNestedSnapshot(preview as unknown as Record<string, unknown>, policies);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingContractChangeEntity> {
    return this.changesRepository
      .createQueryBuilder("change")
      .leftJoinAndSelect("change.contract", "contract")
      .leftJoinAndSelect("change.parkTenant", "parkTenant")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("change.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("change.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("change.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingContractChangeEntity> {
    const builder = this.scopedBuilder(scope).andWhere("change.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Leasing contract change not found");
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

  private assertContractCanChange(contract: LeasingContractEntity): void {
    if ([CONTRACT_STATUS_TERMINATED, CONTRACT_STATUS_VOID].includes(contract.status)) {
      throw new BadRequestException("Terminated or void contracts cannot start a change");
    }
    if (![CONTRACT_STATUS_SIGNED, CONTRACT_STATUS_EFFECTIVE].includes(contract.status)) {
      throw new BadRequestException("Only signed or effective contracts can start a change");
    }
  }

  private assertEffectiveDate(contract: LeasingContractEntity, effectiveDate: string): void {
    if (new Date(effectiveDate).getTime() < new Date(contract.startDate).getTime()) {
      throw new BadRequestException("effective_date cannot be earlier than contract start_date");
    }
  }

  private snapshotContract(contract: LeasingContractEntity): Record<string, unknown> {
    return {
      contract_id: contract.id,
      contract_code: contract.contractCode,
      contract_name: contract.contractName,
      start_date: contract.startDate,
      end_date: contract.endDate,
      rent_unit_price: contract.rentUnitPrice,
      total_area: contract.totalArea,
      rent_per_month: contract.rentPerMonth,
      total_amount: contract.totalAmount,
      deposit_months: contract.depositMonths,
      deposit_amount: contract.depositAmount,
      free_rent_months: contract.freeRentMonths,
      payment_period: contract.paymentPeriod,
      payment_advance_days: contract.paymentAdvanceDays,
      property_fee_unit_price: contract.propertyFeeUnitPrice,
      late_fee_rule: contract.lateFeeRule,
      other_fee_rules: contract.otherFeeRules,
      remark: contract.remark
    };
  }

  private async resolveAfterSnapshot(scope: TenantParkScope, beforeSnapshot: Record<string, unknown>, rawSnapshot: Record<string, unknown>): Promise<Record<string, unknown>> {
    const afterSnapshot: Record<string, unknown> = {};
    for (const key of SNAPSHOT_KEYS) {
      const submitted = EDITABLE_SNAPSHOT_KEYS.has(key) ? this.readSnapshotValue(rawSnapshot, key) : undefined;
      afterSnapshot[key] = submitted === undefined ? beforeSnapshot[key] : submitted;
    }
    this.assertDateRange(String(afterSnapshot.start_date), String(afterSnapshot.end_date));
    for (const key of NON_NEGATIVE_NUMBER_KEYS) {
      const raw = afterSnapshot[key];
      if (raw === null || raw === undefined || raw === "") continue;
      const numberValue = Number(raw);
      if (!Number.isFinite(numberValue) || numberValue < 0) {
        throw new BadRequestException(`${key} must be greater than or equal to 0`);
      }
      afterSnapshot[key] = key === "payment_advance_days" ? Math.trunc(numberValue) : this.decimal(numberValue);
    }
    if (afterSnapshot.payment_period) {
      await this.assertDictValue(scope, "leasing_payment_period", String(afterSnapshot.payment_period));
    }
    const monthCount = this.monthsBetween(String(afterSnapshot.start_date), String(afterSnapshot.end_date));
    const rentMonths = Math.max(0, monthCount - this.toNumber(afterSnapshot.free_rent_months));
    afterSnapshot.total_amount = this.decimal(this.toNumber(afterSnapshot.rent_per_month) * rentMonths);
    return afterSnapshot;
  }

  private readSnapshotValue(snapshot: Record<string, unknown>, key: string): unknown {
    if (key in snapshot) return snapshot[key];
    const camelKey = this.toCamelCase(key);
    if (camelKey in snapshot) return snapshot[camelKey];
    return undefined;
  }

  private buildFinanceImpact(beforeSnapshot: Record<string, unknown>, afterSnapshot: Record<string, unknown>, receivablePolicy: string): Record<string, unknown> {
    const changes = [...MONEY_KEYS].map((key) => {
      const beforeValue = this.toNumber(beforeSnapshot[key]);
      const afterValue = this.toNumber(afterSnapshot[key]);
      return { field: key, before: this.decimal(beforeValue), after: this.decimal(afterValue), delta: this.decimal(afterValue - beforeValue) };
    }).filter((item) => item.delta !== "0.00");
    return {
      receivable_policy: receivablePolicy,
      amount_changes: changes,
      requires_receivable_review: receivablePolicy !== "no_action",
      note: receivablePolicy === "adjust_future" ? "仅允许后续未收款账单调整，已收款账单不得静默覆盖" : "本申请阶段不直接修改应收账单"
    };
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingContractChangeEntity>, query: LeasingContractChangeQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("change.change_code ILIKE :keyword")
          .orWhere("contract.contract_code ILIKE :keyword")
          .orWhere("contract.contract_name ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword")
          .orWhere("change.change_reason ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.contract_id) builder.andWhere("change.contract_id = :contractId", { contractId: query.contract_id });
    if (query.park_tenant_id) builder.andWhere("change.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.change_type) builder.andWhere("change.change_type = :changeType", { changeType: query.change_type });
    if (query.status) builder.andWhere("change.status = :status", { status: query.status });
    if (query.effective_start) builder.andWhere("change.effective_date >= :effectiveStart", { effectiveStart: query.effective_start });
    if (query.effective_end) builder.andWhere("change.effective_date <= :effectiveEnd", { effectiveEnd: query.effective_end });
  }

  private applySort(builder: SelectQueryBuilder<LeasingContractChangeEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("change.updateTime", "DESC").addOrderBy("change.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("change.updateTime", "DESC").addOrderBy("change.createTime", "DESC");
      return;
    }
    builder.orderBy(`change.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingContractChangeEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "change", "park_id", parkFilter, "changeParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "change", "park_tenant_id", tenantCompanyFilter, "changeParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "change");
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

  private async secureList(scope: TenantParkScope, actor: JwtPrincipal | undefined, items: LeasingContractChangeEntity[]): Promise<LeasingContractChangeEntity[]> {
    return Promise.all(items.map((item) => this.secureOne(scope, actor, item)));
  }

  private async secureOne(scope: TenantParkScope, actor: JwtPrincipal | undefined, item: LeasingContractChangeEntity): Promise<LeasingContractChangeEntity> {
    const secured = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract_change", item);
    if (!actor || actor.isSuper) return secured;
    const userPolicies = await this.fieldPolicyService.getUserFieldPolicies(scope, actor);
    const contractPolicies = userPolicies.filter((policy) => policy.module === "leasing" && policy.entity === "leasing_contract");
    const receivablePolicies = userPolicies.filter((policy) => policy.module === "leasing" && policy.entity === "leasing_receivable");
    secured.beforeSnapshot = this.maskNestedSnapshot(secured.beforeSnapshot, contractPolicies);
    secured.afterSnapshot = this.maskNestedSnapshot(secured.afterSnapshot, contractPolicies);
    secured.financeImpact = this.maskNestedSnapshot(this.maskNestedSnapshot(secured.financeImpact, contractPolicies), receivablePolicies);
    return secured;
  }

  private maskNestedSnapshot(value: Record<string, unknown>, policies: Awaited<ReturnType<FieldPolicyService["getUserFieldPolicies"]>>): Record<string, unknown> {
    const cloned = this.deepClone(value);
    for (const policy of policies) {
      if (!["hidden", "masked"].includes(policy.policy_type)) continue;
      this.applyNestedPolicy(cloned, policy.field_key, policy.policy_type, policy.mask_rule);
    }
    return cloned;
  }

  private applyNestedPolicy(target: unknown, fieldKey: string, policyType: string, maskRule?: string | null): void {
    if (Array.isArray(target)) {
      target.forEach((item) => this.applyNestedPolicy(item, fieldKey, policyType, maskRule));
      return;
    }
    if (!target || typeof target !== "object") return;
    const record = target as Record<string, unknown>;
    const keys = this.fieldKeyCandidates(fieldKey);
    for (const key of keys) {
      if (!(key in record)) continue;
      record[key] = policyType === "hidden" ? null : this.fieldPolicyService.maskValue(record[key], maskRule);
    }
    Object.values(record).forEach((item) => this.applyNestedPolicy(item, fieldKey, policyType, maskRule));
  }

  private fieldKeyCandidates(fieldKey: string): string[] {
    const normalized = fieldKey.trim();
    const leaf = normalized.split(".").filter(Boolean).at(-1) ?? normalized;
    const aliases = leaf === "amount_due" ? ["old_amount_due", "new_amount_due", "diff_amount", "increase_amount", "decrease_amount"] : [];
    return [...new Set([normalized, this.toCamelCase(normalized), leaf, this.toCamelCase(leaf), this.toSnakeCase(leaf), ...aliases])];
  }

  private async resolveChangeCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    return (await this.codeRulesService.generateCode("contract_change", scope.tenantId, scope.parkId, actorId)).code;
  }

  private async assertChangeCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.changesRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, changeCode: code, isDeleted: false }
    });
    if (exists) throw new ConflictException("change_code already exists");
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

  private assertDateRange(startDate: string, endDate: string): void {
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      throw new BadRequestException("start_date must be earlier than or equal to end_date");
    }
  }

  private createApproveRecord(
    actor: JwtPrincipal,
    action: LeasingContractChangeApproveRecord["action"],
    fromStatus: string | null,
    toStatus: string,
    opinion?: string | null,
    rejectReason?: string | null
  ): LeasingContractChangeApproveRecord {
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

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }

  private dateOnly(value: string): string {
    return value.slice(0, 10);
  }

  private decimal(value: number): string {
    return Number(value).toFixed(2);
  }

  private roundMoney(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  }

  private toNumber(value: unknown): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private emptyToNull(value?: string): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private toCamelCase(value: string): string {
    return value.replace(/[_-]([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase());
  }

  private toSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? {})) as T;
  }

}
