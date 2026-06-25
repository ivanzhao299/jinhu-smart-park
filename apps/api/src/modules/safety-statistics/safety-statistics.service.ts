import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { Brackets } from "typeorm";
import type { ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyEmergencyEventEntity } from "../safety-emergency/entities/safety-emergency-event.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { SafetyWorkPermitCheckEntity } from "../safety-work-permits/entities/safety-work-permit-check.entity";
import { SafetyWorkPermitEntity } from "../safety-work-permits/entities/safety-work-permit.entity";
import type { SafetyStatisticsQueryDto } from "./dto/safety-statistics-query.dto";

const TASK_STATUS_DONE = "30";
const TASK_STATUS_OVERDUE = "40";
const TASK_STATUS_CANCELLED = "90";
const HAZARD_CLOSED_STATUSES = new Set(["60", "90"]);
const MAJOR_HAZARD_RISK_LEVELS = new Set(["major", "30"]);
const HIGH_RISK_TENANT_LEVELS = new Set(["40", "high"]);
const EMERGENCY_CLOSED_STATUSES = new Set(["60", "90"]);
const MAJOR_EMERGENCY_SEVERITY_LEVELS = new Set(["major", "30"]);
const WORK_PERMIT_PENDING_STATUSES = new Set(["20", "30", "40", "50"]);
const WORK_PERMIT_APPROVED_STATUSES = new Set(["60", "70", "80", "90"]);
const WORK_PERMIT_IN_PROGRESS_STATUS = "70";
const WORK_PERMIT_CLOSED_STATUS = "90";
const WORK_PERMIT_VIOLATION_RESULTS = new Set(["fail", "violation"]);

export interface SafetyStatsSummary {
  inspect_task_total: number;
  inspect_task_done: number;
  inspect_task_overdue: number;
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

export interface EmergencyWorkPermitStatisticsResult {
  emergency: {
    total_count: number;
    open_count: number;
    closed_count: number;
    major_count: number;
    avg_response_minutes: number;
    avg_close_hours: number;
  };
  work_permit: {
    total_count: number;
    pending_count: number;
    approved_count: number;
    in_progress_count: number;
    closed_count: number;
    violation_count: number;
  };
  by_incident_type: Array<{ incident_type: string; count: number; open_count: number; closed_count: number; major_count: number }>;
  by_permit_type: Array<{ permit_type: string; count: number; pending_count: number; approved_count: number; violation_count: number }>;
  recent_emergencies: Array<{
    id: string;
    emergency_code: string;
    title: string;
    incident_type: string;
    severity_level: string;
    response_level: string | null;
    status: string;
    location: string;
    report_time: Date;
  }>;
  recent_work_permits: Array<{
    id: string;
    permit_code: string;
    permit_type: string;
    risk_level: string;
    status: string;
    location: string;
    time_start: Date;
    time_end: Date;
    violation_count: number;
  }>;
  violation_top: Array<{
    permit_id: string;
    permit_code: string;
    permit_type: string;
    location: string;
    violation_count: number;
    latest_check_time: Date | null;
  }>;
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
    @InjectRepository(SafetyEmergencyEventEntity)
    private readonly emergencyEventsRepository: Repository<SafetyEmergencyEventEntity>,
    @InjectRepository(SafetyWorkPermitEntity)
    private readonly workPermitsRepository: Repository<SafetyWorkPermitEntity>,
    @InjectRepository(SafetyWorkPermitCheckEntity)
    private readonly workPermitChecksRepository: Repository<SafetyWorkPermitCheckEntity>,
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
    const inspectTaskOverdue = tasks.filter((task) => this.isOverdueInspectionTask(task)).length;
    const hazardClosedCount = hazards.filter((hazard) => this.isClosedHazard(hazard)).length;
    const overdueHazards = hazards.filter((hazard) => this.isOverdueHazard(hazard));
    const majorHazards = hazards.filter((hazard) => this.isMajorHazard(hazard));

