import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import type { EntityManagerPort, TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { createHousingTaskResolvers } from "../housing/housing-task.adapter";
import { DatabasePropertyMutationReceiptAdapter } from
  "../property-approvals/property-mutation-receipt.adapter";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import { PropertyTaskAssignmentRepository } from "./property-task.assignment.repository";
import { PropertyTaskMapper } from "./property-task.mapper";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import { PropertyTaskProjectionRepository } from "./property-task.projection.repository";
import { PropertyTaskReconciliationScheduler } from
  "./property-task.reconciliation.scheduler";
import { PropertyTaskSourceRegistryProvider } from "./property-task.registry";

const pgUrl = process.env.PROPERTY_TASK_RECONCILIATION_PG_URL
  ?? process.env.PROPERTY_B2A_C4_PG_URL;
const gateRequired = process.env.PROPERTY_TASK_PG_GATE_REQUIRED === "1";
const disposable = process.env.PROPERTY_TASK_PG_DISPOSABLE === "1";

if (gateRequired && !pgUrl) {
  throw new Error("PROPERTY_TASK_RECONCILIATION_PG_URL is required for the PostgreSQL gate");
}
if (pgUrl && !disposable) {
  throw new Error("PROPERTY_TASK_PG_DISPOSABLE=1 is required for the mutating PostgreSQL gate");
}

const describePg = pgUrl ? describe : describe.skip;

describePg("PropertyTaskReconciliationScheduler PostgreSQL parameter typing", () => {
  const runId = randomUUID().replaceAll("-", "");
  const scope: TenantParkScope = {
    tenantId: `420-real-${runId}`,
    parkId: `420-park-${runId}`
  };
  const otherScope: TenantParkScope = {
    tenantId: `420-other-${runId}`,
    parkId: `420-other-park-${runId}`
  };
  const ids = {
    park: randomUUID(), otherPark: randomUUID(),
    building: randomUUID(), floor: randomUUID(), unit: randomUUID(),
    party: randomUUID(), lease: randomUUID(), handover: randomUUID(),
    billing: randomUUID(), purchase: randomUUID(), repair: randomUUID(),
    otherPurchase: randomUUID()
  };
  let dataSource: DataSource;

  before(async () => {
    dataSource = new DataSource({ type: "postgres", url: pgUrl, entities: [] });
    await dataSource.initialize();
    const version = await dataSource.query("SHOW server_version_num") as Array<{
      server_version_num: string;
    }>;
    assert.equal(Math.floor(Number(version[0]?.server_version_num) / 10_000), 16);
    const runtimeObjects = await dataSource.query(
      `SELECT to_regclass('public.biz_housing_lease') IS NOT NULL AS lease,
              to_regclass('public.biz_property_task_assignment') IS NOT NULL AS assignment,
              to_regclass('public.biz_property_task_projection_head') IS NOT NULL AS head,
              to_regclass('public.biz_property_task_projection') IS NOT NULL AS projection,
              to_regclass('public.biz_property_mutation_receipt') IS NOT NULL AS receipt,
              to_regprocedure('public.fn_property_task_projection_row_hash_v1(jsonb)')
                IS NOT NULL AS hash`
    ) as Array<Record<string, boolean>>;
    assert.deepEqual(runtimeObjects[0], {
      lease: true, assignment: true, head: true, projection: true,
      receipt: true, hash: true
    });
    await assertScopeResidue(scope, 0);
    await assertScopeResidue(otherScope, 0);
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO biz_park(id,tenant_id,park_id,park_code,park_name,status)
         VALUES($1,$2,$3,$4,'Issue 420 Park',1),
               ($5,$6,$7,$8,'Issue 420 Other Park',1)`,
        [ids.park, scope.tenantId, scope.parkId, `P-${runId}`,
          ids.otherPark, otherScope.tenantId, otherScope.parkId, `OP-${runId}`]
      );
      await manager.query(
        `INSERT INTO biz_building(
           id,tenant_id,park_id,building_code,building_name,floor_count,build_area)
         VALUES($1,$2,$3,$4,'Issue 420 Building',1,100)`,
        [ids.building, scope.tenantId, scope.parkId, `B-${runId}`]
      );
      await manager.query(
        `INSERT INTO biz_floor(
           id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name,floor_area)
         VALUES($1,$2,$3,$4,$5,1,'Issue 420 Floor',100)`,
        [ids.floor, scope.tenantId, scope.parkId, ids.building, `F-${runId}`]
      );
      await manager.query(
        `INSERT INTO biz_unit(
           id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
           usage_type,unit_area,use_area,rental_status,fitting_status)
         VALUES($1,$2,$3,$4,$5,$6,'Issue 420 Unit',1,100,80,1,1)`,
        [ids.unit, scope.tenantId, scope.parkId, `U-${runId}`, ids.building, ids.floor]
      );
      await manager.query(
        `INSERT INTO biz_party(
           id,tenant_id,park_id,party_type,display_name,source_domain)
         VALUES($1,$2,$3,'person','Issue 420 Tenant','housing_rental')`,
        [ids.party, scope.tenantId, scope.parkId]
      );
      await manager.query(
        `INSERT INTO biz_housing_lease(
           id,tenant_id,park_id,lease_code,unit_id,tenant_party_id,status,
           start_date,end_date,monthly_rent,deposit_amount,first_due_date)
         VALUES($1,$2,$3,$4,$5,$6,'pending_approval',CURRENT_DATE,
           CURRENT_DATE+30,1000,1000,CURRENT_DATE)`,
        [ids.lease, scope.tenantId, scope.parkId, `LEASE-${runId}`, ids.unit, ids.party]
      );
      await manager.query(
        `INSERT INTO biz_housing_handover(
           id,tenant_id,park_id,lease_id,handover_type,status)
         VALUES($1,$2,$3,$4,'move_out','draft')`,
        [ids.handover, scope.tenantId, scope.parkId, ids.lease]
      );
      await manager.query(
        `INSERT INTO biz_housing_receivable(
           id,tenant_id,park_id,lease_id,source_type,charge_type,
           period_start,period_end,due_date,amount,status)
         VALUES($1,$2,$3,$4,'lease','rent',CURRENT_DATE,CURRENT_DATE+30,
           CURRENT_DATE,1000,'unpaid')`,
        [ids.billing, scope.tenantId, scope.parkId, ids.lease]
      );
      await manager.query(
        `INSERT INTO biz_housing_purchase(
           id,tenant_id,park_id,purchase_code,vendor_name,purchase_date,
           cost_category,total_amount,approval_status,payment_status)
         VALUES($1,$2,$3,$4,'Issue 420 Vendor',CURRENT_DATE,'supplies',100,
           'draft','unpaid')`,
        [ids.purchase, scope.tenantId, scope.parkId, `PURCHASE-${runId}`]
      );
      await manager.query(
        `INSERT INTO biz_work_order(
           id,tenant_id,park_id,wo_code,title,wo_type,priority,status,
           source_type,source_id,description)
         VALUES($1,$2,$3,$4,'Issue 420 Repair','repair','normal','10',
           'tenant_request',$5,'Issue 420 repair fixture')`,
        [ids.repair, scope.tenantId, scope.parkId, `WO-${runId}`, ids.lease]
      );
      await manager.query(
        `INSERT INTO biz_housing_purchase(
           id,tenant_id,park_id,purchase_code,vendor_name,purchase_date,
           cost_category,total_amount,approval_status,payment_status)
         VALUES($1,$2,$3,$4,'Other Vendor',CURRENT_DATE,'supplies',100,
           'draft','unpaid')`,
        [ids.otherPurchase, otherScope.tenantId, otherScope.parkId,
          `OTHER-PURCHASE-${runId}`]
      );
    });
  });

  after(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  test("reproduces SQLSTATE 42P08 when a reused scope parameter is left unanchored", async () => {
    await assert.rejects(
      dataSource.query(
        `SELECT id FROM biz_housing_lease
          WHERE $1 IS NULL OR (tenant_id,park_id)>($1,$2)
          LIMIT $3`,
        [null, null, 10]
      ),
      (error: unknown) => (error as { code?: string }).code === "42P08"
    );
  });

  test("reconciles all five housing authorities through the production stack", async () => {
    const projections = new PropertyTaskProjectionRepository();
    const registry = new PropertyTaskSourceRegistryProvider(
      Object.values(createHousingTaskResolvers())
    );
    const orchestrator = new PropertyTaskOrchestrator(
      dataSource,
      new PropertyTaskAssignmentRepository(),
      projections,
      registry,
      new PropertyTaskAccessEvaluatorService(),
      new PropertyTaskMapper(),
      new DatabasePropertyMutationReceiptAdapter()
    );
    assert.ok(orchestrator instanceof PropertyTaskOrchestrator);
    await new PropertyTaskReconciliationScheduler(
      dataSource, projections, orchestrator
    ).run();

    const projected = await dataSource.query(
      `SELECT source_type AS "sourceType",source_id::text AS "sourceId"
         FROM biz_property_task_projection
        WHERE tenant_id=$1 AND park_id=$2 ORDER BY source_type`,
      [scope.tenantId, scope.parkId]
    ) as Array<{ sourceType: string; sourceId: string }>;
    assert.deepEqual(projected.map((row) => row.sourceType), [
      "housing_billing", "housing_handover", "housing_lease",
      "housing_purchase", "housing_repair"
    ]);
    assert.deepEqual(new Set(projected.map((row) => row.sourceId)), new Set([
      ids.billing, ids.handover, ids.lease, ids.purchase, ids.repair
    ]));
    const runtimeCounts = await dataSource.query(
      `SELECT
         (SELECT count(*)::integer FROM biz_property_task_projection_head
           WHERE tenant_id=$1 AND park_id=$2) AS heads,
         (SELECT count(*)::integer FROM biz_property_task_assignment
           WHERE tenant_id=$1 AND park_id=$2) AS assignments,
         (SELECT count(*)::integer FROM biz_property_mutation_receipt
           WHERE tenant_id=$1 AND park_id=$2 AND receipt_status='completed') AS receipts,
         (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit
           WHERE tenant_id=$1 AND park_id=$2) AS audits`,
      [scope.tenantId, scope.parkId]
    ) as Array<Record<string, number>>;
    assert.deepEqual(runtimeCounts[0], {
      heads: 5, assignments: 5, receipts: 5, audits: 5
    });
    const otherProjected = await dataSource.query(
      `SELECT source_type AS "sourceType",source_id::text AS "sourceId"
         FROM biz_property_task_projection
        WHERE tenant_id=$1 AND park_id=$2`,
      [otherScope.tenantId, otherScope.parkId]
    ) as Array<{ sourceType: string; sourceId: string }>;
    assert.deepEqual(otherProjected, [{
      sourceType: "housing_purchase", sourceId: ids.otherPurchase
    }]);
  });

  test("scans and locks every housing source while preserving tenant and park scope", async () => {
    const manager: EntityManagerPort = { transactionContext: dataSource.manager };
    const resolvers = Object.values(createHousingTaskResolvers());
    for (const resolver of resolvers) {
      const page = await resolver.scanCandidates({ manager, scope, after: null, limit: 10 });
      assert.equal(page.items.length, 1, resolver.sourceType);
      const item = page.items[0];
      assert.ok(item, resolver.sourceType);
      const locked = await resolver.lockAndResolve({
        manager, scope, sourceId: item.sourceId,
        businessOccurrenceKey: item.businessOccurrenceKey,
        expectedSourceVersion: item.sourceVersion,
        taskKey: "a".repeat(64)
      });
      assert.equal(locked?.sourceId, item.sourceId, resolver.sourceType);
    }
    const purchase = await createHousingTaskResolvers().purchase.scanCandidates({
      manager, scope, after: null, limit: 10
    });
    assert.deepEqual(purchase.items.map((item) => item.sourceId), [ids.purchase]);
  });

  async function assertScopeResidue(
    target: TenantParkScope,
    expected: number
  ): Promise<void> {
    const rows = await dataSource.query(
      `SELECT sum(row_count)::integer AS count FROM (
         SELECT count(*) row_count FROM biz_property_task_projection
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_property_task_projection_head
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_property_task_assignment
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_property_mutation_receipt
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_housing_lease
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_housing_handover
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_housing_receivable
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_housing_purchase
          WHERE tenant_id=$1 AND park_id=$2
         UNION ALL SELECT count(*) FROM biz_work_order
          WHERE tenant_id=$1 AND park_id=$2
       ) scoped`,
      [target.tenantId, target.parkId]
    ) as Array<{ count: number }>;
    assert.equal(rows[0]?.count, expected);
  }

});
