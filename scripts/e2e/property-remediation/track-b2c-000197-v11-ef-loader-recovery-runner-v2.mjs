#!/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync, chmodSync, constants as fsConstants, mkdirSync, readFileSync, realpathSync,
  statSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const FORMAL_RUN_ID = "b2c197_prelim_20260802f";
export const ATTEMPT_ID = "b2c197_prelim_20260802f_loader_recovery_attempt02";
export const NODE_PATH = "/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node";
export const NODE_REALPATH = "/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node";
export const NODE_VERSION = "v22.23.2";
export const NODE_SHA256 = "3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327";
export const DOCKER_PATH = "/usr/bin/docker";
export const DOCKER_REALPATH = "/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker";
export const DOCKER_SHA256 = "dda0804fca9b37a16e688356049ddf51fdd4c1a435c0a41055ec81cdf121535a";
export const DOCKER_VERSION_TEXT = "Docker version 29.6.2, build dfc4efb";
export const CANDIDATE_SHA256 = "60057a2eff12a0be47fe9c37461d4447b7be4c2a1696765a6a905cc624a002a4";
export const CANDIDATE_BYTES = 7314;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
export const CANDIDATE_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-candidate-v2-20260802f.mjs");
export const AUTHORITY_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-authority-v2-20260802f.grammar");
export const QA_GO_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-independent-qa-go-v2-20260802f.grammar");
export const EVIDENCE_ROOT = resolve(researchRoot,
  "b2c-000197-r0-loader-recovery-evidence-b2c197_prelim_20260802f-attempt02");
const SELF_PATH = fileURLToPath(import.meta.url);
const MINIMAL_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8" });
const URL_SECRET = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const KEY_VALUE_SECRET = /\b(password|passwd|pwd|secret|token|credential)=((?!<redacted>)[^\s&;]+)/giu;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");

export function redactEvidenceTextV2(value) {
  return String(value ?? "").replace(URL_SECRET, "<redacted-database-url>")
    .replace(KEY_VALUE_SECRET, (_, key) => `${key}=<redacted>`);
}

export function parseGrammarV2(value) {
  const result = new Map();
  for (const line of String(value).split(/\r?\n/u).slice(1)) {
    if (!line) continue;
    const separator = line.indexOf("\t");
    if (separator <= 0) throw new Error("b2c-000197-recovery-v2-malformed-grammar");
    const key = line.slice(0, separator);
    if (result.has(key)) throw new Error(`b2c-000197-recovery-v2-duplicate-key:${key}`);
    result.set(key, line.slice(separator + 1));
  }
  return result;
}

function assertExact(map, key, expected, scope) {
  if (map.get(key) !== expected) {
    throw new Error(`b2c-000197-recovery-v2-${scope}-drift:${key}`);
  }
}

export function verifyExecutableV2(path, expectedRealpath, expectedSha, label,
  dependencies = { accessSync, realpathSync, readFileSync }) {
  dependencies.accessSync(path, fsConstants.X_OK);
  if (dependencies.realpathSync(path) !== expectedRealpath) {
    throw new Error(`b2c-000197-recovery-v2-${label}-realpath-drift`);
  }
  if (sha256(dependencies.readFileSync(path)) !== expectedSha) {
    throw new Error(`b2c-000197-recovery-v2-${label}-sha-drift`);
  }
}

export function verifyCandidateBytesV2(candidateBytes) {
  if (candidateBytes.byteLength !== CANDIDATE_BYTES || sha256(candidateBytes) !== CANDIDATE_SHA256) {
    throw new Error("b2c-000197-recovery-v2-candidate-drift");
  }
  return candidateBytes;
}

export function verifyDockerVersionV2(spawn = spawnSync) {
  const result = spawn(DOCKER_PATH, ["--version"], {
    cwd: root, env: MINIMAL_ENV, encoding: "utf8", shell: false,
  });
  if (result.error || result.status !== 0 || result.signal != null
      || String(result.stdout ?? "").trim() !== DOCKER_VERSION_TEXT) {
    throw new Error("b2c-000197-recovery-v2-docker-version-drift");
  }
  return DOCKER_VERSION_TEXT;
}

