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
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import type { ApplyLeasingPaymentDto } from "./dto/apply-leasing-payment.dto";
import type { CreateLeasingPaymentDto } from "./dto/create-leasing-payment.dto";
import type { LeasingPaymentQueryDto } from "./dto/leasing-payment-query.dto";
import type { UpdateLeasingPaymentDto } from "./dto/update-leasing-payment.dto";
import { LeasingPaymentReceivableEntity } from "./entities/leasing-payment-receivable.entity";
import { LeasingPaymentEntity } from "./entities/leasing-payment.entity";

const PAYMENT_STATUS_UNAPPLIED = "10";
const PAYMENT_STATUS_PARTIAL = "20";
const PAYMENT_STATUS_APPLIED = "30";
const PAYMENT_STATUS_VOID = "90";
const RECEIVABLE_STATUS_GENERATED = "20";
const RECEIVABLE_STATUS_PARTIAL = "40";
const RECEIVABLE_STATUS_PAID = "50";
const RECEIVABLE_STATUS_OVERDUE = "60";
const RECEIVABLE_STATUS_OVERDUE_PARTIAL = "70";
const SORT_COLUMNS = new Set(["payCode", "payTime", "payAmount", "unappliedAmount", "status", "updateTime", "createTime"]);

@Injectable()
export class LeasingPaymentsService {
  constructor(
    @InjectRepository(LeasingPaymentEntity)
    private readonly paymentsRepository: Repository<LeasingPaymentEntity>,
    @InjectRepository(LeasingPaymentReceivableEntity)
    private readonly applicationsRepository: Repository<LeasingPaymentReceivableEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingPaymentQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingPaymentEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_payment", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingPaymentEntity> {
    const payment = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_payment", payment);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingPaymentDto): Promise<LeasingPaymentEntity> {
    const payAmount = this.toNumber(dto.pay_amount);
    if (payAmount <= 0) throw new BadRequestException("pay_amount must be greater than 0");
    await this.validateDictionaryValues(scope, dto.pay_method, PAYMENT_STATUS_UNAPPLIED);
    await this.mustFindParkTenant(scope, dto.park_tenant_id);
    if (dto.receipt_file_id) await this.mustFindFile(scope, dto.receipt_file_id);
    const payCode = await this.resolvePayCode(scope, actor.sub, dto.pay_code);
    await this.assertPayCodeAvailable(scope, payCode);
    const entity = this.paymentsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: payCode,
      payCode,
      parkTenantId: dto.park_tenant_id,
      payTime: new Date(dto.pay_time),
      payMethod: dto.pay_method,
      payAmount: this.decimal(payAmount),
      unappliedAmount: this.decimal(payAmount),
      payerName: this.emptyToNull(dto.payer_name),
      bankSerial: this.emptyToNull(dto.bank_serial),
      receiptFileId: dto.receipt_file_id ?? null,
      status: PAYMENT_STATUS_UNAPPLIED,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.paymentsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_payment", saved);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingPaymentDto): Promise<LeasingPaymentEntity> {
    const entity = await this.findOne(scope, id, actor);
    const appliedAmount = await this.sumAppliedAmount(scope, entity.id);
    const nextPayAmount = this.toNumber(dto.pay_amount ?? entity.payAmount);
    if (nextPayAmount <= 0) throw new BadRequestException("pay_amount must be greater than 0");
    if (nextPayAmount + 0.000001 < appliedAmount) {
      throw new BadRequestException("pay_amount cannot be less than applied amount");
    }
    const nextParkTenantId = dto.park_tenant_id ?? entity.parkTenantId;
    if (appliedAmount > 0 && nextParkTenantId !== entity.parkTenantId) {
      throw new BadRequestException("Applied payment cannot change park_tenant_id");
    }
    await this.mustFindParkTenant(scope, nextParkTenantId);
    const nextUnappliedAmount = nextPayAmount - appliedAmount;
    await this.validateDictionaryValues(scope, dto.pay_method ?? entity.payMethod, this.derivePaymentStatus(nextPayAmount, nextUnappliedAmount));
    if (dto.receipt_file_id) await this.mustFindFile(scope, dto.receipt_file_id);
    if (dto.pay_code && dto.pay_code !== entity.payCode) {
      await this.assertPayCodeAvailable(scope, dto.pay_code, entity.id);
    }
    Object.assign(entity, {
      payCode: dto.pay_code ?? entity.payCode,
      code: dto.pay_code ?? entity.code,
      parkTenantId: nextParkTenantId,
      payTime: dto.pay_time ? new Date(dto.pay_time) : entity.payTime,
      payMethod: dto.pay_method ?? entity.payMethod,
      payAmount: this.decimal(nextPayAmount),
      unappliedAmount: this.decimal(nextUnappliedAmount),
      payerName: dto.payer_name === undefined ? entity.payerName : this.emptyToNull(dto.payer_name),
      bankSerial: dto.bank_serial === undefined ? entity.bankSerial : this.emptyToNull(dto.bank_serial),
      receiptFileId: dto.receipt_file_id === undefined ? entity.receiptFileId : dto.receipt_file_id ?? null,
      status: this.derivePaymentStatus(nextPayAmount, nextUnappliedAmount),
      remark: dto.remark === undefined ? entity.remark : this.emptyToNull(dto.remark),
      updateBy: actor.sub
    });
    const saved = await this.paymentsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_payment", saved);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    const appliedAmount = await this.sumAppliedAmount(scope, entity.id);
    if (appliedAmount > 0) {
      throw new BadRequestException("Applied payment cannot be deleted directly");
    }
    entity.isDeleted = true;
    entity.status = PAYMENT_STATUS_VOID;
    entity.updateBy = actor.sub;
    await this.paymentsRepository.save(entity);
    return { id };
  }

