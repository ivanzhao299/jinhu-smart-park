import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type HousingEnergyMeterCandidateListResponse,
  type HousingLeaseListItem as HousingLeaseListResponseItem,
  type HousingPurchaseListItem as HousingPurchaseListResponseItem,
  type HousingPurchaseDetailResponse,
  type HousingPurchaseResponse,
  type HousingTenantResponse,
  type HousingUnitCandidateListResponse,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type PaginatedResult,
  type PropertyWorkbenchFileRef,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, In, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { assertPropertyHighRiskActionApprovalRequired } from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { FileEntity } from "../files/entities/file.entity";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import type {
  AddHousingOccupantDto,
  ApproveHousingLeaseDto,
  CompleteHousingHandoverDto,
  CreateHousingRepairDto,
  CreateHousingLeaseDto,
  CreateHousingPurchaseDto,
  GenerateHousingBillsDto,
  HousingEnergyMeterCandidateQueryDto,
  HousingLeaseQueryDto,
  HousingPurchaseActionDto,
  HousingPurchaseQueryDto,
  HousingUnitCandidateQueryDto,
  RegisterHousingLedgerEntryDto,
  SignHousingLeaseDto,
  TransferHousingPurchaseDto,
  UpsertHousingChargePlanDto
} from "./dto/housing.dto";
import {
  HousingLeaseEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { parseHousingCalendarDate } from "./housing-billing.policy";
import {
  addHousingMoneyAmounts,
  applyHousingReceivableMutation,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingDepositBalance,
  calculateHousingMoneyBalance,
  calculateHousingPurchaseAmounts,
  compareHousingMoney,
  formatHousingMoney,
} from "./housing-finance.policy";
import { HousingDashboardQueryService } from "./housing-dashboard-query.service";
import { HousingTenantService } from "./housing-tenant.service";
import { HousingLeaseQueryService } from "./housing-lease-query.service";
import { HousingLeaseCommandService } from "./housing-lease-command.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingBillingCommandService } from "./housing-billing-command.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { HousingHandoverCommandService } from "./housing-handover-command.service";
import { HousingHandoverApprovalExecutorService } from "./housing-handover-approval-executor.service";
import { HousingRepairCommandService } from "./housing-repair-command.service";

type HousingCheckoutSnapshot = {
  lease: {
    id: string; unitId: string; status: HousingLeaseEntity["status"];
    version: number; occupancyId: string | null;
  };
  occupancy: { id: string; version: number; status: string } | null;
  handover: { id: string; version: number };
  receivables: Array<{
    id: string; version: number; amount: string; paidAmount: string; waivedAmount: string;
    status: string; currency: string; sourceType: string; sourceId: string | null; chargeType: string;
  }>;
  ledgerContributors: Array<{
    id: string; version: number; entryType: string; amount: string; currency: string;
    receivableId: string | null; sourceType: string; sourceId: string | null;
  }>;
};

@Injectable()
export class HousingService {
  constructor(
    @InjectRepository(HousingLeaseEntity)
    private readonly leasesRepository: Repository<HousingLeaseEntity>,
    @InjectRepository(HousingPurchaseEntity)
    private readonly purchasesRepository: Repository<HousingPurchaseEntity>,
    private readonly tenantService: HousingTenantService,
    private readonly occupancyService: PropertyOccupanciesService,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly leaseQuery?: HousingLeaseQueryService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort,
    @Optional()
    private readonly dashboardQuery?: HousingDashboardQueryService,
    @Optional()
    private readonly leaseCommands?: HousingLeaseCommandService,
    @Optional()
    private readonly txSupport?: HousingTransactionSupportService,
    @Optional()
    private readonly receivableWriter?: HousingReceivableWriterService,
    @Optional()
    private readonly billingCommands?: HousingBillingCommandService,
    @Optional()
    private readonly financeCommands?: HousingFinanceCommandService,
    @Optional()
    private readonly handoverCommands?: HousingHandoverCommandService,
    @Optional()
    private readonly handoverApprovalExecutor?: HousingHandoverApprovalExecutorService,
    @Optional()
    private readonly repairCommands?: HousingRepairCommandService
  ) {}

  async listTenants(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PartyQueryDto
  ): Promise<PaginatedResult<HousingTenantResponse>> {
    return this.tenantService.list(scope, actor, query);
  }

  async createTenant(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto
  ): Promise<HousingTenantResponse> {
    return this.tenantService.create(scope, actor, dto);
  }

  dashboard(scope: TenantParkScope, actor: JwtPrincipal) {
    if (!this.dashboardQuery) {
      throw new Error("HousingDashboardQueryService is not configured");
    }
    return this.dashboardQuery.dashboard(scope, actor);
  }

  async listLeases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingLeaseQueryDto
  ): Promise<PaginatedResult<HousingLeaseListResponseItem>> {
    if (!this.leaseQuery) throw new Error("HousingLeaseQueryService is not configured");
    return this.leaseQuery.list(scope, actor, query);
  }

  async listUnitCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingUnitCandidateQueryDto
  ): Promise<HousingUnitCandidateListResponse> {
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (unitIds !== null && !unitIds.length) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const filters = [
      "unit.tenant_id=$1",
      "unit.park_id=$2",
      "unit.is_deleted=false"
    ];
    if (unitIds !== null) {
      parameters.push(unitIds);
      filters.push(`unit.id=ANY($${parameters.length}::uuid[])`);
    }
    if (query.keyword) {
      parameters.push(`%${query.keyword}%`);
      filters.push(
        `(unit.unit_code ILIKE $${parameters.length} OR unit.unit_name ILIKE $${parameters.length})`
      );
    }
    const paginationStart = parameters.length + 1;
    const where = filters.join(" AND ");
    const unitSortColumns = { code: "unit.unit_code", name: "unit.unit_name" } as const;
    const unitSort = unitSortColumns[query.sort ?? "code"];
    const unitOrder = this.sortDirection(query.order, "ASC");
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT unit.id, unit.unit_code AS "unitCode", unit.unit_name AS "unitName"
         FROM biz_unit unit
         WHERE ${where}
         ORDER BY ${unitSort} ${unitOrder} NULLS LAST, unit.id ASC
         LIMIT $${paginationStart} OFFSET $${paginationStart + 1}`,
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS total
         FROM biz_unit unit
         WHERE ${where}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: (rows as HousingUnitCandidateListResponse["items"]).map((row) => ({
        id: row.id,
        unitCode: row.unitCode,
        unitName: row.unitName
      })),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  async listEnergyMeterCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    query: HousingEnergyMeterCandidateQueryDto
  ): Promise<HousingEnergyMeterCandidateListResponse> {
    const lease = await this.mustLease(this.dataSource.manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    const parameters: unknown[] = [scope.tenantId, scope.parkId, lease.unitId];
    const keywordFilter = query.keyword
      ? ` AND (meter.meter_code ILIKE $4 OR meter.meter_name ILIKE $4)`
      : "";
    if (query.keyword) parameters.push(`%${query.keyword}%`);
    const paginationStart = parameters.length + 1;
    const meterSortColumns = {
      code: "meter.meter_code",
      name: "meter.meter_name"
    } as const;
    const meterSort = meterSortColumns[query.sort ?? "code"];
    const meterOrder = this.sortDirection(query.order, "ASC");
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT meter.id, meter.meter_code AS "meterCode",
                meter.meter_name AS "meterName", meter.meter_type AS "meterType",
                meter.unit, meter.multiplier::text AS multiplier
         FROM energy_meter meter
         WHERE meter.tenant_id=$1 AND meter.park_id=$2
           AND meter.room_id=$3 AND meter.is_deleted=false
           AND meter.is_enabled=true AND meter.status='ONLINE'${keywordFilter}
         ORDER BY ${meterSort} ${meterOrder} NULLS LAST, meter.id ASC
         LIMIT $${paginationStart} OFFSET $${paginationStart + 1}`,
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS total
         FROM energy_meter meter
         WHERE meter.tenant_id=$1 AND meter.park_id=$2
           AND meter.room_id=$3 AND meter.is_deleted=false
           AND meter.is_enabled=true AND meter.status='ONLINE'${keywordFilter}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: (rows as HousingEnergyMeterCandidateListResponse["items"]).map((row) => ({
        id: row.id,
        meterCode: row.meterCode,
        meterName: row.meterName,
        meterType: row.meterType,
        unit: row.unit,
        multiplier: String(row.multiplier)
      })),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  async getLease(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    if (!this.leaseQuery) throw new Error("HousingLeaseQueryService is not configured");
    return this.leaseQuery.get(scope, actor, id);
  }

  async createLease(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHousingLeaseDto
  ) {
    return this.mustLeaseCommands().create(scope, actor, dto);
  }

  async submitLease(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.mustLeaseCommands().submit(scope, actor, id);
  }

  async approveLease(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    dto: ApproveHousingLeaseDto, clientKey = "") {
    return this.mustLeaseCommands().approve(scope, actor, id, dto, clientKey);
  }

  async signLease(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SignHousingLeaseDto) {
    return this.mustLeaseCommands().sign(scope, actor, id, dto);
  }

  async activateLease(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    idempotencyKey?: string
  ) {
    return this.mustLeaseCommands().activate(scope, actor, id, idempotencyKey);
  }

  async voidLease(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    reason: string, clientKey = "") {
    return this.mustLeaseCommands().void(scope, actor, id, reason, clientKey);
  }

  async addOccupant(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AddHousingOccupantDto) {
    return this.mustLeaseCommands().addOccupant(scope, actor, id, dto);
  }

  async saveChargePlan(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: UpsertHousingChargePlanDto
  ) {
    return this.mustBillingCommands().saveChargePlan(scope, actor, leaseId, dto);
  }

  async generateBills(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: GenerateHousingBillsDto
  ) {
    return this.mustBillingCommands().generateBills(scope, actor, leaseId, dto);
  }

  async registerLedger(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto,
    clientKey = ""
  ) {
    return this.mustFinanceCommands().registerLedger(scope, actor, leaseId, dto, clientKey);
  }

  async completeHandover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CompleteHousingHandoverDto,
    clientKey = ""
  ) {
    return this.mustHandoverCommands().complete(scope, actor, leaseId, dto, clientKey);
  }

  async createRepair(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CreateHousingRepairDto
  ) {
    return this.mustRepairCommands().create(scope, actor, leaseId, dto);
  }

  async checkoutLease(scope: TenantParkScope, actor: JwtPrincipal, leaseId: string,
    reason: string, clientKey = "") {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.leases.checkout");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.dataSource.transaction(async (manager) => {
      const snapshot = await this.lockHousingCheckoutSnapshot(manager, scope, leaseId);
      const { lease, occupancy, handover, receivables, ledgerContributors } = snapshot;
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.mustTxSupport().assertStatus(lease, ["checkout_pending"]);
      const activeReceivables = receivables.filter((item) => item.status !== "void");
      const outstanding = calculateHousingMoneyBalance(
        activeReceivables.map((item) => item.amount),
        activeReceivables.flatMap((item) => [item.paidAmount, item.waivedAmount])
      );
      if (compareHousingMoney(outstanding, "0.00") > 0) {
        throw new ConflictException(`Outstanding tenant charges remain: ${outstanding}`);
      }
      const depositBalance = calculateHousingDepositBalance(
        ledgerContributors as Array<{ entryType: HousingLedgerEntryEntity["entryType"]; amount: string }>
      );
      if (compareHousingMoney(depositBalance, "0.00") > 0) {
        throw new ConflictException(`Deposit balance must be settled before checkout: ${depositBalance}`);
      }
      return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
        actionId: "housing.leases.checkout.request", sourceType: "housing-lease",
        sourceId: lease.id, sourceExpectedVersion: lease.version, requesterId: actor.sub,
        submitterId: actor.sub, actorId: actor.sub, clientKey,
        businessIntentKey: `housing-lease-checkout:${lease.id}:${lease.version}`,
        canonicalPayload: { leaseId: lease.id, fromStatus: lease.status, handoverId: handover.id,
          occupancyId: occupancy?.id ?? null, occupancyExpectedVersion: occupancy?.version ?? null,
          occupancyStatus: occupancy?.status ?? null, reason: reason.trim(),
          actorName: actor.realName?.trim() || actor.username,
          receivableContributors: receivables,
          receivableContributorsHash: this.approvalSnapshotHash(receivables),
          ledgerContributors,
          ledgerContributorsHash: this.approvalSnapshotHash(ledgerContributors),
          outstandingAmount: outstanding,
          depositBalance },
        payloadSchemaVersion: 1, amount: null, currency: null
      });
    });
  }

  async listPurchases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingPurchaseQueryDto
  ): Promise<PaginatedResult<HousingPurchaseListResponseItem>> {
    const builder = this.purchasesRepository.createQueryBuilder("purchase")
      .where("purchase.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("purchase.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("purchase.is_deleted=false");
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (unitIds !== null) {
      if (!unitIds.length) return { items: [], total: 0, page: query.page, page_size: query.page_size };
      builder.andWhere("purchase.unit_id IN (:...unitIds)", { unitIds });
    }
    if (query.unit_id) builder.andWhere("purchase.unit_id=:unitId", { unitId: query.unit_id });
    if (query.approval_status) builder.andWhere("purchase.approval_status=:status", { status: query.approval_status });
    const purchaseSortColumns = {
      purchaseDate: "purchase.purchase_date",
      status: "purchase.approval_status",
      code: "purchase.purchase_code"
    } as const;
    const [items, total] = await builder
      .orderBy(
        purchaseSortColumns[query.sort ?? "purchaseDate"],
        this.sortDirection(query.order, "DESC")
      )
      .addOrderBy("purchase.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const relations = await this.loadPurchaseListRelations(scope, actor, items);
    return {
      items: items.map((item) => ({
        ...this.toPurchaseResponse(item, actor),
        transferredItemCount: relations.transferredCounts.get(item.id) ?? 0,
        ...(relations.includeEvidence ? {
          receiptFiles: (relations.receiptFiles.get(item.id) ?? [])
            .map((file) => this.toFileRef(file))
        } : {})
      })),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  private async loadPurchaseListRelations(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    items: HousingPurchaseEntity[]
  ) {
    if (!items.length) {
      return {
        transferredCounts: new Map<string, number>(),
        receiptFiles: new Map<string, FileEntity[]>(),
        includeEvidence: false
      };
    }
    const ids = items.map((item) => item.id);
    const includeEvidence = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)
      && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
    const [transferredRows, files] = await Promise.all([
      this.loadPurchaseTransferredCounts(scope, ids),
      includeEvidence ? this.dataSource.getRepository(FileEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bizType: "housing_purchase",
          bizId: In(ids),
          status: 1,
          isDeleted: false
        },
        order: { createTime: "DESC" }
      }) : []
    ]);
    const receiptFiles = new Map<string, FileEntity[]>();
    for (const file of files) {
      if (!file.bizId) continue;
      receiptFiles.set(file.bizId, [...(receiptFiles.get(file.bizId) ?? []), file]);
    }
    return {
      transferredCounts: new Map(transferredRows.map((row) =>
        [row.purchaseId, Number(row.transferredItemCount)])),
      receiptFiles,
      includeEvidence
    };
  }

  private loadPurchaseTransferredCounts(scope: TenantParkScope, ids: string[]) {
    return this.dataSource.query(
      `SELECT item.purchase_id AS "purchaseId", COUNT(*)::int AS "transferredItemCount"
       FROM biz_housing_purchase_item item
       WHERE item.tenant_id = $1 AND item.park_id = $2
         AND item.purchase_id = ANY($3::uuid[])
         AND item.transferred_receivable_id IS NOT NULL AND item.is_deleted = false
       GROUP BY item.purchase_id`,
      [scope.tenantId, scope.parkId, ids]
    ) as Promise<Array<{ purchaseId: string; transferredItemCount: number }>>;
  }

  async getPurchase(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string
  ): Promise<HousingPurchaseDetailResponse> {
    const purchase = await this.purchasesRepository.findOne({
      where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!purchase) throw new NotFoundException("Housing purchase not found");
    await this.assertPurchaseAccess(scope, actor, purchase.unitId);
    const includeEvidence = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ)
      && this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const [items, receiptFiles] = await Promise.all([
      this.dataSource.getRepository(HousingPurchaseItemEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          purchaseId,
          isDeleted: false
        }
      }),
      includeEvidence
        ? this.dataSource.getRepository(FileEntity).find({
            where: {
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              bizType: "housing_purchase",
              bizId: purchaseId,
              status: 1,
              isDeleted: false
            },
            order: { createTime: "DESC" }
          })
        : Promise.resolve([])
    ]);
    return {
      purchase: this.toPurchaseResponse(purchase, actor),
      items: items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        quantity: String(item.quantity),
        unit: item.unit,
        transferredReceivableId: item.transferredReceivableId,
        ...(this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ) ? {
          unitPrice: formatHousingMoney(item.unitPrice),
          amount: formatHousingMoney(item.amount)
        } : {})
      })),
      ...(includeEvidence
        ? { receiptFiles: receiptFiles.map((file) => this.toFileRef(file)) }
        : {})
    };
  }

  async createPurchase(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHousingPurchaseDto) {
    if (!dto.items.length) throw new BadRequestException("At least one purchase item is required");
    parseHousingCalendarDate(dto.purchase_date);
    await this.assertPurchaseAccess(scope, actor, dto.unit_id ?? null);
    try {
      return await this.dataSource.transaction(async (manager) => {
      const receiptFiles = await this.mustTxSupport().assertFiles(
        manager,
        scope,
        dto.receipt_file_ids ?? [],
        { bizType: "housing_purchase" }
      );
      if (receiptFiles.some((file) => file.bizId !== null)) {
        throw new ConflictException("Purchase receipt file is already associated with another record");
      }
      if (receiptFiles.some((file) => file.createBy !== actor.sub)) {
        throw new ForbiddenException("Purchase receipt file belongs to another uploader");
      }
      const purchaseAmounts = calculateHousingPurchaseAmounts(dto.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unit_price
      })));
      const repository = manager.getRepository(HousingPurchaseEntity);
      const purchase = await repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        purchaseCode: dto.purchase_code ?? this.mustTxSupport().generateCode("HP"),
        unitId: dto.unit_id ?? null,
        vendorName: dto.vendor_name,
        purchaseDate: dto.purchase_date.slice(0, 10),
        costCategory: dto.cost_category,
        totalAmount: purchaseAmounts.totalAmount,
        approvalStatus: "draft",
        paymentStatus: "unpaid",
        receiptFileIds: dto.receipt_file_ids ?? [],
        createBy: actor.sub,
        updateBy: actor.sub,
        remark: dto.remark ?? null
      }));
      const itemRepository = manager.getRepository(HousingPurchaseItemEntity);
      await itemRepository.save(dto.items.map((item, index) => itemRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        purchaseId: purchase.id,
        itemName: item.item_name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        unitPrice: item.unit_price,
        amount: purchaseAmounts.lineAmounts[index]!,
        transferredReceivableId: null,
        createBy: actor.sub,
        updateBy: actor.sub
      })));
      for (const file of receiptFiles) {
        file.bizId = purchase.id;
        file.updateBy = actor.sub;
      }
      if (receiptFiles.length) await manager.getRepository(FileEntity).save(receiptFiles);
        return purchase;
      });
    } catch (error) {
      if (this.mustTxSupport().isUniqueViolation(error)) {
        throw new ConflictException("Purchase code already exists in current tenant and park");
      }
      throw error;
    }
  }

  async purchaseAction(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string,
    dto: HousingPurchaseActionDto,
    clientKey = ""
  ) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.purchases.lifecycle");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    const approvalCommands = this.approvalCommands;
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(HousingPurchaseEntity);
      const purchase = await repository.findOne({
        where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!purchase) throw new NotFoundException("Housing purchase not found");
      await this.assertPurchaseAccess(scope, actor, purchase.unitId);
      const beforeApprovalStatus = purchase.approvalStatus;
      const beforePaymentStatus = purchase.paymentStatus;
      let afterApprovalStatus = beforeApprovalStatus;
      let afterPaymentStatus = beforePaymentStatus;
      let transition: string = dto.action;
      switch (dto.action) {
        case "approve":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be approved");
          afterApprovalStatus = "approved";
          break;
        case "reject":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be rejected");
          afterApprovalStatus = "rejected";
          break;
        case "pay":
          if (purchase.approvalStatus !== "approved" || purchase.paymentStatus !== "unpaid") {
            throw new ConflictException("Only approved unpaid purchase can be paid");
          }
          afterPaymentStatus = "paid";
          break;
        case "refund":
          if (purchase.paymentStatus !== "paid") throw new ConflictException("Only paid purchase can be refunded");
          if (await this.hasTransferredPurchaseItems(manager, scope, purchaseId)) {
            throw new ConflictException("Transferred purchase items must be reversed before refunding the purchase");
          }
          afterPaymentStatus = "refunded";
          break;
        case "void":
          if (purchase.paymentStatus !== "unpaid") {
            throw new ConflictException("Paid or refunded purchase cannot be voided");
          }
          if (!["draft", "approved", "rejected"].includes(purchase.approvalStatus)) {
            throw new ConflictException("Terminal purchase cannot be voided again");
          }
          if (await this.hasTransferredPurchaseItems(manager, scope, purchaseId)) {
            throw new ConflictException("Transferred purchase items must be reversed before voiding the purchase");
          }
          transition = `void-${purchase.approvalStatus}`;
          afterApprovalStatus = "void";
          break;
        default:
          throw new BadRequestException("Unsupported purchase action");
      }
      return approvalCommands.createPendingRequest(
        { transactionContext: manager },
        { contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
          actionId: "housing.purchases.lifecycle.request", sourceType: "housing-purchase",
          sourceId: purchase.id, sourceExpectedVersion: purchase.version,
          requesterId: actor.sub, submitterId: actor.sub, actorId: actor.sub, clientKey,
          businessIntentKey: `housing-purchase-lifecycle:${purchase.id}:${purchase.version}:${transition}`,
          canonicalPayload: { purchaseId: purchase.id, transition,
            beforeApprovalStatus, afterApprovalStatus, beforePaymentStatus, afterPaymentStatus,
            reason: dto.reason, actorName: actor.realName?.trim() || actor.username },
          payloadSchemaVersion: 1, amount: null, currency: null }
      );
    });
  }

  async transferPurchase(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string,
    dto: TransferHousingPurchaseDto,
    clientKey = ""
  ) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.purchases.transfer");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    const approvalCommands = this.approvalCommands;
    parseHousingCalendarDate(dto.due_date);
    return this.dataSource.transaction(async (manager) => {
      const purchase = await manager.getRepository(HousingPurchaseEntity).findOne({
        where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!purchase) throw new NotFoundException("Housing purchase not found");
      await this.assertPurchaseAccess(scope, actor, purchase.unitId);
      if (purchase.approvalStatus !== "approved") throw new ConflictException("Only approved purchase can be transferred");
      if (purchase.paymentStatus === "refunded") throw new ConflictException("Refunded purchase cannot be transferred");
      const lease = await this.mustTxSupport().lockLease(manager, scope, dto.lease_id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      assertHousingPurchaseTransferLeaseStatus(lease.status);
      if (purchase.unitId && purchase.unitId !== lease.unitId) {
        throw new ConflictException("Purchase unit and lease unit do not match");
      }
      const itemsRepository = manager.getRepository(HousingPurchaseItemEntity);
      const items = await itemsRepository.createQueryBuilder("item")
        .setLock("pessimistic_write")
        .where("item.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("item.park_id=:parkId", { parkId: scope.parkId })
        .andWhere("item.purchase_id=:purchaseId", { purchaseId })
        .andWhere("item.id IN (:...itemIds)", { itemIds: dto.item_ids })
        .andWhere("item.is_deleted=false")
        .orderBy("item.id", "ASC")
        .getMany();
      if (items.length !== new Set(dto.item_ids).size) throw new NotFoundException("One or more purchase items were not found");
      if (items.some((item) => item.transferredReceivableId)) {
        throw new ConflictException("One or more purchase items have already been transferred");
      }
      const amount = addHousingMoneyAmounts(items.map((item) => item.amount));
      await this.mustTxSupport().lockBusinessKey(
        manager,
        this.mustTxSupport().receivableBusinessKey(scope, lease.id, {
          sourceType: "purchase_transfer",
          sourceId: purchase.id,
          chargeType: "purchase_recharge",
          periodStart: purchase.purchaseDate,
          periodEnd: this.mustTxSupport().addDays(purchase.purchaseDate, 1)
        })
      );
      const targetRows = typeormQueryRows<{
        id: string; version: number; leaseId: string; periodStart: string; periodEnd: string;
        dueDate: string; amount: string; paidAmount: string; waivedAmount: string;
        status: HousingReceivableEntity["status"]; currency: string; isDeleted: boolean;
      }>(await manager.query(
        `SELECT id::text AS id,version,lease_id::text AS "leaseId",period_start::text AS "periodStart",
                period_end::text AS "periodEnd",due_date::text AS "dueDate",amount::text AS amount,
                paid_amount::text AS "paidAmount",waived_amount::text AS "waivedAmount",
                status,currency,is_deleted AS "isDeleted"
           FROM biz_housing_receivable
          WHERE tenant_id=$1 AND park_id=$2 AND source_type='purchase_transfer'
            AND source_id=$3 AND charge_type='purchase_recharge' ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, purchase.id]
      ));
      if (targetRows.length > 1 || targetRows.some((row) => row.isDeleted || row.status === "void")) {
        throw new ConflictException("Purchase transfer receivable history conflicts with approval submission");
      }
      const existingTarget = targetRows[0];
      if (existingTarget && existingTarget.leaseId !== lease.id) {
        throw new ConflictException("Purchase transfer receivable belongs to another lease");
      }
      const targetReceivable = existingTarget ?? {
        id: randomUUID(), version: 0, leaseId: lease.id,
        periodStart: purchase.purchaseDate,
        periodEnd: this.mustTxSupport().addDays(purchase.purchaseDate, 1),
        dueDate: dto.due_date.slice(0, 10), amount: "0.00", paidAmount: "0.00",
        waivedAmount: "0.00", status: "unpaid" as const, currency: purchase.currency,
        isDeleted: false
      };
      if (targetReceivable.currency !== purchase.currency || lease.currency !== purchase.currency) {
        throw new ConflictException("Purchase transfer currency differs from target lease");
      }
      const frozenItems = [...items]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => ({
          purchaseItemId: item.id,
          expectedVersion: item.version,
          amount: formatHousingMoney(item.amount),
          currency: purchase.currency,
          transferredReceivableId: null
        }));
      return approvalCommands.createPendingRequest(
        { transactionContext: manager },
        {
          contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
          scope,
          actionId: "housing.purchases.transfer.request",
          sourceType: "housing-purchase",
          sourceId: purchase.id,
          sourceExpectedVersion: purchase.version,
          requesterId: actor.sub,
          submitterId: actor.sub,
          actorId: actor.sub,
          clientKey,
          businessIntentKey: `housing-purchase-transfer:${purchase.id}:${purchase.version}:${targetReceivable.id}`,
          canonicalPayload: {
            purchaseId: purchase.id,
            leaseId: lease.id,
            leaseExpectedVersion: lease.version,
            targetReceivableId: targetReceivable.id,
            targetReceivableMode: existingTarget ? "existing" : "new",
            targetReceivableExpectedVersion: existingTarget?.version ?? null,
            targetReceivableOriginalAmount: formatHousingMoney(targetReceivable.amount),
            targetReceivableOriginalPaidAmount: formatHousingMoney(targetReceivable.paidAmount),
            targetReceivableOriginalWaivedAmount: formatHousingMoney(targetReceivable.waivedAmount),
            targetReceivableOriginalStatus: existingTarget?.status ?? "absent",
            targetReceivablePeriodStart: targetReceivable.periodStart,
            targetReceivablePeriodEnd: targetReceivable.periodEnd,
            targetReceivableDueDate: targetReceivable.dueDate,
            targetReceivableSourceType: "purchase_transfer",
            targetReceivableSourceId: purchase.id,
            targetReceivableChargeType: "purchase_recharge",
            aggregateDeltaAmount: amount,
            currency: purchase.currency,
            reason: dto.reason,
            actorName: actor.realName?.trim() || actor.username,
            items: frozenItems
          },
          payloadSchemaVersion: 1,
          amount,
          currency: purchase.currency
        }
      );
    });
  }

  async executeApprovedLeaseAction(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }, actionId: "housing.leases.approve.request" | "housing.leases.void.request"
    | "housing.leases.checkout.request"): Promise<void> {
    const payload = input.canonicalPayload;
    const leaseId = this.approvalUuid(payload.leaseId);
    if (leaseId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const checkoutSnapshot = actionId === "housing.leases.checkout.request"
      ? await this.lockHousingCheckoutSnapshot(input.manager, scope, leaseId)
      : null;
    const leases = checkoutSnapshot ? [checkoutSnapshot.lease] : typeormQueryRows<{
      id: string; unitId: string; status: string; version: number; occupancyId: string | null;
    }>(await input.manager.query(
      `SELECT id::text AS id,unit_id::text AS "unitId",status,version,
              occupancy_id::text AS "occupancyId"
         FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
    ));
    const lease = leases[0];
    if (!lease || lease.version !== input.sourceExpectedVersion || lease.status !== payload.fromStatus) {
      throw new ConflictException("Approval source changed");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash" FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string }>;
    const effect = manifests[0];
    if (!effect) throw new ConflictException("Approval effect manifest missing");
    const decisions = await input.manager.query(
      `SELECT actor_id::text AS "actorId" FROM biz_property_approval_decision
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 AND decision='approve'
        ORDER BY decided_at DESC,id DESC LIMIT 1`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ actorId: string }>;
    const decisionActor = decisions[0]?.actorId;
    if (!decisionActor) throw new ConflictException("Approval decision evidence missing");
    if (actionId === "housing.leases.approve.request") {
      const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
        `UPDATE biz_housing_lease SET status='pending_signature',approval_note=$5,
                approved_by=$6,approved_at=clock_timestamp(),update_by=$6,
                update_time=clock_timestamp(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status='pending_approval'
          RETURNING version`, [scope.tenantId, scope.parkId, leaseId, input.sourceExpectedVersion,
          payload.approvalNote, decisionActor]
      ));
      if (updated.length !== 1) throw new ConflictException("Approval source changed");
      return;
    }
    let occupancyVersion: number | null = null;
    let occupancyResultingVersion: number | null = null;
    if (actionId === "housing.leases.checkout.request") {
      const handoverId = this.approvalUuid(payload.handoverId);
      if (!checkoutSnapshot || checkoutSnapshot.handover.id !== handoverId
        || lease.occupancyId !== payload.occupancyId
        || this.approvalSnapshotHash(checkoutSnapshot.receivables) !== payload.receivableContributorsHash
        || this.approvalSnapshotHash(checkoutSnapshot.ledgerContributors) !== payload.ledgerContributorsHash) {
        throw new ConflictException("Approval source changed");
      }
      const receivables = checkoutSnapshot.receivables;
      const active = receivables.filter((item) => item.status !== "void");
      const outstanding = calculateHousingMoneyBalance(active.map((item) => item.amount),
        active.flatMap((item) => [item.paidAmount, item.waivedAmount]));
      const entries = checkoutSnapshot.ledgerContributors;
      const depositBalance = calculateHousingDepositBalance(
        entries as Array<{ entryType: HousingLedgerEntryEntity["entryType"]; amount: string }>
      );
      if (compareHousingMoney(outstanding, "0.00") > 0
        || outstanding !== payload.outstandingAmount
        || compareHousingMoney(depositBalance, "0.00") > 0
        || depositBalance !== payload.depositBalance) {
        throw new ConflictException("Housing balances changed after approval submission");
      }
      if (lease.occupancyId) {
        const lockedOccupancy = checkoutSnapshot.occupancy;
        if (!lockedOccupancy || lockedOccupancy.version !== Number(payload.occupancyExpectedVersion)
          || lockedOccupancy.status !== payload.occupancyStatus) {
          throw new ConflictException("Approval source changed");
        }
        const occupancy = typeormQueryRows<{ version: number }>(await input.manager.query(
          `UPDATE biz_property_occupancy SET status='completed',release_reason=$6,
                  released_at=clock_timestamp(),update_by=$7,update_time=clock_timestamp(),version=version+1
            WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status=$5
              AND is_deleted=false RETURNING version`, [scope.tenantId, scope.parkId,
            lease.occupancyId, Number(payload.occupancyExpectedVersion), payload.occupancyStatus,
            String(payload.reason ?? ""), decisionActor]
        ));
        if (occupancy.length !== 1) throw new ConflictException("Approval source changed");
        occupancyVersion = Number(payload.occupancyExpectedVersion);
        occupancyResultingVersion = occupancy[0]!.version;
      }
    }
    const toStatus = actionId === "housing.leases.void.request" ? "void" : "terminated";
    const updated = typeormQueryRows<{ version: number; checkoutAt: Date | null }>(await input.manager.query(
      `UPDATE biz_housing_lease SET status=$5,termination_reason=$6,
              checkout_at=CASE WHEN $5='terminated' THEN clock_timestamp() ELSE checkout_at END,
              update_by=$7,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version,checkout_at AS "checkoutAt"`,
      [scope.tenantId, scope.parkId, leaseId, input.sourceExpectedVersion, toStatus,
        String(payload.reason ?? ""), decisionActor]
    ));
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_lease_effect_audit(
         tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
         effect_line_key,actor_id,occurred_at,effect_hash,lease_id,occupancy_id,from_status,to_status,
         reason,source_expected_version,resulting_version,checkout_at,
         occupancy_source_expected_version,occupancy_resulting_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id::text AS id`, [scope.tenantId, scope.parkId, input.requestId, actionId,
        effect.effectKind, input.executionIdempotencyKey, effect.effectLineKey, decisionActor,
        effect.effectHash, leaseId, lease.occupancyId, lease.status, toStatus,
        String(payload.reason ?? ""), input.sourceExpectedVersion, updated[0]!.version,
        updated[0]!.checkoutAt, occupancyVersion, occupancyResultingVersion]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  async executeApprovedFinance(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    return this.mustFinanceCommands().executeApprovedFinance(input);
  }

  async executeApprovedMoveOutHandover(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    return this.mustHandoverApprovalExecutor().execute(input);
  }

  async executeApprovedPurchaseTransfer(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
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
    ) as Array<{ id: string; version: number; currency: string; approvalStatus: string; paymentStatus: string }>;
    const purchase = purchases[0];
    if (!purchase || purchase.version !== input.sourceExpectedVersion
      || purchase.approvalStatus !== "approved" || purchase.paymentStatus === "refunded"
      || purchase.currency !== payload.currency) throw new ConflictException("Approval source changed");
    const leases = await input.manager.query(
      `SELECT version,currency,status FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ version: number; currency: string; status: string }>;
    const lease = leases[0];
    if (!lease || lease.version !== Number(payload.leaseExpectedVersion)
      || lease.currency !== purchase.currency || !["active","expiring","checkout_pending"].includes(lease.status)) {
      throw new ConflictException("Approval source changed");
    }
    const frozenItems = payload.items as Array<Record<string, unknown>>;
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
    if (itemRows.length !== frozenItems.length || itemRows.some((row, index) => {
      const frozen = frozenItems[index]!;
      return row.id !== frozenItemIds[index] || row.version !== Number(frozen.expectedVersion)
        || row.amount !== frozen.amount || frozen.currency !== purchase.currency
        || frozen.transferredReceivableId !== null || row.transferredReceivableId !== null;
    })) throw new ConflictException("Approval source changed");
    const receivableMode = String(payload.targetReceivableMode ?? "");
    if (!["new", "existing"].includes(receivableMode)) throw new ConflictException("Approval source changed");
    await this.mustTxSupport().lockBusinessKey(
      input.manager,
      this.mustTxSupport().receivableBusinessKey(scope, leaseId, {
        sourceType: String(payload.targetReceivableSourceType),
        sourceId: purchaseId,
        chargeType: String(payload.targetReceivableChargeType),
        periodStart: String(payload.targetReceivablePeriodStart),
        periodEnd: String(payload.targetReceivablePeriodEnd)
      })
    );
    const receivables = typeormQueryRows<{
      id: string; version: number; leaseId: string; currency: string; amount: string;
      paidAmount: string; waivedAmount: string; status: string; isDeleted: boolean;
      sourceType: string; sourceId: string | null; chargeType: string;
      periodStart: string; periodEnd: string; dueDate: string;
    }>(await input.manager.query(
      `SELECT id::text AS id,version,lease_id::text AS "leaseId",currency,amount::text AS amount,
              paid_amount::text AS "paidAmount",waived_amount::text AS "waivedAmount",status,
              is_deleted AS "isDeleted",source_type AS "sourceType",source_id::text AS "sourceId",
              charge_type AS "chargeType",period_start::text AS "periodStart",
              period_end::text AS "periodEnd",due_date::text AS "dueDate"
          FROM biz_housing_receivable
        WHERE tenant_id=$1 AND park_id=$2 AND (id=$3 OR
          (source_type='purchase_transfer' AND source_id=$4 AND charge_type='purchase_recharge'))
        ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, receivableId, purchaseId]
    ));
    const receivable = receivables[0] ?? null;
    if (receivableMode === "new") {
      if (receivables.length !== 0 || payload.targetReceivableExpectedVersion !== null) {
        throw new ConflictException("Purchase transfer receivable mode changed");
      }
    } else if (receivables.length !== 1 || !receivable || receivable.isDeleted
      || receivable.status === "void" || receivable.id !== receivableId || receivable.leaseId !== leaseId
      || receivable.version !== Number(payload.targetReceivableExpectedVersion)
      || receivable.amount !== payload.targetReceivableOriginalAmount
      || receivable.paidAmount !== payload.targetReceivableOriginalPaidAmount
      || receivable.waivedAmount !== payload.targetReceivableOriginalWaivedAmount
      || receivable.status !== payload.targetReceivableOriginalStatus
      || receivable.currency !== purchase.currency
      || receivable.sourceType !== payload.targetReceivableSourceType
      || receivable.sourceId !== payload.targetReceivableSourceId
      || receivable.chargeType !== payload.targetReceivableChargeType
      || receivable.periodStart !== payload.targetReceivablePeriodStart
      || receivable.periodEnd !== payload.targetReceivablePeriodEnd
      || receivable.dueDate !== payload.targetReceivableDueDate) {
      throw new ConflictException("Purchase transfer receivable mode changed");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string; lineAmount: string | null; currency: string | null }>;
    const itemEffects = new Map(manifests.filter((row) => row.effectKind === "housing.purchase.transfer")
      .map((row) => [row.effectLineKey, row]));
    const receivableEffect = manifests.find((row) => row.effectKind === "housing.receivable.purchase.transfer");
    if (!receivableEffect || receivableEffect.lineAmount !== payload.aggregateDeltaAmount
      || receivableEffect.currency !== payload.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    const purchaseUpdated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_purchase SET update_by=$5,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
      [scope.tenantId, scope.parkId, purchaseId, input.sourceExpectedVersion, input.request.requesterId]
    ));
    if (purchaseUpdated.length !== 1) throw new ConflictException("Approval source changed");
    for (const raw of payload.items) {
      const item = raw as Record<string, unknown>;
      const itemId = this.approvalUuid(item.purchaseItemId);
      const expectedVersion = Number(item.expectedVersion);
      const effect = itemEffects.get(`item:${itemId}`);
      if (!effect) throw new ConflictException("Approval effect manifest missing");
      const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
        `UPDATE biz_housing_purchase_item SET transferred_receivable_id=$5,update_by=$6,
                update_time=clock_timestamp(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND purchase_id=$4 AND version=$7
            AND transferred_receivable_id IS NULL AND amount=$8::numeric AND is_deleted=false
          RETURNING version`,
        [scope.tenantId, scope.parkId, itemId, purchaseId, receivableId,
          input.request.requesterId, expectedVersion, item.amount]
      ));
      if (updated.length !== 1 || updated[0]!.version !== expectedVersion + 1) {
        throw new ConflictException("Approval source changed");
      }
      const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
        `INSERT INTO biz_housing_purchase_transfer_effect_audit(
           tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
           effect_line_key,actor_id,occurred_at,effect_hash,purchase_id,purchase_item_id,
           from_purchase_id,to_lease_id,to_receivable_id,currency,purchase_source_expected_version,
           purchase_resulting_version,item_source_expected_version,item_resulting_version,item_amount,reason)
         VALUES($1,$2,$3,'housing.purchases.transfer.request',$4,$5,$6,$7,clock_timestamp(),$8,
                $9,$10,$9,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id::text AS id`,
        [scope.tenantId, scope.parkId, input.requestId, effect.effectKind,
          input.executionIdempotencyKey, effect.effectLineKey, input.request.requesterId,
          effect.effectHash, purchaseId, itemId, leaseId, receivableId, purchase.currency,
          input.sourceExpectedVersion, input.sourceExpectedVersion + 1, expectedVersion,
          expectedVersion + 1, item.amount, String(payload.reason ?? "")]
      ));
      if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
    }
    const nextAmount = addHousingMoneyAmounts([
      String(payload.targetReceivableOriginalAmount), String(payload.aggregateDeltaAmount)
    ]);
    const receivableUpdated = receivableMode === "new"
      ? typeormQueryRows<{ version: number }>(await input.manager.query(
        `INSERT INTO biz_housing_receivable(
           id,tenant_id,park_id,lease_id,charge_plan_id,source_type,source_id,charge_type,
           period_start,period_end,due_date,amount,paid_amount,waived_amount,status,currency,
           create_by,update_by,remark)
         VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,'0.00','0.00','unpaid',$12,$13,$13,$14)
         RETURNING version`,
        [receivableId, scope.tenantId, scope.parkId, leaseId,
          payload.targetReceivableSourceType, purchaseId, payload.targetReceivableChargeType,
          payload.targetReceivablePeriodStart, payload.targetReceivablePeriodEnd,
          payload.targetReceivableDueDate, nextAmount, purchase.currency,
          input.request.requesterId, String(payload.reason ?? "")]
      ))
      : typeormQueryRows<{ version: number }>(await input.manager.query(
        `UPDATE biz_housing_receivable SET amount=$5,update_by=$6,update_time=clock_timestamp(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
            AND amount=$7::numeric AND paid_amount=$8::numeric AND waived_amount=$9::numeric
            AND status=$10 AND is_deleted=false RETURNING version`,
        [scope.tenantId, scope.parkId, receivableId, receivable!.version, nextAmount,
          input.request.requesterId, payload.targetReceivableOriginalAmount,
          payload.targetReceivableOriginalPaidAmount, payload.targetReceivableOriginalWaivedAmount,
          payload.targetReceivableOriginalStatus]
      ));
    if (receivableUpdated.length !== 1) throw new ConflictException("Approval source changed");
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

  private approvalSnapshotHash(value: unknown): string {
    return propertyApprovalCanonicalHash(value as PropertyApprovalJsonValue);
  }

  private assertApprovedPurchaseLifecycleTransition(
    payload: Readonly<Record<string, unknown>>,
    purchase: { approvalStatus: string; paymentStatus: string }
  ): void {
    const transition = String(payload.transition ?? "");
    const afterApprovalStatus = String(payload.afterApprovalStatus ?? "");
    const afterPaymentStatus = String(payload.afterPaymentStatus ?? "");
    const expected = (() => {
      switch (transition) {
        case "approve": return purchase.approvalStatus === "draft" && purchase.paymentStatus === "unpaid"
          ? { approvalStatus: "approved", paymentStatus: "unpaid" } : null;
        case "reject": return purchase.approvalStatus === "draft" && purchase.paymentStatus === "unpaid"
          ? { approvalStatus: "rejected", paymentStatus: "unpaid" } : null;
        case "pay": return purchase.approvalStatus === "approved" && purchase.paymentStatus === "unpaid"
          ? { approvalStatus: "approved", paymentStatus: "paid" } : null;
        case "refund": return purchase.approvalStatus === "approved" && purchase.paymentStatus === "paid"
          ? { approvalStatus: "approved", paymentStatus: "refunded" } : null;
        case "void-draft":
        case "void-approved":
        case "void-rejected": {
          const fromStatus = transition.slice("void-".length);
          return purchase.paymentStatus === "unpaid" && purchase.approvalStatus === fromStatus
            ? { approvalStatus: "void", paymentStatus: "unpaid" } : null;
        }
        default: return null;
      }
    })();
    if (!expected || afterApprovalStatus !== expected.approvalStatus
      || afterPaymentStatus !== expected.paymentStatus) {
      throw new ConflictException("Approval purchase transition changed");
    }
  }

  private async lockHousingCheckoutSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ): Promise<HousingCheckoutSnapshot> {
    const pointerRows = typeormQueryRows<{ occupancyId: string | null }>(await manager.query(
      `SELECT occupancy_id::text AS "occupancyId" FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    const pointer = pointerRows[0];
    if (!pointer) throw new NotFoundException("Housing lease not found");

    const occupancyRows = pointer.occupancyId ? typeormQueryRows<{
      id: string; version: number; status: string;
    }>(await manager.query(
      `SELECT id::text AS id,version,status FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, pointer.occupancyId]
    )) : [];
    const occupancy = occupancyRows[0] ?? null;
    if (pointer.occupancyId && !occupancy) throw new ConflictException("Housing occupancy is missing");

    const leaseRows = typeormQueryRows<HousingCheckoutSnapshot["lease"]>(await manager.query(
      `SELECT id::text AS id,unit_id::text AS "unitId",status,version,
              occupancy_id::text AS "occupancyId"
         FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    const lease = leaseRows[0];
    if (!lease) throw new NotFoundException("Housing lease not found");
    if (lease.occupancyId !== pointer.occupancyId) {
      throw new ConflictException("Housing occupancy pointer changed while locking checkout");
    }

    const handovers = typeormQueryRows<HousingCheckoutSnapshot["handover"]>(await manager.query(
      `SELECT id::text AS id,version FROM biz_housing_handover
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND handover_type='move_out'
          AND status='completed' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    if (handovers.length !== 1 || !handovers[0]) {
      throw new ConflictException("Completed move-out handover is required");
    }

    const receivables = typeormQueryRows<HousingCheckoutSnapshot["receivables"][number]>(
      await manager.query(
        `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
                waived_amount::text AS "waivedAmount",status,currency,source_type AS "sourceType",
                source_id::text AS "sourceId",charge_type AS "chargeType"
           FROM biz_housing_receivable
          WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND is_deleted=false
          ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, leaseId]
      )
    );
    const ledgerContributors = typeormQueryRows<HousingCheckoutSnapshot["ledgerContributors"][number]>(
      await manager.query(
        `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
                receivable_id::text AS "receivableId",source_type AS "sourceType",
                source_id::text AS "sourceId"
           FROM biz_housing_ledger_entry
          WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND status='confirmed'
            AND is_deleted=false ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, leaseId]
      )
    );
    return { lease, occupancy, handover: handovers[0], receivables, ledgerContributors };
  }

  private async mustLease(manager: EntityManager, scope: TenantParkScope, id: string) {
    const lease = await manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
  }

  private toPurchaseResponse(
    purchase: HousingPurchaseEntity,
    actor: JwtPrincipal
  ): HousingPurchaseResponse {
    return {
      id: purchase.id,
      purchaseCode: purchase.purchaseCode,
      unitId: purchase.unitId,
      vendorName: purchase.vendorName,
      purchaseDate: purchase.purchaseDate,
      costCategory: purchase.costCategory,
      approvalStatus: purchase.approvalStatus,
      paymentStatus: purchase.paymentStatus,
      ...(this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ) ? {
        totalAmount: formatHousingMoney(purchase.totalAmount)
      } : {})
    };
  }

  private toFileRef(file: FileEntity): PropertyWorkbenchFileRef {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize
    };
  }

  private async assertPurchaseAccess(scope: TenantParkScope, actor: JwtPrincipal, unitId: string | null) {
    if (unitId) {
      await this.unitAccessService.assertAccess(scope, actor, unitId);
      return;
    }
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null) {
      throw new ForbiddenException("Project-wide purchase cost requires unrestricted park data scope");
    }
  }

  private applyReceivableEntry(receivable: HousingReceivableEntity, dto: RegisterHousingLedgerEntryDto) {
    const result = applyHousingReceivableMutation(
      receivable.amount,
      receivable.paidAmount,
      receivable.waivedAmount,
      dto.entry_type,
      dto.amount
    );
    receivable.paidAmount = result.paidAmount;
    receivable.waivedAmount = result.waivedAmount;
    receivable.status = result.status;
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

  private mustLeaseCommands() {
    if (!this.leaseCommands) throw new Error("HousingLeaseCommandService is not configured");
    return this.leaseCommands;
  }

  private mustTxSupport() {
    if (!this.txSupport) throw new Error("HousingTransactionSupportService is not configured");
    return this.txSupport;
  }

  private mustReceivableWriter() {
    if (!this.receivableWriter) throw new Error("HousingReceivableWriterService is not configured");
    return this.receivableWriter;
  }

  private mustBillingCommands() {
    if (!this.billingCommands) throw new Error("HousingBillingCommandService is not configured");
    return this.billingCommands;
  }

  private mustFinanceCommands() {
    if (!this.financeCommands) throw new Error("HousingFinanceCommandService is not configured");
    return this.financeCommands;
  }

  private mustHandoverCommands() {
    if (!this.handoverCommands) throw new Error("HousingHandoverCommandService is not configured");
    return this.handoverCommands;
  }

  private mustHandoverApprovalExecutor() {
    if (!this.handoverApprovalExecutor) {
      throw new Error("HousingHandoverApprovalExecutorService is not configured");
    }
    return this.handoverApprovalExecutor;
  }

  private mustRepairCommands() {
    if (!this.repairCommands) throw new Error("HousingRepairCommandService is not configured");
    return this.repairCommands;
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private sortDirection(
    order: "asc" | "desc" | undefined,
    fallback: "ASC" | "DESC"
  ): "ASC" | "DESC" {
    return order ? (order === "asc" ? "ASC" : "DESC") : fallback;
  }

}