export function verifyGoEnvelopeV2({ authorityBytes, goBytes, runnerSha }) {
  const authoritySha = sha256(authorityBytes);
  const authority = parseGrammarV2(authorityBytes);
  const go = parseGrammarV2(goBytes);
  assertExact(authority, "formal_run_id", FORMAL_RUN_ID, "authority");
  assertExact(authority, "attempt_id", ATTEMPT_ID, "authority");
  assertExact(authority, "execution_authorized", "false", "authority");
  assertExact(authority, "candidate_raw_sha256", CANDIDATE_SHA256, "authority");
  assertExact(authority, "recovery_evidence_root", EVIDENCE_ROOT, "authority");
  assertExact(go, "formal_run_id", FORMAL_RUN_ID, "go");
  assertExact(go, "attempt_id", ATTEMPT_ID, "go");
  assertExact(go, "decision", "GO", "go");
  assertExact(go, "execution_authorized", "true", "go");
  assertExact(go, "authority_raw_sha256", authoritySha, "go");
  assertExact(go, "runner_raw_sha256", runnerSha, "go");
  assertExact(go, "candidate_raw_sha256", CANDIDATE_SHA256, "go");
  assertExact(go, "recovery_evidence_root", EVIDENCE_ROOT, "go");
  for (const priority of ["open_p0", "open_p1", "open_p2"]) {
    assertExact(go, priority, "0", "go");
  }
  return { authoritySha, goSha: sha256(goBytes) };
}

export function atomicClaimEvidenceRootV2(evidenceRoot = EVIDENCE_ROOT,
  dependencies = { mkdirSync, realpathSync, statSync }) {
  dependencies.mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 });
  if (dependencies.realpathSync(evidenceRoot) !== evidenceRoot
      || !dependencies.statSync(evidenceRoot).isDirectory()) {
    throw new Error("b2c-000197-recovery-v2-attempt-claim-identity-drift");
  }
  return evidenceRoot;
}

export class RecoveryEvidenceRecorderV2 {
  constructor(evidenceRoot, dependencies = { writeFileSync, chmodSync, statSync }) {
    this.root = evidenceRoot;
    this.dependencies = dependencies;
    this.entries = [];
  }

  write(filename, payload) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root) throw new Error("b2c-000197-recovery-v2-evidence-path-escape");
    const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const encoded = content.toString("utf8");
    if (URL_SECRET.test(encoded) || KEY_VALUE_SECRET.test(encoded)) {
      URL_SECRET.lastIndex = 0;
      KEY_VALUE_SECRET.lastIndex = 0;
      throw new Error("b2c-000197-recovery-v2-evidence-secret-leak");
    }
    this.dependencies.writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    this.dependencies.chmodSync(path, 0o444);
    const observed = this.dependencies.statSync(path);
    if ((observed.mode & 0o777) !== 0o444 || observed.size !== content.byteLength) {
      throw new Error("b2c-000197-recovery-v2-evidence-mode-or-size-drift");
    }
    const entry = { filename, bytes: content.byteLength, raw_sha256: sha256(content) };
    this.entries.push(entry);
    return entry;
  }

  terminal(kind, payload) {
    const artifact = this.write(`${kind}-${ATTEMPT_ID}.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-terminal-v2",
      formal_run_id: FORMAL_RUN_ID,
      attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "PASSED" : "FAILED",
      resources_retained: true,
      cleanup_attempted: false,
      retry_attempted: false,
      evidence_entries: [...this.entries],
      ...payload,
    });
    return this.write(`${kind}-${ATTEMPT_ID}.manifest.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-terminal-manifest-v2",
      formal_run_id: FORMAL_RUN_ID,
      attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "PASSED" : "FAILED",
      artifact,
    });
  }
}

