import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { materializeProductionT2DecisionCandidates as materialize } from "../hr-cutover/materialize-production-t2-decision-candidates.mjs";
import { projectProductionT2Fields } from "../hr-cutover/production-t2-field-projection.mjs";
import { T2_CONTRACT_SEMANTIC_FIELDS } from "../hr-cutover/t2-contract-semantics.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical, computeProductionImportBusinessIdentityHash as businessHash, deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { buildProductionT2ChangeClassifications, T2_RENEWAL_ROUTINE_ID, T2_RENEWAL_ROUTINE_SHA256 } from "../hr-cutover/materialize-production-t2-change-classifications.mjs";
import { freezeProductionImportCandidates } from "../hr-cutover/production-import-candidate-freeze.mjs";
import { assembleProductionT3DecisionCandidates } from "../hr-cutover/production-t3-decision-candidates.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const canonicalHash = value => hash(canonical(value) + "\n");
const code = "a".repeat(40);
const options = { currentHead: () => code };
function fixture(t, { empty = false, classify = true, policyState = "Synthetic active", legacy = false, legacyFlag = "否" } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hr-t2-materializer-test-"))); chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const staging = join(root, "stage"); mkdirSync(staging, { mode: 0o700 });
  const write = (name, value, raw = false) => { const path = join(root, name), data = raw ? value : JSON.stringify(value) + "\n"; writeFileSync(path, data, { mode: 0o600 }); return { path, sha256: hash(data) }; };
  const triple = { codeSha: code, sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const scope = { tenantId: "SYN-T", parkId: "SYN-P" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const staged = empty ? [] : [
    ["dbo.compacttypecode", "01", { typeCode: "01", typeName: "Synthetic type" }],
    ["dbo.compact", "SYN-C", { contractNo: "SYN-C", employeeCode: "SYN-E", typeName: "Synthetic type", legacyState: "Synthetic active", derivedContractTermMonths: null, legacyRenewalCount: null, contractTermDecision: "NO_FIXED_DATE_BOUNDARY", signatureDateDecision: "ABSENT", renewalCountDecision: "ABSENT_DEFAULT_ZERO", confidentialityFlag: 0, nonCompeteFlag: 0, trainingServiceFlag: 0, legacyTextPresent: 0, legacyFilePresent: 0 }],
    ["dbo.compact_c", "SYN-C|SYN-E|2026-01-01 00:00:00||", { contractNo: "SYN-C", employeeCode: "SYN-E", startDate: "2026-01-01 00:00:00", endDate: null, signedAt: null, sequenceNo: 1 }],
  ].map(([sourceTable, sourceKey, source]) => ({ sourceTable, sourceKey, source, sourceIdentitySha256: hash(`${sourceTable}\0${sourceKey}`), sourceRowSha256: hash(JSON.stringify(source, Object.keys(source).sort())) }));
  for (const row of staged) if (row.sourceTable === "dbo.compact") {
    if (legacy) {
      for (const key of T2_CONTRACT_SEMANTIC_FIELDS) delete row.source[key];
      Object.assign(row.source, { startDate: "2024-01-31", endDate: "2025-02-28", signedDate: "2024-01-01", continuetimes: "2", contractMonths: "999", totalContractMonths: "888" });
      Object.assign(row.source, { confidentialityFlag: legacyFlag, nonCompeteFlag: legacyFlag, trainingServiceFlag: legacyFlag });
    }
    row.source.legacyState = policyState;
    row.sourceRowSha256 = hash(JSON.stringify(row.source, Object.keys(row.source).sort()));
  }
  const states = empty ? [] : [{ sourceValue: policyState, usageCount: 1 }];
  const files = { "dbo.compacttypecode": "contract-types.jsonl", "dbo.compact": "contracts.jsonl", "dbo.compact_c": "contract-changes.jsonl", "dbo.compact.state": "contract-states.raw.json" };
  const stageManifest = { formatVersion: 1, domains: {} };
  for (const [domain, file] of Object.entries(files)) {
    const data = domain === "dbo.compact.state" ? JSON.stringify(states) + "\n" : staged.filter(row => row.sourceTable === domain).map(row => JSON.stringify(row) + "\n").join("");
    const descriptor = write(`stage/${file}`, data, true);
    stageManifest.domains[domain] = { rows: domain === "dbo.compact.state" ? states.length : staged.filter(row => row.sourceTable === domain).length, file, fileSha256: descriptor.sha256 };
  }
  const sm = write("stage/manifest.json", stageManifest);
  const sourceManifest = { formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("receipt"), sourceCatalogSha256: hash("catalog"), mappingContractSha256: triple.mappingContractHash, phases: {}, productionImport: "HOLD" };
  const domains = { T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"], T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"], T2: Object.keys(files), T3: ["attendance", "insurance", "policies"] };
  for (const [phase, names] of Object.entries(domains)) sourceManifest.phases[phase] = { stageManifestSha256: phase === "T2" ? sm.sha256 : hash(phase), domains: Object.fromEntries(names.map(name => [name, phase === "T2" ? { rows: stageManifest.domains[name].rows, fileSha256: stageManifest.domains[name].fileSha256 } : { rows: 0, fileSha256: hash(name) }])) };
  const sourceDescriptor = write("source-manifest.json", sourceManifest);
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: hash("target"), targetScopeSha256: scope.scopeSha256, sourceManifestSha256: hash(canonical(sourceManifest)), triple, targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(table => [table, 0])), records: [] };
  const inventoryDescriptor = write("inventory.json", inventory);
  const makeT0 = (table, key, fields, parents = []) => {
    const sourceTable = table === "sys_org" ? "dbo.departmentcode" : "dbo.person", identity = hash(`${sourceTable}\0${key}`);
    const allFields = { ...Object.fromEntries(model.targetTables[table].nullableFields.map(key => [key, null])), ...fields };
    const derived = Object.fromEntries(parents.map(([role, parent]) => [model.targetTables[table].foreignKeys.find(fk => fk.dependencyRole === role).column, parent.expectedTargetId]));
    return { phase: "T0", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity, sourceRowSha256: hash(key), candidateDisposition: "insert", reasonCode: null, targetFields: allFields,
      dependencyRefs: parents.map(([role, parent]) => ({ role, phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: parent.targetTable })), businessIdentitySha256: businessHash(table, scope, allFields, derived), expectedTargetId: deriveId({ targetScope: scope, targetTable: table, sourceIdentitySha256: identity }), expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
  };
  const org = makeT0("sys_org", "SYN-O", { org_code: "SYN-O", org_name: "Synthetic org", org_type: "department", sort_order: 0, status: "enabled" });
  const employee = makeT0("hr_employee", "SYN-E", { employee_code: "SYN-E", full_name: "SYNTHETIC_PRIVATE_SENTINEL", employment_type: "full_time", employment_status: "active" }, [["primary_org", org]]);
  const t0 = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple, phaseArtifactSha256: hash("t0phase"), targetInventoryArtifactSha256: inventoryDescriptor.sha256, targetIdentitySha256: inventory.targetIdentitySha256, targetScope: scope, jobStateDecisionArtifactSha256: hash("jobstate"), status: "READY_FOR_FREEZE", countByDisposition: { insert: 2, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [org, employee], productionImport: "HOLD" };
  const phaseRecords = staged.flatMap(row => projectProductionT2Fields(row, row.sourceTable === "dbo.compacttypecode" ? { typeCode: "YUZHOU_01" } : row.sourceTable === "dbo.compact" ? { status: "active" } : { changeType: "renewal" })).map(({ targetFields: _fields, ...rest }) => rest);
  const phase = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: "T2", records: phaseRecords, targetTableCounts: Object.fromEntries(["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"].map(table => [table, phaseRecords.filter(row => row.targetTable === table).length])) };
  const evidence = { t1Types: hash("t1types"), t1States: hash("t1states"), t2Types: stageManifest.domains["dbo.compacttypecode"].fileSha256, t2States: stageManifest.domains["dbo.compact.state"].fileSha256 };
  const pkg = { formatVersion: 1, kind: "yuzhou_core_non_t0_machine_dictionary_package", triple, trustedRootSha256: hash("synthetic trusted root"), machineActor: { id: "00000000-0000-5000-8000-000000000001", kind: "machine_policy_engine", verifiedAt: "2026-09-05T00:00:00Z" }, evidence, dictionaries: [{ dictionaryCode: "employment_event_type" }, { dictionaryCode: "employment_event_state" }], productionImport: "HOLD" };
  for (const [dictionaryCode, sourceTable, identity, original, domain, target, source] of [
    ["contract_type", "dbo.compacttypecode", hash("dbo.compacttypecode\0" + "01"), { sourceCode: "01", sourceName: "Synthetic type", sourceValue: null }, "contract_type_code", "YUZHOU_01", evidence.t2Types],
    ["contract_state", "dbo.compact", hash(`dbo.compact.state\0${policyState}`), { sourceCode: null, sourceName: null, sourceValue: policyState }, "contract_status", "active", evidence.t2States],
  ]) {
    const item = { id: "00000000-0000-5000-8000-000000000001", ...original, sourceIdentitySha256: identity, sourceRowSha256: canonicalHash(original), decision: "map", targetDomain: domain, targetValue: target, reasonCode: "DETERMINISTIC_COMPATIBILITY_MAPPING" };
    const d = { dictionaryCode, sourceTable, sourceSnapshotSha256: canonicalHash({ kind: dictionaryCode, source }), items: empty ? [] : [item] };
    d.machineAttestationSha256 = canonicalHash({ triple, trustedRootSha256: pkg.trustedRootSha256, dictionaryCode, sourceSnapshotSha256: d.sourceSnapshotSha256, items: d.items.map(({ id: _id, ...rest }) => rest) }); pkg.dictionaries.push(d);
  }
  const changes = { formatVersion: 1, kind: "yuzhou_hr_t2_change_classification_candidates", triple, stageFileSha256: stageManifest.domains["dbo.compact_c"].fileSha256,
    records: staged.filter(row => row.sourceTable === "dbo.compact_c").map(row => ({ sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, changeType: "renewal", evidenceSha256: hash("synthetic semantic evidence") })), productionImport: "HOLD" };
  const config = { formatVersion: 1, triple, stagingDir: staging, artifacts: { sourceManifest: sourceDescriptor, targetInventory: inventoryDescriptor, t0Candidates: write("t0.json", t0), phaseArtifact: write("phase.json", phase), dictionaryPackage: write("dictionary.json", pkg), changeDecisions: classify ? write("changes.json", changes) : null }, outputPath: join(root, "candidate.json") };
  const path = write("config.json", config).path;
  return { root, config, path, pkg, write, save: () => write("config.json", config) };
}
const reject = (f, code) => assert.throws(() => materialize(f.path, options), error => error.code === code && error.message === code);

