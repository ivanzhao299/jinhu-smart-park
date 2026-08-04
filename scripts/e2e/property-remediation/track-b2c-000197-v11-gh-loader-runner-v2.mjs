#!/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync, chmodSync, constants as fsConstants, existsSync, lstatSync, mkdirSync,
  readFileSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_BYTES, CANDIDATE_SHA256, DOCKER_PATH, DOCKER_REALPATH, DOCKER_SHA256,
  DOCKER_VERSION, EXPECTED_HISTORY, FORMAL_RUN_ID, NODE_PATH, NODE_REALPATH, NODE_SHA256,
  NODE_VERSION, TARGETS, parseLoaderSuccess, parseStrictGrammar, redactEvidence,
  validateContainerInspection, validateEmptyDatabase, validatePostLoad,
} from "./track-b2c-000197-v11-gh-loader-runner-v1.mjs";

export { CANDIDATE_SHA256, DOCKER_PATH, DOCKER_SHA256, DOCKER_VERSION, EXPECTED_HISTORY,
  FORMAL_RUN_ID, NODE_PATH, NODE_SHA256, TARGETS, parseLoaderSuccess, parseStrictGrammar,
  validateContainerInspection, validateEmptyDatabase, validatePostLoad };

export const ATTEMPT_ID = "b2c197_prelim_20260802g_gh_loader_attempt02";
export const OUTER_EXECUTION_MODE = "escalated-full-runner";
export const V1_RUNNER_SHA256 = "cd2570881cff2c4c024e489c5b391259d45c9230751d3451224d71c5cb0da6a9";
export const DATABASE_RECOVERY_REVIEW_SHA256 = "ed9bbab82060202afbf03208eeb8b880ab715d76aaf22548b3deeb370074e1cb";
export const QA_FAILURE_REVIEW_SHA256 = "16f0aa5cd2c73abc3a7d2f4d950e0f0da1db9fabd75021f550ce9d0ce9a6d34a";
export const ATTEMPT01_FAILURE_TERMINAL_SHA256 = "2245eef92fd071e32f9df32bafd69b9087da0a59585b6f4d99aedbb0f9c3fe5a";
export const ATTEMPT01_FAILURE_MANIFEST_SHA256 = "fd07060d2bc6e77a6c25fec6bbb751322fd61d1d882de7c133e5304f39df4689";
export const ATTEMPT01_DOCKER_INTENT_SHA256 = "70726afb1eb2af38a23d1bc719cabc186922c525deb899cd2881154658c8c6cc";
export const ATTEMPT01_DOCKER_RESULT_SHA256 = "fbc90f39ea1309a5ca7657fb4eb625c30f811ddd0c0e88c8ce23fc58d1eb38f5";

const SELF_PATH = fileURLToPath(import.meta.url);
const root = resolve(dirname(SELF_PATH), "../../..");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
export const V1_RUNNER_PATH = resolve(dirname(SELF_PATH), "track-b2c-000197-v11-gh-loader-runner-v1.mjs");
export const CANDIDATE_PATH = resolve(researchRoot, "b2c-000197-v11-gh-loader-candidate-v1-20260802g.mjs");
export const AUTHORITY_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-authority-v2-20260802g.grammar");
export const DATABASE_GO_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-independent-database-go-v2-20260802g.grammar");
export const QA_GO_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2-20260802g.grammar");
export const TEST_RECORD_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-test-record-v2-20260802g.grammar");
export const MANIFEST_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-manifest-v2-20260802g.grammar");
export const HANDOFF_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt02-handoff-v2-20260802g.grammar");
export const DATABASE_RECOVERY_REVIEW_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt01-eperm-recovery-independent-database-review-20260802g.grammar");
export const QA_FAILURE_REVIEW_PATH = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-attempt01-failure-qa-security-review-20260802g.grammar");
export const ATTEMPT01_EVIDENCE_ROOT = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-evidence-b2c197_prelim_20260802g-attempt01");
export const EVIDENCE_ROOT = resolve(researchRoot,
  "b2c-000197-v11-gh-loader-evidence-b2c197_prelim_20260802g-attempt02");
