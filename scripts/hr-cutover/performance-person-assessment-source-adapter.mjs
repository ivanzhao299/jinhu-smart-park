#!/usr/bin/env node
/* global process, structuredClone */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sourceRestoreReceiptFileHash,
  validateSourceRestoreReceipt,
} from "./source-restore-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const DATABASE = /^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const SOURCE_COMPOSE_PROJECT = "jinhu_yuzhou_migration_lab";
const DEFAULT_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-performance-person-assessment-source-adapter-v1.json",
);
const STATUS_KEYS = [
  "identityNullRows",
  "identityBlankRows",
  "identityNonAsciiRows",
  "identityNormalizationCollisionRows",
  "identityDuplicateRows",
  "assessmentNotApplicableRows",
  "assessmentUnmatchedRows",
  "assessmentResolvedRows",
  "assessmentAmbiguousRows",
];
const AGGREGATE_KEYS = [
  "totalAssessmentCodeRows",
  "distinctAssessmentKeys",
  "duplicateAssessmentKeyGroups",
  "duplicateAssessmentRows",
  "totalPersonRows",
  "distinctSafeIdentityCount",
  "identityNormalizationCollisionGroups",
  "identityDuplicateGroups",
  ...STATUS_KEYS,
  "loadableRows",
  "quarantinedRows",
];
const AUTHORITY_KEYS = [
  "loginSucceeded",
  "sysadmin",
  "dbDatareader",
  "viewDefinition",
  "insert",
  "update",
  "delete",
  "execute",
];
const EXPECTED_FIELDS = [
  ["person", "person", "varchar"],
  ["person", "assessment", "int"],
  ["assessmentcode", "assessment", "int"],
];

export const PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_SQL = `SET NOCOUNT ON;
SELECT
  CONVERT(varchar(1),CASE WHEN OBJECT_ID(N'dbo.person',N'U') IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),CASE WHEN OBJECT_ID(N'dbo.assessmentcode',N'U') IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),source_database.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.person','OBJECT','INSERT'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.assessmentcode','OBJECT','INSERT'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.person','OBJECT','UPDATE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.assessmentcode','OBJECT','UPDATE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.person','OBJECT','DELETE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.assessmentcode','OBJECT','DELETE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'),0))
FROM sys.databases source_database WHERE source_database.name=DB_NAME();`;

export const PERFORMANCE_PERSON_ASSESSMENT_FIELD_CATALOG_SQL = `SET NOCOUNT ON;
WITH requested(table_name,column_name,field_order) AS (
  SELECT N'person',N'person',1 UNION ALL
  SELECT N'person',N'assessment',2 UNION ALL
  SELECT N'assessmentcode',N'assessment',3
)
SELECT requested.table_name,requested.column_name,
  COALESCE(TYPE_NAME(source_column.user_type_id),''),
  COALESCE(CONVERT(varchar(12),source_column.max_length),''),
  COALESCE(CONVERT(varchar(12),source_column.precision),''),
  COALESCE(CONVERT(varchar(12),source_column.scale),''),
  COALESCE(CONVERT(varchar(1),source_column.is_nullable),''),
  COALESCE(CONVERT(varchar(1),source_column.is_computed),'')
FROM requested
LEFT JOIN sys.columns source_column
  ON source_column.object_id=OBJECT_ID(N'dbo.'+requested.table_name,N'U')
 AND source_column.name=requested.column_name
ORDER BY requested.field_order;`;

const CLASSIFICATION_CTES = `WITH normalized_person AS (
  SELECT
    CONVERT(varbinary(8000),source_person.person) AS raw_person_bytes,
    LTRIM(RTRIM(CONVERT(varchar(8000),source_person.person))) COLLATE Latin1_General_100_BIN2 AS normalized_person,
    source_person.assessment
  FROM dbo.person source_person
), raw_variants AS (
  SELECT normalized_person,raw_person_bytes,COUNT_BIG(*) AS variant_rows
  FROM normalized_person
  WHERE normalized_person IS NOT NULL AND normalized_person<>''
    AND PATINDEX('%[^ -~]%',normalized_person COLLATE Latin1_General_100_BIN2)=0
  GROUP BY normalized_person,raw_person_bytes
), identity_groups AS (
  SELECT normalized_person,COUNT_BIG(*) AS variant_count,SUM(variant_rows) AS identity_rows
  FROM raw_variants GROUP BY normalized_person
), assessment_candidates AS (
  SELECT source_assessment.assessment,COUNT_BIG(*) AS candidate_count
  FROM dbo.assessmentcode source_assessment GROUP BY source_assessment.assessment
), classified AS (
  SELECT source_person.*,
    COALESCE(identity_group.variant_count,0) AS identity_variant_count,
    COALESCE(identity_group.identity_rows,0) AS normalized_identity_rows,
    COALESCE(assessment_candidate.candidate_count,0) AS assessment_candidate_count,
    CASE
      WHEN source_person.normalized_person IS NULL THEN 'identity_null'
      WHEN source_person.normalized_person='' THEN 'identity_blank'
      WHEN PATINDEX('%[^ -~]%',source_person.normalized_person COLLATE Latin1_General_100_BIN2)>0 THEN 'identity_non_ascii'
      WHEN identity_group.variant_count>1 THEN 'identity_normalization_collision'
      WHEN identity_group.identity_rows>1 THEN 'identity_duplicate'
      WHEN source_person.assessment IS NULL THEN 'assessment_not_applicable'
      WHEN COALESCE(assessment_candidate.candidate_count,0)=0 THEN 'assessment_unmatched'
      WHEN assessment_candidate.candidate_count=1 THEN 'assessment_resolved'
      ELSE 'assessment_ambiguous'
    END AS row_status
  FROM normalized_person source_person
  LEFT JOIN identity_groups identity_group
    ON identity_group.normalized_person=source_person.normalized_person
  LEFT JOIN assessment_candidates assessment_candidate
    ON assessment_candidate.assessment=source_person.assessment
)`;

