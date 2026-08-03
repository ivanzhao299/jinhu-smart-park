import assert from "node:assert/strict";
import test from "node:test";
import {
  changeLocationParent,
  floorCandidates,
  reconcileLocationSelection,
  unitCandidates
} from "./inspect-point-cascade.logic";

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
