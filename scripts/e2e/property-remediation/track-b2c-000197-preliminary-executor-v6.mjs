import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const V6_RUN_ID = "b2c197_prelim_20260802c";
export const V6_EVIDENCE_POLICY = "b2c-000197-child-evidence-v6";
const SECRET_KEY = /(?:database_url|url|password|passwd|pwd|secret|token|credential|userinfo)/iu;
const ARG_CONTAINER = /^(?:argv|args)$/iu;
const DATABASE_URL = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const URL_USERINFO = /\b(?:postgres(?:ql)?):\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@/giu;
const KEY_VALUE = /\b(postgres_password|database_url|password|passwd|pwd|secret|token|credential)=([^\s,;}&'"`]+)/giu;
const JSON_SECRET = /["'](postgres_password|database_url|password|passwd|pwd|secret|token|credential)["']\s*:\s*["']([^"']+)["']/giu;
const SAFE_STAGE = /[^a-z0-9-]+/gu;
const bytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const add = (target, value) => { const secret = String(value ?? ""); if (secret && !target.includes(secret)) target.push(secret); };

export function discoverSecretsV6(value, target = [], key = "") {
  if (value == null) return target;
  if (Buffer.isBuffer(value)) return discoverSecretsV6(value.toString("utf8"), target, key);
  if (Array.isArray(value)) {
    for (const entry of value) discoverSecretsV6(entry, target, ARG_CONTAINER.test(key) ? "" : key);
    return target;
  }
  if (typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value)) discoverSecretsV6(entryValue, target, entryKey);
    return target;
  }
  const text = String(value);
  if (SECRET_KEY.test(key) && !ARG_CONTAINER.test(key)) add(target, text);
  for (const match of text.matchAll(DATABASE_URL)) {
    add(target, match[0]);
    for (const userinfo of match[0].matchAll(URL_USERINFO)) add(target, userinfo[2]);
  }
  DATABASE_URL.lastIndex = 0; URL_USERINFO.lastIndex = 0;
  for (const pattern of [KEY_VALUE, JSON_SECRET]) {
    for (const match of text.matchAll(pattern)) add(target, match[2]); pattern.lastIndex = 0;
  }
  return target;
}

export function redactV6(value, secrets = []) {
  let output = String(value ?? ""); discoverSecretsV6(output, secrets);
  output = output.replace(DATABASE_URL, "<redacted-database-url>")
    .replace(KEY_VALUE, (_, key) => `${key}=<redacted>`)
    .replace(JSON_SECRET, (_, key) => `"${key}":"<redacted>"`);
  DATABASE_URL.lastIndex = 0; KEY_VALUE.lastIndex = 0; JSON_SECRET.lastIndex = 0;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) output = output.replaceAll(secret, "<redacted-secret>");
  return output;
}

const safeStage = (value) => { const stage = String(value).toLowerCase().replace(SAFE_STAGE, "-").replace(/^-|-$/gu, "");
  if (!stage) throw new Error("v6-stage-required"); return stage; };
function sanitized(payload, secrets) {
  discoverSecretsV6(payload, secrets);
  const value = JSON.parse(redactV6(JSON.stringify(payload), secrets)); const encoded = JSON.stringify(value);
  for (const secret of secrets) if (secret && encoded.includes(secret)) throw new Error("v6-secret-leak");
  return value;
}
function envEnvelope(env, allowlist, secrets) {
  const child = {}; const recorded = {};
  for (const entry of allowlist) {
    if (!(entry.name in env) || !["value", "redacted"].includes(entry.persist)) throw new Error(`v6-env:${entry.name}`);
    const value = String(env[entry.name]); child[entry.name] = value;
    if (entry.persist === "redacted" || SECRET_KEY.test(entry.name)) { add(secrets, value); recorded[entry.name] = "<redacted>"; }
    else recorded[entry.name] = value;
  }
  return { child, recorded };
}

export class PhaseErrorV6 extends Error {
  constructor(stage, result, cause = null) { super(`v6-phase:${stage}:${result?.status ?? "none"}:${cause?.message ?? "child"}`);
    this.stage = stage; this.result = result; this.cause = cause; }
}