export const PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
${CLASSIFICATION_CTES}
SELECT
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assessmentcode)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM assessment_candidates)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM assessment_candidates WHERE candidate_count>1)),
  CONVERT(varchar(30),COALESCE((SELECT SUM(candidate_count) FROM assessment_candidates WHERE candidate_count>1),0)),
  CONVERT(varchar(30),COUNT_BIG(*)),
  CONVERT(varchar(30),COUNT_BIG(DISTINCT CASE WHEN row_status LIKE 'assessment_%' THEN normalized_person END)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM identity_groups WHERE variant_count>1)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM identity_groups WHERE variant_count=1 AND identity_rows>1)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='identity_null' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='identity_blank' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='identity_non_ascii' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='identity_normalization_collision' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='identity_duplicate' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='assessment_not_applicable' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='assessment_unmatched' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='assessment_resolved' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status='assessment_ambiguous' THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status IN('assessment_not_applicable','assessment_unmatched','assessment_resolved') THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)),
  CONVERT(varchar(30),COALESCE(SUM(CASE WHEN row_status NOT IN('assessment_not_applicable','assessment_unmatched','assessment_resolved') THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0))
FROM classified;`;

// This query is consumed only inside the process and is never printed. It emits
// a T0-compatible person hash plus a nullable integer needed by migration 000307;
// it never emits a person code or name.
export const PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL = `SET NOCOUNT ON;
${CLASSIFICATION_CTES}
SELECT
  LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',
    CONVERT(varbinary(8000),'dbo.person'+CHAR(0)+normalized_person)),2)),
  COALESCE(CONVERT(varchar(20),assessment),'<null>')
