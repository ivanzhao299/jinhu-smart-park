#!/usr/bin/env node
/* global process, structuredClone */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PerformancePersonAssessmentSourceAdapterError,
  validatePerformancePersonAssessmentPrivateLabPayload,
  validatePerformancePersonAssessmentSafeSourceReceipt,
} from "./performance-person-assessment-source-adapter.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const LAB_DATABASE = /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,80}$/u;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;
const DEFAULT_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-performance-person-assessment-source-adapter-v1.json",
);

export class PerformancePersonAssessmentLabLoaderError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PerformancePersonAssessmentLabLoaderError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PerformancePersonAssessmentLabLoaderError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys, code, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, label);
};

function privateJson(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_FILE_UNSAFE", label);
  }
  try {
    const link = lstatSync(path);
    const actual = realpathSync(path);
    const info = statSync(actual);
    if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_FILE_UNSAFE", label);
    }
    return JSON.parse(readFileSync(actual, "utf8"));
  } catch (error) {
    if (error instanceof PerformancePersonAssessmentLabLoaderError) throw error;
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_FILE_UNSAFE", label);
  }
}

function validateContract(path, repositoryRoot, contractSha256) {
  const root = resolve(repositoryRoot);
  const contractPath = resolve(path);
  if (!contractPath.startsWith(`${root}/`)) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_CONTRACT_INVALID", "contract location");
  }
  const raw = readFileSync(contractPath);
  let contract;
  try { contract = JSON.parse(raw); }
  catch { fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_CONTRACT_INVALID", "contract JSON"); }
  const writer = contract.labWriter;
  if (digest(raw) !== contractSha256
    || contract.contractKind !== "yuzhou_hr_performance_person_assessment_source_adapter"
    || writer?.executionContext !== "lab_rehearsal"
    || writer?.sourceAssessmentRequirement !== "all_null"
    || writer?.comparableMasterDisposition !== "assessment_missing"
    || writer?.comparisonDisposition !== "not_comparable"
    || writer?.exactReplay !== "idempotent"
    || writer?.driftDisposition !== "reject"
    || writer?.rollbackDisposition !== "reverse_zero_residual"
    || writer?.compatibilityCredit !== 0
    || writer?.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_CONTRACT_INVALID", "contract boundary");
  }
  return contract;
}

function parseFields(output, expected, code) {
  const lines = String(output ?? "").replaceAll("\r", "").trim().split("\n").filter(Boolean);
  if (lines.length !== 1) fail(code, "row count");
  const fields = lines[0].split("|").map(value => value.trim());
  if (fields.length !== expected) fail(code, "shape");
  return fields;
}

function integer(value, code, label) {
  if (!/^[0-9]+$/u.test(value ?? "")) fail(code, label);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(code, label);
  return parsed;
}

