import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class LegacyEmployeeCustomFieldPageFamilyError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyEmployeeCustomFieldPageFamilyError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyEmployeeCustomFieldPageFamilyError(code, detail); };
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const hash = (value) => createHash("sha256").update(value).digest("hex");

function readRepositoryFile(root, path) {
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, path);
  if (!absolute.startsWith(`${absoluteRoot}/`)) fail("PAGE_FAMILY_PATH_INVALID", path);
  return readFileSync(absolute, "utf8");
}

function requireText(text, pattern, code, detail) {
  if (!pattern.test(text)) fail(code, detail);
}

function requireNoText(text, pattern, code, detail) {
  if (pattern.test(text)) fail(code, detail);
}

export function verifyLegacyEmployeeCustomFieldPageFamily(contract, { root = ROOT } = {}) {
  if (contract?.formatVersion !== 1 || contract?.contractKind !== "yuzhou_hr_legacy_employee_custom_field_page_family") {
    fail("PAGE_FAMILY_CONTRACT_INVALID", "unsupported contract identity");
  }
  if (contract.status !== "IN_PROGRESS" || contract.productionImport !== "HOLD" || contract.compatibilityScoreContribution !== 0) {
    fail("PAGE_FAMILY_STATUS_INVALID", "untraversed source interactions cannot claim completion or production credit");
  }

  const sourceByPath = new Map();
  for (const source of contract.sourceContracts ?? []) {
    const text = readRepositoryFile(root, source.path);
    if (hash(text) !== source.sha256) fail("PAGE_FAMILY_SOURCE_DRIFT", source.path);
    sourceByPath.set(source.path, JSON.parse(text));
  }
  const mapping = sourceByPath.get("scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json");
  const audit = sourceByPath.get("scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json");
  const fieldMap = sourceByPath.get("scripts/hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json");
  if (!mapping || !audit || !fieldMap || sourceByPath.size !== 3) fail("PAGE_FAMILY_SOURCE_SET_INVALID", "three pinned source contracts are required");

  const expectedAliases = contract.legacyNavigation?.aliases ?? [];
  if (expectedAliases.length !== 2 || contract.legacyNavigation?.canonicalPageCount !== 1) {
    fail("PAGE_FAMILY_NAVIGATION_INVALID", "employee page must retain two aliases for one canonical source page");
  }
  if (contract.legacyNavigation.navigableAliasDenominator !== expectedAliases.length
      || contract.legacyNavigation.navigableAliasVerified !== expectedAliases.length
      || contract.acceptance?.sourceNavigation?.denominator !== expectedAliases.length
      || contract.acceptance?.sourceNavigation?.verified !== expectedAliases.length) {
    fail("PAGE_FAMILY_NAVIGATION_COUNT_INVALID", "source navigation must reconcile to the two audited aliases");
  }
  const parent = mapping.items.find((item) => item.legacyId === contract.legacyNavigation.parent.legacyId);
  if (!parent || parent.name !== contract.legacyNavigation.parent.name || parent.domain !== "employee") {
    fail("PAGE_FAMILY_PARENT_INVALID", "Group Web employee parent menu drifted");
  }

  for (const alias of expectedAliases) {
    const mapped = mapping.items.find((item) => item.legacyId === alias.legacyId);
    if (!mapped || mapped.name !== alias.name || mapped.legacyUrl?.toLowerCase() !== alias.legacyUrl.toLowerCase()) {
      fail("PAGE_FAMILY_ALIAS_INVALID", String(alias.legacyId));
    }
    if (mapped.parentId !== alias.parentId || mapped.domain !== "employee" || !mapped.targetRoutes.includes("/hr/employees")) {
      fail("PAGE_FAMILY_ALIAS_TARGET_INVALID", String(alias.legacyId));
    }
    const audited = audit.items.find((item) => item.legacyId === alias.legacyId);
    const aggregate = contract.legacySourcePage;
    for (const key of ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "stateTransitions"]) {
      if (audited?.[key] !== aggregate[key]) fail("PAGE_FAMILY_SOURCE_AGGREGATE_DRIFT", `${alias.legacyId}:${key}`);
    }
    if (!audited.entryResolved || audited.fieldEvidenceHash !== aggregate.fieldEvidenceSha256) {
      fail("PAGE_FAMILY_SOURCE_EVIDENCE_INVALID", String(alias.legacyId));
    }
  }

  const definitionMap = fieldMap.personCustomFieldMapping;
  const definitionCount = definitionMap?.fields?.length;
  const logicColumns = definitionMap?.logicColumnRules?.length;
  if (definitionMap?.sourceDefinitionTable !== "dbo.defs" || definitionMap?.sourceValueTable !== "dbo.person"
      || definitionCount !== 19 || logicColumns !== 10 || definitionCount * logicColumns !== 190) {
    fail("PAGE_FAMILY_FIELD_MAPPING_INVALID", "defs/person.def* denominator drifted");
  }
  if (contract.legacyFieldFamily.customFieldDefinitions !== definitionCount
      || contract.legacyFieldFamily.logicColumnsPerDefinition !== logicColumns
      || contract.legacyFieldFamily.logicCellDenominator !== definitionCount * logicColumns) {
    fail("PAGE_FAMILY_FIELD_DENOMINATOR_INVALID", "field family counts do not reconcile");
  }

  const sourceInteractions = contract.acceptance?.sourceInteractionParity;
  const endToEnd = contract.acceptance?.endToEndLegacyInteractionParity;
  if (contract.legacySourcePage.liveRuntimeTraversed !== false
      || contract.legacySourcePage.granularInteractionVerified !== 0
      || sourceInteractions?.denominator !== contract.legacySourcePage.stateTransitions
      || sourceInteractions?.verified !== 0
      || endToEnd?.denominator !== sourceInteractions.denominator
      || endToEnd?.verified !== 0
      || contract.modernSurface.visualEquivalenceClaimed !== false) {
    fail("PAGE_FAMILY_UNVERIFIED_INTERACTION_CLAIM", "aggregate ASP counts or declared locators cannot close granular parity");
  }

  const route = readRepositoryFile(root, contract.modernSurface.routeFile);
  const client = readRepositoryFile(root, contract.modernSurface.clientFile);
  const apiClient = readRepositoryFile(root, contract.modernSurface.apiClientFile);
  const controller = readRepositoryFile(root, contract.modernSurface.controllerFile);
  const service = readRepositoryFile(root, contract.modernSurface.serviceFile);
  const shared = readRepositoryFile(root, "packages/shared/src/hr.ts");
  const globalCss = readRepositoryFile(root, "apps/web/app/globals.css");
  const workbenchCss = readRepositoryFile(root, "apps/web/app/hr/hr-workbench.module.css");
  const apiTest = readRepositoryFile(root, contract.modernSurface.acceptanceTests.apiFile);
  const webTest = readRepositoryFile(root, contract.modernSurface.acceptanceTests.webFile);

  requireText(route, /HrCustomFieldDefinitionsClient/, "PAGE_FAMILY_ROUTE_MISSING", contract.modernSurface.route);
  requireText(shared, /HR_EMPLOYEE_PROFILE_MANAGE:\s*"hr:employee_profile:manage"/, "PAGE_FAMILY_PERMISSION_INVALID", "shared permission");
  requireText(client, /PermissionGuard[\s\S]*HR_EMPLOYEE_PROFILE_MANAGE[\s\S]*fallback=\{forbidden\}/, "PAGE_FAMILY_PERMISSION_INVALID", "visible forbidden surface");
  requireText(controller, /@Get\("legacy"\)\s*@RequirePermissions\(HR_PERMISSIONS\.HR_EMPLOYEE_PROFILE_MANAGE\)/, "PAGE_FAMILY_API_INVALID", "GET legacy");
  requireText(controller, /@Put\("legacy\/:id\/review"\)[\s\S]{0,180}@RequirePermissions\(HR_PERMISSIONS\.HR_EMPLOYEE_PROFILE_MANAGE\)/, "PAGE_FAMILY_API_INVALID", "PUT review");
  requireText(service, /definition\.tenant_id=:tenantId AND definition\.park_id=:parkId/, "PAGE_FAMILY_SCOPE_INVALID", "tenant and park scope");
  requireText(apiClient, /createIdempotencyKey\("hr-custom-field-review"\)/, "PAGE_FAMILY_REVIEW_CONTRACT_INVALID", "idempotency");
  requireText(client, /expectedVersion:\s*row\.review\.version/, "PAGE_FAMILY_REVIEW_CONTRACT_INVALID", "optimistic version");

  for (const marker of ["type=\"search\"", "filters.classification", "filters.reviewStatus", "filters.coverageStatus", "加载更多", "ReviewForm"]) {
    requireText(client, new RegExp(marker), "PAGE_FAMILY_INTERACTION_MISSING", marker);
  }
  requireText(client, /className="ds-mobile-record-list"/, "PAGE_FAMILY_PHONE_STRUCTURE_MISSING", "390px cards");
  requireText(client, /className="ds-table-shell"[\s\S]*<table>/, "PAGE_FAMILY_DESKTOP_STRUCTURE_MISSING", "desktop table");
  requireText(globalCss, /@media \(max-width: 720px\)[\s\S]*\.ds-mobile-record-list\s*\{\s*display: grid;/, "PAGE_FAMILY_PHONE_STRUCTURE_MISSING", "mobile card breakpoint");
  requireText(globalCss, /\.ds-mobile-record-list\s*~\s*\.ds-table-shell\s*\{\s*display: none;/, "PAGE_FAMILY_PHONE_STRUCTURE_MISSING", "mobile table suppression");
  requireText(workbenchCss, /@media \(max-width: 520px\)[\s\S]*\.formGrid\s*\{\s*grid-template-columns: 1fr;/, "PAGE_FAMILY_PHONE_STRUCTURE_MISSING", "single-column forms at 390px");

  const outboundSurface = `${client}\n${apiClient}`;
  requireNoText(outboundSurface, /(?:sourceValue|sqltext|crosssql|descriptionD)Sha256|legacy_sqltext_sha256|legacy_crosssql_sha256/, "PAGE_FAMILY_SENSITIVE_PROJECTION", "fingerprints must not leave the API boundary");
  requireNoText(outboundSurface, /(?:raw|original)(?:Legacy)?Sql|legacySqlText|legacyCrossSql/i, "PAGE_FAMILY_RAW_SQL_PROJECTION", "raw legacy SQL must not be rendered");
  requireText(client, /旧 SQL 原文不会入库、执行或出站/, "PAGE_FAMILY_RAW_SQL_WARNING_MISSING", "operator warning");

  requireText(apiTest, /projection is fail-closed and never exposes stored fingerprints/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "safe projection");
  requireText(apiTest, /fail closed without the HR profile management permission/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "permission denial");
  requireText(apiTest, /pending and rejected reviews keep classification and coverage fail closed/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "invalid review states");
  requireText(apiTest, /without any raw legacy SQL storage/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "raw SQL exclusion");
  requireText(webTest, /has desktop and phone structures/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "desktop and phone structure");
  requireText(webTest, /rather than legacy SQL or fingerprints/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "sensitive UI projection");
  requireText(webTest, /optimistic versions, and no free-text reason/, "PAGE_FAMILY_ACCEPTANCE_TEST_MISSING", "constrained review");

  const modernInteractions = contract.modernSurface.interactionIds?.length ?? 0;
  if (modernInteractions !== 7 || contract.acceptance.modernInteractions?.denominator !== modernInteractions
      || contract.acceptance.modernInteractions?.verified !== modernInteractions) {
    fail("PAGE_FAMILY_MODERN_INTERACTION_COUNT_INVALID", String(modernInteractions));
  }
  if (contract.modernSurface.apis?.length !== 2
      || !contract.modernSurface.apis.includes("GET /hr/custom-field-definitions/legacy")
      || !contract.modernSurface.apis.includes("PUT /hr/custom-field-definitions/legacy/:id/review")
      || contract.acceptance.modernRoutes?.denominator !== 1 || contract.acceptance.modernRoutes?.verified !== 1
      || contract.acceptance.modernApis?.denominator !== 2 || contract.acceptance.modernApis?.verified !== 2
      || contract.acceptance.modernPermissions?.denominator !== 2 || contract.acceptance.modernPermissions?.verified !== 2) {
    fail("PAGE_FAMILY_MODERN_SURFACE_COUNT_INVALID", "route, API, and permission dimensions must reconcile");
  }
  if (contract.acceptance.responsiveStructures?.denominator !== 2 || contract.acceptance.responsiveStructures?.verified !== 2) {
    fail("PAGE_FAMILY_RESPONSIVE_COUNT_INVALID", "desktop and 390px structures must both be present");
  }
  const acceptanceTestCount = (contract.modernSurface.acceptanceTests.positiveCaseIds?.length ?? 0)
    + (contract.modernSurface.acceptanceTests.negativeCaseIds?.length ?? 0);
  if (acceptanceTestCount !== 7 || contract.acceptance.positiveNegativeTests?.denominator !== acceptanceTestCount
      || contract.acceptance.positiveNegativeTests?.verified !== acceptanceTestCount) {
    fail("PAGE_FAMILY_ACCEPTANCE_TEST_COUNT_INVALID", String(acceptanceTestCount));
  }

  return {
    ok: true,
    status: contract.status,
    familyId: contract.familyId,
    sourceNavigation: contract.acceptance.sourceNavigation,
    sourceInteractionParity: sourceInteractions,
    modernInteractions: contract.acceptance.modernInteractions,
    responsiveStructures: contract.acceptance.responsiveStructures,
    positiveNegativeTests: contract.acceptance.positiveNegativeTests,
    endToEndLegacyInteractionParity: endToEnd,
    gapReasonCodes: contract.legacySourcePage.gapReasonCodes,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD"
  };
}
