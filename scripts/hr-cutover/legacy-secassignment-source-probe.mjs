#!/usr/bin/env node
/* global process, structuredClone, URL */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SECASSIGNMENT_SOURCE_PROBE_SQL = `SET NOCOUNT ON;
SELECT s.name AS [schema],t.name AS [table],c.name AS [column],ty.name AS [type],
  CONVERT(bigint,c.max_length) AS maxLength,CONVERT(bit,c.is_nullable) AS nullable
FROM sys.columns c
JOIN sys.tables t ON t.object_id=c.object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name='dbo' AND ((t.name='person' AND c.name='secassignment') OR (t.name='secassignmentcode' AND c.name='secassignment'))
ORDER BY t.name,c.name
FOR JSON PATH;

WITH dictionary_normalized AS (
  SELECT NULLIF(LTRIM(RTRIM(secassignment)),'') AS business_key
  FROM dbo.secassignmentcode
), dictionary_groups AS (
  SELECT business_key,COUNT_BIG(*) AS row_count
  FROM dictionary_normalized WHERE business_key IS NOT NULL GROUP BY business_key
), person_normalized AS (
  SELECT NULLIF(LTRIM(RTRIM(secassignment)),'') AS business_key
  FROM dbo.person
), person_groups AS (
  SELECT business_key,COUNT_BIG(*) AS row_count
  FROM person_normalized WHERE business_key IS NOT NULL GROUP BY business_key
)
SELECT
  (SELECT COUNT_BIG(*) FROM dictionary_normalized) AS dictionaryRows,
  (SELECT COUNT_BIG(*) FROM dbo.secassignmentcode WHERE secassignment IS NULL) AS dictionaryNullRows,
  (SELECT COUNT_BIG(*) FROM dbo.secassignmentcode WHERE secassignment IS NOT NULL AND NULLIF(LTRIM(RTRIM(secassignment)),'') IS NULL) AS dictionaryBlankRows,
  (SELECT COUNT_BIG(*) FROM dictionary_normalized WHERE business_key IS NOT NULL) AS dictionaryNonBlankRows,
  (SELECT COUNT_BIG(*) FROM dictionary_groups) AS dictionaryDistinctNonBlankKeys,
  (SELECT COUNT_BIG(*) FROM dictionary_groups WHERE row_count>1) AS dictionaryDuplicateKeyGroups,
  COALESCE((SELECT SUM(row_count) FROM dictionary_groups WHERE row_count>1),0) AS dictionaryDuplicateRows,
  COALESCE((SELECT MAX(LEN(business_key)) FROM dictionary_normalized),0) AS dictionaryMaxObservedLength,
  (SELECT COUNT_BIG(*) FROM person_normalized) AS personRows,
  (SELECT COUNT_BIG(*) FROM dbo.person WHERE secassignment IS NULL) AS personNullRows,
  (SELECT COUNT_BIG(*) FROM dbo.person WHERE secassignment IS NOT NULL AND NULLIF(LTRIM(RTRIM(secassignment)),'') IS NULL) AS personBlankRows,
  (SELECT COUNT_BIG(*) FROM person_normalized WHERE business_key IS NOT NULL) AS personNonBlankRows,
  (SELECT COUNT_BIG(*) FROM person_groups) AS personDistinctNonBlankKeys,
  (SELECT COUNT_BIG(*) FROM person_groups WHERE row_count>1) AS personDuplicateValueGroups,
  COALESCE((SELECT SUM(row_count) FROM person_groups WHERE row_count>1),0) AS personRepeatedValueRows,
  (SELECT COUNT_BIG(*) FROM person_normalized p WHERE p.business_key IS NOT NULL AND (SELECT COUNT_BIG(*) FROM dictionary_normalized d WHERE d.business_key=p.business_key)=0) AS personZeroMatchRows,
  (SELECT COUNT_BIG(*) FROM person_normalized p WHERE p.business_key IS NOT NULL AND (SELECT COUNT_BIG(*) FROM dictionary_normalized d WHERE d.business_key=p.business_key)=1) AS personOneMatchRows,
  (SELECT COUNT_BIG(*) FROM person_normalized p WHERE p.business_key IS NOT NULL AND (SELECT COUNT_BIG(*) FROM dictionary_normalized d WHERE d.business_key=p.business_key)>1) AS personMultipleMatchRows,
  (SELECT COUNT_BIG(*) FROM person_groups p WHERE NOT EXISTS (SELECT 1 FROM dictionary_normalized d WHERE d.business_key=p.business_key)) AS personOrphanDistinctKeys,
  (SELECT COUNT_BIG(*) FROM person_normalized WHERE business_key IS NOT NULL AND LEN(business_key)>30) AS personOverDictionaryWidthRows,
  COALESCE((SELECT MAX(LEN(business_key)) FROM person_normalized),0) AS personMaxObservedLength
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;

SELECT
  CONVERT(bit,CASE WHEN DATABASEPROPERTYEX(DB_NAME(),'Updateability')='READ_ONLY' THEN 1 ELSE 0 END) AS databaseReadOnly,
  CONVERT(bit,1) AS loginSucceeded,
  CONVERT(bit,COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)) AS sysadmin,
  CONVERT(bit,COALESCE(IS_ROLEMEMBER('db_datareader'),0)) AS dbDatareader,
  CONVERT(bit,COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)) AS viewDefinition,
  CONVERT(bit,COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT'),0)) AS [insert],
  CONVERT(bit,COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE'),0)) AS [update],
  CONVERT(bit,COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE'),0)) AS [delete],
  CONVERT(bit,COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'),0)) AS [execute]
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`;

