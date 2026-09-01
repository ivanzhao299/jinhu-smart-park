import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compileProductionImportMachineAttestation, computeProductionImportMachineArtifactHash, computeProductionImportMachineEvidenceRoot, ProductionImportMachineAttestationError } from "../hr-cutover/production-import-machine-attestation.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "../hr-cutover/production-import-target-model.mjs";

const sha = value => createHash("sha256").update(`machine-v2:${value}`).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: sha("source"), mappingContractHash: sha("mapping") };
const tables = Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables).sort();
const kinds = { sealedPlan: "sealed_plan_binding", sourceAuthority: "source_authority_evidence", targetIdentity: "target_identity_evidence", sourceLedger: "source_ledger", moneyLedger: "numeric_reconciliation_evidence", semanticInventory: "semantic_inventory_evidence", casReceipts: "cas_receipt_evidence", rehearsalEvidence: "rehearsal_ab_evidence", restoreEvidence: "restore_fault_evidence", uatEvidence: "technical_uat_evidence", sideEffectEvidence: "side_effect_evidence", runtimeEvidence: "runtime_release_evidence", rollbackEvidence: "rollback_evidence", residualEvidence: "classified_residual_evidence" };
const env = (kind, payload) => ({ artifactKind: kind, artifactSha256: computeProductionImportMachineArtifactHash(kind, payload), payload });
const resourceKeys = ["database", "cluster", "composeProject", "volume", "container", "apiPort", "webPort", "fileRoot", "stagingRoot", "evidenceRoot", "accountSet", "runId"];
const resource = prefix => Object.fromEntries(resourceKeys.map(key => [key, sha(`${prefix}-${key}`)]));
const residualCategories = ["business_rows", "control_rows", "record_maps", "database", "role", "container", "network", "volume", "account", "file", "port", "process", "credential_artifact"];
const uatUnit = (label, width) => ({ passed: 1, failed: 0, width, evidenceSha256: sha(label) });

