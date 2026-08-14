import { ConflictException } from "@nestjs/common";
import type {
  EntityManagerPort,
  PropertyTaskProjectorSource,
  PropertyTaskSourceAccessDescriptor,
  PropertyTaskSourceResolver,
  PropertyTaskSourceSnapshot,
  TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export const HOUSING_LEASE_TASK_RESOLVER = Symbol("HOUSING_LEASE_TASK_RESOLVER");
export const HOUSING_HANDOVER_TASK_RESOLVER = Symbol("HOUSING_HANDOVER_TASK_RESOLVER");
export const HOUSING_BILLING_TASK_RESOLVER = Symbol("HOUSING_BILLING_TASK_RESOLVER");
export const HOUSING_PURCHASE_TASK_RESOLVER = Symbol("HOUSING_PURCHASE_TASK_RESOLVER");
export const HOUSING_REPAIR_TASK_RESOLVER = Symbol("HOUSING_REPAIR_TASK_RESOLVER");

type DerivedRow = {
  id: string;
  version: number;
  lifecycle: "eligible" | "succeeded" | "cancelled";
  title: string;
  sourceLabel: string;
  priority: number;
  dueAt: Date | string | null;
  createTime: Date | string;
  updateTime: Date | string;
};

type HousingTaskConfig = {
  sourceType: "housing_lease" | "housing_handover" | "housing_billing" | "housing_purchase" | "housing_repair";
  taskKind: string;
  queueCode: string;
  kindLabel: string;
  detailPermission: string;
  deepLink: (id: string) => string;
  selectSql: string;
};

export class HousingDerivedTaskResolver implements PropertyTaskSourceResolver,
PropertyTaskProjectorSource {
  readonly assignmentAuthority = "derived" as const;
  readonly sourceType: HousingTaskConfig["sourceType"];
  readonly taskKind: string;
  readonly access: PropertyTaskSourceAccessDescriptor;

  constructor(private readonly config: HousingTaskConfig) {
    this.sourceType = config.sourceType;
    this.taskKind = config.taskKind;
    this.access = {
      tag: "workspace",
      sourceType: config.sourceType,
      requiredModules: ["asset", "housing_rental"],
      surfaceId: "housing:tasks:page",
      pagePermission: "housing:tasks:page",
      queueCode: config.queueCode,
      domainRoute: "/housing/tasks/[taskId]",
      sourceDetailPermission: config.detailPermission
    };
  }

  async lockAndResolve(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    sourceId: string;
    businessOccurrenceKey: string;
    expectedSourceVersion: number;
    taskKey: string;
  }): Promise<PropertyTaskSourceSnapshot | null> {
    const rows = await this.manager(input.manager).query(
      `${this.config.selectSql} AND source.id=$3 FOR UPDATE OF source`,
      [input.scope.tenantId, input.scope.parkId, input.sourceId]
    ) as DerivedRow[];
    const row = rows[0];
    if (!row) return null;
    if (input.businessOccurrenceKey !== this.occurrence(row.id)
      || input.expectedSourceVersion !== row.version) {
      throw new ConflictException("Property task source version changed");
    }
    return this.snapshot(row);
  }

  async scanCandidates(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    after: { sourceId: string; businessOccurrenceKey: string } | null;
    limit: number;
  }) {
    const rows = await this.manager(input.manager).query(
      `${this.config.selectSql} AND ($3::uuid IS NULL OR source.id>$3::uuid)
       ORDER BY source.id LIMIT $4`,
      [input.scope.tenantId, input.scope.parkId, input.after?.sourceId ?? null, input.limit]
    ) as DerivedRow[];
    const items = rows.map((row) => this.snapshot(row));
    const last = rows.at(-1);
    return {
      items,
      next: rows.length === input.limit && last
        ? { sourceId: last.id, businessOccurrenceKey: this.occurrence(last.id) }
        : null
    };
  }

  private snapshot(row: DerivedRow): PropertyTaskSourceSnapshot {
    return {
      sourceId: row.id,
      sourceVersion: row.version,
      lifecycle: row.lifecycle,
      businessOccurrenceKey: this.occurrence(row.id),
      title: row.title,
      kindLabel: this.config.kindLabel,
      sourceLabel: row.sourceLabel,
      priority: Number(row.priority),
      dueAt: row.dueAt ? this.time(row.dueAt) : null,
      sourceDeepLink: this.config.deepLink(row.id),
      owningAssignment: null
    };
  }

  private occurrence(id: string): string {
    return `${this.sourceType.replaceAll("_", "-")}:${id}`;
  }

  private manager(port: EntityManagerPort): EntityManager {
    const manager = port.transactionContext;
    if (!(manager && typeof manager === "object" && "query" in manager)) {
      throw new ConflictException("Property task runtime is unavailable");
    }
    return manager as EntityManager;
  }

  private time(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}