FROM classified
WHERE row_status IN('assessment_not_applicable','assessment_unmatched','assessment_resolved')
ORDER BY 1,2;`;

export class PerformancePersonAssessmentSourceAdapterError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PerformancePersonAssessmentSourceAdapterError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PerformancePersonAssessmentSourceAdapterError(code, detail); };
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, label);
};
const count = (value, code, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, label);
};

function privateInputFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_FILE_UNSAFE", label);
  }
  try {
    const link = lstatSync(path);
    const actual = realpathSync(path);
    const info = statSync(actual);
    if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_FILE_UNSAFE", label);
    }
    return actual;
  } catch (error) {
    if (error instanceof PerformancePersonAssessmentSourceAdapterError) throw error;
    fail("PERFORMANCE_PERSON_ASSESSMENT_FILE_UNSAFE", `${label}:missing`);
  }
}

function privateOutputPath(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || existsSync(path)) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_OUTPUT_UNSAFE", label);
  }
  try {
    const parentLink = lstatSync(dirname(path));
    const parent = statSync(realpathSync(dirname(path)));
    if (parentLink.isSymbolicLink() || !parent.isDirectory() || (parent.mode & 0o777) !== 0o700) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_OUTPUT_UNSAFE", label);
    }
  } catch {
    fail("PERFORMANCE_PERSON_ASSESSMENT_OUTPUT_UNSAFE", label);
  }
  return path;
}

function readJson(raw, code, label) {
  try { return JSON.parse(raw); }
  catch { fail(code, label); }
}

function validateContract(contractPath, repositoryRoot) {
  const root = resolve(repositoryRoot);
  const resolvedContract = resolve(contractPath);
  if (!resolvedContract.startsWith(`${root}/`)) fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "contract location");
  const raw = readFileSync(resolvedContract);
  const contract = readJson(raw, "PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "contract JSON");
  if (contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_performance_person_assessment_source_adapter"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.scope !== "dbo_person_assessment_to_assessmentcode_for_bs_ass_compute"
    || !same(contract.statusOrder, [
      "identity_null", "identity_blank", "identity_non_ascii",
      "identity_normalization_collision", "identity_duplicate",
      "assessment_not_applicable", "assessment_unmatched", "assessment_resolved",
      "assessment_ambiguous",
    ])
    || contract.normalization?.person !== "case_sensitive_ascii_after_sql_ltrim_rtrim_space_only"
    || contract.normalization?.personIdentity !== "sha256_utf8('dbo.person\\0'+normalized_person)"
    || contract.normalization?.assessment !== "nullable_exact_sql_int_no_text_or_case_coercion"
    || contract.privateLabPayload?.targetProcedure !== "materialize_yuzhou_performance_ass_compute_weight_relation_lab"
    || contract.privateLabPayload?.mode !== "lab_rehearsal_only"
    || contract.labWriter?.executionContext !== "lab_rehearsal"
    || contract.labWriter?.sourceAssessmentRequirement !== "all_null"
    || contract.labWriter?.comparableMasterDisposition !== "assessment_missing"
    || contract.labWriter?.comparisonDisposition !== "not_comparable"
    || contract.labWriter?.exactReplay !== "idempotent"
    || contract.labWriter?.driftDisposition !== "reject"
    || contract.labWriter?.rollbackDisposition !== "reverse_zero_residual"
    || contract.labWriter?.compatibilityCredit !== 0
    || contract.labWriter?.productionImport !== "HOLD"
    || contract.safeReceipt?.personCodeValues !== false
    || contract.safeReceipt?.assessmentValues !== false
    || contract.safeReceipt?.names !== false
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD"
    || contract.sourceMutation !== "FORBIDDEN"
    || contract.legacyRoutineExecution !== "FORBIDDEN") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (!same(contract.sourceObjects?.map(row => [row.schema, row.table, row.column, row.requiredType]), EXPECTED_FIELDS.map(([table, column, type]) => ["dbo", table, column, type]))) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "source fields");
  }
  const bindings = contract.evidenceBindings;
  for (const [label, binding] of Object.entries({
    migration: bindings?.weightRelationMigration,
    fieldMap: bindings?.assessmentFieldMap,
    routineLedger: bindings?.routineLedger,
  })) {
    if (!object(binding) || typeof binding.path !== "string" || !SHA256.test(binding.sha256 ?? "")) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", label);
    }
    const path = resolve(root, binding.path);
    if (!path.startsWith(`${root}/`) || digest(readFileSync(path)) !== binding.sha256) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_EVIDENCE_DRIFT", label);
    }
  }
  const fieldMap = readJson(readFileSync(resolve(root, bindings.assessmentFieldMap.path)), "PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "field map");
  const ledger = readJson(readFileSync(resolve(root, bindings.routineLedger.path)), "PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_INVALID", "routine ledger");
  const routine = ledger.routines?.find(row => row.routineId === bindings.routineLedger.routineId);
  if (fieldMap.contractKind !== "yuzhou_hr_legacy_performance_assessmentcode_field_map"
    || !fieldMap.relations?.some(row => row.source === "person.assessment" && row.target === "assessmentcode.assessment")
    || routine?.sourceName !== "bs_ass_compute"
    || routine.sourceArtifactSha256 !== bindings.routineLedger.routineSourceSha256
    || routine.structuralHash !== bindings.routineLedger.routineStructuralSha256
    || !routine.joinPredicates?.includes("assessmentmaster.person=person.person")
    || !routine.joinPredicates?.includes("person.assessment=assessmentcode.assessment")) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_CONTRACT_EVIDENCE_DRIFT", "relationship semantics");
  }
  return { contract, contractSha256: digest(raw) };
}

function parseEnv(path) {
  const values = {};
  for (const line of readFileSync(privateInputFile(path, "ETL envelope"), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("PERFORMANCE_PERSON_ASSESSMENT_ETL_INVALID", "envelope shape");
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  if (!values.YUZHOU_SQLSERVER_ETL_LOGIN || !values.YUZHOU_SQLSERVER_ETL_PASSWORD
    || String(values.YUZHOU_SQLSERVER_ETL_LOGIN).toLowerCase() === "sa"
    || !DATABASE.test(values.YUZHOU_SQLSERVER_DATABASE ?? "")) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_ETL_INVALID", "least privilege binding");
  }
  return values;
}

function runSql(sourceContainer, login, password, database, sql, code) {
  const result = spawnSync("docker", [
    "exec", "-i", sourceContainer, "bash", "-lc",
    'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d "$2" -h -1 -W -w 65535 -s "|" -Q "$3"',
    "q", login, database, sql,
  ], { input: `${password}\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(code, "fixed read-only SQL Server probe");
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function inspectContainer(sourceContainer) {
  const result = spawnSync("docker", ["inspect", sourceContainer], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) fail("PERFORMANCE_PERSON_ASSESSMENT_CONTAINER_IDENTITY_FAILED", "source container inspect");
  let inspected;
  try { [inspected] = JSON.parse(result.stdout); }
  catch { fail("PERFORMANCE_PERSON_ASSESSMENT_CONTAINER_IDENTITY_FAILED", "source container inspect shape"); }
  if (!inspected?.Id || !inspected?.Image) fail("PERFORMANCE_PERSON_ASSESSMENT_CONTAINER_IDENTITY_FAILED", "source container identity");
  return {
    containerIdentitySha256: digest(inspected.Id),
    imageIdentitySha256: digest(inspected.Image),
    healthy: inspected.State?.Health?.Status === "healthy",
    project: inspected.Config?.Labels?.["com.docker.compose.project"] ?? null,
  };
}

