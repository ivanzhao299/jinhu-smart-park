import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { WorkOrderLogQueryDto } from "./dto/work-order-log.dto";
import type { WorkOrderQueryDto } from "./dto/work-order-query.dto";
import type { WorkOrderSlaRuleQueryDto } from "./dto/work-order-sla-rule.dto";
import type { WorkOrderStatsQueryDto } from "./dto/work-order-stats-query.dto";
import { WorkOrderLogEntity } from "./entities/work-order-log.entity";
import { WorkOrderSlaRuleEntity } from "./entities/work-order-sla-rule.entity";
import { WorkOrderEntity } from "./entities/work-order.entity";
import type { WorkOrderStatsBucket, WorkOrderStatsResult, WorkOrderStatsSummary } from "./work-orders.service";

const WORK_ORDER_STATUS_SUBMITTED = "10";
const WORK_ORDER_STATUS_ASSIGNED = "20";
const WORK_ORDER_STATUS_ACCEPTED = "30";
const WORK_ORDER_STATUS_PROCESSING = "40";
const WORK_ORDER_STATUS_WAIT_MATERIAL = "45";
const WORK_ORDER_STATUS_FINISHED = "50";
const WORK_ORDER_STATUS_CONFIRMED = "60";
const WORK_ORDER_STATUS_EVALUATED = "70";
const WORK_ORDER_STATUS_CLOSED = "100";
const DEFAULT_DISPATCH_SLA_MIN = 30;
const DEFAULT_FINISH_SLA_MIN = 240;
const DEFAULT_SORT_COLUMN = "workOrder.createTime";
const SORT_COLUMNS = new Set([
  "woCode",
  "title",
  "woType",
  "priority",
  "urgency",
  "status",
  "overdueFlag",
  "createTime",
  "updateTime",
  "dispatchTime",
  "finishTime"
]);
const SORT_COLUMN_MAP: Record<string, string> = {
  woCode: "workOrder.woCode",
  title: "workOrder.title",
  woType: "workOrder.woType",
  priority: "workOrder.priority",
  urgency: "workOrder.urgency",
  status: "workOrder.status",
  overdueFlag: "workOrder.overdueFlag",
  createTime: "workOrder.createTime",
  updateTime: "workOrder.updateTime",
  dispatchTime: "workOrder.dispatchTime",
  finishTime: "workOrder.finishTime"
};

