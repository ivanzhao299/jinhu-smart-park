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
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const ENV_KEYS = [
  "YUZHOU_SQLSERVER_DATABASE",
  "YUZHOU_SQLSERVER_ETL_LOGIN",
  "YUZHOU_SQLSERVER_ETL_PASSWORD",
];
const COUNT_KEYS = [
  "assessmentRows",
  "assessmentNonblankPersonRows",
  "assessmentBlankPersonRows",
  "personRows",
  "personNonblankRows",
  "matchedAssessmentRows",
  "orphanAssessmentRows",
  "orphanDistinctPersonCodes",
  "resolvedNameProjectionRows",
  "blankNameProjectionRows",
  "assessmentInvalidPersonCodeRows",
  "personInvalidPersonCodeRows",
  "assessmentLeadingSpaceRows",
  "assessmentTrailingSpaceRows",
  "personLeadingSpaceRows",
  "personTrailingSpaceRows",
  "maximumPersonCodeBytes",
  "caseFoldCollisionGroups",
  "caseFoldCollisionVariants",
  "trimCollisionGroups",
  "trimCollisionVariants",
  "normalizedCollisionGroups",
  "normalizedCollisionVariants",
  "queryablePersonCodes",
  "queryableRows",
  "queryableMatchedRows",
  "queryableOrphanRows",
  "maximumRowsPerPerson",
  "personCodesOverPage20",
  "page20TotalPages",
  "webAssProjectedRows",
  "webAssessmentQueryProjectedRows",
];
const HASH_KEYS = [
  "sourceNameProjectionSetSha256",
  "webAssProjectionSetSha256",
  "webAssessmentQueryProjectionSetSha256",
  "paginationSetSha256",
];
const FLAG_KEYS = [
  "columnContractValid",
  "primaryKeyContractValid",
  "databaseReadOnly",
  "sysadmin",
  "dbDatareader",
  "viewDefinition",
  "insert",
  "update",
  "delete",
  "execute",
];
const BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "sourceRestoreReceiptSha256",
  "sourceCatalogSha256",
  "routineContractSha256",
  "databaseIdentitySha256",
  "queryIdentitySha256",
  "operationMode",
  "sourceObjects",
  "safeFacts",
  "conservation",
  "currentSnapshotEquivalence",
  "promotionGate",
  "sourceState",
  "etlAuthority",
  "privacy",
  "status",
  "compatibilityCredit",
  "productionImport",
];
const DEFAULT_ROUTINE_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-performance-query-routine-parity-v1.json",
);