const oneLineFields = (output, length, code, label) => {
  const lines = output.split("\n").filter(Boolean);
  if (lines.length !== 1) fail(code, `${label}:row count`);
  const fields = lines[0].split("|").map(value => value.trim());
  if (fields.length !== length) fail(code, `${label}:shape`);
  return fields;
};
const parseInteger = (value, code, label) => {
  if (!/^[0-9]+$/u.test(value ?? "")) fail(code, label);
  const parsed = Number(value);
  count(parsed, code, label);
  return parsed;
};
const parseSignedInteger = (value, code, label) => {
  if (!/^-?[0-9]+$/u.test(value ?? "")) fail(code, label);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < -2147483648 || parsed > 2147483647) fail(code, label);
  return parsed;
};

function parseState(output, expectedDatabase) {
  const fields = oneLineFields(output, 11, "PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_INVALID", "state");
  if (fields.slice(0, 3).some(value => !/^[01]$/u.test(value))
    || fields.slice(4).some(value => !/^[01]$/u.test(value))
    || fields[3] !== expectedDatabase) fail("PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_INVALID", "database identity");
  return {
    personTableExists: fields[0] === "1",
    assessmentcodeTableExists: fields[1] === "1",
    databaseReadOnly: fields[2] === "1",
    databaseIdentity: fields[3],
    authority: {
      loginSucceeded: true,
      sysadmin: fields[4] === "1",
      dbDatareader: fields[5] === "1",
      viewDefinition: fields[6] === "1",
      insert: fields[7] === "1",
      update: fields[8] === "1",
      delete: fields[9] === "1",
      execute: fields[10] === "1",
    },
  };
}

function parseCatalog(output) {
  const lines = output.split("\n").filter(Boolean);
  if (lines.length !== EXPECTED_FIELDS.length) fail("PERFORMANCE_PERSON_ASSESSMENT_CATALOG_INVALID", "field cardinality");
  return lines.map((line, index) => {
    const values = line.split("|").map(value => value.trim());
    if (values.length !== 8) fail("PERFORMANCE_PERSON_ASSESSMENT_CATALOG_INVALID", "field shape");
    const [expectedTable, expectedColumn, expectedType] = EXPECTED_FIELDS[index];
    if (values[0] !== expectedTable || values[1] !== expectedColumn || values[2] !== expectedType
      || !/^[0-9]+$/u.test(values[3]) || !/^[0-9]+$/u.test(values[4]) || !/^[0-9]+$/u.test(values[5])
      || !/^[01]$/u.test(values[6]) || values[7] !== "0") {
      fail("PERFORMANCE_PERSON_ASSESSMENT_CATALOG_INVALID", `${expectedTable}.${expectedColumn}`);
    }
    return {
      table: values[0], column: values[1], sqlType: values[2], maxLength: Number(values[3]),
      precision: Number(values[4]), scale: Number(values[5]), nullable: values[6] === "1", computed: false,
    };
  });
}

function validateAggregate(aggregate) {
  exactKeys(aggregate, AGGREGATE_KEYS, "PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", "aggregate shape");
  for (const key of AGGREGATE_KEYS) count(aggregate[key], "PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", key);
  const classified = STATUS_KEYS.reduce((sum, key) => sum + aggregate[key], 0);
  const identitySafeRows = aggregate.assessmentNotApplicableRows + aggregate.assessmentUnmatchedRows
    + aggregate.assessmentResolvedRows + aggregate.assessmentAmbiguousRows;
  if (classified !== aggregate.totalPersonRows
    || aggregate.loadableRows !== aggregate.assessmentNotApplicableRows + aggregate.assessmentUnmatchedRows + aggregate.assessmentResolvedRows
    || aggregate.quarantinedRows !== aggregate.totalPersonRows - aggregate.loadableRows
    || aggregate.distinctSafeIdentityCount !== identitySafeRows
    || aggregate.distinctAssessmentKeys > aggregate.totalAssessmentCodeRows
    || aggregate.duplicateAssessmentKeyGroups > aggregate.distinctAssessmentKeys
    || aggregate.duplicateAssessmentRows > aggregate.totalAssessmentCodeRows
    || (aggregate.duplicateAssessmentKeyGroups === 0) !== (aggregate.duplicateAssessmentRows === 0)
    || aggregate.duplicateAssessmentRows < aggregate.duplicateAssessmentKeyGroups * 2
    || (aggregate.identityNormalizationCollisionGroups === 0) !== (aggregate.identityNormalizationCollisionRows === 0)
    || (aggregate.identityDuplicateGroups === 0) !== (aggregate.identityDuplicateRows === 0)) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", "conservation");
  }
  return structuredClone(aggregate);
}

