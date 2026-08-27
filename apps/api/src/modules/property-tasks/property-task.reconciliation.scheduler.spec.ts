import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataSource, EntityManager } from "typeorm";
import { PropertyTaskReconciliationScheduler } from
  "./property-task.reconciliation.scheduler";
import type { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import type { PropertyTaskProjectionRepository } from
  "./property-task.projection.repository";

describe("PropertyTaskReconciliationScheduler", () => {
  it("rebuilds a missing projection from the bounded tenant and park source scan", async () => {
    const reconciled: unknown[] = [];
    let authoritySql = "";
    const dataSource = {
      query: async (sql: string) => {
        authoritySql = sql;
        return [{
        tenantId: "tenant", parkId: "park", sourceType: "housing_repair",
        sourceId: "11111111-1111-4111-8111-111111111111",
        authorityUpdatedAt: "2026-08-08T00:00:00.000Z",
        authorityDeleted: false, headUpdatedAt: null
      }];
      },
      transaction: async (_level: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager)
    } as unknown as DataSource;
    const projections = {
      findBySource: async () => [],
      currentHeadVersion: async () => 0
    } as unknown as PropertyTaskProjectionRepository;
    const orchestrator = {
      reconcile: async (...input: unknown[]) => { reconciled.push(input); }
    } as unknown as PropertyTaskOrchestrator;
    await new PropertyTaskReconciliationScheduler(dataSource, projections, orchestrator).run();
    assert.equal(reconciled.length, 1);
    assert.deepEqual((reconciled[0] as unknown[])[0], { tenantId: "tenant", parkId: "park" });
    assert.match(authoritySql, /'housing_repair'/);
    assert.match(authoritySql, /FROM biz_work_order work_order/);
    assert.match(authoritySql, /JOIN biz_housing_lease lease ON lease\.id::text=work_order\.source_id/);
    assert.match(authoritySql, /WHERE work_order\.source_type='tenant_request'/);
    assert.match(authoritySql, /\$1::varchar\(64\) IS NULL/);
    assert.match(authoritySql, /\$2::varchar\(64\)/);
    assert.match(authoritySql, /\$3::varchar\(64\)/);
    assert.match(authoritySql, /LIMIT \$5::integer/);
  });
});
