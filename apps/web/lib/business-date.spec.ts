import assert from "node:assert/strict";
import test from "node:test";
import { addBusinessDateDays, addBusinessDateMonths, businessDate } from "./business-date";

test("business date uses Shanghai calendar boundaries", () => {
  assert.equal(businessDate(new Date("2026-07-24T16:30:00Z")), "2026-07-25");
  assert.equal(businessDate(new Date("2026-07-24T15:59:59Z")), "2026-07-24");
});

test("business date day addition remains calendar based", () => {
  assert.equal(addBusinessDateDays("2026-07-31", 1), "2026-08-01");
});

test("business date month addition clamps only the target month", () => {
  assert.equal(addBusinessDateMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addBusinessDateMonths("2026-02-28", 12), "2027-02-28");
});
