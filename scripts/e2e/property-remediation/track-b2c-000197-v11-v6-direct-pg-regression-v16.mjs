import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrations = resolve(root, "database/migrations");
const prefix = "b2c-000197-v11-v6-direct-pg-regression-v16";
const fixed = Object.freeze({
  candidate: resolve(research, `${prefix}-candidate-authority-20260803.json`),
  manifest: resolve(research, `${prefix}-candidate-manifest-20260803.json`),
  registry: resolve(research, `${prefix}-resource-registry-20260803.json`),
  staticRecord: resolve(research, `${prefix}-static-test-record-20260803.json`),
  node22Tap: resolve(research, `${prefix}-node22.tap`),
  node24Tap: resolve(research, `${prefix}-node24.tap`),
  databaseReview: resolve(research, `${prefix}-independent-database-review-20260803.json`),
  qaReview: resolve(research, `${prefix}-independent-qa-review-20260803.json`),
  securityReview: resolve(research, `${prefix}-independent-security-review-20260803.json`),
  drainReview: resolve(research, `${prefix}-independent-old-writer-drain-review-20260803.json`),
  provisionAuthority: resolve(research, `${prefix}-provision-authority-20260803.json`),
  observation: resolve(research, `${prefix}-resource-observation-20260803.json`),
  executionAuthority: resolve(research, `${prefix}-execution-authority-20260803.json`),
  evidence: resolve(research, `${prefix}-evidence-20260803`),
  runner: fileURLToPath(import.meta.url),
  spec: resolve(root, "scripts/e2e/property-remediation/tests/b2c-000197-v11-v6-direct-pg-regression-v16.spec.mjs"),
});
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hex64 = /^[0-9a-f]{64}$/u;
const runIdPattern = /^b2c197_v11v6_direct_v16_[a-z0-9_]{8,40}$/u;
const containerPattern = /^jinhu-b2c197-v11v6-direct-v16-[a-z0-9-]{8,40}$/u;
const databasePattern = /^jinhu_b2c197_v11v6_direct_v16_[a-z0-9_]{4,30}$/u;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const stage = (value) => String(value).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
const BASELINE_MANIFEST_SHA256 = "15a92d14cde439a474f9a1f9dbf691dcba9827a555509a1a1c02e747320007d0";
const OLD_INDEX_SHA = "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584";
const OLD_PREDICATE_SHA = "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37";
const lateNames = Object.freeze(["000183_property_business_granular_rbac.sql", "000184_property_workbench_read_permissions.sql", "000185_property_b_identity_schema_expand.sql", "000186_property_b_approval_runtime_schema.sql", "000187_property_b_event_notification_schema.sql", "000188_property_b_task_runtime_schema.sql", "000189_property_b_module_rbac_definitions.sql", "000200_property_b_migration_compatibility_control.sql", "000193_property_b_runtime_integrity_forward_fix.sql", "000194_property_task_projection_contract_correction.sql", "000195_property_mutation_receipt_contract_v2.sql"]);
const reviewOrder = Object.freeze(["databaseReview", "qaReview", "securityReview", "drainReview"]);

function exactObject(value, keys, code) {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error(code);
  return value;
}
function exactBoolean(value, expected, code) { if (typeof value !== "boolean" || value !== expected) throw new Error(code); }
function exactString(value, expected, code) { if (typeof value !== "string" || value !== expected) throw new Error(code); }
function exactZero(value, code) { if (typeof value !== "number" || !Number.isInteger(value) || !Object.is(value, 0)) throw new Error(code); }
function sealed(path) {
  if (!path.startsWith(`${research}${sep}`) && path !== fixed.runner && path !== fixed.spec) throw new Error("b2c-v16-fixed-path");
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error("b2c-v16-sealed-input");
  let descriptor;
  try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); const metadata = fstatSync(descriptor); if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o444) throw new Error("b2c-v16-sealed-input"); return readFileSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function sealedJson(path, keys, code) { const raw = sealed(path); let value; try { value = JSON.parse(raw); } catch { throw new Error(code); } return { raw, value: exactObject(value, keys, code), rawSha256: sha(raw) }; }
function assertHash(value, code) { if (typeof value !== "string" || !hex64.test(value)) throw new Error(code); }

