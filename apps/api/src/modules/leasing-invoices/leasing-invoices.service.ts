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
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import type { CreateLeasingInvoiceDto, LeasingInvoiceReceivableInputDto } from "./dto/create-leasing-invoice.dto";
import type { LeasingInvoiceQueryDto } from "./dto/leasing-invoice-query.dto";
import type { UpdateLeasingInvoiceDto } from "./dto/update-leasing-invoice.dto";
import { LeasingInvoiceReceivableEntity } from "./entities/leasing-invoice-receivable.entity";
import { LeasingInvoiceEntity } from "./entities/leasing-invoice.entity";

const INVOICE_STATUS_NONE = "10";
const INVOICE_STATUS_PARTIAL = "20";
const INVOICE_STATUS_INVOICED = "30";
const INVOICE_STATUS_VOID = "90";
const AMOUNT_TOLERANCE = 0.010001;
const SORT_COLUMNS = new Set(["invoiceCode", "invoiceDate", "amount", "status", "updateTime", "createTime"]);

interface AllocationRow {
  receivable: LeasingReceivableEntity;
  invoiceAmount: number;
}

@Injectable()
export class LeasingInvoicesService {
  constructor(
    @InjectRepository(LeasingInvoiceEntity)
    private readonly invoicesRepository: Repository<LeasingInvoiceEntity>,
    @InjectRepository(LeasingInvoiceReceivableEntity)
    private readonly invoiceReceivablesRepository: Repository<LeasingInvoiceReceivableEntity>,
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

  async list(scope: TenantParkScope, query: LeasingInvoiceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingInvoiceEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_invoice", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingInvoiceEntity> {
    const invoice = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_invoice", invoice);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingInvoiceDto): Promise<LeasingInvoiceEntity> {
    const amount = this.toNumber(dto.amount);
    const taxRate = this.toNumber(dto.tax_rate);
    if (amount <= 0) throw new BadRequestException("amount must be greater than 0");
    if (taxRate < 0) throw new BadRequestException("tax_rate cannot be negative");
    if (!dto.receivables?.length) throw new BadRequestException("Invoice must link at least one receivable");
    await this.validateDictionaryValues(scope, dto.invoice_type, dto.status ?? INVOICE_STATUS_INVOICED);
    await this.mustFindParkTenant(scope, dto.park_tenant_id);
    if (dto.file_id) await this.mustFindFile(scope, dto.file_id);
    const invoiceCode = await this.resolveInvoiceCode(scope, actor.sub, dto.invoice_code);
    await this.assertInvoiceCodeAvailable(scope, invoiceCode);

    let savedId = "";
    await this.invoicesRepository.manager.transaction(async (manager) => {
      const allocations = await this.validateAllocations(manager, scope, dto.park_tenant_id, dto.receivables, amount, null);
      const invoice = await manager.getRepository(LeasingInvoiceEntity).save(manager.getRepository(LeasingInvoiceEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: invoiceCode,
        invoiceCode,
        parkTenantId: dto.park_tenant_id,
        invoiceType: dto.invoice_type,
        buyerName: dto.buyer_name,
        buyerTaxNo: this.emptyToNull(dto.buyer_tax_no),
        amount: this.decimal(amount),
        taxRate: this.decimalFour(taxRate),
        invoiceNo: this.emptyToNull(dto.invoice_no),
        invoiceDate: this.dateOnly(dto.invoice_date),
        fileId: dto.file_id ?? null,
        status: dto.status ?? INVOICE_STATUS_INVOICED,
        remark: this.emptyToNull(dto.remark),
        createBy: actor.sub,
        updateBy: actor.sub
      }));
      savedId = invoice.id;
      await this.saveAllocations(manager, scope, actor, invoice.id, allocations);
      await this.recalculateReceivableInvoiceStatuses(manager, scope, actor, allocations.map((item) => item.receivable.id), "发票登记更新应收开票状态");
    });

    return this.detail(scope, savedId, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingInvoiceDto): Promise<LeasingInvoiceEntity> {
    const entity = await this.findOne(scope, id, actor);
    const nextParkTenantId = dto.park_tenant_id ?? entity.parkTenantId;
    const nextInvoiceType = dto.invoice_type ?? entity.invoiceType;
    const nextStatus = dto.status ?? entity.status;
    const nextAmount = this.toNumber(dto.amount ?? entity.amount);
    const nextTaxRate = this.toNumber(dto.tax_rate ?? entity.taxRate);
    if (nextAmount <= 0) throw new BadRequestException("amount must be greater than 0");
    if (nextTaxRate < 0) throw new BadRequestException("tax_rate cannot be negative");
    await this.validateDictionaryValues(scope, nextInvoiceType, nextStatus);
    await this.mustFindParkTenant(scope, nextParkTenantId);
    if (dto.file_id) await this.mustFindFile(scope, dto.file_id);
    if (dto.invoice_code && dto.invoice_code !== entity.invoiceCode) {
      await this.assertInvoiceCodeAvailable(scope, dto.invoice_code, entity.id);
    }
    const allocationInputs = dto.receivables ?? await this.currentAllocationInputs(scope, entity.id);
    if (!allocationInputs.length) throw new BadRequestException("Invoice must link at least one receivable");

    await this.invoicesRepository.manager.transaction(async (manager) => {
      const invoice = await this.lockInvoice(manager, scope, id);
      const previousReceivableIds = await this.currentReceivableIds(manager, scope, invoice.id);
      const allocations = await this.validateAllocations(manager, scope, nextParkTenantId, allocationInputs, nextAmount, invoice.id);
      Object.assign(invoice, {
        invoiceCode: dto.invoice_code ?? invoice.invoiceCode,
        code: dto.invoice_code ?? invoice.code,
        parkTenantId: nextParkTenantId,
        invoiceType: nextInvoiceType,
        buyerName: dto.buyer_name ?? invoice.buyerName,
        buyerTaxNo: dto.buyer_tax_no === undefined ? invoice.buyerTaxNo : this.emptyToNull(dto.buyer_tax_no),
        amount: this.decimal(nextAmount),
        taxRate: this.decimalFour(nextTaxRate),
        invoiceNo: dto.invoice_no === undefined ? invoice.invoiceNo : this.emptyToNull(dto.invoice_no),
        invoiceDate: dto.invoice_date ? this.dateOnly(dto.invoice_date) : invoice.invoiceDate,
        fileId: dto.file_id === undefined ? invoice.fileId : dto.file_id ?? null,
        status: nextStatus,
        remark: dto.remark === undefined ? invoice.remark : this.emptyToNull(dto.remark),
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingInvoiceEntity).save(invoice);

      if (dto.receivables !== undefined) {
        await manager.getRepository(LeasingInvoiceReceivableEntity).update(
          { tenantId: scope.tenantId, parkId: scope.parkId, invoiceId: invoice.id, isDeleted: false },
          { isDeleted: true, updateBy: actor.sub }
        );
        await this.saveAllocations(manager, scope, actor, invoice.id, allocations);
      }
      const touchedReceivableIds = [...new Set([...previousReceivableIds, ...allocations.map((item) => item.receivable.id)])];
      await this.recalculateReceivableInvoiceStatuses(manager, scope, actor, touchedReceivableIds, "发票修改更新应收开票状态");
    });

    return this.detail(scope, id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    await this.findOne(scope, id, actor);
    await this.invoicesRepository.manager.transaction(async (manager) => {
      const invoice = await this.lockInvoice(manager, scope, id);
      const receivableIds = await this.currentReceivableIds(manager, scope, invoice.id);
      Object.assign(invoice, {
        isDeleted: true,
        status: INVOICE_STATUS_VOID,
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingInvoiceEntity).save(invoice);
      await manager.getRepository(LeasingInvoiceReceivableEntity).update(
        { tenantId: scope.tenantId, parkId: scope.parkId, invoiceId: invoice.id, isDeleted: false },
        { isDeleted: true, updateBy: actor.sub }
      );
      await this.recalculateReceivableInvoiceStatuses(manager, scope, actor, receivableIds, "发票删除恢复应收开票状态");
    });
    return { id };
  }

  async listReceivables(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingInvoiceReceivableEntity[]> {
    await this.findOne(scope, id, actor);
    const rows = await this.invoiceReceivablesRepository
      .createQueryBuilder("invoiceReceivable")
      .leftJoinAndSelect("invoiceReceivable.receivable", "receivable")
      .leftJoinAndSelect("receivable.contract", "contract")
      .where("invoiceReceivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoiceReceivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoiceReceivable.invoice_id = :invoiceId", { invoiceId: id })
      .andWhere("invoiceReceivable.is_deleted = false")
      .orderBy("invoiceReceivable.create_time", "DESC")
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

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingInvoiceEntity> {
    return this.invoicesRepository
      .createQueryBuilder("invoice")
      .distinct(true)
      .leftJoinAndSelect("invoice.parkTenant", "parkTenant")
      .leftJoinAndSelect("invoice.file", "file")
      .leftJoin(LeasingInvoiceReceivableEntity, "invoiceReceivable", "invoiceReceivable.invoiceId = invoice.id AND invoiceReceivable.isDeleted = false")
      .leftJoin(LeasingReceivableEntity, "receivable", "receivable.id = invoiceReceivable.receivableId AND receivable.isDeleted = false")
      .leftJoin("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("invoice.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoice.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoice.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingInvoiceEntity> {
    const builder = this.scopedBuilder(scope).andWhere("invoice.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Leasing invoice not found");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingInvoiceEntity>, query: LeasingInvoiceQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(new Brackets((qb) => {
        qb.where("invoice.invoice_code ILIKE :keyword")
          .orWhere("invoice.code ILIKE :keyword")
          .orWhere("invoice.invoice_no ILIKE :keyword")
          .orWhere("invoice.buyer_name ILIKE :keyword")
          .orWhere("invoice.buyer_tax_no ILIKE :keyword")
          .orWhere("parkTenant.company_name ILIKE :keyword");
      })).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.park_tenant_id) builder.andWhere("invoice.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.contract_id) builder.andWhere("receivable.contract_id = :contractId", { contractId: query.contract_id });
    if (query.invoice_type) builder.andWhere("invoice.invoice_type = :invoiceType", { invoiceType: query.invoice_type });
    if (query.status) builder.andWhere("invoice.status = :status", { status: query.status });
    if (query.invoice_start) builder.andWhere("invoice.invoice_date >= :invoiceStart", { invoiceStart: query.invoice_start });
    if (query.invoice_end) builder.andWhere("invoice.invoice_date <= :invoiceEnd", { invoiceEnd: query.invoice_end });
  }

  private applySort(builder: SelectQueryBuilder<LeasingInvoiceEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("invoice.invoiceDate", "DESC").addOrderBy("invoice.updateTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("invoice.invoiceDate", "DESC").addOrderBy("invoice.updateTime", "DESC");
      return;
    }
    builder.orderBy(`invoice.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingInvoiceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "invoice", "park_id", parkFilter, "invoiceParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "invoice", "park_tenant_id", tenantCompanyFilter, "invoiceParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter);
  }

  private applyOwnerDataScope(
    builder: SelectQueryBuilder<LeasingInvoiceEntity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter
  ): void {
    if (contractOwnerFilter.unrestricted) return;

    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "invoice.create_by IN (:...invoiceOwnerScopeIds)", params: { invoiceOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "receivable.create_by IN (:...invoiceReceivableOwnerScopeIds)", params: { invoiceReceivableOwnerScopeIds: contractOwnerFilter.allowed_ids } });
      clauses.push({ sql: "contract.create_by IN (:...invoiceContractOwnerScopeIds)", params: { invoiceContractOwnerScopeIds: contractOwnerFilter.allowed_ids } });
    }

    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: "sourceLead.id IS NOT NULL" });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({ sql: "sourceLead.follow_user_id IN (:...invoiceCustomerOwnerScopeIds)", params: { invoiceCustomerOwnerScopeIds: customerOwnerFilter.allowed_ids } });
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
    if (!entity) throw new NotFoundException("Invoice file not found");
    return entity;
  }

  private async validateDictionaryValues(scope: TenantParkScope, invoiceType: string, status: string): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_invoice_type", invoiceType),
      this.assertDictValue(scope, "leasing_invoice_status", status)
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

  private async resolveInvoiceCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;
    const generated = await this.codeRulesService.generateNext(scope, actorId, "INVOICE_CODE");
    return generated.code;
  }

  private async assertInvoiceCodeAvailable(scope: TenantParkScope, invoiceCode: string, excludeId?: string): Promise<void> {
    const builder = this.invoicesRepository
      .createQueryBuilder("invoice")
      .where("invoice.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoice.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoice.invoice_code = :invoiceCode", { invoiceCode })
      .andWhere("invoice.is_deleted = false");
    if (excludeId) builder.andWhere("invoice.id <> :excludeId", { excludeId });
    if (await builder.getExists()) throw new ConflictException("Leasing invoice code already exists");
  }

  private async validateAllocations(
    manager: EntityManager,
    scope: TenantParkScope,
    parkTenantId: string,
    inputs: LeasingInvoiceReceivableInputDto[],
    invoiceAmount: number,
    currentInvoiceId: string | null
  ): Promise<AllocationRow[]> {
    const seen = new Set<string>();
    const rows: AllocationRow[] = [];
    let total = 0;
    for (const item of inputs) {
      const invoiceAmountForRow = this.toNumber(item.invoice_amount);
      if (invoiceAmountForRow <= 0) throw new BadRequestException("invoice_amount must be greater than 0");
      if (seen.has(item.receivable_id)) throw new BadRequestException("Duplicate receivable_id in invoice receivables");
      seen.add(item.receivable_id);
      const receivable = await manager.getRepository(LeasingReceivableEntity)
        .createQueryBuilder("receivable")
        .setLock("pessimistic_write")
        .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("receivable.id = :receivableId", { receivableId: item.receivable_id })
        .andWhere("receivable.is_deleted = false")
        .getOne();
      if (!receivable) throw new NotFoundException("Leasing receivable not found");
      if (receivable.parkTenantId !== parkTenantId) {
        throw new BadRequestException("Receivable does not belong to the invoice park_tenant_id");
      }
      const alreadyInvoiced = await this.sumInvoicedAmount(manager, scope, receivable.id, currentInvoiceId);
      const amountDue = this.toNumber(receivable.amountDue);
      if (alreadyInvoiced + invoiceAmountForRow > amountDue + AMOUNT_TOLERANCE) {
        throw new BadRequestException("invoice_amount exceeds receivable uninvoiced amount");
      }
      total += invoiceAmountForRow;
      rows.push({ receivable, invoiceAmount: invoiceAmountForRow });
    }
    if (Math.abs(total - invoiceAmount) > AMOUNT_TOLERANCE) {
      throw new BadRequestException("Sum of invoice_amount must equal invoice amount");
    }
    return rows;
  }

  private async saveAllocations(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, invoiceId: string, rows: AllocationRow[]): Promise<void> {
    await manager.getRepository(LeasingInvoiceReceivableEntity).save(rows.map((row) => manager.getRepository(LeasingInvoiceReceivableEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      invoiceId,
      receivableId: row.receivable.id,
      invoiceAmount: this.decimal(row.invoiceAmount),
      createBy: actor.sub,
      updateBy: actor.sub
    })));
  }

  private async recalculateReceivableInvoiceStatuses(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivableIds: string[],
    reason: string
  ): Promise<void> {
    for (const receivableId of [...new Set(receivableIds)]) {
      const receivable = await manager.getRepository(LeasingReceivableEntity)
        .createQueryBuilder("receivable")
        .setLock("pessimistic_write")
        .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("receivable.id = :receivableId", { receivableId })
        .andWhere("receivable.is_deleted = false")
        .getOne();
      if (!receivable) continue;
      const beforeInvoiceStatus = receivable.invoiceStatus;
      const invoiced = await this.sumInvoicedAmount(manager, scope, receivable.id, null);
      const amountDue = this.toNumber(receivable.amountDue);
      receivable.invoiceStatus = this.deriveInvoiceStatus(invoiced, amountDue);
      await manager.getRepository(LeasingReceivableEntity).save(receivable);
      if (beforeInvoiceStatus !== receivable.invoiceStatus) {
        await this.createReceivableStatusLog(manager, scope, actor, receivable, reason, beforeInvoiceStatus, receivable.invoiceStatus);
      }
    }
  }

  private async createReceivableStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receivable: LeasingReceivableEntity,
    reason: string,
    beforeInvoiceStatus: string,
    afterInvoiceStatus: string
  ): Promise<void> {
    const repository = manager.getRepository(LeasingReceivableStatusLogEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      receivableId: receivable.id,
      beforeStatus: receivable.status,
      afterStatus: receivable.status,
      action: "invoice",
      reason: `${reason}（开票状态 ${beforeInvoiceStatus} -> ${afterInvoiceStatus}）`,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username ?? actor.sub,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async sumInvoicedAmount(manager: EntityManager, scope: TenantParkScope, receivableId: string, excludeInvoiceId: string | null): Promise<number> {
    const builder = manager.getRepository(LeasingInvoiceReceivableEntity)
      .createQueryBuilder("invoiceReceivable")
      .innerJoin("invoiceReceivable.invoice", "invoice")
      .select("COALESCE(SUM(invoiceReceivable.invoice_amount), 0)", "sum")
      .where("invoiceReceivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoiceReceivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoiceReceivable.receivable_id = :receivableId", { receivableId })
      .andWhere("invoiceReceivable.is_deleted = false")
      .andWhere("invoice.is_deleted = false")
      .andWhere("invoice.status <> :voidStatus", { voidStatus: INVOICE_STATUS_VOID });
    if (excludeInvoiceId) builder.andWhere("invoiceReceivable.invoice_id <> :excludeInvoiceId", { excludeInvoiceId });
    const result = await builder.getRawOne<{ sum: string }>();
    return this.toNumber(result?.sum);
  }

  private deriveInvoiceStatus(invoicedAmount: number, amountDue: number): string {
    if (invoicedAmount <= 0) return INVOICE_STATUS_NONE;
    if (invoicedAmount + AMOUNT_TOLERANCE >= amountDue) return INVOICE_STATUS_INVOICED;
    return INVOICE_STATUS_PARTIAL;
  }

  private async currentAllocationInputs(scope: TenantParkScope, invoiceId: string): Promise<LeasingInvoiceReceivableInputDto[]> {
    const rows = await this.invoiceReceivablesRepository
      .createQueryBuilder("invoiceReceivable")
      .where("invoiceReceivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoiceReceivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoiceReceivable.invoice_id = :invoiceId", { invoiceId })
      .andWhere("invoiceReceivable.is_deleted = false")
      .getMany();
    return rows.map((row) => ({ receivable_id: row.receivableId, invoice_amount: this.toNumber(row.invoiceAmount) }));
  }

  private async currentReceivableIds(manager: EntityManager, scope: TenantParkScope, invoiceId: string): Promise<string[]> {
    const rows = await manager.getRepository(LeasingInvoiceReceivableEntity)
      .createQueryBuilder("invoiceReceivable")
      .select("invoiceReceivable.receivable_id", "receivableId")
      .where("invoiceReceivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoiceReceivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoiceReceivable.invoice_id = :invoiceId", { invoiceId })
      .andWhere("invoiceReceivable.is_deleted = false")
      .getRawMany<{ receivableId: string }>();
    return rows.map((row) => row.receivableId);
  }

  private async lockInvoice(manager: EntityManager, scope: TenantParkScope, id: string): Promise<LeasingInvoiceEntity> {
    const invoice = await manager.getRepository(LeasingInvoiceEntity)
      .createQueryBuilder("invoice")
      .setLock("pessimistic_write")
      .where("invoice.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoice.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoice.id = :id", { id })
      .andWhere("invoice.is_deleted = false")
      .getOne();
    if (!invoice) throw new NotFoundException("Leasing invoice not found");
    return invoice;
  }

  private dateOnly(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }

  private decimal(value: number): string {
    return Number(value).toFixed(2);
  }

  private decimalFour(value: number): string {
    return Number(value).toFixed(4);
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
