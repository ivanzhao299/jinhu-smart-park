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
export const ATTEMPT_ID = "b2c197_prelim_20260802f_loader_recovery_attempt03";
export const NODE_PATH = "/home/jinhuit/.nvm/versions/node/v22.23.2/bin/node";
export const NODE_REALPATH = NODE_PATH;
export const NODE_VERSION = "v22.23.2";
export const NODE_SHA256 = "3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327";
export const DOCKER_PATH = "/usr/bin/docker";
export const DOCKER_REALPATH = "/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker";
export const DOCKER_VERSION = "Docker version 29.6.2, build dfc4efb";
export const DOCKER_SHA256 = "dda0804fca9b37a16e688356049ddf51fdd4c1a435c0a41055ec81cdf121535a";
export const CANDIDATE_SHA256 = "60057a2eff12a0be47fe9c37461d4447b7be4c2a1696765a6a905cc624a002a4";
export const CANDIDATE_BYTES = 7314;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
export const CANDIDATE_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-candidate-v2-20260802f.mjs");
export const AUTHORITY_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-authority-v3-20260802f.grammar");
export const DATABASE_GO_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-independent-database-go-v3-20260802f.grammar");
export const QA_GO_PATH = resolve(researchRoot,
  "b2c-000197-v11-ef-loader-recovery-independent-qa-go-v3-20260802f.grammar");
export const EVIDENCE_ROOT = resolve(researchRoot,
  "b2c-000197-r0-loader-recovery-evidence-b2c197_prelim_20260802f-attempt03");
const SELF_PATH = fileURLToPath(import.meta.url);
const MINIMAL_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8" });
const URL_SECRET = /\b(?:postgres(?:ql)?):\/\/[^\s'"`]+/giu;
const KEY_VALUE_SECRET = /\b(password|passwd|pwd|secret|token|credential)=((?!<redacted>)[^\s&;]+)/giu;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const asBuffer = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");

export const TARGETS = Object.freeze([
  Object.freeze({ key: "e", topology: "upgrade-to-195",
    container: "jinhu-b2c197-prelim-20260802f-e",
    containerId: "e8cdea7ae9692bc5fe7407026def4675722f6b7379bd4dd8a915625c73c8daaf",
    database: "jinhu_b2c197_e",
    volume: "3320230428e226dc57803bc265b2ab1b43a20fde830324181cd21c4ed5445779" }),
  Object.freeze({ key: "f", topology: "fresh-to-195",
    container: "jinhu-b2c197-prelim-20260802f-f",
    containerId: "485454ceaa64e29fbf737c6b0c4e206c7bb15fb95e601124e754d5c4b5defcfe",
    database: "jinhu_b2c197_f",
    volume: "767ce9a66b29aa9c2230bdbf25479c88af8a1b0515d867deaf2c67bb57b6538e" }),
]);
const IMAGE_ID = "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";
export const EXPECTED_HISTORY = Object.freeze([
  ["000185_property_b_identity_schema_expand.sql", "3191ef37395a13ce513283e73994fc6949798dde8fc9666f586c9aeb4c3312ec"],
  ["000186_property_b_approval_runtime_schema.sql", "5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e"],
  ["000187_property_b_event_notification_schema.sql", "85dbd8235a538ed243a613ae9a12d6bddaba34f88687296c1ad02d3df9504c20"],
  ["000188_property_b_task_runtime_schema.sql", "e0b659d9d5c35eec67cfa029240538626492736e4f450f2b47acb40e25dc4e08"],
  ["000189_property_b_module_rbac_definitions.sql", "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2"],
  ["000200_property_b_migration_compatibility_control.sql", "da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a"],
  ["000193_property_b_runtime_integrity_forward_fix.sql", "c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07"],
  ["000194_property_task_projection_contract_correction.sql", "93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0"],
  ["000195_property_mutation_receipt_contract_v2.sql", "9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4"],
].map(([filename, checksum]) => Object.freeze({ filename, checksum, status: "succeeded" })));

const AUTHORITY_KEYS = Object.freeze(["formal_run_id", "attempt_id", "execution_authorized",
  "candidate_raw_sha256", "runner_raw_sha256", "preflight_raw_sha256", "recovery_evidence_root",
  "database_go_path", "qa_go_path", "v2_qa_go_audit_raw_sha256", "v2_database_no_go_audit_raw_sha256"]);
const DATABASE_GO_KEYS = Object.freeze(["formal_run_id", "attempt_id", "decision",
  "execution_authorized", "authority_raw_sha256", "runner_raw_sha256", "candidate_raw_sha256",
  "preflight_raw_sha256", "recovery_evidence_root", "open_p0", "open_p1", "open_p2",
  "reviewer_authority"]);
const QA_GO_KEYS = Object.freeze([...DATABASE_GO_KEYS, "database_go_raw_sha256"]);

export function redactEvidenceTextV3(value) {
  return String(value ?? "").replace(URL_SECRET, "<redacted-database-url>")
    .replace(KEY_VALUE_SECRET, (_, key) => `${key}=<redacted>`);
}

export function parseStrictGrammarV3(value, { header, keys }) {
  const lines = String(value).split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== header) throw new Error("b2c-000197-recovery-v3-grammar-header-drift");
  const allowed = new Set(keys);
  const parsed = new Map();
  for (const line of lines) {
    const separator = line.indexOf("\t");
    if (separator <= 0) throw new Error("b2c-000197-recovery-v3-grammar-line-malformed");
    const key = line.slice(0, separator);
    if (!allowed.has(key)) throw new Error(`b2c-000197-recovery-v3-grammar-unknown-key:${key}`);
    if (parsed.has(key)) throw new Error(`b2c-000197-recovery-v3-grammar-duplicate-key:${key}`);
    parsed.set(key, line.slice(separator + 1));
  }
  for (const key of keys) {
    if (!parsed.has(key)) throw new Error(`b2c-000197-recovery-v3-grammar-missing-key:${key}`);
  }
  return parsed;
}

