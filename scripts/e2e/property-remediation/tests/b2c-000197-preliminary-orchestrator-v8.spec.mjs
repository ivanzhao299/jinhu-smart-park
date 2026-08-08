import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { V8_TARGETS, assertAbsentV8, staticV8Candidate } from "../track-b2c-000197-preliminary-orchestrator-v8.mjs";

const source = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v8.mjs"), "utf8");
const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37", build_residue: false };

test("logical v8 run ID is 02c while physical resources remain exact approved 02b identities", () => {
  assert.equal(staticV8Candidate({ mode: "unfrozen" }).formal_run_id, "b2c197_prelim_20260802c");
  assert.deepEqual(V8_TARGETS.map(({ container, containerId }) => [container, containerId]), [
    ["jinhu-b2c197-prelim-20260802b-c", "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6"],
    ["jinhu-b2c197-prelim-20260802b-d", "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896"],
  ]);
});

test("absent requires numeric zero rows and exact old catalog", () => {
  assert.equal(assertAbsentV8(valid), valid);
  for (const drift of [{ approval_rows: 1 }, { approval_rows: "0" }, { history_primary: [] }, { history_mirror: [] },
    { indexdef: "drift" }, { predicate: "drift" }, { build_residue: true }]) assert.throws(() => assertAbsentV8({ ...valid, ...drift }));
});

test("static mode explicitly distinguishes pre-freeze and post-freeze contracts", () => {
  const mode = process.env.B2C_000197_V8_STATIC_MODE ?? "unfrozen";
  const value = staticV8Candidate({ mode });
  if (mode === "frozen") {
    assert.equal(value.manifest_frozen, true); assert.equal(value.status, "frozen-awaiting-independent-reviews");
  } else {
    assert.equal(value.manifest_frozen, false); assert.equal(value.status, "unfrozen-v8-integrated");
  }
  assert.equal(value.execution_authorized, false); assert.equal(value.live_execution, false);
});

test("formal static and lifecycle Node test children all declare TAP reporter", () => {
  for (const marker of ["static-v8-evidence", "static-v8-orchestrator", "static-v8-capability",
    "static-v8-recursive-closure", "static-v8-closure", "static-v8-contract", "static-v8-lifecycle",
    "approval-named-tests"]) assert.match(source, new RegExp(marker));
  assert.doesNotMatch(source, /args:\s*\["--test"[,\]]/u);
  const specArgs = [...source.matchAll(/\[("--test-reporter=tap"[^\]]*\.spec\.[^\]]*)\]/gsu)];
  assert.ok(specArgs.length >= 5); assert.ok(specArgs.every((match) => match[1].includes("--test-reporter=tap")));
});
