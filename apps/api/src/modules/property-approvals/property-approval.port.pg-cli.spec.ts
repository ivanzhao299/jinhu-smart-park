import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import {
  approvalPortPgCleanupPhase,
  ApprovalPortPgPostcheckError,
  type ApprovalPortPgLifecycleConnection
} from "./property-approval.port.pg-cli";
import {
  approvalPortPgFixtureNames,
  type ApprovalPortPgFixtureAudit
} from "./property-approval.port.pg-fixture";

const apiRoot = resolve(__dirname, "../../..");
const repositoryRoot = resolve(apiRoot, "../..");
const requireFromHere = createRequire(__filename);
const { APPROVAL_PORT_PG_REQUIRED_TEST_NAMES, parseTapSummary } = requireFromHere(
  resolve(repositoryRoot, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs")
) as {
  APPROVAL_PORT_PG_REQUIRED_TEST_NAMES: readonly string[];
  parseTapSummary: (
    output: string,
    options: { expectedTests: number; expectedNames: readonly string[] }
  ) => {
    plan: number; tests: number; suites: number; pass: number; fail: number;
    cancelled: number; skipped: number; todo: number; names: string[];
  };
};

const FIXTURE_TEST_NAMES = [
  "PG fixture run IDs derive unique safe run-scoped identifiers",
  "partial fixture setup is auditable and idempotent cleanup reaches zero residue",
  "cleanup diagnostics preserve the primary Gate failure",
  "run-scoped data cleanup is ordered, idempotent and reaches zero residue",
  "isolated immutable cleanup is fail-closed and uses a transaction-local trigger bypass",
  "isolated immutable cleanup rejects every authority drift before trigger bypass or delete",
  "PG suite statically retains seven tests and guarded lifecycle/session cleanup"
] as const;

function withoutPgEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PROPERTY_APPROVAL_PORT_PG_URL;
  delete env.PROPERTY_APPROVAL_PORT_PG_RUN_ID;
  delete env.PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE;
  delete env.PROPERTY_APPROVAL_PORT_PG_ISOLATED_CLEANUP;
  delete env.PROPERTY_APPROVAL_PORT_PG_EXPECTED_DATABASE;
  // A spawned Node process must be a fresh test runner/CLI, not another child
  // in the parent's node:test IPC protocol. Otherwise its TAP/JSON is not
  // written to stdout and the parent cannot validate the real process output.
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test("phase CLI fails closed with machine JSON when PostgreSQL authority is absent", () => {
  for (const phase of ["probe", "setup", "cleanup"]) {
    const result = spawnSync(process.execPath, [
      "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.ts",
      phase
    ], {
      cwd: apiRoot, env: withoutPgEnvironment(), encoding: "utf8", shell: false
    });
    assert.equal(result.error, undefined, `${phase}: ${String(result.error)}`);
    assert.equal(result.status, 2, `${phase}: ${result.stderr}`);
    assert.notEqual(result.stdout.trim(), "", `${phase}: child stdout must be captured`);
    const output = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    assert.equal(output.phase, phase);
    assert.equal(output.status, "fail");
    assert.equal(output.runId, null);
  }
});

test("direct node fixture-unit entry exposes and parses all seven internal TAP tests", () => {
  const result = spawnSync(process.execPath, [
    "--test-reporter=tap",
    "--require", "ts-node/register",
    "src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts"
  ], { cwd: apiRoot, env: withoutPgEnvironment(), encoding: "utf8", shell: false });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(result.stdout.trim(), "", "fixture child stdout must be captured");
  assert.deepEqual(parseTapSummary(result.stdout, {
    expectedTests: 7,
    expectedNames: FIXTURE_TEST_NAMES
  }), {
    plan: 7, tests: 7, suites: 0, pass: 7, fail: 0,
    cancelled: 0, skipped: 0, todo: 0, names: [...FIXTURE_TEST_NAMES]
  });
});

test("orchestrator fails closed before spawning PostgreSQL phases without URL", () => {
  const result = spawnSync(process.execPath, [
    "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs"
  ], {
    cwd: repositoryRoot, env: withoutPgEnvironment(), encoding: "utf8", shell: false
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 2, result.stderr);
  assert.notEqual(result.stdout.trim(), "", "orchestrator child stdout must be captured");
  const output = JSON.parse(result.stdout.trim()) as {
    phase: string; status: string; details: { postgresGateRan: boolean };
  };
  assert.equal(output.phase, "orchestrator");
  assert.equal(output.status, "fail");
  assert.equal(output.details.postgresGateRan, false);
});

test("direct seven-test entry, parser negatives and cleanup diagnostics are executable", async () => {
  const direct = spawnSync(process.execPath, [
    "--test-reporter=tap",
    "--require", "ts-node/register",
    "src/modules/property-approvals/property-approval.port.pg.spec.ts"
  ], { cwd: apiRoot, env: withoutPgEnvironment(), encoding: "utf8", shell: false });
  assert.equal(direct.error, undefined, String(direct.error));
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /^1\.\.7$/mu);
  assert.match(direct.stdout, /^# tests 7$/mu);
  assert.match(direct.stdout, /^# skipped 7$/mu);
  assert.doesNotMatch(direct.stdout, /^1\.\.1$/mu);
  for (const name of APPROVAL_PORT_PG_REQUIRED_TEST_NAMES) {
    assert.ok(direct.stdout.includes(`# Subtest: ${name}`), name);
  }

  const pgSource = readFileSync(
    resolve(__dirname, "property-approval.port.pg.spec.ts"), "utf8"
  );
  const runnerSource = readFileSync(
    resolve(repositoryRoot, "scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs"),
    "utf8"
  );
  assert.equal((pgSource.match(/^ {2}pgIt\(/gmu) ?? []).length, 7);
  for (const phase of [
    "compile", "connect-probe", "fixture-setup", "named-tests", "fixture-cleanup"
  ]) assert.ok(runnerSource.includes(`"${phase}"`), phase);
  assert.ok(runnerSource.includes("PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE"));
  const cliSource = readFileSync(
    resolve(__dirname, "property-approval.port.pg-cli.ts"), "utf8"
  );
  assert.ok(cliSource.includes('PROPERTY_APPROVAL_PORT_PG_ISOLATED_CLEANUP === "yes"'));
  assert.ok(runnerSource.includes("finally"));
  assert.ok(pgSource.includes("external-fixture-present"));
  assert.ok(pgSource.includes("after(async"));

  const passingTap = [
    "TAP version 13",
    ...APPROVAL_PORT_PG_REQUIRED_TEST_NAMES.flatMap((name, index) => [
      `# Subtest: ${name}`,
      `ok ${index + 1} - ${name}`
    ]),
    "1..7", "# tests 7", "# suites 0", "# pass 7", "# fail 0",
    "# cancelled 0", "# skipped 0", "# todo 0", ""
  ].join("\n");
  const parse = (tap: string) => parseTapSummary(tap, {
    expectedTests: 7,
    expectedNames: APPROVAL_PORT_PG_REQUIRED_TEST_NAMES
  });
  assert.equal(parse(passingTap).pass, 7);
  for (const invalid of [
    passingTap.replace("1..7", "1..1"),
    passingTap.replace("# tests 7", "# tests 6"),
    passingTap.replace("# suites 0", "# suites 1"),
    passingTap.replace("# pass 7", "# pass 6"),
    passingTap.replace("# fail 0", "# fail 1"),
    passingTap.replace("# cancelled 0", "# cancelled 1"),
    passingTap.replace("# skipped 0", "# skipped 1"),
    passingTap.replace("# todo 0", "# todo 1"),
    passingTap.replace(APPROVAL_PORT_PG_REQUIRED_TEST_NAMES[0]!, "wrong-name")
  ]) assert.throws(() => parse(invalid));

  const names = approvalPortPgFixtureNames("33333333333333333333333333333333");
  const audit: ApprovalPortPgFixtureAudit = { setup: [], cleanup: [] };
  const cleanupConnection: ApprovalPortPgLifecycleConnection = {
    async query(sql: string): Promise<unknown> {
      if (sql.includes("DELETE FROM")) throw new Error("cleanup delete failed");
      if (sql.includes("SELECT object_kind AS")) return [];
      return [];
    },
    async destroy(): Promise<void> {}
  };
  let connectCount = 0;
  await assert.rejects(approvalPortPgCleanupPhase(
    "postgresql://not-used", names, "tenant", "park", audit,
    async () => {
      connectCount += 1;
      if (connectCount === 1) return cleanupConnection;
      throw new Error("auditor connect failed");
    }
  ), (error) => error instanceof AggregateError
    && error.cause instanceof AggregateError
    && error.errors.some((item) => item instanceof Error
      && item.message === "auditor connect failed"));

  const residueAuditor: ApprovalPortPgLifecycleConnection = {
    async query(sql: string): Promise<unknown> {
      if (sql.includes("SELECT object_kind AS")) {
        return [{ objectKind: "relation", objectName: names.sentinelTable }];
      }
      if (sql.includes("SELECT table_name AS")) {
        return [{ tableName: "biz_property_approval_request", rowCount: 1 }];
      }
      if (sql.includes("pg_stat_activity")) {
        return [{ applicationName: names.applicationName, sessionCount: 1 }];
      }
      return [];
    },
    async destroy(): Promise<void> {}
  };
  connectCount = 0;
  await assert.rejects(approvalPortPgCleanupPhase(
    "postgresql://not-used", names, "tenant", "park", { setup: [], cleanup: [] },
    async () => (++connectCount === 1 ? cleanupConnection : residueAuditor)
  ), (error) => error instanceof AggregateError
    && error.errors.some((item) => item instanceof ApprovalPortPgPostcheckError
      && item.residueDetails.objects.length === 1
      && item.residueDetails.data.length === 1
      && item.residueDetails.sessions.length === 1));
});
