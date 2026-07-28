import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  resolveFileUploadPolicy,
  SYSTEM_PERMISSIONS,
  type PaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, IsNull, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import { EnergyMeterEntity } from "../energy/entities/energy-meter.entity";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PartiesService } from "../property-operations/parties.service";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import type {
  AddHousingOccupantDto,
  ApproveHousingLeaseDto,
  CompleteHousingHandoverDto,
  CreateHousingRepairDto,
  CreateHousingLeaseDto,
  CreateHousingPurchaseDto,
  GenerateHousingBillsDto,
  HousingLeaseQueryDto,
  HousingPurchaseActionDto,
  HousingPurchaseQueryDto,
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
  calculateHousingMonthFraction,
  parseHousingCalendarDate
} from "./housing-billing.policy";
import {
  applyHousingReceivableMutation,
  assertHousingDepositMutation,
  assertHousingPurchaseTransferLeaseStatus,
  calculateHousingDepositBalance,
  calculateHousingMeterCharge,
  calculateHousingPurchaseAmounts
} from "./housing-finance.policy";

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
    private readonly dataSource: DataSource
  ) {}

  listTenants(scope: TenantParkScope, query: PartyQueryDto) {
    return this.partiesService.list(scope, { ...query, party_type: "person" });
  }

  createTenant(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePartyDto) {
    return this.partiesService.create(scope, actor, {
      ...dto,
      party_type: "person",
      source_domain: "housing_rental"
    });
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
           AND purchase.is_deleted=false AND purchase.approval_status='approved'${purchaseUnitFilter}`,
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
        receivable_amount: Number(finance.receivable).toFixed(2),
        collected_amount: Number(finance.paid).toFixed(2),
        outstanding_amount: Math.max(
          0,
          Number(finance.receivable) - Number(finance.paid) - Number(finance.waived)
        ).toFixed(2)
      } : {}),
      ...(canReadPurchases ? {
        approved_purchase_cost: Number(purchaseRows[0]?.cost ?? 0).toFixed(2)
      } : {})
    };
  }

  async listLeases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingLeaseQueryDto
  ): Promise<PaginatedResult<HousingLeaseEntity>> {
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
    const [items, total] = await builder.orderBy("lease.start_date", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getLease(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const lease = await this.mustLease(this.dataSource.manager, scope, id);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    const common = { tenantId: scope.tenantId, parkId: scope.parkId, leaseId: id, isDeleted: false };
    const [tenant, occupants, chargePlans, receivables, ledger, handovers, repairEntities] = await Promise.all([
      this.dataSource.getRepository(PartyEntity).findOne({
        where: { id: lease.tenantPartyId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      }),
      this.dataSource.getRepository(HousingLeaseOccupantEntity).find({ where: common }),
      this.dataSource.getRepository(HousingChargePlanEntity).find({ where: common }),
      canReadFinance ? this.dataSource.getRepository(HousingReceivableEntity).find({
        where: common,
        order: { dueDate: "ASC" }
      }) : Promise.resolve([]),
      canReadFinance ? this.dataSource.getRepository(HousingLedgerEntryEntity).find({
        where: common,
        order: { occurredAt: "ASC" }
      }) : Promise.resolve([]),
      this.dataSource.getRepository(HousingHandoverEntity).find({ where: common }),
      this.dataSource.getRepository(WorkOrderEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          sourceType: "tenant_request",
          sourceId: id,
          unitId: lease.unitId,
          isDeleted: false
        },
        order: { createTime: "DESC" }
      })
    ]);
    return {
      lease,
      tenant,
      occupants,
      charge_plans: chargePlans,
      receivables,
      ledger,
      handovers,
      repairs: repairEntities.map((repair) => ({
        id: repair.id,
        woCode: repair.woCode,
        title: repair.title,
        priority: repair.priority,
        urgency: repair.urgency,
        status: repair.status,
        assigneeName: repair.assigneeName,
        overdueFlag: repair.overdueFlag,
        createTime: repair.createTime,
        updateTime: repair.updateTime
      })),
      finance_summary: canReadFinance ? this.financeSummary(receivables, ledger) : null
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
          monthlyRent: dto.monthly_rent.toFixed(2),
          depositAmount: dto.deposit_amount.toFixed(2),
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
          amount: dto.monthly_rent.toFixed(2),
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

  async approveLease(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ApproveHousingLeaseDto) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.assertStatus(lease, ["pending_approval"]);
      lease.status = "pending_signature";
      lease.approvalNote = dto.approval_note ?? null;
      lease.approvedBy = actor.sub;
      lease.approvedAt = new Date();
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
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
            amount: Number(saved.depositAmount)
          });
        }
        return saved;
      });
    } catch (error) {
      if (this.isDatabaseConflict(error)) throw new ConflictException("Lease period conflicts with another occupancy");
      throw error;
    }
  }

  async voidLease(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (lease.status === "void") return lease;
      this.assertStatus(lease, ["draft", "pending_approval", "pending_signature"]);
      lease.status = "void";
      lease.terminationReason = reason;
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
    });
  }

  async addOccupant(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AddHousingOccupantDto) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.mustLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
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
    const lease = await this.mustLease(this.dataSource.manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    if (dto.billing_source === "fixed" && dto.amount === undefined) {
      throw new BadRequestException("Fixed charge plan requires amount");
    }
    if (dto.billing_source === "energy_meter" && (!dto.meter_id || dto.unit_price === undefined)) {
      throw new BadRequestException("Energy meter charge plan requires meter_id and unit_price");
    }
    if (dto.billing_source === "energy_meter") {
      const meter = await this.dataSource.getRepository(EnergyMeterEntity).findOne({
        where: {
          id: dto.meter_id!,
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          isDeleted: false
        }
      });
      if (!meter) throw new NotFoundException("Energy meter not found");
      if (!meter.isEnabled || meter.status === "DISABLED") {
        throw new ConflictException("Energy meter must be enabled");
      }
      if (meter.roomId !== lease.unitId) {
        throw new BadRequestException("Energy meter must belong to the housing lease unit");
      }
    }
    const repository = this.dataSource.getRepository(HousingChargePlanEntity);
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
    plan.amount = dto.amount === undefined ? null : dto.amount.toFixed(2);
    plan.unitPrice = dto.unit_price === undefined ? null : dto.unit_price.toFixed(6);
    plan.meterId = dto.meter_id ?? null;
    plan.enabled = dto.enabled;
    plan.updateBy = actor.sub;
    plan.remark = dto.remark ?? null;
    return repository.save(plan);
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
        if (!meter.isEnabled || meter.status === "DISABLED") {
          throw new ConflictException("Energy meter must be enabled");
        }
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
        unitPrice: plan.unitPrice === null ? undefined : Number(plan.unitPrice),
        remark: dto.reason
      })];
    });
  }

  async registerLedger(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto
  ) {
    const requiredPermission = dto.entry_type === "waiver"
      ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE
      : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER;
    if (!this.hasPermission(actor, requiredPermission)) {
      throw new ForbiddenException(`${requiredPermission} permission is required`);
    }
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (dto.entry_type === "charge") {
        throw new BadRequestException("Create tenant charges through a charge plan and receivable");
      }
      if (dto.entry_type.startsWith("deposit_")) {
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
        assertHousingDepositMutation(Number(lease.depositAmount), currentDeposit, dto.entry_type, dto.amount);
      }
      let receivable: HousingReceivableEntity | null = null;
      if (dto.entry_type === "deposit_receipt" && !dto.receivable_id) {
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
        this.applyReceivableEntry(receivable, { ...dto, entry_type: "payment" });
        receivable.updateBy = actor.sub;
        await manager.getRepository(HousingReceivableEntity).save(receivable);
      }
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
        if (dto.entry_type === "deposit_receipt") {
          if (receivable.chargeType !== "deposit") {
            throw new BadRequestException("Deposit receipt can only settle the lease deposit receivable");
          }
          this.applyReceivableEntry(receivable, { ...dto, entry_type: "payment" });
        } else {
          this.applyReceivableEntry(receivable, dto);
        }
        receivable.updateBy = actor.sub;
        await manager.getRepository(HousingReceivableEntity).save(receivable);
      } else if (["payment", "refund", "waiver"].includes(dto.entry_type) && !dto.entry_type.startsWith("deposit_")) {
        throw new BadRequestException("Receivable is required for payment, refund, or waiver");
      }
      const chargeType = dto.entry_type.startsWith("deposit_") ? "deposit" : receivable?.chargeType;
      if (!chargeType) throw new BadRequestException("Receivable charge type is required for financial entries");
      const repository = manager.getRepository(HousingLedgerEntryEntity);
      return repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        receivableId: receivable?.id ?? null,
        entryType: dto.entry_type,
        chargeType,
        amount: dto.amount.toFixed(2),
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
    dto: CompleteHousingHandoverDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      const repository = manager.getRepository(HousingHandoverEntity);
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
      if (handover?.status === "completed") return handover;
      if (dto.handover_type === "move_in") this.assertStatus(lease, ["active"]);
      else this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      if (
        dto.handover_type === "move_in"
        && (dto.damage_amount > 0 || dto.unsettled_amount > 0 || dto.deposit_deduction_amount > 0)
      ) {
        throw new BadRequestException("Move-in handover cannot include damage, unsettled, or deposit deduction amounts");
      }
      await this.assertFiles(manager, scope, dto.photo_file_ids ?? [], {
        mimePrefix: "image/",
        bizType: "housing_handover",
        bizId: lease.id
      });
      if (dto.signature_file_id) {
        await this.assertFiles(manager, scope, [dto.signature_file_id], {
          bizType: "housing_handover",
          bizId: lease.id
        });
      }
      if (dto.deposit_deduction_amount > Number(lease.depositAmount)) {
        throw new BadRequestException("Deposit deduction cannot exceed agreed deposit");
      }
      if (dto.handover_type === "move_out" && dto.deposit_deduction_amount > 0) {
        const depositEntries = await manager.getRepository(HousingLedgerEntryEntity).find({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            status: "confirmed",
            isDeleted: false
          }
        });
        const depositBalance = calculateHousingDepositBalance(depositEntries);
        if (dto.deposit_deduction_amount > depositBalance + 0.005) {
          throw new ConflictException("Deposit deduction exceeds current deposit balance");
        }
      }
      handover ??= repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        handoverType: dto.handover_type,
        createBy: actor.sub
      });
      handover.status = "completed";
      handover.handoverAt = new Date();
      handover.itemSnapshot = dto.item_snapshot ?? [];
      handover.meterReadings = dto.meter_readings ?? [];
      handover.credentials = dto.credentials ?? [];
      handover.photoFileIds = dto.photo_file_ids ?? [];
      handover.signatureFileId = dto.signature_file_id ?? null;
      handover.damageAmount = dto.damage_amount.toFixed(2);
      handover.unsettledAmount = dto.unsettled_amount.toFixed(2);
      handover.depositDeductionAmount = dto.deposit_deduction_amount.toFixed(2);
      handover.updateBy = actor.sub;
      handover.remark = dto.remark ?? null;
      const saved = await repository.save(handover);
      if (dto.handover_type === "move_out") {
        const checkoutCharge = dto.damage_amount + dto.unsettled_amount;
        if (dto.deposit_deduction_amount > checkoutCharge + 0.005) {
          throw new BadRequestException("Deposit deduction cannot exceed move-out damage and unsettled charges");
        }
        let checkoutReceivable: HousingReceivableEntity | null = null;
        if (checkoutCharge > 0.005) {
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
          if (dto.deposit_deduction_amount > 0) {
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
        if (dto.deposit_deduction_amount > 0) {
          const ledger = manager.getRepository(HousingLedgerEntryEntity);
          await ledger.save(ledger.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            leaseId,
            receivableId: checkoutReceivable?.id ?? null,
            entryType: "deposit_deduction",
            chargeType: "checkout_deduction",
            amount: dto.deposit_deduction_amount.toFixed(2),
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
    const lease = await this.mustLease(this.dataSource.manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    this.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
    await this.assertFiles(this.dataSource.manager, scope, dto.image_file_ids ?? [], {
      allowedMimeTypes: resolveFileUploadPolicy("workorder_create").mimeTypes,
      bizType: "workorder_create",
      bizId: lease.id,
      lock: false
    });
    const tenant = await this.mustParty(this.dataSource.manager, scope, lease.tenantPartyId);
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
    });
  }

  async checkoutLease(scope: TenantParkScope, actor: JwtPrincipal, leaseId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (lease.status === "terminated") return lease;
      this.assertStatus(lease, ["checkout_pending"]);
      const handover = await manager.getRepository(HousingHandoverEntity).findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          handoverType: "move_out",
          status: "completed",
          isDeleted: false
        }
      });
      if (!handover) throw new ConflictException("Completed move-out handover is required");
      const receivables = await manager.getRepository(HousingReceivableEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, leaseId, isDeleted: false }
      });
      const outstanding = receivables
        .filter((item) => item.status !== "void")
        .reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount) - Number(item.waivedAmount), 0);
      if (outstanding > 0.005) throw new ConflictException(`Outstanding tenant charges remain: ${outstanding.toFixed(2)}`);
      const depositEntries = await manager.getRepository(HousingLedgerEntryEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          status: "confirmed",
          isDeleted: false
        }
      });
      const depositBalance = calculateHousingDepositBalance(depositEntries);
      if (depositBalance > 0.005) {
        throw new ConflictException(`Deposit balance must be settled before checkout: ${depositBalance.toFixed(2)}`);
      }
      if (lease.occupancyId) {
        await this.occupancyService.releaseInTransaction(
          manager,
          scope,
          actor,
          lease.occupancyId,
          reason,
          "completed"
        );
      }
      lease.status = "terminated";
      lease.checkoutAt = new Date();
      lease.terminationReason = reason;
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
    });
  }

  async listPurchases(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingPurchaseQueryDto
  ): Promise<PaginatedResult<HousingPurchaseEntity>> {
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
    const [items, total] = await builder.orderBy("purchase.purchase_date", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getPurchase(scope: TenantParkScope, actor: JwtPrincipal, purchaseId: string) {
    const purchase = await this.purchasesRepository.findOne({
      where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!purchase) throw new NotFoundException("Housing purchase not found");
    await this.assertPurchaseAccess(scope, actor, purchase.unitId);
    const items = await this.dataSource.getRepository(HousingPurchaseItemEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        purchaseId,
        isDeleted: false
      }
    });
    return { purchase, items };
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
        quantity: item.quantity.toFixed(3),
        unit: item.unit ?? null,
        unitPrice: item.unit_price.toFixed(2),
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
    dto: HousingPurchaseActionDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(HousingPurchaseEntity);
      const purchase = await repository.findOne({
        where: { id: purchaseId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!purchase) throw new NotFoundException("Housing purchase not found");
      await this.assertPurchaseAccess(scope, actor, purchase.unitId);
      switch (dto.action) {
        case "approve":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be approved");
          purchase.approvalStatus = "approved";
          break;
        case "reject":
          if (purchase.approvalStatus !== "draft") throw new ConflictException("Only draft purchase can be rejected");
          purchase.approvalStatus = "rejected";
          break;
        case "pay":
          if (purchase.approvalStatus !== "approved" || purchase.paymentStatus !== "unpaid") {
            throw new ConflictException("Only approved unpaid purchase can be paid");
          }
          purchase.paymentStatus = "paid";
          break;
        case "refund":
          if (purchase.paymentStatus !== "paid") throw new ConflictException("Only paid purchase can be refunded");
          purchase.paymentStatus = "refunded";
          break;
        case "void":
          if (purchase.paymentStatus === "paid") throw new ConflictException("Paid purchase cannot be voided");
          purchase.approvalStatus = "void";
          break;
        default:
          throw new BadRequestException("Unsupported purchase action");
      }
      purchase.remark = dto.reason;
      purchase.updateBy = actor.sub;
      return repository.save(purchase);
    });
  }

  async transferPurchase(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    purchaseId: string,
    dto: TransferHousingPurchaseDto
  ) {
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
        .getMany();
      if (items.length !== new Set(dto.item_ids).size) throw new NotFoundException("One or more purchase items were not found");
      if (items.some((item) => item.transferredReceivableId)) {
        throw new ConflictException("One or more purchase items have already been transferred");
      }
      const amount = items.reduce((sum, item) => sum + Number(item.amount), 0);
      const receivable = await this.createReceivable(manager, scope, actor, lease, {
        chargePlanId: null,
        sourceType: "purchase_transfer",
        sourceId: purchase.id,
        chargeType: "purchase_recharge",
        periodStart: purchase.purchaseDate,
        periodEnd: this.addDays(purchase.purchaseDate, 1),
        dueDate: dto.due_date.slice(0, 10),
        amount,
        remark: dto.reason,
        accumulateIfExisting: true
      });
      for (const item of items) {
        item.transferredReceivableId = receivable.id;
        item.updateBy = actor.sub;
      }
      await itemsRepository.save(items);
      return { receivable, transferred_items: items };
    });
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
    if (options?.bizId && files.some((file) => file.bizId !== options.bizId)) {
      throw new BadRequestException("Attachment is not associated with the current housing record");
    }
    return files;
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
        Number(meter?.multiplier),
        Number(plan.unitPrice ?? 0)
      );
      return calculation;
    }
    const months = calculateHousingMonthFraction(dto.period_start, dto.period_end, leaseStartDate);
    if (months > plan.cycleMonths + 0.000001) {
      throw new BadRequestException(`Billing period exceeds configured ${plan.cycleMonths}-month cycle for ${plan.chargeType}`);
    }
    return {
      amount: Number(plan.amount ?? 0) * months,
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
      amount: number;
      openingReading?: number;
      closingReading?: number;
      usageAmount?: number;
      unitPrice?: number;
      remark?: string;
      accumulateIfExisting?: boolean;
    }
  ) {
    const repository = manager.getRepository(HousingReceivableEntity);
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
      const nextAmount = Number(existing.amount) + input.amount;
      const settled = Number(existing.paidAmount) + Number(existing.waivedAmount);
      existing.amount = nextAmount.toFixed(2);
      existing.status = settled >= nextAmount - 0.005
        ? (Number(existing.paidAmount) <= 0.005 ? "waived" : "paid")
        : settled > 0.005 ? "partial" : "unpaid";
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
      openingReading: input.openingReading === undefined ? null : input.openingReading.toFixed(6),
      closingReading: input.closingReading === undefined ? null : input.closingReading.toFixed(6),
      usageAmount: input.usageAmount === undefined ? null : input.usageAmount.toFixed(6),
      unitPrice: input.unitPrice === undefined ? null : input.unitPrice.toFixed(6),
      amount: input.amount.toFixed(2),
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
      Number(receivable.amount),
      Number(receivable.paidAmount),
      Number(receivable.waivedAmount),
      dto.entry_type,
      dto.amount
    );
    receivable.paidAmount = result.paidAmount.toFixed(2);
    receivable.waivedAmount = result.waivedAmount.toFixed(2);
    receivable.status = result.status;
  }

  private financeSummary(receivables: HousingReceivableEntity[], ledger: HousingLedgerEntryEntity[]) {
    const activeReceivables = receivables.filter((item) => item.status !== "void");
    const total = activeReceivables.reduce((sum, item) => sum + Number(item.amount), 0);
    const paid = activeReceivables.reduce((sum, item) => sum + Number(item.paidAmount), 0);
    const waived = activeReceivables.reduce((sum, item) => sum + Number(item.waivedAmount), 0);
    const activeLedger = ledger.filter((item) => item.status === "confirmed");
    const depositReceived = activeLedger
      .filter((item) => item.entryType === "deposit_receipt")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const depositOut = activeLedger
      .filter((item) => ["deposit_deduction", "deposit_refund"].includes(item.entryType))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      receivable: total.toFixed(2),
      paid: paid.toFixed(2),
      waived: waived.toFixed(2),
      outstanding: Math.max(0, total - paid - waived).toFixed(2),
      deposit_balance: Math.max(0, depositReceived - depositOut).toFixed(2)
    };
  }

  private assertStatus(lease: HousingLeaseEntity, allowed: HousingLeaseEntity["status"][]) {
    if (!allowed.includes(lease.status)) {
      throw new ConflictException(`Lease status ${lease.status} does not allow this action`);
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

  private isDatabaseConflict(error: unknown) {
    if (!error || typeof error !== "object") return false;
    return ["23505", "23P01"].includes(String((error as { code?: unknown }).code ?? ""));
  }

  private isUniqueViolation(error: unknown) {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
