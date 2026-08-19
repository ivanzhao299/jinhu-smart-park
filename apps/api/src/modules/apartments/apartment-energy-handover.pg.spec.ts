import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { DataSource } from "typeorm";
import { ApartmentsService } from "./apartments.service";

const databaseUrl = process.env.DATABASE_URL;
const mutationAllowed = process.env.APARTMENT_PG_TEST_ALLOW_MUTATION === "yes";

test("apartment handover atomically advances canonical energy readings", {
  skip: databaseUrl && mutationAllowed ? false : "DATABASE_URL and APARTMENT_PG_TEST_ALLOW_MUTATION=yes are required"
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const service = new ApartmentsService(dataSource);
  try {
    const [user] = await dataSource.query(`SELECT id FROM sys_user WHERE is_deleted=false LIMIT 1`);
    const [unit] = await dataSource.query(`SELECT tenant_id,park_id,id FROM biz_unit WHERE is_deleted=false AND status=1 LIMIT 1`);
    assert.ok(user && unit, "fixture needs an active user and operating unit");
    const scope = { tenantId: unit.tenant_id as string, parkId: unit.park_id as string };
    const candidates = await service.unitCandidates(scope, { page: 1, page_size: 100, eligible_only: true });
    const candidate = candidates.items[0] as { id: string } | undefined;
    assert.ok(candidate, "fixture needs an eligible operating unit");
    const room = await service.createRoom(scope, { sub: user.id } as never, { unit_id: candidate.id, room_type: "employee", capacity: 1, facilities: [] });
    const [bed] = await dataSource.query(`SELECT id FROM biz_apartment_bed WHERE room_id=$1`, [room.id]);
    const [application] = await dataSource.query(`INSERT INTO biz_apartment_application(tenant_id,park_id,application_code,applicant_user_id,applicant_name,applicant_type,requested_room_type,requested_start_date,reason,status,policy_accepted,create_by,update_by) VALUES($1,$2,$3,$4,'测试员工','internal_employee','employee',current_date,'能源交接回归','allocated',true,$4,$4) RETURNING id`, [scope.tenantId, scope.parkId, `ENERGY-${Date.now()}`, user.id]);
    const [stay] = await dataSource.query(`INSERT INTO biz_apartment_stay(tenant_id,park_id,stay_code,application_id,room_id,bed_id,occupant_user_id,occupant_name,planned_start_date,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,'测试员工',current_date,'reserved',$7,$7) RETURNING id`, [scope.tenantId, scope.parkId, `STAY-${Date.now()}`, application.id, room.id, bed.id, user.id]);
    const [meter] = await dataSource.query(`INSERT INTO energy_meter(tenant_id,park_id,room_id,meter_code,meter_name,meter_type,meter_purpose,multiplier,unit,initial_reading,current_reading,status,is_enabled,create_by,update_by) VALUES($1,$2,$3,$4,'公寓测试水表','WATER','TENANT',1,'m³',10,10,'ONLINE',true,$5,$5) RETURNING id`, [scope.tenantId, scope.parkId, candidate.id, `APT-W-${Date.now()}`, user.id]);
    const listed = await service.handoverMeters(scope, stay.id);
    assert.deepEqual(listed.map((item: { id: string }) => item.id), [meter.id]);
    const result = await service.checkIn(scope, { sub: user.id } as never, stay.id, { items: [{}], keys: [{}], photo_file_ids: [user.id], meter_readings: [{ meter_id: meter.id, reading_value: "12.5000" }] });
    assert.equal(result.energy_readings.length, 1);
    const [reading] = await dataSource.query(`SELECT reading_value,previous_reading_value,consumption_value,confirmation_status,source_domain,source_type,source_id FROM energy_reading WHERE meter_id=$1`, [meter.id]);
    assert.equal(reading.reading_value, "12.5000");
    assert.equal(reading.previous_reading_value, "10.0000");
    assert.equal(reading.consumption_value, "2.5000");
    assert.equal(reading.confirmation_status, "CONFIRMED");
    assert.equal(reading.source_domain, "apartment");
    assert.equal(reading.source_type, "move_in_handover");
    assert.equal(reading.source_id, result.id);
    const [updatedMeter] = await dataSource.query(`SELECT current_reading FROM energy_meter WHERE id=$1`, [meter.id]);
    const [updatedStay] = await dataSource.query(`SELECT status FROM biz_apartment_stay WHERE id=$1`, [stay.id]);
    assert.equal(updatedMeter.current_reading, "12.5000");
    assert.equal(updatedStay.status, "active");
    await service.requestCheckout(scope, { sub: user.id } as never, stay.id);
    await assert.rejects(
      () => service.checkOut(scope, { sub: user.id } as never, stay.id, { items: [{}], keys: [{}], photo_file_ids: [user.id], meter_readings: [{ meter_id: meter.id, reading_value: "12.0000" }] }),
      /交接读数不得小于表计当前读数/
    );
    const [rolledBackStay] = await dataSource.query(`SELECT status FROM biz_apartment_stay WHERE id=$1`, [stay.id]);
    const [{ moveOutReadings }] = await dataSource.query(`SELECT count(*)::int AS "moveOutReadings" FROM energy_reading WHERE meter_id=$1 AND source_type='move_out_handover'`, [meter.id]);
    assert.equal(rolledBackStay.status, "checkout_pending");
    assert.equal(moveOutReadings, 0);
  } finally {
    await dataSource.destroy();
  }
});
