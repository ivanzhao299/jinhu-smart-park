import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { UnifiedActionExecutorService } from "../iot/unified-action-executor.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { EnergyAlertActionDto } from "./dto/energy-alert-action.dto";
import type { EnergyAlertQueryDto } from "./dto/energy-alert-query.dto";
import { EnergyAlertEntity } from "./entities/energy-alert.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";

const ALERT_ENTITY = "energy_alert";
const ALERT_CODE_RULE = "ENERGY_ALERT_CODE";

export interface EnergyAlertView {
  id: string;
  meterId: string;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  title: string;
  description: string | null;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  processStatus: string;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class EnergyAlertService {
  constructor(
    @InjectRepository(EnergyAlertEntity)
    private readonly alertRepository: Repository<EnergyAlertEntity>,
    @InjectRepository(EnergyMeterEntity)
    private readonly meterRepository: Repository<EnergyMeterEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    @Optional()
    private readonly unifiedActionExecutor?: UnifiedActionExecutorService
  ) {}

  async list(scope: TenantParkScope, query: EnergyAlertQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<EnergyAlertView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "energy", ALERT_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyAlertView> {
    const entity = await this.findAlert(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "energy", ALERT_ENTITY, this.toView(entity));
  }

  async acknowledge(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyAlertView> {
    const entity = await this.findAlert(scope, id, actor);
    if (entity.processStatus !== "PENDING") throw new BadRequestException("Only pending alert can be acknowledged");
    entity.processStatus = "ACKNOWLEDGED";
    entity.acknowledgedAt = new Date();
    entity.updateBy = actor.sub;
    return this.toView(await this.alertRepository.save(entity));
  }

  async resolve(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<EnergyAlertView> {
    const entity = await this.findAlert(scope, id, actor);
    if (!["PENDING", "ACKNOWLEDGED"].includes(entity.processStatus)) throw new BadRequestException("Only open alert can be resolved");
    entity.processStatus = "RESOLVED";
    entity.resolvedAt = new Date();
    entity.updateBy = actor.sub;
    return this.toView(await this.alertRepository.save(entity));
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: EnergyAlertActionDto): Promise<EnergyAlertView> {
    if (!dto.reason) throw new BadRequestException("close reason is required");
    const entity = await this.findAlert(scope, id, actor);
    if (entity.processStatus === "CLOSED") throw new BadRequestException("Alert already closed");
    entity.processStatus = "CLOSED";
    entity.resolvedAt = entity.resolvedAt ?? new Date();
    entity.remark = dto.reason;
    entity.updateBy = actor.sub;
    return this.toView(await this.alertRepository.save(entity));
  }

  async createSystemAlert(
    scope: TenantParkScope,
    actorId: string | null,
    payload: { meterId: string; alertType: string; alertLevel: string; title: string; description?: string | null }
  ): Promise<EnergyAlertEntity> {
    const code = (await this.codeRulesService.generateNext(scope, actorId ?? "00000000-0000-0000-0000-000000000000", ALERT_CODE_RULE)).code;
    const entity = this.alertRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      meterId: payload.meterId,
      alertCode: code,
      alertType: payload.alertType,
      alertLevel: payload.alertLevel,
      title: payload.title,
      description: payload.description ?? null,
      triggeredAt: new Date(),
      processStatus: "PENDING",
      createBy: actorId,
      updateBy: actorId
    });
    const saved = await this.alertRepository.save(entity);
    await this.reserveUnifiedActionEntry(scope, actorId, saved);
    return saved;
  }

  private async reserveUnifiedActionEntry(scope: TenantParkScope, actorId: string | null, alert: EnergyAlertEntity): Promise<void> {
    if (!this.unifiedActionExecutor) return;
    // S9-E only reserves the unified action path. Concrete notification/work-order actions are configured in later rule/scene stages.
    await this.unifiedActionExecutor.executeAction({
      source_type: "ENERGY_ALERT",
      source_id: alert.id,
      tenant_id: scope.tenantId,
      park_id: scope.parkId,
      actor_user_id: actorId,
      action_type: "NOOP_SIMULATION",
      action_payload: { alert_code: alert.alertCode },
      context_payload: { alert_type: alert.alertType, alert_level: alert.alertLevel }
    });
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<EnergyAlertEntity> {
    return this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .orderBy("alert.triggered_at", "DESC")
      .addOrderBy("alert.create_time", "DESC");
  }

  private applyQuery(builder: SelectQueryBuilder<EnergyAlertEntity>, query: EnergyAlertQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("alert.alert_code ILIKE :keyword", { keyword: `%${query.keyword}%` }).orWhere("alert.title ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.meter_id) builder.andWhere("alert.meter_id = :meterId", { meterId: query.meter_id });
    if (query.alert_type) builder.andWhere("alert.alert_type = :alertType", { alertType: query.alert_type });
    if (query.alert_level) builder.andWhere("alert.alert_level = :alertLevel", { alertLevel: query.alert_level });
    if (query.process_status) builder.andWhere("alert.process_status = :status", { status: query.process_status });
    if (query.start_time) builder.andWhere("alert.triggered_at >= :startTime", { startTime: new Date(query.start_time) });
    if (query.end_time) builder.andWhere("alert.triggered_at <= :endTime", { endTime: new Date(query.end_time) });
  }

  private async findAlert(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<EnergyAlertEntity> {
    const builder = this.scopedBuilder(scope).andWhere("alert.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Energy alert not found");
    return entity;
  }

  private async applyDataScope(builder: SelectQueryBuilder<EnergyAlertEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "alert");
    const meterAlias = "scope_meter";
    builder.leftJoin("energy_meter", meterAlias, `${meterAlias}.id = alert.meter_id AND ${meterAlias}.tenant_id = alert.tenant_id AND ${meterAlias}.park_id = alert.park_id`);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", meterAlias);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", meterAlias);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", meterAlias, { unit: "room_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", meterAlias, { tenantCompany: "related_park_tenant_id" });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", meterAlias, { device: "iot_device_id" });
  }

  private toView(entity: EnergyAlertEntity): EnergyAlertView {
    return {
      id: entity.id,
      meterId: entity.meterId,
      alertCode: entity.alertCode,
      alertType: entity.alertType,
      alertLevel: entity.alertLevel,
      title: entity.title,
      description: entity.description,
      triggeredAt: entity.triggeredAt,
      acknowledgedAt: entity.acknowledgedAt,
      resolvedAt: entity.resolvedAt,
      processStatus: entity.processStatus,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
