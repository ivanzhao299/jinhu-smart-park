import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

import {
  computeRoutineLedgerSha256,
  evaluateLegacyRoutineParityContract,
} from "./legacy-routine-parity-contract.mjs";

export class LegacyPerformanceRoutineParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceRoutineParityError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyPerformanceRoutineParityError(code, detail);
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sha256 = value => createHash("sha256").update(value).digest("hex");

function repositoryFile(repositoryRoot, relativePath) {
  const root = realpathSync(repositoryRoot);
  const candidate = realpathSync(resolve(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    fail("PERFORMANCE_ROUTINE_EVIDENCE_PATH_INVALID", relativePath);
  }
  return candidate;
}

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(readFileSync(repositoryFile(repositoryRoot, relativePath), "utf8"));
}

function verifyEvidenceBindings(contract, repositoryRoot) {
  for (const [name, binding] of Object.entries(contract.evidenceBindings ?? {})) {
    if (typeof binding?.path !== "string" || !/^[0-9a-f]{64}$/u.test(binding.sha256 ?? "")) {
      fail("PERFORMANCE_ROUTINE_EVIDENCE_BINDING_INVALID", name);
    }
    const actual = sha256(readFileSync(repositoryFile(repositoryRoot, binding.path)));
    if (actual !== binding.sha256) fail("PERFORMANCE_ROUTINE_EVIDENCE_DRIFT", name);
  }
}

