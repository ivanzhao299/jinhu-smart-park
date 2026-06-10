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
import { WorkOrderLogEntity } from "./entities/work-order-log.entity";
import { WorkOrderSlaRuleEntity } from "./entities/work-order-sla-rule.entity";
import { WorkOrderEntity } from "./entities/work-order.entity";

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
