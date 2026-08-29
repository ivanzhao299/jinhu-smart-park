import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { RentalStatusProjectionService } from "./rental-status-projection.service";
import { UnitEntity } from "../units/entities/unit.entity";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";

const scope = { tenantId: "tenant-a", parkId: "park-a" };

function fixture(rentalStatus: number, blocked = false) {
  const unit = { id: "unit-a", tenantId: scope.tenantId, parkId: scope.parkId,
    rentalStatus, status: 1 } as UnitEntity;
  const unitSaves: UnitEntity[] = [];
  const logSaves: unknown[] = [];
  const unitRepository = {
    findOne: async (options: unknown) => {
      assert.match(JSON.stringify(options), /pessimistic_write/);
      return unit;
    },
    save: async (value: UnitEntity) => { unitSaves.push(value); return value; }
  };
  const logRepository = {
    create: (value: unknown) => value,
    save: async (value: unknown) => { logSaves.push(value); return value; }
  };
  const manager = {
    getRepository: (entity: unknown) => entity === UnitEntity ? unitRepository :
      entity === UnitStatusLogEntity ? logRepository : assert.fail("unexpected repository"),
    query: async (sql: string, parameters: unknown[]) => {
      assert.deepEqual(parameters, [scope.tenantId, scope.parkId, "unit-a"]);
      if (sql.includes("lock_property_unit_scope")) return [];
      assert.match(sql, /biz_property_occupancy/);
      assert.match(sql, /biz_housing_lease/);
      assert.match(sql, /biz_homestay_booking/);
      assert.match(sql, /rel_leasing_contract_unit/);
      return [{ blocked }];
    }
  };
  return { unit, unitSaves, logSaves, manager };
}

function input(manager: unknown, action: "occupy" | "release") {
  return { manager, scope, unitId: "unit-a", actorId: "user-a", actorName: "Operator",
    sourceType: "housing_lease" as const, sourceId: "lease-a", action };
}

test("occupy projects available unit to rented and writes one system audit", async () => {
  const state = fixture(10);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "occupy") as never);
  assert.deepEqual(result, { disposition: "changed", beforeStatus: 10, afterStatus: 30 });
  assert.equal(state.unitSaves.length, 1);
  assert.equal(state.logSaves.length, 1);
  assert.equal((state.logSaves[0] as { sourceType: string }).sourceType, "system");
});

test("occupy is idempotent when already rented", async () => {
  const state = fixture(30);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "occupy") as never);
  assert.equal(result.disposition, "unchanged");
  assert.equal(state.unitSaves.length, 0);
  assert.equal(state.logSaves.length, 0);
});

test("occupy fails closed on manual strong status", async () => {
  const state = fixture(50);
  await assert.rejects(() => new RentalStatusProjectionService().project(
    input(state.manager, "occupy") as never), ConflictException);
  assert.equal(state.unitSaves.length, 0);
  assert.equal(state.logSaves.length, 0);
});

test("release projects rented unit to available when no business remains", async () => {
  const state = fixture(30, false);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  assert.deepEqual(result, { disposition: "changed", beforeStatus: 30, afterStatus: 10 });
  assert.equal(state.logSaves.length, 1);
});

test("release projects expiring status to available when no business remains", async () => {
  const state = fixture(40, false);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  assert.deepEqual(result, { disposition: "changed", beforeStatus: 40, afterStatus: 10 });
});

test("release preserves rented while another business occupancy remains", async () => {
  const state = fixture(30, true);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  assert.equal(result.disposition, "kept_occupied");
  assert.equal(state.unitSaves.length, 0);
  assert.equal(state.logSaves.length, 0);
});

test("release normalizes expiring status to rented while another business remains", async () => {
  const state = fixture(40, true);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  assert.deepEqual(result, { disposition: "kept_occupied", beforeStatus: 40, afterStatus: 30 });
  assert.equal(state.unitSaves.length, 1);
  assert.equal(state.logSaves.length, 1);
});

test("commercial blocker is limited to a currently effective contract", async () => {
  const state = fixture(30, true);
  await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  const manager = state.manager as { query: (sql: string, parameters: unknown[]) => Promise<unknown> };
  const original = manager.query;
  let blockerSql = "";
  manager.query = async (sql, parameters) => {
    if (!sql.includes("lock_property_unit_scope")) blockerSql = sql;
    return original(sql, parameters);
  };
  await new RentalStatusProjectionService().project(input(manager, "release") as never);
  assert.match(blockerSql, /contract\.status='75'/);
  assert.match(blockerSql, /contract\.effective_date IS NOT NULL/);
  assert.match(blockerSql, /contract\.effective_date[\s\S]*<=/);
});

test("release preserves a later manual strong status", async () => {
  const state = fixture(60);
  const result = await new RentalStatusProjectionService().project(input(state.manager, "release") as never);
  assert.equal(result.disposition, "kept_strong_status");
  assert.equal(state.unitSaves.length, 0);
  assert.equal(state.logSaves.length, 0);
});
