import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  V3_TARGETS, parseNodeTap, staticV3Candidate,
} from "../track-b2c-000197-preliminary-orchestrator-v3.mjs";
import { failureInjectionCases } from "../track-b2c-000197-preliminary-executor.mjs";

const root = process.cwd();
const sourcePath = resolve(root, "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v3.mjs");
const source = readFileSync(sourcePath, "utf8");
const sha256 = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");

test("binds exact migration, v5 runtime, PG fixture and resource authority inputs", () => {
  for (const [path, hash] of [
    ["database/migrations/000197_property_approval_active_source_index_forward_fix.sql", "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059"],
    ["apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts", "f8865fa948f1f4cac693a3ee2420bfc398b1feca487a2c6563c3afa8d388f4df"],
    ["apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts", "8bbdccbec7658da6173ebd8372a423df027441f1e5cdf67e8da065fef02e4cd1"],
    ["apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts", "7ce34bb689f30a044535244f4cd04ad5ea78341c717b3bba14a4604855986eb0"],
    ["scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs", "8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982"],
    [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v3-resource-authority-20260802.grammar", "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73"],
  ]) assert.equal(sha256(path), hash);
  assert.match(source, /e30ffc9dd618d4b95c7974ab43d4ab6a54daa783876a5e37cb03a212aa69d9f3/);
});

test("targets only exact C and D resources and never names old A or B", () => {
  assert.deepEqual(V3_TARGETS.map(({ key, containerId, volume }) => [key, containerId, volume]), [
    ["c", "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6", "60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12"],
    ["d", "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896", "7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5"],
  ]);
  assert.doesNotMatch(source, /jinhu-b2c197-r0-20260802a-[ab]|jinhu_b2c197_[ab]/u);
});

test("default candidate remains write-free and unauthorized", () => {
  const candidate = staticV3Candidate();
  assert.equal(candidate.execution_authorized, false);
  assert.equal(candidate.formal_run_id, "b2c197_prelim_20260802b");
  assert.match(candidate.status, /unfrozen|frozen-awaiting-independent-reviews/u);
  assert.match(source, /B2C_000197_PRELIMINARY_V3_EXECUTE === "1"/u);
  assert.match(source, /B2C_000197_V3_PREFLIGHT === "1"/u);
  const preflight = source.slice(source.indexOf("export function executePreflightV3"),
    source.indexOf("export function executeFormalV3"));
  assert.doesNotMatch(preflight, /applyTarget|writeHistory|failureInjections|approvalGate/u);
});

test("every external command is routed through immutable runChild evidence", () => {
  assert.doesNotMatch(source, /spawnSync|execSync|execFileSync/u);
  for (const stage of ["inspect-", "snapshot-", "history-", "migration-", "rerun-", "fault-",
    "approval-fixture-unit", "approval-connect", "approval-before", "approval-test", "approval-after"]) {
    assert.match(source, new RegExp(stage));
  }
  assert.match(source, /allowFailure: true, allowTapFailure: true/u);
});

test("approval after-residue check precedes any child or TAP throw", () => {
  const child = source.indexOf("const child = recorder.runChild({ stage: \"approval-test\"");
  const after = source.indexOf("const after = approvalResidue", child);
  const childThrow = source.indexOf("throw new RecordedSubprocessError(\"approval-test\"", child);
  const tapThrow = source.indexOf("if (child.tapError) throw child.tapError", child);
  assert.ok(child >= 0 && after > child && childThrow > after && tapThrow > childThrow);
  assert.match(source, /safeEnv\(\["PROPERTY_APPROVAL_PORT_PG_URL"\]\)/u);
  assert.match(source, /secretKeys\.map\(\(name\) => \(\{ name, persist: "redacted" \}\)\)/u);
  assert.match(source, /recorder\.secrets\.push\(password\)/u);
});

test("TAP parser rejects compile-only, skipped and nonseven outcomes", () => {
  const passing = "# tests 7\n# suites 1\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.deepEqual(parseNodeTap(passing, 7),
    { tests: 7, suites: 1, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  for (const invalid of ["", passing.replace("# tests 7", "# tests 0"),
    passing.replace("# pass 7", "# pass 6").replace("# skipped 0", "# skipped 1")]) {
    assert.throws(() => parseNodeTap(invalid, 7), /b2c-000197-v3-tap-/u);
  }
});

test("migration and four rollback points retain exact catalog and history checks", () => {
  const applyStart = source.indexOf("function applyTarget(recorder, target)");
  let cursor = applyStart;
  const positions = ["snapshot(recorder, target", "writeHistory(recorder, target, \"running\")",
    "readFileSync(migrationPath)", "writeHistory(recorder, target, \"succeeded\")",
    "rerun-${target.key}"].map((token) => { const position = source.indexOf(token, cursor); cursor = position + 1; return position; });
  assert.ok(positions.every((value) => value >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const cases = failureInjectionCases();
  assert.deepEqual(cases.map(({ name }) => name), ["before-create", "after-create", "after-drop", "before-rename"]);
  assert.equal(new Set(cases.map(({ prefix, assertion }) => `${prefix}\n${assertion}`)).size, 4);
  assert.match(source, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/u);
  assert.match(source, /result\.active !== 7 \|\| result\.terminal !== 5 \|\| result\.total !== 12/u);
});

test("live requires new v3 reviews and old-writer drain and produces retained preliminary evidence", () => {
  for (const marker of ["B2C_000197_V3_REVIEW_A_PATH", "B2C_000197_V3_REVIEW_B_PATH",
    "B2C_000197_V3_OLD_WRITER_DRAIN_PATH", "b2c-000197-preliminary-v3-independent-review-v1",
    "b2c-000197-old-writer-drain-v2", "approval-port-v5"]) assert.match(source, new RegExp(marker));
  assert.match(source, /resources_retained: \["c", "d"\]/u);
  assert.match(source, /final_current: false/u);
});
