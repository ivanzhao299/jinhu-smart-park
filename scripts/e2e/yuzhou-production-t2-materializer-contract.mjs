import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { materializeProductionT2DecisionCandidates as materialize } from "../hr-cutover/materialize-production-t2-decision-candidates.mjs";
import { projectProductionT2Fields } from "../hr-cutover/production-t2-field-projection.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical, computeProductionImportBusinessIdentityHash as businessHash, deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const canonicalHash = value => hash(canonical(value) + "\n");
const code = "a".repeat(40);
const options = { currentHead: () => code };
function fixture(t, { empty = false, classify = true } = {}) {
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
  const states = empty ? [] : [{ sourceValue: "Synthetic active", usageCount: 1 }];
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
    ["contract_state", "dbo.compact", hash("dbo.compact.state\0Synthetic active"), { sourceCode: null, sourceName: null, sourceValue: "Synthetic active" }, "contract_status", "active", evidence.t2States],
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
