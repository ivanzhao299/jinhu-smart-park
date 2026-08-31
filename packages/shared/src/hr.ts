export const HR_EMPLOYEE_STATUSES = ["preboarding", "probation", "active", "suspended", "departed"] as const;
export type HrEmployeeStatus = (typeof HR_EMPLOYEE_STATUSES)[number];
export const HR_EMPLOYMENT_TYPES = ["full_time", "part_time", "intern", "contractor"] as const;
export type HrEmploymentType = (typeof HR_EMPLOYMENT_TYPES)[number];
export const HR_ACCESS_ROLES = ["HR_MANAGER", "DEPARTMENT_MANAGER", "EMPLOYEE_SELF_SERVICE"] as const;
export type HrAccessRole = (typeof HR_ACCESS_ROLES)[number];
export const HR_SENSITIVE_FIELD_GROUPS = ["identity", "contact", "financial", "compensation", "attachment", "work_content"] as const;
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
  HR_MENU: "hr", HR_DASHBOARD_PAGE: "hr:dashboard", HR_DECISION_CENTER_PAGE: "hr:decision_center", HR_ORGANIZATION_PAGE: "hr:organization", HR_EMPLOYEES_PAGE: "hr:employees", HR_GOALS_PAGE: "hr:goals", HR_WORK_REPORTS_PAGE: "hr:work_reports",
  HR_EMPLOYEE_READ: "hr:employee:read", HR_EMPLOYEE_TEAM_READ: "hr:employee:team_read", HR_EMPLOYEE_MANAGE: "hr:employee:manage", HR_EMPLOYEE_SELF_READ: "hr:employee:self_read",
  HR_EMPLOYEE_PROFILE_READ: "hr:employee_profile:read", HR_EMPLOYEE_PROFILE_TEAM_READ: "hr:employee_profile:team_read", HR_EMPLOYEE_PROFILE_SELF_READ: "hr:employee_profile:self_read", HR_EMPLOYEE_PROFILE_MANAGE: "hr:employee_profile:manage",
  HR_EMPLOYMENT_TRANSITION: "hr:employment:transition",
  HR_JOB_CHANGE_READ: "hr:job_change:read", HR_JOB_CHANGE_TEAM_READ: "hr:job_change:team_read", HR_JOB_CHANGE_SELF_READ: "hr:job_change:self_read", HR_JOB_CHANGE_MANAGE: "hr:job_change:manage", HR_JOB_CHANGE_REVIEW: "hr:job_change:review", HR_JOB_CHANGE_APPLY: "hr:job_change:apply",
  HR_DEPARTURE_READ: "hr:departure:read", HR_DEPARTURE_TEAM_READ: "hr:departure:team_read", HR_DEPARTURE_SELF_READ: "hr:departure:self_read", HR_DEPARTURE_MANAGE: "hr:departure:manage", HR_DEPARTURE_REVIEW: "hr:departure:review", HR_DEPARTURE_INTERVIEW: "hr:departure:interview", HR_DEPARTURE_SURVEY: "hr:departure:survey", HR_DEPARTURE_HANDOVER: "hr:departure:handover", HR_DEPARTURE_WAGE_SETTLE: "hr:departure:wage_settle", HR_DEPARTURE_ARCHIVE_CLOSE: "hr:departure:archive_close", HR_DEPARTURE_APPLY: "hr:departure:apply",
  HR_RECRUITMENT_PAGE: "hr:recruitment", HR_REQUISITION_READ: "hr:requisition:read", HR_REQUISITION_TEAM_READ: "hr:requisition:team_read", HR_REQUISITION_MANAGE: "hr:requisition:manage",
  HR_CANDIDATE_READ: "hr:candidate:read", HR_CANDIDATE_MANAGE: "hr:candidate:manage", HR_CANDIDATE_SENSITIVE_READ: "hr:candidate:sensitive_read", HR_CANDIDATE_STAGE: "hr:candidate:stage", HR_CANDIDATE_CONVERT: "hr:candidate:convert",
  HR_ONBOARDING_READ: "hr:onboarding:read", HR_ONBOARDING_MANAGE: "hr:onboarding:manage", HR_RECRUITMENT_DOCUMENT_READ: "hr:recruitment_document:read", HR_RECRUITMENT_DOCUMENT_MANAGE: "hr:recruitment_document:manage",
  HR_LIFECYCLE_PAGE: "hr:lifecycle", HR_LIFECYCLE_READ: "hr:lifecycle:read", HR_LIFECYCLE_TEAM_READ: "hr:lifecycle:team_read", HR_LIFECYCLE_SELF_READ: "hr:lifecycle:self_read", HR_LIFECYCLE_TEMPLATE_MANAGE: "hr:lifecycle_template:manage", HR_LIFECYCLE_ASSIGN: "hr:lifecycle:assign", HR_LIFECYCLE_SELF_ACTION: "hr:lifecycle:self_action", HR_LIFECYCLE_REVIEW: "hr:lifecycle:review",
  HR_EMPLOYEE_RECORD_READ: "hr:employee_record:read", HR_EMPLOYEE_RECORD_TEAM_READ: "hr:employee_record:team_read", HR_EMPLOYEE_RECORD_SELF_READ: "hr:employee_record:self_read", HR_EMPLOYEE_RECORD_MANAGE: "hr:employee_record:manage", HR_EMPLOYEE_FAMILY_READ: "hr:employee_family:read", HR_EMPLOYEE_CREDENTIAL_READ: "hr:employee_credential:read", HR_EMPLOYEE_CREDENTIAL_DOCUMENT_READ: "hr:employee_credential_document:read", HR_EMPLOYEE_CREDENTIAL_DOCUMENT_MANAGE: "hr:employee_credential_document:manage", HR_LIFECYCLE_DOCUMENT_READ: "hr:lifecycle_document:read", HR_LIFECYCLE_DOCUMENT_MANAGE: "hr:lifecycle_document:manage",
  HR_TRAINING_PAGE: "hr:training", HR_TRAINING_READ: "hr:training:read", HR_TRAINING_TEAM_READ: "hr:training:team_read", HR_TRAINING_SELF_READ: "hr:training:self_read", HR_TRAINING_COURSE_MANAGE: "hr:training_course:manage", HR_TRAINING_PLAN_MANAGE: "hr:training_plan:manage", HR_TRAINING_PROGRESS_MANAGE: "hr:training_progress:manage", HR_TRAINING_SELF_ACTION: "hr:training:self_action", HR_TRAINING_COST_READ: "hr:training_cost:read", HR_TRAINING_DOCUMENT_READ: "hr:training_document:read", HR_TRAINING_DOCUMENT_MANAGE: "hr:training_document:manage",
  HR_REWARDS_PAGE: "hr:rewards", HR_REWARD_READ: "hr:reward:read", HR_REWARD_MANAGE: "hr:reward:manage", HR_REWARD_REVIEW: "hr:reward:review", HR_REWARD_SELF_READ: "hr:reward:self_read", HR_REWARD_TEAM_READ: "hr:reward:team_read", HR_REWARD_REASON_READ: "hr:reward_reason:read", HR_REWARD_DOCUMENT_READ: "hr:reward_document:read", HR_REWARD_DOCUMENT_MANAGE: "hr:reward_document:manage", HR_REWARD_AMOUNT_READ: "hr:reward_amount:read", HR_REWARD_LINK_PAYROLL: "hr:reward:link_payroll", HR_REWARD_LINK_PERFORMANCE: "hr:reward:link_performance",
  HR_CONTRACTS_PAGE: "hr:contracts", HR_CONTRACT_READ: "hr:contract:read", HR_CONTRACT_TEAM_READ: "hr:contract:team_read", HR_CONTRACT_SELF_READ: "hr:contract:self_read", HR_CONTRACT_MANAGE: "hr:contract:manage", HR_CONTRACT_SALARY_READ: "hr:contract_salary:read", HR_CONTRACT_DOCUMENT_READ: "hr:contract_document:read", HR_CONTRACT_DOCUMENT_TEAM_READ: "hr:contract_document:team_read", HR_CONTRACT_DOCUMENT_SELF_READ: "hr:contract_document:self_read", HR_CONTRACT_DOCUMENT_MANAGE: "hr:contract_document:manage", HR_CONTRACT_REMINDER_PARK_READ: "hr:contract_reminder:park_read", HR_CONTRACT_REMINDER_TEAM_READ: "hr:contract_reminder:team_read", HR_CONTRACT_REMINDER_SELF_READ: "hr:contract_reminder:self_read", HR_CONTRACT_REMINDER_ACK: "hr:contract_reminder:ack", HR_CONTRACT_REMINDER_MANAGE: "hr:contract_reminder:manage", HR_CONTRACT_REMINDER_RUN: "hr:contract_reminder:run",
  HR_EMPLOYEE_DOCUMENT_READ: "hr:employee_document:read", HR_EMPLOYEE_DOCUMENT_TEAM_READ: "hr:employee_document:team_read", HR_EMPLOYEE_DOCUMENT_SELF_READ: "hr:employee_document:self_read", HR_EMPLOYEE_DOCUMENT_MANAGE: "hr:employee_document:manage",
  HR_LEGACY_ARCHIVE_PAGE: "hr:legacy_archive", HR_LEGACY_UNCLAIMED_PAGE: "hr:legacy_unclaimed",
  HR_LEGACY_ARCHIVE_READ: "hr:legacy_archive:read", HR_LEGACY_ARCHIVE_TEAM_READ: "hr:legacy_archive:team_read", HR_LEGACY_ARCHIVE_SELF_READ: "hr:legacy_archive:self_read", HR_LEGACY_ARCHIVE_SENSITIVE_READ: "hr:legacy_archive:sensitive_read", HR_LEGACY_ARCHIVE_UNCLAIMED_READ: "hr:legacy_archive:unclaimed_read",
  HR_ATTENDANCE_PAGE: "hr:attendance", HR_ATTENDANCE_READ: "hr:attendance:read", HR_ATTENDANCE_TEAM_READ: "hr:attendance:team_read", HR_ATTENDANCE_SELF_READ: "hr:attendance:self_read", HR_ATTENDANCE_REQUEST: "hr:attendance:request", HR_ATTENDANCE_APPROVE: "hr:attendance:approve", HR_ATTENDANCE_CORRECT: "hr:attendance:correct", HR_ATTENDANCE_OPERATE: "hr:attendance:operate", HR_ATTENDANCE_CLOSE: "hr:attendance:close", HR_ATTENDANCE_PAYROLL_INPUT_READ: "hr:attendance:payroll_input_read",
  HR_INSURANCE_PAGE: "hr:insurance", HR_INSURANCE_READ: "hr:insurance:read", HR_INSURANCE_TEAM_READ: "hr:insurance:team_read", HR_INSURANCE_SELF_READ: "hr:insurance:self_read", HR_INSURANCE_AMOUNT_READ: "hr:insurance_amount:read",
  HR_GOAL_READ: "hr:goal:read", HR_GOAL_TEAM_READ: "hr:goal:team_read", HR_GOAL_MANAGE: "hr:goal:manage", HR_GOAL_CYCLE_MANAGE: "hr:goal:cycle_manage", HR_GOAL_CHANGE: "hr:goal:change", HR_GOAL_SELF_READ: "hr:goal:self_read", HR_GOAL_CHECKIN: "hr:goal:checkin",
  HR_WORK_REPORT_SELF_MANAGE: "hr:work_report:self_manage", HR_WORK_REPORT_TEAM_REVIEW: "hr:work_report:team_review", HR_WORK_REPORT_SELF_READ: "hr:work_report:self_read", HR_WORK_REPORT_TEAM_READ: "hr:work_report:team_read", HR_WORK_REPORT_DRAFT: "hr:work_report:draft", HR_WORK_REPORT_SUBMIT: "hr:work_report:submit", HR_WORK_REPORT_REVIEW: "hr:work_report:review",
  HR_PERFORMANCE_PAGE: "hr:performance", HR_FEEDBACK_360_PAGE: "hr:feedback_360", HR_TALENT_PAGE: "hr:talent",
  HR_PERFORMANCE_READ: "hr:performance:read", HR_PERFORMANCE_TEAM_READ: "hr:performance:team_read", HR_PERFORMANCE_SELF_READ: "hr:performance:self_read", HR_PERFORMANCE_MANAGE: "hr:performance:manage", HR_PERFORMANCE_TEMPLATE_READ: "hr:performance_template:read", HR_PERFORMANCE_TEMPLATE_MANAGE: "hr:performance_template:manage", HR_PERFORMANCE_SELF_REVIEW: "hr:performance:self_review", HR_PERFORMANCE_MANAGER_REVIEW: "hr:performance:manager_review", HR_PERFORMANCE_CALIBRATE: "hr:performance:calibrate", HR_PERFORMANCE_ACKNOWLEDGE: "hr:performance:acknowledge", HR_PERFORMANCE_APPEAL: "hr:performance:appeal", HR_PERFORMANCE_APPEAL_REVIEW: "hr:performance:appeal_review", HR_PERFORMANCE_RESULT_READ: "hr:performance:result_read",
  HR_FEEDBACK_READ: "hr:feedback:read", HR_FEEDBACK_TEAM_READ: "hr:feedback:team_read", HR_FEEDBACK_SELF_READ: "hr:feedback:self_read",
  HR_FEEDBACK_MODEL_MANAGE: "hr:feedback:model_manage", HR_FEEDBACK_CYCLE_MANAGE: "hr:feedback:cycle_manage", HR_FEEDBACK_NOMINATE: "hr:feedback:nominate", HR_FEEDBACK_NOMINATION_REVIEW: "hr:feedback:nomination_review",
  HR_FEEDBACK_MANAGE: "hr:feedback:manage", HR_FEEDBACK_RESPOND: "hr:feedback:respond", HR_FEEDBACK_RESULT_PUBLISH: "hr:feedback:result_publish", HR_FEEDBACK_RESULT_READ: "hr:feedback:result_read",
  HR_TALENT_READ: "hr:talent:read", HR_TALENT_TEAM_READ: "hr:talent:team_read", HR_TALENT_SELF_READ: "hr:talent:self_read", HR_TALENT_PROFILE_CREATE: "hr:talent:profile_create", HR_TALENT_REVIEW: "hr:talent:review", HR_SUCCESSION_READ: "hr:succession:read", HR_SUCCESSION_MANAGE: "hr:succession:manage", HR_DEVELOPMENT_MANAGE: "hr:development:manage", HR_DEVELOPMENT_SELF_ACTION: "hr:development:self_action",
  HR_COMPENSATION_PAGE: "hr:compensation", HR_PAYROLL_PAGE: "hr:payroll",
  HR_COMPENSATION_READ: "hr:compensation:read", HR_COMPENSATION_MANAGE: "hr:compensation:manage",
  HR_PAYROLL_READ: "hr:payroll:read", HR_PAYROLL_DETAIL_READ: "hr:payroll_detail:read", HR_PAYROLL_MANAGE: "hr:payroll:manage", HR_PAYROLL_REVIEW: "hr:payroll:review", HR_PAYROLL_CONFIRM: "hr:payroll:confirm", HR_PAYSLIP_SELF_READ: "hr:payslip:self_read",
  HR_PAYROLL_HISTORY_READ: "hr:payroll_history:read", HR_PAYROLL_HISTORY_TEAM_SUMMARY: "hr:payroll_history:team_summary", HR_PAYROLL_HISTORY_SELF_READ: "hr:payroll_history:self_read",
  HR_PAYROLL_RULE_READ: "hr:payroll_rule:read", HR_PAYROLL_FORMULA_REVIEW: "hr:payroll_formula:review",
  HR_PAYROLL_RECONCILIATION_CALCULATE: "hr:payroll_reconciliation:calculate", HR_PAYROLL_RECONCILIATION_REVIEW: "hr:payroll_reconciliation:review",
  HR_APPROVALS_PAGE: "hr:approvals", HR_APPROVAL_SELF_MANAGE: "hr:approval:self_manage", HR_APPROVAL_PARK_REVIEW: "hr:approval:park_review", HR_APPROVAL_TEAM_REVIEW: "hr:approval:team_review", HR_APPROVAL_REVIEW: "hr:approval:park_review",
  HR_POSITION_READ: "hr:position:read", HR_POSITION_MANAGE: "hr:position:manage", HR_EMPLOYMENT_EVENT_READ: "hr:employment_event:read",
  HR_LEGACY_DICTIONARY_READ: "hr:legacy_dictionary:read", HR_LEGACY_DICTIONARY_MANAGE: "hr:legacy_dictionary:manage", HR_LEGACY_DICTIONARY_APPROVE: "hr:legacy_dictionary:approve"
} as const;