// This fixed batch returns exactly one aggregate-only row. Source codes and
// names participate only inside SQL Server hashes; no personal value is
// selected or written to the receipt.
export const LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL = `SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;

DECLARE @assessmentRows bigint,@assessmentNonblankRows bigint,@assessmentBlankRows bigint;
DECLARE @personRows bigint,@personNonblankRows bigint,@matchedRows bigint,@orphanRows bigint,@orphanCodes bigint;
DECLARE @resolvedNameRows bigint,@blankNameRows bigint,@assessmentInvalidRows bigint,@personInvalidRows bigint;
DECLARE @assessmentLeadingRows bigint,@assessmentTrailingRows bigint,@personLeadingRows bigint,@personTrailingRows bigint;
DECLARE @maxCodeBytes bigint,@queryableCodes bigint,@queryableRows bigint,@queryableMatchedRows bigint,@queryableOrphanRows bigint,@maxRowsPerPerson bigint,@codesOverPage20 bigint,@page20TotalPages bigint;
DECLARE @caseGroups bigint,@caseVariants bigint,@trimGroups bigint,@trimVariants bigint,@normalizedGroups bigint,@normalizedVariants bigint;
DECLARE @webAssRows bigint,@webAssessmentQueryRows bigint;
DECLARE @sourceNameJson nvarchar(max),@webAssJson nvarchar(max),@webAssessmentQueryJson nvarchar(max),@paginationJson nvarchar(max);
DECLARE @sourceNameHash varchar(64),@webAssHash varchar(64),@webAssessmentQueryHash varchar(64),@paginationHash varchar(64);

SELECT
  @assessmentRows=COUNT_BIG(*),
  @assessmentNonblankRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @assessmentBlankRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(person)),'') IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @assessmentInvalidRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL AND (DATALENGTH(person)>10 OR person COLLATE Latin1_General_100_BIN2 LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @assessmentLeadingRows=COALESCE(SUM(CASE WHEN person IS NOT NULL AND DATALENGTH(person)>DATALENGTH(LTRIM(person)) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @assessmentTrailingRows=COALESCE(SUM(CASE WHEN person IS NOT NULL AND DATALENGTH(person)>DATALENGTH(RTRIM(person)) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)
FROM dbo.assessmentmaster;

SELECT
  @personRows=COUNT_BIG(*),
  @personNonblankRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @personInvalidRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL AND (DATALENGTH(person)>10 OR person COLLATE Latin1_General_100_BIN2 LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @personLeadingRows=COALESCE(SUM(CASE WHEN DATALENGTH(person)>DATALENGTH(LTRIM(person)) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @personTrailingRows=COALESCE(SUM(CASE WHEN DATALENGTH(person)>DATALENGTH(RTRIM(person)) THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)
FROM dbo.person;

SELECT
  @matchedRows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @orphanRows=COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL AND p.person IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @resolvedNameRows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL AND NULLIF(LTRIM(RTRIM(p.name)),'') IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @blankNameRows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL AND NULLIF(LTRIM(RTRIM(p.name)),'') IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)
FROM dbo.assessmentmaster a
LEFT JOIN dbo.person p ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL;

SELECT @orphanCodes=COUNT_BIG(*) FROM (
  SELECT a.person FROM dbo.assessmentmaster a
  LEFT JOIN dbo.person p ON p.person=a.person
  WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL AND p.person IS NULL
  GROUP BY a.person
) orphan_codes;

SELECT @maxCodeBytes=COALESCE(MAX(CONVERT(bigint,DATALENGTH(code))),0) FROM (
  SELECT person AS code FROM dbo.assessmentmaster WHERE person IS NOT NULL
  UNION ALL
  SELECT person AS code FROM dbo.person
) all_codes;

WITH query_groups AS (
  SELECT a.person,COUNT_BIG(*) AS row_count
  FROM dbo.assessmentmaster a
  WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
    AND DATALENGTH(a.person)<=10
    AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2
  GROUP BY a.person
)
SELECT
  @queryableCodes=COUNT_BIG(*),
  @queryableRows=COALESCE(SUM(row_count),0),
  @maxRowsPerPerson=COALESCE(MAX(row_count),0),
  @codesOverPage20=COALESCE(SUM(CASE WHEN row_count>20 THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @page20TotalPages=COALESCE(SUM((row_count+19)/20),0)
FROM query_groups;

SELECT
  @queryableMatchedRows=COALESCE(SUM(CASE WHEN p.person IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0),
  @queryableOrphanRows=COALESCE(SUM(CASE WHEN p.person IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),0)
FROM dbo.assessmentmaster a
LEFT JOIN dbo.person p ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2;

WITH raw_codes AS (
  SELECT person AS code FROM dbo.assessmentmaster WHERE NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL
  UNION ALL
  SELECT person AS code FROM dbo.person WHERE NULLIF(LTRIM(RTRIM(person)),'') IS NOT NULL
), variants AS (
  SELECT MIN(code) AS code,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(8000),code)),2)) AS raw_hash
  FROM raw_codes
  GROUP BY LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(8000),code)),2))
), keyed AS (
  SELECT raw_hash,
    LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(8000),LOWER(code))),2)) AS case_key,
    LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(8000),LTRIM(RTRIM(code)))),2)) AS trim_key,
    LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(8000),LOWER(LTRIM(RTRIM(code))))),2)) AS normalized_key
  FROM variants
), case_collisions AS (
  SELECT COUNT_BIG(*) AS variant_count FROM keyed GROUP BY case_key HAVING COUNT_BIG(*)>1
), trim_collisions AS (
  SELECT COUNT_BIG(*) AS variant_count FROM keyed GROUP BY trim_key HAVING COUNT_BIG(*)>1
), normalized_collisions AS (
  SELECT COUNT_BIG(*) AS variant_count FROM keyed GROUP BY normalized_key HAVING COUNT_BIG(*)>1
)
SELECT
  @caseGroups=(SELECT COUNT_BIG(*) FROM case_collisions),
  @caseVariants=COALESCE((SELECT SUM(variant_count) FROM case_collisions),0),
  @trimGroups=(SELECT COUNT_BIG(*) FROM trim_collisions),
  @trimVariants=COALESCE((SELECT SUM(variant_count) FROM trim_collisions),0),
  @normalizedGroups=(SELECT COUNT_BIG(*) FROM normalized_collisions),
  @normalizedVariants=COALESCE((SELECT SUM(variant_count) FROM normalized_collisions),0);

SELECT @webAssRows=COUNT_BIG(*)
FROM dbo.person p
LEFT JOIN dbo.assessmentmaster a ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2;

SELECT @webAssessmentQueryRows=COUNT_BIG(*)
FROM dbo.assessmentmaster a
LEFT JOIN dbo.person p ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2;

SET @sourceNameJson=(SELECT
  a.person AS sourcePersonCode,p.name AS employeeDisplayName,a.selfgrade AS sourceSelfGrade,
  a.assgrade AS sourceAssGrade,a.itemvalue AS sourceItemValue,a.totalvalue AS sourceTotalValue
FROM dbo.assessmentmaster a
LEFT JOIN dbo.person p ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
ORDER BY a.person COLLATE Latin1_General_100_BIN2,a.asssessionid DESC,a.id ASC
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @webAssJson=(SELECT
  a.person AS sourcePersonCode,p.name AS employeeDisplayName,a.selfgrade AS sourceSelfGrade,
  a.assgrade AS sourceAssGrade,a.itemvalue AS sourceItemValue,a.totalvalue AS sourceTotalValue
FROM dbo.person p
LEFT JOIN dbo.assessmentmaster a ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2
ORDER BY a.person COLLATE Latin1_General_100_BIN2,a.asssessionid DESC,a.id ASC
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @webAssessmentQueryJson=(SELECT
  a.person AS sourcePersonCode,p.name AS employeeDisplayName,a.selfgrade AS sourceSelfGrade,
  a.assgrade AS sourceAssGrade,a.itemvalue AS sourceItemValue,a.totalvalue AS sourceTotalValue
FROM dbo.assessmentmaster a
LEFT JOIN dbo.person p ON p.person=a.person
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2
ORDER BY a.person COLLATE Latin1_General_100_BIN2,a.asssessionid DESC,a.id ASC
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @paginationJson=(SELECT
  a.person AS sourcePersonCode,a.asssessionid AS sourceSessionId,a.id AS sourceMasterId
FROM dbo.assessmentmaster a
WHERE NULLIF(LTRIM(RTRIM(a.person)),'') IS NOT NULL
  AND DATALENGTH(a.person)<=10
  AND a.person COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9_-]%' COLLATE Latin1_General_100_BIN2
ORDER BY a.person COLLATE Latin1_General_100_BIN2,a.asssessionid DESC,a.id ASC
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @sourceNameHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@sourceNameJson,N'[]')),2));
SET @webAssHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@webAssJson,N'[]')),2));
SET @webAssessmentQueryHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@webAssessmentQueryJson,N'[]')),2));
SET @paginationHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@paginationJson,N'[]')),2));

SELECT
  CONVERT(varchar(30),@assessmentRows),CONVERT(varchar(30),@assessmentNonblankRows),CONVERT(varchar(30),@assessmentBlankRows),
  CONVERT(varchar(30),@personRows),CONVERT(varchar(30),@personNonblankRows),CONVERT(varchar(30),@matchedRows),
  CONVERT(varchar(30),@orphanRows),CONVERT(varchar(30),@orphanCodes),CONVERT(varchar(30),@resolvedNameRows),
  CONVERT(varchar(30),@blankNameRows),CONVERT(varchar(30),@assessmentInvalidRows),CONVERT(varchar(30),@personInvalidRows),
  CONVERT(varchar(30),@assessmentLeadingRows),CONVERT(varchar(30),@assessmentTrailingRows),
  CONVERT(varchar(30),@personLeadingRows),CONVERT(varchar(30),@personTrailingRows),CONVERT(varchar(30),@maxCodeBytes),
  CONVERT(varchar(30),@caseGroups),CONVERT(varchar(30),@caseVariants),CONVERT(varchar(30),@trimGroups),
  CONVERT(varchar(30),@trimVariants),CONVERT(varchar(30),@normalizedGroups),CONVERT(varchar(30),@normalizedVariants),
  CONVERT(varchar(30),@queryableCodes),CONVERT(varchar(30),@queryableRows),CONVERT(varchar(30),@queryableMatchedRows),CONVERT(varchar(30),@queryableOrphanRows),CONVERT(varchar(30),@maxRowsPerPerson),
  CONVERT(varchar(30),@codesOverPage20),CONVERT(varchar(30),@page20TotalPages),
  CONVERT(varchar(30),@webAssRows),CONVERT(varchar(30),@webAssessmentQueryRows),
  @sourceNameHash,@webAssHash,@webAssessmentQueryHash,@paginationHash,
  CONVERT(varchar(1),CASE WHEN
    EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'id' AND TYPE_NAME(user_type_id)=N'int' AND is_nullable=0)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'asssessionid' AND TYPE_NAME(user_type_id)=N'int' AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'person' AND TYPE_NAME(user_type_id)=N'varchar' AND max_length=10 AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'selfgrade' AND TYPE_NAME(user_type_id)=N'varchar' AND max_length=12 AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'assgrade' AND TYPE_NAME(user_type_id)=N'varchar' AND max_length=12 AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'itemvalue' AND TYPE_NAME(user_type_id)=N'numeric' AND precision=18 AND scale=2 AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'totalvalue' AND TYPE_NAME(user_type_id)=N'numeric' AND precision=18 AND scale=2 AND is_nullable=1)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.person') AND name=N'person' AND TYPE_NAME(user_type_id)=N'varchar' AND max_length=10 AND is_nullable=0)
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.person') AND name=N'name' AND TYPE_NAME(user_type_id)=N'varchar' AND max_length=30)
  THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN
    EXISTS(SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id WHERE i.object_id=OBJECT_ID(N'dbo.assessmentmaster') AND i.is_primary_key=1 AND COL_NAME(ic.object_id,ic.column_id)=N'id')
    AND EXISTS(SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id WHERE i.object_id=OBJECT_ID(N'dbo.person') AND i.is_primary_key=1 AND COL_NAME(ic.object_id,ic.column_id)=N'person')
  THEN 1 ELSE 0 END),
  CONVERT(varchar(1),sd.is_read_only),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases sd WHERE sd.name=DB_NAME();`;

export class LegacyPerformancePersonSummarySourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformancePersonSummarySourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyPerformancePersonSummarySourceReceiptError(code, detail);
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
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", label);
  }
};

function privateFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_FILE_UNSAFE", label);
  }
  let link;
  let actual;
  let info;
  try {
    link = lstatSync(path);
    actual = realpathSync(path);
    info = statSync(actual);
  } catch {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_FILE_UNSAFE", `${label}:missing`);
  }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_FILE_UNSAFE", label);
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

function parseEnv(path) {
  const result = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("PERFORMANCE_PERSON_SUMMARY_ETL_LOGIN_INVALID", "invalid envelope line");
    const key = line.slice(0, separator);
    if (!ENV_KEYS.includes(key) || Object.hasOwn(result, key)) {
      fail("PERFORMANCE_PERSON_SUMMARY_ETL_LOGIN_INVALID", "unexpected or duplicate envelope key");
    }
    result[key] = line.slice(separator + 1);
  }
  if (
    Object.keys(result).sort().join("|") !== [...ENV_KEYS].sort().join("|") ||
    !DATABASE.test(result.YUZHOU_SQLSERVER_DATABASE ?? "") ||
    !LOGIN.test(result.YUZHOU_SQLSERVER_ETL_LOGIN ?? "") ||
    result.YUZHOU_SQLSERVER_ETL_LOGIN.toLowerCase() === "sa" ||
    !result.YUZHOU_SQLSERVER_ETL_PASSWORD ||
    /[\r\n\0]/u.test(result.YUZHOU_SQLSERVER_ETL_PASSWORD)
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_ETL_LOGIN_INVALID", "minimum read-only ETL envelope required");
  }
  return result;
}

