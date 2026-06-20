import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { UnitQueryDto } from "./dto/unit-query.dto";
import type { UnitStatusLogQueryDto } from "./dto/unit-status-log-query.dto";
import { UnitEntity } from "./entities/unit.entity";
import { UnitStatusLogEntity } from "./entities/unit-status-log.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const SORT_COLUMNS = new Set([
  "unitCode",
  "unitName",
  "usageType",
  "unitArea",
  "useArea",
  "rentalStatus",
  "fittingStatus",
  "refPrice",
  "availableDate",
  "status",
  "createTime",
  "updateTime"
]);

type UnitFilterQuery = Pick<UnitQueryDto, "building_id" | "floor_id" | "usage_type" | "rental_status" | "fitting_status" | "keyword" | "min_area" | "max_area">;

@Injectable()
export class UnitsQueryService {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(UnitStatusLogEntity)
    private readonly statusLogRepository: Repository<UnitStatusLogEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: UnitQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<UnitEntity>> {
    const builder = this.scopedBuilder(scope)
      .leftJoinAndSelect("unit.building", "building")
      .leftJoinAndSelect("unit.floor", "floor");
    await this.applyUnitDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applyListSort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "unit", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal) {
    const entity = await this.findDetail(scope, id, actor);
    const [secured, tenantInfo] = await Promise.all([
      this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "unit", entity),
      this.queryCurrentTenantForUnit(scope, id)
    ]);
    return {
      ...secured,
      currentTenantId: tenantInfo?.current_tenant_id ?? null,
      currentTenantName: tenantInfo?.current_tenant_name ?? null,
      currentContractId: tenantInfo?.current_contract_id ?? null,
      currentContractCode: tenantInfo?.current_contract_code ?? null,
      currentContractStatus: tenantInfo?.current_contract_status ?? null,
      leaseStartDate: tenantInfo?.lease_start_date ?? null,
      leaseEndDate: tenantInfo?.lease_end_date ?? null
    };
  }

  private async queryCurrentTenantForUnit(scope: TenantParkScope, unitId: string) {
    const rows = await this.unitsRepository.manager.query(
      `SELECT
         pt.id AS current_tenant_id,
         pt.company_name AS current_tenant_name,
         c.id AS current_contract_id,
         c.contract_code AS current_contract_code,
         c.status AS current_contract_status,
         cu.start_date AS lease_start_date,
         cu.end_date AS lease_end_date
       FROM rel_leasing_contract_unit cu
       INNER JOIN biz_leasing_contract c
         ON c.id = cu.contract_id AND c.is_deleted = false
         AND c.tenant_id = $1 AND c.park_id = $2 AND c.status = '75'
       INNER JOIN biz_park_tenant pt
         ON pt.id = c.park_tenant_id AND pt.is_deleted = false
       WHERE cu.tenant_id = $1 AND cu.park_id = $2
         AND cu.is_deleted = false AND cu.status = 1
         AND cu.unit_id = $3
       ORDER BY cu.start_date DESC
       LIMIT 1`,
      [scope.tenantId, scope.parkId, unitId]
    ) as Array<{
      current_tenant_id: string;
      current_tenant_name: string;
      current_contract_id: string;
      current_contract_code: string;
      current_contract_status: string;
      lease_start_date: string;
      lease_end_date: string;
    }>;
    return rows[0] ?? null;
  }

  async listStatusLogs(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, query: UnitStatusLogQueryDto): Promise<PaginatedResult<UnitStatusLogEntity>> {
    await this.findDetail(scope, unitId, actor);
    const [items, total] = await this.statusLogRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.unit_id = :unitId", { unitId })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async statistics(scope: TenantParkScope, actor?: JwtPrincipal): Promise<{
    totalUnits: number;
    totalArea: number;
    useArea: number;
    vacantUnits: number;
    rentedUnits: number;
    occupancyRate: number;
    byRentalStatus: Array<{ rentalStatus: number; count: number; area: number }>;
    byUsageType: Array<{ usageType: number; count: number; area: number }>;
    byBuilding: Array<{ buildingId: string; buildingCode: string; buildingName: string; count: number; area: number }>;
  }> {
    const base = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    const totalRow = await base
      .select("count(*)::int", "totalUnits")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "totalArea")
      .addSelect("coalesce(sum(unit.use_area), 0)::float", "useArea")
      .addSelect("count(*) filter (where unit.rental_status = 10)::int", "vacantUnits")
      .addSelect("count(*) filter (where unit.rental_status = 30)::int", "rentedUnits")
      .getRawOne<{ totalUnits: number; totalArea: number; useArea: number; vacantUnits: number; rentedUnits: number }>();
    const byRentalStatus = await this.groupStats(scope, "unit.rental_status", "rentalStatus", actor);
    const byUsageType = await this.groupStats(scope, "unit.usage_type", "usageType", actor);
    const byBuildingBuilder = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    const byBuilding = await byBuildingBuilder
      .innerJoin("unit.building", "building")
      .select("unit.building_id", "buildingId")
      .addSelect("building.building_code", "buildingCode")
      .addSelect("building.building_name", "buildingName")
      .addSelect("count(*)::int", "count")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
      .groupBy("unit.building_id")
      .addGroupBy("building.building_code")
      .addGroupBy("building.building_name")
      .orderBy("building.buildingCode", "ASC")
      .getRawMany<{ buildingId: string; buildingCode: string; buildingName: string; count: number; area: number }>();
    const totalUnits = Number(totalRow?.totalUnits ?? 0);
    const rentedUnits = Number(totalRow?.rentedUnits ?? 0);
    return {
      totalUnits,
      totalArea: Number(totalRow?.totalArea ?? 0),
      useArea: Number(totalRow?.useArea ?? 0),
      vacantUnits: Number(totalRow?.vacantUnits ?? 0),
      rentedUnits,
      occupancyRate: totalUnits === 0 ? 0 : Number(((rentedUnits / totalUnits) * 100).toFixed(2)),
      byRentalStatus,
      byUsageType,
      byBuilding
    };
  }

  private async findDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<UnitEntity> {
    const builder = this.scopedBuilder(scope)
      .leftJoinAndSelect("unit.building", "building")
      .leftJoinAndSelect("unit.floor", "floor")
      .leftJoinAndSelect("unit.floorplanFile", "floorplanFile")
      .andWhere("unit.id = :id", { id });
    await this.applyUnitDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Unit not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<UnitEntity>, query: UnitFilterQuery): void {
    if (query.building_id) builder.andWhere("unit.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("unit.floor_id = :floorId", { floorId: query.floor_id });
    if (query.usage_type !== undefined) builder.andWhere("unit.usage_type = :usageType", { usageType: query.usage_type });
    if (query.rental_status !== undefined) builder.andWhere("unit.rental_status = :rentalStatus", { rentalStatus: query.rental_status });
    if (query.fitting_status !== undefined) builder.andWhere("unit.fitting_status = :fittingStatus", { fittingStatus: query.fitting_status });
    if (query.min_area !== undefined) builder.andWhere("unit.unit_area >= :minArea", { minArea: query.min_area });
    if (query.max_area !== undefined) builder.andWhere("unit.unit_area <= :maxArea", { maxArea: query.max_area });
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("unit.unit_code ILIKE :keyword", { keyword }).orWhere("unit.unit_name ILIKE :keyword", { keyword });
          qb.orWhere("unit.code ILIKE :keyword", { keyword });
        })
      );
    }
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<UnitEntity> {
    return this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.is_deleted = false");
  }

  private async applyUnitDataScope(
    builder: SelectQueryBuilder<UnitEntity>,
    _scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<SelectQueryBuilder<UnitEntity>> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return builder;
    }
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit")
    ]);
    const columns = {
      park: "park_id",
      building: "building_id",
      floor: "floor_id",
      unit: "id"
    } as const;
    for (const filter of filters) {
      if (filter.unrestricted) {
        continue;
      }
      const column = columns[filter.dimension as keyof typeof columns];
      if (!column) continue;
      if (filter.allowed_ids.length === 0) {
        builder.andWhere("1 = 0");
        continue;
      }
      const parameterName = `unitDataScope${filter.dimension.replace(/_/g, "")}Ids`;
      builder.andWhere(`unit.${column} IN (:...${parameterName})`, {
        [parameterName]: filter.allowed_ids
      });
    }
    return builder;
  }

  private applyListSort(builder: SelectQueryBuilder<UnitEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("unit.updateTime", "DESC").addOrderBy("unit.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("unit.updateTime", "DESC").addOrderBy("unit.createTime", "DESC");
      return;
    }
    builder.orderBy(`unit.${field}`, direction);
  }

  private async groupStats(scope: TenantParkScope, column: string, alias: "rentalStatus" | "usageType", actor?: JwtPrincipal) {
    const builder = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    return builder
      .select(column, alias)
      .addSelect("count(*)::int", "count")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
      .groupBy(column)
      .orderBy(column, "ASC")
      .getRawMany<Record<typeof alias, number> & { count: number; area: number }>();
  }
}
