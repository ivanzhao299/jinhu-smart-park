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

test("bs_ass_compute and u_printassessment receive exact semantic parity credit after API and Web integration", () => {
  assert.deepEqual(
    verifyLegacyPerformanceCalculationPrintParity({ contract, repositoryRoot: root }),
    {
      ok: true,
      status: "COMPLETE",
      sourceRoutines: 2,
      verifiedRoutines: 2,
      pendingRoutines: 0,
      verifiedRoutineIds: ["RULE-0C991427090A219D", "RULE-0F16F0ADB333445C"],
      pendingRoutineIds: [],
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

test("evidence drift and incomplete bs_ass_compute review fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.evidenceBindings.legacyService.sha256 = "f".repeat(64);
  assert.throws(
    () => verifyLegacyPerformanceCalculationPrintParity({ contract: drifted, repositoryRoot: root }),
    error => error instanceof LegacyPerformanceRoutineParityError
      && error.code === "PERFORMANCE_ROUTINE_EVIDENCE_DRIFT",
  );

  const incomplete = structuredClone(contract);
  incomplete.routines[0].review = { status: "pending", evidenceSha256: null };
  assert.throws(
    () => verifyLegacyPerformanceCalculationPrintParity({ contract: incomplete, repositoryRoot: root }),
    error => error?.code === "VERIFIED_ROUTINE_EVIDENCE_INCOMPLETE",
  );
});

test("contract and executable fixture contain no source rows or sensitive payload keys", () => {
  const serialized = JSON.stringify(contract);
  assert.equal(contract.productionImport, "HOLD");
  assert.doesNotMatch(serialized, /"(?:password|credential|token|idcard|salary|payroll|photo|attachment|binary|base64)"\s*:/iu);
});

console.log("Yuzhou performance calculation/print routine parity contract passed.");
