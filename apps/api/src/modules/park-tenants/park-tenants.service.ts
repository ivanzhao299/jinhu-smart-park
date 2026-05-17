import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import { LeasingInvoiceReceivableEntity } from "../leasing-invoices/entities/leasing-invoice-receivable.entity";
import { LeasingInvoiceEntity } from "../leasing-invoices/entities/leasing-invoice.entity";
import { LeasingPaymentReceivableEntity } from "../leasing-payments/entities/leasing-payment-receivable.entity";
import { LeasingPaymentEntity } from "../leasing-payments/entities/leasing-payment.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import type { ChangeParkTenantRiskDto } from "./dto/change-park-tenant-risk.dto";
import type { CreateParkTenantDto } from "./dto/create-park-tenant.dto";
import type { ParkTenantQueryDto } from "./dto/park-tenant-query.dto";
import type { UpdateParkTenantDto } from "./dto/update-park-tenant.dto";
import { ParkTenantContactEntity } from "./entities/park-tenant-contact.entity";
import { ParkTenantQualificationEntity } from "./entities/park-tenant-qualification.entity";
import { ParkTenantRiskLogEntity } from "./entities/park-tenant-risk-log.entity";
import { ParkTenantEntity } from "./entities/park-tenant.entity";

const SORT_COLUMNS = new Set([
  "parkTenantCode",
  "companyName",
  "unifiedCreditCode",
  "tenantType",
  "riskLevel",
  "status",
  "checkInDate",
  "updateTime",
  "createTime"
]);

@Injectable()
export class ParkTenantsService {
  constructor(
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(ParkTenantRiskLogEntity)
    private readonly riskLogsRepository: Repository<ParkTenantRiskLogEntity>,
    @InjectRepository(ParkTenantContactEntity)
    private readonly contactsRepository: Repository<ParkTenantContactEntity>,
    @InjectRepository(ParkTenantQualificationEntity)
    private readonly qualificationsRepository: Repository<ParkTenantQualificationEntity>,
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivablesRepository: Repository<LeasingReceivableEntity>,
    @InjectRepository(LeasingPaymentEntity)
    private readonly paymentsRepository: Repository<LeasingPaymentEntity>,
    @InjectRepository(LeasingInvoiceEntity)
    private readonly invoicesRepository: Repository<LeasingInvoiceEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: ParkTenantQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<ParkTenantEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant", entity);
  }

