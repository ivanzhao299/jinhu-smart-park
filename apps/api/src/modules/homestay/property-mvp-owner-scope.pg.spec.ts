import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";

const databaseUrl = process.env.DATABASE_URL;

test("000209 rejects cross-scope MVP owners while preserving same-scope writes", {
  skip: !databaseUrl
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  const query = (sql: string, parameters?: unknown[]) => runner.query(sql, parameters);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `pg-209-${suffix}`;
  const parkA = `pg-209-a-${suffix}`;
  const parkB = `pg-209-b-${suffix}`;
  const ids = Object.fromEntries([
    "buildingA", "floorA", "unitA", "buildingB", "floorB", "unitB", "partyA",
    "bookingA", "nightA", "rateA", "purchaseA", "occupancyWrongUnit",
    "occupancyWrongSource", "bookingOccupancy", "turnoverOccupancy",
    "housingOccupancy", "housingOccupancyWrongSource", "turnoverA",
    "leaseA", "leaseB", "chargePlanB", "receivableA"
  ].map((key) => [key, randomUUID()])) as Record<string, string>;

  const createUnit = async (parkId: string, buildingId: string, floorId: string, unitId: string) => {
    await query(
      `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
       VALUES($1,$2,$3,$4,'000209 building')`,
      [buildingId, tenantId, parkId, `B-${parkId}`]
    );
    await query(
      `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
       VALUES($1,$2,$3,$4,$5,1,'000209 floor')`,
      [floorId, tenantId, parkId, buildingId, `F-${parkId}`]
    );
    await query(
      `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
          usage_type,unit_area,use_area,rental_status,fitting_status)
       VALUES($1,$2,$3,$4,$5,$6,'000209 unit',1,40,40,1,1)`,
      [unitId, tenantId, parkId, `U-${parkId}`, buildingId, floorId]
    );
  };

  try {
    await runner.startTransaction();
    const installedConstraints = await query(
      `SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) ORDER BY conname`,
      [[
        "uq_biz_unit_scope_id", "fk_homestay_rate_config_unit_scope",
        "uq_homestay_booking_scope_unit", "uq_housing_charge_plan_owner",
        "fk_homestay_booking_night_booking_scope", "fk_housing_lease_unit_scope",
        "fk_housing_receivable_charge_plan_scope", "fk_housing_purchase_unit_scope"
      ]]
    );
    assert.deepEqual(installedConstraints.map((row: { conname: string }) => row.conname), [
      "fk_homestay_booking_night_booking_scope", "fk_homestay_rate_config_unit_scope",
      "fk_housing_lease_unit_scope", "fk_housing_purchase_unit_scope",
      "fk_housing_receivable_charge_plan_scope", "uq_biz_unit_scope_id",
      "uq_homestay_booking_scope_unit", "uq_housing_charge_plan_owner"
    ]);
    await createUnit(parkA, ids.buildingA!, ids.floorA!, ids.unitA!);
    await createUnit(parkB, ids.buildingB!, ids.floorB!, ids.unitB!);
    await query(
      `INSERT INTO biz_party(id,tenant_id,park_id,party_type,display_name,source_domain)
       VALUES($1,$2,$3,'person','000209 guest','homestay')`,
      [ids.partyA, tenantId, parkA]
    );
    await query(
      `INSERT INTO biz_homestay_booking(id,tenant_id,park_id,booking_code,unit_id,booker_party_id,
          status,arrival_date,departure_date,currency,room_amount,total_amount,cancellation_policy_snapshot)
       VALUES($1,$2,$3,$4,$5,$6,'draft','2026-09-01','2026-09-02','CNY',100,100,'{}')`,
      [ids.bookingA, tenantId, parkA, `HS-${suffix}`, ids.unitA, ids.partyA]
    );
    await query(
      `INSERT INTO biz_homestay_booking_night(id,tenant_id,park_id,booking_id,business_date,
          base_rate,final_rate,price_source)
       VALUES($1,$2,$3,$4,'2026-09-01',100,100,'base')`,
      [ids.nightA, tenantId, parkA, ids.bookingA]
    );
    const sameScope = await query(
      "SELECT booking_id::text AS booking_id FROM biz_homestay_booking_night WHERE id=$1",
      [ids.nightA]
    );
    assert.deepEqual(sameScope, [{ booking_id: ids.bookingA }]);

    await query("SAVEPOINT cross_scope_rate");
    await assert.rejects(query(
      `INSERT INTO biz_homestay_rate_config(id,tenant_id,park_id,unit_id,base_daily_rate)
       VALUES($1,$2,$3,$4,100)`,
      [ids.rateA, tenantId, parkA, ids.unitB]
    ), /foreign key constraint/u);
    await query("ROLLBACK TO SAVEPOINT cross_scope_rate");

    await query("SAVEPOINT cross_scope_purchase");
    await assert.rejects(query(
      `INSERT INTO biz_housing_purchase(id,tenant_id,park_id,purchase_code,unit_id,vendor_name,
          purchase_date,cost_category,total_amount,currency)
       VALUES($1,$2,$3,$4,$5,'000209 vendor','2026-09-01','supplies',10,'CNY')`,
      [ids.purchaseA, tenantId, parkA, `PUR-${suffix}`, ids.unitB]
    ), /foreign key constraint/u);
    await query("ROLLBACK TO SAVEPOINT cross_scope_purchase");

    for (const [occupancyId, unitId, sourceId] of [
      [ids.occupancyWrongUnit, ids.unitB, ids.bookingA],
      [ids.occupancyWrongSource, ids.unitA, randomUUID()]
    ]) {
      await query(
        `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
            source_id,start_at,end_at,status)
         VALUES($1,$2,$3,$4,'homestay','homestay_booking',$5,'2026-09-01','2026-09-02','active')`,
        [occupancyId, tenantId, parkA, unitId, sourceId]
      );
      await query("SAVEPOINT wrong_booking_occupancy");
      await assert.rejects(query(
        "UPDATE biz_homestay_booking SET occupancy_id=$1 WHERE id=$2",
        [occupancyId, ids.bookingA]
      ), /occupancy owner mismatch|occupancy unit owner mismatch/u);
      await query("ROLLBACK TO SAVEPOINT wrong_booking_occupancy");
    }
    await query("SAVEPOINT wrong_turnover_occupancy");
    await assert.rejects(query(
      `INSERT INTO biz_homestay_turnover_task(id,tenant_id,park_id,booking_id,unit_id,
          occupancy_id,status)
       VALUES($1,$2,$3,$4,$5,$6,'pending')`,
      [ids.turnoverA, tenantId, parkA, ids.bookingA, ids.unitA, ids.occupancyWrongSource]
    ), /turnover occupancy owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT wrong_turnover_occupancy");
    await query("DELETE FROM biz_property_occupancy WHERE id = ANY($1::uuid[])", [[
      ids.occupancyWrongUnit, ids.occupancyWrongSource
    ]]);

    await query(
      `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
          source_id,start_at,end_at,status)
       VALUES($1,$2,$3,$4,'homestay','homestay_booking',$5,'2026-09-01','2026-09-02','active')`,
      [ids.bookingOccupancy, tenantId, parkA, ids.unitA, ids.bookingA]
    );
    await query("UPDATE biz_homestay_booking SET occupancy_id=$1 WHERE id=$2", [
      ids.bookingOccupancy, ids.bookingA
    ]);
    await query("SAVEPOINT mutate_linked_occupancy");
    await assert.rejects(query(
      "UPDATE biz_property_occupancy SET source_id=$1 WHERE id=$2",
      [randomUUID(), ids.bookingOccupancy]
    ), /reverse owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT mutate_linked_occupancy");
    await query("SAVEPOINT mutate_booking_id");
    await assert.rejects(query(
      "UPDATE biz_homestay_booking SET id=$1 WHERE id=$2",
      [randomUUID(), ids.bookingA]
    ), /occupancy owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT mutate_booking_id");

    await query(
      `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
          source_id,start_at,end_at,status)
       VALUES($1,$2,$3,$4,'operations','homestay_turnover',$5,'2026-09-02','2026-09-03','active')`,
      [ids.turnoverOccupancy, tenantId, parkA, ids.unitA, ids.turnoverA]
    );
    await query(
      `INSERT INTO biz_homestay_turnover_task(id,tenant_id,park_id,booking_id,unit_id,
          occupancy_id,status)
       VALUES($1,$2,$3,$4,$5,$6,'pending')`,
      [ids.turnoverA, tenantId, parkA, ids.bookingA, ids.unitA, ids.turnoverOccupancy]
    );
    await query("SAVEPOINT mutate_turnover_occupancy");
    await assert.rejects(query(
      "UPDATE biz_property_occupancy SET unit_id=$1 WHERE id=$2",
      [ids.unitB, ids.turnoverOccupancy]
    ), /reverse owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT mutate_turnover_occupancy");
    await query("SAVEPOINT mutate_turnover_booking_unit");
    await assert.rejects(query(
      "UPDATE biz_homestay_booking SET unit_id=$1 WHERE id=$2",
      [ids.unitB, ids.bookingA]
    ), /foreign key constraint|occupancy unit owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT mutate_turnover_booking_unit");
    await query("SAVEPOINT clear_turnover_occupancy");
    await assert.rejects(query(
      "UPDATE biz_homestay_turnover_task SET occupancy_id=NULL WHERE id=$1",
      [ids.turnoverA]
    ), /owner link cannot be cleared/u);
    await query("ROLLBACK TO SAVEPOINT clear_turnover_occupancy");

    for (const [leaseId, code] of [[ids.leaseA, "A"], [ids.leaseB, "B"]]) {
      await query(
        `INSERT INTO biz_housing_lease(id,tenant_id,park_id,lease_code,unit_id,tenant_party_id,
            status,start_date,end_date,monthly_rent,deposit_amount,first_due_date,currency)
         VALUES($1,$2,$3,$4,$5,$6,'draft','2026-09-01','2027-09-01',1000,1000,
            '2026-09-01','CNY')`,
        [leaseId, tenantId, parkA, `LEASE-${code}-${suffix}`, ids.unitA, ids.partyA]
      );
    }
    await query(
      `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
          source_id,start_at,end_at,status)
       VALUES($1,$2,$3,$4,'housing_rental','housing_lease',$5,
          '2027-09-01','2028-09-01','active')`,
      [ids.housingOccupancyWrongSource, tenantId, parkA, ids.unitA, ids.leaseB]
    );
    await query("SAVEPOINT wrong_lease_occupancy");
    await assert.rejects(query(
      "UPDATE biz_housing_lease SET occupancy_id=$1 WHERE id=$2",
      [ids.housingOccupancyWrongSource, ids.leaseA]
    ), /housing lease occupancy owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT wrong_lease_occupancy");
    await query("DELETE FROM biz_property_occupancy WHERE id=$1", [ids.housingOccupancyWrongSource]);
    await query(
      `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
          source_id,start_at,end_at,status)
       VALUES($1,$2,$3,$4,'housing_rental','housing_lease',$5,
          '2027-09-01','2028-09-01','active')`,
      [ids.housingOccupancy, tenantId, parkA, ids.unitA, ids.leaseA]
    );
    await query("UPDATE biz_housing_lease SET occupancy_id=$1 WHERE id=$2", [
      ids.housingOccupancy, ids.leaseA
    ]);
    await query("SAVEPOINT mutate_housing_occupancy");
    await assert.rejects(query(
      "UPDATE biz_property_occupancy SET source_type='housing_other' WHERE id=$1",
      [ids.housingOccupancy]
    ), /reverse owner mismatch/u);
    await query("ROLLBACK TO SAVEPOINT mutate_housing_occupancy");
    await query(
      `INSERT INTO biz_housing_charge_plan(id,tenant_id,park_id,lease_id,charge_type,
          billing_source,cycle_months,amount,currency)
       VALUES($1,$2,$3,$4,'rent','fixed',1,1000,'CNY')`,
      [ids.chargePlanB, tenantId, parkA, ids.leaseB]
    );
    await query("SAVEPOINT wrong_charge_plan_lease");
    await assert.rejects(query(
      `INSERT INTO biz_housing_receivable(id,tenant_id,park_id,lease_id,charge_plan_id,
          source_type,source_id,charge_type,period_start,period_end,due_date,amount,currency)
       VALUES($1,$2,$3,$4,$5,'charge_plan',$5,'rent','2026-09-01','2026-10-01',
          '2026-09-01',1000,'CNY')`,
      [ids.receivableA, tenantId, parkA, ids.leaseA, ids.chargePlanB]
    ), /foreign key constraint/u);
    await query("ROLLBACK TO SAVEPOINT wrong_charge_plan_lease");
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
    await runner.release();
    await dataSource.destroy();
  }
});
