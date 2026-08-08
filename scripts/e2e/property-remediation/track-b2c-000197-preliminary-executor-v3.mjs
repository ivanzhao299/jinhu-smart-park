import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  mkdirSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const V3_RUN_ID = "b2c197_prelim_20260802b";
export const EVIDENCE_POLICY_VERSION = "b2c-000197-child-evidence-v3";
const SECRET_KEY = /(?:database_url|password|passwd|pwd|secret|token|credential)/iu;
const URL_SECRET = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const KEY_VALUE_SECRET = /\b(password|passwd|pwd|secret|token|credential)=([^\s&;]+)/giu;
const SAFE_STAGE = /[^a-z0-9-]+/gu;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");

export class EvidenceWriteError extends Error {
  constructor(stage, cause) {
    super(`b2c-000197-v3-evidence-write-failed:${stage}:${cause?.message ?? String(cause)}`);
    this.name = "EvidenceWriteError";
    this.cause = cause;
  }
}

export class RecordedSubprocessError extends Error {
  constructor(stage, result) {
    super(`b2c-000197-v3-subprocess-failed:${stage}:exit=${result.status}:signal=${result.signal ?? "none"}`);
    this.name = "RecordedSubprocessError";
    this.stage = stage;
    this.result = result;
  }
}

export function redactEvidenceText(value, secrets = []) {
  let output = String(value ?? "").replace(URL_SECRET, "<redacted-database-url>")
    .replace(KEY_VALUE_SECRET, (_, key) => `${key}=<redacted>`);
  for (const secret of secrets.filter((item) => typeof item === "string" && item.length > 0)
    .sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(secret, "<redacted-secret>");
  }
  return output;
}

function safeStage(value) {
  const result = String(value).toLowerCase().replace(SAFE_STAGE, "-").replace(/^-|-$/gu, "");
  if (!result) throw new Error("b2c-000197-v3-stage-required");
  return result;
}

function serializeError(error, secrets) {
  if (!error) return null;
  return {
    name: redactEvidenceText(error.name ?? "Error", secrets),
    message: redactEvidenceText(error.message ?? String(error), secrets),
    code: error.code == null ? null : redactEvidenceText(error.code, secrets),
  };
}

function environmentEnvelope(env, allowlist, secrets) {
  const childEnv = {};
  const recorded = {};
  const redactedFields = [];
  for (const entry of allowlist) {
    if (!entry || typeof entry.name !== "string" || !["value", "redacted"].includes(entry.persist)) {
      throw new Error("b2c-000197-v3-env-allowlist-malformed");
    }
    if (!(entry.name in env)) throw new Error(`b2c-000197-v3-env-allowlist-missing:${entry.name}`);
    const value = String(env[entry.name]);
    childEnv[entry.name] = value;
    if (entry.persist === "redacted" || SECRET_KEY.test(entry.name)) {
      recorded[entry.name] = "<redacted>";
      redactedFields.push(`env.${entry.name}`);
      if (value) secrets.push(value);
    } else {
      recorded[entry.name] = redactEvidenceText(value, secrets);
    }
  }
  return { childEnv, recorded, redactedFields };
}

function assertSanitized(value, secrets) {
  const encoded = JSON.stringify(value);
  if (URL_SECRET.test(encoded)) throw new Error("b2c-000197-v3-redaction-database-url-leak");
  URL_SECRET.lastIndex = 0;
  for (const secret of secrets) {
    if (secret && encoded.includes(secret)) throw new Error("b2c-000197-v3-redaction-secret-leak");
  }
}

export class PreliminaryEvidenceRecorderV3 {
  constructor({ evidenceRoot, runId = V3_RUN_ID, spawn = spawnSync, writeFile = writeFileSync,
    mkdir = mkdirSync, now = () => new Date().toISOString(), secrets = [] }) {
    if (runId !== V3_RUN_ID) throw new Error("b2c-000197-v3-run-id-drift");
    this.root = resolve(evidenceRoot);
    this.runId = runId;
    this.spawn = spawn;
    this.writeFile = writeFile;
    this.now = now;
    this.secrets = [...secrets];
    this.sequence = 0;
    this.entries = [];
    try {
      mkdir(this.root, { recursive: false, mode: 0o700 });
    } catch (error) {
      throw new EvidenceWriteError("evidence-root", error);
    }
    if (realpathSync(this.root) !== this.root || !statSync(this.root).isDirectory()) {
      throw new EvidenceWriteError("evidence-root-identity", new Error("not-real-directory"));
    }
  }

