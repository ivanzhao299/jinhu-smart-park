import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { validateYuzhouLiveRoleUatEvidencePair } from "./yuzhou-live-role-uat-evidence-lib.mjs";

export class LegacyGroupWebImplementationCoverageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebImplementationCoverageError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyGroupWebImplementationCoverageError(code, detail);
};

const sha64 = value => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_SHAPE_INVALID", label);
  }
};
const LEGACY_RUNTIME_ROLES = Object.freeze(["hr_manager", "department_manager", "employee_self_service"]);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const runtimeEvidenceArtifactHash = evidence => createHash("sha256").update(JSON.stringify({
  contractKind: evidence.contractKind,
  evidenceSource: evidence.evidenceSource,
  surface: evidence.surface,
  observedAt: evidence.observedAt,
  items: evidence.items
})).digest("hex");

const canonicalRoute = route => {
  if (typeof route !== "string" || !/^\/[A-Za-z0-9._~!$'()*+,;:@%/-]+$/u.test(route)) return false;
  try {
    const decoded = decodeURIComponent(route);
    return !/[?#\\\u0000-\u001f\u007f]/u.test(decoded)
      && !/(?:^|[/;])(?:password|passwd|pwd|token|secret|credential|authorization)(?:[/;:=]|$)/iu.test(decoded);
  } catch {
    return false;
  }
};

export function validateLegacyGroupWebRuntimeUatEvidence(evidence, knownLegacyIds) {
  exactKeys(evidence, ["formatVersion", "contractKind", "status", "evidenceSource", "surface", "observedAt", "artifactSha256", "items", "productionImport"], "root");
  if (evidence.formatVersion !== 1
    || evidence.contractKind !== "yuzhou_hr_legacy_runtime_uat_evidence"
    || evidence.status !== "PASS"
    || evidence.evidenceSource !== "legacy_group_web_live_read_only_traversal"
    || evidence.surface !== "group_web"
    || evidence.productionImport !== "HOLD") {
    fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_IDENTITY_INVALID", "root");
  }
  if (!sha64(evidence.artifactSha256)
    || typeof evidence.observedAt !== "string"
    || !Number.isFinite(Date.parse(evidence.observedAt))
    || new Date(evidence.observedAt).toISOString() !== evidence.observedAt
    || Date.parse(evidence.observedAt) > Date.now() + MAX_CLOCK_SKEW_MS
    || !Array.isArray(evidence.items)
    || evidence.items.length === 0
    || evidence.artifactSha256 !== runtimeEvidenceArtifactHash(evidence)) {
    fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_BINDING_INVALID", "root");
  }
  const known = new Set(knownLegacyIds);
  const eligibleLegacyIds = [];
  const seen = new Set();
  const seenObservationArtifacts = new Set();
  for (const item of evidence.items) {
    exactKeys(item, ["legacyId", "status", "observations"], `item.${item?.legacyId}`);
    if (!known.has(item.legacyId) || seen.has(item.legacyId) || item.status !== "PASS" || !Array.isArray(item.observations)) {
      fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_ITEM_INVALID", String(item.legacyId));
    }
    seen.add(item.legacyId);
    const roles = [];
    for (const observation of item.observations) {
      exactKeys(observation, ["role", "pageId", "route", "observedAt", "artifactSha256"], `observation.${item.legacyId}`);
      if (!LEGACY_RUNTIME_ROLES.includes(observation.role)
        || typeof observation.pageId !== "string"
        || !/^[a-z0-9][a-z0-9._:-]{2,127}$/u.test(observation.pageId)
        || !canonicalRoute(observation.route)
        || observation.observedAt !== evidence.observedAt
        || !sha64(observation.artifactSha256)
        || observation.artifactSha256 === evidence.artifactSha256
        || seenObservationArtifacts.has(observation.artifactSha256)) {
        fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_OBSERVATION_INVALID", `${item.legacyId}.${observation?.role}`);
      }
      seenObservationArtifacts.add(observation.artifactSha256);
      roles.push(observation.role);
    }
    if (JSON.stringify(roles) !== JSON.stringify(LEGACY_RUNTIME_ROLES)) {
      fail("GROUP_WEB_LEGACY_RUNTIME_EVIDENCE_ROLE_MATRIX_INCOMPLETE", String(item.legacyId));
    }
    eligibleLegacyIds.push(item.legacyId);
  }
  return { status: "PASS", surface: evidence.surface, observedAt: evidence.observedAt, artifactSha256: evidence.artifactSha256, eligibleLegacyIds };
}

const ROUTE_EVIDENCE = Object.freeze({
  "/hr": { page: "apps/web/app/hr/page.tsx", api: [], migrations: [] },
  "/hr/approvals": { page: "apps/web/app/hr/approvals/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000234_hr_approval_workflow.sql"] },
  "/hr/attendance": { page: "apps/web/app/hr/attendance/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000245_hr_attendance_requests.sql", "database/migrations/000246_hr_attendance_calculation_core.sql"] },
  "/hr/compensation": { page: "apps/web/app/hr/compensation/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000233_hr_compensation_payroll.sql"] },
  "/hr/contracts": { page: "apps/web/app/hr/contracts/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000238_hr_contract_history.sql", "database/migrations/000244_hr_contract_online_drafts.sql", "database/migrations/000272_hr_contract_legacy_parity.sql"] },
  "/hr/employees": { page: "apps/web/app/hr/employees/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000230_hr_employee_foundation.sql"] },
  "/hr/insurance": { page: "apps/web/app/hr/insurance/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000239_hr_attendance_insurance_history.sql"] },
  "/hr/lifecycle": { page: "apps/web/app/hr/lifecycle/page.tsx", api: ["apps/api/src/modules/hr/hr-lifecycle.controller.ts"], migrations: ["database/migrations/000252_hr_lifecycle_employee_records.sql"] },
  "/hr/organization": { page: "apps/web/app/hr/organization/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000230_hr_employee_foundation.sql"] },
  "/hr/payroll": { page: "apps/web/app/hr/payroll/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts", "apps/api/src/modules/hr/hr-payroll-history.controller.ts"], migrations: ["database/migrations/000233_hr_compensation_payroll.sql", "database/migrations/000248_hr_payroll_legacy_history.sql"] },
  "/hr/performance": { page: "apps/web/app/hr/performance/page.tsx", api: ["apps/api/src/modules/hr/hr-performance-review.controller.ts"], migrations: ["database/migrations/000258_hr_performance_template_planning.sql", "database/migrations/000259_hr_performance_review_calibration.sql"] },
  "/hr/recruitment": { page: "apps/web/app/hr/recruitment/page.tsx", api: ["apps/api/src/modules/hr/hr-recruitment.controller.ts", "apps/api/src/modules/hr/hr-onboarding.controller.ts"], migrations: ["database/migrations/000251_hr_recruitment_preboarding.sql", "database/migrations/000269_hr_onboarding_application_parity.sql"] },
  "/hr/rewards": { page: "apps/web/app/hr/rewards/page.tsx", api: ["apps/api/src/modules/hr/hr-rewards.controller.ts"], migrations: ["database/migrations/000255_hr_reward_discipline_operations.sql"] },
  "/hr/talent": { page: "apps/web/app/hr/talent/page.tsx", api: ["apps/api/src/modules/hr/hr-talent.controller.ts"], migrations: ["database/migrations/000261_hr_talent_management.sql"] },
  "/hr/training": { page: "apps/web/app/hr/training/page.tsx", api: ["apps/api/src/modules/hr/hr-training.controller.ts"], migrations: ["database/migrations/000254_hr_training_operations.sql"] },
  "/hr/work-reports": { page: "apps/web/app/hr/work-reports/page.tsx", api: ["apps/api/src/modules/hr/hr-goal-report.controller.ts"], migrations: ["database/migrations/000257_hr_goal_report_execution.sql"] },
  "/system/users": { page: "apps/web/app/system/users/page.tsx", api: ["apps/api/src/modules/users/users.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql", "database/migrations/000019_rel_user_park.sql"] },
  "/system/roles": { page: "apps/web/app/system/roles/page.tsx", api: ["apps/api/src/modules/roles/roles.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql"] },
  "/system/permissions": { page: "apps/web/app/system/permissions/page.tsx", api: ["apps/api/src/modules/permissions/permissions.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql"] },
  "/system/data-scopes": { page: "apps/web/app/system/data-scopes/page.tsx", api: ["apps/api/src/modules/data-scopes/data-scopes.controller.ts"], migrations: ["database/migrations/000025_data_scope_open_contract.sql"] },
  "/system/dicts": { page: "apps/web/app/system/dicts/page.tsx", api: ["apps/api/src/modules/dicts/dicts.controller.ts"], migrations: ["database/migrations/000002_s1_system_foundation.sql"] },
  "/system/audit": { page: "apps/web/app/system/audit/page.tsx", api: ["apps/api/src/modules/audit/audit.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql"] },
  "/system/audit/login-logs": { page: "apps/web/app/system/audit/login-logs/page.tsx", api: ["apps/api/src/modules/audit/audit.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql"] },
  "/system/audit/op-logs": { page: "apps/web/app/system/audit/op-logs/page.tsx", api: ["apps/api/src/modules/audit/audit.controller.ts"], migrations: ["database/migrations/000001_init_auth.sql"] },
  "/admin": { page: null, api: [], migrations: [] },
  "/workflow": { page: null, api: [], migrations: [] }
});

