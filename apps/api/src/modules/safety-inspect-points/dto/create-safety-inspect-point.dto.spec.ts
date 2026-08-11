import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateSafetyInspectPointDto } from "./update-safety-inspect-point.dto";

test("inspection point update preserves explicit nulls used to clear location relations", async () => {
  const dto = plainToInstance(UpdateSafetyInspectPointDto, {
    building_id: null,
    floor_id: null,
    unit_id: null
  });

  assert.equal(dto.building_id, null);
  assert.equal(dto.floor_id, null);
  assert.equal(dto.unit_id, null);
  assert.deepEqual(await validate(dto), []);
});

test("inspection point update still distinguishes omitted location relations", () => {
  const dto = plainToInstance(UpdateSafetyInspectPointDto, {});

  assert.equal(dto.building_id, undefined);
  assert.equal(dto.floor_id, undefined);
  assert.equal(dto.unit_id, undefined);
});
