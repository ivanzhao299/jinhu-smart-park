import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  V9_TARGETS, assertAbsentV9, assertIndependentReviewV9, staticV9Candidate,
} from "../track-b2c-000197-preliminary-orchestrator-v9.mjs";

const source = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v9.mjs"), "utf8");
const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37", build_residue: false };

test("logical v9 run ID is 02d while physical resources remain exact approved 02b identities", () => {
  assert.equal(staticV9Candidate({ mode: "unfrozen" }).formal_run_id, "b2c197_prelim_20260802d");
  assert.deepEqual(V9_TARGETS.map(({ container, containerId }) => [container, containerId]), [
    ["jinhu-b2c197-prelim-20260802b-c", "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6"],
    ["jinhu-b2c197-prelim-20260802b-d", "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896"],
  ]);
});

test("absent requires numeric zero rows and exact old catalog", () => {
  assert.equal(assertAbsentV9(valid), valid);
  for (const drift of [{ approval_rows: 1 }, { approval_rows: "0" }, { history_primary: [] }, { history_mirror: [] },
    { indexdef: "drift" }, { predicate: "drift" }, { build_residue: true }]) assert.throws(() => assertAbsentV9({ ...valid, ...drift }));
});

test("static mode explicitly distinguishes pre-freeze and post-freeze contracts", () => {
  const mode = process.env.B2C_000197_V9_STATIC_MODE ?? "unfrozen";
  const value = staticV9Candidate({ mode });
  if (mode === "frozen") {
    assert.equal(value.manifest_frozen, true); assert.equal(value.status, "frozen-awaiting-independent-reviews");
  } else {
    assert.equal(value.manifest_frozen, false); assert.equal(value.status, "unfrozen-v9-integrated");
  }
  assert.equal(value.execution_authorized, false); assert.equal(value.live_execution, false);
});

test("formal static and lifecycle Node test children all declare TAP reporter", () => {
  for (const marker of ["static-v9-evidence", "static-v9-orchestrator", "static-v9-capability",
    "static-v9-recursive-closure", "static-v9-closure", "static-v9-contract", "static-v9-lifecycle",
    "approval-named-tests"]) assert.match(source, new RegExp(marker));
  assert.doesNotMatch(source, /args:\s*\["--test"[,\]]/u);
  const specArgs = [...source.matchAll(/\[("--test-reporter=tap"[^\]]*\.spec\.[^\]]*)\]/gsu)];
  assert.ok(specArgs.length >= 5); assert.ok(specArgs.every((match) => match[1].includes("--test-reporter=tap")));
});

const reviewBindings = Object.freeze({
  formal_run_id: "b2c197_prelim_20260802d", manifest_raw_sha256: "manifest",
  handoff_raw_sha256: "handoff", resource_authority_raw_sha256: "resource",
  executor_raw_sha256: "executor", orchestrator_raw_sha256: "orchestrator",
  resolver_raw_sha256: "resolver",
});
const reviewText = (entries = reviewBindings) => ["b2c-000197-preliminary-v9-independent-review-v1",
  ...Object.entries(entries).map(([name, value]) => `${name}\t${value}`),
  "reviewer_authority\tindependent-database-reviewer", "decision\tGO"].join("\n");

test("v9 review schema directly binds the exact resolver raw SHA", () => {
  const parsed = assertIndependentReviewV9(reviewText(), "independent-database-reviewer", reviewBindings);
  assert.equal(parsed.resolver_raw_sha256, "resolver");
  assert.match(source, /resolver_raw_sha256:\s*resolver/u);
  assert.match(source, /resolver !== expected\.resolver/u);
  assert.match(source, /review_schema:\s*"b2c-000197-preliminary-v9-independent-review-v1"/u);
  assert.match(source, /review_required_fields:[\s\S]*"resolver_raw_sha256"/u);
});

test("v9 review schema fails closed when resolver raw SHA is missing", () => {
  const missing = { ...reviewBindings }; delete missing.resolver_raw_sha256;
  assert.throws(() => assertIndependentReviewV9(reviewText(missing), "independent-database-reviewer", reviewBindings),
    /v9-review:resolver_raw_sha256/u);
});

test("v9 review schema fails closed when resolver raw SHA is incorrect", () => {
  assert.throws(() => assertIndependentReviewV9(reviewText({ ...reviewBindings, resolver_raw_sha256: "wrong" }),
    "independent-database-reviewer", reviewBindings), /v9-review:resolver_raw_sha256/u);
});