function runDockerQuery({ sourceContainer, database, login, password }) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      sourceContainer,
      "bash",
      "-lc",
      'IFS= read -r SQLCMDUSER; IFS= read -r SQLCMDPASSWORD; export SQLCMDUSER SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -d "$1" -h -1 -W -w 65535 -s "|" -Q "$2"',
      "q",
      database,
      LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL,
    ],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: `${login}\n${password}\n`,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_FAILED", "aggregate-only SQL Server probe failed");
  }
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function parseCount(value, label) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? "")) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID", label);
  }
  const number = Number(value);
  requireCount(number, label);
  return number;
}

export function parseLegacyPerformancePersonSummaryAggregate(output) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID", "one aggregate row required");
  }
  const fields = lines[0].split("|").map((value) => value.trim());
  if (fields.length !== COUNT_KEYS.length + HASH_KEYS.length + FLAG_KEYS.length) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID", "aggregate row shape");
  }
  const safeFacts = {};
  COUNT_KEYS.forEach((key, index) => {
    safeFacts[key] = parseCount(fields[index], key);
  });
  HASH_KEYS.forEach((key, index) => {
    const value = fields[COUNT_KEYS.length + index];
    requireSha(value, "PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID", key);
    safeFacts[key] = value;
  });
  const flags = fields.slice(COUNT_KEYS.length + HASH_KEYS.length);
  if (flags.some((value) => !/^[01]$/u.test(value))) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID", "authority or catalog flags");
  }
  return {
    safeFacts,
    columnContractValid: flags[0] === "1",
    primaryKeyContractValid: flags[1] === "1",
    sourceState: { readOnly: flags[2] === "1" },
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: flags[3] === "1",
      dbDatareader: flags[4] === "1",
      viewDefinition: flags[5] === "1",
      insert: flags[6] === "1",
      update: flags[7] === "1",
      delete: flags[8] === "1",
      execute: flags[9] === "1",
    },
  };
}

