import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import { type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { LeasingContractUnitEntity } from "../leasing-contracts/entities/leasing-contract-unit.entity";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingPaymentReceivableEntity } from "../leasing-payments/entities/leasing-payment-receivable.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import type { CreateLeasingReceivableDto } from "./dto/create-leasing-receivable.dto";
import type { GenerateContractReceivablesDto, GenerateReceivablesBatchDto } from "./dto/generate-receivables.dto";
import type { LeasingReceivableQueryDto } from "./dto/leasing-receivable-query.dto";
import type { LeasingReceivableStatusLogQueryDto } from "./dto/leasing-receivable-status-log-query.dto";
import type { ReceivableAgingQueryDto, ReceivableOverdueQueryDto } from "./dto/receivable-aging-query.dto";
import type { UpdateLeasingReceivableDto } from "./dto/update-leasing-receivable.dto";
import { LeasingReceivableStatusLogEntity } from "./entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "./entities/leasing-receivable.entity";

const RECEIVABLE_STATUS_GENERATED = "20";
const RECEIVABLE_STATUS_PARTIAL = "40";
const RECEIVABLE_STATUS_PAID = "50";
const RECEIVABLE_STATUS_OVERDUE = "60";
const RECEIVABLE_STATUS_OVERDUE_PARTIAL = "70";
const RECEIVABLE_STATUS_WAIVED = "80";
const RECEIVABLE_STATUS_VOID = "90";
const INVOICE_STATUS_NONE = "10";
const CONTRACT_STATUS_EFFECTIVE = "75";
const FEE_TYPE_RENT = "10";
const FEE_TYPE_DEPOSIT = "20";
const FEE_TYPE_PROPERTY_FEE = "30";
const RECEIVABLE_UPDATE_FORBIDDEN_FIELDS = new Set([
  "ar_code",
  "contract_id",
  "park_tenant_id",
  "fee_type",
  "period_start",
  "period_end",
  "amount_due",
  "amount_paid",
  "amount_waived",
  "late_fee",
  "invoice_status",
  "status",
  "source_type",
  "source_id",
  "generate_batch_no"
]);
const PAYMENT_PERIOD_MONTHS: Record<string, number> = {
  "10": 1,
  "20": 2,
  "30": 3,
  "40": 6,
  "50": 12
};
const SORT_COLUMNS = new Set(["arCode", "dueDate", "amountDue", "amountRemain", "status", "invoiceStatus", "updateTime", "createTime"]);

interface ReceivableGenerationSpec {
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
  remark: string | null;
}

interface ReceivableGenerationRow {
  contract_id: string;
  fee_type: string;
  period_start: string;
  period_end: string;
  due_date?: string;
  amount_due?: string;
  receivable_id?: string;
  ar_code?: string;
  status: "generated" | "regenerated" | "skipped" | "failed";
  message?: string;
}

export interface ReceivableGenerationResult {
  generated_count: number;
  skipped_count: number;
  failed_count: number;
  rows: ReceivableGenerationRow[];
}

interface ReceivableAgingBucket {
  bucket: "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
  count: number;
  amount: string | null;
}

interface ReceivableAgingTopTenant {
  park_tenant_id: string;
  company_name: string;
  amount: string | null;
  max_overdue_days: number;
}

export interface ReceivableAgingResult {
  summary: {
    total_amount_remain: string | null;
    overdue_amount: string | null;
    overdue_count: number;
  };
  buckets: ReceivableAgingBucket[];
  top_tenants: ReceivableAgingTopTenant[];
}