function build() {
  const artifacts = {};
  artifacts.sourceAuthority = env(kinds.sourceAuthority, { readOnly: true, sourceUnlocked: false, sourceSnapshotHash: triple.sourceSnapshotHash, backupSha256: sha("backup"), catalogSha256: sha("catalog"), businessSha256: sha("business"), tableLedgerSha256: sha("tables") });
  artifacts.targetIdentity = env(kinds.targetIdentity, { environment: "production_candidate", serverIdentitySha256: sha("server"), clusterIdentitySha256: sha("cluster"), databaseIdentitySha256: sha("db"), userIdentitySha256: sha("user"), tenantIdentitySha256: sha("tenant"), parkIdentitySha256: sha("park"), scopeSha256: sha("scope") });
  artifacts.sourceLedger = env(kinds.sourceLedger, { objects: tables.map((targetTable, index) => ({ sourceObject: `dbo.source_${index}`, targetTable, source: 1, loaded: 1, quarantined: 0, approvedIgnored: 0 })) });
  artifacts.moneyLedger = env(kinds.moneyLedger, { allAmountsDatabaseNumeric: true, reconciled: true, t3: { calendars: 144, days: 4383, policies: 12, policyItems: 144, periods: 35008, periodsLoaded: 34787, periodsQuarantined: 221, insuranceItems: 208722, numericTotalsSha256: sha("t3-numeric"), amountSource: "100.0000", amountLoaded: "90.0000", amountQuarantined: "10.0000", amountApprovedIgnored: "0.0000" }, t4: { hot: 8342, loaded: 8342, quarantined: 0, items: 190880, closes: 266, coldArchive: 37750, net: "15723009.9100", loadedNet: "15723009.9100", quarantinedNet: "0.0000", approvedIgnoredNet: "0.0000" } });
  artifacts.sealedPlan = env(kinds.sealedPlan, { sealedPlanSha256: sha("sealed"), triple, sourceAuthoritySha256: artifacts.sourceAuthority.artifactSha256, targetIdentitySha256: artifacts.targetIdentity.artifactSha256, sourceLedgerSha256: artifacts.sourceLedger.artifactSha256, moneyLedgerSha256: artifacts.moneyLedger.artifactSha256 });
  artifacts.semanticInventory = env(kinds.semanticInventory, { expectedCount: 1, evaluatedCount: 1, inventorySha256: sha("semantic"), entries: [{ itemIdentitySha256: sha("item"), sourceIdentitySha256: sha("semantic-source"), ruleVersion: "employment-status-v1", classification: "derived_deterministic", targetDisposition: "insert" }] });
  artifacts.casReceipts = env(kinds.casReceipts, { receipts: tables.map((targetTable, index) => ({ sourceIdentitySha256: sha(`cas-${index}`), targetTable, disposition: "insert", beforeCanonicalSha256: null, afterCanonicalSha256: sha(`after-${index}`), versionBefore: null, versionAfter: 1, affectedRows: 1, projectionMapSha256: sha(`map-${index}`), batchPhaseSha256: sha(`phase-${index}`) })) });
  const rehearsal = label => ({ rehearsal: label, triple, manifestSha256: sha(`manifest-${label}`), canonicalResultRootSha256: sha("canonical-result"), quarantineReasonLedgerSha256: sha("quarantine"), sourceLedgerSha256: artifacts.sourceLedger.artifactSha256, moneyLedgerSha256: artifacts.moneyLedger.artifactSha256, semanticInventorySha256: artifacts.semanticInventory.artifactSha256, casReceiptsSha256: artifacts.casReceipts.artifactSha256, resources: resource(label), status: "PASS" });
  artifacts.rehearsalEvidence = env(kinds.rehearsalEvidence, { rehearsals: [rehearsal("A"), rehearsal("B")] });
  artifacts.restoreEvidence = env(kinds.restoreEvidence, { runs: ["A", "B"].map(rehearsal => ({ rehearsal, backupSha256: sha(`backup-${rehearsal}`), tocSha256: sha(`toc-${rehearsal}`), faultObservationSha256: sha(`fault-${rehearsal}`), restoredCanonicalSha256: sha("canonical-result"), newDatabaseIdentitySha256: sha(`restore-db-${rehearsal}`), restoreToNewDatabase: true, faultInjected: true, status: "PASS" })) });
  artifacts.uatEvidence = env(kinds.uatEvidence, { runs: ["A", "B"].map(rehearsal => ({ rehearsal, api: uatUnit(`${rehearsal}-api`, 0), rbac: uatUnit(`${rehearsal}-rbac`, 0), desktop: uatUnit(`${rehearsal}-desktop`, 1440), phone390: uatUnit(`${rehearsal}-phone`, 390) })) });
  artifacts.sideEffectEvidence = env(kinds.sideEffectEvidence, { runs: ["A", "B"].map(rehearsal => ({ rehearsal, surfaces: [{ name: "payroll", beforeSha256: sha("side"), afterSha256: sha("side"), zeroWrites: true }] })) });
  artifacts.runtimeEvidence = env(kinds.runtimeEvidence, { codeSha: triple.codeSha, mainSha: triple.codeSha, runtimeSha: triple.codeSha, migrationHistorySha256: sha("migration"), seedHistorySha256: sha("seed"), releaseEvidenceSha256: sha("release") });
  artifacts.rollbackEvidence = env(kinds.rollbackEvidence, { runs: ["A", "B"].map(rehearsal => ({ rehearsal, order: ["T3", "T2", "T1", "T0"], phases: ["T3", "T2", "T1", "T0"].map(phase => ({ phase, receiptSha256: sha(`${rehearsal}-${phase}`), affectedRows: 1, status: "PASS" })) })) });
  artifacts.residualEvidence = env(kinds.residualEvidence, { runs: artifacts.rehearsalEvidence.payload.rehearsals.map(run => ({ rehearsal: run.rehearsal, resourceRegistrySha256: computeProductionImportMachineArtifactHash("rehearsal_resource_registry", { rehearsal: run.rehearsal, resources: run.resources }), categories: residualCategories.map(category => ({ category, planned: 1, observed: 1, removed: 1, residualCount: 0, observationSha256: sha(`${run.rehearsal}-${category}`) })) })) });
  return reseal({ bundle: { artifacts } });
}
function reseal(fixture) { const bindings = Object.entries(fixture.bundle.artifacts).map(([key, artifact]) => ({ key, artifactKind: artifact.artifactKind, artifactSha256: artifact.artifactSha256 })); const payload = { triple, bindings }; fixture.bundle.evidenceIndex = env("evidence_index", payload); fixture.root = computeProductionImportMachineEvidenceRoot(payload); return fixture; }
function mutate(fixture, key, fn) { fn(fixture.bundle.artifacts[key].payload); fixture.bundle.artifacts[key] = env(kinds[key], fixture.bundle.artifacts[key].payload); return reseal(fixture); }
const compile = fixture => compileProductionImportMachineAttestation(fixture.bundle, { expectedEvidenceRootSha256: fixture.root });

