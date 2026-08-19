import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { ApartmentsService } from "./apartments.service";

const databaseUrl = process.env.DATABASE_URL;
const mutationAllowed = process.env.APARTMENT_PG_TEST_ALLOW_MUTATION === "yes";

test("PostgreSQL apartment inclusion keeps reservation occupancy and bed capacity consistent", {
  skip: databaseUrl && mutationAllowed ? false : "DATABASE_URL and APARTMENT_PG_TEST_ALLOW_MUTATION=yes are required"
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const service = new ApartmentsService(dataSource);
  const actorId = randomUUID();
  let roomId: string | undefined;
  try {
    const [scopeRow] = await dataSource.query(`SELECT tenant_id,park_id FROM biz_unit WHERE is_deleted=false LIMIT 1`);
    assert.ok(scopeRow, "fixture database needs an operating unit");
    const scope = { tenantId: scopeRow.tenant_id as string, parkId: scopeRow.park_id as string };
    const candidates = await service.unitCandidates(scope, { page: 1, page_size: 100, eligible_only: true });
    const emptyPage = await service.unitCandidates(scope, { page: 999, page_size: 100, eligible_only: true });
    assert.equal(emptyPage.items.length, 0);
    assert.equal(emptyPage.total, candidates.total);
    const candidate = candidates.items[0] as { id?: string } | undefined;
    assert.ok(candidate?.id, "fixture database needs an eligible operating unit");

    const room = await service.createRoom(scope, { sub: actorId } as never, {
      unit_id: candidate.id,
      room_type: "employee",
      gender_policy: "any",
      capacity: 3,
      facilities: []
    });
    roomId = room.id;
    await service.updateRoom(scope, { sub: actorId } as never, room.id, { capacity: 2 });
    let [{ enabledBeds }] = await dataSource.query(
      `SELECT count(*) FILTER (WHERE status='enabled')::int AS "enabledBeds" FROM biz_apartment_bed WHERE room_id=$1 AND is_deleted=false`,
      [room.id]
    );
    assert.equal(enabledBeds, 2);

    await service.updateRoom(scope, { sub: actorId } as never, room.id, { management_status: "disabled" });
    let [occupancy] = await dataSource.query(`SELECT status,release_reason FROM biz_property_occupancy WHERE id=$1`, [room.occupancy_id]);
    assert.equal(occupancy.status, "released");
    assert.equal(occupancy.release_reason, "apartment-room-disabled");

    const restored = await service.updateRoom(scope, { sub: actorId } as never, room.id, { management_status: "enabled" });
    assert.equal(restored.occupancy_id, room.occupancy_id);
    [occupancy] = await dataSource.query(`SELECT status FROM biz_property_occupancy WHERE id=$1`, [restored.occupancy_id]);
    assert.equal(occupancy.status, "active");
    [{ enabledBeds }] = await dataSource.query(
      `SELECT count(*) FILTER (WHERE status='enabled')::int AS "enabledBeds" FROM biz_apartment_bed WHERE room_id=$1 AND is_deleted=false`,
      [room.id]
    );
    assert.equal(enabledBeds, 2);
  } finally {
    if (roomId) {
      await dataSource.query(`DELETE FROM biz_apartment_bed WHERE room_id=$1`, [roomId]);
      await dataSource.query(`DELETE FROM biz_apartment_room WHERE id=$1`, [roomId]);
      await dataSource.query(`DELETE FROM biz_property_occupancy WHERE source_domain='apartment' AND source_type='apartment_room' AND source_id=$1`, [roomId]);
    }
    await dataSource.destroy();
  }
});
