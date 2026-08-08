#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  OFFICIAL_POSTGRES_IMAGE,
  assertExactEphemeralPostgresContainer,
  buildEphemeralPostgresRunArgs,
  inspectContainerAsync,
  resolveCreatedContainerId,
  runDockerAsync
} from "./bootstrap/ephemeral-postgres.mjs";
import { canonicalize, sha256 } from "./lib/canonical.mjs";
import { validateTraceability } from "./lib/contracts.mjs";
import {
  assertFinalHandoffSourceState,
  projectABaseDatabaseCounts,
  validateHandoffContract,
  validateProvisionEvidenceContract
} from "./lib/evidence-contract.mjs";
import {
  CleanupJournal,
  acquireRunLock,
  writeJsonAtomic
} from "./lib/journal.mjs";
import {
  VALID_TEST_PNG,
  computeProfileChecksum,
  loadProfile,
  rowsForTable,
  scopeForProfile
} from "./lib/profile.mjs";
import {
  assertAStubEnvironment,
  assertDedicatedScope
} from "./lib/safety.mjs";
import {
  exactCleanupSql,
  fixtureCopyChunks,
  generatorSha256,
  migrationPlan,
  residualScanSql
} from "./lib/sql-fixture.mjs";
import {
  REVIEWED_BOOTSTRAP_SHA256,
  loadReviewedBootstrapContract,
  verifyReviewedMigration175Rollback
} from "./lib/reviewed-bootstrap-contract.mjs";
import {
  decodeJsonFile,
  validateSchema
} from "./lib/strict-decoder.mjs";
import { A_BASE_EXACT_ACTORS } from "./roles/a-base-actors.mjs";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const outerRunId =
  process.env.PROPERTY_A_BASE_RUN_ID ??
  `abase${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${randomBytes(3).toString("hex")}`;
const artifactDir = resolve(
  rootDir,
  "artifacts/property-remediation/runs",
  outerRunId
);
const cleanupSchema = decodeJsonFile(
  resolve(rootDir, "scripts/e2e/property-remediation/contracts/cleanup-event.schema.json")
);
const handoffSchema = decodeJsonFile(
  resolve(rootDir, "scripts/e2e/property-remediation/contracts/handoff.schema.json")
);
const provisionEvidenceSchema = decodeJsonFile(
  resolve(rootDir, "scripts/e2e/property-remediation/contracts/provision-evidence.schema.json")
);
const cleanupEvidenceSchema = decodeJsonFile(
  resolve(rootDir, "scripts/e2e/property-remediation/contracts/cleanup-evidence.schema.json")
);
const summarySchema = decodeJsonFile(
  resolve(rootDir, "scripts/e2e/property-remediation/contracts/summary.schema.json")
);
const prerequisitesValuePath = resolve(
  rootDir,
  "scripts/e2e/property-remediation/profiles/frozen-handoffs.json"
);
const prerequisites = validateSchema(
  decodeJsonFile(prerequisitesValuePath),
  decodeJsonFile(
    resolve(rootDir, "scripts/e2e/property-remediation/contracts/prerequisites.schema.json")
  ),
  prerequisitesValuePath
);
const profile = loadProfile();
const scope = scopeForProfile(profile);
const handoffMode = process.env.PROPERTY_A_BASE_HANDOFF_MODE ?? "non-final";
const abortController = new AbortController();
let interruptedBy = null;

function log(message) {
  process.stderr.write(`[A-base-core] ${message}\n`);
}

function shaFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyPrerequisiteCommits() {
  for (const [key, value] of Object.entries(prerequisites)) {
    if (!key.endsWith("_commit")) continue;
    const result = execFileSync("git", ["cat-file", "-t", value], {
      cwd: rootDir,
      encoding: "utf8"
    }).trim();
    if (result !== "commit") throw new Error(`${key} is not a frozen git commit`);
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", value, "HEAD"], {
      cwd: rootDir,
      encoding: "utf8"
    });
    if (ancestor.status !== 0) {
      throw new Error(`${key} is not an ancestor of current HEAD`);
    }
  }
}