const DEPARTURE_EVIDENCE_FILES = Object.freeze([
  "scripts/hr-cutover/contracts/yuzhou-departure-dual-source-evidence-v1.json",
  "database/migrations/000274_hr_departure_clearance_parity.sql",
  "database/seeds/production/000029_hr_departure_rbac.sql",
  "apps/api/src/modules/hr/dto/hr-departure.dto.ts",
  "apps/api/src/modules/hr/hr-departure.controller.ts",
  "apps/api/src/modules/hr/hr-departure.service.ts",
  "apps/api/src/modules/hr/hr-departure.contract.spec.ts",
  "apps/api/src/modules/hr/hr-departure.pg.spec.ts",
  "apps/web/app/hr/lifecycle/DepartureApplicationsPanel.tsx",
  "apps/web/app/hr/hr-departure.contract.spec.ts"
]);

const ITEM_RULE_PARITY = Object.freeze({
  42: {
    legacyFieldEvidenceHash: "ed79e32572bba6abe7775e0b116865c5cf4eac5f484e50aa0aae09d327b5401a",
    outcome: "departure_application_approval_clearance_and_atomic_effect",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  43: {
    legacyFieldEvidenceHash: "dd1f376e0b80c4bbf6cd6e7f4859daeb9d1e4a15dc88442727b8523e851942d2",
    outcome: "departure_interview_scoped_evidence",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  44: {
    legacyFieldEvidenceHash: "d3bb7e47ea11c6fd601f95974797e3335501721147670936503dd496fac55d0b",
    outcome: "departure_survey_reason_and_advice_evidence",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  45: {
    legacyFieldEvidenceHash: "10760f5cd0c22867ffd00230fdcc89a388ec7253defc2545d46ab9e1ec013a0a",
    outcome: "departure_handover_recipient_and_summary_evidence",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  46: {
    legacyFieldEvidenceHash: "9e45f584f8c71857cd0b6de7245e733f2e45185aafc1a4af2594489b328f70ee",
    outcome: "departure_wage_settlement_atomic_clearance",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  47: {
    legacyFieldEvidenceHash: "9e45f584f8c71857cd0b6de7245e733f2e45185aafc1a4af2594489b328f70ee",
    outcome: "departure_archive_close_after_all_clearances",
    evidenceFiles: DEPARTURE_EVIDENCE_FILES
  },
  37: {
    legacyFieldEvidenceHash: "71721d33d52f7fe9bd09db05c35668890825f0956d6f0927165ad2a103ef3964",
    outcome: "contract_legacy_fields_protected_documents_salary_boundary_and_append_only_actions",
    evidenceFiles: [
      "scripts/hr-cutover/contracts/yuzhou-contract-source-evidence-v1.json",
      "database/migrations/000272_hr_contract_legacy_parity.sql",
      "apps/api/src/modules/hr/dto/hr.dto.ts",
      "apps/api/src/modules/hr/hr.controller.ts",
      "apps/api/src/modules/hr/hr.service.ts",
      "apps/api/src/modules/hr/hr-contract-read.pg.spec.ts",
      "apps/api/src/modules/files/file-business-access.service.ts",
      "apps/web/app/hr/contracts/HrContractsClient.tsx"
    ]
  },
  39: {
    legacyFieldEvidenceHash: "b279850a9053621fd3ab890b5fd85092292f886f6150092ccc28ab4138b9dc06",
    outcome: "dual_source_job_change_approval_manual_apply_and_atomic_event_ledger",
    evidenceFiles: [
      "scripts/hr-cutover/contracts/yuzhou-job-change-dual-source-evidence-v1.json",
      "database/migrations/000273_hr_job_change_application_parity.sql",
      "database/seeds/production/000028_hr_job_change_rbac.sql",
      "apps/api/src/modules/hr/dto/hr-job-change.dto.ts",
      "apps/api/src/modules/hr/hr-job-change.controller.ts",
      "apps/api/src/modules/hr/hr-job-change.service.ts",
      "apps/api/src/modules/hr/hr-job-change.contract.spec.ts",
      "apps/api/src/modules/hr/hr-job-change.pg.spec.ts",
      "apps/web/app/hr/lifecycle/JobChangeApplicationsPanel.tsx"
    ]
  },
  36: {
    legacyFieldEvidenceHash: "0d2dc3193b08211f178816baf77f64f6a5bf01c5fae96a476c35e8d87736b26a",
    outcome: "probation_application_batch_approval_and_atomic_confirmation",
    evidenceFiles: [
      "scripts/hr-cutover/contracts/yuzhou-probation-confirmation-source-evidence-v1.json",
      "database/migrations/000271_hr_probation_confirmation_parity.sql",
      "apps/api/src/modules/hr/dto/hr-probation.dto.ts",
      "apps/api/src/modules/hr/hr-probation.controller.ts",
      "apps/api/src/modules/hr/hr-probation.service.ts",
      "apps/api/src/modules/hr/hr-probation.contract.spec.ts"
    ]
  },
  35: {
    legacyFieldEvidenceHash: "61b79273ffb92aa27bd4e4efc137f6c0676384d7ccee0c6362001ddd51fa1622",
    outcome: "basic_profile_fields_with_encrypted_identity_and_scoped_audit",
    evidenceFiles: [
      "scripts/hr-cutover/contracts/yuzhou-employee-basic-profile-source-evidence-v1.json",
      "database/migrations/000270_hr_employee_basic_profile_parity.sql",
      "apps/api/src/modules/hr/entities/hr.entities.ts",
      "apps/api/src/modules/hr/dto/hr.dto.ts",
      "apps/api/src/modules/hr/hr.service.ts",
      "apps/api/src/modules/hr/hr-employee-basic-profile-parity.contract.spec.ts",
      "apps/web/app/hr/employees/HrEmployeesClient.tsx"
    ]
  },
  34: {
    legacyFieldEvidenceHash: "71824793f3b8d9002aa245b98c29747082d3e0d4f2e3b4a68b2ead1c50eff3e8",
    outcome: "onboarding_application_approval_and_atomic_confirmation",
    evidenceFiles: [
      "scripts/hr-cutover/contracts/yuzhou-onboarding-source-evidence-v1.json",
      "database/migrations/000269_hr_onboarding_application_parity.sql",
      "apps/api/src/modules/hr/hr-onboarding.controller.ts",
      "apps/api/src/modules/hr/hr-onboarding.service.ts",
      "apps/api/src/modules/hr/hr-onboarding.contract.spec.ts",
      "apps/web/app/hr/recruitment/HrRecruitmentClient.tsx",
      "apps/web/app/hr/hr-recruitment.contract.spec.ts"
    ]
  },
  313: {
    legacyFieldEvidenceHash: "0128915ef043ec7f6e5efd5c9f6e4ed2d598f5fe5ab9783c4be35c024386c149",
    outcome: "work_log_create_update_query_and_audited_cancel",
    evidenceFiles: [
      "database/migrations/000268_hr_work_report_legacy_parity.sql",
      "apps/api/src/modules/hr/hr-goal-report.controller.ts",
      "apps/api/src/modules/hr/hr-goal-report.service.ts",
      "apps/api/src/modules/hr/dto/hr-goal-report.dto.ts",
      "apps/api/src/modules/hr/hr-goal-report.contract.spec.ts",
      "apps/web/app/hr/work-reports/HrWorkReportsClient.tsx",
      "apps/web/app/hr/hr-route.contract.spec.ts"
    ]
  }
});

const fileEvidence = (root, files) => files.length > 0 && files.every(file => existsSync(resolve(root, file)));

function scoreRoute(root, route) {
  const evidence = ROUTE_EVIDENCE[route];
  if (!evidence) fail("GROUP_WEB_IMPLEMENTATION_ROUTE_UNKNOWN", route);
  const dimensions = {
    ownershipMapped: true,
    productionRoute: Boolean(evidence.page && existsSync(resolve(root, evidence.page))),
    apiBusinessFlow: fileEvidence(root, evidence.api),
    persistentDataModel: fileEvidence(root, evidence.migrations),
    legacyRuleParity: false,
    targetTechnicalUat: false,
    legacyRuntimeUat: false
  };
  const score = (dimensions.ownershipMapped ? 20 : 0)
    + (dimensions.productionRoute ? 20 : 0)
    + (dimensions.apiBusinessFlow ? 20 : 0)
    + (dimensions.persistentDataModel ? 20 : 0)
    + (dimensions.legacyRuleParity ? 10 : 0)
    + (dimensions.legacyRuntimeUat ? 10 : 0);
  return { route, dimensions, score, evidence };
}

const statusFor = score => score === 100 ? "implemented" : score >= 60 ? "partial" : "mapped_only";

export function assessLegacyGroupWebImplementationCoverage(mapping, root, options = {}) {
  if (mapping?.contractKind !== "yuzhou_hr_legacy_group_web_module_mapping" || mapping?.status !== "mapped_not_implementation_complete" || !Array.isArray(mapping.items) || mapping.items.length !== 231) {
    fail("GROUP_WEB_IMPLEMENTATION_SOURCE_INVALID", "module mapping");
  }
  if (mapping.productionImport !== "HOLD") fail("GROUP_WEB_IMPLEMENTATION_IMPORT_NOT_HELD", String(mapping.productionImport));

  const sourceAudit = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json"), "utf8"));
  const sourceAuditById = new Map(sourceAudit.items.map(item => [item.legacyId, item]));
  if (options.liveRoleUatEvidencePair) {
    fail("GROUP_WEB_IMPLEMENTATION_MIXED_UAT_EVIDENCE", "liveRoleUatEvidencePair is ambiguous; use targetTechnicalUatEvidencePair or legacyRuntimeUatEvidence");
  }
  const targetTechnicalUat = options.targetTechnicalUatEvidencePair
    ? validateYuzhouLiveRoleUatEvidencePair(
      options.targetTechnicalUatEvidencePair,
      JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8")),
      options.expectedTriple ?? null,
      JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json"), "utf8")),
      JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"), "utf8"))
    )
    : null;
  const targetTechnicalUatIds = new Set(targetTechnicalUat?.eligibleLegacyIds ?? []);
  const legacyRuntimeUat = options.legacyRuntimeUatEvidence
    ? validateLegacyGroupWebRuntimeUatEvidence(options.legacyRuntimeUatEvidence, mapping.items.map(item => item.legacyId))
    : null;
  const legacyRuntimeUatIds = new Set(legacyRuntimeUat?.eligibleLegacyIds ?? []);
  const routeAssessments = new Map();
  const items = mapping.items.map(item => {
    const candidates = item.targetRoutes.map(route => {
      if (!routeAssessments.has(route)) routeAssessments.set(route, scoreRoute(root, route));
      return routeAssessments.get(route);
    });
    const best = candidates.reduce((current, candidate) => candidate.score > current.score ? candidate : current);
    const parity = ITEM_RULE_PARITY[item.legacyId];
    const parityVerified = Boolean(parity
      && sourceAuditById.get(item.legacyId)?.fieldEvidenceHash === parity.legacyFieldEvidenceHash
      && fileEvidence(root, parity.evidenceFiles));
    const dimensions = {
      ...best.dimensions,
      legacyRuleParity: parityVerified,
      targetTechnicalUat: targetTechnicalUatIds.has(item.legacyId),
      legacyRuntimeUat: legacyRuntimeUatIds.has(item.legacyId)
    };
    const score = best.score + (parityVerified ? 10 : 0) + (dimensions.legacyRuntimeUat ? 10 : 0);
    const targetImplementationScore = best.score + (parityVerified ? 10 : 0) + (dimensions.targetTechnicalUat ? 10 : 0);
    return {
      legacyId: item.legacyId,
      parentId: item.parentId,
      level: item.level,
      name: item.name,
      domain: item.domain,
      ownership: item.ownership,
      targetRoutes: item.targetRoutes,
      selectedRoute: best.route,
      score,
      implementationStatus: statusFor(score),
      targetImplementationScore,
      targetImplementationStatus: statusFor(targetImplementationScore),
      dimensions,
      ruleParityOutcome: parityVerified ? parity.outcome : null,
      blockers: [
        ...(!dimensions.productionRoute ? ["production_route"] : []),
        ...(!dimensions.apiBusinessFlow ? ["api_business_flow"] : []),
        ...(!dimensions.persistentDataModel ? ["persistent_data_model"] : []),
        ...(!dimensions.legacyRuleParity ? ["legacy_rule_parity"] : []),
        ...(!dimensions.legacyRuntimeUat ? ["legacy_runtime_uat"] : [])
      ]
    };
  });

  const statuses = { implemented: 0, partial: 0, mapped_only: 0 };
  const targetStatuses = { implemented: 0, partial: 0, mapped_only: 0 };
  const scoreBands = { score100: 0, score90: 0, score80: 0, score60: 0, score40: 0, score20: 0 };
  const domains = {};
  for (const item of items) {
    statuses[item.implementationStatus] += 1;
    targetStatuses[item.targetImplementationStatus] += 1;
    scoreBands[`score${item.score}`] += 1;
    domains[item.domain] ??= { total: 0, implemented: 0, partial: 0, mapped_only: 0, averageScore: 0 };
    const domain = domains[item.domain];
    domain.total += 1;
    domain[item.implementationStatus] += 1;
    domain.averageScore += item.score;
  }
  for (const domain of Object.values(domains)) domain.averageScore = Number((domain.averageScore / domain.total).toFixed(2));

  const averageScore = Number((items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(2));
  const targetAverageScore = Number((items.reduce((sum, item) => sum + item.targetImplementationScore, 0) / items.length).toFixed(2));
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_legacy_group_web_implementation_coverage",
    assessmentKind: "source_evidence_baseline_not_business_acceptance",
    items,
    summary: {
      total: items.length,
      statuses,
      scoreBands,
      averageScore,
      scoreMeaning: "legacy_group_web_runtime_compatibility",
      targetImplementation: {
        statuses: targetStatuses,
        averageScore: targetAverageScore,
        scoreMeaning: "smart_park_target_technical_implementation"
      },
      domains
    },
    gates: {
      implementedRequiresScore: 100,
      legacyRuleParityRequiresItemEvidence: true,
      targetTechnicalUatDoesNotSatisfyLegacyRuntime: true,
      targetTechnicalUatEvidence: targetTechnicalUat ? {
        status: targetTechnicalUat.status,
        taskCardSha256: targetTechnicalUat.taskCardSha256,
        rehearsalRunIds: targetTechnicalUat.rehearsalRunIds,
        triple: targetTechnicalUat.triple
      } : null,
      legacyRuntimeUatRequiresFrozenSurfaceRolePageRouteTimeAndHash: true,
      legacyRuntimeUatEvidence: legacyRuntimeUat,
      mappedDoesNotMeanImplemented: true,
      productionImport: "HOLD"
    }
  };
}

export const LEGACY_GROUP_WEB_ROUTE_EVIDENCE = ROUTE_EVIDENCE;
export const LEGACY_GROUP_WEB_ITEM_RULE_PARITY = ITEM_RULE_PARITY;
