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
const TABLE_COUNT_KEYS = [
  "assessmentcodeRows",
  "assessmentdetailRows",
  "assessmentmasterRows",
  "assgradecodeRows",
  "assitemRows",
  "assitemgradedesRows",
  "assitemgroupRows",
  "asspayRows",
  "asssessionRows",
  "asssourRows",
  "asssourpersonRows",
];
const RELATION_COUNT_KEYS = [
  "personAssessmentBindingRows",
  "asssourpersonBlankSubjectRows",
  "asssourpersonBlankAssessorRows",
  "asssourpersonMissingSessionRows",
  "asssourpersonMissingSubjectRows",
  "asssourpersonNonblankAssessorMissingPersonRows",
  "asssourpersonDistinctSessionCount",
  "assitemWithoutAssessmentHeaderRows",
  "assitemgradedesWithoutItemRows",
  "assgradecodeWithoutAssessmentHeaderRows",
  "asspayWithoutGradeRows",
];
const CATALOG_COUNT_KEYS = [
  "signatureCandidateTableCount",
  "unexpectedSignatureTableCount",
  "performanceViewCount",
  "performanceSynonymCount",
  "performanceTriggerCount",
  "performanceTemporalTableCount",
  "performanceCdcTableCount",
  "archiveLikeObjectCount",
  "deployedModuleReferenceCount",
  "deployedDeleteOrTruncateModuleCount",
  "declaredPerformanceForeignKeyCount",
  "untrustedPerformanceForeignKeyCount",
  "factPersonSessionForeignKeyCount",
  "externalAssessmentObjectCount",
];
const HASH_KEYS = [
  "factFamilySetSha256",
  "supportingRelationSetSha256",
  "configurationSetSha256",
  "catalogCandidateSetSha256",
  "moduleReferenceSetSha256",
];
const FLAG_KEYS = [
  "objectContractValid",
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
  "factLocationContractSha256",
  "schemaArtifactSha256",
  "routineLedgerSha256",
  "databaseIdentitySha256",
  "queryIdentitySha256",
  "operationMode",
  "objectFindings",
  "relationshipFacts",
  "catalogDiscovery",
  "contentSetHashes",
  "rootCauseEvidence",
  "factLocationConclusion",
  "sourceState",
  "etlAuthority",
  "privacy",
  "status",
  "compatibilityCredit",
  "productionImport",
];
const DEFAULT_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-performance-fact-location-v1.json",
);
const DEFAULT_LEDGER = resolve(
  import.meta.dirname,
  "contracts/legacy-routine-logic-ledger-v2.json",
);
const EXPECTED_OBJECTS = [
  ["dbo.assessmentmaster", "person_session_performance_summary_fact", "AUTHORITATIVE_HISTORY_FACT"],
  ["dbo.assessmentdetail", "person_session_item_score_fact", "AUTHORITATIVE_HISTORY_FACT"],
  ["dbo.asssour", "person_session_item_rater_score_fact", "AUTHORITATIVE_HISTORY_FACT"],
  ["dbo.asssourperson", "person_session_rater_assignment_relation", "AUTHORITATIVE_SUPPORTING_RELATION_NOT_OUTCOME_FACT"],
  ["dbo.asssession", "performance_period_dimension", "AUTHORITATIVE_SUPPORTING_DIMENSION_NOT_OUTCOME_FACT"],
  ["dbo.assessmentcode", "performance_template_header_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.assitem", "performance_template_item_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.assitemgradedes", "performance_item_grade_description_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.assitemgroup", "performance_item_group_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.assgradecode", "performance_grade_band_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.asspay", "performance_grade_pay_rule_configuration", "AUTHORITATIVE_CONFIGURATION_NOT_OUTCOME_FACT"],
  ["dbo.assessment", "u_assessmentitems_external_or_generated_projection", "NON_AUTHORITATIVE_ABSENT_EXTERNAL_OR_GENERATED_REFERENCE"],
];

