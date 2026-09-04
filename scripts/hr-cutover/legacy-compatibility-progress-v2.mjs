#!/usr/bin/env node
/* global process, URL */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyLegacyKnowhowFieldMapProfile } from "./legacy-knowhow-field-map.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CLIENT_BASELINE = Object.freeze({ tables: 162, fields: 2364, routines: 212, menuEntries: 68, permissions: 915 });
const PRODUCTION_GATES = Object.freeze([
  "source_restore_receipt",
  "target_identity",
  "candidate_runtime_sha",
  "preimport_backup",
  "business_signoff",
  "source_target_mapping_bundle",
  "one_time_production_authorization",
  "production_execution_reconciliation",
]);

const DEFAULTS = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  tableMap: "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json",
  coreMapping: "scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json",
  organizationPosition: "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json",
  payroll: "scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json",
  employeeProfile: "scripts/hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json",
  knowhowFieldMap: "scripts/hr-cutover/contracts/legacy-knowhow-field-map-v1.json",
  rewardDiscipline: "scripts/hr-cutover/contracts/legacy-reward-discipline-field-map-v1.json",
  trainingHistory: "scripts/hr-cutover/contracts/legacy-training-history-field-map-v1.json",
  insurancePolicy: "scripts/hr-cutover/contracts/legacy-insurance-policy-field-map-v1.json",
  customFieldPage: "scripts/hr-cutover/contracts/legacy-employee-custom-field-page-family-v1.json",
  groupWeb: "scripts/hr-cutover/contracts/legacy-group-web-completeness-ledger-v1.json",
  clientAtomic: "scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json",
  clientMenuInventory: "scripts/hr-cutover/contracts/legacy-client-menu-atomic-inventory-v1.json",
  permissionMapping: "scripts/hr-cutover/contracts/legacy-client-permission-capability-mapping-v1.json",
  groupWebTasks: [
    "scripts/hr-cutover/contracts/group-web-training-query-modern-runtime-task-v1.json",
    "scripts/hr-cutover/contracts/group-web-employee-information-modern-runtime-task-v1.json",
    "scripts/hr-cutover/contracts/group-web-employee-onboarding-modern-runtime-task-v1.json",
    "scripts/hr-cutover/contracts/group-web-employee-contract-modern-runtime-task-v1.json",
    "scripts/hr-cutover/contracts/group-web-job-change-modern-runtime-task-v1.json",
    "scripts/hr-cutover/contracts/group-web-departure-chain-modern-runtime-task-v1.json",
  ],
  routineFamilies: [
    "scripts/hr-cutover/contracts/legacy-bs-readfromleave-parity-v1.json",
    "scripts/hr-cutover/contracts/legacy-u-errandrecords-parity-v1.json",
    "scripts/hr-cutover/contracts/legacy-u-inputbasepay-parity-v1.json",
    "scripts/hr-cutover/contracts/legacy-u-inputjobpay-parity-v1.json",
    "scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-parity-v1.json",
    "scripts/hr-cutover/contracts/legacy-professional-title-lookup-parity-v1.json",
  ],
});

export class LegacyCompatibilityProgressError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyCompatibilityProgressError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyCompatibilityProgressError(code, detail); };
const pct = (numerator, denominator) => denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
const metric = (numerator, denominator, extra = {}) => ({ numerator, denominator, percent: pct(numerator, denominator), ...extra });
const locator = (table, column) => `${String(table).toLowerCase()}.${String(column).toLowerCase()}`;

function requireIdentity(condition, label) {
  if (!condition) fail("PROGRESS_INPUT_INVALID", label);
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) fail("PROGRESS_INPUT_DUPLICATE", label);
}

