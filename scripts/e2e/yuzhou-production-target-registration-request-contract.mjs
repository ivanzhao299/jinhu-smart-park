import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";

import { createProductionTargetRegistrationRequest, parseProductionTargetRegistrationRequestArgs, prepareProductionTargetRegistrationRequest } from "../prepare-yuzhou-production-target-registration-request.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const actorId = "11111111-1111-4111-8111-111111111111";
const privateWrite = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const mode = path => (statSync(path).mode & 0o777).toString(8);
const attestation = () => ({
  formatVersion: 1, kind: "yuzhou_hr_production_target_readonly_attestation", status: "HOLD", productionImport: "HOLD", executionReachable: false,
  scopeAssignmentCount: 1, validScopeCount: 1, targetIdentitySha256: hash("target"), targetScopeSha256: hash("scope"),
  reasonCodes: ["PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"],
});

test("target registration request binds only the attested hashes and preserves the production hold", () => {
  const request = createProductionTargetRegistrationRequest({ attestation: attestation(), attestationSha256: hash("attestation"), actorId });
  assert.equal(request.productionImport, "HOLD");
  assert.equal(request.executionReachable, false);
  assert.equal(request.target.targetIdentitySha256, hash("target"));
  assert.deepEqual(request.requiredNextEvidence, ["current_production_prebackup_receipt", "t0_t3_before_image_snapshots", "t0_t3_active_legacy_record_map_snapshots"]);
  assert.throws(() => createProductionTargetRegistrationRequest({ attestation: { ...attestation(), validScopeCount: 2 }, attestationSha256: hash("attestation"), actorId }), error => error.code === "PRODUCTION_TARGET_REGISTRATION_ATTESTATION_INVALID");
});

test("registration CLI accepts only a private attestation and creates a new private held signing input", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-production-target-registration-"));
  try {
    const outputDir = join(root, "out"); mkdirSync(outputDir, { mode: 0o700 }); chmodSync(outputDir, 0o700);
    const attestationPath = join(root, "attestation.json"); privateWrite(attestationPath, attestation());
    const input = parseProductionTargetRegistrationRequestArgs(["--attestation", attestationPath, "--actor-id", actorId, "--output-dir", outputDir, "--request-id", "target-registration-01"]);
    const result = prepareProductionTargetRegistrationRequest(input);
    assert.equal(result.productionImport, "HOLD"); assert.equal(result.executionReachable, false); assert.equal(mode(result.output), "600");
    const written = JSON.parse(readFileSync(result.output, "utf8"));
    assert.equal(written.requestedAction, "separate_allowlist_review_required"); assert.equal(written.target.targetScopeSha256, hash("scope"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
