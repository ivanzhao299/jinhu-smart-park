import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  assertNoDatabaseUrlOverrides,
  buildEphemeralPostgresRunArgs,
  inspectContainerAsync,
  resolveCreatedContainerId,
  runDockerAsync,
  validateRunId
} from "./ephemeral-postgres.mjs";

const rootDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const migrationsDir = resolve(rootDir, "database/migrations");
const runId = process.env.PROPERTY_EPHEMERAL_DB_RUN_ID ?? "";
const containerName = `pr192_track_a_bootstrap_${runId}_db`;
const fixtureLabel = "pr192-track-a-bootstrap";
const postgresUser = "pr192_bootstrap";
const postgresPassword = `${runId}_local_only`;
const databaseName = "pr192_track_a_bootstrap_fixture";
const evidenceSchema =
  "property-remediation-ephemeral-db-bootstrap-evidence-v1";
const contractVersion = "A-ephemeral-db-bootstrap-v1";
const expectedMigration175Checksum =
  "5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c";
const failAfterMigration =
  process.env.PROPERTY_EPHEMERAL_DB_TEST_FAIL_AFTER_MIGRATION;
const dockerRunStdoutOverride =
  process.env.PROPERTY_EPHEMERAL_DB_TEST_DOCKER_RUN_STDOUT;
const cleanupFailureInjection =
  process.env.PROPERTY_EPHEMERAL_DB_TEST_CLEANUP_FAILURE;

const abortController = new AbortController();
let createdContainerId = null;
let anonymousVolumeName = null;
let interruptedBy = null;
let cleanupResult = null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function log(message) {
  process.stderr.write(`[A-ephemeral-db-bootstrap] ${message}\n`);
}

function migrationNumber(filename) {
  const match = filename.match(/^(\d{6})_.+\.sql$/);
  return match ? Number(match[1]) : null;
}

function expectedCountForMigrationNumber(number) {
  if (number >= 1 && number <= 174) return number === 136 ? 2 : 1;
  if (number >= 175 && number <= 183) return 1;
  return 0;
}

function loadMigrationContract() {
  const files = readdirSync(migrationsDir)
    .filter((filename) => {
      const number = migrationNumber(filename);
      return number !== null && number >= 1 && number <= 183;
    })
    .sort();
  const byNumber = new Map();
  for (const filename of files) {
    const number = migrationNumber(filename);
    const current = byNumber.get(number) ?? [];
    current.push(filename);
    byNumber.set(number, current);
  }
  const numberingErrors = [];
  for (let number = 1; number <= 183; number += 1) {
    const expected = expectedCountForMigrationNumber(number);
    const actual = byNumber.get(number)?.length ?? 0;
    if (actual !== expected) {
      numberingErrors.push(
        `${String(number).padStart(6, "0")}: expected ${expected}, got ${actual}`
      );
    }
  }
  if (numberingErrors.length > 0) {
    throw new Error(
      `frozen migration numbering contract failed: ${numberingErrors.join("; ")}`
    );
  }

  const migration175Files = byNumber.get(175);
  if (
    migration175Files[0] !==
    "000175_2026_responsibility_user_role_queue.sql"
  ) {
    throw new Error("migration 000175 identity is not the reviewed production patch");
  }

  const entries = files.map((filename) => {
    const sql = readFileSync(resolve(migrationsDir, filename), "utf8");
    return {
      filename,
      number: migrationNumber(filename),
      sha256: sha256(sql),
      sql
    };
  });
  const migration175 = entries.find((entry) => entry.number === 175);
  if (migration175.sha256 !== expectedMigration175Checksum) {
    throw new Error(
      `migration 000175 checksum changed: expected ${expectedMigration175Checksum}, got ${migration175.sha256}`
    );
  }
  if (
    !/\bBEGIN;\s/i.test(migration175.sql) ||
    !/\bCOMMIT;\s*$/i.test(migration175.sql) ||
    !/Missing responsibility role codes/.test(migration175.sql) ||
    /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/im.test(migration175.sql)
  ) {
    throw new Error(
      "migration 000175 is no longer the reviewed transactional production-only data patch"
    );
  }

  const canonicalContract = {
    contract_version: contractVersion,
    image: OFFICIAL_POSTGRES_IMAGE,
    migration_numbering: {
      first: 1,
      baseline_last: 174,
      allowed_duplicate: 136,
      skipped: 175,
      final_first: 176,
      final_last: 183
    },
    applied: entries
      .filter((entry) => entry.number !== 175)
      .map(({ filename, sha256: checksum }) => ({
        filename,
        sha256: checksum
      })),
    skipped: [
      {
        filename: migration175.filename,
        sha256: migration175.sha256,
        reason_code: "production-data-patch-empty-db-fail-fast"
      }
    ]
  };
  return {
    entries,
    bootstrapSha: sha256(JSON.stringify(canonicalContract))
  };
}

