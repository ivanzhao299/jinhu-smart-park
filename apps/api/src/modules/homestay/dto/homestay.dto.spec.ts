import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateHomestayBookingDto,
  HomestayBookingQueryDto,
  RescheduleHomestayBookingDto,
  UpsertHomestayRateOverrideDto
} from "./homestay.dto";

const unitId = "11111111-1111-4111-8111-111111111111";

test("homestay DTOs reject impossible business calendar dates", async () => {
  const inputs = [
    plainToInstance(HomestayBookingQueryDto, { date_from: "2026-02-30" }),
    plainToInstance(UpsertHomestayRateOverrideDto, {
      business_date: "2026-02-30",
      daily_rate: 100,
      reason: "override"
    }),
    plainToInstance(CreateHomestayBookingDto, {
      unit_id: unitId,
      arrival_date: "2026-02-30",
      departure_date: "2026-03-02"
    }),
    plainToInstance(RescheduleHomestayBookingDto, {
      arrival_date: "2026-02-28",
      departure_date: "2026-02-30",
      reason: "reschedule"
    })
  ];

  for (const input of inputs) {
    assert.ok((await validate(input)).length > 0);
  }
});

test("homestay DTOs accept real business calendar dates", async () => {
  const dto = plainToInstance(CreateHomestayBookingDto, {
    unit_id: unitId,
    arrival_date: "2026-02-28",
    departure_date: "2026-03-01"
  });
  assert.deepEqual(await validate(dto), []);
});
