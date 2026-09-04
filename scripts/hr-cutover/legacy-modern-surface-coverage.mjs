import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";
import { verifyLegacyCoreDomainMapping } from "./legacy-core-domain-mapping-lib.mjs";

export class LegacyModernSurfaceCoverageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyModernSurfaceCoverageError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyModernSurfaceCoverageError(code, detail); };
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function readRepositoryFile(root, path) {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${resolve(root)}/`)) fail("TARGET_EVIDENCE_PATH_INVALID", path);
  return readFileSync(absolute, "utf8");
}

export function summarizeLegacyModernSurfaceCoverage({ inventory, mapping, root = ROOT }) {
  const inventoryReport = validateLegacyAtomicInventory(inventory);
  const core = verifyLegacyCoreDomainMapping(inventory, mapping, { root });
  const archiveService = readRepositoryFile(root, "apps/api/src/modules/hr/hr-legacy-archive.service.ts");
  const archiveFrontend = readRepositoryFile(root, "apps/web/app/hr/employees/legacy/LegacyArchivePageClient.tsx");
  const fullFieldMigration = readRepositoryFile(root, "database/migrations/000290_hr_legacy_archive_full_field_projection.sql");

  const detailOnlyFullProjection = archiveService.includes("includeRestricted:true")
    && archiveService.includes("includeRestricted:false")
    && archiveService.includes("restrictedSafeProjection");
  const dynamicFrontendProjection = archiveFrontend.includes("Object.entries(selected.projection)");
  const sourceFieldProjection = fullFieldMigration.includes("hr_legacy_archive_source_field_projection")
    && fullFieldMigration.includes("record_payload")
    && fullFieldMigration.includes("legacyFields");
  return buildLegacyModernSurfaceCoverageSummary({
    source: inventoryReport.summary,
    core,
    surface: { detailOnlyFullProjection, dynamicFrontendProjection, sourceFieldProjection },
  });
}

export function buildLegacyModernSurfaceCoverageSummary({ source, core, surface }) {
  const { detailOnlyFullProjection, dynamicFrontendProjection, sourceFieldProjection } = surface;
  if (!detailOnlyFullProjection || !dynamicFrontendProjection || !sourceFieldProjection) {
    fail("ARCHIVE_FULL_FIELD_SURFACE_INCOMPLETE", JSON.stringify({ detailOnlyFullProjection, dynamicFrontendProjection, sourceFieldProjection }));
  }

  const reviewedTables = core.selectedTables;
  const reviewedFields = core.fields;
  const unreviewedTables = source.tables - reviewedTables;
  const unreviewedFields = source.columns - reviewedFields;
  const unreviewedRules = source.rules - core.rules;
  if ([unreviewedTables, unreviewedFields, unreviewedRules].some(value => !Number.isSafeInteger(value) || value < 0)) {
    fail("COVERAGE_COUNT_INVALID", "reviewed counts exceed structural source counts");
  }

  const reasonCodes = [];
  if (unreviewedFields) reasonCodes.push("LEGACY_FIELDS_OUTSIDE_REVIEWED_CORE_MAPPING");
  if (unreviewedRules) reasonCodes.push("LEGACY_RULES_OUTSIDE_REVIEWED_CORE_MAPPING");
  reasonCodes.push("LEGACY_AUTHORIZATION_ROWS_UNMAPPED");
  reasonCodes.push("LEGACY_RUNTIME_AND_BUSINESS_SIGNOFF_INCOMPLETE");

  return {
    ok: true,
    status: reasonCodes.length ? "IN_PROGRESS" : "COMPLETE",
    source: { ...source, authorizationRows: 915 },
    reviewedCore: {
      tables: reviewedTables,
      fields: reviewedFields,
      preciseMappedFields: core.mappedFields,
      archiveOnlyFields: core.rawArchivedFields,
      securityExcludedFields: core.securityExcludedFields,
      uncoveredFields: core.uncoveredFields,
      rules: core.rules,
      mappedOrTestedRules: core.mappedOrTestedRules,
      gapRules: core.gapRules,
    },
    remainingAtomicReview: {
      tables: unreviewedTables,
      fields: unreviewedFields,
      rules: unreviewedRules,
      authorizationRows: 915,
    },
    productSurface: {
      normalizedFieldApiAndUi: core.mappedFields,
      archiveDetailFieldApiAndUi: core.rawArchivedFields,
      archiveListProjection: "summary_only",
      archiveDetailProjection: "full_authorized_dynamic_fields",
      fullFieldValuesRequireSensitivePermission: true,
      dynamicFrontendProjection,
      detailOnlyFullProjection,
      sourceFieldProjection,
    },
    reasonCodes,
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  let inventoryPath = null;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--inventory" && argv[index + 1]) inventoryPath = argv[++index];
    else if (arg === "--json") json = true;
    else fail("CLI_ARGUMENT_INVALID", String(arg));
  }
  if (!inventoryPath || !isAbsolute(inventoryPath)) fail("CLI_ARGUMENT_INVALID", "--inventory must be absolute");
  return { inventoryPath, json };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const inventory = JSON.parse(readFileSync(args.inventoryPath, "utf8"));
    const mapping = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json"), "utf8"));
    const report = summarizeLegacyModernSurfaceCoverage({ inventory, mapping });
    process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof LegacyModernSurfaceCoverageError ? error.code : "LEGACY_MODERN_SURFACE_COVERAGE_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
