/* global structuredClone */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CORE_DOMAIN_ORDER,
  CORE_RESIDUAL_CLASSES,
  CoreT0T3FileJournal,
  CoreT0T3Lifecycle,
  compareCoreT0T3Facts,
  runCoreT0T3Pair,
  sealCoreT0T3Facts,
  validateCorePairIsolation,
  validateCoreT0T3Config
} from "../hr-cutover/core-t0-t3-rehearsal.mjs";
import { buildJobStateV2Fixture, digest } from "./yuzhou-job-state-v2-fixture.mjs";
import { executeCoreT0T3PairFromFiles } from "../hr-cutover/core-t0-t3-pair-runner.mjs";
import { canonicalDecisionHash, canonicalEvidenceIndexHash } from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";
import { canonicalHash } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { compileYuzhouJobStateMachineAttestation, computeYuzhouJobStateCheckpointArtifactHash, computeYuzhouJobStateCheckpointRoot } from "../hr-cutover/yuzhou-job-state-machine-attestation.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";

const fixture = buildJobStateV2Fixture();
const triple = fixture.config.triple;
function reanchorFixture(source, trustedRootSha256) {
  const checkpoint = structuredClone(source.checkpoint);
  checkpoint.trustedCheckpointRootSha256 = trustedRootSha256;
  checkpoint.decisionArtifact.expectedCheckpointRootSha256 = trustedRootSha256;
  checkpoint.decisionArtifact.checkpointRootSha256 = trustedRootSha256;
  checkpoint.decisionArtifact.evidenceIndex.checkpointSha256 = trustedRootSha256;
  checkpoint.decisionArtifact.evidenceIndexSha256 = canonicalEvidenceIndexHash(checkpoint.decisionArtifact.evidenceIndex);
  checkpoint.decisionArtifact.canonicalDecisionSha256 = canonicalDecisionHash(checkpoint.decisionArtifact);
  checkpoint.privatePayload.canonicalDecisionSha256 = checkpoint.decisionArtifact.canonicalDecisionSha256;
  checkpoint.privatePayload.payloadSha256 = canonicalHash(Object.fromEntries(Object.entries(checkpoint.privatePayload).filter(([key]) => key !== "payloadSha256")));
  checkpoint.bindings.decisionArtifactSha256 = computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", checkpoint.decisionArtifact);
  checkpoint.bindings.privatePayloadArtifactSha256 = computeYuzhouJobStateCheckpointArtifactHash("private_payload", checkpoint.privatePayload);
  checkpoint.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
  return { decision: checkpoint.decisionArtifact, payload: checkpoint.privatePayload, attestation: compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: trustedRootSha256 }), checkpoint, trustedRootSha256 };
}
const fixtureB = reanchorFixture(fixture, "e".repeat(64));
const root = mkdtempSync(join(tmpdir(), "yzcore-contract-"));
const sourceBackupPath = join(root, "source.bak");
writeFileSync(sourceBackupPath, "fixed-source", { mode: 0o600 }); chmodSync(sourceBackupPath, 0o600);
const sourceRestoreReceiptPath = join(root, "source-restore-receipt.json");
const sourceRestoreReceipt = sealSourceRestoreReceipt({
  formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: triple.sourceSnapshotHash,
  backup: { sha256: triple.sourceSnapshotHash, bytes: readFileSync(sourceBackupPath).length, containerCopySha256: triple.sourceSnapshotHash, containerCopyBytes: readFileSync(sourceBackupPath).length },
  identities: { containerSha256: digest("container"), imageSha256: digest("image"), databaseSha256: digest("database"), restoreSha256: digest("restore"), catalogSha256: digest("catalog") },
  state: { online: true, readOnly: true },
  etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false },
  productionImport: "HOLD"
});
writeFileSync(sourceRestoreReceiptPath, `${JSON.stringify(sourceRestoreReceipt, null, 2)}\n`, { mode: 0o600 }); chmodSync(sourceRestoreReceiptPath, 0o600);
const sourceRestoreReceiptSha256 = digest(readFileSync(sourceRestoreReceiptPath));
const project = suffix => `jinhu_hr_migration_lab_core_${suffix}`;
const config = (rehearsal, suffix, basePort) => {
  const database = project(suffix), runtimeRoot = join(root, database, "runtime"), credentialRoot = join(root, database, "credentials");
  mkdirSync(credentialRoot, { recursive: true, mode: 0o700 }); chmodSync(credentialRoot, 0o700);
  const etlEnvFile = join(credentialRoot, "etl.env");
  writeFileSync(etlEnvFile, "YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_fixture01\n", { flag: "wx", mode: 0o600 }); chmodSync(etlEnvFile, 0o600);
  return {
    formatVersion: 1,
    profile: "core_t0_t3",
    runId: `yzcore-20260829T000000Z-${triple.codeSha.slice(0, 8)}-r${rehearsal}`,
    rehearsal,
    triple,
    source: {
      readOnly: true,
      sourceBackupSha256: triple.sourceSnapshotHash,
      sourceBackupPath,
      sourceRestoreReceiptPath,
      sourceRestoreReceiptSha256,
      databaseAlias: "YuzhouHR_Lab_fixture01",
      etlEnvFile,
      sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1",
      // Lifecycle-only fixtures do not provision resources; the live driver
      // separately rejects this null placeholder before resource creation.
      dictionaryPackages: null
    },
    machineAttestation: { checkpointVersion: 2, trustedRootSha256: rehearsal === "A" ? fixture.trustedRootSha256 : fixtureB.trustedRootSha256 },
    target: {
      database,
      composeProject: database,
      container: `${database}-postgres-1`,
      network: `${database}_default`,
      volume: `${database}_postgres_data`,
      role: `${database}_operator`,
      accountNamespace: `${database}_accounts`,
      ports: { postgres: basePort, api: basePort + 1, web: basePort + 2 },
      runtimeRoot,
      stagingRoot: join(runtimeRoot, "staging"),
      evidenceRoot: join(runtimeRoot, "evidence"),
      credentialRoot
    },
    productionImport: "HOLD"
  };
};
const configA = config("A", "alpha001", 32100), configB = config("B", "bravo001", 32200);
const machinePackage = { decision: fixture.decision, privatePayload: fixture.payload, machineAttestation: fixture.attestation };
const machinePackageB = { decision: fixtureB.decision, privatePayload: fixtureB.payload, machineAttestation: fixtureB.attestation };
const pairedMachinePackage = (base, label, offset, trustedRootSha256) => ({ ...base, root: join(root, `pair-machine-${label}`), identities: [0, 1, 2].map(index => `dev:${offset + index}`), verified: { machineEvidenceRootSha256: trustedRootSha256 } });