async function delay(milliseconds) {
  await new Promise((resolveDelay, rejectDelay) => {
    const finish = () => {
      abortController.signal.removeEventListener("abort", stop);
      resolveDelay();
    };
    const timer = setTimeout(finish, milliseconds);
    const stop = () => {
      clearTimeout(timer);
      abortController.signal.removeEventListener("abort", stop);
      rejectDelay(new Error(`interrupted by ${interruptedBy}`));
    };
    if (abortController.signal.aborted) stop();
    else abortController.signal.addEventListener("abort", stop, { once: true });
  });
}

async function waitForPostgres(containerId, credentials) {
  let stable = 0;
  let firstStableAt = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const logs = await runDockerAsync(["logs", containerId], {
      cwd: rootDir,
      allowFailure: true,
      signal: abortController.signal
    });
    const entrypointComplete = `${logs.stdout}\n${logs.stderr}`.includes(
      "PostgreSQL init process complete; ready for start up."
    );
    const ready = await runDockerAsync(
      [
        "exec",
        containerId,
        "pg_isready",
        "-U",
        credentials.user,
        "-d",
        credentials.database
      ],
      { cwd: rootDir, allowFailure: true, signal: abortController.signal }
    );
    let sqlReady = false;
    if (entrypointComplete && ready.status === 0) {
      const probe = await psql(containerId, credentials, "SELECT 1;", {
        tuplesOnly: true,
        allowFailure: true
      });
      sqlReady = probe.status === 0 && probe.stdout.trim() === "1";
    }
    if (entrypointComplete && ready.status === 0 && sqlReady) {
      stable += 1;
      firstStableAt ??= Date.now();
    } else {
      stable = 0;
      firstStableAt = null;
    }
    if (
      stable >= 3 &&
      firstStableAt !== null &&
      Date.now() - firstStableAt >= 1_000
    ) return;
    await delay(500);
  }
  throw new Error("ephemeral PostgreSQL readiness did not stabilize");
}

async function psql(
  containerId,
  credentials,
  sql,
  { tuplesOnly = false, ignoreAbort = false, allowFailure = false } = {}
) {
  return runDockerAsync(
    [
      "exec",
      "-i",
      containerId,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      ...(tuplesOnly ? ["-qAt", "-F", "|"] : ["-q"]),
      "-U",
      credentials.user,
      "-d",
      credentials.database
    ],
    {
      cwd: rootDir,
      input: sql,
      allowFailure,
      signal: ignoreAbort ? undefined : abortController.signal
    }
  );
}

async function migrate(containerId, credentials) {
  const reviewed = loadReviewedBootstrapContract(
    resolve(rootDir, "database/migrations")
  );
  if (
    reviewed.bootstrapSha256 !== prerequisites.bootstrap_handoff_sha256 ||
    reviewed.bootstrapSha256 !== REVIEWED_BOOTSTRAP_SHA256
  ) {
    throw new Error("runtime bootstrap contract does not match frozen prerequisite");
  }
  const skipped = [];
  let applied = 0;
  for (const migration of reviewed.entries) {
    if (migration.number === 175) {
      log(`validating expected rollback for ${migration.filename}`);
      skipped.push(
        await verifyReviewedMigration175Rollback({
          migration,
          psql: (sql, options = {}) =>
            psql(containerId, credentials, sql, options)
        })
      );
      continue;
    }
    log(`applying ${migration.filename}`);
    await psql(containerId, credentials, migration.sql);
    applied += 1;
  }
  return {
    bootstrap_sha256: reviewed.bootstrapSha256,
    applied,
    skipped
  };
}

function physicalFilePath(runDir, row) {
  return resolve(runDir, "physical-files", row.storage_path);
}

