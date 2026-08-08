import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildCommandSpecs } from "./command-spec.mjs";
import { validateRtoRpo } from "./comparator.mjs";
import {
  assertFinalSha,
  assertHash,
  assertCommandOutputSafe,
  assertNoSensitiveData,
  assertNoSymlinks,
  assertPathChainHasNoSymlink,
  assertRunId,
  canonicalSha256,
  canonicalReviewIdentity,
  exactKeys,
  hashFile,
  isPathInside,
  loadProfile,
  readJson,
  repoRoot,
  resolveInside,
  rollbackRoot,
  sha256,
  validateTimestamp
} from "./lib.mjs";
import { validatePatchMetadata } from "./patch-validator.mjs";
import { resourceAuthority, validateCleanupResult } from "./runtime-control.mjs";
import { resolvePnpmJsCli } from "./dependency-control.mjs";
import { assertSemanticContractsReady, readSemanticFilesFromGitTree, validateSemanticResult } from "./semantic-contract.mjs";

const RUN_KEYS = ["schemaVersion", "runId", "finalSha", "profileSha256", "createdAt", "sourceBindingSha256", "expectedCaseIds", "commandSpecsSha256", "authoritySha256", "executionPolicy", "executionPolicySha256", "executionNonce", "pnpmCliSha256"];
const CASE_KEYS = [
  "schemaVersion", "provenance", "dependencyMaterialization", "sourceDataset", "transcriptSha256", "runId", "finalSha", "profileSha256", "caseId", "commits",
  "planSha256", "patchMetadataSha256", "commandSpecSha256", "closureBindingSha256",
  "originalReverseSha256", "manualPatchSha256", "deviationManifestSha256", "semanticResult", "semanticResultSha256", "semanticInputsSha256", "rollbackPatchSha256", "expectedTreeSha", "observedTreeSha",
  "startedAt", "finishedAt", "baseline", "cutoverCommands", "commands", "durableBefore", "durableAfter", "rtoRpo",
  "flagsProof", "cleanup", "terminal", "artifacts"
];
const PLAN_KEYS = ["schemaVersion", "runId", "finalSha", "profileSha256", "caseId", "patchMetadataSha256", "commandSpecSha256", "approver", "reviewedAt", "approved"];

export function validateArtifact({ artifact, caseRoot, usedPaths }) {
  exactKeys(artifact, ["path", "sha256", "size"], "artifact catalog entry");
  if (typeof artifact.path !== "string" || artifact.path.length === 0 || usedPaths.has(artifact.path)) throw new Error("artifact paths must be non-empty and unique");
  usedPaths.add(artifact.path);
  const path = resolveInside(caseRoot, artifact.path, "artifact path");
  const actual = hashFile(path);
  assertHash(artifact.sha256, "artifact SHA-256");
  if (artifact.sha256 !== actual.sha256 || artifact.size !== actual.size) throw new Error(`artifact checksum/size mismatch: ${artifact.path}`);
  const content = readFileSync(path, "utf8");
  const logMatch = /^logs\/(.+)\.(stdout|stderr)\.log$/u.exec(artifact.path);
  if (logMatch) {
    assertCommandOutputSafe({ stdout: logMatch[2] === "stdout" ? content : "", stderr: logMatch[2] === "stderr" ? content : "" }, logMatch[1]);
  } else {
    assertNoSensitiveData(content, `artifact ${artifact.path}`);
  }
}

function validatePlan({ plan, planPath, evidence, run, commandSpecSha256, bounds, patchMetadata }) {
  exactKeys(plan, PLAN_KEYS, "rollback execution plan");
  assertNoSensitiveData(plan, "rollback execution plan");
  if (plan.schemaVersion !== "property-track-c-reviewed-rollback-plan-v3" || plan.runId !== run.runId || plan.finalSha !== run.finalSha || plan.profileSha256 !== run.profileSha256 || plan.caseId !== evidence.caseId) throw new Error("rollback plan is spliced from another run/final/profile/case");
  if (plan.approved !== true || canonicalReviewIdentity(plan.approver, "plan approver") === canonicalReviewIdentity(patchMetadata.reviewer, "patch reviewer")) throw new Error("rollback plan lacks approval independent from the patch reviewer");
  validateTimestamp(plan.reviewedAt, "plan review timestamp", bounds);
  if (plan.patchMetadataSha256 !== evidence.patchMetadataSha256 || plan.commandSpecSha256 !== commandSpecSha256) throw new Error("rollback plan patch/command binding mismatch");
  if (hashFile(planPath).sha256 !== evidence.planSha256) throw new Error("rollback plan checksum mismatch");
}

