import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createT5ProductionBindingRequest, parseT5ProductionBindingRequestArgs, prepareT5ProductionBindingRequest } from "../prepare-yuzhou-production-import-t5-binding-request.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const actorId = "11111111-1111-4111-8111-111111111111";
const privateWrite = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const mode = path => (statSync(path).mode & 0o777).toString(8);
const triple = () => ({ codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") });
const receipt = currentTriple => ({
  formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_stage_receipt", phase: "T5", triple: currentTriple,
  sourceSnapshotSha256: currentTriple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("restore"), sourceBusinessSha256: hash("business"), privateStageSha256: hash("private"), recordCount: 3,
  targetTableCounts: {
    hr_employee_profile: { insert: 1, quarantine: 0 }, hr_employee_family: { insert: 0, quarantine: 0 },
    hr_employee_skill: { insert: 1, quarantine: 0 }, hr_employee_credential: { insert: 0, quarantine: 1 },
  }, productionImport: "HOLD",
});

test("T5 binding request carries only verified hashes, count, and audit actor into a still-held signing input", () => {
  const currentTriple = triple();
  const request = createT5ProductionBindingRequest({ triple: currentTriple, receipt: receipt(currentTriple), actorId });
  assert.equal(request.productionImport, "HOLD");
  assert.equal(request.t5Nonfile.actorId, actorId);
  assert.equal(request.authorizationBinding.t5NonfilePrivateStageSha256, hash("private"));
  assert.deepEqual(request.requiredPlanFields, ["t5Nonfile", "authorization.binding.t5NonfilePrivateStageSha256", "rollback.order[0]=T5"]);
  assert.equal(JSON.stringify(request).includes("targetTableCounts"), false);
  assert.throws(() => createT5ProductionBindingRequest({ triple: currentTriple, receipt: { ...receipt(currentTriple), recordCount: 4 }, actorId }), error => error.code === "T5_BINDING_REQUEST_RECEIPT_INVALID");
});

test("binding request CLI accepts only 0600 receipt/triple and writes a new 0600 held request", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-binding-request-"));
  try {
    const outputDir = join(root, "out"); mkdirSync(outputDir, { mode: 0o700 }); chmodSync(outputDir, 0o700);
    const currentTriple = triple();
    const receiptPath = join(root, "receipt.json"); const triplePath = join(root, "triple.json");
    privateWrite(receiptPath, receipt(currentTriple)); privateWrite(triplePath, currentTriple);
    const input = parseT5ProductionBindingRequestArgs(["--receipt", receiptPath, "--triple", triplePath, "--actor-id", actorId, "--output-dir", outputDir, "--request-id", "binding01"]);
    const result = prepareT5ProductionBindingRequest(input);
    assert.equal(result.productionImport, "HOLD"); assert.equal(result.recordCount, 3); assert.equal(mode(result.output), "600");
    const written = JSON.parse(readFileSync(result.output, "utf8"));
    assert.equal(written.t5Nonfile.privateStageSha256, hash("private")); assert.equal(JSON.stringify(written).includes("targetTableCounts"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
