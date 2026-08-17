import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import { UsersService } from "../users/users.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { BuildingQueryDto } from "./dto/building-query.dto";
import type { CreateBuildingDto } from "./dto/create-building.dto";
import type { UpdateBuildingDto } from "./dto/update-building.dto";
import { BuildingEntity } from "./entities/building.entity";

const SORT_COLUMNS = new Set(["buildingCode", "buildingName", "floorCount", "buildArea", "status", "sortNo", "createTime", "updateTime"]);

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly saasModulesService: SaaSModulesService,
    private readonly usersService: UsersService
  ) {}

  async list(scope: TenantParkScope, query: BuildingQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<BuildingEntity>> {
    const { targetScope, targetActor } = await this.resolveTargetAccess(scope, actor, query.parkId, SYSTEM_PERMISSIONS.BUILDING_READ, "Missing target park building read permission");
    const builder = this.scopedBuilder(targetScope);
    await this.applyBuildingDataScope(builder, targetActor);

    if (query.status !== undefined) {
      builder.andWhere("building.status = :status", { status: query.status });
    }

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("building.building_code ILIKE :keyword", { keyword }).orWhere("building.building_name ILIKE :keyword", { keyword });
        })
      );
    }

    this.applySort(builder, query.sort);

    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();

    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal, parkId?: string): Promise<BuildingEntity> {
    const { targetScope, targetActor } = await this.resolveTargetAccess(scope, actor, parkId, SYSTEM_PERMISSIONS.BUILDING_READ, "Missing target park building read permission");
    return this.findScopedBuilding(targetScope, id, targetActor);
  }

  private async findScopedBuilding(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<BuildingEntity> {
    const builder = this.scopedBuilder(scope).andWhere("building.id = :id", { id });
    await this.applyBuildingDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Building not found");
    }
    return entity;
  }

  async create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateBuildingDto,
    onTargetScope?: (scope: TenantParkScope) => void
  ): Promise<BuildingEntity> {
    const { targetScope } = await this.resolveTargetAccess(scope, actor, dto.parkId, SYSTEM_PERMISSIONS.BUILDING_CREATE, "Missing target park building create permission");
    onTargetScope?.(targetScope);
    const buildingCode = await this.resolveBuildingCode(targetScope, actor.sub, dto.buildingCode);
    await this.assertBuildingCodeAvailable(targetScope, buildingCode);
    const entity = this.buildingsRepository.create({
      tenantId: targetScope.tenantId,
      parkId: targetScope.parkId,
      buildingCode,
      buildingName: dto.buildingName.trim(),
      floorCount: dto.floorCount ?? 0,
      buildArea: this.numberToDecimal(dto.buildArea),
      status: dto.status ?? 1,
      sortNo: dto.sortNo ?? 0,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    try {
      return await this.buildingsRepository.save(entity);
    } catch (error) {
      const databaseError = error as { code?: unknown; driverError?: { code?: unknown; message?: unknown }; message?: unknown };
      const code = databaseError.code ?? databaseError.driverError?.code;
      const message = databaseError.driverError?.message ?? databaseError.message;
      if (code === "23503" && typeof message === "string" && message.includes("building requires an active park scope")) {
        throw new ConflictException("Selected park is no longer active");
      }
      throw error;
    }
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateBuildingDto,
    onTargetScope?: (scope: TenantParkScope) => void
  ): Promise<BuildingEntity> {
    const { targetScope, targetActor } = await this.resolveTargetAccess(scope, actor, dto.parkId, SYSTEM_PERMISSIONS.BUILDING_UPDATE, "Missing target park building update permission");
    onTargetScope?.(targetScope);
    const entity = await this.findScopedBuilding(targetScope, id, targetActor);
    const nextCode = dto.buildingCode?.trim();
    if (nextCode && nextCode !== entity.buildingCode) {
      await this.assertBuildingCodeAvailable(targetScope, nextCode, id);
      entity.buildingCode = nextCode;
    }

    if (dto.buildingName !== undefined) entity.buildingName = dto.buildingName.trim();
    if (dto.floorCount !== undefined) entity.floorCount = dto.floorCount;
    if (dto.buildArea !== undefined) entity.buildArea = this.numberToDecimal(dto.buildArea);
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.sortNo !== undefined) entity.sortNo = dto.sortNo;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;

    return this.buildingsRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string, parkId?: string, onTargetScope?: (scope: TenantParkScope) => void): Promise<{ id: string }> {
    const { targetScope, targetActor } = await this.resolveTargetAccess(scope, actor, parkId, SYSTEM_PERMISSIONS.BUILDING_DELETE, "Missing target park building delete permission");
    onTargetScope?.(targetScope);
    const entity = await this.findScopedBuilding(targetScope, id, targetActor);
    if (await this.hasUndeletedFloors(targetScope, id)) {
      throw new BadRequestException("该楼栋下仍有未删除楼层，无法删除");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.buildingsRepository.save(entity);
    return { id };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<BuildingEntity> {
    return this.buildingsRepository
      .createQueryBuilder("building")
      .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("building.is_deleted = false");
  }

  private async applyBuildingDataScope(builder: SelectQueryBuilder<BuildingEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, buildingFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building")
    ]);
    if (!parkFilter.unrestricted) {
      if (parkFilter.allowed_ids.length === 0) {
        builder.andWhere("1 = 0");
      } else {
        builder.andWhere("building.park_id IN (:...buildingParkScopeIds)", { buildingParkScopeIds: parkFilter.allowed_ids });
      }
    }
    if (!buildingFilter.unrestricted) {
      if (buildingFilter.allowed_ids.length === 0) {
        builder.andWhere("1 = 0");
      } else {
        builder.andWhere("building.id IN (:...buildingDataScopeIds)", { buildingDataScopeIds: buildingFilter.allowed_ids });
      }
    }
  }

  private applySort(builder: SelectQueryBuilder<BuildingEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("building.sortNo", "ASC").addOrderBy("building.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("building.sortNo", "ASC").addOrderBy("building.createTime", "DESC");
      return;
    }
    builder.orderBy(`building.${field}`, direction);
  }

  private async assertBuildingCodeAvailable(scope: TenantParkScope, buildingCode: string, excludeId?: string): Promise<void> {
    const builder = this.buildingsRepository
      .createQueryBuilder("building")
      .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("building.building_code = :buildingCode", { buildingCode })
      .andWhere("building.is_deleted = false");
    if (excludeId) {
      builder.andWhere("building.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Building code already exists");
    }
  }

  private async resolveBuildingCode(scope: TenantParkScope, actorId: string, buildingCode?: string): Promise<string> {
    const providedCode = buildingCode?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateCode("building", scope.tenantId, scope.parkId, actorId);
    return generated.code;
  }

  private async resolveTargetAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal | undefined,
    requestedParkId: string | undefined,
    permission: string,
    forbiddenMessage: string
  ): Promise<{ targetScope: TenantParkScope; targetActor?: JwtPrincipal }> {
    const targetParkId = requestedParkId?.trim();
    if (!targetParkId || targetParkId === scope.parkId) {
      return { targetScope: scope, targetActor: actor };
    }
    if (!actor) {
      throw new ForbiddenException(forbiddenMessage);
    }
    const targetScope = { tenantId: scope.tenantId, parkId: targetParkId };
    const targetActor = await this.usersService.resolveJwtPrincipal(targetScope, actor.sub);
    await this.assertTargetModuleEnabled(targetScope);
    if (!this.hasPermission(targetActor, permission)) {
      throw new ForbiddenException(forbiddenMessage);
    }
    return { targetScope, targetActor };
  }

  private async assertTargetModuleEnabled(scope: TenantParkScope): Promise<void> {
    const modules = await this.saasModulesService.listEnabledModulesForTenant(scope.tenantId, scope.parkId);
    if (!modules.some((module) => module.module_code === "asset")) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private async hasUndeletedFloors(scope: TenantParkScope, buildingId: string): Promise<boolean> {
    return this.floorsRepository
      .createQueryBuilder("floor")
      .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("floor.building_id = :buildingId", { buildingId })
      .andWhere("floor.is_deleted = false")
      .getExists();
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string {
    return String(value ?? 0);
  }

}
