import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { CreateIotProtocolConfigDto } from "./dto/create-iot-protocol-config.dto";
import type { IotProtocolConfigQueryDto } from "./dto/iot-protocol-config-query.dto";
import type { UpdateIotProtocolConfigDto } from "./dto/update-iot-protocol-config.dto";
import { IotProtocolConfigEntity } from "./entities/iot-protocol-config.entity";

const PROTOCOL_CONFIG_ENTITY = "iot_protocol_config";

export interface IotProtocolConfigView {
  id: string;
  tenantId: string;
  parkId: string;
  protocolType: string;
  configName: string;
  hasConfig: boolean;
  configJson: null;
  status: string;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  isDeleted: boolean;
  version: number;
}

@Injectable()
export class IotProtocolConfigsService {
  constructor(
    @InjectRepository(IotProtocolConfigEntity)
    private readonly configRepository: Repository<IotProtocolConfigEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(
    scope: TenantParkScope,
    query: IotProtocolConfigQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<IotProtocolConfigView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toSafeView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", PROTOCOL_CONFIG_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotProtocolConfigView> {
    const entity = await this.findConfig(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", PROTOCOL_CONFIG_ENTITY, this.toSafeView(entity));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotProtocolConfigDto): Promise<IotProtocolConfigView> {
    this.assertRequired(dto.protocol_type, "protocol_type is required");
    this.assertRequired(dto.config_name, "config_name is required");
    await this.assertNameAvailable(scope, dto.protocol_type, dto.config_name);
    const entity = this.configRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      protocolType: dto.protocol_type,
      configName: dto.config_name,
      configJson: this.normalizeConfigJson(dto.config_json),
      status: dto.status ?? "enabled",
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.configRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotProtocolConfigDto): Promise<IotProtocolConfigView> {
    const entity = await this.findConfig(scope, id, actor);
    const nextProtocolType = dto.protocol_type ?? entity.protocolType;
    const nextConfigName = dto.config_name ?? entity.configName;
    if (nextProtocolType !== entity.protocolType || nextConfigName !== entity.configName) {
      await this.assertNameAvailable(scope, nextProtocolType, nextConfigName, entity.id);
    }
    Object.assign(entity, {
      protocolType: nextProtocolType,
      configName: nextConfigName,
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    if (dto.config_json !== undefined) {
      entity.configJson = this.normalizeConfigJson(dto.config_json);
    }
    const saved = await this.configRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findConfig(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.configRepository.save(entity);
    return { id };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<IotProtocolConfigEntity> {
    return this.configRepository
      .createQueryBuilder("config")
      .where("config.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("config.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("config.is_deleted = false");
  }

  private async findConfig(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotProtocolConfigEntity> {
    const builder = this.scopedBuilder(scope).andWhere("config.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT protocol config not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<IotProtocolConfigEntity>, query: IotProtocolConfigQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("config.config_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("config.protocol_type ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("config.remark ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.protocol_type) builder.andWhere("config.protocol_type = :protocolType", { protocolType: query.protocol_type });
    if (query.status) builder.andWhere("config.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<IotProtocolConfigEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      protocol_type: "config.protocolType",
      config_name: "config.configName",
      status: "config.status",
      update_time: "config.updateTime",
      create_time: "config.createTime"
    };
    this.applySortInternal(builder, sort, sortMap, "config.updateTime", "config.createTime", "DESC");
  }

  private applySortInternal<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    sort: string | undefined,
    sortMap: Record<string, string>,
    defaultField: string,
    tieBreaker: string,
    defaultDirection: "ASC" | "DESC" = "ASC"
  ): void {
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? defaultField, direction as "ASC" | "DESC").addOrderBy(tieBreaker, "DESC");
      return;
    }
    builder.orderBy(defaultField, defaultDirection).addOrderBy(tieBreaker, "DESC");
  }

  private async applyDataScope(
    builder: SelectQueryBuilder<IotProtocolConfigEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "config");
  }

  private async assertNameAvailable(scope: TenantParkScope, protocolType: string, configName: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope)
      .andWhere("config.protocol_type = :protocolType", { protocolType })
      .andWhere("config.config_name = :configName", { configName });
    if (excludeId) {
      builder.andWhere("config.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("IoT protocol config already exists");
    }
  }

  private normalizeConfigJson(configJson: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!configJson) return {};
    if (Array.isArray(configJson) || typeof configJson !== "object") {
      throw new BadRequestException("config_json must be an object");
    }
    return configJson;
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private toSafeView(entity: IotProtocolConfigEntity): IotProtocolConfigView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      protocolType: entity.protocolType,
      configName: entity.configName,
      hasConfig: Object.keys(entity.configJson ?? {}).length > 0,
      configJson: null,
      status: entity.status,
      remark: entity.remark,
      createBy: entity.createBy,
      createTime: entity.createTime,
      updateBy: entity.updateBy,
      updateTime: entity.updateTime,
      isDeleted: entity.isDeleted,
      version: entity.version
    };
  }
}
