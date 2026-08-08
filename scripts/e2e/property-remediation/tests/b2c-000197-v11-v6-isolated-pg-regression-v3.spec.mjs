import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  V11_V6_PG_V3_ENV_KEYS,
  V11_V6_PG_V3_REVIEW_PATHS,
  V11_V6_PG_V3_REVIEW_SCHEMAS,
  assertIndependentGoV3,
  assertResourceAuthorityV3,
  executeIsolatedPgRegressionV3,
  isolatedPgRegressionCandidateV3,
  parseExactGrammarV3,
  redactV3,
  runAuthorizedRegressionV3,
} from "../track-b2c-000197-v11-v6-isolated-pg-regression-v3.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fixtureRoot = mkdtempSync("/tmp/b2c197-v11v6-v3-");
const baselinePath = resolve(fixtureRoot, "old-baseline.sql");
const baselineSql = "-- password=baseline-secret\nSELECT 1;\n";
writeFileSync(baselinePath, baselineSql, { mode: 0o444 }); chmodSync(baselinePath, 0o444);
const target = Object.freeze({ runId: "b2c197_v11v6_isolated_attempt03", container: "jinhu-b2c197-v11v6-isolated-attempt03",
  containerId: "a".repeat(64), database: "jinhu_b2c197_v11v6_isolated_db03", volume: "b".repeat(64),
  baselinePath, baselineSha: sha256(Buffer.from(baselineSql)) });
const authority = Object.freeze({ target });
const baseline = { history_primary: null, history_mirror: null, approval_rows: 0,
  indexdef: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  predicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
  build_residue: false };
const ok = (stdout = "") => ({ status: 0, signal: null, error: null, stdout, stderr: "" });

function fakeRunner({ sqlstate = "P0001", inspectPatch = {}, version = "160012", driftAtSnapshot = 0,
  stderrSecret = false } = {}) {
  const calls = []; let snapshots = 0;
  const runCommand = (command, args, options) => {
    calls.push({ command, args, input: options.input });
    assert.ok(args.every((arg) => !String(arg).includes("SELECT ") && !String(arg).includes("DO $fault$")
      && !String(arg).includes("baseline-secret")));
    if (args[0] === "inspect") {
      const actual = { Id: target.containerId, Name: `/${target.container}`, State: { Running: true },
        HostConfig: { PortBindings: {} }, Mounts: [{ Type: "volume", Name: target.volume,
          Destination: "/var/lib/postgresql/data" }], ...inspectPatch };
      return ok(`${[actual.Id, actual.Name, String(actual.State.Running), JSON.stringify(actual.HostConfig.PortBindings),
        JSON.stringify(actual.Mounts)].join("\n")}\n`);
    }
    if (options.input === "SHOW server_version_num;") return ok(`${version}\n`);
    if (options.input.startsWith("SELECT json_build_object")) {
      snapshots += 1; return ok(JSON.stringify(snapshots === driftAtSnapshot ? { ...baseline, build_residue: true } : baseline));
    }
    if (!options.input.includes("DO $fault$")) return ok();
    const marker = options.input.match(/v11-injected-[a-z-]+/gu)?.at(-1);
    const suffix = stderrSecret ? " password=child-secret postgresql://user:db-secret@db/app" : "";
    return { status: 3, signal: null, error: null, stdout: "", stderr: `ERROR:  ${sqlstate}: ${marker}${suffix}\n` };
  };
  return { calls, runCommand };
}

const grammar = (schema, fields) => `${schema}\n${Object.entries(fields).map(([name, value]) => `${name}\t${value}`).join("\n")}\n`;
const bindings = { candidate_authority_raw_sha256: "1".repeat(64),
  candidate_manifest_raw_sha256: "2".repeat(64), static_test_record_raw_sha256: "3".repeat(64),
  review_handoff_raw_sha256: "4".repeat(64), runner_raw_sha256: "5".repeat(64),
  runner_spec_raw_sha256: "e".repeat(64), runner_spec_bytes: "12345", runner_spec_mode: "0444",
  index_contract_raw_sha256: "6".repeat(64), failure_cases_raw_sha256: "7".repeat(64),
  migration_000197_raw_sha256: "8".repeat(64) };
const reviewFields = (kind) => ({ ...bindings,
  reviewer_authority: kind === "database" ? "independent-database-reviewer" : "independent-qa-security-reviewer",
  decision: "GO", review_approved: "true", container_create_authorized: "false",
  container_execute_authorized: "false", formal_go: "false", open_p0: "0", open_p1: "0", open_p2: "0",
  ...(kind === "qa" ? { database_review_raw_sha256: "a".repeat(64) } : {}) });

test("v3 candidate freezes review paths and schemas while execution remains false", () => {
  const candidate = isolatedPgRegressionCandidateV3();
  assert.equal(candidate.execution_authorized, false); assert.equal(candidate.formal_go, false);
  assert.deepEqual(candidate.fixed_physical_targets, []); assert.equal(candidate.docker_or_database_command_executed, false);
  assert.deepEqual(candidate.required_environment_keys, [...V11_V6_PG_V3_ENV_KEYS]);
  assert.deepEqual(candidate.fixed_review_paths, V11_V6_PG_V3_REVIEW_PATHS);
  assert.deepEqual(candidate.review_schemas, V11_V6_PG_V3_REVIEW_SCHEMAS);
});