function baselinePlan() {
  const initial = readdirSync(migrations).filter((filename) => { const match = filename.match(/^(\d{6})_.*\.sql$/u); return match && Number(match[1]) <= 182 && Number(match[1]) !== 175; }).sort();
  const sources = [...initial.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) })), { kind: "seed", filename: "000001_s1_production_core.sql", path: resolve(root, "database/seeds/000001_s1_production_core.sql") }, ...lateNames.map((filename) => ({ kind: "migration", filename, path: resolve(migrations, filename) }))];
  const plan = sources.map((entry) => ({ ...entry, raw_sha256: sha(sealedSource(entry.path)) }));
  const manifest = plan.map(({ kind, filename, raw_sha256 }) => ({ kind, filename, raw_sha256 }));
  if (plan.length !== 194 || sha(JSON.stringify(manifest)) !== BASELINE_MANIFEST_SHA256) throw new Error("b2c-v16-baseline-manifest-drift");
  return Object.freeze(plan.map(Object.freeze));
}
function sealedSource(path) { if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) throw new Error("b2c-v16-migration-path-drift"); let descriptor; try { descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); const metadata = fstatSync(descriptor); if (!metadata.isFile()) throw new Error("b2c-v16-migration-path-drift"); return readFileSync(descriptor); } finally { if (descriptor !== undefined) closeSync(descriptor); } }
function migrationBytesImmediatelyBeforeExecution(entry) { const raw = sealedSource(entry.path); if (sha(raw) !== entry.raw_sha256) throw new Error(`b2c-v16-migration-byte-drift:${entry.filename}`); return raw.toString("utf8"); }