const SHA256 = /^[0-9a-f]{64}$/u;
const CONTRACT_KEYS = ["formatVersion", "contractKind", "sourceSystem", "scope", "sourceObjects", "evidenceBindings", "aggregateFields", "allowedDecisions", "readOnlyAuthority", "readinessBoundary", "privacyPolicy", "materialization", "compatibilityCredit", "productionImport"];
const CATALOG_KEYS = ["schema", "table", "column", "type", "maxLength", "nullable"];
const AUTHORITY_KEYS = ["databaseReadOnly", "loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"];

export class LegacySecassignmentSourceProbeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacySecassignmentSourceProbeError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacySecassignmentSourceProbeError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => object(value) && same(Object.keys(value).sort(), [...keys].sort());

function validateContract(contract, repositoryRoot) {
  if (!exactKeys(contract, CONTRACT_KEYS) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_secassignment_source_probe"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.scope !== "person_secassignment_to_secassignmentcode_business_key_integrity"
    || !same(contract.sourceObjects, [
      { schema: "dbo", table: "person", column: "secassignment", requiredType: "varchar", declaredMaxLength: 50 },
      { schema: "dbo", table: "secassignmentcode", column: "secassignment", requiredType: "varchar", declaredMaxLength: 30 },
    ]) || !Array.isArray(contract.aggregateFields) || contract.aggregateFields.length !== 21
    || new Set(contract.aggregateFields).size !== contract.aggregateFields.length
    || !same(contract.allowedDecisions, [
      "SOURCE_RELATION_ONE_TO_ONE_READY", "SOURCE_RELATION_MANY_TO_ONE_READY", "HOLD_EMPTY_TABLE",
      "HOLD_DICTIONARY_ALL_EMPTY", "HOLD_PERSON_FIELD_ALL_EMPTY", "HOLD_DICTIONARY_BLANK_KEY",
      "HOLD_DICTIONARY_KEY_NOT_UNIQUE", "HOLD_ORPHAN_OR_AMBIGUOUS_MATCH", "HOLD_LENGTH_UNSAFE",
    ]) || !same(contract.readOnlyAuthority, {
      databaseReadOnly: true, loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true,
      insert: false, update: false, delete: false, execute: false,
    }) || !same(contract.readinessBoundary, {
      readyMeans: "legacy_source_business_key_cardinality_and_observed_length_only",
      modernOrganizationOrPositionTargetBinding: "UNBOUND", semanticCompatibility: "NOT_CLAIMED", integrationStatus: "REBIND_REQUIRED",
    }) || contract.privacyPolicy !== "catalog_identity_types_lengths_nullability_and_anonymous_counts_only"
    || contract.materialization !== "BLOCKED" || contract.compatibilityCredit !== 0 || contract.productionImport !== "HOLD") {
    fail("SECASSIGNMENT_SOURCE_PROBE_CONTRACT_INVALID", "identity or boundary");
  }
  if (!Array.isArray(contract.evidenceBindings) || contract.evidenceBindings.length !== 2) {
    fail("SECASSIGNMENT_SOURCE_PROBE_CONTRACT_INVALID", "evidence bindings");
  }
  const root = resolve(repositoryRoot);
  for (const [index, binding] of contract.evidenceBindings.entries()) {
    if (!exactKeys(binding, ["path", "sha256"]) || !SHA256.test(binding.sha256 ?? "")) fail("SECASSIGNMENT_SOURCE_PROBE_CONTRACT_INVALID", `evidence ${index}`);
    const path = resolve(root, binding.path);
    if (!path.startsWith(`${root}/`) || hash(readFileSync(path)) !== binding.sha256) fail("SECASSIGNMENT_SOURCE_PROBE_EVIDENCE_DRIFT", `evidence ${index}`);
  }
}

