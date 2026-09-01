#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LightweightFirstSliceOrderError, verifyLightweightFirstSliceOrder } from "../hr-cutover/verify-lightweight-first-slice-order.mjs";

const root = resolve(import.meta.dirname, "../..");
const path = resolve(root, "scripts/hr-cutover/contracts/lightweight-first-slice-order-v1.json");
const valid = JSON.parse(readFileSync(path, "utf8"));
const clone = () => structuredClone(valid);
const rejects = (mutate, code) => assert.throws(() => {
  const candidate = clone();
  mutate(candidate);
  verifyLightweightFirstSliceOrder(candidate);
}, (error) => error instanceof LightweightFirstSliceOrderError && error.code === code);

assert.deepEqual(verifyLightweightFirstSliceOrder(valid), {
  ok: true,
  order: ["T0", "T1", "T2", "T5_NONFILE", "T3", "T4"],
  productionImport: "HOLD"
});
rejects((value) => { value.orderedSlices[3].id = "T4"; }, "LIGHTWEIGHT_FIRST_SLICE_ORDER_INVALID");
rejects((value) => { value.orderedSlices[3].dependsOn = ["T0"]; }, "LIGHTWEIGHT_FIRST_DEPENDENCY_INVALID");
rejects((value) => { value.orderedSlices[5].mustBeLastDataWriteSlice = false; }, "LIGHTWEIGHT_FIRST_PAYROLL_NOT_LAST");
rejects((value) => { value.orderedSlices[3].fileEvidence = "allowed"; }, "LIGHTWEIGHT_FIRST_NONFILE_BOUNDARY_INVALID");
rejects((value) => { value.separateHolds.T5_FILE.status = "READY"; }, "LIGHTWEIGHT_FIRST_HOLD_BOUNDARY_INVALID");

console.log("Yuzhou lightweight-first slice order contract passed.");