test("actual private T2 materializer output freezes with exact retained resolution evidence and unchanged bytes", t => {
  for (const classify of [true, false]) {
    const f = fixture(t, { classify }), a = f.config.artifacts;
    const explicit = (value, path = "/synthetic/candidate-freeze.json") => { const bytes = canonical(value) + "\n"; return { path, bytes, sha256: hash(bytes) }; };
    const read = descriptor => ({ ...descriptor, bytes: readFileSync(descriptor.path) });
    const t0 = JSON.parse(readFileSync(a.t0Candidates.path, "utf8")), inventory = JSON.parse(readFileSync(a.targetInventory.path, "utf8"));
    const phase = (name, records) => ({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple: f.config.triple, phase: name, records,
      targetTableCounts: Object.fromEntries(Object.entries(model.targetTables).filter(([, rule]) => rule.phase === name).map(([table]) => [table, records.filter(row => row.targetTable === table).length])) });
    const provenance = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
    const t0Phase = explicit(phase("T0", t0.records.map(row => Object.fromEntries(provenance.map(key => [key, row[key]])))));
    t0.phaseArtifactSha256 = t0Phase.sha256;
    a.t0Candidates = f.write("t0.json", t0); f.save();
    const t0Descriptor = read(a.t0Candidates), before = readFileSync(a.phaseArtifact.path);
    const materialized = materialize(f.path, options);
    const outputDescriptor = read({ path: f.config.outputPath, sha256: materialized.artifactSha256 });
    const produced = JSON.parse(outputDescriptor.bytes.toString("utf8"));
    const t1Phase = explicit(phase("T1", []));
    const t1 = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t1_decision_candidates", triple: f.config.triple,
      phaseArtifactSha256: t1Phase.sha256, t0DecisionCandidatesArtifactSha256: t0Descriptor.sha256, targetSnapshotArtifactSha256: a.targetInventory.sha256,
      targetIdentitySha256: inventory.targetIdentitySha256, targetScope: t0.targetScope, eventTypeDecisionArtifactSha256: hash("synthetic event types"), eventStateDecisionArtifactSha256: hash("synthetic event states"),
      status: "READY_FOR_FREEZE", countByDisposition: { insert: 0, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [], productionImport: "HOLD" };
    const t3 = assembleProductionT3DecisionCandidates({ triple: f.config.triple, targetScope: t0.targetScope, targetInventory: inventory, t0Candidates: t0,
      stagedRecords: [], attendanceFileSha256: hash("synthetic empty attendance"), artifactHashes: { targetInventoryArtifactSha256: a.targetInventory.sha256, t0CandidatesArtifactSha256: t0Descriptor.sha256 } });
    const input = { expectedTriple: f.config.triple, targetInventoryArtifact: read(a.targetInventory), targetScopeArtifact: explicit({ tenantId: t0.targetScope.tenantId, parkId: t0.targetScope.parkId }), reviewedDecisionsArtifact: null,
      phaseArtifacts: { T0: t0Phase, T1: t1Phase, T2: read(a.phaseArtifact), T3: explicit(t3.phaseArtifact) },
      candidateArtifacts: { T0: t0Descriptor, T1: explicit(t1), T2: outputDescriptor, T3: explicit(t3.candidates) } };
    const result = freezeProductionImportCandidates(input);
    assert.equal(result.summary.status, classify ? "READY" : "REVIEW_HOLD");
    assert.equal(result.summary.missingReviewCount, classify ? 0 : 1);
    assert.deepEqual(result.evidence.t2ResolutionEvidence, { dictionaryPackageSha256: a.dictionaryPackage.sha256, changeDecisionsSha256: a.changeDecisions?.sha256 ?? null, approvalClaimed: false });
    assert.equal(result.evidence.candidateArtifactSha256.T2, materialized.artifactSha256);
    assert.equal(result.summary.approvalClaimed, false); assert.equal(result.summary.productionImport, "HOLD");
    assert.deepEqual(readFileSync(f.config.outputPath), outputDescriptor.bytes); assert.deepEqual(readFileSync(a.phaseArtifact.path), before);
    for (const change of [
      value => { value.resolutionEvidence.extra = true; },
      value => { delete value.resolutionEvidence.changeDecisionsSha256; },
      value => { value.resolutionEvidence = null; },
      value => { value.resolutionEvidence.dictionaryPackageSha256 = "invalid"; },
      value => { value.resolutionEvidence.dictionaryPackageSha256 = null; },
      value => { value.resolutionEvidence.changeDecisionsSha256 = "A".repeat(64); },
      value => { value.resolutionEvidence.changeDecisionsSha256 = 123; },
      value => { value.resolutionEvidence.approvalClaimed = true; },
      value => { value.resolutionEvidence.approvalClaimed = "false"; },
    ]) {
      const altered = structuredClone(produced); change(altered);
      assert.throws(() => freezeProductionImportCandidates({ ...input, candidateArtifacts: { ...input.candidateArtifacts, T2: explicit(altered) } }),
        error => error.code === "CANDIDATE_FREEZE_RESOLUTION_EVIDENCE_INVALID" && error.message === error.code);
    }
    for (const otherPhase of ["T0", "T1", "T3"]) {
      const candidate = JSON.parse(Buffer.from(input.candidateArtifacts[otherPhase].bytes).toString("utf8")); candidate.resolutionEvidence = produced.resolutionEvidence;
      assert.throws(() => freezeProductionImportCandidates({ ...input, candidateArtifacts: { ...input.candidateArtifacts, [otherPhase]: explicit(candidate) } }), { code: "CANDIDATE_FREEZE_SHAPE_INVALID" });
    }
  }
});

