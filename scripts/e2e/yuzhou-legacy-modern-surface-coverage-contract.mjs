#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildLegacyModernSurfaceCoverageSummary,
  LegacyModernSurfaceCoverageError,
} from "../hr-cutover/legacy-modern-surface-coverage.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const input = {
  source: { tables: 162, columns: 2364, procedures: 194, functions: 16, triggers: 2, rules: 212, pages: 46 },
  core: {
    selectedTables: 12, fields: 260, mappedFields: 38, rawArchivedFields: 220,
    securityExcludedFields: 2, uncoveredFields: 0, rules: 7, mappedOrTestedRules: 7, gapRules: 0,
  },
  surface: { detailOnlyFullProjection: true, dynamicFrontendProjection: true, sourceFieldProjection: true },
};

test("coverage summary keeps precise mapping, archive visibility, and unknown remainder separate", () => {
  const report = buildLegacyModernSurfaceCoverageSummary(input);
  assert.equal(report.status, "IN_PROGRESS");
  assert.deepEqual(report.remainingAtomicReview, { tables: 150, fields: 2104, rules: 205, authorizationRows: 915 });
  assert.equal(report.reviewedCore.preciseMappedFields, 38);
  assert.equal(report.reviewedCore.archiveOnlyFields, 220);
  assert.equal(report.productSurface.archiveListProjection, "summary_only");
  assert.equal(report.productSurface.archiveDetailProjection, "full_authorized_dynamic_fields");
  assert.deepEqual(report.reasonCodes, [
    "LEGACY_FIELDS_OUTSIDE_REVIEWED_CORE_MAPPING",
    "LEGACY_RULES_OUTSIDE_REVIEWED_CORE_MAPPING",
    "LEGACY_AUTHORIZATION_ROWS_UNMAPPED",
    "LEGACY_RUNTIME_AND_BUSINESS_SIGNOFF_INCOMPLETE",
  ]);
});

test("coverage fails closed if storage, API, or frontend field visibility is absent", () => {
  for (const key of Object.keys(input.surface)) {
    assert.throws(
      () => buildLegacyModernSurfaceCoverageSummary({ ...input, surface: { ...input.surface, [key]: false } }),
      error => error instanceof LegacyModernSurfaceCoverageError && error.code === "ARCHIVE_FULL_FIELD_SURFACE_INCOMPLETE",
    );
  }
});

test("wide archived rows are detail-only and decomposed in the frontend", () => {
  const migration = read("database/migrations/000290_hr_legacy_archive_full_field_projection.sql");
  const service = read("apps/api/src/modules/hr/hr-legacy-archive.service.ts");
  const frontend = read("apps/web/app/hr/employees/legacy/LegacyArchivePageClient.tsx");
  assert.match(migration, /record_payload[\s\S]*legacyFields/u);
  assert.match(migration, /lower\(item\.key\) NOT IN\('password','passwd','pwd','photo','cont','content','blob','binary'\)/u);
  assert.match(service, /hr_legacy_archive_redact_source_fields\(source\.record_payload\)/u);
  assert.match(service, /includeRestricted:true/u);
  assert.match(service, /includeRestricted:false/u);
  assert.match(frontend, /projectionEntries\(selected\.projection\)/u);
  assert.match(frontend, /Object\.entries\(value as Record<string,unknown>\)/u);
});

console.log("Yuzhou legacy modern surface coverage contract passed.");