const factsFor = current => sealCoreT0T3Facts({
  formatVersion: 1,
  profile: "core_t0_t3",
  runId: current.runId,
  rehearsal: current.rehearsal,
  triple: current.triple,
  domains: CORE_DOMAIN_ORDER.map((domain, index) => ({
    domain,
    source: 10 + index,
    loaded: 8 + index,
    quarantined: 1,
    approvedIgnored: 1,
    canonicalSha256: digest(`canonical-${domain}`),
    quarantineReasonSha256: digest(`quarantine-${domain}`)
  })),
  sideEffectViolationCount: 0,
  productionImport: "HOLD"
});

function harness(current, { failOnce, journal, cleanupFails = false, residualClass } = {}) {
  const calls = [], failed = new Set();
  const lifecycle = new CoreT0T3Lifecycle(current, {
    provisionResources() { calls.push("provision"); return { status: "verified", productionImport: "HOLD" }; },
    executePhase({ domain, phase }) {
      calls.push(`${phase}:${domain}`);
      if (failOnce === `${phase}:${domain}` && !failed.has(failOnce)) { failed.add(failOnce); throw new Error("injected crash"); }
      return { domain, phase, status: "verified", productionImport: "HOLD" };
    },
    materializeMachinePackage() { calls.push("machine:T0"); return { status: "verified", productionImport: "HOLD" }; },
    materializeFacts() { calls.push("facts"); return factsFor(current); },
    cleanupResources() { calls.push("cleanup"); return { status: cleanupFails ? "failed" : "verified", productionImport: "HOLD" }; },
    probeResiduals() { calls.push("residuals"); return CORE_RESIDUAL_CLASSES.map(kind => ({ class: kind, removed: kind !== residualClass, residualCount: kind === residualClass ? 1 : 0 })); },
    journal
  });
  return { lifecycle, calls };
}

