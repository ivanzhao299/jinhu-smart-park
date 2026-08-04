// Deliberately isolated from runner.mjs. Artifacts from this harness are never formal evidence.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCommandSpecs } from "./command-spec.mjs";
import { resolvePnpmJsCli } from "./dependency-control.mjs";
import { canonicalSha256, durableTableNames, hashFile, makeDurableSnapshot, repoRoot, sha256 } from "./lib.mjs";
import { CLEANUP_FIELDS, resourceAuthority } from "./runtime-control.mjs";
import { evaluateRollbackSemanticContract, immutableSyntheticAnchorId } from "./semantic-contract.mjs";

export function testOnlyProvenance(components = {}) {
  const policy = { mode: "TEST_ONLY", components };
  return { ...policy, executionPolicySha256: canonicalSha256(policy) };
}

export function buildCompleteTestOnlyFixture(profile) {
  return {
    schemaVersion: "property-track-c-test-only-evidence-fixture-v1",
    provenance: testOnlyProvenance({ fixture: canonicalSha256(profile.cases.map(({ id }) => id)) }),
    cases: profile.cases.map(({ id, kind, commits }) => ({ id, kind, commits, terminal: "PASS_TEST_ONLY" }))
  };
}

export function validateCompleteTestOnlyFixture(fixture, profile) {
  if (fixture.schemaVersion !== "property-track-c-test-only-evidence-fixture-v1" || fixture.provenance.mode !== "TEST_ONLY") throw new Error("fixture is not explicitly test-only");
  const expected = profile.cases.map(({ id }) => id); const actual = fixture.cases?.map(({ id }) => id);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || new Set(actual).size !== 19) throw new Error("test-only fixture does not cover all 19 cases");
  return fixture;
}

function chain(events, nonce) {
  let previousHash = sha256(`property-track-c:${nonce}`);
  const chained = events.map((event, index) => { const projection = { sequence: index + 1, previousHash, event }; const eventHash = canonicalSha256(projection); previousHash = eventHash; return { ...projection, eventHash }; });
  return { schemaVersion: "property-track-c-execution-transcript-v1", events: chained, terminalHash: previousHash };
}