function requireValue(map, key, expected, scope) {
  if (map.get(key) !== expected) throw new Error(`b2c-000197-recovery-v3-${scope}-drift:${key}`);
}

export function verifyAuthorizationEnvelopeV3({ authorityBytes, databaseGoBytes, qaGoBytes,
  runnerSha }) {
  const authoritySha = sha256(authorityBytes);
  const databaseGoSha = sha256(databaseGoBytes);
  const authority = parseStrictGrammarV3(authorityBytes, {
    header: "b2c-000197-v11-ef-loader-recovery-authority-v3-machine", keys: AUTHORITY_KEYS,
  });
  const databaseGo = parseStrictGrammarV3(databaseGoBytes, {
    header: "b2c-000197-v11-ef-loader-recovery-independent-database-go-v3",
    keys: DATABASE_GO_KEYS,
  });
  const qaGo = parseStrictGrammarV3(qaGoBytes, {
    header: "b2c-000197-v11-ef-loader-recovery-independent-qa-go-v3", keys: QA_GO_KEYS,
  });
  for (const [map, scope] of [[authority, "authority"], [databaseGo, "database-go"], [qaGo, "qa-go"]]) {
    requireValue(map, "formal_run_id", FORMAL_RUN_ID, scope);
    requireValue(map, "attempt_id", ATTEMPT_ID, scope);
    requireValue(map, "candidate_raw_sha256", CANDIDATE_SHA256, scope);
    requireValue(map, "recovery_evidence_root", EVIDENCE_ROOT, scope);
  }
  requireValue(authority, "execution_authorized", "false", "authority");
  requireValue(authority, "runner_raw_sha256", runnerSha, "authority");
  const preflightSha = authority.get("preflight_raw_sha256");
  if (!/^[a-f0-9]{64}$/u.test(preflightSha)) {
    throw new Error("b2c-000197-recovery-v3-authority-drift:preflight_raw_sha256");
  }
  requireValue(authority, "database_go_path", DATABASE_GO_PATH, "authority");
  requireValue(authority, "qa_go_path", QA_GO_PATH, "authority");
  requireValue(authority, "v2_qa_go_audit_raw_sha256",
    "b17b4ac3a20a1ec0749c57476d54cdefb5c4483427921f1f71dc20929b67fdf5", "authority");
  requireValue(authority, "v2_database_no_go_audit_raw_sha256",
    "66938568644855c8c8eb8bc3ffc0afa6cfa3a17656812d1045968d8344cd3517", "authority");
  for (const [map, scope] of [[databaseGo, "database-go"], [qaGo, "qa-go"]]) {
    requireValue(map, "decision", "GO", scope);
    requireValue(map, "execution_authorized", "true", scope);
    requireValue(map, "authority_raw_sha256", authoritySha, scope);
    requireValue(map, "runner_raw_sha256", runnerSha, scope);
    requireValue(map, "preflight_raw_sha256", preflightSha, scope);
    requireValue(map, "open_p0", "0", scope);
    requireValue(map, "open_p1", "0", scope);
    requireValue(map, "open_p2", "0", scope);
  }
  requireValue(databaseGo, "reviewer_authority", "independent-database-and-architecture-reviewer",
    "database-go");
  requireValue(qaGo, "reviewer_authority", "independent-qa-security-reviewer", "qa-go");
  requireValue(qaGo, "database_go_raw_sha256", databaseGoSha, "qa-go");
  return { authoritySha, databaseGoSha, qaGoSha: sha256(qaGoBytes) };
}