function parseAggregate(output) {
  const fields = oneLineFields(output, AGGREGATE_KEYS.length, "PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", "aggregate");
  return validateAggregate(Object.fromEntries(AGGREGATE_KEYS.map((key, index) => [key, parseInteger(fields[index], "PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", key)])));
}

function validatePrivateRows(rows, expectedCount) {
  if (!Array.isArray(rows)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "rows");
  const seen = new Set();
  const normalized = rows.map(row => {
    exactKeys(row, ["sourcePersonIdentitySha256", "sourceAssessmentId"], "PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "row shape");
    if (!SHA256.test(row.sourcePersonIdentitySha256 ?? "")
      || (row.sourceAssessmentId !== null && (!Number.isSafeInteger(row.sourceAssessmentId) || row.sourceAssessmentId < -2147483648 || row.sourceAssessmentId > 2147483647))) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "row value");
    }
    const key = `${row.sourcePersonIdentitySha256}:${row.sourceAssessmentId ?? "<null>"}`;
    if (seen.has(key)) fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "duplicate relation");
    seen.add(key);
    return structuredClone(row);
  });
  normalized.sort((left, right) => left.sourcePersonIdentitySha256.localeCompare(right.sourcePersonIdentitySha256)
    || (left.sourceAssessmentId ?? Number.MIN_SAFE_INTEGER) - (right.sourceAssessmentId ?? Number.MIN_SAFE_INTEGER));
  if (normalized.length !== expectedCount) fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "loadable conservation");
  return normalized;
}

function parsePrivateRows(output, expectedCount) {
  const rows = output ? output.split("\n").filter(Boolean).map(line => {
    const fields = line.split("|").map(value => value.trim());
    if (fields.length !== 2 || !SHA256.test(fields[0])) fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "private row shape");
    return {
      sourcePersonIdentitySha256: fields[0],
      sourceAssessmentId: fields[1] === "<null>" ? null : parseSignedInteger(fields[1], "PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", "assessment id"),
    };
  }) : [];
  return validatePrivateRows(rows, expectedCount);
}

export function createDefaultPerformancePersonAssessmentSourceProbe({ etlEnvFile }) {
  const env = parseEnv(etlEnvFile);
  return {
    inspect({ sourceContainer, databaseAlias }) {
      if (!CONTAINER.test(sourceContainer ?? "") || !DATABASE.test(databaseAlias ?? "")
        || env.YUZHOU_SQLSERVER_DATABASE !== databaseAlias) {
        fail("PERFORMANCE_PERSON_ASSESSMENT_SOURCE_IDENTITY_INVALID", "container or database binding");
      }
      const state = {
        ...parseState(runSql(sourceContainer, env.YUZHOU_SQLSERVER_ETL_LOGIN, env.YUZHOU_SQLSERVER_ETL_PASSWORD, databaseAlias, PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_SQL, "PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_PROBE_FAILED"), databaseAlias),
        ...inspectContainer(sourceContainer),
      };
      if (!state.personTableExists || !state.assessmentcodeTableExists) fail("PERFORMANCE_PERSON_ASSESSMENT_CATALOG_INVALID", "required source table absent");
      const catalog = parseCatalog(runSql(sourceContainer, env.YUZHOU_SQLSERVER_ETL_LOGIN, env.YUZHOU_SQLSERVER_ETL_PASSWORD, databaseAlias, PERFORMANCE_PERSON_ASSESSMENT_FIELD_CATALOG_SQL, "PERFORMANCE_PERSON_ASSESSMENT_CATALOG_PROBE_FAILED"));
      const aggregate = parseAggregate(runSql(sourceContainer, env.YUZHOU_SQLSERVER_ETL_LOGIN, env.YUZHOU_SQLSERVER_ETL_PASSWORD, databaseAlias, PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL, "PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_PROBE_FAILED"));
      const privateRows = parsePrivateRows(runSql(sourceContainer, env.YUZHOU_SQLSERVER_ETL_LOGIN, env.YUZHOU_SQLSERVER_ETL_PASSWORD, databaseAlias, PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL, "PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_PROBE_FAILED"), aggregate.loadableRows);
      return { state, catalog, aggregate, privateRows };
    },
  };
}

