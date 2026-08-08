import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  assertNoDatabaseUrlOverrides,
  buildEphemeralPostgresRunArgs,
  resolveCreatedContainerId,
  runDocker,
  validateRunId
} from "./ephemeral-postgres.mjs";

const bootstrapDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(bootstrapDir, "../../../..");
const runnerPath = resolve(
  bootstrapDir,
  "run-ephemeral-db-bootstrap.mjs"
);
const runtimeEnabled =
  process.env.PROPERTY_EPHEMERAL_DB_RUNTIME_TEST === "yes";

function inspectedFixture(overrides = {}) {
  return {
    Id: "a".repeat(64),
    Name: "/pr192_track_a_bootstrap_testbootstrap123_db",
    State: { Running: true },
    HostConfig: { AutoRemove: true },
    Config: {
      Image: OFFICIAL_POSTGRES_IMAGE,
      Env: ["POSTGRES_DB=pr192_track_a_bootstrap_fixture"],
      Labels: {
        "com.jinhu.fixture": "pr192-track-a-bootstrap",
        "com.jinhu.fixture.run-id": "testbootstrap123"
      }
    },
    Mounts: [
      {
        Type: "volume",
        Name: "b".repeat(64),
        Destination: "/var/lib/postgresql/data"
      }
    ],
    NetworkSettings: {
      Ports: {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "49152" }]
      }
    },
    ...overrides
  };
}

function runtimeEnvironment(runId, extra = {}) {
  const environment = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "PROPERTY_RBAC_FIXTURE_DATABASE_URL",
    "PROPERTY_EPHEMERAL_DB_DATABASE_URL",
    "PROPERTY_EPHEMERAL_DB_TEST_FAIL_AFTER_MIGRATION"
  ]) {
    delete environment[name];
  }
  return {
    ...environment,
    PROPERTY_EPHEMERAL_DB_RUN_ID: runId,
    ...extra
  };
}

function executeBootstrap(runId, extra = {}) {
  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: runtimeEnvironment(runId, extra),
    timeout: 240_000,
    maxBuffer: 50 * 1024 * 1024
  });
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  const evidence = lines.length > 0 ? JSON.parse(lines.at(-1)) : null;
  return { result, evidence };
}

function expectedAppliedMigrationNumbers() {
  const expected = [];
  for (let number = 1; number <= 174; number += 1) {
    expected.push(number);
    if (number === 136) expected.push(number);
  }
  for (let number = 176; number <= 183; number += 1) {
    expected.push(number);
  }
  return expected;
}

function createFakeDockerSignalEnvironment() {
  const temporaryRoot = mkdtempSync(
    resolve(tmpdir(), "pr192-bootstrap-signal-")
  );
  const binDir = resolve(temporaryRoot, "bin");
  const stateDir = resolve(temporaryRoot, "state");
  mkdirSync(binDir);
  mkdirSync(stateDir);
  const wrapperPath = resolve(binDir, "docker");
  const fakeDockerPath = resolve(
    bootstrapDir,
    "fake-docker-signal-harness.mjs"
  );
  writeFileSync(
    wrapperPath,
    `#!/bin/sh\nexec "${process.execPath}" "${fakeDockerPath}" "$@"\n`
  );
  chmodSync(wrapperPath, 0o755);
  return {
    temporaryRoot,
    environment: {
      PATH: `${binDir}:${process.env.PATH}`,
      PROPERTY_EPHEMERAL_DB_FAKE_DOCKER_STATE_DIR: stateDir
    }
  };
}

function executeBootstrapAndSignal(
  runId,
  signal = "SIGTERM",
  extraEnvironment = {}
) {
  return new Promise((resolveExecution, rejectExecution) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: rootDir,
      env: runtimeEnvironment(runId, extraEnvironment),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let signalSent = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectExecution(new Error(`signal test timed out\n${stderr}`));
    }, 120_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!signalSent && stderr.includes("applying 000001_init_auth.sql")) {
        signalSent = true;
        setTimeout(() => child.kill(signal), 300);
      }
    });
    child.on("error", rejectExecution);
    child.on("close", (status) => {
      clearTimeout(timeout);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const evidence = lines.length > 0 ? JSON.parse(lines.at(-1)) : null;
      resolveExecution({ status, evidence, stderr, signalSent });
    });
  });
}

