/* global process, URL */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";
import { verifyLegacyCoreDomainMapping } from "./legacy-core-domain-mapping-lib.mjs";
import { verifyLegacyOrganizationPositionFieldMap } from "./legacy-organization-position-field-map.mjs";

export class LegacyModernFieldLedgerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyModernFieldLedgerError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyModernFieldLedgerError(code, detail); };
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const ORGANIZATION_POSITION_MAP = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json"), "utf8"));

function matchRule(rule, table, column) {
  if (rule.sourceTable && rule.sourceTable !== table.name) return false;
  if (rule.sourceTablePattern && !new RegExp(rule.sourceTablePattern, "u").test(table.name)) return false;
  if (rule.sourceColumnPattern && !new RegExp(rule.sourceColumnPattern, "u").test(column.name)) return false;
  if (rule.sourceTypePattern && !new RegExp(rule.sourceTypePattern, "iu").test(column.type)) return false;
  return true;
}

function exactNormalizedTarget(row) {
  if (row.domain === "employee_profile") return `hr_employee.${row.target}`;
  if (row.domain === "employment_change") return `hr_employment_event.${row.target}`;
  if (row.sourceTable === "compact_c") return `hr_contract_change.${row.target}`;
  if (row.sourceTable === "compacttypecode") return `hr_contract_type.${row.target}`;
  if (row.domain === "contract") return `hr_contract.${row.target}`;
  fail("NORMALIZED_TARGET_UNRESOLVED", `${row.sourceTable}.${row.sourceColumn}`);
}

function validateTableMap(inventory, tableMap) {
  if (tableMap?.formatVersion !== 1 || tableMap.contractKind !== "yuzhou_hr_legacy_modern_table_domain_map" || tableMap.productionImport !== "HOLD") fail("TABLE_MAP_IDENTITY_INVALID", "root");
  const sourceTables = tableMap.groups?.flatMap(group => group.sourceTables ?? []) ?? [];
  const inventoryTables = inventory.tables.map(table => table.name).sort();
  if (sourceTables.length !== new Set(sourceTables).size) fail("TABLE_MAP_DUPLICATE", "source table appears more than once");
  if (JSON.stringify([...sourceTables].sort()) !== JSON.stringify(inventoryTables)) fail("TABLE_MAP_COVERAGE_INCOMPLETE", "all 162 source tables must be classified exactly once");
  const allowedStatuses = new Set(["partial_target_requires_field_review", "target_schema_required", "decommission_after_archive"]);
  const groups = new Map();
  for (const group of tableMap.groups) {
    if (!group.domain || !Array.isArray(group.targetTables) || !group.targetTables.length || !group.strategy || !allowedStatuses.has(group.functionalStatus)) fail("TABLE_MAP_GROUP_INVALID", String(group.domain));
    for (const table of group.sourceTables) groups.set(table, group);
  }
  const extracted = new Set(tableMap.currentExtractionTables ?? []);
  if ([...extracted].some(table => !groups.has(table))) fail("EXTRACTION_TABLE_UNKNOWN", "currentExtractionTables");
  const inventoryLocators = new Set(inventory.tables.flatMap(table => table.columns.map(column => `${table.name}.${column.name}`)));
  const extractionOmissions = new Set(tableMap.currentExtractionOmissions ?? []);
  if ([...extractionOmissions].some(locator => !inventoryLocators.has(locator))) fail("EXTRACTION_OMISSION_UNKNOWN", "currentExtractionOmissions");
  const archiveSurface = new Set(tableMap.currentArchiveSurfaceTables ?? []);
  if ([...archiveSurface].some(table => !extracted.has(table))) fail("ARCHIVE_SURFACE_TABLE_NOT_EXTRACTED", "currentArchiveSurfaceTables");
  for (const rule of tableMap.implementedNormalizationRules ?? []) {
    if (!rule.id || (!rule.sourceTable && !rule.sourceTablePattern) || !rule.sourceColumnPattern || !Array.isArray(rule.targetLocators) || !rule.targetLocators.length || typeof rule.evidence !== "string" || !rule.evidence) fail("NORMALIZATION_RULE_INVALID", String(rule.id));
  }
  return { groups, extracted, extractionOmissions, archiveSurface };
}