@Injectable()
export class LeasingReceivablesService {
  constructor(
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivablesRepository: Repository<LeasingReceivableEntity>,
    @InjectRepository(LeasingReceivableStatusLogEntity)
    private readonly receivableStatusLogsRepository: Repository<LeasingReceivableStatusLogEntity>,
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(LeasingContractUnitEntity)
    private readonly contractUnitsRepository: Repository<LeasingContractUnitEntity>,
    @InjectRepository(LeasingPaymentReceivableEntity)
    private readonly paymentReceivablesRepository: Repository<LeasingPaymentReceivableEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingReceivableQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingReceivableEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    items.forEach((item) => this.refreshComputedOverdueFields(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_receivable", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingReceivableEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_receivable", entity);
  }

  async listStatusLogs(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivableId: string,
    query: LeasingReceivableStatusLogQueryDto
  ): Promise<PaginatedResult<LeasingReceivableStatusLogEntity>> {
    await this.findOne(scope, receivableId, actor);
    const [items, total] = await this.receivableStatusLogsRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.receivable_id = :receivableId", { receivableId })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingReceivableDto): Promise<LeasingReceivableEntity> {
    this.assertDateRange(dto.period_start, dto.period_end);
    await this.validateDictionaryValues(scope, dto.fee_type, dto.invoice_status ?? INVOICE_STATUS_NONE, dto.status);
    const parkTenant = await this.mustFindParkTenant(scope, dto.park_tenant_id);
    const contract = dto.contract_id ? await this.mustFindContract(scope, dto.contract_id) : null;
    this.assertContractParkTenantMatch(contract, parkTenant.id);
    const arCode = await this.resolveArCode(scope, actor.sub, dto.ar_code);
    await this.assertArCodeAvailable(scope, arCode);
    await this.assertReceivablePeriodAvailable(scope, dto.contract_id ?? null, dto.fee_type, this.dateOnly(dto.period_start), this.dateOnly(dto.period_end));

    const amountDue = this.toNumber(dto.amount_due);
    const amountPaid = this.toNumber(dto.amount_paid);
    const amountWaived = this.toNumber(dto.amount_waived);
    const lateFee = this.toNumber(dto.late_fee);
    const amountRemain = this.calculateAmountRemain(amountDue, lateFee, amountPaid, amountWaived);
    const overdueDays = this.calculateOverdueDays(dto.due_date, amountRemain);
    const status = dto.status ?? this.deriveStatus(amountDue, amountPaid, amountWaived, amountRemain, overdueDays);
    await this.assertDictValue(scope, "leasing_receivable_status", status);

    let saved!: LeasingReceivableEntity;
    await this.receivablesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(LeasingReceivableEntity);
      const entity = repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: arCode,
        arCode,
        contractId: dto.contract_id ?? null,
        parkTenantId: parkTenant.id,
        feeType: dto.fee_type,
        periodStart: this.dateOnly(dto.period_start),
        periodEnd: this.dateOnly(dto.period_end),
        dueDate: this.dateOnly(dto.due_date),
        amountDue: this.decimal(amountDue),
        amountPaid: this.decimal(amountPaid),
        amountWaived: this.decimal(amountWaived),
        amountRemain: this.decimal(amountRemain),
        lateFee: this.decimal(lateFee),
        invoiceStatus: dto.invoice_status ?? INVOICE_STATUS_NONE,
        overdueDays,
        status,
        sourceType: dto.source_type ?? (contract ? "contract" : "manual"),
        sourceId: dto.source_id ?? dto.contract_id ?? null,
        generateBatchNo: this.emptyToNull(dto.generate_batch_no),
        remark: this.emptyToNull(dto.remark),
        createBy: actor.sub,
        updateBy: actor.sub
      });
      saved = await repository.save(entity);
      await this.createStatusLog(manager, scope, actor, saved, null, status, "create", "手工创建应收账单");
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_receivable", saved);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingReceivableDto): Promise<LeasingReceivableEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertReceivableUpdatePayloadAllowed(dto as Record<string, unknown>);
    this.assertReceivableOrdinaryUpdateAllowed(entity);

    const amountDue = this.toNumber(entity.amountDue);
    const amountPaid = this.toNumber(entity.amountPaid);
    const amountWaived = this.toNumber(entity.amountWaived);
    const lateFee = this.toNumber(entity.lateFee);
    const amountRemain = this.calculateAmountRemain(amountDue, lateFee, amountPaid, amountWaived);
    const dueDate = this.dateOnly(dto.due_date ?? entity.dueDate);
    const overdueDays = this.calculateOverdueDays(dueDate, amountRemain);