function validateAuthority(state) {
  exactKeys(state, [
    "personTableExists", "assessmentcodeTableExists", "databaseReadOnly", "databaseIdentity", "authority",
    "containerIdentitySha256", "imageIdentitySha256", "healthy", "project",
  ], "PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_INVALID", "state shape");
  exactKeys(state.authority, AUTHORITY_KEYS, "PERFORMANCE_PERSON_ASSESSMENT_AUTHORITY_INVALID", "authority shape");
  if (state.personTableExists !== true || state.assessmentcodeTableExists !== true
    || !SHA256.test(state.containerIdentitySha256 ?? "") || !SHA256.test(state.imageIdentitySha256 ?? "")
    || state.healthy !== true || state.project !== SOURCE_COMPOSE_PROJECT
    || state.databaseReadOnly !== true || state.authority.loginSucceeded !== true
    || state.authority.sysadmin !== false || state.authority.dbDatareader !== true
    || state.authority.viewDefinition !== true || state.authority.insert !== false
    || state.authority.update !== false || state.authority.delete !== false
    || state.authority.execute !== false) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_AUTHORITY_INVALID", "least privilege read-only source required");
  }
}

function classify(aggregate) {
  if (aggregate.totalPersonRows === 0) return ["SOURCE_POPULATION_EMPTY", "empty"];
  if (aggregate.identityNormalizationCollisionRows > 0) return ["SOURCE_NORMALIZATION_COLLISION_QUARANTINED", "partial"];
  if (aggregate.identityDuplicateRows > 0) return ["SOURCE_IDENTITY_DUPLICATE_QUARANTINED", "partial"];
  if (aggregate.assessmentAmbiguousRows > 0) return ["SOURCE_ASSESSMENT_AMBIGUOUS_QUARANTINED", "partial"];
  if (aggregate.quarantinedRows > 0) return ["SOURCE_INVALID_IDENTITY_QUARANTINED", "partial"];
  if (aggregate.assessmentNotApplicableRows > 0 || aggregate.assessmentUnmatchedRows > 0) {
    return ["SOURCE_POPULATION_OBSERVED_WITH_EXPLICIT_GAPS", "complete_with_gaps"];
  }
  return ["SOURCE_POPULATION_READY_FOR_LAB_INPUT", "complete"];
}

function sealPrivatePayload({ contractSha256, sourceBinding, queryIdentitySha256, rows }) {
  const payload = { personAssessments: rows };
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_performance_person_assessment_lab_payload",
    mode: "lab_rehearsal_only",
    targetProcedure: "materialize_yuzhou_performance_ass_compute_weight_relation_lab",
    contractSha256,
    sourceBinding,
    queryIdentitySha256,
    rowCount: rows.length,
    payloadSha256: digest(canonical(payload)),
    payload,
    containsPersonCodes: false,
    containsPersonIdentityHashes: true,
    containsAssessmentIds: true,
    productionImport: "HOLD",
  };
  return { ...body, artifactSha256: digest(canonical(body)) };
}

