import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { canonicalT5Baseline } from "../hr-cutover/t5-canonical-baseline.mjs";
import { rebaseT5CanonicalBaseline } from "../hr-cutover/rebase-t5-canonical-baseline.mjs";

const rebaseCli = readFileSync(resolve(import.meta.dirname, "../hr-cutover/rebase-t5-canonical-baseline.mjs"), "utf8");
assert.match(rebaseCli, /T5_BASELINE_REBASE_FAILED/);

const sha = value => createHash("sha256").update(value).digest("hex");
const privateWrite = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const domains = { accept: 0, bonuscode: 8, bonusrecord: 0, compact: 802, compact_c: 357, compacttypecode: 4, course: 0, docs: 1003, family: 4560, his: 375, jch_1: 0, jobstatecode: 8, jobtrain: 0, knowhow: 6, person_core: 2949, person_user: 0, person_user_item: 8, photo: 2949, readjust: 6887, readjustitem: 8, ticket: 237, train: 0, trainhis: 2 };

test("T5 canonical rebase requires a new sealed receipt plus two identical, complete private extracts", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-baseline-rebase-"));
  try {
    const baseline = canonicalT5Baseline();
    const receiptPath = join(root, "receipt.json");
    const receipt = sealSourceRestoreReceipt({ formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: baseline.sourceSnapshotSha256, backup: { sha256: baseline.sourceSnapshotSha256, bytes: 1, containerCopySha256: baseline.sourceSnapshotSha256, containerCopyBytes: 1 }, identities: { containerSha256: "1".repeat(64), imageSha256: "2".repeat(64), databaseSha256: "3".repeat(64), restoreSha256: "4".repeat(64), catalogSha256: "5".repeat(64) }, state: { online: true, readOnly: true }, etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false }, productionImport: "HOLD" });
    privateWrite(receiptPath, `${JSON.stringify(receipt)}\n`);
    const makeStage = name => { const stage = join(root, name); mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700); const stageDomains = {}; for (const [domain, rows] of Object.entries(domains)) { const file = `${domain}.jsonl`; privateWrite(join(stage, file), `fixture-${domain}\n`); stageDomains[domain] = { sourceObject: `dbo.${domain}`, objectStatus: rows ? "present" : "empty", rows, file, fileSha256: sha(readFileSync(join(stage, file))) }; } privateWrite(join(stage, "manifest.json"), `${JSON.stringify({ sensitive: true, productionImport: "HOLD", businessSha256: baseline.businessSha256, catalogSha256: baseline.catalogSha256, mappingContractSha256: baseline.mappingContractSha256, domains: stageDomains })}\n`); return stage; };
    const sourceA = makeStage("a"); const sourceB = makeStage("b"); const output = join(root, "candidate.json"); const evidence = join(root, "evidence.json");
    const freshBusinessSha256 = sha("fresh-real-extract");
    for (const stage of [sourceA, sourceB]) { const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8")); manifest.businessSha256 = freshBusinessSha256; privateWrite(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`); }
    const result = rebaseT5CanonicalBaseline({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputPath: output, evidencePath: evidence });
    assert.equal(result.productionImport, "HOLD");
    assert.notEqual(result.candidate.sourceRestoreReceiptSha256, baseline.sourceRestoreReceiptSha256);
    assert.equal(result.candidate.businessSha256, freshBusinessSha256);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).sourceRestoreReceiptSha256, sha(readFileSync(receiptPath)));
    assert.equal(JSON.parse(readFileSync(evidence, "utf8")).domains.person_core.rows, 2949);
    const sameReceiptBaselinePath = join(root, "same-receipt-baseline.json");
    const sameReceiptBaseline = { ...baseline, sourceRestoreReceiptSha256: sha(readFileSync(receiptPath)) };
    privateWrite(sameReceiptBaselinePath, `${JSON.stringify(sameReceiptBaseline)}\n`);
    const sameReceiptResult = rebaseT5CanonicalBaseline({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, baselinePath: sameReceiptBaselinePath, outputPath: join(root, "same-receipt-candidate.json"), evidencePath: join(root, "same-receipt-evidence.json") });
    assert.equal(sameReceiptResult.candidate.businessSha256, freshBusinessSha256, "a fresh A/B extract may rebase the materialization identity without changing the sealed receipt");
    for (const stage of [sourceA, sourceB]) { const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8")); manifest.businessSha256 = sameReceiptBaseline.businessSha256; privateWrite(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`); }
    assert.throws(() => rebaseT5CanonicalBaseline({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, baselinePath: sameReceiptBaselinePath, outputPath: join(root, "no-change-candidate.json"), evidencePath: join(root, "no-change-evidence.json") }), /T5_BASELINE_REBASE_NOT_NEEDED/);
    for (const stage of [sourceA, sourceB]) { const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8")); manifest.businessSha256 = freshBusinessSha256; privateWrite(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`); }
    const divergentBusiness = JSON.parse(readFileSync(join(sourceB, "manifest.json"), "utf8")); divergentBusiness.businessSha256 = sha("different-real-extract"); privateWrite(join(sourceB, "manifest.json"), `${JSON.stringify(divergentBusiness)}\n`);
    assert.throws(() => rebaseT5CanonicalBaseline({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputPath: join(root, "business-rejected.json"), evidencePath: join(root, "business-rejected-evidence.json") }), /T5_BASELINE_REBASE_AB_MISMATCH/);
    divergentBusiness.businessSha256 = freshBusinessSha256; privateWrite(join(sourceB, "manifest.json"), `${JSON.stringify(divergentBusiness)}\n`);
    const bad = JSON.parse(readFileSync(join(sourceB, "manifest.json"), "utf8")); bad.domains.family.fileSha256 = "0".repeat(64); privateWrite(join(sourceB, "manifest.json"), `${JSON.stringify(bad)}\n`);
    assert.throws(() => rebaseT5CanonicalBaseline({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputPath: join(root, "rejected.json"), evidencePath: join(root, "rejected-evidence.json") }), /T5_BASELINE_REBASE_STAGE_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