test("private raw legacy staging materializes contract and renewal with unchanged source files", t => {
  for (const legacyFlag of ["否", "是"]) {
  const f = fixture(t, { legacy: true, legacyFlag });
  const sourcePath = join(f.config.stagingDir, "contracts.jsonl"), before = readFileSync(sourcePath);
  const source = JSON.parse(before.toString("utf8")), result = materialize(f.path, options), output = JSON.parse(readFileSync(f.config.outputPath));
  assert.equal(result.countByDisposition.insert, 3); assert.equal(result.countByDisposition.quarantine, 0);
  assert.deepEqual(readFileSync(sourcePath), before);
  const parent = output.records.find(row => row.targetTable === "hr_contract"), child = output.records.find(row => row.targetTable === "hr_contract_change");
  assert.equal(parent.sourceRowSha256, source.sourceRowSha256); assert.equal(parent.targetFields.legacy_source_row_sha256, source.sourceRowSha256);
  assert.equal(parent.targetFields.contract_term_months, 13); assert.equal(parent.targetFields.renewal_count, 2);
  assert.equal(parent.targetFields.source_snapshot.unconfirmedTerm, "999");
  for (const key of ["confidentiality_agreement", "non_compete_agreement", "training_service_agreement"]) assert.equal(parent.targetFields[key], legacyFlag === "是");
  assert.equal(child.candidateDisposition, "insert"); assert.equal(child.dependencyRefs[0].sourceIdentitySha256, parent.sourceIdentitySha256);
  assert.equal(output.productionImport, "HOLD"); assert.equal(output.resolutionEvidence.approvalClaimed, false);
  }
});

