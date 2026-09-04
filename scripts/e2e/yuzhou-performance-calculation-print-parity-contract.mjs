#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceRoutineParityError,
  verifyLegacyPerformanceCalculationPrintParity,
} from "../hr-cutover/legacy-performance-calculation-print-parity.mjs";

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(
  resolve(root, "scripts/hr-cutover/contracts/legacy-performance-calculation-print-parity-v1.json"),
  "utf8",
));

test("u_printassessment receives parity credit while bs_ass_compute keeps observable source side effects pending", () => {
  assert.deepEqual(
    verifyLegacyPerformanceCalculationPrintParity({ contract, repositoryRoot: root }),
    {
      ok: true,
      status: "IN_PROGRESS",
      sourceRoutines: 2,
      verifiedRoutines: 1,
      pendingRoutines: 1,
      verifiedRoutineIds: ["RULE-0F16F0ADB333445C"],
      pendingRoutineIds: ["RULE-0C991427090A219D"],
      reviewedReadOnlyDynamicSql: ["RULE-0F16F0ADB333445C"],
      excludedHistoricalVariants: ["RULE-6FDC0BE94D1719EA"],
      containsSourceRows: false,
      containsPersonalData: false,
      productionImport: "HOLD",
    },
  );
});

test("u_printassessment source review proves dynamic output projection without dynamic mutation", () => {
  const review = contract.sourceReview.adjudications[0];
  assert.deepEqual(
    {
      routineId: review.routineId,
      from: review.fromDynamicMutationStatus,
      to: review.toDynamicMutationStatus,
      capability: review.reviewedBusinessCapability,
    },
    {
      routineId: "RULE-0F16F0ADB333445C",
      from: "unknown_requires_review",
      to: "none",
      capability: "read_only_dynamic_projection",
    },
  );
  assert.match(review.reason, /one SELECT/u);
  assert.match(review.reason, /zero INSERT\/UPDATE\/DELETE\/MERGE\/ALTER/u);
});

test("the backup print variant cannot inherit current-routine completion credit", () => {
  assert.equal(contract.routines.some(row => row.routineId === "RULE-6FDC0BE94D1719EA"), false);
  assert.equal(contract.nonClaims.backupVariantUPrintassessmentBak2Equivalent, "NOT_CLAIMED");
});

test("compute branch evidence does not claim a SQL Server oracle or full routine parity", () => {
  const compute = contract.routines.find(row => row.routineId === "RULE-0C991427090A219D");
  const evidenceIds = Object.values(compute.testEvidence).flat().map(row => row.testId);
  assert.equal(compute.parityStatus, "pending");
  assert.equal(contract.nonClaims.bsAssComputeApiIntegrated, "VERIFIED_BUT_SOURCE_SIDE_EFFECT_PARITY_PENDING");
  assert.equal(contract.nonClaims.bsAssComputeSqlServerOracle, "PENDING");
  assert.ok(evidenceIds.includes("bs-ass-compute-total-unavailable-without-detail"));
  assert.ok(evidenceIds.includes("bs-ass-compute-no-eligible-grade"));
  assert.ok(evidenceIds.includes("bs-ass-compute-null-default-positive-negative-half-rounding"));
  assert.ok(evidenceIds.includes("bs-ass-compute-master-result-read-scope-pay-and-audit-matrix"));
});

test("ordinary CI runs the fast contract and release smoke owns direct PostgreSQL branches", () => {
  const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(
    workflow,
    /Verify Yuzhou performance routine parity contract[\s\S]*pnpm test:e2e:yuzhou-performance-calculation-print-parity/u,
  );
  assert.match(
    workflow,
    /Verify Yuzhou performance calculation PostgreSQL branches[\s\S]*YUZHOU_PERFORMANCE_PG_CONTAINER[\s\S]*pnpm test:e2e:yuzhou-performance-legacy-master-model:pg/u,
  );
  assert.match(
    workflow,
    /scripts\/e2e\/yuzhou-performance-legacy-master-model-direct-pg\\\.mjs\$/u,
  );
});

test("evidence drift and premature bs_ass_compute promotion fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.evidenceBindings.legacyService.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyPerformanceCalculationPrintParity({ contract: drifted, repositoryRoot: root }),
    error => error instanceof LegacyPerformanceRoutineParityError
      && error.code === "PERFORMANCE_ROUTINE_EVIDENCE_DRIFT",
  );

  const promoted = structuredClone(contract);
  promoted.routines[0].parityStatus = "verified";
  assert.throws(
    () => verifyLegacyPerformanceCalculationPrintParity({ contract: promoted, repositoryRoot: root }),
    error => error?.code === "VERIFIED_ROUTINE_EVIDENCE_INCOMPLETE",
  );
});

test("contract and executable fixture contain no source rows or sensitive payload keys", () => {
  const serialized = JSON.stringify(contract);
  assert.equal(contract.productionImport, "HOLD");
  assert.doesNotMatch(serialized, /"(?:password|credential|token|idcard|salary|payroll|photo|attachment|binary|base64)"\s*:/iu);
});

console.log("Yuzhou performance calculation/print routine parity contract passed.");
