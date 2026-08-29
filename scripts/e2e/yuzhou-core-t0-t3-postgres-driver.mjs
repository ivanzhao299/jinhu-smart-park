/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { buildJobStateV2Fixture } from "./yuzhou-job-state-v2-fixture.mjs";
import { validateCoreT0T3Config } from "../hr-cutover/core-t0-t3-rehearsal.mjs";
import { buildCoreT0T3MaterializationSql, buildMaterializationSql } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { computeCoreT0T3MappingContractHash, createCoreT0T3Adapters } from "../hr-cutover/core-drivers/postgres-lab-v1.mjs";
import { prepareCoreConfig } from "../hr-cutover/prepare-core-t0-t3-rehearsal.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { sealCoreDictionaryCapture } from "../hr-cutover/capture-yuzhou-core-dictionary-receipt.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const fixture = buildJobStateV2Fixture();
const sha = value => createHash("sha256").update(value).digest("hex");
const readOnlyAuthority = { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false };

function writeReceipt(path, sourceSnapshotSha256, bytes) {
  const receipt = sealSourceRestoreReceipt({
    formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256,
    backup: { sha256: sourceSnapshotSha256, bytes, containerCopySha256: sourceSnapshotSha256, containerCopyBytes: bytes },
    identities: { containerSha256: sha("container"), imageSha256: sha("image"), databaseSha256: sha("database"), restoreSha256: sha("restore"), catalogSha256: sha("catalog") },
    state: { online: true, readOnly: true }, etlAuthority: readOnlyAuthority, productionImport: "HOLD"
  });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); chmodSync(path, 0o600);
}

function sourceRows(dictionaryCode) {
  if (dictionaryCode === "employment_event_state") return [{ sourceValue: "fixture-a", usageCount: 6000 }, { sourceValue: "fixture-b", usageCount: 887 }];
  if (dictionaryCode === "contract_state") return [{ sourceValue: "fixture-a", usageCount: 800 }, { sourceValue: "fixture-b", usageCount: 2 }];
  return ["a", "b", "c", "d"].map(value => ({ typeCode: value, typeName: `fixture-${value}` }));
}

function dictionaryCaptureReceipt(sourceSnapshotSha256) {
  const eventStates = sourceRows("employment_event_state"), contractTypes = sourceRows("contract_type"), contractStates = sourceRows("contract_state");
  return sealCoreDictionaryCapture({
    formatVersion: 1, artifactKind: "yuzhou_core_dictionary_capture_receipt", sourceSnapshotSha256,
    dictionaries: {
      employment_event_state: { sourceObject: "dbo.readjust.state", sourceRecordCount: 6887, sourceDistinctValueCount: 2, sourceItemsSha256: sha(`${JSON.stringify(eventStates)}\n`) },
      contract_type: { sourceObject: "dbo.compacttypecode", sourceRecordCount: 4, sourceDistinctValueCount: 4, sourceItemsSha256: sha(`${JSON.stringify(contractTypes)}\n`) },
      contract_state: { sourceObject: "dbo.compact.state", sourceRecordCount: 802, sourceDistinctValueCount: 2, sourceItemsSha256: sha(`${JSON.stringify(contractStates)}\n`) }
    },
    productionImport: "HOLD"
  });
}

function genericPackage(dictionaryCode, sourceSnapshotSha256, captureReceipt) {
  const capture = captureReceipt.dictionaries[dictionaryCode];
  const decisions = sourceRows(dictionaryCode).map(row => ({
    sourceValue: row.sourceValue ?? row.typeCode,
    sourceName: row.typeName ?? null,
    usageCount: row.usageCount ?? 1,
    decision: "map",
    targetDomain: dictionaryCode,
    targetValue: "fixture_target",
    reasonCode: "FIXTURE_MACHINE_REVIEWED"
  }));
  return {
    formatVersion: 1, artifactKind: "yuzhou_hr_dictionary_machine_decision", sourceSystem: "yuzhou-v10",
    sourceSnapshotSha256, sourceCaptureSha256: captureReceipt.captureSha256, dictionaryCode, sourceObject: capture.sourceObject, sourceRecordCount: capture.sourceRecordCount,
    decisions,
    productionImport: "HOLD"
  };
}

