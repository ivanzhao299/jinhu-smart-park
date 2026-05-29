import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { AdjustEnergyBillingItemDto, DisputeEnergyBillingItemDto, EnergyBillingItemQueryDto } from "./dto/energy-billing.dto";
import { EnergyBillingCycleEntity } from "./entities/energy-billing-cycle.entity";
import { EnergyBillingItemEntity } from "./entities/energy-billing-item.entity";

@Injectable()
export class EnergyBillingItemService {
  constructor(
    @InjectRepository(EnergyBillingItemEntity)
    private readonly itemRepository: Repository<EnergyBillingItemEntity>,
    @InjectRepository(EnergyBillingCycleEntity)
    private readonly cycleRepository: Repository<EnergyBillingCycleEntity>,
    private readonly dataScopeService: DataScopeService
  ) {}

  async list(scope: TenantParkScope, query: EnergyBillingItemQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyBillingItemEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.itemRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "item");
    if (query.cycle_id) builder.andWhere("item.cycle_id = :cycleId", { cycleId: query.cycle_id });
    if (query.related_park_tenant_id) builder.andWhere("item.related_park_tenant_id = :parkTenantId", { parkTenantId: query.related_park_tenant_id });
    if (query.billing_method) builder.andWhere("item.billing_method = :method", { method: query.billing_method });
    if (query.confirmation_status) builder.andWhere("item.confirmation_status = :status", { status: query.confirmation_status });
    const [items, total] = await builder.orderBy("item.create_time", "DESC").skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async adjust(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AdjustEnergyBillingItemDto): Promise<EnergyBillingItemEntity> {
    const item = await this.findItem(scope, id, actor);
    await this.assertCycleMutable(scope, item.cycleId);
    if (!dto.adjustment_reason) throw new BadRequestException("Adjustment reason is required");
    const amount = Number(item.amount ?? 0);
    const adjustment = Number(dto.adjustment_amount ?? 0);
    item.adjustmentAmount = adjustment.toFixed(2);
    item.finalAmount = (amount + adjustment).toFixed(2);
    item.adjustmentReason = dto.adjustment_reason;
    item.updateBy = actor.sub;
    return this.itemRepository.save(item);
  }

  async confirm(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyBillingItemEntity> {
    const item = await this.findItem(scope, id, actor);
    await this.assertCycleMutable(scope, item.cycleId);
    item.confirmationStatus = "CONFIRMED";
    item.updateBy = actor.sub;
    return this.itemRepository.save(item);
  }

  async dispute(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: DisputeEnergyBillingItemDto): Promise<EnergyBillingItemEntity> {
    const item = await this.findItem(scope, id, actor);
    await this.assertCycleMutable(scope, item.cycleId);
    if (!dto.dispute_reason) throw new BadRequestException("Dispute reason is required");
    item.confirmationStatus = "DISPUTED";
    item.disputeReason = dto.dispute_reason;
    item.updateBy = actor.sub;
    return this.itemRepository.save(item);
  }

  private async findItem(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyBillingItemEntity> {
    const builder = this.itemRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false")
      .andWhere("item.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "item");
    const item = await builder.getOne();
    if (!item) throw new NotFoundException("Energy billing item not found");
    return item;
  }

  private async assertCycleMutable(scope: TenantParkScope, cycleId: string): Promise<void> {
    const cycle = await this.cycleRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: cycleId, isDeleted: false } });
    if (!cycle) throw new NotFoundException("Energy billing cycle not found");
    if (cycle.status === "POSTED") throw new BadRequestException("Posted billing item cannot be changed");
    if (cycle.status === "CANCELLED") throw new BadRequestException("Cancelled billing item cannot be changed");
  }
}