export class EvidenceRecorderV6 {
  constructor({ evidenceRoot, spawn = spawnSync, now = () => new Date().toISOString() }) {
    this.root = resolve(evidenceRoot); this.spawn = spawn; this.now = now; this.secrets = []; this.entries = []; this.sequence = 0;
    mkdirSync(this.root, { recursive: false, mode: 0o700 });
    if (realpathSync(this.root) !== this.root) throw new Error("v6-root");
  }
  write(filename, payload) {
    const path = resolve(this.root, filename); if (dirname(path) !== this.root || basename(path) !== filename) throw new Error("v6-path");
    const content = Buffer.from(`${JSON.stringify(sanitized(payload, this.secrets), null, 2)}\n`);
    writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    if ((statSync(path).mode & 0o777) !== 0o444) throw new Error("v6-mode");
    const entry = { path, filename, bytes: content.length, raw_sha256: sha256(content) }; this.entries.push(entry); return entry;
  }
  runChild({ stage, command, args = [], cwd, env = {}, envAllowlist = [], input = null,
    parser = null, allowFailure = false, allowParseFailure = false }) {
    const name = safeStage(stage); const seq = ++this.sequence; const prefix = `${String(seq).padStart(3, "0")}-${name}`;
    discoverSecretsV6({ command, args, env }, this.secrets); const envelope = envEnvelope(env, envAllowlist, this.secrets);
    const intent = this.write(`${prefix}-intent.json`, { schema_version: "b2c-000197-child-intent-v6",
      evidence_policy_version: V6_EVIDENCE_POLICY, formal_run_id: V6_RUN_ID, sequence: seq, stage: name,
      recorded_at_utc: this.now(), command, argv: args, cwd: resolve(cwd), environment_allowlist: envelope.recorded,
      stdin_intent: { present: input != null, bytes: bytes(input).length, raw_sha256: sha256(bytes(input)) } });
    let child;
    try { child = this.spawn(command, args, { cwd, env: envelope.child, input, encoding: null, maxBuffer: 64 * 1024 * 1024 }); }
    catch (error) { child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
    const stdout = bytes(child.stdout); const stderr = bytes(child.stderr); discoverSecretsV6([stdout, stderr, child.error], this.secrets);
    const resultEntry = this.write(`${prefix}-result.json`, { schema_version: "b2c-000197-child-result-v6",
      evidence_policy_version: V6_EVIDENCE_POLICY, formal_run_id: V6_RUN_ID, sequence: seq, stage: name,
      intent_raw_sha256: intent.raw_sha256, exit_code: child.status ?? null, signal: child.signal ?? null,
      spawn_error: child.error ? { name: child.error.name, message: child.error.message, code: child.error.code ?? null } : null,
      stdout: { bytes: stdout.length, raw_sha256: sha256(stdout), redacted_utf8: stdout.toString("utf8") },
      stderr: { bytes: stderr.length, raw_sha256: sha256(stderr), redacted_utf8: stderr.toString("utf8") } });
    let parsed = null; let parseError = null;
    if (parser) {
      try { parsed = parser(stdout.toString("utf8")); } catch (error) { parseError = error; }
      this.write(`${prefix}-parse.json`, { schema_version: "b2c-000197-child-parse-v6", formal_run_id: V6_RUN_ID,
        sequence: seq, stage: name, result_raw_sha256: resultEntry.raw_sha256,
        parse: parseError ? { status: "failed", error: parseError.message } : { status: "passed", value: parsed } });
    }
    const result = { status: child.status ?? null, signal: child.signal ?? null, error: child.error ?? null,
      stdout, stderr, parsed, parseError };
    if (!allowFailure && (child.error || child.status !== 0 || child.signal != null)) throw new PhaseErrorV6(name, result);
    if (parseError && !allowParseFailure) throw new PhaseErrorV6(name, result, parseError);
    return result;
  }
  terminal(kind, payload) {
    discoverSecretsV6(payload, this.secrets);
    const artifact = this.write(`${kind}-${V6_RUN_ID}.json`, { schema_version: `b2c-000197-${kind}-v6`, formal_run_id: V6_RUN_ID,
      status: kind === "success" ? "PASSED" : "FAILED", evidence_entries: this.entries.map(({ filename, bytes: size, raw_sha256 }) =>
        ({ filename, bytes: size, raw_sha256 })), ...payload });
    return { artifact, manifest: this.write(`${kind}-${V6_RUN_ID}.manifest.json`, { schema_version: `b2c-000197-${kind}-manifest-v6`,
      formal_run_id: V6_RUN_ID, artifact: { filename: artifact.filename, bytes: artifact.bytes, raw_sha256: artifact.raw_sha256 } }) };
  }
}

export function executeWithEvidenceV6({ evidenceRoot, operation, successPayload = {} }) {
  const recorder = new EvidenceRecorderV6({ evidenceRoot });
  try { const result = operation(recorder); return { result, terminal: recorder.terminal("success",
    typeof successPayload === "function" ? successPayload(result) : successPayload) }; }
  catch (error) { recorder.terminal("failure", { error: { message: error.message, token: error.token ?? null } }); throw error; }
}

export function parseTapV6(stdout, count) {
  const value = (label) => { const found = [...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
    if (found.length !== 1) throw new Error(`v6-tap-${label}`); return Number(found[0][1]); };
  const result = Object.fromEntries(["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]
    .map((label) => [label, value(label)]));
  if (result.tests !== count || result.suites !== 0 || result.pass !== count || result.fail || result.cancelled
      || result.skipped || result.todo) throw new Error("v6-tap-drift");
  return result;
}