// The batch emits one row containing counts, booleans and SHA-256 values only.
// Source strings are consumed inside SQL Server hashes and never selected.
export const LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL = `SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;

DECLARE @factJson nvarchar(max),@relationJson nvarchar(max),@configurationJson nvarchar(max),@catalogJson nvarchar(max),@moduleJson nvarchar(max);
DECLARE @factHash varchar(64),@relationHash varchar(64),@configurationHash varchar(64),@catalogHash varchar(64),@moduleHash varchar(64);

SET @factJson=(SELECT
  JSON_QUERY((SELECT id,asssessionid,person,selfgrade,assgrade,selfvalue,itemvalue,mitemvalue,xitemvalue,citemvalue,mastervalue,timekeepvalue,bonusvalue,totalvalue,assessmentperson,recdate FROM dbo.assessmentmaster ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assessmentmaster,
  JSON_QUERY((SELECT id,asssessionid,person,assitemid,selfvalue,mitemvalue,itemvalue,xitemvalue,citemvalue,selfgrade,assgrade FROM dbo.assessmentdetail ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assessmentdetail,
  JSON_QUERY((SELECT id,asssessionid,person,assitemid,lb,itemvalue,assgrade FROM dbo.asssour ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS asssour
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);

SET @relationJson=(SELECT id,asssessionid,person,assperson,lb FROM dbo.asssourperson ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @configurationJson=(SELECT
  JSON_QUERY((SELECT assessment,assessmentname,department,mpercent,tpercent,xpercent,cpercent,spercent,timekeep,bonus,master FROM dbo.assessmentcode ORDER BY assessment FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assessmentcode,
  JSON_QUERY((SELECT assgrade,description,myorder,assessmentid,minvalue,maxvalue FROM dbo.assgradecode ORDER BY assgrade FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assgradecode,
  JSON_QUERY((SELECT id,assid,assitem,fullvalue,myorder FROM dbo.assitem ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assitem,
  JSON_QUERY((SELECT id,assitemid,grade,description,minvalue,maxvalue,myorder FROM dbo.assitemgradedes ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assitemgradedes,
  JSON_QUERY((SELECT id,assessment,itemgroup,description,fullvalue FROM dbo.assitemgroup ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS assitemgroup,
  JSON_QUERY((SELECT id,lb,assgrade,value1,value2,pay,description FROM dbo.asspay ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS asspay,
  JSON_QUERY((SELECT id,asssession,description,assessmenttype,year,month,quarter,myorder FROM dbo.asssession ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS asssession
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES);

SET @catalogJson=(SELECT SCHEMA_NAME(t.schema_id) AS schemaName,t.name AS objectName
FROM sys.tables t
JOIN (
  SELECT object_id FROM sys.columns
  WHERE name IN ('asssessionid','asssession','assessmenttype','assitemid','selfgrade','assgrade','selfvalue','itemvalue','mitemvalue','xitemvalue','citemvalue','mastervalue','timekeepvalue','bonusvalue','totalvalue','selfappraisal','appraisal','assessmentperson')
  GROUP BY object_id HAVING COUNT_BIG(*)>=2
) signatures ON signatures.object_id=t.object_id
ORDER BY SCHEMA_NAME(t.schema_id),t.name
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @moduleJson=(SELECT OBJECT_SCHEMA_NAME(sm.object_id) AS schemaName,OBJECT_NAME(sm.object_id) AS objectName
FROM sys.sql_modules sm
WHERE sm.definition LIKE '%assessmentmaster%' OR sm.definition LIKE '%assessmentdetail%' OR sm.definition LIKE '%asssour%'
ORDER BY OBJECT_SCHEMA_NAME(sm.object_id),OBJECT_NAME(sm.object_id)
FOR JSON PATH,INCLUDE_NULL_VALUES);

SET @factHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@factJson,N'{}')),2));
SET @relationHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@relationJson,N'[]')),2));
SET @configurationHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@configurationJson,N'{}')),2));
SET @catalogHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@catalogJson,N'[]')),2));
SET @moduleHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE(@moduleJson,N'[]')),2));

SELECT
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assessmentcode)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assessmentdetail)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assessmentmaster)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assgradecode)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assitem)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assitemgradedes)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assitemgroup)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asspay)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssession)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssour)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.person WHERE assessment IS NOT NULL)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson WHERE NULLIF(LTRIM(RTRIM(person)),'') IS NULL)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson WHERE NULLIF(LTRIM(RTRIM(assperson)),'') IS NULL)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson sp WHERE NOT EXISTS (SELECT 1 FROM dbo.asssession s WHERE s.id=sp.asssessionid))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson sp WHERE NULLIF(LTRIM(RTRIM(sp.person)),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.person p WHERE p.person=sp.person))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asssourperson sp WHERE NULLIF(LTRIM(RTRIM(sp.assperson)),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.person p WHERE p.person=sp.assperson))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(DISTINCT asssessionid) FROM dbo.asssourperson)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assitem ai WHERE ai.assid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.assessmentcode ac WHERE ac.assessment=ai.assid))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assitemgradedes d WHERE NOT EXISTS (SELECT 1 FROM dbo.assitem i WHERE i.id=d.assitemid))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.assgradecode g WHERE g.assessmentid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.assessmentcode ac WHERE ac.assessment=g.assessmentid))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM dbo.asspay ap WHERE NULLIF(LTRIM(RTRIM(ap.assgrade)),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.assgradecode g WHERE g.assgrade=ap.assgrade))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.tables t JOIN (SELECT object_id FROM sys.columns WHERE name IN ('asssessionid','asssession','assessmenttype','assitemid','selfgrade','assgrade','selfvalue','itemvalue','mitemvalue','xitemvalue','citemvalue','mastervalue','timekeepvalue','bonusvalue','totalvalue','selfappraisal','appraisal','assessmentperson') GROUP BY object_id HAVING COUNT_BIG(*)>=2) c ON c.object_id=t.object_id)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.tables t JOIN (SELECT object_id FROM sys.columns WHERE name IN ('asssessionid','asssession','assessmenttype','assitemid','selfgrade','assgrade','selfvalue','itemvalue','mitemvalue','xitemvalue','citemvalue','mastervalue','timekeepvalue','bonusvalue','totalvalue','selfappraisal','appraisal','assessmentperson') GROUP BY object_id HAVING COUNT_BIG(*)>=2) c ON c.object_id=t.object_id WHERE t.name NOT IN ('assessmentmaster','assessmentdetail','asssour','asssession'))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.views v WHERE OBJECT_DEFINITION(v.object_id) LIKE '%assessmentmaster%' OR OBJECT_DEFINITION(v.object_id) LIKE '%assessmentdetail%' OR OBJECT_DEFINITION(v.object_id) LIKE '%asssour%')),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.synonyms s WHERE s.base_object_name LIKE '%assessment%' OR s.base_object_name LIKE '%asssour%' OR s.name LIKE '%assessment%' OR s.name LIKE '%asssour%')),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.triggers tr WHERE tr.parent_id IN (OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.tables t WHERE t.object_id IN (OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')) AND t.temporal_type<>0)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.tables t WHERE t.object_id IN (OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')) AND t.is_tracked_by_cdc=1)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.objects o WHERE o.type IN ('U','V','SN') AND (o.name LIKE '%assess%history%' OR o.name LIKE '%assess%archive%' OR o.name LIKE '%assess%bak%' OR o.name LIKE '%performance%history%' OR o.name LIKE '%performance%archive%'))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.sql_modules sm WHERE sm.definition LIKE '%assessmentmaster%' OR sm.definition LIKE '%assessmentdetail%' OR sm.definition LIKE '%asssour%')),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.sql_modules sm WHERE sm.definition LIKE '%delete%assessmentmaster%' OR sm.definition LIKE '%truncate%assessmentmaster%' OR sm.definition LIKE '%delete%assessmentdetail%' OR sm.definition LIKE '%truncate%assessmentdetail%' OR sm.definition LIKE '%delete%asssour%' OR sm.definition LIKE '%truncate%asssour%')),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.foreign_keys fk WHERE fk.parent_object_id IN (OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.assitemgradedes'),OBJECT_ID('dbo.assitemgroup'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')) OR fk.referenced_object_id IN (OBJECT_ID('dbo.assessmentcode'),OBJECT_ID('dbo.assitem'),OBJECT_ID('dbo.asssession')))),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.foreign_keys fk WHERE (fk.parent_object_id IN (OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.assitemgradedes'),OBJECT_ID('dbo.assitemgroup'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')) OR fk.referenced_object_id IN (OBJECT_ID('dbo.assessmentcode'),OBJECT_ID('dbo.assitem'),OBJECT_ID('dbo.asssession'))) AND fk.is_not_trusted=1)),
  CONVERT(varchar(30),(SELECT COUNT_BIG(*) FROM sys.foreign_keys fk WHERE fk.parent_object_id IN (OBJECT_ID('dbo.assessmentdetail'),OBJECT_ID('dbo.assessmentmaster'),OBJECT_ID('dbo.asssour'),OBJECT_ID('dbo.asssourperson')) AND fk.referenced_object_id IN (OBJECT_ID('dbo.person'),OBJECT_ID('dbo.asssession')))),
  CONVERT(varchar(30),CASE WHEN OBJECT_ID(N'dbo.assessment') IS NULL THEN 0 ELSE 1 END),
  @factHash,@relationHash,@configurationHash,@catalogHash,@moduleHash,
  CONVERT(varchar(1),CASE WHEN
    OBJECT_ID(N'dbo.assessmentmaster',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.assessmentdetail',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.asssour',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.asssourperson',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.asssession',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.assessmentcode',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.assitem',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.assitemgradedes',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.assitemgroup',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.assgradecode',N'U') IS NOT NULL
    AND OBJECT_ID(N'dbo.asspay',N'U') IS NOT NULL
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'asssessionid')
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'person')
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentmaster') AND name=N'totalvalue')
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.assessmentdetail') AND name=N'assitemid')
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.asssour') AND name=N'lb')
    AND EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.asssourperson') AND name=N'assperson')
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

export class LegacyPerformanceFactLocationReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceFactLocationReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyPerformanceFactLocationReceiptError(code, detail);
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
    fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", label);
  }
};

function privateFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("PERFORMANCE_FACT_LOCATION_FILE_UNSAFE", label);
  }
  let link;
  let actual;
  let info;
  try {
    link = lstatSync(path);
    actual = realpathSync(path);
    info = statSync(actual);
  } catch {
    fail("PERFORMANCE_FACT_LOCATION_FILE_UNSAFE", `${label}:missing`);
  }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
    fail("PERFORMANCE_FACT_LOCATION_FILE_UNSAFE", label);
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
    if (separator < 1) fail("PERFORMANCE_FACT_LOCATION_ETL_INVALID", "invalid envelope line");
    const key = line.slice(0, separator);
    if (!ENV_KEYS.includes(key) || Object.hasOwn(result, key)) {
      fail("PERFORMANCE_FACT_LOCATION_ETL_INVALID", "unexpected or duplicate envelope key");
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
    fail("PERFORMANCE_FACT_LOCATION_ETL_INVALID", "minimum read-only ETL envelope required");
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
      LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL,
    ],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: `${login}\n${password}\n`,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    fail("PERFORMANCE_FACT_LOCATION_PROBE_FAILED", "aggregate/hash-only SQL Server probe failed");
  }
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function parseCount(value, label) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? "")) {
    fail("PERFORMANCE_FACT_LOCATION_PROBE_INVALID", label);
  }
  const number = Number(value);
  requireCount(number, label);
  return number;
}

export function parseLegacyPerformanceFactLocationAggregate(output) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) fail("PERFORMANCE_FACT_LOCATION_PROBE_INVALID", "one aggregate row required");
  const fields = lines[0].split("|").map((value) => value.trim());
  const countKeys = [...TABLE_COUNT_KEYS, ...RELATION_COUNT_KEYS, ...CATALOG_COUNT_KEYS];
  if (fields.length !== countKeys.length + HASH_KEYS.length + FLAG_KEYS.length) {
    fail("PERFORMANCE_FACT_LOCATION_PROBE_INVALID", "aggregate row shape");
  }
  const counts = {};
  countKeys.forEach((key, index) => {
    counts[key] = parseCount(fields[index], key);
  });
  const hashes = {};
  HASH_KEYS.forEach((key, index) => {
    const value = fields[countKeys.length + index];
    requireSha(value, "PERFORMANCE_FACT_LOCATION_PROBE_INVALID", key);
    hashes[key] = value;
  });
  const flags = fields.slice(countKeys.length + HASH_KEYS.length);
  if (flags.some((value) => !/^[01]$/u.test(value))) {
    fail("PERFORMANCE_FACT_LOCATION_PROBE_INVALID", "catalog or authority flags");
  }
  return {
    counts,
    hashes,
    objectContractValid: flags[0] === "1",
    sourceState: { readOnly: flags[1] === "1" },
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: flags[2] === "1",
      dbDatareader: flags[3] === "1",
      viewDefinition: flags[4] === "1",
      insert: flags[5] === "1",
      update: flags[6] === "1",
      delete: flags[7] === "1",
      execute: flags[8] === "1",
    },
  };
}

function readAndValidateContract(path, ledgerPath, schemaArtifactPath) {
  const contractRaw = readFileSync(path);
  const contract = parseJson(contractRaw, "PERFORMANCE_FACT_LOCATION_CONTRACT_INVALID", "contract JSON");
  const ledgerRaw = readFileSync(ledgerPath);
  const schemaRaw = readFileSync(schemaArtifactPath);
  if (
    contract?.contractKind !== "yuzhou_hr_legacy_performance_fact_location" ||
    contract?.candidateObjects?.length !== 12 ||
    contract?.routineDataFlow?.length !== 7 ||
    contract?.compatibilityCredit !== 0 ||
    contract?.productionImport !== "HOLD" ||
    digest(ledgerRaw) !== contract.sourceBindings?.routineLedgerSha256 ||
    digest(schemaRaw) !== contract.sourceBindings?.schemaArtifactSha256
  ) {
    fail("PERFORMANCE_FACT_LOCATION_CONTRACT_INVALID", "identity, binding, or HOLD boundary");
  }
  const actualObjects = contract.candidateObjects.map((row) => [row.sourceObject, row.role, row.authority]);
  if (JSON.stringify(actualObjects) !== JSON.stringify(EXPECTED_OBJECTS)) {
    fail("PERFORMANCE_FACT_LOCATION_CONTRACT_INVALID", "candidate object identity, role, or authority");
  }
  return {
    contract,
    contractSha256: digest(contractRaw),
    ledgerSha256: digest(ledgerRaw),
    schemaSha256: digest(schemaRaw),
  };
}

function assertReadOnlyBoundary(body) {
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
  if (body.sourceState?.readOnly !== true) {
    fail("PERFORMANCE_FACT_LOCATION_SOURCE_NOT_READ_ONLY", "source database");
  }
  exactKeys(body.etlAuthority, Object.keys(expected), "PERFORMANCE_FACT_LOCATION_AUTHORITY_INVALID", "authority shape");
  for (const [key, value] of Object.entries(expected)) {
    if (body.etlAuthority[key] !== value) fail("PERFORMANCE_FACT_LOCATION_AUTHORITY_INVALID", key);
  }
}

function objectFindings(contract, counts) {
  const countByObject = {
    "dbo.assessmentmaster": counts.assessmentmasterRows,
    "dbo.assessmentdetail": counts.assessmentdetailRows,
    "dbo.asssour": counts.asssourRows,
    "dbo.asssourperson": counts.asssourpersonRows,
    "dbo.asssession": counts.asssessionRows,
    "dbo.assessmentcode": counts.assessmentcodeRows,
    "dbo.assitem": counts.assitemRows,
    "dbo.assitemgradedes": counts.assitemgradedesRows,
    "dbo.assitemgroup": counts.assitemgroupRows,
    "dbo.assgradecode": counts.assgradecodeRows,
    "dbo.asspay": counts.asspayRows,
    "dbo.assessment": null,
  };
  return contract.candidateObjects.map((candidate) => {
    const rowCount = countByObject[candidate.sourceObject];
    let runtimeDecision;
    if (candidate.sourceObject === "dbo.assessment") {
      runtimeDecision = counts.externalAssessmentObjectCount === 0
        ? "ABSENT_NON_AUTHORITATIVE"
        : "UNEXPECTED_OBJECT_REQUIRES_ADJUDICATION";
    } else if (candidate.authority === "AUTHORITATIVE_HISTORY_FACT") {
      runtimeDecision = rowCount === 0 ? "AUTHORITATIVE_EMPTY" : "AUTHORITATIVE_POPULATED";
    } else {
      runtimeDecision = rowCount === 0 ? "SUPPORTING_OBJECT_EMPTY" : "SUPPORTING_OBJECT_POPULATED";
    }
    return {
      sourceObject: candidate.sourceObject,
      role: candidate.role,
      authority: candidate.authority,
      rowCount,
      runtimeDecision,
    };
  });
}

export function sealLegacyPerformanceFactLocationReceipt(input) {
  const body = structuredClone(input);
  exactKeys(body, BODY_KEYS, "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "receipt body shape");
  if (
    body.formatVersion !== 1 ||
    body.artifactKind !== "yuzhou_hr_legacy_performance_fact_location_safe_source_receipt" ||
    body.operationMode !== "read_only_count_hash_catalog" ||
    body.compatibilityCredit !== 0 ||
    body.productionImport !== "HOLD"
  ) {
    fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "identity or HOLD boundary");
  }
  for (const key of [
    "sourceRestoreReceiptSha256",
    "sourceCatalogSha256",
    "factLocationContractSha256",
    "schemaArtifactSha256",
    "routineLedgerSha256",
    "databaseIdentitySha256",
    "queryIdentitySha256",
  ]) requireSha(body[key], "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", key);
  if (!Array.isArray(body.objectFindings) || body.objectFindings.length !== 12) {
    fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "object findings");
  }
  body.objectFindings.forEach((finding, index) => {
    exactKeys(
      finding,
      ["sourceObject", "role", "authority", "rowCount", "runtimeDecision"],
      "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID",
      "object finding shape",
    );
    const expected = EXPECTED_OBJECTS[index];
    if (
      finding.sourceObject !== expected[0] ||
      finding.role !== expected[1] ||
      finding.authority !== expected[2]
    ) {
      fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "object finding identity, role, or authority");
    }
    if (finding.rowCount !== null) requireCount(finding.rowCount, finding.sourceObject);
    const expectedRuntimeDecision = finding.sourceObject === "dbo.assessment"
      ? body.catalogDiscovery?.externalAssessmentObjectCount === 0
        ? "ABSENT_NON_AUTHORITATIVE"
        : "UNEXPECTED_OBJECT_REQUIRES_ADJUDICATION"
      : finding.authority === "AUTHORITATIVE_HISTORY_FACT"
        ? finding.rowCount === 0
          ? "AUTHORITATIVE_EMPTY"
          : "AUTHORITATIVE_POPULATED"
        : finding.rowCount === 0
          ? "SUPPORTING_OBJECT_EMPTY"
          : "SUPPORTING_OBJECT_POPULATED";
    if (finding.runtimeDecision !== expectedRuntimeDecision) {
      fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "object runtime decision");
    }
  });
  exactKeys(body.relationshipFacts, RELATION_COUNT_KEYS, "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "relationship facts");
  exactKeys(body.catalogDiscovery, CATALOG_COUNT_KEYS, "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "catalog discovery");
  for (const [key, value] of Object.entries(body.relationshipFacts)) requireCount(value, key);
  for (const [key, value] of Object.entries(body.catalogDiscovery)) requireCount(value, key);
  exactKeys(body.contentSetHashes, HASH_KEYS, "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "content hashes");
  for (const [key, value] of Object.entries(body.contentSetHashes)) {
    requireSha(value, "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", key);
  }
  const byObject = new Map(body.objectFindings.map((row) => [row.sourceObject, row]));
  const factRows = ["dbo.assessmentmaster", "dbo.assessmentdetail", "dbo.asssour"]
    .reduce((sum, name) => sum + (byObject.get(name)?.rowCount ?? 0), 0);
  const supportingRows = byObject.get("dbo.asssourperson")?.rowCount ?? 0;
  if (
    body.relationshipFacts.asssourpersonBlankSubjectRows > supportingRows ||
    body.relationshipFacts.asssourpersonBlankAssessorRows > supportingRows ||
    body.relationshipFacts.asssourpersonMissingSessionRows > supportingRows ||
    body.relationshipFacts.asssourpersonMissingSubjectRows > supportingRows ||
    body.relationshipFacts.asssourpersonNonblankAssessorMissingPersonRows > supportingRows ||
    body.relationshipFacts.asssourpersonDistinctSessionCount > (byObject.get("dbo.asssession")?.rowCount ?? 0) ||
    body.relationshipFacts.assitemWithoutAssessmentHeaderRows > (byObject.get("dbo.assitem")?.rowCount ?? 0) ||
    body.relationshipFacts.assitemgradedesWithoutItemRows > (byObject.get("dbo.assitemgradedes")?.rowCount ?? 0) ||
    body.relationshipFacts.assgradecodeWithoutAssessmentHeaderRows > (byObject.get("dbo.assgradecode")?.rowCount ?? 0) ||
    body.relationshipFacts.asspayWithoutGradeRows > (byObject.get("dbo.asspay")?.rowCount ?? 0)
  ) {
    fail("PERFORMANCE_FACT_LOCATION_RELATION_CONSERVATION_FAILED", "bounded relationship counts");
  }
  exactKeys(
    body.rootCauseEvidence,
    [
      "personAssessmentBindingRows",
      "assessmentTemplateHeaderRows",
      "factInitializerRoutine",
      "factInitializerRequiresPersonAssessmentBinding",
      "currentCreationPath",
      "historicalEmptyingCause",
    ],
    "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID",
    "root cause evidence",
  );
  const expectedCreationPath = body.rootCauseEvidence.personAssessmentBindingRows === 0
    ? "BLOCKED_BY_EMPTY_PERSON_ASSESSMENT_BINDING"
    : body.rootCauseEvidence.assessmentTemplateHeaderRows === 0
      ? "INCOMPLETE_MISSING_TEMPLATE_HEADER"
      : "STRUCTURALLY_AVAILABLE";
  requireCount(
    body.rootCauseEvidence.personAssessmentBindingRows,
    "personAssessmentBindingRows",
  );
  requireCount(
    body.rootCauseEvidence.assessmentTemplateHeaderRows,
    "assessmentTemplateHeaderRows",
  );
  if (
    body.rootCauseEvidence.personAssessmentBindingRows !==
      body.relationshipFacts.personAssessmentBindingRows ||
    body.rootCauseEvidence.assessmentTemplateHeaderRows !== byObject.get("dbo.assessmentcode")?.rowCount ||
    body.rootCauseEvidence.factInitializerRoutine !== "bs_AssCreateRecord" ||
    body.rootCauseEvidence.factInitializerRequiresPersonAssessmentBinding !== true ||
    body.rootCauseEvidence.currentCreationPath !== expectedCreationPath ||
    body.rootCauseEvidence.historicalEmptyingCause !== "UNKNOWN_NO_AUDIT_EVIDENCE"
  ) {
    fail("PERFORMANCE_FACT_LOCATION_ROOT_CAUSE_INVALID", "derived root-cause boundary");
  }
  exactKeys(
    body.factLocationConclusion,
    ["historyFactPopulation", "authoritativeSource", "alternativeStore", "supportingResiduals", "promotionDecision"],
    "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID",
    "conclusion shape",
  );
  const alternativesLocated =
    body.catalogDiscovery.unexpectedSignatureTableCount > 0 ||
    body.catalogDiscovery.performanceViewCount > 0 ||
    body.catalogDiscovery.performanceSynonymCount > 0 ||
    body.catalogDiscovery.archiveLikeObjectCount > 0 ||
    body.catalogDiscovery.externalAssessmentObjectCount > 0;
  const expectedConclusion = {
    historyFactPopulation: factRows === 0
      ? "ABSENT_FROM_CURRENT_RESTORED_DATABASE"
      : "PRESENT_IN_DECLARED_FACT_TABLES",
    authoritativeSource: factRows === 0
      ? "DECLARED_AUTHORITATIVE_TABLES_EMPTY"
      : "DECLARED_AUTHORITATIVE_TABLES_POPULATED",
    alternativeStore: alternativesLocated ? "CANDIDATE_REQUIRES_ADJUDICATION" : "NOT_LOCATED_IN_RESTORED_DATABASE",
    supportingResiduals: supportingRows > 0 ? "PRESENT_NOT_OUTCOME_HISTORY" : "ABSENT",
    promotionDecision: factRows === 0
      ? "HOLD_REQUIRE_NONEMPTY_AUTHORITATIVE_SOURCE_OR_EXPLICIT_NO_HISTORY_DECISION"
      : alternativesLocated
        ? "HOLD_ADJUDICATE_COMPETING_SOURCE"
        : "READY_FOR_FACT_MAPPING_REVIEW",
  };
  if (JSON.stringify(body.factLocationConclusion) !== JSON.stringify(expectedConclusion)) {
    fail("PERFORMANCE_FACT_LOCATION_CONCLUSION_INVALID", "derived source decision");
  }
  if (
    body.catalogDiscovery.signatureCandidateTableCount !== 4 ||
    body.catalogDiscovery.deployedDeleteOrTruncateModuleCount !== 0 ||
    body.catalogDiscovery.factPersonSessionForeignKeyCount !== 0
  ) {
    fail("PERFORMANCE_FACT_LOCATION_CATALOG_DRIFT", "signature, delete, or relationship topology");
  }
  exactKeys(
    body.privacy,
    ["containsSourceRows", "containsPersonCodes", "containsPersonNames", "containsPayValues", "hashesMayDependOnSourceValues"],
    "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID",
    "privacy shape",
  );
  if (
    body.privacy.containsSourceRows !== false ||
    body.privacy.containsPersonCodes !== false ||
    body.privacy.containsPersonNames !== false ||
    body.privacy.containsPayValues !== false ||
    body.privacy.hashesMayDependOnSourceValues !== true
  ) {
    fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "privacy boundary");
  }
  const expectedStatus = factRows === 0
    ? alternativesLocated
      ? "SOURCE_PERFORMANCE_FACTS_EMPTY_ALTERNATIVE_CANDIDATE_REQUIRES_ADJUDICATION"
      : "SOURCE_PERFORMANCE_FACTS_CONFIRMED_EMPTY_WITH_SUPPORTING_RESIDUALS"
    : "SOURCE_PERFORMANCE_FACTS_LOCATED";
  if (body.status !== expectedStatus) fail("PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID", "status");
  assertReadOnlyBoundary(body);
  return { ...body, canonicalSha256: digest(canonical(body)) };
}

export function validateLegacyPerformanceFactLocationReceipt(receipt) {
  exactKeys(
    receipt,
    [...BODY_KEYS, "canonicalSha256"],
    "PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID",
    "sealed receipt shape",
  );
  const { canonicalSha256, ...body } = receipt;
  const sealed = sealLegacyPerformanceFactLocationReceipt(body);
  if (canonicalSha256 !== sealed.canonicalSha256) {
    fail("PERFORMANCE_FACT_LOCATION_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  }
  return receipt;
}

export function captureLegacyPerformanceFactLocationReceipt(input, { queryRunner = runDockerQuery } = {}) {
  exactKeys(
    input,
    [
      "sourceRestoreReceiptPath",
      "sourceRestoreReceiptSha256",
      "factLocationContractPath",
      "routineLedgerPath",
      "schemaArtifactPath",
      "sourceContainer",
      "etlEnvPath",
      "receiptPath",
    ],
    "PERFORMANCE_FACT_LOCATION_CAPTURE_INVALID",
    "capture input",
  );
  if (!CONTAINER.test(input.sourceContainer ?? "")) {
    fail("PERFORMANCE_FACT_LOCATION_CAPTURE_INVALID", "source container");
  }
  requireSha(input.sourceRestoreReceiptSha256, "PERFORMANCE_FACT_LOCATION_CAPTURE_INVALID", "restore receipt hash");
  const restorePath = privateFile(input.sourceRestoreReceiptPath, "source restore receipt");
  if (sourceRestoreReceiptFileHash(restorePath) !== input.sourceRestoreReceiptSha256) {
    fail("PERFORMANCE_FACT_LOCATION_SOURCE_RECEIPT_DRIFT", "source restore receipt bytes");
  }
  const restoreReceipt = validateSourceRestoreReceipt(
    parseJson(readFileSync(restorePath, "utf8"), "PERFORMANCE_FACT_LOCATION_SOURCE_RECEIPT_INVALID", "restore JSON"),
  );
  const env = parseEnv(privateFile(input.etlEnvPath, "ETL envelope"));
  if (digest(env.YUZHOU_SQLSERVER_DATABASE) !== restoreReceipt.identities.databaseSha256) {
    fail("PERFORMANCE_FACT_LOCATION_SOURCE_IDENTITY_INVALID", "ETL database and restore receipt");
  }
  const contract = readAndValidateContract(
    input.factLocationContractPath,
    input.routineLedgerPath,
    input.schemaArtifactPath,
  );
  let aggregate;
  try {
    aggregate = parseLegacyPerformanceFactLocationAggregate(queryRunner({
      sourceContainer: input.sourceContainer,
      database: env.YUZHOU_SQLSERVER_DATABASE,
      login: env.YUZHOU_SQLSERVER_ETL_LOGIN,
      password: env.YUZHOU_SQLSERVER_ETL_PASSWORD,
    }));
  } catch (error) {
    if (error instanceof LegacyPerformanceFactLocationReceiptError) throw error;
    fail("PERFORMANCE_FACT_LOCATION_PROBE_FAILED", "aggregate/hash-only SQL Server probe failed");
  }
  if (!aggregate.objectContractValid) {
    fail("PERFORMANCE_FACT_LOCATION_OBJECT_DRIFT", "required source table or column missing");
  }
  const counts = aggregate.counts;
  const findings = objectFindings(contract.contract, counts);
  const factRows = counts.assessmentmasterRows + counts.assessmentdetailRows + counts.asssourRows;
  const alternativesLocated =
    counts.unexpectedSignatureTableCount > 0 ||
    counts.performanceViewCount > 0 ||
    counts.performanceSynonymCount > 0 ||
    counts.archiveLikeObjectCount > 0 ||
    counts.externalAssessmentObjectCount > 0;
  const receipt = sealLegacyPerformanceFactLocationReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_performance_fact_location_safe_source_receipt",
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceCatalogSha256: restoreReceipt.identities.catalogSha256,
    factLocationContractSha256: contract.contractSha256,
    schemaArtifactSha256: contract.schemaSha256,
    routineLedgerSha256: contract.ledgerSha256,
    databaseIdentitySha256: restoreReceipt.identities.databaseSha256,
    queryIdentitySha256: digest(LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL),
    operationMode: "read_only_count_hash_catalog",
    objectFindings: findings,
    relationshipFacts: Object.fromEntries(RELATION_COUNT_KEYS.map((key) => [key, counts[key]])),
    catalogDiscovery: Object.fromEntries(CATALOG_COUNT_KEYS.map((key) => [key, counts[key]])),
    contentSetHashes: aggregate.hashes,
    rootCauseEvidence: {
      personAssessmentBindingRows: counts.personAssessmentBindingRows,
      assessmentTemplateHeaderRows: counts.assessmentcodeRows,
      factInitializerRoutine: "bs_AssCreateRecord",
      factInitializerRequiresPersonAssessmentBinding: true,
      currentCreationPath: counts.personAssessmentBindingRows === 0
        ? "BLOCKED_BY_EMPTY_PERSON_ASSESSMENT_BINDING"
        : counts.assessmentcodeRows === 0
          ? "INCOMPLETE_MISSING_TEMPLATE_HEADER"
          : "STRUCTURALLY_AVAILABLE",
      historicalEmptyingCause: "UNKNOWN_NO_AUDIT_EVIDENCE",
    },
    factLocationConclusion: {
      historyFactPopulation: factRows === 0
        ? "ABSENT_FROM_CURRENT_RESTORED_DATABASE"
        : "PRESENT_IN_DECLARED_FACT_TABLES",
      authoritativeSource: factRows === 0
        ? "DECLARED_AUTHORITATIVE_TABLES_EMPTY"
        : "DECLARED_AUTHORITATIVE_TABLES_POPULATED",
      alternativeStore: alternativesLocated
        ? "CANDIDATE_REQUIRES_ADJUDICATION"
        : "NOT_LOCATED_IN_RESTORED_DATABASE",
      supportingResiduals: counts.asssourpersonRows > 0 ? "PRESENT_NOT_OUTCOME_HISTORY" : "ABSENT",
      promotionDecision: factRows === 0
        ? "HOLD_REQUIRE_NONEMPTY_AUTHORITATIVE_SOURCE_OR_EXPLICIT_NO_HISTORY_DECISION"
        : alternativesLocated
          ? "HOLD_ADJUDICATE_COMPETING_SOURCE"
          : "READY_FOR_FACT_MAPPING_REVIEW",
    },
    sourceState: aggregate.sourceState,
    etlAuthority: aggregate.etlAuthority,
    privacy: {
      containsSourceRows: false,
      containsPersonCodes: false,
      containsPersonNames: false,
      containsPayValues: false,
      hashesMayDependOnSourceValues: true,
    },
    status: factRows === 0
      ? alternativesLocated
        ? "SOURCE_PERFORMANCE_FACTS_EMPTY_ALTERNATIVE_CANDIDATE_REQUIRES_ADJUDICATION"
        : "SOURCE_PERFORMANCE_FACTS_CONFIRMED_EMPTY_WITH_SUPPORTING_RESIDUALS"
      : "SOURCE_PERFORMANCE_FACTS_LOCATED",
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
    "--fact-location-contract",
    "--routine-ledger",
    "--schema-tables",
    "--source-container",
    "--etl-env",
    "--receipt",
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || Object.hasOwn(result, key) || index + 1 >= argv.length) {
      fail("PERFORMANCE_FACT_LOCATION_ARGUMENT_INVALID", key ?? "missing");
    }
    result[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--fact-location-contract" || key === "--routine-ledger") continue;
    if (!result[key]) fail("PERFORMANCE_FACT_LOCATION_ARGUMENT_MISSING", key);
  }
  return {
    sourceRestoreReceiptPath: resolve(result["--source-receipt"]),
    sourceRestoreReceiptSha256: result["--source-receipt-sha"],
    factLocationContractPath: resolve(result["--fact-location-contract"] ?? DEFAULT_CONTRACT),
    routineLedgerPath: resolve(result["--routine-ledger"] ?? DEFAULT_LEDGER),
    schemaArtifactPath: resolve(result["--schema-tables"]),
    sourceContainer: result["--source-container"],
    etlEnvPath: resolve(result["--etl-env"]),
    receiptPath: resolve(result["--receipt"]),
  };
}

async function main() {
  const result = captureLegacyPerformanceFactLocationReceipt(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "PERFORMANCE_FACT_LOCATION_RECEIPT_FAILED"}\n`);
    process.exitCode = 1;
  });
}
