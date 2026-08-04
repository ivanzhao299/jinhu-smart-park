#!/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdirSync,
  readFileSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const FORMAL_RUN_ID = "b2c197_prelim_20260802f";
export const ATTEMPT_ID = "b2c197_prelim_20260802f_formal_launch_attempt01";
export const NODE_PATH = "/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node";
export const NODE_REALPATH = NODE_PATH;
export const NODE_VERSION = "v22.23.2";
export const NODE_SHA256 = "3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327";

const SELF_PATH = fileURLToPath(import.meta.url);
const here = dirname(SELF_PATH);
export const ROOT = resolve(here, "../../..");
export const RESEARCH_ROOT = resolve(ROOT,
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
export const ORCHESTRATOR_PATH = resolve(ROOT,
  "scripts/e2e/property-remediation/track-b2c-000197-preliminary-orchestrator-v11.mjs");
export const ORCHESTRATOR_SHA256 = "88e430267c061d77143aee5f4e6677d848e924ece677ff2820655c6f5f3b7e5d";
export const FORMAL_EVIDENCE_ROOT = resolve(RESEARCH_ROOT,
  "b2c-000197-v11-v5-formal-evidence-b2c197_prelim_20260802f");
export const LAUNCH_EVIDENCE_ROOT = resolve(RESEARCH_ROOT,
  "b2c-000197-v11-v5-launch-evidence-b2c197_prelim_20260802f-launch-attempt01");
export const LAUNCH_QA_PATH = resolve(RESEARCH_ROOT,
  "b2c-000197-v11-v5-formal-launch-independent-qa-go-20260802.grammar");

export const OUTPUT_PATHS = Object.freeze({
  authority: resolve(RESEARCH_ROOT,
    "b2c-000197-v11-v5-formal-launch-authority-20260802.grammar"),
  handoff: resolve(RESEARCH_ROOT,
    "b2c-000197-v11-v5-formal-launch-handoff-20260802.grammar"),
  manifest: resolve(RESEARCH_ROOT,
    "b2c-000197-v11-v5-formal-launch-manifest-20260802.grammar"),
  testRecord: resolve(RESEARCH_ROOT,
    "b2c-000197-v11-v5-formal-launch-test-record-20260802.grammar"),
});

const input = (filename, rawSha256) => Object.freeze({
  path: resolve(RESEARCH_ROOT, filename), rawSha256,
});
export const FROZEN_INPUTS = Object.freeze({
  launchContract: input("b2c-000197-v11-v5-launch-contract-handoff-20260802.md",
    "39b899a181e9d420220428733566b79a4200700a7a42e204ad89613fba5bd0ae"),
  candidateManifest: input("b2c-000197-preliminary-v11-v5-input-manifest-20260802.grammar",
    "e6d79fc1581ba580932b4689095117ffd2b482d33f5809c71964102f7b5af017"),
  candidateHandoff: input("b2c-000197-preliminary-executor-v11-v5-review-handoff-20260802.md",
    "81c23cb59cd602e762d763da80beab699505a54c89c8175ef8d39c45e1460c60"),
  databaseGo: input("b2c-000197-preliminary-v11-v5-independent-database-review-20260802.grammar",
    "77f1d3dc8fb42aae2a48385caa22acb385671e6fe02ad941b7bdaf7c116790a7"),
  qaGo: input("b2c-000197-preliminary-v11-v5-independent-qa-security-review-20260802.grammar",
    "5ab20a43d84e32f6436686972af602b21abb5a4dc1f73d1fa81c670145de144f"),
  drainGo: input("b2c-000197-preliminary-v11-v5-old-writer-drain-20260802.grammar",
    "03cd70e5690b1ecb7acef85b546f3dc5583b2b79fd3ec781cb26982748e206b2"),
  missingRunIdAudit: input("b2c-000197-v11-v5-missing-runid-pre-intake-invocation-audit-20260802.json",
    "964641668e9661dbae4ba67feacddba5f0f9d51c7869a3459349faf276047d9f"),
  missingRunIdManifest: input("b2c-000197-v11-v5-missing-runid-pre-intake-invocation-audit-20260802.manifest.json",
    "ee860c4292210d8a95e1be2a29ad006eadefab3e6c553e2f698bcbd8ab97b811"),
  missingSixAudit: input("b2c-000197-v11-v5-missing-six-go-env-pre-intake-invocation-audit-20260802.json",
    "8b5345673f1b44237d343efe9e4134a0f606e2fd8c4ad90aeff791e590f0456c"),
  missingSixManifest: input("b2c-000197-v11-v5-missing-six-go-env-pre-intake-invocation-audit-20260802.manifest.json",
    "aff41f7885d1f26ad80fc5b0a8c6682068a14d05da86b656acfe72a65648ed5e"),
});

export const LAUNCH_ENVIRONMENT = Object.freeze({
  B2C_000197_PRELIMINARY_V11_EXECUTE: "1",
  B2C_000197_PRELIMINARY_V11_RUN_ID: FORMAL_RUN_ID,
  B2C_000197_V11_DATABASE_PATH: FROZEN_INPUTS.databaseGo.path,
  B2C_000197_V11_DATABASE_SHA: FROZEN_INPUTS.databaseGo.rawSha256,
  B2C_000197_V11_QA_PATH: FROZEN_INPUTS.qaGo.path,
  B2C_000197_V11_QA_SHA: FROZEN_INPUTS.qaGo.rawSha256,
  B2C_000197_V11_DRAIN_PATH: FROZEN_INPUTS.drainGo.path,
  B2C_000197_V11_DRAIN_SHA: FROZEN_INPUTS.drainGo.rawSha256,
});
export const CONFLICT_KEYS = Object.freeze([
  "B2C_000197_V11_PREFLIGHT", "B2C_000197_V11_FREEZE",
  "B2C_000197_V11_STATIC_GATE", "B2C_000197_V11_STATIC_MODE",
]);

const QA_KEYS = Object.freeze([
  "formal_run_id", "attempt_id", "launch_contract_handoff_raw_sha256",
  "candidate_manifest_raw_sha256", "candidate_handoff_raw_sha256",
  "database_go_raw_sha256", "qa_go_raw_sha256", "drain_go_raw_sha256",
  "node_path", "node_raw_sha256", "orchestrator_path", "orchestrator_raw_sha256",
  "launcher_raw_sha256", "launcher_authority_raw_sha256", "launcher_handoff_raw_sha256",
  "launcher_manifest_raw_sha256", "launcher_test_record_raw_sha256",
  "reviewer_authority", "formal_go", "execution_authorized", "decision",
  "open_p0", "open_p1", "open_p2",
]);
const URL_SECRET = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const KEY_VALUE_SECRET = /\b(password|passwd|pwd|secret|token|credential)=((?!<redacted>)[^\s&;]+)/giu;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const asBuffer = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");

export function redactLaunchEvidence(value) {
  return String(value ?? "").replace(URL_SECRET, "<redacted-database-url>")
    .replace(KEY_VALUE_SECRET, (_, key) => `${key}=<redacted>`);
}

export function parseStrictLaunchGrammar(value, header, keys = QA_KEYS) {
  const lines = String(value).split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== header) throw new Error("b2c-000197-v11-v5-launch-qa-header-drift");
  const allowed = new Set(keys); const parsed = new Map();
  for (const line of lines) {
    const at = line.indexOf("\t"); const key = line.slice(0, at);
    if (at <= 0 || !allowed.has(key)) throw new Error(`b2c-000197-v11-v5-launch-qa-unknown:${key}`);
    if (parsed.has(key)) throw new Error(`b2c-000197-v11-v5-launch-qa-duplicate:${key}`);
    parsed.set(key, line.slice(at + 1));
  }
  if (parsed.size !== keys.length) throw new Error("b2c-000197-v11-v5-launch-qa-field-count");
  return parsed;
}

