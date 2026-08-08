import assert from "node:assert/strict";
import test from "node:test";
import { typeormQueryRows } from "./typeorm-query-rows";

test("unwraps PostgreSQL DML tuples while preserving direct row-array fixtures", () => {
  const rows = [{ id: "row-1" }];
  assert.equal(typeormQueryRows([rows, 1]), rows);
  assert.equal(typeormQueryRows(rows), rows);
});

test("fails closed for malformed query and inconsistent affected-row results", () => {
  assert.deepEqual(typeormQueryRows(null), []);
  assert.deepEqual(typeormQueryRows([[{ id: "row-1" }], 0]), []);
  assert.deepEqual(typeormQueryRows([[{ id: "row-1" }], 1, "unexpected"]), []);
});
