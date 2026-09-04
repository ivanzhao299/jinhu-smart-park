#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COMPANY_ROOT_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT
  COUNT_BIG(*) AS companyRows,
  COUNT_BIG(DISTINCT id) AS distinctIdRows,
  COALESCE(SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END),0) AS nullIdRows,
  (SELECT COUNT_BIG(*) FROM (SELECT id FROM dbo.company WHERE id IS NOT NULL GROUP BY id HAVING COUNT_BIG(*)>1) duplicate_ids) AS duplicateIdGroups,
  COUNT_BIG(DISTINCT NULLIF(LTRIM(RTRIM(company)),'')) AS distinctCompanyNames,
  COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(company)),'') IS NULL THEN 1 ELSE 0 END),0) AS blankCompanyRows,
  COALESCE(MAX(LEN(NULLIF(LTRIM(RTRIM(company)),''))),0) AS maxCompanyLength,
  COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(phone)),'') IS NULL THEN 1 ELSE 0 END),0) AS blankPhoneRows,
  COALESCE(MAX(LEN(NULLIF(LTRIM(RTRIM(phone)),''))),0) AS maxPhoneLength,
  COUNT_BIG(DISTINCT NULLIF(LTRIM(RTRIM(etype)),'')) AS distinctEtypeRows,
  COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(etype)),'') IS NULL THEN 1 ELSE 0 END),0) AS blankEtypeRows,
  COALESCE(MAX(LEN(NULLIF(LTRIM(RTRIM(etype)),''))),0) AS maxEtypeLength