async function psql(
  sql,
  { tuplesOnly = false, allowFailure = false, signal } = {}
) {
  return runDockerAsync(
    [
      "exec",
      "-i",
      createdContainerId,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
      "-U",
      postgresUser,
      "-d",
      databaseName
    ],
    {
      cwd: rootDir,
      input: sql,
      allowFailure,
      signal
    }
  );
}

function cancelableDelay(milliseconds, signal) {
  return new Promise((resolveDelay, rejectDelay) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolveDelay();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      rejectDelay(new Error(`bootstrap interrupted by ${interruptedBy}`));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

async function waitForStablePostgres(signal) {
  let consecutiveStableProbes = 0;
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    if (signal.aborted) {
      throw new Error(`bootstrap interrupted by ${interruptedBy}`);
    }
    const logs = await runDockerAsync(["logs", createdContainerId], {
      cwd: rootDir,
      allowFailure: true,
      signal
    });
    const entrypointComplete = `${logs.stdout}\n${logs.stderr}`.includes(
      "PostgreSQL init process complete; ready for start up."
    );
    const ready = await runDockerAsync(
      [
        "exec",
        createdContainerId,
        "pg_isready",
        "-U",
        postgresUser,
        "-d",
        databaseName
      ],
      { cwd: rootDir, allowFailure: true, signal }
    );
    let sqlReady = false;
    if (entrypointComplete && ready.status === 0) {
      const probe = await psql("SELECT 1;", {
        tuplesOnly: true,
        allowFailure: true,
        signal
      });
      sqlReady = probe.status === 0 && probe.stdout.trim() === "1";
    }
    if (entrypointComplete && ready.status === 0 && sqlReady) {
      consecutiveStableProbes += 1;
      if (consecutiveStableProbes >= 3) return;
    } else {
      consecutiveStableProbes = 0;
    }
    await cancelableDelay(500, signal);
  }
  throw new Error(
    "ephemeral PostgreSQL did not reach entrypoint-complete plus three stable SQL probes within 60 seconds"
  );
}

async function verifyMigration175Rollback(migration, signal) {
  const result = await psql(migration.sql, {
    allowFailure: true,
    signal
  });
  const diagnostic = `${result.stderr}\n${result.stdout}`;
  if (
    result.status === 0 ||
    !diagnostic.includes("Missing responsibility role codes")
  ) {
    throw new Error(
      "migration 000175 did not produce its reviewed empty-database fail-fast"
    );
  }
  const residual = await psql(
    `
      SELECT
        (SELECT count(*) FROM sys_org
          WHERE remark = '依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM sys_post
          WHERE remark = '依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM sys_user
          WHERE remark LIKE '%依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM rel_user_role
          WHERE remark = '2026 职责分工标准角色队列');
    `,
    { tuplesOnly: true, signal }
  );
  if (residual.stdout.trim() !== "0|0|0|0") {
    throw new Error(
      `migration 000175 expected rollback left production-patch rows: ${residual.stdout.trim()}`
    );
  }
}

async function inspectVolume(volumeName) {
  const result = await runDockerAsync(["volume", "inspect", volumeName], {
    cwd: rootDir,
    allowFailure: true
  });
  if (result.status !== 0) {
    if (/No such volume/i.test(result.stderr)) return null;
    throw new Error(
      `docker volume inspect failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result.stdout;
}

async function cleanupCreatedTarget() {
  if (cleanupResult) return cleanupResult;
  const cleanup = {
    attempted: Boolean(createdContainerId),
    container_absent: !createdContainerId,
    anonymous_volume_absent: !anonymousVolumeName,
    errors: []
  };
  try {
    if (!createdContainerId) {
      cleanupResult = cleanup;
      return cleanupResult;
    }

    let createdTarget = null;
    try {
      createdTarget = await inspectContainerAsync(createdContainerId, {
        cwd: rootDir
      });
      if (!anonymousVolumeName) {
        const candidateMount = (createdTarget?.Mounts ?? []).find(
          (mount) =>
            mount.Type === "volume" &&
            mount.Destination === "/var/lib/postgresql/data" &&
            /^[a-f0-9]{64}$/.test(mount.Name ?? "")
        );
        anonymousVolumeName = candidateMount?.Name ?? null;
      }
    } catch (error) {
      cleanup.errors.push(
        `container inspect: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (createdTarget) {
      const stop = await runDockerAsync(
        ["stop", "--timeout", "5", createdContainerId],
        { cwd: rootDir, allowFailure: true }
      );
      if (stop.status !== 0) {
        cleanup.errors.push(
          `container stop: ${(stop.stderr || stop.stdout).trim()}`
        );
      }
    }

    let remainingContainer = null;
    try {
      remainingContainer =
        (await inspectContainerAsync(createdContainerId, { cwd: rootDir })) ??
        (await inspectContainerAsync(containerName, { cwd: rootDir }));
    } catch (error) {
      cleanup.errors.push(
        `container residual inspect: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (remainingContainer) {
      const remove = await runDockerAsync(
        ["rm", "--force", createdContainerId],
        { cwd: rootDir, allowFailure: true }
      );
      if (remove.status !== 0) {
        cleanup.errors.push(
          `container remove: ${(remove.stderr || remove.stdout).trim()}`
        );
      }
    }
    try {
      cleanup.container_absent =
        (await inspectContainerAsync(createdContainerId, { cwd: rootDir })) ===
          null &&
        (await inspectContainerAsync(containerName, { cwd: rootDir })) === null;
    } catch (error) {
      cleanup.errors.push(
        `container final inspect: ${error instanceof Error ? error.message : String(error)}`
      );
      cleanup.container_absent = false;
    }

    if (anonymousVolumeName) {
      try {
        if (await inspectVolume(anonymousVolumeName)) {
          const removeVolume = await runDockerAsync(
            ["volume", "rm", anonymousVolumeName],
            { cwd: rootDir, allowFailure: true }
          );
          if (removeVolume.status !== 0) {
            cleanup.errors.push(
              `volume remove: ${(removeVolume.stderr || removeVolume.stdout).trim()}`
            );
          }
        }
        cleanup.anonymous_volume_absent =
          (await inspectVolume(anonymousVolumeName)) === null;
      } catch (error) {
        cleanup.errors.push(
          `volume cleanup: ${error instanceof Error ? error.message : String(error)}`
        );
        cleanup.anonymous_volume_absent = false;
      }
    }
  } catch (error) {
    cleanup.errors.push(
      `unexpected cleanup failure: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    cleanup.container_absent = false;
    cleanup.anonymous_volume_absent = false;
  }
  if (cleanupFailureInjection === "after-cleanup") {
    cleanup.errors.push("injected cleanup evidence failure");
  }
  cleanupResult = cleanup;
  return cleanupResult;
}

function handleSignal(signal) {
  if (interruptedBy) return;
  interruptedBy = signal;
  abortController.abort();
}

process.once("SIGINT", () => handleSignal("SIGINT"));
process.once("SIGTERM", () => handleSignal("SIGTERM"));

const startedAt = new Date().toISOString();
const applied = [];
const skipped = [];
let bootstrapSha = null;
let targetEvidence = {
  container_name: containerName,
  image: OFFICIAL_POSTGRES_IMAGE,
  database: databaseName,
  labels: {
    "com.jinhu.fixture": fixtureLabel,
    "com.jinhu.fixture.run-id": runId
  },
  auto_remove: true,
  storage: "anonymous-volume",
  loopback_random_port: true,
  readiness_contract:
    "official-entrypoint-complete + 3 consecutive pg_isready/SELECT 1 probes over >=1s"
};
let errorMessage = null;
let cleanupEvidence = null;

try {
  validateRunId(runId);
  assertNoDatabaseUrlOverrides(process.env);
  const migrationContract = loadMigrationContract();
  bootstrapSha = migrationContract.bootstrapSha;
  if (
    failAfterMigration &&
    !migrationContract.entries.some(
      (entry) =>
        entry.filename === failAfterMigration && entry.number !== 175
    )
  ) {
    throw new Error(
      "PROPERTY_EPHEMERAL_DB_TEST_FAIL_AFTER_MIGRATION must name an applied migration"
    );
  }
  if (await inspectContainerAsync(containerName, { cwd: rootDir })) {
    throw new Error(
      `refusing existing container target ${containerName}; choose a fresh run id`
    );
  }

  const runArgs = buildEphemeralPostgresRunArgs({
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    postgresUser,
    postgresPassword
  });
  targetEvidence = {
    ...targetEvidence,
    docker_run_command: runArgs.map((value) =>
      value.startsWith("POSTGRES_PASSWORD=")
        ? "POSTGRES_PASSWORD=<redacted>"
        : value
    )
  };
  const created = await runDockerAsync(runArgs, {
    cwd: rootDir,
    signal: abortController.signal
  });
  const observedDockerRunStdout =
    dockerRunStdoutOverride ?? created.stdout;
  if (/^[a-f0-9]{64}$/.test(observedDockerRunStdout.trim())) {
    createdContainerId = observedDockerRunStdout.trim();
  }
  const inspectedCreated = await inspectContainerAsync(containerName, {
    cwd: rootDir,
    signal: abortController.signal
  });
  const exactCreated = assertExactEphemeralPostgresContainer(
    inspectedCreated,
    {
      containerName,
      databaseName,
      fixtureLabel,
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireLoopbackPort: true,
      requireRunning: false
    }
  );
  createdContainerId = exactCreated.containerId;
  anonymousVolumeName = exactCreated.volumeName;
  createdContainerId = resolveCreatedContainerId(
    observedDockerRunStdout,
    inspectedCreated,
    {
      containerName,
      databaseName,
      fixtureLabel,
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireLoopbackPort: true
    }
  );

  await waitForStablePostgres(abortController.signal);
  const inspectedReady = await inspectContainerAsync(createdContainerId, {
    cwd: rootDir,
    signal: abortController.signal
  });
  const exactReady = assertExactEphemeralPostgresContainer(inspectedReady, {
    containerName,
    databaseName,
    fixtureLabel,
    runId,
    expectedImage: OFFICIAL_POSTGRES_IMAGE,
    requireLoopbackPort: true
  });
  targetEvidence = {
    ...targetEvidence,
    container_id: exactReady.containerId,
    anonymous_volume_name: exactReady.volumeName,
    host_port: exactReady.hostPort,
    stable_ready_probes: 3
  };

  for (const migration of migrationContract.entries) {
    if (interruptedBy || abortController.signal.aborted) {
      throw new Error(`bootstrap interrupted by ${interruptedBy}`);
    }
    if (migration.number === 175) {
      log(`validating expected rollback for ${migration.filename}`);
      await verifyMigration175Rollback(
        migration,
        abortController.signal
      );
      skipped.push({
        sequence: applied.length + skipped.length + 1,
        filename: migration.filename,
        sha256: migration.sha256,
        status: "skipped",
        reason_code: "production-data-patch-empty-db-fail-fast",
        reason:
          "Reviewed production-only data patch fails closed on an empty database and creates no schema required by migrations 000176-000183.",
        transaction_rollback_verified: true,
        provides_required_schema: false
      });
      continue;
    }
    log(`applying ${migration.filename}`);
    await psql(migration.sql, { signal: abortController.signal });
    applied.push({
      sequence: applied.length + skipped.length + 1,
      filename: migration.filename,
      sha256: migration.sha256,
      status: "applied"
    });
    if (migration.filename === failAfterMigration) {
      throw new Error(`injected failure after ${migration.filename}`);
    }
  }
} catch (error) {
  errorMessage =
    interruptedBy ??
    (error instanceof Error ? error.message : String(error));
  if (interruptedBy) errorMessage = `bootstrap interrupted by ${interruptedBy}`;
} finally {
  cleanupEvidence = await cleanupCreatedTarget();
}

const passed =
  !errorMessage &&
  !interruptedBy &&
  cleanupEvidence?.container_absent === true &&
  cleanupEvidence?.anonymous_volume_absent === true &&
  cleanupEvidence?.errors?.length === 0;
process.stdout.write(
  `${JSON.stringify({
    schema_version: evidenceSchema,
    contract_version: contractVersion,
    bootstrap_sha: bootstrapSha,
    run_id: runId,
    status: passed ? "passed" : "failed",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    target: targetEvidence,
    migration_evidence: {
      applied,
      skipped
    },
    cleanup: cleanupEvidence,
    interrupted_by: interruptedBy,
    error: errorMessage
  })}\n`
);

if (!passed) process.exitCode = 1;
