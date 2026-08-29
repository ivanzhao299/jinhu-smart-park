import { createHash } from "node:crypto";

import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "./production-import-target-model.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const RULE_VERSION = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const PRIORITY = { PASS: 0, REVIEW_HOLD: 1, FAIL: 2 };
const TABLES = Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables).sort();
const PHASES = ["T3", "T2", "T1", "T0"];
const RESOURCE_KEYS = ["database", "cluster", "composeProject", "volume", "container", "apiPort", "webPort", "fileRoot", "stagingRoot", "evidenceRoot", "accountSet", "runId"];
const RESIDUAL_CATEGORIES = ["business_rows", "control_rows", "record_maps", "database", "role", "container", "network", "volume", "account", "file", "port", "process", "credential_artifact"];
const ARTIFACT_KINDS = {
  sealedPlan: "sealed_plan_binding", sourceAuthority: "source_authority_evidence", targetIdentity: "target_identity_evidence", sourceLedger: "source_ledger", moneyLedger: "numeric_reconciliation_evidence", semanticInventory: "semantic_inventory_evidence", casReceipts: "cas_receipt_evidence", rehearsalEvidence: "rehearsal_ab_evidence", restoreEvidence: "restore_fault_evidence", uatEvidence: "technical_uat_evidence", sideEffectEvidence: "side_effect_evidence", runtimeEvidence: "runtime_release_evidence", rollbackEvidence: "rollback_evidence", residualEvidence: "classified_residual_evidence",
};

export class ProductionImportMachineAttestationError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "ProductionImportMachineAttestationError"; this.code = code; }
}
const fail = (code, detail) => { throw new ProductionImportMachineAttestationError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sha = value => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isSafeInteger(value)) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INVALID", "canonical numbers must be safe integers"); return value; }
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INVALID", "plain JSON required");
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export const canonicalProductionImportMachineJson = value => JSON.stringify(canonical(value));
export const computeProductionImportMachineArtifactHash = (kind, payload) => sha(`yuzhou-hr-machine-evidence-v2\0${kind}\0${canonicalProductionImportMachineJson(payload)}`);
export const computeProductionImportMachineEvidenceRoot = ({ triple, bindings }) => sha(`yuzhou-hr-machine-evidence-root-v2\0${canonicalProductionImportMachineJson({ triple, bindings: [...bindings].sort((a, b) => a.key.localeCompare(b.key)) })}`);
const tripleValid = value => object(value) && CODE_SHA.test(value.codeSha ?? "") && SHA256.test(value.sourceSnapshotHash ?? "") && SHA256.test(value.mappingContractHash ?? "");
const equal = (a, b) => canonicalProductionImportMachineJson(a) === canonicalProductionImportMachineJson(b);
const reason = (reasons, status, code) => { if (!reasons.has(code) || PRIORITY[status] > PRIORITY[reasons.get(code)]) reasons.set(code, status); };
const allSha = (value, keys) => keys.every(key => SHA256.test(value?.[key] ?? ""));
const resourceRegistryHash = (rehearsal, resources) => computeProductionImportMachineArtifactHash("rehearsal_resource_registry", { rehearsal, resources });
function decimal(value) { const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u.exec(value ?? ""); return match ? { sign: match[1] === "-" ? -1n : 1n, integer: match[2], fraction: match[3] ?? "" } : null; }
function decimalSum(total, parts) { const parsed = [total, ...parts].map(decimal); if (parsed.some(value => !value)) return false; const scale = Math.max(...parsed.map(value => value.fraction.length)); const integer = value => value.sign * BigInt(`${value.integer}${value.fraction.padEnd(scale, "0")}`); return integer(parsed[0]) === parsed.slice(1).reduce((sum, value) => sum + integer(value), 0n); }

