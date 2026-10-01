/* global Buffer */
import { generateKeyPairSync } from "node:crypto";
import { createProductionImportSingleOwnerPolicy, productionImportOperatorPublicKeyHash } from "../hr-cutover/production-import-approval-policy.mjs";
import { T4_COUNTS, canonicalT4, hashT4 } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

export const H = value => hashT4(String(value));
export function fixtureBinding() {
  const scope = { tenantId: "fixture-t4-tenant", parkId: "fixture-t4-park" };
  scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const operationId = "yzprod-import-20261001T000000Z-aaaaaaaaaaaa";
  const parent = { operationId: "yzprod-import-20261001T000000Z-bbbbbbbbbbbb", sealedPlanSha256: H("parent-seal"), recordSetSha256: H("placeholder"), payloadBundleSha256: Object.fromEntries(["T0", "T1", "T2", "T3"].map(p => [p, H(p)])) };
  parent.receiptSha256 = H(`${parent.operationId}\0${parent.sealedPlanSha256}\0succeeded\0T0,T1,T2,T3`);
  return { formatVersion: 1, artifactKind: "yuzhou_t4_followon_binding", intent: "APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE", operationId, triple: { codeSha: "c".repeat(40), sourceSnapshotHash: H("source"), mappingContractHash: H("mapping") }, executionCodeSha: "d".repeat(40), parent, targetIdentitySha256: H("target"), targetScopeSha256: scope.scopeSha256, targetScope: scope, finalRehearsalPairSha256: H("pair"), manifestSha256: H("manifest"), files: Object.fromEntries(["scheme-memberships", "items", "formulas", "tax-rules", "closes", "payslips"].map(f => [`${f}.jsonl`, H(f)])), sourceRestoreReceiptSha256: H("restore"), sourceBusinessSha256: H("business"), counts: T4_COUNTS, amountTotals: { full: { gross_total: T4_COUNTS.fullNet, deduction_total: "0.0000", tax_total: "0.0000", net_total: T4_COUNTS.fullNet }, hot: { gross_total: T4_COUNTS.hotNet, deduction_total: "0.0000", tax_total: "0.0000", net_total: T4_COUNTS.hotNet } }, mode: "full_archive", windowStartsAt: new Date(Date.now() - 60000).toISOString(), windowEndsAt: new Date(Date.now() + 86400000).toISOString(), runtimeReceiptSha256: H("runtime") };
}
export function fixtureAuthorization(binding, intent = "append", nonce = intent) {
  const { privateKey } = generateKeyPairSync("ed25519");
  const context = { operationId: binding.operationId, binding: intent === "append" ? binding : { ...binding, intent: "ROLLBACK_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE" }, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: binding.windowEndsAt, nonceSha256: H(nonce), preparationArtifacts: { preparedSha256: H("prepared"), reviewedSha256: H("reviewed"), bridgeEvidenceSha256: H("bridge") }, payloadBundleSha256: binding.parent.payloadBundleSha256 };
  const confirmation = { formatVersion: 1, artifactKind: "yuzhou_hr_single_owner_confirmation", provenance: "explicit_user_confirmation", decision: "AUTHORIZE_DELEGATED_OPERATION", ownerSubjectRefSha256: H("synthetic-owner"), confirmationEvidenceSha256: H("synthetic-test-only"), operatorSubjectRefSha256: H("synthetic-operator"), operatorPublicKeySha256: productionImportOperatorPublicKeyHash(privateKey), context };
  return { context, ...createProductionImportSingleOwnerPolicy({ confirmation, operatorSigningKey: privateKey }) };
}
export const fixtureParentReceipt = binding => ({ status: "SUCCEEDED", sealedPlanSha256: binding.parent.sealedPlanSha256, targetScopeSha256: binding.targetScopeSha256, receiptSha256: binding.parent.receiptSha256, domains: ["T0", "T1", "T2", "T3"] });