test("core config and pair accept only isolated A/B resources with byte-identical C/S/M", () => {
  assert.equal(validateCoreT0T3Config(configA).productionImport, "HOLD");
  assert.equal(validateCorePairIsolation(configA, configB).resourceClasses, 12);
  const reused = structuredClone(configB); reused.target.ports.postgres = configA.target.ports.postgres;
  assert.throws(() => validateCorePairIsolation(configA, reused), /CORE_PAIR_RESOURCE_REUSE/u);
  const drift = structuredClone(configB); drift.triple.mappingContractHash = digest("drift");
  assert.throws(() => validateCorePairIsolation(configA, drift), /CORE_PAIR_TRIPLE_MISMATCH/u);
  const rootReuse = structuredClone(configB); rootReuse.machineAttestation.trustedRootSha256 = configA.machineAttestation.trustedRootSha256;
  assert.throws(() => validateCorePairIsolation(configA, rootReuse), /CORE_PAIR_TRUST_ROOT_REUSE/u);
  const pathReuse = structuredClone(configA); pathReuse.target.evidenceRoot = pathReuse.target.stagingRoot;
  assert.throws(() => validateCoreT0T3Config(pathReuse), /CORE_TARGET_INVALID/u);
  const credentialOverlap = structuredClone(configA); credentialOverlap.target.credentialRoot = join(credentialOverlap.target.runtimeRoot, "credentials");
  assert.throws(() => validateCoreT0T3Config(credentialOverlap), /CORE_TARGET_INVALID/u);
});

test("lifecycle is a fixed T0-T3 prefix, v2 machine gate, T3-T0 rollback and 13-class cleanup", () => {
  const { lifecycle, calls } = harness(configA);
  lifecycle.provision();
  const checkpoint = lifecycle.extract();
  assert.equal(checkpoint.state, "review_hold");
  assert.equal(checkpoint.checkpointVersion, 2);
  assert.deepEqual(calls.filter(value => value.startsWith("extract:")), CORE_DOMAIN_ORDER.map(domain => `extract:${domain}`));
  const resumed = lifecycle.resume(machinePackage);
  assert.equal(resumed.state, "rollback_ready");
  lifecycle.rollback();
  const cleanup = lifecycle.cleanup();
  assert.deepEqual(calls.filter(value => value.startsWith("load:")), CORE_DOMAIN_ORDER.map(domain => `load:${domain}`));
  assert.deepEqual(calls.filter(value => value.startsWith("rollback:")), ["T3", "T2", "T1", "T0"].map(domain => `rollback:${domain}`));
  assert.equal(calls.filter(value => value === "machine:T0").length, 1);
  assert.deepEqual(cleanup, { state: "cleaned", residualCount: 0, residualClasses: 13, productionImport: "HOLD" });
  assert.equal(lifecycle.events.some(row => /T4|T5/u.test(JSON.stringify(row))), false);
});

test("crash replay resumes without repeating verified phases or machine materialization", () => {
  const { lifecycle, calls } = harness(configA, { failOnce: "load:T2" });
  lifecycle.provision(); lifecycle.extract();
  assert.throws(() => lifecycle.resume(machinePackage), /injected crash/u);
  assert.equal(lifecycle.state, "loading");
  lifecycle.resume(machinePackage);
  assert.equal(calls.filter(value => value === "machine:T0").length, 1);
  assert.equal(calls.filter(value => value === "load:T0").length, 1);
  assert.equal(calls.filter(value => value === "load:T1").length, 1);
  assert.equal(calls.filter(value => value === "load:T2").length, 2);
});