function verifiedRoutineFamily(row) {
  if (row?.parityStatus !== "verified" || row.review?.status !== "approved") return false;
  const semanticSections = ["parameterMappings", "outputFieldMappings", "readMappings", "writeMappings", "transaction", "nullSemantics", "roundingSemantics", "stateSideEffects"];
  if (semanticSections.some(section => row.semantics?.[section]?.status !== "verified")) return false;
  if (!Array.isArray(row.modernTargets?.serviceSymbols) || row.modernTargets.serviceSymbols.length === 0) return false;
  for (const kind of ["positive", "negative", "permission", "conservation"]) {
    if (!Array.isArray(row.testEvidence?.[kind]) || row.testEvidence[kind].length === 0) return false;
  }
  return true;
}

function readMappingLocators(coreMapping, organizationPosition, payroll, employeeProfile, knowhowProfile, rewardDiscipline, trainingHistory, insurancePolicy) {
  const slices = [];
  const coreLocators = coreMapping.domains.flatMap(domain => Object.keys(domain.columnMappings));
  slices.push({ domain: "reviewed_core", numerator: coreLocators.length, denominator: coreMapping.inventoryContract.selectedFields, locators: coreLocators });

  const organizationLocators = organizationPosition.fields
    .filter(field => field.disposition === "exact_mapped")
    .map(field => locator(field.sourceTable, field.sourceColumn));
  slices.push({ domain: "organization_position", numerator: organizationLocators.length, denominator: organizationPosition.fields.length, locators: organizationLocators });

  const payrollLocators = payroll.fieldMappings
    .filter(field => field.status === "verified")
    .map(field => locator(field.sourceObject, field.sourceField));
  slices.push({ domain: "payroll", numerator: payrollLocators.length, denominator: payroll.fieldMappings.length, locators: payrollLocators });

  const custom = employeeProfile.personCustomFieldMapping;
  const customLocators = [
    ...custom.fields.map(field => locator("person", field.sourceColumn)),
    ...custom.sourceDefinitionColumns.map(column => locator("defs", column)),
  ];
  slices.push({ domain: "custom_configuration", numerator: customLocators.length, denominator: customLocators.length, locators: customLocators });

  slices.push({
    domain: "employee_skill",
    numerator: knowhowProfile.verifiedSourceLocators.length,
    denominator: knowhowProfile.sourceFieldDenominator,
    locators: knowhowProfile.verifiedSourceLocators,
  });

  const rewardLocators = rewardDiscipline.fields
    .filter(field => field.disposition === "verified_target")
    .map(field => String(field.sourceField).toLowerCase());
  slices.push({ domain: "reward_discipline", numerator: rewardLocators.length, denominator: rewardDiscipline.fields.length, locators: rewardLocators });

  const trainingLocators = trainingHistory.fields
    .filter(field => field.disposition === "verified_target")
    .map(field => String(field.sourceField).toLowerCase());
  slices.push({ domain: "training_history", numerator: trainingLocators.length, denominator: trainingHistory.fields.length, locators: trainingLocators });

  const insurancePolicyLocators = insurancePolicy.fields
    .filter(field => field.disposition === "verified_target")
    .map(field => String(field.sourceField).toLowerCase());
  slices.push({ domain: "insurance_policy", numerator: insurancePolicyLocators.length, denominator: insurancePolicy.fields.length, locators: insurancePolicyLocators });

  for (const slice of slices) requireUnique(slice.locators, `${slice.domain} field locators`);
  const allLocators = slices.flatMap(slice => slice.locators);
  const uniqueLocators = [...new Set(allLocators)];
  return {
    slices: slices.map(slice => ({ ...metric(slice.numerator, slice.denominator), domain: slice.domain })),
    uniqueLocators,
    overlapCount: allLocators.length - uniqueLocators.length,
  };
}