function requireValue(fields, key, expected) {
  if (fields.get(key) !== expected) throw new Error(`b2c-000197-v11-v5-launch-qa-drift:${key}`);
}

export function assertNoConflictingModes(environment) {
  for (const key of CONFLICT_KEYS) {
    if (Object.hasOwn(environment, key)) throw new Error(`b2c-000197-v11-v5-launch-conflict:${key}`);
  }
}

export function buildLaunchEnvironment(environment = process.env) {
  assertNoConflictingModes(environment);
  return Object.freeze({
    PATH: `${dirname(NODE_PATH)}:/usr/bin:/bin`, LANG: "C.UTF-8", ...LAUNCH_ENVIRONMENT,
  });
}

function verifyExactFile(path, expectedSha, label, dependencies) {
  if (!dependencies.existsSync(path) || dependencies.lstatSync(path).isSymbolicLink()
      || dependencies.realpathSync(path) !== path
      || sha256(dependencies.readFileSync(path)) !== expectedSha) {
    throw new Error(`b2c-000197-v11-v5-launch-input-drift:${label}`);
  }
}

export function verifyExactLaunchFiles(entries, dependencies = {
  existsSync, lstatSync, readFileSync, realpathSync,
}) {
  for (const [label, value] of Object.entries(entries)) {
    verifyExactFile(value.path, value.rawSha256, label, dependencies);
  }
  return true;
}