    return {
      summary: {
        inspect_task_total: inspectTaskTotal,
        inspect_task_done: inspectTaskDone,
        inspect_task_overdue: inspectTaskOverdue,
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

  async emergencyWorkPermitStatistics(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: SafetyStatisticsQueryDto
  ): Promise<EmergencyWorkPermitStatisticsResult> {
    const [emergencies, permits] = await Promise.all([
      this.loadEmergencyEvents(scope, actor, query),
      this.loadWorkPermits(scope, actor, query)
    ]);
    const permitIds = permits.map((permit) => permit.id);
    const checks = permitIds.length > 0 ? await this.loadWorkPermitChecks(scope, permitIds) : [];
    const violationCountByPermitId = this.countViolationsByPermitId(checks);
    const totalViolationCount = [...violationCountByPermitId.values()].reduce((sum, count) => sum + count, 0);

    const closedEmergencyCount = emergencies.filter((event) => this.isClosedEmergency(event)).length;
    const majorEmergencyCount = emergencies.filter((event) => this.isMajorEmergency(event)).length;

    return {
      emergency: {
        total_count: emergencies.length,
        open_count: emergencies.length - closedEmergencyCount,
        closed_count: closedEmergencyCount,
        major_count: majorEmergencyCount,
        avg_response_minutes: this.averageDuration(emergencies, (event) => event.reportTime, (event) => event.responseTime, 60_000),
        avg_close_hours: this.averageDuration(emergencies, (event) => event.reportTime, (event) => event.closeTime, 3_600_000)
      },
      work_permit: {
        total_count: permits.length,
        pending_count: permits.filter((permit) => WORK_PERMIT_PENDING_STATUSES.has(permit.status)).length,
        approved_count: permits.filter((permit) => WORK_PERMIT_APPROVED_STATUSES.has(permit.status)).length,
        in_progress_count: permits.filter((permit) => permit.status === WORK_PERMIT_IN_PROGRESS_STATUS).length,
        closed_count: permits.filter((permit) => permit.status === WORK_PERMIT_CLOSED_STATUS).length,
        violation_count: totalViolationCount
      },
      by_incident_type: this.groupEmergenciesByIncidentType(emergencies),
      by_permit_type: this.groupWorkPermitsByType(permits, violationCountByPermitId),
      recent_emergencies: emergencies
        .slice()
        .sort((left, right) => right.reportTime.getTime() - left.reportTime.getTime())
        .slice(0, 10)
        .map((event) => this.toEmergencyStatsItem(event)),
      recent_work_permits: permits
        .slice()
        .sort((left, right) => right.createTime.getTime() - left.createTime.getTime())
        .slice(0, 10)
        .map((permit) => this.toWorkPermitStatsItem(permit, violationCountByPermitId)),
      violation_top: this.buildViolationTop(permits, checks, violationCountByPermitId)
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

  private isOverdueInspectionTask(task: SafetyInspectTaskEntity): boolean {
    if ([TASK_STATUS_DONE, TASK_STATUS_CANCELLED].includes(task.status)) {
      return false;
    }
    return task.status === TASK_STATUS_OVERDUE || task.dueTime.getTime() < Date.now();
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

  private async loadEmergencyEvents(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: SafetyStatisticsQueryDto
  ): Promise<SafetyEmergencyEventEntity[]> {
    const builder = this.emergencyEventsRepository
      .createQueryBuilder("emergency")
      .where("emergency.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("emergency.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("emergency.is_deleted = false");
    await this.applyEmergencyDataScope(builder, actor);
    this.applyEmergencyQuery(builder, query);
    return builder.getMany();
  }

  private async loadWorkPermits(scope: TenantParkScope, actor: JwtPrincipal, query: SafetyStatisticsQueryDto): Promise<SafetyWorkPermitEntity[]> {
    const builder = this.workPermitsRepository
      .createQueryBuilder("permit")
      .where("permit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("permit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("permit.is_deleted = false");
    await this.applyWorkPermitDataScope(builder, actor);
    this.applyWorkPermitQuery(builder, query);
    return builder.getMany();
  }

  private async loadWorkPermitChecks(scope: TenantParkScope, permitIds: string[]): Promise<SafetyWorkPermitCheckEntity[]> {
    return this.workPermitChecksRepository
      .createQueryBuilder("check")
      .where("check.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("check.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("check.is_deleted = false")
      .andWhere("check.permit_id IN (:...permitIds)", { permitIds })
      .getMany();
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

  private applyEmergencyQuery(builder: SelectQueryBuilder<SafetyEmergencyEventEntity>, query: SafetyStatisticsQueryDto): void {
    const start = this.parseStartDate(query.start_date);
    const end = this.parseEndDate(query.end_date);
    if (start) builder.andWhere("emergency.report_time >= :emergencyStartDate", { emergencyStartDate: start });
    if (end) builder.andWhere("emergency.report_time <= :emergencyEndDate", { emergencyEndDate: end });
    if (query.incident_type) builder.andWhere("emergency.incident_type = :incidentType", { incidentType: query.incident_type });
    if (query.building_id) builder.andWhere("emergency.building_id = :emergencyBuildingId", { emergencyBuildingId: query.building_id });
    if (query.unit_id) builder.andWhere("emergency.unit_id = :emergencyUnitId", { emergencyUnitId: query.unit_id });
    if (query.park_tenant_id) builder.andWhere("emergency.park_tenant_id = :emergencyParkTenantId", { emergencyParkTenantId: query.park_tenant_id });
  }

  private applyWorkPermitQuery(builder: SelectQueryBuilder<SafetyWorkPermitEntity>, query: SafetyStatisticsQueryDto): void {
    const start = this.parseStartDate(query.start_date);
    const end = this.parseEndDate(query.end_date);
    if (start) builder.andWhere("permit.time_start >= :permitStartDate", { permitStartDate: start });
    if (end) builder.andWhere("permit.time_start <= :permitEndDate", { permitEndDate: end });
    if (query.permit_type) builder.andWhere("permit.permit_type = :permitType", { permitType: query.permit_type });
    if (query.building_id) builder.andWhere("permit.building_id = :permitBuildingId", { permitBuildingId: query.building_id });
    if (query.unit_id) builder.andWhere("permit.unit_id = :permitUnitId", { permitUnitId: query.unit_id });
    if (query.park_tenant_id) builder.andWhere("permit.apply_park_tenant_id = :permitParkTenantId", { permitParkTenantId: query.park_tenant_id });
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

  private async applyEmergencyDataScope(builder: SelectQueryBuilder<SafetyEmergencyEventEntity>, actor: JwtPrincipal): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "emergency", "park_id", parkFilter, "safetyEmergencyStatsParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "emergency", "building_id", buildingFilter, "safetyEmergencyStatsBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "emergency", "floor_id", floorFilter, "safetyEmergencyStatsFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "emergency", "unit_id", unitFilter, "safetyEmergencyStatsUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "emergency", "park_tenant_id", tenantCompanyFilter, "safetyEmergencyStatsTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "emergency", "commander_id", handlerFilter, "safetyEmergencyStatsHandlerScopeIds");
    if (this.isSelfScope(actor)) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("emergency.reporter_id = :currentSafetyEmergencyUserId", { currentSafetyEmergencyUserId: actor.sub })
            .orWhere("emergency.commander_id = :currentSafetyEmergencyUserId", { currentSafetyEmergencyUserId: actor.sub })
            .orWhere("emergency.create_by = :currentSafetyEmergencyUserId", { currentSafetyEmergencyUserId: actor.sub });
        })
      );
    }
  }

  private async applyWorkPermitDataScope(builder: SelectQueryBuilder<SafetyWorkPermitEntity>, actor: JwtPrincipal): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "permit", "park_id", parkFilter, "safetyPermitStatsParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "building_id", buildingFilter, "safetyPermitStatsBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "floor_id", floorFilter, "safetyPermitStatsFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "unit_id", unitFilter, "safetyPermitStatsUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "apply_park_tenant_id", tenantCompanyFilter, "safetyPermitStatsTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "monitor_user_id", handlerFilter, "safetyPermitStatsHandlerScopeIds");
    if (this.isSelfScope(actor)) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("permit.apply_user_id = :currentSafetyPermitUserId", { currentSafetyPermitUserId: actor.sub })
            .orWhere("permit.monitor_user_id = :currentSafetyPermitUserId", { currentSafetyPermitUserId: actor.sub })
            .orWhere("permit.create_by = :currentSafetyPermitUserId", { currentSafetyPermitUserId: actor.sub });
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

  private groupEmergenciesByIncidentType(
    emergencies: SafetyEmergencyEventEntity[]
  ): Array<{ incident_type: string; count: number; open_count: number; closed_count: number; major_count: number }> {
    const grouped = new Map<string, { incident_type: string; count: number; open_count: number; closed_count: number; major_count: number }>();
    for (const event of emergencies) {
      const key = event.incidentType || "-";
      const current = grouped.get(key) ?? { incident_type: key, count: 0, open_count: 0, closed_count: 0, major_count: 0 };
      current.count += 1;
      if (this.isClosedEmergency(event)) current.closed_count += 1;
      else current.open_count += 1;
      if (this.isMajorEmergency(event)) current.major_count += 1;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }

  private groupWorkPermitsByType(
    permits: SafetyWorkPermitEntity[],
    violationCountByPermitId: Map<string, number>
  ): Array<{ permit_type: string; count: number; pending_count: number; approved_count: number; violation_count: number }> {
    const grouped = new Map<string, { permit_type: string; count: number; pending_count: number; approved_count: number; violation_count: number }>();
    for (const permit of permits) {
      const key = permit.permitType || "-";
      const current = grouped.get(key) ?? { permit_type: key, count: 0, pending_count: 0, approved_count: 0, violation_count: 0 };
      current.count += 1;
      if (WORK_PERMIT_PENDING_STATUSES.has(permit.status)) current.pending_count += 1;
      if (WORK_PERMIT_APPROVED_STATUSES.has(permit.status)) current.approved_count += 1;
      current.violation_count += violationCountByPermitId.get(permit.id) ?? 0;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }

  private countViolationsByPermitId(checks: SafetyWorkPermitCheckEntity[]): Map<string, number> {
    const grouped = new Map<string, number>();
    for (const check of checks) {
      if (!WORK_PERMIT_VIOLATION_RESULTS.has(check.result)) continue;
      grouped.set(check.permitId, (grouped.get(check.permitId) ?? 0) + 1);
    }
    return grouped;
  }

  private buildViolationTop(
    permits: SafetyWorkPermitEntity[],
    checks: SafetyWorkPermitCheckEntity[],
    violationCountByPermitId: Map<string, number>
  ): Array<{ permit_id: string; permit_code: string; permit_type: string; location: string; violation_count: number; latest_check_time: Date | null }> {
    const latestCheckTimeByPermitId = new Map<string, Date>();
    for (const check of checks) {
      if (!WORK_PERMIT_VIOLATION_RESULTS.has(check.result)) continue;
      const current = latestCheckTimeByPermitId.get(check.permitId);
      if (!current || check.checkTime.getTime() > current.getTime()) {
        latestCheckTimeByPermitId.set(check.permitId, check.checkTime);
      }
    }
    return permits
      .map((permit) => ({
        permit_id: permit.id,
        permit_code: permit.permitCode,
        permit_type: permit.permitType,
        location: permit.location,
        violation_count: violationCountByPermitId.get(permit.id) ?? 0,
        latest_check_time: latestCheckTimeByPermitId.get(permit.id) ?? null
      }))
      .filter((item) => item.violation_count > 0)
      .sort((left, right) => right.violation_count - left.violation_count || ((right.latest_check_time?.getTime() ?? 0) - (left.latest_check_time?.getTime() ?? 0)))
      .slice(0, 10);
  }

  private toEmergencyStatsItem(event: SafetyEmergencyEventEntity): EmergencyWorkPermitStatisticsResult["recent_emergencies"][number] {
    return {
      id: event.id,
      emergency_code: event.emergencyCode,
      title: event.title,
      incident_type: event.incidentType,
      severity_level: event.severityLevel,
      response_level: event.responseLevel,
      status: event.status,
      location: event.location,
      report_time: event.reportTime
    };
  }

  private toWorkPermitStatsItem(
    permit: SafetyWorkPermitEntity,
    violationCountByPermitId: Map<string, number>
  ): EmergencyWorkPermitStatisticsResult["recent_work_permits"][number] {
    return {
      id: permit.id,
      permit_code: permit.permitCode,
      permit_type: permit.permitType,
      risk_level: permit.riskLevel,
      status: permit.status,
      location: permit.location,
      time_start: permit.timeStart,
      time_end: permit.timeEnd,
      violation_count: violationCountByPermitId.get(permit.id) ?? 0
    };
  }

  private isClosedEmergency(event: SafetyEmergencyEventEntity): boolean {
    return EMERGENCY_CLOSED_STATUSES.has(event.status);
  }

  private isMajorEmergency(event: SafetyEmergencyEventEntity): boolean {
    return MAJOR_EMERGENCY_SEVERITY_LEVELS.has(event.severityLevel);
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

  private averageDuration<T>(items: T[], startGetter: (item: T) => Date | null, endGetter: (item: T) => Date | null, unitMs: number): number {
    const values = items
      .map((item) => {
        const start = startGetter(item);
        const end = endGetter(item);
        if (!start || !end) return null;
        const diff = end.getTime() - start.getTime();
        return diff >= 0 ? diff / unitMs : null;
      })
      .filter((value): value is number => value !== null);
    if (values.length === 0) return 0;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
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