function validateRegistry(value) {
  exactObject(value, ["schema_version", "resources"], "b2c-v16-registry-schema"); exactString(value.schema_version, "b2c-v16-resource-registry-v1", "b2c-v16-registry-schema");
  if (!Array.isArray(value.resources) || value.resources.length !== 10) throw new Error("b2c-v16-registry-count");
  const labels = new Set(), identities = new Set();
  for (const entry of value.resources) { exactObject(entry, ["label", "run_id", "container", "container_id", "database", "volume"], "b2c-v16-registry-entry"); if (!/^(A|B|C|D|E|F|G|H|v4|v15)$/u.test(entry.label) || labels.has(entry.label)) throw new Error("b2c-v16-registry-label"); labels.add(entry.label); for (const key of ["run_id", "container", "container_id", "database", "volume"]) { if (typeof entry[key] !== "string" || entry[key].trim() === "") throw new Error("b2c-v16-registry-identity"); identities.add(entry[key]); } }
  if (labels.size !== 10) throw new Error("b2c-v16-registry-labels"); return identities;
}
function staticIntake() {
  const candidateKeys = ["schema_version", "status", "execution_authorized", "container_create_authorized", "container_execute_authorized", "formal_go", "docker_or_database_command_executed", "runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256"];
  const candidate = sealedJson(fixed.candidate, candidateKeys, "b2c-v16-candidate-schema"); exactString(candidate.value.schema_version, "b2c-v16-candidate-authority-v1", "b2c-v16-candidate-schema"); exactString(candidate.value.status, "PENDING_REVIEW", "b2c-v16-candidate-status");
  for (const key of ["execution_authorized", "container_create_authorized", "container_execute_authorized", "formal_go", "docker_or_database_command_executed"]) exactBoolean(candidate.value[key], false, `b2c-v16-candidate-flag:${key}`);
  for (const key of ["runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256"]) assertHash(candidate.value[key], `b2c-v16-candidate-hash:${key}`);
  const live = { runner_raw_sha256: sha(sealed(fixed.runner)), runner_spec_raw_sha256: sha(sealed(fixed.spec)), registry_raw_sha256: sha(sealed(fixed.registry)), static_test_record_raw_sha256: sha(sealed(fixed.staticRecord)), node22_tap_raw_sha256: sha(sealed(fixed.node22Tap)), node24_tap_raw_sha256: sha(sealed(fixed.node24Tap)) };
  for (const [key, value] of Object.entries(live)) if (candidate.value[key] !== value) throw new Error(`b2c-v16-live-byte-drift:${key}`);
  const manifestKeys = ["schema_version", "status", "candidate_flags", "candidate_authority_raw_sha256", "runner_raw_sha256", "runner_spec_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", "review_chain", "canonical_paths", "trust_root"];
  const manifest = sealedJson(fixed.manifest, manifestKeys, "b2c-v16-manifest-schema"); exactString(manifest.value.schema_version, "b2c-v16-candidate-manifest-v1", "b2c-v16-manifest-schema"); exactString(manifest.value.status, "PENDING_REVIEW", "b2c-v16-manifest-status");
  exactObject(manifest.value.candidate_flags, ["container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go"], "b2c-v16-manifest-flags"); for (const value of Object.values(manifest.value.candidate_flags)) exactBoolean(value, false, "b2c-v16-manifest-flags");
  const expectedHashes = { candidate_authority_raw_sha256: candidate.rawSha256, ...live }; for (const [key, value] of Object.entries(expectedHashes)) if (manifest.value[key] !== value) throw new Error(`b2c-v16-manifest-binding:${key}`);
  if (!same(manifest.value.review_chain, ["candidate", "database", "qa", "security", "drain", "provision_authority", "resource_observation", "execution_authority"])) throw new Error("b2c-v16-review-chain");
  exactObject(manifest.value.canonical_paths, Object.keys(fixed).filter((key) => !["runner", "spec", "evidence"].includes(key)), "b2c-v16-canonical-paths"); for (const key of Object.keys(manifest.value.canonical_paths)) exactString(manifest.value.canonical_paths[key], fixed[key].slice(root.length + 1), `b2c-v16-canonical-path:${key}`);
  exactString(manifest.value.trust_root, "repository-fixed-path-procedural-root-v1", "b2c-v16-trust-root");
  const record = sealedJson(fixed.staticRecord, ["schema_version", "runner_raw_sha256", "test_raw_sha256", "node22", "node24", "docker_or_database_command_executed", "coverage"], "b2c-v16-static-record-schema"); exactString(record.value.schema_version, "b2c-v16-static-test-record-v1", "b2c-v16-static-record-schema"); exactBoolean(record.value.docker_or_database_command_executed, false, "b2c-v16-static-record-command");
  if (record.value.runner_raw_sha256 !== live.runner_raw_sha256 || record.value.test_raw_sha256 !== live.runner_spec_raw_sha256) throw new Error("b2c-v16-static-record-binding");
  for (const [key, tapKey] of [["node22", "node22_tap_raw_sha256"], ["node24", "node24_tap_raw_sha256"]]) { exactObject(record.value[key], ["binary", "result", "raw_tap_sha256"], "b2c-v16-static-record-node"); if (typeof record.value[key].binary !== "string" || record.value[key].result !== "pass" || record.value[key].raw_tap_sha256 !== live[tapKey]) throw new Error("b2c-v16-static-record-node"); }
  if (!Array.isArray(record.value.coverage) || record.value.coverage.some((item) => typeof item !== "string")) throw new Error("b2c-v16-static-record-coverage");
  const registry = sealedJson(fixed.registry, ["schema_version", "resources"], "b2c-v16-registry-schema"); const prohibited = validateRegistry(registry.value);
  return Object.freeze({ candidateSha: candidate.rawSha256, manifestSha: manifest.rawSha256, registrySha: registry.rawSha256, staticRecordSha: record.rawSha256, tap22Sha: live.node22_tap_raw_sha256, tap24Sha: live.node24_tap_raw_sha256, prohibited });
}
function reviewIntake(base) {
  const hashes = {}; let prior = {};
  const schema = { databaseReview: "b2c-v16-independent-database-review-v1", qaReview: "b2c-v16-independent-qa-review-v1", securityReview: "b2c-v16-independent-security-review-v1", drainReview: "b2c-v16-independent-old-writer-drain-review-v1" };
  for (const key of reviewOrder) {
    const priorKeys = Object.keys(prior); const keys = ["schema_version", "decision", "review_approved", "open_p0", "open_p1", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "registry_raw_sha256", "static_test_record_raw_sha256", "node22_tap_raw_sha256", "node24_tap_raw_sha256", ...priorKeys];
    const review = sealedJson(fixed[key], keys, `b2c-v16-${key}-schema`); exactString(review.value.schema_version, schema[key], `b2c-v16-${key}-schema`); exactString(review.value.decision, "GO", `b2c-v16-${key}-decision`); exactBoolean(review.value.review_approved, true, `b2c-v16-${key}-approved`); exactZero(review.value.open_p0, `b2c-v16-${key}-p0`); exactZero(review.value.open_p1, `b2c-v16-${key}-p1`);
    const expected = { candidate_authority_raw_sha256: base.candidateSha, candidate_manifest_raw_sha256: base.manifestSha, registry_raw_sha256: base.registrySha, static_test_record_raw_sha256: base.staticRecordSha, node22_tap_raw_sha256: base.tap22Sha, node24_tap_raw_sha256: base.tap24Sha, ...prior };
    for (const [field, value] of Object.entries(expected)) if (review.value[field] !== value) throw new Error(`b2c-v16-${key}-binding:${field}`);
    hashes[key] = review.rawSha256; prior = { ...prior, [`${key.replace("Review", "_review")}_raw_sha256`]: review.rawSha256 };
  }
  return Object.freeze(hashes);
}
function provisionIntake() {
  const base = staticIntake(), reviews = reviewIntake(base);
  const keys = ["schema_version", "status", "container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "database_review_raw_sha256", "qa_review_raw_sha256", "security_review_raw_sha256", "drain_review_raw_sha256", "run_id", "container", "database", "image_reference", "host_port_bindings", "anonymous_volume", "mount_type", "mount_rw", "mount_destination"];
  const authority = sealedJson(fixed.provisionAuthority, keys, "b2c-v16-provision-schema"); exactString(authority.value.schema_version, "b2c-v16-provision-authority-v1", "b2c-v16-provision-schema"); exactString(authority.value.status, "AUTHORIZED", "b2c-v16-provision-status"); exactBoolean(authority.value.container_create_authorized, true, "b2c-v16-provision-create"); for (const key of ["container_execute_authorized", "execution_authorized", "formal_go"]) exactBoolean(authority.value[key], false, `b2c-v16-provision-flag:${key}`);
  const bindings = { candidate_authority_raw_sha256: base.candidateSha, candidate_manifest_raw_sha256: base.manifestSha, database_review_raw_sha256: reviews.databaseReview, qa_review_raw_sha256: reviews.qaReview, security_review_raw_sha256: reviews.securityReview, drain_review_raw_sha256: reviews.drainReview }; for (const [key, value] of Object.entries(bindings)) if (authority.value[key] !== value) throw new Error(`b2c-v16-provision-binding:${key}`);
  if (!runIdPattern.test(authority.value.run_id) || !containerPattern.test(authority.value.container) || !databasePattern.test(authority.value.database)) throw new Error("b2c-v16-provision-identity"); exactString(authority.value.image_reference, "postgres:16-alpine", "b2c-v16-provision-image"); exactZero(authority.value.host_port_bindings, "b2c-v16-provision-ports"); exactBoolean(authority.value.anonymous_volume, true, "b2c-v16-provision-volume"); exactString(authority.value.mount_type, "volume", "b2c-v16-provision-mount"); exactBoolean(authority.value.mount_rw, true, "b2c-v16-provision-mount"); exactString(authority.value.mount_destination, "/var/lib/postgresql/data", "b2c-v16-provision-mount");
  for (const identity of [authority.value.run_id, authority.value.container, authority.value.database, authority.value.image_reference]) if (base.prohibited.has(identity)) throw new Error("b2c-v16-prohibited-resource-reuse");
  return Object.freeze({ base, reviews, authority: authority.value, authoritySha: authority.rawSha256 });
}
function inspect(command, target, runCommand, expectedLabels) {
  const result = runCommand("/usr/bin/docker", ["inspect", "--format", "{{.Id}}\\n{{.State.Running}}\\n{{.Image}}\\n{{json .HostConfig.PortBindings}}\\n{{json .Mounts}}\\n{{json .Config.Labels}}", target.container], { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input: "", encoding: "utf8" });
  if (result.error || result.signal || result.status !== 0) throw new Error(`b2c-v16-${command}-inspect-child`); const rows = String(result.stdout ?? "").trim().split("\n"), mounts = JSON.parse(rows[4] ?? "null");
  const labels = JSON.parse(rows[5] ?? "null");
  if (rows.length !== 6 || !hex64.test(rows[0] ?? "") || rows[1] !== "true" || !/^sha256:[0-9a-f]{64}$/u.test(rows[2] ?? "") || !same(JSON.parse(rows[3] ?? "null"), {}) || !Array.isArray(mounts) || mounts.length !== 1 || mounts[0]?.Type !== "volume" || !hex64.test(mounts[0]?.Name ?? "") || mounts[0]?.RW !== true || mounts[0]?.Destination !== "/var/lib/postgresql/data") throw new Error(`b2c-v16-${command}-identity-drift`);
  const authorityKeys = ["jinhu.b2c.run_id", "jinhu.b2c.provision_authority_sha256"], inheritedKey = "desktop.docker.io/wsl-distro", keys = Object.keys(labels ?? {}).sort(); if (!same(keys, authorityKeys.sort()) && !same(keys, [...authorityKeys, inheritedKey].sort())) throw new Error(`b2c-v16-${command}-labels`); if (labels["jinhu.b2c.run_id"] !== expectedLabels.run_id || labels["jinhu.b2c.provision_authority_sha256"] !== expectedLabels.provision_authority_sha256) throw new Error(`b2c-v16-${command}-labels`);
  const inherited_labels = {}; if (Object.hasOwn(labels, inheritedKey)) { if (typeof labels[inheritedKey] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(labels[inheritedKey])) throw new Error(`b2c-v16-${command}-inherited-label`); inherited_labels[inheritedKey] = labels[inheritedKey]; } if (expectedLabels.inherited_labels !== undefined && !same(inherited_labels, expectedLabels.inherited_labels)) throw new Error(`b2c-v16-${command}-inherited-label-drift`);
  return { container_id: rows[0], image_id: rows[2].slice(7), volume_id: mounts[0].Name, inherited_labels };
}
function writeSealed(path, value) { if (!path.startsWith(`${research}${sep}`) || existsSync(path) || lstatSync(dirname(path)).isSymbolicLink() || realpathSync(dirname(path)) !== dirname(path)) throw new Error("b2c-v16-output-path"); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o444 }); chmodSync(path, 0o444); }

