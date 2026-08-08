import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateArtifact, validateCaseSemanticBindings, validateCrossCaseDatasetBindings, validateFormalProvenance, validateObservedTreeSemanticInputs, validateRollbackEvidence, validateTranscriptSemantic } from "./evidence-gate.mjs";
import { buildCompleteTestOnlyFixture, buildUnattestedFormalShapedFixture, buildUnattestedTopLevelFixture, testOnlyProvenance, validateCompleteTestOnlyFixture } from "./test-harness.mjs";
import { hashFile, loadProfile } from "./lib.mjs";

test("artifact gate applies the runner's exact public Next build URL policy", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rollback-artifact-output-"));
  try {
    mkdirSync(resolve(root, "logs/nested"), { recursive: true });
    const writeArtifact = (path, content) => {
      const absolute = resolve(root, path); writeFileSync(absolute, content);
      return { path, ...hashFile(absolute) };
    };
    const publicDocs = "https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config\n";
    for (const command of ["baseline-web-clean-production-build", "web-clean-production-build"]) {
      for (const stream of ["stdout", "stderr"]) {
        const path = `logs/${command}.${stream}.log`;
        assert.doesNotThrow(() => validateArtifact({ artifact: writeArtifact(path, publicDocs), caseRoot: root, usedPaths: new Set() }), path);
      }
    }
    for (const [path, content] of [
      ["logs/api-build.stderr.log", publicDocs],
      ["logs/web-clean-production-build.stderr.log", "https://nextjs.org.evil/docs\n"],
      ["logs/web-clean-production-build.stdout.log", "https:\\/\\/nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats\n"],
      ["logs/web-clean-production-build.stdout.log", "https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats?token=value\n"],
      ["logs/web-clean-production-build.stdout.log.bak", publicDocs],
      ["logs/nested/web-clean-production-build.stdout.log", publicDocs],
      ["logs/../logs/web-clean-production-build.stdout.log", publicDocs]
    ]) {
      assert.throws(() => validateArtifact({ artifact: writeArtifact(path, content), caseRoot: root, usedPaths: new Set() }), /URL/u, path);
    }
    assert.doesNotThrow(() => validateArtifact({ artifact: writeArtifact("logs/web-clean-production-build.stdout.log", publicDocs.trimEnd() + ".\n"), caseRoot: root, usedPaths: new Set() }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("formal evidence gate rejects explicit test-only harness provenance", () => {
  const provenance = testOnlyProvenance({ runner: "0".repeat(64) });
  assert.throws(() => validateFormalProvenance(provenance, { executionPolicySha256: provenance.executionPolicySha256 }), /test-only/u);
});

test("unattested 19-case formal-shaped semantic fixture passes and source/count/transcript/time/cleanup/nonce tampering fails", () => {
  const { profile } = loadProfile(); const fixture = buildUnattestedFormalShapedFixture(profile);
  assert.equal(fixture.root, "CRYPTOGRAPHICALLY_UNATTESTED_TEST_ROOT");
  validateCrossCaseDatasetBindings(fixture.cases.map(({ evidence }) => evidence), profile);
  for (const entry of fixture.cases) { validateCaseSemanticBindings(entry.evidence, profile); validateTranscriptSemantic(entry.evidence, entry.transcript, fixture.run); }
  const altered = (mutate) => { const copy = JSON.parse(JSON.stringify(fixture)); mutate(copy); return copy; };
  assert.throws(() => validateCaseSemanticBindings(altered((x) => { x.cases[0].evidence.sourceDataset.tablesSha256 = "0".repeat(64); }).cases[0].evidence, profile), /source dataset/u);
  assert.throws(() => validateCaseSemanticBindings(altered((x) => { x.cases[0].evidence.sourceDataset.counts[Object.keys(x.cases[0].evidence.sourceDataset.counts)[0]] = 9; }).cases[0].evidence, profile), /count/u);
  const transcriptTamper = altered((x) => { x.cases[0].transcript.events[0].event.sha256 = "0".repeat(64); }); assert.throws(() => validateTranscriptSemantic(transcriptTamper.cases[0].evidence, transcriptTamper.cases[0].transcript, transcriptTamper.run), /hash chain|values/u);
  assert.throws(() => validateCaseSemanticBindings(altered((x) => { x.cases[0].evidence.rtoRpo.startedAt = "2026-08-05T00:00:08.500Z"; }).cases[0].evidence, profile), /timeline/u);
  assert.throws(() => validateCaseSemanticBindings(altered((x) => { x.cases[0].evidence.cleanup.residual.ports = 1; }).cases[0].evidence, profile), /cleanup/u);
  const nonceTamper = altered((x) => { x.run.executionNonce = "b".repeat(64); }); assert.throws(() => validateTranscriptSemantic(nonceTamper.cases[0].evidence, nonceTamper.cases[0].transcript, nonceTamper.run), /hash chain/u);
});

test("test-only fixture positively covers all 19 frozen cases but every case remains inadmissible as FORMAL", () => {
  const { profile } = loadProfile();
  const fixture = validateCompleteTestOnlyFixture(buildCompleteTestOnlyFixture(profile), profile);
  assert.equal(fixture.cases.length, 19);
  for (const entry of fixture.cases) {
    assert.throws(() => validateFormalProvenance(fixture.provenance, { executionPolicySha256: fixture.provenance.executionPolicySha256 }), /test-only/u, entry.id);
  }
  const missing = JSON.parse(JSON.stringify(fixture)); missing.cases.pop();
  assert.throws(() => validateCompleteTestOnlyFixture(missing, profile), /19 cases/u);
});

test("unattested temp-root fixture exercises the production top-level gate and rejects source/count/transcript/time/cleanup/nonce/symlink/manual-semantic tampering", () => {
  const { profile } = loadProfile(); const runId = "rollback-20260805T200000Z-abcdef123456"; const finalSha = "1234567890abcdef1234567890abcdef12345678";
  const parent = mkdtempSync(resolve(tmpdir(), "rollback-top-level-")); const root = resolve(parent, "run");
  try {
    const fixture = buildUnattestedTopLevelFixture({ root, profile, runId, finalSha }); const invoke = () => validateRollbackEvidence({ evidenceRoot: root, expectedRunId: runId, expectedFinalSha: finalSha, unattestedTestRoot: root, unattestedTestProfile: fixture.profile });
    assert.equal(invoke().status, "PASS_UNATTESTED_TEST_ONLY");
    const firstEvidence = resolve(root, "cases", profile.cases[0].id, "case-evidence.json"); const transcript = resolve(root, "cases", profile.cases[0].id, "execution-transcript.json"); const manifest = resolve(root, "run-manifest.json");
    const firstEvidenceValue = JSON.parse(readFileSync(firstEvidence)); const firstSemanticInputs = JSON.parse(readFileSync(resolve(root, "cases", profile.cases[0].id, "semantic-inputs.json"))); const firstSemanticPath = Object.keys(firstSemanticInputs.files)[0];
    assert.throws(() => validateObservedTreeSemanticInputs({ treeCwd: root, observedTreeSha: firstEvidenceValue.observedTreeSha, paths: [firstSemanticPath], readSemanticInput: () => "coordinated but non-tree semantic bytes\n" }), /observed Git tree blob/u);
    const tamperJson = (path, mutate, pattern) => { const original = readFileSync(path); const value = JSON.parse(original); mutate(value); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); try { assert.throws(invoke, pattern); } finally { writeFileSync(path, original); } };
    tamperJson(firstEvidence, (value) => { value.sourceDataset.tablesSha256 = "0".repeat(64); }, /source dataset/u);
    tamperJson(firstEvidence, (value) => { value.sourceDataset.counts[Object.keys(value.sourceDataset.counts)[0]] = 9; }, /count/u);
    tamperJson(transcript, (value) => { value.events[0].event.sha256 = "0".repeat(64); }, /artifact|transcript/u);
    tamperJson(firstEvidence, (value) => { value.rtoRpo.startedAt = value.finishedAt; }, /timeline|command time/u);
    tamperJson(firstEvidence, (value) => { value.cleanup.residual.ports = 1; }, /cleanup/u);
    tamperJson(manifest, (value) => { value.executionNonce = "b".repeat(64); }, /transcript|authority/u);
    const semanticInputs = resolve(root, "cases", profile.cases[0].id, "semantic-inputs.json"); const originalInputs = readFileSync(semanticInputs); const target = resolve(root, "outside"); writeFileSync(target, "{}"); unlinkSync(semanticInputs); symlinkSync(target, semanticInputs); try { assert.throws(invoke, /symlink/u); } finally { unlinkSync(semanticInputs); writeFileSync(semanticInputs, originalInputs); }
    tamperJson(firstEvidence, (value) => { value.semanticResult.anchors[0].passed = false; }, /semantic/u);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