const trusted = build(), pass = compile(trusted);
assert.equal(pass.status, "PASS"); assert.equal(pass.humanSignature, false); assert.equal(pass.humanIdentityAsserted, false); assert.equal(pass.productionImport, "HOLD"); assert.match(pass.integrityDigest, /^[0-9a-f]{64}$/u); assert.equal("signature" in pass, false); assert.deepEqual(compile(build()), pass);
const approvedIgnored = build();
approvedIgnored.bundle.artifacts.sourceLedger.payload.objects[0].loaded = 0;
approvedIgnored.bundle.artifacts.sourceLedger.payload.objects[0].approvedIgnored = 1;
approvedIgnored.bundle.artifacts.sourceLedger.payload.objects[0].approvedIgnoredReasonLedgerSha256 = sha("approved-ignore-reason");
approvedIgnored.bundle.artifacts.sourceLedger = env(kinds.sourceLedger, approvedIgnored.bundle.artifacts.sourceLedger.payload);
const ignoredReceipt = approvedIgnored.bundle.artifacts.casReceipts.payload.receipts[0];
ignoredReceipt.disposition = "skip_approved";
ignoredReceipt.affectedRows = 0;
ignoredReceipt.beforeCanonicalSha256 = ignoredReceipt.afterCanonicalSha256;
ignoredReceipt.versionBefore = 1;
ignoredReceipt.versionAfter = 1;
approvedIgnored.bundle.artifacts.casReceipts = env(kinds.casReceipts, approvedIgnored.bundle.artifacts.casReceipts.payload);
for (const run of approvedIgnored.bundle.artifacts.rehearsalEvidence.payload.rehearsals) {
  run.sourceLedgerSha256 = approvedIgnored.bundle.artifacts.sourceLedger.artifactSha256;
  run.casReceiptsSha256 = approvedIgnored.bundle.artifacts.casReceipts.artifactSha256;
}
approvedIgnored.bundle.artifacts.rehearsalEvidence = env(kinds.rehearsalEvidence, approvedIgnored.bundle.artifacts.rehearsalEvidence.payload);
approvedIgnored.bundle.artifacts.sealedPlan.payload.sourceLedgerSha256 = approvedIgnored.bundle.artifacts.sourceLedger.artifactSha256;
approvedIgnored.bundle.artifacts.sealedPlan = env(kinds.sealedPlan, approvedIgnored.bundle.artifacts.sealedPlan.payload);
assert.equal(compile(reseal(approvedIgnored)).status, "PASS");
assert.throws(() => compileProductionImportMachineAttestation(build().bundle), error => error instanceof ProductionImportMachineAttestationError && error.code === "PRODUCTION_IMPORT_MACHINE_TRUST_ROOT_REQUIRED");
const forged = mutate(build(), "sealedPlan", value => { value.sealedPlanSha256 = sha("forged"); });
assert.throws(() => compileProductionImportMachineAttestation(forged.bundle, { expectedEvidenceRootSha256: trusted.root }), error => error.code === "PRODUCTION_IMPORT_MACHINE_TRUST_ROOT_MISMATCH");
const missingRestore = build(); delete missingRestore.bundle.artifacts.restoreEvidence; assert.equal(compile(missingRestore).status, "REVIEW_HOLD");
const unlockedSource = mutate(build(), "sourceAuthority", value => { value.sourceUnlocked = true; }); assert.equal(compile(unlockedSource).status, "FAIL");
const badCatalog = mutate(build(), "sourceAuthority", value => { value.catalogSha256 = "invalid"; }); assert.equal(compile(badCatalog).status, "FAIL");
const brokenConservation = mutate(build(), "sourceLedger", value => { value.objects[0].source = 2; }); assert.equal(compile(brokenConservation).status, "FAIL");
const emptySemantic = mutate(build(), "semanticInventory", value => { value.expectedCount = 0; value.evaluatedCount = 0; value.entries = []; }); assert.equal(compile(emptySemantic).status, "FAIL");
const missingMoney = build(); delete missingMoney.bundle.artifacts.moneyLedger; assert.equal(compile(missingMoney).status, "REVIEW_HOLD");
const badMoney = mutate(build(), "moneyLedger", value => { value.t4.loadedNet = "15723009.9099"; }); assert.equal(compile(badMoney).status, "FAIL");
const fakeResidual = mutate(build(), "residualEvidence", value => { value.runs[0].categories[0].residualCount = 1; }); assert.equal(compile(fakeResidual).status, "FAIL");
const fakeZeroResidual = mutate(build(), "residualEvidence", value => { value.runs[0].categories[0].removed = 0; }); assert.equal(compile(fakeZeroResidual).status, "FAIL");
const reusedResource = mutate(build(), "rehearsalEvidence", value => { value.rehearsals[1].resources.database = value.rehearsals[0].resources.database; }); assert.equal(compile(reusedResource).status, "FAIL");
const onlyManifestDiffers = mutate(build(), "rehearsalEvidence", value => { value.rehearsals[1].canonicalResultRootSha256 = sha("different"); }); assert.equal(compile(onlyManifestDiffers).status, "FAIL");
const missingUat = build(); delete missingUat.bundle.artifacts.uatEvidence; assert.equal(compile(missingUat).status, "REVIEW_HOLD");
const badPhone = mutate(build(), "uatEvidence", value => { value.runs[0].phone390.width = 391; }); assert.equal(compile(badPhone).status, "FAIL");
const missingTarget = build(); delete missingTarget.bundle.artifacts.targetIdentity; assert.equal(compile(missingTarget).status, "REVIEW_HOLD");
const sideEffect = mutate(build(), "sideEffectEvidence", value => { value.runs[0].surfaces[0].afterSha256 = sha("changed"); }); assert.equal(compile(sideEffect).status, "FAIL");
const runtimeDrift = mutate(build(), "runtimeEvidence", value => { value.runtimeSha = "2".repeat(40); }); assert.equal(compile(runtimeDrift).status, "FAIL");
const casBad = mutate(build(), "casReceipts", value => { value.receipts[0].versionAfter = 2; }); assert.equal(compile(casBad).status, "FAIL");
const rollbackOrder = mutate(build(), "rollbackEvidence", value => { value.runs[0].order.reverse(); }); assert.equal(compile(rollbackOrder).status, "FAIL");
const restoreDrift = mutate(build(), "restoreEvidence", value => { value.runs[0].restoredCanonicalSha256 = sha("restore-drift"); }); assert.equal(compile(restoreDrift).status, "FAIL");
console.log("Yuzhou machine attestation v2 contract passed: trusted root, mandatory evidence, exact numeric, semantic/CAS, independent A/B, restore/UAT/runtime/side-effect/rollback/classified residual and anti-forgery gates");