function assertRuntimeCleanup(evidence, { inspectDocker = true } = {}) {
  assert.equal(evidence.cleanup.container_absent, true);
  assert.equal(evidence.cleanup.anonymous_volume_absent, true);
  assert.notEqual(evidence.target.container_id, undefined);
  assert.notEqual(evidence.target.anonymous_volume_name, undefined);
  assert.notEqual(evidence.target.host_port, undefined);
  if (inspectDocker) {
    assert.notEqual(
      runDocker(
        ["inspect", "--type", "container", evidence.target.container_id],
        { cwd: rootDir, allowFailure: true }
      ).status,
      0
    );
    assert.notEqual(
      runDocker(
        ["volume", "inspect", evidence.target.anonymous_volume_name],
        { cwd: rootDir, allowFailure: true }
      ).status,
      0
    );
  }
}

test("run id validation and docker run arguments are exact", () => {
  assert.equal(validateRunId("testbootstrap123"), "testbootstrap123");
  for (const invalid of [
    "",
    "short",
    "UPPERCASE_RUN_ID",
    "bad.run.identifier",
    "a".repeat(65)
  ]) {
    assert.throws(() => validateRunId(invalid));
  }
  const args = buildEphemeralPostgresRunArgs({
    containerName: "pr192_track_a_bootstrap_testbootstrap123_db",
    databaseName: "pr192_track_a_bootstrap_fixture",
    fixtureLabel: "pr192-track-a-bootstrap",
    runId: "testbootstrap123",
    postgresUser: "fixture",
    postgresPassword: "local-only"
  });
  assert.deepEqual(args.slice(0, 4), [
    "run",
    "--detach",
    "--rm",
    "--name"
  ]);
  assert.equal(args.at(-1), OFFICIAL_POSTGRES_IMAGE);
  assert.equal(args.includes("--volume"), false);
  assert.equal(args.includes("-v"), false);
  assert.equal(args.includes("127.0.0.1::5432"), true);
  assert.equal(
    args.filter((value) => value === "--label").length,
    2
  );
});

test("database URL overrides are rejected before target creation", () => {
  assert.doesNotThrow(() => assertNoDatabaseUrlOverrides({}));
  assert.throws(
    () =>
      assertNoDatabaseUrlOverrides({
        PROPERTY_EPHEMERAL_DB_DATABASE_URL:
          "postgresql://127.0.0.1/fixture"
      }),
    /database URL overrides are forbidden/
  );
});

test("runner emits structured failure evidence for an invalid run id", () => {
  const { result, evidence } = executeBootstrap("bad");
  assert.notEqual(result.status, 0);
  assert.equal(evidence.status, "failed");
  assert.match(evidence.error, /run id must be/);
  assert.equal(evidence.cleanup.attempted, false);
  assert.equal(evidence.cleanup.container_absent, true);
  assert.equal(evidence.cleanup.anonymous_volume_absent, true);
});

test("wrong, persistent or non-loopback targets are rejected", () => {
  const expected = {
    containerName: "pr192_track_a_bootstrap_testbootstrap123_db",
    databaseName: "pr192_track_a_bootstrap_fixture",
    fixtureLabel: "pr192-track-a-bootstrap",
    runId: "testbootstrap123",
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  };
  assert.deepEqual(
    assertExactEphemeralPostgresContainer(inspectedFixture(), expected),
    {
      containerId: "a".repeat(64),
      hostPort: "49152",
      volumeName: "b".repeat(64)
    }
  );
  assert.throws(() =>
    assertExactEphemeralPostgresContainer(
      inspectedFixture({ State: { Running: false } }),
      expected
    )
  );
  assert.throws(() =>
    assertExactEphemeralPostgresContainer(
      inspectedFixture({ HostConfig: { AutoRemove: false } }),
      expected
    )
  );
  assert.throws(() =>
    assertExactEphemeralPostgresContainer(
      inspectedFixture({
        Mounts: [
          {
            Type: "volume",
            Name: "named-volume",
            Destination: "/var/lib/postgresql/data"
          }
        ]
      }),
      expected
    )
  );
  assert.throws(() =>
    assertExactEphemeralPostgresContainer(
      inspectedFixture({
        NetworkSettings: {
          Ports: {
            "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "49152" }]
          }
        }
      }),
      expected
    )
  );
  assert.equal(
    resolveCreatedContainerId("invalid-stdout", inspectedFixture(), expected),
    "a".repeat(64)
  );
  assert.throws(() =>
    resolveCreatedContainerId(
      "c".repeat(64),
      inspectedFixture(),
      expected
    )
  );
});

