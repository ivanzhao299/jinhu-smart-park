import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  V10_TARGETS, assertAbsentV10, assertDrainAuthorityV10, assertIndependentReviewV10,
  frozenIdentityAuthorityV10, staticV10Candidate,
} from "../track-b2c-000197-preliminary-orchestrator-v10.mjs";

const source = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v10.mjs"), "utf8");
const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37", build_residue: false };

test("v10 formal run ID and physical resources both derive from the approved 02b authority", () => {
  assert.equal(staticV10Candidate({ mode: "unfrozen" }).formal_run_id, "b2c197_prelim_20260802b");
  assert.deepEqual(V10_TARGETS.map(({ container, containerId }) => [container, containerId]), [
    ["jinhu-b2c197-prelim-20260802b-c", "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6"],
    ["jinhu-b2c197-prelim-20260802b-d", "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896"],
  ]);
});

test("absent requires numeric zero rows and exact old catalog", () => {
  assert.equal(assertAbsentV10(valid), valid);
  for (const drift of [{ approval_rows: 1 }, { approval_rows: "0" }, { history_primary: [] }, { history_mirror: [] },
    { indexdef: "drift" }, { predicate: "drift" }, { build_residue: true }]) assert.throws(() => assertAbsentV10({ ...valid, ...drift }));
});

test("static mode explicitly distinguishes pre-freeze and post-freeze contracts", () => {
  const mode = process.env.B2C_000197_V10_STATIC_MODE ?? "unfrozen";
  const value = staticV10Candidate({ mode });
  if (mode === "frozen") {
    assert.equal(value.manifest_frozen, true); assert.equal(value.status, "frozen-awaiting-independent-reviews");
  } else {
    assert.equal(value.manifest_frozen, false); assert.equal(value.status, "unfrozen-v10-integrated");
  }
  assert.equal(value.execution_authorized, false); assert.equal(value.live_execution, false);
});

test("formal static and lifecycle Node test children all declare TAP reporter", () => {
  for (const marker of ["static-v10-evidence", "static-v10-orchestrator", "static-v10-capability",
    "static-v10-recursive-closure", "static-v10-closure", "static-v10-contract", "static-v10-lifecycle",
    "approval-named-tests"]) assert.match(source, new RegExp(marker));
  assert.doesNotMatch(source, /args:\s*\["--test"[,\]]/u);
  const specArgs = [...source.matchAll(/\[("--test-reporter=tap"[^\]]*\.spec\.[^\]]*)\]/gsu)];
  assert.ok(specArgs.length >= 5); assert.ok(specArgs.every((match) => match[1].includes("--test-reporter=tap")));
});

const reviewBindings = Object.freeze({
  formal_run_id: "b2c197_prelim_20260802b", manifest_raw_sha256: "manifest",
  handoff_raw_sha256: "handoff", resource_authority_raw_sha256: "resource",
  executor_raw_sha256: "executor", orchestrator_raw_sha256: "orchestrator",
  resolver_raw_sha256: "resolver",
});
const reviewText = (entries = reviewBindings) => ["b2c-000197-preliminary-v10-independent-review-v1",
  ...Object.entries(entries).map(([name, value]) => `${name}\t${value}`),
  "reviewer_authority\tindependent-database-reviewer", "decision\tGO"].join("\n");

test("v10 review schema directly binds the exact resolver raw SHA", () => {
  const parsed = assertIndependentReviewV10(reviewText(), "independent-database-reviewer", reviewBindings);
  assert.equal(parsed.resolver_raw_sha256, "resolver");
  assert.match(source, /resolver_raw_sha256:\s*resolver/u);
  assert.match(source, /resolver !== expected\.resolver/u);
  assert.match(source, /review_schema:\s*"b2c-000197-preliminary-v10-independent-review-v1"/u);
  assert.match(source, /review_required_fields:[\s\S]*"resolver_raw_sha256"/u);
});

test("v10 review schema fails closed when resolver raw SHA is missing", () => {
  const missing = { ...reviewBindings }; delete missing.resolver_raw_sha256;
  assert.throws(() => assertIndependentReviewV10(reviewText(missing), "independent-database-reviewer", reviewBindings),
    /v10-review:resolver_raw_sha256/u);
});

test("v10 review schema fails closed when resolver raw SHA is incorrect", () => {
  assert.throws(() => assertIndependentReviewV10(reviewText({ ...reviewBindings, resolver_raw_sha256: "wrong" }),
    "independent-database-reviewer", reviewBindings), /v10-review:resolver_raw_sha256/u);
});

const identityAuthority = Object.freeze({ writer_build: "approval-port-v8", runtime_version: "v8",
  runtime_raw_sha256: "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118",
  formal_run_id: "b2c197_prelim_20260802b",
  resource_authority_raw_sha256: "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73",
  target_c: "upgrade-to-195\tjinhu-b2c197-prelim-20260802b-c\tee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6\tjinhu_b2c197_c\t60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12",
  target_d: "fresh-to-195\tjinhu-b2c197-prelim-20260802b-d\tf0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896\tjinhu_b2c197_d\t7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5",
  review_schema: "b2c-000197-preliminary-v10-independent-review-v1",
  drain_schema: "b2c-000197-old-writer-drain-v10",
  sql_raw_sha256: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  r0_raw_sha256: "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439",
  r1_raw_sha256: "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b" });
const drainText = (entries = {}) => [identityAuthority.drain_schema,
  ...Object.entries({ formal_run_id: identityAuthority.formal_run_id,
    resource_authority_raw_sha256: identityAuthority.resource_authority_raw_sha256,
    decision: "GO", intake: "stopped", in_flight_approval_create_transactions: "0",
    new_writer_build: identityAuthority.writer_build, ...entries }).map(([name, value]) => `${name}\t${value}`)].join("\n");

test("all identity labels map to their exact frozen authorities", () => {
  assert.deepEqual(frozenIdentityAuthorityV10(), identityAuthority);
  for (const [label, authority] of Object.entries(identityAuthority)) {
    assert.ok(label.length > 0); assert.ok(authority.length > 0, label);
  }
  assert.match(source, /b2c-approval-port-runtime-implementation-v8-handoff\.md/u);
  assert.match(source, /approval_runtime_v8_raw_sha256:\s*expected\.runtime/u);
  assert.doesNotMatch(source, /runtime_v10:/u);
  assert.doesNotMatch(identityAuthority.writer_build, /approval-port-v(?:9|10)/u);
});

test("v10 drain accepts the only frozen approval-port-v8 writer", () => {
  const parsed = assertDrainAuthorityV10(drainText());
  assert.equal(parsed.new_writer_build, "approval-port-v8");
  assert.match(source, /drain_schema:[\s\S]*drain_required_fields:[\s\S]*new_writer_build/u);
});

test("v10 drain fails closed when new writer build is missing", () => {
  const lines = drainText().split("\n").filter((line) => !line.startsWith("new_writer_build\t"));
  assert.throws(() => assertDrainAuthorityV10(lines.join("\n")), /v10-drain:new_writer_build/u);
});

test("v10 drain rejects wrong writer builds including nonexistent approval-port-v9", () => {
  for (const wrong of ["approval-port-v9", "approval-port-v10", "wrong"]) {
    assert.throws(() => assertDrainAuthorityV10(drainText({ new_writer_build: wrong })), /v10-drain:new_writer_build/u);
  }
});
