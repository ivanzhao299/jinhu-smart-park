export const HR_EMPLOYEE_STATUSES = ["preboarding", "probation", "active", "suspended", "departed"] as const;
export type HrEmployeeStatus = (typeof HR_EMPLOYEE_STATUSES)[number];
export const HR_EMPLOYMENT_TYPES = ["full_time", "part_time", "intern", "contractor"] as const;
export type HrEmploymentType = (typeof HR_EMPLOYMENT_TYPES)[number];
export const HR_ACCESS_ROLES = ["HR_MANAGER", "DEPARTMENT_MANAGER", "EMPLOYEE_SELF_SERVICE"] as const;
export type HrAccessRole = (typeof HR_ACCESS_ROLES)[number];
export const HR_SENSITIVE_FIELD_GROUPS = ["identity", "contact", "financial", "compensation", "attachment"] as const;
export type HrSensitiveFieldGroup = (typeof HR_SENSITIVE_FIELD_GROUPS)[number];
export const HR_ACCESS_MATRIX = {
  HR_MANAGER: { employeeScope: "park", sensitiveProfile: "permission", payroll: "permission" },
  DEPARTMENT_MANAGER: { employeeScope: "managed_org_tree", sensitiveProfile: "masked", payroll: "self_published_only" },
  EMPLOYEE_SELF_SERVICE: { employeeScope: "self", sensitiveProfile: "self_masked", payroll: "self_published_only" }
} as const satisfies Record<HrAccessRole, {
  employeeScope: "park" | "managed_org_tree" | "self";
  sensitiveProfile: "permission" | "masked" | "self_masked";
  payroll: "permission" | "self_published_only";
}>;
export const HR_PERMISSIONS = {
  HR_MENU: "hr", HR_DASHBOARD_PAGE: "hr:dashboard", HR_ORGANIZATION_PAGE: "hr:organization", HR_EMPLOYEES_PAGE: "hr:employees", HR_GOALS_PAGE: "hr:goals", HR_WORK_REPORTS_PAGE: "hr:work_reports",
  HR_EMPLOYEE_READ: "hr:employee:read", HR_EMPLOYEE_MANAGE: "hr:employee:manage", HR_EMPLOYEE_SELF_READ: "hr:employee:self_read",
  HR_EMPLOYEE_PROFILE_READ: "hr:employee_profile:read", HR_EMPLOYEE_PROFILE_MANAGE: "hr:employee_profile:manage",
  HR_EMPLOYMENT_TRANSITION: "hr:employment:transition",
  HR_RECRUITMENT_PAGE: "hr:recruitment", HR_REQUISITION_READ: "hr:requisition:read", HR_REQUISITION_TEAM_READ: "hr:requisition:team_read", HR_REQUISITION_MANAGE: "hr:requisition:manage",
  HR_CANDIDATE_READ: "hr:candidate:read", HR_CANDIDATE_MANAGE: "hr:candidate:manage", HR_CANDIDATE_SENSITIVE_READ: "hr:candidate:sensitive_read", HR_CANDIDATE_STAGE: "hr:candidate:stage", HR_CANDIDATE_CONVERT: "hr:candidate:convert",
  HR_ONBOARDING_READ: "hr:onboarding:read", HR_ONBOARDING_MANAGE: "hr:onboarding:manage", HR_RECRUITMENT_DOCUMENT_READ: "hr:recruitment_document:read", HR_RECRUITMENT_DOCUMENT_MANAGE: "hr:recruitment_document:manage",
  HR_CONTRACTS_PAGE: "hr:contracts", HR_CONTRACT_READ: "hr:contract:read", HR_CONTRACT_TEAM_READ: "hr:contract:team_read", HR_CONTRACT_SELF_READ: "hr:contract:self_read", HR_CONTRACT_MANAGE: "hr:contract:manage",
  HR_ATTENDANCE_PAGE: "hr:attendance", HR_ATTENDANCE_READ: "hr:attendance:read", HR_ATTENDANCE_TEAM_READ: "hr:attendance:team_read", HR_ATTENDANCE_SELF_READ: "hr:attendance:self_read", HR_ATTENDANCE_REQUEST: "hr:attendance:request", HR_ATTENDANCE_APPROVE: "hr:attendance:approve", HR_ATTENDANCE_CORRECT: "hr:attendance:correct", HR_ATTENDANCE_OPERATE: "hr:attendance:operate", HR_ATTENDANCE_CLOSE: "hr:attendance:close", HR_ATTENDANCE_PAYROLL_INPUT_READ: "hr:attendance:payroll_input_read",
  HR_INSURANCE_PAGE: "hr:insurance", HR_INSURANCE_READ: "hr:insurance:read", HR_INSURANCE_TEAM_READ: "hr:insurance:team_read", HR_INSURANCE_SELF_READ: "hr:insurance:self_read",
  HR_GOAL_READ: "hr:goal:read", HR_GOAL_MANAGE: "hr:goal:manage", HR_GOAL_SELF_READ: "hr:goal:self_read",
  HR_WORK_REPORT_SELF_MANAGE: "hr:work_report:self_manage", HR_WORK_REPORT_TEAM_REVIEW: "hr:work_report:team_review",
  HR_PERFORMANCE_PAGE: "hr:performance", HR_FEEDBACK_360_PAGE: "hr:feedback_360",
  HR_PERFORMANCE_READ: "hr:performance:read", HR_PERFORMANCE_MANAGE: "hr:performance:manage", HR_PERFORMANCE_SELF_REVIEW: "hr:performance:self_review", HR_PERFORMANCE_MANAGER_REVIEW: "hr:performance:manager_review", HR_PERFORMANCE_CALIBRATE: "hr:performance:calibrate",
  HR_FEEDBACK_MANAGE: "hr:feedback:manage", HR_FEEDBACK_RESPOND: "hr:feedback:respond", HR_FEEDBACK_RESULT_READ: "hr:feedback:result_read",
  HR_COMPENSATION_PAGE: "hr:compensation", HR_PAYROLL_PAGE: "hr:payroll",
  HR_COMPENSATION_READ: "hr:compensation:read", HR_COMPENSATION_MANAGE: "hr:compensation:manage",
  HR_PAYROLL_READ: "hr:payroll:read", HR_PAYROLL_MANAGE: "hr:payroll:manage", HR_PAYROLL_REVIEW: "hr:payroll:review", HR_PAYROLL_CONFIRM: "hr:payroll:confirm", HR_PAYSLIP_SELF_READ: "hr:payslip:self_read",
  HR_PAYROLL_HISTORY_READ: "hr:payroll_history:read", HR_PAYROLL_HISTORY_TEAM_SUMMARY: "hr:payroll_history:team_summary", HR_PAYROLL_HISTORY_SELF_READ: "hr:payroll_history:self_read",
  HR_PAYROLL_RULE_READ: "hr:payroll_rule:read", HR_PAYROLL_FORMULA_REVIEW: "hr:payroll_formula:review",
  HR_PAYROLL_RECONCILIATION_CALCULATE: "hr:payroll_reconciliation:calculate", HR_PAYROLL_RECONCILIATION_REVIEW: "hr:payroll_reconciliation:review",
  HR_APPROVALS_PAGE: "hr:approvals", HR_APPROVAL_SELF_MANAGE: "hr:approval:self_manage", HR_APPROVAL_REVIEW: "hr:approval:review",
  HR_POSITION_READ: "hr:position:read", HR_POSITION_MANAGE: "hr:position:manage", HR_EMPLOYMENT_EVENT_READ: "hr:employment_event:read"
} as const;
