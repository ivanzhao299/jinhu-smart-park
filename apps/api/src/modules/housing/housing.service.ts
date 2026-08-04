import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type HousingEnergyMeterCandidateListResponse,
  type HousingLeaseListItem as HousingLeaseListResponseItem,
  type HousingTenantResponse,
  type HousingUnitCandidateListResponse,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type PaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { assertPropertyHighRiskActionApprovalRequired } from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
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
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  applyHousingReceivableMutation,
  calculateHousingDepositBalance,
  calculateHousingMoneyBalance,
  compareHousingMoney,
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
import { HousingPurchaseService } from "./housing-purchase.service";
import { HousingPurchaseApprovalExecutorService } from "./housing-purchase-approval-executor.service";

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
    private readonly purchaseService: HousingPurchaseService,
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
