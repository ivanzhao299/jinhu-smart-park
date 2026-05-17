import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import { type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import type { CreateLeasingWaiverDto } from "./dto/create-leasing-waiver.dto";
import type { LeasingWaiverApprovalDto, RejectLeasingWaiverDto } from "./dto/leasing-waiver-approval.dto";
import type { LeasingWaiverQueryDto } from "./dto/leasing-waiver-query.dto";
import { LeasingWaiverEntity, type LeasingWaiverApproveRecord } from "./entities/leasing-waiver.entity";

const WAIVER_STATUS_PENDING = "20";
const WAIVER_STATUS_APPROVED = "30";
const WAIVER_STATUS_REJECTED = "40";
const RECEIVABLE_STATUS_GENERATED = "20";
const RECEIVABLE_STATUS_PARTIAL = "40";
const RECEIVABLE_STATUS_PAID = "50";
const RECEIVABLE_STATUS_WAIVED = "80";
const RECEIVABLE_STATUS_OVERDUE = "60";
const RECEIVABLE_STATUS_OVERDUE_PARTIAL = "70";
const RECEIVABLE_STATUS_VOID = "90";
const SORT_COLUMNS = new Set(["waiverCode", "waiverAmount", "status", "applyTime", "approveTime", "updateTime", "createTime"]);

@Injectable()
export class LeasingWaiversService {
  constructor(
    @InjectRepository(LeasingWaiverEntity)
    private readonly waiversRepository: Repository<LeasingWaiverEntity>,
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivablesRepository: Repository<LeasingReceivableEntity>,
    @InjectRepository(LeasingReceivableStatusLogEntity)
    private readonly receivableStatusLogsRepository: Repository<LeasingReceivableStatusLogEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingWaiverQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingWaiverEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_waiver", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingWaiverEntity> {
    const waiver = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_waiver", waiver);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingWaiverDto): Promise<LeasingWaiverEntity> {
    const amount = this.toNumber(dto.waiver_amount);
    if (amount <= 0) throw new BadRequestException("waiver_amount must be greater than 0");
    const receivable = await this.mustFindReceivable(scope, dto.receivable_id, actor);
    this.assertReceivableCanWaive(receivable, amount);
    await this.assertDictValue(scope, "leasing_waiver_status", WAIVER_STATUS_PENDING);
    const waiverCode = await this.resolveWaiverCode(scope, actor.sub, dto.waiver_code);
    await this.assertWaiverCodeAvailable(scope, waiverCode);
    const entity = this.waiversRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: waiverCode,
      waiverCode,
      receivableId: receivable.id,
      parkTenantId: receivable.parkTenantId,
      waiverAmount: this.decimal(amount),
      reason: dto.reason,
      status: WAIVER_STATUS_PENDING,
      applyBy: actor.sub,
      applyTime: new Date(),
      approveBy: null,
      approveTime: null,
      rejectReason: null,
      approveRecords: [this.createApproveRecord(actor, "apply", null, WAIVER_STATUS_PENDING, dto.reason)],
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.waiversRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_waiver", saved);
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingWaiverApprovalDto): Promise<LeasingWaiverEntity> {
    await this.findOne(scope, id, actor);
    await this.waiversRepository.manager.transaction(async (manager) => {
      const waiver = await this.lockWaiver(manager, scope, id);
      if (waiver.status !== WAIVER_STATUS_PENDING) throw new BadRequestException("Only pending waiver can be approved");
      const receivable = await this.lockReceivable(manager, scope, waiver.receivableId);
      const waiverAmount = this.toNumber(waiver.waiverAmount);
      this.assertReceivableCanWaive(receivable, waiverAmount);
      const beforeStatus = receivable.status;
      const nextWaived = this.toNumber(receivable.amountWaived) + waiverAmount;
      const nextRemain = this.calculateAmountRemain(
        this.toNumber(receivable.amountDue),
        this.toNumber(receivable.lateFee),
        this.toNumber(receivable.amountPaid),
        nextWaived
      );
      const overdueDays = this.calculateOverdueDays(receivable.dueDate, nextRemain);
      const nextStatus = this.deriveReceivableStatus(this.toNumber(receivable.amountPaid), nextWaived, nextRemain, overdueDays);
      Object.assign(receivable, {
        amountWaived: this.decimal(nextWaived),
        amountRemain: this.decimal(nextRemain),
        overdueDays,
        status: nextStatus,
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingReceivableEntity).save(receivable);
      await this.createReceivableStatusLog(manager, scope, actor, receivable, beforeStatus, nextStatus, "豁免审批通过更新应收状态");

      Object.assign(waiver, {
        status: WAIVER_STATUS_APPROVED,
        approveBy: actor.sub,
        approveTime: new Date(),
        rejectReason: null,
        approveRecords: [...(waiver.approveRecords ?? []), this.createApproveRecord(actor, "approve", WAIVER_STATUS_PENDING, WAIVER_STATUS_APPROVED, dto.opinion)],
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingWaiverEntity).save(waiver);
    });
    return this.detail(scope, id, actor);
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RejectLeasingWaiverDto): Promise<LeasingWaiverEntity> {
    const rejectReason = dto.reject_reason?.trim();
    if (!rejectReason) throw new BadRequestException("reject_reason is required");
    await this.findOne(scope, id, actor);
    await this.waiversRepository.manager.transaction(async (manager) => {
      const waiver = await this.lockWaiver(manager, scope, id);
      if (waiver.status !== WAIVER_STATUS_PENDING) throw new BadRequestException("Only pending waiver can be rejected");
      Object.assign(waiver, {
        status: WAIVER_STATUS_REJECTED,
        approveBy: actor.sub,
        approveTime: new Date(),
        rejectReason,
        approveRecords: [...(waiver.approveRecords ?? []), this.createApproveRecord(actor, "reject", WAIVER_STATUS_PENDING, WAIVER_STATUS_REJECTED, dto.opinion ?? rejectReason, rejectReason)],
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingWaiverEntity).save(waiver);
    });
    return this.detail(scope, id, actor);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingWaiverEntity> {
    return this.waiversRepository
      .createQueryBuilder("waiver")
      .leftJoinAndSelect("waiver.receivable", "receivable")
      .leftJoinAndSelect("waiver.parkTenant", "parkTenant")
      .leftJoinAndSelect("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("waiver.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("waiver.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("waiver.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingWaiverEntity> {
    const builder = this.scopedBuilder(scope).andWhere("waiver.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Leasing waiver not found");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingWaiverEntity>, query: LeasingWaiverQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("waiver.waiver_code ILIKE :keyword")
          .orWhere("waiver.code ILIKE :keyword")
          .orWhere("waiver.reason ILIKE :keyword")
          .orWhere("receivable.ar_code ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.receivable_id) builder.andWhere("waiver.receivable_id = :receivableId", { receivableId: query.receivable_id });
    if (query.park_tenant_id) builder.andWhere("waiver.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.status) builder.andWhere("waiver.status = :status", { status: query.status });
    if (query.apply_start) builder.andWhere("waiver.apply_time >= :applyStart", { applyStart: `${query.apply_start}T00:00:00.000Z` });
    if (query.apply_end) builder.andWhere("waiver.apply_time <= :applyEnd", { applyEnd: `${query.apply_end}T23:59:59.999Z` });
  }

  private applySort(builder: SelectQueryBuilder<LeasingWaiverEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("waiver.applyTime", "DESC").addOrderBy("waiver.updateTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("waiver.applyTime", "DESC").addOrderBy("waiver.updateTime", "DESC");
      return;
    }
    builder.orderBy(`waiver.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingWaiverEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "waiver", "park_id", parkFilter, "waiverParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "waiver", "park_tenant_id", tenantCompanyFilter, "waiverParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "waiver");
  }

  private applyOwnerDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter,
    parameterPrefix: string
  ): void {
    if (contractOwnerFilter.unrestricted) return;

    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "waiver.create_by IN (:...waiverOwnerScopeIds)", params: { waiverOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "receivable.create_by IN (:...waiverReceivableOwnerScopeIds)", params: { waiverReceivableOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "contract.create_by IN (:...waiverContractOwnerScopeIds)", params: { waiverContractOwnerScopeIds: contractOwnerFilter.allowed_ids } });
    }

    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: "sourceLead.id IS NOT NULL" });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "sourceLead.follow_user_id IN (:...waiverCustomerOwnerScopeIds)", params: { waiverCustomerOwnerScopeIds: customerOwnerFilter.allowed_ids } });
    }

    if (clauses.length === 0) {
      builder.andWhere("1 = 0");
      return;
    }

    builder.andWhere(new Brackets((qb) => {
      clauses.forEach((clause, index) => {
        const sql = clause.sql.replaceAll("waiver", parameterPrefix);
        const params = clause.params
          ? Object.fromEntries(Object.entries(clause.params).map(([key, value]) => [key.replace("waiver", parameterPrefix), value]))
          : undefined;
        if (index === 0) {
          qb.where(sql, params);
        } else {
          qb.orWhere(sql, params);
        }
      });
    }));
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

  private async mustFindReceivable(scope: TenantParkScope, receivableId: string, actor?: JwtPrincipal): Promise<LeasingReceivableEntity> {
    const builder = this.receivablesRepository
      .createQueryBuilder("receivable")
      .leftJoinAndSelect("receivable.parkTenant", "parkTenant")
      .leftJoinAndSelect("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.id = :receivableId", { receivableId })
      .andWhere("receivable.is_deleted = false");
    if (actor && !actor.isSuper && !actor.permissions.includes("*")) {
      const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
        this.dataScopeService.buildScopeFilter(actor, "park"),
        this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
        this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
        this.dataScopeService.buildScopeFilter(actor, "customer_owner")
      ]);
      this.applyConfiguredIdScopeFilter(builder, "receivable", "park_id", parkFilter, "waiverReceivableParkScopeIds");
      this.applyConfiguredIdScopeFilter(builder, "receivable", "park_tenant_id", tenantCompanyFilter, "waiverReceivableParkTenantScopeIds");
      this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, "receivable");
    }
    const receivable = await builder.getOne();
    if (!receivable) throw new NotFoundException("Leasing receivable not found");
    return receivable;
  }

  private async lockWaiver(manager: EntityManager, scope: TenantParkScope, id: string): Promise<LeasingWaiverEntity> {
    const waiver = await manager.getRepository(LeasingWaiverEntity)
      .createQueryBuilder("waiver")
      .setLock("pessimistic_write")
      .where("waiver.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("waiver.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("waiver.id = :id", { id })
      .andWhere("waiver.is_deleted = false")
      .getOne();
    if (!waiver) throw new NotFoundException("Leasing waiver not found");
    return waiver;
  }

  private async lockReceivable(manager: EntityManager, scope: TenantParkScope, receivableId: string): Promise<LeasingReceivableEntity> {
    const receivable = await manager.getRepository(LeasingReceivableEntity)
      .createQueryBuilder("receivable")
      .setLock("pessimistic_write")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.id = :receivableId", { receivableId })
      .andWhere("receivable.is_deleted = false")
      .getOne();
    if (!receivable) throw new NotFoundException("Leasing receivable not found");
    return receivable;
  }

  private assertReceivableCanWaive(receivable: LeasingReceivableEntity, waiverAmount: number): void {
    const amountRemain = this.toNumber(receivable.amountRemain);
    if (amountRemain <= 0 || [RECEIVABLE_STATUS_PAID, RECEIVABLE_STATUS_WAIVED, RECEIVABLE_STATUS_VOID].includes(receivable.status)) {
      throw new BadRequestException("Only unsettled receivable can apply waiver");
    }
    if (waiverAmount > amountRemain + 0.000001) {
      throw new BadRequestException("waiver_amount cannot exceed receivable amount_remain");
    }
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
    if (!exists) throw new BadRequestException(`${dictCode} value is not enabled`);
  }

  private async resolveWaiverCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    const generated = await this.codeRulesService.generateNext(scope, actorId, "WAIVER_CODE");
    return generated.code;
  }

  private async assertWaiverCodeAvailable(scope: TenantParkScope, waiverCode: string, excludeId?: string): Promise<void> {
    const builder = this.waiversRepository
      .createQueryBuilder("waiver")
      .where("waiver.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("waiver.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("waiver.waiver_code = :waiverCode", { waiverCode })
      .andWhere("waiver.is_deleted = false");
    if (excludeId) builder.andWhere("waiver.id <> :excludeId", { excludeId });
    if (await builder.getExists()) throw new ConflictException("Leasing waiver code already exists");
  }

  private async createReceivableStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivable: LeasingReceivableEntity,
    beforeStatus: string | null,
    afterStatus: string,
    reason: string
  ): Promise<void> {
    const repository = manager.getRepository(LeasingReceivableStatusLogEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      receivableId: receivable.id,
      beforeStatus,
      afterStatus,
      action: "waiver_approve",
      reason,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username ?? actor.sub,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private createApproveRecord(
    actor: JwtPrincipal,
    action: LeasingWaiverApproveRecord["action"],
    fromStatus: string | null,
    toStatus: string,
    opinion?: string | null,
    rejectReason?: string | null
  ): LeasingWaiverApproveRecord {
    return {
      action,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username ?? actor.sub,
      opTime: new Date().toISOString(),
      fromStatus,
      toStatus,
      opinion: opinion ?? null,
      rejectReason: rejectReason ?? null
    };
  }

  private calculateAmountRemain(amountDue: number, lateFee: number, amountPaid: number, amountWaived: number): number {
    const amountRemain = amountDue + lateFee - amountPaid - amountWaived;
    if (amountRemain < -0.000001) {
      throw new BadRequestException("amount_paid plus amount_waived cannot exceed amount_due plus late_fee");
    }
    return Math.max(0, amountRemain);
  }

  private deriveReceivableStatus(amountPaid: number, amountWaived: number, amountRemain: number, overdueDays: number): string {
    if (amountRemain <= 0) return amountWaived > 0 ? RECEIVABLE_STATUS_WAIVED : RECEIVABLE_STATUS_PAID;
    if (overdueDays > 0) return amountPaid > 0 || amountWaived > 0 ? RECEIVABLE_STATUS_OVERDUE_PARTIAL : RECEIVABLE_STATUS_OVERDUE;
    if (amountPaid > 0 || amountWaived > 0) return RECEIVABLE_STATUS_PARTIAL;
    return RECEIVABLE_STATUS_GENERATED;
  }

  private calculateOverdueDays(dueDate: string, amountRemain: number): number {
    if (amountRemain <= 0) return 0;
    const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
    const now = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
    if (!Number.isFinite(due) || now <= due) return 0;
    return Math.floor((now - due) / 86_400_000);
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
