import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "HomestayTurnoverActions.tsx"), "utf8");

test("turnover work-order picker requires the work-order read permission without an unrelated module gate", () => {
  assert.match(source, /hasPermission\(user, SYSTEM_PERMISSIONS\.WORKORDER_READ\)/);
  assert.doesNotMatch(source, /hasAccess\(user, SYSTEM_PERMISSIONS\.WORKORDER_READ/);
  assert.match(source, /\{workOrderAllowed \? <RemoteEntityPicker/);
});