  async apply(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ApplyLeasingPaymentDto): Promise<LeasingPaymentEntity> {
    await this.findOne(scope, id, actor);
    const seenReceivableIds = new Set<string>();
    for (const item of dto.applications) {
      if (seenReceivableIds.has(item.receivable_id)) {
        throw new BadRequestException("Duplicate receivable_id in applications");
      }
      seenReceivableIds.add(item.receivable_id);
      if (this.toNumber(item.applied_amount) <= 0) {
        throw new BadRequestException("applied_amount must be greater than 0");
      }
    }

    await this.paymentsRepository.manager.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(LeasingPaymentEntity);
      const payment = await paymentRepository
        .createQueryBuilder("payment")
        .setLock("pessimistic_write")
        .where("payment.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("payment.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("payment.id = :id", { id })
        .andWhere("payment.is_deleted = false")
        .getOne();
      if (!payment) throw new NotFoundException("Leasing payment not found");
      if (payment.status === PAYMENT_STATUS_VOID) {
        throw new BadRequestException("Voided payment cannot be applied");
      }
      let unappliedAmount = this.toNumber(payment.unappliedAmount);
      const totalApplied = dto.applications.reduce((sum, item) => sum + this.toNumber(item.applied_amount), 0);
      if (totalApplied > unappliedAmount + 0.000001) {
        throw new BadRequestException("applied_amount exceeds payment unapplied amount");
      }

      for (const item of dto.applications) {
        const appliedAmount = this.toNumber(item.applied_amount);
        const receivable = await manager.getRepository(LeasingReceivableEntity)
          .createQueryBuilder("receivable")
          .setLock("pessimistic_write")
          .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
          .andWhere("receivable.id = :receivableId", { receivableId: item.receivable_id })
          .andWhere("receivable.is_deleted = false")
          .getOne();
        if (!receivable) throw new NotFoundException("Leasing receivable not found");
        if (receivable.parkTenantId !== payment.parkTenantId) {
          throw new BadRequestException("Receivable does not belong to the payment park_tenant_id");
        }
        const currentRemain = this.toNumber(receivable.amountRemain);
        if (appliedAmount > currentRemain + 0.000001) {
          throw new BadRequestException("applied_amount exceeds receivable amount_remain");
        }

        await manager.getRepository(LeasingPaymentReceivableEntity).save(manager.getRepository(LeasingPaymentReceivableEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          paymentId: payment.id,
          receivableId: receivable.id,
          appliedAmount: this.decimal(appliedAmount),
          createBy: actor.sub,
          updateBy: actor.sub
        }));

        const beforeStatus = receivable.status;
        const nextPaid = this.toNumber(receivable.amountPaid) + appliedAmount;
        const nextRemain = this.calculateAmountRemain(
          this.toNumber(receivable.amountDue),
          this.toNumber(receivable.lateFee),
          nextPaid,
          this.toNumber(receivable.amountWaived)
        );
        const overdueDays = this.calculateOverdueDays(receivable.dueDate, nextRemain);
        const nextStatus = this.deriveReceivableStatus(nextPaid, nextRemain, overdueDays);
        Object.assign(receivable, {
          amountPaid: this.decimal(nextPaid),
          amountRemain: this.decimal(nextRemain),
          overdueDays,
          status: nextStatus,
          updateBy: actor.sub
        });
        await manager.getRepository(LeasingReceivableEntity).save(receivable);
        await this.createReceivableStatusLog(manager, scope, actor, receivable, beforeStatus, nextStatus, "收款核销更新应收状态");
        unappliedAmount -= appliedAmount;
      }

      Object.assign(payment, {
        unappliedAmount: this.decimal(unappliedAmount),
        status: this.derivePaymentStatus(this.toNumber(payment.payAmount), unappliedAmount),
        updateBy: actor.sub
      });
      await paymentRepository.save(payment);
    });

    return this.detail(scope, id, actor);
  }

  async listApplications(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingPaymentReceivableEntity[]> {
    await this.findOne(scope, id, actor);
    const rows = await this.applicationsRepository
      .createQueryBuilder("application")
      .leftJoinAndSelect("application.receivable", "receivable")
      .where("application.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("application.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("application.payment_id = :paymentId", { paymentId: id })
      .andWhere("application.is_deleted = false")
      .orderBy("application.create_time", "DESC")
      .getMany();
    const securedReceivables = await this.fieldPolicyService.applyFieldPoliciesToList(
      scope,
      actor,
      "leasing",
      "leasing_receivable",
      rows.map((row) => row.receivable)
    );
    rows.forEach((row, index) => {
      row.receivable = securedReceivables[index] ?? row.receivable;
    });
    return rows;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingPaymentEntity> {
    return this.paymentsRepository
      .createQueryBuilder("payment")
      .distinct(true)
      .leftJoinAndSelect("payment.parkTenant", "parkTenant")
      .leftJoin(LeasingPaymentReceivableEntity, "paymentApplication", "paymentApplication.paymentId = payment.id AND paymentApplication.isDeleted = false")
      .leftJoin(LeasingReceivableEntity, "receivable", "receivable.id = paymentApplication.receivableId AND receivable.isDeleted = false")
      .leftJoin("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("payment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("payment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("payment.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingPaymentEntity> {
    const builder = this.scopedBuilder(scope).andWhere("payment.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Leasing payment not found");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingPaymentEntity>, query: LeasingPaymentQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("payment.pay_code ILIKE :keyword")
          .orWhere("payment.code ILIKE :keyword")
          .orWhere("payment.payer_name ILIKE :keyword")
          .orWhere("payment.bank_serial ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.park_tenant_id) builder.andWhere("payment.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.contract_id) builder.andWhere("receivable.contract_id = :contractId", { contractId: query.contract_id });
    if (query.pay_method) builder.andWhere("payment.pay_method = :payMethod", { payMethod: query.pay_method });
    if (query.status) builder.andWhere("payment.status = :status", { status: query.status });
    if (query.pay_start) builder.andWhere("payment.pay_time >= :payStart", { payStart: `${query.pay_start}T00:00:00.000Z` });
    if (query.pay_end) builder.andWhere("payment.pay_time <= :payEnd", { payEnd: `${query.pay_end}T23:59:59.999Z` });
  }

  private applySort(builder: SelectQueryBuilder<LeasingPaymentEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("payment.payTime", "DESC").addOrderBy("payment.updateTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("payment.payTime", "DESC").addOrderBy("payment.updateTime", "DESC");
      return;
    }
    builder.orderBy(`payment.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingPaymentEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "payment", "park_id", parkFilter, "paymentParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "payment", "park_tenant_id", tenantCompanyFilter, "paymentParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter);
  }

  private applyOwnerDataScope(
    builder: SelectQueryBuilder<LeasingPaymentEntity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter
  ): void {
    if (contractOwnerFilter.unrestricted) return;

    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "payment.create_by IN (:...paymentOwnerScopeIds)", params: { paymentOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "receivable.create_by IN (:...paymentReceivableOwnerScopeIds)", params: { paymentReceivableOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "contract.create_by IN (:...paymentContractOwnerScopeIds)", params: { paymentContractOwnerScopeIds: contractOwnerFilter.allowed_ids } });
    }

    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: "sourceLead.id IS NOT NULL" });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "sourceLead.follow_user_id IN (:...paymentCustomerOwnerScopeIds)", params: { paymentCustomerOwnerScopeIds: customerOwnerFilter.allowed_ids } });
    }

    if (clauses.length === 0) {
      builder.andWhere("1 = 0");
      return;
    }

    builder.andWhere(new Brackets((qb) => {
      clauses.forEach((clause, index) => {
        if (index === 0) {
          qb.where(clause.sql, clause.params);
        } else {
          qb.orWhere(clause.sql, clause.params);
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

  private async mustFindParkTenant(scope: TenantParkScope, parkTenantId: string): Promise<ParkTenantEntity> {
    const entity = await this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.id = :parkTenantId", { parkTenantId })
      .andWhere("parkTenant.is_deleted = false")
      .getOne();
    if (!entity) throw new NotFoundException("Park tenant not found");
    return entity;
  }

  private async mustFindFile(scope: TenantParkScope, fileId: string): Promise<FileEntity> {
    const entity = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id = :fileId", { fileId })
      .andWhere("file.is_deleted = false")
      .getOne();
    if (!entity) throw new NotFoundException("Receipt file not found");
    return entity;
  }

  private async validateDictionaryValues(scope: TenantParkScope, payMethod: string, status: string): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_payment_method", payMethod),
      this.assertDictValue(scope, "leasing_payment_status", status)
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
    if (!exists) throw new BadRequestException(`${dictCode} value is not enabled`);
  }

  private async resolvePayCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    const generated = await this.codeRulesService.generateNext(scope, actorId, "PAYMENT_CODE");
    return generated.code;
  }

  private async assertPayCodeAvailable(scope: TenantParkScope, payCode: string, excludeId?: string): Promise<void> {
    const builder = this.paymentsRepository
      .createQueryBuilder("payment")
      .where("payment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("payment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("payment.pay_code = :payCode", { payCode })
      .andWhere("payment.is_deleted = false");
    if (excludeId) builder.andWhere("payment.id <> :excludeId", { excludeId });
    if (await builder.getExists()) throw new ConflictException("Leasing payment code already exists");
  }

  private async sumAppliedAmount(scope: TenantParkScope, paymentId: string): Promise<number> {
    const result = await this.applicationsRepository
      .createQueryBuilder("application")
      .select("COALESCE(SUM(application.applied_amount), 0)", "sum")
      .where("application.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("application.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("application.payment_id = :paymentId", { paymentId })
      .andWhere("application.is_deleted = false")
      .getRawOne<{ sum: string }>();
    return this.toNumber(result?.sum);
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
      action: "payment_apply",
      reason,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username ?? actor.sub,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private derivePaymentStatus(payAmount: number, unappliedAmount: number): string {
    if (unappliedAmount <= 0) return PAYMENT_STATUS_APPLIED;
    if (unappliedAmount < payAmount) return PAYMENT_STATUS_PARTIAL;
    return PAYMENT_STATUS_UNAPPLIED;
  }

  private deriveReceivableStatus(amountPaid: number, amountRemain: number, overdueDays: number): string {
    if (amountRemain <= 0) return RECEIVABLE_STATUS_PAID;
    if (overdueDays > 0) return amountPaid > 0 ? RECEIVABLE_STATUS_OVERDUE_PARTIAL : RECEIVABLE_STATUS_OVERDUE;
    if (amountPaid > 0) return RECEIVABLE_STATUS_PARTIAL;
    return RECEIVABLE_STATUS_GENERATED;
  }

  private calculateAmountRemain(amountDue: number, lateFee: number, amountPaid: number, amountWaived: number): number {
    const amountRemain = amountDue + lateFee - amountPaid - amountWaived;
    if (amountRemain < -0.000001) {
      throw new BadRequestException("amount_paid plus amount_waived cannot exceed amount_due plus late_fee");
    }
    return Math.max(0, amountRemain);
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