function provisionWithV16(runCommand) {
  const intake = provisionIntake(), intent = intake.authority;
  let createdId = "";
  try {
    const created = runCommand("/usr/bin/docker", ["run", "--detach", "--name", intent.container, "--label", `jinhu.b2c.run_id=${intent.run_id}`, "--label", `jinhu.b2c.provision_authority_sha256=${intake.authoritySha}`, "--mount", "type=volume,destination=/var/lib/postgresql/data", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", `POSTGRES_DB=${intent.database}`, intent.image_reference], { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input: "", encoding: "utf8" });
    createdId = String(created.stdout ?? "").trim(); if (created.error || created.signal || created.status !== 0 || !hex64.test(createdId)) throw new Error("b2c-v16-provision-child");
    const labels = { run_id: intent.run_id, provision_authority_sha256: intake.authoritySha }; const actual = inspect("provision", { container: intent.container }, runCommand, labels); if (actual.container_id !== createdId) throw new Error("b2c-v16-provision-container-id");
    const observation = { schema_version: "b2c-v16-resource-observation-v1", status: "OBSERVED", execution_authorized: false, formal_go: false, provision_authority_raw_sha256: intake.authoritySha, candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, run_id: intent.run_id, container: intent.container, container_id: actual.container_id, database: intent.database, volume_id: actual.volume_id, image_id: actual.image_id, image_reference: intent.image_reference, host_port_bindings: 0, anonymous_volume: true, mount_type: "volume", mount_rw: true, mount_destination: "/var/lib/postgresql/data", labels, inherited_labels: actual.inherited_labels };
    writeSealed(fixed.observation, observation); return Object.freeze({ observation, observation_raw_sha256: sha(sealed(fixed.observation)) });
  } catch (error) {
    if (createdId && !existsSync(fixed.observation)) writeSealed(fixed.observation, { schema_version: "b2c-v16-provision-failure-v1", status: "PROVISION_FAILED", run_id: intent.run_id, container: intent.container, database: intent.database, container_id: createdId, provision_authority_raw_sha256: intake.authoritySha, run_id_reusable: false, cleanup_attempted: false, failure: { code: "B2C_V16_PROVISION_OBSERVATION_FAILED", stage: "post-create-observation", name: "ProvisionObservationError" } });
    throw error;
  }
}

/** Formal phase one API: no caller-controlled command, path, hash, target, run ID, or evidence option. */
export function provisionV16() { return provisionWithV16(spawnSync); }

function executionIntake() {
  const intake = provisionIntake();
  const observationKeys = ["schema_version", "status", "execution_authorized", "formal_go", "provision_authority_raw_sha256", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "run_id", "container", "container_id", "database", "volume_id", "image_id", "image_reference", "host_port_bindings", "anonymous_volume", "mount_type", "mount_rw", "mount_destination", "labels", "inherited_labels"];
  const observation = sealedJson(fixed.observation, observationKeys, "b2c-v16-observation-schema"); exactString(observation.value.schema_version, "b2c-v16-resource-observation-v1", "b2c-v16-observation-schema"); exactString(observation.value.status, "OBSERVED", "b2c-v16-observation-status"); exactBoolean(observation.value.execution_authorized, false, "b2c-v16-observation-execute"); exactBoolean(observation.value.formal_go, false, "b2c-v16-observation-formal");
  const expectedObservation = { provision_authority_raw_sha256: intake.authoritySha, candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, run_id: intake.authority.run_id, container: intake.authority.container, database: intake.authority.database, image_reference: "postgres:16-alpine", host_port_bindings: 0, anonymous_volume: true, mount_type: "volume", mount_rw: true, mount_destination: "/var/lib/postgresql/data" }; for (const [key, value] of Object.entries(expectedObservation)) if (!Object.is(observation.value[key], value)) throw new Error(`b2c-v16-observation-binding:${key}`); exactObject(observation.value.labels, ["run_id", "provision_authority_sha256"], "b2c-v16-observation-labels"); if (observation.value.labels.run_id !== observation.value.run_id || observation.value.labels.provision_authority_sha256 !== intake.authoritySha) throw new Error("b2c-v16-observation-labels"); exactObject(observation.value.inherited_labels, Object.keys(observation.value.inherited_labels), "b2c-v16-observation-inherited-labels"); const inheritedKeys = Object.keys(observation.value.inherited_labels); if (inheritedKeys.length > 1 || (inheritedKeys.length === 1 && (inheritedKeys[0] !== "desktop.docker.io/wsl-distro" || typeof observation.value.inherited_labels[inheritedKeys[0]] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(observation.value.inherited_labels[inheritedKeys[0]])))) throw new Error("b2c-v16-observation-inherited-labels"); for (const key of ["container_id", "volume_id", "image_id"]) assertHash(observation.value[key], `b2c-v16-observation-identity:${key}`); for (const identity of [observation.value.run_id, observation.value.container, observation.value.container_id, observation.value.database, observation.value.volume_id, observation.value.image_id]) if (intake.base.prohibited.has(identity)) throw new Error("b2c-v16-prohibited-resource-reuse");
  const executionKeys = ["schema_version", "status", "container_create_authorized", "container_execute_authorized", "execution_authorized", "formal_go", "candidate_authority_raw_sha256", "candidate_manifest_raw_sha256", "database_review_raw_sha256", "qa_review_raw_sha256", "security_review_raw_sha256", "drain_review_raw_sha256", "provision_authority_raw_sha256", "resource_observation_raw_sha256", "run_id", "container", "container_id", "database", "volume_id", "image_id"];
  const authority = sealedJson(fixed.executionAuthority, executionKeys, "b2c-v16-execution-schema"); exactString(authority.value.schema_version, "b2c-v16-execution-authority-v1", "b2c-v16-execution-schema"); exactString(authority.value.status, "AUTHORIZED", "b2c-v16-execution-status"); exactBoolean(authority.value.container_create_authorized, false, "b2c-v16-execution-create"); exactBoolean(authority.value.container_execute_authorized, true, "b2c-v16-execution-container"); exactBoolean(authority.value.execution_authorized, true, "b2c-v16-execution-authorized"); exactBoolean(authority.value.formal_go, false, "b2c-v16-execution-formal");
  const expectedAuthority = { candidate_authority_raw_sha256: intake.base.candidateSha, candidate_manifest_raw_sha256: intake.base.manifestSha, database_review_raw_sha256: intake.reviews.databaseReview, qa_review_raw_sha256: intake.reviews.qaReview, security_review_raw_sha256: intake.reviews.securityReview, drain_review_raw_sha256: intake.reviews.drainReview, provision_authority_raw_sha256: intake.authoritySha, resource_observation_raw_sha256: observation.rawSha256, run_id: observation.value.run_id, container: observation.value.container, container_id: observation.value.container_id, database: observation.value.database, volume_id: observation.value.volume_id, image_id: observation.value.image_id }; for (const [key, value] of Object.entries(expectedAuthority)) if (authority.value[key] !== value) throw new Error(`b2c-v16-execution-binding:${key}`);
  return Object.freeze({ target: observation.value, authoritySha: authority.rawSha256, observationSha: observation.rawSha256, plan: baselinePlan() });
}

const expectedLate = () => baselinePlan().filter(({ filename }) => Number(filename.slice(0, 6)) >= 185).map(({ filename, raw_sha256 }) => ({ filename, raw_sha256, status: "succeeded" }));
export function assertSnapshotV16(value) {
  exactObject(value, ["primary_history", "mirror_history", "forbidden_primary", "forbidden_mirror", "approval_rows", "keys", "indexdef", "predicate", "catalog"], "b2c-v16-snapshot-schema");
  const late = expectedLate(); if (!same(value.primary_history, late) || !same(value.mirror_history, late)) throw new Error("b2c-v16-snapshot-history"); for (const key of ["forbidden_primary", "forbidden_mirror", "approval_rows"]) exactZero(value[key], `b2c-v16-snapshot-zero:${key}`); if (!same(value.keys, ["tenant_id", "park_id", "action_id", "source_type", "source_id", "source_expected_version"]) || value.indexdef !== OLD_INDEX_SHA || value.predicate !== OLD_PREDICATE_SHA) throw new Error("b2c-v16-snapshot-contract"); exactObject(value.catalog, ["index_exists", "build_residue"], "b2c-v16-snapshot-catalog"); exactBoolean(value.catalog.index_exists, true, "b2c-v16-snapshot-index"); exactBoolean(value.catalog.build_residue, false, "b2c-v16-snapshot-residue"); return true;
}
export function assertFaultMarkerV16(output, marker) { const lines = String(output).split(/\r?\n/u).filter((line) => /^ERROR:\s+P0001:/u.test(line)); const match = lines.length === 1 ? lines[0].match(/^ERROR:\s+P0001:\s*([^\s].*?)\s*$/u) : null; if (!match || match[1] !== marker || !/^v16-injected-(before-create|after-create|after-drop|before-rename)$/u.test(marker)) throw new Error("b2c-v16-fault-marker"); }
const snapshotSql = (late) => { const listed = late.map(({ filename }) => `'${filename}'`).join(","); return `SELECT json_build_object('primary_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.sys_schema_migration_history WHERE filename=ANY(ARRAY[${listed}])), 'mirror_history',(SELECT coalesce(json_agg(json_build_object('filename',filename,'raw_sha256',checksum,'status',status) ORDER BY filename),'[]'::json) FROM public.schema_migrations WHERE filename=ANY(ARRAY[${listed}])), 'forbidden_primary',(SELECT count(*) FROM public.sys_schema_migration_history WHERE filename ~ '^000(191|192|197)_'), 'forbidden_mirror',(SELECT count(*) FROM public.schema_migrations WHERE filename ~ '^000(191|192|197)_'), 'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request), 'keys',(SELECT array_agg(a.attname ORDER BY k.ordinal) FROM pg_index i JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinal) ON true JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'indexdef',(SELECT encode(public.digest(convert_to(pg_get_indexdef(indexrelid),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'predicate',(SELECT encode(public.digest(convert_to(pg_get_expr(indpred,indrelid,false),'UTF8'),'sha256'),'hex') FROM pg_index WHERE indexrelid='public.uq_biz_property_approval_request_active_source'::regclass), 'catalog',(SELECT json_build_object('index_exists',to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL,'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)))::text;`; };
const bootstrap = "CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (id bigserial PRIMARY KEY,filename varchar(255) NOT NULL UNIQUE,checksum varchar(64) NOT NULL,status varchar(16) NOT NULL,started_at timestamptz NOT NULL,finished_at timestamptz,executed_by varchar(255) NOT NULL,batch_id varchar(32) NOT NULL); CREATE TABLE IF NOT EXISTS public.schema_migrations (LIKE public.sys_schema_migration_history INCLUDING ALL);";
const history = (entry) => `INSERT INTO public.sys_schema_migration_history(filename,checksum,status,started_at,finished_at,executed_by,batch_id)VALUES('${entry.filename}','${entry.raw_sha256}','succeeded',clock_timestamp(),clock_timestamp(),'b2c-v16','v16'); INSERT INTO public.schema_migrations(filename,checksum,status,started_at,finished_at,executed_by,batch_id) SELECT filename,checksum,status,started_at,finished_at,executed_by,batch_id FROM public.sys_schema_migration_history WHERE filename='${entry.filename}';`;
const createBuildIndex = `CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build ON public.biz_property_approval_request (tenant_id, park_id, action_id, source_type, source_id, source_expected_version) WHERE (decision_status IN ('draft', 'submitted', 'pending_approval') OR (decision_status = 'approved' AND execution_status IN ('not_started', 'executing', 'retry_wait', 'infra_exhausted')));`;
function catalogAssertion(oldPresent, buildPresent) {
  const old = oldPresent ? `IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NULL THEN RAISE EXCEPTION 'old index missing'; END IF; SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') INTO actual_index,actual_predicate FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass; IF actual_index<>'${OLD_INDEX_SHA}' OR actual_predicate<>'${OLD_PREDICATE_SHA}' THEN RAISE EXCEPTION 'old catalog drift'; END IF;` : "IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL THEN RAISE EXCEPTION 'old index still present'; END IF;";
  const build = buildPresent ? "IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NULL THEN RAISE EXCEPTION 'build index missing'; END IF; SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex') INTO actual_index,actual_predicate FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source_v2_build'::regclass; IF actual_index<>'dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c' OR actual_predicate<>'24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda' THEN RAISE EXCEPTION 'build catalog drift'; END IF;" : "IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL THEN RAISE EXCEPTION 'unexpected build index'; END IF;";
  return `DO $assert$ DECLARE actual_index text; actual_predicate text; BEGIN ${old} ${build} END $assert$;`;
}
const faults = Object.freeze([
  { boundary: "before-create", prefix: "", assertion: catalogAssertion(true, false), marker: "v16-injected-before-create" },
  { boundary: "after-create", prefix: createBuildIndex, assertion: catalogAssertion(true, true), marker: "v16-injected-after-create" },
  { boundary: "after-drop", prefix: `${createBuildIndex} DROP INDEX public.uq_biz_property_approval_request_active_source;`, assertion: catalogAssertion(false, true), marker: "v16-injected-after-drop" },
  { boundary: "before-rename", prefix: `${createBuildIndex} DROP INDEX public.uq_biz_property_approval_request_active_source;`, assertion: catalogAssertion(false, true), marker: "v16-injected-before-rename" },
].map(Object.freeze));
const faultSql = ({ marker, prefix, assertion }) => `BEGIN; LOCK TABLE public.biz_property_approval_request IN SHARE MODE; ${prefix} ${assertion} DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`;

class Evidence {
  constructor(runId) { this.path = fixed.evidence; this.runId = runId; this.sequence = 0; if (existsSync(this.path) || lstatSync(dirname(this.path)).isSymbolicLink()) throw new Error("b2c-v16-evidence-root"); mkdirSync(this.path, { recursive: false, mode: 0o700 }); chmodSync(this.path, 0o700); }
  write(name, body) { const path = resolve(this.path, name); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { flag: "wx", mode: 0o444 }); chmodSync(path, 0o444); }
  child(name, command, argv, input, run, allowFailure = false) { const id = stage(name), number = String(++this.sequence).padStart(3, "0"); this.write(`${number}-${id}-intent.json`, { schema_version: "b2c-v16-child-intent-v1", run_id: this.runId, stage: id, command, argv, stdin: { bytes: Buffer.byteLength(input), raw_sha256: sha(input), persisted: false } }); const raw = run(command, argv, { cwd: root, env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` }, input, encoding: "utf8" }); const stdout = String(raw.stdout ?? ""), stderr = String(raw.stderr ?? ""); this.write(`${number}-${id}-result.json`, { schema_version: "b2c-v16-child-result-v1", run_id: this.runId, stage: id, exit_code: raw.status ?? null, signal: raw.signal ?? null, spawn_error: raw.error ? { code: "B2C_V16_CHILD_SPAWN_FAILED", stage: id, name: "ChildSpawnError" } : null, stdout: { bytes: Buffer.byteLength(stdout), raw_sha256: sha(stdout), safe_excerpt: "<suppressed>" }, stderr: { bytes: Buffer.byteLength(stderr), raw_sha256: sha(stderr), safe_excerpt: "<suppressed>" } }); if (raw.error || raw.signal || (!allowFailure && raw.status !== 0)) { const error = new Error(`b2c-v16-child:${id}`); error.stage = id; throw error; } return { ...raw, stdout, stderr }; }
  terminal(kind, body, provenance) { this.write(`${kind}-${this.runId}.json`, { schema_version: "b2c-v16-terminal-v1", run_id: this.runId, status: kind.toUpperCase(), run_id_reusable: false, retry_attempted: false, cleanup_attempted: false, authority_provenance: provenance, ...body }); const files = readdirSync(this.path).sort().map((filename) => ({ filename, bytes: statSync(resolve(this.path, filename)).size, mode: "0444", raw_sha256: sha(readFileSync(resolve(this.path, filename))) })); this.write(`${kind}-${this.runId}.manifest.json`, { schema_version: "b2c-v16-evidence-manifest-v1", run_id: this.runId, status: kind.toUpperCase(), authority_provenance: provenance, files }); }
}
function psql(evidence, target, name, input, run, allowFailure = false) { return evidence.child(name, "/usr/bin/docker", ["exec", "--interactive", target.container, "psql", "--username", "postgres", "--dbname", target.database, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--file", "-"], input, run, allowFailure); }

function executeWithV16(runCommand) {
  const intake = executionIntake(), target = intake.target, evidence = new Evidence(target.run_id), provenance = { resource_observation_raw_sha256: intake.observationSha, execution_authority_raw_sha256: intake.authoritySha };
  try {
    const actual = inspect("execute", target, (command, argv, options) => evidence.child("inspect", command, argv, options.input, runCommand), { ...target.labels, inherited_labels: target.inherited_labels }); if (actual.container_id !== target.container_id || actual.volume_id !== target.volume_id || actual.image_id !== target.image_id) throw new Error("b2c-v16-execute-identity-drift");
    if (!/^16[0-9]{4}$/u.test(psql(evidence, target, "postgres-16", "SHOW server_version_num;", runCommand).stdout.trim())) throw new Error("b2c-v16-version-drift");
    const plan = intake.plan; for (const entry of plan.filter(({ filename }) => Number(filename.slice(0, 6)) < 185)) psql(evidence, target, `apply-${entry.filename}`, migrationBytesImmediatelyBeforeExecution(entry), runCommand); psql(evidence, target, "history-bootstrap", bootstrap, runCommand); for (const entry of plan.filter(({ filename }) => Number(filename.slice(0, 6)) >= 185)) { psql(evidence, target, `apply-${entry.filename}`, migrationBytesImmediatelyBeforeExecution(entry), runCommand); psql(evidence, target, `record-${entry.filename}`, history(entry), runCommand); }
    const sql = snapshotSql(expectedLate()), initial = JSON.parse(psql(evidence, target, "initial-snapshot", sql, runCommand).stdout.trim()); assertSnapshotV16(initial); const results = [];
    for (const fault of faults) { const before = JSON.parse(psql(evidence, target, `before-${fault.boundary}`, sql, runCommand).stdout.trim()); assertSnapshotV16(before); const failed = psql(evidence, target, `fault-${fault.boundary}`, faultSql(fault), runCommand, true); if (failed.status === 0) throw new Error(`b2c-v16-fault-success:${fault.boundary}`); assertFaultMarkerV16(`${failed.stdout}${failed.stderr}`, fault.marker); const after = JSON.parse(psql(evidence, target, `after-${fault.boundary}`, sql, runCommand).stdout.trim()); assertSnapshotV16(after); if (!same(before, after)) throw new Error(`b2c-v16-rollback-drift:${fault.boundary}`); results.push({ boundary: fault.boundary, marker: fault.marker, sqlstate: "P0001", snapshot_exact: true }); }
    const final = JSON.parse(psql(evidence, target, "final-snapshot", sql, runCommand).stdout.trim()); assertSnapshotV16(final); if (!same(initial, final)) throw new Error("b2c-v16-final-drift"); evidence.terminal("success", { direct_baseline: "000185-000195-original-bytes", faults: results }, provenance); return Object.freeze({ faults: results });
  } catch (error) { evidence.terminal("failure", { failure: { code: "B2C_V16_EXECUTION_FAILED", stage: "execution", name: "ExecutionError" } }, provenance); throw error; }
}

/** Formal phase two API: no caller-controlled command, path, hash, target, run ID, or evidence option. */
export function executeV16() { return executeWithV16(spawnSync); }

/** Test-only facade. It has no path parameter and is unavailable from the canonical repository root. */
export function createIsolatedV16TestHarness(runCommand) {
  if (typeof runCommand !== "function" || !/^\/tmp\/b2c-v16-test-[^/]+$/u.test(root) || realpathSync(root) !== root || !research.startsWith(`${root}${sep}`)) throw new Error("b2c-v16-test-harness-root");
  return Object.freeze({ provision: () => provisionWithV16(runCommand), execute: () => executeWithV16(runCommand) });
}

export function candidateV16() { return Object.freeze({ status: "PENDING_REVIEW", execution_authorized: false, container_create_authorized: false, container_execute_authorized: false, formal_go: false, docker_or_database_command_executed: false, trust_root: "repository-fixed-path-procedural-root-v1", review_chain: ["candidate", "database", "qa", "security", "drain", "provision_authority", "resource_observation", "execution_authority"] }); }
