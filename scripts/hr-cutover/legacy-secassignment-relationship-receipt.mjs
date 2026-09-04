/* global structuredClone */
import { createHash } from "node:crypto";

export const SECASSIGNMENT_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.secassignmentcode) AS dictionaryRows,
  (SELECT COUNT_BIG(DISTINCT NULLIF(LTRIM(RTRIM(secassignment)),'')) FROM dbo.secassignmentcode) AS dictionaryDistinctKeys,
  (SELECT COUNT_BIG(*) FROM dbo.secassignmentcode WHERE NULLIF(LTRIM(RTRIM(secassignment)),'') IS NULL) AS dictionaryBlankKeys,
  (SELECT COUNT_BIG(*) FROM (SELECT NULLIF(LTRIM(RTRIM(secassignment)),'') value FROM dbo.secassignmentcode GROUP BY NULLIF(LTRIM(RTRIM(secassignment)),'') HAVING COUNT_BIG(*)>1) duplicates) AS dictionaryDuplicateKeys,
  (SELECT COUNT_BIG(*) FROM dbo.person WHERE NULLIF(LTRIM(RTRIM(secassignment)),'') IS NOT NULL) AS personNonBlankRows,
  (SELECT COUNT_BIG(*) FROM dbo.person p WHERE NULLIF(LTRIM(RTRIM(p.secassignment)),'') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.secassignmentcode d WHERE NULLIF(LTRIM(RTRIM(d.secassignment)),'')=NULLIF(LTRIM(RTRIM(p.secassignment)),''))) AS personMatchedRows,
  (SELECT COUNT_BIG(*) FROM dbo.person p WHERE NULLIF(LTRIM(RTRIM(p.secassignment)),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.secassignmentcode d WHERE NULLIF(LTRIM(RTRIM(d.secassignment)),'')=NULLIF(LTRIM(RTRIM(p.secassignment)),''))) AS personUnmatchedRows,
  (SELECT COUNT_BIG(*) FROM dbo.person WHERE LEN(NULLIF(LTRIM(RTRIM(secassignment)),''))>30) AS personOverDictionaryWidthRows
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`;

export class LegacySecassignmentRelationshipReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacySecassignmentRelationshipReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacySecassignmentRelationshipReceiptError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const SHA256 = /^[0-9a-f]{64}$/u;
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const STRUCTURAL_EVIDENCE_KEYS = [
  "inventorySha256",
  "schemaArtifactSha256",
  "profileProjectionRoutineId",
  "profileProjectionRoutineSha256",
  "relationshipClassification",
  "relationshipReviewStatus",
  "profileProjectionReadsDictionary",
  "profileProjectionJoinsRelationship",
  "directOrganizationOrPositionRelationEvidence",
];
const GAP_KEYS = ["code", "missingEvidence", "materialization", "compatibilityCredit"];
const MISSING_EVIDENCE = [
  "reviewed_legacy_secassignment_semantic_definition",
  "declared_foreign_key_or_reviewed_deployed_join",
  "approved_modern_organization_or_position_target_binding",
];

function validateContract(contract) {
  if (contract?.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_secassignment_relationship_receipt"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.personSource !== "person.secassignment"
    || contract.dictionarySource !== "secassignmentcode.secassignment"
    || contract.personSourceType !== "varchar(50)"
    || contract.dictionarySourceType !== "varchar(30)"
    || contract.declaredForeignKeyRequiredForExactMapping !== true
    || contract.deployedRoutineJoinRequiredForExactMapping !== true
    || contract.privacyPolicy !== "aggregate_counts_only_no_person_values_or_identifiers"
    || contract.allowedDecision !== "KEEP_PENDING"
    || contract.productionImport !== "HOLD") fail("SECASSIGNMENT_RECEIPT_CONTRACT_INVALID", "identity");

  const evidence = contract.structuralEvidence;
  if (!exactKeys(evidence, STRUCTURAL_EVIDENCE_KEYS)
    || !SHA256.test(evidence.inventorySha256 ?? "")
    || !SHA256.test(evidence.schemaArtifactSha256 ?? "")
    || evidence.profileProjectionRoutineId !== "RULE-E3B1314CFFD42847"
    || !SHA256.test(evidence.profileProjectionRoutineSha256 ?? "")
    || evidence.relationshipClassification !== "business_key_name_candidate"
    || evidence.relationshipReviewStatus !== "candidate"
    || evidence.profileProjectionReadsDictionary !== false
    || evidence.profileProjectionJoinsRelationship !== false
    || evidence.directOrganizationOrPositionRelationEvidence !== false) fail("SECASSIGNMENT_RECEIPT_CONTRACT_INVALID", "structural evidence");

  if (!exactKeys(contract.gap, GAP_KEYS)
    || contract.gap.code !== "SECASSIGNMENT_ORGANIZATION_SEMANTICS_UNPROVEN"
    || JSON.stringify(contract.gap.missingEvidence) !== JSON.stringify(MISSING_EVIDENCE)
    || contract.gap.materialization !== "BLOCKED"
    || contract.gap.compatibilityCredit !== 0) fail("SECASSIGNMENT_RECEIPT_CONTRACT_INVALID", "gap");
}

export function buildLegacySecassignmentRelationshipReceipt({ contract, catalog, aggregate, sourceRestoreReceiptSha256, databaseIdentitySha256 }) {
  validateContract(contract);
  for (const [label, digest] of Object.entries({ sourceRestoreReceiptSha256, databaseIdentitySha256 })) {
    if (!SHA256.test(digest ?? "")) fail("SECASSIGNMENT_RECEIPT_SOURCE_BINDING_INVALID", label);
  }
  if (!Array.isArray(catalog)) fail("SECASSIGNMENT_RECEIPT_CATALOG_INVALID", "catalog must be an array");
  const person = catalog.find(column => column.table === "person" && column.column === "secassignment");
  const dictionary = catalog.find(column => column.table === "secassignmentcode" && column.column === "secassignment");
  if (!exactKeys(person, ["table", "column", "type", "maxLength"]) || !exactKeys(dictionary, ["table", "column", "type", "maxLength"])) fail("SECASSIGNMENT_RECEIPT_CATALOG_INVALID", "catalog columns differ");
  if (person.type !== "varchar" || person.maxLength !== 50 || dictionary.type !== "varchar" || dictionary.maxLength !== 30) fail("SECASSIGNMENT_RECEIPT_CATALOG_INVALID", "catalog types differ");
  if (!exactKeys(aggregate, contract.aggregateFields)) fail("SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID", "aggregate fields differ");
  for (const field of contract.aggregateFields) if (!Number.isSafeInteger(aggregate[field]) || aggregate[field] < 0) fail("SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID", field);
  if (aggregate.dictionaryDistinctKeys + aggregate.dictionaryBlankKeys > aggregate.dictionaryRows
    || aggregate.dictionaryDuplicateKeys > aggregate.dictionaryDistinctKeys
    || aggregate.personMatchedRows + aggregate.personUnmatchedRows !== aggregate.personNonBlankRows
    || aggregate.personOverDictionaryWidthRows > aggregate.personUnmatchedRows) fail("SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID", "count conservation differs");
  const hasDataConflict = aggregate.dictionaryBlankKeys > 0 || aggregate.dictionaryDuplicateKeys > 0 || aggregate.personUnmatchedRows > 0 || aggregate.personOverDictionaryWidthRows > 0;
  const safeFacts = structuredClone(aggregate);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_secassignment_relationship_receipt",
    sourceSystem: "yuzhou-v10",
    sourceBinding: {
      sourceRestoreReceiptSha256,
      databaseIdentitySha256,
      inventorySha256: contract.structuralEvidence.inventorySha256,
      schemaArtifactSha256: contract.structuralEvidence.schemaArtifactSha256,
      profileProjectionRoutineSha256: contract.structuralEvidence.profileProjectionRoutineSha256,
      aggregateQuerySha256: hash(SECASSIGNMENT_SAFE_AGGREGATE_SQL),
    },
    personSource: contract.personSource,
    dictionarySource: contract.dictionarySource,
    declaredForeignKey: false,
    deployedRoutineJoinEvidence: false,
    relationshipClassification: "business_key_name_candidate",
    relationshipReviewStatus: "candidate",
    profileProjectionReadsDictionary: false,
    profileProjectionJoinsRelationship: false,
    directOrganizationOrPositionRelationEvidence: false,
    decision: "KEEP_PENDING",
    reasonCode: hasDataConflict ? "AGGREGATE_RELATION_CONFLICT" : "RELATION_SEMANTICS_UNPROVEN",
    gap: structuredClone(contract.gap),
    compatibilityCredit: 0,
    materialization: "BLOCKED",
    safeFacts,
    containsPersonValues: false,
    containsPersonIdentifiers: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
}
