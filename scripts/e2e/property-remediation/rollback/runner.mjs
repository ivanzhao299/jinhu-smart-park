import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkConfig } from "./check-config.mjs";
import { buildCommandSpecs, commandSpecSha256, materializeCommand, safeChildEnvironment } from "./command-spec.mjs";
import { compareDurableSnapshots } from "./comparator.mjs";
import {
  assertFinalSha,
  assertHash,
  assertNoSensitiveData,
  assertNoSymlinks,
  assertPathChainHasNoSymlink,
  assertRunId,
  canonicalSha256,
  canonicalReviewIdentity,
  exactKeys,
  hashFile,
  loadProfile,
  readJson,
  redactSensitiveData,
  repoRoot,
  rollbackRoot,
  sha256,
  validateDurableSnapshot,
  validateTimestamp
} from "./lib.mjs";
import { validatePatchMetadata } from "./patch-validator.mjs";
import {
  captureDurableSnapshot,
  CLEANUP_FIELDS,
  cleanupCaseResources,
  provisionCaseDatabase,
  readDatabaseCredential,
  resourceAuthority,
  verifySourceDataset,
  validateCleanupResult
} from "./runtime-control.mjs";
import { validateSourceBinding } from "./source-validator.mjs";
import { execFileBounded, TIMEOUTS, withHardTimeout } from "./timeout.mjs";
import { addSparseWorktree, materializeWorktreeDependencies, resolvePnpmJsCli } from "./dependency-control.mjs";
import { cleanDeclaredBuildOutput } from "./build-output.mjs";
import { initializeRuntimeLease } from "./runtime-lease.mjs";
import { assertBaselineSemanticAnchors, assertSemanticContractsReady, captureImmutableTestFiles, evaluateRollbackSemanticContract } from "./semantic-contract.mjs";

const runnerPath = fileURLToPath(import.meta.url);
const PLAN_KEYS = [
  "schemaVersion",
  "runId",
  "finalSha",
  "profileSha256",
  "caseId",
  "patchMetadataSha256",
  "commandSpecSha256",
  "approver",
  "reviewedAt",
  "approved"
];

function requireMutationOptIn(env = process.env) {
  if (env.PROPERTY_ROLLBACK_REHEARSAL !== "yes") throw new Error("prepare/execute requires PROPERTY_ROLLBACK_REHEARSAL=yes");
}