function createPhysicalFiles(runDir, journal) {
  let created = 0;
  for (const row of rowsForTable(profile, "sys_file")) {
    const path = physicalFilePath(runDir, row);
    journal.append({
      resourceType: "physical_file",
      resourceKey: path,
      state: "planned",
      tenantId: row.tenant_id,
      parkId: row.park_id
    });
    journal.append({
      resourceType: "physical_file",
      resourceKey: path,
      state: "creating",
      tenantId: row.tenant_id,
      parkId: row.park_id
    });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, VALID_TEST_PNG, { flag: "wx", mode: 0o600 });
    journal.append({
      resourceType: "physical_file",
      resourceKey: path,
      state: "created",
      tenantId: row.tenant_id,
      parkId: row.park_id
    });
    created += 1;
    if (
      process.env.PROPERTY_A_BASE_FAULT_POINT === "during_physical_files" &&
      created === 100
    ) {
      throw new Error("injected failure during physical file creation");
    }
  }
  return created;
}

function cleanupPhysicalFiles(journal) {
  let residual = 0;
  for (const entry of journal.pendingInReverseOrder()) {
    if (entry.resource_type !== "physical_file") continue;
    journal.append({
      resourceType: entry.resource_type,
      resourceKey: entry.resource_key,
      state: "cleanup_pending",
      tenantId: entry.tenant_id,
      parkId: entry.park_id,
      attempt: entry.attempt + 1
    });
    if (existsSync(entry.resource_key)) unlinkSync(entry.resource_key);
    const remains = existsSync(entry.resource_key);
    if (remains) residual += 1;
    journal.append({
      resourceType: entry.resource_type,
      resourceKey: entry.resource_key,
      state: remains ? "failed" : "cleaned",
      tenantId: entry.tenant_id,
      parkId: entry.park_id,
      attempt: entry.attempt + 1,
      error: remains ? "physical file remains" : null
    });
  }
  return residual;
}

function beginReconcileCleanup(journal, entry) {
  if (entry.state === "cleanup_pending") return entry;
  return journal.append({
    resourceType: entry.resource_type,
    resourceKey: entry.resource_key,
    state: "cleanup_pending",
    tenantId: entry.tenant_id,
    parkId: entry.park_id,
    attempt: entry.attempt + 1
  });
}

async function verifyDatabase(containerId, credentials) {
  const countLines = [];
  const tablePairs = [
    ["park", "biz_park"],
    ["building", "biz_building"],
    ["floor", "biz_floor"],
    ["unit", "biz_unit"],
    ["party", "biz_party"],
    ["booking", "biz_homestay_booking"],
    ["booking_night", "biz_homestay_booking_night"],
    ["property_occupancy", "biz_property_occupancy"],
    ["turnover", "biz_homestay_turnover_task"],
    ["lease", "biz_housing_lease"],
    ["charge_plan", "biz_housing_charge_plan"],
    ["housing_receivable", "biz_housing_receivable"],
    ["purchase", "biz_housing_purchase"],
    ["purchase_item", "biz_housing_purchase_item"],
    ["handover", "biz_housing_handover"],
    ["work_order", "biz_work_order"],
    ["sys_file", "sys_file"]
  ];
  for (const [logicalName, table] of tablePairs) {
    countLines.push(
      `SELECT '${logicalName}', count(*) FROM ${table} WHERE remark = '${profile.scope_marker}';`
    );
  }
  countLines.push(
    `SELECT 'sys_file_valid_association', count(*) ` +
      `FROM sys_file file ` +
      `JOIN biz_housing_handover handover ON handover.id = file.biz_id ` +
      `AND handover.tenant_id = file.tenant_id ` +
      `AND handover.park_id = file.park_id ` +
      `WHERE file.remark = '${profile.scope_marker}' ` +
      `AND file.biz_type = 'housing_handover' ` +
      `AND file.mime_type = 'image/png' AND file.file_size = ${VALID_TEST_PNG.length};`
  );
  for (const trackBTable of profile.track_b_tables) {
    countLines.push(
      `SELECT 'track_b:${trackBTable}', CASE WHEN to_regclass('${trackBTable}') IS NULL THEN 0 ELSE -1 END;`
    );
  }
  const result = await psql(containerId, credentials, countLines.join("\n"), {
    tuplesOnly: true
  });
  const counts = Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.split("|");
        return [key, Number(value)];
      })
  );
  const projected = projectABaseDatabaseCounts({
    rawCounts: counts,
    profile
  });
  return {
    counts: projected.actualCounts,
    trackBDependencyCount: projected.trackBDependencyCount
  };
}