    const beforeStatus = entity.status;
    Object.assign(entity, {
      dueDate,
      amountRemain: this.decimal(amountRemain),
      overdueDays,
      status: this.deriveStatus(amountDue, amountPaid, amountWaived, amountRemain, overdueDays),
      remark: dto.remark === undefined ? entity.remark : this.emptyToNull(dto.remark),
      updateBy: actor.sub
    });
    const saved = await this.receivablesRepository.save(entity);
    if (beforeStatus !== saved.status) {
      await this.createStatusLog(null, scope, actor, saved, beforeStatus, saved.status, "system", "手工编辑更新应收状态");
    }
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_receivable", saved);
  }

  private assertReceivableUpdatePayloadAllowed(payload: Record<string, unknown>): void {
    const forbiddenField = Object.keys(payload).find((field) => RECEIVABLE_UPDATE_FORBIDDEN_FIELDS.has(field));
    if (forbiddenField) {
      throw new BadRequestException(`Receivable field ${forbiddenField} cannot be updated through ordinary update`);
    }
  }

  private assertReceivableOrdinaryUpdateAllowed(receivable: LeasingReceivableEntity): void {
    if (receivable.status === RECEIVABLE_STATUS_VOID) {
      throw new BadRequestException("Void receivable cannot be updated");
    }
    if (this.toNumber(receivable.amountPaid) > 0) {
      throw new BadRequestException("Receivable with payments cannot be updated through ordinary update");
    }
    if (this.toNumber(receivable.amountWaived) > 0) {
      throw new BadRequestException("Receivable with waived amount cannot be updated through ordinary update");
    }
    if (receivable.invoiceStatus !== INVOICE_STATUS_NONE) {
      throw new BadRequestException("Invoiced receivable cannot be updated through ordinary update");
    }
    if (
      receivable.status === RECEIVABLE_STATUS_PARTIAL ||
      receivable.status === RECEIVABLE_STATUS_PAID ||
      receivable.status === RECEIVABLE_STATUS_OVERDUE_PARTIAL ||
      receivable.status === RECEIVABLE_STATUS_WAIVED
    ) {
      throw new BadRequestException("Receivable with financial activity cannot be updated through ordinary update");
    }
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status === RECEIVABLE_STATUS_VOID) {
      throw new BadRequestException("Cannot void already void receivable");
    }
    if (this.toNumber(entity.amountPaid) > 0) {
      throw new BadRequestException("Cannot void receivable with payment activity");
    }
    if (this.toNumber(entity.amountWaived) > 0) {
      throw new BadRequestException("Cannot void receivable with waived amount");
    }
    if (entity.invoiceStatus !== INVOICE_STATUS_NONE) {
      throw new BadRequestException("Cannot void invoiced receivable");
    }
    if (
      entity.status === RECEIVABLE_STATUS_PARTIAL ||
      entity.status === RECEIVABLE_STATUS_PAID ||
      entity.status === RECEIVABLE_STATUS_OVERDUE_PARTIAL ||
      entity.status === RECEIVABLE_STATUS_WAIVED
    ) {
      throw new BadRequestException("Cannot void receivable with financial activity");
    }
    if (await this.hasPaymentApplications(scope, entity.id)) {
      throw new BadRequestException("Cannot void receivable with payment applications");
    }
    const beforeStatus = entity.status;
    await this.receivablesRepository.manager.transaction(async (manager) => {
      Object.assign(entity, {
        isDeleted: true,
        status: RECEIVABLE_STATUS_VOID,
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingReceivableEntity).save(entity);
      await this.createStatusLog(manager, scope, actor, entity, beforeStatus, RECEIVABLE_STATUS_VOID, "delete", "删除应收账单");
    });
    return { id };
  }

  async generateForContract(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contractId: string,
    dto: GenerateContractReceivablesDto,
    options?: { billingMonth?: string }
  ): Promise<ReceivableGenerationResult> {
    const contract = await this.findContractForGeneration(scope, actor, contractId);
    const unitCount = await this.contractUnitsRepository
      .createQueryBuilder("contractUnit")
      .where("contractUnit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contractUnit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contractUnit.contract_id = :contractId", { contractId: contract.id })
      .andWhere("contractUnit.is_deleted = false")
      .andWhere("contractUnit.status = :status", { status: 1 })
      .getCount();
    if (unitCount <= 0) {
      throw new BadRequestException("Effective contract must have linked units before generating receivables");
    }

    const monthRange = options?.billingMonth ? this.resolveBillingMonthRange(options.billingMonth) : null;
    const specs = this.buildReceivableSpecs(contract, dto, monthRange);
    const rows = await this.receivablesRepository.manager.transaction(async (manager) => {
      const generatedRows: ReceivableGenerationRow[] = [];
      for (const spec of specs) {
        generatedRows.push(await this.saveGeneratedReceivable(manager, scope, actor, contract, spec, Boolean(dto.force_regenerate)));
      }
      return generatedRows;
    });
    return this.summarizeGenerationRows(rows);
  }

  async generateBatch(scope: TenantParkScope, actor: JwtPrincipal, dto: GenerateReceivablesBatchDto): Promise<ReceivableGenerationResult> {
    const rows: ReceivableGenerationRow[] = [];
    for (const contractId of dto.contract_ids) {
      try {
        const result = await this.generateForContract(scope, actor, contractId, {
          include_rent: true,
          include_deposit: true,
          include_property_fee: true,
          force_regenerate: false
        }, { billingMonth: dto.billing_month });
        rows.push(...result.rows);
      } catch (error) {
        rows.push({
          contract_id: contractId,
          fee_type: "",
          period_start: dto.billing_month,
          period_end: dto.billing_month,
          status: "failed",
          message: this.safeGenerationFailureMessage(error)
        });
      }
    }
    return this.summarizeGenerationRows(rows);
  }

  async recalculateOverdue(scope: TenantParkScope, actor: JwtPrincipal): Promise<{ checked_count: number; updated_count: number; status_changed_count: number }> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    const receivables = await builder.getMany();
    let updatedCount = 0;
    let statusChangedCount = 0;
    await this.receivablesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(LeasingReceivableEntity);
      for (const receivable of receivables) {
        const beforeStatus = receivable.status;
        const beforeOverdueDays = receivable.overdueDays;
        const amountDue = this.toNumber(receivable.amountDue);
        const amountPaid = this.toNumber(receivable.amountPaid);
        const amountWaived = this.toNumber(receivable.amountWaived);
        const amountRemain = this.toNumber(receivable.amountRemain);
        const overdueDays = this.calculateOverdueDays(receivable.dueDate, amountRemain);
        const nextStatus = this.deriveStatus(amountDue, amountPaid, amountWaived, amountRemain, overdueDays);
        if (beforeStatus === nextStatus && beforeOverdueDays === overdueDays) continue;
        Object.assign(receivable, {
          overdueDays,
          status: nextStatus,
          updateBy: actor.sub
        });
        await repository.save(receivable);
        updatedCount += 1;
        await this.createStatusLog(manager, scope, actor, receivable, beforeStatus, nextStatus, "overdue", "重算逾期更新应收状态");
        if (beforeStatus !== nextStatus) {
          statusChangedCount += 1;
        }
      }
    });
    return { checked_count: receivables.length, updated_count: updatedCount, status_changed_count: statusChangedCount };
  }

  async listOverdue(scope: TenantParkScope, query: ReceivableOverdueQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingReceivableEntity>> {
    const builder = this.scopedBuilder(scope)
      .andWhere("receivable.amount_remain > 0")
      .andWhere(
        new Brackets((qb) => {
          qb.where("receivable.overdue_days > 0").orWhere("receivable.due_date < CURRENT_DATE");
        })
      );
    await this.applyDataScope(builder, scope, actor);
    this.applyAgingQuery(builder, query);
    builder.orderBy("receivable.overdueDays", "DESC").addOrderBy("receivable.dueDate", "ASC");
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_receivable", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async getAging(scope: TenantParkScope, query: ReceivableAgingQueryDto, actor?: JwtPrincipal): Promise<ReceivableAgingResult> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyAgingQuery(builder, query);
    const receivables = await builder.getMany();
    const buckets: Record<ReceivableAgingBucket["bucket"], { count: number; amount: number }> = {
      current: { count: 0, amount: 0 },
      d1_30: { count: 0, amount: 0 },
      d31_60: { count: 0, amount: 0 },
      d61_90: { count: 0, amount: 0 },
      d90_plus: { count: 0, amount: 0 }
    };
    const tenants = new Map<string, { parkTenantId: string; companyName: string; amount: number; maxOverdueDays: number }>();
    let totalAmountRemain = 0;
    let overdueAmount = 0;
    let overdueCount = 0;

    for (const receivable of receivables) {
      const amountRemain = this.toNumber(receivable.amountRemain);
      if (amountRemain <= 0) continue;
      const overdueDays = this.calculateOverdueDays(receivable.dueDate, amountRemain);
      const bucket = this.resolveAgingBucket(overdueDays);
      buckets[bucket].count += 1;
      buckets[bucket].amount += amountRemain;
      totalAmountRemain += amountRemain;
      if (overdueDays > 0) {
        overdueAmount += amountRemain;
        overdueCount += 1;
        const companyName = receivable.parkTenant?.companyName ?? receivable.parkTenantId;
        const current = tenants.get(receivable.parkTenantId) ?? {
          parkTenantId: receivable.parkTenantId,
          companyName,
          amount: 0,
          maxOverdueDays: 0
        };
        current.amount += amountRemain;
        current.maxOverdueDays = Math.max(current.maxOverdueDays, overdueDays);
        tenants.set(receivable.parkTenantId, current);
      }
    }

    const secureAmount = await this.createAgingAmountSecurer(scope, actor);
    return {
      summary: {
        total_amount_remain: secureAmount(totalAmountRemain),
        overdue_amount: secureAmount(overdueAmount),
        overdue_count: overdueCount
      },
      buckets: (["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const).map((bucket) => ({
        bucket,
        count: buckets[bucket].count,
        amount: secureAmount(buckets[bucket].amount)
      })),
      top_tenants: [...tenants.values()]
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 10)
        .map((row) => ({
          park_tenant_id: row.parkTenantId,
          company_name: row.companyName,
          amount: secureAmount(row.amount),
          max_overdue_days: row.maxOverdueDays
        }))
    };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingReceivableEntity> {
    return this.receivablesRepository
      .createQueryBuilder("receivable")
      .leftJoinAndSelect("receivable.parkTenant", "parkTenant")
      .leftJoinAndSelect("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingReceivableEntity> {
    const builder = this.scopedBuilder(scope).andWhere("receivable.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Leasing receivable not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingReceivableEntity>, query: LeasingReceivableQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("receivable.ar_code ILIKE :keyword")
            .orWhere("receivable.code ILIKE :keyword")
            .orWhere("contract.contract_code ILIKE :keyword")
            .orWhere("contract.contract_name ILIKE :keyword")
            .orWhere("parkTenant.company_name ILIKE :keyword");
        })
      ).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.contract_id) builder.andWhere("receivable.contract_id = :contractId", { contractId: query.contract_id });
    if (query.park_tenant_id) builder.andWhere("receivable.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.fee_type) builder.andWhere("receivable.fee_type = :feeType", { feeType: query.fee_type });
    if (query.status) builder.andWhere("receivable.status = :status", { status: query.status });
    if (query.invoice_status) builder.andWhere("receivable.invoice_status = :invoiceStatus", { invoiceStatus: query.invoice_status });
    if (query.due_start) builder.andWhere("receivable.due_date >= :dueStart", { dueStart: query.due_start });
    if (query.due_end) builder.andWhere("receivable.due_date <= :dueEnd", { dueEnd: query.due_end });
    if (query.overdue_only) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("receivable.overdue_days > 0").orWhere("(receivable.due_date < CURRENT_DATE AND receivable.amount_remain > 0)");
        })
      );
    }
  }

  private applyAgingQuery(builder: SelectQueryBuilder<LeasingReceivableEntity>, query: ReceivableAgingQueryDto): void {
    if (query.contract_id) builder.andWhere("receivable.contract_id = :contractId", { contractId: query.contract_id });
    if (query.park_tenant_id) builder.andWhere("receivable.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.start_date) builder.andWhere("receivable.due_date >= :agingStartDate", { agingStartDate: query.start_date });
    if (query.end_date) builder.andWhere("receivable.due_date <= :agingEndDate", { agingEndDate: query.end_date });
  }

  private applySort(builder: SelectQueryBuilder<LeasingReceivableEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("receivable.dueDate", "ASC").addOrderBy("receivable.updateTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("receivable.dueDate", "ASC").addOrderBy("receivable.updateTime", "DESC");
      return;
    }
    builder.orderBy(`receivable.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingReceivableEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "receivable", "park_id", parkFilter, "receivableParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "receivable", "park_tenant_id", tenantCompanyFilter, "receivableParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter);
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
    if (filter.scope_types.includes("custom")) {
      builder.andWhere("1 = 0");
    }
  }

  private applyOwnerDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter
  ): void {
    if (contractOwnerFilter.unrestricted) return;
    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "contract.create_by IN (:...receivableContractOwnerScopeIds)", params: { receivableContractOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "receivable.create_by IN (:...receivableOwnerScopeIds)", params: { receivableOwnerScopeIds: contractOwnerFilter.allowed_ids } });
    }
    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: "sourceLead.id IS NOT NULL" });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "sourceLead.follow_user_id IN (:...receivableCustomerOwnerScopeIds)", params: { receivableCustomerOwnerScopeIds: customerOwnerFilter.allowed_ids } });
    }
    if (clauses.length === 0) {
      builder.andWhere("1 = 0");
      return;
    }
    builder.andWhere(
      new Brackets((qb) => {
        clauses.forEach((clause, index) => {
          if (index === 0) qb.where(clause.sql, clause.params);
          else qb.orWhere(clause.sql, clause.params);
        });
      })
    );
  }

  private async applyContractDataScope(builder: SelectQueryBuilder<LeasingContractEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_id", parkFilter, "generateContractParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_tenant_id", tenantCompanyFilter, "generateContractParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter);
  }

  private async findContractForGeneration(scope: TenantParkScope, actor: JwtPrincipal, contractId: string): Promise<LeasingContractEntity> {
    const builder = this.contractsRepository
      .createQueryBuilder("contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contract.id = :contractId", { contractId })
      .andWhere("contract.is_deleted = false");
    await this.applyContractDataScope(builder, scope, actor);
    const contract = await builder.getOne();
    if (!contract) {
      throw new NotFoundException("Leasing contract not found");
    }
    if (contract.status !== CONTRACT_STATUS_EFFECTIVE) {
      throw new BadRequestException("Only effective contracts can generate receivables");
    }
    if (!contract.parkTenantId) {
      throw new BadRequestException("Effective contract must have park_tenant_id");
    }
    if (!contract.startDate || !contract.endDate || !contract.paymentPeriod) {
      throw new BadRequestException("Effective contract must have start_date, end_date, and payment_period");
    }
    if (!PAYMENT_PERIOD_MONTHS[contract.paymentPeriod]) {
      throw new BadRequestException("Unsupported contract payment_period");
    }
    return contract;
  }

  private buildReceivableSpecs(
    contract: LeasingContractEntity,
    dto: GenerateContractReceivablesDto,
    monthRange: { start: string; end: string } | null
  ): ReceivableGenerationSpec[] {
    const includeRent = dto.include_rent ?? true;
    const includeDeposit = dto.include_deposit ?? true;
    const includePropertyFee = dto.include_property_fee ?? true;
    const specs: ReceivableGenerationSpec[] = [];
    const paymentAdvanceDays = Number.isInteger(contract.paymentAdvanceDays) ? contract.paymentAdvanceDays : 0;

    if (includeDeposit && this.toNumber(contract.depositAmount) > 0) {
      const spec = {
        feeType: FEE_TYPE_DEPOSIT,
        periodStart: this.dateOnly(contract.startDate),
        periodEnd: this.dateOnly(contract.startDate),
        dueDate: this.formatDate(this.addDays(this.parseDate(contract.startDate), -paymentAdvanceDays)),
        amountDue: this.toNumber(contract.depositAmount),
        remark: "合同生效后生成押金应收"
      };
      if (this.matchesBillingMonth(spec, monthRange)) specs.push(spec);
    }

    const cyclePeriods = this.buildContractCyclePeriods(contract);
    if (includeRent && this.toNumber(contract.rentPerMonth) >= 0) {
      let freeMonthsLeft = Math.max(0, this.toNumber(contract.freeRentMonths));
      for (const period of cyclePeriods) {
        const freeMonths = Math.min(period.months, freeMonthsLeft);
        const billableMonths = Math.max(0, period.months - freeMonths);
        freeMonthsLeft = Math.max(0, freeMonthsLeft - freeMonths);
        const spec = {
          feeType: FEE_TYPE_RENT,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          amountDue: this.toNumber(contract.rentPerMonth) * billableMonths,
          remark: freeMonths > 0 ? `合同生成租金应收，免租 ${this.decimal(freeMonths)} 个月` : "合同生成租金应收"
        };
        if (this.matchesBillingMonth(spec, monthRange)) specs.push(spec);
      }
    }

    const propertyFeeUnitPrice = this.toNumber(contract.propertyFeeUnitPrice);
    const totalArea = this.toNumber(contract.totalArea);
    if (includePropertyFee && propertyFeeUnitPrice > 0 && totalArea > 0) {
      for (const period of cyclePeriods) {
        const spec = {
          feeType: FEE_TYPE_PROPERTY_FEE,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          amountDue: propertyFeeUnitPrice * totalArea * period.months,
          remark: "合同生成物业费应收"
        };
        if (this.matchesBillingMonth(spec, monthRange)) specs.push(spec);
      }
    }

    return specs;
  }

  private buildContractCyclePeriods(contract: LeasingContractEntity): Array<{ periodStart: string; periodEnd: string; dueDate: string; months: number }> {
    const cycleMonths = PAYMENT_PERIOD_MONTHS[contract.paymentPeriod ?? ""] ?? 1;
    const paymentAdvanceDays = Number.isInteger(contract.paymentAdvanceDays) ? contract.paymentAdvanceDays : 0;
    const contractEnd = this.parseDate(contract.endDate);
    const periods: Array<{ periodStart: string; periodEnd: string; dueDate: string; months: number }> = [];
    let cursor = this.parseDate(contract.startDate);
    while (cursor.getTime() <= contractEnd.getTime()) {
      const nextStart = this.addMonthsClamped(cursor, cycleMonths);
      let periodEnd = this.addDays(nextStart, -1);
      if (periodEnd.getTime() > contractEnd.getTime()) periodEnd = contractEnd;
      const periodStartText = this.formatDate(cursor);
      const periodEndText = this.formatDate(periodEnd);
      periods.push({
        periodStart: periodStartText,
        periodEnd: periodEndText,
        dueDate: this.formatDate(this.addDays(cursor, -paymentAdvanceDays)),
        months: Math.min(cycleMonths, this.approximateMonthCount(periodStartText, periodEndText))
      });
      cursor = nextStart;
    }
    return periods;
  }

  private async saveGeneratedReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contract: LeasingContractEntity,
    spec: ReceivableGenerationSpec,
    forceRegenerate: boolean
  ): Promise<ReceivableGenerationRow> {
    const repository = manager.getRepository(LeasingReceivableEntity);
    const existing = await this.findExistingGeneratedReceivable(repository, scope, contract.id, spec);

    if (existing) {
      if (!forceRegenerate) {
        return this.toGenerationRow(contract.id, spec, "skipped", "Receivable already exists", existing);
      }
      if (this.receivableHasFinancialActivity(existing)) {
        return this.toGenerationRow(contract.id, spec, "skipped", "Existing receivable has payment, invoice, or waiver and cannot be regenerated", existing);
      }
      const beforeStatus = existing.status;
      const status = this.deriveGeneratedStatus(spec);
      Object.assign(existing, {
        dueDate: spec.dueDate,
        amountDue: this.decimal(spec.amountDue),
        amountPaid: this.decimal(0),
        amountWaived: this.decimal(0),
        amountRemain: this.decimal(spec.amountDue),
        lateFee: this.decimal(0),
        invoiceStatus: INVOICE_STATUS_NONE,
        overdueDays: this.calculateOverdueDays(spec.dueDate, spec.amountDue),
        status,
        sourceType: "contract",
        sourceId: contract.id,
        remark: spec.remark,
        updateBy: actor.sub
      });
      const saved = await repository.save(existing);
      await this.createStatusLog(manager, scope, actor, saved, beforeStatus, status, "generate", "合同应收重新生成");
      return this.toGenerationRow(contract.id, spec, "regenerated", "Regenerated", saved);
    }

    const arCode = await this.resolveArCode(scope, actor.sub);
    const status = this.deriveGeneratedStatus(spec);
    const receivableId = randomUUID();
    const entity = {
      id: receivableId,
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: arCode,
      arCode,
      contractId: contract.id,
      parkTenantId: contract.parkTenantId,
      feeType: spec.feeType,
      periodStart: spec.periodStart,
      periodEnd: spec.periodEnd,
      dueDate: spec.dueDate,
      amountDue: this.decimal(spec.amountDue),
      amountPaid: this.decimal(0),
      amountWaived: this.decimal(0),
      amountRemain: this.decimal(spec.amountDue),
      lateFee: this.decimal(0),
      invoiceStatus: INVOICE_STATUS_NONE,
      overdueDays: this.calculateOverdueDays(spec.dueDate, spec.amountDue),
      status,
      sourceType: "contract" as const,
      sourceId: contract.id,
      generateBatchNo: null,
      remark: spec.remark,
      createBy: actor.sub,
      updateBy: actor.sub
    };
    await repository
      .createQueryBuilder()
      .insert()
      .into(LeasingReceivableEntity)
      .values(entity)
      .orIgnore()
      .execute();

    const saved = await repository.findOne({ where: { id: receivableId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (saved) {
      await this.createStatusLog(manager, scope, actor, saved, null, status, "generate", "合同应收生成");
      return this.toGenerationRow(contract.id, spec, "generated", "Generated", saved);
    }

    const duplicate = await this.findExistingGeneratedReceivable(repository, scope, contract.id, spec);
    if (duplicate) {
      return this.toGenerationRow(contract.id, spec, "skipped", "Receivable already exists", duplicate);
    }

    throw new ConflictException("Receivable generation conflict; please retry");
  }

  private findExistingGeneratedReceivable(
    repository: Repository<LeasingReceivableEntity>,
    scope: TenantParkScope,
    contractId: string,
    spec: ReceivableGenerationSpec
  ): Promise<LeasingReceivableEntity | null> {
    return repository
      .createQueryBuilder("receivable")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.contract_id = :contractId", { contractId })
      .andWhere("receivable.fee_type = :feeType", { feeType: spec.feeType })
      .andWhere("receivable.period_start = :periodStart", { periodStart: spec.periodStart })
      .andWhere("receivable.period_end = :periodEnd", { periodEnd: spec.periodEnd })
      .andWhere("receivable.is_deleted = false")
      .getOne();
  }

  private safeGenerationFailureMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "string") return response;
      if (response && typeof response === "object" && "message" in response) {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) return message.join("; ");
        if (typeof message === "string") return message;
      }
      return error.message;
    }
    return "Generate receivables failed";
  }

  private async createStatusLog(
    manager: EntityManager | null,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivable: LeasingReceivableEntity,
    beforeStatus: string | null,
    afterStatus: string,
    action: LeasingReceivableStatusLogEntity["action"],
    reason: string
  ): Promise<void> {
    const repository = manager?.getRepository(LeasingReceivableStatusLogEntity) ?? this.receivableStatusLogsRepository;
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      receivableId: receivable.id,
      beforeStatus,
      afterStatus,
      action,
      reason,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username ?? actor.sub,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private receivableHasFinancialActivity(receivable: LeasingReceivableEntity): boolean {
    return this.toNumber(receivable.amountPaid) > 0 || this.toNumber(receivable.amountWaived) > 0 || receivable.invoiceStatus !== INVOICE_STATUS_NONE;
  }

  private async hasPaymentApplications(scope: TenantParkScope, receivableId: string): Promise<boolean> {
    return this.paymentReceivablesRepository
      .createQueryBuilder("application")
      .where("application.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("application.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("application.receivable_id = :receivableId", { receivableId })
      .andWhere("application.is_deleted = false")
      .getExists();
  }

  private deriveGeneratedStatus(spec: ReceivableGenerationSpec): string {
    const overdueDays = this.calculateOverdueDays(spec.dueDate, spec.amountDue);
    return this.deriveStatus(spec.amountDue, 0, 0, spec.amountDue, overdueDays);
  }

  private toGenerationRow(
    contractId: string,
    spec: ReceivableGenerationSpec,
    status: ReceivableGenerationRow["status"],
    message: string,
    receivable?: LeasingReceivableEntity
  ): ReceivableGenerationRow {
    return {
      contract_id: contractId,
      fee_type: spec.feeType,
      period_start: spec.periodStart,
      period_end: spec.periodEnd,
      due_date: spec.dueDate,
      amount_due: this.decimal(spec.amountDue),
      receivable_id: receivable?.id,
      ar_code: receivable?.arCode,
      status,
      message
    };
  }

  private summarizeGenerationRows(rows: ReceivableGenerationRow[]): ReceivableGenerationResult {
    return {
      generated_count: rows.filter((row) => row.status === "generated" || row.status === "regenerated").length,
      skipped_count: rows.filter((row) => row.status === "skipped").length,
      failed_count: rows.filter((row) => row.status === "failed").length,
      rows
    };
  }

  private matchesBillingMonth(spec: Pick<ReceivableGenerationSpec, "periodStart" | "periodEnd">, monthRange: { start: string; end: string } | null): boolean {
    if (!monthRange) return true;
    return spec.periodStart <= monthRange.end && spec.periodEnd >= monthRange.start;
  }

  private resolveBillingMonthRange(billingMonth: string): { start: string; end: string } {
    const parts = billingMonth.split("-").map((value) => Number(value));
    const year = parts[0];
    const month = parts[1];
    if (year === undefined || month === undefined || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException("billing_month must be YYYY-MM");
    }
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { start: this.formatDate(start), end: this.formatDate(end) };
  }

  private approximateMonthCount(periodStart: string, periodEnd: string): number {
    const start = this.parseDate(periodStart);
    const end = this.parseDate(periodEnd);
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    return Math.max(1, months);
  }

  private parseDate(value: string): Date {
    return new Date(`${this.dateOnly(value)}T00:00:00Z`);
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private addMonthsClamped(date: Date, months: number): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const first = new Date(Date.UTC(year, month + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(day, lastDay));
    return first;
  }

  private async mustFindParkTenant(scope: TenantParkScope, parkTenantId: string): Promise<ParkTenantEntity> {
    const entity = await this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.id = :parkTenantId", { parkTenantId })
      .andWhere("parkTenant.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant not found");
    }
    return entity;
  }

  private async mustFindContract(scope: TenantParkScope, contractId: string): Promise<LeasingContractEntity> {
    const contract = await this.contractsRepository
      .createQueryBuilder("contract")
      .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contract.id = :contractId", { contractId })
      .andWhere("contract.is_deleted = false")
      .getOne();
    if (!contract) {
      throw new NotFoundException("Leasing contract not found");
    }
    return contract;
  }

  private assertContractParkTenantMatch(contract: LeasingContractEntity | null, parkTenantId: string): void {
    if (contract && contract.parkTenantId !== parkTenantId) {
      throw new BadRequestException("contract_id does not belong to the selected park_tenant_id");
    }
  }

  private async validateDictionaryValues(scope: TenantParkScope, feeType?: string | null, invoiceStatus?: string | null, status?: string | null): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_fee_type", feeType ?? undefined),
      this.assertDictValue(scope, "leasing_invoice_status", invoiceStatus ?? undefined),
      this.assertDictValue(scope, "leasing_receivable_status", status ?? undefined)
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, rawValue?: string): Promise<void> {
    const value = rawValue?.trim();
    if (!value) return;
    const exists = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere("dictItem.item_value = :value", { value })
      .getExists();
    if (!exists) {
      throw new BadRequestException(`${dictCode} value is not enabled`);
    }
  }

  private async resolveArCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateNext(scope, actorId, "RECEIVABLE_CODE");
    return generated.code;
  }

  private async assertArCodeAvailable(scope: TenantParkScope, arCode: string, excludeId?: string): Promise<void> {
    const builder = this.receivablesRepository
      .createQueryBuilder("receivable")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.ar_code = :arCode", { arCode })
      .andWhere("receivable.is_deleted = false");
    if (excludeId) builder.andWhere("receivable.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Leasing receivable code already exists");
    }
  }

  private async assertReceivablePeriodAvailable(
    scope: TenantParkScope,
    contractId: string | null,
    feeType: string,
    periodStart: string,
    periodEnd: string,
    excludeId?: string
  ): Promise<void> {
    if (!contractId) return;
    const builder = this.receivablesRepository
      .createQueryBuilder("receivable")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.contract_id = :contractId", { contractId })
      .andWhere("receivable.fee_type = :feeType", { feeType })
      .andWhere("receivable.period_start = :periodStart", { periodStart })
      .andWhere("receivable.period_end = :periodEnd", { periodEnd })
      .andWhere("receivable.is_deleted = false");
    if (excludeId) builder.andWhere("receivable.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Receivable already exists for this contract, fee type, and period");
    }
  }

  private assertDateRange(startDate: string, endDate: string): void {
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      throw new BadRequestException("period_start must be earlier than or equal to period_end");
    }
  }

  private calculateAmountRemain(amountDue: number, lateFee: number, amountPaid: number, amountWaived: number): number {
    const amountRemain = amountDue + lateFee - amountPaid - amountWaived;
    if (amountRemain < 0) {
      throw new BadRequestException("amount_paid plus amount_waived cannot exceed amount_due plus late_fee");
    }
    return amountRemain;
  }

  private deriveStatus(amountDue: number, amountPaid: number, amountWaived: number, amountRemain: number, overdueDays: number): string {
    if (amountRemain <= 0) return amountWaived >= amountDue + amountPaid ? RECEIVABLE_STATUS_WAIVED : RECEIVABLE_STATUS_PAID;
    if (overdueDays > 0) return amountPaid > 0 || amountWaived > 0 ? RECEIVABLE_STATUS_OVERDUE_PARTIAL : RECEIVABLE_STATUS_OVERDUE;
    if (amountPaid > 0 || amountWaived > 0) return RECEIVABLE_STATUS_PARTIAL;
    return RECEIVABLE_STATUS_GENERATED;
  }

  private refreshComputedOverdueFields(receivable: LeasingReceivableEntity): void {
    const amountDue = this.toNumber(receivable.amountDue);
    const amountPaid = this.toNumber(receivable.amountPaid);
    const amountWaived = this.toNumber(receivable.amountWaived);
    const amountRemain = this.toNumber(receivable.amountRemain);
    const overdueDays = this.calculateOverdueDays(receivable.dueDate, amountRemain);
    receivable.overdueDays = overdueDays;
    receivable.status = this.deriveStatus(amountDue, amountPaid, amountWaived, amountRemain, overdueDays);
  }

  private resolveAgingBucket(overdueDays: number): ReceivableAgingBucket["bucket"] {
    if (overdueDays <= 0) return "current";
    if (overdueDays <= 30) return "d1_30";
    if (overdueDays <= 60) return "d31_60";
    if (overdueDays <= 90) return "d61_90";
    return "d90_plus";
  }

  private async createAgingAmountSecurer(scope: TenantParkScope, actor?: JwtPrincipal): Promise<(amount: number) => string | null> {
    if (!actor || actor.isSuper) {
      return (amount) => this.decimal(amount);
    }
    const policies = await this.fieldPolicyService.getUserFieldPolicies(scope, actor);
    const policy = policies.find(
      (item) =>
        item.module === "leasing" &&
        item.entity === "leasing_receivable" &&
        ["amountRemain", "amount_remain"].includes(item.field_key)
    );
    if (policy?.policy_type === "hidden") {
      return () => null;
    }
    if (policy?.policy_type === "masked") {
      return (amount) => String(this.fieldPolicyService.maskValue(this.decimal(amount), policy.mask_rule));
    }
    return (amount) => this.decimal(amount);
  }

  private calculateOverdueDays(dueDate: string, amountRemain: number): number {
    if (amountRemain <= 0) return 0;
    const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
    const now = new Date(`${this.todayDateOnly()}T00:00:00Z`).getTime();
    if (!Number.isFinite(due) || now <= due) return 0;
    return Math.floor((now - due) / 86_400_000);
  }

  private dateOnly(value: string): string {
    return value.slice(0, 10);
  }

  private todayDateOnly(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private decimal(value: number): string {
    return Number(value).toFixed(2);
  }

  private toNumber(value: string | number | null | undefined): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private emptyToNull(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

}