const ATTEMPT01_FILES = Object.freeze([
  Object.freeze({ filename: "001-docker-version-intent.json", sha256: ATTEMPT01_DOCKER_INTENT_SHA256 }),
  Object.freeze({ filename: "001-docker-version-result.json", sha256: ATTEMPT01_DOCKER_RESULT_SHA256 }),
  Object.freeze({ filename: `failure-b2c197_prelim_20260802g_gh_loader_attempt01.json`,
    sha256: ATTEMPT01_FAILURE_TERMINAL_SHA256 }),
  Object.freeze({ filename: `failure-b2c197_prelim_20260802g_gh_loader_attempt01.manifest.json`,
    sha256: ATTEMPT01_FAILURE_MANIFEST_SHA256 }),
]);
const MINIMAL_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8" });
const IMAGE_ID = "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";
const URL_SECRET = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const KEY_VALUE_SECRET = /\b(password|passwd|pwd|secret|token|credential)=((?!<redacted>)[^\s&;]+)/giu;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const asBuffer = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
const targetIdentity = (target) => [target.topology, target.container, target.containerId,
  target.database, target.volume].join("|");

const AUTHORITY_KEYS = Object.freeze(["formal_run_id", "attempt_id", "execution_authorized",
  "formal_go", "outer_execution_mode", "candidate_raw_sha256", "runner_raw_sha256",
  "v1_runner_path", "v1_runner_raw_sha256", "evidence_root", "database_go_path", "qa_go_path",
  "test_record_path", "test_record_raw_sha256", "manifest_path", "handoff_path", "database_recovery_review_path",
  "database_recovery_review_raw_sha256", "qa_failure_review_path", "qa_failure_review_raw_sha256",
  "attempt01_evidence_root", "attempt01_failure_terminal_raw_sha256",
  "attempt01_failure_manifest_raw_sha256", "attempt01_docker_intent_raw_sha256",
  "attempt01_docker_result_raw_sha256", "node_path", "node_raw_sha256", "docker_path",
  "docker_raw_sha256", "postgres_image_id", "target_g", "target_h"]);
const GO_KEYS = Object.freeze(["formal_run_id", "attempt_id", "decision", "execution_authorized",
  "formal_go", "outer_execution_mode", "authority_raw_sha256", "runner_raw_sha256",
  "candidate_raw_sha256", "evidence_root", "database_recovery_review_raw_sha256",
  "qa_failure_review_raw_sha256", "attempt01_failure_terminal_raw_sha256",
  "test_record_raw_sha256", "manifest_raw_sha256", "handoff_raw_sha256",
  "target_g_raw_sha256", "target_h_raw_sha256", "open_p0", "open_p1", "open_p2",
  "reviewer_authority", "qa_go_path", "qa_go_schema"]);
const QA_GO_KEYS = Object.freeze([...GO_KEYS, "database_go_raw_sha256"]);

function requireValue(map, key, expected, scope) {
  if (map.get(key) !== expected) throw new Error(`b2c-000197-gh-loader-attempt02-${scope}-drift:${key}`);
}

