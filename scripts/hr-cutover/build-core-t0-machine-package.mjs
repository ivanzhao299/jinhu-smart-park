#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { buildItemsDigestProbeSql, canonicalHash } from "./materialize-reviewed-job-state.mjs";
import { canonicalDecisionHash, canonicalEvidenceIndexHash, verifyYuzhouJobStateDecisionArtifact } from "./yuzhou-job-state-decision-artifact-lib.mjs";
import { compileYuzhouJobStateMachineAttestation, computeYuzhouJobStateCheckpointArtifactHash, computeYuzhouJobStateCheckpointRoot } from "./yuzhou-job-state-machine-attestation.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const statusTarget = new Map([["1", "active"], ["a", "active"], ["2", "departed"], ["3", "departed"], ["4", "departed"], ["5", "suspended"], ["b", "suspended"]]);
const fail = code => { throw new Error(code); };
const privateJson = path => {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !privateMode(path)) fail("CORE_T0_MACHINE_INPUT_UNSAFE");
  return { value: JSON.parse(readFileSync(path, "utf8")), sha256: sha(readFileSync(path)) };
};
const writePrivate = (path, value) => {
  if (existsSync(path)) fail("CORE_T0_MACHINE_OUTPUT_EXISTS");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(path, 0o600);
};