  async tenant360(scope: TenantParkScope, id: string, actor: JwtPrincipal) {
    const profile = await this.detail(scope, id, actor);
    const receivablesBuilder = this.receivablesRepository
      .createQueryBuilder("receivable")
      .leftJoinAndSelect("receivable.contract", "contract")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("receivable.park_tenant_id = :parkTenantId", { parkTenantId: id })
      .andWhere("receivable.is_deleted = false")
      .orderBy("receivable.dueDate", "DESC")
      .addOrderBy("receivable.createTime", "DESC");
    const paymentsBuilder = this.paymentsRepository
      .createQueryBuilder("payment")
      .distinct(true)
      .leftJoin(LeasingPaymentReceivableEntity, "paymentApplication", "paymentApplication.paymentId = payment.id AND paymentApplication.isDeleted = false")
      .leftJoin(LeasingReceivableEntity, "paymentReceivable", "paymentReceivable.id = paymentApplication.receivableId AND paymentReceivable.isDeleted = false")
      .leftJoin("paymentReceivable.contract", "paymentContract")
      .leftJoin("paymentContract.sourceLead", "paymentSourceLead")
      .where("payment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("payment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("payment.park_tenant_id = :parkTenantId", { parkTenantId: id })
      .andWhere("payment.is_deleted = false")
      .orderBy("payment.payTime", "DESC")
      .addOrderBy("payment.createTime", "DESC");
    const invoicesBuilder = this.invoicesRepository
      .createQueryBuilder("invoice")
      .distinct(true)
      .leftJoin(LeasingInvoiceReceivableEntity, "invoiceApplication", "invoiceApplication.invoiceId = invoice.id AND invoiceApplication.isDeleted = false")
      .leftJoin(LeasingReceivableEntity, "invoiceReceivable", "invoiceReceivable.id = invoiceApplication.receivableId AND invoiceReceivable.isDeleted = false")
      .leftJoin("invoiceReceivable.contract", "invoiceContract")
      .leftJoin("invoiceContract.sourceLead", "invoiceSourceLead")
      .where("invoice.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("invoice.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("invoice.park_tenant_id = :parkTenantId", { parkTenantId: id })
      .andWhere("invoice.is_deleted = false")
      .orderBy("invoice.invoiceDate", "DESC")
      .addOrderBy("invoice.createTime", "DESC");
    await Promise.all([
      this.applyFinanceDataScope(receivablesBuilder, scope, actor, {
        rootAlias: "receivable",
        parameterPrefix: "tenant360Receivable",
        ownerAliases: ["receivable"],
        contractAlias: "contract",
        sourceLeadAlias: "sourceLead"
      }),
      this.applyFinanceDataScope(paymentsBuilder, scope, actor, {
        rootAlias: "payment",
        parameterPrefix: "tenant360Payment",
        ownerAliases: ["payment", "paymentReceivable"],
        contractAlias: "paymentContract",
        sourceLeadAlias: "paymentSourceLead"
      }),
      this.applyFinanceDataScope(invoicesBuilder, scope, actor, {
        rootAlias: "invoice",
        parameterPrefix: "tenant360Invoice",
        ownerAliases: ["invoice", "invoiceReceivable"],
        contractAlias: "invoiceContract",
        sourceLeadAlias: "invoiceSourceLead"
      })
    ]);
    const [
      contactsRaw,
      qualificationsRaw,
      riskLogsRaw,
      contractsRaw,
      receivablesAllRaw,
      paymentsAllRaw,
      invoicesAllRaw
    ] = await Promise.all([
      this.contactsRepository
        .createQueryBuilder("contact")
        .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contact.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("contact.is_deleted = false")
        .orderBy("contact.is_primary", "DESC")
        .addOrderBy("contact.create_time", "ASC")
        .getMany(),
      this.qualificationsRepository
        .createQueryBuilder("qualification")
        .leftJoinAndSelect("qualification.file", "file")
        .where("qualification.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("qualification.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("qualification.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("qualification.is_deleted = false")
        .orderBy("qualification.expire_date", "ASC", "NULLS LAST")
        .addOrderBy("qualification.create_time", "DESC")
        .getMany(),
      this.riskLogsRepository
        .createQueryBuilder("riskLog")
        .where("riskLog.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("riskLog.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("riskLog.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("riskLog.is_deleted = false")
        .orderBy("riskLog.op_time", "DESC")
        .addOrderBy("riskLog.create_time", "DESC")
        .getMany(),
      this.contractsRepository
        .createQueryBuilder("contract")
        .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contract.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("contract.is_deleted = false")
        .orderBy("contract.start_date", "DESC")
        .addOrderBy("contract.create_time", "DESC")
        .getMany(),
      receivablesBuilder.getMany(),
      paymentsBuilder.getMany(),
      invoicesBuilder.getMany()
    ]);
    const receivablesRaw = receivablesAllRaw.slice(0, 5);
    const paymentsRaw = paymentsAllRaw.slice(0, 5);
    const invoicesRaw = invoicesAllRaw.slice(0, 5);
    const receivableSummaryRaw = this.buildReceivableSummary(receivablesAllRaw);
    const paymentSummaryRaw = this.buildPaymentSummary(paymentsAllRaw);
    const invoiceSummaryRaw = this.buildInvoiceSummary(invoicesAllRaw);
    const [contacts, qualifications, riskLogs, contracts, receivables, payments, invoices, receivablesSummary, paymentsSummary, invoicesSummary] = await Promise.all([
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_contact", contactsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_qualification", qualificationsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_risk_log", riskLogsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(
        scope,
        actor,
        "leasing",
        "leasing_contract",
        contractsRaw.map((contract) => ({
          id: contract.id,
          contract_code: contract.contractCode,
          contract_name: contract.contractName,
          start_date: contract.startDate,
          end_date: contract.endDate,
          total_amount: contract.totalAmount,
          status: contract.status
        }))
      ),
      this.fieldPolicyService.applyFieldPoliciesToList(
        scope,
        actor,
        "leasing",
        "leasing_receivable",
        receivablesRaw.map((receivable) => ({
          id: receivable.id,
          ar_code: receivable.arCode,
          contract_id: receivable.contractId,
          contract_code: receivable.contract?.contractCode ?? null,
          fee_type: receivable.feeType,
          period_start: receivable.periodStart,
          period_end: receivable.periodEnd,
          due_date: receivable.dueDate,
          amount_due: receivable.amountDue,
          amount_paid: receivable.amountPaid,
          amount_waived: receivable.amountWaived,
          amount_remain: receivable.amountRemain,
          late_fee: receivable.lateFee,
          overdue_days: receivable.overdueDays,
          invoice_status: receivable.invoiceStatus,
          status: receivable.status
        }))
      ),
      this.fieldPolicyService.applyFieldPoliciesToList(
        scope,
        actor,
        "leasing",
        "leasing_payment",
        paymentsRaw.map((payment) => ({
          id: payment.id,
          pay_code: payment.payCode,
          pay_time: payment.payTime,
          pay_method: payment.payMethod,
          pay_amount: payment.payAmount,
          unapplied_amount: payment.unappliedAmount,
          payer_name: payment.payerName,
          status: payment.status
        }))
      ),
      this.fieldPolicyService.applyFieldPoliciesToList(
        scope,
        actor,
        "leasing",
        "leasing_invoice",
        invoicesRaw.map((invoice) => ({
          id: invoice.id,
          invoice_code: invoice.invoiceCode,
          invoice_type: invoice.invoiceType,
          invoice_no: invoice.invoiceNo,
          invoice_date: invoice.invoiceDate,
          amount: invoice.amount,
          status: invoice.status
        }))
      ),
      this.secureReceivableSummary(scope, actor, receivableSummaryRaw),
      this.securePaymentSummary(scope, actor, paymentSummaryRaw),
      this.secureInvoiceSummary(scope, actor, invoiceSummaryRaw)
    ]);
    return {
      profile: this.toTenant360Profile(profile),
      contacts,
      qualifications: this.sanitizeQualificationFiles(qualifications),
      riskLogs,
      relatedUnits: [],
      contracts: {
        available: true,
        items: contracts,
        summary: {
          contract_count: contractsRaw.length,
          active_contract_count: contractsRaw.filter((contract) => contract.status === "75").length
        }
      },
      receivables: { available: true, summary: receivablesSummary, recent_items: receivables },
      payments: { available: true, summary: paymentsSummary, recent_items: payments },
      invoices: { available: true, summary: invoicesSummary, recent_items: invoices },
      workorders: { available: false, summary: null },
      hazards: { available: false, summary: null },
      energy: { available: false, summary: null }
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateParkTenantDto): Promise<ParkTenantEntity> {
    const parkTenantCode = await this.resolveParkTenantCode(scope, actor.sub, dto.parkTenantCode);
    await this.assertParkTenantCodeAvailable(scope, parkTenantCode);
    const unifiedCreditCode = this.emptyToNull(dto.unifiedCreditCode);
    if (unifiedCreditCode) {
      await this.assertUnifiedCreditCodeAvailable(scope, unifiedCreditCode);
    }
    const entity = this.parkTenantsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: parkTenantCode,
      parkTenantCode,
      companyName: dto.companyName.trim(),
      unifiedCreditCode,
      legalPerson: this.emptyToNull(dto.legalPerson),
      legalPersonId: this.emptyToNull(dto.legalPersonId),
      contactName: this.emptyToNull(dto.contactName),
      contactMobile: this.emptyToNull(dto.contactMobile),
      contactEmail: this.emptyToNull(dto.contactEmail),
      industryCode: this.emptyToNull(dto.industryCode),
      industryDetail: this.emptyToNull(dto.industryDetail),
      businessScope: this.emptyToNull(dto.businessScope),
      tenantType: this.emptyToNull(dto.tenantType),
      riskLevel: this.emptyToNull(dto.riskLevel),
      riskTags: this.normalizeRiskTags(dto.riskTags),
      checkInDate: dto.checkInDate ?? null,
      checkOutDate: dto.checkOutDate ?? null,
      status: dto.status ?? "10",
      sourceType: dto.sourceType ?? "manual",
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.parkTenantsRepository.save(entity);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateParkTenantDto): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (dto.parkTenantCode && dto.parkTenantCode !== entity.parkTenantCode) {
      await this.assertParkTenantCodeAvailable(scope, dto.parkTenantCode, id);
      entity.parkTenantCode = dto.parkTenantCode;
      entity.code = dto.parkTenantCode;
    }
    if (dto.unifiedCreditCode !== undefined) {
      const nextCreditCode = this.emptyToNull(dto.unifiedCreditCode);
      if (nextCreditCode && nextCreditCode !== entity.unifiedCreditCode) {
        await this.assertUnifiedCreditCodeAvailable(scope, nextCreditCode, id);
      }
      entity.unifiedCreditCode = nextCreditCode;
    }
    if (dto.companyName !== undefined) entity.companyName = dto.companyName.trim();
    if (dto.legalPerson !== undefined) entity.legalPerson = this.emptyToNull(dto.legalPerson);
    if (dto.legalPersonId !== undefined) entity.legalPersonId = this.emptyToNull(dto.legalPersonId);
    if (dto.contactName !== undefined) entity.contactName = this.emptyToNull(dto.contactName);
    if (dto.contactMobile !== undefined) entity.contactMobile = this.emptyToNull(dto.contactMobile);
    if (dto.contactEmail !== undefined) entity.contactEmail = this.emptyToNull(dto.contactEmail);
    if (dto.industryCode !== undefined) entity.industryCode = this.emptyToNull(dto.industryCode);
    if (dto.industryDetail !== undefined) entity.industryDetail = this.emptyToNull(dto.industryDetail);
    if (dto.businessScope !== undefined) entity.businessScope = this.emptyToNull(dto.businessScope);
    if (dto.tenantType !== undefined) entity.tenantType = this.emptyToNull(dto.tenantType);
    if (dto.riskLevel !== undefined) entity.riskLevel = this.emptyToNull(dto.riskLevel);
    if (dto.riskTags !== undefined) entity.riskTags = this.normalizeRiskTags(dto.riskTags);
    if (dto.checkInDate !== undefined) entity.checkInDate = dto.checkInDate;
    if (dto.checkOutDate !== undefined) entity.checkOutDate = dto.checkOutDate;
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.sourceType !== undefined) entity.sourceType = dto.sourceType;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    return this.parkTenantsRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.parkTenantsRepository.save(entity);
    return { id };
  }

  async changeRiskLevel(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ChangeParkTenantRiskDto): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    const riskLevel = await this.resolveRiskLevel(scope, dto.risk_level);
    const afterRiskTags = this.normalizeRiskTags(dto.risk_tags);
    if (riskLevel.sortOrder === 40 && afterRiskTags.length === 0) {
      throw new BadRequestException("risk_tags is required for high risk tenants");
    }

    const beforeRiskLevel = entity.riskLevel;
    const beforeRiskTags = [...(entity.riskTags ?? [])];
    entity.riskLevel = riskLevel.itemValue;
    entity.riskTags = afterRiskTags;
    entity.updateBy = actor.sub;

    await this.parkTenantsRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ParkTenantEntity).save(entity);
      await manager.getRepository(ParkTenantRiskLogEntity).save(
        manager.getRepository(ParkTenantRiskLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          parkTenantId: entity.id,
          beforeRiskLevel,
          afterRiskLevel: riskLevel.itemValue,
          beforeRiskTags,
          afterRiskTags,
          reason: dto.reason.trim(),
          operatorId: actor.sub,
          operatorName: actor.realName ?? actor.username,
          opTime: new Date(),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
    });

    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant", entity);
  }

  async riskLogs(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<ParkTenantRiskLogEntity[]> {
    await this.findOne(scope, id, actor);
    return this.riskLogsRepository
      .createQueryBuilder("riskLog")
      .where("riskLog.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("riskLog.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("riskLog.park_tenant_id = :parkTenantId", { parkTenantId: id })
      .andWhere("riskLog.is_deleted = false")
      .orderBy("riskLog.op_time", "DESC")
      .addOrderBy("riskLog.create_time", "DESC")
      .getMany();
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<ParkTenantEntity> {
    return this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<ParkTenantEntity> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<ParkTenantEntity>, query: ParkTenantQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("parkTenant.park_tenant_code ILIKE :keyword")
            .orWhere("parkTenant.company_name ILIKE :keyword")
            .orWhere("parkTenant.unified_credit_code ILIKE :keyword")
            .orWhere("parkTenant.contact_name ILIKE :keyword")
            .orWhere("parkTenant.contact_mobile ILIKE :keyword");
        })
      ).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.status) builder.andWhere("parkTenant.status = :status", { status: query.status });
    if (query.tenant_type) builder.andWhere("parkTenant.tenant_type = :tenantType", { tenantType: query.tenant_type });
    if (query.risk_level) builder.andWhere("parkTenant.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.industry_code) builder.andWhere("parkTenant.industry_code = :industryCode", { industryCode: query.industry_code });
  }

  private applySort(builder: SelectQueryBuilder<ParkTenantEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("parkTenant.updateTime", "DESC").addOrderBy("parkTenant.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("parkTenant.updateTime", "DESC").addOrderBy("parkTenant.createTime", "DESC");
      return;
    }
    builder.orderBy(`parkTenant.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<ParkTenantEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (actor) {
      await Promise.all([
        this.dataScopeService.buildScopeFilter(actor, "park"),
        this.dataScopeService.buildScopeFilter(actor, "tenant_company")
      ]);
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", "parkTenant", { tenantCompany: "id" });
  }

  private async applyFinanceDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    scope: TenantParkScope,
    actor: JwtPrincipal | undefined,
    config: {
      rootAlias: string;
      parameterPrefix: string;
      ownerAliases: string[];
      contractAlias: string;
      sourceLeadAlias: string;
    }
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, config.rootAlias, "park_id", parkFilter, `${config.parameterPrefix}ParkScopeIds`);
    this.applyConfiguredIdScopeFilter(builder, config.rootAlias, "park_tenant_id", tenantCompanyFilter, `${config.parameterPrefix}ParkTenantScopeIds`);
    this.applyFinanceOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter, config);
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

  private applyFinanceOwnerDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter,
    config: {
      parameterPrefix: string;
      ownerAliases: string[];
      contractAlias: string;
      sourceLeadAlias: string;
    }
  ): void {
    if (contractOwnerFilter.unrestricted) return;

    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
      config.ownerAliases.forEach((alias, index) => {
        clauses.push({
          sql: `${alias}.create_by IN (:...${config.parameterPrefix}OwnerScopeIds${index})`,
          params: { [`${config.parameterPrefix}OwnerScopeIds${index}`]: contractOwnerFilter.allowed_ids }
        });
      });
      clauses.push({
        sql: `${config.contractAlias}.create_by IN (:...${config.parameterPrefix}ContractOwnerScopeIds)`,
        params: { [`${config.parameterPrefix}ContractOwnerScopeIds`]: contractOwnerFilter.allowed_ids }
      });
    }

    if (customerOwnerFilter.unrestricted) {
      clauses.push({ sql: `${config.sourceLeadAlias}.id IS NOT NULL` });
    } else if (customerOwnerFilter.allowed_ids.length > 0) {
      clauses.push({
        sql: `${config.sourceLeadAlias}.follow_user_id IN (:...${config.parameterPrefix}CustomerOwnerScopeIds)`,
        params: { [`${config.parameterPrefix}CustomerOwnerScopeIds`]: customerOwnerFilter.allowed_ids }
      });
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

  private async resolveParkTenantCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateNext(scope, actorId, "PARK_TENANT_CODE");
    return generated.code;
  }

  private async assertParkTenantCodeAvailable(scope: TenantParkScope, code: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.park_tenant_code = :code", { code });
    if (excludeId) builder.andWhere("parkTenant.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Park tenant code already exists");
    }
  }

  private async assertUnifiedCreditCodeAvailable(scope: TenantParkScope, unifiedCreditCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.unified_credit_code = :unifiedCreditCode", { unifiedCreditCode });
    if (excludeId) builder.andWhere("parkTenant.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Unified credit code already exists");
    }
  }

  private normalizeRiskTags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  private async resolveRiskLevel(scope: TenantParkScope, rawRiskLevel: string): Promise<Pick<DictItemEntity, "itemValue" | "sortOrder">> {
    const riskLevel = rawRiskLevel.trim();
    if (!riskLevel) {
      throw new BadRequestException("risk_level is required");
    }
    const item = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode: "park_tenant_risk_level" })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere(new Brackets((qb) => {
        qb.where("dictItem.item_value = :riskLevel").orWhere("CAST(dictItem.sort_order AS text) = :riskLevel");
      }))
      .setParameter("riskLevel", riskLevel)
      .getOne();
    if (!item) {
      throw new BadRequestException("risk_level is not in park_tenant_risk_level dictionary");
    }
    return { itemValue: item.itemValue, sortOrder: item.sortOrder };
  }

  private emptyToNull(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private toTenant360Profile(profile: Partial<ParkTenantEntity>) {
    return {
      id: profile.id,
      code: profile.code ?? null,
      parkTenantCode: profile.parkTenantCode,
      companyName: profile.companyName,
      unifiedCreditCode: profile.unifiedCreditCode ?? null,
      legalPerson: profile.legalPerson ?? null,
      legalPersonId: profile.legalPersonId ?? null,
      contactName: profile.contactName ?? null,
      contactMobile: profile.contactMobile ?? null,
      contactEmail: profile.contactEmail ?? null,
      industryCode: profile.industryCode ?? null,
      industryDetail: profile.industryDetail ?? null,
      businessScope: profile.businessScope ?? null,
      tenantType: profile.tenantType ?? null,
      riskLevel: profile.riskLevel ?? null,
      riskTags: profile.riskTags ?? [],
      checkInDate: profile.checkInDate ?? null,
      checkOutDate: profile.checkOutDate ?? null,
      status: profile.status,
      sourceType: profile.sourceType,
      remark: profile.remark ?? null,
      createTime: profile.createTime,
      updateTime: profile.updateTime
    };
  }

  private sanitizeQualificationFiles(qualifications: ParkTenantQualificationEntity[]): ParkTenantQualificationEntity[] {
    return qualifications.map((qualification) => {
      const record = qualification as ParkTenantQualificationEntity & Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, "fileId")) {
        record.file = null;
      }
      return record;
    });
  }

  private buildReceivableSummary(rows: LeasingReceivableEntity[]) {
    const totals = rows.reduce(
      (acc, row) => {
        const remain = this.toNumber(row.amountRemain);
        acc.totalAmountDue += this.toNumber(row.amountDue);
        acc.totalAmountPaid += this.toNumber(row.amountPaid);
        acc.totalAmountRemain += remain;
        if (remain > 0 && this.isOverdue(row)) {
          acc.overdueAmount += remain;
          acc.overdueCount += 1;
        }
        return acc;
      },
      { totalAmountDue: 0, totalAmountPaid: 0, totalAmountRemain: 0, overdueAmount: 0, overdueCount: 0 }
    );
    return {
      totalAmountDue: this.decimal(totals.totalAmountDue),
      totalAmountPaid: this.decimal(totals.totalAmountPaid),
      totalAmountRemain: this.decimal(totals.totalAmountRemain),
      overdueAmount: this.decimal(totals.overdueAmount),
      overdueCount: String(totals.overdueCount)
    };
  }

  private buildPaymentSummary(rows: LeasingPaymentEntity[]) {
    const totals = rows.reduce(
      (acc, row) => {
        acc.totalPaymentAmount += this.toNumber(row.payAmount);
        acc.unappliedAmount += this.toNumber(row.unappliedAmount);
        return acc;
      },
      { totalPaymentAmount: 0, unappliedAmount: 0 }
    );
    return {
      totalPaymentAmount: this.decimal(totals.totalPaymentAmount),
      unappliedAmount: this.decimal(totals.unappliedAmount)
    };
  }

  private buildInvoiceSummary(rows: LeasingInvoiceEntity[]) {
    const invoiceAmount = rows.reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    return {
      invoiceCount: String(rows.length),
      invoiceAmount: this.decimal(invoiceAmount)
    };
  }

  private isOverdue(row: LeasingReceivableEntity): boolean {
    if (this.toNumber(row.amountRemain) <= 0) return false;
    if (row.overdueDays > 0) return true;
    const due = new Date(`${row.dueDate.slice(0, 10)}T00:00:00Z`).getTime();
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
    return Number.isFinite(due) && due < today;
  }

  private async secureReceivableSummary(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    raw?: {
      totalAmountDue?: string | null;
      totalAmountPaid?: string | null;
      totalAmountRemain?: string | null;
      overdueAmount?: string | null;
      overdueCount?: string | null;
    } | null
  ) {
    const secured = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_receivable", {
      amountDue: this.decimal(raw?.totalAmountDue),
      amountPaid: this.decimal(raw?.totalAmountPaid),
      amountRemain: this.decimal(raw?.totalAmountRemain),
      overdueAmount: this.decimal(raw?.overdueAmount)
    });
    return {
      total_amount_due: secured.amountDue ?? null,
      total_amount_paid: secured.amountPaid ?? null,
      total_amount_remain: secured.amountRemain ?? null,
      overdue_amount: secured.overdueAmount ?? null,
      overdue_count: Number(raw?.overdueCount ?? 0)
    };
  }

  private async securePaymentSummary(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    raw?: { totalPaymentAmount?: string | null; unappliedAmount?: string | null } | null
  ) {
    const secured = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_payment", {
      payAmount: this.decimal(raw?.totalPaymentAmount),
      unappliedAmount: this.decimal(raw?.unappliedAmount)
    });
    return {
      total_payment_amount: secured.payAmount ?? null,
      unapplied_amount: secured.unappliedAmount ?? null
    };
  }

  private async secureInvoiceSummary(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    raw?: { invoiceCount?: string | null; invoiceAmount?: string | null } | null
  ) {
    const secured = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_invoice", {
      amount: this.decimal(raw?.invoiceAmount)
    });
    return {
      invoice_count: Number(raw?.invoiceCount ?? 0),
      invoice_amount: secured.amount ?? null
    };
  }

  private decimal(value: unknown): string {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