async function exactDatabaseCleanup(containerId, credentials) {
  await psql(containerId, credentials, exactCleanupSql(profile), {
    ignoreAbort: true
  });
  const residual = await psql(
    containerId,
    credentials,
    residualScanSql(profile),
    { tuplesOnly: true, ignoreAbort: true }
  );
  const residualCount = residual.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => sum + Number(line.split("|")[1]), 0);
  return residualCount;
}

async function removeExactContainer({
  containerId,
  containerName,
  volumeName,
  credentials
}) {
  await runDockerAsync(["stop", "--time", "10", containerId], {
    cwd: rootDir,
    allowFailure: true
  });
  const remaining = await inspectContainerAsync(containerName, { cwd: rootDir });
  const volume = await runDockerAsync(["volume", "inspect", volumeName], {
    cwd: rootDir,
    allowFailure: true
  });
  if (remaining || volume.status === 0) {
    throw new Error(
      `ephemeral cleanup failed for ${containerName}/${credentials.database}`
    );
  }
}

async function reconcileSuffix(suffix) {
  const runId = `${outerRunId}${suffix}`;
  const runDir = resolve(artifactDir, suffix);
  const journalPath = resolve(runDir, "cleanup-manifest.jsonl");
  if (!existsSync(journalPath)) return { runId, reconciled: false };
  const journal = new CleanupJournal({
    path: journalPath,
    runId,
    schema: cleanupSchema
  });
  const credentials = {
    user: "pr192_a_base",
    password: `${runId}_local_only`,
    database: "pr192_track_a_base_fixture"
  };
  const containerName = `pr192_track_a_base_${runId}_db`;
  const inspected = await inspectContainerAsync(containerName, { cwd: rootDir });
  let exact = null;
  if (inspected) {
    exact = assertExactEphemeralPostgresContainer(inspected, {
      containerName,
      databaseName: credentials.database,
      fixtureLabel: "pr192-track-a-base",
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireRunning: false
    });
  }

  for (const entry of journal.pendingInReverseOrder()) {
    if (entry.resource_type !== "physical_file") continue;
    const pending = beginReconcileCleanup(journal, entry);
    if (existsSync(entry.resource_key)) unlinkSync(entry.resource_key);
    const remains = existsSync(entry.resource_key);
    journal.append({
      resourceType: entry.resource_type,
      resourceKey: entry.resource_key,
      state: remains ? "failed" : "cleaned",
      tenantId: entry.tenant_id,
      parkId: entry.park_id,
      attempt: pending.attempt,
      error: remains ? "physical file remains during reconcile" : null
    });
  }

  for (const entry of journal.pendingInReverseOrder()) {
    if (entry.resource_type !== "fixture_scope") continue;
    const pending = beginReconcileCleanup(journal, entry);
    let residual = 0;
    if (exact) {
      residual = await exactDatabaseCleanup(
        exact.containerId,
        credentials
      );
    }
    journal.append({
      resourceType: entry.resource_type,
      resourceKey: entry.resource_key,
      state: residual === 0 ? "cleaned" : "failed",
      tenantId: entry.tenant_id,
      parkId: entry.park_id,
      attempt: pending.attempt,
      error: residual === 0 ? null : `${residual} rows remain during reconcile`
    });
  }

  for (const entry of journal.pendingInReverseOrder()) {
    if (entry.resource_type !== "postgres_container") continue;
    const pending = beginReconcileCleanup(journal, entry);
    if (exact) {
      await removeExactContainer({
        containerId: exact.containerId,
        containerName,
        volumeName: exact.volumeName,
        credentials
      });
      exact = null;
    }
    journal.append({
      resourceType: entry.resource_type,
      resourceKey: entry.resource_key,
      state: "cleaned",
      tenantId: entry.tenant_id,
      parkId: entry.park_id,
      attempt: pending.attempt,
      error: null
    });
  }
  const remaining = journal.pendingInReverseOrder();
  writeJsonAtomic(resolve(runDir, "reconcile-evidence.json"), {
    schema_version: "property-remediation-a-base-reconcile-evidence-v1",
    run_id: runId,
    residual_count: remaining.length,
    pending_resources: remaining.map((entry) => ({
      type: entry.resource_type,
      key: entry.resource_key,
      state: entry.state
    }))
  });
  if (remaining.length > 0) {
    throw new Error(`reconcile left ${remaining.length} pending resources`);
  }
  return { runId, reconciled: true };
}