export function createDefaultPerformancePersonAssessmentLabSqlRunner() {
  return ({ container, database, sql }) => spawnSync(
    "docker",
    [
      "exec", "-i", container,
      "psql", "-X", "-q", "-t", "-A", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "jinhu", "-d", database,
    ],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function execute(runner, input, sql, code) {
  const result = runner({ container: input.postgresContainer, database: input.database, sql });
  if (result?.error || result?.status !== 0) fail(code, "isolated PostgreSQL operation");
  return String(result.stdout ?? "");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ownerStateSql(input) {
  return `SELECT encode(digest(convert_to(jsonb_build_object(
    'master',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,source_identity_sha256,source_row_sha256,legacy_record_map_id) ORDER BY id)
      FROM hr_performance_legacy_master_result
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),'[]'::jsonb),
    'detail',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,source_identity_sha256,source_row_sha256,legacy_record_map_id) ORDER BY id)
      FROM hr_performance_legacy_dimension_result
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),'[]'::jsonb),
    'template',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,source_identity_sha256,source_row_sha256,legacy_record_map_id) ORDER BY id)
      FROM hr_performance_legacy_template_profile
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex');`;
}

function stateSql(input) {
  return `SELECT
    (SELECT count(*) FROM hr_performance_legacy_person_assessment_evidence
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),
    (SELECT count(*) FROM hr_performance_legacy_master_result
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),
    (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),
    (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)
        AND source_person_evidence_count=1),
    (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)
        AND person_resolution_status='assessment_missing'),
    (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)
        AND comparison_status='not_comparable'),
    (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
      WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)
        AND source_person_evidence_count=1
        AND (person_resolution_status<>'assessment_missing' OR comparison_status<>'not_comparable'
          OR source_person_assessment_id IS NOT NULL OR person_template_profile_id IS NOT NULL)),
    encode(digest(convert_to(jsonb_build_object(
      'evidence',COALESCE((SELECT jsonb_agg(evidence_sha256 ORDER BY evidence_sha256)
        FROM hr_performance_legacy_person_assessment_evidence
        WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),'[]'::jsonb),
      'resolution',COALESCE((SELECT jsonb_agg(evidence_sha256 ORDER BY evidence_sha256)
        FROM hr_performance_legacy_ass_compute_weight_resolution
        WHERE (tenant_id,park_id,migration_batch_id)=(${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid)),'[]'::jsonb)
    )::text,'UTF8'),'sha256'),'hex');`;
}

function parseState(output) {
  const fields = parseFields(output, 8, "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID");
  if (!SHA256.test(fields[7] ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "state hash");
  return {
    evidenceRows: integer(fields[0], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "evidence"),
    masterRows: integer(fields[1], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "master"),
    resolutionRows: integer(fields[2], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "resolution"),
    comparableMasterRows: integer(fields[3], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "comparable"),
    assessmentMissingRows: integer(fields[4], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "assessment missing"),
    notComparableRows: integer(fields[5], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "not comparable"),
    invalidComparableRows: integer(fields[6], "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID", "invalid comparable"),
    stateSha256: fields[7],
  };
}

function callWriterSql(input, payload) {
  return `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
CALL materialize_yuzhou_performance_ass_compute_weight_relation_lab(
  ${sqlLiteral(input.tenantId)},${sqlLiteral(input.parkId)},${sqlLiteral(input.batchId)}::uuid,
  ${sqlLiteral(JSON.stringify(payload))}::jsonb
);
COMMIT;`;
}

export function runPerformancePersonAssessmentLabLoad(input, { runner = createDefaultPerformancePersonAssessmentLabSqlRunner() } = {}) {
  exactKeys(input, [
    "repositoryRoot", "contractPath", "privatePayloadPath", "safeReceiptPath",
    "postgresContainer", "database", "tenantId", "parkId", "batchId",
  ], "PERFORMANCE_PERSON_ASSESSMENT_LAB_INPUT_INVALID", "input shape");
  if (!CONTAINER.test(input.postgresContainer ?? "") || !LAB_DATABASE.test(input.database ?? "")
    || !SCOPE.test(input.tenantId ?? "") || !SCOPE.test(input.parkId ?? "")
    || !UUID.test(input.batchId ?? "")) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_INPUT_INVALID", "lab identity");
  }
  let privatePayload;
  let safeReceipt;
  try {
    privatePayload = validatePerformancePersonAssessmentPrivateLabPayload(
      privateJson(input.privatePayloadPath, "private payload"),
    );
    safeReceipt = validatePerformancePersonAssessmentSafeSourceReceipt(
      privateJson(input.safeReceiptPath, "safe receipt"),
    );
  } catch (error) {
    if (error instanceof PerformancePersonAssessmentSourceAdapterError) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_ARTIFACT_INVALID", "sealed source artifact");
    }
    throw error;
  }
  validateContract(input.contractPath, input.repositoryRoot, privatePayload.contractSha256);
  if (privatePayload.contractSha256 !== safeReceipt.contractSha256
    || !same(privatePayload.sourceBinding, safeReceipt.sourceBinding)
    || privatePayload.rowCount !== safeReceipt.privateLabPayload.rowCount
    || privatePayload.payloadSha256 !== safeReceipt.privateLabPayload.payloadSha256
    || privatePayload.artifactSha256 !== safeReceipt.privateLabPayload.artifactSha256
    || privatePayload.rowCount < 1
    || privatePayload.payload.personAssessments.some(row => row.sourceAssessmentId !== null)) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_ARTIFACT_INVALID", "all-null sealed source binding");
  }

  const preflight = parseFields(execute(runner, input, `SELECT count(*)
    FROM migration_batch
    WHERE id=${sqlLiteral(input.batchId)}::uuid AND source_system='yuzhou-v10'
      AND target_database=current_database() AND current_database()=${sqlLiteral(input.database)}
      AND execution_context='lab_rehearsal' AND phase='load' AND status='running';`,
  "PERFORMANCE_PERSON_ASSESSMENT_LAB_PREFLIGHT_FAILED"), 1, "PERFORMANCE_PERSON_ASSESSMENT_LAB_PREFLIGHT_FAILED");
  if (preflight[0] !== "1") fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_PREFLIGHT_FAILED", "lab batch");

  const ownerBefore = parseFields(execute(runner, input, ownerStateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_OWNER_PROBE_FAILED"), 1,
  "PERFORMANCE_PERSON_ASSESSMENT_LAB_OWNER_PROBE_FAILED")[0];
  if (!SHA256.test(ownerBefore ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_OWNER_PROBE_FAILED", "owner hash");

  execute(runner, input, callWriterSql(input, privatePayload.payload),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_LOAD_FAILED");
  const first = parseState(execute(runner, input, stateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID"));
  if (first.evidenceRows !== privatePayload.rowCount || first.resolutionRows !== first.masterRows
    || first.comparableMasterRows !== first.assessmentMissingRows
    || first.invalidComparableRows !== 0) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_CONSERVATION_FAILED", "all-null disposition");
  }

  execute(runner, input, callWriterSql(input, privatePayload.payload),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_REPLAY_FAILED");
  const replay = parseState(execute(runner, input, stateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID"));
  if (!same(first, replay)) fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_REPLAY_DRIFT", "exact replay");

  const driftPayload = structuredClone(privatePayload.payload);
  driftPayload.personAssessments[0].sourceAssessmentId = 1;
  const drift = runner({
    container: input.postgresContainer,
    database: input.database,
    sql: callWriterSql(input, driftPayload),
  });
  if (!drift || drift.error || drift.status === 0
    || !/HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_(?:PERSON_EVIDENCE_CONSERVATION_FAILED|REPLAY_DRIFT)/u.test(String(drift.stderr ?? ""))) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_DRIFT_NOT_REJECTED", "changed private relation");
  }
  const afterDrift = parseState(execute(runner, input, stateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID"));
  if (!same(first, afterDrift)) fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_DRIFT_RESIDUAL", "failed replay");

  execute(runner, input, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
UPDATE migration_batch SET phase='rollback',status='running'
WHERE id=${sqlLiteral(input.batchId)}::uuid AND execution_context='lab_rehearsal'
  AND phase='load' AND status='running' AND target_database=current_database();
CALL rollback_yuzhou_performance_ass_compute_weight_relation_lab(${sqlLiteral(input.batchId)}::uuid);
COMMIT;`, "PERFORMANCE_PERSON_ASSESSMENT_LAB_ROLLBACK_FAILED");
  const rolledBack = parseState(execute(runner, input, stateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_STATE_INVALID"));
  const ownerAfter = parseFields(execute(runner, input, ownerStateSql(input),
    "PERFORMANCE_PERSON_ASSESSMENT_LAB_OWNER_PROBE_FAILED"), 1,
  "PERFORMANCE_PERSON_ASSESSMENT_LAB_OWNER_PROBE_FAILED")[0];
  if (rolledBack.evidenceRows !== 0 || rolledBack.resolutionRows !== 0
    || ownerAfter !== ownerBefore) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_ROLLBACK_RESIDUAL", "reverse rollback");
  }

  return {
    status: "PERFORMANCE_PERSON_ASSESSMENT_LAB_VERIFIED",
    sourceEvidenceRows: first.evidenceRows,
    masterRows: first.masterRows,
    comparableMasterRows: first.comparableMasterRows,
    assessmentMissingRows: first.assessmentMissingRows,
    notComparableRows: first.notComparableRows,
    exactReplay: "verified",
    driftRejection: "verified",
    rollbackResidualRows: 0,
    ownerStatePreserved: true,
    stateSha256: first.stateSha256,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const allowed = new Set([
    "--repository-root", "--contract", "--private-payload", "--safe-receipt",
    "--postgres-container", "--database", "--tenant", "--park", "--batch",
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || Object.hasOwn(values, key) || index + 1 >= argv.length) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_ARGUMENT_INVALID", key ?? "missing");
    }
    values[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--contract" || key === "--repository-root") continue;
    if (!values[key]) fail("PERFORMANCE_PERSON_ASSESSMENT_LAB_ARGUMENT_INVALID", key);
  }
  return values;
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolve(values["--repository-root"] ?? resolve(import.meta.dirname, "../.."));
  const result = runPerformancePersonAssessmentLabLoad({
    repositoryRoot,
    contractPath: resolve(values["--contract"] ?? DEFAULT_CONTRACT),
    privatePayloadPath: resolve(values["--private-payload"]),
    safeReceiptPath: resolve(values["--safe-receipt"]),
    postgresContainer: values["--postgres-container"],
    database: values["--database"],
    tenantId: values["--tenant"],
    parkId: values["--park"],
    batchId: values["--batch"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.code ?? "PERFORMANCE_PERSON_ASSESSMENT_LAB_FAILED"}\n`);
    process.exitCode = 1;
  });
}