  writeImmutable(filename, payload, stage) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root || basename(path) !== filename) {
      throw new EvidenceWriteError(stage, new Error("path-escape"));
    }
    const bytesValue = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    assertSanitized(payload, this.secrets);
    try {
      this.writeFile(path, bytesValue, { flag: "wx", mode: 0o444 });
      const observed = statSync(path);
      if ((observed.mode & 0o777) !== 0o444 || observed.size !== bytesValue.byteLength) {
        throw new Error("mode-or-size-drift");
      }
    } catch (error) {
      throw new EvidenceWriteError(stage, error);
    }
    const entry = { path, filename, bytes: bytesValue.byteLength, raw_sha256: sha256(bytesValue) };
    this.entries.push(entry);
    return entry;
  }

  runChild({ stage, command, args = [], cwd, env = {}, envAllowlist = [], input = null,
    tapParser = null, allowFailure = false, allowTapFailure = false }) {
    const normalizedStage = safeStage(stage);
    const sequence = ++this.sequence;
    const prefix = `${String(sequence).padStart(3, "0")}-${normalizedStage}`;
    const localSecrets = [...this.secrets];
    const environment = environmentEnvelope(env, envAllowlist, localSecrets);
    const inputBytes = input == null ? Buffer.alloc(0) : bytes(input);
    const redactedCommand = redactEvidenceText(command, localSecrets);
    const redactedArgs = args.map((arg) => redactEvidenceText(arg, localSecrets));
    const intent = {
      schema_version: "b2c-000197-child-intent-v3",
      evidence_policy_version: EVIDENCE_POLICY_VERSION,
      formal_run_id: this.runId,
      sequence,
      stage: normalizedStage,
      recorded_at_utc: this.now(),
      command: redactedCommand,
      argv: redactedArgs,
      cwd: redactEvidenceText(resolve(cwd), localSecrets),
      environment_allowlist: environment.recorded,
      redacted_fields: environment.redactedFields,
      stdin_intent: { present: input != null, bytes: inputBytes.byteLength, raw_sha256: sha256(inputBytes) },
    };
    const intentEntry = this.writeImmutable(`${prefix}-intent.json`, intent, `${normalizedStage}-intent`);

    let child;
    try {
      child = this.spawn(command, args, { cwd, env: environment.childEnv, input,
        encoding: null, maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    const stdout = bytes(child.stdout);
    const stderr = bytes(child.stderr);
    const resultPayload = {
      schema_version: "b2c-000197-child-result-v3",
      evidence_policy_version: EVIDENCE_POLICY_VERSION,
      formal_run_id: this.runId,
      sequence,
      stage: normalizedStage,
      recorded_at_utc: this.now(),
      intent_raw_sha256: intentEntry.raw_sha256,
      exit_code: child.status ?? null,
      signal: child.signal ?? null,
      spawn_error: serializeError(child.error, localSecrets),
      stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout),
        redacted_utf8: redactEvidenceText(stdout.toString("utf8"), localSecrets) },
      stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr),
        redacted_utf8: redactEvidenceText(stderr.toString("utf8"), localSecrets) },
    };
    const resultEntry = this.writeImmutable(`${prefix}-result.json`, resultPayload, `${normalizedStage}-result`);

    let tap = null;
    let tapError = null;
    if (tapParser) {
      try {
        tap = tapParser(stdout.toString("utf8"));
      } catch (error) {
        tapError = error;
      }
      this.writeImmutable(`${prefix}-tap.json`, {
        schema_version: "b2c-000197-child-tap-v3",
        evidence_policy_version: EVIDENCE_POLICY_VERSION,
        formal_run_id: this.runId,
        sequence,
        stage: normalizedStage,
        recorded_at_utc: this.now(),
        result_raw_sha256: resultEntry.raw_sha256,
        raw_tap: { bytes: stdout.byteLength, raw_sha256: sha256(stdout),
          redacted_utf8: redactEvidenceText(stdout.toString("utf8"), localSecrets) },
        parse: tapError ? { status: "failed", error: serializeError(tapError, localSecrets) }
          : { status: "passed", counts: tap },
      }, `${normalizedStage}-tap`);
    }

    const failed = Boolean(child.error) || child.status !== 0 || child.signal != null;
    const result = { status: child.status ?? null, signal: child.signal ?? null, error: child.error ?? null,
      stdout, stderr, tap, tapError, intent: intentEntry, result: resultEntry };
    if (!allowFailure && failed) throw new RecordedSubprocessError(normalizedStage, result);
    if (tapError && !allowTapFailure) throw tapError;
    return result;
  }

  writeTerminal(kind, payload) {
    if (!["failure", "success"].includes(kind)) throw new Error("b2c-000197-v3-terminal-kind-drift");
    const artifact = this.writeImmutable(`${kind}-${this.runId}.json`, {
      schema_version: `b2c-000197-preliminary-${kind}-v3`,
      evidence_policy_version: EVIDENCE_POLICY_VERSION,
      formal_run_id: this.runId,
      status: kind === "failure" ? "FAILED" : "PASSED",
      recorded_at_utc: this.now(),
      evidence_entries: this.entries.map(({ filename, bytes: size, raw_sha256 }) =>
        ({ filename, bytes: size, raw_sha256 })),
      ...payload,
    }, `terminal-${kind}-artifact`);
    const manifest = this.writeImmutable(`${kind}-${this.runId}.manifest.json`, {
      schema_version: `b2c-000197-preliminary-${kind}-manifest-v3`,
      evidence_policy_version: EVIDENCE_POLICY_VERSION,
      formal_run_id: this.runId,
      status: kind === "failure" ? "FAILED" : "PASSED",
      artifact: { filename: artifact.filename, bytes: artifact.bytes, raw_sha256: artifact.raw_sha256 },
    }, `terminal-${kind}-manifest`);
    return { artifact, manifest };
  }

  writeFailureBeforeThrow(stage, error, partial = {}) {
    return this.writeTerminal("failure", {
      failure_stage: safeStage(stage),
      error: serializeError(error, this.secrets),
      partial_state: partial,
      run_id_reusable: false,
    });
  }
}