async function provisionOnce(suffix) {
  const runId = `${outerRunId}${suffix}`;
  const runDir = resolve(artifactDir, suffix);
  const journal = new CleanupJournal({
    path: resolve(runDir, "cleanup-manifest.jsonl"),
    runId,
    schema: cleanupSchema
  });
  const credentials = {
    user: "pr192_a_base",
    password: `${runId}_local_only`,
    database: "pr192_track_a_base_fixture"
  };
  const containerName = `pr192_track_a_base_${runId}_db`;
  let containerId = null;
  let volumeName = null;
  let fixtureWriteStarted = false;
  let databaseResidual = null;
  let physicalResidual = null;
  journal.append({
    resourceType: "postgres_container",
    resourceKey: containerName,
    state: "planned"
  });
  try {
    journal.append({
      resourceType: "postgres_container",
      resourceKey: containerName,
      state: "creating"
    });
    const created = await runDockerAsync(
      buildEphemeralPostgresRunArgs({
        containerName,
        databaseName: credentials.database,
        fixtureLabel: "pr192-track-a-base",
        runId,
        postgresUser: credentials.user,
        postgresPassword: credentials.password
      }),
      { cwd: rootDir, signal: abortController.signal }
    );
    const inspected = await inspectContainerAsync(containerName, {
      cwd: rootDir,
      signal: abortController.signal
    });
    const expectedContainer = {
      containerName,
      databaseName: credentials.database,
      fixtureLabel: "pr192-track-a-base",
      runId,
      expectedImage: OFFICIAL_POSTGRES_IMAGE,
      requireRunning: true
    };
    containerId = resolveCreatedContainerId(
      created.stdout,
      inspected,
      expectedContainer
    );
    const exact = assertExactEphemeralPostgresContainer(
      inspected,
      expectedContainer
    );
    volumeName = exact.volumeName;
    journal.append({
      resourceType: "postgres_container",
      resourceKey: containerName,
      state: "created"
    });
    await waitForPostgres(containerId, credentials);
    const migrationEvidence = await migrate(containerId, credentials);
    journal.append({
      resourceType: "fixture_scope",
      resourceKey: `${scope.tenantId}:${scope.parkIds.join(",")}`,
      state: "planned",
      tenantId: scope.tenantId
    });
    journal.append({
      resourceType: "fixture_scope",
      resourceKey: `${scope.tenantId}:${scope.parkIds.join(",")}`,
      state: "creating",
      tenantId: scope.tenantId
    });
    fixtureWriteStarted = true;
    for (const chunk of fixtureCopyChunks(profile)) {
      await psql(containerId, credentials, chunk.sql);
    }
    journal.append({
      resourceType: "fixture_scope",
      resourceKey: `${scope.tenantId}:${scope.parkIds.join(",")}`,
      state: "created",
      tenantId: scope.tenantId
    });
    const physicalCount = createPhysicalFiles(runDir, journal);
    const verification = await verifyDatabase(containerId, credentials);
    if (process.env.PROPERTY_A_BASE_FAULT_POINT === "after_provision") {
      throw new Error("injected failure after provision");
    }
    const provisionEvidence = {
      schema_version: "property-remediation-a-base-provision-evidence-v1",
      run_id: runId,
      profile_checksum: computeProfileChecksum(profile),
      expected_counts: profile.expected_counts,
      actual_counts: verification.counts,
      physical_file_count: physicalCount,
      track_b_dependency_count: verification.trackBDependencyCount,
      evidence_ids: ["a0-profile", "a0-provision-repeat"],
      migrations: migrationEvidence
    };
    validateProvisionEvidenceContract({
      value: provisionEvidence,
      schema: provisionEvidenceSchema,
      profile
    });
    writeJsonAtomic(
      resolve(runDir, "provision-evidence.json"),
      provisionEvidence
    );
    return {
      runId,
      runDir,
      profileChecksum: computeProfileChecksum(profile),
      trackBDependencyCount: verification.trackBDependencyCount
    };
  } finally {
    const cleanupErrors = [];
    if (fixtureWriteStarted && containerId) {
      const key = `${scope.tenantId}:${scope.parkIds.join(",")}`;
      const latestScope = journal
        .pendingInReverseOrder()
        .find((entry) => entry.resource_type === "fixture_scope");
      if (latestScope) {
        try {
          journal.append({
            resourceType: "fixture_scope",
            resourceKey: key,
            state: "cleanup_pending",
            tenantId: scope.tenantId,
            attempt: latestScope.attempt + 1
          });
          databaseResidual = await exactDatabaseCleanup(containerId, credentials);
          if (process.env.PROPERTY_A_BASE_FAULT_POINT === "during_cleanup") {
            throw new Error("injected failure during cleanup");
          }
          journal.append({
            resourceType: "fixture_scope",
            resourceKey: key,
            state: databaseResidual === 0 ? "cleaned" : "failed",
            tenantId: scope.tenantId,
            attempt: latestScope.attempt + 1,
            error: databaseResidual === 0 ? null : `${databaseResidual} rows remain`
          });
        } catch (error) {
          const current = journal.pendingInReverseOrder().find(
            (entry) =>
              entry.resource_type === "fixture_scope" &&
              entry.resource_key === key
          );
          if (current?.state === "cleanup_pending") {
            journal.append({
              resourceType: "fixture_scope",
              resourceKey: key,
              state: "failed",
              tenantId: scope.tenantId,
              attempt: current.attempt,
              error: error.message
            });
          }
          cleanupErrors.push(error);
        }
      }
    }
    try {
      physicalResidual = cleanupPhysicalFiles(journal);
    } catch (error) {
      cleanupErrors.push(error);
    }
    const containerEntry = journal
      .pendingInReverseOrder()
      .find((entry) => entry.resource_type === "postgres_container");
    if (containerEntry) {
      journal.append({
        resourceType: "postgres_container",
        resourceKey: containerName,
        state: "cleanup_pending",
        attempt: containerEntry.attempt + 1
      });
      try {
        if (!containerId || !volumeName) {
          const inspected = await inspectContainerAsync(containerName, {
            cwd: rootDir
          });
          if (inspected) {
            const exact = assertExactEphemeralPostgresContainer(inspected, {
              containerName,
              databaseName: credentials.database,
              fixtureLabel: "pr192-track-a-base",
              runId,
              expectedImage: OFFICIAL_POSTGRES_IMAGE,
              requireRunning: false
            });
            containerId = exact.containerId;
            volumeName = exact.volumeName;
          }
        }
        if (containerId && volumeName) {
          await removeExactContainer({
            containerId,
            containerName,
            volumeName,
            credentials
          });
        }
        journal.append({
          resourceType: "postgres_container",
          resourceKey: containerName,
          state: "cleaned",
          attempt: containerEntry.attempt + 1
        });
      } catch (error) {
        journal.append({
          resourceType: "postgres_container",
          resourceKey: containerName,
          state: "failed",
          attempt: containerEntry.attempt + 1,
          error: error.message
        });
        cleanupErrors.push(error);
      }
    }
    const cleanupEvidence = {
      schema_version: "property-remediation-a-base-cleanup-evidence-v1",
      database_residual_count: databaseResidual,
      physical_file_residual_count: physicalResidual,
      evidence_ids: ["a0-cleanup", "a0-safety"],
      pending_resources: journal.pendingInReverseOrder().map((entry) => ({
        type: entry.resource_type,
        key: entry.resource_key,
        state: entry.state
      }))
    };
    validateSchema(
      cleanupEvidence,
      cleanupEvidenceSchema,
      "cleanup-evidence"
    );
    writeJsonAtomic(resolve(runDir, "cleanup-evidence.json"), cleanupEvidence);
    if (
      (databaseResidual !== null && databaseResidual !== 0) ||
      (physicalResidual !== null && physicalResidual !== 0) ||
      journal.pendingInReverseOrder().length !== 0
    ) {
      cleanupErrors.push(new Error("A-base cleanup residual is not zero"));
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "A-base cleanup did not complete");
    }
  }
}

