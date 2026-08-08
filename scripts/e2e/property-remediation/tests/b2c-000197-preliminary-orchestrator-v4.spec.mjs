import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { assertAbsentV4, staticV4Candidate } from "../track-b2c-000197-preliminary-orchestrator-v4.mjs";

const executorSource = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-executor-v4.mjs"), "utf8");
const source = readFileSync(resolve(process.cwd(),
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v4.mjs"), "utf8");

test("dual absent requires exactly zero approval rows", () => {
  const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
    indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
    predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
    build_residue: false };
  assert.equal(assertAbsentV4(valid), valid);
  for (const approval_rows of [1, 2, -1, null, "0"]) {
    assert.throws(() => assertAbsentV4({ ...valid, approval_rows }, { key: "negative" }),
      /b2c-000197-v4-not-dual-absent-empty:negative/u);
  }
});

test("dual absent rejects either history and build residue", () => {
  const valid = { history_primary: null, history_mirror: null, approval_rows: 0,
    indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
    predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
    build_residue: false };
  for (const drift of [{ history_primary: [] }, { history_mirror: [] }, { build_residue: true },
    { indexdef: "drift" }, { predicate: "drift" }]) {
    assert.throws(() => assertAbsentV4({ ...valid, ...drift }));
  }
});

test("v4 binds approval v8 and remains unfrozen and unauthorized", () => {
  const candidate = staticV4Candidate();
  assert.equal(candidate.execution_authorized, false); assert.equal(candidate.manifest_frozen, false);
  assert.equal(candidate.live_execution, false); assert.equal(candidate.status, "unfrozen-v8-integrated");
  assert.equal(candidate.runtime_v8, "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118");
  assert.equal(candidate.pg_spec, "2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613");
  assert.equal(candidate.cli, "e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e");
});

test("v4 independently spawns exact lifecycle and never uses outer node test entry", () => {
  assert.doesNotMatch(executorSource, /["']--test["']/u);
  assert.doesNotMatch(source, /args:\s*\["--test"/u);
  for (const marker of ["runPhasedGateV4", "cleanupPhases", "allowParseFailure", "discoverResultSecrets"]) {
    assert.match(`${executorSource}\n${source}`, new RegExp(marker));
  }
  for (const stage of ["approval-compile", "approval-connect", "approval-setup", "approval-named-tests",
    "approval-cleanup", "approval-after"]) assert.match(source, new RegExp(stage));
  assert.match(source, /parseTapSummary\(stdout, \{ expectedTests: 7/u);
  assert.match(source, /value\.approval_rows !== 0/u);
});