export function atomicClaimEvidenceRootV3(evidenceRoot = EVIDENCE_ROOT,
  dependencies = { mkdirSync, realpathSync, statSync }) {
  dependencies.mkdirSync(evidenceRoot, { recursive: false, mode: 0o700 });
  if (dependencies.realpathSync(evidenceRoot) !== evidenceRoot
      || !dependencies.statSync(evidenceRoot).isDirectory()) {
    throw new Error("b2c-000197-recovery-v3-attempt-claim-identity-drift");
  }
  return evidenceRoot;
}

export class RecoveryEvidenceRecorderV3 {
  constructor(evidenceRoot, dependencies = { writeFileSync, chmodSync, statSync }) {
    this.root = evidenceRoot;
    this.dependencies = dependencies;
    this.entries = [];
    this.sequence = 0;
    this.terminalWritten = false;
  }

  write(filename, payload) {
    const path = resolve(this.root, filename);
    if (dirname(path) !== this.root) throw new Error("b2c-000197-recovery-v3-evidence-path-escape");
    const content = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const encoded = content.toString("utf8");
    if (URL_SECRET.test(encoded) || KEY_VALUE_SECRET.test(encoded)) {
      URL_SECRET.lastIndex = 0;
      KEY_VALUE_SECRET.lastIndex = 0;
      throw new Error("b2c-000197-recovery-v3-evidence-secret-leak");
    }
    this.dependencies.writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    this.dependencies.chmodSync(path, 0o444);
    const observed = this.dependencies.statSync(path);
    if ((observed.mode & 0o777) !== 0o444 || observed.size !== content.byteLength) {
      throw new Error("b2c-000197-recovery-v3-evidence-mode-or-size-drift");
    }
    const entry = { filename, bytes: content.byteLength, raw_sha256: sha256(content) };
    this.entries.push(entry);
    return entry;
  }

