import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const expectedRunId = "b2c197_r0_20260802a";
const migrationFilename = "000197_property_approval_active_source_index_forward_fix.sql";
const migrationPath = resolve(root, "database/migrations", migrationFilename);
const runnerPath = resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs");
const staticTestPath = resolve(root, "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs");
const planPath = resolve(researchRoot, "b2c-approval-active-source-index-forward-fix-plan-20260802.md");
const r0Path = resolve(researchRoot, "b2c-000197-r0-reservation-candidate-20260802.grammar");
const r1Path = resolve(researchRoot, "b2c-000197-r1-v2-checksum-seal-20260802.grammar");
const manifestPath = resolve(researchRoot, "b2c-000197-v2-gate-input-manifest-20260802.grammar");
const expected = Object.freeze({
  r0: "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439",
  r1: "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b",
  migration: "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059",
  worktreeList: "b91aefedba5c860f934f801e0c2556ce2094a9a7b2a52a6d86787d2e46ee2521",
  worktreePrefixManifest: "226f6fdc9d9e633da53bf625b415684b0a5109eb6832fd46c5e1be1de6f9866d",
  plan: "2c4fefceca0b42307391793c173e2f9f90cdfec86da02be7517d1451898de141",
});
export const targets = Object.freeze([
  Object.freeze({ key: "a", topology: "upgrade-191-192-absent",
    container: "jinhu-b2c197-r0-20260802a-a", database: "jinhu_b2c197_a",
    containerId: "4f5aebe17beb468b9b376b0951e0693c7a8530aafa9329e7518d9a8795366212",
    volume: "8b96ecefbf8a1ee056379275728427fa41b1c1f6bef700671e512262f99a9d51" }),
  Object.freeze({ key: "b", topology: "fresh-current-chain",
    container: "jinhu-b2c197-r0-20260802a-b", database: "jinhu_b2c197_b",
    containerId: "cfe5297c06cdb33dfe1b5e8e31c5c9443771dc9619608ea761bbfe1caffe7434",
    volume: "1ace75aa84c9d96a4795ad32fc3b700a851895ff1671dd759b001ef53e290967" }),
]);
const expectedImageId = "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";
const expectedPgVersion = "16.14";
const reviewerAuthorities = new Set([
  "independent-database-reviewer", "independent-qa-security-reviewer",
]);

export const scenarios = Object.freeze([
  "01-fresh-final-ordered-catalog", "02-upgrade-191-192-absent",
  "03-upgrade-191-192-present-exact", "04-old-new-rerun-and-catalog-drift",
  "05-active-and-terminal-combination-matrix", "06-active-unique-and-terminal-exclusion",
  "07-application-terminal-version-monotonicity-and-concurrency",
  "08-four-point-failure-injection-transactional-restore", "09-immediate-identical-byte-rerun",
  "10-old-writer-drain-and-new-writer-smoke", "11-dual-history-single-success-row-and-file-checksum",
  "12-history-matrix-and-runner-warning-bypass-prevention",
  "13-r0-r1-file-tamper-and-same-checksum-failed-retry",
  "14-later-191-192-application-preserves-index-and-data",
  "15-exact-dedicated-resource-cleanup-after-evidence",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isLowerSha = (value) => /^[0-9a-f]{64}$/.test(value ?? "");

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { cwd: root, encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`b2c-000197-command-failed:${commandName}:${result.error?.message ?? result.stderr}`);
  }
  return result.stdout;
}

function parseGrammar(bytes) {
  const lines = bytes.trimEnd().split("\n");
  const schema = lines.shift();
  const fields = new Map();
  for (const line of lines) {
    const separator = line.indexOf("\t");
    if (separator < 1) throw new Error("b2c-000197-review-artifact-malformed");
    const key = line.slice(0, separator);
    if (fields.has(key)) throw new Error(`b2c-000197-review-artifact-duplicate-key:${key}`);
    fields.set(key, line.slice(separator + 1));
  }
  return { schema, fields };
}

export function validateFailedRetryReview({ path, rawSha, target }) {
  if (!path || !isLowerSha(rawSha)) throw new Error("b2c-000197-failed-review-path-sha-required");
  const absolute = resolve(root, path);
  if (dirname(absolute) !== researchRoot || !existsSync(absolute) || lstatSync(absolute).isSymbolicLink()
      || realpathSync(absolute) !== absolute) {
    throw new Error("b2c-000197-failed-review-path-not-immutable-research-child");
  }
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== rawSha) throw new Error("b2c-000197-failed-review-raw-sha-mismatch");
  const { schema, fields } = parseGrammar(bytes.toString("utf8"));
  const exactTarget = `${target.container}|${target.database}|${target.containerId}`;
  if (schema !== "b2c-000197-failed-retry-independent-review-v1"
      || fields.get("run_id") !== expectedRunId
      || fields.get("r0_raw_sha256") !== expected.r0
      || fields.get("r1_raw_sha256") !== expected.r1
      || fields.get("migration_raw_sha256") !== expected.migration
      || !reviewerAuthorities.has(fields.get("reviewer_authority"))
      || fields.get("decision") !== "GO"
      || !new Set(["authorized-old-index", "exact-new-index"]).has(fields.get("corrected_catalog_decision"))
      || fields.get("target") !== exactTarget) {
    throw new Error("b2c-000197-failed-review-authority-or-decision-drift");
  }
  return { path: absolute, raw_sha256: rawSha, reviewer: fields.get("reviewer_authority"),
    catalog: fields.get("corrected_catalog_decision"), target: exactTarget };
}