function validateRoutineContract(path) {
  const raw = readFileSync(path);
  const contract = parseJson(
    raw,
    "PERFORMANCE_PERSON_SUMMARY_ROUTINE_CONTRACT_INVALID",
    "routine contract JSON",
  );
  if (contract?.contractKind !== "yuzhou_hr_legacy_performance_query_routine_parity") {
    fail("PERFORMANCE_PERSON_SUMMARY_ROUTINE_CONTRACT_INVALID", "contract identity");
  }
  const expectedFields = [
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceSelfGrade",
    "sourceAssGrade",
    "sourceItemValue",
    "sourceTotalValue",
  ];
  const expectedRoutines = new Map([
    ["web_ass", "RULE-58E6086521F8A03B"],
    ["web_assessmentquery", "RULE-E6282105617A7A50"],
  ]);
  const routines = new Map((contract.routines ?? []).map((row) => [row.sourceName, row]));
  for (const [name, routineId] of expectedRoutines) {
    const row = routines.get(name);
    if (
      row?.routineId !== routineId ||
      !SHA256.test(row.sourceArtifactSha256 ?? "") ||
      row?.parameters?.length !== 1 ||
      row.parameters[0]?.name !== "person" ||
      row.parameters[0]?.sourceType !== "varchar(10)" ||
      JSON.stringify(row.outputColumns?.map((field) => field.plannedModernField)) !==
        JSON.stringify(expectedFields)
    ) {
      fail("PERFORMANCE_PERSON_SUMMARY_ROUTINE_CONTRACT_INVALID", name);
    }
  }
  if (contract.productionImport !== "HOLD") {
    fail("PERFORMANCE_PERSON_SUMMARY_ROUTINE_CONTRACT_INVALID", "HOLD boundary");
  }
  return { sha256: digest(raw) };
}

function assertReadOnlyBoundary(body) {
  if (body.sourceState.readOnly !== true) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_NOT_READ_ONLY", "source database");
  }
  const expected = {
    loginSucceeded: true,
    sysadmin: false,
    dbDatareader: true,
    viewDefinition: true,
    insert: false,
    update: false,
    delete: false,
    execute: false,
  };
  exactKeys(
    body.etlAuthority,
    Object.keys(expected),
    "PERFORMANCE_PERSON_SUMMARY_ETL_AUTHORITY_INVALID",
    "authority shape",
  );
  for (const [key, value] of Object.entries(expected)) {
    if (body.etlAuthority[key] !== value) {
      fail("PERFORMANCE_PERSON_SUMMARY_ETL_AUTHORITY_INVALID", key);
    }
  }
}