function attest(pkg, triple = pkg.triple) {
  for (const d of pkg.dictionaries.filter(d => d.items)) d.machineAttestationSha256 = canonicalHash({ triple, trustedRootSha256: pkg.trustedRootSha256, dictionaryCode: d.dictionaryCode, sourceSnapshotSha256: d.sourceSnapshotSha256, items: d.items.map(({ id: _id, ...rest }) => rest) });
}
function historic(t, fixtureOptions = {}) {
  const f = fixture(t, { policyState: "生效", ...fixtureOptions });
  f.pkg.triple = { ...f.pkg.triple, codeSha: "b".repeat(40), mappingContractHash: hash("old mapping") };
  attest(f.pkg);
  f.config.dictionaryRevalidation = "source_semantics";
  f.persist = () => { f.config.artifacts.dictionaryPackage = f.write("dictionary.json", f.pkg); f.save(); };
  f.persist(); return f;
}

test("explicit T2 revalidation accepts unchanged source semantics without relabeling original package", t => {
  const f = historic(t), before = readFileSync(f.config.artifacts.dictionaryPackage.path);
  const result = materialize(f.path, options), output = JSON.parse(readFileSync(f.config.outputPath));
  assert.equal(result.countByDisposition.insert, 3);
  assert.equal(output.triple.codeSha, code);
  assert.equal(output.resolutionEvidence.dictionaryPackageSha256, hash(before));
  assert.equal(output.resolutionEvidence.approvalClaimed, false);
  assert.equal(output.productionImport, "HOLD");
  assert.deepEqual(readFileSync(f.config.artifacts.dictionaryPackage.path), before);
});
test("historical dictionaries remain rejected by default and invalid opt-ins fail closed", t => {
  const a = historic(t); delete a.config.dictionaryRevalidation; a.save(); reject(a, "T2_MATERIALIZER_DICTIONARY_INVALID");
  for (const option of [true, false, null, "force"]) {
    const f = historic(t); f.config.dictionaryRevalidation = option; f.save(); reject(f, "T2_MATERIALIZER_DICTIONARY_REVALIDATION_INVALID");
  }
});
test("T2 revalidation rejects changed source or malformed historical binding", t => {
  const a = historic(t); a.pkg.triple.sourceSnapshotHash = hash("different source"); attest(a.pkg); a.persist(); reject(a, "T2_MATERIALIZER_DICTIONARY_INVALID");
  const b = historic(t); b.pkg.triple.codeSha = "bad"; attest(b.pkg); b.persist(); reject(b, "T2_MATERIALIZER_DICTIONARY_INVALID");
});
test("T2 historical attestation must use original triple, never refreshed current triple", t => {
  const f = historic(t); attest(f.pkg, f.config.triple); f.persist(); reject(f, "T2_MATERIALIZER_DICTIONARY_HASH_MISMATCH");
});
test("recomputed hashes cannot authorize changed policy, reason or unknown state", t => {
  for (const [field, value] of [["targetValue", "terminated"], ["reasonCode", "OTHER_POLICY"]]) {
    const f = historic(t); f.pkg.dictionaries.find(d => d.dictionaryCode === "contract_state").items[0][field] = value; attest(f.pkg); f.persist(); reject(f, "T2_MATERIALIZER_DICTIONARY_POLICY_MISMATCH");
  }
  const unknown = historic(t, { policyState: "Synthetic unknown" }); reject(unknown, "T2_MATERIALIZER_DICTIONARY_POLICY_MISMATCH");
});
test("revalidation does not grant historical change classification current authority", t => {
  const f = historic(t), changes = JSON.parse(readFileSync(f.config.artifacts.changeDecisions.path));
  changes.triple = f.pkg.triple; f.config.artifacts.changeDecisions = f.write("changes.json", changes); f.save();
  assert.throws(() => materialize(f.path, options), error => /^T2_MATERIALIZER_CHANGE_/u.test(error.code));
});
test("empty T2 dictionaries retain zero-source proof under explicit revalidation", t => {
  const f = historic(t, { empty: true }); assert.equal(materialize(f.path, options).recordCount, 0);
});