function loadArtifacts(bundle, expectedRoot, reasons) {
  if (!SHA256.test(expectedRoot ?? "")) fail("PRODUCTION_IMPORT_MACHINE_TRUST_ROOT_REQUIRED", "expectedEvidenceRootSha256 is required");
  const index = bundle?.evidenceIndex;
  if (!object(index) || index.artifactKind !== "evidence_index" || !SHA256.test(index.artifactSha256 ?? "") || !object(index.payload)) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INDEX_INVALID", "evidence index envelope invalid");
  if (computeProductionImportMachineArtifactHash("evidence_index", index.payload) !== index.artifactSha256) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INDEX_HASH_MISMATCH", "evidence index bytes differ");
  if (!tripleValid(index.payload.triple) || !Array.isArray(index.payload.bindings)) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INDEX_INVALID", "index C/S/M or bindings invalid");
  const seen = new Set();
  for (const binding of index.payload.bindings) {
    if (!object(binding) || !ARTIFACT_KINDS[binding.key] || binding.artifactKind !== ARTIFACT_KINDS[binding.key] || !SHA256.test(binding.artifactSha256 ?? "") || seen.has(binding.key)) fail("PRODUCTION_IMPORT_MACHINE_EVIDENCE_INDEX_INVALID", "binding invalid");
    seen.add(binding.key);
  }
  const root = computeProductionImportMachineEvidenceRoot(index.payload);
  if (root !== expectedRoot) fail("PRODUCTION_IMPORT_MACHINE_TRUST_ROOT_MISMATCH", "evidence root is not trusted");
  const artifacts = {};
  for (const [key, kind] of Object.entries(ARTIFACT_KINDS)) {
    const binding = index.payload.bindings.find(item => item.key === key), envelope = bundle.artifacts?.[key];
    if (!binding || !envelope) { reason(reasons, "REVIEW_HOLD", `MACHINE_${key.toUpperCase()}_MISSING`); continue; }
    if (!object(envelope) || envelope.artifactKind !== kind || envelope.artifactSha256 !== binding.artifactSha256 || !object(envelope.payload) || computeProductionImportMachineArtifactHash(kind, envelope.payload) !== envelope.artifactSha256) { reason(reasons, "FAIL", "MACHINE_ARTIFACT_BINDING_OR_HASH_MISMATCH"); continue; }
    artifacts[key] = envelope.payload;
  }
  return { triple: index.payload.triple, root, artifacts };
}
function verifyAuthority(a, triple, reasons) { if (a && (a.readOnly !== true || a.sourceUnlocked !== false || !allSha(a, ["backupSha256", "catalogSha256", "businessSha256", "tableLedgerSha256"]) || a.sourceSnapshotHash !== triple.sourceSnapshotHash)) reason(reasons, "FAIL", "MACHINE_SOURCE_AUTHORITY_INVALID"); }
function verifyTarget(a, reasons) { if (a && (!allSha(a, ["serverIdentitySha256", "clusterIdentitySha256", "databaseIdentitySha256", "userIdentitySha256", "tenantIdentitySha256", "parkIdentitySha256", "scopeSha256"]) || a.environment !== "production_candidate")) reason(reasons, "FAIL", "MACHINE_TARGET_IDENTITY_INVALID"); }
function verifySourceLedger(a, reasons) {
  if (!a) return new Map(); if (!Array.isArray(a.objects)) { reason(reasons, "FAIL", "MACHINE_SOURCE_LEDGER_INVALID"); return new Map(); }
  const rows = new Map();
  for (const row of a.objects) { if (!object(row) || typeof row.sourceObject !== "string" || !TABLES.includes(row.targetTable) || rows.has(row.targetTable)) { reason(reasons, "FAIL", "MACHINE_SOURCE_LEDGER_INVALID"); continue; } rows.set(row.targetTable, row); const values = [row.source, row.loaded, row.quarantined, row.approvedIgnored]; if (values.some(value => !Number.isSafeInteger(value) || value < 0) || row.source !== row.loaded + row.quarantined + row.approvedIgnored) reason(reasons, "FAIL", "MACHINE_SOURCE_LEDGER_CONSERVATION_FAILED"); if (row.quarantined > 0 && !SHA256.test(row.quarantineReasonLedgerSha256 ?? "")) reason(reasons, "FAIL", "MACHINE_SOURCE_LEDGER_QUARANTINE_REASON_MISSING"); if (row.approvedIgnored > 0 && !SHA256.test(row.approvedIgnoredReasonLedgerSha256 ?? "")) reason(reasons, "FAIL", "MACHINE_SOURCE_LEDGER_APPROVED_IGNORE_REASON_MISSING"); }
  if (!equal([...rows.keys()].sort(), TABLES)) reason(reasons, "REVIEW_HOLD", "MACHINE_SOURCE_LEDGER_16_TABLE_COVERAGE_INCOMPLETE"); return rows;
}
function verifyMoney(a, reasons) {
  if (!a) return; const t3 = a.t3, t4 = a.t4;
  if (a.allAmountsDatabaseNumeric !== true || a.reconciled !== true || !object(t3) || !object(t4) || !SHA256.test(t3.numericTotalsSha256 ?? "") || !decimalSum(t3.amountSource, [t3.amountLoaded, t3.amountQuarantined, t3.amountApprovedIgnored])) { reason(reasons, "FAIL", "MACHINE_NUMERIC_EVIDENCE_INVALID"); return; }
  if (!equal({ calendars: t3.calendars, days: t3.days, policies: t3.policies, policyItems: t3.policyItems, periods: t3.periods, periodsLoaded: t3.periodsLoaded, periodsQuarantined: t3.periodsQuarantined, insuranceItems: t3.insuranceItems }, { calendars: 144, days: 4383, policies: 12, policyItems: 144, periods: 35008, periodsLoaded: 34787, periodsQuarantined: 221, insuranceItems: 208722 })) reason(reasons, "FAIL", "MACHINE_T3_FROZEN_FACT_MISMATCH");
  if (!equal({ hot: t4.hot, loaded: t4.loaded, quarantined: t4.quarantined, items: t4.items, closes: t4.closes, coldArchive: t4.coldArchive, net: t4.net }, { hot: 8342, loaded: 8320, quarantined: 22, items: 190374, closes: 266, coldArchive: 37750, net: "15723009.9100" })) reason(reasons, "FAIL", "MACHINE_T4_FROZEN_FACT_MISMATCH");
  if (!decimalSum(t4.net, [t4.loadedNet, t4.quarantinedNet, t4.approvedIgnoredNet])) reason(reasons, "FAIL", "MACHINE_T4_AMOUNT_RECONCILIATION_FAILED");
}
function verifySemantics(a, reasons) {
  if (!a) return; if (!Number.isSafeInteger(a.expectedCount) || a.expectedCount <= 0 || !Array.isArray(a.entries) || a.evaluatedCount !== a.entries.length || a.expectedCount !== a.evaluatedCount || !SHA256.test(a.inventorySha256 ?? "")) { reason(reasons, "FAIL", "MACHINE_SEMANTIC_INVENTORY_CONSERVATION_FAILED"); return; }
  const ids = new Set();
  for (const row of a.entries) { if (!object(row) || !SHA256.test(row.itemIdentitySha256 ?? "") || ids.has(row.itemIdentitySha256) || !SHA256.test(row.sourceIdentitySha256 ?? "") || !RULE_VERSION.test(row.ruleVersion ?? "") || !["source_exact", "target_exact", "derived_deterministic", "quarantined_ambiguous", "unsupported"].includes(row.classification) || !["insert", "merge", "skip_approved", "quarantine"].includes(row.targetDisposition)) { reason(reasons, "FAIL", "MACHINE_SEMANTIC_INVENTORY_INVALID"); continue; } ids.add(row.itemIdentitySha256); const writeable = ["source_exact", "target_exact", "derived_deterministic"].includes(row.classification); if (writeable === (row.targetDisposition === "quarantine")) reason(reasons, "FAIL", "MACHINE_SEMANTIC_DISPOSITION_INVALID"); if (!writeable && !/^QUARANTINE_[A-Z0-9_]{3,63}$/u.test(row.reasonCode ?? "")) reason(reasons, "FAIL", "MACHINE_SEMANTIC_QUARANTINE_REASON_INVALID"); }
}
function verifyCas(a, ledger, reasons) {
  if (!a) return; if (!Array.isArray(a.receipts)) { reason(reasons, "FAIL", "MACHINE_CAS_RECEIPTS_INVALID"); return; } const ids = new Set(), count = new Map(TABLES.map(table => [table, { loaded: 0, approvedIgnored: 0 }]));
  for (const row of a.receipts) { if (!object(row) || !SHA256.test(row.sourceIdentitySha256 ?? "") || ids.has(row.sourceIdentitySha256) || !TABLES.includes(row.targetTable) || !["insert", "merge", "skip_approved"].includes(row.disposition) || !Number.isSafeInteger(row.affectedRows) || row.affectedRows !== (row.disposition === "skip_approved" ? 0 : 1) || !SHA256.test(row.afterCanonicalSha256 ?? "") || !SHA256.test(row.projectionMapSha256 ?? "") || !SHA256.test(row.batchPhaseSha256 ?? "") || !Number.isSafeInteger(row.versionAfter)) { reason(reasons, "FAIL", "MACHINE_CAS_RECEIPTS_INVALID"); continue; } ids.add(row.sourceIdentitySha256); const counts = count.get(row.targetTable); counts[row.disposition === "skip_approved" ? "approvedIgnored" : "loaded"] += 1; if (row.disposition === "insert" && (row.beforeCanonicalSha256 !== null || row.versionBefore !== null || row.versionAfter !== 1)) reason(reasons, "FAIL", "MACHINE_CAS_TRANSITION_INVALID"); if (["merge", "skip_approved"].includes(row.disposition) && (!SHA256.test(row.beforeCanonicalSha256 ?? "") || !Number.isSafeInteger(row.versionBefore) || row.versionAfter !== row.versionBefore + (row.disposition === "merge" ? 1 : 0))) reason(reasons, "FAIL", "MACHINE_CAS_TRANSITION_INVALID"); if (row.disposition === "skip_approved" && row.afterCanonicalSha256 !== row.beforeCanonicalSha256) reason(reasons, "FAIL", "MACHINE_CAS_TRANSITION_INVALID"); }
  for (const table of TABLES) if (ledger.has(table) && (count.get(table).loaded !== ledger.get(table).loaded || count.get(table).approvedIgnored !== ledger.get(table).approvedIgnored)) reason(reasons, "FAIL", "MACHINE_CAS_LEDGER_COUNT_MISMATCH");
}
function verifyRehearsals(a, triple, envelopes, reasons) {
  if (!a || !Array.isArray(a.rehearsals)) return; const runs = new Map();
  for (const run of a.rehearsals) { if (!object(run) || !["A", "B"].includes(run.rehearsal) || runs.has(run.rehearsal) || !tripleValid(run.triple) || !equal(run.triple, triple) || !allSha(run, ["manifestSha256", "canonicalResultRootSha256", "quarantineReasonLedgerSha256", "sourceLedgerSha256", "moneyLedgerSha256", "semanticInventorySha256", "casReceiptsSha256"]) || !object(run.resources) || !RESOURCE_KEYS.every(key => SHA256.test(run.resources[key] ?? "")) || run.status !== "PASS") { reason(reasons, "FAIL", "MACHINE_REHEARSAL_INVALID"); continue; } runs.set(run.rehearsal, run); }
  if (!runs.has("A") || !runs.has("B")) { reason(reasons, "REVIEW_HOLD", "MACHINE_REHEARSAL_AB_MISSING"); return; } const left = runs.get("A"), right = runs.get("B");
  if (left.manifestSha256 === right.manifestSha256 || RESOURCE_KEYS.some(key => left.resources[key] === right.resources[key])) reason(reasons, "FAIL", "MACHINE_REHEARSAL_RESOURCES_NOT_INDEPENDENT");
  if (left.canonicalResultRootSha256 !== right.canonicalResultRootSha256 || left.quarantineReasonLedgerSha256 !== right.quarantineReasonLedgerSha256) reason(reasons, "FAIL", "MACHINE_REHEARSAL_AB_RESULT_MISMATCH");
  for (const run of [left, right]) for (const [field, key] of [["sourceLedgerSha256", "sourceLedger"], ["moneyLedgerSha256", "moneyLedger"], ["semanticInventorySha256", "semanticInventory"], ["casReceiptsSha256", "casReceipts"]]) if (envelopes[key] && run[field] !== envelopes[key].artifactSha256) reason(reasons, "FAIL", "MACHINE_REHEARSAL_ARTIFACT_BINDING_MISMATCH");
}
function verifyRestore(a, rehearsalEvidence, reasons) { if (!a || !Array.isArray(a.runs) || !equal(a.runs.map(row => row.rehearsal).sort(), ["A", "B"])) { if (a) reason(reasons, "FAIL", "MACHINE_RESTORE_EVIDENCE_INVALID"); return; } const expected = new Map((rehearsalEvidence?.rehearsals ?? []).map(row => [row.rehearsal, row])); for (const row of a.runs) { const rehearsal = expected.get(row.rehearsal); if (!allSha(row, ["backupSha256", "tocSha256", "faultObservationSha256", "restoredCanonicalSha256", "newDatabaseIdentitySha256"]) || row.restoreToNewDatabase !== true || row.faultInjected !== true || row.status !== "PASS" || (rehearsal && (row.restoredCanonicalSha256 !== rehearsal.canonicalResultRootSha256 || row.newDatabaseIdentitySha256 === rehearsal.resources.database))) reason(reasons, "FAIL", "MACHINE_RESTORE_EVIDENCE_INVALID"); } if (a.runs[0].newDatabaseIdentitySha256 === a.runs[1].newDatabaseIdentitySha256) reason(reasons, "FAIL", "MACHINE_RESTORE_DATABASE_NOT_INDEPENDENT"); }
function verifyUat(a, reasons) { if (!a || !Array.isArray(a.runs) || !equal(a.runs.map(row => row.rehearsal).sort(), ["A", "B"])) { if (a) reason(reasons, "FAIL", "MACHINE_UAT_EVIDENCE_INVALID"); return; } for (const row of a.runs) if (!["api", "rbac", "desktop", "phone390"].every(key => Number.isSafeInteger(row[key]?.passed) && row[key].passed > 0 && row[key].failed === 0 && SHA256.test(row[key].evidenceSha256 ?? "")) || row.desktop.width < 1280 || row.phone390.width !== 390) reason(reasons, "FAIL", "MACHINE_UAT_EVIDENCE_INVALID"); }
function verifySideEffects(a, reasons) { if (!a || !Array.isArray(a.runs) || !equal(a.runs.map(row => row.rehearsal).sort(), ["A", "B"])) { if (a) reason(reasons, "FAIL", "MACHINE_SIDE_EFFECT_EVIDENCE_INVALID"); return; } for (const row of a.runs) if (!Array.isArray(row.surfaces) || row.surfaces.length === 0 || row.surfaces.some(surface => !allSha(surface, ["beforeSha256", "afterSha256"]) || surface.beforeSha256 !== surface.afterSha256 || surface.zeroWrites !== true)) reason(reasons, "FAIL", "MACHINE_PROTECTED_SIDE_EFFECT_CHANGED"); }
function verifyRuntime(a, triple, reasons) { if (a && (!allSha(a, ["migrationHistorySha256", "seedHistorySha256", "releaseEvidenceSha256"]) || ![a.codeSha, a.mainSha, a.runtimeSha].every(value => CODE_SHA.test(value ?? "")) || a.codeSha !== triple.codeSha || a.mainSha !== a.codeSha || a.runtimeSha !== a.codeSha)) reason(reasons, "FAIL", "MACHINE_RUNTIME_RELEASE_MISMATCH"); }
function verifyRollback(a, reasons) { if (!a || !Array.isArray(a.runs) || !equal(a.runs.map(row => row.rehearsal).sort(), ["A", "B"])) { if (a) reason(reasons, "FAIL", "MACHINE_ROLLBACK_EVIDENCE_INVALID"); return; } for (const run of a.runs) if (!equal(run.order, PHASES) || !Array.isArray(run.phases) || !equal(run.phases.map(row => row.phase), PHASES) || run.phases.some(row => !SHA256.test(row.receiptSha256 ?? "") || !Number.isSafeInteger(row.affectedRows) || row.affectedRows < 0 || row.status !== "PASS")) reason(reasons, "FAIL", "MACHINE_ROLLBACK_ORDER_OR_PHASE_INVALID"); }
function verifyResidual(a, rehearsalEvidence, reasons) { if (!a || !Array.isArray(a.runs) || !equal(a.runs.map(row => row.rehearsal).sort(), ["A", "B"])) { if (a) reason(reasons, "FAIL", "MACHINE_RESIDUAL_EVIDENCE_INVALID"); return; } const resources = new Map((rehearsalEvidence?.rehearsals ?? []).map(row => [row.rehearsal, row.resources])); for (const run of a.runs) if (!SHA256.test(run.resourceRegistrySha256 ?? "") || (resources.has(run.rehearsal) && run.resourceRegistrySha256 !== resourceRegistryHash(run.rehearsal, resources.get(run.rehearsal))) || !Array.isArray(run.categories) || !equal(run.categories.map(row => row.category).sort(), [...RESIDUAL_CATEGORIES].sort()) || run.categories.some(row => ![row.planned, row.observed, row.removed, row.residualCount].every(value => Number.isSafeInteger(value) && value >= 0) || row.planned !== row.observed || row.observed !== row.removed + row.residualCount || row.residualCount !== 0 || !SHA256.test(row.observationSha256 ?? ""))) reason(reasons, "FAIL", "MACHINE_CLASSIFIED_RESIDUAL_NONZERO_OR_INVALID"); }