export function buildCoreT0MachinePackage(configInput, machineRoot, { validate = validateCoreT0T3Config } = {}) {
  const config = validate(configInput), root = resolve(machineRoot);
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || (statSync(root).mode & 0o777) !== 0o700) fail("CORE_T0_MACHINE_ROOT_UNSAFE");
  const stage = join(config.target.stagingRoot, `staging-${config.runId}-t0`);
  const manifest = privateJson(join(stage, "manifest.json"));
  const states = privateJson(join(stage, "employee-job-states.raw.json"));
  const metadata = privateJson(join(stage, "job-state-code-metadata.raw.json"));
  const codes = privateJson(join(stage, "job-state-codes.raw.json"));
  if (!Array.isArray(states.value) || states.value.length !== 7 || !Array.isArray(codes.value) || codes.value.length !== 8
    || manifest.value?.domains?.employeeJobStates?.fileSha256 !== states.sha256
    || manifest.value?.domains?.jobStateCodeMetadata?.fileSha256 !== metadata.sha256
    || manifest.value?.domains?.jobStateCodes?.fileSha256 !== codes.sha256) fail("CORE_T0_MACHINE_STAGE_DRIFT");
  const dictionary = new Map(codes.value.map(row => [String(row.sourceCode ?? "").trim().toLowerCase(), row]));
  const t0Binding = { manifestSha256: manifest.sha256, employeeJobStatesSha256: states.sha256, jobStateCodeMetadataSha256: metadata.sha256, jobStateCodesSha256: codes.sha256 };
  // The runtime verifier intentionally binds the manifest separately.  The
  // dictionary evidence is the three source dictionaries plus their observed
  // cardinalities, so its canonical projection must stay byte-for-byte
  // identical to verifyCurrentT0Binding().
  const dictionaryEvidenceSha256 = canonicalHash({
    employeeJobStatesSha256: t0Binding.employeeJobStatesSha256,
    jobStateCodeMetadataSha256: t0Binding.jobStateCodeMetadataSha256,
    jobStateCodesSha256: t0Binding.jobStateCodesSha256,
    sourceDictionaryRowCount: codes.value.length,
    sourceDistinctStateCount: 7,
    sourceRecordCount: 2949
  });
  const decisions = states.value.map(row => {
    const sourceCode = String(row.sourceCode ?? "").trim(), normalized = sourceCode.toLowerCase(), source = dictionary.get(normalized), observedRecordCount = row.usageCount;
    if (!source || !statusTarget.has(normalized) || !Number.isSafeInteger(observedRecordCount) || observedRecordCount < 1) fail("CORE_T0_MACHINE_SOURCE_DRIFT");
    const sourceIdentitySha256 = sha(`dbo.person.jobstate\u0000${normalized}`), sourceRowSha256 = canonicalHash({ sourceCode, usageCount: observedRecordCount, dictionaryRowSha256: canonicalHash(source) });
    return { sourceIdentitySha256, sourceRowSha256, observedRecordCount, decision: "map", targetEmploymentStatus: statusTarget.get(normalized), semanticClassification: "derived_deterministic", reasonCode: "DETERMINISTIC_MAPPING" };
  }).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  if (new Set(decisions.map(row => row.sourceIdentitySha256)).size !== 7 || decisions.reduce((sum, row) => sum + row.observedRecordCount, 0) !== 2949) fail("CORE_T0_MACHINE_SOURCE_DRIFT");
  const scopeBinding = { tenantIdentitySha256: sha("tenant\u000010000001"), parkIdentitySha256: sha("park\u000020000001") };
  const evidenceIndex = { checkpointSha256: config.machineAttestation.trustedRootSha256, manifestSha256: manifest.sha256, extractBindingSha256: sha(JSON.stringify(t0Binding)), journalSha256: sha(`core:${config.runId}`), employeeJobStatesSha256: states.sha256, jobStateCodeMetadataSha256: metadata.sha256, jobStateCodesSha256: codes.sha256 };
  const decision = { formatVersion: 2, artifactKind: "yuzhou_employee_job_state_machine_decision", artifactVersion: "v2", artifactStatus: "MACHINE_CANDIDATE", triple: config.triple, expectedCheckpointRootSha256: config.machineAttestation.trustedRootSha256, checkpointRootSha256: config.machineAttestation.trustedRootSha256, evidenceIndex, evidenceIndexSha256: canonicalEvidenceIndexHash(evidenceIndex), scopeBinding, sourceContract: { sourceSystem: "yuzhou-v10", dictionaryCode: "employee_job_state", sourceSnapshotSha256: dictionaryEvidenceSha256, sourceDistinctStateCount: 7, sourceRecordCount: 2949 }, decisions, semanticLedger: { sourceDistinctStateCount: 7, sourceRecordCount: 2949, mappedStateCount: 7, quarantinedStateCount: 0, mappedRecordCount: 2949, quarantinedRecordCount: 0, conservationVerified: true }, canonicalDecisionSha256: "", machineAssertion: { mode: "trusted_root_deterministic_machine_semantics", policyVersion: "yuzhou-job-state-machine-policy-v2", status: "PASS", reasonCodes: [], humanSignature: false, humanIdentityAsserted: false }, productionImport: "HOLD" };
  decision.canonicalDecisionSha256 = canonicalDecisionHash(decision); verifyYuzhouJobStateDecisionArtifact(decision);
  const payload = { formatVersion: 2, kind: "yuzhou-job-state-private-materialization", canonicalDecisionSha256: decision.canonicalDecisionSha256, payloadSha256: "", dictionaryVersionId: randomUUID(), expectedDatabaseItemsSha256: "0".repeat(64), csm: config.triple, t0Binding, scope: { tenantId: "10000001", parkId: "20000001", ...scopeBinding }, dictionaryEvidenceSha256, machineActor: { id: randomUUID(), kind: "machine_policy_engine", verifiedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z") }, items: decisions.map(row => { const source = dictionary.get(states.value.find(item => sha(`dbo.person.jobstate\u0000${String(item.sourceCode).trim().toLowerCase()}`) === row.sourceIdentitySha256).sourceCode.toLowerCase()); return { id: randomUUID(), sourceCode: source.sourceCode, sourceName: source.sourceName, sourceValue: null, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }; }), productionImport: "HOLD" };
  const postgresContainer = config.target.container ?? config.target.postgresContainer;
  if (typeof postgresContainer !== "string" || !postgresContainer) fail("CORE_T0_MACHINE_TARGET_INVALID");
  const probe = spawnSync("docker", ["exec", "-i", postgresContainer, "psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database], { input: buildItemsDigestProbeSql(decision, payload), encoding: "utf8" });
  const expected = probe.stdout.split("\n").map(line => line.trim()).find(line => /^[0-9a-f]{64}$/u.test(line));
  if (probe.status !== 0 || !expected) fail("CORE_T0_MACHINE_DIGEST_PROBE_FAILED");
  payload.expectedDatabaseItemsSha256 = expected; payload.payloadSha256 = canonicalHash(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "payloadSha256")));
  const t0Evidence = { ...t0Binding, dictionaryEvidenceSha256, sourceDistinctStateCount: 7, sourceRecordCount: 2949 };
  const checkpoint = { formatVersion: 2, kind: "yuzhou-job-state-preload-package", trustedCheckpointRootSha256: config.machineAttestation.trustedRootSha256, triple: config.triple, decisionArtifact: decision, privatePayload: payload, t0Evidence, bindings: { decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", decision), privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", payload), t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", t0Evidence) }, packageRootSha256: "" };
  checkpoint.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
  const machineAttestation = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: config.machineAttestation.trustedRootSha256 });
  const files = { decision: join(root, "decision.json"), payload: join(root, "payload.json"), machineAttestation: join(root, "machine-attestation.json") };
  writePrivate(files.decision, decision); writePrivate(files.payload, payload); writePrivate(files.machineAttestation, machineAttestation);
  return { files, productionImport: "HOLD" };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [configPath, machineRoot] = process.argv.slice(2); if (!configPath || !machineRoot) fail("CORE_T0_MACHINE_ARGUMENT_INVALID");
  const result = buildCoreT0MachinePackage(JSON.parse(readFileSync(resolve(configPath), "utf8")), machineRoot);
  process.stdout.write(`${JSON.stringify({ machinePackage: "verified", productionImport: result.productionImport })}\n`);
}
