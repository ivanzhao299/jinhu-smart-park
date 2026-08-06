import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { join } from "node:path";

const scriptPath = join(__dirname, "property-event-runtime.pg-gate.sh");
const script = readFileSync(scriptPath, "utf8");

interface GateRunOptions {
  nodeMajor?: number;
  nodeExit?: number;
  createExit?: number;
  dropExit?: number;
}

const runFakeGate = (options: GateRunOptions = {}) => {
  const directory = mkdtempSync("/tmp/property-pg-gate-spec-");
  const log = join(directory, "calls.log");
  const node = join(directory, "node");
  const docker = join(directory, "docker");
  const database = `gate_spec_${randomUUID().replaceAll("-", "")}`;
  writeFileSync(node, `#!/usr/bin/env sh
if [ "\${1:-}" = "-p" ]; then
  printf '%s\\n' "\${FAKE_NODE_MAJOR:-22}"
  exit 0
fi
printf 'node:%s\\n' "$*" >> "$FAKE_GATE_LOG"
exit "\${FAKE_NODE_EXIT:-0}"
`);
  writeFileSync(docker, `#!/usr/bin/env sh
printf 'docker:%s\\n' "$*" >> "$FAKE_GATE_LOG"
case " $* " in
  *" createdb "*) exit "\${FAKE_CREATE_EXIT:-0}" ;;
  *" dropdb "*) exit "\${FAKE_DROP_EXIT:-0}" ;;
esac
exit 88
`);
  chmodSync(node, 0o700);
  chmodSync(docker, 0o700);
  const result = spawnSync(scriptPath, [], {
    encoding: "utf8",
    env: {
      ...process.env,
      PROPERTY_RUNTIME_GATE_TEST_MODE: "1",
      PROPERTY_RUNTIME_DOCKER_BIN: docker,
      PROPERTY_RUNTIME_NODE_BIN: node,
      PROPERTY_RUNTIME_PG_DATABASE: database,
      FAKE_GATE_LOG: log,
      FAKE_NODE_MAJOR: String(options.nodeMajor ?? 22),
      FAKE_NODE_EXIT: String(options.nodeExit ?? 0),
      FAKE_CREATE_EXIT: String(options.createExit ?? 0),
      FAKE_DROP_EXIT: String(options.dropExit ?? 0),
      TMPDIR: directory
    }
  });
  const calls = (() => {
    try {
      return readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  })();
  rmSync(directory, { recursive: true, force: true });
  return { ...result, calls, database };
};

const createCalls = (calls: string[]) =>
  calls.filter((call) => call.includes(" createdb "));
const dropCalls = (calls: string[]) =>
  calls.filter((call) => call.includes(" dropdb "));

describe("property event PostgreSQL gate shell safety", () => {
  it("resolves and verifies Node.js 22 without relying on PATH", () => {
    assert.match(script, /NODE_BIN="\$\(resolve_node22\)"/);
    assert.match(script, /process\.versions\.node\.split\('\.'\)\[0\]/);
    assert.match(script, /\.nvm\/versions\/node\/v22\.23\.2\/bin\/node/);
    assert.match(script, /PROPERTY_RUNTIME_NODE_BIN must reference an executable Node\.js 22 binary/);
  });

  it("always preserves the test status for EXIT cleanup without exec", () => {
    assert.doesNotMatch(script, /^\s*exec\s+/m);
    assert.match(script, /TEST_STATUS=\$\?/);
    assert.match(script, /exit "\$TEST_STATUS"/);
    assert.ok(script.indexOf("trap 'cleanup") < script.indexOf("createdb -U"));
  });

  it("drops only the exact database successfully created by this run", () => {
    assert.match(script, /GATE_DB_CREATED=no/);
    assert.match(script, /GATE_DB_CREATED=yes/);
    assert.match(script, /if \[ "\$GATE_DB_CREATED" = yes \]; then/);
    assert.match(script, /dropdb -U "\$\{POSTGRES_USER:-jinhu\}" "\$GATE_DB"/);
    assert.doesNotMatch(script, /dropdb[^\n]*--if-exists/);
  });

  it("fails Node 22 resolution before create and never drops an unknown database", () => {
    const run = runFakeGate({ nodeMajor: 20 });
    assert.notEqual(run.status, 0);
    assert.equal(createCalls(run.calls).length, 0);
    assert.equal(dropCalls(run.calls).length, 0);
    assert.match(run.stderr, /must reference an executable Node\.js 22 binary/);
  });

  it("preserves test exit 37 and drops the exact created database once", () => {
    const run = runFakeGate({ nodeExit: 37 });
    assert.equal(run.status, 37);
    assert.equal(createCalls(run.calls).length, 1);
    assert.equal(dropCalls(run.calls).length, 1);
    assert.ok(createCalls(run.calls)[0]!.endsWith(` ${run.database}`));
    assert.ok(dropCalls(run.calls)[0]!.endsWith(` ${run.database}`));
  });

  it("turns successful tests into a cleanup failure when exact drop fails", () => {
    const run = runFakeGate({ dropExit: 9 });
    assert.notEqual(run.status, 0);
    assert.equal(createCalls(run.calls).length, 1);
    assert.equal(dropCalls(run.calls).length, 1);
    assert.match(run.stderr, new RegExp(
      `failed to drop property runtime gate database: ${run.database}`
    ));
  });

  it("does not drop when createdb itself fails", () => {
    const run = runFakeGate({ createExit: 12 });
    assert.notEqual(run.status, 0);
    assert.equal(createCalls(run.calls).length, 1);
    assert.equal(dropCalls(run.calls).length, 0);
  });

  it("creates and drops the exact successful-run database once", () => {
    const run = runFakeGate();
    assert.equal(run.status, 0);
    assert.equal(createCalls(run.calls).length, 1);
    assert.equal(dropCalls(run.calls).length, 1);
    assert.ok(createCalls(run.calls)[0]!.endsWith(` ${run.database}`));
    assert.ok(dropCalls(run.calls)[0]!.endsWith(` ${run.database}`));
    assert.equal(run.calls.filter((call) => call.startsWith("node:")).length, 1);
  });
});
