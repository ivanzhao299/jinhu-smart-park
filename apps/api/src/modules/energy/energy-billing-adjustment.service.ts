import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { CreateEnergyBillingAdjustmentDto, EnergyBillingAdjustmentQueryDto } from "./dto/energy-billing.dto";
import { EnergyToReceivableAdapter } from "./energy-to-receivable.adapter";
import { EnergyBillingAdjustmentEntity } from "./entities/energy-billing-adjustment.entity";
import { EnergyBillingCycleEntity } from "./entities/energy-billing-cycle.entity";
import { EnergyBillingItemEntity } from "./entities/energy-billing-item.entity";

const ADJUSTMENT_CODE_ENTITY_TYPE = "energy_billing_adjustment";

@Injectable()
export class EnergyBillingAdjustmentService {
  constructor(
    @InjectRepository(EnergyBillingAdjustmentEntity)
    private readonly adjustmentRepository: Repository<EnergyBillingAdjustmentEntity>,
    @InjectRepository(EnergyBillingItemEntity)
    private readonly itemRepository: Repository<EnergyBillingItemEntity>,
    @InjectRepository(EnergyBillingCycleEntity)
    private readonly cycleRepository: Repository<EnergyBillingCycleEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly receivableAdapter: EnergyToReceivableAdapter,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, query: EnergyBillingAdjustmentQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyBillingAdjustmentEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.adjustmentRepository
      .createQueryBuilder("adjustment")
      .where("adjustment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("adjustment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("adjustment.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "adjustment");
    if (query.keyword) {
      builder.andWhere("(adjustment.adjustment_code ILIKE :keyword OR adjustment.adjustment_reason ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    if (query.billing_item_id) builder.andWhere("adjustment.billing_item_id = :billingItemId", { billingItemId: query.billing_item_id });
    if (query.cycle_id) builder.andWhere("adjustment.cycle_id = :cycleId", { cycleId: query.cycle_id });
    if (query.related_park_tenant_id) builder.andWhere("adjustment.related_park_tenant_id = :parkTenantId", { parkTenantId: query.related_park_tenant_id });
    if (query.adjustment_type) builder.andWhere("adjustment.adjustment_type = :adjustmentType", { adjustmentType: query.adjustment_type });
    if (query.status) builder.andWhere("adjustment.status = :status", { status: query.status });
    const [items, total] = await builder.orderBy("adjustment.create_time", "DESC").skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyBillingAdjustmentEntity> {
    return this.findAdjustment(scope, id, actor);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateEnergyBillingAdjustmentDto): Promise<EnergyBillingAdjustmentEntity> {
    if (!dto.adjustment_reason) throw new BadRequestException("Adjustment reason is required");
    const item = await this.itemRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: dto.billing_item_id, isDeleted: false } });
    if (!item) throw new NotFoundException("Energy billing item not found");
    const cycle = await this.cycleRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: item.cycleId, isDeleted: false } });
    if (!cycle) throw new NotFoundException("Energy billing cycle not found");
    if (cycle.status !== "POSTED") throw new BadRequestException("Only posted billing item can create adjustment");
    if (!item.receivableId) throw new BadRequestException("Billing item has no original receivable");

    let adjustmentAmount = Number(dto.adjustment_amount ?? 0);
    if (dto.adjustment_type === "REVERSAL") {
      adjustmentAmount = -Number(item.finalAmount ?? 0);
      const existingReversal = await this.adjustmentRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, billingItemId: item.id, adjustmentType: "REVERSAL", isDeleted: false }
      });
      if (existingReversal && existingReversal.status !== "CANCELLED") throw new ConflictException("Billing item already has a full reversal");
    }
    if (!Number.isFinite(adjustmentAmount) || adjustmentAmount === 0) throw new BadRequestException("Adjustment amount cannot be zero");

    const generated = await this.codeRulesService.generateCode(ADJUSTMENT_CODE_ENTITY_TYPE, scope.tenantId, scope.parkId, actor.sub);
    const adjustment = this.adjustmentRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      adjustmentCode: generated.code,
      billingItemId: item.id,
      cycleId: item.cycleId,
      relatedParkTenantId: item.relatedParkTenantId,
      originalReceivableId: item.receivableId,
      adjustmentType: dto.adjustment_type,
      adjustmentAmount: adjustmentAmount.toFixed(2),
      finalAdjustmentAmount: adjustmentAmount.toFixed(2),
      adjustmentReason: dto.adjustment_reason,
      status: "DRAFT",
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.adjustmentRepository.save(adjustment);
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyBillingAdjustmentEntity> {
    const adjustment = await this.findAdjustment(scope, id, actor);
    if (adjustment.status !== "DRAFT") throw new BadRequestException("Only draft adjustment can be approved");
    adjustment.status = "APPROVED";
    adjustment.approvedBy = actor.sub;
    adjustment.approvedAt = new Date();
    adjustment.updateBy = actor.sub;
    return this.adjustmentRepository.save(adjustment);
  }

  async post(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const adjustment = await this.findAdjustmentForUpdate(scope, id, manager);
      if (adjustment.status === "POSTED") {
        return { posted: false, skipped: true, adjustment_id: adjustment.id, receivable_id: adjustment.relatedReceivableId, reason: "Adjustment already posted" };
      }
      if (adjustment.status !== "APPROVED") throw new BadRequestException("Only approved adjustment can be posted");
      const cycle = await manager.findOne(EnergyBillingCycleEntity, { where: { tenantId: scope.tenantId, parkId: scope.parkId, id: adjustment.cycleId, isDeleted: false } });
      if (!cycle) throw new NotFoundException("Energy billing cycle not found");
      const result = await this.receivableAdapter.postAdjustment(scope, actor, adjustment, cycle.startDate, cycle.endDate, manager);
      adjustment.relatedReceivableId = result.receivable_id;
      adjustment.status = "POSTED";
      adjustment.postedBy = actor.sub;
      adjustment.postedAt = new Date();
      adjustment.updateBy = actor.sub;
      await manager.save(EnergyBillingAdjustmentEntity, adjustment);
      return { posted: true, adjustment_id: adjustment.id, receivable_id: adjustment.relatedReceivableId, result };
    });
  }

  async cancel(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyBillingAdjustmentEntity> {
    const adjustment = await this.findAdjustment(scope, id, actor);
    if (adjustment.status !== "DRAFT") throw new BadRequestException("Only draft adjustment can be cancelled");
    adjustment.status = "CANCELLED";
    adjustment.cancelledAt = new Date();
    adjustment.updateBy = actor.sub;
    return this.adjustmentRepository.save(adjustment);
  }

  private async findAdjustment(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyBillingAdjustmentEntity> {
    const builder = this.adjustmentRepository
      .createQueryBuilder("adjustment")
      .where("adjustment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("adjustment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("adjustment.is_deleted = false")
      .andWhere("adjustment.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "adjustment");
    const adjustment = await builder.getOne();
    if (!adjustment) throw new NotFoundException("Energy billing adjustment not found");
    return adjustment;
  }

  private async findAdjustmentForUpdate(scope: TenantParkScope, id: string, manager: EntityManager): Promise<EnergyBillingAdjustmentEntity> {
    const adjustment = await manager
      .createQueryBuilder(EnergyBillingAdjustmentEntity, "adjustment")
      .setLock("pessimistic_write")
      .where("adjustment.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("adjustment.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("adjustment.is_deleted = false")
      .andWhere("adjustment.id = :id", { id })
      .getOne();
    if (!adjustment) throw new NotFoundException("Energy billing adjustment not found");
    return adjustment;
  }
}
