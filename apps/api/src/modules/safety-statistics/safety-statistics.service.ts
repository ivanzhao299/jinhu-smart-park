import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { Brackets } from "typeorm";
import type { ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import type { SafetyStatisticsQueryDto } from "./dto/safety-statistics-query.dto";

const TASK_STATUS_DONE = "30";
const HAZARD_CLOSED_STATUSES = new Set(["60", "90"]);
const MAJOR_HAZARD_RISK_LEVELS = new Set(["major", "30"]);
const HIGH_RISK_TENANT_LEVELS = new Set(["40", "high"]);

export interface SafetyStatsSummary {
  inspect_task_total: number;
  inspect_task_done: number;
  inspect_completion_rate: number;
  hazard_total: number;
  hazard_open_count: number;
  hazard_closed_count: number;
  hazard_close_rate: number;
  overdue_hazard_count: number;
  major_hazard_count: number;
  high_risk_tenant_count: number;
}

export interface SafetyStatsBucket {
  key: string;
  count: number;
  open_count: number;
  closed_count: number;
}

export interface SafetyBuildingStats {
  building_id: string | null;
  building_code: string;
  building_name: string;
  count: number;
  open_count: number;
  overdue_count: number;
  major_count: number;
}

export interface SafetyHazardStatsItem {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  status: string;
  overdue_flag: boolean;
  building_id: string | null;
  building_name: string;
  location: string;
  rectify_deadline: Date | null;
  overdue_days: number;
  create_time: Date;
}

export interface SafetyStatisticsResult {
  summary: SafetyStatsSummary;
  by_hazard_type: SafetyStatsBucket[];
  by_risk_level: SafetyStatsBucket[];
  by_building: SafetyBuildingStats[];
  overdue_top: SafetyHazardStatsItem[];
  recent_major_hazards: SafetyHazardStatsItem[];
}

@Injectable()
export class SafetyStatisticsService {
  constructor(
    @InjectRepository(SafetyInspectTaskEntity)
    private readonly tasksRepository: Repository<SafetyInspectTaskEntity>,
    @InjectRepository(SafetyHazardEntity)
    private readonly hazardsRepository: Repository<SafetyHazardEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    private readonly dataScopeService: DataScopeService
  ) {}

  async statistics(scope: TenantParkScope, actor: JwtPrincipal, query: SafetyStatisticsQueryDto): Promise<SafetyStatisticsResult> {
    const [tasks, hazards, highRiskTenantCount] = await Promise.all([
      this.loadTasks(scope, actor, query),
      this.loadHazards(scope, actor, query),
      this.countHighRiskTenants(scope, actor)
    ]);

    const inspectTaskTotal = tasks.length;
    const inspectTaskDone = tasks.filter((task) => task.status === TASK_STATUS_DONE).length;
    const hazardClosedCount = hazards.filter((hazard) => this.isClosedHazard(hazard)).length;
    const overdueHazards = hazards.filter((hazard) => this.isOverdueHazard(hazard));
    const majorHazards = hazards.filter((hazard) => this.isMajorHazard(hazard));

    return {
      summary: {
        inspect_task_total: inspectTaskTotal,
        inspect_task_done: inspectTaskDone,
        inspect_completion_rate: this.ratio(inspectTaskDone, inspectTaskTotal),
        hazard_total: hazards.length,
        hazard_open_count: hazards.length - hazardClosedCount,
        hazard_closed_count: hazardClosedCount,
        hazard_close_rate: this.ratio(hazardClosedCount, hazards.length),
        overdue_hazard_count: overdueHazards.length,
        major_hazard_count: majorHazards.length,
        high_risk_tenant_count: highRiskTenantCount
      },
      by_hazard_type: this.groupHazards(hazards, (hazard) => hazard.hazardType ?? "-"),
      by_risk_level: this.groupHazards(hazards, (hazard) => hazard.riskLevel ?? "-"),
      by_building: this.groupHazardsByBuilding(hazards),
      overdue_top: overdueHazards
        .map((hazard) => this.toHazardItem(hazard))
        .sort((left, right) => right.overdue_days - left.overdue_days || right.create_time.getTime() - left.create_time.getTime())
        .slice(0, 10),
      recent_major_hazards: majorHazards
        .map((hazard) => this.toHazardItem(hazard))
        .sort((left, right) => right.create_time.getTime() - left.create_time.getTime())
        .slice(0, 10)
    };
  }

  private async loadTasks(scope: TenantParkScope, actor: JwtPrincipal, query: SafetyStatisticsQueryDto): Promise<SafetyInspectTaskEntity[]> {
    const builder = this.tasksRepository
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.point", "point")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    await this.applyTaskDataScope(builder, actor);
    this.applyTaskQuery(builder, query);
    return builder.getMany();
  }

  private async loadHazards(scope: TenantParkScope, actor: JwtPrincipal, query: SafetyStatisticsQueryDto): Promise<SafetyHazardEntity[]> {
    const builder = this.hazardsRepository
      .createQueryBuilder("hazard")
      .leftJoinAndSelect("hazard.building", "building")
      .leftJoinAndSelect("hazard.parkTenant", "parkTenant")
      .where("hazard.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("hazard.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("hazard.is_deleted = false");
    await this.applyHazardDataScope(builder, actor);
    this.applyHazardQuery(builder, query);
    return builder.getMany();
  }

  private async countHighRiskTenants(scope: TenantParkScope, actor: JwtPrincipal): Promise<number> {
    const builder = this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.is_deleted = false")
      .andWhere("parkTenant.risk_level IN (:...riskLevels)", { riskLevels: [...HIGH_RISK_TENANT_LEVELS] });
    await this.applyTenantCompanyDataScope(builder, actor);
    if (this.isSelfScope(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_HAZARD_MANAGE_ALL)) {
      builder.andWhere("1 = 0");
    }
    return builder.getCount();
  }

  private applyTaskQuery(builder: SelectQueryBuilder<SafetyInspectTaskEntity>, query: SafetyStatisticsQueryDto): void {
    const start = this.parseStartDate(query.start_date);
    const end = this.parseEndDate(query.end_date);
    if (start) builder.andWhere("task.plan_time >= :taskStartDate", { taskStartDate: start });
    if (end) builder.andWhere("task.plan_time <= :taskEndDate", { taskEndDate: end });
    if (query.building_id) builder.andWhere("point.building_id = :taskBuildingId", { taskBuildingId: query.building_id });
    if (query.handler_id) builder.andWhere("task.handler_id = :taskHandlerId", { taskHandlerId: query.handler_id });
  }

  private applyHazardQuery(builder: SelectQueryBuilder<SafetyHazardEntity>, query: SafetyStatisticsQueryDto): void {
    const start = this.parseStartDate(query.start_date);
    const end = this.parseEndDate(query.end_date);
    if (start) builder.andWhere("hazard.create_time >= :hazardStartDate", { hazardStartDate: start });
    if (end) builder.andWhere("hazard.create_time <= :hazardEndDate", { hazardEndDate: end });
    if (query.building_id) builder.andWhere("hazard.building_id = :hazardBuildingId", { hazardBuildingId: query.building_id });
    if (query.risk_level) builder.andWhere("hazard.risk_level = :hazardRiskLevel", { hazardRiskLevel: query.risk_level });
    if (query.hazard_type) builder.andWhere("hazard.hazard_type = :hazardType", { hazardType: query.hazard_type });
    if (query.handler_id) builder.andWhere("hazard.rectify_user_id = :hazardHandlerId", { hazardHandlerId: query.handler_id });
  }

  private async applyTaskDataScope(builder: SelectQueryBuilder<SafetyInspectTaskEntity>, actor: JwtPrincipal): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "task", "park_id", parkFilter, "safetyStatsTaskParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "building_id", buildingFilter, "safetyStatsTaskBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "floor_id", floorFilter, "safetyStatsTaskFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "unit_id", unitFilter, "safetyStatsTaskUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "park_tenant_id", tenantCompanyFilter, "safetyStatsTaskTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "task", "handler_id", handlerFilter, "safetyStatsTaskHandlerScopeIds");
    if (this.isSelfScope(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MANAGE_ALL)) {
      builder.andWhere("task.handler_id = :currentSafetyTaskHandlerId", { currentSafetyTaskHandlerId: actor.sub });
    }
  }

  private async applyHazardDataScope(builder: SelectQueryBuilder<SafetyHazardEntity>, actor: JwtPrincipal): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "hazard", "park_id", parkFilter, "safetyStatsHazardParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "building_id", buildingFilter, "safetyStatsHazardBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "floor_id", floorFilter, "safetyStatsHazardFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "unit_id", unitFilter, "safetyStatsHazardUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "park_tenant_id", tenantCompanyFilter, "safetyStatsHazardTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "rectify_user_id", handlerFilter, "safetyStatsHazardHandlerScopeIds");
    if (this.isSelfScope(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_HAZARD_MANAGE_ALL)) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("hazard.create_by = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub })
            .orWhere("hazard.rectify_user_id = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub })
            .orWhere("hazard.recheck_user_id = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub });
        })
      );
    }
  }

  private async applyTenantCompanyDataScope(builder: SelectQueryBuilder<ParkTenantEntity>, actor: JwtPrincipal): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, tenantCompanyFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "parkTenant", "park_id", parkFilter, "safetyStatsTenantParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "parkTenant", "id", tenantCompanyFilter, "safetyStatsTenantCompanyScopeIds");
  }

  private applyConfiguredIdScopeFilter<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
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

  private groupHazards(hazards: SafetyHazardEntity[], keyGetter: (hazard: SafetyHazardEntity) => string): SafetyStatsBucket[] {
    const grouped = new Map<string, SafetyStatsBucket>();
    for (const hazard of hazards) {
      const key = keyGetter(hazard);
      const current = grouped.get(key) ?? { key, count: 0, open_count: 0, closed_count: 0 };
      current.count += 1;
      if (this.isClosedHazard(hazard)) current.closed_count += 1;
      else current.open_count += 1;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }

  private groupHazardsByBuilding(hazards: SafetyHazardEntity[]): SafetyBuildingStats[] {
    const grouped = new Map<string, SafetyBuildingStats>();
    for (const hazard of hazards) {
      const key = hazard.buildingId ?? "-";
      const current = grouped.get(key) ?? {
        building_id: hazard.buildingId,
        building_code: hazard.building?.buildingCode ?? "-",
        building_name: hazard.building?.buildingName ?? "未关联楼栋",
        count: 0,
        open_count: 0,
        overdue_count: 0,
        major_count: 0
      };
      current.count += 1;
      if (!this.isClosedHazard(hazard)) current.open_count += 1;
      if (this.isOverdueHazard(hazard)) current.overdue_count += 1;
      if (this.isMajorHazard(hazard)) current.major_count += 1;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }

  private toHazardItem(hazard: SafetyHazardEntity): SafetyHazardStatsItem {
    return {
      id: hazard.id,
      hazard_code: hazard.hazardCode,
      title: hazard.title,
      hazard_type: hazard.hazardType,
      risk_level: hazard.riskLevel,
      status: hazard.status,
      overdue_flag: this.isOverdueHazard(hazard),
      building_id: hazard.buildingId,
      building_name: hazard.building?.buildingName ?? "未关联楼栋",
      location: hazard.location,
      rectify_deadline: hazard.rectifyDeadline,
      overdue_days: this.overdueDays(hazard),
      create_time: hazard.createTime
    };
  }

  private isClosedHazard(hazard: SafetyHazardEntity): boolean {
    return HAZARD_CLOSED_STATUSES.has(hazard.status);
  }

  private isMajorHazard(hazard: SafetyHazardEntity): boolean {
    return hazard.riskLevel ? MAJOR_HAZARD_RISK_LEVELS.has(hazard.riskLevel) : false;
  }

  private isOverdueHazard(hazard: SafetyHazardEntity): boolean {
    return !this.isClosedHazard(hazard) && (hazard.overdueFlag || this.overdueDays(hazard) > 0);
  }

  private overdueDays(hazard: SafetyHazardEntity): number {
    if (!hazard.rectifyDeadline) return 0;
    const diff = Date.now() - hazard.rectifyDeadline.getTime();
    return diff > 0 ? Math.ceil(diff / 86_400_000) : 0;
  }

  private ratio(part: number, total: number): number {
    if (total <= 0) return 0;
    return Number((part / total).toFixed(4));
  }

  private parseStartDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseEndDate(value?: string): Date | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T23:59:59.999+08:00`);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isSelfScope(actor: JwtPrincipal): boolean {
    const scope = actor.dataScope;
    return scope === "self" || scope === "10";
  }
}
