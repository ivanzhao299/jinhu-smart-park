import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateVideoPlatformConfigDto } from "./dto/create-video-platform-config.dto";
import type { UpdateVideoPlatformConfigDto } from "./dto/update-video-platform-config.dto";
import type { VideoPlatformConfigQueryDto } from "./dto/video-platform-config-query.dto";
import { VideoPlatformConfigEntity } from "./entities/video-platform-config.entity";
import { VideoSecretService } from "./video-secret.service";

const VIDEO_MODULE = "video";
const PLATFORM_CONFIG_ENTITY = "video_platform_config";
const VALID_PLATFORM_STATUSES = new Set(["ACTIVE", "DISABLED", "EXPIRED", "ERROR"]);

export interface VideoPlatformConfigView {
  id: string;
  tenantId: string;
  parkId: string;
  platformType: string;
  platformName: string;
  vendorName: string | null;
  appKey: string | null;
  appSecretEncrypted: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  refreshTokenConfigured: boolean;
  tokenExpireAt: Date | null;
  apiBaseUrl: string | null;
  callbackUrl: string | null;
  status: string;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  deletedAt: Date | null;
  isDeleted: boolean;
  version: number;
}

@Injectable()
export class VideoPlatformService {
  constructor(
    @InjectRepository(VideoPlatformConfigEntity)
    private readonly platformRepository: Repository<VideoPlatformConfigEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly secretService: VideoSecretService
  ) {}