test("0600 append-only journal reconstructs a new lifecycle after process-style interruption", () => {
  chmodSync(configA.target.credentialRoot, 0o700);
  const journalPath = join(configA.target.credentialRoot, "core-lifecycle.jsonl");
  const journal = new CoreT0T3FileJournal(journalPath, configA);
  const first = harness(configA, { failOnce: "load:T2", journal });
  first.lifecycle.provision(); first.lifecycle.extract();
  assert.throws(() => first.lifecycle.resume(machinePackage), /injected crash/u);
  const second = harness(configA, { journal });
  assert.equal(second.lifecycle.state, "loading");
  second.lifecycle.resume(machinePackage);
  assert.equal(second.lifecycle.state, "rollback_ready");
  assert.equal(second.calls.includes("load:T0"), false);
  assert.equal(second.calls.includes("load:T1"), false);
  assert.equal(second.calls.filter(value => value === "machine:T0").length, 0);
  const rows = readFileSync(journalPath, "utf8").trim().split("\n").map(JSON.parse);
  rows[2].state = "cleaned";
  writeFileSync(journalPath, `${rows.map(JSON.stringify).join("\n")}\n`, { mode: 0o600 });
  assert.throws(() => new CoreT0T3FileJournal(journalPath, configA).read(), /CORE_JOURNAL_TAMPERED/u);
});

test("facts fail on conservation drift, T4 injection, canonical mismatch and A/B mismatch", () => {
  const invalid = structuredClone(factsFor(configA));
  const body = Object.fromEntries(Object.entries(invalid).filter(([key]) => !["globalCanonicalSha256", "quarantineLedgerSha256", "factsSha256"].includes(key)));
  body.domains[0].loaded += 1;
  assert.throws(() => sealCoreT0T3Facts(body), /CORE_FACTS_CONSERVATION_FAILED/u);
  const withT4 = structuredClone(body); withT4.domains = [...factsFor(configA).domains, { ...factsFor(configA).domains[0], domain: "T4" }];
  assert.throws(() => sealCoreT0T3Facts(withT4), /CORE_FACTS_DOMAIN_ORDER_INVALID/u);
  const factsA = factsFor(configA), originalFactsB = factsFor(configB);
  const factsBBody = Object.fromEntries(Object.entries(originalFactsB).filter(([key]) => !["globalCanonicalSha256", "quarantineLedgerSha256", "factsSha256"].includes(key)));
  factsBBody.domains[1].canonicalSha256 = digest("different");
  const factsB = sealCoreT0T3Facts(factsBBody);
  assert.throws(() => compareCoreT0T3Facts(factsA, factsB), /CORE_PAIR_FACTS_MISMATCH/u);
  const sharedTamperA = factsFor(configA), sharedTamperB = factsFor(configB);
  sharedTamperA.domains[0].canonicalSha256 = digest("shared-tamper"); sharedTamperB.domains[0].canonicalSha256 = digest("shared-tamper");
  assert.throws(() => compareCoreT0T3Facts(sharedTamperA, sharedTamperB), /CORE_FACTS_BINDING_MISMATCH/u);
});

test("pair runs both isolated cores, compares facts, reverses B then A and leaves zero residual", () => {
  const a = harness(configA), b = harness(configB);
  const result = runCoreT0T3Pair({ lifecycleA: a.lifecycle, lifecycleB: b.lifecycle, machinePackageA: pairedMachinePackage(machinePackage, "A", 10, fixture.trustedRootSha256), machinePackageB: pairedMachinePackage(machinePackageB, "B", 20, fixtureB.trustedRootSha256) });
  assert.equal(result.status, "CONTRACT_PASS");
  assert.equal(result.executionStatus, "SPEC_FROZEN");
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.cleanups.length, 2);
  assert.equal(a.lifecycle.state, "cleaned");
  assert.equal(b.lifecycle.state, "cleaned");
});

test("nonzero or missing residual class cannot produce PASS", () => {
  const { lifecycle } = harness(configA);
  lifecycle.provision(); lifecycle.extract(); lifecycle.resume(machinePackage); lifecycle.rollback();
  lifecycle.adapters.probeResiduals = () => CORE_RESIDUAL_CLASSES.map(kind => ({ class: kind, removed: kind !== "business_row", residualCount: kind === "business_row" ? 1 : 0 }));
  assert.throws(() => lifecycle.cleanup(), /CORE_RESIDUAL_NONZERO/u);
});

