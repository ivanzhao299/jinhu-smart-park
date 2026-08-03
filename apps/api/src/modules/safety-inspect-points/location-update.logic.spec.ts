import assert from "node:assert/strict";
import test from "node:test";
import { resolveLocationUpdate } from "./location-update.logic";

const existing = { buildingId: "building-a", floorId: "floor-a", unitId: "unit-a" };

test("clearing a building cascades to omitted floor and unit relations", () => {
  assert.deepEqual(resolveLocationUpdate(existing, { buildingId: null }), {
    buildingId: null,
    floorId: null,
    unitId: null
  });
});

test("clearing a floor cascades to an omitted unit while preserving its building", () => {
  assert.deepEqual(resolveLocationUpdate(existing, { floorId: null }), {
    buildingId: "building-a",
    floorId: null,
    unitId: null
  });
});

test("omitting every location field preserves the existing cascade", () => {
  assert.deepEqual(resolveLocationUpdate(existing, {}), existing);
});
