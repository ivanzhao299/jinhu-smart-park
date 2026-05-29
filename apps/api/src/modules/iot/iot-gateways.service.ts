import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { CreateIotGatewayDto } from "./dto/create-iot-gateway.dto";
import type { IotGatewayQueryDto } from "./dto/iot-gateway-query.dto";
import type { UpdateIotGatewayDto } from "./dto/update-iot-gateway.dto";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotGatewayEntity } from "./entities/iot-gateway.entity";

const GATEWAY_ENTITY = "iot_gateway";
const MASKED_SECRET_VALUE = "***";

export interface IotGatewayView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  gatewayCode: string;
  gatewayName: string;
  gatewayType: string;
  protocolType: string;
  vendorName: string | null;
  brand: string | null;
  model: string | null;
  endpointUrl: string | null;
  ipAddress: string | null;
  port: number | null;
  mqttClientId: string | null;
  accessKey: string | null;
  secretEncrypted: string | null;
  status: string;
  lastHeartbeatAt: Date | null;
  lastOnlineTime: Date | null;
  lastOfflineTime: Date | null;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  isDeleted: boolean;
  version: number;
}

@Injectable()
export class IotGatewaysService {
  constructor(
    @InjectRepository(IotGatewayEntity)
    private readonly gatewayRepository: Repository<IotGatewayEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: IotGatewayQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotGatewayView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedGatewayBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyGatewayQuery(builder, query);
    this.applyGatewaySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toSafeView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", GATEWAY_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotGatewayView> {
    const entity = await this.findGateway(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", GATEWAY_ENTITY, this.toSafeView(entity));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotGatewayDto): Promise<IotGatewayView> {
    this.assertRequired(dto.gateway_name, "gateway_name is required");
    this.assertRequired(dto.gateway_type, "gateway_type is required");
    this.assertRequired(dto.protocol_type, "protocol_type is required");
    const generated = dto.gateway_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_GATEWAY_CODE");
    const gatewayCode = dto.gateway_code ?? generated?.code ?? "";
    await this.assertGatewayCodeAvailable(scope, gatewayCode);
    const entity = this.gatewayRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? gatewayCode,
      gatewayCode,
      gatewayName: dto.gateway_name,
      gatewayType: dto.gateway_type,
      protocolType: dto.protocol_type,
      vendorName: dto.vendor_name ?? null,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      endpointUrl: dto.endpoint_url ?? null,
      ipAddress: dto.ip_address ?? null,
      port: dto.port ?? null,
      mqttClientId: dto.mqtt_client_id ?? null,
      accessKey: dto.access_key ?? null,
      secretEncrypted: this.normalizeSecret(dto.secret ?? dto.secret_encrypted),
      status: dto.status ?? "enabled",
      lastHeartbeatAt: this.parseOptionalDate(dto.last_heartbeat_at, "last_heartbeat_at"),
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.gatewayRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotGatewayDto): Promise<IotGatewayView> {
    const entity = await this.findGateway(scope, id, actor);
    const nextGatewayCode = dto.gateway_code ?? entity.gatewayCode;
    if (nextGatewayCode !== entity.gatewayCode) {
      await this.assertGatewayCodeAvailable(scope, nextGatewayCode, entity.id);
    }
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      gatewayCode: nextGatewayCode,
      gatewayName: dto.gateway_name ?? entity.gatewayName,
      gatewayType: dto.gateway_type ?? entity.gatewayType,
      protocolType: dto.protocol_type ?? entity.protocolType,
      vendorName: dto.vendor_name === undefined ? entity.vendorName : dto.vendor_name ?? null,
      brand: dto.brand === undefined ? entity.brand : dto.brand ?? null,
      model: dto.model === undefined ? entity.model : dto.model ?? null,
      endpointUrl: dto.endpoint_url === undefined ? entity.endpointUrl : dto.endpoint_url ?? null,
      ipAddress: dto.ip_address === undefined ? entity.ipAddress : dto.ip_address ?? null,
      port: dto.port === undefined ? entity.port : dto.port ?? null,
      mqttClientId: dto.mqtt_client_id === undefined ? entity.mqttClientId : dto.mqtt_client_id ?? null,
      accessKey: dto.access_key === undefined ? entity.accessKey : dto.access_key ?? null,
      lastHeartbeatAt:
        dto.last_heartbeat_at === undefined ? entity.lastHeartbeatAt : this.parseOptionalDate(dto.last_heartbeat_at, "last_heartbeat_at"),
      status: dto.status ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const secretInput = dto.secret ?? dto.secret_encrypted;
    if (secretInput !== undefined) {
      entity.secretEncrypted = this.normalizeSecret(secretInput);
    }
    const saved = await this.gatewayRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findGateway(scope, id, actor);
    const linkedDevices = await this.deviceRepository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, gatewayId: id, isDeleted: false }
    });
    if (linkedDevices > 0) {
      throw new BadRequestException("Gateway has linked devices and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.gatewayRepository.save(entity);
    return { id };
  }

  async testConnection(scope: TenantParkScope, id: string, actor?: JwtPrincipal) {
    const entity = await this.findGateway(scope, id, actor);
    const checkedAt = new Date().toISOString();
    if (!entity.endpointUrl) {
      return {
        id,
        success: false,
        status: "failed",
        message: "endpoint_url 为空，模拟检测失败",
        checked_at: checkedAt
      };
    }
    return {
      id,
      success: true,
      status: "passed",
      message: "模拟连接通过，真实协议联调将在后续 IoT 接入阶段完成",
      checked_at: checkedAt
    };
  }

  private scopedGatewayBuilder(scope: TenantParkScope): SelectQueryBuilder<IotGatewayEntity> {
    return this.gatewayRepository
      .createQueryBuilder("gateway")
      .where("gateway.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("gateway.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("gateway.is_deleted = false");
  }

  private async findGateway(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotGatewayEntity> {
    const builder = this.scopedGatewayBuilder(scope).andWhere("gateway.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("IoT gateway not found");
    }
    return entity;
  }

  private applyGatewayQuery(builder: SelectQueryBuilder<IotGatewayEntity>, query: IotGatewayQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("gateway.gateway_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.gateway_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.vendor_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.brand ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.model ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.ip_address ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.endpoint_url ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("gateway.mqtt_client_id ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.gateway_type) builder.andWhere("gateway.gateway_type = :gatewayType", { gatewayType: query.gateway_type });
    if (query.protocol_type) builder.andWhere("gateway.protocol_type = :protocolType", { protocolType: query.protocol_type });
    if (query.status) builder.andWhere("gateway.status = :status", { status: query.status });
  }

  private applyGatewaySort(builder: SelectQueryBuilder<IotGatewayEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      gateway_code: "gateway.gatewayCode",
      gateway_name: "gateway.gatewayName",
      gateway_type: "gateway.gatewayType",
      protocol_type: "gateway.protocolType",
      brand: "gateway.brand",
      last_heartbeat_at: "gateway.lastHeartbeatAt",
      status: "gateway.status",
      last_online_time: "gateway.lastOnlineTime",
      update_time: "gateway.updateTime",
      create_time: "gateway.createTime"
    };
    this.applySort(builder, sort, sortMap, "gateway.updateTime", "gateway.createTime", "DESC");
  }

  private applySort<Entity extends ObjectLiteral>(
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

  private async applyDataScope(builder: SelectQueryBuilder<IotGatewayEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "gateway");
  }

  private async assertGatewayCodeAvailable(scope: TenantParkScope, gatewayCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedGatewayBuilder(scope).andWhere("gateway.gateway_code = :gatewayCode", { gatewayCode });
    if (excludeId) {
      builder.andWhere("gateway.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("IoT gateway code already exists");
    }
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private normalizeSecret(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const text = value.trim();
    if (!text) {
      return null;
    }
    if (text.startsWith("sha256:")) {
      return text;
    }
    return `sha256:${createHash("sha256").update(text).digest("hex")}`;
  }

  private parseOptionalDate(value: string | null | undefined, field: string): Date | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return parsed;
  }

  private toSafeView(entity: IotGatewayEntity): IotGatewayView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      gatewayCode: entity.gatewayCode,
      gatewayName: entity.gatewayName,
      gatewayType: entity.gatewayType,
      protocolType: entity.protocolType,
      vendorName: entity.vendorName,
      brand: entity.brand,
      model: entity.model,
      endpointUrl: entity.endpointUrl,
      ipAddress: entity.ipAddress,
      port: entity.port,
      mqttClientId: entity.mqttClientId,
      accessKey: entity.accessKey,
      secretEncrypted: entity.secretEncrypted ? MASKED_SECRET_VALUE : null,
      status: entity.status,
      lastHeartbeatAt: entity.lastHeartbeatAt,
      lastOnlineTime: entity.lastOnlineTime,
      lastOfflineTime: entity.lastOfflineTime,
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
