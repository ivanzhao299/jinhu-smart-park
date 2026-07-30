import { Injectable, NotFoundException } from "@nestjs/common";
import {
  SYSTEM_PERMISSIONS,
  type HousingBillingListResponse,
  type HousingFinanceListResponse,
  type HousingHandoverDetailResponse,
  type HousingHandoverListResponse,
  type HousingRepairDetailResponse,
  type HousingRepairListResponse,
  type HousingTaskListResponse,
  type PropertyWorkbenchFileRef,
  type PropertyWorkbenchTaskItem,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type {
  HousingBillingQueryDto,
  HousingFinanceQueryDto,
  HousingHandoverQueryDto,
  HousingRepairQueryDto,
  HousingTaskQueryDto,
  HousingWorkbenchPageQueryDto
} from "./dto/housing.dto";
import { formatHousingMoney } from "./housing-finance.policy";
import { maskHousingCredential } from "./housing-projection.policy";

type HandoverRow = {
  id: string;
  leaseId: string;
  leaseCode: string;
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
  handoverType: "move_in" | "move_out";
  status: string;
  handoverAt: Date | string | null;
  meterReadings: ReadonlyArray<Record<string, unknown>>;
  itemSnapshot: ReadonlyArray<Record<string, unknown>>;
  credentials: ReadonlyArray<Record<string, unknown>>;
  photoFileIds: string[];
  remark: string | null;
  damageAmount: string;
  unsettledAmount: string;
  depositDeductionAmount: string;
};

type RepairRow = {
  id: string;
  leaseId: string;
  leaseCode: string;
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
  woCode: string;
  title: string;
  priority: string;
  urgency: string | null;
  status: string;
  assigneeName: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  createBy: string | null;
  overdueFlag: boolean;
  createTime: Date | string;
  description: string | null;
  imageFileIds: string[];
};

const TASK_CTE = `WITH task AS (
  SELECT lease.id, 'housing_lease'::text AS "sourceType", lease.id AS "sourceId",
         ('租约 · ' || lease.lease_code) AS title,
         CASE WHEN lease.status IN ('pending_approval', 'pending_signature') THEN 'pending'
              WHEN lease.status = 'checkout_pending' THEN 'active' ELSE 'completed' END AS status,
         NULL::uuid AS "assigneeId", lease.end_date::timestamp AT TIME ZONE 'Asia/Shanghai' AS "dueAt",
         lease.unit_id AS "unitId", NULL::uuid AS "reporterId", NULL::uuid AS "createdBy"
  FROM biz_housing_lease lease
  WHERE lease.tenant_id=$1 AND lease.park_id=$2 AND lease.is_deleted=false
    AND lease.status IN ('pending_approval', 'pending_signature', 'checkout_pending')
  UNION ALL
  SELECT handover.id, 'housing_handover', handover.id,
         ('交割 · ' || lease.lease_code || ' · ' || handover.handover_type),
         CASE WHEN handover.status='completed' THEN 'completed' ELSE 'pending' END,
         NULL::uuid, COALESCE(handover.handover_at, handover.create_time), lease.unit_id,
         NULL::uuid, NULL::uuid
  FROM biz_housing_handover handover
  JOIN biz_housing_lease lease ON lease.id=handover.lease_id
    AND lease.tenant_id=handover.tenant_id AND lease.park_id=handover.park_id AND lease.is_deleted=false
  WHERE handover.tenant_id=$1 AND handover.park_id=$2 AND handover.is_deleted=false
  UNION ALL
  SELECT work_order.id, 'housing_repair', work_order.id,
         ('报修 · ' || work_order.wo_code || ' · ' || work_order.title),
         CASE WHEN work_order.status IN ('60','70','100') THEN 'completed'
              WHEN work_order.overdue_flag THEN 'exception' ELSE 'active' END,
         work_order.assignee_id, COALESCE(work_order.finish_time, work_order.create_time), lease.unit_id,
         work_order.reporter_id, work_order.create_by
  FROM biz_work_order work_order
  JOIN biz_housing_lease lease ON lease.id::text=work_order.source_id
    AND lease.tenant_id=work_order.tenant_id AND lease.park_id=work_order.park_id AND lease.is_deleted=false
  WHERE work_order.tenant_id=$1 AND work_order.park_id=$2 AND work_order.is_deleted=false
    AND work_order.source_type='tenant_request'
  UNION ALL
  SELECT receivable.id, 'housing_billing', receivable.id,
         ('账单 · ' || lease.lease_code || ' · ' || receivable.charge_type),
         CASE WHEN receivable.status IN ('paid','waived','void') THEN 'completed'
              WHEN receivable.due_date < CURRENT_DATE THEN 'exception' ELSE 'pending' END,
         NULL::uuid, receivable.due_date::timestamp AT TIME ZONE 'Asia/Shanghai', lease.unit_id,
         NULL::uuid, NULL::uuid
  FROM biz_housing_receivable receivable
  JOIN biz_housing_lease lease ON lease.id=receivable.lease_id
    AND lease.tenant_id=receivable.tenant_id AND lease.park_id=receivable.park_id AND lease.is_deleted=false
  WHERE receivable.tenant_id=$1 AND receivable.park_id=$2 AND receivable.is_deleted=false
    AND receivable.status NOT IN ('paid','waived','void')
  UNION ALL
  SELECT purchase.id, 'housing_purchase', purchase.id,
         ('采购 · ' || purchase.purchase_code || ' · ' || purchase.vendor_name),
         CASE WHEN purchase.approval_status='draft' THEN 'pending'
              WHEN purchase.payment_status='unpaid' THEN 'active' ELSE 'completed' END,
         NULL::uuid, purchase.purchase_date::timestamp AT TIME ZONE 'Asia/Shanghai', purchase.unit_id,
         NULL::uuid, NULL::uuid
  FROM biz_housing_purchase purchase
  WHERE purchase.tenant_id=$1 AND purchase.park_id=$2 AND purchase.is_deleted=false
    AND (purchase.approval_status='draft' OR purchase.payment_status='unpaid')
)`;

@Injectable()
export class HousingWorkbenchQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataScopeService: DataScopeService
  ) {}

  async listTasks(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingTaskQueryDto
  ): Promise<HousingTaskListResponse> {
    const access = await this.resolveUnitAccess(scope, actor, query);
    if (access.empty) return this.emptyPage(query);
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const filters = this.taskFilters(parameters, access.unitIds, query);
    await this.applyTaskActorScope(parameters, filters, actor);
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `${TASK_CTE} SELECT id, "sourceType", "sourceId", title, status, "assigneeId", "dueAt"
         FROM task${this.where(filters)} ORDER BY "dueAt" ASC NULLS LAST, id ASC
         LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, query.page_size, this.offset(query)]
      ) as Promise<Array<PropertyWorkbenchTaskItem & { dueAt: Date | string | null }>>,
      this.dataSource.query(
        `${TASK_CTE} SELECT count(*)::int AS total FROM task${this.where(filters)}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return this.page(rows.map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      title: row.title,
      status: row.status,
      assigneeId: row.assigneeId,
      dueAt: this.toIso(row.dueAt)
    })), countRows, query);
  }

  async listHandovers(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingHandoverQueryDto
  ): Promise<HousingHandoverListResponse> {
    const access = await this.resolveUnitAccess(scope, actor, query);
    if (access.empty) return this.emptyPage(query);
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const filters = this.handoverFilters(parameters, access.unitIds, query);
    const select = this.handoverSelect();
    const from = this.handoverFrom();
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `${select} ${from}${this.where(filters)}
         ORDER BY handover.create_time DESC, handover.id ASC
         LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, query.page_size, this.offset(query)]
      ) as Promise<HandoverRow[]>,
      this.dataSource.query(
        `SELECT count(*)::int AS total ${from}${this.where(filters)}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return this.page(rows.map((row) => this.handoverProjection(row, actor)), countRows, query);
  }

  async getHandover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HousingHandoverDetailResponse> {
    const rows = await this.dataSource.query(
      `${this.handoverSelect()} ${this.handoverFrom()}
       WHERE handover.tenant_id=$1 AND handover.park_id=$2
         AND handover.id=$3 AND handover.is_deleted=false AND lease.is_deleted=false`,
      [scope.tenantId, scope.parkId, id]
    ) as HandoverRow[];
    const row = rows[0];
    if (!row) throw new NotFoundException("Housing handover not found");
    await this.unitAccessService.assertAccess(scope, actor, row.unitId);
    const result = this.handoverProjection(row, actor);
    if (!this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)) return result;
    return { ...result, photo_files: await this.fileRefs(scope, row.photoFileIds, row.leaseId, [
      "housing_handover", "housing_handover_move_in", "housing_handover_move_out"
    ]) };
  }

  async listBilling(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingBillingQueryDto
  ): Promise<HousingBillingListResponse> {
    const result = await this.listLeaseAggregates(scope, actor, query, "billing");
    return result as HousingBillingListResponse;
  }

  async listFinance(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingFinanceQueryDto
  ): Promise<HousingFinanceListResponse> {
    const result = await this.listLeaseAggregates(scope, actor, query, "finance");
    return result as HousingFinanceListResponse;
  }

  async listRepairs(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingRepairQueryDto
  ): Promise<HousingRepairListResponse> {
    const access = await this.resolveUnitAccess(scope, actor, query);
    if (access.empty) return this.emptyPage(query);
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const filters = this.repairFilters(parameters, access.unitIds, query);
    await this.applyRepairActorScope(parameters, filters, actor);
    const select = this.repairSelect();
    const from = this.repairFrom();
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `${select} ${from}${this.where(filters)}
         ORDER BY work_order.create_time DESC, work_order.id ASC
         LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, query.page_size, this.offset(query)]
      ) as Promise<RepairRow[]>,
      this.dataSource.query(
        `SELECT count(*)::int AS total ${from}${this.where(filters)}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return this.page(rows.map((row) => this.repairProjection(row)), countRows, query);
  }

  async getRepair(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HousingRepairDetailResponse> {
    const rows = await this.dataSource.query(
      `${this.repairSelect()}, work_order.description ${this.repairFrom()}
       WHERE work_order.tenant_id=$1 AND work_order.park_id=$2
         AND work_order.id=$3 AND work_order.is_deleted=false AND lease.is_deleted=false`,
      [scope.tenantId, scope.parkId, id]
    ) as RepairRow[];
    const row = rows[0];
    if (!row) throw new NotFoundException("Housing repair not found");
    await this.unitAccessService.assertAccess(scope, actor, row.unitId);
    if (!await this.canAccessRepair(row, actor)) {
      throw new NotFoundException("Housing repair not found");
    }
    const result = { ...this.repairProjection(row), description: row.description };
    if (!this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)) return result;
    return {
      ...result,
      evidence: await this.fileRefs(scope, row.imageFileIds, row.leaseId, ["housing_repair"])
    };
  }

  private async listLeaseAggregates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HousingBillingQueryDto | HousingFinanceQueryDto,
    kind: "billing" | "finance"
  ): Promise<HousingBillingListResponse | HousingFinanceListResponse> {
    const access = await this.resolveUnitAccess(scope, actor, query);
    if (access.empty) return this.emptyPage(query);
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const filters = this.leaseFilters(parameters, access.unitIds, query.status);
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        kind === "billing"
          ? this.billingSql(filters, parameters.length)
          : this.financeSql(filters, parameters.length),
        [...parameters, query.page_size, this.offset(query)]
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS total FROM biz_housing_lease lease${this.where(filters)}`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    if (kind === "billing") {
      return this.page(
        (rows as BillingRawRow[]).map((row) => this.billingProjection(row, actor)),
        countRows,
        query
      );
    }
    return this.page(
      (rows as FinanceRawRow[]).map((row) => this.financeProjection(row)),
      countRows,
      query
    );
  }

  private async resolveUnitAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    _query: HousingWorkbenchPageQueryDto
  ): Promise<{ empty: boolean; unitIds: string[] | null }> {
    const unitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    return { empty: unitIds !== null && unitIds.length === 0, unitIds };
  }

  private taskFilters(parameters: unknown[], unitIds: string[] | null, query: HousingTaskQueryDto) {
    const filters = this.unitFilter(parameters, unitIds, `task."unitId"`);
    if (query.status) filters.push(this.parameterFilter(parameters, "task.status", query.status));
    if (query.source_type) filters.push(this.parameterFilter(parameters, `task."sourceType"`, query.source_type));
    return filters;
  }

  private handoverFilters(parameters: unknown[], unitIds: string[] | null, query: HousingHandoverQueryDto) {
    const filters = [
      "handover.tenant_id=$1", "handover.park_id=$2",
      "handover.is_deleted=false", "lease.is_deleted=false",
      ...this.unitFilter(parameters, unitIds, "lease.unit_id")
    ];
    if (query.handover_type) filters.push(this.parameterFilter(parameters, "handover.handover_type", query.handover_type));
    if (query.status) filters.push(this.parameterFilter(parameters, "handover.status", query.status));
    return filters;
  }

  private repairFilters(parameters: unknown[], unitIds: string[] | null, query: HousingRepairQueryDto) {
    const filters = [
      "work_order.tenant_id=$1", "work_order.park_id=$2",
      "work_order.is_deleted=false", "lease.is_deleted=false",
      "work_order.source_type='tenant_request'",
      ...this.unitFilter(parameters, unitIds, "lease.unit_id")
    ];
    if (query.status) filters.push(this.parameterFilter(parameters, "work_order.status", query.status));
    return filters;
  }

  private async applyRepairActorScope(
    parameters: unknown[],
    filters: string[],
    actor: JwtPrincipal
  ): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const handler = await this.dataScopeService.buildScopeFilter(actor, "workorder_handler");
    if (!handler.unrestricted) {
      if (handler.allowed_ids.length === 0) {
        if (handler.scope_types.includes("custom") || handler.scope_types.includes("self")) {
          filters.push("false");
        }
      } else {
        parameters.push(handler.allowed_ids);
        const index = parameters.length;
        filters.push(`(work_order.assignee_id=ANY($${index}::uuid[])
          OR work_order.reporter_id=ANY($${index}::uuid[])
          OR work_order.create_by=ANY($${index}::uuid[]))`);
      }
    }
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) {
      parameters.push(actor.sub);
      const index = parameters.length;
      filters.push(`(work_order.assignee_id=$${index}
        OR work_order.reporter_id=$${index}
        OR work_order.create_by=$${index})`);
    }
  }

  private async applyTaskActorScope(
    parameters: unknown[],
    filters: string[],
    actor: JwtPrincipal
  ): Promise<void> {
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const handler = await this.dataScopeService.buildScopeFilter(actor, "workorder_handler");
    if (!handler.unrestricted) {
      if (handler.allowed_ids.length === 0) {
        if (handler.scope_types.includes("custom") || handler.scope_types.includes("self")) {
          filters.push(`task."sourceType"<>'housing_repair'`);
        }
      } else {
        parameters.push(handler.allowed_ids);
        const index = parameters.length;
        filters.push(`(task."sourceType"<>'housing_repair'
          OR task."assigneeId"=ANY($${index}::uuid[])
          OR task."reporterId"=ANY($${index}::uuid[])
          OR task."createdBy"=ANY($${index}::uuid[]))`);
      }
    }
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) {
      parameters.push(actor.sub);
      const index = parameters.length;
      filters.push(`(task."sourceType"<>'housing_repair'
        OR task."assigneeId"=$${index}
        OR task."reporterId"=$${index}
        OR task."createdBy"=$${index})`);
    }
  }

  private async canAccessRepair(row: RepairRow, actor: JwtPrincipal): Promise<boolean> {
    if (actor.isSuper || actor.permissions.includes("*")) return true;
    const involvedIds = [row.assigneeId, row.reporterId, row.createBy].filter(
      (id): id is string => Boolean(id)
    );
    const handler = await this.dataScopeService.buildScopeFilter(actor, "workorder_handler");
    if (!handler.unrestricted) {
      if (!handler.allowed_ids.some((id) => involvedIds.includes(id))) return false;
    }
    return actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)
      || involvedIds.includes(actor.sub);
  }

  private leaseFilters(parameters: unknown[], unitIds: string[] | null, status?: string) {
    const filters = [
      "lease.tenant_id=$1", "lease.park_id=$2", "lease.is_deleted=false",
      ...this.unitFilter(parameters, unitIds, "lease.unit_id")
    ];
    if (status) filters.push(this.parameterFilter(parameters, "lease.status", status));
    return filters;
  }

  private unitFilter(parameters: unknown[], unitIds: string[] | null, column: string): string[] {
    if (unitIds === null) return [];
    parameters.push(unitIds);
    return [`${column}=ANY($${parameters.length}::uuid[])`];
  }

  private parameterFilter(parameters: unknown[], column: string, value: unknown): string {
    parameters.push(value);
    return `${column}=$${parameters.length}`;
  }

  private handoverSelect(): string {
    return `SELECT handover.id, handover.lease_id AS "leaseId", lease.lease_code AS "leaseCode",
      lease.unit_id AS "unitId", unit.unit_code AS "unitCode", unit.unit_name AS "unitName",
      handover.handover_type AS "handoverType", handover.status, handover.handover_at AS "handoverAt",
      handover.meter_readings AS "meterReadings", handover.item_snapshot AS "itemSnapshot",
      handover.credentials, handover.photo_file_ids AS "photoFileIds", handover.remark,
      handover.damage_amount AS "damageAmount", handover.unsettled_amount AS "unsettledAmount",
      handover.deposit_deduction_amount AS "depositDeductionAmount"`;
  }

  private handoverFrom(): string {
    return `FROM biz_housing_handover handover
      JOIN biz_housing_lease lease ON lease.id=handover.lease_id
       AND lease.tenant_id=handover.tenant_id AND lease.park_id=handover.park_id
      LEFT JOIN biz_unit unit ON unit.id=lease.unit_id
       AND unit.tenant_id=lease.tenant_id AND unit.park_id=lease.park_id AND unit.is_deleted=false`;
  }

  private repairSelect(): string {
    return `SELECT work_order.id, lease.id AS "leaseId", lease.lease_code AS "leaseCode",
      lease.unit_id AS "unitId", unit.unit_code AS "unitCode", unit.unit_name AS "unitName",
      work_order.wo_code AS "woCode", work_order.title, work_order.priority, work_order.urgency,
      work_order.status, work_order.assignee_name AS "assigneeName",
      work_order.assignee_id AS "assigneeId", work_order.reporter_id AS "reporterId",
      work_order.create_by AS "createBy",
      work_order.overdue_flag AS "overdueFlag", work_order.create_time AS "createTime",
      work_order.image_file_ids AS "imageFileIds"`;
  }

  private repairFrom(): string {
    return `FROM biz_work_order work_order
      JOIN biz_housing_lease lease ON lease.id::text=work_order.source_id
       AND lease.tenant_id=work_order.tenant_id AND lease.park_id=work_order.park_id
      LEFT JOIN biz_unit unit ON unit.id=lease.unit_id
       AND unit.tenant_id=lease.tenant_id AND unit.park_id=lease.park_id AND unit.is_deleted=false`;
  }

  private handoverProjection(row: HandoverRow, actor: JwtPrincipal) {
    const finance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    return {
      id: row.id,
      leaseId: row.leaseId,
      leaseCode: row.leaseCode,
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitName: row.unitName,
      handoverType: row.handoverType,
      status: row.status,
      handoverAt: this.toIso(row.handoverAt),
      meterReadings: row.meterReadings ?? [],
      itemSnapshot: row.itemSnapshot ?? [],
      ...(this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE)
        ? { credentials: (row.credentials ?? []).map(maskHousingCredential) }
        : {}),
      remark: row.remark,
      ...(finance ? {
        damageAmount: formatHousingMoney(row.damageAmount),
        unsettledAmount: formatHousingMoney(row.unsettledAmount),
        depositDeductionAmount: formatHousingMoney(row.depositDeductionAmount)
      } : {})
    };
  }

  private repairProjection(row: RepairRow) {
    return {
      id: row.id,
      leaseId: row.leaseId,
      leaseCode: row.leaseCode,
      unitId: row.unitId,
      unitCode: row.unitCode,
      unitName: row.unitName,
      woCode: row.woCode,
      title: row.title,
      priority: row.priority,
      urgency: row.urgency,
      status: row.status,
      assigneeName: row.assigneeName,
      overdueFlag: row.overdueFlag,
      createTime: this.toIso(row.createTime) ?? ""
    };
  }

  private async fileRefs(
    scope: TenantParkScope,
    ids: string[],
    bizId: string,
    bizTypes: string[]
  ): Promise<PropertyWorkbenchFileRef[]> {
    if (!ids.length) return [];
    const rows = await this.dataSource.query(
      `SELECT id, original_name AS "originalName", mime_type AS "mimeType", file_size AS "fileSize"
       FROM sys_file WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[])
         AND biz_id=$4 AND biz_type=ANY($5::text[]) AND status=1 AND is_deleted=false
       ORDER BY create_time ASC, id ASC`,
      [scope.tenantId, scope.parkId, ids, bizId, bizTypes]
    ) as PropertyWorkbenchFileRef[];
    const byId = new Map(rows.map((row) => [row.id, {
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      fileSize: row.fileSize
    }]));
    return ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  }

  private billingSql(filters: string[], parameterCount: number): string {
    return `${this.leaseProjectionSelect()},
      COALESCE(plan.items, '[]'::jsonb) AS "chargePlans",
      COALESCE(receivable.items, '[]'::jsonb) AS receivables
      FROM biz_housing_lease lease
      ${this.leaseDisplayJoins()}
      LEFT JOIN LATERAL (${this.chargePlanAggregateSql()}) plan ON true
      LEFT JOIN LATERAL (${this.receivableAggregateSql()}) receivable ON true
      ${this.where(filters)} ORDER BY lease.start_date DESC, lease.id ASC
      LIMIT $${parameterCount + 1} OFFSET $${parameterCount + 2}`;
  }

  private financeSql(filters: string[], parameterCount: number): string {
    return `${this.leaseProjectionSelect()},
      COALESCE(receivable.receivable,0)::text AS receivable,
      COALESCE(receivable.paid,0)::text AS paid,
      COALESCE(receivable.waived,0)::text AS waived,
      COALESCE(deposit.balance,0)::text AS "depositBalance"
      FROM biz_housing_lease lease
      ${this.leaseDisplayJoins()}
      LEFT JOIN LATERAL (${this.financeReceivableAggregateSql()}) receivable ON true
      LEFT JOIN LATERAL (${this.depositAggregateSql()}) deposit ON true
      ${this.where(filters)} ORDER BY lease.start_date DESC, lease.id ASC
      LIMIT $${parameterCount + 1} OFFSET $${parameterCount + 2}`;
  }

  private leaseProjectionSelect(): string {
    return `SELECT lease.id, lease.lease_code AS "leaseCode", lease.unit_id AS "unitId",
      lease.tenant_party_id AS "tenantPartyId", lease.start_date AS "startDate",
      lease.end_date AS "endDate", lease.status,
      lease.payment_cycle_months AS "paymentCycleMonths",
      lease.signature_file_id AS "signatureFileId",
      unit.unit_code AS "unitCode", unit.unit_name AS "unitName",
      party.display_name AS "tenantDisplayName"`;
  }

  private leaseDisplayJoins(): string {
    return `LEFT JOIN biz_unit unit ON unit.id=lease.unit_id
       AND unit.tenant_id=lease.tenant_id AND unit.park_id=lease.park_id AND unit.is_deleted=false
      LEFT JOIN biz_party party ON party.id=lease.tenant_party_id
       AND party.tenant_id=lease.tenant_id AND party.park_id=lease.park_id AND party.is_deleted=false`;
  }

  private chargePlanAggregateSql(): string {
    return `SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'leaseId', p.lease_id, 'chargeType', p.charge_type,
      'billingSource', p.billing_source, 'cycleMonths', p.cycle_months,
      'amount', p.amount, 'unitPrice', p.unit_price, 'meterId', p.meter_id, 'enabled', p.enabled
    ) ORDER BY p.create_time, p.id) AS items
    FROM biz_housing_charge_plan p WHERE p.tenant_id=lease.tenant_id
      AND p.park_id=lease.park_id AND p.lease_id=lease.id AND p.is_deleted=false`;
  }

  private receivableAggregateSql(): string {
    return `SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'leaseId', r.lease_id, 'chargeType', r.charge_type,
      'periodStart', r.period_start, 'periodEnd', r.period_end, 'dueDate', r.due_date,
      'amount', r.amount, 'paidAmount', r.paid_amount, 'waivedAmount', r.waived_amount,
      'status', r.status
    ) ORDER BY r.due_date, r.id) AS items
    FROM biz_housing_receivable r WHERE r.tenant_id=lease.tenant_id
      AND r.park_id=lease.park_id AND r.lease_id=lease.id AND r.is_deleted=false`;
  }

  private financeReceivableAggregateSql(): string {
    return `SELECT sum(r.amount) FILTER (WHERE r.status<>'void') AS receivable,
      sum(r.paid_amount) FILTER (WHERE r.status<>'void') AS paid,
      sum(r.waived_amount) FILTER (WHERE r.status<>'void') AS waived
    FROM biz_housing_receivable r WHERE r.tenant_id=lease.tenant_id
      AND r.park_id=lease.park_id AND r.lease_id=lease.id AND r.is_deleted=false`;
  }

  private depositAggregateSql(): string {
    return `SELECT sum(CASE
      WHEN l.entry_type='deposit_receipt' THEN l.amount
      WHEN l.entry_type IN ('deposit_refund','deposit_deduction') THEN -l.amount ELSE 0 END) AS balance
    FROM biz_housing_ledger_entry l WHERE l.tenant_id=lease.tenant_id
      AND l.park_id=lease.park_id AND l.lease_id=lease.id
      AND l.status='confirmed' AND l.is_deleted=false`;
  }

  private billingProjection(row: BillingRawRow, actor: JwtPrincipal) {
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
    return {
      lease: this.leaseProjection(row),
      charge_plans: (row.chargePlans ?? []).map((plan) => ({
        id: plan.id,
        leaseId: plan.leaseId,
        chargeType: plan.chargeType,
        billingSource: plan.billingSource,
        cycleMonths: plan.cycleMonths,
        meterId: plan.meterId,
        enabled: plan.enabled,
        ...(canReadFinance ? {
          amount: plan.amount === null ? null : formatHousingMoney(plan.amount),
          unitPrice: plan.unitPrice === null ? null : String(plan.unitPrice)
        } : {})
      })),
      receivables: (row.receivables ?? []).map((receivable) => ({
        id: receivable.id,
        leaseId: receivable.leaseId,
        chargeType: receivable.chargeType,
        periodStart: receivable.periodStart,
        periodEnd: receivable.periodEnd,
        dueDate: receivable.dueDate,
        status: receivable.status,
        ...(canReadFinance ? {
          amount: formatHousingMoney(receivable.amount),
          paidAmount: formatHousingMoney(receivable.paidAmount),
          waivedAmount: formatHousingMoney(receivable.waivedAmount)
        } : {})
      }))
    };
  }

  private financeProjection(row: FinanceRawRow) {
    const outstanding = this.nonNegativeMoney(row.receivable, row.paid, row.waived);
    return {
      lease: this.leaseProjection(row),
      summary: {
        receivable: formatHousingMoney(row.receivable),
        paid: formatHousingMoney(row.paid),
        waived: formatHousingMoney(row.waived),
        outstanding,
        deposit_balance: formatHousingMoney(row.depositBalance)
      }
    };
  }

  private leaseProjection(row: LeaseRawRow) {
    return {
      id: row.id,
      leaseCode: row.leaseCode,
      unitId: row.unitId,
      tenantPartyId: row.tenantPartyId,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      paymentCycleMonths: Number(row.paymentCycleMonths),
      unitCode: row.unitCode,
      unitName: row.unitName,
      tenantDisplayName: row.tenantDisplayName
    };
  }

  private nonNegativeMoney(receivable: string, paid: string, waived: string): string {
    const cents = this.moneyCents(receivable) - this.moneyCents(paid) - this.moneyCents(waived);
    return this.centsMoney(cents > 0n ? cents : 0n);
  }

  private moneyCents(value: string): bigint {
    const [rawWhole, fraction = ""] = String(value).split(".");
    const whole = rawWhole ?? "0";
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  }

  private centsMoney(value: bigint): string {
    return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
  }

  private where(filters: string[]): string {
    return filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  }

  private offset(query: HousingWorkbenchPageQueryDto): number {
    return (query.page - 1) * query.page_size;
  }

  private emptyPage(query: HousingWorkbenchPageQueryDto) {
    return { items: [], total: 0, page: query.page, page_size: query.page_size };
  }

  private page<T>(
    items: T[],
    countRows: Array<{ total: number }>,
    query: HousingWorkbenchPageQueryDto
  ) {
    return {
      items,
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  private toIso(value: Date | string | null): string | null {
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : String(value);
  }
}

type LeaseRawRow = {
  id: string;
  leaseCode: string;
  unitId: string;
  tenantPartyId: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentCycleMonths: number | string;
  signatureFileId: string | null;
  unitCode: string | null;
  unitName: string | null;
  tenantDisplayName: string | null;
};

type BillingRawRow = LeaseRawRow & {
  chargePlans: Array<{
    id: string; leaseId: string; chargeType: string; billingSource: string;
    cycleMonths: number; amount: string | null; unitPrice: string | null;
    meterId: string | null; enabled: boolean;
  }>;
  receivables: Array<{
    id: string; leaseId: string; chargeType: string; periodStart: string;
    periodEnd: string; dueDate: string; amount: string; paidAmount: string;
    waivedAmount: string; status: string;
  }>;
};

type FinanceRawRow = LeaseRawRow & {
  receivable: string;
  paid: string;
  waived: string;
  depositBalance: string;
};