export function verifyLaunchQa(qaBytes, bindings) {
  const fields = parseStrictLaunchGrammar(qaBytes,
    "b2c-000197-v11-v5-formal-launch-independent-qa-go-v1");
  const expected = {
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
    launch_contract_handoff_raw_sha256: FROZEN_INPUTS.launchContract.rawSha256,
    candidate_manifest_raw_sha256: FROZEN_INPUTS.candidateManifest.rawSha256,
    candidate_handoff_raw_sha256: FROZEN_INPUTS.candidateHandoff.rawSha256,
    database_go_raw_sha256: FROZEN_INPUTS.databaseGo.rawSha256,
    qa_go_raw_sha256: FROZEN_INPUTS.qaGo.rawSha256,
    drain_go_raw_sha256: FROZEN_INPUTS.drainGo.rawSha256,
    node_path: NODE_PATH, node_raw_sha256: NODE_SHA256,
    orchestrator_path: ORCHESTRATOR_PATH, orchestrator_raw_sha256: ORCHESTRATOR_SHA256,
    ...bindings, reviewer_authority: "independent-formal-launch-qa-security-reviewer",
    formal_go: "true", execution_authorized: "true", decision: "GO",
    open_p0: "0", open_p1: "0", open_p2: "0",
  };
  for (const [key, value] of Object.entries(expected)) requireValue(fields, key, value);
  return Object.fromEntries(fields);
}

export function verifyFrozenLaunchInputs(dependencies = {
  accessSync, existsSync, lstatSync, readFileSync, realpathSync,
}) {
  if (process.execPath !== NODE_PATH || process.version !== NODE_VERSION) {
    throw new Error("b2c-000197-v11-v5-launch-node-runtime-drift");
  }
  dependencies.accessSync(NODE_PATH, fsConstants.X_OK);
  verifyExactFile(NODE_PATH, NODE_SHA256, "node", dependencies);
  verifyExactFile(ORCHESTRATOR_PATH, ORCHESTRATOR_SHA256, "orchestrator", dependencies);
  verifyExactLaunchFiles(FROZEN_INPUTS, dependencies);
  if (dependencies.existsSync(FORMAL_EVIDENCE_ROOT)) {
    throw new Error("b2c-000197-v11-v5-launch-formal-root-exists");
  }
  if (!dependencies.existsSync(LAUNCH_QA_PATH)) {
    throw new Error("b2c-000197-v11-v5-launch-blocked-awaiting-independent-qa-go");
  }
  if (dependencies.lstatSync(LAUNCH_QA_PATH).isSymbolicLink()
      || dependencies.realpathSync(LAUNCH_QA_PATH) !== LAUNCH_QA_PATH) {
    throw new Error("b2c-000197-v11-v5-launch-qa-path-drift");
  }
  const outputHashes = {};
  for (const [key, path] of Object.entries(OUTPUT_PATHS)) {
    if (!dependencies.existsSync(path) || dependencies.lstatSync(path).isSymbolicLink()
        || dependencies.realpathSync(path) !== path) {
      throw new Error(`b2c-000197-v11-v5-launch-output-drift:${key}`);
    }
    outputHashes[`${key === "testRecord" ? "launcher_test_record" : `launcher_${key}`}_raw_sha256`]
      = sha256(dependencies.readFileSync(path));
  }
  const launcherSha = sha256(dependencies.readFileSync(SELF_PATH));
  const qa = verifyLaunchQa(dependencies.readFileSync(LAUNCH_QA_PATH), {
    launcher_raw_sha256: launcherSha, ...outputHashes,
  });
  return { launcherSha, outputHashes, qa, launchQaSha: sha256(dependencies.readFileSync(LAUNCH_QA_PATH)) };
}

export function atomicClaimLaunchAttempt(evidenceRoot = LAUNCH_EVIDENCE_ROOT,
  dependencies = { mkdirSync, realpathSync, statSync }) {
  dependencies.mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 });
  if (dependencies.realpathSync(evidenceRoot) !== evidenceRoot
      || !dependencies.statSync(evidenceRoot).isDirectory()) {
    throw new Error("b2c-000197-v11-v5-launch-claim-identity-drift");
  }
  return evidenceRoot;
}

export class FormalLaunchEvidenceRecorder {
  constructor(evidenceRoot, dependencies = { writeFileSync, chmodSync, statSync }) {
    this.root = evidenceRoot; this.dependencies = dependencies; this.entries = [];
    this.terminalWritten = false;
  }

