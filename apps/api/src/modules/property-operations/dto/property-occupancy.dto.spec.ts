import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreatePropertyOccupancyDto } from "./property-occupancy.dto";

const validOccupancy = {
  unit_id: "11111111-1111-4111-8111-111111111111",
  source_domain: "homestay",
  source_type: "homestay_booking",
  source_id: "booking-1",
  start_at: "2026-07-27T08:00:00+08:00",
  end_at: "2026-07-28T08:00:00+08:00",
  status: "active"
};

test("occupancy source identifiers reject whitespace-only values", async () => {
  for (const property of ["source_type", "source_id"] as const) {
    const dto = plainToInstance(CreatePropertyOccupancyDto, {
      ...validOccupancy,
      [property]: "   "
    });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === property));
  }
});

test("occupancy source identifiers retain trimmed non-empty values", async () => {
  const dto = plainToInstance(CreatePropertyOccupancyDto, {
    ...validOccupancy,
    source_type: " homestay_booking ",
    source_id: " booking-1 "
  });
  assert.equal(dto.source_type, "homestay_booking");
  assert.equal(dto.source_id, "booking-1");
  assert.deepEqual(await validate(dto), []);
});
