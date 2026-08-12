import assert from "node:assert/strict";
import test from "node:test";
import { computePropertyRoleBundleDiff } from "./property-role-bundle.service";

const permission = (code: string) => ({ id: `id-${code}`, code, name: code });

test("bundle merge adds missing permissions and preserves every extra permission", () => {
  const result = computePropertyRoleBundleDiff(
    [permission("bundle:a"), permission("bundle:b")],
    [permission("bundle:a"), permission("custom:x")],
    "merge"
  );
  assert.deepEqual(result.add.map((item) => item.code), ["bundle:b"]);
  assert.deepEqual(result.keepExtra.map((item) => item.code), ["custom:x"]);
  assert.deepEqual(result.removeExtra, []);
  assert.deepEqual(result.final.map((item) => item.code), ["bundle:a", "bundle:b", "custom:x"]);
});

test("bundle sync exposes removals and produces the exact bundle set", () => {
  const result = computePropertyRoleBundleDiff(
    [permission("bundle:a")],
    [permission("bundle:a"), permission("custom:x")],
    "sync"
  );
  assert.deepEqual(result.keepExtra, []);
  assert.deepEqual(result.removeExtra.map((item) => item.code), ["custom:x"]);
  assert.deepEqual(result.final.map((item) => item.code), ["bundle:a"]);
});
