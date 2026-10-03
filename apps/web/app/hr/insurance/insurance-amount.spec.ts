import assert from "node:assert/strict";
import test from "node:test";
import { loadedEmployeeAmount } from "./insurance-amount";

const sum = (...values: Array<string | null | undefined>) => loadedEmployeeAmount(values.map(employeeAmount => ({ employeeAmount })));
test("large valid database decimals retain every cent in the page total", () => {
  assert.equal(sum("90071992547409.91", "19.99"), "90071992547429.90");
  assert.equal(sum(...Array.from({ length: 30 }, () => "9999999999999999.99")), "299999999999999999.70");
});
test("mixed signs cancel exactly and do not produce negative zero", () => {
  assert.equal(sum("90071992547409.91", "-90071992547409.90"), "0.01");
  assert.equal(sum("-0.01", "-0.09"), "-0.10");
  assert.equal(sum("-0.00", "0.00"), "0.00");
});
test("ordinary cents, whole amounts and an empty loaded page remain compatible", () => {
  assert.equal(sum("0.10", "0.20", "1", "2.3", "0001.01"), "4.61");
  assert.equal(sum(), "0.00");
});
test("a missing or malformed amount invalidates the total rather than silently excluding it", () => {
  for (const value of [undefined, null, "", "1e3", "NaN", "Infinity", " 1.00", "1,000.00", "1.001", "1.", "+1.00"]) {
    assert.equal(sum("12.00", value), "—", String(value));
  }
});
