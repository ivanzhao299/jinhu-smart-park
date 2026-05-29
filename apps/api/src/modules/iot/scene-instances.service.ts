import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateSceneInstanceDto, SceneQueryDto, UpdateSceneInstanceDto } from "./dto/scene.dto";
import { SceneInstanceEntity } from "./entities/scene-instance.entity";
import { SceneTemplateEntity } from "./entities/scene-template.entity";
import { IotRuleEntity } from "./entities/iot-rule.entity";

const INSTANCE_ENTITY = "scene_instance";

export interface SceneInstanceView {
  id: string;
  tenantId: string;
  parkId: string;
  templateId: string | null;
  sceneName: string;
  sceneType: string;
  triggerMode: string;
  linkedRuleId: string | null;
  status: string;
  priority: number;
  triggerConfigJson: Record<string, unknown>;
  actionConfigJson: Array<Record<string, unknown>>;
  lastTriggeredAt: Date | null;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class SceneInstancesService {
  constructor(
    @InjectRepository(SceneInstanceEntity)
    private readonly instanceRepository: Repository<SceneInstanceEntity>,
    @InjectRepository(SceneTemplateEntity)
    private readonly templateRepository: Repository<SceneTemplateEntity>,
    @InjectRepository(IotRuleEntity)
    private readonly ruleRepository: Repository<IotRuleEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: SceneQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<SceneInstanceView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", INSTANCE_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SceneInstanceView> {
    const entity = await this.findInstance(scope, id, actor);
    const view = this.toView(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", INSTANCE_ENTITY, view);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSceneInstanceDto): Promise<SceneInstanceView> {
    const template = dto.template_id ? await this.resolveTemplate(scope, dto.template_id) : null;
    await this.assertLinkedRule(scope, dto.linked_rule_id);
    const actionConfig = dto.action_config_json?.length ? dto.action_config_json : template?.actionConfigJson ?? [];
    if (actionConfig.length === 0 && !dto.linked_rule_id) {
      throw new BadRequestException("action_config_json or linked_rule_id is required");
    }
    const entity = this.instanceRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      templateId: template?.id ?? null,
      sceneName: dto.scene_name.trim(),
      sceneType: dto.scene_type,
      triggerMode: dto.trigger_mode,
      linkedRuleId: dto.linked_rule_id ?? null,
      status: dto.status ?? "DISABLED",
      priority: dto.priority ?? 100,
      triggerConfigJson: Object.keys(dto.trigger_config_json ?? {}).length > 0 ? dto.trigger_config_json ?? {} : template?.triggerConfigJson ?? {},
      actionConfigJson: actionConfig,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.instanceRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSceneInstanceDto): Promise<SceneInstanceView> {
    const entity = await this.findInstance(scope, id, actor);
    if (dto.template_id !== undefined) {
      entity.templateId = dto.template_id ? (await this.resolveTemplate(scope, dto.template_id)).id : null;
    }
    await this.assertLinkedRule(scope, dto.linked_rule_id);
    entity.sceneName = dto.scene_name ?? entity.sceneName;
    entity.sceneType = dto.scene_type ?? entity.sceneType;
    entity.triggerMode = dto.trigger_mode ?? entity.triggerMode;
    entity.linkedRuleId = dto.linked_rule_id === undefined ? entity.linkedRuleId : dto.linked_rule_id ?? null;
    entity.status = dto.status ?? entity.status;
    entity.priority = dto.priority ?? entity.priority;
    entity.triggerConfigJson = dto.trigger_config_json ?? entity.triggerConfigJson;
    entity.actionConfigJson = dto.action_config_json ?? entity.actionConfigJson;
    entity.remark = dto.remark === undefined ? entity.remark : dto.remark ?? null;
    entity.updateBy = actor.sub;
    if (entity.actionConfigJson.length === 0 && !entity.linkedRuleId) {
      throw new BadRequestException("action_config_json or linked_rule_id is required");
    }
    const saved = await this.instanceRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async enable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SceneInstanceView> {
    return this.setStatus(scope, actor, id, "ENABLED");
  }

  async disable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SceneInstanceView> {
    return this.setStatus(scope, actor, id, "DISABLED");
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findInstance(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.instanceRepository.save(entity);
    return { id };
  }

  async findInstance(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SceneInstanceEntity> {
    const builder = this.scopedBuilder(scope).andWhere("scene.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("scene instance not found");
    return entity;
  }

  async touchTriggered(entity: SceneInstanceEntity, actor?: JwtPrincipal): Promise<void> {
    entity.lastTriggeredAt = new Date();
    entity.updateBy = actor?.sub ?? entity.updateBy;
    await this.instanceRepository.save(entity);
  }

  async findEnabledAutomationsForRule(scope: TenantParkScope, linkedRuleId: string): Promise<SceneInstanceEntity[]> {
    return this.scopedBuilder(scope)
      .andWhere("scene.linked_rule_id = :linkedRuleId", { linkedRuleId })
      .andWhere("scene.status = :status", { status: "ENABLED" })
      .andWhere("scene.trigger_mode IN (:...triggerModes)", { triggerModes: ["AUTO", "SCHEDULE"] })
      .orderBy("scene.priority", "ASC")
      .addOrderBy("scene.updateTime", "DESC")
      .take(100)
      .getMany();
  }

  private async setStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, status: string): Promise<SceneInstanceView> {
    const entity = await this.findInstance(scope, id, actor);
    entity.status = status;
    entity.updateBy = actor.sub;
    const saved = await this.instanceRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SceneInstanceEntity> {
    return this.instanceRepository
      .createQueryBuilder("scene")
      .where("scene.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("scene.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("scene.is_deleted = false");
  }

  private async applyDataScope(builder: SelectQueryBuilder<SceneInstanceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "scene");
  }

  private applyQuery(builder: SelectQueryBuilder<SceneInstanceEntity>, query: SceneQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("scene.scene_name ILIKE :keyword", { keyword: `%${query.keyword}%` }).orWhere("scene.remark ILIKE :keyword", {
            keyword: `%${query.keyword}%`
          });
        })
      );
    }
    if (query.scene_type) builder.andWhere("scene.scene_type = :sceneType", { sceneType: query.scene_type });
    if (query.trigger_mode) builder.andWhere("scene.trigger_mode = :triggerMode", { triggerMode: query.trigger_mode });
    if (query.status) builder.andWhere("scene.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<SceneInstanceEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      scene_name: "scene.sceneName",
      scene_type: "scene.sceneType",
      trigger_mode: "scene.triggerMode",
      priority: "scene.priority",
      status: "scene.status",
      last_triggered_at: "scene.lastTriggeredAt",
      create_time: "scene.createTime",
      update_time: "scene.updateTime"
    };
    const [field, direction] = sort?.startsWith("-") ? [sort.slice(1), "DESC"] : [sort ?? "priority", sort ? "ASC" : "ASC"];
    builder.orderBy(sortMap[field] ?? "scene.priority", direction as "ASC" | "DESC").addOrderBy("scene.updateTime", "DESC");
  }

  private async resolveTemplate(scope: TenantParkScope, id: string): Promise<SceneTemplateEntity> {
    const template = await this.templateRepository.findOne({ where: { id, tenantId: scope.tenantId, isDeleted: false } });
    if (!template) throw new BadRequestException("template_id is invalid");
    return template;
  }

  private async assertLinkedRule(scope: TenantParkScope, linkedRuleId?: string | null): Promise<void> {
    if (!linkedRuleId) return;
    const rule = await this.ruleRepository.findOne({ where: { id: linkedRuleId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!rule) throw new BadRequestException("linked_rule_id is invalid");
  }

  private toView(entity: SceneInstanceEntity): SceneInstanceView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      templateId: entity.templateId,
      sceneName: entity.sceneName,
      sceneType: entity.sceneType,
      triggerMode: entity.triggerMode,
      linkedRuleId: entity.linkedRuleId,
      status: entity.status,
      priority: entity.priority,
      triggerConfigJson: entity.triggerConfigJson ?? {},
      actionConfigJson: entity.actionConfigJson ?? [],
      lastTriggeredAt: entity.lastTriggeredAt,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