@Injectable()
export class WorkOrderQueryService {
  constructor(
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @InjectRepository(WorkOrderLogEntity)
    private readonly workOrderLogsRepository: Repository<WorkOrderLogEntity>,
    @InjectRepository(WorkOrderSlaRuleEntity)
    private readonly workOrderSlaRulesRepository: Repository<WorkOrderSlaRuleEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: WorkOrderQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<WorkOrderEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "workorder", "work_order", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "workorder", "work_order", entity);
  }

  async logs(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: WorkOrderLogQueryDto): Promise<PaginatedResult<WorkOrderLogEntity>> {
    await this.findOne(scope, id, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const order = query.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const [items, total] = await this.workOrderLogsRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.work_order_id = :id", { id })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", order)
      .addOrderBy("log.create_time", order)
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async overdue(scope: TenantParkScope, query: WorkOrderQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<WorkOrderEntity>> {
    const overdueQuery = { ...query, overdue_only: true };
    return this.list(scope, overdueQuery, actor);
  }

  async listSlaRules(scope: TenantParkScope, query: WorkOrderSlaRuleQueryDto): Promise<PaginatedResult<WorkOrderSlaRuleEntity>> {
    const builder = this.workOrderSlaRulesRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false");
    if (query.wo_type) builder.andWhere("rule.wo_type = :woType", { woType: query.wo_type });
    if (query.urgency) builder.andWhere("rule.urgency = :urgency", { urgency: query.urgency });
    if (query.priority) builder.andWhere("rule.priority = :priority", { priority: query.priority });
    if (query.status) builder.andWhere("rule.status = :status", { status: query.status });
    const [items, total] = await builder
      .orderBy("rule.update_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async stats(scope: TenantParkScope, query: WorkOrderStatsQueryDto, actor?: JwtPrincipal): Promise<WorkOrderStatsResult> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyStatsQuery(builder, query);
    const workOrders = await builder.getMany();
    return this.buildStatsResult(workOrders);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<WorkOrderEntity> {
    return this.workOrdersRepository
      .createQueryBuilder("workOrder")
      .leftJoinAndSelect("workOrder.parkTenant", "parkTenant")
      .leftJoinAndSelect("workOrder.unit", "unit")
      .leftJoinAndSelect("workOrder.building", "building")
      .leftJoinAndSelect("workOrder.floor", "floor")
      .where("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("workOrder.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<WorkOrderEntity> {
    const builder = this.scopedBuilder(scope).andWhere("workOrder.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Work order not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<WorkOrderEntity>, query: WorkOrderQueryDto): void {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("workOrder.wo_code ILIKE :keyword", { keyword })
            .orWhere("workOrder.title ILIKE :keyword", { keyword })
            .orWhere("workOrder.location ILIKE :keyword", { keyword })
            .orWhere("workOrder.reporter_name ILIKE :keyword", { keyword })
            .orWhere("workOrder.assignee_name ILIKE :keyword", { keyword })
            .orWhere("parkTenant.company_name ILIKE :keyword", { keyword })
            .orWhere("unit.unit_name ILIKE :keyword", { keyword })
            .orWhere("unit.unit_code ILIKE :keyword", { keyword });
        })
      );
    }
    if (query.status) builder.andWhere("workOrder.status = :status", { status: query.status });
    if (query.wo_type) builder.andWhere("workOrder.wo_type = :woType", { woType: query.wo_type });
    if (query.priority) builder.andWhere("workOrder.priority = :priority", { priority: query.priority });
    if (query.urgency) builder.andWhere("workOrder.urgency = :urgency", { urgency: query.urgency });
    if (query.assignee_id) builder.andWhere("workOrder.assignee_id = :assigneeId", { assigneeId: query.assignee_id });
    if (query.reporter_id) builder.andWhere("workOrder.reporter_id = :reporterId", { reporterId: query.reporter_id });
    if (query.park_tenant_id) builder.andWhere("workOrder.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.unit_id) builder.andWhere("workOrder.unit_id = :unitId", { unitId: query.unit_id });
    if (query.device_id) builder.andWhere("workOrder.device_id = :deviceId", { deviceId: query.device_id });
    if (query.building_id) builder.andWhere("workOrder.building_id = :buildingId", { buildingId: query.building_id });
    if (query.source_type) builder.andWhere("workOrder.source_type = :sourceType", { sourceType: query.source_type });
    if (query.overdue_only) builder.andWhere("workOrder.overdue_flag = true");
    if (query.start_date) builder.andWhere("workOrder.create_time >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("workOrder.create_time < (:endDate::date + INTERVAL '1 day')", { endDate: query.end_date });
  }

  private applyStatsQuery(builder: SelectQueryBuilder<WorkOrderEntity>, query: WorkOrderStatsQueryDto): void {
    if (query.wo_type) builder.andWhere("workOrder.wo_type = :woType", { woType: query.wo_type });
    if (query.building_id) builder.andWhere("workOrder.building_id = :buildingId", { buildingId: query.building_id });
    if (query.assignee_id) builder.andWhere("workOrder.assignee_id = :assigneeId", { assigneeId: query.assignee_id });
    if (query.park_tenant_id) builder.andWhere("workOrder.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.start_date) builder.andWhere("workOrder.create_time >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("workOrder.create_time < (:endDate::date + INTERVAL '1 day')", { endDate: query.end_date });
  }

  private buildStatsResult(workOrders: WorkOrderEntity[]): WorkOrderStatsResult {
    const now = new Date();
    const inProgressStatuses = new Set([WORK_ORDER_STATUS_ACCEPTED, WORK_ORDER_STATUS_PROCESSING, WORK_ORDER_STATUS_WAIT_MATERIAL]);
    const doneStatuses = new Set([WORK_ORDER_STATUS_FINISHED, WORK_ORDER_STATUS_CONFIRMED, WORK_ORDER_STATUS_EVALUATED, WORK_ORDER_STATUS_CLOSED]);
    const dispatchDurations: number[] = [];
    const finishDurations: number[] = [];
    const satisfactionValues: number[] = [];
    const assigneeMap = new Map<
      string,
      {
        assignee_id: string | null;
        assignee_name: string;
        count: number;
        done_count: number;
        overdue_count: number;
        finishDurations: number[];
        overdueDurations: number[];
      }
    >();

    for (const workOrder of workOrders) {
      const dispatchDuration = this.optionalMinutesBetween(workOrder.createTime, workOrder.dispatchTime);
      if (dispatchDuration !== null) dispatchDurations.push(dispatchDuration);

      const finishBase = workOrder.acceptTime ?? workOrder.dispatchTime ?? workOrder.createTime;
      const finishDuration = this.optionalMinutesBetween(finishBase, workOrder.finishTime);
      if (finishDuration !== null) finishDurations.push(finishDuration);

      if (typeof workOrder.satisfaction === "number") {
        satisfactionValues.push(workOrder.satisfaction);
      }

      const assigneeKey = workOrder.assigneeId ?? "__unassigned__";
      const assigneeBucket =
        assigneeMap.get(assigneeKey) ??
        {
          assignee_id: workOrder.assigneeId ?? null,
          assignee_name: workOrder.assigneeName ?? "未派单",
          count: 0,
          done_count: 0,
          overdue_count: 0,
          finishDurations: [],
          overdueDurations: []
        };
      assigneeBucket.count += 1;
      if (doneStatuses.has(workOrder.status)) assigneeBucket.done_count += 1;
      if (workOrder.overdueFlag) {
        assigneeBucket.overdue_count += 1;
        assigneeBucket.overdueDurations.push(this.calculateOverdueMinutes(workOrder, now));
      }
      if (finishDuration !== null) assigneeBucket.finishDurations.push(finishDuration);
      assigneeMap.set(assigneeKey, assigneeBucket);
    }

    const summary: WorkOrderStatsSummary = {
      total_count: workOrders.length,
      pending_count: workOrders.filter((item) => item.status === WORK_ORDER_STATUS_SUBMITTED).length,
      assigned_count: workOrders.filter((item) => item.status === WORK_ORDER_STATUS_ASSIGNED).length,
      in_progress_count: workOrders.filter((item) => inProgressStatuses.has(item.status)).length,
      done_count: workOrders.filter((item) => doneStatuses.has(item.status)).length,
      overdue_count: workOrders.filter((item) => item.overdueFlag).length,
      closed_count: workOrders.filter((item) => item.status === WORK_ORDER_STATUS_CLOSED).length,
      avg_dispatch_minutes: this.average(dispatchDurations),
      avg_finish_minutes: this.average(finishDurations),
      avg_satisfaction: this.average(satisfactionValues)
    };

    const byAssignee = Array.from(assigneeMap.values())
      .map((bucket) => ({
        assignee_id: bucket.assignee_id,
        assignee_name: bucket.assignee_name,
        count: bucket.count,
        done_count: bucket.done_count,
        overdue_count: bucket.overdue_count,
        avg_finish_minutes: this.average(bucket.finishDurations)
      }))
      .sort((left, right) => right.count - left.count || right.done_count - left.done_count)
      .slice(0, 20);

    const overdueTop = Array.from(assigneeMap.values())
      .filter((bucket) => bucket.overdue_count > 0)
      .map((bucket) => ({
        assignee_id: bucket.assignee_id,
        assignee_name: bucket.assignee_name,
        overdue_count: bucket.overdue_count,
        max_overdue_minutes: bucket.overdueDurations.length > 0 ? Math.max(...bucket.overdueDurations) : 0
      }))
      .sort((left, right) => right.overdue_count - left.overdue_count || right.max_overdue_minutes - left.max_overdue_minutes)
      .slice(0, 10);

    return {
      summary,
      by_status: this.groupCount(workOrders, (item) => item.status),
      by_type: this.groupCount(workOrders, (item) => item.woType),
      by_priority: this.groupCount(workOrders, (item) => item.priority),
      by_assignee: byAssignee,
      overdue_top: overdueTop
    };
  }

  private groupCount(items: WorkOrderEntity[], selector: (item: WorkOrderEntity) => string | null | undefined): WorkOrderStatsBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = selector(item)?.trim() || "-";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count);
  }

  private optionalMinutesBetween(start?: Date | null, end?: Date | null): number | null {
    if (!start || !end) return null;
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    return Math.round(minutes * 100) / 100;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round((total / values.length) * 100) / 100;
  }

  private calculateOverdueMinutes(workOrder: WorkOrderEntity, now: Date): number {
    const dispatchSlaMin = workOrder.slaDispatchMin ?? DEFAULT_DISPATCH_SLA_MIN;
    const finishSlaMin = workOrder.slaFinishMin ?? DEFAULT_FINISH_SLA_MIN;
    let dueAt: Date | null = null;
    if (workOrder.status === WORK_ORDER_STATUS_SUBMITTED && workOrder.createTime) {
      dueAt = new Date(workOrder.createTime.getTime() + dispatchSlaMin * 60000);
    } else if (
      [WORK_ORDER_STATUS_ASSIGNED, WORK_ORDER_STATUS_ACCEPTED, WORK_ORDER_STATUS_PROCESSING, WORK_ORDER_STATUS_WAIT_MATERIAL].includes(workOrder.status)
    ) {
      const baseTime = workOrder.acceptTime ?? workOrder.dispatchTime ?? workOrder.createTime;
      if (baseTime) dueAt = new Date(baseTime.getTime() + finishSlaMin * 60000);
    }
    if (!dueAt) return 0;
    const minutes = (now.getTime() - dueAt.getTime()) / 60000;
    return minutes > 0 ? Math.round(minutes * 100) / 100 : 0;
  }

  private applySort(builder: SelectQueryBuilder<WorkOrderEntity>, sort?: string): void {
    const [field = "createTime", directionRaw = "DESC"] = (sort ?? "createTime:DESC").split(":");
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC");
      return;
    }
    const direction = directionRaw?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<WorkOrderEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, buildingFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "park_id", parkFilter, "workOrderParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "building_id", buildingFilter, "workOrderBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "unit_id", unitFilter, "workOrderUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "park_tenant_id", tenantCompanyFilter, "workOrderParkTenantScopeIds");
    this.applyHandlerScopeFilter(builder, handlerFilter);
    this.applyDefaultHandlerSelfScope(builder, actor);
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<WorkOrderEntity>,
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

  private applyHandlerScopeFilter(builder: SelectQueryBuilder<WorkOrderEntity>, filter: DataScopeFilter): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("workOrder.assignee_id IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids })
            .orWhere("workOrder.reporter_id IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids })
            .orWhere("workOrder.create_by IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids });
        })
      );
      return;
    }
    if (filter.scope_types.includes("custom") || filter.scope_types.includes("self")) {
      builder.andWhere("1 = 0");
    }
  }

  private applyDefaultHandlerSelfScope(builder: SelectQueryBuilder<WorkOrderEntity>, actor: JwtPrincipal): void {
    if (actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return;
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("workOrder.assignee_id = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub })
          .orWhere("workOrder.reporter_id = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub })
          .orWhere("workOrder.create_by = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub });
      })
    );
  }
}
