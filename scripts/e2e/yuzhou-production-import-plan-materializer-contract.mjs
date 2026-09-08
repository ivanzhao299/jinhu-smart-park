/* global Buffer */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { materializeProductionImportPlan } from "../hr-cutover/materialize-production-import-plan.mjs";
import { computeProductionImportPayloadHash as hash, validateSealedProductionImportPlan } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
const H = s => createHash("sha256").update(s).digest("hex");
const NOW = new Date("2026-09-09T01:00:00.000Z");
import { fixture } from "./production-import-plan-test-fixture.mjs";
test("synthetic nonempty draft + Ed25519 policy seal accepted by actual validator; pretty JSON bytes retained", t => {
  const f = fixture(t); assert.equal(f.run().status, "DRAFT_MATERIALIZED");
  const { draft } = f.seal();
  assert.equal(draft.unsignedPlan.phases[0].payloadBundleArtifactSha256, f.config.artifacts.phases.T0.payload.sha256);
  assert.notEqual(draft.unsignedPlan.phases[0].payloadBundleArtifactSha256, hash(JSON.parse(readFileSync(f.config.artifacts.phases.T0.payload.path))));
  assert.equal(f.run().status, "SEALED_PLAN_MATERIALIZED");
  const plan = JSON.parse(readFileSync(join(f.config.outputDir, "sealed-plan.json")));
  assert.equal(validateSealedProductionImportPlan(plan, { contract: f.contract, now: NOW }).phases[0].records.length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.config.outputDir, "plan-materialization-receipt.json"))).databaseStateVerified, false);
});
for (const defect of ["hash", "scope", "code", "absence", "baseline", "runtime", "ab"]) test(`draft rejects ${defect} without output`, t => {
  const f = fixture(t);
  if (defect === "hash") f.config.artifacts.phases.T0.payload.sha256 = H("wrong");
  if (defect === "scope") { f.metadata.targetScope.parkId = "other"; f.config.artifacts.metadata = f.put("metadata.json", f.metadata); }
  if (defect === "code") f.config.triple.codeSha = "2".repeat(40);
  if (defect === "absence") { f.baseline.phases.T0.absent = []; f.config.artifacts.baseline = f.put("baseline.json", f.baseline); }
  if (defect === "baseline") { f.baseline.targetIdentitySha256 = H("wrong"); f.config.artifacts.baseline = f.put("baseline.json", f.baseline); }
  if (defect === "runtime") { f.runtime.runtimeCodeSha = "2".repeat(40); f.config.artifacts.runtime = f.put("runtime.json", f.runtime); }
  if (defect === "ab") { f.metadata.finalRehearsalPair.rehearsals[1].residualCount = 1; f.config.artifacts.metadata = f.put("metadata.json", f.metadata); }
  assert.throws(f.run, /PRODUCTION_IMPORT_PLAN_MATERIALIZER_/u); assert.deepEqual(readdirSync(f.config.outputDir), []);
});
for (const defect of ["draft", "auth", "signature", "source", "window"]) test(`seal rejects ${defect} without partial output`, t => {
  const f = fixture(t); f.run(); const { draft, authorization } = f.seal();
  if (defect === "draft") { draft.unsignedPlan.phases[0].expectedAfterCanonicalSha256 = H("tamper"); f.config.artifacts.draft = f.put("changed-draft.json", draft); }
  if (defect === "auth") { authorization.binding.manifestSha256 = H("wrong"); f.config.artifacts.authorization = f.put("authorization.json", authorization); }
  if (defect === "signature") { authorization.approvalPolicy.operatorAttestation.signatureBase64 = Buffer.alloc(64).toString("base64"); f.config.artifacts.authorization = f.put("authorization.json", authorization); }
  if (defect === "source") writeFileSync(f.config.artifacts.phases.T0.payload.path, "{}", { mode: 0o600 });
  if (defect === "window") { authorization.expiresAt = "2026-09-09T00:45:00.000Z"; f.config.artifacts.authorization = f.put("authorization.json", authorization); }
  assert.throws(f.run, /PRODUCTION_IMPORT_PLAN_MATERIALIZER_/u); assert.deepEqual(readdirSync(f.config.outputDir), []);
});
test("bounded budgets fail before output; materializer dependency is pinned", t => {
  const f = fixture(t);
  assert.throws(() => materializeProductionImportPlan(f.put("config.json", f.config).path, { currentHead: () => f.triple.codeSha, now: NOW, contract: f.contract, maximumReadBytes: 1 }), /PRODUCTION_IMPORT_PLAN_MATERIALIZER_/u);
  assert.deepEqual(readdirSync(f.config.outputDir), []);
  assert.match(readFileSync(resolve("scripts/hr-cutover/execute-production-import.mjs"), "utf8"), /"scripts\/hr-cutover\/materialize-production-import-plan\.mjs"/u);
});
