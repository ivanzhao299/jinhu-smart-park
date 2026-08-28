#!/usr/bin/env node
/* global console, structuredClone */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BackupRestoreError,
  assertRestoreResourcesRemoved,
  deriveRestoreIdentities,
  planRestoreResources,
  registerPlannedResources,
  removeExactFilesystem,
  validateBackupRestorePreconditions
} from "../hr-cutover/rehearsal-backup-restore.mjs";
import {
  ALLOWED_REHEARSAL_FAULTS,
  FaultInjectionError,
  injectAllowlistedFault,
  validateFaultId
} from "../hr-cutover/rehearsal-fault-injector.mjs";
import {
  BackupRestoreVerificationError,
  buildFileTreeManifest,
  copyFileTree,
  hashCanonical,
  normalizeToc,
  validateBackupRestoreEvidence,
  verifyRestoreEquality
} from "../hr-cutover/verify-rehearsal-restore.mjs";

const root = resolve(import.meta.dirname, "../..");
const sandbox = mkdtempSync(join(tmpdir(), "jinhu-hr-backup-restore-"));
chmodSync(sandbox, 0o700);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const expectCode = (klass, code, operation) => assert.throws(operation, (error) => error instanceof klass && error.code === code, `expected ${code}`);
const mode = (path) => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");

function sampleConfig() {
  const project = "jinhu_hr_migration_lab_full_backup_fixture";
  const runtime = join(sandbox, project, "runtime");
  const evidence = join(runtime, "evidence");
  const files = join(runtime, "files");
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  mkdirSync(files, { recursive: true, mode: 0o700 });
  chmodSync(runtime, 0o700);
  chmodSync(evidence, 0o700);
  chmodSync(files, 0o700);
  return {
    formatVersion: 1,
    runId: "yzfull-20260828T070000Z-f228fb98-rA",
    rehearsal: "A",
    backend: "lab",
    triple: { codeSha: "f".repeat(40), sourceSnapshotHash: "1".repeat(64), mappingContractHash: "2".repeat(64) },
    target: {
      database: project,
      composeProject: project,
      postgresContainer: `${project}-postgres-1`,
      root: runtime,
      evidenceRoot: evidence,
      fileRoot: files
    },
    verification: { factSchema: "hr_cutover_facts_backup_fixture", manifestChainFile: join(evidence, "manifest-chain.json") }
  };
}

function sampleHead(config) {
  return {
    state: "uat_ready",
    parentRunId: config.runId,
    triple: structuredClone(config.triple),
    children: [0, 1, 2, 3, 4, 5].map((index) => ({ domain: `T${index}`, status: "verified" })),
    hardGates: { technicalUat: { status: "PASS", reasonCodes: [] }, restore: { status: "NOT_STARTED", reasonCodes: [] } }
  };
}

function sampleFacts(fileTree) {
  return {
    migrationHistorySha256: "3".repeat(64),
    platformCatalogSha256: "4".repeat(64),
    hrLedgerSha256: "5".repeat(64),
    hrGlobalSha256: "6".repeat(64),
    hrDomainHashes: Object.fromEntries([0, 1, 2, 3, 4, 5].map((index) => [`T${index}`, String(index + 1).repeat(64)])),
    quarantineLedgerSha256: "7".repeat(64),
    sideEffectSha256: "8".repeat(64),
    fileTree,
    faultFixtureSha256: "9".repeat(64)
  };
}

