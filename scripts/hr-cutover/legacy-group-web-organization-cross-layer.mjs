#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_ENTRY = Object.freeze({
  legacyId: 2,
  legacyUrl: "Organization/Orgchart/detail.asp?t=1",
  domain: "organization",
  ownership: "hr",
  targetRoute: "/hr/organization",
});
const EXPECTED_PERMISSIONS = Object.freeze({ page: "hr:organization", treeApi: "system:org:list" });
const EXPECTED_PATHS = Object.freeze({
  legacyMapping: "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json",
  routePage: "apps/web/app/hr/organization/page.tsx",
  pageClient: "apps/web/app/hr/organization/HrOrganizationClient.tsx",
  webApi: "apps/web/lib/hr-api.ts",
  treeController: "apps/api/src/modules/orgs/orgs.controller.ts",
  treeService: "apps/api/src/modules/orgs/orgs.service.ts",
  orgEntity: "apps/api/src/modules/orgs/entities/org.entity.ts",
  orgFoundationMigration: "database/migrations/000002_s1_system_foundation.sql",
  orgHierarchyMigration: "database/migrations/000204_org_hierarchy_integrity.sql",
  systemPermissions: "packages/shared/src/index.ts",
  hrPermissions: "packages/shared/src/hr.ts",
  hrResponsiveStyles: "apps/web/app/hr/hr-workbench.module.css",
  designSystemStyles: "apps/web/app/globals.css",
});
export class LegacyGroupWebOrganizationCrossLayerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebOrganizationCrossLayerError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyGroupWebOrganizationCrossLayerError(code, detail);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validateContract(contract) {
  if (
    !object(contract) ||
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_group_web_organization_cross_layer" ||
    !same(contract.legacyEntry, EXPECTED_ENTRY) ||
    !same(contract.expectedReadPermissions, EXPECTED_PERMISSIONS) ||
    !same(contract.requiredStaticLayers, [
      "legacy_entry",
      "modern_route",
      "page_tree_api_binding",
      "tree_controller",
      "tree_service",
      "storage_entity",
      "storage_migrations",
      "read_permissions",
      "responsive_shell",
      "organization_tree_390",
    ]) ||
    !same(contract.runtimeSurfaces, ["legacy_group_web", "modern_web_browser"]) ||
    !same(contract.evidencePolicy, {
      sourcePayload: "hash_and_boolean_checks_only",
      organizationNameValues: "FORBIDDEN",
      personData: "FORBIDDEN",
      credentials: "FORBIDDEN",
      pageBody: "FORBIDDEN",
      screenshotBinary: "FORBIDDEN",
      staticCompatibilityCredit: 0,
      runtimeCompatibilityCreditWithoutEvidence: 0,
    }) ||
    contract.productionImport !== "HOLD"
  ) {
    fail("GROUP_WEB_ORG_CROSS_LAYER_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (
    !object(contract.sourceBindings) ||
    !same(Object.keys(contract.sourceBindings).sort(), Object.keys(EXPECTED_PATHS).sort())
  ) {
    fail("GROUP_WEB_ORG_CROSS_LAYER_SOURCE_BINDING_INVALID", "coverage");
  }
  for (const [key, path] of Object.entries(EXPECTED_PATHS)) {
    const binding = contract.sourceBindings[key];
    if (!object(binding) || binding.path !== path || !SHA256.test(binding.sha256 ?? "")) {
      fail("GROUP_WEB_ORG_CROSS_LAYER_SOURCE_BINDING_INVALID", key);
    }
  }
}

function readSources(repositoryRoot, contract) {
  validateContract(contract);
  const canonicalRoot = realpathSync(repositoryRoot);
  const rootPrefix = `${canonicalRoot}${sep}`;
  return Object.fromEntries(
    Object.entries(contract.sourceBindings).map(([key, binding]) => {
      const path = resolve(canonicalRoot, binding.path);
      const stat = lstatSync(path);
      const canonicalPath = realpathSync(path);
      if (stat.isSymbolicLink() || !stat.isFile() || !canonicalPath.startsWith(rootPrefix)) {
        fail("GROUP_WEB_ORG_CROSS_LAYER_SOURCE_PATH_INVALID", key);
      }
      const bytes = readFileSync(canonicalPath);
      if (digest(bytes) !== binding.sha256) {
        fail("GROUP_WEB_ORG_CROSS_LAYER_SOURCE_DRIFT", key);
      }
      return [key, bytes.toString("utf8")];
    }),
  );
}

const layer = (name, passed, evidence, gapCode) => ({
  layer: name,
  status: passed ? "verified_static" : "gap",
  evidenceSha256: digest(canonical(evidence)),
  gapCode: passed ? null : gapCode,
});

export function inspectLegacyGroupWebOrganizationCrossLayer({ contract, sources }) {
  validateContract(contract);
  const mapping = JSON.parse(sources.legacyMapping);
  const legacyItem = mapping.items?.find((item) => item.legacyId === 2);
  const legacyEntryPassed =
    legacyItem?.legacyUrl === EXPECTED_ENTRY.legacyUrl &&
    legacyItem?.domain === EXPECTED_ENTRY.domain &&
    legacyItem?.ownership === EXPECTED_ENTRY.ownership &&
    same(legacyItem?.targetRoutes, [EXPECTED_ENTRY.targetRoute]) &&
    legacyItem?.mappingStatus === "mapped";

  const modernRoutePassed =
    /import\s+\{\s*HrOrganizationClient\s*\}/u.test(sources.routePage) &&
    /<HrOrganizationClient\s*\/>/u.test(sources.routePage) &&
    /HR_PERMISSIONS\.HR_ORGANIZATION_PAGE/u.test(sources.pageClient);
  const pageCallsTree =
    /["'`]\/orgs\/tree["'`]/u.test(sources.pageClient) ||
    /["'`]\/orgs\/tree["'`]/u.test(sources.webApi) ||
    /hrApi\.(?:organizationTree|orgTree)\s*\(/u.test(sources.pageClient);
  const pageRendersTree =
    /OrgTreeNode|organizationTree|orgTree/u.test(sources.pageClient) &&
    /children/u.test(sources.pageClient);
  const controllerPassed =
    /@Controller\("orgs"\)/u.test(sources.treeController) &&
    /@Get\("tree"\)[\s\S]{0,180}@RequirePermissions\(SYSTEM_PERMISSIONS\.ORG_LIST\)[\s\S]{0,220}orgsService\.tree/u.test(
      sources.treeController,
    );
  const servicePassed =
    /async tree\(scope: TenantParkScope/u.test(sources.treeService) &&
    /buildFindWhere<OrgEntity>/u.test(sources.treeService) &&
    /tenantId:\s*scope\.tenantId/u.test(sources.treeService) &&
    /parkId:\s*scope\.parkId/u.test(sources.treeService) &&
    /parent\.children\.push\(node\)/u.test(sources.treeService);
  const entityPassed =
    /@Entity\("sys_org"\)/u.test(sources.orgEntity) &&
    /name:\s*"parent_id"[\s\S]{0,80}nullable:\s*true/u.test(sources.orgEntity) &&
    /tenantId|AuditableEntity/u.test(sources.orgEntity);
  const migrationsPassed =
    /CREATE TABLE IF NOT EXISTS sys_org/u.test(sources.orgFoundationMigration) &&
    /parent_id uuid/u.test(sources.orgFoundationMigration) &&
    /FOREIGN KEY \(parent_id, tenant_id, park_id\) REFERENCES sys_org\(id, tenant_id, park_id\)/u.test(
      sources.orgHierarchyMigration,
    ) &&
    /cyclic organization links/u.test(sources.orgHierarchyMigration);
  const permissionsPassed =
    /ORG_LIST:\s*"system:org:list"/u.test(sources.systemPermissions) &&
    /HR_ORGANIZATION_PAGE:\s*"hr:organization"/u.test(sources.hrPermissions) &&
    /@RequirePermissions\(SYSTEM_PERMISSIONS\.ORG_LIST\)/u.test(sources.treeController) &&
    /permission=\{HR_PERMISSIONS\.HR_ORGANIZATION_PAGE\}/u.test(sources.pageClient);
  const responsiveShellPassed =
    /ds-mobile-record-list/u.test(sources.pageClient) &&
    /@media \(max-width: 520px\)[\s\S]*\.formGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/u.test(
      sources.hrResponsiveStyles,
    ) &&
    /\.ds-mobile-record-list\s*\{/u.test(sources.designSystemStyles);
  const tree390Passed = pageCallsTree && pageRendersTree && responsiveShellPassed;

  const layers = [
    layer("legacy_entry", legacyEntryPassed, { legacyId: 2, mappingSha256: digest(sources.legacyMapping) }, "LEGACY_GROUP_WEB_ORG_ENTRY_BINDING_MISSING"),
    layer("modern_route", modernRoutePassed, { routePageSha256: digest(sources.routePage), pageClientSha256: digest(sources.pageClient) }, "MODERN_HR_ORGANIZATION_ROUTE_MISSING"),
    layer("page_tree_api_binding", pageCallsTree, { pageClientSha256: digest(sources.pageClient), webApiSha256: digest(sources.webApi) }, "HR_ORGANIZATION_PAGE_TREE_API_BINDING_MISSING"),
    layer("tree_controller", controllerPassed, { controllerSha256: digest(sources.treeController) }, "ORG_TREE_CONTROLLER_MISSING"),
    layer("tree_service", servicePassed, { serviceSha256: digest(sources.treeService) }, "ORG_TREE_SERVICE_MISSING"),
    layer("storage_entity", entityPassed, { entitySha256: digest(sources.orgEntity) }, "ORG_TREE_STORAGE_ENTITY_MISSING"),
    layer("storage_migrations", migrationsPassed, { foundationSha256: digest(sources.orgFoundationMigration), hierarchySha256: digest(sources.orgHierarchyMigration) }, "ORG_TREE_STORAGE_MIGRATION_MISSING"),
    layer("read_permissions", permissionsPassed, { controllerSha256: digest(sources.treeController), systemPermissionSha256: digest(sources.systemPermissions), hrPermissionSha256: digest(sources.hrPermissions) }, "ORG_TREE_READ_PERMISSION_INVALID"),
    layer("responsive_shell", responsiveShellPassed, { pageClientSha256: digest(sources.pageClient), hrCssSha256: digest(sources.hrResponsiveStyles), designCssSha256: digest(sources.designSystemStyles) }, "HR_ORGANIZATION_RESPONSIVE_SHELL_MISSING"),
    layer("organization_tree_390", tree390Passed, { pageCallsTree, pageRendersTree, responsiveShellPassed }, "HR_ORGANIZATION_TREE_390_STRUCTURE_MISSING"),
  ];
  return { layers, gapCodes: layers.filter((item) => item.status === "gap").map((item) => item.gapCode) };
}

function materialize(contract, sources) {
  const inspection = inspectLegacyGroupWebOrganizationCrossLayer({ contract, sources });
  const staticComplete = inspection.gapCodes.length === 0;
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_group_web_organization_cross_layer_receipt",
    legacyEntry: structuredClone(contract.legacyEntry),
    sourceBindingSetSha256: digest(canonical(contract.sourceBindings)),
    staticEvidence: {
      status: staticComplete ? "complete_review_pending" : "gaps_present",
      layers: inspection.layers,
      gapCodes: inspection.gapCodes,
      compatibilityCredit: 0,
    },
    runtimeEvidence: contract.runtimeSurfaces.map((surface) => ({
      surface,
      status: "pending",
      evidenceSha256: null,
      compatibilityCredit: 0,
    })),
    status: staticComplete
      ? "STATIC_CHAIN_COMPLETE_RUNTIME_PENDING"
      : "STATIC_CROSS_LAYER_GAPS_PRESENT",
    organizationNameValuesIncluded: false,
    personDataIncluded: false,
    credentialsIncluded: false,
    pageBodyIncluded: false,
    screenshotBinaryIncluded: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildLegacyGroupWebOrganizationCrossLayer({ contract, repositoryRoot }) {
  const sources = readSources(repositoryRoot, contract);
  return materialize(contract, sources);
}

export function verifyLegacyGroupWebOrganizationCrossLayer({ contract, repositoryRoot, receipt }) {
  const expected = buildLegacyGroupWebOrganizationCrossLayer({ contract, repositoryRoot });
  if (!same(receipt, expected)) {
    fail("GROUP_WEB_ORG_CROSS_LAYER_RECEIPT_DRIFT", "receipt");
  }
  return {
    status: "PASS",
    staticStatus: receipt.staticEvidence.status,
    staticGapCount: receipt.staticEvidence.gapCodes.length,
    runtimePendingCount: receipt.runtimeEvidence.filter((item) => item.status === "pending").length,
    compatibilityCredit: 0,
    productionImport: "HOLD",
    receiptSha256: receipt.receiptSha256,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-group-web-organization-cross-layer-v1.json"),
      "utf8",
    ),
  );
  const receipt = buildLegacyGroupWebOrganizationCrossLayer({ contract, repositoryRoot });
  process.stdout.write(
    `${JSON.stringify(verifyLegacyGroupWebOrganizationCrossLayer({ contract, repositoryRoot, receipt }))}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof LegacyGroupWebOrganizationCrossLayerError ? error.code : "GROUP_WEB_ORG_CROSS_LAYER_UNEXPECTED"}\n`,
    );
    process.exitCode = 1;
  }
}
