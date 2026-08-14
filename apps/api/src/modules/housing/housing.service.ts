import {
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  type HousingEnergyMeterCandidateListResponse,
  type HousingLeaseListItem as HousingLeaseListResponseItem,
  type HousingTenantResponse,
  type HousingUnitCandidateListResponse,
  type PaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
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
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  applyHousingReceivableMutation,
} from "./housing-finance.policy";
import { HousingDashboardQueryService } from "./housing-dashboard-query.service";
import { HousingTenantService } from "./housing-tenant.service";
import { HousingLeaseQueryService } from "./housing-lease-query.service";
import { HousingLeaseCommandService } from "./housing-lease-command.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HOUSING_LONG_RENT_OPERATION_JOIN } from "./housing-lease-unit-eligibility";
import { HousingBillingCommandService } from "./housing-billing-command.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { HousingHandoverCommandService } from "./housing-handover-command.service";
import { HousingHandoverApprovalExecutorService } from "./housing-handover-approval-executor.service";
import { HousingRepairCommandService } from "./housing-repair-command.service";
import { HousingPurchaseService } from "./housing-purchase.service";
import { HousingPurchaseApprovalExecutorService } from "./housing-purchase-approval-executor.service";
import { HousingLeaseApprovalExecutorService } from "./housing-lease-approval-executor.service";

@Injectable()
export class HousingService {
  constructor(
    @InjectRepository(HousingLeaseEntity)
    private readonly leasesRepository: Repository<HousingLeaseEntity>,
    private readonly purchaseService: HousingPurchaseService,
    private readonly tenantService: HousingTenantService,
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly occupancyService: PropertyOccupancyPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly leaseQuery?: HousingLeaseQueryService,
    @Optional()
    private readonly leaseApprovalExecutor?: HousingLeaseApprovalExecutorService,
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
    private readonly repairCommands?: HousingRepairCommandService,
    @Optional()
    private readonly purchaseApprovalExecutor?: HousingPurchaseApprovalExecutorService
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
    dto: CreatePartyDto,
    clientKey?: string
  ): Promise<HousingTenantResponse> {
    return this.tenantService.create(scope, actor, dto, clientKey);
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
      "unit.status=1",
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
         ${HOUSING_LONG_RENT_OPERATION_JOIN}
         WHERE ${where}
         ORDER BY ${unitSort} ${unitOrder} NULLS LAST, unit.id ASC
         LIMIT $${paginationStart} OFFSET $${paginationStart + 1}`,
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS total
         FROM biz_unit unit
         ${HOUSING_LONG_RENT_OPERATION_JOIN}
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

  checkoutLease(scope: TenantParkScope, actor: JwtPrincipal, leaseId: string,
    reason: string, clientKey = "") {
    return this.mustLeaseApprovalExecutor().checkout(scope, actor, leaseId, reason, clientKey);
  }
  listPurchases(scope: TenantParkScope, actor: JwtPrincipal, query: HousingPurchaseQueryDto) {
    return this.purchaseService.listPurchases(scope, actor, query);
  }

  getPurchase(scope: TenantParkScope, actor: JwtPrincipal, purchaseId: string) {
    return this.purchaseService.getPurchase(scope, actor, purchaseId);
  }

  createPurchase(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHousingPurchaseDto) {
    return this.purchaseService.createPurchase(scope, actor, dto);
  }

  purchaseAction(scope: TenantParkScope, actor: JwtPrincipal, purchaseId: string,
    dto: HousingPurchaseActionDto, clientKey = "") {
    return this.purchaseService.purchaseAction(scope, actor, purchaseId, dto, clientKey);
  }

  transferPurchase(scope: TenantParkScope, actor: JwtPrincipal, purchaseId: string,
    dto: TransferHousingPurchaseDto, clientKey = "") {
    return this.purchaseService.transferPurchase(scope, actor, purchaseId, dto, clientKey);
  }
  executeApprovedLeaseAction(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }, actionId: "housing.leases.approve.request" | "housing.leases.void.request"
    | "housing.leases.checkout.request"): Promise<void> {
    return this.mustLeaseApprovalExecutor().execute(input, actionId);
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

  executeApprovedPurchaseTransfer(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    return this.mustPurchaseApprovalExecutor().executeApprovedPurchaseTransfer(input);
  }

  executeApprovedPurchaseLifecycle(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    return this.mustPurchaseApprovalExecutor().executeApprovedPurchaseLifecycle(input);
  }
  private async mustLease(manager: EntityManager, scope: TenantParkScope, id: string) {
    const lease = await manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
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

  private mustPurchaseApprovalExecutor() {
    if (!this.purchaseApprovalExecutor) {
      throw new Error("HousingPurchaseApprovalExecutorService is not configured");
    }
    return this.purchaseApprovalExecutor;
  }

  private mustLeaseApprovalExecutor() {
    if (!this.leaseApprovalExecutor) {
      throw new Error("HousingLeaseApprovalExecutorService is not configured");
    }
    return this.leaseApprovalExecutor;
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
