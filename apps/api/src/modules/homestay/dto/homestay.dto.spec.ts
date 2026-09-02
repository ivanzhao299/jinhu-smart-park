import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateHomestayBookingDto,
  HomestayAvailabilityQueryDto,
  HomestayBookingQueryDto,
  HomestayCandidateQueryDto,
  HomestayGuestCandidateQueryDto,
  HomestayFinanceQueryDto,
  HomestayReasonDto,
  HomestayStayQueryDto,
  HomestayTaskQueryDto,
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

test("homestay dated rate overrides require a positive daily rate", async () => {
  const zeroRate = plainToInstance(UpsertHomestayRateOverrideDto, {
    business_date: "2026-08-01",
    daily_rate: "0",
    reason: "invalid zero rate"
  });
  assert.ok((await validate(zeroRate)).some((error) => error.property === "daily_rate"));

  const positiveRate = plainToInstance(UpsertHomestayRateOverrideDto, {
    business_date: "2026-08-01",
    daily_rate: "0.01",
    reason: "valid minimum rate"
  });
  assert.deepEqual(await validate(positiveRate), []);
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

  const restoredCandidate = plainToInstance(HomestayUnitCandidateQueryDto, {
    unit_id: "11111111-1111-4111-8111-111111111111"
  });
  assert.deepEqual(await validate(restoredCandidate), []);

  const invalidRestoredCandidate = plainToInstance(HomestayUnitCandidateQueryDto, {
    unit_id: "internal-id"
  });
  assert.ok((await validate(invalidRestoredCandidate))
    .some((error) => error.property === "unit_id"));

  const oversizedCandidate = plainToInstance(HomestayUnitCandidateQueryDto, { page_size: 101 });
  assert.ok((await validate(oversizedCandidate)).some((error) => error.property === "page_size"));

  const openTurnovers = plainToInstance(HomestayTurnoverQueryDto, { status: "open", page: 1, page_size: 20 });
  assert.deepEqual(await validate(openTurnovers), []);

  const invalidTurnovers = plainToInstance(HomestayTurnoverQueryDto, { status: "all" });
  assert.ok((await validate(invalidTurnovers)).some((error) => error.property === "status"));
});

test("A-2.5 homestay read DTOs validate queues, UUID filters, dates, and pagination", async () => {
  const bookingQuery = plainToInstance(HomestayBookingQueryDto, {
    keyword: "  HS-2026  "
  });
  assert.deepEqual(await validate(bookingQuery), []);
  assert.equal(bookingQuery.keyword, "HS-2026");
  assert.ok(
    (await validate(plainToInstance(HomestayBookingQueryDto, {
      keyword: "x".repeat(101)
    }))).some((error) => error.property === "keyword")
  );

  const availability = plainToInstance(HomestayAvailabilityQueryDto, {
    date_from: "2026-07-31",
    date_to: "2026-08-02",
    page: 2,
    page_size: 50
  });
  assert.deepEqual(await validate(availability), []);

  const missingAvailabilityDate = plainToInstance(HomestayAvailabilityQueryDto, {
    date_from: "2026-07-31"
  });
  assert.ok(
    (await validate(missingAvailabilityDate))
      .some((error) => error.property === "date_to")
  );

  const stay = plainToInstance(HomestayStayQueryDto, {
    queue: "arrivals",
    business_date: "2026-07-31"
  });
  assert.deepEqual(await validate(stay), []);
  assert.ok(
    (await validate(plainToInstance(HomestayStayQueryDto, { queue: "unknown" })))
      .some((error) => error.property === "queue")
  );

  const task = plainToInstance(HomestayTaskQueryDto, {
    status: "active",
    source_type: "homestay_turnover",
    business_date: "2026-07-31"
  });
  assert.deepEqual(await validate(task), []);
  assert.ok(
    (await validate(plainToInstance(HomestayTaskQueryDto, { status: "cancelled" })))
      .some((error) => error.property === "status")
  );

  const candidate = plainToInstance(HomestayCandidateQueryDto, {
    unit_id: "not-a-uuid",
    keyword: "空调"
  });
  assert.ok(
    (await validate(candidate)).some((error) => error.property === "unit_id")
  );
  assert.ok(
    (await validate(plainToInstance(HomestayGuestCandidateQueryDto, {})))
      .some((error) => error.property === "booking_id")
  );
  assert.ok((await validate(plainToInstance(HomestayGuestCandidateQueryDto, {
    booking_id: "11111111-1111-4111-8111-111111111111"
  }))).some((error) => error.property === "keyword"));
  assert.ok((await validate(plainToInstance(HomestayGuestCandidateQueryDto, {
    booking_id: "11111111-1111-4111-8111-111111111111",
    keyword: "张"
  }))).some((error) => error.property === "keyword"));
  for (const keyword of ["%%", "__", "%张", "_ 张 \\"]) {
    assert.ok((await validate(plainToInstance(HomestayGuestCandidateQueryDto, {
      booking_id: "11111111-1111-4111-8111-111111111111",
      keyword
    }))).some((error) => error.property === "keyword"));
  }
  assert.deepEqual(await validate(plainToInstance(HomestayGuestCandidateQueryDto, {
    booking_id: "11111111-1111-4111-8111-111111111111",
    keyword: "张三"
  })), []);

  const finance = plainToInstance(HomestayFinanceQueryDto, {
    status: "checked_out",
    page_size: 101
  });
  assert.ok(
    (await validate(finance)).some((error) => error.property === "page_size")
  );
});