export function sealLegacyPerformancePersonSummarySourceReceipt(input) {
  const body = structuredClone(input);
  exactKeys(
    body,
    BODY_KEYS,
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "receipt body shape",
  );
  if (
    body.formatVersion !== 1 ||
    body.artifactKind !== "yuzhou_hr_legacy_performance_person_summary_safe_source_receipt" ||
    body.operationMode !== "read_only_aggregate_hash_only" ||
    body.productionImport !== "HOLD" ||
    body.compatibilityCredit !== 0
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", "identity or HOLD boundary");
  }
  for (const key of [
    "sourceRestoreReceiptSha256",
    "sourceCatalogSha256",
    "routineContractSha256",
    "databaseIdentitySha256",
    "queryIdentitySha256",
  ]) {
    requireSha(body[key], "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", key);
  }
  exactKeys(
    body.sourceObjects,
    ["assessmentmaster", "person"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "source object shape",
  );
  if (
    body.sourceObjects.assessmentmaster !== "dbo.assessmentmaster" ||
    body.sourceObjects.person !== "dbo.person"
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", "source object identity");
  }
  exactKeys(
    body.safeFacts,
    [...COUNT_KEYS, ...HASH_KEYS],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "safe fact shape",
  );
  for (const key of COUNT_KEYS) requireCount(body.safeFacts[key], key);
  for (const key of HASH_KEYS) {
    requireSha(body.safeFacts[key], "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", key);
  }
  if (
    body.safeFacts.assessmentRows !==
      body.safeFacts.assessmentNonblankPersonRows + body.safeFacts.assessmentBlankPersonRows ||
    body.safeFacts.assessmentNonblankPersonRows !==
      body.safeFacts.matchedAssessmentRows + body.safeFacts.orphanAssessmentRows ||
    body.safeFacts.matchedAssessmentRows !==
      body.safeFacts.resolvedNameProjectionRows + body.safeFacts.blankNameProjectionRows ||
    body.safeFacts.queryableRows > body.safeFacts.assessmentNonblankPersonRows ||
    body.safeFacts.queryableRows !==
      body.safeFacts.queryableMatchedRows + body.safeFacts.queryableOrphanRows ||
    body.safeFacts.webAssProjectedRows !== body.safeFacts.queryableMatchedRows ||
    body.safeFacts.webAssessmentQueryProjectedRows !== body.safeFacts.queryableRows
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_CONSERVATION_FAILED", "row or projection conservation");
  }
  exactKeys(
    body.conservation,
    ["assessmentPersonJoin", "nameProjection", "paginationPopulation"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "conservation shape",
  );
  if (
    body.conservation.assessmentPersonJoin !== "PROVEN" ||
    body.conservation.nameProjection !== "PROVEN" ||
    body.conservation.paginationPopulation !== "PROVEN"
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_CONSERVATION_FAILED", "status");
  }
  exactKeys(
    body.currentSnapshotEquivalence,
    ["scope", "projectedRowCountEqual", "projectionSetHashEqual", "decision"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "equivalence shape",
  );
  const rowCountEqual =
    body.safeFacts.webAssProjectedRows === body.safeFacts.webAssessmentQueryProjectedRows;
  const hashEqual =
    body.safeFacts.webAssProjectionSetSha256 ===
    body.safeFacts.webAssessmentQueryProjectionSetSha256;
  const expectedDecision = body.safeFacts.assessmentRows === 0
    ? "VACUOUS_EMPTY_SOURCE_POPULATION"
    : rowCountEqual && hashEqual
      ? "CURRENT_SOURCE_SNAPSHOT_EQUIVALENT"
      : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED";
  if (
    body.currentSnapshotEquivalence.scope !== "current_restored_source_snapshot_modern_admissible_person_codes" ||
    body.currentSnapshotEquivalence.projectedRowCountEqual !== rowCountEqual ||
    body.currentSnapshotEquivalence.projectionSetHashEqual !== hashEqual ||
    body.currentSnapshotEquivalence.decision !== expectedDecision
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_EQUIVALENCE_INVALID", "current snapshot decision");
  }
  exactKeys(
    body.promotionGate,
    ["assessmentPopulation", "personCodeValidation", "routineMergeDecision", "modernRuntimeComparison"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "promotion gate shape",
  );
  const codeValidationClear =
    body.safeFacts.assessmentInvalidPersonCodeRows === 0 &&
    body.safeFacts.personInvalidPersonCodeRows === 0 &&
    body.safeFacts.normalizedCollisionGroups === 0;
  const expectedPromotionGate = {
    assessmentPopulation: body.safeFacts.assessmentRows === 0
      ? "EMPTY_NO_BEHAVIOR_CREDIT"
      : "POPULATED",
    personCodeValidation: codeValidationClear ? "CLEAR" : "GAPS_PRESENT",
    routineMergeDecision: body.safeFacts.assessmentRows === 0
      ? "NOT_PROVEN_EMPTY_SOURCE_POPULATION"
      : rowCountEqual && hashEqual
        ? "CURRENT_SNAPSHOT_ONLY_SHARED_ENDPOINT_CANDIDATE"
        : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED",
    modernRuntimeComparison: body.safeFacts.assessmentRows === 0
      ? "BLOCKED_NO_SOURCE_FACT_ROWS"
      : !codeValidationClear || body.safeFacts.orphanAssessmentRows > 0
        ? "BLOCKED_SOURCE_GAPS_REQUIRE_POLICY"
        : "READY_FOR_MODERN_AGGREGATE_COMPARISON",
  };
  if (JSON.stringify(body.promotionGate) !== JSON.stringify(expectedPromotionGate)) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROMOTION_GATE_INVALID", "derived promotion decision");
  }
  if (
    body.sourceObjects.columnContractValid !== undefined ||
    body.sourceObjects.primaryKeyContractValid !== undefined
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", "catalog flags belong to capture gate");
  }
  exactKeys(
    body.privacy,
    ["containsSourceRows", "containsPersonCodes", "containsPersonNames", "hashesMayDependOnPersonalValues"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "privacy shape",
  );
  if (
    body.privacy.containsSourceRows !== false ||
    body.privacy.containsPersonCodes !== false ||
    body.privacy.containsPersonNames !== false ||
    body.privacy.hashesMayDependOnPersonalValues !== true
  ) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", "privacy boundary");
  }
  const hasGaps =
    body.safeFacts.assessmentRows === 0 ||
    body.safeFacts.orphanAssessmentRows > 0 ||
    body.safeFacts.assessmentInvalidPersonCodeRows > 0 ||
    body.safeFacts.personInvalidPersonCodeRows > 0 ||
    body.safeFacts.normalizedCollisionGroups > 0 ||
    expectedDecision !== "CURRENT_SOURCE_SNAPSHOT_EQUIVALENT";
  const expectedStatus = hasGaps
    ? "SOURCE_PERSON_SUMMARY_EVIDENCE_CAPTURED_WITH_GAPS"
    : "SOURCE_PERSON_SUMMARY_EVIDENCE_READY_FOR_RUNTIME_COMPARISON";
  if (body.status !== expectedStatus) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID", "status");
  }
  assertReadOnlyBoundary(body);
  return { ...body, canonicalSha256: digest(canonical(body)) };
}

export function validateLegacyPerformancePersonSummarySourceReceipt(receipt) {
  exactKeys(
    receipt,
    [...BODY_KEYS, "canonicalSha256"],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID",
    "sealed receipt shape",
  );
  const { canonicalSha256, ...body } = receipt;
  const sealed = sealLegacyPerformancePersonSummarySourceReceipt(body);
  if (canonicalSha256 !== sealed.canonicalSha256) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  }
  return receipt;
}

export function captureLegacyPerformancePersonSummarySourceReceipt(input, { queryRunner = runDockerQuery } = {}) {
  exactKeys(
    input,
    [
      "sourceRestoreReceiptPath",
      "sourceRestoreReceiptSha256",
      "routineContractPath",
      "sourceContainer",
      "etlEnvPath",
      "receiptPath",
    ],
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_CAPTURE_INVALID",
    "capture input",
  );
  if (!CONTAINER.test(input.sourceContainer ?? "")) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_CAPTURE_INVALID", "source container");
  }
  requireSha(
    input.sourceRestoreReceiptSha256,
    "PERFORMANCE_PERSON_SUMMARY_SOURCE_CAPTURE_INVALID",
    "source restore receipt hash",
  );
  const restorePath = privateFile(input.sourceRestoreReceiptPath, "source restore receipt");
  if (sourceRestoreReceiptFileHash(restorePath) !== input.sourceRestoreReceiptSha256) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_RESTORE_RECEIPT_DRIFT", "source restore receipt bytes");
  }
  const restoreReceipt = validateSourceRestoreReceipt(
    parseJson(
      readFileSync(restorePath, "utf8"),
      "PERFORMANCE_PERSON_SUMMARY_SOURCE_RESTORE_RECEIPT_INVALID",
      "source restore receipt JSON",
    ),
  );
  const env = parseEnv(privateFile(input.etlEnvPath, "ETL envelope"));
  if (digest(env.YUZHOU_SQLSERVER_DATABASE) !== restoreReceipt.identities.databaseSha256) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_IDENTITY_INVALID", "ETL database and restore receipt");
  }
  const routineContract = validateRoutineContract(input.routineContractPath);
  let aggregate;
  try {
    aggregate = parseLegacyPerformancePersonSummaryAggregate(queryRunner({
      sourceContainer: input.sourceContainer,
      database: env.YUZHOU_SQLSERVER_DATABASE,
      login: env.YUZHOU_SQLSERVER_ETL_LOGIN,
      password: env.YUZHOU_SQLSERVER_ETL_PASSWORD,
    }));
  } catch (error) {
    if (error instanceof LegacyPerformancePersonSummarySourceReceiptError) throw error;
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_FAILED", "aggregate-only SQL Server probe failed");
  }
  if (!aggregate.columnContractValid || !aggregate.primaryKeyContractValid) {
    fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_CATALOG_DRIFT", "required columns or primary keys");
  }
  const { safeFacts } = aggregate;
  const rowCountEqual = safeFacts.webAssProjectedRows === safeFacts.webAssessmentQueryProjectedRows;
  const hashEqual =
    safeFacts.webAssProjectionSetSha256 === safeFacts.webAssessmentQueryProjectionSetSha256;
  const hasGaps =
    safeFacts.assessmentRows === 0 ||
    safeFacts.orphanAssessmentRows > 0 ||
    safeFacts.assessmentInvalidPersonCodeRows > 0 ||
    safeFacts.personInvalidPersonCodeRows > 0 ||
    safeFacts.normalizedCollisionGroups > 0 ||
    !rowCountEqual ||
    !hashEqual;
  const receipt = sealLegacyPerformancePersonSummarySourceReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_performance_person_summary_safe_source_receipt",
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceCatalogSha256: restoreReceipt.identities.catalogSha256,
    routineContractSha256: routineContract.sha256,
    databaseIdentitySha256: restoreReceipt.identities.databaseSha256,
    queryIdentitySha256: digest(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL),
    operationMode: "read_only_aggregate_hash_only",
    sourceObjects: {
      assessmentmaster: "dbo.assessmentmaster",
      person: "dbo.person",
    },
    safeFacts,
    conservation: {
      assessmentPersonJoin: "PROVEN",
      nameProjection: "PROVEN",
      paginationPopulation: "PROVEN",
    },
    currentSnapshotEquivalence: {
      scope: "current_restored_source_snapshot_modern_admissible_person_codes",
      projectedRowCountEqual: rowCountEqual,
      projectionSetHashEqual: hashEqual,
      decision: safeFacts.assessmentRows === 0
        ? "VACUOUS_EMPTY_SOURCE_POPULATION"
        : rowCountEqual && hashEqual
          ? "CURRENT_SOURCE_SNAPSHOT_EQUIVALENT"
          : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED",
    },
    promotionGate: {
      assessmentPopulation: safeFacts.assessmentRows === 0
        ? "EMPTY_NO_BEHAVIOR_CREDIT"
        : "POPULATED",
      personCodeValidation:
        safeFacts.assessmentInvalidPersonCodeRows === 0 &&
        safeFacts.personInvalidPersonCodeRows === 0 &&
        safeFacts.normalizedCollisionGroups === 0
          ? "CLEAR"
          : "GAPS_PRESENT",
      routineMergeDecision: safeFacts.assessmentRows === 0
        ? "NOT_PROVEN_EMPTY_SOURCE_POPULATION"
        : rowCountEqual && hashEqual
          ? "CURRENT_SNAPSHOT_ONLY_SHARED_ENDPOINT_CANDIDATE"
          : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED",
      modernRuntimeComparison: safeFacts.assessmentRows === 0
        ? "BLOCKED_NO_SOURCE_FACT_ROWS"
        : safeFacts.assessmentInvalidPersonCodeRows > 0 ||
            safeFacts.personInvalidPersonCodeRows > 0 ||
            safeFacts.normalizedCollisionGroups > 0 ||
            safeFacts.orphanAssessmentRows > 0
          ? "BLOCKED_SOURCE_GAPS_REQUIRE_POLICY"
          : "READY_FOR_MODERN_AGGREGATE_COMPARISON",
    },
    sourceState: aggregate.sourceState,
    etlAuthority: aggregate.etlAuthority,
    privacy: {
      containsSourceRows: false,
      containsPersonCodes: false,
      containsPersonNames: false,
      hashesMayDependOnPersonalValues: true,
    },
    status: hasGaps
      ? "SOURCE_PERSON_SUMMARY_EVIDENCE_CAPTURED_WITH_GAPS"
      : "SOURCE_PERSON_SUMMARY_EVIDENCE_READY_FOR_RUNTIME_COMPARISON",
    compatibilityCredit: 0,
    productionImport: "HOLD",
  });
  writeFileSync(input.receiptPath, canonical(receipt), { flag: "wx", mode: 0o600 });
  chmodSync(input.receiptPath, 0o600);
  return {
    status: receipt.status,
    receiptSha256: digest(canonical(receipt)),
    canonicalSha256: receipt.canonicalSha256,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const allowed = new Set([
    "--source-receipt",
    "--source-receipt-sha",
    "--routine-contract",
    "--source-container",
    "--etl-env",
    "--receipt",
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || Object.hasOwn(result, key) || index + 1 >= argv.length) {
      fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_ARGUMENT_INVALID", key ?? "missing");
    }
    result[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--routine-contract") continue;
    if (!result[key]) fail("PERFORMANCE_PERSON_SUMMARY_SOURCE_ARGUMENT_MISSING", key);
  }
  return {
    sourceRestoreReceiptPath: resolve(result["--source-receipt"]),
    sourceRestoreReceiptSha256: result["--source-receipt-sha"],
    routineContractPath: resolve(result["--routine-contract"] ?? DEFAULT_ROUTINE_CONTRACT),
    sourceContainer: result["--source-container"],
    etlEnvPath: resolve(result["--etl-env"]),
    receiptPath: resolve(result["--receipt"]),
  };
}

async function main() {
  const result = captureLegacyPerformancePersonSummarySourceReceipt(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_FAILED"}\n`);
    process.exitCode = 1;
  });
}