function reviewedSourceLedger(contract, sourceLedger) {
  const expectedIds = ["RULE-0C991427090A219D", "RULE-0F16F0ADB333445C"];
  const selected = expectedIds.map(id => sourceLedger.routines.find(row => row.routineId === id));
  if (selected.some(row => !row)) fail("PERFORMANCE_ROUTINE_SOURCE_MISSING", expectedIds.join(","));
  const [compute, print] = selected;
  const backupPrint = sourceLedger.routines.find(row => row.routineId === "RULE-6FDC0BE94D1719EA");

  if (
    compute.sourceName !== "bs_ass_compute"
    || compute.sourceArtifactSha256 !== "33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414"
    || compute.dynamicMutationStatus !== "none"
    || !same(compute.readTables, ["assessmentcode", "assessmentdetail", "assessmentmaster", "assgradecode", "person"])
    || !same(compute.writeTables, ["assessmentmaster"])
    || !same(compute.statementProfile, { select: 6, insert: 0, update: 3, delete: 0, merge: 0, alter: 0 })
  ) fail("PERFORMANCE_ROUTINE_SOURCE_PROFILE_DRIFT", "bs_ass_compute");

  if (
    print.sourceName !== "u_printassessment"
    || print.sourceArtifactSha256 !== "9d1339aed7a32e8cd6ad139c33706a03fcc675f28c681595cafbeb8cde214986"
    || print.dynamicMutationStatus !== "unknown_requires_review"
    || !same(print.readTables, ["assgradecode", "assitem", "assitemgradedes"])
    || print.writeTables.length !== 0
    || print.dynamicWriteTables.length !== 0
    || !same(print.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
    || !print.logicSignals.includes("dynamic_sql")
    || !print.logicSignals.includes("cursor")
  ) fail("PERFORMANCE_ROUTINE_SOURCE_PROFILE_DRIFT", "u_printassessment");
  if (
    !backupPrint
    || backupPrint.sourceName !== "u_printassessment_bak2"
    || backupPrint.sourceArtifactSha256 !== "ef2e114f5b231e02f3fdfedfb7eb5259af785c8b7469e298b13fe83dac786084"
    || !backupPrint.readTables.includes("assitemgroup")
    || backupPrint.writeTables.length !== 0
  ) fail("PERFORMANCE_ROUTINE_SOURCE_PROFILE_DRIFT", "u_printassessment_bak2");

  const adjudication = contract.sourceReview?.adjudications?.[0];
  if (
    contract.sourceReview?.adjudications?.length !== 1
    || adjudication.routineId !== print.routineId
    || adjudication.sourceArtifactSha256 !== print.sourceArtifactSha256
    || adjudication.fromDynamicMutationStatus !== print.dynamicMutationStatus
    || adjudication.toDynamicMutationStatus !== "none"
    || adjudication.reviewedBusinessCapability !== "read_only_dynamic_projection"
  ) fail("PERFORMANCE_ROUTINE_SOURCE_REVIEW_INVALID", "u_printassessment");
  const historicalVariant = contract.routines?.[1]?.historicalVariants?.[0];
  if (
    contract.routines?.[1]?.historicalVariants?.length !== 1
    || historicalVariant.routineId !== backupPrint.routineId
    || historicalVariant.sourceArtifactSha256 !== backupPrint.sourceArtifactSha256
    || historicalVariant.reviewStatus !== "reviewed_not_equivalent"
    || historicalVariant.compatibilityCredit !== 0
  ) fail("PERFORMANCE_ROUTINE_BACKUP_VARIANT_REVIEW_INVALID", "u_printassessment_bak2");

  return {
    routines: [
      { ...compute, sourceSurface: "yuzhou_v10_client_database" },
      {
        ...print,
        sourceSurface: "yuzhou_v10_client_database",
        dynamicMutationStatus: adjudication.toDynamicMutationStatus,
        businessCapability: adjudication.reviewedBusinessCapability,
        classificationEvidence: "source-routine-semantic-review",
      },
    ],
  };
}

function requireTokens(repositoryRoot, relativePath, tokens) {
  const source = readFileSync(repositoryFile(repositoryRoot, relativePath), "utf8");
  for (const token of tokens) {
    if (!source.includes(token)) fail("PERFORMANCE_ROUTINE_IMPLEMENTATION_EVIDENCE_MISSING", `${relativePath}:${token}`);
  }
}

export function verifyLegacyPerformanceCalculationPrintParity({ contract, repositoryRoot }) {
  if (
    contract?.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "performance-calculation-print-1.0.0"
    || contract.productionImport !== "HOLD"
  ) fail("PERFORMANCE_ROUTINE_CONTRACT_IDENTITY_INVALID", "root");

  const ledgerPath = contract.sourceReview?.routineLedgerPath;
  const sourceLedger = readJson(repositoryRoot, ledgerPath);
  const ledgerFileHash = sha256(readFileSync(repositoryFile(repositoryRoot, ledgerPath)));
  if (ledgerFileHash !== contract.sourceReview.routineLedgerFileSha256) {
    fail("PERFORMANCE_ROUTINE_SOURCE_LEDGER_DRIFT", "file hash");
  }
  verifyEvidenceBindings(contract, repositoryRoot);
  const reviewedLedger = reviewedSourceLedger(contract, sourceLedger);
  if (computeRoutineLedgerSha256(reviewedLedger) !== contract.sourceBinding.routineLedgerSha256) {
    fail("PERFORMANCE_ROUTINE_SOURCE_BINDING_DRIFT", "reviewed subset");
  }

  const ids = contract.routines.map(row => row.routineId);
  if (!same(ids, ["RULE-0C991427090A219D", "RULE-0F16F0ADB333445C"])) {
    fail("PERFORMANCE_ROUTINE_SCOPE_INVALID", ids.join(","));
  }
  if (ids.includes("RULE-6FDC0BE94D1719EA")) {
    fail("PERFORMANCE_ROUTINE_BACKUP_VARIANT_PROMOTED", "u_printassessment_bak2");
  }

  requireTokens(repositoryRoot, "database/migrations/000302_hr_performance_yuzhou_legacy_master.sql", [
    "sum(COALESCE(result.source_self_value,0))",
    "sum(COALESCE(result.source_m_item_value,0))::numeric(18,0)",
    "COALESCE(master.source_timekeep_value,0)",
    "round(\n    subtotal.value",
  ]);
  requireTokens(repositoryRoot, "database/migrations/000304_hr_performance_yuzhou_legacy_master_parity.sql", [
    "level.source_min_value<=master.replayed_total",
    "AMBIGUOUS_TOP_THRESHOLD",
    "NO_ELIGIBLE_GRADE",
    "REVOKE ALL ON FUNCTION hr_performance_yuzhou_legacy_grade_parity(uuid) FROM PUBLIC",
  ]);
  requireTokens(repositoryRoot, "apps/api/src/modules/hr/hr-performance-legacy.service.ts", [
    "async masters(",
    "WITH page_fact AS (",
    "hr_performance_yuzhou_legacy_grade_parity(fact.id)",
    "parity.calculated_total::text \"calculatedTotal\"",
    "parity.expected_ass_grade \"expectedAssGrade\"",
    "parity.parity_status \"parityStatus\"",
    "HR_PAYROLL_HISTORY_SELF_READ",
    "读取玉舟历史绩效汇总",
    "async rubric(",
    "fact.source_assessment_id=$3",
    "fact.source_item_id=ANY($3::int[])",
    "Legacy performance rubric has multiple active source batches",
    "Legacy performance rubric has duplicate item-grade descriptions",
    "batch.execution_context='production_import'",
  ]);
  requireTokens(repositoryRoot, "apps/api/src/modules/hr/hr-performance-legacy.controller.ts", [
    "@Get(\"masters\")",
    "HR_PERMISSIONS.HR_PERFORMANCE_READ",
    "HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ",
    "HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ",
    "@Get(\"rubric\")",
    "HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ",
  ]);
  requireTokens(repositoryRoot, "apps/api/src/modules/hr/hr-performance-legacy.contract.spec.ts", [
    "legacy masters expose all 21 source fields, parity, paging-first SQL, and field-level pay control",
    "resultVisibilityOnly.service.masters(",
    "legacy master pay visibility never widens team scope with self-only payroll permission",
    "legacy master self scope is exact and self payroll permission reveals pay only to self",
    "service.masters(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), page)",
    "legacy rubric reproduces u_printassessment item-by-grade projection without dynamic SQL",
    "legacy rubric preserves items when source level definitions are absent",
    "legacy rubric returns an empty projection when all three source relations are empty",
    "legacy rubric fails closed for mixed batches or duplicate item-grade descriptions",
  ]);
  requireTokens(repositoryRoot, "scripts/e2e/yuzhou-performance-legacy-master-model-direct-pg.mjs", [
    "TOTAL_UNAVAILABLE",
    "NO_ELIGIBLE_GRADE",
    "positive_rounding_total<>2.00",
    "negative_rounding_total<>-2.00",
    "null weight fixture drifted",
    "null adjustment fixture drifted",
  ]);
  requireTokens(repositoryRoot, "apps/web/app/hr/performance/HrPerformanceLegacyPanel.tsx", [
    "汇总与总分",
    "兼容计算总分",
    "兼容计算等级",
    "复算一致性",
    "旧过程 u_printassessment",
    "旧版动态评分表",
    "ds-table-shell",
    "ds-mobile-record-list",
  ]);

  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: reviewedLedger });
  if (
    report.status !== "IN_PROGRESS"
    || report.summary.sourceRoutines !== 2
    || report.summary.verifiedRoutines !== 1
    || !report.pendingRoutineKeys.includes("yuzhou_v10_client_database:RULE-0C991427090A219D")
  ) fail("PERFORMANCE_ROUTINE_COMPLETION_CREDIT_INVALID", JSON.stringify(report.summary));
  if (
    contract.nonClaims?.bsAssComputeApiIntegrated !== "VERIFIED_BUT_SOURCE_SIDE_EFFECT_PARITY_PENDING"
    || contract.nonClaims?.bsAssComputeSqlServerOracle !== "PENDING"
    || contract.nonClaims?.backupVariantUPrintassessmentBak2Equivalent !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImport !== "NOT_AUTHORIZED_BY_THIS_CONTRACT"
  ) fail("PERFORMANCE_ROUTINE_NON_CLAIM_INVALID", "root");

  return {
    ok: true,
    status: report.status,
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
  };
}