function validateSourceBinding(binding) {
  exactKeys(binding, [
    "sourceRestoreReceiptSha256", "sourceCatalogSha256", "databaseIdentitySha256",
    "containerIdentitySha256", "imageIdentitySha256",
  ], "PERFORMANCE_PERSON_ASSESSMENT_BINDING_INVALID", "source binding");
  for (const value of Object.values(binding)) {
    if (!SHA256.test(value ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_BINDING_INVALID", "source binding hash");
  }
  return structuredClone(binding);
}

export function validatePerformancePersonAssessmentPrivateLabPayload(artifact) {
  exactKeys(artifact, [
    "formatVersion", "artifactKind", "mode", "targetProcedure", "contractSha256",
    "sourceBinding", "queryIdentitySha256", "rowCount", "payloadSha256", "payload",
    "containsPersonCodes", "containsPersonIdentityHashes", "containsAssessmentIds",
    "productionImport", "artifactSha256",
  ], "PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_PAYLOAD_INVALID", "artifact shape");
  const { artifactSha256, ...body } = artifact;
  if (artifactSha256 !== digest(canonical(body)) || artifact.formatVersion !== 1
    || artifact.artifactKind !== "yuzhou_hr_performance_person_assessment_lab_payload"
    || artifact.mode !== "lab_rehearsal_only"
    || artifact.targetProcedure !== "materialize_yuzhou_performance_ass_compute_weight_relation_lab"
    || !SHA256.test(artifact.contractSha256 ?? "") || !SHA256.test(artifact.queryIdentitySha256 ?? "")
    || artifact.containsPersonCodes !== false || artifact.containsPersonIdentityHashes !== true
    || artifact.containsAssessmentIds !== true || artifact.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_PAYLOAD_INVALID", "identity or boundary");
  }
  validateSourceBinding(artifact.sourceBinding);
  exactKeys(artifact.payload, ["personAssessments"], "PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_PAYLOAD_INVALID", "procedure payload");
  const rows = validatePrivateRows(artifact.payload.personAssessments, artifact.rowCount);
  if (artifact.payloadSha256 !== digest(canonical({ personAssessments: rows }))) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_PAYLOAD_INVALID", "payload hash");
  }
  return artifact;
}

function sealSafeReceipt({ contractSha256, sourceBinding, catalog, aggregate, state, privatePayload }) {
  const [status, captureCompleteness] = classify(aggregate);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_performance_person_assessment_safe_source_receipt",
    contractSha256,
    sourceBinding,
    queryIdentity: {
      sourceStateSha256: digest(PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_SQL),
      fieldCatalogSha256: digest(PERFORMANCE_PERSON_ASSESSMENT_FIELD_CATALOG_SQL),
      safeAggregateSha256: digest(PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL),
      privateRowsSha256: digest(PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL),
    },
    sourceState: { readOnly: state.databaseReadOnly, runtimeStatus: "bound_healthy_isolated_source", catalogStatus: "exact_required_fields_observed" },
    etlAuthority: structuredClone(state.authority),
    observedFieldCatalogSha256: digest(canonical(catalog)),
    safeCounts: aggregate,
    status,
    captureCompleteness,
    privateLabPayload: {
      rowCount: privatePayload.rowCount,
      payloadSha256: privatePayload.payloadSha256,
      artifactSha256: privatePayload.artifactSha256,
      mode: privatePayload.mode,
    },
    containsPersonCodes: false,
    containsAssessmentValues: false,
    containsNames: false,
    containsCredentials: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function validatePerformancePersonAssessmentSafeSourceReceipt(receipt) {
  exactKeys(receipt, [
    "formatVersion", "artifactKind", "contractSha256", "sourceBinding", "queryIdentity",
    "sourceState", "etlAuthority", "observedFieldCatalogSha256", "safeCounts", "status",
    "captureCompleteness", "privateLabPayload", "containsPersonCodes", "containsAssessmentValues",
    "containsNames", "containsCredentials", "compatibilityCredit", "productionImport", "receiptSha256",
  ], "PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "receipt shape");
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body)) || receipt.formatVersion !== 1
    || receipt.artifactKind !== "yuzhou_hr_performance_person_assessment_safe_source_receipt"
    || !SHA256.test(receipt.contractSha256 ?? "") || !SHA256.test(receipt.observedFieldCatalogSha256 ?? "")
    || receipt.sourceState?.readOnly !== true || receipt.sourceState?.runtimeStatus !== "bound_healthy_isolated_source"
    || receipt.sourceState?.catalogStatus !== "exact_required_fields_observed"
    || receipt.containsPersonCodes !== false || receipt.containsAssessmentValues !== false
    || receipt.containsNames !== false || receipt.containsCredentials !== false
    || receipt.compatibilityCredit !== 0 || receipt.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "identity or safety boundary");
  }
  validateSourceBinding(receipt.sourceBinding);
  exactKeys(receipt.queryIdentity, ["sourceStateSha256", "fieldCatalogSha256", "safeAggregateSha256", "privateRowsSha256"], "PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "query identity");
  for (const value of Object.values(receipt.queryIdentity)) if (!SHA256.test(value ?? "")) fail("PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "query hash");
  validateAggregate(receipt.safeCounts);
  const [expectedStatus, expectedCompleteness] = classify(receipt.safeCounts);
  if (receipt.status !== expectedStatus || receipt.captureCompleteness !== expectedCompleteness) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "derived status");
  }
  exactKeys(receipt.privateLabPayload, ["rowCount", "payloadSha256", "artifactSha256", "mode"], "PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "private payload receipt");
  count(receipt.privateLabPayload.rowCount, "PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "payload rows");
  if (receipt.privateLabPayload.rowCount !== receipt.safeCounts.loadableRows
    || !SHA256.test(receipt.privateLabPayload.payloadSha256 ?? "")
    || !SHA256.test(receipt.privateLabPayload.artifactSha256 ?? "")
    || receipt.privateLabPayload.mode !== "lab_rehearsal_only") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT_INVALID", "private payload binding");
  }
  validateAuthority({
    personTableExists: true,
    assessmentcodeTableExists: true,
    databaseReadOnly: receipt.sourceState.readOnly,
    databaseIdentity: "receipt_hash_only",
    authority: receipt.etlAuthority,
    containerIdentitySha256: receipt.sourceBinding.containerIdentitySha256,
    imageIdentitySha256: receipt.sourceBinding.imageIdentitySha256,
    healthy: true,
    project: SOURCE_COMPOSE_PROJECT,
  });
  return receipt;
}

