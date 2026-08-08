import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  V11_V6_ISOLATED_PG_ENV_KEYS,
  executeIsolatedPgRegressionV11,
  isolatedPgAuthorityV11,
  isolatedPgRegressionCandidateV11,
} from "../track-b2c-000197-v11-v6-isolated-pg-regression.mjs";

const baselinePath = resolve(mkdtempSync(resolve(tmpdir(), "b2c197-v11v6-baseline-")), "old-baseline.sql");
const baselineSql = "-- isolated old baseline fixture\nSELECT 1;\n";
writeFileSync(baselinePath, baselineSql, { mode: 0o444 });
const target = { B2C_000197_V11_V6_PG_REGRESSION_EXECUTE: "1",
  B2C_000197_V11_V6_PG_RUN_ID: "b2c197_v11v6_isolated_attempt01",
  B2C_000197_V11_V6_PG_CONTAINER: "jinhu-b2c197-v11v6-isolated-attempt01",
  B2C_000197_V11_V6_PG_CONTAINER_ID: "a".repeat(64),
  B2C_000197_V11_V6_PG_DATABASE: "jinhu_b2c197_v11v6_isolated_db01",
  B2C_000197_V11_V6_PG_VOLUME: "b".repeat(64),
  B2C_000197_V11_V6_PG_BASELINE_PATH: baselinePath,
  B2C_000197_V11_V6_PG_BASELINE_SHA: createHash("sha256").update(baselineSql).digest("hex") };
const baseline = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  build_residue: false };
const ok = (stdout) => ({ status: 0, signal: null, error: null, stdout, stderr: "" });

function fakeRunner({ sqlstate = "P0001", driftAtSnapshot = 0 } = {}) {
  const calls = []; let snapshots = 0;
  const runCommand = (command, args) => {
    calls.push({ command, args });
    if (args[0] === "inspect") return ok(JSON.stringify([{ Id: target.B2C_000197_V11_V6_PG_CONTAINER_ID,
      Name: `/${target.B2C_000197_V11_V6_PG_CONTAINER}`, State: { Running: true },
      HostConfig: { PortBindings: {} }, Mounts: [{ Type: "volume", Name: target.B2C_000197_V11_V6_PG_VOLUME,
        Destination: "/var/lib/postgresql/data" }] }]));
    const sql = args.at(-1);
    if (sql === "SHOW server_version_num;") return ok("160012\n");
    if (sql.startsWith("SELECT json_build_object")) {
      snapshots += 1; return ok(JSON.stringify(snapshots === driftAtSnapshot
        ? { ...baseline, build_residue: true } : baseline));
    }
    if (!sql.includes("DO $fault$")) return ok("");
    const marker = sql.match(/v11-injected-[a-z-]+/gu)?.at(-1);
    return { status: 3, signal: null, error: null, stdout: "", stderr: `ERROR:  ${sqlstate}: ${marker}\n` };
  };
  return { calls, runCommand };
}

test("isolated PG runner defaults blocked with no fixed physical target", () => {
  const candidate = isolatedPgRegressionCandidateV11();
  assert.equal(candidate.execution_authorized, false);
  assert.equal(candidate.docker_or_database_command_executed, false);
  assert.deepEqual(candidate.fixed_physical_targets, []);
  assert.deepEqual(candidate.required_environment_keys, [...V11_V6_ISOLATED_PG_ENV_KEYS]);
});

test("isolated PG authority rejects missing, malformed and non-isolated identities", () => {
  assert.throws(() => isolatedPgAuthorityV11({}), /not-authorized/u);
  for (const patch of [
    { B2C_000197_V11_V6_PG_RUN_ID: "legacy_run" },
    { B2C_000197_V11_V6_PG_CONTAINER: "external-postgres" },
    { B2C_000197_V11_V6_PG_CONTAINER_ID: "short" },
    { B2C_000197_V11_V6_PG_VOLUME: "named-volume" },
  ]) assert.throws(() => isolatedPgAuthorityV11({ ...target, ...patch }), /invalid-or-retired/u);
});

test("isolated PG regression executes exactly four canonical P0001 faults with exact snapshots", () => {
  const fake = fakeRunner(); const result = executeIsolatedPgRegressionV11({ env: target, runCommand: fake.runCommand });
  assert.equal(result.status, "PASS_PRELIMINARY_ISOLATED_FAULT_REGRESSION");
  assert.equal(result.final_current, false); assert.equal(result.migration_executed, false);
  assert.equal(result.cleanup_attempted, false); assert.equal(result.faults.length, 4);
  assert.equal(result.postgres_major, 16); assert.equal(result.baseline_loaded, true);
  assert.equal(result.final_snapshot_exact, true);
  assert.ok(result.faults.every((entry) => entry.sqlstate === "P0001"
    && entry.observed_markers.length === 1 && entry.snapshot_checked && entry.snapshot_exact));
  const faultSql = fake.calls.filter(({ args }) => args.at(-1)?.includes("DO $fault$"));
  assert.equal(faultSql.length, 4);
  assert.equal(fake.calls.filter(({ args }) => args.at(-1) === baselineSql).length, 1);
  assert.equal(fake.calls.filter(({ args }) => args.at(-1)?.startsWith("BEGIN; LOCK TABLE")).length, 4);
  assert.ok(faultSql.every(({ args }) => !/\bsource_domain\b|\baction\b/u.test(args.at(-1))));
  assert.ok(faultSql.every(({ args }) => !/fn_assert_/u.test(args.at(-1))));
  assert.ok(fake.calls.every(({ args }) => !args.some((arg) =>
    /ALTER\s+INDEX\s+public\.uq_biz_property_approval_request_active_source_v2_build\s+RENAME/iu.test(arg)
      || /approval-(?:setup|cleanup)/u.test(arg))));
});

test("isolated PG regression stops on wrong SQLSTATE or snapshot drift without later faults", () => {
  for (const options of [{ sqlstate: "42703" }, { driftAtSnapshot: 3 }]) {
    const fake = fakeRunner(options);
    assert.throws(() => executeIsolatedPgRegressionV11({ env: target, runCommand: fake.runCommand }),
      /(?:fault-drift|preflight-drift)/u);
    assert.equal(fake.calls.filter(({ args }) => args.at(-1)?.includes("DO $fault$")).length, 1);
  }
});

test("runner source contains no unresolved fixed A-H authority", () => {
  const source = readFileSync(resolve(process.cwd(),
    "scripts/e2e/property-remediation/track-b2c-000197-v11-v6-isolated-pg-regression.mjs"), "utf8");
  assert.doesNotMatch(source, /jinhu-b2c197-[^"']*-[a-h]["']/u);
  assert.doesNotMatch(source, /b2c197_prelim_20260802[a-h]/u);
});
