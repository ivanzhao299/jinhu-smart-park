import assert from "node:assert/strict";
import { test } from "node:test";
import { projectPayrollCompensationInputs, type PayrollCompensationSegment } from "./hr-payroll-compensation-input";

const segment = (id: string, from: string, through: string | null, salary: string): PayrollCompensationSegment => ({
  id, version: 1, effectiveFrom: from, effectiveThrough: through, planId: "plan", planVersion: 2,
  baseSalary: salary, allowanceAmount: "0.00", variableTarget: "0.00",
});
const input = {
  periodStart: "2026-10-01", periodEnd: "2026-10-31", eligibleStart: "2026-10-01", eligibleEnd: "2026-10-31",
  policy: "full_period_single" as const, dependencies: ["hr:基本工资"],
  segments: [segment("one", "2026-01-01", null, "6000.10")],
};

test("full-period pay preserves cents and requires an explicit complete single salary source", () => {
  assert.deepEqual(projectPayrollCompensationInputs(input), { 基本工资: "6000.1000" });
  assert.throws(() => projectPayrollCompensationInputs({ ...input, policy: undefined }), /explicit approved/);
  assert.throws(() => projectPayrollCompensationInputs({ ...input, eligibleStart: "2026-10-16" }), /complete period/);
  assert.throws(() => projectPayrollCompensationInputs({ ...input, segments: [] }), /incomplete/);
});

test("approved calendar-day basis handles salary changes and partial-month eligibility", () => {
  const changed = { ...input, policy: "calendar_day_prorated" as const,
    segments: [segment("first", "2026-10-01", "2026-10-15", "3100.00"), segment("second", "2026-10-16", null, "6200.00")] };
  assert.deepEqual(projectPayrollCompensationInputs(changed), { 基本工资: "4700.0000" });
  assert.deepEqual(projectPayrollCompensationInputs({ ...changed, eligibleStart: "2026-10-16" }), { 基本工资: "3200.0000" });
  assert.throws(() => projectPayrollCompensationInputs({ ...changed, policy: "full_period_single" }), /one source/);
  assert.deepEqual(projectPayrollCompensationInputs({ ...changed, periodStart: "2024-02-01", periodEnd: "2024-02-29",
    eligibleStart: "2024-02-15", eligibleEnd: "2024-02-29", segments: [segment("leap", "2024-02-01", null, "2900.00")] }), { 基本工资: "1500.0000" });
});

test("gaps, overlaps, duplicate source versions and invalid dates cannot silently pick the latest salary", () => {
  for (const segments of [
    [segment("a", "2026-10-02", null, "1")],
    [segment("a", "2026-10-01", "2026-10-15", "1"), segment("b", "2026-10-15", null, "2")],
    [input.segments[0]!, input.segments[0]!],
    [{ ...input.segments[0]!, version: 0 }],
  ]) assert.throws(() => projectPayrollCompensationInputs({ ...input, policy: "calendar_day_prorated", segments }));
  assert.throws(() => projectPayrollCompensationInputs({ ...input, periodEnd: "2026-02-30" }), /Invalid compensation date/);
  assert.throws(() => projectPayrollCompensationInputs({ ...input, eligibleEnd: "2026-11-01" }), /Invalid payroll compensation range/);
});

test("only requested salary fields are read, and rounding occurs after summing all segments", () => {
  assert.deepEqual(projectPayrollCompensationInputs({ ...input, dependencies: [], policy: undefined, segments: [] }), {});
  assert.deepEqual(projectPayrollCompensationInputs({ ...input, segments: [{ ...input.segments[0]!, allowanceAmount: "invalid" }] }), { 基本工资: "6000.1000" });
  assert.deepEqual(projectPayrollCompensationInputs({ ...input, policy: "calendar_day_prorated",
    segments: [segment("a", "2026-10-01", "2026-10-15", "0.01"), segment("b", "2026-10-16", null, "0.01")] }), { 基本工资: "0.0100" });
  assert.deepEqual(projectPayrollCompensationInputs({ ...input, segments: [segment("max", "2026-10-01", null, "9999999999999999.99")] }), { 基本工资: "9999999999999999.9900" });
});