export function compileProductionImportMachineAttestation(bundle, { expectedEvidenceRootSha256 } = {}) {
  const reasons = new Map(), loaded = loadArtifacts(bundle, expectedEvidenceRootSha256, reasons), a = loaded.artifacts;
  verifyAuthority(a.sourceAuthority, loaded.triple, reasons); verifyTarget(a.targetIdentity, reasons); const ledger = verifySourceLedger(a.sourceLedger, reasons); verifyMoney(a.moneyLedger, reasons); verifySemantics(a.semanticInventory, reasons); verifyCas(a.casReceipts, ledger, reasons); verifyRehearsals(a.rehearsalEvidence, loaded.triple, bundle.artifacts ?? {}, reasons); verifyRestore(a.restoreEvidence, a.rehearsalEvidence, reasons); verifyUat(a.uatEvidence, reasons); verifySideEffects(a.sideEffectEvidence, reasons); verifyRuntime(a.runtimeEvidence, loaded.triple, reasons); verifyRollback(a.rollbackEvidence, reasons); verifyResidual(a.residualEvidence, a.rehearsalEvidence, reasons);
  if (a.sealedPlan && (!SHA256.test(a.sealedPlan.sealedPlanSha256 ?? "") || !tripleValid(a.sealedPlan.triple) || !equal(a.sealedPlan.triple, loaded.triple) || (bundle.artifacts?.sourceAuthority && a.sealedPlan.sourceAuthoritySha256 !== bundle.artifacts.sourceAuthority.artifactSha256) || (bundle.artifacts?.targetIdentity && a.sealedPlan.targetIdentitySha256 !== bundle.artifacts.targetIdentity.artifactSha256) || (bundle.artifacts?.sourceLedger && a.sealedPlan.sourceLedgerSha256 !== bundle.artifacts.sourceLedger.artifactSha256) || (bundle.artifacts?.moneyLedger && a.sealedPlan.moneyLedgerSha256 !== bundle.artifacts.moneyLedger.artifactSha256))) reason(reasons, "FAIL", "MACHINE_SEALED_PLAN_BINDING_INVALID");
  const reasonCodes = [...reasons.keys()].sort(), status = reasonCodes.reduce((state, code) => PRIORITY[reasons.get(code)] > PRIORITY[state] ? reasons.get(code) : state, "PASS");
  const attestation = { formatVersion: 2, artifactKind: "machine_attestation", attestationVersion: "yuzhou-hr-production-import-machine-attestation-v2", status, reasonCodes, triple: loaded.triple, expectedEvidenceRootSha256, evidenceIndexSha256: bundle.evidenceIndex.artifactSha256, assertionMode: "trusted_root_deterministic_fixed_rules", humanSignature: false, humanIdentityAsserted: false, productionImport: "HOLD" };
  return { ...attestation, integrityDigest: sha(`yuzhou-hr-machine-attestation-v2\0${canonicalProductionImportMachineJson(attestation)}`) };
}
