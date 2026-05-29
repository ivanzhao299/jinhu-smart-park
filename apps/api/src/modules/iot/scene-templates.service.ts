import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateSceneTemplateDto, SceneQueryDto, UpdateSceneTemplateDto } from "./dto/scene.dto";
import { SceneInstanceEntity } from "./entities/scene-instance.entity";
import { SceneTemplateEntity } from "./entities/scene-template.entity";

const TEMPLATE_ENTITY = "scene_template";

export interface SceneTemplateView {
  id: string;
  tenantId: string;
  sceneCode: string;
  sceneName: string;
  sceneType: string;
  description: string | null;
  triggerConfigJson: Record<string, unknown>;
  actionConfigJson: Array<Record<string, unknown>>;
  isSystem: boolean;
  status: string;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class SceneTemplatesService {
  constructor(
    @InjectRepository(SceneTemplateEntity)
    private readonly templateRepository: Repository<SceneTemplateEntity>,
    @InjectRepository(SceneInstanceEntity)
    private readonly instanceRepository: Repository<SceneInstanceEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: SceneQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<SceneTemplateView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", TEMPLATE_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SceneTemplateView> {
    const entity = await this.findTemplate(scope, id);
    const view = this.toView(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", TEMPLATE_ENTITY, view);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSceneTemplateDto): Promise<SceneTemplateView> {
    const sceneCode = dto.scene_code ?? (await this.codeRulesService.generateNext(scope, actor.sub, "SCENE_TEMPLATE_CODE")).code;
    await this.assertSceneCodeAvailable(scope, sceneCode);
    const entity = this.templateRepository.create({
      tenantId: scope.tenantId,
      sceneCode,
      sceneName: dto.scene_name.trim(),
      sceneType: dto.scene_type,
      description: dto.description ?? null,
      triggerConfigJson: dto.trigger_config_json ?? {},
      actionConfigJson: dto.action_config_json,
      isSystem: dto.is_system ?? false,
      status: dto.status ?? "ENABLED",
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.templateRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSceneTemplateDto): Promise<SceneTemplateView> {
    const entity = await this.findTemplate(scope, id);
    if (entity.isSystem) throw new BadRequestException("系统预置模板不允许编辑，请复制后生成自定义场景");
    const nextCode = dto.scene_code ?? entity.sceneCode;
    if (nextCode !== entity.sceneCode) await this.assertSceneCodeAvailable(scope, nextCode, entity.id);
    entity.sceneCode = nextCode;
    entity.sceneName = dto.scene_name ?? entity.sceneName;
    entity.sceneType = dto.scene_type ?? entity.sceneType;
    entity.description = dto.description === undefined ? entity.description : dto.description ?? null;
    entity.triggerConfigJson = dto.trigger_config_json ?? entity.triggerConfigJson;
    entity.actionConfigJson = dto.action_config_json ?? entity.actionConfigJson;
    entity.status = dto.status ?? entity.status;
    entity.updateBy = actor.sub;
    const saved = await this.templateRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findTemplate(scope, id);
    if (entity.isSystem) throw new BadRequestException("系统预置模板不允许删除");
    const linked = await this.instanceRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, templateId: entity.id, isDeleted: false }
    });
    if (linked) throw new BadRequestException("模板已被场景实例使用，不能删除");
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.updateBy = actor.sub;
    await this.templateRepository.save(entity);
    return { id };
  }

  async findTemplate(scope: Pick<TenantParkScope, "tenantId">, id: string): Promise<SceneTemplateEntity> {
    const entity = await this.templateRepository.findOne({ where: { id, tenantId: scope.tenantId, isDeleted: false } });
    if (!entity) throw new NotFoundException("scene template not found");
    return entity;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SceneTemplateEntity> {
    return this.templateRepository
      .createQueryBuilder("template")
      .where("template.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("template.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SceneTemplateEntity>, query: SceneQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("template.scene_code ILIKE :keyword", { keyword: `%${query.keyword}%` }).orWhere("template.scene_name ILIKE :keyword", {
            keyword: `%${query.keyword}%`
          });
        })
      );
    }
    if (query.scene_type) builder.andWhere("template.scene_type = :sceneType", { sceneType: query.scene_type });
    if (query.status) builder.andWhere("template.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<SceneTemplateEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      scene_code: "template.sceneCode",
      scene_name: "template.sceneName",
      scene_type: "template.sceneType",
      status: "template.status",
      create_time: "template.createTime",
      update_time: "template.updateTime"
    };
    const [field, direction] = sort?.startsWith("-") ? [sort.slice(1), "DESC"] : [sort ?? "update_time", sort ? "ASC" : "DESC"];
    builder.orderBy(sortMap[field] ?? "template.updateTime", direction as "ASC" | "DESC").addOrderBy("template.createTime", "DESC");
  }

  private async assertSceneCodeAvailable(scope: TenantParkScope, sceneCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("template.scene_code = :sceneCode", { sceneCode });
    if (excludeId) builder.andWhere("template.id <> :excludeId", { excludeId });
    if (await builder.getExists()) throw new BadRequestException("scene_code already exists");
  }

  private toView(entity: SceneTemplateEntity): SceneTemplateView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      sceneCode: entity.sceneCode,
      sceneName: entity.sceneName,
      sceneType: entity.sceneType,
      description: entity.description,
      triggerConfigJson: entity.triggerConfigJson ?? {},
      actionConfigJson: entity.actionConfigJson ?? [],
      isSystem: entity.isSystem,
      status: entity.status,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