function validateCatalog(contract, catalog) {
  if (!Array.isArray(catalog) || catalog.length !== contract.sourceObjects.length) fail("SECASSIGNMENT_SOURCE_PROBE_CATALOG_INVALID", "cardinality");
  const byLocator = new Map();
  for (const row of catalog) {
    if (!exactKeys(row, CATALOG_KEYS) || row.schema !== "dbo" || typeof row.nullable !== "boolean") fail("SECASSIGNMENT_SOURCE_PROBE_CATALOG_INVALID", "shape");
    const locator = `${row.table}.${row.column}`;
    if (byLocator.has(locator)) fail("SECASSIGNMENT_SOURCE_PROBE_CATALOG_INVALID", "duplicate locator");
    byLocator.set(locator, row);
  }
  return contract.sourceObjects.map(expected => {
    const row = byLocator.get(`${expected.table}.${expected.column}`);
    if (!row || row.type !== expected.requiredType || row.maxLength !== expected.declaredMaxLength) {
      fail("SECASSIGNMENT_SOURCE_PROBE_CATALOG_INVALID", `${expected.table}.${expected.column}`);
    }
    return structuredClone(row);
  });
}

function validateAuthority(contract, authority, databaseReadOnly) {
  if (!exactKeys(authority, AUTHORITY_KEYS) || !same(authority, contract.readOnlyAuthority) || databaseReadOnly !== true) {
    fail("SECASSIGNMENT_SOURCE_PROBE_AUTHORITY_INVALID", "read-only minimum privilege required");
  }
  return structuredClone(authority);
}

