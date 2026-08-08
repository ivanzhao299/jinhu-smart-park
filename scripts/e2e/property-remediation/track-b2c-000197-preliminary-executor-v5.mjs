import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const V5_RUN_ID = "b2c197_prelim_20260802c";
export const V5_EVIDENCE_POLICY = "b2c-000197-child-evidence-v5";
const SECRET_KEY = /(?:database_url|url|password|passwd|pwd|secret|token|credential|env|argv|userinfo)/iu;
const DATABASE_URL = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const URL_USERINFO = /\b(?:postgres(?:ql)?):\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@/giu;
const KEY_VALUE = /\b(postgres_password|database_url|password|passwd|pwd|secret|token|credential)\s*[=:]\s*([^\s,;}&'"`]+)/giu;
const JSON_SECRET = /["'](postgres_password|database_url|password|passwd|pwd|secret|token|credential)["']\s*:\s*["']([^"']+)["']/giu;
const SAFE_STAGE = /[^a-z0-9-]+/gu;
const bytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function addSecret(target, value) {
  const secret = String(value ?? "");
  if (secret && !target.includes(secret)) target.push(secret);
}

export function discoverSecretsV5(value, target = [], key = "") {
  if (value == null) return target;
  if (Buffer.isBuffer(value)) return discoverSecretsV5(value.toString("utf8"), target, key);
  if (Array.isArray(value)) {
    for (const entry of value) discoverSecretsV5(entry, target, key);
    return target;
  }
  if (typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value)) discoverSecretsV5(entryValue, target, entryKey);
    return target;
  }
  const text = String(value);
  if (SECRET_KEY.test(key)) addSecret(target, text);
  for (const found of text.matchAll(DATABASE_URL)) {
    addSecret(target, found[0]);
    for (const userinfo of found[0].matchAll(URL_USERINFO)) {
      addSecret(target, userinfo[1]); addSecret(target, userinfo[2]);
      try { addSecret(target, decodeURIComponent(userinfo[2])); } catch { /* covered by encoded value */ }
    }
  }
  DATABASE_URL.lastIndex = 0; URL_USERINFO.lastIndex = 0;
  for (const pattern of [KEY_VALUE, JSON_SECRET]) {
    for (const found of text.matchAll(pattern)) addSecret(target, found[2]);
    pattern.lastIndex = 0;
  }
  return target;
}

export function redactEvidenceTextV5(value, secrets = []) {
  let output = String(value ?? ""); discoverSecretsV5(output, secrets);
  output = output.replace(DATABASE_URL, "<redacted-database-url>")
    .replace(KEY_VALUE, (_, key) => `${key}=<redacted>`)
    .replace(JSON_SECRET, (_, key) => `"${key}":"<redacted>"`);
  DATABASE_URL.lastIndex = 0; KEY_VALUE.lastIndex = 0; JSON_SECRET.lastIndex = 0;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(secret, "<redacted-secret>");
  }
  return output;
}

function stageName(value) {
  const stage = String(value).toLowerCase().replace(SAFE_STAGE, "-").replace(/^-|-$/gu, "");
  if (!stage) throw new Error("b2c-000197-v5-stage-required");
  return stage;
}

function serializeError(error, secrets) {
  if (!error) return null;
  return { name: redactEvidenceTextV5(error.name ?? "Error", secrets),
    message: redactEvidenceTextV5(error.message ?? String(error), secrets),
    code: error.code == null ? null : redactEvidenceTextV5(error.code, secrets) };
}

function assertSanitized(payload, secrets) {
  const encoded = JSON.stringify(payload);
  for (const secret of secrets) if (secret && encoded.includes(secret)) throw new Error("b2c-000197-v5-secret-leak");
  if (DATABASE_URL.test(encoded)) throw new Error("b2c-000197-v5-database-url-leak");
  DATABASE_URL.lastIndex = 0;
}

function environmentEnvelope(env, allowlist, secrets) {
  discoverSecretsV5(env, secrets);
  const childEnv = {}; const recorded = {}; const redactedFields = [];
  for (const entry of allowlist) {
    if (!entry || typeof entry.name !== "string" || !["value", "redacted"].includes(entry.persist)) {
      throw new Error("b2c-000197-v5-env-allowlist-malformed");
    }
    if (!(entry.name in env)) throw new Error(`b2c-000197-v5-env-allowlist-missing:${entry.name}`);
    const value = String(env[entry.name]); childEnv[entry.name] = value;
    if (entry.persist === "redacted" || SECRET_KEY.test(entry.name)) {
      addSecret(secrets, value); recorded[entry.name] = "<redacted>"; redactedFields.push(`env.${entry.name}`);
    } else recorded[entry.name] = redactEvidenceTextV5(value, secrets);
  }
  return { childEnv, recorded, redactedFields };
}

