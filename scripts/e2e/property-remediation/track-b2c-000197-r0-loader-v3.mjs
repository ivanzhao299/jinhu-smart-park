import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  V3_RUN_ID, executeWithEvidenceV3,
} from "./track-b2c-000197-preliminary-executor-v3.mjs";

const root = process.cwd();
const researchRoot = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const reviewedLoaderPath = resolve(researchRoot, "b2c-000197-r0-fixture-loader-20260802.mjs");
const reviewedLoaderSha = "0d25972b92405c461cba9847839550bc931ae01ddb214712152edfabfa76d277";
const evidenceRoot = resolve(researchRoot, `b2c-000197-r0-loader-evidence-${V3_RUN_ID}`);
const targets = Object.freeze([
  {
    key: "c", topology: "upgrade-to-195", container: "jinhu-b2c197-prelim-20260802b-c",
    containerId: "ee68f2ef6b1c2ac5e6d653f1a2388e121b268bf3e6517402484255c1845d25c6",
    database: "jinhu_b2c197_c",
    volume: "60ab8a7c1dbf58421056bfd5a6f987144cfd8c7ee44c6500302478c9e0c1da12",
  },
  {
    key: "d", topology: "fresh-to-195", container: "jinhu-b2c197-prelim-20260802b-d",
    containerId: "f0d1f2d5e8508fd787e03c179596730c97371e0ebb19e1462774ebc67faae896",
    database: "jinhu_b2c197_d",
    volume: "7384e6ecc01752cff1fc8dd49074d4488e35e5369ceea404895a906cb4af98f5",
  },
]);
const expectedHistory = Object.freeze([
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql",
  "000195_property_mutation_receipt_contract_v2.sql",
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function replaceExact(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`b2c-000197-v3-r0-replacement-drift:${before}`);
  return source.replace(before, after);
}

function derivedLoader() {
  const reviewed = readFileSync(reviewedLoaderPath);
  if (sha256(reviewed) !== reviewedLoaderSha) throw new Error("b2c-000197-v3-r0-reviewed-loader-sha-drift");
  let source = reviewed.toString("utf8");
  for (const [before, after] of [
    ['const runId = "b2c197_r0_20260802a";', `const runId = "${V3_RUN_ID}";`],
    ['container: "jinhu-b2c197-r0-20260802a-a"', `container: "${targets[0].container}"`],
    ['database: "jinhu_b2c197_a"', `database: "${targets[0].database}"`],
    ['container: "jinhu-b2c197-r0-20260802a-b"', `container: "${targets[1].container}"`],
    ['database: "jinhu_b2c197_b"', `database: "${targets[1].database}"`],
  ]) source = replaceExact(source, before, after);
  if (/jinhu-b2c197-r0-20260802a-[ab]|jinhu_b2c197_[ab]/u.test(source)
      || /000197_property_approval_active_source_index_forward_fix/u.test(source)) {
    throw new Error("b2c-000197-v3-r0-derived-loader-scope-drift");
  }
  return Buffer.from(source);
}

function verifyTarget(recorder, target) {
  const historyList = expectedHistory.map((filename) => `'${filename}'`).join(",");
  const sql = `SELECT json_build_object(
    'database',current_database(),
    'server_version',current_setting('server_version'),
    'primary',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.sys_schema_migration_history)x),
    'mirror',(SELECT json_agg(row_to_json(x) ORDER BY filename) FROM
      (SELECT filename,checksum,status FROM public.schema_migrations)x),
    'expected_succeeded',(SELECT count(*) FROM public.sys_schema_migration_history
      WHERE filename IN (${historyList}) AND status='succeeded'),
    'failed_or_running',(SELECT count(*) FROM public.sys_schema_migration_history
      WHERE status IN ('failed','running')),
    'prefix_197',(SELECT count(*) FROM public.sys_schema_migration_history
      WHERE filename LIKE '000197\\_%' ESCAPE '\\'),
    'optional_191_192',(SELECT count(*) FROM public.sys_schema_migration_history
      WHERE filename LIKE '000191\\_%' ESCAPE '\\' OR filename LIKE '000192\\_%' ESCAPE '\\'),
    'approval_table',to_regclass('public.biz_property_approval_request') IS NOT NULL,
    'indexdef',encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
    'predicate',encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex'),
    'build_residue',to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL)
    FROM pg_index i WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;`;
  const result = recorder.runChild({ stage: `verify-${target.key}-to195`, command: "docker",
    args: ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", target.database], cwd: root,
    env: { PATH: process.env.PATH }, envAllowlist: [{ name: "PATH", persist: "value" }], input: sql });
  const parsed = JSON.parse(result.stdout.toString("utf8").trim());
  const expectedRows = expectedHistory.map((filename) => ({
    filename,
    checksum: sha256(readFileSync(resolve(root, "database/migrations", filename))),
    status: "succeeded",
  }));
  if (parsed.database !== target.database || parsed.server_version !== "16.14"
      || JSON.stringify(parsed.primary) !== JSON.stringify(expectedRows)
      || JSON.stringify(parsed.mirror) !== JSON.stringify(expectedRows)
      || parsed.expected_succeeded !== 9 || parsed.failed_or_running !== 0
      || parsed.prefix_197 !== 0 || parsed.optional_191_192 !== 0 || !parsed.approval_table
      || parsed.indexdef !== "89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584"
      || parsed.predicate !== "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37"
      || parsed.build_residue) throw new Error(`b2c-000197-v3-r0-postcheck-drift:${target.key}`);
  return parsed;
}

const loaderBytes = derivedLoader();
const execution = executeWithEvidenceV3({ evidenceRoot, operation: (recorder) => {
  const loader = recorder.runChild({ stage: "reviewed-r0-derived-loader", command: process.execPath,
    args: ["--input-type=module", "-"], cwd: root,
    env: { PATH: process.env.PATH }, envAllowlist: [{ name: "PATH", persist: "value" }],
    input: loaderBytes });
  return { loader_stdout: loader.stdout.toString("utf8").trim(),
    targets: targets.map((target) => ({ identity: target, postcheck: verifyTarget(recorder, target) })) };
}, successPayload: (result) => ({
  scope: "r0-derived-loader-c-upgrade-d-fresh-through-195-197-absent",
  reviewed_loader_raw_sha256: reviewedLoaderSha,
  derived_loader_raw_sha256: sha256(loaderBytes),
  result,
}) });

process.stdout.write(`${JSON.stringify({ status: "passed", formal_run_id: V3_RUN_ID,
  terminal: execution.terminal, result: execution.result }, null, 2)}\n`);