function validateAggregate(contract, aggregate) {
  if (!exactKeys(aggregate, contract.aggregateFields)) fail("SECASSIGNMENT_SOURCE_PROBE_AGGREGATE_INVALID", "fields");
  for (const field of contract.aggregateFields) {
    if (!Number.isSafeInteger(aggregate[field]) || aggregate[field] < 0) fail("SECASSIGNMENT_SOURCE_PROBE_AGGREGATE_INVALID", field);
  }
  const a = aggregate;
  const dictionaryHasValues = a.dictionaryNonBlankRows > 0;
  const personHasValues = a.personNonBlankRows > 0;
  if (a.dictionaryNullRows + a.dictionaryBlankRows + a.dictionaryNonBlankRows !== a.dictionaryRows
    || a.personNullRows + a.personBlankRows + a.personNonBlankRows !== a.personRows
    || a.dictionaryDistinctNonBlankKeys > a.dictionaryNonBlankRows
    || a.personDistinctNonBlankKeys > a.personNonBlankRows
    || (a.dictionaryDuplicateKeyGroups === 0) !== (a.dictionaryDuplicateRows === 0)
    || (a.personDuplicateValueGroups === 0) !== (a.personRepeatedValueRows === 0)
    || (a.dictionaryDistinctNonBlankKeys === a.dictionaryNonBlankRows) !== (a.dictionaryDuplicateKeyGroups === 0)
    || (a.personDistinctNonBlankKeys === a.personNonBlankRows) !== (a.personDuplicateValueGroups === 0)
    || a.dictionaryDuplicateKeyGroups > a.dictionaryDistinctNonBlankKeys
    || a.personDuplicateValueGroups > a.personDistinctNonBlankKeys
    || a.dictionaryDuplicateRows < a.dictionaryDuplicateKeyGroups * 2
    || a.personRepeatedValueRows < a.personDuplicateValueGroups * 2
    || a.dictionaryDuplicateRows > a.dictionaryNonBlankRows
    || a.personRepeatedValueRows > a.personNonBlankRows
    || a.personZeroMatchRows + a.personOneMatchRows + a.personMultipleMatchRows !== a.personNonBlankRows
    || a.personOrphanDistinctKeys > a.personZeroMatchRows
    || (a.personZeroMatchRows === 0) !== (a.personOrphanDistinctKeys === 0)
    || a.personOverDictionaryWidthRows > a.personZeroMatchRows
    || (dictionaryHasValues ? a.dictionaryMaxObservedLength < 1 : a.dictionaryMaxObservedLength !== 0)
    || (personHasValues ? a.personMaxObservedLength < 1 : a.personMaxObservedLength !== 0)
    || a.dictionaryMaxObservedLength > 30 || a.personMaxObservedLength > 50) {
    fail("SECASSIGNMENT_SOURCE_PROBE_AGGREGATE_INVALID", "count or length conservation differs");
  }
  return structuredClone(aggregate);
}

function decide(a) {
  if (a.dictionaryRows === 0 || a.personRows === 0) return ["HOLD_EMPTY_TABLE", "SOURCE_TABLE_EMPTY", null];
  if (a.dictionaryNonBlankRows === 0) return ["HOLD_DICTIONARY_ALL_EMPTY", "DICTIONARY_KEY_ALL_EMPTY", null];
  if (a.personNonBlankRows === 0) return ["HOLD_PERSON_FIELD_ALL_EMPTY", "PERSON_RELATION_FIELD_ALL_EMPTY", null];
  if (a.dictionaryBlankRows > 0 || a.dictionaryNullRows > 0) return ["HOLD_DICTIONARY_BLANK_KEY", "DICTIONARY_KEY_NULL_OR_BLANK", null];
  if (a.dictionaryDuplicateKeyGroups > 0 || a.dictionaryDuplicateRows > 0 || a.personMultipleMatchRows > 0) {
    return ["HOLD_DICTIONARY_KEY_NOT_UNIQUE", "DICTIONARY_BUSINESS_KEY_NOT_UNIQUE", null];
  }
  if (a.personOverDictionaryWidthRows > 0 || a.personMaxObservedLength > 30) return ["HOLD_LENGTH_UNSAFE", "PERSON_VALUE_EXCEEDS_DICTIONARY_WIDTH", null];
  if (a.personZeroMatchRows > 0 || a.personOrphanDistinctKeys > 0 || a.personOneMatchRows !== a.personNonBlankRows) {
    return ["HOLD_ORPHAN_OR_AMBIGUOUS_MATCH", "PERSON_RELATION_NOT_EXACTLY_ONE", null];
  }
  if (a.personDuplicateValueGroups > 0) return ["SOURCE_RELATION_MANY_TO_ONE_READY", "LEGACY_BUSINESS_KEY_MANY_TO_ONE_CONFIRMED", "many_to_one"];
  return ["SOURCE_RELATION_ONE_TO_ONE_READY", "LEGACY_BUSINESS_KEY_ONE_TO_ONE_CONFIRMED", "one_to_one"];
}