  async list(
    scope: TenantParkScope,
    query: VideoPlatformConfigQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<VideoPlatformConfigView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toSafeView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, VIDEO_MODULE, PLATFORM_CONFIG_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoPlatformConfigView> {
    const entity = await this.findOne(scope, id, actor);
    const safe = this.toSafeView(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, VIDEO_MODULE, PLATFORM_CONFIG_ENTITY, safe);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateVideoPlatformConfigDto): Promise<VideoPlatformConfigView> {
    this.assertRequired(dto.platform_type, "platform_type is required");
    this.assertRequired(dto.platform_name, "platform_name is required");
    const status = this.normalizeStatus(dto.status ?? "ACTIVE");
    const entity = this.platformRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      platformType: dto.platform_type,
      platformName: dto.platform_name,
      vendorName: dto.vendor_name ?? null,
      appKey: dto.app_key ?? null,
      appSecretEncrypted: this.encryptSecret(dto.app_secret ?? dto.app_secret_encrypted),
      accessTokenEncrypted: this.encryptSecret(dto.access_token ?? dto.access_token_encrypted),
      refreshTokenEncrypted: this.encryptSecret(dto.refresh_token ?? dto.refresh_token_encrypted),
      tokenExpireAt: dto.token_expire_at ? new Date(dto.token_expire_at) : null,
      apiBaseUrl: dto.api_base_url ?? null,
      callbackUrl: dto.callback_url ?? null,
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.platformRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateVideoPlatformConfigDto): Promise<VideoPlatformConfigView> {
    const entity = await this.findOne(scope, id, actor);
    const appSecret = this.normalizeUpdateSecret(dto.app_secret ?? dto.app_secret_encrypted, entity.appSecretEncrypted);
    const accessToken = this.normalizeUpdateSecret(dto.access_token ?? dto.access_token_encrypted, entity.accessTokenEncrypted);
    const refreshToken = this.normalizeUpdateSecret(dto.refresh_token ?? dto.refresh_token_encrypted, entity.refreshTokenEncrypted);
    Object.assign(entity, {
      platformType: dto.platform_type ?? entity.platformType,
      platformName: dto.platform_name ?? entity.platformName,
      vendorName: dto.vendor_name === undefined ? entity.vendorName : dto.vendor_name ?? null,
      appKey: dto.app_key === undefined ? entity.appKey : dto.app_key ?? null,
      appSecretEncrypted: appSecret,
      accessTokenEncrypted: accessToken,
      refreshTokenEncrypted: refreshToken,
      tokenExpireAt: dto.token_expire_at === undefined ? entity.tokenExpireAt : dto.token_expire_at ? new Date(dto.token_expire_at) : null,
      apiBaseUrl: dto.api_base_url === undefined ? entity.apiBaseUrl : dto.api_base_url ?? null,
      callbackUrl: dto.callback_url === undefined ? entity.callbackUrl : dto.callback_url ?? null,
      status: dto.status === undefined ? entity.status : this.normalizeStatus(dto.status),
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.platformRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.status = "DISABLED";
    entity.updateBy = actor.sub;
    await this.platformRepository.save(entity);
    return { id };
  }

  async findActiveByPlatformType(scope: TenantParkScope, platformType: string): Promise<VideoPlatformConfigEntity | null> {
    return this.scopedBuilder(scope)
      .andWhere("config.platform_type = :platformType", { platformType })
      .andWhere("config.status = 'ACTIVE'")
      .orderBy("config.update_time", "DESC")
      .getOne();
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<VideoPlatformConfigEntity> {
    return this.platformRepository
      .createQueryBuilder("config")
      .where("config.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("config.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("config.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoPlatformConfigEntity> {
    const builder = this.scopedBuilder(scope).andWhere("config.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Video platform config not found");
    }
    return entity;
  }

  private async applyDataScope(
    builder: SelectQueryBuilder<VideoPlatformConfigEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "config");
  }

  private applyQuery(builder: SelectQueryBuilder<VideoPlatformConfigEntity>, query: VideoPlatformConfigQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("config.platform_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("config.platform_type ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("config.vendor_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.platform_type) builder.andWhere("config.platform_type = :platformType", { platformType: query.platform_type });
    if (query.status) builder.andWhere("config.status = :status", { status: this.normalizeStatus(query.status) });
  }

  private applySort(builder: SelectQueryBuilder<VideoPlatformConfigEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      platform_type: "config.platformType",
      platform_name: "config.platformName",
      status: "config.status",
      update_time: "config.updateTime",
      create_time: "config.createTime"
    };
    if (sort) {
      const field = sort.startsWith("-") ? sort.slice(1) : sort;
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      builder.orderBy(sortMap[field] ?? "config.updateTime", direction).addOrderBy("config.createTime", "DESC");
      return;
    }
    builder.orderBy("config.updateTime", "DESC").addOrderBy("config.createTime", "DESC");
  }

  private normalizeStatus(status: string): string {
    const normalized = status.trim().toUpperCase();
    if (!VALID_PLATFORM_STATUSES.has(normalized)) {
      throw new BadRequestException("status is invalid");
    }
    return normalized;
  }

  private encryptSecret(value: string | undefined): string | null {
    return this.secretService.normalizeForStorage(value) ?? null;
  }

  private normalizeUpdateSecret(value: string | undefined, existing: string | null): string | null {
    if (value === undefined) return existing;
    if (value.trim() === "***") return existing;
    return this.secretService.normalizeForStorage(value) ?? null;
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private toSafeView(entity: VideoPlatformConfigEntity): VideoPlatformConfigView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      platformType: entity.platformType,
      platformName: entity.platformName,
      vendorName: entity.vendorName,
      appKey: entity.appKey,
      appSecretEncrypted: this.secretService.mask(entity.appSecretEncrypted),
      accessTokenEncrypted: this.secretService.mask(entity.accessTokenEncrypted),
      refreshTokenEncrypted: this.secretService.mask(entity.refreshTokenEncrypted),
      appSecretConfigured: Boolean(entity.appSecretEncrypted),
      accessTokenConfigured: Boolean(entity.accessTokenEncrypted),
      refreshTokenConfigured: Boolean(entity.refreshTokenEncrypted),
      tokenExpireAt: entity.tokenExpireAt,
      apiBaseUrl: entity.apiBaseUrl,
      callbackUrl: entity.callbackUrl,
      status: entity.status,
      remark: entity.remark,
      createBy: entity.createBy,
      createTime: entity.createTime,
      updateBy: entity.updateBy,
      updateTime: entity.updateTime,
      deletedAt: entity.deletedAt,
      isDeleted: entity.isDeleted,
      version: entity.version
    };
  }
}
