#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED = Object.freeze({
  milestone: "M4",
  sourceTable: "dbo.readjust",
  targetTable: "hr_employment_event",
  mappedRoute: "/hr/lifecycle",
  detailRoute: "/hr/employees",
});
const EXPECTED_PATHS = Object.freeze({
  sourceManifest: "scripts/hr-cutover/contracts/legacy-frozen-compatibility-migration-manifest-v1.json",
  sourceTableMap: "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json",
  sourceReviewedMapping: "scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json",
  sourceTransform: "scripts/transform-yuzhou-t1-employment-events.mjs",
  targetLoader: "scripts/load-yuzhou-t1-employment-events.sh",
  targetFoundationMigration: "database/migrations/000230_hr_employee_foundation.sql",
  targetCompatibilityMigration: "database/migrations/000237_hr_employment_event_legacy_compatibility.sql",
  targetEventNumberMigration: "database/migrations/000266_hr_employee_identity_event_number.sql",
  targetEntity: "apps/api/src/modules/hr/entities/hr.entities.ts",
  apiController: "apps/api/src/modules/hr/hr.controller.ts",
  apiService: "apps/api/src/modules/hr/hr.service.ts",
  apiDto: "apps/api/src/modules/hr/dto/hr.dto.ts",
  apiReadSpec: "apps/api/src/modules/hr/hr-employment-event-read.spec.ts",
  lifecycleRoute: "apps/web/app/hr/lifecycle/page.tsx",
  lifecycleClient: "apps/web/app/hr/lifecycle/HrLifecycleClient.tsx",
  employeeRoute: "apps/web/app/hr/employees/page.tsx",
  employeeClient: "apps/web/app/hr/employees/HrEmployeesClient.tsx",
  hrPermissions: "packages/shared/src/hr.ts",
});

export class LegacyEmploymentEventCrossLayerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyEmploymentEventCrossLayerError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyEmploymentEventCrossLayerError(code, detail);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validateContract(contract) {
  if (
    !object(contract) ||
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_employment_event_cross_layer" ||
    !same(contract.identity, EXPECTED) ||
    !same(contract.requiredStaticLayers, [
      "source_manifest",
      "source_mapping",
      "controlled_transform",
      "target_loader",
      "target_schema",
      "target_entity",
      "api_controller",
      "api_service",
      "frontend_routes",
      "frontend_read_write_surface",
      "detail_response_projection",
      "detail_required_audit",
    ]) ||
    !same(contract.runtimeSurfaces, [
      "source_readonly_runtime",
      "api_role_matrix",
      "modern_web_desktop",
      "modern_web_390",
    ]) ||
    !same(contract.expectedStaticGapCodes, []) ||
    !same(contract.evidencePolicy, {
      sourcePayload: "hash_structure_and_stable_identifiers_only",
      sourceRows: "FORBIDDEN",
      personData: "FORBIDDEN",
      credentials: "FORBIDDEN",
      pageBody: "FORBIDDEN",
      screenshotBinary: "FORBIDDEN",
      staticCompatibilityCredit: 0,
      runtimeCompatibilityCreditWithoutEvidence: 0,
    }) ||
    contract.productionImport !== "HOLD"
  ) {
    fail("LEGACY_EMPLOYMENT_EVENT_CROSS_LAYER_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (
    !object(contract.sourceBindings) ||
    !same(Object.keys(contract.sourceBindings).sort(), Object.keys(EXPECTED_PATHS).sort())
  ) {
    fail("LEGACY_EMPLOYMENT_EVENT_SOURCE_BINDING_INVALID", "coverage");
  }
  for (const [key, path] of Object.entries(EXPECTED_PATHS)) {
    const binding = contract.sourceBindings[key];
    if (!object(binding) || binding.path !== path || !SHA256.test(binding.sha256 ?? "")) {
      fail("LEGACY_EMPLOYMENT_EVENT_SOURCE_BINDING_INVALID", key);
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
        fail("LEGACY_EMPLOYMENT_EVENT_SOURCE_PATH_INVALID", key);
      }
      const bytes = readFileSync(canonicalPath);
      if (digest(bytes) !== binding.sha256) {
        fail("LEGACY_EMPLOYMENT_EVENT_SOURCE_DRIFT", key);
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

export function inspectLegacyEmploymentEventCrossLayer({ contract, sources }) {
  validateContract(contract);
  const manifest = JSON.parse(sources.sourceManifest);
  const tableMap = JSON.parse(sources.sourceTableMap);
  const reviewedMapping = JSON.parse(sources.sourceReviewedMapping);
  const tableLedger = manifest.evidenceLedgers?.find((item) => item.stableId === "FIELD_TABLE_MAP");
  const reviewedLedger = manifest.evidenceLedgers?.find((item) => item.stableId === "FIELD_CORE_MAPPING");
  const sourceManifestPassed =
    manifest.contractKind === "yuzhou_hr_frozen_compatibility_migration_manifest" &&
    tableLedger?.path === EXPECTED_PATHS.sourceTableMap &&
    tableLedger?.sha256 === contract.sourceBindings.sourceTableMap.sha256 &&
    reviewedLedger?.path === EXPECTED_PATHS.sourceReviewedMapping &&
    reviewedLedger?.sha256 === contract.sourceBindings.sourceReviewedMapping.sha256 &&
    manifest.outputPolicy === "stable_ids_statuses_hashes_and_counts_only" &&
    manifest.containsSourceValues === false &&
    manifest.containsPersonalData === false &&
    manifest.productionImport === "HOLD";

  const tableDomain = tableMap.groups?.find((item) => item.domain === "employment_lifecycle");
  const fieldDomain = reviewedMapping.domains?.find((item) => item.domain === "employment_change");
  const expectedColumns = {
    "readjust.no": "legacy_event_no",
    "readjust.readjusttype": "legacy_event_type",
    "readjust.readjustdate": "effective_date",
    "readjust.person": "employee_id",
    "readjust.olddepartment": "before_snapshot",
    "readjust.department": "after_snapshot",
    "readjust.oldjob": "before_snapshot",
    "readjust.job": "after_snapshot",
    "readjust.cause": "reason",
    "readjust.jobstate": "legacy_state",
    "readjust.state": "migration_decision",
  };
  const sourceMappingPassed =
    tableDomain?.sourceTables?.includes("readjust") &&
    tableDomain?.targetTables?.includes(EXPECTED.targetTable) &&
    fieldDomain?.route === EXPECTED.mappedRoute &&
    fieldDomain?.tables?.includes("readjust") &&
    same(fieldDomain?.columnMappings, expectedColumns) &&
    fieldDomain?.targetEvidence?.some(
      (item) => item.file === EXPECTED_PATHS.targetEntity && item.symbol === "HrEmploymentEventEntity",
    ) &&
    fieldDomain?.targetEvidence?.some(
      (item) => item.file === EXPECTED_PATHS.targetCompatibilityMigration && item.symbol === "legacy_event_no",
    );

  const transformPassed =
    /const sourceTable = "dbo\.readjust"/u.test(sources.sourceTransform) &&
    /sourceIdentitySha256:\s*sha256/u.test(sources.sourceTransform) &&
    /sourceRowSha256:\s*sha256/u.test(sources.sourceTransform) &&
    /employment-events\.jsonl/u.test(sources.sourceTransform) &&
    /mode:\s*0o600/u.test(sources.sourceTransform);
  const loaderPassed =
    /INSERT INTO hr_employment_event/u.test(sources.targetLoader) &&
    /'dbo\.readjust'/u.test(sources.targetLoader) &&
    /'hr_employment_event'/u.test(sources.targetLoader) &&
    /legacy_record_map/u.test(sources.targetLoader) &&
    /T1_EVENT_ACCOUNTING/u.test(sources.targetLoader) &&
    /T1_EMPLOYEE_STATE_UNCHANGED/u.test(sources.targetLoader) &&
    /ALLOW_YUZHOU_MIGRATION/u.test(sources.targetLoader);
  const schemaPassed =
    /CREATE TABLE IF NOT EXISTS hr_employment_event/u.test(sources.targetFoundationMigration) &&
    /employee_id uuid NOT NULL REFERENCES hr_employee\(id\)/u.test(sources.targetFoundationMigration) &&
    /before_snapshot jsonb NOT NULL/u.test(sources.targetFoundationMigration) &&
    /ADD COLUMN IF NOT EXISTS legacy_event_no/u.test(sources.targetCompatibilityMigration) &&
    /ck_hr_employment_event_legacy_identity/u.test(sources.targetCompatibilityMigration) &&
    /uq_hr_employment_event_legacy_no/u.test(sources.targetCompatibilityMigration) &&
    /ADD COLUMN IF NOT EXISTS event_no/u.test(sources.targetEventNumberMigration) &&
    /hr_assign_employment_event_no/u.test(sources.targetEventNumberMigration) &&
    /uq_hr_employment_event_no/u.test(sources.targetEventNumberMigration);
  const entityPassed =
    /@Entity\("hr_employment_event"\)/u.test(sources.targetEntity) &&
    /class HrEmploymentEventEntity/u.test(sources.targetEntity) &&
    /legacyEventNo/u.test(sources.targetEntity) &&
    /migrationDecision/u.test(sources.targetEntity) &&
    /isHistoricalImport/u.test(sources.targetEntity) &&
    /beforeSnapshot/u.test(sources.targetEntity) &&
    /afterSnapshot/u.test(sources.targetEntity);
  const controllerPassed =
    /@Get\("employees\/:id\/events"\)[\s\S]{0,180}@RequirePermissions\(HR_PERMISSIONS\.HR_EMPLOYMENT_EVENT_READ\)[\s\S]{0,260}service\.employeeEvents/u.test(sources.apiController) &&
    /@Get\("employment-events\/statistics"\)[\s\S]{0,180}@RequirePermissions\(HR_PERMISSIONS\.HR_EMPLOYMENT_EVENT_READ\)[\s\S]{0,300}service\.employmentEventStatistics/u.test(sources.apiController) &&
    /@Post\("employees\/:id\/transitions"\)[\s\S]{0,160}IdempotencyInterceptor[\s\S]{0,180}HR_EMPLOYMENT_TRANSITION[\s\S]{0,360}captureBody:false/u.test(sources.apiController);
  const servicePassed =
    /async employeeEvents\(scope:TenantParkScope,actor:JwtPrincipal,id:string\)/u.test(sources.apiService) &&
    /isHistoricalImport:true,migrationDecision:"accepted"/u.test(sources.apiService) &&
    /async employmentEventStatistics/u.test(sources.apiService) &&
    /FROM hr_employment_event/u.test(sources.apiService) &&
    /tenant_id=\$1 AND park_id=\$2/u.test(sources.apiService) &&
    /async transitionEmployment/u.test(sources.apiService) &&
    /lock:\{mode:"pessimistic_write"\}/u.test(sources.apiService) &&
    /eventRepo\.save/u.test(sources.apiService);
  const frontendRoutesPassed =
    /import \{ HrLifecycleClient \}/u.test(sources.lifecycleRoute) &&
    /<HrLifecycleClient\s*\/>/u.test(sources.lifecycleRoute) &&
    /import \{ HrEmployeesClient \}/u.test(sources.employeeRoute) &&
    /<HrEmployeesClient\s*\/>/u.test(sources.employeeRoute);
  const frontendSurfacePassed =
    /HR_EMPLOYMENT_EVENT_READ/u.test(sources.lifecycleClient) &&
    /hrApi\.employmentEventStatistics/u.test(sources.lifecycleClient) &&
    /人事异动统计/u.test(sources.lifecycleClient) &&
    /HR_EMPLOYMENT_EVENT_READ/u.test(sources.employeeClient) &&
    /hrApi\.events/u.test(sources.employeeClient) &&
    /hrApi\.transition/u.test(sources.employeeClient) &&
    /任职历史/u.test(sources.employeeClient) &&
    /确认办理并留痕/u.test(sources.employeeClient) &&
    /HR_EMPLOYMENT_EVENT_READ:\s*"hr:employment_event:read"/u.test(sources.hrPermissions) &&
    /HR_EMPLOYMENT_TRANSITION:\s*"hr:employment:transition"/u.test(sources.hrPermissions);

  const projectedDetail =
    /interface HrEmploymentEventResponseDto[\s\S]{0,300}id:string;[\s\S]{0,300}eventNo:string\|null;[\s\S]{0,300}eventType:string;[\s\S]{0,300}effectiveDate:string;[\s\S]{0,300}reason:string\|null;[\s\S]{0,300}createTime:string;/u.test(sources.apiDto) &&
    /projectHrEmploymentEvent/u.test(sources.apiService) &&
    /select:\{id:true,eventNo:true,eventType:true,effectiveDate:true,reason:true,createTime:true\}/u.test(sources.apiService) &&
    /employeeEvents[\s\S]{0,1600}\.map\(projectHrEmploymentEvent\)/u.test(sources.apiService) &&
    /response is an explicit allowlist/u.test(sources.apiReadSpec) &&
    /beforeSnapshot[\s\S]{0,800}source_ref[\s\S]{0,120}source_hash/u.test(sources.apiReadSpec);
  const auditedDetail =
    /events\([\s\S]{0,260}@CurrentUser\(\)u:JwtPrincipal[\s\S]{0,260}service\.employeeEvents\(s,u,id\)/u.test(sources.apiController) &&
    /async employeeEvents\(scope:TenantParkScope,actor:JwtPrincipal,id:string\)[\s\S]{0,2200}recordHrSensitiveRead/u.test(sources.apiService) &&
    /authorized empty event reads are audited/u.test(sources.apiReadSpec) &&
    /required audit unavailable/u.test(sources.apiReadSpec);

  const layers = [
    layer("source_manifest", sourceManifestPassed, { manifestSha256: digest(sources.sourceManifest), tableLedger: tableLedger?.stableId ?? null, reviewedLedger: reviewedLedger?.stableId ?? null }, "EMPLOYMENT_EVENT_SOURCE_MANIFEST_BINDING_MISSING"),
    layer("source_mapping", sourceMappingPassed, { tableMapSha256: digest(sources.sourceTableMap), reviewedMappingSha256: digest(sources.sourceReviewedMapping), sourceTable: EXPECTED.sourceTable, targetTable: EXPECTED.targetTable }, "EMPLOYMENT_EVENT_SOURCE_MAPPING_MISSING"),
    layer("controlled_transform", transformPassed, { transformSha256: digest(sources.sourceTransform) }, "EMPLOYMENT_EVENT_CONTROLLED_TRANSFORM_MISSING"),
    layer("target_loader", loaderPassed, { loaderSha256: digest(sources.targetLoader) }, "EMPLOYMENT_EVENT_TARGET_LOADER_MISSING"),
    layer("target_schema", schemaPassed, { foundationSha256: digest(sources.targetFoundationMigration), compatibilitySha256: digest(sources.targetCompatibilityMigration), numberingSha256: digest(sources.targetEventNumberMigration) }, "EMPLOYMENT_EVENT_TARGET_SCHEMA_MISSING"),
    layer("target_entity", entityPassed, { entitySha256: digest(sources.targetEntity) }, "EMPLOYMENT_EVENT_TARGET_ENTITY_MISSING"),
    layer("api_controller", controllerPassed, { controllerSha256: digest(sources.apiController) }, "EMPLOYMENT_EVENT_API_CONTROLLER_MISSING"),
    layer("api_service", servicePassed, { serviceSha256: digest(sources.apiService) }, "EMPLOYMENT_EVENT_API_SERVICE_MISSING"),
    layer("frontend_routes", frontendRoutesPassed, { lifecycleRouteSha256: digest(sources.lifecycleRoute), employeeRouteSha256: digest(sources.employeeRoute) }, "EMPLOYMENT_EVENT_FRONTEND_ROUTE_MISSING"),
    layer("frontend_read_write_surface", frontendSurfacePassed, { lifecycleClientSha256: digest(sources.lifecycleClient), employeeClientSha256: digest(sources.employeeClient), permissionSha256: digest(sources.hrPermissions) }, "EMPLOYMENT_EVENT_FRONTEND_SURFACE_MISSING"),
    layer("detail_response_projection", projectedDetail, { dtoSha256: digest(sources.apiDto), serviceSha256: digest(sources.apiService), specSha256: digest(sources.apiReadSpec), expectedProjection: "explicit_allowlist" }, "EMPLOYMENT_EVENT_DETAIL_RESPONSE_PROJECTION_MISSING"),
    layer("detail_required_audit", auditedDetail, { controllerSha256: digest(sources.apiController), serviceSha256: digest(sources.apiService), specSha256: digest(sources.apiReadSpec), expectedAudit: "required_before_response" }, "EMPLOYMENT_EVENT_DETAIL_REQUIRED_AUDIT_MISSING"),
  ];
  return { layers, gapCodes: layers.filter((item) => item.status === "gap").map((item) => item.gapCode) };
}

function materialize(contract, sources) {
  const inspection = inspectLegacyEmploymentEventCrossLayer({ contract, sources });
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_employment_event_cross_layer_receipt",
    identity: structuredClone(contract.identity),
    sourceBindingSetSha256: digest(canonical(contract.sourceBindings)),
    staticEvidence: {
      status: inspection.gapCodes.length ? "gaps_present" : "complete_review_pending",
      layers: inspection.layers,
      gapCodes: inspection.gapCodes,
      expectedGapCodesMatched: same(inspection.gapCodes, contract.expectedStaticGapCodes),
      compatibilityCredit: 0,
    },
    freezeEvidence: {
      milestone: "M4",
      status: "pending",
      reasonCode: "M4_CURRENT_HASH_BOUND_RUNTIME_EVIDENCE_REQUIRED",
      compatibilityCredit: 0,
    },
    runtimeEvidence: contract.runtimeSurfaces.map((surface) => ({
      surface,
      status: "pending",
      evidenceSha256: null,
      compatibilityCredit: 0,
    })),
    nextImplementationSlices: structuredClone(contract.nextImplementationSlices),
    status: inspection.gapCodes.length
      ? "STATIC_CROSS_LAYER_GAPS_PRESENT_RUNTIME_PENDING"
      : "STATIC_CHAIN_COMPLETE_RUNTIME_PENDING",
    sourceRowsIncluded: false,
    personDataIncluded: false,
    credentialsIncluded: false,
    pageBodyIncluded: false,
    screenshotBinaryIncluded: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildLegacyEmploymentEventCrossLayer({ contract, repositoryRoot }) {
  return materialize(contract, readSources(repositoryRoot, contract));
}

export function verifyLegacyEmploymentEventCrossLayer({ contract, repositoryRoot, receipt }) {
  const expected = buildLegacyEmploymentEventCrossLayer({ contract, repositoryRoot });
  if (!same(receipt, expected)) {
    fail("LEGACY_EMPLOYMENT_EVENT_RECEIPT_DRIFT", "receipt");
  }
  return {
    status: "PASS",
    staticStatus: receipt.staticEvidence.status,
    staticGapCount: receipt.staticEvidence.gapCodes.length,
    runtimePendingCount: receipt.runtimeEvidence.filter((item) => item.status === "pending").length,
    freezeStatus: receipt.freezeEvidence.status,
    compatibilityCredit: 0,
    productionImport: "HOLD",
    receiptSha256: receipt.receiptSha256,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(
    readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-employment-event-cross-layer-v1.json"), "utf8"),
  );
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract, repositoryRoot });
  process.stdout.write(`${JSON.stringify(verifyLegacyEmploymentEventCrossLayer({ contract, repositoryRoot, receipt }))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