test("v3 database GO and one-way QA GO accept only exact acyclic zero-finding fields", () => {
  const database = reviewFields("database");
  assert.equal(assertIndependentGoV3(grammar(V11_V6_PG_V3_REVIEW_SCHEMAS.database, database),
    "database", bindings).decision, "GO");
  const qaBindings = { ...bindings, database_review_raw_sha256: "a".repeat(64) };
  const qa = reviewFields("qa");
  assert.equal(assertIndependentGoV3(grammar(V11_V6_PG_V3_REVIEW_SCHEMAS.qa, qa), "qa", qaBindings)
    .database_review_raw_sha256, "a".repeat(64));
  assert.throws(() => assertIndependentGoV3(grammar(V11_V6_PG_V3_REVIEW_SCHEMAS.qa, qa), "qa",
    { ...qaBindings, database_review_raw_sha256: "b".repeat(64) }), /database_review_raw_sha256/u);
  assert.equal("qa_review_raw_sha256" in database, false);
});

test("v3 resource authority accepts only exact dedicated anonymous PG16 target", () => {
  const resourceBindings = { candidate_authority_raw_sha256: bindings.candidate_authority_raw_sha256,
    database_review_raw_sha256: "9".repeat(64), qa_review_raw_sha256: "0".repeat(64) };
  const fields = { run_id: target.runId, container: target.container, container_id: target.containerId,
    database: target.database, volume: target.volume, postgres_major: "16", baseline_path: baselinePath,
    baseline_raw_sha256: target.baselineSha, dedicated: "true", anonymous_volume: "true",
    host_port_bindings: "0", status: "READY-AFTER-INDEPENDENT-GO", ...resourceBindings };
  const exact = grammar(V11_V6_PG_V3_REVIEW_SCHEMAS.resource, fields);
  assert.deepEqual(assertResourceAuthorityV3(exact, target.runId, resourceBindings), target);
  for (const invalid of [
    exact.replace(/^status\tREADY-AFTER-INDEPENDENT-GO\n/mu, ""),
    `${exact}unknown\tx\n`,
    `${exact}status\tREADY-AFTER-INDEPENDENT-GO\n`,
    exact.replace(target.containerId, "c".repeat(63)),
    exact.replace(target.database, "shared_database"),
    exact.replace(target.volume, "d".repeat(63)),
    exact.replace("postgres_major\t16", "postgres_major\t15"),
    exact.replace("dedicated\ttrue", "dedicated\tfalse"),
    exact.replace("anonymous_volume\ttrue", "anonymous_volume\tfalse"),
    exact.replace("host_port_bindings\t0", "host_port_bindings\t1"),
    exact.replace(resourceBindings.candidate_authority_raw_sha256, "c".repeat(64)),
    exact.replace(resourceBindings.database_review_raw_sha256, "d".repeat(64)),
    exact.replace(resourceBindings.qa_review_raw_sha256, "f".repeat(64)),
  ]) assert.throws(() => assertResourceAuthorityV3(invalid, target.runId, resourceBindings), /v11-v6-pg-v3-resource/u);
});

test("v3 GO intake rejects missing, duplicate, unknown, role, decision, P-count and SHA drift", () => {
  const fields = reviewFields("database"); const schema = V11_V6_PG_V3_REVIEW_SCHEMAS.database;
  const exact = grammar(schema, fields);
  for (const invalid of [
    exact.replace(/^open_p2\t0\n/mu, ""),
    `${exact}unknown\tx\n`,
    `${exact}open_p2\t0\n`,
    exact.replace("independent-database-reviewer", "self-reviewer"),
    exact.replace("decision\tGO", "decision\tNO-GO"),
    exact.replace("open_p1\t0", "open_p1\t1"),
    exact.replace(bindings.runner_raw_sha256, "f".repeat(64)),
    exact.replace(bindings.runner_spec_raw_sha256, "f".repeat(64)),
    exact.replace("runner_spec_bytes\t12345", "runner_spec_bytes\t12346"),
    exact.replace("formal_go\tfalse", "formal_go\ttrue"),
    exact.replace("container_execute_authorized\tfalse", "container_execute_authorized\ttrue"),
  ]) assert.throws(() => assertIndependentGoV3(invalid, "database", bindings), /v11-v6-pg-v3/u);
  assert.throws(() => parseExactGrammarV3(exact, "wrong-schema", new Set(Object.keys(fields)), "database"), /schema/u);
});

test("missing dynamic authority stops before claim and first child command", () => {
  const fake = fakeRunner();
  assert.throws(() => executeIsolatedPgRegressionV3({ env: { B2C_000197_V11_V6_PG_V3_EXECUTE: "1" },
    runCommand: fake.runCommand }), /input-drift/u);
  assert.equal(fake.calls.length, 0);
});

