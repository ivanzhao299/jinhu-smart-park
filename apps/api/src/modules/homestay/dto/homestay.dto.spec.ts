import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateHomestayBookingDto,
  HomestayBookingQueryDto,
  HomestayReasonDto,
  HomestayTurnoverQueryDto,
  HomestayUnitCandidateQueryDto,
  RegisterHomestayLedgerEntryDto,
  RescheduleHomestayBookingDto,
  UpsertHomestayRateDto,
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

test("homestay money remains an exact decimal string and rejects numeric JSON input", async () => {
  const ledger = plainToInstance(RegisterHomestayLedgerEntryDto, {
    entry_type: "payment",
    charge_type: "room",
    amount: "9999999999999999.99",
    reason: "exact"
  });
  assert.deepEqual(await validate(ledger), []);
  assert.equal(ledger.amount, "9999999999999999.99");

  const numericLedger = plainToInstance(RegisterHomestayLedgerEntryDto, {
    entry_type: "payment",
    charge_type: "room",
    amount: Number("9999999999999999.99"),
    reason: "unsafe"
  });
  assert.ok((await validate(numericLedger)).some((error) => error.property === "amount"));

  const numericRate = plainToInstance(UpsertHomestayRateDto, {
    base_daily_rate: Number("9999999999999999.99")
  });
  assert.ok((await validate(numericRate)).some((error) => error.property === "base_daily_rate"));
});

test("homestay DTOs accept real business calendar dates", async () => {
  const dto = plainToInstance(CreateHomestayBookingDto, {
    unit_id: unitId,
    arrival_date: "2026-02-28",
    departure_date: "2026-03-01"
  });
  assert.deepEqual(await validate(dto), []);
});

test("homestay destructive booking actions require a real operator reason", async () => {
  const blankReason = plainToInstance(HomestayReasonDto, { reason: "   " });
  assert.ok((await validate(blankReason)).some((error) => error.property === "reason"));

  const realReason = plainToInstance(HomestayReasonDto, { reason: "住客行程取消" });
  assert.deepEqual(await validate(realReason), []);
  assert.equal(realReason.reason, "住客行程取消");
});

test("homestay candidate and turnover queries enforce bounded pagination and known statuses", async () => {
  const candidate = plainToInstance(HomestayUnitCandidateQueryDto, { page: 2, page_size: 100 });
  assert.deepEqual(await validate(candidate), []);

  const oversizedCandidate = plainToInstance(HomestayUnitCandidateQueryDto, { page_size: 101 });
  assert.ok((await validate(oversizedCandidate)).some((error) => error.property === "page_size"));

  const openTurnovers = plainToInstance(HomestayTurnoverQueryDto, { status: "open", page: 1, page_size: 20 });
  assert.deepEqual(await validate(openTurnovers), []);

  const invalidTurnovers = plainToInstance(HomestayTurnoverQueryDto, { status: "all" });
  assert.ok((await validate(invalidTurnovers)).some((error) => error.property === "status"));
});