const LEASE_SQL = `SELECT source.id::text AS id,source.version,
  CASE WHEN source.status='void' THEN 'cancelled'
       WHEN source.status IN ('pending_approval','pending_signature','checkout_pending') THEN 'eligible'
       ELSE 'succeeded' END AS lifecycle,
  ('租约 · ' || source.lease_code) AS title,source.lease_code AS "sourceLabel",
  CASE WHEN source.status='checkout_pending' THEN 90 ELSE 60 END AS priority,
  source.end_date::timestamp AT TIME ZONE 'Asia/Shanghai' AS "dueAt",
  source.create_time AS "createTime",source.update_time AS "updateTime"
 FROM biz_housing_lease source
 WHERE source.tenant_id=$1 AND source.park_id=$2 AND source.is_deleted=false
   AND source.status<>'draft'`;

const HANDOVER_SQL = `SELECT source.id::text AS id,source.version,
  CASE WHEN source.status='completed' THEN 'succeeded' ELSE 'eligible' END AS lifecycle,
  ('交接 · ' || lease.lease_code || ' · ' || source.handover_type) AS title,
  (lease.lease_code || ' · ' || source.handover_type) AS "sourceLabel",
  CASE WHEN source.handover_type='move_out' THEN 80 ELSE 50 END AS priority,
  COALESCE(source.handover_at,source.create_time) AS "dueAt",
  source.create_time AS "createTime",source.update_time AS "updateTime"
 FROM biz_housing_handover source
 JOIN biz_housing_lease lease ON lease.tenant_id=source.tenant_id
  AND lease.park_id=source.park_id AND lease.id=source.lease_id AND lease.is_deleted=false
 WHERE source.tenant_id=$1 AND source.park_id=$2 AND source.is_deleted=false`;

const BILLING_SQL = `SELECT source.id::text AS id,source.version,
  CASE WHEN source.status='void' THEN 'cancelled'
       WHEN source.status IN ('paid','waived') THEN 'succeeded' ELSE 'eligible' END AS lifecycle,
  ('账单 · ' || lease.lease_code || ' · ' || source.charge_type) AS title,
  (lease.lease_code || ' · ' || source.charge_type) AS "sourceLabel",
  CASE WHEN source.status NOT IN ('paid','waived','void') AND source.due_date<CURRENT_DATE THEN 100 ELSE 55 END AS priority,
  source.due_date::timestamp AT TIME ZONE 'Asia/Shanghai' AS "dueAt",
  source.create_time AS "createTime",source.update_time AS "updateTime"
 FROM biz_housing_receivable source
 JOIN biz_housing_lease lease ON lease.tenant_id=source.tenant_id
  AND lease.park_id=source.park_id AND lease.id=source.lease_id AND lease.is_deleted=false
 WHERE source.tenant_id=$1 AND source.park_id=$2 AND source.is_deleted=false`;