export function runWithFailureBoundary(recorder, stage, operation, partialState = () => ({})) {
  try {
    return operation();
  } catch (error) {
    recorder.writeFailureBeforeThrow(stage, error, partialState());
    throw error;
  }
}

export function executeWithEvidenceV3({ evidenceRoot, operation, recorderOptions = {},
  successPayload = {}, partialState = () => ({}) }) {
  const recorder = new PreliminaryEvidenceRecorderV3({ evidenceRoot, ...recorderOptions });
  return runWithFailureBoundary(recorder, "top-level", () => {
    const result = operation(recorder);
    const terminalPayload = typeof successPayload === "function" ? successPayload(result) : successPayload;
    const terminal = recorder.writeTerminal("success", terminalPayload);
    return { result, terminal };
  }, partialState);
}

function staticCandidate() {
  return {
    status: "blocked-awaiting-run-scoped-approval-fixture-and-resource-authority",
    execution_authorized: false,
    formal_run_id: V3_RUN_ID,
    evidence_policy_version: EVIDENCE_POLICY_VERSION,
    manifest_frozen: false,
    live_execution: false,
    required_before_freeze: [
      "new-run-scoped-approval-pg-spec-sha",
      "new-dedicated-container-and-volume-identities",
      "new-executor-integration-and-independent-reviews",
    ],
  };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_PRELIMINARY_V3_EXECUTE === "1") {
    const evidenceRoot = resolve(process.cwd(),
      `.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-evidence-${V3_RUN_ID}`);
    try {
      executeWithEvidenceV3({ evidenceRoot, operation: () => {
        throw new Error("b2c-000197-v3-live-blocked-before-manifest-and-independent-review");
      }, partialState: () => ({ manifest_frozen: false, resource_authority_present: false }) });
    } catch (error) {
      process.stderr.write(`${redactEvidenceText(error?.stack ?? error?.message ?? String(error))}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stdout.write(`${JSON.stringify(staticCandidate(), null, 2)}\n`);
  }
}