function writeDictionaryPackages(root, sourceSnapshotSha256) {
  const captureReceipt = dictionaryCaptureReceipt(sourceSnapshotSha256);
  const event = {
    formatVersion: 1, artifactKind: "yuzhou_t1_employment_event_type_machine_decision", sourceSystem: "yuzhou-v10",
    sourceSnapshotSha256, dictionaryCode: "employment_event_type", sourceTable: "dbo.readjust.readjusttype", sourceRecordCount: 6887,
    decisions: [["就职", 2890, "start_probation"], ["调职", 1746, "transfer"], ["离职", 1962, "depart"], ["复职", 289, "resume"]]
      .map(([sourceValue, usageCount, targetValue]) => ({ sourceValue, usageCount, decision: "map", targetDomain: "employment_event_type", targetValue, reasonCode: "ONLINE_LIFECYCLE_EQUIVALENT" })),
    productionImport: "HOLD"
  };
  const packages = {
    eventTypePackage: event,
    eventStatePackage: genericPackage("employment_event_state", sourceSnapshotSha256, captureReceipt),
    contractTypePackage: genericPackage("contract_type", sourceSnapshotSha256, captureReceipt),
    contractStatePackage: genericPackage("contract_state", sourceSnapshotSha256, captureReceipt)
  };
  const paths = {};
  for (const [key, value] of Object.entries(packages)) {
    paths[key] = join(root, `${key}.json`);
    writeFileSync(paths[key], `${JSON.stringify(value)}\n`, { mode: 0o600 });
    chmodSync(paths[key], 0o600);
  }
  paths.dictionaryCaptureReceipt = join(root, "dictionary-capture-receipt.json");
  writeFileSync(paths.dictionaryCaptureReceipt, `${JSON.stringify(captureReceipt)}\n`, { mode: 0o600 });
  chmodSync(paths.dictionaryCaptureReceipt, 0o600);
  return paths;
}

test("core SQL helper changes exactly one full-lab guard and leaves the full builder byte-stable", () => {
  const fullBefore = buildMaterializationSql(fixture.decision, fixture.payload, fixture.attestation);
  const fullAfter = buildMaterializationSql(fixture.decision, fixture.payload, fixture.attestation);
  const core = buildCoreT0T3MaterializationSql(fixture.decision, fixture.payload, fixture.attestation);
  assert.equal(fullAfter, fullBefore);
  assert.equal(fullBefore.split("^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$").length - 1, 1);
  assert.equal(fullBefore.includes("jinhu_hr_migration_lab_core_"), false);
  assert.equal(core.split("^jinhu_hr_migration_lab_core_[a-z0-9_]{6,40}$").length - 1, 1);
  assert.equal(core.includes("jinhu_hr_migration_lab_full_"), false);
  assert.equal(/jinhu[_-]smart[_-]park|park\.cnjinhu\.com/iu.test(core), false);
});