function validateCommands({ commands, specs, caseRoot, artifactByPath, bounds }) {
  if (!Array.isArray(commands) || commands.length !== specs.length) throw new Error("rollback command matrix is incomplete");
  let priorFinished = bounds.notBefore;
  for (let index = 0; index < specs.length; index += 1) {
    const command = commands[index];
    const spec = specs[index];
    exactKeys(command, ["id", "commandSpecSha256", "startedAt", "finishedAt", "exitCode", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256"], "rollback command evidence");
    if (command.id !== spec.id || command.commandSpecSha256 !== canonicalSha256(spec) || command.exitCode !== 0) throw new Error(`rollback command differs from runner-owned spec: ${spec.id}`);
    const started = validateTimestamp(command.startedAt, "command start", bounds);
    const finished = validateTimestamp(command.finishedAt, "command finish", bounds);
    if (finished < started || started < priorFinished) throw new Error(`rollback command time/order is invalid: ${spec.id}`);
    priorFinished = finished;
    for (const [pathKey, hashKey] of [["stdoutPath", "stdoutSha256"], ["stderrPath", "stderrSha256"]]) {
      resolveInside(caseRoot, command[pathKey], "command log path");
      const artifact = artifactByPath.get(command[pathKey]);
      if (!artifact || artifact.sha256 !== command[hashKey]) throw new Error(`command log is absent from the artifact catalog: ${spec.id}`);
    }
  }
}

function validateCutoverCommands(commands, caseRoot, artifactByPath, bounds) {
  const ids = ["derive-read-tree", "derive-patch-check", "derive-patch-apply", "derive-write-tree", "patch-check", "patch-apply", "write-tree"];
  if (!Array.isArray(commands) || JSON.stringify(commands.map(({ id }) => id)) !== JSON.stringify(ids)) throw new Error("cutover command sequence is incomplete");
  let prior = bounds.notBefore;
  for (const command of commands) {
    exactKeys(command, ["id", "startedAt", "finishedAt", "exitCode", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256"], "cutover command evidence");
    const started = validateTimestamp(command.startedAt, "cutover command start", bounds); const finished = validateTimestamp(command.finishedAt, "cutover command finish", bounds);
    if (command.exitCode !== 0 || started < prior || finished < started) throw new Error(`cutover command time/order failed: ${command.id}`);
    prior = finished;
    for (const [pathKey, hashKey] of [["stdoutPath", "stdoutSha256"], ["stderrPath", "stderrSha256"]]) if (artifactByPath.get(command[pathKey])?.sha256 !== command[hashKey]) throw new Error(`cutover artifact binding failed: ${command.id}`);
  }
  return prior;
}

function validateFlags(flagsProof, profile, commands, caseRoot) {
  exactKeys(flagsProof, ["status", "expectedValue", "buildIdSha256", "artifactSha256", "files", "rewriteTarget", "manifestFlags"], "rollback flag proof");
  if (flagsProof.status !== "PASS" || !Number.isSafeInteger(flagsProof.files) || flagsProof.files < 10) throw new Error("invalid production artifact flag proof");
  assertHash(flagsProof.buildIdSha256, "build ID hash"); assertHash(flagsProof.artifactSha256, "production artifact hash");
  if (flagsProof.expectedValue !== "false") throw new Error("rollback build proof is not flags-off");
  const names = profile.requiredDisabledFlags.map((name) => `NEXT_PUBLIC_${name}`);
  exactKeys(flagsProof.manifestFlags, names, "Next authoritative build flags");
  for (const name of names) if (flagsProof.manifestFlags[name] !== "false") throw new Error(`production build flag was not disabled: ${name}`);
  const command = commands.find(({ id }) => id === "flags-artifact-runtime-proof");
  if (!command) throw new Error("flags proof command is missing");
  const observed = JSON.parse(readFileSync(resolveInside(caseRoot, command.stdoutPath), "utf8").trim());
  if (canonicalSha256(observed) !== canonicalSha256(flagsProof)) throw new Error("flags proof is not derived from command output");
}

function expectedBaselineSpecs(specs) {
  return [
    { ...specs.find(({ id }) => id === "shared-build"), id: "baseline-shared-build" },
    { ...specs.find(({ id }) => id === "api-build"), id: "baseline-api-build" },
    { ...specs.find(({ id }) => id === "web-clean-production-build"), id: "baseline-web-clean-production-build" },
    { ...specs.find(({ id }) => id === "flags-artifact-runtime-proof"), id: "baseline-flags-proof", args: specs.find(({ id }) => id === "flags-artifact-runtime-proof").args.map((value) => value === "false" ? "true" : value) },
    { ...specs.find(({ id }) => id === "rollback-service-smoke"), id: "baseline-service-smoke", args: specs.find(({ id }) => id === "rollback-service-smoke").args.map((value) => value === "rollback" ? "baseline" : value) }
  ];
}

function validateTranscript(evidence, caseRoot, artifactByPath, run) {
  const artifact = artifactByPath.get("execution-transcript.json");
  if (!artifact) throw new Error("formal execution transcript artifact is missing");
  const transcript = readJson(resolveInside(caseRoot, "execution-transcript.json", "execution transcript"));
  validateTranscriptSemantic(evidence, transcript, run);
}

export function validateTranscriptSemantic(evidence, transcript, run) {
  exactKeys(transcript, ["schemaVersion", "events", "terminalHash"], "execution transcript");
  if (transcript.schemaVersion !== "property-track-c-execution-transcript-v1" || !Array.isArray(transcript.events) || transcript.events.length < 9) throw new Error("execution transcript is incomplete");
  let previousHash = sha256(`property-track-c:${run.executionNonce}`);
  for (let index = 0; index < transcript.events.length; index += 1) {
    const entry = transcript.events[index]; exactKeys(entry, ["sequence", "previousHash", "event", "eventHash"], "transcript event");
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || entry.eventHash !== canonicalSha256({ sequence: entry.sequence, previousHash, event: entry.event })) throw new Error("execution transcript hash chain is invalid");
    previousHash = entry.eventHash;
  }
  if (transcript.terminalHash !== previousHash || evidence.transcriptSha256 !== previousHash) throw new Error("execution transcript terminal hash mismatch");
  const types = transcript.events.map(({ event }) => event.type);
  for (const required of ["source-dataset", "target-clone", "rto-start", "rollback-patch", "rto-stop", "durable-after"]) if (!types.includes(required)) throw new Error(`execution transcript lacks ${required}`);
  const expectedEvents = [
    { type: "source-dataset", sha256: evidence.sourceDataset.tablesSha256 },
    { type: "target-clone", sha256: canonicalSha256(evidence.durableBefore.tables) },
    ...evidence.baseline.commands.map((command) => ({ type: "baseline-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rto-start", at: evidence.rtoRpo.startedAt },
    ...evidence.cutoverCommands.map((command) => ({ type: "cutover-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rollback-patch", patchSha256: evidence.rollbackPatchSha256, expectedTreeSha: evidence.expectedTreeSha, observedTreeSha: evidence.observedTreeSha },
    { type: "semantic-contract", resultSha256: evidence.semanticResultSha256, inputsSha256: evidence.semanticInputsSha256 },
    ...evidence.commands.map((command) => ({ type: "rollback-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rto-stop", at: evidence.rtoRpo.finishedAt },
    { type: "durable-after", sha256: canonicalSha256(evidence.durableAfter.tables) }
  ];
  if (canonicalSha256(transcript.events.map(({ event }) => event)) !== canonicalSha256(expectedEvents)) throw new Error("execution transcript values/order differ from case evidence");
  return true;
}

export function validateCaseSemanticBindings(evidence, profile) {
  if (evidence.sourceDataset.profileId !== profile.sourceDatasetProfileId || evidence.sourceDataset.tablesSha256 !== canonicalSha256(evidence.durableBefore.tables)) throw new Error("semantic source dataset binding mismatch");
  for (const entry of evidence.durableBefore.tables) if (evidence.sourceDataset.counts[entry.table] !== entry.count) throw new Error("semantic source count binding mismatch");
  const caseStart = Date.parse(evidence.startedAt); const before = Date.parse(evidence.durableBefore.capturedAt); const rtoStart = Date.parse(evidence.rtoRpo.startedAt); const rtoStop = Date.parse(evidence.rtoRpo.finishedAt); const after = Date.parse(evidence.durableAfter.capturedAt); const finish = Date.parse(evidence.finishedAt); const terminal = Date.parse(evidence.terminal.at);
  if ([caseStart, before, rtoStart, rtoStop, after, finish, terminal].some((value) => !Number.isFinite(value)) || !(caseStart <= before && before <= rtoStart && rtoStart <= rtoStop && rtoStop <= after && after <= finish && finish === terminal)) throw new Error("semantic case timeline is invalid");
  if (evidence.cleanup?.status !== "PASS" || Object.values(evidence.cleanup.residual ?? {}).some((value) => value !== 0)) throw new Error("semantic cleanup is not zero-residual PASS");
  return true;
}

export function validateCrossCaseDatasetBindings(evidenceCases, profile) {
  if (!Array.isArray(evidenceCases) || evidenceCases.length !== 19) throw new Error("cross-case binding requires all 19 cases");
  const first = canonicalSha256(evidenceCases[0].sourceDataset);
  for (const evidence of evidenceCases) {
    if (evidence.sourceDataset.profileId !== profile.sourceDatasetProfileId || canonicalSha256(evidence.sourceDataset) !== first) throw new Error("19-case source dataset profile/hash/counts differ");
  }
  return true;
}

function validateSmoke(smoke, stage, authority) {
  exactKeys(smoke, ["status", "stage", "apiPort", "webPort", "webBuildIdSha256", "checks"], `${stage} service smoke`);
  if (smoke.status !== "PASS" || smoke.stage !== stage || smoke.apiPort !== authority.apiPort || smoke.webPort !== authority.webPort) throw new Error(`${stage} service smoke authority mismatch`);
  assertHash(smoke.webBuildIdSha256, `${stage} Web build ID hash`);
  const checks = ["api-health", "api-ready", "web-login-page", "web-rewrite-admin-login", "web-rewrite-homestay-dashboard", "web-rewrite-housing-dashboard"];
  if (JSON.stringify(smoke.checks) !== JSON.stringify(checks)) throw new Error(`${stage} authenticated smoke is incomplete`);
}

export function validateFormalProvenance(provenance, run) {
  exactKeys(provenance, ["mode", "components", "executionPolicySha256"], "formal execution provenance");
  if (provenance.mode !== "FORMAL" || provenance.executionPolicySha256 !== run.executionPolicySha256 || canonicalSha256({ mode: provenance.mode, components: provenance.components }) !== run.executionPolicySha256) throw new Error("mock/test-only or unbound execution provenance is forbidden");
  return provenance;
}

export function validateObservedTreeSemanticInputs({ treeCwd, observedTreeSha, paths, readSemanticInput }) {
  const observedTreeFiles = readSemanticFilesFromGitTree({ cwd: treeCwd, treeSha: observedTreeSha, paths });
  for (const path of paths) if (readSemanticInput(path) !== observedTreeFiles[path]) throw new Error(`semantic evidence differs from observed Git tree blob: ${path}`);
  return observedTreeFiles;
}

function validateCase({ evidence, rehearsalCase, profile, profileSha256, run, runRoot, sourceBinding, treeCwd }) {
  exactKeys(evidence, CASE_KEYS, "rollback case evidence");
  assertNoSensitiveData(evidence, "rollback case evidence");
  if (evidence.schemaVersion !== "property-track-c-rollback-case-evidence-v3" || evidence.runId !== run.runId || evidence.finalSha !== run.finalSha || evidence.profileSha256 !== profileSha256) throw new Error("rollback case is spliced from another run/final/profile");
  validateFormalProvenance(evidence.provenance, run);
  validateCaseSemanticBindings(evidence, profile);
  exactKeys(evidence.dependencyMaterialization, ["pnpmVersion", "pnpmCliSha256", "trustedStore", "trustedVirtualStore"], "dependency materialization evidence");
  if (evidence.dependencyMaterialization.pnpmVersion !== "9.12.0") throw new Error("formal dependency materialization used the wrong pnpm version");
  assertHash(evidence.dependencyMaterialization.pnpmCliSha256, "pnpm CLI hash");
  if (evidence.dependencyMaterialization.pnpmCliSha256 !== run.pnpmCliSha256) throw new Error("case dependency toolchain differs from run provenance");
  exactKeys(evidence.sourceDataset, ["profileId", "tablesSha256", "counts"], "source dataset evidence");
  if (evidence.sourceDataset.profileId !== profile.sourceDatasetProfileId) throw new Error("source dataset profile mismatch");
  assertHash(evidence.sourceDataset.tablesSha256, "source dataset checksum");
  exactKeys(evidence.sourceDataset.counts, Object.keys(profile.durableTableSources), "source dataset counts");
  if (Object.values(evidence.sourceDataset.counts).every((count) => count === 0)) throw new Error("source dataset is empty");
  for (const table of profile.requiredDatasetSentinels) if (!Number.isSafeInteger(evidence.sourceDataset.counts[table]) || evidence.sourceDataset.counts[table] < 1) throw new Error(`source dataset sentinel is empty: ${table}`);
  if (evidence.sourceDataset.tablesSha256 !== canonicalSha256(evidence.durableBefore.tables)) throw new Error("source dataset hash differs from target durable-before snapshot");
  for (const entry of evidence.durableBefore.tables) if (evidence.sourceDataset.counts[entry.table] !== entry.count) throw new Error(`source dataset count differs from durable-before: ${entry.table}`);
  if (evidence.caseId !== rehearsalCase.id || JSON.stringify(evidence.commits) !== JSON.stringify(rehearsalCase.commits)) throw new Error("rollback case differs from the frozen profile");
  const caseRoot = resolveInside(runRoot, `cases/${rehearsalCase.id}`, "rollback case root");
  const bounds = { notBefore: Date.parse(run.createdAt), notAfter: Date.now() + 60_000 };
  const started = validateTimestamp(evidence.startedAt, "case start", bounds);
  const finished = validateTimestamp(evidence.finishedAt, "case finish", bounds);
  if (finished < started) throw new Error("rollback case timestamps are not monotonic");
  assertFinalSha(evidence.expectedTreeSha);
  assertFinalSha(evidence.observedTreeSha);
  if (evidence.expectedTreeSha !== evidence.observedTreeSha) throw new Error("rollback tree differs from reviewed expected tree");
  const patchMetadataPath = resolveInside(runRoot, `inputs/patches/${rehearsalCase.id}.metadata.json`, "patch metadata");
  const patchMetadata = readJson(patchMetadataPath);
  const patch = validatePatchMetadata({ metadata: patchMetadata, rehearsalCase, profile, runRoot, runId: run.runId, finalSha: run.finalSha, profileSha256, runCreatedAt: run.createdAt, sourceBinding });
  if (hashFile(patchMetadataPath).sha256 !== evidence.patchMetadataSha256 || patch.sha256 !== evidence.rollbackPatchSha256 || patch.sha256 !== evidence.manualPatchSha256 || patchMetadata.closureBindingSha256 !== evidence.closureBindingSha256 || patchMetadata.originalReverseSha256 !== evidence.originalReverseSha256 || patch.deviationManifestSha256 !== evidence.deviationManifestSha256) throw new Error("case patch/closure/deviation checksum mismatch");
  const specs = buildCommandSpecs(profile, rehearsalCase);
  const commandSha = canonicalSha256(specs);
  if (run.commandSpecsSha256[rehearsalCase.id] !== commandSha || evidence.commandSpecSha256 !== commandSha) throw new Error("case command spec checksum mismatch");
  const planPath = resolveInside(runRoot, `inputs/plans/${rehearsalCase.id}.json`, "execution plan");
  validatePlan({ plan: readJson(planPath), planPath, evidence, run, commandSpecSha256: commandSha, bounds, patchMetadata });
  const usedPaths = new Set();
  const artifactByPath = new Map();
  if (!Array.isArray(evidence.artifacts)) throw new Error("artifact catalog must be an array");
  for (const artifact of evidence.artifacts) { validateArtifact({ artifact, caseRoot, usedPaths }); artifactByPath.set(artifact.path, artifact); }
  const frozenPatchArtifact = artifactByPath.get("frozen-rollback.patch");
  if (!frozenPatchArtifact || frozenPatchArtifact.sha256 !== patch.sha256 || frozenPatchArtifact.size !== patch.size) throw new Error("validated frozen rollback patch artifact is missing or unbound");
  const semanticInputsArtifact = artifactByPath.get("semantic-inputs.json"); const semanticResultArtifact = artifactByPath.get("semantic-result.json");
  if (!semanticInputsArtifact || !semanticResultArtifact || semanticInputsArtifact.sha256 !== evidence.semanticInputsSha256 || semanticResultArtifact.sha256 !== hashFile(resolveInside(caseRoot, "semantic-result.json")).sha256) throw new Error("semantic proof artifacts are missing or unbound");
  const semanticInputs = readJson(resolveInside(caseRoot, "semantic-inputs.json", "semantic inputs")); exactKeys(semanticInputs, ["schemaVersion", "files"], "semantic inputs");
  if (semanticInputs.schemaVersion !== "property-track-c-rollback-semantic-inputs-v1") throw new Error("invalid semantic inputs schema");
  const semanticResultArtifactValue = readJson(resolveInside(caseRoot, "semantic-result.json", "semantic result"));
  if (canonicalSha256(semanticResultArtifactValue) !== evidence.semanticResultSha256 || canonicalSha256(evidence.semanticResult) !== evidence.semanticResultSha256) throw new Error("semantic result artifact/evidence binding mismatch");
  const expectedSemanticPaths = [...new Set([...rehearsalCase.rollbackSemanticContract.postApply.map(({ path }) => path), ...rehearsalCase.rollbackSemanticContract.retainedShell.map(({ path }) => path), ...rehearsalCase.rollbackSemanticContract.protectedExternalPaths.map(({ path }) => path), ...Object.keys(evidence.semanticResult.immutableTestFilesBefore)])];
  exactKeys(semanticInputs.files, expectedSemanticPaths, "semantic input file map");
  const readSemanticInput = (path) => { const encoded = semanticInputs.files[path]; if (encoded === null) return null; if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new Error("semantic input is not canonical base64"); const bytes = Buffer.from(encoded, "base64"); if (bytes.toString("base64") !== encoded) throw new Error("semantic input base64 is non-canonical"); return bytes.toString("utf8"); };
  const observedTreeFiles = validateObservedTreeSemanticInputs({ treeCwd, observedTreeSha: evidence.observedTreeSha, paths: expectedSemanticPaths, readSemanticInput });
  validateSemanticResult({ result: evidence.semanticResult, root: caseRoot, rehearsalCase, patch, readFile: (path) => observedTreeFiles[path] });
  exactKeys(evidence.baseline, ["commands", "flagsProof", "smoke"], "flags-on baseline evidence");
  const baselineSpecs = expectedBaselineSpecs(specs);
  if (!Array.isArray(evidence.baseline.commands) || evidence.baseline.commands.length !== baselineSpecs.length || evidence.baseline.flagsProof?.expectedValue !== "true" || evidence.baseline.smoke?.stage !== "baseline" || evidence.baseline.flagsProof.buildIdSha256 !== evidence.baseline.smoke.webBuildIdSha256) throw new Error("flags-on baseline evidence is incomplete");
  const rtoStart = validateTimestamp(evidence.rtoRpo.startedAt, "RTO start", bounds); const rtoStop = validateTimestamp(evidence.rtoRpo.finishedAt, "RTO stop", bounds);
  const snapshotBeforeAt = validateTimestamp(evidence.durableBefore.capturedAt, "before snapshot", bounds); const snapshotAfterAt = validateTimestamp(evidence.durableAfter.capturedAt, "after snapshot", bounds);
  validateCommands({ commands: evidence.baseline.commands, specs: baselineSpecs, caseRoot, artifactByPath, bounds: { notBefore: Math.max(started, snapshotBeforeAt), notAfter: rtoStart } });
  const baselineFlagCommand = evidence.baseline.commands.find(({ id }) => id === "baseline-flags-proof"); const baselineSmokeCommand = evidence.baseline.commands.find(({ id }) => id === "baseline-service-smoke");
  if (canonicalSha256(JSON.parse(readFileSync(resolveInside(caseRoot, baselineFlagCommand.stdoutPath), "utf8").trim())) !== canonicalSha256(evidence.baseline.flagsProof) || canonicalSha256(JSON.parse(readFileSync(resolveInside(caseRoot, baselineSmokeCommand.stdoutPath), "utf8").trim())) !== canonicalSha256(evidence.baseline.smoke)) throw new Error("baseline proofs are not derived from runner logs");
  const cutoverFinished = validateCutoverCommands(evidence.cutoverCommands, caseRoot, artifactByPath, { notBefore: rtoStart, notAfter: rtoStop });
  validateCommands({ commands: evidence.commands, specs, caseRoot, artifactByPath, bounds: { notBefore: cutoverFinished, notAfter: rtoStop } });
  if (snapshotBeforeAt > rtoStart || snapshotAfterAt < rtoStop) throw new Error("durable snapshots do not bracket rollback cutover");
  validateTranscript(evidence, caseRoot, artifactByPath, run);
  validateRtoRpo(evidence.rtoRpo, evidence.durableBefore, evidence.durableAfter, profile);
  validateFlags(evidence.flagsProof, profile, evidence.commands, caseRoot);
  validateCleanupResult(evidence.cleanup);
  if (evidence.cleanup.status !== "PASS") throw new Error("rollback cleanup did not pass");
  const authority = resourceAuthority({ runId: run.runId, finalSha: run.finalSha, caseId: rehearsalCase.id, runRoot, executionNonce: run.executionNonce, commandSpecSha256: commandSha });
  exactKeys(evidence.baseline.flagsProof, ["status", "expectedValue", "buildIdSha256", "artifactSha256", "files", "rewriteTarget", "manifestFlags"], "baseline flag proof");
  if (evidence.baseline.flagsProof.status !== "PASS" || Object.values(evidence.baseline.flagsProof.manifestFlags).some((value) => value !== "true")) throw new Error("baseline Next manifest is not flags-on");
  validateSmoke(evidence.baseline.smoke, "baseline", authority);
  const rollbackSmokeCommand = evidence.commands.find(({ id }) => id === "rollback-service-smoke");
  const rollbackSmoke = JSON.parse(readFileSync(resolveInside(caseRoot, rollbackSmokeCommand.stdoutPath), "utf8").trim());
  validateSmoke(rollbackSmoke, "rollback", authority);
  if (rollbackSmoke.webBuildIdSha256 !== evidence.flagsProof.buildIdSha256) throw new Error("rollback runtime does not use the proven flags-off Web build");
  if (evidence.flagsProof.rewriteTarget !== `http://127.0.0.1:${authority.apiPort}` || evidence.baseline.flagsProof.rewriteTarget !== `http://127.0.0.1:${authority.apiPort}` || evidence.baseline.smoke.apiPort !== authority.apiPort || evidence.baseline.smoke.webPort !== authority.webPort) throw new Error("build/smoke evidence differs from authority ports");
  if (run.authoritySha256[rehearsalCase.id] !== canonicalSha256(authority) || evidence.cleanup.authoritySha256 !== canonicalSha256(authority)) throw new Error("cleanup resource authority binding mismatch");
  exactKeys(evidence.terminal, ["status", "at", "approver"], "rollback terminal result");
  if (evidence.terminal.status !== "PASS" || evidence.terminal.approver !== readJson(planPath).approver) throw new Error("rollback case lacks its approved PASS terminal result");
  validateTimestamp(evidence.terminal.at, "terminal timestamp", bounds);
  if (evidence.terminal.at !== evidence.finishedAt) throw new Error("terminal result is not nested at the case finish");
}

export function validateRollbackEvidence({ evidenceRoot, expectedRunId, expectedFinalSha, unattestedTestRoot, unattestedTestProfile }) {
  const isUnattestedTest = unattestedTestRoot !== undefined || unattestedTestProfile !== undefined;
  if (isUnattestedTest && (!unattestedTestRoot || !unattestedTestProfile)) throw new Error("unattested test validation requires an explicit root and profile together");
  const loaded = isUnattestedTest ? { profile: unattestedTestProfile, profileSha256: canonicalSha256(unattestedTestProfile) } : loadProfile();
  const { profile, profileSha256 } = loaded;
  assertSemanticContractsReady(profile);
  assertRunId(expectedRunId);
  assertFinalSha(expectedFinalSha);
  const expectedRoot = isUnattestedTest ? resolve(unattestedTestRoot) : resolve(rollbackRoot, expectedRunId);
  const root = resolve(evidenceRoot);
  if (root !== expectedRoot || (!isUnattestedTest && !isPathInside(rollbackRoot, root))) throw new Error("rollback evidence root is not the exact run directory");
  assertPathChainHasNoSymlink(isUnattestedTest ? resolve(root, "..") : resolve(rollbackRoot, "../../.."), root);
  assertNoSymlinks(root);
  const run = readJson(resolve(root, "run-manifest.json"));
  exactKeys(run, RUN_KEYS, "rollback run manifest");
  assertNoSensitiveData(run, "rollback run manifest");
  const expectedRunSchema = isUnattestedTest ? "property-track-c-unattested-test-run-v1" : "property-track-c-rollback-run-v3";
  if (run.schemaVersion !== expectedRunSchema || run.runId !== expectedRunId || run.finalSha !== expectedFinalSha || run.profileSha256 !== profileSha256) throw new Error("rollback run manifest binding mismatch");
  if (run.executionPolicy?.mode !== "FORMAL" || run.executionPolicySha256 !== canonicalSha256(run.executionPolicy)) throw new Error("formal execution policy is missing or invalid");
  if (!/^[0-9a-f]{64}$/u.test(run.executionNonce ?? "")) throw new Error("formal execution nonce is invalid");
  if (run.pnpmCliSha256 !== hashFile(resolvePnpmJsCli()).sha256) throw new Error("pnpm JS CLI provenance drift");
  exactKeys(run.executionPolicy.components, [
    "scripts/e2e/property-remediation/rollback/runner.mjs",
    "scripts/e2e/property-remediation/rollback/command-spec.mjs",
    "scripts/e2e/property-remediation/rollback/runtime-control.mjs",
    "scripts/e2e/property-remediation/rollback/runtime-lease.mjs",
    "scripts/e2e/property-remediation/rollback/flags-proof.mjs",
    "scripts/e2e/property-remediation/rollback/service-smoke.mjs",
    "scripts/e2e/property-remediation/rollback/source-profile.mjs",
    "scripts/e2e/property-remediation/rollback/dependency-control.mjs",
    "scripts/e2e/property-remediation/rollback/build-output.mjs",
    "scripts/e2e/property-remediation/rollback/evidence-gate.mjs",
    "scripts/e2e/property-remediation/rollback/semantic-contract.mjs",
    "scripts/e2e/property-remediation/rollback/lib.mjs",
    "scripts/e2e/property-remediation/rollback/timeout.mjs",
    "scripts/e2e/property-remediation/rollback/comparator.mjs",
    "scripts/e2e/property-remediation/rollback/closure-binding.mjs",
    "scripts/e2e/property-remediation/rollback/patch-validator.mjs",
    "scripts/e2e/property-remediation/rollback/source-validator.mjs",
    "scripts/e2e/property-remediation/rollback/check-config.mjs",
    "scripts/e2e/property-remediation/rollback/profile.v1.json",
    "scripts/e2e/property-remediation/rollback/profile.schema.json"
  ], "formal execution components");
  for (const [path, expected] of Object.entries(run.executionPolicy.components)) {
    assertHash(expected, "formal component hash");
    if (hashFile(resolveInside(repoRoot, path, "formal component path")).sha256 !== expected) throw new Error(`formal execution component drift: ${path}`);
  }
  const createdAt = validateTimestamp(run.createdAt, "run creation timestamp", { notAfter: Date.now() + 60_000 });
  if (createdAt < Date.now() - 24 * 60 * 60 * 1000) throw new Error("rollback run timestamp is stale");
  const sourcePath = resolve(root, "source-binding.json");
  if (hashFile(sourcePath).sha256 !== run.sourceBindingSha256) throw new Error("source binding checksum mismatch");
  const source = readJson(sourcePath);
  exactKeys(source, ["schemaVersion", "finalSha", "head", "commits", "closures"], "rollback source binding");
  if (source.schemaVersion !== "property-track-c-rollback-source-binding-v1" || source.finalSha !== run.finalSha || source.head !== run.finalSha) throw new Error("source binding final SHA mismatch");
  const ids = profile.cases.map(({ id }) => id);
  const commitRefs = [...new Set(profile.cases.flatMap(({ commits }) => commits))].sort();
  exactKeys(source.commits, commitRefs, "source commit binding");
  for (const [commitRef, resolvedSha] of Object.entries(source.commits)) {
    assertFinalSha(resolvedSha);
    if (!resolvedSha.startsWith(commitRef)) throw new Error(`source commit resolution mismatch: ${commitRef}`);
  }
  exactKeys(source.closures, ids, "source closure binding");
  for (const rehearsalCase of profile.cases) {
    const closure = source.closures[rehearsalCase.id];
    exactKeys(closure, ["commits", "touchedPaths", "touchedPathsSha256", "reversePatchSha256"], "source closure");
    if (JSON.stringify(closure.commits.map(({ commitRef }) => commitRef)) !== JSON.stringify([...rehearsalCase.commits].reverse())) throw new Error(`source closure commit order mismatch: ${rehearsalCase.id}`);
    for (const entry of closure.commits) {
      exactKeys(entry, ["commitRef", "fullSha", "reverseDiffSha256"], "source closure commit");
      if (entry.fullSha !== source.commits[entry.commitRef]) throw new Error(`source closure full SHA mismatch: ${rehearsalCase.id}`);
      assertHash(entry.reverseDiffSha256, "closure reverse diff SHA-256");
    }
    if (!Array.isArray(closure.touchedPaths) || closure.touchedPaths.length === 0 || closure.touchedPathsSha256 !== canonicalSha256(closure.touchedPaths)) throw new Error(`source closure path binding mismatch: ${rehearsalCase.id}`);
    assertHash(closure.reversePatchSha256, "source closure full reverse patch SHA-256");
  }
  exactKeys(run.commandSpecsSha256, ids, "run command-spec map");
  exactKeys(run.authoritySha256, ids, "run resource-authority map");
  if (JSON.stringify(run.expectedCaseIds) !== JSON.stringify(ids)) throw new Error("run case list differs from frozen profile");
  const caseEvidence = profile.cases.map((rehearsalCase) => readJson(resolve(root, "cases", rehearsalCase.id, "case-evidence.json")));
  validateCrossCaseDatasetBindings(caseEvidence, profile);
  const treeCwd = isUnattestedTest ? root : repoRoot;
  for (let index = 0; index < profile.cases.length; index += 1) validateCase({ evidence: caseEvidence[index], rehearsalCase: profile.cases[index], profile, profileSha256, run, runRoot: root, sourceBinding: source, treeCwd });
  return { schemaVersion: isUnattestedTest ? "property-track-c-unattested-test-evidence-gate-v1" : "property-track-c-rollback-evidence-gate-v3", status: isUnattestedTest ? "PASS_UNATTESTED_TEST_ONLY" : "PASS", runId: run.runId, finalSha: run.finalSha, profileSha256, observedCases: profile.cases.length, expectedCases: profile.cases.length };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]] = argv[index + 1];
  if (argv.length !== 6 || !values["--evidence-root"] || !values["--run-id"] || !values["--final-sha"]) throw new Error("usage: evidence-gate.mjs --evidence-root <path> --run-id <id> --final-sha <sha>");
  assertNoSensitiveData(values, "evidence-gate argv");
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(validateRollbackEvidence({ evidenceRoot: args["--evidence-root"], expectedRunId: args["--run-id"], expectedFinalSha: args["--final-sha"] }), null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
