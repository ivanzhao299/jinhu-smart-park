import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import process from "node:process";
import tapGate from "./track-b2c-approval-port-pg-gate-lib.cjs";

const { APPROVAL_PORT_PG_REQUIRED_TEST_NAMES, parseTapSummary } = tapGate;
const url = process.env.PROPERTY_APPROVAL_PORT_PG_URL;
const runId = process.env.PROPERTY_APPROVAL_PORT_PG_RUN_ID
  ?? randomBytes(16).toString("hex");
const emit = (phase, status, details = {}) => process.stdout.write(`${JSON.stringify({
  phase, runId, status, details
})}\n`);

if (!url || !/^[0-9a-f]{32}$/u.test(runId)) {
  emit("orchestrator", "fail", {
    error: "valid PROPERTY_APPROVAL_PORT_PG_URL and 32-hex run ID are required",
    postgresGateRan: false
  });
  process.exit(2);
}

const phaseEnv = {
  ...process.env,
  PROPERTY_APPROVAL_PORT_PG_URL: url,
  PROPERTY_APPROVAL_PORT_PG_RUN_ID: runId
};
const spawnPhase = (phase, args, env = phaseEnv) => {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(), env, encoding: "utf8", shell: false
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const status = result.error ? 1 : result.status ?? 1;
  emit(phase, status === 0 ? "pass" : "fail", {
    exitCode: status,
    spawnError: result.error?.message ?? null
  });
  return { ...result, status };
};

let primaryStatus = 0;
let setupAttempted = false;
let cleanupStatus = 0;
try {
  const compile = spawnPhase("compile", ["--filter", "@jinhu/api", "typecheck"]);
  if (compile.status !== 0) primaryStatus = compile.status;
  if (primaryStatus === 0) {
    const probe = spawnPhase("connect-probe", [
      "--filter", "@jinhu/api", "exec", "node", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.ts", "probe"
    ]);
    if (probe.status !== 0) primaryStatus = probe.status;
  }
  if (primaryStatus === 0) {
    setupAttempted = true;
    const setup = spawnPhase("fixture-setup", [
      "--filter", "@jinhu/api", "exec", "node", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.ts", "setup"
    ]);
    if (setup.status !== 0) primaryStatus = setup.status;
  }
  if (primaryStatus === 0) {
    const tests = spawnPhase("named-tests", [
      "--filter", "@jinhu/api", "exec", "node", "--test-reporter=tap",
      "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg.spec.ts"
    ], { ...phaseEnv, PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE: "yes" });
    if (tests.status === 0) {
      try {
        const summary = parseTapSummary(tests.stdout ?? "", {
          expectedTests: 7,
          expectedNames: APPROVAL_PORT_PG_REQUIRED_TEST_NAMES
        });
        emit("named-tests-tap", "pass", summary);
      } catch (error) {
        emit("named-tests-tap", "fail", { error: error.message });
        primaryStatus = 1;
      }
    } else {
      primaryStatus = tests.status;
    }
  }
} finally {
  if (setupAttempted) {
    const cleanup = spawnPhase("fixture-cleanup", [
      "--filter", "@jinhu/api", "exec", "node", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.ts", "cleanup"
    ]);
    cleanupStatus = cleanup.status;
  }
}

const finalStatus = primaryStatus || cleanupStatus;
emit("orchestrator", finalStatus === 0 ? "pass" : "fail", {
  primaryStatus,
  cleanupStatus,
  postgresGateRan: primaryStatus === 0 && cleanupStatus === 0
});
process.exit(finalStatus);
