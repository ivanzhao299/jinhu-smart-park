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
  resolveFileUploadPolicy,
  SYSTEM_PERMISSIONS,
  type HousingChargePlanResponse,
  type HousingEnergyMeterCandidateListResponse,
  type HousingLedgerEntryResponse,
  type HousingLeaseListItem as HousingLeaseListResponseItem,
  type HousingLeaseResponse,
  type HousingPurchaseListItem as HousingPurchaseListResponseItem,
  type HousingPurchaseDetailResponse,
  type HousingPurchaseResponse,
  type HousingReceivableResponse,
  type HousingRepairSummaryResponse,
  type HousingTenantResponse,
  type HousingUnitCandidateListResponse,
  type PartyListItemResponse,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type PaginatedResult,
  type PropertyWorkbenchFileRef,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, In, IsNull, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions
} from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { FileEntity } from "../files/entities/file.entity";
import { EnergyMeterEntity } from "../energy/entities/energy-meter.entity";
import { DataScopeService } from "../data-scopes/data-scope.service";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PartiesService } from "../property-operations/parties.service";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
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
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  assertHousingBillingPeriodWithinLease,
  calculateHousingMonthFractionRatio,
  parseHousingCalendarDate
} from "./housing-billing.policy";
import {
  addHousingMoneyAmounts,
  applyHousingReceivableMutation,
  assertHousingDepositMutation,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingDepositBalance,
  calculateHousingMoneyBalance,
  calculateHousingMeterCharge,
  formatHousingDecimal,
  calculateHousingPurchaseAmounts,
  compareHousingMoney,
  formatHousingMoney,
  multiplyHousingMoneyByRatio,
  housingReceivableStatus
} from "./housing-finance.policy";
import { maskHousingCredential } from "./housing-projection.policy";

type HousingLeaseDetailAccess = {
  tenant: boolean;
  billing: boolean;
  finance: boolean;
  handovers: boolean;
  handoverFiles: boolean;
  pendingHandoverFiles: boolean;
  repairs: boolean;
  pendingRepairFiles: boolean;
};

