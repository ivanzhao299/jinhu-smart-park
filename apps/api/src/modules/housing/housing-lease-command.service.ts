import { ConflictException, Inject, Injectable, Optional } from "@nestjs/common";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type PropertyApprovalCommandPort,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { assertPropertyHighRiskActionApprovalRequired } from "../../shared/property-workbench/property-high-risk-stopship";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type {
  AddHousingOccupantDto,
  ApproveHousingLeaseDto,
  CreateHousingLeaseDto,
  SignHousingLeaseDto
} from "./dto/housing.dto";
import {
  HousingChargePlanEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity
} from "./entities/housing.entities";
import { parseHousingCalendarDate } from "./housing-billing.policy";
import { formatHousingMoney } from "./housing-finance.policy";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { assertHousingLeaseUnitEligible } from "./housing-lease-unit-eligibility";

@Injectable()
export class HousingLeaseCommandService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly occupancyService: PropertyOccupancyPort,
    private readonly support: HousingTransactionSupportService,
    private readonly receivableWriter: HousingReceivableWriterService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHousingLeaseDto) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    this.support.assertDatePeriod(dto.start_date, dto.end_date);
    parseHousingCalendarDate(dto.first_due_date);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertEligible(manager, scope, dto.unit_id, dto.start_date, dto.end_date);
        await this.support.mustParty(manager, scope, dto.tenant_party_id);
        const repository = manager.getRepository(HousingLeaseEntity);
        const lease = await repository.save(repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseCode: dto.lease_code ?? this.support.generateCode("HL"),
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
        await this.createRentPlan(manager, scope, actor, lease, dto);
        return lease;
      });
    } catch (error) {
      if (this.support.isUniqueViolation(error)) {
        throw new ConflictException("Housing lease code already exists in current tenant and park");
      }
      throw error;
    }
  }

  submit(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (lease.status === "pending_approval") return lease;
      this.support.assertStatus(lease, ["draft"]);
      await this.assertEligible(manager, scope, lease.unitId, lease.startDate, lease.endDate);
      lease.status = "pending_approval";
      lease.updateBy = actor.sub;
      return manager.getRepository(HousingLeaseEntity).save(lease);
    });
  }

  async approve(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: ApproveHousingLeaseDto,
    clientKey = ""
  ) {
    const approval = this.approvalPort("housing.leases.approve");
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.support.assertStatus(lease, ["pending_approval"]);
      await this.assertEligible(manager, scope, lease.unitId, lease.startDate, lease.endDate);
      return approval.createPendingRequest({ transactionContext: manager }, {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
        scope,
        actionId: "housing.leases.approve.request",
        sourceType: "housing-lease",
        sourceId: lease.id,
        sourceExpectedVersion: lease.version,
        requesterId: actor.sub,
        submitterId: actor.sub,
        actorId: actor.sub,
        clientKey,
        businessIntentKey: `housing-lease-approve:${lease.id}:${lease.version}`,
        canonicalPayload: {
          leaseId: lease.id,
          fromStatus: lease.status,
          approvalNote: dto.approval_note?.trim() ?? null,
          actorName: actor.realName?.trim() || actor.username
        },
        payloadSchemaVersion: 1,
        amount: null,
        currency: null
      });
    });
  }

  sign(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SignHousingLeaseDto) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.support.assertStatus(lease, ["pending_signature"]);
      await this.assertEligible(manager, scope, lease.unitId, lease.startDate, lease.endDate);
      await this.support.assertFiles(manager, scope, [dto.signature_file_id], {
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

  async activate(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    idempotencyKey?: string
  ) {
    try {
      return await this.dataSource.transaction((manager) =>
        this.activateInTransaction(manager, scope, actor, id, idempotencyKey));
    } catch (error) {
      if (this.support.isDatabaseConflict(error)) {
        throw new ConflictException("Lease period conflicts with another occupancy");
      }
      throw error;
    }
  }

  async void(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    clientKey = ""
  ) {
    const approval = this.approvalPort("housing.leases.void");
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.support.assertStatus(lease, ["draft", "pending_approval", "pending_signature"]);
      return approval.createPendingRequest({ transactionContext: manager }, {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
        scope,
        actionId: "housing.leases.void.request",
        sourceType: "housing-lease",
        sourceId: lease.id,
        sourceExpectedVersion: lease.version,
        requesterId: actor.sub,
        submitterId: actor.sub,
        actorId: actor.sub,
        clientKey,
        businessIntentKey: `housing-lease-void:${lease.id}:${lease.version}`,
        canonicalPayload: {
          leaseId: lease.id,
          fromStatus: lease.status,
          reason: reason.trim(),
          actorName: actor.realName?.trim() || actor.username
        },
        payloadSchemaVersion: 1,
        amount: null,
        currency: null
      });
    });
  }

  addOccupant(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: AddHousingOccupantDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      if (["terminated", "void"].includes(lease.status)) {
        throw new ConflictException("Final housing leases cannot accept new occupants");
      }
      await this.support.mustParty(manager, scope, dto.party_id);
      const repository = manager.getRepository(HousingLeaseOccupantEntity);
      const current = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId: id,
          partyId: dto.party_id,
          isDeleted: false
        }
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

  private async activateInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    idempotencyKey?: string
  ) {
    const lease = await this.support.lockLease(manager, scope, id);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    if (lease.status === "active") return lease;
    this.support.assertStatus(lease, ["pending_signature"]);
    await this.assertEligible(manager, scope, lease.unitId, lease.startDate, lease.endDate);
    if (!lease.signatureFileId || !lease.signedAt || !lease.approvedAt) {
      throw new ConflictException(
        "Approval and offline signature registration are required before activation"
      );
    }
    await this.support.assertFiles(manager, scope, [lease.signatureFileId], {
      mimePrefix: "application/pdf",
      bizType: "housing_lease_signature",
      bizId: lease.id
    });
    const occupancy = await this.createOccupancy(manager, scope, actor, lease, idempotencyKey);
    lease.occupancyId = occupancy.id;
    lease.status = "active";
    lease.effectiveAt = new Date();
    lease.updateBy = actor.sub;
    const saved = await manager.getRepository(HousingLeaseEntity).save(lease);
    await this.createDepositReceivable(manager, scope, actor, saved);
    return saved;
  }

  private createOccupancy(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    idempotencyKey?: string
  ) {
    return this.occupancyService.createInTransaction(manager, scope, actor, {
      unit_id: lease.unitId,
      source_domain: "housing_rental",
      source_type: "housing_lease",
      source_id: lease.id,
      start_at: this.support.businessDateStart(lease.startDate).toISOString(),
      end_at: this.support.businessDateStart(this.support.addDays(lease.endDate, 1)).toISOString(),
      status: "active",
      remark: `住房租约 ${lease.leaseCode}`
    }, idempotencyKey);
  }

  private assertEligible(
    manager: EntityManager,
    scope: TenantParkScope,
    unitId: string,
    startDate: string,
    endDate: string
  ) {
    return assertHousingLeaseUnitEligible(manager, scope, unitId, {
      startAt: this.support.businessDateStart(startDate).toISOString(),
      endAt: this.support.businessDateStart(this.support.addDays(endDate, 1)).toISOString()
    });
  }

  private async createDepositReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity
  ) {
    if (Number(lease.depositAmount) <= 0) return;
    await this.receivableWriter.create(manager, scope, actor, lease, {
      chargePlanId: null,
      sourceType: "lease_deposit",
      sourceId: lease.id,
      chargeType: "deposit",
      periodStart: lease.startDate,
      periodEnd: this.support.addDays(lease.startDate, 1),
      dueDate: lease.firstDueDate,
      amount: lease.depositAmount
    });
  }

  private async createRentPlan(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    dto: CreateHousingLeaseDto
  ) {
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
  }

  private approvalPort(actionId: string) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired(actionId);
      throw new ConflictException("Property approval runtime is unavailable");
    }
    return this.approvalCommands;
  }
}