export function classifyHistoryRows(primaryRows, standardRows, options = {}) {
  const prefix = /^000197_/;
  const primary = primaryRows.filter((row) => prefix.test(row.filename));
  const standard = standardRows.filter((row) => prefix.test(row.filename));
  const all = [...primary, ...standard];
  if (all.some((row) => row.filename !== migrationFilename)) {
    throw new Error("b2c-000197-history-unknown-prefix-hard-fail");
  }
  if (primary.length > 1 || standard.length > 1) {
    throw new Error("b2c-000197-history-duplicate-prefix-hard-fail");
  }
  if (primary.length === 0 && standard.length === 0) return { decision: "execute", state: "dual-absent" };
  if (primary.length !== 1 || standard.length !== 1) {
    throw new Error("b2c-000197-history-single-sided-hard-fail");
  }
  const [p] = primary; const [s] = standard;
  if (p.filename !== s.filename || p.checksum !== s.checksum || p.status !== s.status) {
    throw new Error("b2c-000197-history-mismatch-hard-fail");
  }
  if (p.checksum !== expected.migration) throw new Error("b2c-000197-history-checksum-hard-fail");
  if (p.status === "succeeded") return { decision: "skip-and-verify", state: "dual-succeeded" };
  if (p.status === "running") throw new Error("b2c-000197-history-running-hard-fail");
  if (p.status === "failed") {
    const review = validateFailedRetryReview(options.failedRetryReview ?? {});
    return { decision: "retry-identical-bytes", state: "dual-failed-reviewed", review };
  }
  throw new Error("b2c-000197-history-unknown-status-hard-fail");
}

function assertHashChain() {
  const observed = { r0: sha256(readFileSync(r0Path)), r1: sha256(readFileSync(r1Path)),
    migration: sha256(readFileSync(migrationPath)) };
  for (const key of Object.keys(observed)) if (observed[key] !== expected[key]) {
    throw new Error(`b2c-000197-hash-chain-drift:${key}`);
  }
  const r1 = readFileSync(r1Path, "utf8");
  if (!r1.includes(`r0_raw_sha256\t${expected.r0}`)
      || !r1.includes(`migration_raw_sha256\t${expected.migration}`)
      || !r1.includes("execution_authorized\tfalse-until-v2-sql-r1-two-independent-go")) {
    throw new Error("b2c-000197-r1-chain-content-drift");
  }
  return observed;
}

function worktreeScan() {
  const porcelain = command("git", ["worktree", "list", "--porcelain"]);
  if (sha256(porcelain) !== expected.worktreeList) throw new Error("b2c-000197-worktree-list-drift");
  const worktrees = porcelain.split("\n").filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice(9));
  const entries = [];
  for (const worktree of worktrees) {
    const directory = resolve(worktree, "database/migrations");
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory).filter((value) => /^000197_/.test(value)).sort()) {
      const path = resolve(directory, name); const bytes = readFileSync(path);
      entries.push(`${path}\t${bytes.length}\t${sha256(bytes)}\n`);
    }
  }
  entries.sort();
  const grammar = entries.join("");
  if (sha256(grammar) !== expected.worktreePrefixManifest
      || entries.length !== 1
      || !entries[0].endsWith(`${migrationFilename}\t10515\t${expected.migration}\n`)) {
    throw new Error("b2c-000197-repo-worktree-prefix-scan-drift");
  }
  return { worktree_list_sha256: sha256(porcelain), prefix_manifest_sha256: sha256(grammar), entries };
}

