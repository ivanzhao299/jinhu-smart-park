import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  CreateEnergyAllocationRuleDto,
  EnergyAllocationRuleQueryDto,
  UpdateEnergyAllocationRuleDto
} from "./dto/energy-billing.dto";
import { EnergyAllocationRuleEntity } from "./entities/energy-allocation-rule.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";

const RULE_ENTITY = "energy_allocation_rule";

@Injectable()
export class EnergyAllocationRuleService {
  constructor(
    @InjectRepository(EnergyAllocationRuleEntity)
    private readonly ruleRepository: Repository<EnergyAllocationRuleEntity>,
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: EnergyAllocationRuleQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyAllocationRuleEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    if (query.keyword) {
      builder.andWhere(new Brackets((qb) => qb.where("rule.rule_name ILIKE :keyword", { keyword: `%${query.keyword}%` })));
    }
    if (query.meter_type) builder.andWhere("rule.meter_type = :meterType", { meterType: query.meter_type });
    if (query.status) builder.andWhere("rule.status = :status", { status: query.status });
    const [items, total] = await builder
      .orderBy("rule.updateTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "energy", RULE_ENTITY, items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyAllocationRuleEntity> {
    const rule = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "energy", RULE_ENTITY, rule);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateEnergyAllocationRuleDto): Promise<EnergyAllocationRuleEntity> {
    await this.validatePublicMeter(scope, dto.public_meter_id, dto.meter_type);
    const entity = this.ruleRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      ruleName: dto.rule_name,
      meterType: dto.meter_type,
      allocationScope: dto.allocation_scope,
      allocationMethod: dto.allocation_method,
      publicMeterId: dto.public_meter_id,
      scopeId: dto.scope_id ?? null,
      ruleConfigJson: dto.rule_config_json ?? {},
      status: dto.status ?? "ENABLED",
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.ruleRepository.save(entity);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateEnergyAllocationRuleDto): Promise<EnergyAllocationRuleEntity> {
    const entity = await this.findOne(scope, id, actor);
    const publicMeterId = dto.public_meter_id ?? entity.publicMeterId;
    const meterType = dto.meter_type ?? entity.meterType;
    await this.validatePublicMeter(scope, publicMeterId, meterType);
    Object.assign(entity, {
      ruleName: dto.rule_name ?? entity.ruleName,
      meterType,
      allocationScope: dto.allocation_scope ?? entity.allocationScope,
      allocationMethod: dto.allocation_method ?? entity.allocationMethod,
      publicMeterId,
      scopeId: dto.scope_id ?? entity.scopeId,
      ruleConfigJson: dto.rule_config_json ?? entity.ruleConfigJson,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actor.sub
    });
    return this.ruleRepository.save(entity);
  }

  async setStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, status: "ENABLED" | "DISABLED"): Promise<EnergyAllocationRuleEntity> {
    const entity = await this.findOne(scope, id, actor);
    entity.status = status;
    entity.updateBy = actor.sub;
    return this.ruleRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.ruleRepository.save(entity);
    return { id };
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyAllocationRuleEntity> {
    const builder = this.scopedBuilder(scope).andWhere("rule.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Energy allocation rule not found");
    return entity;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<EnergyAllocationRuleEntity> {
    return this.ruleRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false");
  }

  private async applyDataScope(builder: SelectQueryBuilder<EnergyAllocationRuleEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "rule");
  }

  private async validatePublicMeter(scope: TenantParkScope, meterId: string, meterType: string): Promise<void> {
    const meter = await this.meterRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: meterId, isDeleted: false } });
    if (!meter) throw new BadRequestException("public_meter_id does not belong to current tenant and park");
    if (meter.meterType !== meterType) throw new BadRequestException("Public meter type must match rule meter_type");
    if (meter.meterPurpose !== "PUBLIC") throw new BadRequestException("Allocation rule public_meter_id must reference a PUBLIC meter");
  }
}
