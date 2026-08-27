import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import type { EntityManagerPort, TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager, type QueryRunner } from "typeorm";
import { createHousingTaskResolvers } from "../housing/housing-task.adapter";
import type { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import type { PropertyTaskProjectionRepository } from "./property-task.projection.repository";
import { PropertyTaskReconciliationScheduler } from
  "./property-task.reconciliation.scheduler";

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
  const scope: TenantParkScope = {
    tenantId: "420-real-pg-tenant",
    parkId: "420-real-pg-park"
  };
  const otherScope: TenantParkScope = {
    tenantId: "420-other-tenant",
    parkId: "420-other-park"
  };
  const ids = {
    lease: randomUUID(),
    handover: randomUUID(),
    billing: randomUUID(),
    purchase: randomUUID(),
    repair: randomUUID(),
    otherPurchase: randomUUID()
  };
  const schema = `property_task_420_${randomUUID().replaceAll("-", "")}`;
  let dataSource: DataSource;
  let runner: QueryRunner;

  before(async () => {
    dataSource = new DataSource({ type: "postgres", url: pgUrl, entities: [] });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.connect();
    const version = await runner.query("SHOW server_version_num") as Array<{
      server_version_num: string;
    }>;
    assert.equal(Math.floor(Number(version[0]?.server_version_num) / 10_000), 16);
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET search_path TO ${schema},public`);
    await runner.query(`
      CREATE TABLE biz_homestay_turnover_task (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_housing_lease (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        lease_code varchar(64) NOT NULL, status varchar(32) NOT NULL,
        end_date date NOT NULL, create_time timestamptz NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL
      );
      CREATE TABLE biz_housing_handover (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        lease_id uuid NOT NULL, handover_type varchar(32) NOT NULL, status varchar(32) NOT NULL,
        handover_at timestamptz, create_time timestamptz NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL
      );
      CREATE TABLE biz_housing_receivable (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        lease_id uuid NOT NULL, charge_type varchar(32) NOT NULL, status varchar(32) NOT NULL,
        due_date date NOT NULL, create_time timestamptz NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL
      );
      CREATE TABLE biz_housing_purchase (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        purchase_code varchar(64) NOT NULL, vendor_name varchar(200) NOT NULL,
        purchase_date date NOT NULL, approval_status varchar(32) NOT NULL,
        payment_status varchar(32) NOT NULL, create_time timestamptz NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL
      );
      CREATE TABLE biz_work_order (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        wo_code varchar(64) NOT NULL, title varchar(200) NOT NULL,
        status varchar(32) NOT NULL, source_type varchar(32) NOT NULL,
        source_id varchar(64), overdue_flag boolean NOT NULL DEFAULT false,
        sla_dispatch_min integer, sla_finish_min integer, dispatch_time timestamptz,
        accept_time timestamptz, create_time timestamptz NOT NULL,
        update_time timestamptz NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL
      );
      CREATE TABLE biz_property_task_projection_head (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        source_type varchar(64) NOT NULL, source_id uuid NOT NULL,
        updated_at timestamptz NOT NULL
      );
      CREATE TABLE biz_property_task_projection (
        id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        source_type varchar(64) NOT NULL, source_id uuid NOT NULL
      );
    `);
    await runner.query(
      `INSERT INTO biz_housing_lease
       (id,tenant_id,park_id,lease_code,status,end_date,create_time,update_time,version)
       VALUES ($1,$2,$3,'LEASE-420','pending_approval',CURRENT_DATE+30,now(),now(),1)`,
      [ids.lease, scope.tenantId, scope.parkId]
    );
    await runner.query(
      `INSERT INTO biz_housing_handover
       (id,tenant_id,park_id,lease_id,handover_type,status,create_time,update_time,version)
       VALUES ($1,$2,$3,$4,'move_out','draft',now(),now(),1)`,
      [ids.handover, scope.tenantId, scope.parkId, ids.lease]
    );
    await runner.query(
      `INSERT INTO biz_housing_receivable
       (id,tenant_id,park_id,lease_id,charge_type,status,due_date,create_time,update_time,version)
       VALUES ($1,$2,$3,$4,'rent','unpaid',CURRENT_DATE,now(),now(),1)`,
      [ids.billing, scope.tenantId, scope.parkId, ids.lease]
    );
    await runner.query(
      `INSERT INTO biz_housing_purchase
       (id,tenant_id,park_id,purchase_code,vendor_name,purchase_date,approval_status,
        payment_status,create_time,update_time,version)
       VALUES ($1,$2,$3,'PURCHASE-420','Vendor',CURRENT_DATE,'draft','unpaid',now(),now(),1)`,
      [ids.purchase, scope.tenantId, scope.parkId]
    );
    await runner.query(
      `INSERT INTO biz_work_order
       (id,tenant_id,park_id,wo_code,title,status,source_type,source_id,
        create_time,update_time,version)
       VALUES ($1,$2,$3,'WO-420','Repair','10','tenant_request',$4,now(),now(),1)`,
      [ids.repair, scope.tenantId, scope.parkId, ids.lease]
    );
  });

  after(async () => {
    try {
      if (runner?.isReleased === false) {
        await runner.query("SET search_path TO public");
        await runner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    } finally {
      try {
        if (runner?.isReleased === false) await runner.release();
      } finally {
        if (dataSource?.isInitialized) await dataSource.destroy();
      }
    }
  });

  test("reproduces SQLSTATE 42P08 when a reused scope parameter is left unanchored", async () => {
    await assert.rejects(
      runner.query(
        `SELECT id FROM biz_housing_lease
          WHERE $1 IS NULL OR (tenant_id,park_id)>($1,$2)
          LIMIT $3`,
        [null, null, 10]
      ),
      (error: unknown) => (error as { code?: string }).code === "42P08"
    );
  });

  test("reconciles all five housing authorities without inconsistent parameter types", async () => {
    const reconciled: string[] = [];
    const scopedDataSource = {
      query: (sql: string, parameters?: unknown[]) => runner.query(sql, parameters),
      transaction: async <T>(
        _isolation: string,
        work: (manager: EntityManager) => Promise<T>
      ) => work(runner.manager)
    } as unknown as DataSource;
    const projections = {
      findBySource: async () => [],
      currentHeadVersion: async () => 0
    } as unknown as PropertyTaskProjectionRepository;
    const resolvers = Object.values(createHousingTaskResolvers());
    const orchestrator = {
      reconcile: async (candidateScope: TenantParkScope, input: {
        sourceType: string;
        sourceId: string;
      }) => {
        const resolver = resolvers.find((item) => item.sourceType === input.sourceType);
        assert.ok(resolver, input.sourceType);
        const page = await resolver.scanCandidates({
          manager: { transactionContext: runner.manager },
          scope: candidateScope,
          after: null,
          limit: 10
        });
        const source = page.items.find((item) => item.sourceId === input.sourceId);
        assert.ok(source, input.sourceType);
        const locked = await resolver.lockAndResolve({
          manager: { transactionContext: runner.manager },
          scope: candidateScope,
          sourceId: source.sourceId,
          businessOccurrenceKey: source.businessOccurrenceKey,
          expectedSourceVersion: source.sourceVersion,
          taskKey: "a".repeat(64)
        });
        assert.ok(locked, input.sourceType);
        await runner.query(
          `INSERT INTO biz_property_task_projection
           (id,tenant_id,park_id,source_type,source_id) VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), candidateScope.tenantId, candidateScope.parkId,
            input.sourceType, input.sourceId]
        );
        reconciled.push(input.sourceType);
      }
    } as unknown as PropertyTaskOrchestrator;

    await new PropertyTaskReconciliationScheduler(
      scopedDataSource, projections, orchestrator
    ).run();

    assert.deepEqual(reconciled.sort(), [
      "housing_billing", "housing_handover", "housing_lease",
      "housing_purchase", "housing_repair"
    ]);
    const projected = await runner.query(
      `SELECT source_type AS "sourceType",source_id::text AS "sourceId"
         FROM biz_property_task_projection ORDER BY source_type`
    ) as Array<{ sourceType: string; sourceId: string }>;
    assert.deepEqual(projected.map((row) => row.sourceType), reconciled);
  });

  test("scans and locks every housing source while preserving tenant and park scope", async () => {
    await runner.query(
      `INSERT INTO biz_housing_purchase
       (id,tenant_id,park_id,purchase_code,vendor_name,purchase_date,approval_status,
        payment_status,create_time,update_time,version)
       VALUES ($1,$2,$3,'PURCHASE-OTHER','Other',CURRENT_DATE,'draft','unpaid',now(),now(),1)`,
      [ids.otherPurchase, otherScope.tenantId, otherScope.parkId]
    );
    const manager: EntityManagerPort = { transactionContext: runner.manager };
    const resolvers = Object.values(createHousingTaskResolvers());

    for (const resolver of resolvers) {
      const page = await resolver.scanCandidates({ manager, scope, after: null, limit: 10 });
      assert.equal(page.items.length, 1, resolver.sourceType);
      const item = page.items[0];
      assert.ok(item, resolver.sourceType);
      const locked = await resolver.lockAndResolve({
        manager,
        scope,
        sourceId: item.sourceId,
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
});