export class PhaseExecutionErrorV5 extends Error {
  constructor(stage, result, cause = null) {
    super(`b2c-000197-v5-phase-failed:${stage}:exit=${result?.status ?? "none"}:signal=${result?.signal ?? "none"}:${cause?.message ?? "child"}`);
    this.name = "PhaseExecutionErrorV5"; this.stage = stage; this.result = result; this.cause = cause;
  }
}

export class PreliminaryEvidenceRecorderV5 {
  constructor({ evidenceRoot, runId = V5_RUN_ID, spawn = spawnSync, writeFile = writeFileSync,
    mkdir = mkdirSync, now = () => new Date().toISOString(), secrets = [] }) {
    if (runId !== V5_RUN_ID) throw new Error("b2c-000197-v5-run-id-drift");
    this.root = resolve(evidenceRoot); this.runId = runId; this.spawn = spawn; this.writeFile = writeFile;
    this.now = now; this.secrets = [...secrets]; this.sequence = 0; this.entries = [];
    mkdir(this.root, { recursive: false, mode: 0o700 });
    if (realpathSync(this.root) !== this.root || !statSync(this.root).isDirectory()) throw new Error("v5-evidence-root");
  }

  writeImmutable(filename, payload, stage) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root || basename(path) !== filename) throw new Error(`v5-path-escape:${stage}`);
    discoverSecretsV5(payload, this.secrets);
    const sanitized = JSON.parse(redactEvidenceTextV5(JSON.stringify(payload), this.secrets));
    assertSanitized(sanitized, this.secrets);
    const content = Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`);
    this.writeFile(path, content, { flag: "wx", mode: 0o444 });
    const observed = statSync(path);
    if ((observed.mode & 0o777) !== 0o444 || observed.size !== content.byteLength) throw new Error("v5-mode-size-drift");
    const entry = { path, filename, bytes: content.byteLength, raw_sha256: sha256(content) };
    this.entries.push(entry); return entry;
  }

  runChild({ stage, command, args = [], cwd, env = {}, envAllowlist = [], input = null,
    parser = null, allowFailure = false, allowParseFailure = false }) {
    const normalized = stageName(stage); const sequence = ++this.sequence;
    const prefix = `${String(sequence).padStart(3, "0")}-${normalized}`;
    discoverSecretsV5({ command, args, env }, this.secrets);
    const environment = environmentEnvelope(env, envAllowlist, this.secrets);
    const inputBytes = bytes(input);
    const intent = this.writeImmutable(`${prefix}-intent.json`, {
      schema_version: "b2c-000197-child-intent-v5", evidence_policy_version: V5_EVIDENCE_POLICY,
      formal_run_id: this.runId, sequence, stage: normalized, recorded_at_utc: this.now(),
      command, argv: args, cwd: resolve(cwd), environment_allowlist: environment.recorded,
      redacted_fields: environment.redactedFields,
      stdin_intent: { present: input != null, bytes: inputBytes.byteLength, raw_sha256: sha256(inputBytes) },
    }, `${normalized}-intent`);
    let child;
    try { child = this.spawn(command, args, { cwd, env: environment.childEnv, input, encoding: null,
      maxBuffer: 64 * 1024 * 1024 }); }
    catch (error) { child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
    const stdout = bytes(child.stdout); const stderr = bytes(child.stderr);
    discoverSecretsV5([stdout, stderr, child.error], this.secrets);
    const resultEntry = this.writeImmutable(`${prefix}-result.json`, {
      schema_version: "b2c-000197-child-result-v5", evidence_policy_version: V5_EVIDENCE_POLICY,
      formal_run_id: this.runId, sequence, stage: normalized, recorded_at_utc: this.now(),
      intent_raw_sha256: intent.raw_sha256, exit_code: child.status ?? null, signal: child.signal ?? null,
      spawn_error: serializeError(child.error, this.secrets),
      stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout), redacted_utf8: stdout.toString("utf8") },
      stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr), redacted_utf8: stderr.toString("utf8") },
    }, `${normalized}-result`);
    let parsed = null; let parseError = null;
    if (parser) {
      try { parsed = parser(stdout.toString("utf8")); } catch (error) { parseError = error; }
      this.writeImmutable(`${prefix}-parse.json`, {
        schema_version: "b2c-000197-child-parse-v5", evidence_policy_version: V5_EVIDENCE_POLICY,
        formal_run_id: this.runId, sequence, stage: normalized, recorded_at_utc: this.now(),
        result_raw_sha256: resultEntry.raw_sha256,
        output: { bytes: stdout.byteLength, raw_sha256: sha256(stdout), redacted_utf8: stdout.toString("utf8") },
        parse: parseError ? { status: "failed", error: serializeError(parseError, this.secrets) }
          : { status: "passed", value: parsed },
      }, `${normalized}-parse`);
    }
    const result = { status: child.status ?? null, signal: child.signal ?? null, error: child.error ?? null,
      stdout, stderr, parsed, parseError, intent, result: resultEntry };
    if (!allowFailure && (child.error || child.status !== 0 || child.signal != null)) throw new PhaseExecutionErrorV5(normalized, result);
    if (parseError && !allowParseFailure) throw new PhaseExecutionErrorV5(normalized, result, parseError);
    return result;
  }

  writeTerminal(kind, payload) {
    if (!["success", "failure"].includes(kind)) throw new Error("b2c-000197-v5-terminal-kind");
    discoverSecretsV5(payload, this.secrets);
    const artifact = this.writeImmutable(`${kind}-${this.runId}.json`, {
      schema_version: `b2c-000197-preliminary-${kind}-v5`, evidence_policy_version: V5_EVIDENCE_POLICY,
      formal_run_id: this.runId, status: kind === "success" ? "PASSED" : "FAILED", recorded_at_utc: this.now(),
      evidence_entries: this.entries.map(({ filename, bytes: size, raw_sha256 }) => ({ filename, bytes: size, raw_sha256 })),
      ...payload,
    }, `terminal-${kind}`);
    const manifest = this.writeImmutable(`${kind}-${this.runId}.manifest.json`, {
      schema_version: `b2c-000197-preliminary-${kind}-manifest-v5`, evidence_policy_version: V5_EVIDENCE_POLICY,
      formal_run_id: this.runId, status: kind === "success" ? "PASSED" : "FAILED",
      artifact: { filename: artifact.filename, bytes: artifact.bytes, raw_sha256: artifact.raw_sha256 },
    }, `terminal-${kind}-manifest`);
    return { artifact, manifest };
  }
}

function phaseFailure(stage, result) {
  if (result.error || result.status !== 0 || result.signal != null) return new PhaseExecutionErrorV5(stage, result);
  if (result.parseError) return new PhaseExecutionErrorV5(stage, result, result.parseError);
  return null;
}

export function runPhasedGateV5(recorder, { phases, cleanupPhases }) {
  const completed = []; const cleanup = []; let primary = null;
  try {
    for (const phase of phases) {
      const result = recorder.runChild({ ...phase, allowFailure: true, allowParseFailure: true });
      const failure = phaseFailure(phase.stage, result); if (failure) throw failure;
      completed.push({ stage: stageName(phase.stage), parsed: result.parsed });
    }
  } catch (error) { primary = error; }
  for (const phase of cleanupPhases) {
    const result = recorder.runChild({ ...phase, allowFailure: true, allowParseFailure: true });
    const failure = phaseFailure(phase.stage, result);
    cleanup.push({ stage: stageName(phase.stage), passed: !failure, parsed: result.parsed });
    if (failure && !primary) primary = failure; else if (failure) (primary.cleanupFailures ??= []).push(failure);
  }
  if (primary) throw primary;
  return { completed, cleanup };
}

export function executeWithEvidenceV5({ evidenceRoot, operation, recorderOptions = {}, successPayload = {} }) {
  const recorder = new PreliminaryEvidenceRecorderV5({ evidenceRoot, ...recorderOptions });
  try {
    const result = operation(recorder); const payload = typeof successPayload === "function" ? successPayload(result) : successPayload;
    return { result, terminal: recorder.writeTerminal("success", payload) };
  } catch (error) {
    recorder.writeTerminal("failure", { failure_stage: stageName(error?.stage ?? "top-level"),
      error: serializeError(error, recorder.secrets), run_id_reusable: false });
    throw error;
  }
}

export function parseTapSummaryV5(stdout, { expectedTests, expectedNames = [] }) {
  const count = (label) => { const matches = [...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
    if (matches.length !== 1) throw new Error(`v5-tap-${label}`); return Number(matches[0][1]); };
  const result = Object.fromEntries(["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]
    .map((label) => [label, count(label)]));
  if (result.tests !== expectedTests || result.suites !== 0 || result.pass !== expectedTests || result.fail !== 0
      || result.cancelled !== 0 || result.skipped !== 0 || result.todo !== 0) throw new Error("v5-tap-count-drift");
  const actualNames = [...stdout.matchAll(/^# Subtest: (.+)$/gmu)].map((match) => match[1]);
  if (expectedNames.length && (actualNames.length !== expectedNames.length
      || actualNames.some((name, index) => name !== expectedNames[index]))) throw new Error("v5-tap-name-drift");
  return { ...result, names: expectedNames.length ? actualNames : [] };
}