FROM dbo.company
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`;

const SHA256 = /^[0-9a-f]{64}$/u;
const CONTRACT_KEYS = [
  "formatVersion",
  "contractKind",
  "sourceSystem",
  "sourceTable",
  "scope",
  "sourceSchema",
  "evidenceBindings",
  "candidateFields",
  "explicitGaps",
  "aggregateFields",
  "privacyPolicy",
  "allowedDecision",
  "receiptStatus",
  "compatibilityCredit",
  "productionImport",
];
const CATALOG_COLUMNS = ["id", "company", "phone", "etype", "addr", "email", "master"];
const AGGREGATE_FIELDS = [
  "companyRows",
  "distinctIdRows",
  "nullIdRows",
  "duplicateIdGroups",
  "distinctCompanyNames",
  "blankCompanyRows",
  "maxCompanyLength",
  "blankPhoneRows",
  "maxPhoneLength",
  "distinctEtypeRows",
  "blankEtypeRows",
  "maxEtypeLength",
];
const EXPECTED_SOURCE_INVENTORY_SHA256 = "182e49369910e0b251459b91fe79c5f465f9f78c1f35ee46c388f45a947ca19c";
const EXPECTED_SOURCE_SCHEMA_SHA256 = "4bc267b5b6b5f15cf367ec38caaf4bc2559ebe0666fd2cb9fdecd406c2ec1f2e";
const CANDIDATES = new Map([
  ["id", { candidateTarget: "sys_org.legacy_source_id", targetEvidenceIds: ["sys_org_legacy_columns", "sys_org_entity"], currentGapCode: "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED", semanticStatus: "pending_authoritative_root_merge" }],
  ["company", { candidateTarget: "sys_org.org_name", targetEvidenceIds: ["sys_org_base", "sys_org_entity"], currentGapCode: "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED", semanticStatus: "pending_authoritative_root_merge" }],
  ["phone", { candidateTarget: "sys_org.contact_phone", targetEvidenceIds: ["sys_org_legacy_columns", "sys_org_entity"], currentGapCode: "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED", semanticStatus: "pending_authoritative_root_merge" }],
  ["etype", { candidateTarget: "sys_org.org_type", targetEvidenceIds: ["sys_org_base", "sys_org_entity"], currentGapCode: "LEGACY_SEMANTICS_UNCONFIRMED", semanticStatus: "pending_authoritative_legacy_semantics" }],
]);
const GAPS = new Map([
  ["addr", { currentMapTarget: "sys_org", authoritativeModernTarget: "sys_org.contact_address", forbiddenTargets: ["sys_org.remark"], gapCode: "COMPANY_ADDR_SOURCE_SEMANTICS_UNCONFIRMED" }],
  ["email", { currentMapTarget: "sys_org", authoritativeModernTarget: "sys_org.contact_email", forbiddenTargets: ["sys_org.remark"], gapCode: "COMPANY_EMAIL_SOURCE_SEMANTICS_UNCONFIRMED" }],
  ["master", { currentMapTarget: "sys_org.leader_user_id", authoritativeModernTarget: "sys_org.legacy_company_manager_reference", forbiddenTargets: ["sys_org.leader_user_id", "sys_org.remark"], gapCode: "COMPANY_MASTER_IDENTITY_BINDING_REQUIRED" }],
]);

export class LegacyCompanyRootFieldReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyCompanyRootFieldReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyCompanyRootFieldReceiptError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, required) => object(value)
  && same(Object.keys(value).sort((a, b) => a.localeCompare(b, "en")), [...required].sort((a, b) => a.localeCompare(b, "en")));
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, "en"));

function readBoundFile(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("COMPANY_ROOT_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (hash(bytes) !== evidence.sha256) fail("COMPANY_ROOT_EVIDENCE_DRIFT", label);
  return bytes;
}

function assertTokens(source, tokens, label) {
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
    fail("COMPANY_ROOT_EVIDENCE_TOKEN_MISSING", label);
  }
}

function validateCandidateFields(fields) {
  if (!Array.isArray(fields) || fields.length !== CANDIDATES.size) fail("COMPANY_ROOT_CANDIDATE_SET_INVALID", "cardinality");
  for (const field of fields) {
    if (!exactKeys(field, ["sourceColumn", "candidateTarget", "targetEvidenceIds", "currentGapCode", "semanticStatus", "compatibilityCredit"])) {
      fail("COMPANY_ROOT_CANDIDATE_INVALID", String(field?.sourceColumn));
    }
    const expected = CANDIDATES.get(field.sourceColumn);
    if (!expected || field.candidateTarget !== expected.candidateTarget
      || !same(field.targetEvidenceIds, expected.targetEvidenceIds)
      || field.currentGapCode !== expected.currentGapCode
      || field.semanticStatus !== expected.semanticStatus
      || field.compatibilityCredit !== 0) fail("COMPANY_ROOT_CANDIDATE_INVALID", String(field.sourceColumn));
  }
  if (!same(fields.map(field => field.sourceColumn), [...CANDIDATES.keys()])) fail("COMPANY_ROOT_CANDIDATE_SET_INVALID", "order");
}

function validateExplicitGaps(gaps) {
  if (!Array.isArray(gaps) || gaps.length !== GAPS.size) fail("COMPANY_ROOT_GAP_SET_INVALID", "cardinality");
  for (const gap of gaps) {
    if (!exactKeys(gap, ["sourceColumn", "currentMapTarget", "authoritativeModernTarget", "forbiddenTargets", "gapCode", "compatibilityCredit"])) {
      fail("COMPANY_ROOT_GAP_INVALID", String(gap?.sourceColumn));
    }
    const expected = GAPS.get(gap.sourceColumn);
    if (!expected || gap.currentMapTarget !== expected.currentMapTarget
      || gap.authoritativeModernTarget !== expected.authoritativeModernTarget
      || !same(gap.forbiddenTargets, expected.forbiddenTargets)
      || gap.gapCode !== expected.gapCode
      || gap.compatibilityCredit !== 0) fail("COMPANY_ROOT_GAP_INVALID", String(gap.sourceColumn));
  }
  if (!same(gaps.map(gap => gap.sourceColumn), [...GAPS.keys()])) fail("COMPANY_ROOT_GAP_SET_INVALID", "order");
}

function validateOrganizationMap(repositoryRoot, binding, contract) {
  if (!exactKeys(binding, ["path", "selectedCompanyColumns", "selectedRowsSha256"])
    || binding.path !== "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json"
    || !same(binding.selectedCompanyColumns, CATALOG_COLUMNS)
    || !SHA256.test(binding.selectedRowsSha256 ?? "")) fail("COMPANY_ROOT_MAP_BINDING_INVALID", "identity");
  const map = JSON.parse(readFileSync(resolve(repositoryRoot, binding.path), "utf8"));
  if (map.inventorySha256 !== contract.sourceSchema.inventorySha256 || map.productionImport !== "HOLD") fail("COMPANY_ROOT_MAP_BINDING_INVALID", "source identity");
  const selected = (map.fields ?? [])
    .filter(field => field.sourceTable === "company" && CATALOG_COLUMNS.includes(field.sourceColumn))
    .sort((left, right) => left.sourceColumn.localeCompare(right.sourceColumn, "en"));
  if (selected.length !== CATALOG_COLUMNS.length || hash(JSON.stringify(selected)) !== binding.selectedRowsSha256) {
    fail("COMPANY_ROOT_MAP_DRIFT", "selected company fields");
  }
  for (const field of contract.candidateFields) {
    const current = selected.find(row => row.sourceColumn === field.sourceColumn);
    if (current?.disposition !== "pending" || current.reasonCode !== field.currentGapCode || !same(current.targetLocators, [field.candidateTarget])) {
      fail("COMPANY_ROOT_MAP_DRIFT", field.sourceColumn);
    }
  }
  for (const gap of contract.explicitGaps) {
    const current = selected.find(row => row.sourceColumn === gap.sourceColumn);
    if (current?.disposition !== "pending" || !same(current.targetLocators, [gap.currentMapTarget])) fail("COMPANY_ROOT_MAP_DRIFT", gap.sourceColumn);
  }
}

function validateRoutineLedger(repositoryRoot, binding) {
  if (!exactKeys(binding, ["path", "sha256", "expectedCompanyReferenceCount"])
    || binding.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || binding.expectedCompanyReferenceCount !== 0) fail("COMPANY_ROOT_ROUTINE_BINDING_INVALID", "identity");
  const ledger = JSON.parse(readBoundFile(repositoryRoot, binding, "routine ledger").toString("utf8"));
  const references = (ledger.routines ?? []).filter(routine => [
    ...(routine.readTables ?? []),
    ...(routine.writeTables ?? []),
    ...(routine.externalTables ?? []),
    ...(routine.generatedTables ?? []),
  ].some(table => String(table).replace(/^dbo\./iu, "").toLowerCase() === "company"));
  if (references.length !== binding.expectedCompanyReferenceCount) fail("COMPANY_ROOT_ROUTINE_REFERENCE_DRIFT", String(references.length));
}

function validateClientPage(repositoryRoot, binding) {
  if (!exactKeys(binding, ["path", "sha256", "atomicId", "entryPoint", "requiredObservationStatus", "requiredGapReasonCode"])
    || binding.path !== "scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json"
    || binding.atomicId !== "client.organization_job.001"
    || binding.entryPoint !== "单位设置"
    || binding.requiredObservationStatus !== "pending"
    || binding.requiredGapReasonCode !== "ATOMIC_RUNTIME_OBSERVATION_PENDING") fail("COMPANY_ROOT_PAGE_BINDING_INVALID", "identity");
  const inventory = JSON.parse(readBoundFile(repositoryRoot, binding, "client atomic page inventory").toString("utf8"));
  const entry = (inventory.entries ?? []).find(row => row.atomicId === binding.atomicId);
  if (!entry || entry.entryPoint !== binding.entryPoint || entry.observationStatus !== binding.requiredObservationStatus
    || entry.gapReasonCode !== binding.requiredGapReasonCode || entry.coverage?.fields !== false
    || (entry.fieldIds ?? []).length !== 0 || (entry.evidence?.sha256 ?? []).length !== 0) {
    fail("COMPANY_ROOT_PAGE_EVIDENCE_DRIFT", binding.atomicId);
  }
}

function validateTargetArtifacts(repositoryRoot, artifacts, candidates) {
  const expected = new Map([
    ["sys_org_base", "database/migrations/000002_s1_system_foundation.sql"],
    ["sys_org_legacy_columns", "database/migrations/000295_hr_organization_position_legacy_mapping.sql"],
    ["sys_org_entity", "apps/api/src/modules/orgs/entities/org.entity.ts"],
    ["sys_org_company_contact_model", "database/migrations/000298_hr_org_company_contact_model.sql"],
  ]);
  if (!Array.isArray(artifacts) || artifacts.length !== expected.size) fail("COMPANY_ROOT_TARGET_EVIDENCE_INVALID", "cardinality");
  const ids = new Set();
  for (const artifact of artifacts) {
    if (!exactKeys(artifact, ["id", "path", "sha256", "requiredTokens"]) || expected.get(artifact.id) !== artifact.path || ids.has(artifact.id)) {
      fail("COMPANY_ROOT_TARGET_EVIDENCE_INVALID", String(artifact?.id));
    }
    ids.add(artifact.id);
    const source = readBoundFile(repositoryRoot, artifact, artifact.id).toString("utf8");
    assertTokens(source, artifact.requiredTokens, artifact.id);
  }
  for (const candidate of candidates) {
    if (candidate.targetEvidenceIds.some(id => !ids.has(id))) fail("COMPANY_ROOT_TARGET_EVIDENCE_INVALID", candidate.sourceColumn);
  }
}

function validateContract(contract, repositoryRoot) {
  if (!exactKeys(contract, CONTRACT_KEYS)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_company_root_field_receipt"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.sourceTable !== "company"
    || contract.scope !== "company_root_organization_minimum_field_family"
    || contract.privacyPolicy !== "aggregate_counts_lengths_and_catalog_only_no_company_values_personal_data_or_identifiers"
    || contract.allowedDecision !== "KEEP_PENDING"
    || contract.receiptStatus !== "SOURCE_FACTS_CAPTURED_SEMANTIC_AND_TARGET_REVIEW_PENDING"
    || !same(contract.compatibilityCredit, { numerator: 0, denominator: 4 })
    || contract.productionImport !== "HOLD") fail("COMPANY_ROOT_CONTRACT_INVALID", "identity or safety boundary");
  if (!exactKeys(contract.sourceSchema, ["inventorySha256", "schemaArtifactSha256", "requiredCatalogColumns"])
    || contract.sourceSchema.inventorySha256 !== EXPECTED_SOURCE_INVENTORY_SHA256
    || contract.sourceSchema.schemaArtifactSha256 !== EXPECTED_SOURCE_SCHEMA_SHA256
    || !same(contract.sourceSchema.requiredCatalogColumns, CATALOG_COLUMNS)
    || !same(contract.aggregateFields, AGGREGATE_FIELDS)) fail("COMPANY_ROOT_CONTRACT_INVALID", "source schema");
  if (!exactKeys(contract.evidenceBindings, ["organizationPositionMap", "routineLedger", "clientAtomicPage", "targetArtifacts"])) {
    fail("COMPANY_ROOT_CONTRACT_INVALID", "evidence bindings");
  }
  validateCandidateFields(contract.candidateFields);
  validateExplicitGaps(contract.explicitGaps);
  validateOrganizationMap(repositoryRoot, contract.evidenceBindings.organizationPositionMap, contract);
  validateRoutineLedger(repositoryRoot, contract.evidenceBindings.routineLedger);
  validateClientPage(repositoryRoot, contract.evidenceBindings.clientAtomicPage);
  validateTargetArtifacts(repositoryRoot, contract.evidenceBindings.targetArtifacts, contract.candidateFields);
}

function validateCatalog(catalog, expectedColumns) {
  if (!Array.isArray(catalog) || catalog.length !== expectedColumns.length) fail("COMPANY_ROOT_CATALOG_INVALID", "cardinality");
  const byColumn = new Map();
  for (const row of catalog) {
    if (!exactKeys(row, ["table", "column", "type", "maxLength", "nullable"])
      || row.table !== "company" || !expectedColumns.includes(row.column) || byColumn.has(row.column)
      || typeof row.type !== "string" || !/^[a-z][a-z0-9_ ]{0,31}$/u.test(row.type)
      || !(row.maxLength === null || (Number.isSafeInteger(row.maxLength) && row.maxLength > 0))
      || typeof row.nullable !== "boolean") fail("COMPANY_ROOT_CATALOG_INVALID", String(row?.column));
    byColumn.set(row.column, row);
  }
  if (!same(sorted(byColumn.keys()), sorted(expectedColumns))) fail("COMPANY_ROOT_CATALOG_INVALID", "column set");
  return byColumn;
}

function validateAggregate(aggregate, expectedFields) {
  if (!exactKeys(aggregate, expectedFields)) fail("COMPANY_ROOT_AGGREGATE_INVALID", "fields");
  for (const field of expectedFields) {
    if (!Number.isSafeInteger(aggregate[field]) || aggregate[field] < 0) fail("COMPANY_ROOT_AGGREGATE_INVALID", field);
  }
  const rows = aggregate.companyRows;
  for (const field of ["distinctIdRows", "nullIdRows", "duplicateIdGroups", "distinctCompanyNames", "blankCompanyRows", "blankPhoneRows", "distinctEtypeRows", "blankEtypeRows"]) {
    if (aggregate[field] > rows) fail("COMPANY_ROOT_AGGREGATE_INVALID", `${field} exceeds companyRows`);
  }
  if (aggregate.distinctIdRows + aggregate.nullIdRows > rows
    || (rows === 0 && ["maxCompanyLength", "maxPhoneLength", "maxEtypeLength"].some(field => aggregate[field] !== 0))) {
    fail("COMPANY_ROOT_AGGREGATE_INVALID", "count conservation differs");
  }
}

function characterStorageCompatible(row, maximum) {
  return /^(?:char|nchar|varchar|nvarchar)$/u.test(row.type) && Number.isSafeInteger(row.maxLength) && row.maxLength <= maximum;
}

function storageCompatible(column, catalog) {
  const row = catalog.get(column);
  if (column === "id") return /^(?:tinyint|smallint|int)$/u.test(row.type);
  if (column === "company") return characterStorageCompatible(row, 100);
  if (column === "phone") return characterStorageCompatible(row, 50);
  if (column === "etype") return characterStorageCompatible(row, 32);
  return false;
}

function aggregateFacts(column, aggregate) {
  if (column === "id") return { rows: aggregate.companyRows, distinctRows: aggregate.distinctIdRows, nullRows: aggregate.nullIdRows, duplicateGroups: aggregate.duplicateIdGroups };
  if (column === "company") return { rows: aggregate.companyRows, blankRows: aggregate.blankCompanyRows, distinctRows: aggregate.distinctCompanyNames, maxObservedLength: aggregate.maxCompanyLength };
  if (column === "phone") return { rows: aggregate.companyRows, blankRows: aggregate.blankPhoneRows, maxObservedLength: aggregate.maxPhoneLength };
  return { rows: aggregate.companyRows, blankRows: aggregate.blankEtypeRows, distinctRows: aggregate.distinctEtypeRows, maxObservedLength: aggregate.maxEtypeLength };
}

export function buildLegacyCompanyRootFieldReceipt({ contract, repositoryRoot, catalog, aggregate, sourceRestoreReceiptSha256, databaseIdentitySha256 }) {
  validateContract(contract, repositoryRoot);
  for (const [label, digest] of Object.entries({ sourceRestoreReceiptSha256, databaseIdentitySha256 })) {
    if (!SHA256.test(digest ?? "")) fail("COMPANY_ROOT_SOURCE_BINDING_INVALID", label);
  }
  const catalogByColumn = validateCatalog(catalog, contract.sourceSchema.requiredCatalogColumns);
  validateAggregate(aggregate, contract.aggregateFields);
  const canonicalCatalog = contract.sourceSchema.requiredCatalogColumns.map(column => catalogByColumn.get(column));
  const canonicalAggregate = Object.fromEntries(contract.aggregateFields.map(field => [field, aggregate[field]]));
  const fieldFacts = contract.candidateFields.map(field => ({
    sourceLocator: `company.${field.sourceColumn}`,
    sourceCatalog: { type: catalogByColumn.get(field.sourceColumn).type, maxLength: catalogByColumn.get(field.sourceColumn).maxLength, nullable: catalogByColumn.get(field.sourceColumn).nullable },
    aggregateFacts: aggregateFacts(field.sourceColumn, aggregate),
    candidateTarget: field.candidateTarget,
    targetStorageCompatible: storageCompatible(field.sourceColumn, catalogByColumn),
    semanticStatus: field.semanticStatus,
    decision: "KEEP_PENDING",
    reasonCode: field.currentGapCode,
    compatibilityCredit: 0,
  }));
  const explicitGaps = contract.explicitGaps.map(gap => ({
    sourceLocator: `company.${gap.sourceColumn}`,
    sourceCatalog: { type: catalogByColumn.get(gap.sourceColumn).type, maxLength: catalogByColumn.get(gap.sourceColumn).maxLength, nullable: catalogByColumn.get(gap.sourceColumn).nullable },
    authoritativeModernTarget: gap.authoritativeModernTarget,
    forbiddenTargets: [...gap.forbiddenTargets],
    decision: "KEEP_GAP",
    reasonCode: gap.gapCode,
    compatibilityCredit: 0,
  }));
  const hasStorageConflict = fieldFacts.some(field => !field.targetStorageCompatible);
  const hasIdentityShapeConflict = aggregate.companyRows === 0 || aggregate.nullIdRows > 0
    || aggregate.distinctIdRows !== aggregate.companyRows || aggregate.duplicateIdGroups > 0 || aggregate.blankCompanyRows > 0;
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_company_root_field_receipt",
    sourceSystem: contract.sourceSystem,
    sourceTable: contract.sourceTable,
    sourceBinding: {
      sourceRestoreReceiptSha256,
      databaseIdentitySha256,
      inventorySha256: contract.sourceSchema.inventorySha256,
      schemaArtifactSha256: contract.sourceSchema.schemaArtifactSha256,
      catalogSha256: hash(`${JSON.stringify(canonicalCatalog)}\n`),
      aggregateQuerySha256: hash(COMPANY_ROOT_SAFE_AGGREGATE_SQL),
      aggregateSha256: hash(`${JSON.stringify(canonicalAggregate)}\n`),
    },
    sourceEvidence: {
      routineReferenceCount: contract.evidenceBindings.routineLedger.expectedCompanyReferenceCount,
      unitSettingsPageObservationStatus: contract.evidenceBindings.clientAtomicPage.requiredObservationStatus,
      unitSettingsFieldObservationVerified: false,
    },
    fieldFacts,
    explicitGaps,
    decision: "KEEP_PENDING",
    reasonCodes: [
      ...(hasStorageConflict ? ["COMPANY_ROOT_TARGET_STORAGE_INCOMPATIBLE"] : []),
      ...(hasIdentityShapeConflict ? ["COMPANY_ROOT_SOURCE_SHAPE_REVIEW_REQUIRED"] : []),
      "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED",
      "COMPANY_ROOT_PAGE_FIELD_OBSERVATION_MISSING",
      "COMPANY_ETYPE_SEMANTICS_UNCONFIRMED",
    ],
    status: contract.receiptStatus,
    compatibilityCredit: { numerator: 0, denominator: contract.candidateFields.length },
    containsSourceValues: false,
    containsPersonData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--print-safe-sql") values.printSafeSql = true;
    else if (["--catalog", "--aggregate", "--source-restore-receipt-sha256", "--database-identity-sha256"].includes(arg)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) fail("COMPANY_ROOT_ARGUMENT_INVALID", arg);
      values[arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = next;
      index += 1;
    } else fail("COMPANY_ROOT_ARGUMENT_INVALID", arg);
  }
  return values;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printSafeSql) {
    if (Object.keys(args).length !== 1) fail("COMPANY_ROOT_ARGUMENT_INVALID", "--print-safe-sql must be used alone");
    process.stdout.write(`${COMPANY_ROOT_SAFE_AGGREGATE_SQL}\n`);
    return;
  }
  for (const field of ["catalog", "aggregate", "sourceRestoreReceiptSha256", "databaseIdentitySha256"]) {
    if (!args[field]) fail("COMPANY_ROOT_ARGUMENT_INVALID", field);
  }
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-company-root-field-receipt-v1.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(resolve(args.catalog), "utf8"));
  const aggregate = JSON.parse(readFileSync(resolve(args.aggregate), "utf8"));
  const receipt = buildLegacyCompanyRootFieldReceipt({
    contract,
    repositoryRoot,
    catalog,
    aggregate,
    sourceRestoreReceiptSha256: args.sourceRestoreReceiptSha256,
    databaseIdentitySha256: args.databaseIdentitySha256,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
