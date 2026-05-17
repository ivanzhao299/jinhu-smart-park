import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { LeasingLeadEntity } from "../leasing-leads/entities/leasing-lead.entity";
import { LeasingQuoteEntity } from "../leasing-leads/entities/leasing-quote.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { CreateContractDraftFromQuoteDto } from "./dto/create-contract-draft-from-quote.dto";
import type { CreateLeasingContractUnitDto } from "./dto/create-leasing-contract-unit.dto";
import type { CreateLeasingContractDto } from "./dto/create-leasing-contract.dto";
import type { LeasingContractQueryDto } from "./dto/leasing-contract-query.dto";
import type { LeasingContractStatusLogQueryDto } from "./dto/leasing-contract-status-log-query.dto";
import type {
  ArchiveLeasingContractDto,
  EffectiveLeasingContractDto,
  LeasingContractApprovalActionDto,
  RejectLeasingContractDto
} from "./dto/leasing-contract-approval-action.dto";
import type { UpdateLeasingContractUnitDto } from "./dto/update-leasing-contract-unit.dto";
import type { UpdateLeasingContractDto } from "./dto/update-leasing-contract.dto";
import { LeasingContractStatusLogEntity } from "./entities/leasing-contract-status-log.entity";
import { LeasingContractUnitEntity } from "./entities/leasing-contract-unit.entity";
import { LeasingContractEntity, type LeasingContractApproveRecord } from "./entities/leasing-contract.entity";

const CONTRACT_STATUS_DRAFT = "10";
const CONTRACT_STATUS_SUBMITTED = "20";
const CONTRACT_STATUS_APPROVING = "30";
const CONTRACT_STATUS_REJECTED = "50";
const CONTRACT_STATUS_PENDING_SIGN = "60";
const CONTRACT_STATUS_SIGNED = "70";
const CONTRACT_STATUS_EFFECTIVE = "75";
const CONTRACT_STATUS_TERMINATED = "90";
const CONTRACT_STATUS_VOID = "91";
const QUOTE_STATUS_APPROVED = "40";
const DEFAULT_CONTRACT_TYPE = "10";
const LOCKED_CORE_STATUSES = new Set([
  CONTRACT_STATUS_SUBMITTED,
  CONTRACT_STATUS_APPROVING,
  "40",
  CONTRACT_STATUS_PENDING_SIGN,
  "70",
  CONTRACT_STATUS_EFFECTIVE,
  CONTRACT_STATUS_TERMINATED,
  CONTRACT_STATUS_VOID
]);
const CONTRACT_EDITABLE_STATUSES = new Set([CONTRACT_STATUS_DRAFT, CONTRACT_STATUS_REJECTED]);
const CONTRACT_UNIT_EDIT_LOCKED_MESSAGE = "Current contract status cannot edit unit links in current phase";
const DEFAULT_BINDABLE_UNIT_STATUSES = new Set([10, 20, 40]);
const UNIT_STATUS_RENTED = 30;
const UNIT_STATUS_MAINTENANCE = 50;
const UNIT_STATUS_SELF_USE = 60;
const SORT_COLUMNS = new Set([
  "contractCode",
  "contractName",
  "contractType",
  "startDate",
  "endDate",
  "status",
  "totalAmount",
  "rentPerMonth",
  "updateTime",
  "createTime"
]);

const CORE_UPDATE_FIELDS = new Set<keyof UpdateLeasingContractDto>([
  "contract_code",
  "contract_name",
  "contract_type",
  "park_tenant_id",
  "source_type",
  "source_lead_id",
  "source_quote_id",
  "start_date",
  "end_date",
  "sign_date",
  "effective_date",
  "rent_unit_price",
  "total_area",
  "rent_per_month",
  "total_amount",
  "deposit_months",
  "deposit_amount",
  "free_rent_months",
  "payment_period",
  "payment_advance_days",
  "late_fee_rule",
  "property_fee_unit_price",
  "other_fee_rules",
  "status"
]);