test("recovery reverses only completed loads in T3-to-T0 order before cleanup", () => {
  const { lifecycle, calls } = harness(configB, { failOnce: "load:T2" });
  lifecycle.provision(); lifecycle.extract();
  assert.throws(() => lifecycle.resume(machinePackageB), /injected crash/u);
  const result = lifecycle.recover();
  assert.equal(result.state, "cleaned");
  assert.deepEqual(calls.filter(value => value.startsWith("rollback:")), ["rollback:T1", "rollback:T0"]);
  assert(calls.indexOf("rollback:T0") < calls.indexOf("cleanup"));
});

test("recovery cleanup or residual failure remains fail closed", () => {
  const cleanup = harness(configB, { failOnce: "load:T1", cleanupFails: true });
  cleanup.lifecycle.provision(); cleanup.lifecycle.extract();
  assert.throws(() => cleanup.lifecycle.resume(machinePackageB), /injected crash/u);
  assert.throws(() => cleanup.lifecycle.recover(), /CORE_CLEANUP_FAILED/u);
  const residual = harness(configB, { failOnce: "load:T1", residualClass: "control_row" });
  residual.lifecycle.provision(); residual.lifecycle.extract();
  assert.throws(() => residual.lifecycle.resume(machinePackageB), /injected crash/u);
  assert.throws(() => residual.lifecycle.recover(), /CORE_RESIDUAL_NONZERO/u);
});

test("contract-only pair entry reads six independent 0600 machine artifacts without claiming real execution readiness", async () => {
  const control = join(root, "runner-control"); mkdirSync(control, { mode: 0o700 }); chmodSync(control, 0o700);
  const paths = {};
  for (const [rehearsal, current] of [["A", configA], ["B", configB]]) {
    const configRoot = join(control, `config-${rehearsal}`), machineRoot = join(control, `machine-${rehearsal}`);
    mkdirSync(configRoot, { mode: 0o700 }); mkdirSync(machineRoot, { mode: 0o700 });
    const configPath = join(configRoot, "config.json"); writeFileSync(configPath, JSON.stringify(current), { mode: 0o600 });
    const decision = join(machineRoot, "decision.json"), payload = join(machineRoot, "payload.json"), attestation = join(machineRoot, "attestation.json");
    const anchored = rehearsal === "A" ? fixture : fixtureB;
    writeFileSync(decision, JSON.stringify(anchored.decision), { mode: 0o600 });
    writeFileSync(payload, JSON.stringify(anchored.payload), { mode: 0o600 });
    writeFileSync(attestation, JSON.stringify(anchored.attestation), { mode: 0o600 });
    paths[rehearsal] = { configPath, decision, payload, attestation };
  }
  const adapterFactory = async current => ({
    provisionResources: () => ({ status: "verified", productionImport: "HOLD" }),
    executePhase: ({ domain, phase }) => ({ domain, phase, status: "verified", productionImport: "HOLD" }),
    materializeMachinePackage: () => ({ status: "verified", productionImport: "HOLD" }),
    materializeFacts: () => factsFor(current),
    cleanupResources: () => ({ status: "verified", productionImport: "HOLD" }),
    probeResiduals: () => CORE_RESIDUAL_CLASSES.map(kind => ({ class: kind, removed: true, residualCount: 0 }))
  });
  const result = await executeCoreT0T3PairFromFiles({
    configA: paths.A.configPath, configB: paths.B.configPath, driver: "unused-with-injected-adapter", summary: join(control, "summary.json"),
    decisionA: paths.A.decision, payloadA: paths.A.payload, machineAttestationA: paths.A.attestation,
    decisionB: paths.B.decision, payloadB: paths.B.payload, machineAttestationB: paths.B.attestation
  }, { adapterFactory });
  assert.equal(result.status, "CONTRACT_PASS");
  assert.equal(result.executionStatus, "SPEC_FROZEN");
  assert.equal(result.productionImport, "HOLD");
});