function assertManifest() {
  const bytes = readFileSync(manifestPath); const text = bytes.toString("utf8");
  const required = [
    [migrationPath, expected.migration], [r0Path, expected.r0], [r1Path, expected.r1],
    [runnerPath, sha256(readFileSync(runnerPath))], [staticTestPath, sha256(readFileSync(staticTestPath))],
    [planPath, expected.plan],
  ];
  for (const [path, hash] of required) {
    const relative = path.slice(root.length + 1);
    if (!text.split("\n").some((line) => line.startsWith(`file\t${relative}\t`) && line.endsWith(`\t${hash}`))) {
      throw new Error(`b2c-000197-manifest-file-drift:${relative}`);
    }
  }
  if (!text.includes(`worktree_list_sha256\t${expected.worktreeList}`)
      || !text.includes(`worktree_000197_prefix_manifest_sha256\t${expected.worktreePrefixManifest}`)) {
    throw new Error("b2c-000197-manifest-worktree-scan-drift");
  }
  for (const target of targets) {
    const resource = `resource\t${target.key}\t${target.container}\t${target.containerId}\t${target.database}\t${target.volume}\t${expectedImageId}\t${expectedPgVersion}`;
    if (!text.split("\n").includes(resource)) {
      throw new Error(`b2c-000197-manifest-resource-drift:${target.key}`);
    }
  }
  return { path: manifestPath, bytes: bytes.length, raw_sha256: sha256(bytes) };
}

export function validateTargetIdentity(target, inspect, observed) {
  const mounts = inspect.Mounts.filter((mount) => mount.Destination === "/var/lib/postgresql/data");
  if (inspect.Id !== target.containerId || inspect.Name !== `/${target.container}`
      || inspect.Config.Image !== "postgres:16-alpine" || inspect.Image !== expectedImageId
      || inspect.State.Running !== true || mounts.length !== 1 || mounts[0].Type !== "volume"
      || mounts[0].Name !== target.volume || mounts[0].Destination !== "/var/lib/postgresql/data"
      || !inspect.Config.Env.includes(`POSTGRES_DB=${target.database}`)) {
    throw new Error(`b2c-000197-resource-identity-drift:${target.key}`);
  }
  if (observed[0] !== target.database || observed[1] !== expectedPgVersion) {
    throw new Error(`b2c-000197-postgres-identity-drift:${target.key}`);
  }
  return { container_id: inspect.Id, name: inspect.Name, database: observed[0], volume: mounts[0].Name,
    image_id: inspect.Image, postgres_version: observed[1] };
}

function inspectTarget(target) {
  const inspect = JSON.parse(command("docker", ["inspect", target.container]))[0];
  const observed = dockerPsql(target, "SELECT current_database(),current_setting('server_version');")
    .trim().split("\t");
  return validateTargetIdentity(target, inspect, observed);
}

function dockerPsql(target, sql) {
  return command("docker", ["exec", "-i", target.container, "psql", "-X", "-qAt", "-F", "\t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database],
  { input: `\\set VERBOSITY verbose\n${sql}` });
}

function historyRows(target, table) {
  const output = dockerPsql(target,
    `SELECT filename,checksum,status FROM public.${table} WHERE filename LIKE '000197\\_%' ESCAPE '\\' ORDER BY filename;`);
  return output.trim() ? output.trimEnd().split("\n").map((line) => {
    const [filename, checksum, status] = line.split("\t"); return { filename, checksum, status };
  }) : [];
}

function failedReviewOptions(target) {
  return { failedRetryReview: { path: process.env[`B2C_000197_FAILED_RETRY_REVIEW_${target.key.toUpperCase()}_PATH`],
    rawSha: process.env[`B2C_000197_FAILED_RETRY_REVIEW_${target.key.toUpperCase()}_SHA`], target } };
}

function preflightOnly() {
  if (process.env.B2C_000197_GATE_RUN_ID !== expectedRunId) throw new Error("b2c-000197-run-id-mismatch");
  return { status: "preflight-only", candidate_admissible: false, execution_authorized: false,
    run_id: expectedRunId, hashes: assertHashChain(), manifest: assertManifest(), scan: worktreeScan(),
    targets: targets.map((target) => ({ ...target, identity: inspectTarget(target), history:
      classifyHistoryRows(historyRows(target, "sys_schema_migration_history"),
        historyRows(target, "schema_migrations"), failedReviewOptions(target)) })), scenarios };
}

function staticMode() {
  return { status: "static-ready-v2", candidate_admissible: false, execution_authorized: false,
    reason: "v2 SQL/R1 require two independent GO reviews before absent-path preliminary execution",
    run_id: expectedRunId, hashes: assertHashChain(), manifest: assertManifest(), scan: worktreeScan(),
    scenarios, deferred: ["01-fresh-final-ordered-catalog", "03-upgrade-191-192-present-exact",
      "14-later-191-192-application-preserves-index-and-data", "final-current-handoff"] };
}

function main() {
  if (process.env.B2C_000197_GATE_EXECUTE === "1") {
    throw new Error("b2c-000197-live-execution-locked-pending-v2-two-independent-go");
  }
  const result = process.env.B2C_000197_PREFLIGHT_ONLY === "1" ? preflightOnly() : staticMode();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