test("prepare emits an exact core driver config with a deterministic named network and private source boundary", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "yzcore-driver-")), controlRoot = join(sandbox, "control");
  mkdirSync(controlRoot, { mode: 0o700 }); chmodSync(controlRoot, 0o700);
  const sourceBackup = join(sandbox, "source.bak"), sourceRestoreReceipt = join(sandbox, "source-receipt.json"), etlEnv = join(sandbox, "etl.env");
  writeFileSync(sourceBackup, "fixed-read-only-source", { mode: 0o600 }); chmodSync(sourceBackup, 0o600);
  writeReceipt(sourceRestoreReceipt, sha(readFileSync(sourceBackup)), readFileSync(sourceBackup).length);
  const packages = writeDictionaryPackages(sandbox, sha(readFileSync(sourceBackup)));
  writeFileSync(etlEnv, "YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_driver01\nYUZHOU_SQLSERVER_ETL_LOGIN=etl_reader\nYUZHOU_SQLSERVER_ETL_PASSWORD=synthetic-fixture-only\n", { mode: 0o600 }); chmodSync(etlEnv, 0o600);
  const prepared = prepareCoreConfig({
    rehearsal: "A", suffix: "driver01", postgresPort: 33100, apiPort: 33101, webPort: 33102,
    controlRoot, etlEnv, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", sourceBackup, sourceRestoreReceipt,
    machineAttestationRoot: "a".repeat(64), ...packages
  }, { codeSha: "1".repeat(40), mappingContractHash: computeCoreT0T3MappingContractHash() });
  assert.equal(prepared.config.target.network, `${prepared.project}_default`);
  assert.equal(prepared.config.target.container, `${prepared.project}-postgres-1`);
  assert.equal(prepared.config.source.databaseAlias, "YuzhouHR_Lab_driver01");
  assert.equal(prepared.config.source.sourceBackupPath, realpathSync(sourceBackup));
  assert.deepEqual(Object.keys(prepared.config.source.dictionaryPackages).sort(), ["contract_state", "contract_type", "employment_event_state", "employment_event_type"]);
  assert.equal(prepared.config.productionImport, "HOLD");
  assert.equal(validateCoreT0T3Config(prepared.config).profile, "core_t0_t3");
  const legacyShape = structuredClone(prepared.config);
  legacyShape.source = { readOnly: true, sourceBackupSha256: legacyShape.triple.sourceSnapshotHash };
  assert.throws(() => validateCoreT0T3Config(legacyShape), /CORE_SOURCE_INVALID/u);
  const driftedNetwork = structuredClone(prepared.config); driftedNetwork.target.network = `${prepared.project}_other`;
  assert.throws(() => validateCoreT0T3Config(driftedNetwork), /CORE_TARGET_INVALID/u);
  const captureDrift = JSON.parse(readFileSync(packages.contractStatePackage, "utf8"));
  captureDrift.sourceCaptureSha256 = "f".repeat(64);
  writeFileSync(packages.contractStatePackage, `${JSON.stringify(captureDrift)}\n`, { mode: 0o600 });
  chmodSync(packages.contractStatePackage, 0o600);
  assert.throws(() => prepareCoreConfig({
    rehearsal: "B", suffix: "driver02", postgresPort: 33103, apiPort: 33104, webPort: 33105,
    controlRoot, etlEnv, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", sourceBackup, sourceRestoreReceipt,
    machineAttestationRoot: "b".repeat(64), ...packages
  }, { codeSha: "2".repeat(40), mappingContractHash: computeCoreT0T3MappingContractHash() }), /CORE_DICTIONARY_CAPTURE_BINDING_INVALID/u);
  const sourceValueDrift = genericPackage("contract_state", prepared.config.triple.sourceSnapshotHash, dictionaryCaptureReceipt(prepared.config.triple.sourceSnapshotHash));
  sourceValueDrift.decisions[0].sourceValue = "other-source-value";
  writeFileSync(packages.contractStatePackage, `${JSON.stringify(sourceValueDrift)}\n`, { mode: 0o600 });
  chmodSync(packages.contractStatePackage, 0o600);
  assert.throws(() => prepareCoreConfig({
    rehearsal: "B", suffix: "driver03", postgresPort: 33106, apiPort: 33107, webPort: 33108,
    controlRoot, etlEnv, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", sourceBackup, sourceRestoreReceipt,
    machineAttestationRoot: "b".repeat(64), ...packages
  }, { codeSha: "2".repeat(40), mappingContractHash: computeCoreT0T3MappingContractHash() }), /CORE_DICTIONARY_CAPTURE_BINDING_INVALID/u);
  writeFileSync(packages.contractStatePackage, `${JSON.stringify({
    ...genericPackage("contract_state", prepared.config.triple.sourceSnapshotHash, dictionaryCaptureReceipt(prepared.config.triple.sourceSnapshotHash)), productionImport: "GO"
  })}\n`, { mode: 0o600 });
  chmodSync(packages.contractStatePackage, 0o600);
  assert.throws(() => prepareCoreConfig({
    rehearsal: "B", suffix: "driver04", postgresPort: 33109, apiPort: 33110, webPort: 33111,
    controlRoot, etlEnv, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", sourceBackup, sourceRestoreReceipt,
    machineAttestationRoot: "b".repeat(64), ...packages
  }, { codeSha: "2".repeat(40), mappingContractHash: computeCoreT0T3MappingContractHash() }), /CORE_DICTIONARY_PACKAGE_INVALID/u);
});

