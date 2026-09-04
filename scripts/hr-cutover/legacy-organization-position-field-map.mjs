import { createHash } from "node:crypto";

export class LegacyOrganizationPositionFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyOrganizationPositionFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyOrganizationPositionFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export function verifyLegacyOrganizationPositionFieldMap(inventory, contract) {
  if (contract?.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_organization_position_field_map" || contract.productionImport !== "HOLD") fail("FIELD_MAP_IDENTITY_INVALID", "root");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (contract.inventorySha256 !== inventorySha256) fail("FIELD_MAP_INVENTORY_DRIFT", inventorySha256);
  const expectedTables = ["assignment", "company", "departmentcode", "job", "secassignmentcode", "station"];
  if (JSON.stringify(contract.sourceTables) !== JSON.stringify(expectedTables)) fail("FIELD_MAP_TABLE_SET_INVALID", "sourceTables");
  const inventoryTables = new Map(inventory.tables.filter(table => expectedTables.includes(table.name)).map(table => [table.name, table]));
  if (inventoryTables.size !== expectedTables.length) fail("FIELD_MAP_SOURCE_TABLE_MISSING", "six-table scope");
  const sourceLocators = expectedTables.flatMap(table => inventoryTables.get(table).columns.map(column => `${table}.${column.name}`));
  const seen = new Set();
  for (const field of contract.fields ?? []) {
    if (!exactKeys(field, ["sourceTable", "sourceColumn", "disposition", "targetLocators", "reasonCode"])) fail("FIELD_MAP_ROW_INVALID", "keys");
    const locator = `${field.sourceTable}.${field.sourceColumn}`;
    if (seen.has(locator)) fail("FIELD_MAP_DUPLICATE", locator);
    seen.add(locator);
    if (!sourceLocators.includes(locator)) fail("FIELD_MAP_UNKNOWN_SOURCE", locator);
    if (!Array.isArray(field.targetLocators) || field.targetLocators.length === 0) fail("FIELD_MAP_TARGET_INVALID", locator);
    if (!["exact_mapped", "archive_only", "pending"].includes(field.disposition)) fail("FIELD_MAP_DISPOSITION_INVALID", locator);
    if (field.disposition === "exact_mapped" && field.reasonCode !== null) fail("FIELD_MAP_REASON_INVALID", locator);
    if (field.disposition !== "exact_mapped" && !/^[A-Z][A-Z0-9_]+$/u.test(field.reasonCode ?? "")) fail("FIELD_MAP_REASON_INVALID", locator);
    if (field.disposition === "archive_only" && field.targetLocators.some(target => !target.startsWith("hr_legacy_archive_record.restricted_safe_projection.legacyFields."))) fail("FIELD_MAP_ARCHIVE_TARGET_INVALID", locator);
  }
  const missing = sourceLocators.filter(locator => !seen.has(locator));
  if (missing.length || seen.size !== sourceLocators.length) fail("FIELD_MAP_COVERAGE_INCOMPLETE", missing.join(","));
  const fields = sourceLocators.map(locator => {
    const [sourceTable, sourceColumn] = locator.split(".");
    const column = inventoryTables.get(sourceTable).columns.find(item => item.name === sourceColumn);
    const mapping = contract.fields.find(item => item.sourceTable === sourceTable && item.sourceColumn === sourceColumn);
    return { sourceTable, sourceColumn, sourceType: column.type, nullable: column.nullable, disposition: mapping.disposition, targetLocators: mapping.targetLocators, reasonCode: mapping.reasonCode };
  });
  const count = disposition => fields.filter(field => field.disposition === disposition).length;
  const rules = contract.resolutionRules ?? [];
  if (rules.length !== 4) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "cardinality");
  const parentRule = rules.find(rule => rule.ruleId === "JOB_PARENTJOB_UPTO_SEPARATION_V1");
  const managerRule = rules.find(rule => rule.ruleId === "DEPARTMENT_MANAGER_REFERENCE_PRESERVATION_V1");
  const assignmentRule = rules.find(rule => rule.ruleId === "ASSIGNMENT_PROFESSIONAL_TITLE_V1");
  const secondaryAssignmentRule = rules.find(rule => rule.ruleId === "SECASSIGNMENT_RELATION_GAP_V1");
  if (!exactKeys(parentRule, ["ruleId", "reportsToSource", "legacyMetadataSource", "legacyMetadataTarget", "uptoMayOverrideReportsTo", "missingUptoAction", "evidence"])) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "parent rule keys");
  if (parentRule.ruleId !== "JOB_PARENTJOB_UPTO_SEPARATION_V1"
    || parentRule.reportsToSource !== "job.parentjob"
    || parentRule.legacyMetadataSource !== "job.upto"
    || parentRule.legacyMetadataTarget !== "hr_position.legacy_upto_code"
    || parentRule.uptoMayOverrideReportsTo !== false
    || parentRule.missingUptoAction !== "FAIL_CLOSED_BEFORE_LOAD") fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "semantics");
  if (!exactKeys(parentRule.evidence, ["schemaArtifactSha256", "jobPathFunctionSha256", "routineLedgerSha256", "sourceT0PositionSha256", "sourceT0Rows", "sourceParentjobNonBlankRows", "sourceParentjobEqualsCodePrefixRows", "conclusion"])) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "keys");
  for (const digest of [parentRule.evidence.schemaArtifactSha256, parentRule.evidence.routineLedgerSha256, parentRule.evidence.sourceT0PositionSha256, ...(parentRule.evidence.jobPathFunctionSha256 ?? [])]) if (!/^[0-9a-f]{64}$/u.test(digest ?? "")) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "sha256");
  if (parentRule.evidence.sourceT0Rows !== 18 || parentRule.evidence.sourceParentjobNonBlankRows !== 7 || parentRule.evidence.sourceParentjobEqualsCodePrefixRows !== 0
    || parentRule.evidence.conclusion !== "PARENTJOB_AND_CODE_PREFIX_ARE_DISTINCT; UPTO_IS_PRESERVED_WITHOUT_INFERRED_PRECEDENCE") fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "observations");
  if (!exactKeys(managerRule, ["ruleId", "source", "target", "identityTarget", "mayPopulateIdentityTarget", "visibility", "evidence"])) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "manager rule keys");
  if (managerRule.source !== "departmentcode.master"
    || managerRule.target !== "sys_org.legacy_manager_reference"
    || managerRule.identityTarget !== "sys_org.leader_user_id"
    || managerRule.mayPopulateIdentityTarget !== false
    || managerRule.visibility !== "protected_compatibility_metadata") fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "manager semantics");
  if (!exactKeys(managerRule.evidence, ["schemaArtifactSha256", "sourceT0DepartmentSha256", "sourceT0Rows", "sourceType", "conclusion"])) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "manager evidence keys");
  for (const digest of [managerRule.evidence.schemaArtifactSha256, managerRule.evidence.sourceT0DepartmentSha256]) if (!/^[0-9a-f]{64}$/u.test(digest ?? "")) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "manager sha256");
  if (managerRule.evidence.schemaArtifactSha256 !== parentRule.evidence.schemaArtifactSha256
    || managerRule.evidence.sourceT0Rows !== 138
    || managerRule.evidence.sourceType !== "varchar(10)"
    || managerRule.evidence.conclusion !== "LEGACY_REFERENCE_PRESERVED_WITHOUT_USER_IDENTITY_BINDING") fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "manager observations");
  if (!exactKeys(assignmentRule, ["ruleId", "sourceCode", "sourceLabel", "personRelation", "codeTarget", "labelTarget", "doesNotDefinePosition", "evidence"])) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "assignment rule keys");
  if (assignmentRule.sourceCode !== "assignment.assignment"
    || assignmentRule.sourceLabel !== "assignment.assignmentname"
    || assignmentRule.personRelation !== "person.assignment"
    || assignmentRule.codeTarget !== "hr_employee_profile.legacy_professional_title_code"
    || assignmentRule.labelTarget !== "hr_employee_profile.technical_title"
    || assignmentRule.doesNotDefinePosition !== true) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "assignment semantics");
  if (!exactKeys(assignmentRule.evidence, ["schemaArtifactSha256", "labelFunctionSha256", "profileProjectionRoutineSha256", "aggregateRoutineSha256", "declaredForeignKey", "legacyBusinessLabel", "conclusion"])) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "assignment evidence keys");
  for (const digest of [assignmentRule.evidence.schemaArtifactSha256, assignmentRule.evidence.labelFunctionSha256, assignmentRule.evidence.profileProjectionRoutineSha256, assignmentRule.evidence.aggregateRoutineSha256]) if (!/^[0-9a-f]{64}$/u.test(digest ?? "")) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "assignment sha256");
  if (assignmentRule.evidence.schemaArtifactSha256 !== parentRule.evidence.schemaArtifactSha256
    || assignmentRule.evidence.declaredForeignKey !== "FK_person_assignment"
    || assignmentRule.evidence.legacyBusinessLabel !== "professional_title"
    || assignmentRule.evidence.conclusion !== "ASSIGNMENT_IS_EMPLOYEE_PROFESSIONAL_TITLE_NOT_POSITION") fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "assignment observations");
  if (!exactKeys(secondaryAssignmentRule, ["ruleId", "personSource", "dictionarySource", "personSourceType", "dictionarySourceType", "declaredForeignKey", "deployedRoutineJoinEvidence", "aggregateReceiptContract", "aggregateReceiptStatus", "action", "evidence"])) fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "secondary assignment rule keys");
  if (secondaryAssignmentRule.personSource !== "person.secassignment"
    || secondaryAssignmentRule.dictionarySource !== "secassignmentcode.secassignment"
    || secondaryAssignmentRule.personSourceType !== "varchar(50)"
    || secondaryAssignmentRule.dictionarySourceType !== "varchar(30)"
    || secondaryAssignmentRule.declaredForeignKey !== false
    || secondaryAssignmentRule.deployedRoutineJoinEvidence !== false
    || secondaryAssignmentRule.aggregateReceiptContract !== "legacy-secassignment-relationship-receipt-v1"
    || !["NOT_CAPTURED", "CAPTURED_KEEP_PENDING"].includes(secondaryAssignmentRule.aggregateReceiptStatus)
    || secondaryAssignmentRule.action !== "KEEP_PENDING") fail("FIELD_MAP_RESOLUTION_RULE_INVALID", "secondary assignment semantics");
  if (!exactKeys(secondaryAssignmentRule.evidence, ["schemaArtifactSha256", "profileProjectionRoutineSha256", "conclusion"])) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "secondary assignment evidence keys");
  for (const digest of [secondaryAssignmentRule.evidence.schemaArtifactSha256, secondaryAssignmentRule.evidence.profileProjectionRoutineSha256]) if (!/^[0-9a-f]{64}$/u.test(digest ?? "")) fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "secondary assignment sha256");
  if (secondaryAssignmentRule.evidence.schemaArtifactSha256 !== parentRule.evidence.schemaArtifactSha256
    || secondaryAssignmentRule.evidence.profileProjectionRoutineSha256 !== assignmentRule.evidence.profileProjectionRoutineSha256
    || secondaryAssignmentRule.evidence.conclusion !== "IDENTITY_LABEL_PRESENT_BUT_DICTIONARY_RELATION_UNPROVEN") fail("FIELD_MAP_RESOLUTION_EVIDENCE_INVALID", "secondary assignment observations");
  return {
    inventorySha256,
    contractSha256: sha256(`${JSON.stringify(contract)}\n`),
    summary: { sourceTables: expectedTables.length, sourceFields: fields.length, exactMappedFields: count("exact_mapped"), archiveOnlyFields: count("archive_only"), pendingFields: count("pending") },
    fields,
    relations: contract.relations,
    resolutionRules: contract.resolutionRules,
    status: count("pending") === 0 ? "MAPPED_OR_ARCHIVED" : "IN_PROGRESS",
    productionImport: "HOLD"
  };
}
