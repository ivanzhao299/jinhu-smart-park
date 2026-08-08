import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { FAILURE_INJECTION_CASES_V11 } from "../track-b2c-000197-failure-cases-v11.mjs";
import {
  V11_TARGETS, assertAbsentV11, assertAuthorityFileV11, assertDrainAuthorityV11, assertIndependentReviewV11,
  childEnvV11, executeFormalV11, frozenIdentityAuthorityV11, observeFaultOutcomeV11, staticV11Candidate,
} from "../track-b2c-000197-preliminary-orchestrator-v11.mjs";

const source = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v11.mjs"), "utf8");
const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37", build_residue: false };

test("v11 static candidate binds only the exact SUCCESS E/F authority", () => {
  const candidate = staticV11Candidate();
  assert.match(candidate.status, /^(?:resource-bound-awaiting-readonly-preflight-and-freeze|frozen-awaiting-independent-reviews-and-drain)$/u);
  assert.equal(candidate.formal_run_id, "b2c197_prelim_20260802f"); assert.equal(candidate.resource_authority_bound, true);
  assert.deepEqual(candidate.targets, [{ key: "e", topology: "upgrade-to-195" }, { key: "f", topology: "fresh-to-195" }]);
  assert.deepEqual(V11_TARGETS.map(({ key }) => key), ["e", "f"]);
  assert.equal(candidate.execution_authorized, false); assert.equal(candidate.live_execution, false);
});

test("v11 static candidate binds both exact v10 failure review hashes", () => {
  const candidate = staticV11Candidate();
  assert.equal(candidate.database_failure_review_raw_sha256,
    "1b69610cb50f4af5e9a6ac0f4efc7b00d49d21b299380812f6ca3be089d37676");
  assert.equal(candidate.qa_failure_review_raw_sha256,
    "86497cbe8e2c13a324a510cf5b8b0326aa5a909d728bedad97d4defea1a2217e");
});