@Injectable()
export class LeasingContractsService {
  constructor(
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(LeasingContractUnitEntity)
    private readonly contractUnitsRepository: Repository<LeasingContractUnitEntity>,
    @InjectRepository(LeasingContractStatusLogEntity)
    private readonly contractStatusLogsRepository: Repository<LeasingContractStatusLogEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(LeasingLeadEntity)
    private readonly leadsRepository: Repository<LeasingLeadEntity>,
    @InjectRepository(LeasingQuoteEntity)
    private readonly quotesRepository: Repository<LeasingQuoteEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingContractQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingContractEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_contract", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingContractEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingContractDto): Promise<LeasingContractEntity> {
    if (dto.status && dto.status !== CONTRACT_STATUS_DRAFT) {
      throw new BadRequestException("Contract CRUD can only create draft contracts");
    }
    this.assertDateRange(dto.start_date, dto.end_date);
    await this.validateDictionaryValues(scope, dto.contract_type, dto.payment_period, CONTRACT_STATUS_DRAFT);
    await this.mustFindParkTenant(scope, dto.park_tenant_id);
    await this.validateOptionalSource(scope, dto.source_lead_id, dto.source_quote_id);
    await this.validateOptionalFiles(scope, dto.contract_pdf_file_id, dto.scan_pdf_file_id);
    const contractCode = await this.resolveContractCode(scope, actor.sub, dto.contract_code);
    await this.assertContractCodeAvailable(scope, contractCode);
    const entity = this.contractsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: contractCode,
      contractCode,
      contractName: dto.contract_name.trim(),
      contractType: this.emptyToNull(dto.contract_type),
      parkTenantId: dto.park_tenant_id,
      sourceType: dto.source_type ?? "manual",
      sourceLeadId: dto.source_lead_id ?? null,
      sourceQuoteId: dto.source_quote_id ?? null,
      startDate: this.dateOnly(dto.start_date),
      endDate: this.dateOnly(dto.end_date),
      signDate: dto.sign_date ? this.dateOnly(dto.sign_date) : null,
      effectiveDate: dto.effective_date ? this.dateOnly(dto.effective_date) : null,
      rentUnitPrice: this.money(dto.rent_unit_price),
      totalArea: this.money(dto.total_area),
      rentPerMonth: this.money(dto.rent_per_month),
      totalAmount: this.money(dto.total_amount),
      depositMonths: this.money(dto.deposit_months),
      depositAmount: this.money(dto.deposit_amount),
      freeRentMonths: this.money(dto.free_rent_months),
      paymentPeriod: this.emptyToNull(dto.payment_period),
      paymentAdvanceDays: dto.payment_advance_days ?? 0,
      lateFeeRule: this.emptyToNull(dto.late_fee_rule),
      propertyFeeUnitPrice: this.money(dto.property_fee_unit_price),
      otherFeeRules: dto.other_fee_rules ?? [],
      status: CONTRACT_STATUS_DRAFT,
      approveRecords: [],
      contractPdfFileId: dto.contract_pdf_file_id ?? null,
      scanPdfFileId: dto.scan_pdf_file_id ?? null,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const opTime = new Date();
    let saved!: LeasingContractEntity;
    await this.contractsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingContractEntity).save(entity);
      await manager.getRepository(LeasingContractStatusLogEntity).save(
        manager.getRepository(LeasingContractStatusLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          contractId: saved.id,
          beforeStatus: null,
          afterStatus: CONTRACT_STATUS_DRAFT,
          action: "create",
          reason: "创建合同草稿",
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          opTime,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: null
        })
      );
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", saved);
  }

  async createDraftFromApprovedQuote(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    quoteId: string,
    dto: CreateContractDraftFromQuoteDto
  ): Promise<LeasingContractEntity> {
    const quote = await this.findQuoteForDraft(scope, actor, quoteId);
    if (quote.quoteStatus !== QUOTE_STATUS_APPROVED) {
      throw new BadRequestException("Only approved quotes can create contract drafts");
    }
    if (!quote.leadId || !quote.unitId) {
      throw new BadRequestException("Quote must be linked to a lead and a unit");
    }
    const lead = quote.lead ?? (await this.findLeadForQuoteDraft(scope, actor, quote.leadId));
    const parkTenantId = lead.parkTenantId;
    if (!parkTenantId) {
      throw new BadRequestException("Please convert the lead to a park tenant before creating contract draft");
    }
    const unit = await this.findUnit(scope, actor, quote.unitId);
    const dateRange = this.resolveDraftDateRange(dto.start_date, dto.end_date);
    await this.validateDictionaryValues(scope, DEFAULT_CONTRACT_TYPE, quote.paymentPeriod, CONTRACT_STATUS_DRAFT);
    await this.mustFindParkTenant(scope, parkTenantId);
    const contractCode = await this.resolveContractCode(scope, actor.sub);
    await this.assertContractCodeAvailable(scope, contractCode);

    let savedContract!: LeasingContractEntity;
    await this.contractsRepository.manager.transaction(async (manager) => {
      const duplicateDraft = await manager
        .getRepository(LeasingContractEntity)
        .createQueryBuilder("contract")
        .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contract.source_quote_id = :quoteId", { quoteId })
        .andWhere("contract.is_deleted = false")
        .getExists();
      if (duplicateDraft) {
        throw new ConflictException("Approved quote has already created a contract draft");
      }

      const area = this.resolveArea(actor, undefined, unit);
      const rentUnitPrice = this.toNumber(quote.quotePrice);
      const rentPerMonth = area * rentUnitPrice;
      const depositMonths = this.toNumber(quote.depositMonths);
      const freeRentMonths = this.toNumber(quote.freeRentMonths);
      const billableMonths = Math.max(0, this.approximateNaturalMonths(dateRange.startDate, dateRange.endDate) - freeRentMonths);
      const contract = manager.getRepository(LeasingContractEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: contractCode,
        contractCode,
        contractName: dto.contract_name?.trim() || `${lead.customerName}租赁合同`,
        contractType: DEFAULT_CONTRACT_TYPE,
        parkTenantId,
        sourceType: "quote",
        sourceLeadId: quote.leadId,
        sourceQuoteId: quote.id,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rentUnitPrice: this.decimal(rentUnitPrice),
        totalArea: this.decimal(area),
        rentPerMonth: this.decimal(rentPerMonth),
        totalAmount: this.decimal(rentPerMonth * billableMonths),
        depositMonths: this.decimal(depositMonths),
        depositAmount: this.decimal(rentPerMonth * depositMonths),
        freeRentMonths: this.decimal(freeRentMonths),
        paymentPeriod: quote.paymentPeriod,
        paymentAdvanceDays: dto.payment_advance_days ?? 0,
        lateFeeRule: this.emptyToNull(dto.late_fee_rule),
        propertyFeeUnitPrice: this.decimal(this.toNumber(quote.propertyFeePrice)),
        otherFeeRules: [],
        status: CONTRACT_STATUS_DRAFT,
        approveRecords: [],
        contractPdfFileId: null,
        scanPdfFileId: null,
        remark: this.emptyToNull(quote.remark),
        createBy: actor.sub,
        updateBy: actor.sub
      });
      savedContract = await manager.getRepository(LeasingContractEntity).save(contract);
      await manager.getRepository(LeasingContractStatusLogEntity).save(
        manager.getRepository(LeasingContractStatusLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          contractId: savedContract.id,
          beforeStatus: null,
          afterStatus: CONTRACT_STATUS_DRAFT,
          action: "create",
          reason: "报价生成合同草稿",
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          opTime: new Date(),
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: null
        })
      );

      await this.assertUnitBindable(scope, actor, savedContract.id, unit, dateRange.startDate, dateRange.endDate);
      const relation = manager.getRepository(LeasingContractUnitEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        contractId: savedContract.id,
        unitId: unit.id,
        unitCode: unit.unitCode,
        unitName: unit.unitName,
        area: this.decimal(area),
        rentUnitPrice: this.decimal(rentUnitPrice),
        rentAmountPerMonth: this.decimal(rentPerMonth),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        status: 1,
        remark: null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      await manager.getRepository(LeasingContractUnitEntity).save(relation);
    });

    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", savedContract);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingContractDto): Promise<LeasingContractEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertEditablePayload(entity, dto);
    const nextStartDate = dto.start_date ? this.dateOnly(dto.start_date) : entity.startDate;
    const nextEndDate = dto.end_date ? this.dateOnly(dto.end_date) : entity.endDate;
    this.assertDateRange(nextStartDate, nextEndDate);
    await this.validateDictionaryValues(scope, dto.contract_type, dto.payment_period, dto.status);
    if (dto.park_tenant_id) await this.mustFindParkTenant(scope, dto.park_tenant_id);
    await this.validateOptionalSource(scope, dto.source_lead_id, dto.source_quote_id);
    await this.validateOptionalFiles(scope, dto.contract_pdf_file_id, dto.scan_pdf_file_id);
    if (dto.contract_code && dto.contract_code !== entity.contractCode) {
      await this.assertContractCodeAvailable(scope, dto.contract_code, id);
      entity.contractCode = dto.contract_code;
      entity.code = dto.contract_code;
    }
    if (dto.contract_name !== undefined) entity.contractName = dto.contract_name.trim();
    if (dto.contract_type !== undefined) entity.contractType = this.emptyToNull(dto.contract_type);
    if (dto.park_tenant_id !== undefined) entity.parkTenantId = dto.park_tenant_id;
    if (dto.source_type !== undefined) entity.sourceType = dto.source_type;
    if (dto.source_lead_id !== undefined) entity.sourceLeadId = dto.source_lead_id ?? null;
    if (dto.source_quote_id !== undefined) entity.sourceQuoteId = dto.source_quote_id ?? null;
    if (dto.start_date !== undefined) entity.startDate = nextStartDate;
    if (dto.end_date !== undefined) entity.endDate = nextEndDate;
    if (dto.sign_date !== undefined) entity.signDate = dto.sign_date ? this.dateOnly(dto.sign_date) : null;
    if (dto.effective_date !== undefined) entity.effectiveDate = dto.effective_date ? this.dateOnly(dto.effective_date) : null;
    if (dto.rent_unit_price !== undefined) entity.rentUnitPrice = this.money(dto.rent_unit_price);
    if (dto.total_area !== undefined) entity.totalArea = this.money(dto.total_area);
    if (dto.rent_per_month !== undefined) entity.rentPerMonth = this.money(dto.rent_per_month);
    if (dto.total_amount !== undefined) entity.totalAmount = this.money(dto.total_amount);
    if (dto.deposit_months !== undefined) entity.depositMonths = this.money(dto.deposit_months);
    if (dto.deposit_amount !== undefined) entity.depositAmount = this.money(dto.deposit_amount);
    if (dto.free_rent_months !== undefined) entity.freeRentMonths = this.money(dto.free_rent_months);
    if (dto.payment_period !== undefined) entity.paymentPeriod = this.emptyToNull(dto.payment_period);
    if (dto.payment_advance_days !== undefined) entity.paymentAdvanceDays = dto.payment_advance_days;
    if (dto.late_fee_rule !== undefined) entity.lateFeeRule = this.emptyToNull(dto.late_fee_rule);
    if (dto.property_fee_unit_price !== undefined) entity.propertyFeeUnitPrice = this.money(dto.property_fee_unit_price);
    if (dto.other_fee_rules !== undefined) entity.otherFeeRules = dto.other_fee_rules;
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.contract_pdf_file_id !== undefined) entity.contractPdfFileId = dto.contract_pdf_file_id ?? null;
    if (dto.scan_pdf_file_id !== undefined) entity.scanPdfFileId = dto.scan_pdf_file_id ?? null;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    const saved = await this.contractsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", saved);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (![CONTRACT_STATUS_DRAFT, CONTRACT_STATUS_VOID].includes(entity.status)) {
      throw new BadRequestException("Only draft or void contracts can be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.contractsRepository.save(entity);
    return { id };
  }

  async submitForApproval(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractApprovalActionDto): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, id, actor);
    if (![CONTRACT_STATUS_DRAFT, CONTRACT_STATUS_REJECTED].includes(contract.status)) {
      throw new BadRequestException("Only draft or rejected contracts can be submitted");
    }
    await this.assertReadyForSubmit(scope, contract);
    return this.changeApprovalStatus(scope, actor, contract, CONTRACT_STATUS_APPROVING, "submit", dto, dto.opinion ?? "提交审批");
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractApprovalActionDto): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, id, actor);
    if (![CONTRACT_STATUS_APPROVING, CONTRACT_STATUS_SUBMITTED].includes(contract.status)) {
      throw new BadRequestException("Only approving contracts can be approved");
    }
    return this.changeApprovalStatus(scope, actor, contract, CONTRACT_STATUS_PENDING_SIGN, "approve", dto, dto.opinion ?? "审批通过");
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RejectLeasingContractDto): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, id, actor);
    if (![CONTRACT_STATUS_APPROVING, CONTRACT_STATUS_SUBMITTED].includes(contract.status)) {
      throw new BadRequestException("Only approving contracts can be rejected");
    }
    return this.changeApprovalStatus(scope, actor, contract, CONTRACT_STATUS_REJECTED, "reject", dto, dto.reject_reason);
  }

  async voidContract(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: LeasingContractApprovalActionDto): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, id, actor);
    if (![CONTRACT_STATUS_DRAFT, CONTRACT_STATUS_REJECTED, CONTRACT_STATUS_APPROVING].includes(contract.status)) {
      throw new BadRequestException("Only draft, rejected, or approving contracts can be voided");
    }
    if (contract.status === CONTRACT_STATUS_EFFECTIVE) {
      throw new BadRequestException("Effective contracts cannot be voided");
    }
    return this.changeApprovalStatus(scope, actor, contract, CONTRACT_STATUS_VOID, "void", dto, dto.opinion ?? "作废合同");
  }

  async archive(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ArchiveLeasingContractDto): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, id, actor);
    if (contract.status !== CONTRACT_STATUS_PENDING_SIGN) {
      throw new BadRequestException("Only pending-sign contracts can be archived");
    }
    await Promise.all([
      this.mustFindContractFile(scope, dto.contract_pdf_file_id),
      this.mustFindContractFile(scope, dto.scan_pdf_file_id)
    ]);
    contract.contractPdfFileId = dto.contract_pdf_file_id;
    contract.scanPdfFileId = dto.scan_pdf_file_id;
    contract.signDate = this.dateOnly(dto.sign_date);
    if (dto.effective_date !== undefined) {
      contract.effectiveDate = dto.effective_date ? this.dateOnly(dto.effective_date) : null;
    }
    if (dto.remark !== undefined) {
      contract.remark = this.emptyToNull(dto.remark);
    }
    return this.changeApprovalStatus(scope, actor, contract, CONTRACT_STATUS_SIGNED, "archive", dto, dto.remark ?? "合同签章归档");
  }

  async listFiles(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<FileEntity[]> {
    const contract = await this.findOne(scope, id, actor);
    const securedContract = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", {
      contractPdfFileId: contract.contractPdfFileId,
      scanPdfFileId: contract.scanPdfFileId
    });
    const ids = [securedContract.contractPdfFileId, securedContract.scanPdfFileId].filter((value): value is string => this.isUuid(value));
    if (ids.length === 0) return [];
    const files = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .orderBy("file.create_time", "ASC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "system", "sys_file", files);
  }

  async listStatusLogs(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contractId: string,
    query: LeasingContractStatusLogQueryDto
  ): Promise<PaginatedResult<LeasingContractStatusLogEntity>> {
    await this.findOne(scope, contractId, actor);
    const [items, total] = await this.contractStatusLogsRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.contract_id = :contractId", { contractId })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async effective(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: EffectiveLeasingContractDto): Promise<LeasingContractEntity> {
    const scopedContract = await this.findOne(scope, id, actor);
    const effectiveDate = this.dateOnly(dto.effective_date);
    let saved!: LeasingContractEntity;

    await this.contractsRepository.manager.transaction(async (manager) => {
      const contract = await manager
        .getRepository(LeasingContractEntity)
        .createQueryBuilder("contract")
        .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contract.id = :id", { id: scopedContract.id })
        .andWhere("contract.is_deleted = false")
        .setLock("pessimistic_write")
        .getOne();
      if (!contract) {
        throw new NotFoundException("Leasing contract not found");
      }
      if (contract.status !== CONTRACT_STATUS_SIGNED) {
        throw new BadRequestException("Only signed contracts can become effective");
      }
      if (!contract.parkTenantId) {
        throw new BadRequestException("Contract must be linked to a park tenant before effective");
      }
      await this.mustFindParkTenant(scope, contract.parkTenantId);

      const relations = await manager
        .getRepository(LeasingContractUnitEntity)
        .createQueryBuilder("rel")
        .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("rel.contract_id = :contractId", { contractId: contract.id })
        .andWhere("rel.status = 1")
        .andWhere("rel.is_deleted = false")
        .getMany();
      if (relations.length === 0) {
        throw new BadRequestException("Contract must link at least one unit before effective");
      }

      const unitIds = [...new Set(relations.map((relation) => relation.unitId))];
      const units = await manager
        .getRepository(UnitEntity)
        .createQueryBuilder("unit")
        .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("unit.id IN (:...unitIds)", { unitIds })
        .andWhere("unit.status = 1")
        .andWhere("unit.is_deleted = false")
        .setLock("pessimistic_write")
        .getMany();
      if (units.length !== unitIds.length) {
        throw new BadRequestException("Contract unit relation contains invalid units");
      }

      const occupied = await manager
        .getRepository(LeasingContractUnitEntity)
        .createQueryBuilder("rel")
        .innerJoin(LeasingContractEntity, "otherContract", "otherContract.id = rel.contract_id")
        .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("rel.unit_id IN (:...unitIds)", { unitIds })
        .andWhere("rel.status = 1")
        .andWhere("rel.is_deleted = false")
        .andWhere("otherContract.is_deleted = false")
        .andWhere("otherContract.status = :effectiveStatus", { effectiveStatus: CONTRACT_STATUS_EFFECTIVE })
        .andWhere("otherContract.id <> :contractId", { contractId: contract.id })
        .andWhere("rel.start_date <= :endDate", { endDate: contract.endDate })
        .andWhere("rel.end_date >= :startDate", { startDate: contract.startDate })
        .getExists();
      if (occupied) {
        throw new ConflictException("Unit is occupied by another effective contract during this period");
      }

      const beforeStatus = contract.status;
      const opTime = new Date();
      const reason = dto.opinion?.trim() || "合同已生效";
      const approveRecord = this.buildApproveRecord(actor, "effective", beforeStatus, CONTRACT_STATUS_EFFECTIVE, opTime, dto, null);

      contract.status = CONTRACT_STATUS_EFFECTIVE;
      contract.effectiveDate = effectiveDate;
      contract.approveRecords = [...(contract.approveRecords ?? []), approveRecord];
      contract.updateBy = actor.sub;
      saved = await manager.getRepository(LeasingContractEntity).save(contract);

      await manager.getRepository(LeasingContractStatusLogEntity).save(
        manager.getRepository(LeasingContractStatusLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          contractId: contract.id,
          beforeStatus,
      afterStatus: CONTRACT_STATUS_EFFECTIVE,
          action: "effective",
          reason,
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          opTime,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: "合同生效"
        })
      );

      for (const unit of units) {
        const beforeUnitStatus = unit.rentalStatus;
        unit.rentalStatus = UNIT_STATUS_RENTED;
        unit.lockReason = null;
        unit.lockExpireTime = null;
        unit.statusUpdateTime = opTime;
        unit.statusUpdateBy = actor.sub;
        unit.updateBy = actor.sub;
        await manager.getRepository(UnitEntity).save(unit);
        await manager.getRepository(UnitStatusLogEntity).save(
          manager.getRepository(UnitStatusLogEntity).create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            unitId: unit.id,
            beforeStatus: beforeUnitStatus,
            afterStatus: UNIT_STATUS_RENTED,
            reason,
            sourceType: "contract",
            operatorId: actor.sub,
            operatorName: this.actorName(actor),
            opTime,
            createBy: actor.sub,
            updateBy: actor.sub,
            remark: `合同生效：${contract.contractCode}`
          })
        );
      }
    });

    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", saved);
  }

  async listUnits(scope: TenantParkScope, actor: JwtPrincipal, contractId: string): Promise<LeasingContractUnitEntity[]> {
    await this.findOne(scope, contractId, actor);
    const items = await this.contractUnitsRepository
      .createQueryBuilder("rel")
      .leftJoinAndSelect("rel.unit", "unit")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.contract_id = :contractId", { contractId })
      .andWhere("rel.is_deleted = false")
      .orderBy("rel.create_time", "ASC")
      .getMany();
    return this.secureContractUnitList(scope, actor, items);
  }

  async createUnitLink(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contractId: string,
    dto: CreateLeasingContractUnitDto
  ): Promise<LeasingContractUnitEntity> {
    const contract = await this.findOne(scope, contractId, actor);
    this.assertCanEditUnitLinks(contract, actor);
    const unit = await this.findUnit(scope, actor, dto.unit_id);
    const relationDates = this.resolveRelationDates(contract, dto.start_date, dto.end_date);
    await this.assertNoDuplicateContractUnit(scope, contractId, unit.id);
    await this.assertUnitBindable(scope, actor, contractId, unit, relationDates.startDate, relationDates.endDate);
    const area = this.resolveArea(actor, dto.area, unit);
    const rentUnitPrice = this.resolveRentUnitPrice(dto.rent_unit_price, contract, unit);
    const relation = this.contractUnitsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      contractId,
      unitId: unit.id,
      unitCode: unit.unitCode,
      unitName: unit.unitName,
      area: this.decimal(area),
      rentUnitPrice: this.decimal(rentUnitPrice),
      rentAmountPerMonth: this.decimal(area * rentUnitPrice),
      startDate: relationDates.startDate,
      endDate: relationDates.endDate,
      status: dto.status ?? 1,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.contractUnitsRepository.save(relation);
    await this.recalculate(scope, actor, contractId);
    saved.unit = unit;
    return this.secureContractUnit(scope, actor, saved);
  }

  async updateUnitLink(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contractId: string,
    relId: string,
    dto: UpdateLeasingContractUnitDto
  ): Promise<LeasingContractUnitEntity> {
    const contract = await this.findOne(scope, contractId, actor);
    this.assertCanEditUnitLinks(contract, actor);
    const relation = await this.findUnitLink(scope, contractId, relId);
    const nextUnit = dto.unit_id && dto.unit_id !== relation.unitId ? await this.findUnit(scope, actor, dto.unit_id) : relation.unit;
    const relationDates = this.resolveRelationDates(
      contract,
      dto.start_date ?? relation.startDate,
      dto.end_date ?? relation.endDate
    );
    if (dto.unit_id && dto.unit_id !== relation.unitId) {
      await this.assertNoDuplicateContractUnit(scope, contractId, nextUnit.id, relId);
    }
    await this.assertUnitBindable(scope, actor, contractId, nextUnit, relationDates.startDate, relationDates.endDate, relId);
    const area = this.resolveArea(actor, dto.area, nextUnit, relation.area);
    const rentUnitPrice = this.resolveRentUnitPrice(dto.rent_unit_price, contract, nextUnit, relation.rentUnitPrice);
    relation.unitId = nextUnit.id;
    relation.unit = nextUnit;
    relation.unitCode = nextUnit.unitCode;
    relation.unitName = nextUnit.unitName;
    relation.area = this.decimal(area);
    relation.rentUnitPrice = this.decimal(rentUnitPrice);
    relation.rentAmountPerMonth = this.decimal(area * rentUnitPrice);
    relation.startDate = relationDates.startDate;
    relation.endDate = relationDates.endDate;
    if (dto.status !== undefined) relation.status = dto.status;
    if (dto.remark !== undefined) relation.remark = this.emptyToNull(dto.remark);
    relation.updateBy = actor.sub;
    const saved = await this.contractUnitsRepository.save(relation);
    await this.recalculate(scope, actor, contractId);
    return this.secureContractUnit(scope, actor, saved);
  }

  async softDeleteUnitLink(scope: TenantParkScope, actor: JwtPrincipal, contractId: string, relId: string): Promise<{ id: string }> {
    const contract = await this.findOne(scope, contractId, actor);
    this.assertCanEditUnitLinks(contract, actor);
    const relation = await this.findUnitLink(scope, contractId, relId);
    relation.isDeleted = true;
    relation.updateBy = actor.sub;
    await this.contractUnitsRepository.save(relation);
    await this.recalculate(scope, actor, contractId);
    return { id: relId };
  }

  async recalculate(scope: TenantParkScope, actor: JwtPrincipal, contractId: string): Promise<LeasingContractEntity> {
    const contract = await this.findOne(scope, contractId, actor);
    this.assertCanEditUnitLinks(contract, actor);
    const activeRelations = await this.contractUnitsRepository
      .createQueryBuilder("rel")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.contract_id = :contractId", { contractId })
      .andWhere("rel.status = 1")
      .andWhere("rel.is_deleted = false")
      .getMany();
    const totalArea = activeRelations.reduce((sum, item) => sum + this.toNumber(item.area), 0);
    const rentPerMonth = activeRelations.reduce((sum, item) => sum + this.toNumber(item.rentAmountPerMonth), 0);
    const billableMonths = Math.max(0, this.approximateNaturalMonths(contract.startDate, contract.endDate) - this.toNumber(contract.freeRentMonths));
    contract.totalArea = this.decimal(totalArea);
    contract.rentPerMonth = this.decimal(rentPerMonth);
    contract.depositAmount = this.decimal(rentPerMonth * this.toNumber(contract.depositMonths));
    contract.totalAmount = this.decimal(rentPerMonth * billableMonths);
    contract.updateBy = actor.sub;
    const saved = await this.contractsRepository.save(contract);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", saved);
  }

  private async assertReadyForSubmit(scope: TenantParkScope, contract: LeasingContractEntity): Promise<void> {
    if (!contract.parkTenantId) {
      throw new BadRequestException("Contract must be linked to a park tenant before submit");
    }
    await this.mustFindParkTenant(scope, contract.parkTenantId);
    this.assertDateRange(contract.startDate, contract.endDate);
    const activeUnitCount = await this.contractUnitsRepository
      .createQueryBuilder("rel")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.contract_id = :contractId", { contractId: contract.id })
      .andWhere("rel.status = 1")
      .andWhere("rel.is_deleted = false")
      .getCount();
    if (activeUnitCount === 0) {
      throw new BadRequestException("Contract must link at least one unit before submit");
    }
    if (this.toNumber(contract.totalArea) <= 0 || this.toNumber(contract.rentPerMonth) <= 0 || this.toNumber(contract.totalAmount) <= 0) {
      throw new BadRequestException("Contract total_area, rent_per_month, and total_amount must be greater than 0 before submit");
    }
  }

  private async changeApprovalStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contract: LeasingContractEntity,
    afterStatus: string,
    action: LeasingContractApproveRecord["action"],
    dto: LeasingContractApprovalActionDto,
    reason: string
  ): Promise<LeasingContractEntity> {
    const beforeStatus = contract.status;
    const opTime = new Date();
    const record = this.buildApproveRecord(actor, action, beforeStatus, afterStatus, opTime, dto, action === "reject" ? reason : null);
    let saved!: LeasingContractEntity;
    await this.contractStatusLogsRepository.manager.transaction(async (manager) => {
      contract.status = afterStatus;
      contract.approveRecords = [...(contract.approveRecords ?? []), record];
      contract.updateBy = actor.sub;
      saved = await manager.getRepository(LeasingContractEntity).save(contract);
      const log = manager.getRepository(LeasingContractStatusLogEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        contractId: contract.id,
        beforeStatus,
        afterStatus,
        action,
        reason: this.emptyToNull(reason),
        operatorId: actor.sub,
        operatorName: this.actorName(actor),
        opTime,
        createBy: actor.sub,
        updateBy: actor.sub,
        remark: null
      });
      await manager.getRepository(LeasingContractStatusLogEntity).save(log);
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_contract", saved);
  }

  private buildApproveRecord(
    actor: JwtPrincipal,
    action: LeasingContractApproveRecord["action"],
    fromStatus: string,
    toStatus: string,
    opTime: Date,
    dto: LeasingContractApprovalActionDto,
    rejectReason?: string | null
  ): LeasingContractApproveRecord {
    return {
      action,
      operatorId: actor.sub,
      operatorName: this.actorName(actor),
      opTime: opTime.toISOString(),
      fromStatus,
      toStatus,
      opinion: dto.opinion ?? null,
      rejectReason: rejectReason ?? null,
      attachments: dto.attachments ?? []
    };
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName?.trim() || actor.username;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingContractEntity> {
    return this.contractsRepository
      .createQueryBuilder("contract")
      .leftJoinAndSelect("contract.parkTenant", "parkTenant")
      .leftJoin("contract.sourceLead", "sourceLead")
      .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contract.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingContractEntity> {
    const builder = this.scopedBuilder(scope).andWhere("contract.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Leasing contract not found");
    }
    return entity;
  }

  private async findQuoteForDraft(scope: TenantParkScope, actor: JwtPrincipal, quoteId: string): Promise<LeasingQuoteEntity> {
    const quote = await this.quotesRepository
      .createQueryBuilder("quote")
      .leftJoinAndSelect("quote.unit", "unit")
      .where("quote.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("quote.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("quote.id = :quoteId", { quoteId })
      .andWhere("quote.is_deleted = false")
      .getOne();
    if (!quote) {
      throw new NotFoundException("Leasing quote not found");
    }
    quote.lead = await this.findLeadForQuoteDraft(scope, actor, quote.leadId);
    return quote;
  }

  private async findLeadForQuoteDraft(scope: TenantParkScope, actor: JwtPrincipal, leadId: string): Promise<LeasingLeadEntity> {
    const builder = this.leadsRepository
      .createQueryBuilder("lead")
      .where("lead.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("lead.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("lead.id = :leadId", { leadId })
      .andWhere("lead.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "customer_owner", "lead", { owner: "follow_user_id" });
    const lead = await builder.getOne();
    if (!lead) {
      throw new NotFoundException("Source leasing lead not found or outside current scope");
    }
    return lead;
  }

  private async findUnitLink(scope: TenantParkScope, contractId: string, relId: string): Promise<LeasingContractUnitEntity> {
    const entity = await this.contractUnitsRepository
      .createQueryBuilder("rel")
      .leftJoinAndSelect("rel.unit", "unit")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.contract_id = :contractId", { contractId })
      .andWhere("rel.id = :relId", { relId })
      .andWhere("rel.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Leasing contract unit relation not found");
    }
    return entity;
  }

  private async findUnit(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<UnitEntity> {
    const builder = this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.id = :unitId", { unitId })
      .andWhere("unit.status = 1")
      .andWhere("unit.is_deleted = false");
    await this.applyUnitLookupDataScope(builder, actor);
    const unit = await builder.getOne();
    if (!unit) {
      throw new BadRequestException("unit_id does not exist or is outside current scope");
    }
    return unit;
  }

  private async assertNoDuplicateContractUnit(scope: TenantParkScope, contractId: string, unitId: string, excludeRelId?: string): Promise<void> {
    const builder = this.contractUnitsRepository
      .createQueryBuilder("rel")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.contract_id = :contractId", { contractId })
      .andWhere("rel.unit_id = :unitId", { unitId })
      .andWhere("rel.status = 1")
      .andWhere("rel.is_deleted = false");
    if (excludeRelId) {
      builder.andWhere("rel.id <> :excludeRelId", { excludeRelId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Unit is already linked to current contract");
    }
  }

  private async assertUnitBindable(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    contractId: string,
    unit: UnitEntity,
    startDate: string,
    endDate: string,
    currentRelId?: string
  ): Promise<void> {
    const currentContractRelationExists = currentRelId
      ? await this.contractUnitsRepository
          .createQueryBuilder("rel")
          .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
          .andWhere("rel.contract_id = :contractId", { contractId })
          .andWhere("rel.id = :currentRelId", { currentRelId })
          .andWhere("rel.unit_id = :unitId", { unitId: unit.id })
          .andWhere("rel.is_deleted = false")
          .getExists()
      : false;
    if (unit.rentalStatus === UNIT_STATUS_RENTED && !currentContractRelationExists && !this.hasPermission(actor, SYSTEM_PERMISSIONS.LEASING_CONTRACT_FORCE_BIND_UNIT)) {
      throw new BadRequestException("Rented units cannot be linked to a new contract without force bind permission");
    }
    if ([UNIT_STATUS_MAINTENANCE, UNIT_STATUS_SELF_USE].includes(unit.rentalStatus)) {
      throw new BadRequestException("Maintenance or self-use units cannot be linked to a contract by default");
    }
    if (!DEFAULT_BINDABLE_UNIT_STATUSES.has(unit.rentalStatus) && unit.rentalStatus !== UNIT_STATUS_RENTED) {
      throw new BadRequestException("Unit rental status is not bindable");
    }
    const conflictBuilder = this.contractUnitsRepository
      .createQueryBuilder("rel")
      .innerJoin(LeasingContractEntity, "contract", "contract.id = rel.contract_id")
      .where("rel.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rel.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rel.unit_id = :unitId", { unitId: unit.id })
      .andWhere("rel.status = 1")
      .andWhere("rel.is_deleted = false")
      .andWhere("contract.is_deleted = false")
      .andWhere("contract.status <> :voidStatus", { voidStatus: CONTRACT_STATUS_VOID })
      .andWhere("contract.id <> :contractId", { contractId })
      .andWhere("rel.start_date <= :endDate", { endDate })
      .andWhere("rel.end_date >= :startDate", { startDate });
    if (currentRelId) {
      conflictBuilder.andWhere("rel.id <> :currentRelId", { currentRelId });
    }
    if (await conflictBuilder.getExists()) {
      throw new ConflictException("Unit is occupied by another active contract during this period");
    }
  }

  private assertCanEditUnitLinks(contract: LeasingContractEntity, actor: JwtPrincipal): void {
    if (CONTRACT_EDITABLE_STATUSES.has(contract.status)) return;
    if (this.hasPermission(actor, SYSTEM_PERMISSIONS.LEASING_CONTRACT_EDIT_AFTER_SUBMIT)) return;
    throw new BadRequestException(CONTRACT_UNIT_EDIT_LOCKED_MESSAGE);
  }

  private resolveRelationDates(contract: LeasingContractEntity, rawStartDate?: string, rawEndDate?: string): { startDate: string; endDate: string } {
    const startDate = this.dateOnly(rawStartDate ?? contract.startDate);
    const endDate = this.dateOnly(rawEndDate ?? contract.endDate);
    this.assertDateRange(startDate, endDate);
    if (new Date(startDate).getTime() < new Date(contract.startDate).getTime() || new Date(endDate).getTime() > new Date(contract.endDate).getTime()) {
      throw new BadRequestException("Contract unit period must be inside contract period");
    }
    return { startDate, endDate };
  }

  private resolveArea(actor: JwtPrincipal, requestedArea: number | undefined, unit: UnitEntity, fallback?: string): number {
    const area = requestedArea ?? (fallback !== undefined ? this.toNumber(fallback) : this.toNumber(unit.unitArea));
    if (!Number.isFinite(area) || area <= 0) {
      throw new BadRequestException("area must be greater than 0");
    }
    const unitArea = this.toNumber(unit.unitArea);
    if (area > unitArea && !this.hasPermission(actor, SYSTEM_PERMISSIONS.LEASING_CONTRACT_OVERRIDE_AREA)) {
      throw new BadRequestException("area cannot be greater than unit_area without override permission");
    }
    return area;
  }

  private resolveRentUnitPrice(requestedPrice: number | undefined, contract: LeasingContractEntity, unit: UnitEntity, fallback?: string): number {
    const price = requestedPrice ?? (fallback !== undefined ? this.toNumber(fallback) : this.defaultRentUnitPrice(contract, unit));
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException("rent_unit_price must be greater than or equal to 0");
    }
    return price;
  }

  private defaultRentUnitPrice(contract: LeasingContractEntity, unit: UnitEntity): number {
    const contractPrice = this.toNumber(contract.rentUnitPrice);
    return contractPrice > 0 ? contractPrice : this.toNumber(unit.refPrice);
  }

  private async secureContractUnit(scope: TenantParkScope, actor: JwtPrincipal, relation: LeasingContractUnitEntity): Promise<LeasingContractUnitEntity> {
    const secured = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "rel_leasing_contract_unit", relation);
    if (secured.unit) {
      secured.unit = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "unit", secured.unit);
    }
    return secured;
  }

  private async secureContractUnitList(scope: TenantParkScope, actor: JwtPrincipal, relations: LeasingContractUnitEntity[]): Promise<LeasingContractUnitEntity[]> {
    return Promise.all(relations.map((relation) => this.secureContractUnit(scope, actor, relation)));
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingContractEntity>, query: LeasingContractQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("contract.contract_code ILIKE :keyword")
            .orWhere("contract.contract_name ILIKE :keyword")
            .orWhere("parkTenant.company_name ILIKE :keyword");
        })
      ).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.status) builder.andWhere("contract.status = :status", { status: query.status });
    if (query.contract_type) builder.andWhere("contract.contract_type = :contractType", { contractType: query.contract_type });
    if (query.park_tenant_id) builder.andWhere("contract.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.start_date) builder.andWhere("contract.start_date >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("contract.end_date <= :endDate", { endDate: query.end_date });
  }

  private applySort(builder: SelectQueryBuilder<LeasingContractEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("contract.updateTime", "DESC").addOrderBy("contract.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("contract.updateTime", "DESC").addOrderBy("contract.createTime", "DESC");
      return;
    }
    builder.orderBy(`contract.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingContractEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, tenantCompanyFilter, contractOwnerFilter, customerOwnerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "contract_owner"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_id", parkFilter, "contractParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "contract", "park_tenant_id", tenantCompanyFilter, "contractParkTenantScopeIds");
    this.applyOwnerDataScope(builder, contractOwnerFilter, customerOwnerFilter);
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<LeasingContractEntity>,
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

  private applyOwnerDataScope(
    builder: SelectQueryBuilder<LeasingContractEntity>,
    contractOwnerFilter: DataScopeFilter,
    customerOwnerFilter: DataScopeFilter
  ): void {
    if (contractOwnerFilter.unrestricted) return;
    const clauses: Array<{ sql: string; params?: Record<string, string[]> }> = [];
    if (contractOwnerFilter.allowed_ids.length > 0) {
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
    builder.andWhere(
      new Brackets((qb) => {
        clauses.forEach((clause, index) => {
          if (index === 0) {
            qb.where(clause.sql, clause.params);
          } else {
            qb.orWhere(clause.sql, clause.params);
          }
        });
      })
    );
  }

  private async resolveContractCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateNext(scope, actorId, "CONTRACT_CODE");
    return generated.code;
  }

  private async assertContractCodeAvailable(scope: TenantParkScope, contractCode: string, excludeId?: string): Promise<void> {
    const builder = this.contractsRepository
      .createQueryBuilder("contract")
      .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contract.contract_code = :contractCode", { contractCode })
      .andWhere("contract.is_deleted = false");
    if (excludeId) builder.andWhere("contract.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Leasing contract code already exists");
    }
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

  private async validateOptionalSource(scope: TenantParkScope, leadId?: string, quoteId?: string): Promise<void> {
    await Promise.all([leadId ? this.assertLeadExists(scope, leadId) : Promise.resolve(), quoteId ? this.assertQuoteExists(scope, quoteId) : Promise.resolve()]);
  }

  private async assertLeadExists(scope: TenantParkScope, leadId: string): Promise<void> {
    const exists = await this.leadsRepository
      .createQueryBuilder("lead")
      .where("lead.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("lead.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("lead.id = :leadId", { leadId })
      .andWhere("lead.is_deleted = false")
      .getExists();
    if (!exists) {
      throw new NotFoundException("Source leasing lead not found");
    }
  }

  private async assertQuoteExists(scope: TenantParkScope, quoteId: string): Promise<void> {
    const exists = await this.quotesRepository
      .createQueryBuilder("quote")
      .where("quote.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("quote.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("quote.id = :quoteId", { quoteId })
      .andWhere("quote.is_deleted = false")
      .getExists();
    if (!exists) {
      throw new NotFoundException("Source leasing quote not found");
    }
  }

  private async validateOptionalFiles(scope: TenantParkScope, contractPdfFileId?: string, scanPdfFileId?: string): Promise<void> {
    const ids = [contractPdfFileId, scanPdfFileId].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const count = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.is_deleted = false")
      .getCount();
    if (count !== new Set(ids).size) {
      throw new NotFoundException("Contract file not found in current tenant or park");
    }
  }

  private async mustFindContractFile(scope: TenantParkScope, fileId: string): Promise<FileEntity> {
    const file = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id = :fileId", { fileId })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .getOne();
    if (!file) {
      throw new NotFoundException("Contract file not found in current tenant or park");
    }
    return file;
  }

  private async validateDictionaryValues(scope: TenantParkScope, contractType?: string | null, paymentPeriod?: string | null, status?: string | null): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_contract_type", contractType ?? undefined),
      this.assertDictValue(scope, "leasing_payment_period", paymentPeriod ?? undefined),
      this.assertDictValue(scope, "leasing_contract_status", status ?? undefined)
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

  private assertEditablePayload(entity: LeasingContractEntity, dto: UpdateLeasingContractDto): void {
    if (entity.status === CONTRACT_STATUS_DRAFT) return;
    const touchedCoreFields = Object.keys(dto).filter((field) => CORE_UPDATE_FIELDS.has(field as keyof UpdateLeasingContractDto));
    if (LOCKED_CORE_STATUSES.has(entity.status) && touchedCoreFields.length > 0) {
      throw new BadRequestException("Submitted, approving, or effective contracts cannot edit core fields in current phase");
    }
  }

  private assertDateRange(startDate: string, endDate: string): void {
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      throw new BadRequestException("start_date must be earlier than or equal to end_date");
    }
  }

  private dateOnly(value: string): string {
    return value.slice(0, 10);
  }

  private resolveDraftDateRange(rawStartDate?: string, rawEndDate?: string): { startDate: string; endDate: string } {
    const startDate = this.dateOnly(rawStartDate ?? this.todayDateOnly());
    const endDate = this.dateOnly(rawEndDate ?? this.oneYearMinusOneDay(startDate));
    this.assertDateRange(startDate, endDate);
    return { startDate, endDate };
  }

  private todayDateOnly(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private oneYearMinusOneDay(startDate: string): string {
    const date = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  private money(value: number | undefined): string {
    return Number(value ?? 0).toFixed(2);
  }

  private decimal(value: number): string {
    return Number(value).toFixed(2);
  }

  private toNumber(value: string | number | null | undefined): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private isUuid(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
  }

  private approximateNaturalMonths(startDate: string, endDate: string): number {
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`);
    if (end.getTime() < start.getTime()) return 0;
    const monthGap = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
    const inclusiveMonth = end.getUTCDate() >= start.getUTCDate() ? 1 : 0;
    return Math.max(1, monthGap + inclusiveMonth);
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
  }

  private async applyUnitLookupDataScope(builder: SelectQueryBuilder<UnitEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit")
    ]);
    const columns = { park: "park_id", building: "building_id", floor: "floor_id", unit: "id" } as const;
    for (const filter of filters) {
      if (filter.unrestricted) continue;
      const column = columns[filter.dimension as keyof typeof columns];
      if (!column) continue;
      if (filter.allowed_ids.length === 0) {
        builder.andWhere("1 = 0");
        continue;
      }
      const parameterName = `leasingContractUnitScope${filter.dimension.replace(/_/g, "")}Ids`;
      builder.andWhere(`unit.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
    }
  }

  private emptyToNull(value: string | undefined | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
