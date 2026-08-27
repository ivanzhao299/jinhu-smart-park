import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const ROUTE_EVIDENCE = Object.freeze({
  "/hr": { page: "apps/web/app/hr/page.tsx", api: [], migrations: [] },
  "/hr/approvals": { page: "apps/web/app/hr/approvals/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000234_hr_approval_workflow.sql"] },
  "/hr/attendance": { page: "apps/web/app/hr/attendance/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000245_hr_attendance_requests.sql", "database/migrations/000246_hr_attendance_calculation_core.sql"] },
  "/hr/compensation": { page: "apps/web/app/hr/compensation/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000233_hr_compensation_payroll.sql"] },
  "/hr/contracts": { page: "apps/web/app/hr/contracts/page.tsx", api: ["apps/api/src/modules/hr/hr.controller.ts"], migrations: ["database/migrations/000238_hr_contract_history.sql", "database/migrations/000244_hr_contract_online_drafts.sql"] },
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
  "/admin": { page: null, api: [], migrations: [] },
  "/workflow": { page: null, api: [], migrations: [] }
});

const ITEM_RULE_PARITY = Object.freeze({
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
    liveRoleUat: false
  };
  const score = (dimensions.ownershipMapped ? 20 : 0)
    + (dimensions.productionRoute ? 20 : 0)
    + (dimensions.apiBusinessFlow ? 20 : 0)
    + (dimensions.persistentDataModel ? 20 : 0)
    + (dimensions.legacyRuleParity ? 10 : 0)
    + (dimensions.liveRoleUat ? 10 : 0);
  return { route, dimensions, score, evidence };
}

const statusFor = score => score === 100 ? "implemented" : score >= 60 ? "partial" : "mapped_only";

export function assessLegacyGroupWebImplementationCoverage(mapping, root) {
  if (mapping?.contractKind !== "yuzhou_hr_legacy_group_web_module_mapping" || mapping?.status !== "mapped_not_implementation_complete" || !Array.isArray(mapping.items) || mapping.items.length !== 231) {
    fail("GROUP_WEB_IMPLEMENTATION_SOURCE_INVALID", "module mapping");
  }
  if (mapping.productionImport !== "HOLD") fail("GROUP_WEB_IMPLEMENTATION_IMPORT_NOT_HELD", String(mapping.productionImport));

  const sourceAudit = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json"), "utf8"));
  const sourceAuditById = new Map(sourceAudit.items.map(item => [item.legacyId, item]));
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
    const dimensions = { ...best.dimensions, legacyRuleParity: parityVerified };
    const score = best.score + (parityVerified ? 10 : 0);
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
      dimensions,
      ruleParityOutcome: parityVerified ? parity.outcome : null,
      blockers: [
        ...(!dimensions.productionRoute ? ["production_route"] : []),
        ...(!dimensions.apiBusinessFlow ? ["api_business_flow"] : []),
        ...(!dimensions.persistentDataModel ? ["persistent_data_model"] : []),
        ...(!dimensions.legacyRuleParity ? ["legacy_rule_parity"] : []),
        ...(!dimensions.liveRoleUat ? ["live_role_uat"] : [])
      ]
    };
  });

  const statuses = { implemented: 0, partial: 0, mapped_only: 0 };
  const scoreBands = { score100: 0, score90: 0, score80: 0, score60: 0, score40: 0, score20: 0 };
  const domains = {};
  for (const item of items) {
    statuses[item.implementationStatus] += 1;
    scoreBands[`score${item.score}`] += 1;
    domains[item.domain] ??= { total: 0, implemented: 0, partial: 0, mapped_only: 0, averageScore: 0 };
    const domain = domains[item.domain];
    domain.total += 1;
    domain[item.implementationStatus] += 1;
    domain.averageScore += item.score;
  }
  for (const domain of Object.values(domains)) domain.averageScore = Number((domain.averageScore / domain.total).toFixed(2));

  const averageScore = Number((items.reduce((sum, item) => sum + item.score, 0) / items.length).toFixed(2));
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_legacy_group_web_implementation_coverage",
    assessmentKind: "source_evidence_baseline_not_business_acceptance",
    items,
    summary: { total: items.length, statuses, scoreBands, averageScore, domains },
    gates: {
      implementedRequiresScore: 100,
      legacyRuleParityRequiresItemEvidence: true,
      liveRoleUatRequiresItemEvidence: true,
      mappedDoesNotMeanImplemented: true,
      productionImport: "HOLD"
    }
  };
}

export const LEGACY_GROUP_WEB_ROUTE_EVIDENCE = ROUTE_EVIDENCE;
export const LEGACY_GROUP_WEB_ITEM_RULE_PARITY = ITEM_RULE_PARITY;