export function verifyAuthorizationEnvelope({ authorityBytes, databaseGoBytes, qaGoBytes, runnerSha,
  testRecordSha, manifestSha, handoffSha }) {
  const authoritySha = sha256(authorityBytes); const databaseGoSha = sha256(databaseGoBytes);
  const authority = parseStrictGrammar(authorityBytes, {
    header: "b2c-000197-v11-gh-loader-attempt02-authority-v2", keys: AUTHORITY_KEYS,
  });
  const databaseGo = parseStrictGrammar(databaseGoBytes, {
    header: "b2c-000197-v11-gh-loader-attempt02-independent-database-go-v2", keys: GO_KEYS,
  });
  const qaGo = parseStrictGrammar(qaGoBytes, {
    header: "b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2", keys: QA_GO_KEYS,
  });
  const identities = Object.fromEntries(TARGETS.map((target) => [`target_${target.key}`, targetIdentity(target)]));
  for (const [map, scope] of [[authority, "authority"], [databaseGo, "database-go"], [qaGo, "qa-go"]]) {
    requireValue(map, "formal_run_id", FORMAL_RUN_ID, scope);
    requireValue(map, "attempt_id", ATTEMPT_ID, scope);
    requireValue(map, "candidate_raw_sha256", CANDIDATE_SHA256, scope);
    requireValue(map, "runner_raw_sha256", runnerSha, scope);
    requireValue(map, "outer_execution_mode", OUTER_EXECUTION_MODE, scope);
  }
  requireValue(authority, "execution_authorized", "false", "authority");
  requireValue(authority, "formal_go", "false", "authority");
  requireValue(authority, "v1_runner_path", V1_RUNNER_PATH, "authority");
  requireValue(authority, "v1_runner_raw_sha256", V1_RUNNER_SHA256, "authority");
  requireValue(authority, "evidence_root", EVIDENCE_ROOT, "authority");
  requireValue(authority, "database_go_path", DATABASE_GO_PATH, "authority");
  requireValue(authority, "qa_go_path", QA_GO_PATH, "authority");
  requireValue(authority, "test_record_path", TEST_RECORD_PATH, "authority");
  requireValue(authority, "manifest_path", MANIFEST_PATH, "authority");
  requireValue(authority, "handoff_path", HANDOFF_PATH, "authority");
  requireValue(authority, "database_recovery_review_path", DATABASE_RECOVERY_REVIEW_PATH, "authority");
  requireValue(authority, "database_recovery_review_raw_sha256", DATABASE_RECOVERY_REVIEW_SHA256, "authority");
  requireValue(authority, "qa_failure_review_path", QA_FAILURE_REVIEW_PATH, "authority");
  requireValue(authority, "qa_failure_review_raw_sha256", QA_FAILURE_REVIEW_SHA256, "authority");
  requireValue(authority, "attempt01_evidence_root", ATTEMPT01_EVIDENCE_ROOT, "authority");
  requireValue(authority, "attempt01_failure_terminal_raw_sha256", ATTEMPT01_FAILURE_TERMINAL_SHA256, "authority");
  requireValue(authority, "attempt01_failure_manifest_raw_sha256", ATTEMPT01_FAILURE_MANIFEST_SHA256, "authority");
  requireValue(authority, "attempt01_docker_intent_raw_sha256", ATTEMPT01_DOCKER_INTENT_SHA256, "authority");
  requireValue(authority, "attempt01_docker_result_raw_sha256", ATTEMPT01_DOCKER_RESULT_SHA256, "authority");
  requireValue(authority, "node_path", NODE_PATH, "authority");
  requireValue(authority, "node_raw_sha256", NODE_SHA256, "authority");
  requireValue(authority, "docker_path", DOCKER_PATH, "authority");
  requireValue(authority, "docker_raw_sha256", DOCKER_SHA256, "authority");
  requireValue(authority, "postgres_image_id", IMAGE_ID, "authority");
  requireValue(authority, "target_g", identities.target_g, "authority");
  requireValue(authority, "target_h", identities.target_h, "authority");
  if (!/^[a-f0-9]{64}$/u.test(authority.get("test_record_raw_sha256"))) {
    throw new Error("b2c-000197-gh-loader-attempt02-authority-drift:test_record_raw_sha256");
  }
  for (const [map, scope] of [[databaseGo, "database-go"], [qaGo, "qa-go"]]) {
    requireValue(map, "decision", "GO", scope); requireValue(map, "execution_authorized", "true", scope);
    requireValue(map, "formal_go", "false", scope); requireValue(map, "authority_raw_sha256", authoritySha, scope);
    requireValue(map, "evidence_root", EVIDENCE_ROOT, scope);
    requireValue(map, "database_recovery_review_raw_sha256", DATABASE_RECOVERY_REVIEW_SHA256, scope);
    requireValue(map, "qa_failure_review_raw_sha256", QA_FAILURE_REVIEW_SHA256, scope);
    requireValue(map, "attempt01_failure_terminal_raw_sha256", ATTEMPT01_FAILURE_TERMINAL_SHA256, scope);
    requireValue(map, "test_record_raw_sha256", testRecordSha ?? authority.get("test_record_raw_sha256"), scope);
    if (manifestSha == null) {
      if (!/^[a-f0-9]{64}$/u.test(map.get("manifest_raw_sha256"))) {
        throw new Error(`b2c-000197-gh-loader-attempt02-${scope}-drift:manifest_raw_sha256`);
      }
    } else requireValue(map, "manifest_raw_sha256", manifestSha, scope);
    if (handoffSha == null) {
      if (!/^[a-f0-9]{64}$/u.test(map.get("handoff_raw_sha256"))) {
        throw new Error(`b2c-000197-gh-loader-attempt02-${scope}-drift:handoff_raw_sha256`);
      }
    } else requireValue(map, "handoff_raw_sha256", handoffSha, scope);
    requireValue(map, "target_g_raw_sha256", sha256(identities.target_g), scope);
    requireValue(map, "target_h_raw_sha256", sha256(identities.target_h), scope);
    requireValue(map, "open_p0", "0", scope); requireValue(map, "open_p1", "0", scope);
    requireValue(map, "open_p2", "0", scope); requireValue(map, "qa_go_path", QA_GO_PATH, scope);
    requireValue(map, "qa_go_schema", "b2c-000197-v11-gh-loader-attempt02-independent-qa-go-v2", scope);
  }
  requireValue(databaseGo, "reviewer_authority",
    "independent-database-and-architecture-recovery-reviewer", "database-go");
  requireValue(qaGo, "reviewer_authority", "independent-qa-security-reviewer", "qa-go");
  requireValue(qaGo, "database_go_raw_sha256", databaseGoSha, "qa-go");
  requireValue(qaGo, "manifest_raw_sha256", databaseGo.get("manifest_raw_sha256"), "qa-go");
  requireValue(qaGo, "handoff_raw_sha256", databaseGo.get("handoff_raw_sha256"), "qa-go");
  return { authoritySha, databaseGoSha, qaGoSha: sha256(qaGoBytes) };
}