test(
  "real empty database failure path cleans its exact container and anonymous volume",
  { skip: !runtimeEnabled, timeout: 240_000 },
  () => {
    const runId = `bootstrapfail${randomBytes(8).toString("hex")}`;
    const { result, evidence } = executeBootstrap(runId, {
      PROPERTY_EPHEMERAL_DB_TEST_FAIL_AFTER_MIGRATION:
        "000009_s2_biz_building.sql",
      PROPERTY_EPHEMERAL_DB_TEST_DOCKER_RUN_STDOUT: "invalid-stdout"
    });
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(evidence.status, "failed");
    assert.match(evidence.error, /injected failure/);
    assertRuntimeCleanup(evidence);
  }
);

test(
  "real SIGTERM stops migration execution and cleans the exact target",
  {
    skip: !runtimeEnabled || process.platform === "win32",
    timeout: 180_000
  },
  async () => {
    const runId = `bootstrapsignal${randomBytes(8).toString("hex")}`;
    const fakeDocker =
      process.env.PROPERTY_EPHEMERAL_DB_SIGNAL_FAKE_DOCKER_TEST === "yes"
        ? createFakeDockerSignalEnvironment()
        : null;
    try {
      const execution = await executeBootstrapAndSignal(
        runId,
        "SIGTERM",
        fakeDocker?.environment
      );
      assert.equal(execution.signalSent, true);
      assert.notEqual(execution.status, 0, execution.stderr);
      assert.equal(execution.evidence.status, "failed");
      assert.equal(execution.evidence.interrupted_by, "SIGTERM");
      assert.match(execution.evidence.error, /interrupted by SIGTERM/);
      assertRuntimeCleanup(execution.evidence, {
        inspectDocker: !fakeDocker
      });
      if (fakeDocker) {
        assert.equal(
          existsSync(
            resolve(
              fakeDocker.environment
                .PROPERTY_EPHEMERAL_DB_FAKE_DOCKER_STATE_DIR,
              "container.json"
            )
          ),
          false
        );
      }
    } finally {
      if (fakeDocker) {
        rmSync(fakeDocker.temporaryRoot, {
          recursive: true,
          force: true
        });
      }
    }
  }
);

test(
  "cleanup errors are retained in final evidence and force failure",
  { skip: !runtimeEnabled, timeout: 240_000 },
  () => {
    const runId = `bootstrapcleanup${randomBytes(8).toString("hex")}`;
    const { result, evidence } = executeBootstrap(runId, {
      PROPERTY_EPHEMERAL_DB_TEST_FAIL_AFTER_MIGRATION:
        "000009_s2_biz_building.sql",
      PROPERTY_EPHEMERAL_DB_TEST_CLEANUP_FAILURE: "after-cleanup"
    });
    assert.notEqual(result.status, 0, result.stderr);
    assert.equal(evidence.status, "failed");
    assert.deepEqual(evidence.cleanup.errors, [
      "injected cleanup evidence failure"
    ]);
    assertRuntimeCleanup(evidence);
  }
);

test(
  "real empty database bootstrap is repeatable and leaves no resources",
  { skip: !runtimeEnabled, timeout: 480_000 },
  () => {
    const runId = `bootstraprepeat${randomBytes(8).toString("hex")}`;
    const first = executeBootstrap(runId);
    assert.equal(first.result.status, 0, first.result.stderr);
    assert.equal(first.evidence.status, "passed");
    const appliedNumbers = first.evidence.migration_evidence.applied.map(
      (entry) => Number(entry.filename.slice(0, 6))
    );
    assert.deepEqual(appliedNumbers, expectedAppliedMigrationNumbers());
    assert.equal(appliedNumbers.length, 183);
    const duplicateNumbers = [...new Set(
      appliedNumbers.filter(
        (number, index) => appliedNumbers.indexOf(number) !== index
      )
    )];
    assert.deepEqual(duplicateNumbers, [136]);
    assert.equal(first.evidence.migration_evidence.skipped.length, 1);
    assert.equal(
      first.evidence.migration_evidence.skipped[0]
        .transaction_rollback_verified,
      true
    );
    assert.equal(
      first.evidence.migration_evidence.skipped[0].sha256,
      "5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c"
    );
    assertRuntimeCleanup(first.evidence);

    const second = executeBootstrap(runId);
    assert.equal(second.result.status, 0, second.result.stderr);
    assert.equal(second.evidence.status, "passed");
    assert.equal(second.evidence.bootstrap_sha, first.evidence.bootstrap_sha);
    assert.deepEqual(
      second.evidence.migration_evidence.applied,
      first.evidence.migration_evidence.applied
    );
    assert.deepEqual(
      second.evidence.migration_evidence.skipped,
      first.evidence.migration_evidence.skipped
    );
    assert.notEqual(
      second.evidence.target.anonymous_volume_name,
      first.evidence.target.anonymous_volume_name
    );
    assertRuntimeCleanup(second.evidence);
  }
);