const PURCHASE_SQL = `SELECT source.id::text AS id,source.version,
  CASE WHEN source.approval_status='void' THEN 'cancelled'
       WHEN source.approval_status='draft' OR
            (source.approval_status='approved' AND source.payment_status='unpaid') THEN 'eligible'
       ELSE 'succeeded' END AS lifecycle,
  ('采购 · ' || source.purchase_code || ' · ' || source.vendor_name) AS title,
  (source.purchase_code || ' · ' || source.vendor_name) AS "sourceLabel",
  CASE WHEN source.approval_status='draft' THEN 65 ELSE 50 END AS priority,
  source.purchase_date::timestamp AT TIME ZONE 'Asia/Shanghai' AS "dueAt",
  source.create_time AS "createTime",source.update_time AS "updateTime"
 FROM biz_housing_purchase source
 WHERE source.tenant_id=$1 AND source.park_id=$2 AND source.is_deleted=false`;

const REPAIR_SQL = `SELECT source.id::text AS id,source.version,
  'eligible'::text AS lifecycle,
  ('报修 · ' || source.wo_code || ' · ' || source.title) AS title,
  (source.wo_code || ' · ' || source.title) AS "sourceLabel",
  CASE WHEN source.overdue_flag THEN 95 ELSE 70 END AS priority,
  CASE WHEN source.status='10'
       THEN source.create_time + ((COALESCE(source.sla_dispatch_min,30))::text || ' minutes')::interval
       WHEN source.status IN ('20','30','40','45','80')
       THEN COALESCE(source.accept_time,source.dispatch_time,source.create_time)
            + ((COALESCE(source.sla_finish_min,240))::text || ' minutes')::interval
       ELSE NULL END AS "dueAt",
  source.create_time AS "createTime",source.update_time AS "updateTime"
 FROM biz_work_order source
 JOIN biz_housing_lease lease ON lease.id::text=source.source_id
  AND lease.tenant_id=source.tenant_id AND lease.park_id=source.park_id AND lease.is_deleted=false
 WHERE source.tenant_id=$1 AND source.park_id=$2 AND source.is_deleted=false
   AND source.source_type='tenant_request'
   AND source.status IN ('10','20','30','40','45','50','80','91')`;

export function createHousingTaskResolvers() {
  return {
    lease: new HousingDerivedTaskResolver({
      sourceType: "housing_lease", taskKind: "lease_follow_up", queueCode: "housing_lease",
      kindLabel: "租约跟进", detailPermission: "housing:lease:read",
      deepLink: (id) => `/housing/leases/${id}`, selectSql: LEASE_SQL
    }),
    handover: new HousingDerivedTaskResolver({
      sourceType: "housing_handover", taskKind: "handover", queueCode: "housing_handover",
      kindLabel: "住房交接", detailPermission: "housing:handover:read",
      deepLink: (id) => `/housing/handovers/${id}`, selectSql: HANDOVER_SQL
    }),
    billing: new HousingDerivedTaskResolver({
      sourceType: "housing_billing", taskKind: "billing", queueCode: "housing_billing",
      kindLabel: "住房账单", detailPermission: "housing:billing:read",
      deepLink: (id) => `/housing/billing?receivable_id=${id}`, selectSql: BILLING_SQL
    }),
    purchase: new HousingDerivedTaskResolver({
      sourceType: "housing_purchase", taskKind: "purchase", queueCode: "housing_purchase",
      kindLabel: "住房采购", detailPermission: "housing:purchase:read",
      deepLink: (id) => `/housing/purchases/${id}`, selectSql: PURCHASE_SQL
    }),
    repair: new HousingDerivedTaskResolver({
      sourceType: "housing_repair", taskKind: "repair", queueCode: "housing_repair",
      kindLabel: "住房报修", detailPermission: "housing:repair:read",
      deepLink: (id) => `/housing/repairs/${id}`, selectSql: REPAIR_SQL
    })
  };
}
