import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { FindOptionsRelations, FindOptionsWhere, ObjectLiteral, Repository } from "typeorm";
import { ILike } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService, type DataScopeColumnMapping } from "../data-scopes/data-scope.service";
import type { DataScopeDimension } from "../data-scopes/entities/data-scope-rule.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { AssetQueryDto } from "./dto/asset-query.dto";
import type { CreateAssetBuildingDto } from "./dto/create-asset-building.dto";
import type { CreateAssetFloorDto } from "./dto/create-asset-floor.dto";
import type { CreateAssetParkDto } from "./dto/create-asset-park.dto";
import type { CreateAssetUnitDto } from "./dto/create-asset-unit.dto";
import type { UpdateAssetBuildingDto } from "./dto/update-asset-building.dto";
import type { UpdateAssetFloorDto } from "./dto/update-asset-floor.dto";
import type { UpdateAssetParkDto } from "./dto/update-asset-park.dto";
import type { UpdateAssetUnitDto } from "./dto/update-asset-unit.dto";
import { AssetBuildingEntity } from "./entities/asset-building.entity";
import { AssetFloorEntity } from "./entities/asset-floor.entity";
import { AssetParkEntity } from "./entities/asset-park.entity";
import { AssetUnitEntity } from "./entities/asset-unit.entity";

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(AssetParkEntity)
    private readonly parksRepository: Repository<AssetParkEntity>,
    @InjectRepository(AssetBuildingEntity)
    private readonly buildingsRepository: Repository<AssetBuildingEntity>,
    @InjectRepository(AssetFloorEntity)
    private readonly floorsRepository: Repository<AssetFloorEntity>,
    @InjectRepository(AssetUnitEntity)
    private readonly unitsRepository: Repository<AssetUnitEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async listParks(scope: TenantParkScope, query: AssetQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<AssetParkEntity>> {
    const baseWhere = await this.dataScopeService.buildFindWhere<AssetParkEntity>(scope, actor, "park", this.baseWhere<AssetParkEntity>(scope, query.status), {
      park: "parkId"
    });
    const where = query.keyword
      ? [
          { ...baseWhere, parkCode: ILike(`%${query.keyword}%`) },
          { ...baseWhere, parkName: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.parksRepository.findAndCount({
      where,
      order: { sortOrder: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "park", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async createPark(scope: TenantParkScope, actorId: string, dto: CreateAssetParkDto): Promise<AssetParkEntity> {
    await this.assertCodeAvailable(this.parksRepository, scope, "parkCode", dto.parkCode, "Park code already exists");
    return this.parksRepository.save(
      this.parksRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        parkCode: dto.parkCode,
        parkName: dto.parkName,
        address: dto.address ?? null,
        totalArea: this.toDecimal(dto.totalArea),
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detailPark(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<AssetParkEntity> {
    const entity = await this.mustFind(this.parksRepository, scope, id, "Park not found", undefined, actor, "park", { park: "parkId" });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "park", entity);
  }

  async updatePark(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateAssetParkDto): Promise<AssetParkEntity> {
    const entity = await this.mustFind(this.parksRepository, scope, id, "Park not found", undefined, actor, "park", { park: "parkId" });
    if (dto.parkCode && dto.parkCode !== entity.parkCode) {
      await this.assertCodeAvailable(this.parksRepository, scope, "parkCode", dto.parkCode, "Park code already exists");
    }
    Object.assign(entity, {
      parkCode: dto.parkCode ?? entity.parkCode,
      parkName: dto.parkName ?? entity.parkName,
      address: dto.address ?? entity.address,
      totalArea: dto.totalArea === undefined ? entity.totalArea : this.toDecimal(dto.totalArea),
      sortOrder: dto.sortOrder ?? entity.sortOrder,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actor.sub
    });
    return this.parksRepository.save(entity);
  }

  async deletePark(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.mustFind(this.parksRepository, scope, id, "Park not found", undefined, actor, "park", { park: "parkId" });
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.parksRepository.save(entity);
    return { id };
  }

  async listBuildings(scope: TenantParkScope, query: AssetQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<AssetBuildingEntity>> {
    const baseWhere = await this.dataScopeService.buildFindWhere<AssetBuildingEntity>(
      scope,
      actor,
      "building",
      {
        ...this.baseWhere<AssetBuildingEntity>(scope, query.status),
        ...(query.asset_park_id ? { assetParkId: query.asset_park_id } : {})
      },
      { building: "id" }
    );
    const where = query.keyword
      ? [
          { ...baseWhere, buildingCode: ILike(`%${query.keyword}%`) },
          { ...baseWhere, buildingName: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.buildingsRepository.findAndCount({
      where,
      relations: { assetPark: true },
      order: { sortOrder: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "building", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async createBuilding(scope: TenantParkScope, actorId: string, dto: CreateAssetBuildingDto): Promise<AssetBuildingEntity> {
    await this.detailPark(scope, dto.assetParkId);
    await this.assertCodeAvailable(this.buildingsRepository, scope, "buildingCode", dto.buildingCode, "Building code already exists");
    return this.buildingsRepository.save(
      this.buildingsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        assetParkId: dto.assetParkId,
        buildingCode: dto.buildingCode,
        buildingName: dto.buildingName,
        floorCount: dto.floorCount ?? 0,
        totalArea: this.toDecimal(dto.totalArea),
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detailBuilding(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<AssetBuildingEntity> {
    const entity = await this.mustFind(this.buildingsRepository, scope, id, "Building not found", { assetPark: true }, actor, "building", { building: "id" });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "building", entity);
  }

  async updateBuilding(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateAssetBuildingDto): Promise<AssetBuildingEntity> {
    const entity = await this.mustFind(this.buildingsRepository, scope, id, "Building not found", { assetPark: true }, actor, "building", { building: "id" });
    if (dto.assetParkId) {
      await this.detailPark(scope, dto.assetParkId, actor);
    }
    if (dto.buildingCode && dto.buildingCode !== entity.buildingCode) {
      await this.assertCodeAvailable(this.buildingsRepository, scope, "buildingCode", dto.buildingCode, "Building code already exists");
    }
    Object.assign(entity, {
      assetParkId: dto.assetParkId ?? entity.assetParkId,
      buildingCode: dto.buildingCode ?? entity.buildingCode,
      buildingName: dto.buildingName ?? entity.buildingName,
      floorCount: dto.floorCount ?? entity.floorCount,
      totalArea: dto.totalArea === undefined ? entity.totalArea : this.toDecimal(dto.totalArea),
      sortOrder: dto.sortOrder ?? entity.sortOrder,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actor.sub
    });
    return this.buildingsRepository.save(entity);
  }

  async deleteBuilding(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.mustFind(this.buildingsRepository, scope, id, "Building not found", undefined, actor, "building", { building: "id" });
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.buildingsRepository.save(entity);
    return { id };
  }

  async listFloors(scope: TenantParkScope, query: AssetQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<AssetFloorEntity>> {
    const baseWhere = await this.dataScopeService.buildFindWhere<AssetFloorEntity>(
      scope,
      actor,
      "floor",
      {
        ...this.baseWhere<AssetFloorEntity>(scope, query.status),
        ...(query.asset_park_id ? { assetParkId: query.asset_park_id } : {}),
        ...(query.building_id ? { buildingId: query.building_id } : {})
      },
      { floor: "id", building: "buildingId" }
    );
    const where = query.keyword
      ? [
          { ...baseWhere, floorCode: ILike(`%${query.keyword}%`) },
          { ...baseWhere, floorName: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.floorsRepository.findAndCount({
      where,
      relations: { assetPark: true, building: true },
      order: { sortOrder: "ASC", floorNo: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "floor", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async createFloor(scope: TenantParkScope, actorId: string, dto: CreateAssetFloorDto): Promise<AssetFloorEntity> {
    const building = await this.detailBuilding(scope, dto.buildingId);
    await this.assertCodeAvailable(this.floorsRepository, scope, "floorCode", dto.floorCode, "Floor code already exists");
    return this.floorsRepository.save(
      this.floorsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        assetParkId: building.assetParkId,
        buildingId: dto.buildingId,
        floorCode: dto.floorCode,
        floorName: dto.floorName,
        floorNo: dto.floorNo,
        grossArea: this.toDecimal(dto.grossArea),
        rentableArea: this.toDecimal(dto.rentableArea),
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detailFloor(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<AssetFloorEntity> {
    const entity = await this.mustFind(this.floorsRepository, scope, id, "Floor not found", { assetPark: true, building: true }, actor, "floor", { floor: "id", building: "buildingId" });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "floor", entity);
  }

  async updateFloor(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateAssetFloorDto): Promise<AssetFloorEntity> {
    const entity = await this.mustFind(this.floorsRepository, scope, id, "Floor not found", { assetPark: true, building: true }, actor, "floor", { floor: "id", building: "buildingId" });
    const building = dto.buildingId ? await this.detailBuilding(scope, dto.buildingId, actor) : null;
    if (dto.floorCode && dto.floorCode !== entity.floorCode) {
      await this.assertCodeAvailable(this.floorsRepository, scope, "floorCode", dto.floorCode, "Floor code already exists");
    }
    Object.assign(entity, {
      assetParkId: building?.assetParkId ?? entity.assetParkId,
      buildingId: dto.buildingId ?? entity.buildingId,
      floorCode: dto.floorCode ?? entity.floorCode,
      floorName: dto.floorName ?? entity.floorName,
      floorNo: dto.floorNo ?? entity.floorNo,
      grossArea: dto.grossArea === undefined ? entity.grossArea : this.toDecimal(dto.grossArea),
      rentableArea: dto.rentableArea === undefined ? entity.rentableArea : this.toDecimal(dto.rentableArea),
      sortOrder: dto.sortOrder ?? entity.sortOrder,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actor.sub
    });
    return this.floorsRepository.save(entity);
  }

  async deleteFloor(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.mustFind(this.floorsRepository, scope, id, "Floor not found", undefined, actor, "floor", { floor: "id", building: "buildingId" });
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.floorsRepository.save(entity);
    return { id };
  }

  async listUnits(scope: TenantParkScope, query: AssetQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<AssetUnitEntity>> {
    const baseWhere = await this.dataScopeService.buildFindWhere<AssetUnitEntity>(
      scope,
      actor,
      "unit",
      {
        ...this.baseWhere<AssetUnitEntity>(scope, query.status),
        ...(query.asset_park_id ? { assetParkId: query.asset_park_id } : {}),
        ...(query.building_id ? { buildingId: query.building_id } : {}),
        ...(query.floor_id ? { floorId: query.floor_id } : {})
      },
      { unit: "id", building: "buildingId", floor: "floorId" }
    );
    const where = query.keyword
      ? [
          { ...baseWhere, unitCode: ILike(`%${query.keyword}%`) },
          { ...baseWhere, unitName: ILike(`%${query.keyword}%`) },
          { ...baseWhere, unitNo: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.unitsRepository.findAndCount({
      where,
      relations: { assetPark: true, building: true, floor: true },
      order: { unitNo: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "unit", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async createUnit(scope: TenantParkScope, actorId: string, dto: CreateAssetUnitDto): Promise<AssetUnitEntity> {
    const floor = await this.detailFloor(scope, dto.floorId);
    await this.assertCodeAvailable(this.unitsRepository, scope, "unitCode", dto.unitCode, "Unit code already exists");
    return this.unitsRepository.save(
      this.unitsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        assetParkId: floor.assetParkId,
        buildingId: floor.buildingId,
        floorId: dto.floorId,
        unitCode: dto.unitCode,
        unitName: dto.unitName,
        unitNo: dto.unitNo,
        usageType: dto.usageType ?? "office",
        buildingArea: this.toDecimal(dto.buildingArea),
        rentableArea: this.toDecimal(dto.rentableArea),
        orientation: dto.orientation ?? null,
        leaseStatus: dto.leaseStatus ?? "vacant",
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detailUnit(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<AssetUnitEntity> {
    const entity = await this.mustFind(this.unitsRepository, scope, id, "Unit not found", { assetPark: true, building: true, floor: true }, actor, "unit", { unit: "id", building: "buildingId", floor: "floorId" });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "unit", entity);
  }

  async updateUnit(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateAssetUnitDto): Promise<AssetUnitEntity> {
    const entity = await this.mustFind(this.unitsRepository, scope, id, "Unit not found", { assetPark: true, building: true, floor: true }, actor, "unit", { unit: "id", building: "buildingId", floor: "floorId" });
    const floor = dto.floorId ? await this.detailFloor(scope, dto.floorId, actor) : null;
    if (dto.unitCode && dto.unitCode !== entity.unitCode) {
      await this.assertCodeAvailable(this.unitsRepository, scope, "unitCode", dto.unitCode, "Unit code already exists");
    }
    Object.assign(entity, {
      assetParkId: floor?.assetParkId ?? entity.assetParkId,
      buildingId: floor?.buildingId ?? entity.buildingId,
      floorId: dto.floorId ?? entity.floorId,
      unitCode: dto.unitCode ?? entity.unitCode,
      unitName: dto.unitName ?? entity.unitName,
      unitNo: dto.unitNo ?? entity.unitNo,
      usageType: dto.usageType ?? entity.usageType,
      buildingArea: dto.buildingArea === undefined ? entity.buildingArea : this.toDecimal(dto.buildingArea),
      rentableArea: dto.rentableArea === undefined ? entity.rentableArea : this.toDecimal(dto.rentableArea),
      orientation: dto.orientation ?? entity.orientation,
      leaseStatus: dto.leaseStatus ?? entity.leaseStatus,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actor.sub
    });
    return this.unitsRepository.save(entity);
  }

  async deleteUnit(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.mustFind(this.unitsRepository, scope, id, "Unit not found", undefined, actor, "unit", { unit: "id", building: "buildingId", floor: "floorId" });
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.unitsRepository.save(entity);
    return { id };
  }

  private baseWhere<T>(scope: TenantParkScope, status?: string): FindOptionsWhere<T> {
    return {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      ...(status ? { status } : {})
    } as FindOptionsWhere<T>;
  }

  private async mustFind<T extends ObjectLiteral & { id: string }>(
    repository: Repository<T>,
    scope: TenantParkScope,
    id: string,
    message: string,
    relations?: FindOptionsRelations<T>,
    actor?: JwtPrincipal,
    dimension?: DataScopeDimension,
    mapping: DataScopeColumnMapping = {}
  ): Promise<T> {
    const baseWhere = {
      id,
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false
    } as unknown as FindOptionsWhere<T>;
    const where = dimension
      ? await this.dataScopeService.buildFindWhere<T>(scope, actor, dimension, baseWhere, mapping)
      : baseWhere;
    const entity = await repository.findOne({
      where,
      relations
    });
    if (!entity) {
      throw new NotFoundException(message);
    }
    return entity;
  }

  private async assertCodeAvailable<T extends ObjectLiteral>(
    repository: Repository<T>,
    scope: TenantParkScope,
    property: keyof T,
    code: string,
    message: string
  ): Promise<void> {
    const exists = await repository.exists({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        [property]: code
      } as unknown as FindOptionsWhere<T>
    });
    if (exists) {
      throw new ConflictException(message);
    }
  }

  private toDecimal(value: number | undefined): string {
    return String(value ?? 0);
  }
}