test("formal fails closed before creating evidence without reviews and drain", () => {
  const research = resolve(process.cwd(), ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
  const before = readdirSync(research).filter((name) => name.includes("v11") && name.includes("evidence")).sort();
  assert.equal(frozenIdentityAuthorityV11().formal_run_id, "b2c197_prelim_20260802f");
  assert.throws(executeFormalV11, /v11-run-id-drift/u);
  const after = readdirSync(research).filter((name) => name.includes("v11") && name.includes("evidence")).sort();
  assert.deepEqual(after, before);
});

test("frozen mode either requires both freeze files or verifies the complete manifest", () => {
  const manifest = resolve(process.cwd(), ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v11-v5-input-manifest-20260802.grammar");
  if (readdirSync(resolve(manifest, "..")).includes("b2c-000197-preliminary-v11-v5-input-manifest-20260802.grammar")) {
    assert.equal(staticV11Candidate({ mode: "frozen" }).manifest_frozen, true);
  } else assert.throws(() => staticV11Candidate({ mode: "frozen" }), /v11-freeze-files-missing/u);
});

test("absent requires numeric zero rows and exact old catalog", () => {
  assert.equal(assertAbsentV11(valid), valid);
  for (const drift of [{ approval_rows: 1 }, { approval_rows: "0" }, { history_primary: [] }, { history_mirror: [] },
    { indexdef: "drift" }, { predicate: "drift" }, { build_residue: true }]) {
    assert.throws(() => assertAbsentV11({ ...valid, ...drift }));
  }
});

test("failure cases are inline, ordered, uniquely marked, and contain no external assertion helper", () => {
  assert.deepEqual(FAILURE_INJECTION_CASES_V11.map(({ boundary }) => boundary),
    ["before-create", "after-create", "after-drop", "before-rename"]);
  assert.equal(new Set(FAILURE_INJECTION_CASES_V11.map(({ marker }) => marker)).size, 4);
  for (const entry of FAILURE_INJECTION_CASES_V11) {
    assert.match(entry.assertion, /^DO \$assert\$/u); assert.doesNotMatch(entry.assertion, /fn_assert_/u);
    assert.doesNotMatch(`${entry.prefix}${entry.assertion}`, /RAISE EXCEPTION 'v11-injected/u);
  }
});

test("failure boundary catalog contracts match the migration sequence", () => {
  const [beforeCreate, afterCreate, afterDrop, beforeRename] = FAILURE_INJECTION_CASES_V11;
  assert.doesNotMatch(beforeCreate.prefix, /CREATE UNIQUE INDEX/u);
  assert.match(afterCreate.prefix, /CREATE UNIQUE INDEX/u); assert.doesNotMatch(afterCreate.prefix, /DROP INDEX/u);
  for (const entry of [afterDrop, beforeRename]) {
    assert.match(entry.prefix, /CREATE UNIQUE INDEX/u); assert.match(entry.prefix, /DROP INDEX/u);
    assert.match(entry.assertion, /old index still present/u); assert.match(entry.assertion, /build index missing/u);
  }
});

const result = (text, status = 3) => ({ status, signal: null, error: null, stdout: Buffer.alloc(0), stderr: Buffer.from(text) });
const observe = (patch = {}) => observeFaultOutcomeV11({ result: result("ERROR:  P0001: v11-injected-before-create\n"),
  expectedMarker: "v11-injected-before-create", target: { key: "e" },
  boundary: "before-create", stage: "fault-e-before-create", ...patch });

test("fault observer reports exact P0001 and unique marker without attesting a snapshot", () => {
  const value = observe();
  assert.equal(value.sqlstate, "P0001"); assert.deepEqual(value.observed_markers, ["v11-injected-before-create"]);
  assert.equal(value.sqlstate_valid, true); assert.equal(value.marker_valid, true); assert.equal(value.child_valid, true);
  assert.equal(value.snapshot_checked, false); assert.equal(value.snapshot_exact, null);
});

test("fault observer records missing and wrong markers as invalid without throwing", () => {
  for (const text of ["ERROR:  P0001: assertion failed\n", "ERROR:  P0001: v11-injected-after-create\n"]) {
    const value = observe({ result: result(text) });
    assert.equal(value.sqlstate_valid, true); assert.equal(value.marker_valid, false);
    assert.equal(value.child_valid, false); assert.equal(value.snapshot_checked, false); assert.equal(value.snapshot_exact, null);
  }
});

test("fault observer records wrong SQLSTATE independently from a valid marker", () => {
  const value = observe({ result: result("ERROR:  42883: v11-injected-before-create\n") });
  assert.equal(value.sqlstate, "42883"); assert.equal(value.sqlstate_valid, false);
  assert.equal(value.marker_valid, true); assert.equal(value.child_valid, false);
  assert.equal(value.snapshot_checked, false); assert.equal(value.snapshot_exact, null);
});

test("source has no v10 C/D physical authority or old formal run ID", () => {
  assert.doesNotMatch(source, /jinhu-b2c197-prelim-20260802b-[cd]|b2c197_prelim_20260802b/u);
  assert.match(source, /const targets = overrides\.targets/u);
});

test("child PATH prepends the absolute current runtime directory even when ambient PATH lacks node", () => {
  const previous = process.env.PATH; process.env.PATH = "/usr/bin:/bin";
  try { assert.equal(childEnvV11().PATH.split(":" )[0], resolve(process.execPath, "..")); }
  finally { process.env.PATH = previous; }
});

const authorityBindings = Object.freeze({ formal_run_id: "run", manifest_raw_sha256: "manifest",
  handoff_raw_sha256: "handoff", resource_authority_raw_sha256: "resource", resolver_raw_sha256: "resolver",
  executor_raw_sha256: "executor", orchestrator_raw_sha256: "orchestrator",
  approval_runtime_v8_raw_sha256: "runtime", writer_build: "approval-port-v8",
  target_e_raw_sha256: "target-e", target_f_raw_sha256: "target-f" });
const authorityText = (schema, fields) => [schema, ...Object.entries(fields).map(([name, value]) => `${name}\t${value}`)].join("\n");
const reviewFields = (extra = {}) => ({ ...authorityBindings, ...extra,
  reviewer_authority: extra.database_review_raw_sha256 ? "independent-qa-security-reviewer" : "independent-database-reviewer",
  formal_go: "true", open_p0: "0", open_p1: "0", open_p2: "0", decision: "GO" });

test("v5 database and QA intake accept exact acyclic GO bindings", () => {
  const databaseBindings = { ...authorityBindings,
    qa_review_path: resolve(process.cwd(), ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v11-v5-independent-qa-security-review-20260802.grammar"),
    qa_review_schema: "b2c-000197-preliminary-v11-v5-independent-qa-security-review-v1" };
  const database = assertIndependentReviewV11(authorityText(
    "b2c-000197-preliminary-v11-v5-independent-database-review-v1", reviewFields(databaseBindings)), "database", databaseBindings);
  assert.equal(database.decision, "GO");
  const qaBindings = { ...authorityBindings, database_review_raw_sha256: "db-sha" };
  const qa = assertIndependentReviewV11(authorityText(
    "b2c-000197-preliminary-v11-v5-independent-qa-security-review-v1", reviewFields({ database_review_raw_sha256: "db-sha" })),
  "qa", qaBindings); assert.equal(qa.database_review_raw_sha256, "db-sha");
});

test("v5 database intake strictly binds future QA path and schema without future QA SHA", () => {
  const schema = "b2c-000197-preliminary-v11-v5-independent-database-review-v1";
  const bindings = { ...authorityBindings, qa_review_path: "/fixed/qa.grammar",
    qa_review_schema: "b2c-000197-preliminary-v11-v5-independent-qa-security-review-v1" };
  const valid = reviewFields({ qa_review_path: bindings.qa_review_path, qa_review_schema: bindings.qa_review_schema });
  assert.equal(assertIndependentReviewV11(authorityText(schema, valid), "database", bindings).qa_review_path, bindings.qa_review_path);
  for (const patch of [{ qa_review_path: "/old/qa.grammar" }, { qa_review_schema: "old-schema" }]) {
    assert.throws(() => assertIndependentReviewV11(authorityText(schema, { ...valid, ...patch }), "database", bindings));
  }
  const missing = { ...valid }; delete missing.qa_review_schema;
  assert.throws(() => assertIndependentReviewV11(authorityText(schema, missing), "database", bindings), /field-count/u);
  assert.throws(() => assertIndependentReviewV11(`${authorityText(schema, valid)}\nqa_review_sha256\t${"0".repeat(64)}`,
    "database", bindings), /unknown/u);
  assert.throws(() => assertIndependentReviewV11(`${authorityText(schema, valid)}\nqa_review_path\t/fixed/qa.grammar`,
    "database", bindings), /duplicate/u);
});

test("v5 review intake rejects old header, formal false, nonzero priority and wrong binding", () => {
  const schema = "b2c-000197-preliminary-v11-v5-independent-database-review-v1";
  for (const [header, patch] of [["b2c-000197-preliminary-v11-independent-review-v1", {}],
    [schema, { formal_go: "false" }], [schema, { open_p1: "1" }], [schema, { manifest_raw_sha256: "wrong" }]]) {
    assert.throws(() => assertIndependentReviewV11(authorityText(header, { ...reviewFields(), ...patch }), "database", authorityBindings));
  }
});

test("v5 review intake rejects missing, unknown and duplicate fields", () => {
  const schema = "b2c-000197-preliminary-v11-v5-independent-database-review-v1"; const fields = reviewFields();
  const missing = { ...fields }; delete missing.open_p2;
  assert.throws(() => assertIndependentReviewV11(authorityText(schema, missing), "database", authorityBindings), /field-count/u);
  assert.throws(() => assertIndependentReviewV11(`${authorityText(schema, fields)}\nunknown\tx`, "database", authorityBindings), /unknown/u);
  assert.throws(() => assertIndependentReviewV11(`${authorityText(schema, fields)}\ndecision\tGO`, "database", authorityBindings), /duplicate/u);
});

test("v5 drain intake binds both review SHAs and rejects stale or incomplete GO", () => {
  const bindings = { ...authorityBindings, database_review_raw_sha256: "db-sha", qa_review_raw_sha256: "qa-sha" };
  const fields = { ...bindings, formal_go: "true", decision: "GO", intake: "stopped",
    in_flight_approval_create_transactions: "0", new_writer_build: "approval-port-v8",
    open_p0: "0", open_p1: "0", open_p2: "0" };
  assert.equal(assertDrainAuthorityV11(authorityText("b2c-000197-old-writer-drain-v11-v5", fields), bindings).decision, "GO");
  for (const patch of [{ qa_review_raw_sha256: "old" }, { formal_go: "false" }, { open_p2: "1" }]) {
    assert.throws(() => assertDrainAuthorityV11(authorityText("b2c-000197-old-writer-drain-v11-v5",
      { ...fields, ...patch }), bindings));
  }
});

test("missing v5 GO authority fails before the formal evidence root is created", () => {
  const research = resolve(process.cwd(), ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
  const formalName = "b2c-000197-v11-v5-formal-evidence-b2c197_prelim_20260802f";
  const before = readdirSync(research).includes(formalName); const previous = { ...process.env };
  process.env.B2C_000197_PRELIMINARY_V11_RUN_ID = "b2c197_prelim_20260802f";
  delete process.env.B2C_000197_V11_DATABASE_PATH; delete process.env.B2C_000197_V11_DATABASE_SHA;
  try { assert.throws(executeFormalV11); } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
  assert.equal(readdirSync(research).includes(formalName), before);
});

test("v5 authority paths reject old GO files and noncanonical locations", () => {
  for (const kind of ["database", "qa", "drain"]) {
    assert.throws(() => assertAuthorityFileV11(kind, `/tmp/old-v2-${kind}.grammar`, "0".repeat(64)), /-path/u);
  }
});

test("v5 authority hashes reject malformed and wrong exact SHA", () => {
  const path = resolve(process.cwd(), ".trellis/tasks/07-30-pr192-b-domain-integrations/research",
    "b2c-000197-preliminary-v11-v5-independent-database-review-20260802.grammar");
  assert.throws(() => assertAuthorityFileV11("database", path, "BAD"), /database-sha/u);
  assert.throws(() => assertAuthorityFileV11("database", path, "0".repeat(64)), /input-drift/u);
});