test("authorized v3 fake run writes immutable all-child success evidence and keeps SQL off argv", () => {
  const fake = fakeRunner(); const evidenceRoot = resolve(fixtureRoot, "success-evidence");
  const output = runAuthorizedRegressionV3({ authority, evidenceRoot, runCommand: fake.runCommand });
  assert.equal(output.result.fault_count, 4); assert.equal(output.result.final_snapshot_exact, true);
  assert.equal(fake.calls.length, 17); assert.equal(fake.calls.filter(({ input }) => input.includes("DO $fault$")).length, 4);
  assert.equal(fake.calls.filter(({ input }) => input === baselineSql).length, 1);
  const files = readdirSync(evidenceRoot); assert.equal(files.length, 36);
  assert.ok(files.every((name) => (statSync(resolve(evidenceRoot, name)).mode & 0o777) === 0o444));
  const terminal = JSON.parse(readFileSync(output.evidence.terminal, "utf8"));
  const manifest = JSON.parse(readFileSync(output.evidence.manifest, "utf8"));
  assert.equal(terminal.run_id_reusable, false); assert.equal(terminal.cleanup_attempted, false);
  assert.equal(manifest.child_file_count, 34); assert.equal(manifest.files.length, 35);
  assert.ok(manifest.files.every((entry) => entry.mode === "0444" && /^[0-9a-f]{64}$/u.test(entry.raw_sha256)));
  assert.ok(!readFileSync(output.evidence.terminal, "utf8").includes("baseline-secret"));
});

test("psql output is suppressed, immutable, non-reusable and never retries or cleans up", () => {
  const fake = fakeRunner({ sqlstate: "42703", stderrSecret: true });
  const evidenceRoot = resolve(fixtureRoot, "failure-evidence");
  assert.throws(() => runAuthorizedRegressionV3({ authority, evidenceRoot, runCommand: fake.runCommand }), /fault-drift/u);
  assert.equal(fake.calls.filter(({ input }) => input.includes("DO $fault$")).length, 1);
  const persisted = readdirSync(evidenceRoot).map((name) => readFileSync(resolve(evidenceRoot, name), "utf8")).join("\n");
  assert.ok(!persisted.includes("child-secret")); assert.ok(!persisted.includes("db-secret"));
  assert.ok(!persisted.includes("postgresql://user:db-secret@db/app"));
  assert.match(persisted, /<suppressed:psql-output>/u);
  assert.match(persisted, /"run_id_reusable": false/u); assert.match(persisted, /"retry_attempted": false/u);
  assert.match(persisted, /"cleanup_attempted": false/u);
  const before = fake.calls.length;
  assert.throws(() => runAuthorizedRegressionV3({ authority, evidenceRoot, runCommand: fake.runCommand }), /EEXIST/u);
  assert.equal(fake.calls.length, before);
  const modes = readdirSync(evidenceRoot).map((name) => statSync(resolve(evidenceRoot, name)).mode & 0o777);
  assert.deepEqual([...new Set(modes)], [0o444]);
});

test("structured redaction covers SQL, JSON, environment, URL and option secrets while benign argv survives", () => {
  const secretText = "PASSWORD 'sql-secret' {\"token\":\"json-secret\"} PGPASSWORD=env-secret "
    + "authorization: Bearer-secret --password cli-secret postgresql://user:url-secret@db/app";
  const redacted = redactV3(secretText);
  for (const secret of ["sql-secret", "json-secret", "env-secret", "Bearer-secret", "cli-secret", "url-secret"])
    assert.equal(redacted.includes(secret), false);
  assert.match(redacted, /<redacted-secret>/u); assert.match(redacted, /<redacted-database-url>/u);
  const fake = fakeRunner(); const evidenceRoot = resolve(fixtureRoot, "benign-argv-evidence");
  runAuthorizedRegressionV3({ authority, evidenceRoot, runCommand: fake.runCommand });
  const inspectIntent = JSON.parse(readFileSync(resolve(evidenceRoot, "001-inspect-container-intent.json"), "utf8"));
  assert.equal(inspectIntent.argv.at(-1), target.container);
  assert.ok(inspectIntent.argv.includes("--format"));
});

test("strict identity, mount, no-port and PostgreSQL 16 checks fail closed", () => {
  for (const [name, options, pattern] of [
    ["full-id", { inspectPatch: { Id: "c".repeat(64) } }, /identity-drift/u],
    ["running", { inspectPatch: { State: { Running: false } } }, /identity-drift/u],
    ["ports", { inspectPatch: { HostConfig: { PortBindings: { "5432/tcp": [{ HostPort: "5432" }] } } } }, /identity-drift/u],
    ["mount", { inspectPatch: { Mounts: [] } }, /identity-drift/u],
    ["version", { version: "150013" }, /version-drift/u],
  ]) {
    const fake = fakeRunner(options); const evidenceRoot = resolve(fixtureRoot, `negative-${name}`);
    assert.throws(() => runAuthorizedRegressionV3({ authority, evidenceRoot, runCommand: fake.runCommand }), pattern);
    assert.equal(fake.calls.some(({ input }) => input === baselineSql), false);
  }
});
