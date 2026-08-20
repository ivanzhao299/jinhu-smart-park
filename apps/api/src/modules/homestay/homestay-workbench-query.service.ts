import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type HomestayFinanceListResponse,
  type HomestayGuestCandidateListResponse,
  type HomestayTaskListResponse,
  type HomestayWorkOrderCandidateListResponse,
  type PropertyWorkbenchTaskItem,
  type TenantParkScope
} from "@jinhu/shared";
import {
  Brackets,
  DataSource,
  type Repository,
  type SelectQueryBuilder
} from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type {
  HomestayCandidateQueryDto,
  HomestayFinanceQueryDto,
  HomestayGuestCandidateQueryDto,
  HomestayTaskQueryDto
} from "./dto/homestay.dto";
import { formatHomestayMoney } from "./homestay-booking.policy";

@Injectable()
export class HomestayWorkbenchQueryService {
  constructor(
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService
  ) {}

  async listGuestCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayGuestCandidateQueryDto
  ): Promise<HomestayGuestCandidateListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return this.emptyPage(query);
    }
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId,
      query.booking_id,
      allowedUnitIds
    ];
    const bookingScopeClause = `
           AND EXISTS (
             SELECT 1
             FROM biz_homestay_booking booking
             WHERE booking.id = $3
               AND booking.tenant_id = party.tenant_id
               AND booking.park_id = party.park_id
               AND booking.is_deleted = false
               AND ($4::uuid[] IS NULL OR booking.unit_id = ANY($4::uuid[]))
           )`;
    const keywordClause = query.keyword
      ? " AND party.display_name ILIKE $5 ESCAPE '\\'"
      : "";
    if (query.keyword) parameters.push(`%${escapeLikePattern(query.keyword)}%`);
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const [items, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT party.id, party.display_name AS "displayName"
         FROM biz_party party
         WHERE party.tenant_id = $1
           AND party.park_id = $2
           AND party.party_type = 'person'
           AND party.is_deleted = false${bookingScopeClause}${keywordClause}
         ORDER BY party.display_name ASC, party.id ASC
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ) as Promise<Array<{ id: string; displayName: string }>>,
      this.dataSource.query(
        `SELECT count(*)::int AS total
         FROM biz_party party
         WHERE party.tenant_id = $1
           AND party.park_id = $2
           AND party.party_type = 'person'
           AND party.is_deleted = false${bookingScopeClause}${keywordClause}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: items.map(({ id, displayName }) => ({ id, displayName })),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  async listWorkOrderCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayCandidateQueryDto
  ): Promise<HomestayWorkOrderCandidateListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return this.emptyPage(query);
    }
    if (query.unit_id && allowedUnitIds !== null && !allowedUnitIds.includes(query.unit_id)) {
      return this.emptyPage(query);
    }
    const builder = this.workOrdersRepository.createQueryBuilder("workOrder")
      .where("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("workOrder.is_deleted = false")
      .andWhere("workOrder.unit_id IS NOT NULL")
      .andWhere("workOrder.status NOT IN (:...terminalStatuses)", {
        terminalStatuses: ["60", "70", "100"]
      });
    if (allowedUnitIds !== null) {
      builder.andWhere("workOrder.unit_id IN (:...homestayAllowedUnitIds)", {
        homestayAllowedUnitIds: allowedUnitIds
      });
    }
    if (query.unit_id) {
      builder.andWhere("workOrder.unit_id = :candidateUnitId", {
        candidateUnitId: query.unit_id
      });
    }
    if (query.keyword) {
      builder.andWhere(
        "(workOrder.wo_code ILIKE :candidateKeyword OR workOrder.title ILIKE :candidateKeyword)",
        { candidateKeyword: `%${query.keyword}%` }
      );
    }
    await this.applyWorkOrderDataScope(builder, actor);
    const countBuilder = builder.clone();
    const [workOrders, total] = await Promise.all([
      builder
        .orderBy("workOrder.create_time", "DESC")
        .skip((query.page - 1) * query.page_size)
        .take(query.page_size)
        .getMany(),
      countBuilder.getCount()
    ]);
    return {
      items: workOrders.map(({ id, woCode, title, status }) => ({
        id,
        woCode,
        title,
        status
      })),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  async getAuthorizedWorkOrderReference(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    workOrderId: string
  ): Promise<{ code: string; title: string; status: string } | undefined> {
    if (
      !actor.isSuper
      && !actor.permissions.includes("*")
      && !actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_READ)
    ) {
      return undefined;
    }
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return undefined;
    const builder = this.workOrdersRepository.createQueryBuilder("workOrder")
      .where("workOrder.id = :workOrderId", { workOrderId })
      .andWhere("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("workOrder.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("workOrder.unit_id IN (:...linkedWorkOrderUnitIds)", {
        linkedWorkOrderUnitIds: allowedUnitIds
      });
    }
    await this.applyWorkOrderDataScope(builder, actor);
    const workOrder = await builder.getOne();
    return workOrder
      ? {
          code: workOrder.woCode,
          title: workOrder.title,
          status: workOrder.status
        }
      : undefined;
  }

  async listTasks(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayTaskQueryDto
  ): Promise<HomestayTaskListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return this.emptyPage(query);
    }
    const businessDate = query.business_date
      ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId,
      businessDate
    ];
    const unitParameter = allowedUnitIds === null ? null : 4;
    if (allowedUnitIds !== null) parameters.push(allowedUnitIds);
    const filters: string[] = [];
    if (query.status) {
      parameters.push(query.status);
      filters.push(`task.status = $${parameters.length}`);
    }
    if (query.source_type) {
      parameters.push(query.source_type);
      filters.push(`task."sourceType" = $${parameters.length}`);
    }
    await this.applyTaskActorScope(parameters, filters, actor);
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        this.taskListSql(unitParameter, filters, limitIndex, offsetIndex),
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ) as Promise<Array<PropertyWorkbenchTaskItem & { dueAt: Date | string | null }>>,
      this.dataSource.query(
        this.taskCountSql(unitParameter, filters),
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: rows.map((row) => {
        const rawDueAt = row.dueAt as unknown;
        return {
          id: row.id,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          title: row.title,
          status: row.status,
          assigneeId: row.assigneeId,
          dueAt: rawDueAt instanceof Date ? rawDueAt.toISOString() : row.dueAt
        };
      }),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  async listFinance(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayFinanceQueryDto
  ): Promise<HomestayFinanceListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return this.emptyPage(query);
    }
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId
    ];
    const filters: string[] = [];
    if (allowedUnitIds !== null) {
      parameters.push(allowedUnitIds);
      filters.push(`booking.unit_id = ANY($${parameters.length}::uuid[])`);
    }
    if (query.status) {
      parameters.push(query.status);
      filters.push(`booking.status = $${parameters.length}`);
    }
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        this.financeListSql(filters, limitIndex, offsetIndex),
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ) as Promise<Array<{
      bookingId: string;
      bookingCode: string;
      totalAmount: string;
      paidAmount: string;
      refundedAmount: string;
      waivedAmount: string;
      balanceAmount: string;
      }>>,
      this.dataSource.query(
        this.financeCountSql(filters),
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: rows.map((row) => ({
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        totalAmount: formatHomestayMoney(row.totalAmount),
        paidAmount: formatHomestayMoney(row.paidAmount),
        refundedAmount: formatHomestayMoney(row.refundedAmount),
        waivedAmount: formatHomestayMoney(row.waivedAmount),
        balanceAmount: formatHomestayMoney(row.balanceAmount)
      })),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  private emptyPage(query: { page: number; page_size: number }) {
    return { items: [], total: 0, page: query.page, page_size: query.page_size };
  }

  private async applyWorkOrderDataScope(
    builder: SelectQueryBuilder<WorkOrderEntity>,
    actor: JwtPrincipal
  ): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const [park, building, unit, tenantCompany, handler] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyIdScope(builder, park, "park_id", "candidateParkIds");
    this.applyIdScope(builder, building, "building_id", "candidateBuildingIds");
    this.applyIdScope(builder, unit, "unit_id", "candidateUnitIds");
    this.applyIdScope(builder, tenantCompany, "park_tenant_id", "candidateTenantIds");
    this.applyHandlerScope(builder, handler, actor);
  }

  private applyIdScope(
    builder: SelectQueryBuilder<WorkOrderEntity>,
    filter: DataScopeFilter,
    column: string,
    parameter: string
  ): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(`workOrder.${column} IN (:...${parameter})`, {
        [parameter]: filter.allowed_ids
      });
    } else if (filter.scope_types.includes("custom")) {
      builder.andWhere("1 = 0");
    }
  }

  private applyHandlerScope(
    builder: SelectQueryBuilder<WorkOrderEntity>,
    filter: DataScopeFilter,
    actor: JwtPrincipal
  ): void {
    if (!filter.unrestricted && filter.allowed_ids.length > 0) {
      builder.andWhere(this.handlerBracket(filter.allowed_ids, "candidateHandlerIds"));
    } else if (
      !filter.unrestricted
      && (filter.scope_types.includes("custom") || filter.scope_types.includes("self"))
    ) {
      builder.andWhere("1 = 0");
    }
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) {
      builder.andWhere(this.handlerBracket([actor.sub], "candidateCurrentUserIds"));
    }
  }

  private handlerBracket(ids: string[], parameter: string): Brackets {
    return new Brackets((nested) => {
      nested
        .where(`workOrder.assignee_id IN (:...${parameter})`, { [parameter]: ids })
        .orWhere(`workOrder.reporter_id IN (:...${parameter})`)
        .orWhere(`workOrder.create_by IN (:...${parameter})`);
    });
  }

  private async applyTaskActorScope(
    parameters: unknown[],
    filters: string[],
    actor: JwtPrincipal
  ): Promise<void> {
    if (
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(SYSTEM_PERMISSIONS.PROPERTY_TASK_SUPERVISE)
    ) {
      return;
    }
    const handler = await this.dataScopeService.buildScopeFilter(
      actor,
      "workorder_handler"
    );
    if (handler.unrestricted) return;
    parameters.push(handler.allowed_ids);
    const index = parameters.length;
    filters.push(`(task."sourceType" <> 'homestay_turnover'
      OR task."assigneeId" IS NULL
      OR task."assigneeId" = ANY($${index}::uuid[]))`);
  }

  private taskCteSql(unitParameter: number | null): string {
    const bookingUnitClause = unitParameter
      ? ` AND booking.unit_id = ANY($${unitParameter}::uuid[])`
      : "";
    const turnoverUnitClause = unitParameter
      ? ` AND turnover.unit_id = ANY($${unitParameter}::uuid[])`
      : "";
    return `WITH task AS (
      SELECT booking.id, 'homestay_arrival'::text AS "sourceType",
             booking.id AS "sourceId",
             ('到店 · ' || booking.booking_code || ' · ' || COALESCE(unit.unit_name, unit.unit_code, booking.unit_id::text)) AS title,
             CASE WHEN booking.status = 'confirmed' THEN 'pending' ELSE 'completed' END AS status,
             NULL::uuid AS "assigneeId",
             COALESCE(booking.expected_arrival_time, booking.arrival_date::timestamp AT TIME ZONE 'Asia/Shanghai') AS "dueAt"
      FROM biz_homestay_booking booking
      LEFT JOIN biz_unit unit ON unit.id = booking.unit_id
        AND unit.tenant_id = booking.tenant_id AND unit.park_id = booking.park_id
        AND unit.is_deleted = false
      WHERE booking.tenant_id = $1 AND booking.park_id = $2
        AND booking.is_deleted = false AND booking.arrival_date = $3::date
        AND booking.status IN ('confirmed', 'checked_in', 'checked_out')${bookingUnitClause}
      UNION ALL
      SELECT booking.id, 'homestay_departure'::text, booking.id,
             ('离店 · ' || booking.booking_code || ' · ' || COALESCE(unit.unit_name, unit.unit_code, booking.unit_id::text)),
             CASE WHEN booking.status = 'checked_out' THEN 'completed' ELSE 'active' END,
             NULL::uuid, booking.departure_date::timestamp AT TIME ZONE 'Asia/Shanghai'
      FROM biz_homestay_booking booking
      LEFT JOIN biz_unit unit ON unit.id = booking.unit_id
        AND unit.tenant_id = booking.tenant_id AND unit.park_id = booking.park_id
        AND unit.is_deleted = false
      WHERE booking.tenant_id = $1 AND booking.park_id = $2
        AND booking.is_deleted = false AND booking.departure_date = $3::date
        AND booking.status IN ('checked_in', 'checked_out')${bookingUnitClause}
      UNION ALL
      SELECT turnover.id, 'homestay_turnover'::text, turnover.id,
             ('周转 · ' || booking.booking_code || ' · ' || COALESCE(unit.unit_name, unit.unit_code, turnover.unit_id::text)),
             CASE WHEN turnover.status = 'pending' THEN 'pending'
                  WHEN turnover.status = 'exception' THEN 'exception'
                  WHEN turnover.status = 'completed' THEN 'completed' ELSE 'active' END,
             turnover.assignee_id, COALESCE(turnover.completed_at, turnover.create_time)
      FROM biz_homestay_turnover_task turnover
      JOIN biz_homestay_booking booking ON booking.id = turnover.booking_id
        AND booking.tenant_id = turnover.tenant_id AND booking.park_id = turnover.park_id
        AND booking.is_deleted = false
      LEFT JOIN biz_unit unit ON unit.id = turnover.unit_id
        AND unit.tenant_id = turnover.tenant_id AND unit.park_id = turnover.park_id
        AND unit.is_deleted = false
      WHERE turnover.tenant_id = $1 AND turnover.park_id = $2
        AND turnover.is_deleted = false
        AND (turnover.status <> 'completed'
          OR (turnover.completed_at AT TIME ZONE 'Asia/Shanghai')::date = $3::date)${turnoverUnitClause}
    )`;
  }

  private taskListSql(
    unitParameter: number | null,
    filters: string[],
    limitIndex: number,
    offsetIndex: number
  ): string {
    const outerWhere = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    return `${this.taskCteSql(unitParameter)}
    SELECT task.*
    FROM task ${outerWhere}
    ORDER BY CASE task.status WHEN 'exception' THEN 0 WHEN 'active' THEN 1
      WHEN 'pending' THEN 2 ELSE 3 END, task."dueAt" ASC, task.id ASC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
  }

  private taskCountSql(unitParameter: number | null, filters: string[]): string {
    const outerWhere = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    return `${this.taskCteSql(unitParameter)}
      SELECT count(*)::int AS total FROM task ${outerWhere}`;
  }

  private financeCteSql(filters: string[]): string {
    const extraWhere = filters.length ? ` AND ${filters.join(" AND ")}` : "";
    return `WITH finance AS (
      SELECT booking.id AS "bookingId", booking.booking_code AS "bookingCode",
      booking.total_amount::text AS "totalAmount",
      COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'payment'
        AND entry.status = 'confirmed'), 0)::text AS "paidAmount",
      COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'refund'
        AND entry.status = 'confirmed'), 0)::text AS "refundedAmount",
      COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'waiver'
        AND entry.status = 'confirmed'), 0)::text AS "waivedAmount",
      (booking.total_amount
        - COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'payment'
          AND entry.status = 'confirmed'), 0)
        + COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'refund'
          AND entry.status = 'confirmed'), 0)
        - COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_type = 'waiver'
          AND entry.status = 'confirmed'), 0))::text AS "balanceAmount",
      booking.create_time AS "createTime"
    FROM biz_homestay_booking booking
    LEFT JOIN biz_homestay_ledger_entry entry ON entry.booking_id = booking.id
      AND entry.tenant_id = booking.tenant_id AND entry.park_id = booking.park_id
      AND entry.is_deleted = false
    WHERE booking.tenant_id = $1 AND booking.park_id = $2
      AND booking.is_deleted = false${extraWhere}
    GROUP BY booking.id, booking.booking_code, booking.total_amount, booking.create_time
    )`;
  }

  private financeListSql(
    filters: string[],
    limitIndex: number,
    offsetIndex: number
  ): string {
    return `${this.financeCteSql(filters)}
      SELECT "bookingId", "bookingCode", "totalAmount", "paidAmount",
             "refundedAmount", "waivedAmount", "balanceAmount"
      FROM finance
      ORDER BY "createTime" DESC, "bookingId" ASC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
  }

  private financeCountSql(filters: string[]): string {
    return `${this.financeCteSql(filters)}
      SELECT count(*)::int AS total FROM finance`;
  }
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