test("committed PostgreSQL driver rejects T4/T5 and fails closed when T1/T2 dictionary materialization is absent", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "yzcore-driver-gates-")), database = "jinhu_hr_migration_lab_core_gates01";
  const credentialRoot = join(sandbox, database, "credentials"), auditRoot = join(sandbox, database, "audit"), runtimeRoot = join(sandbox, database, "runtime"), etlEnvFile = join(credentialRoot, "etl.env"), sourceBackupPath = join(sandbox, "source.bak"), sourceRestoreReceiptPath = join(sandbox, "source-receipt.json");
  for (const directory of [credentialRoot, auditRoot]) { mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700); }
  writeFileSync(etlEnvFile, "YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_driver01\n", { mode: 0o600 }); chmodSync(etlEnvFile, 0o600);
  writeFileSync(sourceBackupPath, "fixed-source", { mode: 0o600 }); chmodSync(sourceBackupPath, 0o600);
  const sourceSnapshotHash = createHash("sha256").update(readFileSync(sourceBackupPath)).digest("hex");
  writeReceipt(sourceRestoreReceiptPath, sourceSnapshotHash, readFileSync(sourceBackupPath).length);
  const sourceRestoreReceiptSha256 = sha(readFileSync(sourceRestoreReceiptPath));
  const config = {
    formatVersion: 1, profile: "core_t0_t3", runId: `yzcore-20260829T000000Z-${"1".repeat(8)}-rA`, rehearsal: "A",
    triple: { codeSha: "1".repeat(40), sourceSnapshotHash, mappingContractHash: computeCoreT0T3MappingContractHash() },
    source: { readOnly: true, sourceBackupSha256: sourceSnapshotHash, sourceBackupPath, sourceRestoreReceiptPath, sourceRestoreReceiptSha256, databaseAlias: "YuzhouHR_Lab_driver01", etlEnvFile, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", dictionaryPackages: null, dictionaryCaptureReceipt: null },
    machineAttestation: { checkpointVersion: 2, trustedRootSha256: "3".repeat(64) },
    target: { database, composeProject: database, container: `${database}-postgres-1`, network: `${database}_default`, volume: `${database}_postgres_data`, role: `${database}_operator`, accountNamespace: `${database}_accounts`, ports: { postgres: 33200, api: 33201, web: 33202 }, runtimeRoot, stagingRoot: join(runtimeRoot, "staging"), evidenceRoot: join(runtimeRoot, "evidence"), credentialRoot },
    productionImport: "HOLD"
  };
  const sourceReceiptProbe = { inspectLive: () => ({
    containerIdentity: "container", imageIdentity: "image", databaseIdentity: "database", restoreIdentity: "restore", catalogIdentity: "catalog",
    project: "jinhu_yuzhou_migration_lab", healthy: true, online: true, readOnly: true, etlAuthority: readOnlyAuthority
  }) };
  const commands = [];
  const adapters = await createCoreT0T3Adapters(config, { commandRunner: (...args) => {
    commands.push(args);
    if (args[0] === "docker" && args[1]?.[0] === "inspect") return database;
    return "";
  }, sourceReceiptProbe });
  assert.throws(() => adapters.executePhase({ domain: "T4", phase: "extract" }), /CORE_FORBIDDEN_DOMAIN_REACHABLE/u);
  assert.doesNotThrow(() => adapters.executePhase({ domain: "T0", phase: "extract" }));
  assert.equal(commands.length, 1);
  assert.throws(() => adapters.executePhase({ domain: "T1", phase: "load" }), /CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED/u);
  assert.throws(() => adapters.executePhase({ domain: "T2", phase: "load" }), /CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED/u);
  assert.throws(() => adapters.materializeFacts(), /CORE_BUSINESS_CANONICAL_FACTS_REQUIRED/u);
  const source = readFileSync(resolve(ROOT, "scripts/hr-cutover/core-drivers/postgres-lab-v1.mjs"), "utf8");
  assert.match(source, /maxBuffer: 64 \* 1024 \* 1024/u);
  assert.match(source, /networks:\\n {6}- migration/u);
  assert.match(source, /name: \$\{config\.target\.network\}/u);
  assert.match(source, /materializeCoreNonT0Dictionaries/u);
  assert.doesNotMatch(source, /CORE_NON_T0_DICTIONARY_ATTESTATIONS_REQUIRED/u);
  assert.doesNotMatch(source, /production-import|production_import|hr_payroll_legacy/u);
});

test("core provision rejects missing four-dictionary preflight before creating resources", async () => {
  const source = readFileSync(resolve(ROOT, "scripts/hr-cutover/core-drivers/postgres-lab-v1.mjs"), "utf8");
  const provision = source.slice(source.indexOf("function provision("), source.indexOf("function cleanup("));
  const preflight = source.slice(source.indexOf("function assertCoreDictionaryPreflight("), source.indexOf("function stagingDirectory("));
  assert.match(preflight, /verifyCoreDictionaryCaptureBinding/);
  assert.match(provision, /assertCoreDictionaryPreflight/);
  assert.ok(provision.indexOf("assertCoreDictionaryPreflight") < provision.indexOf("existsSync(config.target.runtimeRoot)"));
});