function validateRelationalModel(inventoryReport, relations) {
  if (relations?.formatVersion !== 1 || relations.modelKind !== "yuzhou_hr_legacy_relational_model" || relations.productionImport !== "HOLD") fail("RELATIONAL_MODEL_IDENTITY_INVALID", "root");
  if (relations.sourceBinding?.inventorySha256 !== inventoryReport.inventoryHash || relations.summary?.tables !== 162 || relations.summary?.columns !== 2364) fail("RELATIONAL_MODEL_BINDING_INVALID", "inventory");
}

export function resolveLegacyFieldLedgerStatus(summary,{unresolvedRelations,completionApproval}) {
  const approvalValid=completionApproval?.status==="approved"
    && typeof completionApproval.evidenceSha256==="string"
    && /^[0-9a-f]{64}$/u.test(completionApproval.evidenceSha256)
    && completionApproval.clientSurfaceComplete===true
    && completionApproval.groupWebSurfaceComplete===true;
  const hasPending=summary.notExtractedPendingMappingFields
    || summary.archiveVisiblePendingNormalizationFields
    || summary.extractedPendingTargetMappingFields
    || summary.reviewedPendingFields
    || summary.targetSchemaRequiredTables
    || unresolvedRelations;
  return {status:hasPending||!approvalValid?"IN_PROGRESS":"COMPLETE",completionApprovalValid:approvalValid};
}

