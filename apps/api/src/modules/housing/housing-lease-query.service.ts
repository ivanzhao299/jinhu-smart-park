import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type HousingChargePlanResponse,
  type HousingLedgerEntryResponse,
  type HousingLeaseListItem,
  type HousingLeaseResponse,
  type HousingReceivableResponse,
  type HousingRepairSummaryResponse,
  type PaginatedResult,
  type PropertyWorkbenchFileRef,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, In, type Repository, type SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FileEntity } from "../files/entities/file.entity";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type { HousingLeaseQueryDto } from "./dto/housing.dto";
import {
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  addHousingMoneyAmounts,
  calculateHousingDepositBalance,
  calculateHousingMoneyBalance,
  compareHousingMoney,
  formatHousingMoney
} from "./housing-finance.policy";
import { maskHousingCredential } from "./housing-projection.policy";
import { HousingTenantService } from "./housing-tenant.service";

type LeaseDetailAccess = {
  tenant: boolean;
  billing: boolean;
  finance: boolean;
  handovers: boolean;
  handoverFiles: boolean;
  pendingHandoverFiles: boolean;
  repairs: boolean;
  pendingRepairFiles: boolean;
};

type LeaseDetailData = {
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

type LeaseDisplay = Pick<
  HousingLeaseListItem,
  "unitCode" | "unitName" | "tenantDisplayName"
>;

@Injectable()
export class HousingLeaseQueryService {
  constructor(
    @InjectRepository(HousingLeaseEntity)
    private readonly leasesRepository: Repository<HousingLeaseEntity>,
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataScopeService: DataScopeService,
    private readonly tenantService: HousingTenantService
  ) {}

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingLeaseQueryDto
  ): Promise<PaginatedResult<HousingLeaseListItem>> {
    const builder = this.listBuilder(scope);
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (unitIds !== null && !unitIds.length) return this.emptyPage(query);
    this.applyListFilters(builder, query, unitIds);
    const [leases, total] = await builder
      .orderBy(this.sortColumn(query), this.sortDirection(query.order, "DESC"))
      .addOrderBy("lease.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const displayByLease = await this.listDisplays(scope, leases);
    return {
      items: leases.map((lease) => this.listItem(
        lease,
        actor,
        displayByLease.get(lease.id) ?? this.emptyDisplay()
      )),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  async get(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const lease = await this.mustLease(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    const access = this.detailAccess(actor);
    const data = await this.loadDetailData(scope, lease, access);
    const occupantNames = await this.loadOccupantNames(scope, data.occupants);
    if (access.repairs) data.repairs = await this.filterRepairScope(data.repairs, actor);
    return this.projectDetail(lease, actor, access, data, occupantNames);
  }

  private listBuilder(scope: TenantParkScope) {
    return this.leasesRepository.createQueryBuilder("lease")
      .where("lease.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("lease.park_id=:parkId", { parkId: scope.parkId })
      .andWhere("lease.is_deleted=false");
  }

  private applyListFilters(
    builder: SelectQueryBuilder<HousingLeaseEntity>,
    query: HousingLeaseQueryDto,
    unitIds: string[] | null
  ) {
    if (unitIds !== null) builder.andWhere("lease.unit_id IN (:...unitIds)", { unitIds });
    if (query.status) builder.andWhere("lease.status=:status", { status: query.status });
    if (query.unit_id) builder.andWhere("lease.unit_id=:unitId", { unitId: query.unit_id });
    if (query.tenant_party_id) {
      builder.andWhere("lease.tenant_party_id=:partyId", { partyId: query.tenant_party_id });
    }
    if (query.keyword) this.applyKeyword(builder, query.keyword);
  }

  private applyKeyword(builder: SelectQueryBuilder<HousingLeaseEntity>, keyword: string) {
    builder.andWhere(
      `(lease.lease_code ILIKE :leaseKeyword
        OR EXISTS (
          SELECT 1 FROM biz_unit keyword_unit
          WHERE keyword_unit.id = lease.unit_id
            AND keyword_unit.tenant_id = lease.tenant_id
            AND keyword_unit.park_id = lease.park_id
            AND keyword_unit.is_deleted = false
            AND (keyword_unit.unit_code ILIKE :leaseKeyword
              OR keyword_unit.unit_name ILIKE :leaseKeyword)
        )
        OR EXISTS (
          SELECT 1 FROM biz_party keyword_party
          WHERE keyword_party.id = lease.tenant_party_id
            AND keyword_party.tenant_id = lease.tenant_id
            AND keyword_party.park_id = lease.park_id
            AND keyword_party.is_deleted = false
            AND keyword_party.display_name ILIKE :leaseKeyword
        ))`,
      { leaseKeyword: `%${keyword}%` }
    );
  }

  private async listDisplays(scope: TenantParkScope, leases: HousingLeaseEntity[]) {
    if (!leases.length) return new Map<string, LeaseDisplay>();
    const rows = await this.dataSource.query(
      `SELECT lease.id,
              unit.unit_code AS "unitCode", unit.unit_name AS "unitName",
              party.display_name AS "tenantDisplayName"
       FROM biz_housing_lease lease
       LEFT JOIN biz_unit unit ON unit.id = lease.unit_id
        AND unit.tenant_id = lease.tenant_id AND unit.park_id = lease.park_id
       LEFT JOIN biz_party party ON party.id = lease.tenant_party_id
        AND party.tenant_id = lease.tenant_id AND party.park_id = lease.park_id
       WHERE lease.tenant_id = $1 AND lease.park_id = $2
         AND lease.id = ANY($3::uuid[])`,
      [scope.tenantId, scope.parkId, leases.map((lease) => lease.id)]
    ) as Array<LeaseDisplay & { id: string }>;
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async mustLease(scope: TenantParkScope, id: string) {
    const lease = await this.dataSource.manager.getRepository(HousingLeaseEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!lease) throw new NotFoundException("Housing lease not found");
    return lease;
  }

  private detailAccess(actor: JwtPrincipal): LeaseDetailAccess {
    const fileRead = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const handovers = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ);
    const repairs = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ);
    return {
      tenant: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_TENANT_READ),
      billing: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_BILLING_READ),
      finance: this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ),
      handovers,
      handoverFiles: handovers && fileRead,
      pendingHandoverFiles: handovers && fileRead
        && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE),
      repairs,
      pendingRepairFiles: repairs && fileRead
        && this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE)
    };
  }

  private async loadDetailData(
    scope: TenantParkScope,
    lease: HousingLeaseEntity,
    access: LeaseDetailAccess
  ): Promise<LeaseDetailData> {
    const common = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId: lease.id,
      isDeleted: false
    };
    const values = await Promise.all([
      this.loadTenant(scope, lease, access.tenant),
      this.loadRows(HousingLeaseOccupantEntity, common, access.tenant),
      this.loadRows(HousingChargePlanEntity, common, access.billing),
      this.loadRows(HousingReceivableEntity, common, access.finance, { dueDate: "ASC" }),
      this.loadRows(HousingLedgerEntryEntity, common, access.finance, { occurredAt: "ASC" }),
      this.loadRows(HousingHandoverEntity, common, access.handovers),
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
    } as LeaseDetailData;
  }

  private loadTenant(scope: TenantParkScope, lease: HousingLeaseEntity, permitted: boolean) {
    if (!permitted) return Promise.resolve(null);
    return this.dataSource.getRepository(PartyEntity).findOne({
      where: {
        id: lease.tenantPartyId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
  }

  private loadRows<T extends object>(
    entity: new () => T,
    where: Record<string, unknown>,
    permitted: boolean,
    order?: Record<string, "ASC" | "DESC">
  ): Promise<T[]> {
    if (!permitted) return Promise.resolve([]);
    return this.dataSource.getRepository(entity).find({ where, ...(order ? { order } : {}) } as never);
  }

  private loadHandoverEvidence(scope: TenantParkScope, leaseId: string) {
    return this.dataSource.getRepository(FileEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bizType: In([
          "housing_handover", "housing_handover_move_in", "housing_handover_move_out"
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
      .andWhere("file.status = 1").andWhere("file.is_deleted = false")
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM biz_housing_handover handover
        WHERE handover.tenant_id = file.tenant_id
          AND handover.park_id = file.park_id AND handover.lease_id = file.biz_id
          AND handover.is_deleted = false AND handover.photo_file_ids ? file.id::text
      )`)
      .orderBy("file.create_time", "DESC").getMany();
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
      .andWhere("file.status = 1").andWhere("file.is_deleted = false")
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM biz_work_order repair
        WHERE repair.tenant_id = file.tenant_id AND repair.park_id = file.park_id
          AND repair.is_deleted = false AND file.id = ANY(repair.image_file_ids)
      )`)
      .orderBy("file.create_time", "DESC").getMany();
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

  private async filterRepairScope(repairs: WorkOrderEntity[], actor: JwtPrincipal) {
    if (actor.isSuper || actor.permissions.includes("*")) return repairs;
    const handler = await this.dataScopeService.buildScopeFilter(actor, "workorder_handler");
    return repairs.filter((repair) => this.canReadRepair(repair, actor, handler));
  }

  private canReadRepair(
    repair: WorkOrderEntity,
    actor: JwtPrincipal,
    handler: { unrestricted: boolean; allowed_ids: string[] }
  ) {
    const involvedIds = [repair.assigneeId, repair.reporterId, repair.createBy]
      .filter((id): id is string => Boolean(id));
    if (!handler.unrestricted && !handler.allowed_ids.some((id) => involvedIds.includes(id))) {
      return false;
    }
    return actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)
      || involvedIds.includes(actor.sub);
  }

  private projectDetail(
    lease: HousingLeaseEntity,
    actor: JwtPrincipal,
    access: LeaseDetailAccess,
    data: LeaseDetailData,
    occupantNames: Map<string, string>
  ) {
    return {
      lease: this.leaseResponse(lease, actor),
      ...(data.tenant ? { tenant: this.tenantService.project(data.tenant, actor) } : {}),
      ...(access.tenant ? { occupants: this.occupantProjection(data.occupants, occupantNames) } : {}),
      ...(access.billing ? { charge_plans: data.chargePlans.map((plan) =>
        this.chargePlanResponse(plan, access.finance)) } : {}),
      ...(access.finance ? {
        receivables: data.receivables.map((item) => this.receivableResponse(item)),
        ledger: data.ledger.map((item) => this.ledgerResponse(item)),
        finance_summary: this.financeSummary(data.receivables, data.ledger)
      } : {}),
      ...(access.handovers ? { handovers: this.handovers(data, actor, access.handoverFiles) } : {}),
      ...(access.pendingHandoverFiles ? {
        pending_handover_files: this.pendingHandoverFiles(data)
      } : {}),
      ...(access.repairs ? { repairs: data.repairs.map((repair) => this.repairSummary(repair)) } : {}),
      ...(access.pendingRepairFiles ? {
        pending_repair_files: data.pendingRepairFiles.map((file) => this.fileRef(file))
      } : {})
    };
  }

  private occupantProjection(
    occupants: HousingLeaseOccupantEntity[],
    names: Map<string, string>
  ) {
    return occupants.map((occupant) => ({
      id: occupant.id,
      partyId: occupant.partyId,
      partyDisplayName: names.get(occupant.partyId) ?? null,
      occupantRole: occupant.occupantRole,
      emergencyContact: occupant.emergencyContact
    }));
  }

  private handovers(data: LeaseDetailData, actor: JwtPrincipal, includeFiles: boolean) {
    return data.handovers.map((handover) => ({
      ...this.handoverResponse(handover, actor),
      ...(includeFiles ? {
        photo_files: handover.photoFileIds
          .map((id) => data.handoverEvidenceFiles.find((file) => file.id === id))
          .filter((file): file is FileEntity => Boolean(file))
          .map((file) => this.fileRef(file))
      } : {})
    }));
  }

  private pendingHandoverFiles(data: LeaseDetailData) {
    const moveInCompleted = data.handovers.some((item) =>
      item.handoverType === "move_in" && item.status === "completed"
    );
    const matches = (file: FileEntity, type: "move_in" | "move_out") =>
      file.bizType === `housing_handover_${type}`
      || (file.bizType === "housing_handover" && (type === "move_out") === moveInCompleted);
    return {
      move_in: data.pendingHandoverFiles.filter((file) => matches(file, "move_in"))
        .map((file) => this.fileRef(file)),
      move_out: data.pendingHandoverFiles.filter((file) => matches(file, "move_out"))
        .map((file) => this.fileRef(file))
    };
  }

  private listItem(lease: HousingLeaseEntity, actor: JwtPrincipal, display: LeaseDisplay) {
    return { ...this.leaseResponse(lease, actor), ...display };
  }

  private leaseResponse(lease: HousingLeaseEntity, actor: JwtPrincipal): HousingLeaseResponse {
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const canReadSignature = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)
      && (this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_LEASE_READ)
        || this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN));
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

  private chargePlanResponse(plan: HousingChargePlanEntity, canReadFinance: boolean): HousingChargePlanResponse {
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

  private receivableResponse(receivable: HousingReceivableEntity): HousingReceivableResponse {
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

  private ledgerResponse(entry: HousingLedgerEntryEntity): HousingLedgerEntryResponse {
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

  private handoverResponse(handover: HousingHandoverEntity, actor: JwtPrincipal) {
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
      ...(canManage ? { credentials: handover.credentials.map(maskHousingCredential) } : {}),
      remark: handover.remark,
      ...(canReadFinance ? {
        damageAmount: formatHousingMoney(handover.damageAmount),
        unsettledAmount: formatHousingMoney(handover.unsettledAmount),
        depositDeductionAmount: formatHousingMoney(handover.depositDeductionAmount)
      } : {})
    };
  }

  private repairSummary(repair: WorkOrderEntity): HousingRepairSummaryResponse {
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

  private fileRef(file: FileEntity): PropertyWorkbenchFileRef {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize
    };
  }

  private emptyPage(query: HousingLeaseQueryDto): PaginatedResult<HousingLeaseListItem> {
    return { items: [], total: 0, page: query.page, page_size: query.page_size };
  }

  private emptyDisplay(): LeaseDisplay {
    return { unitCode: null, unitName: null, tenantDisplayName: null };
  }

  private sortColumn(query: HousingLeaseQueryDto) {
    return ({
      startDate: "lease.start_date",
      status: "lease.status",
      leaseCode: "lease.lease_code"
    } as const)[query.sort ?? "startDate"];
  }

  private sortDirection(order: "asc" | "desc" | undefined, fallback: "ASC" | "DESC") {
    return order ? (order === "asc" ? "ASC" : "DESC") : fallback;
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }
}
