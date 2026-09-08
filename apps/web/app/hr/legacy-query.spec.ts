import assert from "node:assert/strict";
import test from "node:test";
import { parseLegacyQueryId } from "./performance/legacy-query";

test("legacy query identifiers preserve zero, trim input and respect SQL Server int bounds", () => {
  assert.equal(parseLegacyQueryId("  "), undefined);
  assert.equal(parseLegacyQueryId("0"), 0);
  assert.equal(parseLegacyQueryId(" 007 "), 7);
  assert.equal(parseLegacyQueryId("2147483647"), 2147483647);
  for (const invalid of ["-1", "1.2", "1e3", "NaN", "Infinity", "2147483648", "999999999999999999999"]) {
    assert.throws(() => parseLegacyQueryId(invalid), /整数编号/u);
  }
});