  child(stage, command, args, options, spawn = spawnSync, now = () => new Date().toISOString()) {
    const sequence = ++this.sequence;
    const prefix = `${String(sequence).padStart(3, "0")}-${stage}`;
    const input = options.input == null ? Buffer.alloc(0) : asBuffer(options.input);
    const intent = this.write(`${prefix}-intent.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-child-intent-v3",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, sequence, stage,
      recorded_at_utc: now(), command, argv: args, cwd: options.cwd, shell: false,
      environment_allowlist: options.env,
      stdin: { present: options.input != null, bytes: input.byteLength, raw_sha256: sha256(input) },
    });
    let child;
    try {
      child = spawn(command, args, { ...options, shell: false, encoding: null });
    } catch (error) {
      child = { status: null, signal: null, error, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    const stdout = asBuffer(child.stdout);
    const stderr = asBuffer(child.stderr);
    const result = this.write(`${prefix}-result.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-child-result-v3",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, sequence, stage,
      recorded_at_utc: now(), intent_raw_sha256: intent.raw_sha256,
      exit_code: child.status ?? null, signal: child.signal ?? null,
      spawn_error: child.error ? redactEvidenceTextV3(child.error.message ?? String(child.error)) : null,
      stdout: { bytes: stdout.byteLength, raw_sha256: sha256(stdout),
        redacted_utf8: redactEvidenceTextV3(stdout.toString("utf8")) },
      stderr: { bytes: stderr.byteLength, raw_sha256: sha256(stderr),
        redacted_utf8: redactEvidenceTextV3(stderr.toString("utf8")) },
    });
    return { ...child, stdout, stderr, result };
  }

  terminal(kind, payload) {
    if (this.terminalWritten) throw new Error("b2c-000197-recovery-v3-terminal-already-written");
    this.terminalWritten = true;
    const artifact = this.write(`${kind}-${ATTEMPT_ID}.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-terminal-v3",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "SUCCESS" : "FAILED",
      resources_retained: true, cleanup_attempted: false, retry_attempted: false,
      attempt_reusable: false, evidence_entries: [...this.entries], ...payload,
    });
    return this.write(`${kind}-${ATTEMPT_ID}.manifest.json`, {
      schema_version: "b2c-000197-v11-ef-loader-recovery-terminal-manifest-v3",
      formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
      status: kind === "success" ? "SUCCESS" : "FAILED", artifact,
    });
  }
}

function requireChildSuccess(child, stage) {
  if (child.error || child.status !== 0 || child.signal != null) {
    throw new Error(`b2c-000197-recovery-v3-child-failed:${stage}`);
  }
  return child.stdout.toString("utf8").trim();
}

export function validateContainerInspectionV3(value, target) {
  const parsed = JSON.parse(value);
  const expectedKeys = ["id", "image", "mounts", "name", "port_bindings", "ports",
    "publish_all_ports", "status"];
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(`b2c-000197-recovery-v3-container-shape-drift:${target.key}`);
  }
  const mount = parsed.mounts?.[0];
  if (parsed.id !== target.containerId || parsed.image !== IMAGE_ID || parsed.name !== `/${target.container}`
      || parsed.status !== "running" || parsed.publish_all_ports !== false
      || JSON.stringify(parsed.port_bindings) !== "{}"
      || JSON.stringify(parsed.ports) !== JSON.stringify({ "5432/tcp": null })
      || parsed.mounts.length !== 1 || mount.Type !== "volume" || mount.Name !== target.volume
      || mount.Destination !== "/var/lib/postgresql/data" || mount.RW !== true) {
    throw new Error(`b2c-000197-recovery-v3-container-identity-drift:${target.key}`);
  }
  return parsed;
}

export function validateEmptyDatabasePreflightV3(value, target) {
  const parsed = JSON.parse(value);
  if (parsed.database !== target.database || parsed.server_version !== "16.14"
      || parsed.server_version_num !== "160014" || parsed.public_user_relations !== 0
      || parsed.primary_history !== null || parsed.mirror_history !== null
      || parsed.approval_table !== null || parsed.other_clients !== 0
      || parsed.other_open_transactions !== 0) {
    throw new Error(`b2c-000197-recovery-v3-database-preflight-drift:${target.key}`);
  }
  return parsed;
}

export function parseLoaderSuccessV3(value) {
  const trimmed = String(value).trim();
  if (!trimmed) throw new Error("b2c-000197-recovery-v3-loader-json-empty");
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch {
    throw new Error("b2c-000197-recovery-v3-loader-json-malformed-or-extra");
  }
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(["run_id", "status", "targets"])
      || parsed.status !== "passed" || parsed.run_id !== FORMAL_RUN_ID
      || JSON.stringify(Object.keys(parsed.targets ?? {}).sort()) !== JSON.stringify(["fresh", "upgrade"])
      || JSON.stringify(parsed.targets.upgrade) !== JSON.stringify({
        container: TARGETS[0].container, database: TARGETS[0].database,
      }) || JSON.stringify(parsed.targets.fresh) !== JSON.stringify({
        container: TARGETS[1].container, database: TARGETS[1].database,
      })) {
    throw new Error("b2c-000197-recovery-v3-loader-json-semantic-drift");
  }
  return { status: "SUCCESS", run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID,
    targets: { e: TARGETS[0], f: TARGETS[1] } };
}

export function validatePostLoadDatabaseV3(value, target) {
  const parsed = JSON.parse(value);
  if (parsed.database !== target.database || parsed.server_version !== "16.14"
      || JSON.stringify(parsed.primary) !== JSON.stringify(EXPECTED_HISTORY)
      || JSON.stringify(parsed.mirror) !== JSON.stringify(EXPECTED_HISTORY)
      || parsed.failed_or_running !== 0 || parsed.optional_191_192 !== 0 || parsed.prefix_197 !== 0
      || parsed.approval_rows !== 0 || parsed.build_residue !== false
      || parsed.indexdef !== "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584"
      || parsed.predicate !== "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37") {
    throw new Error(`b2c-000197-recovery-v3-postload-drift:${target.key}`);
  }
  return parsed;
}

const INSPECT_FORMAT = '{"id":"{{.Id}}","image":"{{.Image}}","name":"{{.Name}}",'
  + '"status":"{{.State.Status}}","port_bindings":{{json .HostConfig.PortBindings}},'
  + '"publish_all_ports":{{.HostConfig.PublishAllPorts}},"ports":{{json .NetworkSettings.Ports}},'
  + '"mounts":{{json .Mounts}}}';
const PREFLIGHT_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'database',current_database(),'server_version',current_setting('server_version'),
  'server_version_num',current_setting('server_version_num'),
  'public_user_relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')),
  'primary_history',to_regclass('public.sys_schema_migration_history'),
  'mirror_history',to_regclass('public.schema_migrations'),
  'approval_table',to_regclass('public.biz_property_approval_request'),
  'other_clients',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'),
  'other_open_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND xact_start IS NOT NULL));
ROLLBACK;`;
const historyNames = EXPECTED_HISTORY.map(({ filename }) => `'${filename}'`).join(",");
const POSTLOAD_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'database',current_database(),'server_version',current_setting('server_version'),
  'primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM public.sys_schema_migration_history)x),
  'mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM (SELECT filename,checksum,status FROM public.schema_migrations)x),
  'failed_or_running',(SELECT count(*) FROM public.sys_schema_migration_history WHERE status IN ('failed','running')),
  'optional_191_192',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename LIKE '000191\\_%' ESCAPE '\\' OR filename LIKE '000192\\_%' ESCAPE '\\'),
  'prefix_197',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
  'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
  'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
  'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
  'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass
  AND (SELECT count(*) FROM public.sys_schema_migration_history WHERE filename IN (${historyNames}) AND status='succeeded')=9;
ROLLBACK;`;

export function executeClaimedAttemptV3({ candidateBytes, evidenceRoot, spawn = spawnSync,
  now = () => new Date().toISOString() }) {
  const recorder = new RecoveryEvidenceRecorderV3(evidenceRoot);
  try {
    const version = recorder.child("docker-version", DOCKER_PATH, ["--version"],
      { cwd: root, env: MINIMAL_ENV }, spawn, now);
    if (requireChildSuccess(version, "docker-version") !== DOCKER_VERSION) {
      throw new Error("b2c-000197-recovery-v3-docker-version-drift");
    }
    for (const target of TARGETS) {
      const inspect = recorder.child(`preflight-inspect-${target.key}`, DOCKER_PATH,
        ["inspect", target.container, "--format", INSPECT_FORMAT],
        { cwd: root, env: MINIMAL_ENV }, spawn, now);
      validateContainerInspectionV3(requireChildSuccess(inspect, `preflight-inspect-${target.key}`), target);
      const database = recorder.child(`preflight-database-${target.key}`, DOCKER_PATH,
        ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
          "-U", "postgres", "-d", target.database],
        { cwd: root, env: MINIMAL_ENV, input: PREFLIGHT_SQL }, spawn, now);
      validateEmptyDatabasePreflightV3(
        requireChildSuccess(database, `preflight-database-${target.key}`), target);
    }
    const loader = recorder.child("loader", NODE_PATH, ["--input-type=module", "-"],
      { cwd: root, env: MINIMAL_ENV, input: candidateBytes, maxBuffer: 64 * 1024 * 1024 }, spawn, now);
    const loaderResult = parseLoaderSuccessV3(requireChildSuccess(loader, "loader"));
    const postchecks = [];
    for (const target of TARGETS) {
      const database = recorder.child(`postload-database-${target.key}`, DOCKER_PATH,
        ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
          "-U", "postgres", "-d", target.database],
        { cwd: root, env: MINIMAL_ENV, input: POSTLOAD_SQL }, spawn, now);
      postchecks.push(validatePostLoadDatabaseV3(
        requireChildSuccess(database, `postload-database-${target.key}`), target));
    }
    recorder.terminal("success", { loader_process_attempts: 1, loader_result: loaderResult,
      postload_exact_history: "185-190-193-195", optional_191_192: "absent",
      prefix_197: "absent", failed_or_running: 0, approval_rows: 0, postchecks });
    return { status: "SUCCESS", attempts: 1 };
  } catch (error) {
    if (!recorder.terminalWritten) recorder.terminal("failure", {
      loader_process_attempts: recorder.entries.some(({ filename }) => filename.includes("-loader-intent")) ? 1 : 0,
      failure_reason: redactEvidenceTextV3(error?.message ?? String(error)),
    });
    throw error;
  }
}

function verifyExecutable(path, expectedRealpath, expectedSha, label) {
  accessSync(path, fsConstants.X_OK);
  if (realpathSync(path) !== expectedRealpath || sha256(readFileSync(path)) !== expectedSha) {
    throw new Error(`b2c-000197-recovery-v3-${label}-identity-drift`);
  }
}

export function verifyFrozenInputsV3() {
  if (process.execPath !== NODE_PATH || process.version !== NODE_VERSION) {
    throw new Error("b2c-000197-recovery-v3-node-runtime-drift");
  }
  verifyExecutable(NODE_PATH, NODE_REALPATH, NODE_SHA256, "node");
  verifyExecutable(DOCKER_PATH, DOCKER_REALPATH, DOCKER_SHA256, "docker");
  const candidateBytes = readFileSync(CANDIDATE_PATH);
  if (candidateBytes.byteLength !== CANDIDATE_BYTES || sha256(candidateBytes) !== CANDIDATE_SHA256) {
    throw new Error("b2c-000197-recovery-v3-candidate-drift");
  }
  const runnerSha = sha256(readFileSync(SELF_PATH));
  const authorization = verifyAuthorizationEnvelopeV3({
    authorityBytes: readFileSync(AUTHORITY_PATH), databaseGoBytes: readFileSync(DATABASE_GO_PATH),
    qaGoBytes: readFileSync(QA_GO_PATH), runnerSha,
  });
  return { candidateBytes, runnerSha, authorization };
}

function staticCandidate() {
  return { status: "blocked-awaiting-independent-v3-database-and-qa-go",
    formal_run_id: FORMAL_RUN_ID, attempt_id: ATTEMPT_ID, execution_authorized: false,
    loader_executed: false, recovery_evidence_root: EVIDENCE_ROOT };
}

if (realpathSync(process.argv[1] ?? SELF_PATH) === realpathSync(SELF_PATH)) {
  if (process.env.B2C_000197_V11_EF_RECOVERY_V3_EXECUTE === "1") {
    try {
      const verified = verifyFrozenInputsV3();
      atomicClaimEvidenceRootV3();
      executeClaimedAttemptV3({ candidateBytes: verified.candidateBytes, evidenceRoot: EVIDENCE_ROOT });
    } catch (error) {
      process.stderr.write(`${redactEvidenceTextV3(error?.stack ?? error?.message ?? String(error))}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stdout.write(`${JSON.stringify(staticCandidate(), null, 2)}\n`);
  }
}