export function buildLegacyModernFieldLedger({ inventory, relations, tableMap, coreMapping, organizationPositionMapping = ORGANIZATION_POSITION_MAP, root = ROOT }) {
  const inventoryReport = validateLegacyAtomicInventory(inventory);
  validateRelationalModel(inventoryReport, relations);
  const { groups, extracted, extractionOmissions, archiveSurface } = validateTableMap(inventory, tableMap);
  const core = verifyLegacyCoreDomainMapping(inventory, coreMapping, { root });
  const coreFields = new Map(core.fieldLedger.map(row => [`${row.sourceTable}.${row.sourceColumn}`, row]));
  const organizationPosition = verifyLegacyOrganizationPositionFieldMap(inventory, organizationPositionMapping);
  const organizationPositionFields = new Map(organizationPosition.fields.map(row => [`${row.sourceTable}.${row.sourceColumn}`, row]));
  const relationIndex = new Map();
  for (const relation of [...relations.foreignKeys, ...relations.inferredRelations]) {
    for (const column of relation.sourceColumns) {
      const key = `${relation.sourceTable}.${column}`;
      const items = relationIndex.get(key) ?? [];
      items.push({ relationId: relation.id, targetTable: relation.targetTable, targetColumns: relation.targetColumns, evidence: relation.evidence, reviewStatus: relation.reviewStatus ?? "candidate_review_pending" });
      relationIndex.set(key, items);
    }
  }

  const fields = [];
  for (const table of inventory.tables) {
    const group = groups.get(table.name);
    for (const column of table.columns) {
      const locator = `${table.name}.${column.name}`;
      const coreField = coreFields.get(locator);
      const organizationPositionField = organizationPositionFields.get(locator);
      const normalizationRules = (tableMap.implementedNormalizationRules ?? []).filter(rule => matchRule(rule, table, column));
      const credential = /^(?:password|passwd|pwd)$/iu.test(column.name);
      const binary = /^(?:image|binary|varbinary)/iu.test(column.type);
      const extractedField = extracted.has(table.name) && !extractionOmissions.has(locator);
      const decompositionRules = tableMap.decompositionRules.filter(rule => matchRule(rule, table, column)).map(rule => ({ id: rule.id, method: rule.method, targetLocators: rule.targetLocators }));
      let disposition;
      let implementedTargets;
      let plannedTargets;
      if (credential) {
        disposition = "security_excluded";
        implementedTargets = [];
        plannedTargets = [];
      } else if (binary) {
        disposition = table.name === "dtproperties" ? "technical_binary_decommissioned" : "binary_object";
        implementedTargets = disposition === "binary_object" ? ["hr_legacy_file_blob_object", "hr_legacy_file_logical_record", "sys_file"] : [];
        plannedTargets = [];
      } else if (organizationPositionField?.disposition === "exact_mapped") {
        if (!extractedField) fail("ORGANIZATION_POSITION_FIELD_NOT_EXTRACTED", locator);
        disposition = "normalized_verified";
        implementedTargets = organizationPositionField.targetLocators;
        plannedTargets = [];
      } else if (organizationPositionField?.disposition === "archive_only") {
        disposition = "reviewed_archive_only";
        implementedTargets = [];
        plannedTargets = organizationPositionField.targetLocators;
      } else if (organizationPositionField?.disposition === "pending") {
        disposition = "reviewed_pending";
        implementedTargets = [];
        plannedTargets = organizationPositionField.targetLocators;
      } else if (coreField?.compatibilityDisposition === "mapped") {
        disposition = "normalized_and_archived";
        implementedTargets = [exactNormalizedTarget(coreField)];
        plannedTargets = [`hr_legacy_archive_record.restricted_safe_projection.legacyFields.${column.name}`];
      } else if (normalizationRules.length) {
        if (!extractedField) fail("NORMALIZATION_RULE_FIELD_NOT_EXTRACTED", locator);
        disposition = "normalized";
        implementedTargets = [...new Set(normalizationRules.flatMap(rule => rule.targetLocators))];
        plannedTargets = archiveSurface.has(table.name) ? [`hr_legacy_archive_record.restricted_safe_projection.legacyFields.${column.name}`] : [];
      } else if (group.functionalStatus === "decommission_after_archive") {
        disposition = "technical_archive_only";
        implementedTargets = [];
        plannedTargets = [`hr_legacy_archive_record.restricted_safe_projection.legacyFields.${column.name}`];
      } else if (!extractedField) {
        disposition = "not_extracted_pending_mapping";
        implementedTargets = [];
        plannedTargets = [`hr_legacy_archive_record.restricted_safe_projection.legacyFields.${column.name}`];
      } else if (archiveSurface.has(table.name)) {
        disposition = "archive_visible_pending_normalization";
        implementedTargets = [`hr_legacy_archive_record.restricted_safe_projection.legacyFields.${column.name}`];
        plannedTargets = group.targetTables;
      } else {
        disposition = "extracted_pending_target_mapping";
        implementedTargets = [];
        plannedTargets = group.targetTables;
      }
      fields.push({
        sourceTable: table.name,
        sourceColumn: column.name,
        sourceType: column.type,
        nullable: column.nullable,
        description: column.description,
        domain: group.domain,
        tableStrategy: group.strategy,
        domainTargetTables: group.targetTables,
        sourceExtractionStatus: binary && ["person", "docs"].includes(table.name) ? "evidence_only" : extractedField ? "implemented" : "missing",
        disposition,
        implementedTargets,
        plannedTargets,
        decompositionRules,
        normalizationRules: normalizationRules.map(rule => ({ id: rule.id, evidence: rule.evidence })),
        normalizationEvidenceStatus: organizationPositionField?.disposition === "exact_mapped" ? "verified_organization_position_mapping" : coreField?.compatibilityDisposition === "mapped" ? "verified_core_mapping" : normalizationRules.length ? "declared_target_pending_executable_evidence" : "not_applicable",
        sourceRelations: relationIndex.get(locator) ?? [],
        functionalStatus: organizationPositionField?.disposition === "archive_only" ? "approved_archive_only" : organizationPositionField?.disposition === "pending" ? "pending" : coreField?.compatibilityDisposition === "mapped" || normalizationRules.length ? "normalized" : group.functionalStatus,
      });
    }
  }

  const count = disposition => fields.filter(field => field.disposition === disposition).length;
  const normalized = count("normalized_and_archived") + count("normalized") + count("normalized_verified");
  const verifiedNormalized=count("normalized_and_archived") + count("normalized_verified");
  const extractedFields = fields.filter(field => field.sourceExtractionStatus === "implemented").length;
  const targetSchemaRequiredTables = tableMap.groups.filter(group => group.functionalStatus === "target_schema_required").reduce((sum, group) => sum + group.sourceTables.length, 0);
  const unresolvedRelations=[...(relations.inferredRelations??[])].filter(relation=>!["confirmed","rejected"].includes(relation.reviewStatus)).length;
  const summary = {
    sourceTables: inventoryReport.summary.tables,
    sourceFields: inventoryReport.summary.columns,
    classifiedTables: groups.size,
    classifiedFields: fields.length,
    currentExtractionTables: extracted.size,
    currentExtractionFields: extractedFields,
    declaredNormalizedFields: normalized,
    verifiedNormalizedFields: verifiedNormalized,
    reviewedArchiveOnlyFields: count("reviewed_archive_only"),
    reviewedPendingFields: count("reviewed_pending"),
    archiveVisiblePendingNormalizationFields: count("archive_visible_pending_normalization"),
    extractedPendingTargetMappingFields: count("extracted_pending_target_mapping"),
    notExtractedPendingMappingFields: count("not_extracted_pending_mapping"),
    binaryObjectFields: count("binary_object"),
    technicalBinaryDecommissionedFields: count("technical_binary_decommissioned"),
    securityExcludedFields: count("security_excluded"),
    targetSchemaRequiredTables,
    unresolvedRelations,
    atomicDispositionCoveragePercent: Number(((fields.length / inventoryReport.summary.columns) * 100).toFixed(2)),
    declaredNormalizedFieldPercent: Number(((normalized / inventoryReport.summary.columns) * 100).toFixed(2)),
    verifiedNormalizedFunctionalFieldPercent: Number(((verifiedNormalized / inventoryReport.summary.columns) * 100).toFixed(2)),
  };
  if (fields.length !== 2364 || groups.size !== 162 || summary.atomicDispositionCoveragePercent !== 100) fail("FIELD_LEDGER_COVERAGE_INCOMPLETE", JSON.stringify(summary));
  const completion=resolveLegacyFieldLedgerStatus(summary,{unresolvedRelations,completionApproval:tableMap.completionApproval});
  return {
    formatVersion: 1,
    ledgerKind: "yuzhou_hr_legacy_modern_atomic_field_ledger",
    sourceBinding: {
      inventorySha256: inventoryReport.inventoryHash,
      relationalModelSha256: sha256(`${JSON.stringify(relations)}\n`),
      tableMapSha256: sha256(`${JSON.stringify(tableMap)}\n`),
      coreMappingSha256: sha256(`${JSON.stringify(coreMapping)}\n`),
      organizationPositionMappingSha256: organizationPosition.contractSha256,
    },
    summary,
    fields,
    status: completion.status,
    completionApprovalValid: completion.completionApprovalValid,
    completionRule: "COMPLETE requires every client and Group Web business field normalized or explicitly approved archive-only, every required target schema present, every inferred relation confirmed or rejected, and a hashed API/UI/UAT approval.",
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const args = { inventory: null, relations: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--relations" && argv[index + 1]) args.relations = argv[++index];
    else if (argv[index] === "--json") args.json = true;
    else fail("CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.relations ?? "")) fail("CLI_ARGUMENT_INVALID", "--inventory and --relations must be absolute");
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const read = path => JSON.parse(readFileSync(path, "utf8"));
    const report = buildLegacyModernFieldLedger({
      inventory: read(args.inventory),
      relations: read(args.relations),
      tableMap: read(resolve(ROOT, "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json")),
      coreMapping: read(resolve(ROOT, "scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json")),
    });
    process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof LegacyModernFieldLedgerError ? error.code : "LEGACY_MODERN_FIELD_LEDGER_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