export function runFrozenLoaderAttemptV2({
  candidateBytes, evidenceRoot, spawn = spawnSync, now = () => new Date().toISOString(),
}) {
  const recorder = new RecoveryEvidenceRecorderV2(evidenceRoot);
  const intent = recorder.write("001-loader-intent.json", {
    schema_version: "b2c-000197-v11-ef-loader-recovery-child-intent-v2",
    formal_run_id: FORMAL_RUN_ID,
    attempt_id: ATTEMPT_ID,
    recorded_at_utc: now(),
    command: NODE_PATH,
    argv: ["--input-type=module", "-"],
    cwd: root,
    shell: false,
    environment_allowlist: MINIMAL_ENV,
    stdin: { bytes: candidateBytes.byteLength, raw_sha256: sha256(candidateBytes) },
  });
  let child;
  try {
    child = spawn(NODE_PATH, ["--input-type=module", "-"], {
      cwd: root, env: MINIMAL_ENV, input: candidateBytes, encoding: null,
      maxBuffer: 64 * 1024 * 1024, shell: false,
    });
  } catch (error) {
    child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  }
  const stdout = bytes(child.stdout);
  const stderr = bytes(child.stderr);
  const result = recorder.write("001-loader-result.json", {
    schema_version: "b2c-000197-v11-ef-loader-recovery-child-result-v2",
    formal_run_id: FORMAL_RUN_ID,
    attempt_id: ATTEMPT_ID,
    recorded_at_utc: now(),
    intent_raw_sha256: intent.raw_sha256,
    exit_code: child.status ?? null,
    signal: child.signal ?? null,
    spawn_error: child.error ? redactEvidenceTextV2(child.error.message ?? String(child.error)) : null,
    stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout),
      redacted_utf8: redactEvidenceTextV2(stdout.toString("utf8")) },
    stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr),
      redacted_utf8: redactEvidenceTextV2(stderr.toString("utf8")) },
  });
  const failed = Boolean(child.error) || child.status !== 0 || child.signal != null;
  recorder.terminal(failed ? "failure" : "success", {
    loader_process_attempts: 1,
    loader_result_raw_sha256: result.raw_sha256,
    failure_reason: failed ? "single-loader-process-attempt-failed" : null,
  });
  if (failed) throw new Error("b2c-000197-recovery-v2-loader-attempt-failed-stop-no-retry");
  return { status: "passed", attempts: 1 };
}

export function verifyFrozenInputsV2() {
  if (process.execPath !== NODE_PATH || process.version !== NODE_VERSION) {
    throw new Error("b2c-000197-recovery-v2-node-runtime-drift");
  }
  verifyExecutableV2(NODE_PATH, NODE_REALPATH, NODE_SHA256, "node");
  verifyExecutableV2(DOCKER_PATH, DOCKER_REALPATH, DOCKER_SHA256, "docker");
  verifyDockerVersionV2();
  const candidateBytes = verifyCandidateBytesV2(readFileSync(CANDIDATE_PATH));
  const authorityBytes = readFileSync(AUTHORITY_PATH);
  const goBytes = readFileSync(QA_GO_PATH);
  const runnerSha = sha256(readFileSync(SELF_PATH));
  return { candidateBytes, ...verifyGoEnvelopeV2({ authorityBytes, goBytes, runnerSha }) };
}

function staticCandidate() {
  return {
    status: "blocked-awaiting-independent-qa-go",
    formal_run_id: FORMAL_RUN_ID,
    attempt_id: ATTEMPT_ID,
    execution_authorized: false,
    loader_executed: false,
    recovery_evidence_root: EVIDENCE_ROOT,
  };
}

if (realpathSync(process.argv[1] ?? SELF_PATH) === realpathSync(SELF_PATH)) {
  if (process.env.B2C_000197_V11_EF_RECOVERY_EXECUTE === "1") {
    try {
      const verified = verifyFrozenInputsV2();
      atomicClaimEvidenceRootV2();
      runFrozenLoaderAttemptV2({ candidateBytes: verified.candidateBytes, evidenceRoot: EVIDENCE_ROOT });
    } catch (error) {
      process.stderr.write(`${redactEvidenceTextV2(error?.stack ?? error?.message ?? String(error))}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stdout.write(`${JSON.stringify(staticCandidate(), null, 2)}\n`);
  }
}