export function buildUnattestedFormalShapedFixture(profile) {
  const executionNonce = "a".repeat(64); const counts = Object.fromEntries(durableTableNames(profile).map((table) => [table, 1]));
  const tables = durableTableNames(profile).map((table) => ({ table, count: 1, contentSha256: sha256(table) }));
  const before = makeDurableSnapshot(tables, "2026-08-05T00:00:01.000Z"); const after = makeDurableSnapshot(tables, "2026-08-05T00:00:08.000Z");
  const command = (id, start) => ({ id, startedAt: `2026-08-05T00:00:0${start}.000Z`, finishedAt: `2026-08-05T00:00:0${start}.100Z`, stdoutSha256: sha256(`${id}:out`), stderrSha256: sha256(`${id}:err`) });
  const baseline = [command("baseline-api-build", 2)]; const cutover = [command("derive-read-tree", 4)]; const commands = [command("rollback-service-smoke", 6)];
  const base = {
    startedAt: "2026-08-05T00:00:00.000Z", finishedAt: "2026-08-05T00:00:09.000Z",
    sourceDataset: { profileId: profile.sourceDatasetProfileId, tablesSha256: canonicalSha256(tables), counts },
    baseline: { commands: baseline }, cutoverCommands: cutover, commands, durableBefore: before, durableAfter: after,
    rtoRpo: { startedAt: "2026-08-05T00:00:03.000Z", finishedAt: "2026-08-05T00:00:07.000Z" },
    rollbackPatchSha256: sha256("manual-patch"), expectedTreeSha: "1".repeat(40), observedTreeSha: "1".repeat(40),
    semanticResultSha256: sha256("semantic-result"), semanticInputsSha256: sha256("semantic-inputs"),
    cleanup: { status: "PASS", residual: { processGroups: 0, ports: 0 } }, terminal: { at: "2026-08-05T00:00:09.000Z" }
  };
  const events = [
    { type: "source-dataset", sha256: base.sourceDataset.tablesSha256 }, { type: "target-clone", sha256: canonicalSha256(tables) },
    ...baseline.map((entry) => ({ type: "baseline-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })),
    { type: "rto-start", at: base.rtoRpo.startedAt },
    ...cutover.map((entry) => ({ type: "cutover-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })),
    { type: "rollback-patch", patchSha256: base.rollbackPatchSha256, expectedTreeSha: base.expectedTreeSha, observedTreeSha: base.observedTreeSha },
    { type: "semantic-contract", resultSha256: base.semanticResultSha256, inputsSha256: base.semanticInputsSha256 },
    ...commands.map((entry) => ({ type: "rollback-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })),
    { type: "rto-stop", at: base.rtoRpo.finishedAt }, { type: "durable-after", sha256: canonicalSha256(tables) }
  ];
  const transcript = chain(events, executionNonce);
  base.transcriptSha256 = transcript.terminalHash;
  return { root: "CRYPTOGRAPHICALLY_UNATTESTED_TEST_ROOT", run: { executionNonce }, cases: profile.cases.map(({ id }) => ({ id, evidence: JSON.parse(JSON.stringify(base)), transcript: JSON.parse(JSON.stringify(transcript)) })) };
}

const POLICY_COMPONENTS = ["runner.mjs", "command-spec.mjs", "runtime-control.mjs", "runtime-lease.mjs", "flags-proof.mjs", "service-smoke.mjs", "source-profile.mjs", "dependency-control.mjs", "build-output.mjs", "evidence-gate.mjs", "semantic-contract.mjs", "lib.mjs", "timeout.mjs", "comparator.mjs", "closure-binding.mjs", "patch-validator.mjs", "source-validator.mjs", "check-config.mjs", "profile.v1.json", "profile.schema.json"];

function writeArtifact(root, relativePath, content, artifacts) {
  const path = resolve(root, relativePath); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, content, { mode: 0o600 });
  const artifact = { path: relativePath, ...hashFile(path) }; artifacts.push(artifact); return artifact;
}

function testProfile(profile) {
  return {
    ...profile,
    cases: profile.cases.map((entry) => {
      const productionPath = `apps/api/src/modules/homestay/__rollback_fixture_${entry.id}.ts`; const immutablePath = `apps/api/src/modules/homestay/__rollback_fixture_${entry.id}.spec.ts`;
      return {
        ...entry,
        allowedPatchPrefixes: ["apps/api/src/modules/homestay/"],
        rollbackSemanticContract: {
          mustChangeProductionPaths: [productionPath],
          postApply: [{ id: `${entry.id}:production`, intentGroupId: `${entry.id}:intent`, path: productionPath, pathState: "present", mustContain: [`rollback_${entry.id}`], mustNotContain: [], mustMatch: [], mustNotMatch: [], astMatchers: [] }],
          retainedShell: [], protectedExternalPaths: [], immutableTestPaths: [immutablePath],
          allowedInvariantIds: [`${entry.id}:invariant`], allowedGateIds: ["targeted-regression", immutablePath]
        }
      };
    })
  };
}

export function buildUnattestedTopLevelFixture({ root, profile, runId, finalSha, now = new Date() }) {
  const fixtureProfile = testProfile(profile); const profileSha256 = canonicalSha256(fixtureProfile); const executionNonce = "a".repeat(64);
  const createdAt = new Date(now.getTime() - 1_000).toISOString(); const source = { schemaVersion: "property-track-c-rollback-source-binding-v1", finalSha, head: finalSha, commits: {}, closures: {} };
  mkdirSync(resolve(root, "inputs/patches"), { recursive: true }); mkdirSync(resolve(root, "inputs/plans"), { recursive: true }); mkdirSync(resolve(root, "cases"), { recursive: true });
  for (const commit of new Set(fixtureProfile.cases.flatMap(({ commits }) => commits))) source.commits[commit] = commit.length === 40 ? commit : `${commit}${"1".repeat(40 - commit.length)}`;
  const commandSpecsSha256 = {}; const authoritySha256 = {}; const caseInputs = [];
  for (const rehearsalCase of fixtureProfile.cases) {
    const contract = rehearsalCase.rollbackSemanticContract; const productionPath = contract.mustChangeProductionPaths[0]; const immutablePath = contract.immutableTestPaths[0];
    const patchText = `diff --git a/${productionPath} b/${productionPath}\n--- a/${productionPath}\n+++ b/${productionPath}\n@@ -1 +1 @@\n-old_${rehearsalCase.id}\n+rollback_${rehearsalCase.id}\n`;
    const patchPath = resolve(root, "inputs/patches", `${rehearsalCase.id}.patch`); writeFileSync(patchPath, patchText, { mode: 0o600 });
    const touchedPaths = [productionPath, immutablePath]; const reversePatchSha256 = sha256(`reverse:${rehearsalCase.id}`);
    const closure = { commits: [...rehearsalCase.commits].reverse().map((commitRef) => ({ commitRef, fullSha: source.commits[commitRef], reverseDiffSha256: sha256(`reverse:${commitRef}`) })), touchedPaths, touchedPathsSha256: canonicalSha256(touchedPaths), reversePatchSha256 };
    source.closures[rehearsalCase.id] = closure;
    const deviations = [
      { path: productionPath, action: "modified", reason: "unattested semantic fixture production change", preservedInvariant: contract.allowedInvariantIds[0], test: "targeted-regression", contractAnchorId: contract.postApply[0].id },
      { path: immutablePath, action: "intentionally-omitted", reason: "unattested semantic fixture immutable test", preservedInvariant: contract.allowedInvariantIds[0], test: immutablePath, contractAnchorId: immutableSyntheticAnchorId(immutablePath) }
    ];
    const metadata = { schemaVersion: "property-track-c-reviewed-rollback-patch-v2", runId, finalSha, profileSha256, caseId: rehearsalCase.id, commits: rehearsalCase.commits, closureBindingSha256: canonicalSha256(closure), patchMode: "reviewed-manual-forward-port", originalReverseSha256: reversePatchSha256, touchedPathsSha256: closure.touchedPathsSha256, patchPath: `${rehearsalCase.id}.patch`, manualPatchSha256: sha256(patchText), deviationManifest: deviations, author: "unattested-author", reviewer: "unattested-patch-reviewer", reviewedAt: now.toISOString(), approved: true };
    const metadataPath = resolve(root, "inputs/patches", `${rehearsalCase.id}.metadata.json`); writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
    for (const [path, content] of [[productionPath, `rollback_${rehearsalCase.id}\n`], [immutablePath, "immutable fixture\n"]]) { mkdirSync(resolve(root, path, ".."), { recursive: true }); writeFileSync(resolve(root, path), content, { mode: 0o600 }); }
    const specs = buildCommandSpecs(fixtureProfile, rehearsalCase); commandSpecsSha256[rehearsalCase.id] = canonicalSha256(specs);
    caseInputs.push({ rehearsalCase, productionPath, immutablePath, patchText, metadata, metadataPath, specs });
  }
  const gitOptions = { cwd: root, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" }, stdio: ["ignore", "pipe", "pipe"] };
  execFileSync("/usr/bin/git", ["init", "-q"], gitOptions); execFileSync("/usr/bin/git", ["add", "--", "apps"], gitOptions);
  const observedTreeSha = execFileSync("/usr/bin/git", ["write-tree"], { ...gitOptions, encoding: "utf8" }).trim();
  const executionPolicy = { mode: "FORMAL", components: Object.fromEntries(POLICY_COMPONENTS.map((name) => { const path = `scripts/e2e/property-remediation/rollback/${name}`; return [path, hashFile(resolve(repoRoot, path)).sha256]; })) }; const executionPolicySha256 = canonicalSha256(executionPolicy);
  for (const { rehearsalCase } of caseInputs) { const authority = resourceAuthority({ runId, finalSha, caseId: rehearsalCase.id, runRoot: root, executionNonce, commandSpecSha256: commandSpecsSha256[rehearsalCase.id] }); authoritySha256[rehearsalCase.id] = canonicalSha256(authority); }
  const sourcePath = resolve(root, "source-binding.json"); writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`, { mode: 0o600 });
  const run = { schemaVersion: "property-track-c-unattested-test-run-v1", runId, finalSha, profileSha256, createdAt, sourceBindingSha256: hashFile(sourcePath).sha256, expectedCaseIds: fixtureProfile.cases.map(({ id }) => id), commandSpecsSha256, authoritySha256, executionPolicy, executionPolicySha256, executionNonce, pnpmCliSha256: hashFile(resolvePnpmJsCli()).sha256 };
  writeFileSync(resolve(root, "run-manifest.json"), `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
  const tables = durableTableNames(fixtureProfile).map((table) => ({ table, count: 1, contentSha256: sha256(table) })); const counts = Object.fromEntries(tables.map(({ table, count }) => [table, count]));
  for (const input of caseInputs) {
    const { rehearsalCase, productionPath, immutablePath, patchText, metadata, metadataPath, specs } = input; const caseRoot = resolve(root, "cases", rehearsalCase.id); mkdirSync(caseRoot, { recursive: true }); const artifacts = [];
    writeArtifact(caseRoot, "frozen-rollback.patch", patchText, artifacts);
    let tick = now.getTime(); const stamp = () => new Date(tick += 10).toISOString(); const startedAt = stamp(); const before = makeDurableSnapshot(tables, stamp());
    const authority = resourceAuthority({ runId, finalSha, caseId: rehearsalCase.id, runRoot: root, executionNonce, commandSpecSha256: commandSpecsSha256[rehearsalCase.id] });
    const flags = (expectedValue) => ({ status: "PASS", expectedValue, buildIdSha256: sha256(`build:${expectedValue}`), artifactSha256: sha256(`artifact:${expectedValue}`), files: 10, rewriteTarget: `http://127.0.0.1:${authority.apiPort}`, manifestFlags: Object.fromEntries(fixtureProfile.requiredDisabledFlags.map((name) => [`NEXT_PUBLIC_${name}`, expectedValue])) });
    const smoke = (stage, buildIdSha256) => ({ status: "PASS", stage, apiPort: authority.apiPort, webPort: authority.webPort, webBuildIdSha256: buildIdSha256, checks: ["api-health", "api-ready", "web-login-page", "web-rewrite-admin-login", "web-rewrite-homestay-dashboard", "web-rewrite-housing-dashboard"] });
    const baselineFlags = flags("true"); const rollbackFlags = flags("false"); const baselineSmoke = smoke("baseline", baselineFlags.buildIdSha256); const rollbackSmoke = smoke("rollback", rollbackFlags.buildIdSha256);
    const baselineSpecs = [{ ...specs[0], id: "baseline-api-build" }, { ...specs[2], id: "baseline-web-clean-production-build" }, { ...specs[7], id: "baseline-flags-proof", args: specs[7].args.map((value) => value === "false" ? "true" : value) }, { ...specs[8], id: "baseline-service-smoke", args: specs[8].args.map((value) => value === "rollback" ? "baseline" : value) }];
    const commandEvidence = (spec, stdout) => { const started = stamp(); const finished = stamp(); const out = writeArtifact(caseRoot, `logs/${spec.id}.stdout.log`, stdout, artifacts); const error = writeArtifact(caseRoot, `logs/${spec.id}.stderr.log`, "", artifacts); return { id: spec.id, commandSpecSha256: canonicalSha256(spec), startedAt: started, finishedAt: finished, exitCode: 0, stdoutPath: out.path, stdoutSha256: out.sha256, stderrPath: error.path, stderrSha256: error.sha256 }; };
    const baseline = baselineSpecs.map((spec) => commandEvidence(spec, spec.id === "baseline-flags-proof" ? JSON.stringify(baselineFlags) : spec.id === "baseline-service-smoke" ? JSON.stringify(baselineSmoke) : ""));
    const rtoStartedAt = stamp(); const cutoverCommands = ["derive-read-tree", "derive-patch-check", "derive-patch-apply", "derive-write-tree", "patch-check", "patch-apply", "write-tree"].map((id) => { const started = stamp(); const finished = stamp(); const out = writeArtifact(caseRoot, `logs/${id}.stdout.log`, id.endsWith("write-tree") ? "1234567890abcdef1234567890abcdef12345678\n" : "", artifacts); const error = writeArtifact(caseRoot, `logs/${id}.stderr.log`, "", artifacts); return { id, startedAt: started, finishedAt: finished, exitCode: 0, stdoutPath: out.path, stdoutSha256: out.sha256, stderrPath: error.path, stderrSha256: error.sha256 }; });
    const patch = { path: resolve(root, "inputs/patches", `${rehearsalCase.id}.patch`), paths: [productionPath], semanticChangedPaths: [productionPath], deviations: metadata.deviationManifest, sha256: sha256(patchText), size: Buffer.byteLength(patchText), deviationManifestSha256: canonicalSha256(metadata.deviationManifest) };
    const virtualFiles = { [productionPath]: `rollback_${rehearsalCase.id}\n`, [immutablePath]: "immutable fixture\n" }; const immutableBefore = { [immutablePath]: sha256(virtualFiles[immutablePath]) };
    const semantic = evaluateRollbackSemanticContract({ root, rehearsalCase, patch, immutableBefore, immutablePaths: [immutablePath], readFile: (path) => virtualFiles[path] ?? null });
    const semanticInputs = { schemaVersion: "property-track-c-rollback-semantic-inputs-v1", files: Object.fromEntries(Object.entries(semantic.fileContents).map(([path, text]) => [path, text === null ? null : Buffer.from(text).toString("base64")])) };
    const semanticInputArtifact = writeArtifact(caseRoot, "semantic-inputs.json", `${JSON.stringify(semanticInputs, null, 2)}\n`, artifacts); writeArtifact(caseRoot, "semantic-result.json", `${JSON.stringify(semantic.result, null, 2)}\n`, artifacts);
    const commands = specs.map((spec) => commandEvidence(spec, spec.id === "flags-artifact-runtime-proof" ? JSON.stringify(rollbackFlags) : spec.id === "rollback-service-smoke" ? JSON.stringify(rollbackSmoke) : ""));
    const rtoFinishedAt = stamp(); const after = makeDurableSnapshot(tables, stamp()); const finishedAt = stamp();
    const cleanupProjection = { attempted: true, authoritySha256: canonicalSha256(authority), residual: Object.fromEntries(CLEANUP_FIELDS.map((name) => [name, 0])), errors: [] }; const cleanup = { schemaVersion: "property-track-c-runner-cleanup-v1", status: "PASS", ...cleanupProjection, manifestSha256: canonicalSha256(cleanupProjection) };
    const expectedTreeSha = observedTreeSha;
    const evidence = { schemaVersion: "property-track-c-rollback-case-evidence-v3", provenance: { ...executionPolicy, executionPolicySha256 }, dependencyMaterialization: { pnpmVersion: "9.12.0", pnpmCliSha256: run.pnpmCliSha256, trustedStore: "unattested-store", trustedVirtualStore: "unattested-virtual-store" }, sourceDataset: { profileId: fixtureProfile.sourceDatasetProfileId, tablesSha256: canonicalSha256(tables), counts }, transcriptSha256: "", runId, finalSha, profileSha256, caseId: rehearsalCase.id, commits: rehearsalCase.commits, planSha256: "", patchMetadataSha256: hashFile(metadataPath).sha256, commandSpecSha256: commandSpecsSha256[rehearsalCase.id], closureBindingSha256: metadata.closureBindingSha256, originalReverseSha256: metadata.originalReverseSha256, manualPatchSha256: metadata.manualPatchSha256, deviationManifestSha256: canonicalSha256(metadata.deviationManifest), semanticResult: semantic.result, semanticResultSha256: semantic.resultSha256, semanticInputsSha256: semanticInputArtifact.sha256, rollbackPatchSha256: sha256(patchText), expectedTreeSha, observedTreeSha: expectedTreeSha, startedAt, finishedAt, baseline: { commands: baseline, flagsProof: baselineFlags, smoke: baselineSmoke }, cutoverCommands, commands, durableBefore: before, durableAfter: after, rtoRpo: { startedAt: rtoStartedAt, finishedAt: rtoFinishedAt, monotonicStartedNanoseconds: "0", monotonicFinishedNanoseconds: "1000000", rtoMilliseconds: 1, rpoCommittedRows: 0 }, flagsProof: rollbackFlags, cleanup, terminal: { status: "PASS", at: finishedAt, approver: "unattested-plan-approver" }, artifacts };
    const events = [{ type: "source-dataset", sha256: evidence.sourceDataset.tablesSha256 }, { type: "target-clone", sha256: canonicalSha256(before.tables) }, ...baseline.map((entry) => ({ type: "baseline-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })), { type: "rto-start", at: rtoStartedAt }, ...cutoverCommands.map((entry) => ({ type: "cutover-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })), { type: "rollback-patch", patchSha256: evidence.rollbackPatchSha256, expectedTreeSha, observedTreeSha: expectedTreeSha }, { type: "semantic-contract", resultSha256: evidence.semanticResultSha256, inputsSha256: evidence.semanticInputsSha256 }, ...commands.map((entry) => ({ type: "rollback-command", id: entry.id, startedAt: entry.startedAt, finishedAt: entry.finishedAt, stdoutSha256: entry.stdoutSha256, stderrSha256: entry.stderrSha256 })), { type: "rto-stop", at: rtoFinishedAt }, { type: "durable-after", sha256: canonicalSha256(after.tables) }];
    const transcript = chain(events, executionNonce); evidence.transcriptSha256 = transcript.terminalHash; writeArtifact(caseRoot, "execution-transcript.json", `${JSON.stringify(transcript, null, 2)}\n`, artifacts);
    const plan = { schemaVersion: "property-track-c-reviewed-rollback-plan-v3", runId, finalSha, profileSha256, caseId: rehearsalCase.id, patchMetadataSha256: evidence.patchMetadataSha256, commandSpecSha256: evidence.commandSpecSha256, approver: evidence.terminal.approver, reviewedAt: now.toISOString(), approved: true };
    const planPath = resolve(root, "inputs/plans", `${rehearsalCase.id}.json`); writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 }); evidence.planSha256 = hashFile(planPath).sha256;
    writeFileSync(resolve(caseRoot, "case-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  return { profile: fixtureProfile, profileSha256, root, runId, finalSha };
}