export type HrAccessScope = "park" | "managed_org_tree" | "self" | "none";
export type HrAccessDomain = "employee" | "employee_profile" | "approval_review";
export interface HrAccessPrincipal {
  permissions: readonly string[];
  isSuper?: boolean;
}

export const HR_RUNTIME_ACCESS_CONTRACT = {
  employee: {
    park: [HR_PERMISSIONS.HR_EMPLOYEE_READ],
    managed_org_tree: [HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ],
    self: [HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ],
  },
  employee_profile: {
    park: [HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE],
    managed_org_tree: [HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ],
    self: [HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ],
  },
  approval_review: {
    park: [HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW],
    managed_org_tree: [HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW],
    self: [],
  },
} as const satisfies Record<HrAccessDomain,Record<Exclude<HrAccessScope,"none">,readonly string[]>>;

export function resolveHrAccessScope(domain:HrAccessDomain,actor:HrAccessPrincipal):HrAccessScope {
  if(actor.isSuper||actor.permissions.includes("*"))return HR_ACCESS_MATRIX.HR_MANAGER.employeeScope;
  const contract=HR_RUNTIME_ACCESS_CONTRACT[domain];
  if(contract.park.some(permission=>actor.permissions.includes(permission)))return HR_ACCESS_MATRIX.HR_MANAGER.employeeScope;
  if(contract.managed_org_tree.some(permission=>actor.permissions.includes(permission)))return HR_ACCESS_MATRIX.DEPARTMENT_MANAGER.employeeScope;
  if(contract.self.some(permission=>actor.permissions.includes(permission)))return HR_ACCESS_MATRIX.EMPLOYEE_SELF_SERVICE.employeeScope;
  return "none";
}
