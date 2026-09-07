import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { DataSource, type QueryRunner } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { LeasingReceivableStatusLogEntity } from "../leasing-receivables/entities/leasing-receivable-status-log.entity";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingWaiverEntity } from "../leasing-waivers/entities/leasing-waiver.entity";
import { LeasingWaiversService } from "../leasing-waivers/leasing-waivers.service";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { LeasingContractActionLogEntity } from "../leasing-contract-changes/entities/leasing-contract-action-log.entity";
import { LeasingContractStatusLogEntity } from "./entities/leasing-contract-status-log.entity";
import { LeasingContractUnitEntity } from "./entities/leasing-contract-unit.entity";
import { LeasingContractEntity } from "./entities/leasing-contract.entity";
import { LeasingContractsService } from "./leasing-contracts.service";

const databaseUrl = process.env.DATABASE_URL;
const entityGlobs = [
  join(__dirname, "../**/*.entity.{ts,js}"),
  join(__dirname, "../../shared/**/*.entity.{ts,js}")
];

const identityFieldPolicy = {
  applyFieldPolicies: async (_scope: unknown, _actor: unknown, _module: string, _entity: string, value: unknown) => value,
  applyFieldPoliciesToList: async (_scope: unknown, _actor: unknown, _module: string, _entity: string, value: unknown) => value
};
const unrestrictedDataScope = { buildScopeFilter: async () => ({ unrestricted: true, allowed_ids: [], scope_types: [] }) };
const alwaysEnabledDictionaryRepository = {
  createQueryBuilder: () => {
    const builder = {
      innerJoin: () => builder,
      where: () => builder,
      andWhere: () => builder,
      getExists: async () => true
    };
    return builder;
  }
};

function actor(tenantId: string, parkId: string): JwtPrincipal {
  return {
    sub: randomUUID(), username: "pma-s05", realName: "PMA S-05",
    tenantId, parkId, roles: [], permissions: ["*"], isSuper: true
  };
}