function validateInputs(input) {
  const { routineLedger, tableMap, coreMapping, organizationPosition, payroll, employeeProfile, knowhowFieldMap, rewardDiscipline, trainingHistory, insurancePolicy, customFieldPage, groupWeb, groupWebTasks, clientAtomic, clientMenuInventory, permissionMapping, routineFamilies } = input;
  requireIdentity(routineLedger?.formatVersion === 1 && routineLedger.ledgerKind === "yuzhou_hr_legacy_modern_routine_logic_ledger" && routineLedger.productionImport === "HOLD", "routine ledger identity");
  requireIdentity(Array.isArray(routineLedger.routines) && routineLedger.routines.length === CLIENT_BASELINE.routines, "routine denominator");
  requireUnique(routineLedger.routines.map(row => row.routineId), "routine ids");
  requireIdentity(routineLedger.summary?.sourceRoutines === CLIENT_BASELINE.routines && routineLedger.summary?.mappedRoutines === CLIENT_BASELINE.routines, "routine summary");
  requireIdentity(Object.values(routineLedger.summary.byDomain ?? {}).reduce((sum, count) => sum + count, 0) === CLIENT_BASELINE.routines, "routine domain summary");

  requireIdentity(tableMap?.formatVersion === 1 && tableMap.contractKind === "yuzhou_hr_legacy_modern_table_domain_map" && tableMap.productionImport === "HOLD", "table map identity");
  const sourceTables = tableMap.groups.flatMap(group => group.sourceTables);
  requireIdentity(sourceTables.length === CLIENT_BASELINE.tables, "table denominator");
  requireUnique(sourceTables, "table names");

  requireIdentity(coreMapping?.mappingKind === "yuzhou_hr_legacy_core_domain_reviewed_mapping" && coreMapping.inventoryContract?.selectedFields === 260, "core mapping identity");
  requireIdentity(organizationPosition?.contractKind === "yuzhou_hr_legacy_organization_position_field_map" && organizationPosition.productionImport === "HOLD", "organization mapping identity");
  requireIdentity(Array.isArray(organizationPosition.fields) && organizationPosition.fields.length === 50, "organization field denominator");
  requireIdentity(payroll?.contractKind === "yuzhou_hr_legacy_payroll_rule_family_parity" && payroll.productionImport === "HOLD", "payroll mapping identity");
  requireIdentity(Array.isArray(payroll.fieldMappings) && payroll.fieldMappings.length === 32, "payroll field denominator");
  requireIdentity(employeeProfile?.mappingKind === "yuzhou_hr_employee_profile_materialization_reviewed" && employeeProfile.productionImport === "HOLD", "employee profile mapping identity");
  requireIdentity(employeeProfile.personCustomFieldMapping?.fields?.length === 19 && employeeProfile.personCustomFieldMapping?.sourceDefinitionColumns?.length === 17, "custom field denominator");
  requireIdentity(knowhowFieldMap?.contractKind === "yuzhou_hr_legacy_knowhow_field_map" && knowhowFieldMap.productionImport === "HOLD", "knowhow field mapping identity");
  requireIdentity(rewardDiscipline?.contractKind === "yuzhou_hr_legacy_reward_discipline_field_map" && rewardDiscipline.productionImport === "HOLD", "reward discipline field mapping identity");
  requireIdentity(Array.isArray(rewardDiscipline.fields) && rewardDiscipline.fields.length === 16, "reward discipline field denominator");
  requireIdentity(trainingHistory?.contractKind === "yuzhou_hr_legacy_training_history_field_map" && trainingHistory.productionImport === "HOLD", "training history field mapping identity");
  requireIdentity(Array.isArray(trainingHistory.fields) && trainingHistory.fields.length === 23, "training history field denominator");
  requireIdentity(insurancePolicy?.contractKind === "yuzhou_hr_legacy_insurance_policy_field_map" && insurancePolicy.productionImport === "HOLD", "insurance policy field mapping identity");
  requireIdentity(Array.isArray(insurancePolicy.fields) && insurancePolicy.fields.length === 51, "insurance policy field denominator");
  requireIdentity(customFieldPage?.contractKind === "yuzhou_hr_legacy_employee_custom_field_page_family" && customFieldPage.productionImport === "HOLD", "custom field page identity");
  requireIdentity(customFieldPage.legacyFieldFamily?.reviewedMappingCount === 19 && customFieldPage.legacyFieldFamily?.logicCellDenominator === 190, "custom field review binding");
  requireIdentity(groupWeb?.contractKind === "yuzhou_hr_legacy_group_web_completeness_ledger" && groupWeb.productionImport === "HOLD", "Group Web identity");
  requireIdentity(Array.isArray(groupWebTasks), "Group Web runtime tasks");
  requireUnique(groupWebTasks.map(task => task.contractKind), "Group Web runtime task identities");
  for (const task of groupWebTasks) {
    requireIdentity(
      /^yuzhou_hr_group_web_[a-z0-9_]+_modern_runtime_task$/u.test(task?.contractKind ?? "")
        && task.status === "ready_not_executed"
        && task.productionImport === "HOLD"
        && task.compatibilityScoreContribution === 0
        && task.runtimeEvidence?.status === "not_observed",
      "Group Web runtime task identity",
    );
  }
  requireIdentity(clientAtomic?.contractKind === "yuzhou_hr_legacy_client_atomic_inventory" && clientAtomic.productionImport === "HOLD", "client inventory identity");
  requireIdentity(clientAtomic.expectedCounts?.fields === CLIENT_BASELINE.fields && clientAtomic.expectedCounts?.rules === CLIENT_BASELINE.routines && clientAtomic.expectedCounts?.authorizationGrantEdges === CLIENT_BASELINE.permissions, "client inventory baseline");
  requireIdentity(
    clientMenuInventory?.contractKind === "yuzhou_hr_legacy_client_menu_atomic_inventory"
      && clientMenuInventory.productionImport === "HOLD"
      && clientMenuInventory.expectedCounts?.entries === CLIENT_BASELINE.menuEntries
      && clientMenuInventory.familyTargets?.length === clientMenuInventory.expectedCounts?.families
      && clientMenuInventory.candidatePolicy?.staticCandidateCompatibilityCredit === 0,
    "client menu inventory identity",
  );
  requireUnique(clientMenuInventory.familyTargets.map(row => row.familyId), "client menu family ids");
  requireIdentity(permissionMapping?.contractKind === "yuzhou_hr_legacy_client_permission_capability_mapping" && permissionMapping.surface === "client" && permissionMapping.productionImport === "HOLD", "permission mapping identity");
  requireIdentity(permissionMapping.authorizationGrantEdges?.expectedRows === CLIENT_BASELINE.permissions && permissionMapping.authorizationGrantEdges.compatibilityCredit === 0 && Number.isInteger(permissionMapping.authorizationGrantEdges.observedRows) && permissionMapping.authorizationGrantEdges.observedRows >= 0 && permissionMapping.authorizationGrantEdges.observedRows <= CLIENT_BASELINE.permissions, "permission grant-edge conservation");
  const permissionDenominator = permissionMapping.compatibilityCredit?.denominator;
  requireIdentity((permissionDenominator === null && permissionMapping.fixedDenominator === null && permissionMapping.compatibilityCredit.numerator === 0)
    || (Number.isInteger(permissionDenominator) && permissionDenominator > 0 && permissionMapping.fixedDenominator === permissionDenominator && Number.isInteger(permissionMapping.compatibilityCredit.numerator) && permissionMapping.compatibilityCredit.numerator >= 0 && permissionMapping.compatibilityCredit.numerator <= permissionDenominator), "permission capability credit");
  requireIdentity(Array.isArray(routineFamilies), "routine families");
}