test("private files through existing dictionary and graph produce a hash-verified candidate", t => {
  const f = fixture(t), result = materialize(f.path, options), bytes = readFileSync(f.config.outputPath), artifact = JSON.parse(bytes);
  assert.equal(result.status, "READY_FOR_REVIEW"); assert.equal(result.recordCount, 3); assert.equal(result.countByDisposition.insert, 3);
  assert.equal(result.artifactSha256, hash(bytes)); assert.equal(statSync(f.config.outputPath).mode & 0o777, 0o600);
  assert.equal(artifact.resolutionEvidence.approvalClaimed, false); assert.equal(artifact.productionImport, "HOLD");
  assert.equal(artifact.records.find(row => row.targetTable === "hr_contract").targetFields.status, "active");
  assert.equal(JSON.stringify(result).includes(f.root), false); assert.equal(JSON.stringify(result).includes("SYN-C"), false);
  reject(f, "T2_MATERIALIZER_OUTPUT_FAILED"); assert.equal(hash(readFileSync(f.config.outputPath)), result.artifactSha256);
});
test("missing change classification is counted as review, not silently inferred renewal", t => {
  const f = fixture(t, { classify: false }), result = materialize(f.path, options);
  assert.equal(result.status, "REVIEW_HOLD"); assert.equal(result.countByDisposition.quarantine, 1);
  assert.equal(result.reasonCounts.T2_DICTIONARY_DECISION_INVALID, 1);
});
test("source-evidenced classifier output feeds the existing private T2 consumer unchanged", t => {
  const f = fixture(t), stagedRecords = ["contract-types.jsonl", "contracts.jsonl", "contract-changes.jsonl"].flatMap(name => readFileSync(join(f.config.stagingDir, name), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
  const manifest = JSON.parse(readFileSync(join(f.config.stagingDir, "manifest.json")));
  const { artifact, summary } = buildProductionT2ChangeClassifications({ triple: f.config.triple, stagedRecords, stageFileSha256: manifest.domains["dbo.compact_c"].fileSha256, routineEvidence: { routineId: T2_RENEWAL_ROUTINE_ID, routineSha256: T2_RENEWAL_ROUTINE_SHA256 } });
  assert.equal(summary.renewal, 1); assert.equal(summary.needsReview, 0);
  f.config.artifacts.changeDecisions = f.write("generated-changes.json", artifact); f.save();
  const result = materialize(f.path, options), output = JSON.parse(readFileSync(f.config.outputPath));
  assert.equal(result.countByDisposition.insert, 3);
  assert.equal(output.records.find(row => row.targetTable === "hr_contract_change").targetFields.change_type, "renewal");
  assert.equal(output.resolutionEvidence.changeDecisionsSha256, f.config.artifacts.changeDecisions.sha256);
  assert.equal(output.productionImport, "HOLD"); assert.equal(output.resolutionEvidence.approvalClaimed, false);
});
test("empty jsonl sources still materialize a complete four-table zero artifact", t => {
  const f = fixture(t, { empty: true }); const result = materialize(f.path, options);
  assert.equal(result.recordCount, 0); assert.ok(Object.values(result.targetTableCounts).every(count => count === 0));
});
test("wrong current code rejects before source parsing", t => {
  const f = fixture(t); assert.throws(() => materialize(f.path, { currentHead: () => "b".repeat(40) }), { code: "T2_MATERIALIZER_CURRENT_CODE_REQUIRED" });
});
test("artifact bytes and staged bytes must match bound hashes", t => {
  const a = fixture(t); writeFileSync(a.config.artifacts.t0Candidates.path, "{}\n"); reject(a, "T2_MATERIALIZER_ARTIFACT_HASH_MISMATCH");
  const b = fixture(t); writeFileSync(join(b.config.stagingDir, "contracts.jsonl"), "{}\n"); reject(b, "T2_MATERIALIZER_STAGE_BYTES_DRIFT");
});
test("dictionary source and semantic hashes reject drift even with refreshed file descriptor", t => {
  const a = fixture(t); a.pkg.evidence.t2Types = hash("wrong"); a.config.artifacts.dictionaryPackage = a.write("dictionary.json", a.pkg); a.save(); reject(a, "T2_MATERIALIZER_DICTIONARY_SOURCE_DRIFT");
  const b = fixture(t); b.pkg.dictionaries.find(d => d.dictionaryCode === "contract_state").items[0].targetValue = "terminated"; b.config.artifacts.dictionaryPackage = b.write("dictionary.json", b.pkg); b.save(); reject(b, "T2_MATERIALIZER_DICTIONARY_HASH_MISMATCH");
});
test("unsafe permissions, symlinks and hard links cannot be consumed", t => {
  const a = fixture(t); chmodSync(a.config.artifacts.t0Candidates.path, 0o644); reject(a, "T2_MATERIALIZER_FILE_UNSAFE");
  const b = fixture(t); const alias = join(b.root, "link.json"); symlinkSync(b.config.artifacts.t0Candidates.path, alias); b.config.artifacts.t0Candidates.path = alias; b.save(); reject(b, "T2_MATERIALIZER_FILE_UNSAFE");
  const c = fixture(t); linkSync(c.config.artifacts.t0Candidates.path, join(c.root, "hardlink.json")); reject(c, "T2_MATERIALIZER_FILE_UNSAFE");
});
test("CLI failures expose stable codes, never private input paths or synthetic content", t => {
  const f = fixture(t); const result = spawnSync(process.execPath, ["scripts/hr-cutover/materialize-production-t2-decision-candidates.mjs", "--config", f.path], { encoding: "utf8" });
  assert.equal(result.status, 1); assert.match(result.stderr.trim(), /^T2_MATERIALIZER_[A-Z_]+$/);
  assert.equal(result.stdout, ""); assert.equal(result.stderr.includes(f.root), false); assert.equal(result.stderr.includes("SYNTHETIC_PRIVATE_SENTINEL"), false);
});
test("per-file and aggregate read bounds fail before allocating an oversized input", t => {
  const a = fixture(t); truncateSync(a.config.artifacts.t0Candidates.path, 32 * 1024 ** 2 + 1); reject(a, "T2_MATERIALIZER_FILE_UNSAFE");
  const b = fixture(t); assert.throws(() => materialize(b.path, { ...options, maximumReadBytes: 1 }), { code: "T2_MATERIALIZER_FILE_UNSAFE" });
  assert.throws(() => materialize(b.path, { ...options, maximumReadBytes: 128 * 1024 ** 2 + 1 }), { code: "T2_MATERIALIZER_READ_BUDGET_INVALID" });
});
test("production inventory uses canonical source-manifest identity, not interchangeable file bytes", t => {
  const f = fixture(t), inventory = JSON.parse(readFileSync(f.config.artifacts.targetInventory.path, "utf8"));
  assert.notEqual(inventory.sourceManifestSha256, f.config.artifacts.sourceManifest.sha256);
  inventory.sourceManifestSha256 = f.config.artifacts.sourceManifest.sha256;
  f.config.artifacts.targetInventory = f.write("inventory.json", inventory); f.save(); reject(f, "T2_MATERIALIZER_INVENTORY_SOURCE_DRIFT");
});