async function waitUntilBlocked(dataSource: DataSource, applicationNames: string[], deadlineMs = 10_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const rows = await dataSource.query<Array<{ application_name: string; wait_event_type: string | null }>>(
      `SELECT application_name, wait_event_type
         FROM pg_stat_activity
        WHERE application_name = ANY($1::text[])
          AND state = 'active'`,
      [applicationNames]
    );
    if (applicationNames.every((name) => rows.some((row) => row.application_name === name && row.wait_event_type === "Lock"))) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for PostgreSQL lock barrier: ${applicationNames.join(", ")}`);
}

async function beginBlocker(dataSource: DataSource): Promise<QueryRunner> {
  const runner = dataSource.createQueryRunner();
  let started = false;
  try {
    await runner.connect();
    await runner.startTransaction();
    started = true;
    return runner;
  } finally {
    if (!started) await runner.release();
  }
}

test("PostgreSQL renewal race permits one draft and rejects the concurrent loser with conflict", {
  skip: databaseUrl ? false : "DATABASE_URL is required for PostgreSQL concurrency coverage"
}, async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const tenantId = `pma-s05-${suffix}`;
  const parkId = `pma-s05-${suffix}`;
  const ids = {
    park: randomUUID(), parkTenant: randomUUID(), building: randomUUID(), floor: randomUUID(), unit: randomUUID(), contract: randomUUID()
  };
  const dataSource = await new DataSource({ type: "postgres", url: databaseUrl, entities: entityGlobs }).initialize();
  let blocker: QueryRunner | undefined;
  let attempts: Array<Promise<unknown>> = [];
  let codeSequence = 0;
  const createService = (runner: QueryRunner) => new LeasingContractsService(
    runner.manager.getRepository(LeasingContractEntity),
    runner.manager.getRepository(LeasingContractUnitEntity),
    runner.manager.getRepository(LeasingContractStatusLogEntity),
    runner.manager.getRepository(LeasingContractActionLogEntity),
    runner.manager.getRepository(ParkTenantEntity),
    runner.manager.getRepository(UnitEntity),
    {} as never, {} as never, {} as never,
    alwaysEnabledDictionaryRepository as never,
    { generateNext: async () => ({ code: `PMA-S05-R-${suffix}-${++codeSequence}` }) } as never,
    unrestrictedDataScope as never,
    identityFieldPolicy as never
  );
  const scope = { tenantId, parkId };
  const principal = actor(tenantId, parkId);

  try {
    blocker = await beginBlocker(dataSource);
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO biz_park(id,tenant_id,park_id,park_code,park_name,status)
         VALUES ($1,$2,$3,$4,'PMA S-05 park',1)`,
        [ids.park, tenantId, parkId, `PMA-P-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_park_tenant(id,tenant_id,park_id,park_tenant_code,company_name)
         VALUES ($1,$2,$3,$4,'PMA S-05 tenant')`,
        [ids.parkTenant, tenantId, parkId, `PMA-T-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
         VALUES ($1,$2,$3,$4,'PMA S-05 building')`,
        [ids.building, tenantId, parkId, `PMA-B-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
         VALUES ($1,$2,$3,$4,$5,1,'PMA S-05 floor')`,
        [ids.floor, tenantId, parkId, ids.building, `PMA-F-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,usage_type,unit_area,rental_status,fitting_status)
         VALUES ($1,$2,$3,$4,$5,$6,'PMA S-05 unit',10,100,10,10)`,
        [ids.unit, tenantId, parkId, `PMA-U-${suffix}`, ids.building, ids.floor]
      );
      await manager.query(
        `INSERT INTO biz_leasing_contract(
         id,tenant_id,park_id,contract_code,contract_name,contract_type,park_tenant_id,
         start_date,end_date,rent_unit_price,total_area,rent_per_month,total_amount,
         deposit_months,deposit_amount,free_rent_months,payment_period,status,create_by,update_by)
         VALUES ($1,$2,$3,$4,'PMA S-05 original','10',$5,'2026-01-01','2026-12-31',10,100,1000,12000,1,1000,0,'month','75',$6,$6)`,
        [ids.contract, tenantId, parkId, `PMA-C-${suffix}`, ids.parkTenant, principal.sub]
      );
      await manager.query(
        `INSERT INTO rel_leasing_contract_unit(
         tenant_id,park_id,contract_id,unit_id,unit_code,unit_name,area,rent_unit_price,rent_amount_per_month,start_date,end_date,create_by,update_by)
         VALUES ($1,$2,$3,$4,$5,'PMA S-05 unit',100,10,1000,'2026-01-01','2026-12-31',$6,$6)`,
        [tenantId, parkId, ids.contract, ids.unit, `PMA-U-${suffix}`, principal.sub]
      );
    });

    await blocker.query("SELECT id FROM biz_leasing_contract WHERE id=$1 FOR UPDATE", [ids.contract]);
    attempts = ["pma_s05_renewal_a", "pma_s05_renewal_b"].map(async (applicationName) => {
      const runner = dataSource.createQueryRunner();
      try {
        await runner.connect();
        await runner.query(`SET application_name = '${applicationName}'`);
        return await createService(runner).createRenewalDraft(scope, principal, ids.contract, {
          start_date: "2027-01-01", end_date: "2027-12-31"
        });
      } finally {
        await runner.release();
      }
    });
    await waitUntilBlocked(dataSource, ["pma_s05_renewal_a", "pma_s05_renewal_b"]);
    await blocker.commitTransaction();
    const settled = await Promise.allSettled(attempts);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0]?.reason as { getStatus?: () => number }).getStatus?.(), 409);
    assert.match((rejected[0]?.reason as Error).message, /refresh.*retry/i);
    const renewalRows = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM biz_leasing_contract
        WHERE tenant_id=$1 AND park_id=$2 AND renewal_from_contract_id=$3 AND is_deleted=false`,
      [tenantId, parkId, ids.contract]
    );
    assert.equal(renewalRows[0]?.count, "1");
  } finally {
    try {
      try {
        if (blocker?.isTransactionActive) await blocker.rollbackTransaction();
      } finally {
        await Promise.allSettled(attempts);
      }
    } finally {
      try {
        await blocker?.release();
      } finally {
        try {
          for (const table of [
            "biz_leasing_contract_action_log",
            "biz_leasing_contract_status_log",
            "rel_leasing_contract_unit",
            "biz_leasing_contract",
            "biz_unit",
            "biz_floor",
            "biz_building",
            "biz_park",
            "biz_park_tenant"
          ]) {
            await dataSource.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [tenantId, parkId]);
          }
        } finally {
          await dataSource.destroy();
        }
      }
    }
  }
});

test("PostgreSQL waiver write-off race rejects the concurrent loser with conflict", {
  skip: databaseUrl ? false : "DATABASE_URL is required for PostgreSQL concurrency coverage"
}, async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const tenantId = `pma-s05-${suffix}`;
  const parkId = `pma-s05-${suffix}`;
  const ids = { parkTenant: randomUUID(), receivable: randomUUID(), waiverA: randomUUID(), waiverB: randomUUID() };
  const dataSource = await new DataSource({ type: "postgres", url: databaseUrl, entities: entityGlobs }).initialize();
  let blocker: QueryRunner | undefined;
  let attempts: Array<Promise<unknown>> = [];
  const createService = (runner: QueryRunner) => new LeasingWaiversService(
    runner.manager.getRepository(LeasingWaiverEntity),
    runner.manager.getRepository(LeasingReceivableEntity),
    runner.manager.getRepository(LeasingReceivableStatusLogEntity),
    alwaysEnabledDictionaryRepository as never, {} as never,
    unrestrictedDataScope as never, identityFieldPolicy as never
  );
  const scope = { tenantId, parkId };
  const principal = actor(tenantId, parkId);

  try {
    blocker = await beginBlocker(dataSource);
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO biz_park_tenant(id,tenant_id,park_id,park_tenant_code,company_name)
         VALUES ($1,$2,$3,$4,'PMA S-05 tenant')`,
        [ids.parkTenant, tenantId, parkId, `PMA-T-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_leasing_receivable(
         id,tenant_id,park_id,ar_code,park_tenant_id,fee_type,period_start,period_end,due_date,
         amount_due,amount_paid,amount_waived,amount_remain,late_fee,invoice_status,status,source_type)
         VALUES ($1,$2,$3,$4,$5,'rent','2026-09-01','2026-09-30','2099-09-30',100,0,0,100,0,'10','20','manual')`,
        [ids.receivable, tenantId, parkId, `PMA-AR-${suffix}`, ids.parkTenant]
      );
      await manager.query(
        `INSERT INTO biz_leasing_waiver(
         id,tenant_id,park_id,waiver_code,receivable_id,park_tenant_id,waiver_amount,reason,status,approve_records)
         VALUES ($1,$2,$3,$4,$5,$6,60,'race A','20','[]'),($7,$2,$3,$8,$5,$6,60,'race B','20','[]')`,
        [ids.waiverA, tenantId, parkId, `PMA-W-A-${suffix}`, ids.receivable, ids.parkTenant,
          ids.waiverB, `PMA-W-B-${suffix}`]
      );
    });

    await blocker.query("SELECT id FROM biz_leasing_receivable WHERE id=$1 FOR UPDATE", [ids.receivable]);
    const waiverAttempts = [
      [ids.waiverA, "pma_s05_waiver_a"],
      [ids.waiverB, "pma_s05_waiver_b"]
    ] as const;
    attempts = waiverAttempts.map(async ([id, applicationName]) => {
      const runner = dataSource.createQueryRunner();
      try {
        await runner.connect();
        await runner.query(`SET application_name = '${applicationName}'`);
        return await createService(runner).approve(scope, principal, id, { opinion: "PMA S-05 race" });
      } finally {
        await runner.release();
      }
    });
    await waitUntilBlocked(dataSource, ["pma_s05_waiver_a", "pma_s05_waiver_b"]);
    await blocker.commitTransaction();
    const settled = await Promise.allSettled(attempts);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0]?.reason as { getStatus?: () => number }).getStatus?.(), 409);
    assert.match((rejected[0]?.reason as Error).message, /refresh.*retry/i);
    const [receivable] = await dataSource.query<Array<{ amount_waived: string; amount_remain: string; status: string }>>(
      "SELECT amount_waived::text,amount_remain::text,status FROM biz_leasing_receivable WHERE id=$1", [ids.receivable]
    );
    assert.deepEqual(receivable, { amount_waived: "60.00", amount_remain: "40.00", status: "40" });
    const waiverRows = await dataSource.query<Array<{ approved: string }>>(
      "SELECT count(*) FILTER (WHERE status='30')::text AS approved FROM biz_leasing_waiver WHERE receivable_id=$1", [ids.receivable]
    );
    assert.equal(waiverRows[0]?.approved, "1");
  } finally {
    try {
      try {
        if (blocker?.isTransactionActive) await blocker.rollbackTransaction();
      } finally {
        await Promise.allSettled(attempts);
      }
    } finally {
      try {
        await blocker?.release();
      } finally {
        try {
          for (const table of [
            "biz_leasing_receivable_status_log",
            "biz_leasing_waiver",
            "biz_leasing_receivable",
            "biz_park_tenant"
          ]) {
            await dataSource.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [tenantId, parkId]);
          }
        } finally {
          await dataSource.destroy();
        }
      }
    }
  }
});