try {
  const schema = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/rehearsal-backup-restore.schema.json"), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.equal(schema.properties.productionRestore.const, "HOLD");
  assert.deepEqual(schema.properties.fault.properties.faultId.enum, [...ALLOWED_REHEARSAL_FAULTS]);

  const config = sampleConfig();
  const identities = deriveRestoreIdentities(config);
  assert.match(identities.database, /^jinhu_hr_migration_lab_full_/);
  assert.notEqual(identities.database, config.target.database);
  assert.notEqual(identities.database, config.target.composeProject);
  assert.match(identities.role, /^[a-z][a-z0-9_]{5,62}$/);
  assert(identities.artifactRoot.startsWith(`${config.target.root}/`));

  const registryPath = join(config.target.evidenceRoot, "resource-registry.json");
  writeFileSync(registryPath, `${JSON.stringify([
    { type: "database", planned: config.target.database, observed: config.target.database, removed: false, residualCount: 0 },
    { type: "container", planned: config.target.postgresContainer, observed: config.target.postgresContainer, removed: false, residualCount: 0 }
  ])}\n`, { mode: 0o600 });
  chmodSync(registryPath, 0o600);
  const resources = planRestoreResources(config, identities);
  assert(resources.some((entry) => entry.type === "database" && entry.planned === identities.database));
  assert(resources.some((entry) => entry.type === "role" && entry.planned === identities.role));
  assert(resources.some((entry) => entry.type === "directory" && entry.planned === identities.artifactRoot));
  assert(resources.every((entry) => entry.observed === null && entry.removed === false && entry.residualCount === 0));
  registerPlannedResources(registryPath, resources);
  const registered = JSON.parse(readFileSync(registryPath, "utf8"));
  assert(resources.every((entry) => registered.some((row) => row.type === entry.type && row.planned === entry.planned)), "all restore resources must be registered before creation");
  expectCode(BackupRestoreError, "RESOURCE_IDENTITY_DUPLICATE", () => registerPlannedResources(registryPath, resources));
  assert.equal(mode(registryPath), "0600");

  const head = sampleHead(config);
  assert.equal(validateBackupRestorePreconditions(config, "uat_ready", head, registered, { dockerProject: config.target.composeProject, publishedHost: "127.0.0.1" }).ok, true);
  const partial = structuredClone(head); partial.children[5].status = "running";
  expectCode(BackupRestoreError, "PARTIAL_RUN", () => validateBackupRestorePreconditions(config, "uat_ready", partial, registered, { dockerProject: config.target.composeProject, publishedHost: "127.0.0.1" }));
  const uatHold = structuredClone(head); uatHold.hardGates.technicalUat.status = "HOLD";
  expectCode(BackupRestoreError, "TECHNICAL_UAT_REQUIRED", () => validateBackupRestorePreconditions(config, "uat_ready", uatHold, registered, { dockerProject: config.target.composeProject, publishedHost: "127.0.0.1" }));
  expectCode(BackupRestoreError, "UNSAFE_DOCKER_ENDPOINT", () => validateBackupRestorePreconditions(config, "uat_ready", head, registered, { dockerProject: config.target.composeProject, publishedHost: "0.0.0.0" }));
  expectCode(BackupRestoreError, "UNSAFE_TARGET_IDENTITY", () => validateBackupRestorePreconditions(config, "uat_ready", head, registered, { dockerProject: "different_project", publishedHost: "127.0.0.1" }));
  const production = structuredClone(config); production.target.database = "jinhu_production";
  expectCode(BackupRestoreError, "UNSAFE_TARGET_IDENTITY", () => deriveRestoreIdentities(production));

  const sourceFiles = join(sandbox, "source-files");
  const backupFiles = join(sandbox, "backup-files");
  const restoredFiles = join(sandbox, "restored-files");
  mkdirSync(join(sourceFiles, "nested"), { recursive: true, mode: 0o700 });
  chmodSync(sourceFiles, 0o700);
  chmodSync(join(sourceFiles, "nested"), 0o700);
  writeFileSync(join(sourceFiles, "alpha.bin"), Buffer.from([0, 1, 2, 3]), { mode: 0o600 });
  writeFileSync(join(sourceFiles, "nested", "beta.txt"), "fixture-only\n", { mode: 0o600 });
  const sourceTree = buildFileTreeManifest(sourceFiles);
  assert.equal(sourceTree.entryCount, 2);
  assert.equal(sourceTree.totalBytes, 17);
  copyFileTree(sourceFiles, backupFiles);
  copyFileTree(backupFiles, restoredFiles);
  assert.deepEqual(buildFileTreeManifest(restoredFiles), sourceTree);
  assert.equal(mode(backupFiles), "0700");
  assert.equal(mode(join(backupFiles, "alpha.bin")), "0600");
  const emptyRoot = join(sandbox, "empty-files"); mkdirSync(emptyRoot, { mode: 0o700 });
  const emptyTree = buildFileTreeManifest(emptyRoot);
  assert.equal(emptyTree.entryCount, 0);
  assert.match(emptyTree.canonicalSha256, /^[0-9a-f]{64}$/);
  symlinkSync(join(sourceFiles, "alpha.bin"), join(sourceFiles, "escape"));
  expectCode(BackupRestoreVerificationError, "FILE_TREE_SYMLINK_DENIED", () => buildFileTreeManifest(sourceFiles));
  rmSync(join(sourceFiles, "escape"));

  const toc = "; Archive created at 2026-08-28 07:00:00 UTC\n;     dbname: ignored\n1; 0 0 TABLE public hr_employee jinhu\n  2; 0 0   TABLE DATA public hr_employee jinhu  \n";
  assert.equal(normalizeToc(toc), "1; 0 0 TABLE public hr_employee jinhu\n2; 0 0 TABLE DATA public hr_employee jinhu\n");

  const before = sampleFacts(sourceTree);
  const equality = verifyRestoreEquality(before, structuredClone(before));
  assert(Object.values(equality).every(Boolean));
  const changed = structuredClone(before); changed.hrGlobalSha256 = "a".repeat(64);
  expectCode(BackupRestoreVerificationError, "RESTORE_HR_CANONICAL_MISMATCH", () => verifyRestoreEquality(before, changed));
  const fileChanged = structuredClone(before); fileChanged.fileTree.canonicalSha256 = "b".repeat(64);
  expectCode(BackupRestoreVerificationError, "RESTORE_FILE_TREE_MISMATCH", () => verifyRestoreEquality(before, fileChanged));

  assert.deepEqual([...ALLOWED_REHEARSAL_FAULTS], ["VERIFY_FIXTURE_ROW_CHANGED", "REGISTERED_FILE_UNREADABLE"]);
  assert.equal(validateFaultId("VERIFY_FIXTURE_ROW_CHANGED"), "VERIFY_FIXTURE_ROW_CHANGED");
  expectCode(FaultInjectionError, "FAULT_NOT_ALLOWLISTED", () => validateFaultId("DROP_MIGRATION_HISTORY"));
  let fixture = "baseline";
  const fixtureFault = injectAllowlistedFault({
    faultId: "VERIFY_FIXTURE_ROW_CHANGED",
    targetIdentity: identities.database,
    mutateFixture: () => { fixture = "changed"; },
    restoreFixture: () => { fixture = "baseline"; },
    detectFixture: () => { if (fixture !== "baseline") throw Object.assign(new Error("mismatch"), { code: "RESTORE_FIXTURE_MISMATCH" }); }
  });
  assert.equal(fixtureFault.status, "DETECTED");
  assert.equal(fixtureFault.reverted, true);
  assert.equal(fixture, "baseline");
  let undetected = "baseline";
  expectCode(FaultInjectionError, "FAULT_NOT_DETECTED", () => injectAllowlistedFault({
    faultId: "VERIFY_FIXTURE_ROW_CHANGED",
    targetIdentity: identities.database,
    mutateFixture: () => { undetected = "changed"; },
    restoreFixture: () => { undetected = "baseline"; },
    detectFixture: () => undefined
  }));
  assert.equal(undetected, "baseline", "fault must be reverted even when the detector is defective");

  const evidence = {
    formatVersion: 1,
    evidenceKind: "yuzhou_hr_rehearsal_backup_restore",
    status: "PASS",
    parentRunId: config.runId,
    rehearsal: "A",
    triple: structuredClone(config.triple),
    target: { composeProject: config.target.composeProject, postgresContainer: config.target.postgresContainer, sourceDatabase: config.target.database, restoreDatabase: identities.database, restoreRole: identities.role },
    backup: {
      format: "pg_dump_custom",
      dump: { relativePath: "backup-restore/database.dump", sha256: "a".repeat(64), bytes: 10, mode: "0600" },
      toc: { relativePath: "backup-restore/database.toc", sha256: "b".repeat(64), bytes: 20, mode: "0600" },
      normalizedTocSha256: "c".repeat(64),
      fileSnapshot: sourceTree
    },
    fault: { faultId: "VERIFY_FIXTURE_ROW_CHANGED", status: "DETECTED", detectorCode: "RESTORE_FIXTURE_MISMATCH", reverted: true, targetIdentitySha256: sha(identities.database) },
    before,
    restored: structuredClone(before),
    equality,
    timing: { clock: "monotonic_plus_utc_epoch_ms", dumpBoundaryEpochMs: 1, restoreStartedEpochMs: 2, verifiedReadyEpochMs: 3, rtoObservedMs: 1, rpoObservedObjects: 0, targetApproval: "UNAPPROVED" },
    security: { directoryMode: "0700", fileMode: "0600", containsSecrets: false, containsPersonalValues: false },
    productionImport: "HOLD",
    productionRestore: "HOLD"
  };
  assert.equal(validateBackupRestoreEvidence(evidence).ok, true);
  const noFault = structuredClone(evidence); noFault.fault.status = "SKIPPED";
  expectCode(BackupRestoreVerificationError, "BACKUP_RESTORE_EVIDENCE_INVALID", () => validateBackupRestoreEvidence(noFault));
  const fakeRpo = structuredClone(evidence); fakeRpo.restored.hrGlobalSha256 = "d".repeat(64);
  expectCode(BackupRestoreVerificationError, "RESTORE_HR_CANONICAL_MISMATCH", () => validateBackupRestoreEvidence(fakeRpo));
  const approvedWithoutOwner = structuredClone(evidence); approvedWithoutOwner.timing.targetApproval = "PASS";
  expectCode(BackupRestoreVerificationError, "BACKUP_RESTORE_EVIDENCE_INVALID", () => validateBackupRestoreEvidence(approvedWithoutOwner));
  const secret = structuredClone(evidence); secret.databasePassword = "not-allowed";
  expectCode(BackupRestoreVerificationError, "BACKUP_RESTORE_EVIDENCE_INVALID", () => validateBackupRestoreEvidence(secret));
  assert.equal(hashCanonical({ b: 2, a: 1 }), hashCanonical({ a: 1, b: 2 }));

  const runnerSource = readFileSync(resolve(root, "scripts/hr-cutover/rehearsal-backup-restore.mjs"), "utf8");
  assert.match(runnerSource, /pg_dump/u);
  assert.match(runnerSource, /"-Fc"/u);
  assert.match(runnerSource, /pg_restore/u);
  assert.match(runnerSource, /--exit-on-error/u);
  assert.match(runnerSource, /--no-owner/u);
  assert.match(runnerSource, /--no-privileges/u);
  assert.doesNotMatch(runnerSource, /production-backup-restore-gate19/u);
  assert.doesNotMatch(runnerSource, /WITH REPLACE|--clean|--create/u);
  assert.doesNotMatch(runnerSource, /productionImport\s*[:=]\s*["'](?:GO|PASS|READY)/u);
  assert.equal(existsSync(join(config.target.root, ".backup-restore.lock")), false, "contract tests must not create runtime locks");
  assert.equal(lstatSync(registryPath).isSymbolicLink(), false);

  mkdirSync(identities.artifactRoot, { mode: 0o700 });
  mkdirSync(identities.backupFilesRoot, { mode: 0o700 });
  mkdirSync(identities.restoredFilesRoot, { mode: 0o700 });
  for (const file of [identities.dumpFile, identities.tocFile, identities.normalizedTocFile, identities.summaryFile, identities.lockFile, identities.faultProbeFile]) writeFileSync(file, "fixture\n", { mode: 0o600 });
  const unrelated = join(config.target.fileRoot, "unrelated-preserved.txt"); writeFileSync(unrelated, "keep\n", { mode: 0o600 });
  const failedRows = JSON.parse(readFileSync(registryPath, "utf8"));
  for (const row of failedRows) {
    if (row.type === "database" && row.planned === identities.database) Object.assign(row, { observed: identities.database, removed: true, residualCount: 0 });
    if (row.type === "role" && row.planned === identities.role) Object.assign(row, { observed: identities.role, removed: true, residualCount: 0 });
    if (existsSync(row.planned)) row.observed = row.planned;
  }
  writeFileSync(registryPath, `${JSON.stringify(failedRows)}\n`, { mode: 0o600 }); chmodSync(registryPath, 0o600);
  removeExactFilesystem(registryPath, identities);
  assert.equal(assertRestoreResourcesRemoved(registryPath, identities).residualCount, 0);
  assert.equal(existsSync(identities.artifactRoot), false, "failed restore artifacts must be removed exactly");
  assert.equal(existsSync(unrelated), true, "failure cleanup must preserve unregistered unrelated files");

  console.log("Yuzhou full-domain backup/restore/fault contract passed (negative gates, canonical equality, 0700/0600 and HOLD)." );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
