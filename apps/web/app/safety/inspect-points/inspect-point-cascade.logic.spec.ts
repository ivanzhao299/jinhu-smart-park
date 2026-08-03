import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLocationReferencePayload,
  changeLocationParent,
  floorCandidates,
  reconcileLocationSelection,
  unitCandidates,
  withRetainedCandidate
} from "./inspect-point-cascade.logic";

test("inspection point payload sends explicit nulls when a location relation is cleared", () => {
  assert.deepEqual(
    buildLocationReferencePayload({ buildingId: "", floorId: "", unitId: "" }),
    { building_id: null, floor_id: null, unit_id: null }
  );
  assert.deepEqual(
    buildLocationReferencePayload({ buildingId: "building-a", floorId: "", unitId: "" }),
    { building_id: "building-a", floor_id: null, unit_id: null }
  );
});

const floors = [
  { id: "floor-a1", buildingId: "building-a" },
  { id: "floor-a2", buildingId: "building-a" },
  { id: "floor-b1", buildingId: "building-b" }
];
const units = [
  { id: "unit-a1", buildingId: "building-a", floorId: "floor-a1" },
  { id: "unit-a2", buildingId: "building-a", floorId: "floor-a2" },
  { id: "unit-b1", buildingId: "building-b", floorId: "floor-b1" }
];

test("inspection point location candidates follow building and floor parents", () => {
  assert.deepEqual(floorCandidates(floors, "building-a").map((item) => item.id), ["floor-a1", "floor-a2"]);
  assert.deepEqual(floorCandidates(floors, ""), []);
  assert.deepEqual(unitCandidates(units, "floor-a1").map((item) => item.id), ["unit-a1"]);
  assert.deepEqual(unitCandidates(units, ""), []);
});

test("changing a building clears floor and unit values outside the new hierarchy", () => {
  assert.deepEqual(
    changeLocationParent(
      { buildingId: "building-a", floorId: "floor-a1", unitId: "unit-a1" },
      "buildingId",
      "building-b",
      floors,
      units
    ),
    { buildingId: "building-b", floorId: "", unitId: "" }
  );
});

test("changing a floor retains only a unit belonging to that floor", () => {
  assert.deepEqual(
    changeLocationParent(
      { buildingId: "building-a", floorId: "floor-a1", unitId: "unit-a1" },
      "floorId",
      "floor-a2",
      floors,
      units
    ),
    { buildingId: "building-a", floorId: "floor-a2", unitId: "" }
  );
});

test("editing reconciles historical mismatched descendants before submission", () => {
  assert.deepEqual(
    reconcileLocationSelection(
      { buildingId: "building-a", floorId: "floor-b1", unitId: "unit-b1" },
      floors,
      units
    ),
    { buildingId: "building-a", floorId: "", unitId: "" }
  );
});

test("inspection point editing waits for location references before reconciliation", () => {
  const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(source, /if \(!referenceDataReady\)/);
  assert.match(source, /disabled=\{!referenceDataReady\}/);
  assert.ok(source.indexOf("if (!referenceDataReady)") < source.indexOf("reconcileLocationSelection({"));
});

test("editing retains current location records omitted by a bounded candidate catalog", () => {
  assert.deepEqual(withRetainedCandidate(floors, { id: "floor-late", buildingId: "building-a" }).map((item) => item.id), [
    "floor-a1",
    "floor-a2",
    "floor-b1",
    "floor-late"
  ]);
  assert.equal(withRetainedCandidate(floors, floors[0]), floors);

  const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  assert.match(source, /const currentFloor = row\.floor \?\? \(row\.floorId && row\.buildingId/);
  assert.match(source, /const editFloors = withRetainedCandidate\(floors, currentFloor\)/);
  assert.match(source, /}, editFloors, editUnits\)/);
});
