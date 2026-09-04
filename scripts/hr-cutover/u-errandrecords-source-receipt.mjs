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
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sourceRestoreReceiptFileHash,
  validateSourceRestoreReceipt,
} from "./source-restore-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const DATABASE = /^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "sourceRestoreReceiptSha256",
  "sourceCatalogSha256",
  "mappingContractSha256",
  "databaseIdentitySha256",
  "queryIdentitySha256",
  "operationMode",
  "sourceObject",
  "columns",
  "serverTimezone",
  "sourceState",
  "etlAuthority",
  "productionImport",
];
const DEFAULT_MAPPING_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-u-errandrecords-modern-map-v1.json",
);

// One sqlcmd batch returns one aggregate-only row. The first SELECT only assigns
// aggregate variables so COUNT_BIG(*) covers every errand row, including a
// structurally unexpected NULL person. No source row value is returned.
export const U_ERRANDRECORDS_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
DECLARE @total_rows bigint,@matched_rows bigint,@missing_person_rows bigint,@missing_department_rows bigint;
SELECT
  @total_rows=COUNT_BIG(*),
  @matched_rows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL AND d.department IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @missing_person_rows=COALESCE(SUM(CASE WHEN p.person IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @missing_department_rows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL AND d.department IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)
FROM dbo.errand e
LEFT JOIN dbo.person p ON p.person=e.person
LEFT JOIN dbo.departmentcode d ON d.department=p.department;
SELECT
  CONVERT(varchar(30),@total_rows),
  CONVERT(varchar(30),@matched_rows),
  CONVERT(varchar(30),@missing_person_rows),
  CONVERT(varchar(30),@missing_department_rows),
  TYPE_NAME(start_column.user_type_id),
  CONVERT(varchar(1),start_column.is_nullable),
  TYPE_NAME(end_column.user_type_id),
  CONVERT(varchar(1),end_column.is_nullable),
  TYPE_NAME(days_column.user_type_id),
  CONVERT(varchar(1),days_column.is_nullable),
  CONVERT(varchar(8),DATEPART(TZOFFSET,SYSDATETIMEOFFSET())),
  CONVERT(varchar(1),sd.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases sd
LEFT JOIN sys.columns start_column ON start_column.object_id=OBJECT_ID(N'dbo.errand') AND start_column.name=N'startdate'
LEFT JOIN sys.columns end_column ON end_column.object_id=OBJECT_ID(N'dbo.errand') AND end_column.name=N'enddate'
LEFT JOIN sys.columns days_column ON days_column.object_id=OBJECT_ID(N'dbo.errand') AND days_column.name=N'days'
WHERE sd.name=DB_NAME();`;

export class UErrandrecordsSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "UErrandrecordsSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new UErrandrecordsSourceReceiptError(code, detail);
};
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, label) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  ) {
    fail(code, label);
  }
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, label);
};
const requireCount = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", label);
  }
};

function privateFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("U_ERRANDRECORDS_SOURCE_FILE_UNSAFE", label);
  }
  let link;
  let actual;
  let info;
  try {
    link = lstatSync(path);
    actual = realpathSync(path);
    info = statSync(actual);
  } catch {
    fail("U_ERRANDRECORDS_SOURCE_FILE_UNSAFE", `${label}:missing`);
  }
  if (
    link.isSymbolicLink() ||
    !info.isFile() ||
    info.nlink !== 1 ||
    (info.mode & 0o777) !== 0o600
  ) {
    fail("U_ERRANDRECORDS_SOURCE_FILE_UNSAFE", label);
  }
  return actual;
}

function parseJson(raw, code, label) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(code, label);
  }
}

function readMappingContract(path) {
  const raw = readFileSync(path);
  const contract = parseJson(
    raw,
    "U_ERRANDRECORDS_MAPPING_CONTRACT_INVALID",
    "mapping JSON",
  );
  if (
    contract?.mappingKind !== "yuzhou_hr_u_errandrecords_modern_equivalence" ||
    contract?.canonicalFamily !== "u_errandrecords" ||
    contract?.modernContract?.legacyStorageBinding?.sourceTable !== "dbo.errand" ||
    contract?.productionImport !== "HOLD"
  ) {
    fail("U_ERRANDRECORDS_MAPPING_CONTRACT_INVALID", "mapping identity or HOLD boundary");
  }
  return { contract, sha256: digest(raw) };
}

function parseEnv(path) {
  const result = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      fail("U_ERRANDRECORDS_ETL_LOGIN_INVALID", "ETL envelope is invalid");
    }
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  if (
    !result.YUZHOU_SQLSERVER_ETL_LOGIN ||
    !result.YUZHOU_SQLSERVER_ETL_PASSWORD ||
    !DATABASE.test(result.YUZHOU_SQLSERVER_DATABASE ?? "") ||
    String(result.YUZHOU_SQLSERVER_ETL_LOGIN).toLowerCase() === "sa"
  ) {
    fail("U_ERRANDRECORDS_ETL_LOGIN_INVALID", "minimum read-only ETL envelope required");
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    input: options.input,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail(
      options.code ?? "U_ERRANDRECORDS_SOURCE_PROBE_FAILED",
      options.detail ?? "aggregate source probe failed",
    );
  }
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function parseCount(value, label) {
  if (!/^[0-9]+$/u.test(value ?? "")) {
    fail("U_ERRANDRECORDS_SOURCE_PROBE_INVALID", label);
  }
  const count = Number(value);
  requireCount(count, label);
  return count;
}

function parseAggregateOutput(output, expectedDatabase) {
  const lines = output.split("\n").filter(Boolean);
  if (lines.length !== 1) {
    fail("U_ERRANDRECORDS_SOURCE_PROBE_INVALID", "one aggregate row required");
  }
  const fields = lines[0].split("|").map((value) => value.trim());
  if (fields.length !== 20) {
    fail("U_ERRANDRECORDS_SOURCE_PROBE_INVALID", "aggregate row shape");
  }
  const offsetMinutes = Number(fields[10]);
  if (
    !Number.isInteger(offsetMinutes) ||
    offsetMinutes < -840 ||
    offsetMinutes > 840 ||
    fields[5] !== "0" ||
    fields[7] !== "0" ||
    fields[9] !== "1" ||
    fields[11] !== "1" ||
    fields[12] !== expectedDatabase ||
    fields.slice(13).some((value) => !/^[01]$/u.test(value))
  ) {
    fail("U_ERRANDRECORDS_SOURCE_PROBE_INVALID", "timezone, read-only, or database identity");
  }
  return {
    totalRows: parseCount(fields[0], "total rows"),
    matchedInnerJoinRows: parseCount(fields[1], "matched inner-join rows"),
    missingPersonRows: parseCount(fields[2], "missing person rows"),
    missingDepartmentRows: parseCount(fields[3], "missing department rows"),
    startSqlType: fields[4],
    startNullable: fields[5] === "1",
    endSqlType: fields[6],
    endNullable: fields[7] === "1",
    daysSqlType: fields[8],
    daysNullable: fields[9] === "1",
    serverUtcOffsetMinutes: offsetMinutes,
    databaseReadOnly: true,
    databaseIdentity: fields[12],
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: fields[13] === "1",
      dbDatareader: fields[14] === "1",
      viewDefinition: fields[15] === "1",
      insert: fields[16] === "1",
      update: fields[17] === "1",
      delete: fields[18] === "1",
      execute: fields[19] === "1",
    },
  };
}

export function createDefaultUErrandrecordsSourceProbe({ etlEnvFile }) {
  const credentialPath = privateFile(etlEnvFile, "ETL envelope");
  const env = parseEnv(credentialPath);
  return {
    inspectAggregate({ sourceContainer, databaseAlias }) {
      if (
        !CONTAINER.test(sourceContainer ?? "") ||
        !DATABASE.test(databaseAlias ?? "") ||
        env.YUZHOU_SQLSERVER_DATABASE !== databaseAlias
      ) {
        fail("U_ERRANDRECORDS_SOURCE_IDENTITY_INVALID", "source container or database binding");
      }
      const output = run(
        "docker",
        [
          "exec",
          "-i",
          sourceContainer,
          "bash",
          "-lc",
          'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d "$2" -h -1 -W -s "|" -Q "$3"',
          "q",
          env.YUZHOU_SQLSERVER_ETL_LOGIN,
          databaseAlias,
          U_ERRANDRECORDS_SAFE_AGGREGATE_SQL,
        ],
        {
          input: `${env.YUZHOU_SQLSERVER_ETL_PASSWORD}\n`,
          code: "U_ERRANDRECORDS_SOURCE_PROBE_FAILED",
          detail: "minimum read-only aggregate probe failed",
        },
      );
      return parseAggregateOutput(output, databaseAlias);
    },
  };
}

export function sealUErrandrecordsSourceReceipt(input) {
  const body = structuredClone(input);
  exactKeys(body, BODY_KEYS, "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "receipt body shape");
  if (
    body.formatVersion !== 1 ||
    body.artifactKind !== "yuzhou_hr_u_errandrecords_safe_source_receipt" ||
    body.operationMode !== "read_only_aggregate" ||
    body.productionImport !== "HOLD"
  ) {
    fail("U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "receipt identity or HOLD boundary");
  }
  for (const field of [
    "sourceRestoreReceiptSha256",
    "sourceCatalogSha256",
    "mappingContractSha256",
    "databaseIdentitySha256",
    "queryIdentitySha256",
  ]) {
    requireSha(body[field], "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", field);
  }
  exactKeys(
    body.sourceObject,
    [
      "schema",
      "table",
      "totalRows",
      "matchedInnerJoinRows",
      "missingPersonRows",
      "missingDepartmentRows",
      "omittedInnerJoinRows",
    ],
    "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID",
    "source object shape",
  );
  if (body.sourceObject.schema !== "dbo" || body.sourceObject.table !== "errand") {
    fail("U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "source object identity");
  }
  for (const field of [
    "totalRows",
    "matchedInnerJoinRows",
    "missingPersonRows",
    "missingDepartmentRows",
    "omittedInnerJoinRows",
  ]) {
    requireCount(body.sourceObject[field], field);
  }
  if (
    body.sourceObject.omittedInnerJoinRows !==
      body.sourceObject.missingPersonRows + body.sourceObject.missingDepartmentRows ||
    body.sourceObject.totalRows !==
      body.sourceObject.matchedInnerJoinRows + body.sourceObject.omittedInnerJoinRows
  ) {
    fail("U_ERRANDRECORDS_SOURCE_COUNT_MISMATCH", "inner-join conservation");
  }
  exactKeys(body.columns, ["startdate", "enddate", "days"], "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "columns shape");
  for (const field of ["startdate", "enddate", "days"]) {
    exactKeys(body.columns[field], ["sqlType", "nullable"], "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", `${field} shape`);
    const expected = field === "days" ? { sqlType: "int", nullable: true } : { sqlType: "smalldatetime", nullable: false };
    if (body.columns[field].sqlType !== expected.sqlType || body.columns[field].nullable !== expected.nullable) {
      fail("U_ERRANDRECORDS_SOURCE_COLUMN_DRIFT", field);
    }
  }
  exactKeys(
    body.serverTimezone,
    ["currentUtcOffsetMinutes", "metadataSource", "interpretationStatus"],
    "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID",
    "server timezone shape",
  );
  if (
    !Number.isInteger(body.serverTimezone.currentUtcOffsetMinutes) ||
    body.serverTimezone.currentUtcOffsetMinutes < -840 ||
    body.serverTimezone.currentUtcOffsetMinutes > 840 ||
    body.serverTimezone.metadataSource !== "SYSDATETIMEOFFSET" ||
    body.serverTimezone.interpretationStatus !== "current_offset_only_requires_business_review"
  ) {
    fail("U_ERRANDRECORDS_SOURCE_TIMEZONE_INVALID", "server timezone metadata");
  }
  exactKeys(body.sourceState, ["readOnly"], "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "source state shape");
  if (body.sourceState.readOnly !== true) {
    fail("U_ERRANDRECORDS_SOURCE_NOT_READ_ONLY", "source database");
  }
  exactKeys(
    body.etlAuthority,
    ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"],
    "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID",
    "ETL authority shape",
  );
  if (
    body.etlAuthority.loginSucceeded !== true ||
    body.etlAuthority.sysadmin !== false ||
    body.etlAuthority.dbDatareader !== true ||
    body.etlAuthority.viewDefinition !== true ||
    body.etlAuthority.insert !== false ||
    body.etlAuthority.update !== false ||
    body.etlAuthority.delete !== false ||
    body.etlAuthority.execute !== false
  ) {
    fail("U_ERRANDRECORDS_ETL_AUTHORITY_INVALID", "minimum read-only authority required");
  }
  return { ...body, canonicalSha256: digest(canonical(body)) };
}

export function validateUErrandrecordsSourceReceipt(receipt) {
  exactKeys(
    receipt,
    [...BODY_KEYS, "canonicalSha256"],
    "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID",
    "sealed receipt shape",
  );
  const { canonicalSha256, ...body } = receipt;
  const sealed = sealUErrandrecordsSourceReceipt(body);
  if (canonicalSha256 !== sealed.canonicalSha256) {
    fail("U_ERRANDRECORDS_SOURCE_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  }
  return receipt;
}

export function captureUErrandrecordsSourceReceipt(input, { probe }) {
  exactKeys(
    input,
    [
      "sourceRestoreReceiptPath",
      "sourceRestoreReceiptSha256",
      "mappingContractPath",
      "sourceContainer",
      "databaseAlias",
      "receiptPath",
    ],
    "U_ERRANDRECORDS_SOURCE_CAPTURE_INVALID",
    "capture input",
  );
  requireSha(
    input.sourceRestoreReceiptSha256,
    "U_ERRANDRECORDS_SOURCE_CAPTURE_INVALID",
    "source restore receipt hash",
  );
  const restoreReceiptPath = privateFile(
    input.sourceRestoreReceiptPath,
    "source restore receipt",
  );
  if (sourceRestoreReceiptFileHash(restoreReceiptPath) !== input.sourceRestoreReceiptSha256) {
    fail("U_ERRANDRECORDS_SOURCE_RESTORE_RECEIPT_DRIFT", "source restore receipt bytes");
  }
  const sourceRestoreReceipt = validateSourceRestoreReceipt(
    parseJson(
      readFileSync(restoreReceiptPath, "utf8"),
      "U_ERRANDRECORDS_SOURCE_RESTORE_RECEIPT_INVALID",
      "source restore receipt JSON",
    ),
  );
  const mapping = readMappingContract(input.mappingContractPath);
  const aggregate = probe.inspectAggregate(input);
  if (
    aggregate.databaseReadOnly !== true ||
    aggregate.databaseIdentity !== input.databaseAlias ||
    digest(input.databaseAlias) !== sourceRestoreReceipt.identities.databaseSha256
  ) {
    fail("U_ERRANDRECORDS_SOURCE_IDENTITY_INVALID", "source receipt/live database binding");
  }
  const omittedInnerJoinRows = aggregate.missingPersonRows + aggregate.missingDepartmentRows;
  const receipt = sealUErrandrecordsSourceReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_safe_source_receipt",
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceCatalogSha256: sourceRestoreReceipt.identities.catalogSha256,
    mappingContractSha256: mapping.sha256,
    databaseIdentitySha256: sourceRestoreReceipt.identities.databaseSha256,
    queryIdentitySha256: digest(U_ERRANDRECORDS_SAFE_AGGREGATE_SQL),
    operationMode: "read_only_aggregate",
    sourceObject: {
      schema: "dbo",
      table: "errand",
      totalRows: aggregate.totalRows,
      matchedInnerJoinRows: aggregate.matchedInnerJoinRows,
      missingPersonRows: aggregate.missingPersonRows,
      missingDepartmentRows: aggregate.missingDepartmentRows,
      omittedInnerJoinRows,
    },
    columns: {
      startdate: { sqlType: aggregate.startSqlType, nullable: aggregate.startNullable },
      enddate: { sqlType: aggregate.endSqlType, nullable: aggregate.endNullable },
      days: { sqlType: aggregate.daysSqlType, nullable: aggregate.daysNullable },
    },
    serverTimezone: {
      currentUtcOffsetMinutes: aggregate.serverUtcOffsetMinutes,
      metadataSource: "SYSDATETIMEOFFSET",
      interpretationStatus: "current_offset_only_requires_business_review",
    },
    sourceState: { readOnly: true },
    etlAuthority: aggregate.etlAuthority,
    productionImport: "HOLD",
  });
  writeFileSync(input.receiptPath, canonical(receipt), { flag: "wx", mode: 0o600 });
  chmodSync(input.receiptPath, 0o600);
  return {
    receipt,
    receiptSha256: digest(canonical(receipt)),
    productionImport: "HOLD",
  };
}

export function verifyUErrandrecordsSourceReceiptFile(input) {
  exactKeys(
    input,
    [
      "receiptPath",
      "receiptSha256",
      "sourceRestoreReceiptSha256",
      "mappingContractSha256",
    ],
    "U_ERRANDRECORDS_SOURCE_VERIFY_INVALID",
    "verify input",
  );
  for (const field of ["receiptSha256", "sourceRestoreReceiptSha256", "mappingContractSha256"]) {
    requireSha(input[field], "U_ERRANDRECORDS_SOURCE_VERIFY_INVALID", field);
  }
  const receiptPath = privateFile(input.receiptPath, "u_errandrecords receipt");
  const raw = readFileSync(receiptPath);
  if (digest(raw) !== input.receiptSha256) {
    fail("U_ERRANDRECORDS_SOURCE_RECEIPT_HASH_MISMATCH", "receipt file bytes");
  }
  const receipt = validateUErrandrecordsSourceReceipt(
    parseJson(raw, "U_ERRANDRECORDS_SOURCE_RECEIPT_INVALID", "receipt JSON"),
  );
  if (
    receipt.sourceRestoreReceiptSha256 !== input.sourceRestoreReceiptSha256 ||
    receipt.mappingContractSha256 !== input.mappingContractSha256
  ) {
    fail("U_ERRANDRECORDS_SOURCE_BINDING_MISMATCH", "source restore or mapping identity");
  }
  return { receipt, receiptSha256: input.receiptSha256, productionImport: "HOLD" };
}

function args(argv) {
  const result = {};
  const allowed = new Set([
    "--source-receipt",
    "--source-receipt-sha",
    "--mapping-contract",
    "--source-container",
    "--database",
    "--etl-env",
    "--receipt",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || index + 1 >= argv.length || Object.hasOwn(result, key)) {
      fail("U_ERRANDRECORDS_SOURCE_ARGUMENT_INVALID", key);
    }
    result[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--mapping-contract") continue;
    if (!result[key]) fail("U_ERRANDRECORDS_SOURCE_ARGUMENT_MISSING", key);
  }
  return result;
}

async function main() {
  const input = args(process.argv.slice(2));
  const probe = createDefaultUErrandrecordsSourceProbe({
    etlEnvFile: resolve(input["--etl-env"]),
  });
  const result = captureUErrandrecordsSourceReceipt(
    {
      sourceRestoreReceiptPath: resolve(input["--source-receipt"]),
      sourceRestoreReceiptSha256: input["--source-receipt-sha"],
      mappingContractPath: resolve(input["--mapping-contract"] ?? DEFAULT_MAPPING_CONTRACT),
      sourceContainer: input["--source-container"],
      databaseAlias: input["--database"],
      receiptPath: resolve(input["--receipt"]),
    },
    { probe },
  );
  process.stdout.write(
    `${JSON.stringify({
      status: "U_ERRANDRECORDS_SOURCE_RECEIPT_CAPTURED",
      receiptSha256: result.receiptSha256,
      productionImport: "HOLD",
    })}\n`,
  );
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "U_ERRANDRECORDS_SOURCE_RECEIPT_FAILED"}\n`);
    process.exitCode = 1;
  });
}