type HousingLeaseDetailData = {
  tenant: PartyEntity | null;
  occupants: HousingLeaseOccupantEntity[];
  chargePlans: HousingChargePlanEntity[];
  receivables: HousingReceivableEntity[];
  ledger: HousingLedgerEntryEntity[];
  handovers: HousingHandoverEntity[];
  handoverEvidenceFiles: FileEntity[];
  pendingHandoverFiles: FileEntity[];
  repairs: WorkOrderEntity[];
  pendingRepairFiles: FileEntity[];
};

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
    private readonly partiesService: PartiesService,
    private readonly occupancyService: PropertyOccupanciesService,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  async listTenants(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PartyQueryDto
  ): Promise<PaginatedResult<HousingTenantResponse>> {
    const housingUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    const result = await this.partiesService.listForDomainProjection(
      scope,
      { ...query, party_type: "person" },
      actor,
      housingUnitIds
    );
    return {
      ...result,
      items: result.items.map((tenant) => this.toTenantResponse(tenant, actor))
    };
  }

  async createTenant(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto
  ): Promise<HousingTenantResponse> {
    const tenant = await this.partiesService.create(scope, actor, {
      ...dto,
      party_type: "person",
      source_domain: "housing_rental"
    });
    return this.toTenantResponse(tenant, actor);
  }

  private toTenantResponse(
    tenant: PartyListItemResponse,
    actor: JwtPrincipal
  ): HousingTenantResponse {
    const canManage = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
    const canReadSensitive = this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
    return {
      id: tenant.id,
      displayName: tenant.displayName,
      verificationStatus: tenant.verificationStatus,
      ...(canReadSensitive ? {
        identityNumberMasked: tenant.identityNumberMasked
      } : {}),
      ...(canManage ? {
        mobile: this.maskTenantMobile(tenant.mobile ?? null),
        email: this.maskTenantEmail(tenant.email ?? null)
      } : {})
    };
  }

  private maskTenantMobile(value: string | null): string | null {
    if (value === null) return null;
    if (/^\d{11}$/u.test(value)) return `${value.slice(0, 3)}****${value.slice(-4)}`;
    if (value.length <= 4) return "****";
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  private maskTenantEmail(value: string | null): string | null {
    if (value === null) return null;
    const separatorIndex = value.indexOf("@");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      if (value.length <= 4) return "****";
      return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
    const name = value.slice(0, separatorIndex);
    const domain = value.slice(separatorIndex + 1);
    return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
  }

  async dashboard(scope: TenantParkScope, actor: JwtPrincipal) {
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    const unitFilter = unitIds === null ? "" : unitIds.length ? " AND unit_id = ANY($3::uuid[])" : " AND false";
    const leaseUnitFilter = unitIds === null ? "" : unitIds.length ? " AND lease.unit_id = ANY($3::uuid[])" : " AND false";
    const purchaseUnitFilter = unitIds === null ? "" : unitIds.length ? " AND purchase.unit_id = ANY($3::uuid[])" : " AND false";
    const params = unitIds === null ? [scope.tenantId, scope.parkId] : [scope.tenantId, scope.parkId, unitIds];
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canReadPurchases = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
    const [leaseRows, financeRows, purchaseRows] = await Promise.all([
      this.dataSource.query(
        `SELECT status, count(*)::int AS count
         FROM biz_housing_lease
         WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${unitFilter}
         GROUP BY status`,
        params
      ) as Promise<Array<{ status: string; count: number }>>,
      canReadFinance ? this.dataSource.query(
        `SELECT
           coalesce(sum(amount),0)::text AS receivable,
           coalesce(sum(paid_amount),0)::text AS paid,
           coalesce(sum(waived_amount),0)::text AS waived
         FROM biz_housing_receivable receivable
         JOIN biz_housing_lease lease
           ON lease.id=receivable.lease_id
          AND lease.tenant_id=receivable.tenant_id
          AND lease.park_id=receivable.park_id
          AND lease.is_deleted=false
         WHERE receivable.tenant_id=$1 AND receivable.park_id=$2
           AND receivable.is_deleted=false AND receivable.status <> 'void'${leaseUnitFilter}`,
        params
      ) as Promise<Array<{ receivable: string; paid: string; waived: string }>> : Promise.resolve([]),
      canReadPurchases ? this.dataSource.query(
        `SELECT coalesce(sum(total_amount),0)::text AS cost
         FROM biz_housing_purchase purchase
         WHERE purchase.tenant_id=$1 AND purchase.park_id=$2
           AND purchase.is_deleted=false AND purchase.approval_status='approved'
           AND purchase.payment_status <> 'refunded'${purchaseUnitFilter}`,
        params
      ) as Promise<Array<{ cost: string }>> : Promise.resolve([])
    ]);
    const counts = Object.fromEntries(leaseRows.map((row) => [row.status, Number(row.count)]));
    const finance = financeRows[0] ?? { receivable: "0", paid: "0", waived: "0" };
    return {
      draft_leases: counts.draft ?? 0,
      pending_approval: counts.pending_approval ?? 0,
      pending_signature: counts.pending_signature ?? 0,
      active_leases: (counts.active ?? 0) + (counts.expiring ?? 0),
      checkout_pending: counts.checkout_pending ?? 0,
      ...(canReadFinance ? {
        receivable_amount: formatHousingMoney(finance.receivable),
        collected_amount: formatHousingMoney(finance.paid),
        outstanding_amount: compareHousingMoney(
          calculateHousingMoneyBalance([finance.receivable], [finance.paid, finance.waived]),
          "0.00"
        ) > 0
          ? calculateHousingMoneyBalance([finance.receivable], [finance.paid, finance.waived])
          : "0.00"
      } : {}),
      ...(canReadPurchases ? {
        approved_purchase_cost: formatHousingMoney(purchaseRows[0]?.cost ?? "0")
      } : {})
    };
  }

  async listLeases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingLeaseQueryDto
  ): Promise<PaginatedResult<HousingLeaseListResponseItem>> {
    const builder = this.leasesRepository.createQueryBuilder("lease")
      .where("lease.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("lease.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("lease.is_deleted=false");
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (unitIds !== null) {
      if (!unitIds.length) return { items: [], total: 0, page: query.page, page_size: query.page_size };
      builder.andWhere("lease.unit_id IN (:...unitIds)", { unitIds });
    }
    if (query.status) builder.andWhere("lease.status=:status", { status: query.status });
    if (query.unit_id) builder.andWhere("lease.unit_id=:unitId", { unitId: query.unit_id });
    if (query.tenant_party_id) builder.andWhere("lease.tenant_party_id=:partyId", { partyId: query.tenant_party_id });
    if (query.keyword) {
      builder.andWhere(
        `(lease.lease_code ILIKE :leaseKeyword
          OR EXISTS (
            SELECT 1
            FROM biz_unit keyword_unit
            WHERE keyword_unit.id = lease.unit_id
              AND keyword_unit.tenant_id = lease.tenant_id
              AND keyword_unit.park_id = lease.park_id
              AND keyword_unit.is_deleted = false
              AND (
                keyword_unit.unit_code ILIKE :leaseKeyword
                OR keyword_unit.unit_name ILIKE :leaseKeyword
              )
          )
          OR EXISTS (
            SELECT 1
            FROM biz_party keyword_party
            WHERE keyword_party.id = lease.tenant_party_id
              AND keyword_party.tenant_id = lease.tenant_id
              AND keyword_party.park_id = lease.park_id
              AND keyword_party.is_deleted = false
              AND keyword_party.display_name ILIKE :leaseKeyword
          ))`,
        { leaseKeyword: `%${query.keyword}%` }
      );
    }
    const leaseSortColumns = {
      startDate: "lease.start_date",
      status: "lease.status",
      leaseCode: "lease.lease_code"
    } as const;
    const [leases, total] = await builder
      .orderBy(
        leaseSortColumns[query.sort ?? "startDate"],
        this.sortDirection(query.order, "DESC")
      )
      .addOrderBy("lease.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const displayRows = leases.length
      ? await this.dataSource.query(
        `SELECT lease.id,
                unit.unit_code AS "unitCode",
                unit.unit_name AS "unitName",
                party.display_name AS "tenantDisplayName"
         FROM biz_housing_lease lease
         LEFT JOIN biz_unit unit
           ON unit.id = lease.unit_id
          AND unit.tenant_id = lease.tenant_id
          AND unit.park_id = lease.park_id
         LEFT JOIN biz_party party
           ON party.id = lease.tenant_party_id
          AND party.tenant_id = lease.tenant_id
          AND party.park_id = lease.park_id
         WHERE lease.tenant_id = $1
           AND lease.park_id = $2
           AND lease.id = ANY($3::uuid[])`,
        [scope.tenantId, scope.parkId, leases.map((lease) => lease.id)]
      ) as Array<{
        id: string;
        unitCode: string | null;
        unitName: string | null;
        tenantDisplayName: string | null;
      }>
      : [];
    const displayByLease = new Map(displayRows.map((row) => [row.id, row]));
    const items = leases.map((lease) => this.toLeaseListItem(lease, actor, {
      unitCode: displayByLease.get(lease.id)?.unitCode ?? null,
      unitName: displayByLease.get(lease.id)?.unitName ?? null,
      tenantDisplayName: displayByLease.get(lease.id)?.tenantDisplayName ?? null
    }));
    return { items, total, page: query.page, page_size: query.page_size };
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
    const lease = await this.mustLease(this.dataSource.manager, scope, id);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    const access = this.leaseDetailAccess(actor);
    const data = await this.loadLeaseDetailData(scope, lease, access);
    const occupantNames = await this.loadOccupantNames(scope, data.occupants);
    if (access.repairs) data.repairs = await this.filterRepairScope(data.repairs, actor);
    return this.projectLeaseDetail(lease, actor, access, data, occupantNames);
  }

  private leaseDetailAccess(actor: JwtPrincipal): HousingLeaseDetailAccess {
    const fileRead = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const handovers = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ);
    const repairs = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ);
    return {
      tenant: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_TENANT_READ),
      billing: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_BILLING_READ),
      finance: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ),
      handovers,
      handoverFiles: handovers && fileRead,
      pendingHandoverFiles: handovers
        && fileRead
        && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE),
      repairs,
      pendingRepairFiles: repairs
        && fileRead
        && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE)
    };
  }

  private async loadLeaseDetailData(
    scope: TenantParkScope,
    lease: HousingLeaseEntity,
    access: HousingLeaseDetailAccess
  ): Promise<HousingLeaseDetailData> {
    const common = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId: lease.id,
      isDeleted: false
    };
    const values = await Promise.all([
      access.tenant ? this.dataSource.getRepository(PartyEntity).findOne({
        where: { id: lease.tenantPartyId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      }) : null,
      access.tenant ? this.dataSource.getRepository(HousingLeaseOccupantEntity).find({ where: common }) : [],
      access.billing ? this.dataSource.getRepository(HousingChargePlanEntity).find({ where: common }) : [],
      access.finance ? this.dataSource.getRepository(HousingReceivableEntity).find({
        where: common, order: { dueDate: "ASC" }
      }) : [],
      access.finance ? this.dataSource.getRepository(HousingLedgerEntryEntity).find({
        where: common, order: { occurredAt: "ASC" }
      }) : [],
      access.handovers ? this.dataSource.getRepository(HousingHandoverEntity).find({ where: common }) : [],
      access.handoverFiles ? this.loadHandoverEvidence(scope, lease.id) : [],
      access.pendingHandoverFiles ? this.loadPendingHandoverFiles(scope, lease.id) : [],
      access.repairs ? this.loadLeaseRepairs(scope, lease) : [],
      access.pendingRepairFiles ? this.loadPendingRepairFiles(scope, lease.id) : []
    ]);
    const [tenant, occupants, chargePlans, receivables, ledger, handovers,
      handoverEvidenceFiles, pendingHandoverFiles, repairs, pendingRepairFiles] = values;
    return {
      tenant, occupants, chargePlans, receivables, ledger, handovers,
      handoverEvidenceFiles, pendingHandoverFiles, repairs, pendingRepairFiles
    };
  }

  private loadHandoverEvidence(scope: TenantParkScope, leaseId: string) {
    return this.dataSource.getRepository(FileEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bizType: In([
          "housing_handover",
          "housing_handover_move_in",
          "housing_handover_move_out"
        ]),
        bizId: leaseId,
        status: 1,
        isDeleted: false
      },
      order: { createTime: "DESC" }
    });
  }

  private loadPendingHandoverFiles(scope: TenantParkScope, leaseId: string) {
    return this.dataSource.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.biz_type IN (:...bizTypes)", {
        bizTypes: ["housing_handover", "housing_handover_move_in", "housing_handover_move_out"]
      })
      .andWhere("file.biz_id = :leaseId", { leaseId })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM biz_housing_handover handover
        WHERE handover.tenant_id = file.tenant_id
          AND handover.park_id = file.park_id AND handover.lease_id = file.biz_id
          AND handover.is_deleted = false AND handover.photo_file_ids ? file.id::text
      )`)
      .orderBy("file.create_time", "DESC")
      .getMany();
  }

  private loadLeaseRepairs(scope: TenantParkScope, lease: HousingLeaseEntity) {
    return this.dataSource.getRepository(WorkOrderEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sourceType: "tenant_request",
        sourceId: lease.id,
        unitId: lease.unitId,
        isDeleted: false
      },
      order: { createTime: "DESC" }
    });
  }

  private loadPendingRepairFiles(scope: TenantParkScope, leaseId: string) {
    return this.dataSource.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.biz_type = :bizType", { bizType: "housing_repair" })
      .andWhere("file.biz_id = :leaseId", { leaseId })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM biz_work_order repair
        WHERE repair.tenant_id = file.tenant_id AND repair.park_id = file.park_id
          AND repair.is_deleted = false AND file.id = ANY(repair.image_file_ids)
      )`)
      .orderBy("file.create_time", "DESC")
      .getMany();
  }

  private async loadOccupantNames(
    scope: TenantParkScope,
    occupants: HousingLeaseOccupantEntity[]
  ): Promise<Map<string, string>> {
    if (!occupants.length) return new Map();
    const parties = await this.dataSource.getRepository(PartyEntity).find({
      where: {
        id: In(occupants.map((occupant) => occupant.partyId)),
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    return new Map(parties.map((party) => [party.id, party.displayName]));
  }

  private projectLeaseDetail(
    lease: HousingLeaseEntity,
    actor: JwtPrincipal,
    access: HousingLeaseDetailAccess,
    data: HousingLeaseDetailData,
    occupantNames: Map<string, string>
  ) {
    return {
      lease: this.toLeaseResponse(lease, actor),
      ...(data.tenant ? { tenant: this.toTenantEntityResponse(data.tenant, actor) } : {}),
      ...(access.tenant ? { occupants: data.occupants.map((occupant) => ({
        id: occupant.id,
        partyId: occupant.partyId,
        partyDisplayName: occupantNames.get(occupant.partyId) ?? null,
        occupantRole: occupant.occupantRole,
        emergencyContact: occupant.emergencyContact
      })) } : {}),
      ...(access.billing ? { charge_plans: data.chargePlans.map((plan) =>
        this.toChargePlanResponse(plan, access.finance)) } : {}),
      ...(access.finance ? {
        receivables: data.receivables.map((item) => this.toReceivableResponse(item)),
        ledger: data.ledger.map((item) => this.toLedgerResponse(item)),
        finance_summary: this.financeSummary(data.receivables, data.ledger)
      } : {}),
      ...(access.handovers ? {
        handovers: this.projectLeaseHandovers(data, actor, access.handoverFiles)
      } : {}),
      ...(access.pendingHandoverFiles ? {
        pending_handover_files: this.projectPendingHandoverFiles(data)
      } : {}),
      ...(access.repairs ? {
        repairs: data.repairs.map((repair) => this.toRepairSummary(repair))
      } : {}),
      ...(access.pendingRepairFiles ? {
        pending_repair_files: data.pendingRepairFiles.map((file) => this.toFileRef(file))
      } : {})
    };
  }

  private projectLeaseHandovers(
    data: HousingLeaseDetailData,
    actor: JwtPrincipal,
    includeFiles: boolean
  ) {
    return data.handovers.map((handover) => ({
      ...this.toHandoverResponse(handover, actor),
      ...(includeFiles ? {
        photo_files: handover.photoFileIds
          .map((id) => data.handoverEvidenceFiles.find((file) => file.id === id))
          .filter((file): file is FileEntity => Boolean(file))
          .map((file) => this.toFileRef(file))
      } : {})
    }));
  }

  private projectPendingHandoverFiles(data: HousingLeaseDetailData) {
    const moveInCompleted = data.handovers.some((item) =>
      item.handoverType === "move_in" && item.status === "completed"
    );
    const matches = (file: FileEntity, type: "move_in" | "move_out") =>
      file.bizType === `housing_handover_${type}`
      || (file.bizType === "housing_handover" && (type === "move_out") === moveInCompleted);
    return {
      move_in: data.pendingHandoverFiles.filter((file) => matches(file, "move_in"))
        .map((file) => this.toFileRef(file)),
      move_out: data.pendingHandoverFiles.filter((file) => matches(file, "move_out"))
        .map((file) => this.toFileRef(file))
    };
  }

  async createLease(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHousingLeaseDto
  ) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    this.assertDatePeriod(dto.start_date, dto.end_date);
    parseHousingCalendarDate(dto.first_due_date);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.mustParty(manager, scope, dto.tenant_party_id);
        const repository = manager.getRepository(HousingLeaseEntity);
        const lease = await repository.save(repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseCode: dto.lease_code ?? this.generateCode("HL"),
          unitId: dto.unit_id,
          tenantPartyId: dto.tenant_party_id,
          occupancyId: null,
          status: "draft",
          startDate: dto.start_date.slice(0, 10),
          endDate: dto.end_date.slice(0, 10),
          paymentCycleMonths: dto.payment_cycle_months,
          billingDay: dto.billing_day,
          monthlyRent: formatHousingMoney(dto.monthly_rent),
          depositAmount: formatHousingMoney(dto.deposit_amount),
          firstDueDate: dto.first_due_date.slice(0, 10),
          tailPeriodRule: dto.tail_period_rule,
          approvalNote: null,
          approvedBy: null,
          approvedAt: null,
          signatureFileId: null,
          signedAt: null,
          effectiveAt: null,
          checkoutAt: null,
          terminationReason: null,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: dto.remark ?? null
        }));
        const plans = manager.getRepository(HousingChargePlanEntity);
        await plans.save(plans.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId: lease.id,
          chargeType: "rent",
          billingSource: "fixed",
          cycleMonths: dto.payment_cycle_months,
          amount: formatHousingMoney(dto.monthly_rent),
          unitPrice: null,
          meterId: null,
          enabled: true,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: "租约创建时生成的租金计划"
        }));
        return lease;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Housing lease code already exists in current tenant and park");
      }
      throw error;
    }
  }

  async submitLease(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.transitionLease(scope, actor, id, ["draft"], "pending_approval");
  }

  async approveLease(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    dto: ApproveHousingLeaseDto, clientKey = "") {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.leases.approve");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["pending_approval"]);
      return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
        actionId: "housing.leases.approve.request", sourceType: "housing-lease",
        sourceId: lease.id, sourceExpectedVersion: lease.version, requesterId: actor.sub,
        submitterId: actor.sub, actorId: actor.sub, clientKey,
        businessIntentKey: `housing-lease-approve:${lease.id}:${lease.version}`,
        canonicalPayload: { leaseId: lease.id, fromStatus: lease.status,
          approvalNote: dto.approval_note?.trim() ?? null,
          actorName: actor.realName?.trim() || actor.username },
        payloadSchemaVersion: 1, amount: null, currency: null
      });
    });
  }

  async signLease(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SignHousingLeaseDto) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["pending_signature"]);
      await this.assertFiles(manager, scope, [dto.signature_file_id], {
        mimePrefix: "application/pdf",
        bizType: "housing_lease_signature",
        bizId: lease.id
      });
      lease.signatureFileId = dto.signature_file_id;
      lease.signedAt = dto.signed_at ? new Date(dto.signed_at) : new Date();
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
    });
  }

  async activateLease(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    idempotencyKey?: string
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const lease = await this.lockLease(manager, scope, id);
        await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
        if (lease.status === "active") return lease;
        this.assertStatus(lease, ["pending_signature"]);
        if (!lease.signatureFileId || !lease.signedAt || !lease.approvedAt) {
          throw new ConflictException("Approval and offline signature registration are required before activation");
        }
        await this.assertFiles(manager, scope, [lease.signatureFileId], {
          mimePrefix: "application/pdf",
          bizType: "housing_lease_signature",
          bizId: lease.id
        });
        const occupancy = await this.occupancyService.createInTransaction(manager, scope, actor, {
          unit_id: lease.unitId,
          source_domain: "housing_rental",
          source_type: "housing_lease",
          source_id: lease.id,
          start_at: this.businessDateStart(lease.startDate).toISOString(),
          end_at: this.businessDateStart(this.addDays(lease.endDate, 1)).toISOString(),
          status: "active",
          remark: `住房租约 ${lease.leaseCode}`
        }, idempotencyKey);
        lease.occupancyId = occupancy.id;
        lease.status = "active";
        lease.effectiveAt = new Date();
        lease.updateBy = actor.sub;
        const saved = await manager.getRepository(HousingLeaseEntity).save(lease);
        if (Number(saved.depositAmount) > 0) {
          await this.createReceivable(manager, scope, actor, saved, {
            chargePlanId: null,
            sourceType: "lease_deposit",
            sourceId: saved.id,
            chargeType: "deposit",
            periodStart: saved.startDate,
            periodEnd: this.addDays(saved.startDate, 1),
            dueDate: saved.firstDueDate,
            amount: saved.depositAmount
          });
        }
        return saved;
      });
    } catch (error) {
      if (this.isDatabaseConflict(error)) throw new ConflictException("Lease period conflicts with another occupancy");
      throw error;
    }
  }

  async voidLease(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    reason: string, clientKey = "") {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("housing.leases.void");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["draft", "pending_approval", "pending_signature"]);
      return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
        actionId: "housing.leases.void.request", sourceType: "housing-lease",
        sourceId: lease.id, sourceExpectedVersion: lease.version, requesterId: actor.sub,
        submitterId: actor.sub, actorId: actor.sub, clientKey,
        businessIntentKey: `housing-lease-void:${lease.id}:${lease.version}`,
        canonicalPayload: { leaseId: lease.id, fromStatus: lease.status, reason: reason.trim(),
          actorName: actor.realName?.trim() || actor.username },
        payloadSchemaVersion: 1, amount: null, currency: null
      });
    });
  }

  async addOccupant(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AddHousingOccupantDto) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (["terminated", "void"].includes(lease.status)) {
        throw new ConflictException("Final housing leases cannot accept new occupants");
      }
      await this.mustParty(manager, scope, dto.party_id);
      const repository = manager.getRepository(HousingLeaseOccupantEntity);
      const current = await repository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, leaseId: id, partyId: dto.party_id, isDeleted: false }
      });
      if (current) return current;
      return repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId: id,
        partyId: dto.party_id,
        occupantRole: dto.occupant_role,
        emergencyContact: dto.emergency_contact,
        createBy: actor.sub,
        updateBy: actor.sub
      }));
    });
  }

  async saveChargePlan(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: UpsertHousingChargePlanDto
  ) {
    if (dto.billing_source === "fixed" && dto.amount === undefined) {
      throw new BadRequestException("Fixed charge plan requires amount");
    }
    if (dto.billing_source === "energy_meter" && (!dto.meter_id || dto.unit_price === undefined)) {
      throw new BadRequestException("Energy meter charge plan requires meter_id and unit_price");
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const lease = await this.lockLease(manager, scope, leaseId);
        await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
        if (["terminated", "void"].includes(lease.status)) {
          throw new ConflictException("Final housing leases cannot change charge plans");
        }
        if (dto.billing_source === "energy_meter") {
          const meter = await manager.getRepository(EnergyMeterEntity).findOne({
            where: {
              id: dto.meter_id!,
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              isDeleted: false
            }
          });
          if (!meter) throw new NotFoundException("Energy meter not found");
          this.assertHousingMeterOnline(meter);
          if (meter.roomId !== lease.unitId) {
            throw new BadRequestException("Energy meter must belong to the housing lease unit");
          }
        }
        const repository = manager.getRepository(HousingChargePlanEntity);
        const existing = await repository.findOne({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            chargeType: dto.charge_type,
            isDeleted: false
          }
        });
        const plan = existing ?? repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          chargeType: dto.charge_type,
          createBy: actor.sub
        });
        plan.billingSource = dto.billing_source;
        plan.cycleMonths = dto.cycle_months;
        plan.amount = dto.billing_source === "fixed" ? formatHousingMoney(dto.amount!) : null;
        plan.unitPrice = dto.billing_source === "energy_meter" ? dto.unit_price! : null;
        plan.meterId = dto.billing_source === "energy_meter" ? dto.meter_id! : null;
        plan.enabled = dto.enabled;
        plan.updateBy = actor.sub;
        plan.remark = dto.remark ?? null;
        return repository.save(plan);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Charge plan already exists for this lease and charge type");
      }
      throw error;
    }
  }

  async generateBills(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: GenerateHousingBillsDto
  ) {
    this.assertDatePeriod(dto.period_start, dto.period_end);
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      assertHousingBillingPeriodWithinLease(dto.period_start, dto.period_end, lease.startDate, lease.endDate);
      const plan = await manager.getRepository(HousingChargePlanEntity).findOne({
        where: {
          id: dto.charge_plan_id,
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          enabled: true,
          isDeleted: false
        }
      });
      if (!plan) throw new NotFoundException("Enabled charge plan not found");
      const overlapping = await manager.getRepository(HousingReceivableEntity)
        .createQueryBuilder("receivable")
        .setLock("pessimistic_write")
        .where("receivable.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("receivable.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("receivable.lease_id = :leaseId", { leaseId })
        .andWhere("receivable.charge_plan_id = :chargePlanId", { chargePlanId: plan.id })
        .andWhere("receivable.is_deleted = false")
        .andWhere("receivable.status <> 'void'")
        .andWhere("receivable.period_start < :periodEnd", { periodEnd: dto.period_end })
        .andWhere("receivable.period_end > :periodStart", { periodStart: dto.period_start })
        .getOne();
      if (overlapping) {
        throw new ConflictException("Billing period overlaps an existing receivable for this charge plan");
      }
      const meter = plan.billingSource === "energy_meter"
        ? await manager.getRepository(EnergyMeterEntity).findOne({
            where: {
              id: plan.meterId!,
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              isDeleted: false
            }
          })
        : null;
      if (plan.billingSource === "energy_meter") {
        if (!meter) throw new NotFoundException("Energy meter not found");
        this.assertHousingMeterOnline(meter);
        if (meter.roomId !== lease.unitId) {
          throw new BadRequestException("Energy meter must belong to the housing lease unit");
        }
      }
      const calculation = this.calculateBillAmount(plan, dto, lease.startDate, meter);
      const firstRentReceivable = plan.chargeType === "rent"
        ? await manager.getRepository(HousingReceivableEntity).findOne({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            chargeType: "rent",
            isDeleted: false
          }
        })
        : null;
      return [await this.createReceivable(manager, scope, actor, lease, {
        chargePlanId: plan.id,
        sourceType: plan.billingSource,
        sourceId: plan.meterId,
        chargeType: plan.chargeType,
        periodStart: dto.period_start,
        periodEnd: dto.period_end,
        dueDate: plan.chargeType === "rent" && !firstRentReceivable
          ? lease.firstDueDate
          : this.dueDateForPeriod(dto.period_start, lease.billingDay),
        amount: calculation.amount,
        openingReading: dto.opening_reading,
        closingReading: dto.closing_reading,
        usageAmount: calculation.usageAmount,
        unitPrice: plan.unitPrice ?? undefined,
        remark: dto.reason
      })];
    });
  }

  async registerLedger(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto,
    clientKey = ""
  ) {
    if (["refund", "waiver", "deposit_refund"].includes(dto.entry_type)) {
      assertPropertyHighRiskActionPermissions(actor, [
        SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]);
      if (!this.approvalCommands) {
        assertPropertyHighRiskActionApprovalRequired("housing.finance.refund-waive-or-deposit-refund");
        throw new ConflictException("Property approval runtime is unavailable");
      }
    }
    const requiredPermission = dto.entry_type === "waiver"
      ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE
      : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER;
    if (!this.hasPermission(actor, requiredPermission)) {
      throw new ForbiddenException(`${requiredPermission} permission is required`);
    }
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      if (dto.entry_type === "charge") {
        throw new BadRequestException("Create tenant charges through a charge plan and receivable");
      }
      if (dto.entry_type === "deposit_deduction") {
        throw new BadRequestException("Deposit deductions can only be created by the move-out handover workflow");
      }
      let entryType = dto.entry_type;
      let receivable: HousingReceivableEntity | null = null;
      if (dto.receivable_id) {
        receivable = await manager.getRepository(HousingReceivableEntity).findOne({
          where: {
            id: dto.receivable_id,
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            isDeleted: false
          },
          lock: { mode: "pessimistic_write" }
        });
        if (!receivable) throw new NotFoundException("Housing receivable not found");
        if (receivable.status === "void") throw new ConflictException("Void receivable cannot receive financial entries");
        if (receivable.chargeType === "deposit") {
          if (!["deposit_receipt", "deposit_refund"].includes(entryType)) {
            throw new BadRequestException(
              "Deposit receivables require deposit_receipt or deposit_refund"
            );
          }
        } else if (entryType.startsWith("deposit_")) {
          throw new BadRequestException("Deposit entries can only target the lease deposit receivable");
        }
      }
      if (entryType === "deposit_receipt" && !receivable) {
        receivable = await manager.getRepository(HousingReceivableEntity).findOne({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            chargeType: "deposit",
            sourceType: "lease_deposit",
            isDeleted: false
          },
          lock: { mode: "pessimistic_write" }
        });
        if (!receivable) throw new ConflictException("Lease deposit receivable is missing");
      }
      if (entryType.startsWith("deposit_")) {
        const depositEntries = await manager.getRepository(HousingLedgerEntryEntity).find({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            status: "confirmed",
            isDeleted: false
          }
        });
        const currentDeposit = calculateHousingDepositBalance(depositEntries);
        assertHousingDepositMutation(lease.depositAmount, currentDeposit, entryType, dto.amount);
      }
      if (["refund", "waiver", "deposit_refund"].includes(entryType)) {
        if (!receivable) throw new BadRequestException("Receivable is required for refund or waiver");
        const unresolved = await manager.query(
          `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
            WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
              AND result.entry_type IN ('refund','waiver','deposit_refund')
              AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
          [scope.tenantId, scope.parkId, leaseId]
        ) as Array<{ count: number }>;
        if (Number(unresolved[0]?.count ?? 0) > 0) {
          throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
        }
        const paymentActors = await manager.query(
          `SELECT create_by::text AS "actorId" FROM biz_housing_ledger_entry
            WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND receivable_id=$4
              AND entry_type IN ('payment','deposit_receipt') AND status='confirmed'
              AND is_deleted=false ORDER BY occurred_at DESC,id DESC LIMIT 1 FOR UPDATE`,
          [scope.tenantId, scope.parkId, leaseId, receivable.id]
        ) as Array<{ actorId: string | null }>;
        if (!paymentActors[0]?.actorId) {
          throw new ConflictException("A linked payment recorder is required before approval");
        }
        const amount = formatHousingMoney(dto.amount);
        const canonicalEntryType = entryType === "deposit_refund" ? "deposit-refund" : entryType;
        return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
          contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
          actionId: "housing.finance.refund-waive-or-deposit-refund.request",
          sourceType: "housing-lease", sourceId: lease.id,
          sourceExpectedVersion: lease.version, requesterId: actor.sub, submitterId: actor.sub,
          actorId: actor.sub, clientKey,
          businessIntentKey: `housing-finance:${lease.id}:${lease.version}:${canonicalEntryType}:${receivable.id}:${receivable.version}`,
          canonicalPayload: { leaseId: lease.id, leaseExpectedVersion: lease.version,
            reason: dto.reason.trim(), actorName: actor.realName?.trim() || actor.username,
            lines: [{ entryType: canonicalEntryType, receivableId: receivable.id,
              receivableExpectedVersion: receivable.version, receivableAmount: receivable.amount,
              receivablePaidAmount: receivable.paidAmount, receivableWaivedAmount: receivable.waivedAmount,
              chargeType: receivable.chargeType, amount, currency: receivable.currency,
              paymentRecorderId: paymentActors[0].actorId }] },
          payloadSchemaVersion: 1, amount, currency: receivable.currency
        });
      }
      if (receivable) {
        let receivableChanged = true;
        if (entryType === "deposit_receipt") {
          this.applyReceivableEntry(receivable, { ...dto, entry_type: "payment" });
        } else if (entryType === "deposit_refund") {
          receivableChanged = false;
        } else {
          this.applyReceivableEntry(receivable, dto);
        }
        if (receivableChanged) {
          receivable.updateBy = actor.sub;
          await manager.getRepository(HousingReceivableEntity).save(receivable);
        }
      } else if (["payment", "refund", "waiver"].includes(entryType)) {
        throw new BadRequestException("Receivable is required for payment, refund, or waiver");
      }
      const chargeType = entryType.startsWith("deposit_") ? "deposit" : receivable?.chargeType;
      if (!chargeType) throw new BadRequestException("Receivable charge type is required for financial entries");
      const repository = manager.getRepository(HousingLedgerEntryEntity);
      return repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        receivableId: receivable?.id ?? null,
        entryType,
        chargeType,
        amount: formatHousingMoney(dto.amount),
        paymentMethod: dto.payment_method ?? null,
        transactionReference: dto.transaction_reference ?? null,
        sourceType: "manual",
        sourceId: null,
        status: "confirmed",
        reason: dto.reason,
        occurredAt: new Date(),
        createBy: actor.sub,
        updateBy: actor.sub
      }));
    });
  }

  async completeHandover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CompleteHousingHandoverDto,
    clientKey = ""
  ) {
    const requiresFinancialApproval =
      dto.handover_type === "move_out"
      && (
        compareHousingMoney(dto.damage_amount, "0.00") !== 0
        || compareHousingMoney(dto.unsettled_amount, "0.00") !== 0
        || compareHousingMoney(dto.deposit_deduction_amount, "0.00") !== 0
      );
    if (requiresFinancialApproval) {
      assertPropertyHighRiskActionPermissions(actor, [
        SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]);
      if (!this.approvalCommands) {
        assertPropertyHighRiskActionApprovalRequired(
          "housing.handovers.complete-move-out-financial"
        );
        throw new ConflictException("Property approval runtime is unavailable");
      }
    }
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      const repository = manager.getRepository(HousingHandoverEntity);
      if (requiresFinancialApproval) {
        await this.lockHousingBusinessKey(
          manager,
          this.housingHandoverAdvisoryKey(scope, leaseId)
        );
        const history = typeormQueryRows<{ id: string; status: string; isDeleted: boolean }>(
          await manager.query(
            `SELECT id::text AS id,status,is_deleted AS "isDeleted"
               FROM biz_housing_handover
              WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND handover_type='move_out'
              ORDER BY id FOR UPDATE`,
            [scope.tenantId, scope.parkId, leaseId]
          )
        );
        if (history.length > 1 || history.some((row) => row.isDeleted)
          || history.some((row) => !["draft", "completed"].includes(row.status))) {
          throw new ConflictException("Housing handover history conflicts with approval submission");
        }
        if (history[0]?.status === "completed") {
          throw new ConflictException("Housing handover is already completed");
        }
      }
      let handover = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          handoverType: dto.handover_type,
          isDeleted: false
        },
        lock: { mode: "pessimistic_write" }
      });
      if (handover?.status === "completed") {
        if (requiresFinancialApproval) {
          throw new ConflictException("Housing handover is already completed");
        }
        return handover;
      }
      if (dto.handover_type === "move_in") this.assertStatus(lease, ["active"]);
      else this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      if (
        dto.handover_type === "move_in"
        && (
          compareHousingMoney(dto.damage_amount, "0.00") > 0
          || compareHousingMoney(dto.unsettled_amount, "0.00") > 0
          || compareHousingMoney(dto.deposit_deduction_amount, "0.00") > 0
        )
      ) {
        throw new BadRequestException("Move-in handover cannot include damage, unsettled, or deposit deduction amounts");
      }
      const handoverPhotoIds = dto.photo_file_ids ?? [];
      await this.assertFiles(manager, scope, handoverPhotoIds, {
        mimePrefix: "image/",
        allowedBizTypes: [
          "housing_handover",
          `housing_handover_${dto.handover_type}`
        ],
        bizId: lease.id
      });
      if (handoverPhotoIds.length) {
        const previouslyBound = await manager.query(
          `SELECT 1
           FROM biz_housing_handover bound_handover
           WHERE bound_handover.tenant_id = $1
             AND bound_handover.park_id = $2
             AND bound_handover.lease_id = $3
             AND bound_handover.handover_type <> $4
             AND bound_handover.is_deleted = false
             AND EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(bound_handover.photo_file_ids) bound_file_id
               WHERE bound_file_id = ANY($5::text[])
             )
           LIMIT 1`,
          [scope.tenantId, scope.parkId, lease.id, dto.handover_type, handoverPhotoIds]
        ) as Array<{ "?column?": number }>;
        if (previouslyBound.length) {
          throw new ConflictException("One or more handover attachments are already bound to another handover");
        }
      }
      if (dto.signature_file_id) {
        await this.assertFiles(manager, scope, [dto.signature_file_id], {
          bizType: "housing_handover",
          bizId: lease.id
        });
      }
      if (compareHousingMoney(dto.deposit_deduction_amount, lease.depositAmount) > 0) {
        throw new BadRequestException("Deposit deduction cannot exceed agreed deposit");
      }
      handover ??= repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        handoverType: dto.handover_type,
        createBy: actor.sub
      });
      const checkoutCharge = addHousingMoneyAmounts([dto.damage_amount, dto.unsettled_amount]);
      if (compareHousingMoney(dto.deposit_deduction_amount, checkoutCharge) > 0) {
        throw new BadRequestException("Deposit deduction cannot exceed move-out damage and unsettled charges");
      }
      if (requiresFinancialApproval) {
        const unresolved = await manager.query(
          `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
            WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
              AND result.entry_type IN ('refund','waiver','deposit_refund')
              AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
          [scope.tenantId, scope.parkId, leaseId]
        ) as Array<{ count: number }>;
        if (Number(unresolved[0]?.count ?? 0) > 0) {
          throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
        }
        handover.status = "draft";
        handover.handoverAt = null;
        handover.itemSnapshot = dto.item_snapshot ?? [];
        handover.meterReadings = dto.meter_readings ?? [];
        handover.credentials = dto.credentials ?? [];
        handover.photoFileIds = handoverPhotoIds;
        handover.signatureFileId = dto.signature_file_id ?? null;
        handover.damageAmount = formatHousingMoney(dto.damage_amount);
        handover.unsettledAmount = formatHousingMoney(dto.unsettled_amount);
        handover.depositDeductionAmount = formatHousingMoney(dto.deposit_deduction_amount);
        handover.currency = lease.currency;
        handover.updateBy = actor.sub;
        handover.remark = dto.remark ?? null;
        handover.approvalExecutionKey = null;
        handover.approvalEffectKind = null;
        handover.approvalEffectLineKey = null;
        handover.approvalEffectHash = null;
        const draft = await repository.save(handover);
        const [clock] = typeormQueryRows<{ businessDate: string }>(await manager.query(
          `SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Shanghai')::date::text AS "businessDate"`
        ));
        if (!clock?.businessDate) throw new ConflictException("Housing business date is unavailable");
        const checkoutReceivablePeriodEnd = this.addDays(clock.businessDate, 1);
        const checkoutReceivableId = compareHousingMoney(checkoutCharge, "0.00") > 0
          ? randomUUID() : null;
        let checkoutReceivable: {
          mode: "new" | "existing";
          id: string;
          expectedVersion: number | null;
          originalAmount: string;
          originalPaidAmount: string;
          originalWaivedAmount: string;
          originalStatus: string;
          periodStart: string;
          periodEnd: string;
          dueDate: string;
        } | null = null;
        if (checkoutReceivableId) {
          await this.lockHousingBusinessKey(
            manager,
            this.housingReceivableAdvisoryKey(scope, lease.id, {
              sourceType: "housing_handover",
              sourceId: draft.id,
              chargeType: "checkout_charges",
              periodStart: clock.businessDate,
              periodEnd: checkoutReceivablePeriodEnd
            })
          );
          const existingRows = typeormQueryRows<{
            id: string; version: number; amount: string; paidAmount: string;
            waivedAmount: string; status: string; currency: string; isDeleted: boolean;
            periodStart: string; periodEnd: string; dueDate: string;
          }>(await manager.query(
            `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
                    waived_amount::text AS "waivedAmount",status,currency,is_deleted AS "isDeleted",
                    period_start::text AS "periodStart",period_end::text AS "periodEnd",
                    due_date::text AS "dueDate"
               FROM biz_housing_receivable
              WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
                AND source_type='housing_handover' AND source_id=$4
                AND charge_type='checkout_charges' ORDER BY id FOR UPDATE`,
            [scope.tenantId, scope.parkId, leaseId, draft.id]
          ));
          if (existingRows.length > 1 || existingRows.some((row) => row.isDeleted || row.status === "void")) {
            throw new ConflictException("Housing checkout receivable history conflicts with approval submission");
          }
          const existing = existingRows[0];
          if (existing && existing.currency !== lease.currency) {
            throw new ConflictException("Housing checkout receivable currency changed");
          }
          checkoutReceivable = existing ? {
            mode: "existing", id: existing.id, expectedVersion: existing.version,
            originalAmount: formatHousingMoney(existing.amount),
            originalPaidAmount: formatHousingMoney(existing.paidAmount),
            originalWaivedAmount: formatHousingMoney(existing.waivedAmount),
            originalStatus: existing.status, periodStart: existing.periodStart,
            periodEnd: existing.periodEnd, dueDate: existing.dueDate
          } : {
            mode: "new", id: checkoutReceivableId, expectedVersion: null,
            originalAmount: "0.00", originalPaidAmount: "0.00",
            originalWaivedAmount: "0.00", originalStatus: "absent",
            periodStart: clock.businessDate, periodEnd: checkoutReceivablePeriodEnd,
            dueDate: clock.businessDate
          };
          const resultingSettlement = addHousingMoneyAmounts([
            checkoutReceivable.originalPaidAmount,
            checkoutReceivable.originalWaivedAmount,
            dto.deposit_deduction_amount
          ]);
          if (compareHousingMoney(resultingSettlement, checkoutCharge) > 0) {
            throw new ConflictException("Housing checkout settlement exceeds its receivable amount");
          }
        }
        const depositContributors = typeormQueryRows<{
          id: string; version: number; entryType: string; amount: string; currency: string;
          status: string; receivableId: string | null; sourceType: string; sourceId: string | null;
        }>(await manager.query(
          `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
                  status,receivable_id::text AS "receivableId",source_type AS "sourceType",
                  source_id::text AS "sourceId"
             FROM biz_housing_ledger_entry
            WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
              AND status='confirmed' AND is_deleted=false ORDER BY id FOR UPDATE`,
          [scope.tenantId, scope.parkId, leaseId]
        ));
        const depositBalance = calculateHousingDepositBalance(
          depositContributors.map((row) => ({ ...row, isDeleted: false })) as HousingLedgerEntryEntity[]
        );
        if (compareHousingMoney(dto.deposit_deduction_amount, depositBalance) > 0) {
          throw new ConflictException("Deposit deduction exceeds current deposit balance");
        }
        const financialTotal = addHousingMoneyAmounts([
          checkoutCharge, dto.deposit_deduction_amount
        ]);
        return this.approvalCommands!.createPendingRequest(
          { transactionContext: manager },
          {
            contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
            scope,
            actionId: "housing.handovers.complete-move-out-financial.request",
            sourceType: "housing-handover",
            sourceId: draft.id,
            sourceExpectedVersion: draft.version,
            requesterId: actor.sub,
            submitterId: actor.sub,
            actorId: actor.sub,
            clientKey,
            businessIntentKey: `housing-handover:${draft.id}:${draft.version}`,
            canonicalPayload: {
              handoverId: draft.id,
              leaseId: lease.id,
              leaseExpectedVersion: lease.version,
              fromLeaseStatus: lease.status,
              reason: dto.remark?.trim() || "完成退租财务交接",
              actorName: actor.realName?.trim() || actor.username,
              itemSnapshotHash: this.approvalSnapshotHash(draft.itemSnapshot),
              meterReadingsHash: this.approvalSnapshotHash(draft.meterReadings),
              credentialsHash: this.approvalSnapshotHash(draft.credentials),
              photoFileIdsHash: this.approvalSnapshotHash(draft.photoFileIds),
              signatureFileId: draft.signatureFileId,
              checkoutBusinessDate: clock.businessDate,
              checkoutReceivablePeriodStart: checkoutReceivable?.periodStart ?? clock.businessDate,
              checkoutReceivablePeriodEnd: checkoutReceivable?.periodEnd ?? checkoutReceivablePeriodEnd,
              checkoutReceivableDueDate: checkoutReceivable?.dueDate ?? clock.businessDate,
              checkoutReceivableMode: checkoutReceivable?.mode ?? "none",
              checkoutReceivableId: checkoutReceivable?.id ?? null,
              checkoutReceivableExpectedVersion: checkoutReceivable?.expectedVersion ?? null,
              checkoutReceivableOriginalAmount: checkoutReceivable?.originalAmount ?? null,
              checkoutReceivableOriginalPaidAmount: checkoutReceivable?.originalPaidAmount ?? null,
              checkoutReceivableOriginalWaivedAmount: checkoutReceivable?.originalWaivedAmount ?? null,
              checkoutReceivableOriginalStatus: checkoutReceivable?.originalStatus ?? null,
              checkoutReceivableAmount: checkoutCharge,
              checkoutReceivablePaidAmount: addHousingMoneyAmounts([
                checkoutReceivable?.originalPaidAmount ?? "0.00",
                dto.deposit_deduction_amount
              ]),
              checkoutReceivableWaivedAmount: checkoutReceivable?.originalWaivedAmount ?? "0.00",
              depositBalance,
              depositContributors,
              depositContributorsHash: this.approvalSnapshotHash(depositContributors),
              currency: lease.currency,
              ...(compareHousingMoney(dto.deposit_deduction_amount, "0.00") > 0 ? {
                deductions: [{ itemId: draft.id,
                  amount: formatHousingMoney(dto.deposit_deduction_amount), currency: lease.currency }]
              } : {})
            },
            payloadSchemaVersion: 1,
            amount: financialTotal,
            currency: lease.currency
          }
        );
      }
      handover.status = "completed";
      handover.handoverAt = new Date();
      handover.itemSnapshot = dto.item_snapshot ?? [];
      handover.meterReadings = dto.meter_readings ?? [];
      handover.credentials = dto.credentials ?? [];
      handover.photoFileIds = handoverPhotoIds;
      handover.signatureFileId = dto.signature_file_id ?? null;
      handover.damageAmount = formatHousingMoney(dto.damage_amount);
      handover.unsettledAmount = formatHousingMoney(dto.unsettled_amount);
      handover.depositDeductionAmount = formatHousingMoney(dto.deposit_deduction_amount);
      handover.updateBy = actor.sub;
      handover.remark = dto.remark ?? null;
      const saved = await repository.save(handover);
      if (dto.handover_type === "move_out") {
        let checkoutReceivable: HousingReceivableEntity | null = null;
        if (compareHousingMoney(checkoutCharge, "0.00") > 0) {
          const businessDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
          checkoutReceivable = await this.createReceivable(manager, scope, actor, lease, {
            chargePlanId: null,
            sourceType: "housing_handover",
            sourceId: saved.id,
            chargeType: "checkout_charges",
            periodStart: businessDate,
            periodEnd: this.addDays(businessDate, 1),
            dueDate: businessDate,
            amount: checkoutCharge,
            remark: dto.remark ?? "Move-out damage and unsettled charges"
          });
          if (compareHousingMoney(dto.deposit_deduction_amount, "0.00") > 0) {
            this.applyReceivableEntry(checkoutReceivable, {
              entry_type: "payment",
              charge_type: "checkout_deduction",
              amount: dto.deposit_deduction_amount,
              reason: dto.remark ?? "Move-out deposit deduction"
            });
            checkoutReceivable.updateBy = actor.sub;
            await manager.getRepository(HousingReceivableEntity).save(checkoutReceivable);
          }
        }
        lease.status = "checkout_pending";
        lease.updateBy = actor.sub;
        await manager.getRepository(HousingLeaseEntity).save(lease);
        if (compareHousingMoney(dto.deposit_deduction_amount, "0.00") > 0) {
          const ledger = manager.getRepository(HousingLedgerEntryEntity);
          await ledger.save(ledger.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            receivableId: checkoutReceivable?.id ?? null,
            entryType: "deposit_deduction",
            chargeType: "checkout_deduction",
            amount: formatHousingMoney(dto.deposit_deduction_amount),
            paymentMethod: null,
            transactionReference: null,
            sourceType: "housing_handover",
            sourceId: saved.id,
            status: "confirmed",
            reason: dto.remark ?? "退租交割押金抵扣",
            occurredAt: new Date(),
            createBy: actor.sub,
            updateBy: actor.sub
          }));
        }
      }
      return saved;
    });
  }

  async createRepair(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CreateHousingRepairDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      const repairFiles = await this.assertFiles(manager, scope, dto.image_file_ids ?? [], {
        allowedMimeTypes: resolveFileUploadPolicy("housing_repair").mimeTypes,
        bizType: "housing_repair",
        bizId: lease.id
      });
      if (repairFiles.length) {
        const [referencedFile] = await manager.query(
          `SELECT file_id
           FROM unnest($3::uuid[]) AS file_id
           WHERE EXISTS (
             SELECT 1
             FROM biz_work_order work_order
             WHERE work_order.tenant_id = $1
               AND work_order.park_id = $2
               AND work_order.is_deleted = false
               AND file_id = ANY(work_order.image_file_ids)
           )
           LIMIT 1`,
          [scope.tenantId, scope.parkId, repairFiles.map((file) => file.id)]
        ) as Array<{ file_id: string }>;
        if (referencedFile) {
          throw new ConflictException("One or more repair attachments are already bound to a work order");
        }
      }
      const tenant = await this.mustParty(manager, scope, lease.tenantPartyId);
      return this.workOrdersService.create(scope, actor, {
        title: dto.title,
        wo_type: "repair",
        priority: dto.priority,
        urgency: dto.urgency,
        source_type: "tenant_request",
        source_id: lease.id,
        unit_id: lease.unitId,
        reporter_name: tenant.displayName,
        reporter_mobile: tenant.mobile ?? undefined,
        description: dto.description,
        image_file_ids: dto.image_file_ids,
        remark: dto.remark ?? `住房租约 ${lease.leaseCode} 代录报修`
      }, manager);
    });
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
      this.assertStatus(lease, ["checkout_pending"]);
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
      const receiptFiles = await this.assertFiles(
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
        purchaseCode: dto.purchase_code ?? this.generateCode("HP"),
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
      if (this.isUniqueViolation(error)) {
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
      const lease = await this.lockLease(manager, scope, dto.lease_id);
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
      await this.lockHousingBusinessKey(
        manager,
        this.housingReceivableAdvisoryKey(scope, lease.id, {
          sourceType: "purchase_transfer",
          sourceId: purchase.id,
          chargeType: "purchase_recharge",
          periodStart: purchase.purchaseDate,
          periodEnd: this.addDays(purchase.purchaseDate, 1)
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
        periodEnd: this.addDays(purchase.purchaseDate, 1),
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
    const payload = input.canonicalPayload;
    if (!Array.isArray(payload.lines) || payload.lines.length !== 1) {
      throw new ConflictException("Approval source changed");
    }
    const line = payload.lines[0] as Record<string, unknown>;
    const leaseId = this.approvalUuid(payload.leaseId);
    const receivableId = this.approvalUuid(line.receivableId);
    if (leaseId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const leases = await input.manager.query(
      `SELECT version,currency,deposit_amount::text AS "depositAmount" FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2
        AND id=$3 AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ version: number; currency: string; depositAmount: string }>;
    const receivables = await input.manager.query(
      `SELECT version,amount::text AS amount,paid_amount::text AS "paidAmount",
              waived_amount::text AS "waivedAmount",charge_type AS "chargeType",currency,status
         FROM biz_housing_receivable WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND id=$4
          AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, leaseId, receivableId]
    ) as Array<{ version: number; amount: string; paidAmount: string; waivedAmount: string;
      chargeType: string; currency: string; status: string }>;
    const lease = leases[0];
    const receivable = receivables[0];
    if (!lease || lease.version !== input.sourceExpectedVersion || !receivable
      || receivable.version !== Number(line.receivableExpectedVersion)
      || receivable.amount !== line.receivableAmount || receivable.paidAmount !== line.receivablePaidAmount
      || receivable.waivedAmount !== line.receivableWaivedAmount || receivable.currency !== line.currency
      || receivable.status === "void") throw new ConflictException("Approval source changed");
    const unresolved = await input.manager.query(
      `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
        WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
          AND result.entry_type IN ('refund','waiver','deposit_refund')
          AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ count: number }>;
    if (Number(unresolved[0]?.count ?? 0) > 0) {
      throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",invariant_hash AS "effectHash",
              line_amount::text AS "lineAmount",currency FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string; currency: string }>;
    const effect = manifests[0];
    if (!effect || effect.lineAmount !== line.amount || effect.currency !== line.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    const dtoType = line.entryType === "deposit-refund" ? "deposit_refund" : String(line.entryType);
    if (dtoType === "deposit_refund") {
      const entries = await input.manager.getRepository(HousingLedgerEntryEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, leaseId,
          status: "confirmed", isDeleted: false }
      });
      assertHousingDepositMutation(lease.depositAmount,
        calculateHousingDepositBalance(entries), "deposit_refund", String(line.amount));
    }
    const mutable = { ...receivable } as HousingReceivableEntity;
    if (dtoType !== "deposit_refund") {
      this.applyReceivableEntry(mutable, { entry_type: dtoType, amount: String(line.amount) } as RegisterHousingLedgerEntryDto);
      const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
        `UPDATE biz_housing_receivable SET paid_amount=$5,waived_amount=$6,status=$7,
                update_by=$8,update_time=clock_timestamp(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
        [scope.tenantId, scope.parkId, receivableId, receivable.version, mutable.paidAmount,
          mutable.waivedAmount, mutable.status, input.request.requesterId]
      ));
      if (updated.length !== 1) throw new ConflictException("Approval source changed");
    }
    const inserted = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_ledger_entry(
         tenant_id,park_id,lease_id,receivable_id,entry_type,charge_type,amount,currency,
         source_type,source_id,status,reason,occurred_at,create_by,update_by,
         approval_execution_key,approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approval',$4,'confirmed',$9,clock_timestamp(),$10,$10,$11,$12,$13,$14)
       RETURNING id::text AS id`, [scope.tenantId, scope.parkId, leaseId, receivableId,
        dtoType, String(line.chargeType), effect.lineAmount, effect.currency,
        String(payload.reason ?? ""), input.request.requesterId, input.executionIdempotencyKey,
        effect.effectKind, effect.effectLineKey, effect.effectHash]
    ));
    if (inserted.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  async executeApprovedMoveOutHandover(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    const payload = input.canonicalPayload;
    const deductions = Array.isArray(payload.deductions)
      ? payload.deductions as Array<Record<string, unknown>> : [];
    const frozenDeductionAmount = deductions.length > 0
      ? String(deductions[0]!.amount ?? "") : "0.00";
    const handoverId = this.approvalUuid(payload.handoverId);
    const leaseId = this.approvalUuid(payload.leaseId);
    if (handoverId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const leases = typeormQueryRows<{ id: string; status: string; version: number; currency: string }>(
      await input.manager.query(
      `SELECT id::text AS id, status, version, currency FROM biz_housing_lease
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
      )
    );
    const lease = leases[0];
    await this.lockHousingBusinessKey(
      input.manager,
      this.housingHandoverAdvisoryKey(scope, leaseId)
    );
    const handovers = typeormQueryRows<{
      id: string; leaseId: string; status: string; version: number; currency: string;
      damageAmount: string; unsettledAmount: string; deductionAmount: string;
      itemSnapshot: unknown; meterReadings: unknown; credentials: unknown;
      photoFileIds: unknown; signatureFileId: string | null;
    }>(await input.manager.query(
      `SELECT id::text AS id, lease_id::text AS "leaseId", status, version, currency,
              damage_amount::text AS "damageAmount", unsettled_amount::text AS "unsettledAmount",
              deposit_deduction_amount::text AS "deductionAmount",item_snapshot AS "itemSnapshot",
              meter_readings AS "meterReadings",credentials,photo_file_ids AS "photoFileIds",
              signature_file_id::text AS "signatureFileId"
         FROM biz_housing_handover WHERE tenant_id=$1 AND park_id=$2 AND id=$3
          AND handover_type='move_out' AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, handoverId]
    ));
    const handover = handovers[0];
    if (!handover || !lease || handover.leaseId !== leaseId || handover.status !== "draft"
      || handover.version !== input.sourceExpectedVersion
      || lease.version !== Number(payload.leaseExpectedVersion)
      || lease.status !== payload.fromLeaseStatus || lease.currency !== payload.currency
      || handover.currency !== lease.currency
      || addHousingMoneyAmounts([handover.damageAmount, handover.unsettledAmount]) !== payload.checkoutReceivableAmount
      || handover.deductionAmount !== frozenDeductionAmount
      || this.approvalSnapshotHash(handover.itemSnapshot) !== payload.itemSnapshotHash
      || this.approvalSnapshotHash(handover.meterReadings) !== payload.meterReadingsHash
      || this.approvalSnapshotHash(handover.credentials) !== payload.credentialsHash
      || this.approvalSnapshotHash(handover.photoFileIds) !== payload.photoFileIdsHash
      || handover.signatureFileId !== payload.signatureFileId) {
      throw new ConflictException("Approval source changed");
    }
    const receivableMode = String(payload.checkoutReceivableMode ?? "");
    if (!["none", "new", "existing"].includes(receivableMode)) {
      throw new ConflictException("Approval source changed");
    }
    let checkoutReceivable: {
      id: string; version: number; amount: string; paidAmount: string;
      waivedAmount: string; status: string; currency: string;
      leaseId: string; sourceType: string; sourceId: string | null; chargeType: string;
      periodStart: string; periodEnd: string; dueDate: string;
    } | null = null;
    if (receivableMode !== "none") {
      await this.lockHousingBusinessKey(
        input.manager,
        this.housingReceivableAdvisoryKey(scope, leaseId, {
          sourceType: "housing_handover",
          sourceId: handoverId,
          chargeType: "checkout_charges",
          periodStart: String(payload.checkoutReceivablePeriodStart),
          periodEnd: String(payload.checkoutReceivablePeriodEnd)
        })
      );
      const receivableId = this.approvalUuid(payload.checkoutReceivableId);
      const rows = typeormQueryRows<{
        id: string; version: number; amount: string; paidAmount: string;
        waivedAmount: string; status: string; currency: string; isDeleted: boolean;
        leaseId: string; sourceType: string; sourceId: string | null; chargeType: string;
        periodStart: string; periodEnd: string; dueDate: string;
      }>(await input.manager.query(
        `SELECT id::text AS id,version,amount::text AS amount,paid_amount::text AS "paidAmount",
                waived_amount::text AS "waivedAmount",status,currency,is_deleted AS "isDeleted",
                lease_id::text AS "leaseId",source_type AS "sourceType",source_id::text AS "sourceId",
                charge_type AS "chargeType",period_start::text AS "periodStart",
                period_end::text AS "periodEnd",due_date::text AS "dueDate"
           FROM biz_housing_receivable
          WHERE tenant_id=$1 AND park_id=$2
            AND (id=$3 OR (lease_id=$4 AND source_type='housing_handover' AND source_id=$5
              AND charge_type='checkout_charges')) ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, receivableId, leaseId, handoverId]
      ));
      if (receivableMode === "new") {
        if (rows.length !== 0 || payload.checkoutReceivableExpectedVersion !== null) {
          throw new ConflictException("Housing checkout receivable mode changed");
        }
      } else {
        const row = rows[0];
        if (rows.length !== 1 || !row || row.isDeleted || row.status === "void"
          || row.id !== receivableId || row.version !== Number(payload.checkoutReceivableExpectedVersion)
          || row.amount !== payload.checkoutReceivableOriginalAmount
          || row.paidAmount !== payload.checkoutReceivableOriginalPaidAmount
          || row.waivedAmount !== payload.checkoutReceivableOriginalWaivedAmount
          || row.status !== payload.checkoutReceivableOriginalStatus
          || row.currency !== payload.currency || row.leaseId !== leaseId
          || row.sourceType !== "housing_handover" || row.sourceId !== handoverId
          || row.chargeType !== "checkout_charges"
          || row.periodStart !== payload.checkoutReceivablePeriodStart
          || row.periodEnd !== payload.checkoutReceivablePeriodEnd
          || row.dueDate !== payload.checkoutReceivableDueDate) {
          throw new ConflictException("Housing checkout receivable mode changed");
        }
        checkoutReceivable = row;
      }
    }
    const depositContributors = typeormQueryRows<{
      id: string; version: number; entryType: string; amount: string; currency: string;
      status: string; receivableId: string | null; sourceType: string; sourceId: string | null;
    }>(await input.manager.query(
      `SELECT id::text AS id,version,entry_type AS "entryType",amount::text AS amount,currency,
              status,receivable_id::text AS "receivableId",source_type AS "sourceType",
              source_id::text AS "sourceId"
         FROM biz_housing_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3
          AND status='confirmed' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ));
    const depositBalance = calculateHousingDepositBalance(
      depositContributors as Array<{ entryType: HousingLedgerEntryEntity["entryType"]; amount: string }>
    );
    if (this.approvalSnapshotHash(depositContributors) !== payload.depositContributorsHash
      || depositBalance !== payload.depositBalance) {
      throw new ConflictException("Housing deposit contributors changed after approval submission");
    }
    const unresolved = await input.manager.query(
      `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
        WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
          AND result.entry_type IN ('refund','waiver','deposit_refund')
          AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ count: number }>;
    if (Number(unresolved[0]?.count ?? 0) > 0) {
      throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind", effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash", line_amount::text AS "lineAmount", currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string | null; currency: string | null }>;
    const byKind = new Map(manifests.map((row) => [row.effectKind, row]));
    const handoverEffect = byKind.get("housing.handover.complete.financial");
    if (!handoverEffect) throw new ConflictException("Approval effect manifest missing");
    const completed = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_handover SET status='completed', handover_at=clock_timestamp(),
              update_by=$5, update_time=clock_timestamp(), version=version+1,
              approval_execution_key=$6, approval_effect_kind=$7,
              approval_effect_line_key=$8, approval_effect_hash=$9
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 AND status='draft'
        RETURNING version`,
      [scope.tenantId, scope.parkId, handoverId, input.sourceExpectedVersion,
        input.request.requesterId, input.executionIdempotencyKey, handoverEffect.effectKind,
        handoverEffect.effectLineKey, handoverEffect.effectHash]
    ));
    if (completed.length !== 1) throw new ConflictException("Approval source changed");
    const receivableEffect = byKind.get("housing.receivable.checkout");
    if (receivableEffect) {
      const receivableId = this.approvalUuid(payload.checkoutReceivableId);
      if (receivableEffect.lineAmount !== payload.checkoutReceivableAmount
        || receivableEffect.currency !== payload.currency) {
        throw new ConflictException("Approval effect manifest missing");
      }
      const receivableRows = receivableMode === "new"
        ? typeormQueryRows<{ id: string }>(await input.manager.query(
          `INSERT INTO biz_housing_receivable(
             id,tenant_id,park_id,lease_id,charge_plan_id,source_type,source_id,charge_type,
             period_start,period_end,due_date,amount,paid_amount,waived_amount,status,currency,
             create_by,update_by,remark)
           VALUES($1,$2,$3,$4,NULL,'housing_handover',$5,'checkout_charges',$6,$7,$8,$9,$10,$11,
                  CASE WHEN $9::numeric=$10::numeric+$11::numeric THEN
                    CASE WHEN $10::numeric>0 THEN 'paid' ELSE 'waived' END
                    WHEN $10::numeric+$11::numeric>0 THEN 'partial' ELSE 'unpaid' END,
                  $12,$13,$13,$14) RETURNING id::text AS id`,
          [receivableId, scope.tenantId, scope.parkId, leaseId, handoverId,
            payload.checkoutReceivablePeriodStart, payload.checkoutReceivablePeriodEnd,
            payload.checkoutReceivableDueDate, receivableEffect.lineAmount,
            payload.checkoutReceivablePaidAmount, payload.checkoutReceivableWaivedAmount,
            lease.currency, input.request.requesterId, String(payload.reason ?? "")]
        ))
        : typeormQueryRows<{ id: string }>(await input.manager.query(
          `UPDATE biz_housing_receivable
              SET amount=$6,paid_amount=$7,waived_amount=$8,
                  status=CASE WHEN $6::numeric=$7::numeric+$8::numeric THEN
                    CASE WHEN $7::numeric>0 THEN 'paid' ELSE 'waived' END
                    WHEN $7::numeric+$8::numeric>0 THEN 'partial' ELSE 'unpaid' END,
                  update_by=$9,update_time=clock_timestamp(),version=version+1
            WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
              AND amount=$5::numeric AND is_deleted=false RETURNING id::text AS id`,
          [scope.tenantId, scope.parkId, receivableId, checkoutReceivable!.version,
            checkoutReceivable!.amount, receivableEffect.lineAmount,
            payload.checkoutReceivablePaidAmount, payload.checkoutReceivableWaivedAmount,
            input.request.requesterId]
        ));
      if (receivableRows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
    } else if (receivableMode !== "none") {
      throw new ConflictException("Approval effect manifest missing");
    }
    const deductionEffect = byKind.get("housing.ledger.deduction");
    if (deductionEffect) {
      const ledgerRows = typeormQueryRows<{ id: string }>(await input.manager.query(
        `INSERT INTO biz_housing_ledger_entry(
           tenant_id,park_id,lease_id,receivable_id,entry_type,charge_type,amount,currency,
           source_type,source_id,status,reason,occurred_at,create_by,update_by,
           approval_execution_key,approval_effect_kind,approval_effect_line_key,approval_effect_hash)
         VALUES($1,$2,$3,$4,'deposit_deduction','checkout_deduction',$5,$6,
                'housing_handover',$7,'confirmed',$8,clock_timestamp(),$9,$9,$10,$11,$12,$13)
         RETURNING id::text AS id`,
        [scope.tenantId, scope.parkId, leaseId, payload.checkoutReceivableId,
          deductionEffect.lineAmount, lease.currency, handoverId, String(payload.reason ?? ""),
          input.request.requesterId, input.executionIdempotencyKey, deductionEffect.effectKind,
          deductionEffect.effectLineKey, deductionEffect.effectHash]
      ));
      if (ledgerRows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
    }
    const leaseUpdated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_lease SET status='checkout_pending', update_by=$5,
              update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
        RETURNING version`,
      [scope.tenantId, scope.parkId, leaseId, lease.version, input.request.requesterId]
    ));
    if (leaseUpdated.length !== 1 || leaseUpdated[0]!.version !== lease.version + 1) {
      throw new ConflictException("Approval source changed");
    }
    const audit = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_lease_effect_audit(
         tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
         effect_line_key,actor_id,occurred_at,effect_hash,lease_id,handover_id,
         from_status,to_status,reason,source_expected_version,resulting_version)
       VALUES($1,$2,$3,'housing.handovers.complete-move-out-financial.request',$4,$5,$6,$7,
              clock_timestamp(),$8,$9,$10,$11,'checkout_pending',$12,$13,$14)
       RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, input.requestId, handoverEffect.effectKind,
        input.executionIdempotencyKey, handoverEffect.effectLineKey, input.request.requesterId,
        handoverEffect.effectHash, leaseId, handoverId, lease.status, String(payload.reason ?? ""),
        lease.version, lease.version + 1]
    ));
    if (audit.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
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
    await this.lockHousingBusinessKey(
      input.manager,
      this.housingReceivableAdvisoryKey(scope, leaseId, {
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

  private async lockHousingBusinessKey(manager: EntityManager, key: string): Promise<void> {
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
  }

  private housingHandoverAdvisoryKey(scope: TenantParkScope, leaseId: string): string {
    return ["housing-handover", scope.tenantId, scope.parkId, leaseId, "move_out"].join("|");
  }

  private housingReceivableAdvisoryKey(
    scope: TenantParkScope,
    leaseId: string,
    input: {
      sourceType: string;
      sourceId: string;
      chargeType: string;
      periodStart: string;
      periodEnd: string;
    }
  ): string {
    return [
      "housing-receivable", scope.tenantId, scope.parkId, leaseId,
      input.sourceType, input.sourceId, input.chargeType, input.periodStart, input.periodEnd
    ].join("|");
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

  private async transitionLease(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    from: HousingLeaseEntity["status"][],
    to: HousingLeaseEntity["status"]
  ) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (lease.status === to) return lease;
      this.assertStatus(lease, from);
      lease.status = to;
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
    });
  }

  private async mustLease(manager: EntityManager, scope: TenantParkScope, id: string) {
    const lease = await manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
  }

  private async lockLease(manager: EntityManager, scope: TenantParkScope, id: string) {
    const lease = await manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
  }

  private async mustParty(manager: EntityManager, scope: TenantParkScope, id: string) {
    const party = await manager.getRepository(PartyEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, partyType: "person", isDeleted: false }
    });
    if (!party) throw new NotFoundException("Individual housing tenant party not found");
    return party;
  }

  private async assertFiles(
    manager: EntityManager,
    scope: TenantParkScope,
    ids: string[],
    options?: {
      mimePrefix?: string;
      allowedMimeTypes?: readonly string[];
      bizType?: string;
      allowedBizTypes?: readonly string[];
      bizId?: string;
      lock?: boolean;
    }
  ) {
    if (!ids.length) return [] as FileEntity[];
    const builder = manager.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.status=1")
      .andWhere("file.is_deleted=false");
    if (options?.lock !== false) builder.setLock("pessimistic_write");
    const files = await builder.getMany();
    if (files.length !== new Set(ids).size) throw new NotFoundException("One or more attachment files were not found");
    if (options?.mimePrefix && files.some((file) => !file.mimeType.startsWith(options.mimePrefix!))) {
      throw new BadRequestException(`Attachment MIME type must start with ${options.mimePrefix}`);
    }
    if (options?.allowedMimeTypes && files.some((file) => !options.allowedMimeTypes!.includes(file.mimeType))) {
      throw new BadRequestException("Attachment MIME type is not allowed for this workflow");
    }
    if (options?.bizType && files.some((file) => file.bizType !== options.bizType)) {
      throw new BadRequestException(`Attachment business type must be ${options.bizType}`);
    }
    if (options?.allowedBizTypes && files.some((file) => !options.allowedBizTypes!.includes(file.bizType))) {
      throw new BadRequestException(`Attachment business type must be one of ${options.allowedBizTypes.join(", ")}`);
    }
    if (options?.bizId && files.some((file) => file.bizId !== options.bizId)) {
      throw new BadRequestException("Attachment is not associated with the current housing record");
    }
    return files;
  }

  private toLeaseListItem(
    lease: HousingLeaseEntity,
    actor: JwtPrincipal,
    display: Pick<HousingLeaseListResponseItem, "unitCode" | "unitName" | "tenantDisplayName">
  ): HousingLeaseListResponseItem {
    return { ...this.toLeaseResponse(lease, actor), ...display };
  }

  private toLeaseResponse(
    lease: HousingLeaseEntity,
    actor: JwtPrincipal
  ): HousingLeaseResponse {
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canReadSignature = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)
      && (
        this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_LEASE_READ)
        || this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN)
      );
    return {
      id: lease.id,
      leaseCode: lease.leaseCode,
      unitId: lease.unitId,
      tenantPartyId: lease.tenantPartyId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      status: lease.status,
      paymentCycleMonths: lease.paymentCycleMonths,
      ...(canReadSignature ? { signatureFileId: lease.signatureFileId } : {}),
      ...(canReadFinance ? {
        monthlyRent: formatHousingMoney(lease.monthlyRent),
        depositAmount: formatHousingMoney(lease.depositAmount)
      } : {})
    };
  }

  private toTenantEntityResponse(
    tenant: PartyEntity,
    actor: JwtPrincipal
  ): HousingTenantResponse {
    const canManage = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
    const canReadSensitive = this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
    return {
      id: tenant.id,
      displayName: tenant.displayName,
      verificationStatus: tenant.verificationStatus,
      ...(canReadSensitive ? {
        identityNumberMasked: tenant.identityNumberMasked
      } : {}),
      ...(canManage ? {
        mobile: this.maskTenantMobile(tenant.mobile),
        email: this.maskTenantEmail(tenant.email)
      } : {})
    };
  }

  private toChargePlanResponse(
    plan: HousingChargePlanEntity,
    canReadFinance: boolean
  ): HousingChargePlanResponse {
    return {
      id: plan.id,
      leaseId: plan.leaseId,
      chargeType: plan.chargeType,
      billingSource: plan.billingSource,
      cycleMonths: plan.cycleMonths,
      meterId: plan.meterId,
      enabled: plan.enabled,
      ...(canReadFinance ? {
        amount: plan.amount === null ? null : formatHousingMoney(plan.amount),
        unitPrice: plan.unitPrice
      } : {})
    };
  }

  private toReceivableResponse(
    receivable: HousingReceivableEntity
  ): HousingReceivableResponse {
    return {
      id: receivable.id,
      leaseId: receivable.leaseId,
      chargeType: receivable.chargeType,
      periodStart: receivable.periodStart,
      periodEnd: receivable.periodEnd,
      dueDate: receivable.dueDate,
      amount: formatHousingMoney(receivable.amount),
      paidAmount: formatHousingMoney(receivable.paidAmount),
      waivedAmount: formatHousingMoney(receivable.waivedAmount),
      status: receivable.status
    };
  }

  private toLedgerResponse(entry: HousingLedgerEntryEntity): HousingLedgerEntryResponse {
    return {
      id: entry.id,
      leaseId: entry.leaseId,
      receivableId: entry.receivableId,
      entryType: entry.entryType,
      chargeType: entry.chargeType,
      amount: formatHousingMoney(entry.amount),
      paymentMethod: entry.paymentMethod,
      status: entry.status,
      reason: entry.reason,
      occurredAt: entry.occurredAt.toISOString()
    };
  }

  private toHandoverResponse(
    handover: HousingHandoverEntity,
    actor: JwtPrincipal
  ) {
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canManage = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE);
    return {
      id: handover.id,
      leaseId: handover.leaseId,
      handoverType: handover.handoverType,
      status: handover.status,
      handoverAt: handover.handoverAt?.toISOString() ?? null,
      meterReadings: handover.meterReadings,
      itemSnapshot: handover.itemSnapshot,
      ...(canManage ? {
        credentials: handover.credentials.map(maskHousingCredential)
      } : {}),
      remark: handover.remark,
      ...(canReadFinance ? {
        damageAmount: formatHousingMoney(handover.damageAmount),
        unsettledAmount: formatHousingMoney(handover.unsettledAmount),
        depositDeductionAmount: formatHousingMoney(handover.depositDeductionAmount)
      } : {})
    };
  }

  private toRepairSummary(repair: WorkOrderEntity): HousingRepairSummaryResponse {
    return {
      id: repair.id,
      woCode: repair.woCode,
      title: repair.title,
      priority: repair.priority,
      urgency: repair.urgency,
      status: repair.status,
      assigneeName: repair.assigneeName,
      overdueFlag: repair.overdueFlag,
      createTime: repair.createTime.toISOString()
    };
  }

  private async filterRepairScope(
    repairs: WorkOrderEntity[],
    actor: JwtPrincipal
  ): Promise<WorkOrderEntity[]> {
    if (actor.isSuper || actor.permissions.includes("*")) return repairs;
    const handler = await this.dataScopeService.buildScopeFilter(actor, "workorder_handler");
    return repairs.filter((repair) => {
      const involvedIds = [repair.assigneeId, repair.reporterId, repair.createBy]
        .filter((id): id is string => Boolean(id));
      if (!handler.unrestricted && !handler.allowed_ids.some((id) => involvedIds.includes(id))) {
        return false;
      }
      return actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)
        || involvedIds.includes(actor.sub);
    });
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

  private calculateBillAmount(
    plan: HousingChargePlanEntity,
    dto: GenerateHousingBillsDto,
    leaseStartDate: string,
    meter: EnergyMeterEntity | null
  ) {
    if (plan.billingSource === "manual") {
      if (dto.manual_amount === undefined) throw new BadRequestException(`Manual amount is required for ${plan.chargeType}`);
      return { amount: dto.manual_amount, usageAmount: undefined };
    }
    if (plan.billingSource === "energy_meter") {
      if (dto.opening_reading === undefined || dto.closing_reading === undefined) {
        throw new BadRequestException(`Meter readings are required for ${plan.chargeType}`);
      }
      const calculation = calculateHousingMeterCharge(
        dto.opening_reading,
        dto.closing_reading,
        meter?.multiplier ?? "0",
        plan.unitPrice ?? "0"
      );
      return calculation;
    }
    const monthFraction = calculateHousingMonthFractionRatio(dto.period_start, dto.period_end, leaseStartDate);
    if (monthFraction.numerator > BigInt(plan.cycleMonths) * monthFraction.denominator) {
      throw new BadRequestException(`Billing period exceeds configured ${plan.cycleMonths}-month cycle for ${plan.chargeType}`);
    }
    return {
      amount: multiplyHousingMoneyByRatio(
        plan.amount ?? "0",
        monthFraction.numerator,
        monthFraction.denominator
      ),
      usageAmount: undefined
    };
  }

  private async createReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    input: {
      chargePlanId: string | null;
      sourceType: string;
      sourceId: string | null;
      chargeType: string;
      periodStart: string;
      periodEnd: string;
      dueDate: string;
      amount: string | number;
      openingReading?: string | number;
      closingReading?: string | number;
      usageAmount?: string | number;
      unitPrice?: string | number;
      remark?: string;
      accumulateIfExisting?: boolean;
    }
  ) {
    const repository = manager.getRepository(HousingReceivableEntity);
    await this.lockHousingBusinessKey(
      manager,
      this.housingReceivableAdvisoryKey(scope, lease.id, {
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? "null",
        chargeType: input.chargeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      })
    );
    const existing = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId: lease.id,
        chargeType: input.chargeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? IsNull(),
        isDeleted: false
      }
    });
    if (existing) {
      if (!input.accumulateIfExisting) return existing;
      const nextAmount = addHousingMoneyAmounts([existing.amount, input.amount]);
      existing.amount = nextAmount;
      existing.status = housingReceivableStatus(nextAmount, existing.paidAmount, existing.waivedAmount);
      existing.dueDate = input.dueDate;
      existing.updateBy = actor.sub;
      existing.remark = input.remark ?? existing.remark;
      return repository.save(existing);
    }
    const entity = repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId: lease.id,
      chargePlanId: input.chargePlanId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      chargeType: input.chargeType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      openingReading: input.openingReading === undefined ? null : formatHousingDecimal(input.openingReading),
      closingReading: input.closingReading === undefined ? null : formatHousingDecimal(input.closingReading),
      usageAmount: input.usageAmount === undefined ? null : formatHousingDecimal(input.usageAmount),
      unitPrice: input.unitPrice === undefined ? null : formatHousingDecimal(input.unitPrice),
      amount: formatHousingMoney(input.amount),
      paidAmount: "0.00",
      waivedAmount: "0.00",
      status: "unpaid",
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: input.remark ?? null
    });
    return repository.save(entity);
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

  private financeSummary(receivables: HousingReceivableEntity[], ledger: HousingLedgerEntryEntity[]) {
    const activeReceivables = receivables.filter((item) => item.status !== "void");
    const total = addHousingMoneyAmounts(activeReceivables.map((item) => item.amount));
    const paid = addHousingMoneyAmounts(activeReceivables.map((item) => item.paidAmount));
    const waived = addHousingMoneyAmounts(activeReceivables.map((item) => item.waivedAmount));
    const activeLedger = ledger.filter((item) => item.status === "confirmed");
    const outstanding = calculateHousingMoneyBalance([total], [paid, waived]);
    const depositBalance = calculateHousingDepositBalance(activeLedger);
    return {
      receivable: total,
      paid,
      waived,
      outstanding: compareHousingMoney(outstanding, "0.00") > 0 ? outstanding : "0.00",
      deposit_balance: compareHousingMoney(depositBalance, "0.00") > 0 ? depositBalance : "0.00"
    };
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

  private assertStatus(
    lease: Pick<HousingLeaseEntity, "status">,
    allowed: HousingLeaseEntity["status"][]
  ) {
    if (!allowed.includes(lease.status)) {
      throw new ConflictException(`Lease status ${lease.status} does not allow this action`);
    }
  }

  private assertHousingMeterOnline(meter: EnergyMeterEntity): void {
    if (!meter.isEnabled || meter.status !== "ONLINE") {
      throw new ConflictException("Energy meter must be enabled and ONLINE");
    }
  }

  private assertDatePeriod(start: string, end: string) {
    const startDate = parseHousingCalendarDate(start);
    const endDate = parseHousingCalendarDate(end);
    if (startDate >= endDate) {
      throw new BadRequestException("Start date must be before end date");
    }
  }

  private dueDateForPeriod(periodStart: string, billingDay: number) {
    const date = parseHousingCalendarDate(periodStart);
    date.setUTCDate(Math.min(billingDay, 28));
    return date.toISOString().slice(0, 10);
  }

  private addDays(dateValue: string, days: number) {
    const date = parseHousingCalendarDate(dateValue);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private businessDateStart(dateValue: string) {
    return new Date(`${dateValue.slice(0, 10)}T00:00:00+08:00`);
  }

  private generateCode(prefix: string) {
    return `${prefix}${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${randomUUID().slice(0, 6).toUpperCase()}`;
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

  private isDatabaseConflict(error: unknown) {
    if (!error || typeof error !== "object") return false;
    return ["23505", "23P01"].includes(String((error as { code?: unknown }).code ?? ""));
  }

  private isUniqueViolation(error: unknown) {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