async function main() {
  if (!["non-final", "final"].includes(handoffMode)) {
    throw new Error(
      "PROPERTY_A_BASE_HANDOFF_MODE must be non-final or final"
    );
  }
  assertAStubEnvironment({
    runId: outerRunId,
    artifactDir,
    env: process.env,
    rootDir
  });
  assertDedicatedScope({ profile, ...scope });
  verifyPrerequisiteCommits();
  if (handoffMode === "final") {
    assertFinalHandoffSourceState({ rootDir });
  }
  const traceabilityContracts = validateTraceability();
  mkdirSync(artifactDir, { recursive: true });
  const releaseLock = acquireRunLock(
    resolve(artifactDir, "a-base.lock"),
    `${process.pid}\n`,
    {
      recoverStale:
        process.env.PROPERTY_A_BASE_RECONCILE_ONLY === "yes"
    }
  );
  try {
    if (process.env.PROPERTY_A_BASE_RECONCILE_ONLY === "yes") {
      const results = [
        await reconcileSuffix("a"),
        await reconcileSuffix("b")
      ];
      process.stdout.write(
        `${JSON.stringify({
          status: "A-base-core reconciled",
          run_id: outerRunId,
          results,
          residual_count: 0
        })}\n`
      );
      return;
    }
    const first = await provisionOnce("a");
    const second = await provisionOnce("b");
    if (first.profileChecksum !== second.profileChecksum) {
      throw new Error("two isolated provisions produced different profile checksums");
    }
    if (handoffMode === "non-final") {
      process.stdout.write(
        `${JSON.stringify({
          status: "A-base-core non-final provision validated",
          run_id: outerRunId,
          profile_checksum: first.profileChecksum,
          residual_count: 0
        })}\n`
      );
      return;
    }
    const contractPath = resolve(
      rootDir,
      "scripts/e2e/property-remediation/profiles/a-base-v1.json"
    );
    const schemaPath = resolve(
      rootDir,
      "scripts/e2e/property-remediation/contracts/a-base-contract.schema.json"
    );
    const artifactHashes = {};
    for (const path of [
      resolve(first.runDir, "provision-evidence.json"),
      resolve(first.runDir, "cleanup-evidence.json"),
      resolve(second.runDir, "provision-evidence.json"),
      resolve(second.runDir, "cleanup-evidence.json")
    ]) {
      artifactHashes[path.slice(artifactDir.length + 1)] = shaFile(path);
    }
    const actorOraclePath = resolve(
      rootDir,
      "scripts/e2e/property-remediation/roles/a-base-actor-oracle.json"
    );
    const traceabilityPath = resolve(
      rootDir,
      "scripts/e2e/property-remediation/traceability/a-base-requirements.json"
    );
    const evidenceCatalogPath = resolve(
      rootDir,
      "scripts/e2e/property-remediation/traceability/a-base-evidence-catalog.json"
    );
    artifactHashes["source/actor-oracle.json"] = shaFile(actorOraclePath);
    artifactHashes["source/traceability.json"] = shaFile(traceabilityPath);
    artifactHashes["source/evidence-catalog.json"] = shaFile(
      evidenceCatalogPath
    );
    const cleanupJournalHashes = {
      "a/cleanup-manifest.jsonl": shaFile(
        resolve(first.runDir, "cleanup-manifest.jsonl")
      ),
      "b/cleanup-manifest.jsonl": shaFile(
        resolve(second.runDir, "cleanup-manifest.jsonl")
      )
    };
    const currentCommit = assertFinalHandoffSourceState({ rootDir });
    const handoff = {
      schema_version: "property-remediation-a-base-handoff-v1",
      profile: profile.profile,
      profile_checksum: first.profileChecksum,
      generator_sha256: generatorSha256(),
      contract_sha256: shaFile(contractPath),
      schema_sha256: shaFile(schemaPath),
      bootstrap_sha256: prerequisites.bootstrap_handoff_sha256,
      run_ids: [first.runId, second.runId],
      artifact_hashes: artifactHashes,
      cleanup_journal_hashes: cleanupJournalHashes,
      actor_oracle_sha256: shaFile(actorOraclePath),
      traceability_sha256: sha256(
        `${shaFile(traceabilityPath)}:${shaFile(evidenceCatalogPath)}`
      ),
      current_commit: currentCommit,
      environment_guard: prerequisites.environment_guard,
      evidence_ids: [
        "a0-profile",
        "a0-provision-repeat",
        "a0-safety",
        "a0-cleanup",
        "a0-role-contract"
      ],
      residual_count: 0,
      track_b_dependency_count:
        first.trackBDependencyCount + second.trackBDependencyCount
    };
    const missingEvidence = traceabilityContracts.catalog.evidence_ids.filter(
      (evidenceId) => !handoff.evidence_ids.includes(evidenceId)
    );
    if (missingEvidence.length > 0) {
      throw new Error(
        `handoff missing traceability evidence: ${missingEvidence.join(",")}`
      );
    }
    validateHandoffContract({
      value: handoff,
      schema: handoffSchema,
      expected: {
        profileChecksum: computeProfileChecksum(profile),
        generatorSha256: generatorSha256(),
        contractSha256: shaFile(contractPath),
        schemaSha256: shaFile(schemaPath),
        actorOracleSha256: shaFile(actorOraclePath),
        currentCommit,
        artifactHashes,
        cleanupJournalHashes
      }
    });
    const handoffSha = sha256(canonicalize(handoff));
    writeJsonAtomic(resolve(artifactDir, "handoff.json"), {
      ...handoff,
      canonical_sha256: handoffSha
    });
    const summary = {
      schema_version: "property-remediation-a-base-summary-v1",
      status: "A-base-core provisioned",
      run_id: outerRunId,
      profile_checksum: first.profileChecksum,
      fixture_handoff_sha256: handoffSha,
      exact_actor_count: A_BASE_EXACT_ACTORS.length,
      residual_count: 0,
      performance: {
        verdict: "candidate_observation_only",
        pass_threshold_frozen: false
      }
    };
    validateSchema(summary, summarySchema, "summary");
    writeJsonAtomic(resolve(artifactDir, "summary.json"), summary);
    process.stdout.write(
      `${JSON.stringify({
        status: "A-base-core provisioned",
        run_id: outerRunId,
        profile_checksum: first.profileChecksum,
        fixture_handoff_sha256: handoffSha,
        residual_count: 0
      })}\n`
    );
  } finally {
    releaseLock();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interruptedBy = signal;
    abortController.abort();
  });
}

main().catch((error) => {
  process.stderr.write(`[A-base-core] FAIL ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
