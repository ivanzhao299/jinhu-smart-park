import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { V6_RUN_ID, executeWithEvidenceV6, parseTapV6 } from "./track-b2c-000197-preliminary-executor-v6.mjs";

const root = process.cwd(); const apiRoot = resolve(root, "apps/api");
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const manifestPath = resolve(research, "b2c-000197-preliminary-v6-input-manifest-20260802.grammar");
const handoffPath = resolve(research, "b2c-000197-preliminary-executor-v6-review-handoff-20260802.md");
const expected = Object.freeze({ runtime: "022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118",
  resource: "3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73",
  handoff: "e79639b00cbb70085d5977c6ce77d0a3f2ae828e00dfa467dba9336b6acde0b7",
  cli: "e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e",
  cliSpec: "58b7e8c011cb2ebc4acca91d813fc86931000574b434ffdb15b8579d0f79e42b",
  pgSpec: "2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613",
  oldIndex: "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
  oldPredicate: "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37" });
export const V6_TARGETS = Object.freeze([
  { key: "c", container: "jinhu-b2c197-prelim-20260802b-c",
    containerId: "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6",
    database: "jinhu_b2c197_c", volume: "60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12" },
  { key: "d", container: "jinhu-b2c197-prelim-20260802b-d",
    containerId: "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896",
    database: "jinhu_b2c197_d", volume: "7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5" },
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const childEnv = (extra = {}) => ({ PATH: process.env.PATH, ...extra });
const allow = (extra = []) => [{ name: "PATH", persist: "value" }, ...extra];
function exact(path, hash) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path
      || sha256(readFileSync(path)) !== hash) throw new Error(`v6-input:${path}`);
}
function inputs() {
  const migrations = readdirSync(resolve(root, "database/migrations")).filter((name) => name.startsWith("000197_"));
  if (migrations.length !== 1) throw new Error("v6-000197-prefix");
  for (const [path, hash] of [
    [resolve(research, "b2c-000197-preliminary-v3-resource-authority-20260802.grammar"), expected.resource],
    [resolve(research, "b2c-approval-port-runtime-implementation-v8-handoff.md"), expected.handoff],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-cli.ts"), expected.cli],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg-cli.spec.ts"), expected.cliSpec],
    [resolve(apiRoot, "src/modules/property-approvals/property-approval.port.pg.spec.ts"), expected.pgSpec],
  ]) exact(path, hash);
}

export function formalStaticV6(recorder) {
  const frozenEnv = childEnv({ B2C_000197_V6_STATIC_MODE: "frozen" });
  const frozenAllowlist = allow([{ name: "B2C_000197_V6_STATIC_MODE", persist: "value" }]);
  for (const [stage, cwd, args, count, env, envAllowlist] of [
    ["static-v6-evidence", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-executor-v6.spec.mjs"], 8, childEnv(), allow()],
    ["static-v6-orchestrator", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-preliminary-orchestrator-v6.spec.mjs"], 4, frozenEnv, frozenAllowlist],
    ["static-v6-closure", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-000197-frozen-closure-v6.spec.mjs"], 3, childEnv(), allow()],
    ["static-v6-contract", root, ["--test-reporter=tap", "scripts/e2e/property-remediation/tests/b2c-approval-index-forward-fix.spec.mjs"], 8, childEnv(), allow()],
    ["static-v6-lifecycle", apiRoot, ["--test-reporter=tap", "--require", "ts-node/register",
      "src/modules/property-approvals/property-approval.port.pg-cli.spec.ts"], 4, childEnv(), allow()],
  ]) recorder.runChild({ stage, command: process.execPath, args, cwd, env, envAllowlist,
    parser: (stdout) => parseTapV6(stdout, count) });
}

function psql(recorder, target, stage) {
  const sql = `SELECT json_build_object(
    'history_primary',(SELECT json_agg(filename) FROM public.sys_schema_migration_history WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
    'history_mirror',(SELECT json_agg(filename) FROM public.schema_migrations WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
    'approval_rows',(SELECT count(*) FROM public.biz_property_approval_request),
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`;
  return recorder.runChild({ stage, command: "docker", args: ["exec", "-i", target.container, "psql", "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target.database], cwd: root, env: childEnv(), envAllowlist: allow(),
  input: sql, parser: (stdout) => JSON.parse(stdout.trim()) });
}
export function assertAbsentV6(value) {
  if (value.history_primary !== null || value.history_mirror !== null || value.approval_rows !== 0
      || value.indexdef !== expected.oldIndex || value.predicate !== expected.oldPredicate || value.build_residue !== false) {
    throw new Error("v6-not-dual-absent-empty");
  }
  return value;
}
function frozenManifest() {
  const lines = readFileSync(manifestPath, "utf8").trimEnd().split("\n");
  if (lines.shift() !== "b2c-000197-preliminary-input-manifest-v6") throw new Error("v6-manifest-schema");
  for (const line of lines.filter((entry) => entry.startsWith("file\t"))) {
    const [, path, size, hash] = line.split("\t"); const content = readFileSync(resolve(root, path));
    if (content.length !== Number(size) || sha256(content) !== hash) throw new Error(`v6-manifest-drift:${path}`);
  }
}
export function staticV6Candidate({ mode = "auto" } = {}) {
  inputs(); const frozen = existsSync(manifestPath) && existsSync(handoffPath);
  if (mode === "frozen") {
    if (!frozen) throw new Error("v6-freeze-files-missing"); frozenManifest();
    return { status: "frozen-awaiting-independent-reviews", manifest_frozen: true,
      execution_authorized: false, live_execution: false, formal_run_id: V6_RUN_ID, runtime_v8: expected.runtime };
  }
  if (mode !== "unfrozen" && mode !== "auto") throw new Error("v6-static-mode");
  if (mode === "auto" && frozen) return staticV6Candidate({ mode: "frozen" });
  return { status: "unfrozen-v8-integrated", manifest_frozen: false,
    execution_authorized: false, live_execution: false, formal_run_id: V6_RUN_ID, runtime_v8: expected.runtime };
}
export function executePreflightV6() {
  return executeWithEvidenceV6({ evidenceRoot: resolve(research, `b2c-000197-v6-preflight-evidence-${V6_RUN_ID}`),
    operation: (recorder) => { inputs(); return V6_TARGETS.map((target) => {
      const format = "{{.Id}}|{{.Name}}|{{.Image}}|{{.State.Running}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}{{end}}";
      const identity = recorder.runChild({ stage: `inspect-${target.key}`, command: "docker",
        args: ["inspect", "--format", format, target.container], cwd: root, env: childEnv(), envAllowlist: allow() }).stdout.toString("utf8").trim();
      const wanted = `${target.containerId}|/${target.container}|sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777|true|volume:${target.volume}:/var/lib/postgresql/data`;
      if (identity !== wanted) throw new Error(`v6-resource:${target.key}`);
      const state = psql(recorder, target, `preflight-${target.key}`).parsed; assertAbsentV6(state); return { key: target.key, identity, state };
    }); }, successPayload: { scope: "v6-read-only-preflight", execution_authorized: false } });
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  if (process.env.B2C_000197_V6_PREFLIGHT === "1") process.stdout.write(`${JSON.stringify(executePreflightV6(), null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(staticV6Candidate({ mode: process.env.B2C_000197_V6_STATIC_MODE ?? "auto" }), null, 2)}\n`);
}