export function fixtureStage(binding) {
  const wrap = (source, extra = {}) => ({ source, sourceRowSha256: H(canonicalT4(source)), ...extra });
  const memberships = Array.from({ length: 647 }, (_, i) => wrap({ scheme: "1", id: String(i + 1), person: "fixture-employee" }));
  const items = Array.from({ length: 711 }, (_, i) => wrap({ scheme: i < 24 ? "1" : String(2 + (i - 24) % 34), itemname: `U${i}`, description: `Synthetic item ${i}`, datatype: "数值", itemtype: "数值", addorsub: "增加项", myorder: String(i) }, { declarativeMetadata: { decimalScale: "4", legacyMetadataReviewRequired: true } }));
  const formulas = Array.from({ length: 244 }, (_, i) => wrap({ scheme: "1", id: String(i + 1), itemname: "U0", expression: "1", myorder: "1" }, { lexicalProfile: { expressionSha256: H("1") } }));
  const tax = Array.from({ length: 9 }, (_, i) => wrap({ id: String(i + 1), base: { decimal: "0.0000" }, limit1: { decimal: "0.0000" }, limit2: { decimal: "1.0000" }, taxpercent: { decimal: "0.0000" }, offset: { decimal: "0.0000" } }));
  const closes = [];
  for (const [start, end, count] of [[2010, 2023, 1165], [2024, 2026, 266]]) {
    closes.push(wrap({ scheme: "1", year: String(end), month: "12", closestate: "1" }));
    for (let year = start; closes.filter(r => Number(r.source.year) >= start && Number(r.source.year) <= end).length < count; year++) {
      for (let month = 1; month <= 12; month++) for (let scheme = 1; scheme <= 35; scheme++) {
        if (closes.filter(r => Number(r.source.year) >= start && Number(r.source.year) <= end).length >= count) break;
        closes.push(wrap({ scheme: String(scheme), year: String(year), month: String(month), closestate: "1" }));
      }
    }
  }
  const lines = [];
  for (let i = 0; i < 46092; i++) {
    const hot = i >= 37750, n = hot ? i - 37750 : i;
    const size = hot ? (n < 7356 ? 23 : 22) : (n < 18890 ? 24 : 23);
    const net = n === 0 ? (hot ? T4_COUNTS.hotNet : "86471046.8900") : "0.0000";
    const values = Array.from({ length: size }, (_, j) => ({ legacyColumn: `U${j}`, systemSummary: ["net_total", "gross_total", "deduction_total", "tax_total"][j] ?? null, value: { kind: "decimal", decimal: j < 2 ? net : "0.0000" } }));
    const year = hot ? (n === 0 ? "2026" : "2024") : (n === 0 ? "2023" : "2010");
    const month = n === 0 ? "12" : "1";
    lines.push(JSON.stringify(wrap({ year, month, person: i === 46091 ? "fixture-unmapped" : "fixture-employee" }, { sourceTable: "dbo.salary01", legacyScheme: 1, sourceContentGroupSha256: H(`group-${i}`), sourceMultiplicity: "1", disposition: "candidate", values })) + "\n");
  }
  const buffers = Object.fromEntries([["scheme-memberships", memberships], ["items", items], ["formulas", formulas], ["tax-rules", tax], ["closes", closes]].map(([name, rows]) => [`${name}.jsonl`, Buffer.from(rows.map(row => JSON.stringify(row) + "\n").join(""))]));
  buffers["payslips.jsonl"] = Buffer.from(lines.join(""));
  binding.files = Object.fromEntries(Object.entries(buffers).map(([name, bytes]) => [name, hashT4(bytes)]));
  const manifest = { formatVersion: 1, productionImport: "HOLD", profileVersion: "synthetic-fixture", actualCatalogSha256: H("catalog"), sourceBackupSha256: binding.triple.sourceSnapshotHash, mappingContractSha256: binding.triple.mappingContractHash, sourceRestoreReceiptSha256: binding.sourceRestoreReceiptSha256, actualSourceRows: "46092", minimumYear: "2010", maximumYear: "2026", outputFiles: Object.fromEntries(Object.entries(binding.files).map(([name, hash]) => [name, { fileSha256: hash }])) };
  manifest.businessContentSha256 = H(canonicalT4({ profileVersion: manifest.profileVersion, catalogSha256: manifest.actualCatalogSha256, outputFiles: binding.files }));
  binding.sourceBusinessSha256 = manifest.businessContentSha256;
  binding.manifestSha256 = H(JSON.stringify(manifest));
  return { manifest, manifestBytes: Buffer.from(JSON.stringify(manifest)), buffers };
}