export function buildLegacyCompatibilityProgress(input) {
  validateInputs(input);
  const { routineLedger, coreMapping, organizationPosition, payroll, employeeProfile, knowhowFieldMap, rewardDiscipline, trainingHistory, insurancePolicy, customFieldPage, groupWeb, groupWebTasks, clientAtomic, clientMenuInventory, permissionMapping, routineFamilies, productionEvidence = [] } = input;
  const routineById = new Map(routineLedger.routines.map(row => [row.routineId, row]));
  const familyRows = routineFamilies.flatMap(contract => {
    requireIdentity(contract?.contractKind === "yuzhou_hr_legacy_routine_semantic_parity" && contract.productionImport === "HOLD", "routine family identity");
    return contract.routines;
  });
  requireUnique(familyRows.map(row => row.routineId), "routine family ids");
  for (const row of familyRows) {
    const inventoryRow = routineById.get(row.routineId);
    requireIdentity(inventoryRow && inventoryRow.canonicalFamily.toLowerCase() === row.canonicalFamily.toLowerCase(), `routine family binding ${row.routineId}`);
  }
  const verifiedRoutineRows = familyRows.filter(verifiedRoutineFamily);
  const verifiedRoutineIds = new Set(verifiedRoutineRows.map(row => row.routineId));

  let knowhowProfile;
  try {
    knowhowProfile = verifyLegacyKnowhowFieldMapProfile({ contract: knowhowFieldMap, repositoryRoot: ROOT });
  } catch (error) {
    fail("PROGRESS_INPUT_INVALID", `knowhow field mapping: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fields = readMappingLocators(coreMapping, organizationPosition, payroll, employeeProfile, knowhowProfile, rewardDiscipline, trainingHistory, insurancePolicy);
  requireIdentity(fields.uniqueLocators.length <= CLIENT_BASELINE.fields, "mapped fields exceed baseline");

  const routineDomains = {};
  for (const row of routineLedger.routines) {
    const current = routineDomains[row.primaryDomain] ?? { inventory: 0, behaviorSemantics: 0, implementation: 0, parity: 0 };
    current.inventory += 1;
    if (verifiedRoutineIds.has(row.routineId)) {
      current.behaviorSemantics += 1;
      current.implementation += 1;
      current.parity += 1;
    }
    routineDomains[row.primaryDomain] = current;
  }
  for (const [domain, counts] of Object.entries(routineDomains)) {
    routineDomains[domain] = {
      inventory: metric(counts.inventory, counts.inventory),
      behaviorSemantics: metric(counts.behaviorSemantics, counts.inventory),
      implementation: metric(counts.implementation, counts.inventory),
      parity: metric(counts.parity, counts.inventory),
    };
  }

  const reviewedRelationStatuses = new Set(["confirmed", "confirmed_no_direct_position_relation", "confirmed_no_identity_binding", "confirmed_no_precedence", "confirmed_professional_title_not_position", "rejected"]);
  const organizationRelations = organizationPosition.relations.filter(relation => reviewedRelationStatuses.has(relation.status)).length;
  const payrollDynamic = payroll.dynamicRoutineGates.filter(gate => gate.status === "verified").length;
  const pageAcceptance = customFieldPage.acceptance;
  const modernUiNumerator = ["modernRoutes", "modernApis", "modernPermissions", "modernInteractions", "responsiveStructures", "positiveNegativeTests"]
    .reduce((sum, key) => sum + pageAcceptance[key].verified, 0);
  const modernUiDenominator = ["modernRoutes", "modernApis", "modernPermissions", "modernInteractions", "responsiveStructures", "positiveNegativeTests"]
    .reduce((sum, key) => sum + pageAcceptance[key].denominator, 0);

  const groupRoutineDenominator = groupWeb.expectedCatalog.procedures + groupWeb.expectedCatalog.functions + groupWeb.expectedCatalog.triggers;
  const verifiedProduction = new Set();
  for (const evidence of productionEvidence) {
    if (!PRODUCTION_GATES.includes(evidence?.gate) || evidence.status !== "verified" || !/^[0-9a-f]{64}$/u.test(evidence.evidenceSha256 ?? "")) continue;
    verifiedProduction.add(evidence.gate);
  }

  const gaps = [
    { code: "CLIENT_MENU_RUNTIME_AUTHORITY_PENDING", remaining: CLIENT_BASELINE.menuEntries },
    { code: "CLIENT_FIELD_SEMANTIC_MAPPING_PENDING", remaining: CLIENT_BASELINE.fields - fields.uniqueLocators.length },
    { code: "CLIENT_FIELD_ROW_PARITY_PENDING", remaining: CLIENT_BASELINE.fields },
    { code: "CLIENT_ROUTINE_PARITY_PENDING", remaining: CLIENT_BASELINE.routines - verifiedRoutineRows.length },
    { code: permissionMapping.gaps?.[0]?.code ?? "CLIENT_PERMISSION_MAPPING_PENDING", remaining: permissionMapping.compatibilityCredit.denominator === null ? 1 : permissionMapping.compatibilityCredit.denominator - permissionMapping.compatibilityCredit.numerator },
    { code: "ORGANIZATION_POSITION_FIELDS_PENDING", remaining: organizationPosition.fields.filter(field => field.disposition === "pending").length },
    { code: "ORGANIZATION_POSITION_RELATIONS_PENDING", remaining: organizationPosition.relations.length - organizationRelations },
    { code: "PAYROLL_FIELDS_PENDING", remaining: payroll.fieldMappings.filter(field => field.status !== "verified").length },
    { code: "PAYROLL_DYNAMIC_ROUTINES_PENDING", remaining: payroll.dynamicRoutineGates.length - payrollDynamic },
    { code: "CLIENT_CUSTOM_FIELD_INTERACTION_PARITY_PENDING", remaining: pageAcceptance.endToEndLegacyInteractionParity.denominator - pageAcceptance.endToEndLegacyInteractionParity.verified },
    { code: "GROUP_WEB_ATOMIC_DATABASE_INVENTORY_PENDING", remaining: groupWeb.expectedCatalog.tables + groupWeb.expectedCatalog.fields + groupWeb.expectedCatalog.views + groupRoutineDenominator },
    { code: "GROUP_WEB_ASP_ATOMIC_INVENTORY_PENDING", remaining: groupWeb.expectedInteraction.classicAspPages },
    { code: "GROUP_WEB_PAGE_PARITY_PENDING", remaining: groupWeb.expectedInteraction.navigableEntries },
    { code: "PRODUCTION_EVIDENCE_PENDING", remaining: PRODUCTION_GATES.length - verifiedProduction.size },
  ].filter(gap => gap.remaining > 0);

  return {
    formatVersion: 2,
    reportKind: "yuzhou_hr_legacy_compatibility_progress",
    status: gaps.length === 0 ? "COMPLETE" : "IN_PROGRESS",
    scoringPolicy: {
      additiveScoreForbidden: true,
      reason: "Stages use different evidence standards and denominators; a weighted sum would turn partial inventory into false functional parity.",
      completionRule: "COMPLETE requires zero remaining gaps in every inventory, semantic, implementation, parity, UI, permission, Group Web, and production-evidence gate.",
    },
    inventory: {
      clientDatabase: {
        tables: metric(CLIENT_BASELINE.tables, CLIENT_BASELINE.tables, { evidence: "committed exact table/domain enumeration" }),
        fields: metric(CLIENT_BASELINE.fields, CLIENT_BASELINE.fields, { evidence: "source-bound structural catalog count", committedAtomicRows: 0 }),
        routines: metric(CLIENT_BASELINE.routines, CLIENT_BASELINE.routines, { evidence: "committed routine logic ledger v2" }),
        authorizationGrantEdges: metric(permissionMapping.authorizationGrantEdges.observedRows, CLIENT_BASELINE.permissions, { functionalParityCredit: 0, status: permissionMapping.authorizationGrantEdges.status }),
        permissionCapabilities: metric(permissionMapping.compatibilityCredit.numerator, permissionMapping.compatibilityCredit.denominator ?? 0, { denominatorStatus: permissionMapping.compatibilityCredit.denominator === null ? "SOURCE_RECEIPT_REQUIRED" : "SOURCE_DERIVED", status: permissionMapping.status, reasonCode: permissionMapping.gaps?.[0]?.code ?? null }),
      },
      clientUi: {
        staticMenuEntryInventory: metric(clientMenuInventory.expectedCounts.entries, clientAtomic.expectedCounts.menuEntries, {
          functionalParityCredit: 0,
          evidence: "committed static atomic traversal inventory",
        }),
        runtimeAuthorizedMenuEntries: metric(0, clientAtomic.expectedCounts.menuEntries, {
          reasonCode: "CLIENT_MENU_RUNTIME_AUTHORITY_PENDING",
        }),
      },
      groupWeb: {
        auditedNavigableEntries: metric(groupWeb.expectedInteraction.navigableEntries, groupWeb.expectedInteraction.navigableEntries),
        atomicAspPages: metric(0, groupWeb.expectedInteraction.classicAspPages, { reasonCode: "GROUP_WEB_FULL_ASP_MANIFEST_NOT_COMMITTED" }),
        atomicTables: metric(0, groupWeb.expectedCatalog.tables, { reasonCode: "GROUP_WEB_ATOMIC_SCHEMA_EXPORT_NOT_COMMITTED" }),
        atomicFields: metric(0, groupWeb.expectedCatalog.fields, { reasonCode: "GROUP_WEB_ATOMIC_SCHEMA_EXPORT_NOT_COMMITTED" }),
        atomicViews: metric(0, groupWeb.expectedCatalog.views, { reasonCode: "GROUP_WEB_ATOMIC_SCHEMA_EXPORT_NOT_COMMITTED" }),
        atomicRoutines: metric(0, groupRoutineDenominator, { reasonCode: "GROUP_WEB_ATOMIC_ROUTINE_EXPORT_NOT_COMMITTED" }),
      },
    },
    semanticMapping: {
      clientTablesDomainClassified: metric(CLIENT_BASELINE.tables, CLIENT_BASELINE.tables),
      clientFieldsVerifiedTargetMapping: metric(fields.uniqueLocators.length, CLIENT_BASELINE.fields, {
        denominatorScope: "all_client_database_source_fields",
        overlapCount: fields.overlapCount,
        slices: fields.slices,
      }),
      clientRoutinesStructurallyClassified: metric(CLIENT_BASELINE.routines, CLIENT_BASELINE.routines, { functionalEquivalenceCredit: 0 }),
      clientRoutinesBehaviorClosed: metric(verifiedRoutineRows.length, CLIENT_BASELINE.routines),
      organizationPositionRelations: metric(organizationRelations, organizationPosition.relations.length),
      payrollDynamicRoutines: metric(payrollDynamic, payroll.dynamicRoutineGates.length),
    },
    implementation: {
      clientFieldsWithVerifiedTargetContract: metric(fields.uniqueLocators.length, CLIENT_BASELINE.fields),
      clientRoutineFamiliesImplementedAndTested: metric(verifiedRoutineRows.length, CLIENT_BASELINE.routines),
      reviewedCoreArchiveDetailFields: metric(
        coreMapping.inventoryContract.selectedFields
          - coreMapping.domains.reduce((sum, domain) => sum + Object.keys(domain.columnMappings).length, 0)
          - coreMapping.residueArchive.securityExclusions.length,
        coreMapping.inventoryContract.selectedFields
          - coreMapping.domains.reduce((sum, domain) => sum + Object.keys(domain.columnMappings).length, 0)
          - coreMapping.residueArchive.securityExclusions.length,
        { functionalParityCredit: 0, projection: "authorized_detail_only" },
      ),
      customFieldModernUiChecks: metric(modernUiNumerator, modernUiDenominator),
      groupWebModernRuntimeTasksPrepared: metric(groupWebTasks.length, groupWeb.expectedInteraction.navigableEntries, {
        functionalParityCredit: 0,
        status: "ready_not_executed",
      }),
    },
    parity: {
      clientFieldRowLevelParity: metric(0, CLIENT_BASELINE.fields, { reasonCode: "FULL_SOURCE_ROW_PARITY_RECEIPT_NOT_COMMITTED" }),
      clientRoutineBehaviorParity: metric(verifiedRoutineRows.length, CLIENT_BASELINE.routines, { verifiedRoutineIds: [...verifiedRoutineIds].sort() }),
      customFieldLegacyInteractions: metric(pageAcceptance.endToEndLegacyInteractionParity.verified, pageAcceptance.endToEndLegacyInteractionParity.denominator),
      groupWebNavigableEntries: metric(0, groupWeb.expectedInteraction.navigableEntries, { reasonCode: "GROUP_WEB_RUNTIME_PARITY_NOT_VERIFIED" }),
    },
    ui: {
      customFieldSourceNavigation: metric(pageAcceptance.sourceNavigation.verified, pageAcceptance.sourceNavigation.denominator),
      customFieldLegacyInteractionParity: metric(pageAcceptance.sourceInteractionParity.verified, pageAcceptance.sourceInteractionParity.denominator),
      customFieldModernSurface: metric(modernUiNumerator, modernUiDenominator),
      groupWebRuntimeParity: metric(0, groupWeb.expectedInteraction.navigableEntries),
    },
    productionEvidence: {
      verified: metric(verifiedProduction.size, PRODUCTION_GATES.length),
      requiredGates: [...PRODUCTION_GATES],
      missingGates: PRODUCTION_GATES.filter(gate => !verifiedProduction.has(gate)),
      historicalRehearsalDoesNotCountAsProduction: true,
    },
    byRoutineDomain: Object.fromEntries(Object.entries(routineDomains).sort(([a], [b]) => a.localeCompare(b, "en"))),
    gaps,
    productionImport: "HOLD",
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

export function readDefaultLegacyCompatibilityProgressInputs() {
  return {
    routineLedger: readJson(DEFAULTS.routineLedger),
    tableMap: readJson(DEFAULTS.tableMap),
    coreMapping: readJson(DEFAULTS.coreMapping),
    organizationPosition: readJson(DEFAULTS.organizationPosition),
    payroll: readJson(DEFAULTS.payroll),
    employeeProfile: readJson(DEFAULTS.employeeProfile),
    knowhowFieldMap: readJson(DEFAULTS.knowhowFieldMap),
    rewardDiscipline: readJson(DEFAULTS.rewardDiscipline),
    trainingHistory: readJson(DEFAULTS.trainingHistory),
    insurancePolicy: readJson(DEFAULTS.insurancePolicy),
    customFieldPage: readJson(DEFAULTS.customFieldPage),
    groupWeb: readJson(DEFAULTS.groupWeb),
    clientAtomic: readJson(DEFAULTS.clientAtomic),
    clientMenuInventory: readJson(DEFAULTS.clientMenuInventory),
    permissionMapping: readJson(DEFAULTS.permissionMapping),
    groupWebTasks: DEFAULTS.groupWebTasks.map(readJson),
    routineFamilies: DEFAULTS.routineFamilies.map(readJson),
    productionEvidence: [],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== "--json");
    if (unknown.length > 0) fail("CLI_ARGUMENT_INVALID", unknown.join(","));
    const report = buildLegacyCompatibilityProgress(readDefaultLegacyCompatibilityProgressInputs());
    process.stdout.write(`${JSON.stringify(report, null, process.argv.includes("--json") ? 2 : 0)}\n`);
  } catch (error) {
    const code = error instanceof LegacyCompatibilityProgressError ? error.code : "LEGACY_COMPATIBILITY_PROGRESS_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
