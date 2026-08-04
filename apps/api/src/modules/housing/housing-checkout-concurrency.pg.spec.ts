import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { HousingService } from "./housing.service";

const databaseUrl = process.env.DATABASE_URL;

test("PostgreSQL checkout rejects an occupancy pointer TOCTOU after its non-locking pre-read", {
  skip: databaseUrl ? false : "DATABASE_URL is required for PostgreSQL concurrency coverage"
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const schema = `housing_checkout_${randomUUID().replaceAll("-", "")}`;
  const tenantId = "10000000-0000-4000-8000-000000000090";
  const parkId = "20000000-0000-4000-8000-000000000090";
  const leaseId = "30000000-0000-4000-8000-000000000090";
  const unitId = "40000000-0000-4000-8000-000000000090";
  const oldOccupancyId = "50000000-0000-4000-8000-000000000090";
  const newOccupancyId = "50000000-0000-4000-8000-000000000091";
  let releasePointerRead!: () => void;
  let continueCheckout!: () => void;
  const pointerRead = new Promise<void>((resolve) => { releasePointerRead = resolve; });
  const checkoutMayContinue = new Promise<void>((resolve) => { continueCheckout = resolve; });

  try {
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(`
      CREATE TABLE "${schema}".biz_housing_lease (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, unit_id uuid NOT NULL,
        status text NOT NULL, version integer NOT NULL, occupancy_id uuid, is_deleted boolean NOT NULL
      );
      CREATE TABLE "${schema}".biz_property_occupancy (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL,
        status text NOT NULL, version integer NOT NULL, is_deleted boolean NOT NULL
      )
    `);
    await dataSource.query(
      `INSERT INTO "${schema}".biz_property_occupancy
         (id,tenant_id,park_id,status,version,is_deleted)
       VALUES ($1,$2,$3,'active',1,false),($4,$2,$3,'active',1,false)`,
      [oldOccupancyId, tenantId, parkId, newOccupancyId]
    );
    await dataSource.query(
      `INSERT INTO "${schema}".biz_housing_lease
         (id,tenant_id,park_id,unit_id,status,version,occupancy_id,is_deleted)
       VALUES ($1,$2,$3,$4,'checkout_pending',7,$5,false)`,
      [leaseId, tenantId, parkId, unitId, oldOccupancyId]
    );

    const transactionalDataSource = {
      transaction: async <T>(run: (manager: EntityManager) => Promise<T>): Promise<T> =>
        dataSource.transaction(async (manager) => {
          await manager.query(`SET LOCAL search_path TO "${schema}"`);
          const intercepted = {
            query: async (sql: string, parameters?: unknown[]) => {
              const result = await manager.query(sql, parameters);
              if (sql.includes("FROM biz_housing_lease") && !sql.includes("FOR UPDATE")) {
                releasePointerRead();
                await checkoutMayContinue;
              }
              return result;
            }
          };
          return run(intercepted as EntityManager);
        })
    };
    const service = new HousingService(
      {} as never, {} as never, {} as never, {} as never,
      { assertAccess: async () => undefined } as never, {} as never,
      transactionalDataSource as never, {} as never,
      { createPendingRequest: async () => assert.fail("drift must fail before approval creation") } as never
    );
    const checkout = service.checkoutLease(
      { tenantId, parkId },
      { sub: randomUUID(), username: "operator", tenantId, parkId, roles: [], permissions: [] },
      leaseId,
      "checkout",
      "checkout-race"
    );

    await pointerRead;
    await dataSource.query(
      `UPDATE "${schema}".biz_housing_lease SET occupancy_id=$2 WHERE id=$1`,
      [leaseId, newOccupancyId]
    );
    continueCheckout();
    await assert.rejects(checkout, (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.match(error.message, /occupancy pointer changed/iu);
      return true;
    });
  } finally {
    continueCheckout?.();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.destroy();
  }
});