export function capturePerformancePersonAssessmentSourceAdapter(input, { probe }) {
  exactKeys(input, [
    "repositoryRoot", "contractPath", "sourceRestoreReceiptPath", "sourceRestoreReceiptSha256",
    "sourceContainer", "databaseAlias", "privatePayloadPath", "safeReceiptPath",
  ], "PERFORMANCE_PERSON_ASSESSMENT_CAPTURE_INVALID", "capture input");
  if (!SHA256.test(input.sourceRestoreReceiptSha256 ?? "") || !DATABASE.test(input.databaseAlias ?? "") || !CONTAINER.test(input.sourceContainer ?? "")) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_CAPTURE_INVALID", "source identity");
  }
  const payloadPath = privateOutputPath(input.privatePayloadPath, "private payload");
  const receiptPath = privateOutputPath(input.safeReceiptPath, "safe receipt");
  const restorePath = privateInputFile(input.sourceRestoreReceiptPath, "source restore receipt");
  if (sourceRestoreReceiptFileHash(restorePath) !== input.sourceRestoreReceiptSha256) {
    fail("PERFORMANCE_PERSON_ASSESSMENT_SOURCE_RECEIPT_DRIFT", "receipt bytes");
  }
  const sourceReceipt = validateSourceRestoreReceipt(readJson(readFileSync(restorePath, "utf8"), "PERFORMANCE_PERSON_ASSESSMENT_SOURCE_RECEIPT_INVALID", "receipt JSON"));
  const { contractSha256 } = validateContract(input.contractPath, input.repositoryRoot);
  const evidence = probe.inspect(input);
  if (!object(evidence?.state) || evidence.state.databaseIdentity !== input.databaseAlias
    || digest(input.databaseAlias) !== sourceReceipt.identities.databaseSha256
    || evidence.state.containerIdentitySha256 !== sourceReceipt.identities.containerSha256
    || evidence.state.imageIdentitySha256 !== sourceReceipt.identities.imageSha256
    || sourceReceipt.state.readOnly !== true
    || sourceReceipt.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_ASSESSMENT_SOURCE_IDENTITY_INVALID", "receipt and live source differ");
  }
  validateAuthority(evidence.state);
  const catalog = parseCatalog(evidence.catalog.map(row => [
    row.table, row.column, row.sqlType, row.maxLength, row.precision, row.scale,
    row.nullable ? 1 : 0, row.computed ? 1 : 0,
  ].join("|")).join("\n"));
  const aggregate = validateAggregate(evidence.aggregate);
  const rows = validatePrivateRows(evidence.privateRows, aggregate.loadableRows);
  const sourceBinding = {
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceCatalogSha256: sourceReceipt.identities.catalogSha256,
    databaseIdentitySha256: sourceReceipt.identities.databaseSha256,
    containerIdentitySha256: sourceReceipt.identities.containerSha256,
    imageIdentitySha256: sourceReceipt.identities.imageSha256,
  };
  const privatePayload = sealPrivatePayload({
    contractSha256,
    sourceBinding,
    queryIdentitySha256: digest(PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL),
    rows,
  });
  const safeReceipt = sealSafeReceipt({ contractSha256, sourceBinding, catalog, aggregate, state: evidence.state, privatePayload });
  validatePerformancePersonAssessmentPrivateLabPayload(privatePayload);
  validatePerformancePersonAssessmentSafeSourceReceipt(safeReceipt);
  writeFileSync(payloadPath, canonical(privatePayload), { flag: "wx", mode: 0o600 });
  chmodSync(payloadPath, 0o600);
  writeFileSync(receiptPath, canonical(safeReceipt), { flag: "wx", mode: 0o600 });
  chmodSync(receiptPath, 0o600);
  return {
    status: safeReceipt.status,
    safeCounts: structuredClone(safeReceipt.safeCounts),
    privatePayloadSha256: digest(canonical(privatePayload)),
    safeReceiptSha256: digest(canonical(safeReceipt)),
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const allowed = new Set([
    "--repository-root", "--contract", "--source-receipt", "--source-receipt-sha",
    "--source-container", "--database", "--etl-env", "--private-payload", "--safe-receipt",
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || Object.hasOwn(values, key) || index + 1 >= argv.length) {
      fail("PERFORMANCE_PERSON_ASSESSMENT_ARGUMENT_INVALID", key ?? "missing");
    }
    values[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--contract" || key === "--repository-root") continue;
    if (!values[key]) fail("PERFORMANCE_PERSON_ASSESSMENT_ARGUMENT_INVALID", key);
  }
  return values;
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolve(values["--repository-root"] ?? resolve(import.meta.dirname, "../.."));
  const probe = createDefaultPerformancePersonAssessmentSourceProbe({ etlEnvFile: resolve(values["--etl-env"]) });
  const result = capturePerformancePersonAssessmentSourceAdapter({
    repositoryRoot,
    contractPath: resolve(values["--contract"] ?? DEFAULT_CONTRACT),
    sourceRestoreReceiptPath: resolve(values["--source-receipt"]),
    sourceRestoreReceiptSha256: values["--source-receipt-sha"],
    sourceContainer: values["--source-container"],
    databaseAlias: values["--database"],
    privatePayloadPath: resolve(values["--private-payload"]),
    safeReceiptPath: resolve(values["--safe-receipt"]),
  }, { probe });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.code ?? "PERFORMANCE_PERSON_ASSESSMENT_SOURCE_ADAPTER_FAILED"}\n`);
    process.exitCode = 1;
  });
}