export function atomicClaimEvidenceRoot(evidenceRoot = EVIDENCE_ROOT,
  dependencies = { mkdirSync, realpathSync, statSync }) {
  dependencies.mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 });
  if (dependencies.realpathSync(evidenceRoot) !== evidenceRoot || !dependencies.statSync(evidenceRoot).isDirectory()) {
    throw new Error("b2c-000197-gh-loader-attempt02-claim-drift");
  }
  return evidenceRoot;
}

export class LoaderEvidenceRecorder {
  constructor(evidenceRoot, dependencies = { writeFileSync, chmodSync, statSync }) {
    this.root = evidenceRoot; this.dependencies = dependencies; this.entries = [];
    this.sequence = 0; this.terminalWritten = false;
  }
  write(filename, payload) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root) throw new Error("b2c-000197-gh-loader-attempt02-evidence-path-escape");
    const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`); const text = content.toString("utf8");
    if (URL_SECRET.test(text) || KEY_VALUE_SECRET.test(text)) {
      URL_SECRET.lastIndex = 0; KEY_VALUE_SECRET.lastIndex = 0;
      throw new Error("b2c-000197-gh-loader-attempt02-evidence-secret-leak");
    }
    this.dependencies.writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    this.dependencies.chmodSync(path, 0o444); const observed = this.dependencies.statSync(path);
    if ((observed.mode & 0o777) !== 0o444 || observed.size !== content.byteLength) {
      throw new Error("b2c-000197-gh-loader-attempt02-evidence-mode-drift");
    }
    const entry = { filename, bytes: content.byteLength, raw_sha256: sha256(content) };
    this.entries.push(entry); return entry;
  }
  child(stage, command, args, options, spawn = spawnSync, now = () => new Date().toISOString()) {
    const sequence = ++this.sequence; const prefix = `${String(sequence).padStart(3, "0")}-${stage}`;
    const inputBytes = options.input == null ? Buffer.alloc(0) : asBuffer(options.input);
    const intent = this.write(`${prefix}-intent.json`, {
      schema_version: "b2c-000197-v11-gh-loader-attempt02-child-intent-v2", formal_run_id: FORMAL_RUN_ID,
      attempt_id: ATTEMPT_ID, outer_execution_mode: OUTER_EXECUTION_MODE, sequence, stage,
      recorded_at_utc: now(), command, argv: args, cwd: options.cwd, shell: false,
      environment_allowlist: Object.keys(options.env ?? {}),
      stdin: { present: options.input != null, bytes: inputBytes.byteLength, raw_sha256: sha256(inputBytes) },
    });
    let child;
    try { child = spawn(command, args, { ...options, shell: false, encoding: null }); }
    catch (error) { child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
    const stdout = asBuffer(child.stdout); const stderr = asBuffer(child.stderr);
    this.write(`${prefix}-result.json`, {
      schema_version: "b2c-000197-v11-gh-loader-attempt02-child-result-v2", formal_run_id: FORMAL_RUN_ID,
      attempt_id: ATTEMPT_ID, sequence, stage, recorded_at_utc: now(), intent_raw_sha256: intent.raw_sha256,
      exit_code: child.status ?? null, signal: child.signal ?? null,
      spawn_error: child.error ? redactEvidence(child.error.message ?? String(child.error)) : null,
      stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout), redacted_utf8: redactEvidence(stdout.toString("utf8")) },
      stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr), redacted_utf8: redactEvidence(stderr.toString("utf8")) },
    });
    return { ...child, stdout, stderr };
  }
  terminal(kind, payload) {
    if (this.terminalWritten) throw new Error("b2c-000197-gh-loader-attempt02-terminal-already-written");
    this.terminalWritten = true;
    const artifact = this.write(`${kind}-${ATTEMPT_ID}.json`, {
      schema_version: "b2c-000197-v11-gh-loader-attempt02-terminal-v2", formal_run_id: FORMAL_RUN_ID,
      attempt_id: ATTEMPT_ID, outer_execution_mode: OUTER_EXECUTION_MODE,
      status: kind === "success" ? "SUCCESS" : "FAILED", resources_retained: true,
      cleanup_attempted: false, retry_attempted: false, attempt_reusable: false,
      evidence_entries: [...this.entries], ...payload,
    });
    return this.write(`${kind}-${ATTEMPT_ID}.manifest.json`, {
      schema_version: "b2c-000197-v11-gh-loader-attempt02-terminal-manifest-v2",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, outer_execution_mode: OUTER_EXECUTION_MODE,
      status: kind === "success" ? "SUCCESS" : "FAILED", artifact,
    });
  }
}

function requireChild(child, stage) {
  if (child.error || child.status !== 0 || child.signal != null) {
    throw new Error(`b2c-000197-gh-loader-attempt02-child-failed:${stage}`);
  }
  return child.stdout.toString("utf8").trim();
}

const INSPECT_FORMAT = '{"id":"{{.Id}}","image":"{{.Image}}","name":"{{.Name}}",'
  + '"status":"{{.State.Status}}","port_bindings":{{json .HostConfig.PortBindings}},'
  + '"publish_all_ports":{{.HostConfig.PublishAllPorts}},"ports":{{json .NetworkSettings.Ports}},'
  + '"mounts":{{json .Mounts}}}';
const PREFLIGHT_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('database',current_database(),'server_version',current_setting('server_version'),
'server_version_num',current_setting('server_version_num'),
'public_user_relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')),
'primary_history',to_regclass('public.sys_schema_migration_history'),'mirror_history',to_regclass('public.schema_migrations'),
'approval_table',to_regclass('public.biz_property_approval_request'),
'other_clients',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'),
'other_open_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND xact_start IS NOT NULL));
ROLLBACK;`;
const POSTLOAD_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('database',current_database(),'server_version',current_setting('server_version'),
'primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM public.sys_schema_migration_history)x),
'mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM public.schema_migrations)x),
'failed_or_running',(SELECT count(*) FROM public.sys_schema_migration_history WHERE status IN ('failed','running')),
'optional_191_192',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename ~ '^00019[12]_'),
'prefix_197',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename ~ '^000197_'),
'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;
ROLLBACK;`;

export function executeClaimedAttempt({ candidateBytes, evidenceRoot, spawn = spawnSync,
  now = () => new Date().toISOString() }) {
  const recorder = new LoaderEvidenceRecorder(evidenceRoot);
  try {
    const version = recorder.child("docker-version", DOCKER_PATH, ["--version"],
      { cwd: root, env: MINIMAL_ENV }, spawn, now);
    if (requireChild(version, "docker-version") !== DOCKER_VERSION) {
      throw new Error("b2c-000197-gh-loader-attempt02-docker-version-drift");
    }
    for (const target of TARGETS) {
      const inspect = recorder.child(`preflight-inspect-${target.key}`, DOCKER_PATH,
        ["inspect", target.container, "--format", INSPECT_FORMAT], { cwd: root, env: MINIMAL_ENV }, spawn, now);
      validateContainerInspection(requireChild(inspect, `preflight-inspect-${target.key}`), target);
      const database = recorder.child(`preflight-database-${target.key}`, DOCKER_PATH,
        ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
          "-U", "postgres", "-d", target.database],
        { cwd: root, env: MINIMAL_ENV, input: PREFLIGHT_SQL }, spawn, now);
      validateEmptyDatabase(requireChild(database, `preflight-database-${target.key}`), target);
    }
    const loader = recorder.child("loader", NODE_PATH, ["--input-type=module", "-"],
      { cwd: root, env: MINIMAL_ENV, input: candidateBytes, maxBuffer: 64 * 1024 * 1024 }, spawn, now);
    const loaderResult = parseLoaderSuccess(requireChild(loader, "loader")); const postchecks = [];
    for (const target of TARGETS) {
      const database = recorder.child(`postload-database-${target.key}`, DOCKER_PATH,
        ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
          "-U", "postgres", "-d", target.database],
        { cwd: root, env: MINIMAL_ENV, input: POSTLOAD_SQL }, spawn, now);
      postchecks.push(validatePostLoad(requireChild(database, `postload-database-${target.key}`), target));
    }
    recorder.terminal("success", { loader_process_attempts: 1, loader_result: loaderResult,
      postload_exact_history: "185-190-193-195", optional_191_192: "absent", prefix_197: "absent",
      failed_or_running: 0, approval_rows: 0, postchecks });
    return { status: "SUCCESS", attempts: 1 };
  } catch (error) {
    if (!recorder.terminalWritten) recorder.terminal("failure", {
      loader_process_attempts: recorder.entries.some(({ filename }) => filename.includes("-loader-intent")) ? 1 : 0,
      failure_reason: redactEvidence(error?.message ?? String(error)),
    });
    throw error;
  }
}

function verifyExact(path, expectedSha, label) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || (statSync(path).mode & 0o777) !== 0o444 || sha256(readFileSync(path)) !== expectedSha) {
    throw new Error(`b2c-000197-gh-loader-attempt02-input-drift:${label}`);
  }
}
function verifyExecutable(path, expectedRealpath, expectedSha, label) {
  accessSync(path, fsConstants.X_OK);
  if (realpathSync(path) !== expectedRealpath || sha256(readFileSync(path)) !== expectedSha) {
    throw new Error(`b2c-000197-gh-loader-attempt02-tool-drift:${label}`);
  }
}
function verifyPriorAttempt() {
  for (const entry of ATTEMPT01_FILES) verifyExact(resolve(ATTEMPT01_EVIDENCE_ROOT, entry.filename),
    entry.sha256, `attempt01-${entry.filename}`);
  const terminal = JSON.parse(readFileSync(resolve(ATTEMPT01_EVIDENCE_ROOT,
    "failure-b2c197_prelim_20260802g_gh_loader_attempt01.json"), "utf8"));
  if (terminal.status !== "FAILED" || terminal.loader_process_attempts !== 0
      || terminal.resources_retained !== true || terminal.cleanup_attempted !== false
      || terminal.retry_attempted !== false || terminal.attempt_reusable !== false) {
    throw new Error("b2c-000197-gh-loader-attempt02-prior-terminal-drift");
  }
}
export function verifyFrozenInputs() {
  if (process.execPath !== NODE_PATH || process.version !== NODE_VERSION) {
    throw new Error("b2c-000197-gh-loader-attempt02-node-runtime-drift");
  }
  verifyExecutable(NODE_PATH, NODE_REALPATH, NODE_SHA256, "node");
  verifyExecutable(DOCKER_PATH, DOCKER_REALPATH, DOCKER_SHA256, "docker");
  verifyExact(V1_RUNNER_PATH, V1_RUNNER_SHA256, "v1-runner");
  verifyExact(DATABASE_RECOVERY_REVIEW_PATH, DATABASE_RECOVERY_REVIEW_SHA256, "database-recovery-review");
  verifyExact(QA_FAILURE_REVIEW_PATH, QA_FAILURE_REVIEW_SHA256, "qa-failure-review");
  verifyPriorAttempt();
  const candidateBytes = readFileSync(CANDIDATE_PATH);
  if ((statSync(CANDIDATE_PATH).mode & 0o777) !== 0o444 || candidateBytes.length !== CANDIDATE_BYTES
      || sha256(candidateBytes) !== CANDIDATE_SHA256) {
    throw new Error("b2c-000197-gh-loader-attempt02-candidate-drift");
  }
  const runnerSha = sha256(readFileSync(SELF_PATH));
  const authorityBytes = readFileSync(AUTHORITY_PATH); const databaseGoBytes = readFileSync(DATABASE_GO_PATH);
  const qaGoBytes = readFileSync(QA_GO_PATH); const authority = parseStrictGrammar(authorityBytes,
    { header: "b2c-000197-v11-gh-loader-attempt02-authority-v2", keys: AUTHORITY_KEYS });
  verifyExact(TEST_RECORD_PATH, authority.get("test_record_raw_sha256"), "test-record");
  const testRecordSha = sha256(readFileSync(TEST_RECORD_PATH));
  const manifestSha = sha256(readFileSync(MANIFEST_PATH)); const handoffSha = sha256(readFileSync(HANDOFF_PATH));
  verifyExact(MANIFEST_PATH, manifestSha, "manifest"); verifyExact(HANDOFF_PATH, handoffSha, "handoff");
  return { candidateBytes, runnerSha, authorization: verifyAuthorizationEnvelope({
    authorityBytes, databaseGoBytes, qaGoBytes, runnerSha, testRecordSha, manifestSha, handoffSha,
  }) };
}

export function staticEnvelope() {
  return { status: "blocked-awaiting-independent-attempt02-database-and-qa-loader-go",
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, execution_authorized: false,
    formal_go: false, outer_execution_mode: OUTER_EXECUTION_MODE, loader_executed: false,
    resources_retained: true, attempt01_retained: true, evidence_root: EVIDENCE_ROOT };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V11_GH_LOADER_V2_EXECUTE === "1") {
    try {
      const verified = verifyFrozenInputs(); atomicClaimEvidenceRoot();
      executeClaimedAttempt({ candidateBytes: verified.candidateBytes, evidenceRoot: EVIDENCE_ROOT });
    } catch (error) {
      process.stderr.write(`${redactEvidence(error?.stack ?? error?.message ?? String(error))}\n`); process.exitCode = 1;
    }
  } else process.stdout.write(`${JSON.stringify(staticEnvelope(), null, 2)}\n`);
}
