import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { Brackets, DataSource, Repository, SelectQueryBuilder } from "typeorm";
import { toDataURL } from "qrcode";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { CreateSafetyInspectPointDto } from "./dto/create-safety-inspect-point.dto";
import { SafetyInspectPointQueryDto } from "./dto/safety-inspect-point-query.dto";
import { UpdateSafetyInspectPointDto } from "./dto/update-safety-inspect-point.dto";
import { SafetyInspectPointEntity } from "./entities/safety-inspect-point.entity";

interface ResolvedLocation {
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  roomLabel: string | null;
}

@Injectable()
export class SafetyInspectPointsService {
  constructor(
    @InjectRepository(SafetyInspectPointEntity)
    private readonly pointsRepository: Repository<SafetyInspectPointEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource
  ) {}

  async list(
    scope: TenantParkScope,
    query: SafetyInspectPointQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyInspectPointEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", "inspect_point", items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyInspectPointEntity> {
    const entity = await this.findOne(scope, id);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_point", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyInspectPointDto): Promise<SafetyInspectPointEntity> {
    this.assertRequired(dto.point_name, "point_name is required");
    this.assertRequired(dto.point_type, "point_type is required");
    this.assertRequired(dto.risk_level, "risk_level is required");
    await this.validateDictionaries(scope, dto.point_type, dto.risk_level, dto.check_method, dto.status ?? "enabled");
    const location = await this.resolveLocation(scope, dto.building_id, dto.floor_id, dto.unit_id);
    await this.assertParkTenant(scope, dto.park_tenant_id);
    const generated = dto.point_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_POINT_CODE");
    const pointCode = dto.point_code ?? generated?.code ?? "";
    await this.assertPointCodeAvailable(scope, pointCode);
    const entity = this.pointsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: pointCode,
      pointCode,
      pointName: dto.point_name,
      pointType: dto.point_type,
      riskLevel: dto.risk_level,
      buildingId: location.buildingId,
      floorId: location.floorId,
      unitId: location.unitId,
      parkTenantId: dto.park_tenant_id ?? null,
      location: dto.location ?? null,
      gpsLng: dto.gps_lng === undefined ? null : String(dto.gps_lng),
      gpsLat: dto.gps_lat === undefined ? null : String(dto.gps_lat),
      qrCode: dto.qr_code ?? pointCode,
      checkMethod: dto.check_method ?? null,
      requiredPhotoCount: dto.required_photo_count ?? 0,
      requiredScan: dto.required_scan ?? false,
      requiredGps: dto.required_gps ?? false,
      status: dto.status ?? "enabled",
      sortNo: dto.sort_no ?? 0,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.pointsRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSafetyInspectPointDto): Promise<SafetyInspectPointEntity> {
    const entity = await this.findOne(scope, id);
    const nextPointCode = dto.point_code ?? entity.pointCode;
    const nextPointType = dto.point_type ?? entity.pointType;
    const nextRiskLevel = dto.risk_level ?? entity.riskLevel;
    const nextCheckMethod = dto.check_method === undefined ? entity.checkMethod ?? undefined : dto.check_method;
    const nextStatus = dto.status ?? entity.status;
    await this.validateDictionaries(scope, nextPointType, nextRiskLevel, nextCheckMethod, nextStatus);
    if (nextPointCode !== entity.pointCode) {
      await this.assertPointCodeAvailable(scope, nextPointCode, entity.id);
    }
    const location = await this.resolveLocation(
      scope,
      dto.building_id === undefined ? entity.buildingId ?? undefined : dto.building_id,
      dto.floor_id === undefined ? entity.floorId ?? undefined : dto.floor_id,
      dto.unit_id === undefined ? entity.unitId ?? undefined : dto.unit_id
    );
    await this.assertParkTenant(scope, dto.park_tenant_id === undefined ? entity.parkTenantId ?? undefined : dto.park_tenant_id);
    const qrCode =
      dto.qr_code !== undefined ? dto.qr_code : entity.qrCode === entity.pointCode && nextPointCode !== entity.pointCode ? nextPointCode : entity.qrCode;
    Object.assign(entity, {
      code: nextPointCode,
      pointCode: nextPointCode,
      pointName: dto.point_name ?? entity.pointName,
      pointType: nextPointType,
      riskLevel: nextRiskLevel,
      buildingId: location.buildingId,
      floorId: location.floorId,
      unitId: location.unitId,
      parkTenantId: dto.park_tenant_id === undefined ? entity.parkTenantId : dto.park_tenant_id ?? null,
      location: dto.location === undefined ? entity.location : dto.location ?? null,
      gpsLng: dto.gps_lng === undefined ? entity.gpsLng : dto.gps_lng === undefined ? null : String(dto.gps_lng),
      gpsLat: dto.gps_lat === undefined ? entity.gpsLat : dto.gps_lat === undefined ? null : String(dto.gps_lat),
      qrCode: qrCode ?? nextPointCode,
      checkMethod: dto.check_method === undefined ? entity.checkMethod : dto.check_method ?? null,
      requiredPhotoCount: dto.required_photo_count ?? entity.requiredPhotoCount,
      requiredScan: dto.required_scan ?? entity.requiredScan,
      requiredGps: dto.required_gps ?? entity.requiredGps,
      status: nextStatus,
      sortNo: dto.sort_no ?? entity.sortNo,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.pointsRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id);
    await this.assertNoUnfinishedTasks(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.pointsRepository.save(entity);
    return { id };
  }

  async qrcode(
    scope: TenantParkScope,
    id: string,
    actor?: JwtPrincipal
  ): Promise<{ id: string; point_code: string; qr_code: string; content: string; data_url: string | null }> {
    const entity = await this.findOne(scope, id);
    await this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_point", entity);
    const content = entity.qrCode ?? entity.pointCode;
    const dataUrl = await toDataURL(content, { margin: 1, width: 240 }).catch(() => null);
    return { id: entity.id, point_code: entity.pointCode, qr_code: content, content, data_url: dataUrl };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyInspectPointEntity> {
    return this.pointsRepository
      .createQueryBuilder("point")
      .leftJoinAndSelect("point.building", "building")
      .leftJoinAndSelect("point.floor", "floor")
      .leftJoinAndSelect("point.unit", "unit")
      .leftJoinAndSelect("point.parkTenant", "parkTenant")
      .where("point.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("point.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("point.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyInspectPointEntity>, query: SafetyInspectPointQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("point.point_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("point.point_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("point.location ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("unit.unit_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("parkTenant.company_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.point_type) builder.andWhere("point.point_type = :pointType", { pointType: query.point_type });
    if (query.risk_level) builder.andWhere("point.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.building_id) builder.andWhere("point.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("point.floor_id = :floorId", { floorId: query.floor_id });
    if (query.unit_id) builder.andWhere("point.unit_id = :unitId", { unitId: query.unit_id });
    if (query.park_tenant_id) builder.andWhere("point.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.status) builder.andWhere("point.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<SafetyInspectPointEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      point_code: "point.pointCode",
      point_name: "point.pointName",
      point_type: "point.pointType",
      risk_level: "point.riskLevel",
      sort_no: "point.sortNo",
      update_time: "point.updateTime",
      create_time: "point.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "point.sortNo", direction as "ASC" | "DESC");
      builder.addOrderBy("point.updateTime", "DESC");
      return;
    }
    builder.orderBy("point.sortNo", "ASC").addOrderBy("point.updateTime", "DESC");
  }

  private async findOne(scope: TenantParkScope, id: string): Promise<SafetyInspectPointEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("point.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Inspect point not found");
    }
    return entity;
  }

  private async validateDictionaries(
    scope: TenantParkScope,
    pointType: string,
    riskLevel: string,
    checkMethod?: string | null,
    status?: string | null
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_inspect_point_type", pointType),
      this.assertDictValue(scope, "safety_risk_level", riskLevel),
      checkMethod ? this.assertDictValue(scope, "safety_check_method", checkMethod) : Promise.resolve(),
      status ? this.assertDictValue(scope, "safety_inspect_point_status", status) : Promise.resolve()
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue: string): Promise<void> {
    const item = await this.dictItemsRepository
      .createQueryBuilder("item")
      .innerJoin("item.dictType", "dictType")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false")
      .andWhere("item.status = :status", { status: "enabled" })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("item.item_value = :itemValue", { itemValue })
      .getOne();
    if (!item) {
      throw new BadRequestException(`${dictCode} value is invalid`);
    }
  }

  private async resolveLocation(
    scope: TenantParkScope,
    buildingId?: string | null,
    floorId?: string | null,
    unitId?: string | null
  ): Promise<ResolvedLocation> {
    let resolvedBuildingId = buildingId ?? null;
    let resolvedFloorId = floorId ?? null;
    let roomLabel: string | null = null;
    if (unitId) {
      const unit = await this.unitsRepository.findOne({
        where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!unit) throw new BadRequestException("unit_id does not belong to current park");
      resolvedBuildingId = unit.buildingId ?? resolvedBuildingId;
      resolvedFloorId = unit.floorId ?? resolvedFloorId;
      roomLabel = unit.unitName ?? unit.unitCode ?? null;
    }
    if (resolvedBuildingId) {
      const building = await this.buildingsRepository.findOne({
        where: { id: resolvedBuildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!building) throw new BadRequestException("building_id does not belong to current park");
    }
    if (resolvedFloorId) {
      const floor = await this.floorsRepository.findOne({
        where: { id: resolvedFloorId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!floor) throw new BadRequestException("floor_id does not belong to current park");
      if (resolvedBuildingId && floor.buildingId !== resolvedBuildingId) {
        throw new BadRequestException("floor_id does not belong to building_id");
      }
      resolvedBuildingId = floor.buildingId ?? resolvedBuildingId;
    }
    return { buildingId: resolvedBuildingId, floorId: resolvedFloorId, unitId: unitId ?? null, roomLabel };
  }

  private async assertParkTenant(scope: TenantParkScope, parkTenantId?: string | null): Promise<void> {
    if (!parkTenantId) return;
    const tenant = await this.parkTenantsRepository.findOne({
      where: { id: parkTenantId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!tenant) {
      throw new BadRequestException("park_tenant_id does not belong to current park");
    }
  }

  private async assertPointCodeAvailable(scope: TenantParkScope, pointCode: string, ignoreId?: string): Promise<void> {
    const builder = this.pointsRepository
      .createQueryBuilder("point")
      .where("point.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("point.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("point.point_code = :pointCode", { pointCode })
      .andWhere("point.is_deleted = false");
    if (ignoreId) {
      builder.andWhere("point.id <> :ignoreId", { ignoreId });
    }
    const count = await builder.getCount();
    if (count > 0) {
      throw new ConflictException("Inspect point code already exists");
    }
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
  }

  private async assertNoUnfinishedTasks(scope: TenantParkScope, pointId: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    try {
      const hasTaskTable = await runner.hasTable("biz_safety_inspect_task");
      if (!hasTaskTable || !(await runner.hasColumn("biz_safety_inspect_task", "point_id"))) {
        return;
      }
    } finally {
      await runner.release();
    }
    const row = await this.dataSource
      .createQueryBuilder()
      .select("COUNT(1)", "count")
      .from("biz_safety_inspect_task", "task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.point_id = :pointId", { pointId })
      .andWhere("task.is_deleted = false")
      .andWhere("task.status NOT IN (:...doneStatuses)", {
        doneStatuses: ["60", "70", "90", "100", "completed", "closed", "cancelled"]
      })
      .getRawOne<{ count: string }>();
    if (Number(row?.count ?? 0) > 0) {
      throw new BadRequestException("Inspect point has unfinished inspection tasks and cannot be deleted");
    }
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyInspectPointEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "point", "park_id", parkFilter, "safetyPointParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "building_id", buildingFilter, "safetyPointBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "floor_id", floorFilter, "safetyPointFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "unit_id", unitFilter, "safetyPointUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "park_tenant_id", tenantCompanyFilter, "safetyPointTenantScopeIds");
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyInspectPointEntity>,
    alias: string,
    column: string,
    filter: DataScopeFilter,
    parameterName: string
  ): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(`${alias}.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
      return;
    }
    if (filter.scope_types.includes("custom")) {
      builder.andWhere("1 = 0");
    }
  }
}
