import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { DataSource } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import { PropertyTaskProjectionRepository } from "./property-task.projection.repository";

const DEFAULT_INTERVAL_MS = 60_000;

interface ReconcileCandidate {
  scope: TenantParkScope;
  sourceType: string;
  sourceId: string;
  authorityUpdatedAt: string | null;
  authorityDeleted: boolean;
  headUpdatedAt: string | null;
}

interface ReconcileCursor extends TenantParkScope {
  sourceType: string;
  sourceId: string;
}

@Injectable()
export class PropertyTaskReconciliationScheduler
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PropertyTaskReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private activeRun: Promise<void> | null = null;
  private scanCursor: ReconcileCursor | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly projections: PropertyTaskProjectionRepository,
    private readonly orchestrator: PropertyTaskOrchestrator
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.PROPERTY_TASK_RECONCILIATION_ENABLED === "false" || process.env.NODE_ENV === "test") {
      return;
    }
    const configured = Number(process.env.PROPERTY_TASK_RECONCILIATION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured >= 5_000
      ? configured : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 2_000).unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.activeRun;
  }

  async run(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    const cycle = this.runCycle();
    this.activeRun = cycle;
    try {
      await cycle;
    } catch (error) {
      this.logger.warn(
        `Property task reconciliation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.running = false;
      this.activeRun = null;
    }
  }

  private async runCycle(): Promise<void> {
    const candidates = await this.scan(200);
    for (const candidate of candidates) {
      if (this.stopping) break;
      try {
        await this.reconcile(candidate);
      } catch (error) {
        this.logger.warn(
          `Property task source reconcile failed for ${candidate.sourceType}/${candidate.sourceId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private async scan(limit: number): Promise<ReconcileCandidate[]> {
    const cursor = this.scanCursor;
    const rows = await this.dataSource.query(
      `WITH authority AS (
         SELECT tenant_id,park_id,'homestay_turnover'::text source_type,id source_id,
                update_time,is_deleted FROM biz_homestay_turnover_task
         UNION ALL SELECT tenant_id,park_id,'housing_lease',id,update_time,is_deleted
           FROM biz_housing_lease
         UNION ALL SELECT tenant_id,park_id,'housing_handover',id,update_time,is_deleted
           FROM biz_housing_handover
         UNION ALL SELECT tenant_id,park_id,'housing_billing',id,update_time,is_deleted
           FROM biz_housing_receivable
         UNION ALL SELECT tenant_id,park_id,'housing_purchase',id,update_time,is_deleted
           FROM biz_housing_purchase
       ), projection_counts AS (
         SELECT tenant_id,park_id,source_type,source_id,count(*)::integer projected_count
           FROM biz_property_task_projection
          GROUP BY tenant_id,park_id,source_type,source_id
       ), candidates AS (
         SELECT coalesce(a.tenant_id,h.tenant_id) tenant_id,
                coalesce(a.park_id,h.park_id) park_id,
                coalesce(a.source_type,h.source_type) source_type,
                coalesce(a.source_id,h.source_id) source_id,
                a.update_time authority_updated_at,
                coalesce(a.is_deleted,true) authority_deleted,
                h.updated_at head_updated_at,
                coalesce(p.projected_count,0) projected_count
           FROM authority a
           FULL JOIN biz_property_task_projection_head h
             ON h.tenant_id=a.tenant_id AND h.park_id=a.park_id
            AND h.source_type=a.source_type AND h.source_id=a.source_id
           LEFT JOIN projection_counts p
             ON p.tenant_id=coalesce(a.tenant_id,h.tenant_id)
            AND p.park_id=coalesce(a.park_id,h.park_id)
            AND p.source_type=coalesce(a.source_type,h.source_type)
            AND p.source_id=coalesce(a.source_id,h.source_id)
          WHERE h.id IS NULL
             OR (a.source_id IS NULL AND coalesce(p.projected_count,0)>0)
             OR (a.is_deleted=true AND coalesce(p.projected_count,0)>0)
             OR (a.is_deleted=false AND a.update_time>h.updated_at)
       )
       SELECT tenant_id AS "tenantId",park_id AS "parkId",source_type AS "sourceType",
              source_id AS "sourceId",authority_updated_at AS "authorityUpdatedAt",
              authority_deleted AS "authorityDeleted",head_updated_at AS "headUpdatedAt"
         FROM candidates
        WHERE $1::text IS NULL OR (tenant_id,park_id,source_type,source_id)>
          ($1::text,$2::text,$3::text,$4::uuid)
        ORDER BY tenant_id,park_id,source_type,source_id
        LIMIT $5`,
      [
        cursor?.tenantId ?? null,
        cursor?.parkId ?? null,
        cursor?.sourceType ?? null,
        cursor?.sourceId ?? null,
        Math.min(Math.max(limit, 1), 500)
      ]
    ) as Array<ReconcileCursor & {
      authorityUpdatedAt: Date | string | null;
      authorityDeleted: boolean;
      headUpdatedAt: Date | string | null;
    }>;
    const last = rows.at(-1);
    this.scanCursor = rows.length === limit && last
      ? { tenantId: last.tenantId, parkId: last.parkId,
          sourceType: last.sourceType, sourceId: last.sourceId }
      : null;
    return rows.map((row) => ({
      scope: { tenantId: row.tenantId, parkId: row.parkId },
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      authorityUpdatedAt: row.authorityUpdatedAt
        ? new Date(row.authorityUpdatedAt).toISOString() : null,
      authorityDeleted: row.authorityDeleted,
      headUpdatedAt: row.headUpdatedAt ? new Date(row.headUpdatedAt).toISOString() : null
    }));
  }

  private async reconcile(candidate: ReconcileCandidate): Promise<void> {
    const current = await this.dataSource.transaction("READ COMMITTED", async (manager) => {
      const rows = await this.projections.findBySource(
        manager, candidate.scope, candidate.sourceType, candidate.sourceId
      );
      const projectionVersion = await this.projections.currentHeadVersion(
        manager, candidate.scope, candidate.sourceType, candidate.sourceId
      );
      return { rows, projectionVersion };
    });
    if (candidate.authorityDeleted && current.rows.length === 0) return;
    const fingerprint = createHash("sha256").update(JSON.stringify({
      ...candidate.scope,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      authorityUpdatedAt: candidate.authorityUpdatedAt,
      authorityDeleted: candidate.authorityDeleted,
      headUpdatedAt: candidate.headUpdatedAt,
      expectedProjectionVersion: current.projectionVersion
    })).digest("hex");
    await this.orchestrator.reconcile(candidate.scope, {
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      expectedProjectionVersion: current.projectionVersion,
      clientKey: `property-task-reconcile:${fingerprint}`,
      reason: "periodic-authority-reconciliation"
    });
  }
}