function writeJsonExclusive(path, value) {
  assertNoSensitiveData(value, `JSON artifact ${path}`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

export function parseOptions(argv) {
  const mode = argv[0] ?? "--check";
  const allowedByMode = { "--check": new Set(["final-sha"]), "--prepare": new Set(["run-id", "final-sha"]), "--execute": new Set(["run-id", "final-sha", "case"]) };
  if (!allowedByMode[mode]) throw new Error("unknown rollback runner mode");
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || argv[index + 1] === undefined) throw new Error("invalid rollback runner arguments");
    const name = argv[index].slice(2);
    if (!allowedByMode[mode].has(name)) throw new Error(`unknown option for ${mode}: --${name}`);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate rollback runner option: --${name}`);
    options[name] = argv[index + 1];
  }
  assertNoSensitiveData(options, "rollback runner argv");
  return { mode, options };
}

function requiredOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

function ensureSafeArtifactRoot() {
  const segments = [resolve(rollbackRoot, "../../.."), resolve(rollbackRoot, "../.."), resolve(rollbackRoot, ".."), rollbackRoot];
  for (const path of segments) {
    if (!existsSync(path)) mkdirSync(path, { recursive: false, mode: 0o700 });
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`unsafe rollback artifact directory: ${path}`);
  }
}

function executionPolicy() {
  const names = ["runner.mjs", "command-spec.mjs", "runtime-control.mjs", "runtime-lease.mjs", "flags-proof.mjs", "service-smoke.mjs", "source-profile.mjs", "dependency-control.mjs", "build-output.mjs", "evidence-gate.mjs", "semantic-contract.mjs", "lib.mjs", "timeout.mjs", "comparator.mjs", "closure-binding.mjs", "patch-validator.mjs", "source-validator.mjs", "check-config.mjs", "profile.v1.json", "profile.schema.json"];
  const paths = names.map((name) => resolve(dirname(runnerPath), name));
  return { mode: "FORMAL", components: Object.fromEntries(paths.map((path) => [path.slice(repoRoot.length + 1), hashFile(path).sha256])) };
}

export async function prepareRun({ runId, finalSha, env = process.env, now = () => new Date() } = {}) {
  requireMutationOptIn(env);
  assertRunId(runId);
  assertFinalSha(finalSha);
  const { profile, profileSha256 } = loadProfile();
  assertSemanticContractsReady(profile);
  assertBaselineSemanticAnchors(profile);
  const source = await validateSourceBinding({ finalSha, profile });
  const runRoot = resolve(rollbackRoot, runId);
  ensureSafeArtifactRoot();
  mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  assertPathChainHasNoSymlink(rollbackRoot, runRoot);
  for (const name of ["inputs", "inputs/patches", "inputs/plans", "cases", "failures", "worktrees", "secrets", "tmp"]) { const path = resolve(runRoot, name); mkdirSync(path, { mode: 0o700 }); assertPathChainHasNoSymlink(runRoot, path); }
  const sourcePath = resolve(runRoot, "source-binding.json");
  writeJsonExclusive(sourcePath, source);
  const commandSpecsSha256 = Object.fromEntries(profile.cases.map((entry) => [entry.id, commandSpecSha256(profile, entry)]));
  const executionNonce = randomBytes(32).toString("hex");
  const authorities = Object.fromEntries(profile.cases.map((entry) => [entry.id, resourceAuthority({ runId, finalSha, caseId: entry.id, runRoot, executionNonce, commandSpecSha256: commandSpecsSha256[entry.id] })]));
  const authoritySha256 = Object.fromEntries(Object.entries(authorities).map(([caseId, authority]) => [caseId, canonicalSha256(authority)]));
  const manifest = {
    schemaVersion: "property-track-c-rollback-run-v3",
    runId,
    finalSha,
    profileSha256,
    createdAt: now().toISOString(),
    sourceBindingSha256: hashFile(sourcePath).sha256,
    expectedCaseIds: profile.cases.map(({ id }) => id),
    commandSpecsSha256,
    authoritySha256,
    executionPolicy: executionPolicy(),
    executionPolicySha256: canonicalSha256(executionPolicy()),
    executionNonce,
    pnpmCliSha256: hashFile(resolvePnpmJsCli()).sha256
  };
  writeJsonExclusive(resolve(runRoot, "run-manifest.json"), manifest);
  return { status: "PREPARED", runRoot, manifest, authorities, mutations: ["created isolated evidence directory only"] };
}

function validatePlan({ plan, planPath, run, rehearsalCase, profileSha256, expectedCommandSpecSha256, patchMetadataPath, patchMetadata }) {
  exactKeys(plan, PLAN_KEYS, "rollback execution plan");
  if (plan.schemaVersion !== "property-track-c-reviewed-rollback-plan-v3" || plan.runId !== run.runId || plan.finalSha !== run.finalSha || plan.profileSha256 !== profileSha256 || plan.caseId !== rehearsalCase.id) throw new Error("rollback execution plan binding mismatch");
  if (plan.approved !== true || canonicalReviewIdentity(plan.approver, "plan approver") === canonicalReviewIdentity(patchMetadata.reviewer, "patch reviewer")) throw new Error("rollback execution plan is not independently approved from the patch reviewer");
  validateTimestamp(plan.reviewedAt, "execution-plan review timestamp", { notBefore: Date.parse(run.createdAt), notAfter: Date.now() + 60_000 });
  if (hashFile(patchMetadataPath).sha256 !== plan.patchMetadataSha256) throw new Error("execution plan patch-metadata checksum mismatch");
  if (plan.commandSpecSha256 !== expectedCommandSpecSha256) throw new Error("execution plan command spec checksum mismatch");
  assertHash(plan.patchMetadataSha256, "patch metadata SHA-256");
  assertHash(plan.commandSpecSha256, "command spec SHA-256");
  assertNoSensitiveData(plan, "rollback execution plan");
  return { plan, planSha256: hashFile(planPath).sha256 };
}

async function defaultRunCommand(spec, cwd, databaseUrl, signal, credential, authority, flags = "false") {
  const argv = materializeCommand(spec, cwd);
  assertNoSensitiveData(argv, `runner-owned argv ${spec.id}`);
  const env = safeChildEnvironment({ databaseUrl, needsDatabaseCredential: spec.needsDatabaseCredential, credential, authority, flags, nodeEnvironment: spec.nodeEnvironment, typescriptTestProject: spec.typescriptTestProject, worktree: cwd });
  const startedAt = new Date().toISOString();
  try {
    const { stdout, stderr } = await execFileBounded(argv[0], argv.slice(1), { cwd, env, maxBuffer: 64 * 1024 * 1024 }, { timeout: TIMEOUTS.command, label: `rollback gate ${spec.id}`, signal });
    return { startedAt, finishedAt: new Date().toISOString(), exitCode: 0, stdout, stderr };
  } catch (error) {
    return { startedAt, finishedAt: new Date().toISOString(), exitCode: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message };
  }
}

async function defaultRunGit(args, cwd, { signal, indexFile, input } = {}) {
  const startedAt = new Date().toISOString();
  try {
    const env = { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC", ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}) };
    const { stdout, stderr } = await execFileBounded("/usr/bin/git", args, { cwd, env, input, maxBuffer: 64 * 1024 * 1024 }, { timeout: TIMEOUTS.git, label: `git ${args[0]}`, signal });
    return { startedAt, finishedAt: new Date().toISOString(), exitCode: 0, stdout, stderr };
  } catch (error) {
    return { startedAt, finishedAt: new Date().toISOString(), exitCode: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message };
  }
}

export function runGitWithFrozenPatch(args, cwd, { patchBytes, signal, indexFile } = {}) {
  if (!Buffer.isBuffer(patchBytes) || patchBytes.length === 0) throw new Error("validated frozen rollback patch bytes are required");
  return defaultRunGit(args, cwd, { signal, indexFile, input: patchBytes });
}

function persistLog(result, caseRoot, id, artifacts) {
  assertNoSensitiveData([result.stdout, result.stderr], `command output ${id}`);
  const safeId = id.replace(/[^a-z0-9-]/gu, "-");
  const stdoutPath = `logs/${safeId}.stdout.log`;
  const stderrPath = `logs/${safeId}.stderr.log`;
  writeFileSync(resolve(caseRoot, stdoutPath), result.stdout, { mode: 0o600, flag: "wx" });
  writeFileSync(resolve(caseRoot, stderrPath), result.stderr, { mode: 0o600, flag: "wx" });
  const stdout = hashFile(resolve(caseRoot, stdoutPath));
  const stderr = hashFile(resolve(caseRoot, stderrPath));
  artifacts.push({ path: stdoutPath, ...stdout }, { path: stderrPath, ...stderr });
  return { stdoutPath, stdoutSha256: stdout.sha256, stderrPath, stderrSha256: stderr.sha256 };
}

function buildTranscript(events, executionNonce) {
  let previousHash = sha256(`property-track-c:${executionNonce}`);
  const chained = events.map((event, index) => {
    const projection = { sequence: index + 1, previousHash, event };
    const eventHash = canonicalSha256(projection); previousHash = eventHash;
    return { ...projection, eventHash };
  });
  return { schemaVersion: "property-track-c-execution-transcript-v1", events: chained, terminalHash: previousHash };
}

function validateRunManifest(run, { runId, finalSha, profile, profileSha256, runRoot, sourceBinding }) {
  exactKeys(run, ["schemaVersion", "runId", "finalSha", "profileSha256", "createdAt", "sourceBindingSha256", "expectedCaseIds", "commandSpecsSha256", "authoritySha256", "executionPolicy", "executionPolicySha256", "executionNonce", "pnpmCliSha256"], "rollback run manifest");
  if (run.schemaVersion !== "property-track-c-rollback-run-v3" || run.runId !== runId || run.finalSha !== finalSha || run.profileSha256 !== profileSha256) throw new Error("rollback run binding mismatch");
  if (run.executionPolicy.mode !== "FORMAL" || run.executionPolicySha256 !== canonicalSha256(run.executionPolicy) || canonicalSha256(run.executionPolicy) !== canonicalSha256(executionPolicy())) throw new Error("formal execution policy binding mismatch");
  if (!/^[0-9a-f]{64}$/u.test(run.executionNonce ?? "")) throw new Error("formal execution nonce is invalid");
  if (run.pnpmCliSha256 !== hashFile(resolvePnpmJsCli()).sha256) throw new Error("formal pnpm JS CLI binding mismatch");
  const sourcePath = resolve(runRoot, "source-binding.json");
  if (hashFile(sourcePath).sha256 !== run.sourceBindingSha256 || sourceBinding.finalSha !== finalSha) throw new Error("rollback source binding checksum mismatch");
  const ids = profile.cases.map(({ id }) => id);
  exactKeys(run.commandSpecsSha256, ids, "run command-spec map");
  exactKeys(run.authoritySha256, ids, "run resource-authority map");
  if (JSON.stringify(run.expectedCaseIds) !== JSON.stringify(ids)) throw new Error("rollback run case list mismatch");
  validateTimestamp(run.createdAt, "run creation timestamp", { notAfter: Date.now() + 60_000 });
}

function structuredCleanupFailure(authority, error) {
  const residual = Object.fromEntries(CLEANUP_FIELDS.map((name) => [name, 1]));
  const authoritySha256 = canonicalSha256(authority);
  const projection = { attempted: true, authoritySha256, residual, errors: [redactSensitiveData(error.message)] };
  return validateCleanupResult({ schemaVersion: "property-track-c-runner-cleanup-v1", status: "FAIL", ...projection, manifestSha256: canonicalSha256(projection) });
}

export async function deriveExpectedTree({ finalSha, patchBytes, worktree, indexFile, signal, caseRoot, artifacts }) {
  const commands = [];
  for (const [id, args, consumesPatch] of [["derive-read-tree", ["read-tree", finalSha], false], ["derive-patch-check", ["apply", "--cached", "--check", "-"], true], ["derive-patch-apply", ["apply", "--cached", "-"], true], ["derive-write-tree", ["write-tree"], false]]) {
    const result = consumesPatch ? await runGitWithFrozenPatch(args, worktree, { patchBytes, signal, indexFile }) : await defaultRunGit(args, worktree, { signal, indexFile });
    const logs = persistLog(result, caseRoot, id, artifacts);
    commands.push({ id, startedAt: result.startedAt, finishedAt: result.finishedAt, exitCode: result.exitCode, ...logs });
    if (result.exitCode !== 0) throw new Error(`frozen-tree derivation failed: ${id}`);
    if (id === "derive-write-tree") return { expectedTreeSha: result.stdout.trim(), commands };
  }
  throw new Error("expected rollback tree derivation did not finish");
}

async function executeValidatedCase({ run, runRoot, finalSha, profile, profileSha256, rehearsalCase, authority, sourceBinding, signal }) {
  const caseId = rehearsalCase.id;
  const exactWorktree = authority.worktree;
  if (!existsSync(exactWorktree)) {
    await addSparseWorktree({ worktree: exactWorktree, finalSha, signal });
  }
  const dependencies = await materializeWorktreeDependencies({ worktree: exactWorktree, signal });
  assertPathChainHasNoSymlink(runRoot, exactWorktree);
  assertNoSymlinks(resolve(runRoot, "inputs"));
  const currentSource = await validateSourceBinding({ finalSha, profile, cwd: exactWorktree });
  if (canonicalSha256(currentSource.closures) !== canonicalSha256(sourceBinding.closures)) throw new Error("worktree closure binding differs from prepared source binding");
  const immutableTestFilesBefore = captureImmutableTestFiles(exactWorktree, rehearsalCase);
  const patchMetadataPath = resolve(runRoot, "inputs/patches", `${caseId}.metadata.json`);
  assertPathChainHasNoSymlink(runRoot, patchMetadataPath);
  const patchMetadata = readJson(patchMetadataPath);
  assertNoSensitiveData(patchMetadata, "rollback patch metadata");
  const patch = validatePatchMetadata({ metadata: patchMetadata, rehearsalCase, profile, runRoot, runId: run.runId, finalSha, profileSha256, runCreatedAt: run.createdAt, sourceBinding });
  const specs = buildCommandSpecs(profile, rehearsalCase);
  const expectedCommandSpecSha256 = canonicalSha256(specs);
  if (run.commandSpecsSha256[caseId] !== expectedCommandSpecSha256) throw new Error("run command spec binding mismatch");
  if (run.authoritySha256[caseId] !== canonicalSha256(authority)) throw new Error("run resource authority binding mismatch");
  const planPath = resolve(runRoot, "inputs/plans", `${caseId}.json`);
  assertPathChainHasNoSymlink(runRoot, planPath);
  const { plan, planSha256 } = validatePlan({ plan: readJson(planPath), planPath, run, rehearsalCase, profileSha256, expectedCommandSpecSha256, patchMetadataPath, patchMetadata });
  const caseRoot = resolve(runRoot, "cases", caseId);
  const caseStartedAt = new Date().toISOString();
  mkdirSync(caseRoot, { recursive: false, mode: 0o700 });
  assertPathChainHasNoSymlink(runRoot, caseRoot);
  mkdirSync(resolve(caseRoot, "logs"), { mode: 0o700 });
  mkdirSync(resolve(runRoot, "tmp", caseId), { mode: 0o700 });
  initializeRuntimeLease({ authority, commandSpecSha256: expectedCommandSpecSha256, expectedExecutable: realpathSync(process.execPath) });
  const artifacts = [];
  const frozenPatchPath = resolve(caseRoot, "frozen-rollback.patch");
  writeFileSync(frozenPatchPath, patch.bytes, { mode: 0o400, flag: "wx" });
  const frozenPatchArtifact = { path: "frozen-rollback.patch", ...hashFile(frozenPatchPath) };
  if (frozenPatchArtifact.sha256 !== patch.sha256 || frozenPatchArtifact.size !== patch.size) throw new Error("frozen rollback patch artifact differs from validated bytes");
  artifacts.push(frozenPatchArtifact);
  const credential = readDatabaseCredential(authority, runRoot);
  const sourceDataset = await verifySourceDataset({ credential, profile, signal });
  const provisioned = await provisionCaseDatabase({ authority, credential, profile, sourceIdentity: sourceDataset.identity, signal });
  const databaseUrl = credential.targetDatabaseUrl;
  const durableBefore = provisioned.targetSnapshot;
  validateDurableSnapshot(durableBefore, profile);
  const baselineCommands = [];
  let baselineFlagsProof = null; let baselineSmoke = null;
  const baselineSpecs = [
    { ...specs.find(({ id }) => id === "shared-build"), id: "baseline-shared-build" },
    { ...specs.find(({ id }) => id === "api-build"), id: "baseline-api-build" },
    { ...specs.find(({ id }) => id === "web-clean-production-build"), id: "baseline-web-clean-production-build" },
    { ...specs.find(({ id }) => id === "flags-artifact-runtime-proof"), id: "baseline-flags-proof", args: specs.find(({ id }) => id === "flags-artifact-runtime-proof").args.map((value) => value === "false" ? "true" : value) },
    { ...specs.find(({ id }) => id === "rollback-service-smoke"), id: "baseline-service-smoke", args: specs.find(({ id }) => id === "rollback-service-smoke").args.map((value) => value === "rollback" ? "baseline" : value) }
  ];
  for (const spec of baselineSpecs) {
    cleanDeclaredBuildOutput(exactWorktree, spec);
    const result = await defaultRunCommand(spec, exactWorktree, databaseUrl, signal, credential, authority, "true");
    const logs = persistLog(result, caseRoot, spec.id, artifacts);
    baselineCommands.push({ id: spec.id, commandSpecSha256: canonicalSha256(spec), startedAt: result.startedAt, finishedAt: result.finishedAt, exitCode: result.exitCode, ...logs });
    if (result.exitCode !== 0) throw new Error(`flags-on baseline gate failed: ${spec.id}`);
    if (spec.id === "baseline-flags-proof") baselineFlagsProof = JSON.parse(result.stdout.trim());
    if (spec.id === "baseline-service-smoke") baselineSmoke = JSON.parse(result.stdout.trim());
  }
  if (baselineFlagsProof?.expectedValue !== "true" || baselineSmoke?.stage !== "baseline" || baselineSmoke.webBuildIdSha256 !== baselineFlagsProof.buildIdSha256) throw new Error("flags-on baseline build/runtime binding failed");
  const rtoStartedAt = new Date().toISOString();
  const monotonicStarted = process.hrtime.bigint();
  const phase = await withHardTimeout(async (rtoSignal) => {
    const derived = await deriveExpectedTree({ finalSha, patchBytes: patch.bytes, worktree: exactWorktree, indexFile: resolve(runRoot, "tmp", caseId, "derived.index"), signal: rtoSignal, caseRoot, artifacts });
    const cutoverCommands = [...derived.commands];
    for (const [id, args, consumesPatch] of [["patch-check", ["apply", "--check", "--index", "-"], true], ["patch-apply", ["apply", "--index", "-"], true], ["write-tree", ["write-tree"], false]]) {
      const result = consumesPatch ? await runGitWithFrozenPatch(args, exactWorktree, { patchBytes: patch.bytes, signal: rtoSignal }) : await defaultRunGit(args, exactWorktree, { signal: rtoSignal }); const logs = persistLog(result, caseRoot, id, artifacts);
      cutoverCommands.push({ id, startedAt: result.startedAt, finishedAt: result.finishedAt, exitCode: result.exitCode, ...logs });
      if (result.exitCode !== 0) throw new Error(`reviewed rollback ${id} failed`);
    }
    const observedTreeSha = readFileSync(resolve(caseRoot, cutoverCommands.at(-1).stdoutPath), "utf8").trim();
    if (observedTreeSha !== derived.expectedTreeSha) throw new Error("rollback result tree differs from frozen-final derived expected tree");
    const semantic = evaluateRollbackSemanticContract({ root: exactWorktree, rehearsalCase, patch, immutableBefore: immutableTestFilesBefore });
    const semanticInputs = { schemaVersion: "property-track-c-rollback-semantic-inputs-v1", files: Object.fromEntries(Object.entries(semantic.fileContents).map(([path, text]) => [path, text === null ? null : Buffer.from(text, "utf8").toString("base64")])) };
    const semanticInputsPath = resolve(caseRoot, "semantic-inputs.json"); const semanticResultPath = resolve(caseRoot, "semantic-result.json");
    writeJsonExclusive(semanticInputsPath, semanticInputs); writeJsonExclusive(semanticResultPath, semantic.result);
    const semanticInputsArtifact = { path: "semantic-inputs.json", ...hashFile(semanticInputsPath) }; const semanticResultArtifact = { path: "semantic-result.json", ...hashFile(semanticResultPath) };
    artifacts.push(semanticInputsArtifact, semanticResultArtifact);
    const commands = []; let flagsProof = null;
    for (const spec of specs) {
      cleanDeclaredBuildOutput(exactWorktree, spec);
      const result = await defaultRunCommand(spec, exactWorktree, databaseUrl, rtoSignal, credential, authority); const logs = persistLog(result, caseRoot, spec.id, artifacts);
      commands.push({ id: spec.id, commandSpecSha256: canonicalSha256(spec), startedAt: result.startedAt, finishedAt: result.finishedAt, exitCode: result.exitCode, ...logs });
      if (result.exitCode !== 0) throw new Error(`rollback validation gate failed: ${spec.id}`);
      if (spec.id === "flags-artifact-runtime-proof") { try { flagsProof = JSON.parse(result.stdout.trim()); } catch { throw new Error("flags proof did not emit strict JSON"); } }
    }
    const rollbackSmoke = JSON.parse(readFileSync(resolve(caseRoot, commands.find(({ id }) => id === "rollback-service-smoke").stdoutPath), "utf8").trim());
    if (rollbackSmoke.stage !== "rollback" || rollbackSmoke.webBuildIdSha256 !== flagsProof?.buildIdSha256) throw new Error("flags-off rollback build/runtime binding failed");
    return { expectedTreeSha: derived.expectedTreeSha, observedTreeSha, cutoverCommands, commands, flagsProof, rollbackSmoke, semanticResult: semantic.result, semanticResultSha256: semantic.resultSha256, semanticInputsSha256: semanticInputsArtifact.sha256 };
  }, profile.rtoTargetMilliseconds, "complete rollback RTO phase", signal);
  const { expectedTreeSha, observedTreeSha, cutoverCommands, commands, flagsProof, semanticResult, semanticResultSha256, semanticInputsSha256 } = phase;
  const monotonicFinished = process.hrtime.bigint();
  const rtoFinishedAt = new Date().toISOString();
  const durableAfter = await captureDurableSnapshot({ databaseUrl, expectedDatabase: authority.database, profile, signal });
  validateDurableSnapshot(durableAfter, profile);
  const finishedAt = new Date().toISOString();
  const durableComparison = compareDurableSnapshots(durableBefore, durableAfter, profile);
  const rtoMilliseconds = Number(monotonicFinished - monotonicStarted) / 1_000_000;
  if (!durableComparison.identical || rtoMilliseconds > profile.rtoTargetMilliseconds) throw new Error("rollback RTO/RPO target failed");
  const transcript = buildTranscript([
    { type: "source-dataset", sha256: sourceDataset.identity.tablesSha256 },
    { type: "target-clone", sha256: provisioned.targetIdentity.tablesSha256 },
    ...baselineCommands.map((command) => ({ type: "baseline-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rto-start", at: rtoStartedAt },
    ...cutoverCommands.map((command) => ({ type: "cutover-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rollback-patch", patchSha256: patch.sha256, expectedTreeSha, observedTreeSha },
    { type: "semantic-contract", resultSha256: semanticResultSha256, inputsSha256: semanticInputsSha256 },
    ...commands.map((command) => ({ type: "rollback-command", id: command.id, startedAt: command.startedAt, finishedAt: command.finishedAt, stdoutSha256: command.stdoutSha256, stderrSha256: command.stderrSha256 })),
    { type: "rto-stop", at: rtoFinishedAt },
    { type: "durable-after", sha256: canonicalSha256(durableAfter.tables) }
  ], run.executionNonce);
  const transcriptPath = resolve(caseRoot, "execution-transcript.json");
  writeJsonExclusive(transcriptPath, transcript);
  artifacts.push({ path: "execution-transcript.json", ...hashFile(transcriptPath) });
  return {
    caseRoot,
    evidence: {
      schemaVersion: "property-track-c-rollback-case-evidence-v3",
      provenance: { ...executionPolicy(), executionPolicySha256: canonicalSha256(executionPolicy()) },
      dependencyMaterialization: { pnpmVersion: dependencies.pnpmVersion, pnpmCliSha256: dependencies.pnpmCliSha256, trustedStore: dependencies.store, trustedVirtualStore: dependencies.virtualStore },
      sourceDataset: sourceDataset.identity,
      transcriptSha256: transcript.terminalHash,
      runId: run.runId,
      finalSha,
      profileSha256,
      caseId,
      commits: rehearsalCase.commits,
      planSha256,
      patchMetadataSha256: hashFile(patchMetadataPath).sha256,
      commandSpecSha256: expectedCommandSpecSha256,
      closureBindingSha256: patchMetadata.closureBindingSha256,
      originalReverseSha256: patchMetadata.originalReverseSha256,
      manualPatchSha256: patchMetadata.manualPatchSha256,
      deviationManifestSha256: patch.deviationManifestSha256,
      semanticResult,
      semanticResultSha256,
      semanticInputsSha256,
      rollbackPatchSha256: patch.sha256,
      expectedTreeSha,
      observedTreeSha,
      startedAt: caseStartedAt,
      finishedAt,
      baseline: { commands: baselineCommands, flagsProof: baselineFlagsProof, smoke: baselineSmoke },
      cutoverCommands,
      commands,
      durableBefore,
      durableAfter,
      rtoRpo: { startedAt: rtoStartedAt, finishedAt: rtoFinishedAt, monotonicStartedNanoseconds: monotonicStarted.toString(), monotonicFinishedNanoseconds: monotonicFinished.toString(), rtoMilliseconds, rpoCommittedRows: durableComparison.rpoCommittedRows },
      flagsProof,
      cleanup: null,
      terminal: { status: "PENDING_CLEANUP", at: finishedAt, approver: plan.approver },
      artifacts
    }
  };
}

export async function executeCase({ runId, finalSha, caseId, env = process.env } = {}) {
  requireMutationOptIn(env);
  assertRunId(runId);
  assertFinalSha(finalSha);
  const { profile, profileSha256 } = loadProfile();
  assertSemanticContractsReady(profile);
  const rehearsalCase = profile.cases.find(({ id }) => id === caseId);
  if (!rehearsalCase) throw new Error("unknown rollback case");
  const runRoot = resolve(rollbackRoot, runId);
  let authority = resourceAuthority({ runId, finalSha, caseId, runRoot, executionNonce: "0".repeat(64), commandSpecSha256: "0".repeat(64) });
  const controller = new globalThis.AbortController();
  const onSignal = () => controller.abort(new Error("rollback runner interrupted"));
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  let result = null;
  let primaryError = null;
  let cleanupResult = null;
  try {
    assertPathChainHasNoSymlink(resolve(rollbackRoot, "../../.."), runRoot);
    for (const path of [resolve(runRoot, "run-manifest.json"), resolve(runRoot, "source-binding.json"), ...["inputs", "worktrees", "cases", "tmp", "secrets"].map((name) => resolve(runRoot, name))]) assertPathChainHasNoSymlink(runRoot, path);
    assertNoSymlinks(resolve(runRoot, "inputs"));
    const run = readJson(resolve(runRoot, "run-manifest.json"));
    const sourceBinding = readJson(resolve(runRoot, "source-binding.json"));
    validateRunManifest(run, { runId, finalSha, profile, profileSha256, runRoot, sourceBinding });
    authority = resourceAuthority({ runId, finalSha, caseId, runRoot, executionNonce: run.executionNonce, commandSpecSha256: run.commandSpecsSha256[caseId] });
    result = await executeValidatedCase({ run, runRoot, finalSha, profile, profileSha256, rehearsalCase, authority, sourceBinding, signal: controller.signal });
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      cleanupResult = validateCleanupResult(await cleanupCaseResources({ authority, runRoot, repoRoot }));
    } catch (error) {
      cleanupResult = structuredCleanupFailure(authority, error);
      primaryError = new Error(`${primaryError?.message ?? "rollback execution failed cleanup"}; cleanup validation failed: ${error.message}`);
    }
  }
  process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
  if (primaryError || cleanupResult?.status !== "PASS") {
    const failure = {
      schemaVersion: "property-track-c-rollback-failure-evidence-v2",
      runId,
      finalSha,
      profileSha256,
      caseId,
      error: redactSensitiveData(primaryError?.message ?? "runner-owned cleanup did not reach PASS"),
      cleanup: cleanupResult,
      terminal: { status: "FAIL", at: new Date().toISOString() }
    };
    const failurePath = resolve(runRoot, "failures", `${caseId}-${Date.now()}.json`);
    if (existsSync(dirname(failurePath))) writeJsonExclusive(failurePath, failure);
    throw new Error(failure.error);
  }
  result.evidence.cleanup = cleanupResult;
  const terminalAt = new Date().toISOString();
  result.evidence.finishedAt = terminalAt;
  result.evidence.terminal = { ...result.evidence.terminal, status: "PASS", at: terminalAt };
  writeJsonExclusive(resolve(result.caseRoot, "case-evidence.json"), result.evidence);
  return { status: "PASS", caseId, evidencePath: resolve(result.caseRoot, "case-evidence.json") };
}

async function main(argv) {
  const { mode, options } = parseOptions(argv);
  let finalSha = options["final-sha"];
  if (mode === "--check" && !finalSha) {
    const result = await defaultRunGit(["rev-parse", "HEAD"], repoRoot);
    if (result.exitCode !== 0) throw new Error("could not resolve default final SHA");
    finalSha = result.stdout.trim();
  }
  if (!finalSha) throw new Error("missing --final-sha");
  if (mode === "--check") return checkConfig({ finalSha });
  if (mode === "--prepare") return prepareRun({ runId: requiredOption(options, "run-id"), finalSha });
  if (mode === "--execute") return executeCase({ runId: requiredOption(options, "run-id"), finalSha, caseId: requiredOption(options, "case") });
  throw new Error("usage: runner.mjs [--check|--prepare|--execute] --final-sha <sha> [--run-id <id> --case <id>]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