export function buildLegacySecassignmentSourceProbeReceipt({ contract, repositoryRoot, catalog, aggregate, authority, databaseReadOnly, sourceRestoreReceiptSha256, databaseIdentitySha256 }) {
  validateContract(contract, repositoryRoot);
  for (const digest of [sourceRestoreReceiptSha256, databaseIdentitySha256]) {
    if (!SHA256.test(digest ?? "")) fail("SECASSIGNMENT_SOURCE_PROBE_BINDING_INVALID", "source identity hash");
  }
  const catalogFacts = validateCatalog(contract, catalog);
  const safeAuthority = validateAuthority(contract, authority, databaseReadOnly);
  const safeFacts = validateAggregate(contract, aggregate);
  const [decision, reasonCode, relationshipCardinality] = decide(safeFacts);
  const relationReady = decision === "SOURCE_RELATION_ONE_TO_ONE_READY" || decision === "SOURCE_RELATION_MANY_TO_ONE_READY";
  const body = {
    formatVersion: 1,
    artifactKind: contract.contractKind,
    sourceSystem: contract.sourceSystem,
    scope: contract.scope,
    sourceBinding: {
      sourceRestoreReceiptSha256,
      databaseIdentitySha256,
      predecessorReceiptContractSha256: contract.evidenceBindings[0].sha256,
      organizationPositionMapSha256: contract.evidenceBindings[1].sha256,
      probeQuerySha256: hash(SECASSIGNMENT_SOURCE_PROBE_SQL),
      catalogSha256: hash(`${JSON.stringify(catalogFacts)}\n`),
      aggregateSha256: hash(`${JSON.stringify(safeFacts)}\n`),
    },
    operationMode: "read_only_catalog_and_anonymous_aggregate",
    sourceState: { readOnly: databaseReadOnly },
    etlAuthority: safeAuthority,
    catalogFacts,
    safeFacts,
    decision,
    reasonCode,
    relationReady,
    relationshipCardinality,
    readinessBoundary: structuredClone(contract.readinessBoundary),
    materialization: "BLOCKED",
    compatibilityCredit: 0,
    containsFieldValues: false,
    containsPersonData: false,
    containsCredentials: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--print-read-only-sql") return { printReadOnlySql: true };
  const flags = ["--catalog", "--aggregate", "--authority", "--source-restore-receipt-sha256", "--database-identity-sha256"];
  if (argv.length !== flags.length * 2) fail("SECASSIGNMENT_SOURCE_PROBE_ARGUMENT_INVALID", "required arguments");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!flags.includes(flag) || !value || value.startsWith("--")) fail("SECASSIGNMENT_SOURCE_PROBE_ARGUMENT_INVALID", "arguments");
    values[flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = value;
  }
  if (Object.keys(values).length !== flags.length) fail("SECASSIGNMENT_SOURCE_PROBE_ARGUMENT_INVALID", "duplicate arguments");
  return values;
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(resolve(path), "utf8")); }
  catch { fail("SECASSIGNMENT_SOURCE_PROBE_INPUT_INVALID", label); }
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printReadOnlySql) {
    process.stdout.write(`${SECASSIGNMENT_SOURCE_PROBE_SQL}\n`);
    return;
  }
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = readJson(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-secassignment-source-probe-v1.json"), "contract");
  const receipt = buildLegacySecassignmentSourceProbeReceipt({
    contract, repositoryRoot,
    catalog: readJson(args.catalog, "catalog"),
    aggregate: readJson(args.aggregate, "aggregate"),
    authority: readJson(args.authority, "authority"),
    databaseReadOnly: true,
    sourceRestoreReceiptSha256: args.sourceRestoreReceiptSha256,
    databaseIdentitySha256: args.databaseIdentitySha256,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); }
  catch (error) {
    process.stderr.write(`${error instanceof LegacySecassignmentSourceProbeError ? error.message : "SECASSIGNMENT_SOURCE_PROBE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
