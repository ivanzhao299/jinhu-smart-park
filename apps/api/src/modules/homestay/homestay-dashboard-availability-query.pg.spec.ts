import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayDashboardAvailabilityQueryService } from
  "./homestay-dashboard-availability-query.service";

const databaseUrl = process.env.HOMESTAY_QUERY_PG_URL;

test("dashboard and availability distinguish confirmed reservations from in-house stays", {
  skip: !databaseUrl,
  timeout: 30_000
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const ids = {
    tenant: randomUUID(), park: randomUUID(), actor: randomUUID(),
    building: randomUUID(), floor: randomUUID(),
    fallbackUnit: randomUUID(), lateUnit: randomUUID(),
    reservedUnit: randomUUID(), occupiedUnit: randomUUID(),
    fallbackBooking: randomUUID(), lateBooking: randomUUID(),
    reservedBooking: randomUUID(), occupiedBooking: randomUUID(),
    fallbackOccupancy: randomUUID(), lateOccupancy: randomUUID(),
    reservedOccupancy: randomUUID(), occupiedOccupancy: randomUUID()
  };
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const scope = { tenantId: ids.tenant, parkId: ids.park };
  const actor: JwtPrincipal = {
    sub: ids.actor,
    username: "homestay-query-pg",
    tenantId: ids.tenant,
    parkId: ids.park,
    roles: [],
    permissions: []
  };
  let primaryError: unknown;
  let cleanupError: unknown;

  try {
    await dataSource.transaction(async (manager) => {
      await manager.query("SET CONSTRAINTS ALL DEFERRED");
      await manager.query(
        `INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
         VALUES($1,$2,$3,'Homestay query PG park')`,
        [ids.tenant, ids.park, `P-HQ-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
         VALUES($1,$2,$3,$4,'Homestay query PG building')`,
        [ids.building, ids.tenant, ids.park, `B-HQ-${suffix}`]
      );
      await manager.query(
        `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
         VALUES($1,$2,$3,$4,$5,1,'Homestay query PG floor')`,
        [ids.floor, ids.tenant, ids.park, ids.building, `F-HQ-${suffix}`]
      );
      for (const [unitId, unitCode] of [
        [ids.fallbackUnit, `U-HQ-F-${suffix}`],
        [ids.lateUnit, `U-HQ-L-${suffix}`],
        [ids.reservedUnit, `U-HQ-R-${suffix}`],
        [ids.occupiedUnit, `U-HQ-O-${suffix}`]
      ]) {
        await manager.query(
          `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
             usage_type,unit_area,use_area,rental_status,fitting_status,status)
           VALUES($1,$2,$3,$4,$5,$6,$4,1,40,40,1,1,1)`,
          [unitId, ids.tenant, ids.park, unitCode, ids.building, ids.floor]
        );
        await manager.query(
          `INSERT INTO biz_property_operation_config(
             id,tenant_id,park_id,unit_id,operating_mode,operating_status)
           VALUES(uuid_generate_v4(),$1,$2,$3,'short_stay','enabled')`,
          [ids.tenant, ids.park, unitId]
        );
      }
      for (const fixture of [
        {
          booking: ids.fallbackBooking, occupancy: ids.fallbackOccupancy,
          unit: ids.fallbackUnit, code: `HS-HQ-F-${suffix}`,
          status: "checked_in", arrivalDate: "2099-08-04", actualCheckInTime: null
        },
        {
          booking: ids.lateBooking, occupancy: ids.lateOccupancy,
          unit: ids.lateUnit, code: `HS-HQ-L-${suffix}`,
          status: "checked_in", arrivalDate: "2099-08-03",
          actualCheckInTime: "2099-08-04T01:00:00.000Z"
        },
        {
          booking: ids.reservedBooking, occupancy: ids.reservedOccupancy,
          unit: ids.reservedUnit, code: `HS-HQ-R-${suffix}`,
          status: "confirmed", arrivalDate: "2099-08-04", actualCheckInTime: null
        },
        {
          booking: ids.occupiedBooking, occupancy: ids.occupiedOccupancy,
          unit: ids.occupiedUnit, code: `HS-HQ-O-${suffix}`,
          status: "checked_in", arrivalDate: "2099-08-04",
          actualCheckInTime: "2099-08-04T01:00:00.000Z"
        }
      ]) {
        await manager.query(
          `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,
             source_type,source_id,start_at,end_at,status)
           VALUES($1,$2,$3,$4,'homestay','homestay_booking',$5,
             $6::date::timestamp AT TIME ZONE 'Asia/Shanghai',
             '2099-08-05'::date::timestamp AT TIME ZONE 'Asia/Shanghai','active')`,
          [fixture.occupancy, ids.tenant, ids.park, fixture.unit, fixture.booking,
            fixture.arrivalDate]
        );
        await manager.query(
          `INSERT INTO biz_homestay_booking(id,tenant_id,park_id,booking_code,unit_id,
             occupancy_id,status,arrival_date,departure_date,actual_check_in_time,guest_count)
           VALUES($1,$2,$3,$4,$5,$6,$7,$9,'2099-08-05',$8,1)`,
          [fixture.booking, ids.tenant, ids.park, fixture.code, fixture.unit,
            fixture.occupancy, fixture.status, fixture.actualCheckInTime,
            fixture.arrivalDate]
        );
      }
    });

    const service = new HomestayDashboardAvailabilityQueryService(
      { createQueryBuilder: () => turnoverBuilder() } as never,
      { allowedUnitIds: async () => null } as never,
      dataSource,
      { get: () => undefined } as never
    );

    const historicalDashboard = await service.dashboard(scope, actor, "2099-08-03");
    assert.equal(historicalDashboard.occupied, 0);

    const historicalAvailability = await service.availability(scope, actor, {
      date_from: "2099-08-03", date_to: "2099-08-04", page: 1, page_size: 20
    });
    assert.deepEqual(
      (historicalAvailability as Array<{ unit_id: string; room_state: string }>).map(
        (item) => ({ unit_id: item.unit_id, room_state: item.room_state })
      ),
      [{ unit_id: ids.lateUnit, room_state: "reserved" }]
    );

    const dashboard = await service.dashboard(scope, actor, "2099-08-04");
    assert.equal(dashboard.occupied, 2);
    assert.equal(dashboard.rentable_units, 4);
    assert.equal(dashboard.occupancy_rate, "50.00");

    const availability = await service.availability(scope, actor, {
      date_from: "2099-08-04", date_to: "2099-08-05", page: 1, page_size: 20
    });
    assert.deepEqual(
      (availability as Array<{ unit_id: string; room_state: string }>).map((item) => ({
        unit_id: item.unit_id,
        room_state: item.room_state
      })),
      [
        { unit_id: ids.fallbackUnit, room_state: "occupied" },
        { unit_id: ids.lateUnit, room_state: "occupied" },
        { unit_id: ids.occupiedUnit, room_state: "occupied" },
        { unit_id: ids.reservedUnit, room_state: "reserved" }
      ]
    );
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await cleanupFixture(dataSource, scope);
    } catch (error) {
      cleanupError = error;
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }

  if (primaryError && cleanupError) {
    throw new AggregateError([primaryError, cleanupError], "query PG test and cleanup both failed");
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
});

function turnoverBuilder() {
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    getCount: async () => 0
  };
  return builder;
}

async function cleanupFixture(
  dataSource: DataSource,
  scope: { tenantId: string; parkId: string }
): Promise<void> {
  if (!dataSource.isInitialized) return;
  await dataSource.transaction(async (manager) => {
    await manager.query("SET CONSTRAINTS ALL DEFERRED");
    await manager.query("SELECT set_config('session_replication_role','replica',true)");
    for (const table of [
      "biz_homestay_booking", "biz_property_occupancy", "biz_property_operation_config",
      "biz_unit", "biz_floor", "biz_building", "biz_park"
    ]) {
      await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [
        scope.tenantId, scope.parkId
      ]);
    }
  });
}