  write(filename, payload) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root) throw new Error("b2c-000197-v11-v5-launch-evidence-path-escape");
    const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const encoded = content.toString("utf8");
    if (URL_SECRET.test(encoded) || KEY_VALUE_SECRET.test(encoded)) {
      URL_SECRET.lastIndex = 0; KEY_VALUE_SECRET.lastIndex = 0;
      throw new Error("b2c-000197-v11-v5-launch-evidence-secret-leak");
    }
    this.dependencies.writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    this.dependencies.chmodSync(path, 0o444);
    const observed = this.dependencies.statSync(path);
    if ((observed.mode & 0o777) !== 0o444 || observed.size !== content.byteLength) {
      throw new Error("b2c-000197-v11-v5-launch-evidence-mode-or-size-drift");
    }
    const entry = { filename, bytes: content.byteLength, raw_sha256: sha256(content) };
    this.entries.push(entry); return entry;
  }

  terminal(kind, payload) {
    if (this.terminalWritten) throw new Error("b2c-000197-v11-v5-launch-terminal-already-written");
    this.terminalWritten = true;
    const artifact = this.write(`${kind}-${ATTEMPT_ID}.json`, {
      schema_version: "b2c-000197-v11-v5-formal-launch-terminal-v1",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "SUCCESS" : "FAILED",
      spawn_attempts: 1, retry_attempted: false, cleanup_attempted: false,
      attempt_reusable: false, evidence_entries: [...this.entries], ...payload,
    });
    return this.write(`${kind}-${ATTEMPT_ID}.manifest.json`, {
      schema_version: "b2c-000197-v11-v5-formal-launch-terminal-manifest-v1",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "SUCCESS" : "FAILED", artifact,
    });
  }
}

export function executeClaimedLaunch({ evidenceRoot, spawn = spawnSync,
  now = () => new Date().toISOString(), environment = process.env }) {
  const childEnvironment = buildLaunchEnvironment(environment);
  const recorder = new FormalLaunchEvidenceRecorder(evidenceRoot);
  const authorizationKeys = Object.keys(LAUNCH_ENVIRONMENT);
  recorder.write("001-formal-launch-intent.json", {
    schema_version: "b2c-000197-v11-v5-formal-launch-intent-v1",
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, recorded_at_utc: now(),
    command: NODE_PATH, argv: [ORCHESTRATOR_PATH], cwd: ROOT, shell: false,
    authorization_environment: authorizationKeys.map((key) => ({ key, value: LAUNCH_ENVIRONMENT[key] })),
    conflicting_environment_keys_asserted_absent: CONFLICT_KEYS,
    secret_environment_keys: [], stdin: { present: false, bytes: 0 },
  });
  let child;
  try {
    child = spawn(NODE_PATH, [ORCHESTRATOR_PATH], {
      cwd: ROOT, env: childEnvironment, shell: false, encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  }
  const stdout = asBuffer(child.stdout); const stderr = asBuffer(child.stderr);
  recorder.write("002-formal-launch-result.json", {
    schema_version: "b2c-000197-v11-v5-formal-launch-result-v1",
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, recorded_at_utc: now(),
    exit_code: child.status ?? null, signal: child.signal ?? null,
    spawn_error: child.error ? redactLaunchEvidence(child.error.message ?? String(child.error)) : null,
    stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout),
      redacted_utf8: redactLaunchEvidence(stdout.toString("utf8")) },
    stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr),
      redacted_utf8: redactLaunchEvidence(stderr.toString("utf8")) },
  });
  if (child.error || child.status !== 0 || child.signal != null) {
    recorder.terminal("failure", { failure_reason: redactLaunchEvidence(
      child.error?.message ?? `child-exit:${child.status}:signal:${child.signal}`) });
    throw new Error("b2c-000197-v11-v5-formal-launch-child-failed");
  }
  recorder.terminal("success", { child_exit_code: 0, child_signal: null });
  return { status: "SUCCESS", spawnAttempts: 1, retryAttempted: false, cleanupAttempted: false };
}

export function runAuthorizedLaunch(dependencies = {}) {
  const verified = verifyFrozenLaunchInputs(dependencies.fs);
  assertNoConflictingModes(dependencies.environment ?? process.env);
  atomicClaimLaunchAttempt(dependencies.evidenceRoot ?? LAUNCH_EVIDENCE_ROOT, dependencies.claimFs);
  return { verified, result: executeClaimedLaunch({
    evidenceRoot: dependencies.evidenceRoot ?? LAUNCH_EVIDENCE_ROOT,
    spawn: dependencies.spawn ?? spawnSync, now: dependencies.now,
    environment: dependencies.environment ?? process.env,
  }) };
}

export function staticLaunchEnvelope() {
  return {
    status: "blocked-awaiting-independent-formal-launch-qa-go",
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
    execution_authorized: false, formal_execution_started: false,
    launch_qa_path: LAUNCH_QA_PATH, launch_evidence_root: LAUNCH_EVIDENCE_ROOT,
    formal_evidence_root: FORMAL_EVIDENCE_ROOT,
  };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V11_V5_LAUNCH_EXECUTE === "1") {
    try { runAuthorizedLaunch(); } catch (error) {
      process.stderr.write(`${redactLaunchEvidence(error?.stack ?? error?.message ?? String(error))}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stdout.write(`${JSON.stringify(staticLaunchEnvelope(), null, 2)}\n`);
  }
}
