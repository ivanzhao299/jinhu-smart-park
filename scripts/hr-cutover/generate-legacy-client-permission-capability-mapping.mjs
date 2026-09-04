#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLegacyClientPermissionCapabilityMapping } from "./legacy-client-permission-capability-mapping.mjs";

const [
  sourcePath,
  receiptPath,
  outputPath = "scripts/hr-cutover/contracts/legacy-client-permission-capability-mapping-v1.json",
  receiptOutputPath = "scripts/hr-cutover/contracts/legacy-client-permission-source-receipt-evidence-v1.json",
] = process.argv.slice(2);
if (!sourcePath || !receiptPath) {
  console.error("usage: node --experimental-strip-types scripts/hr-cutover/generate-legacy-client-permission-capability-mapping.mjs <private-capabilities.json> <safe-receipt.json> [output.json]");
  process.exit(2);
}

const root = resolve(import.meta.dirname, "../..");
const readJson = path => JSON.parse(readFileSync(resolve(path), "utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceInventory = readJson(resolve(root, "scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json"));
const sourceArtifact = readJson(sourcePath);
const sourceReceipt = readJson(receiptPath);
const permissionSource = readFileSync(resolve(root, "packages/shared/src/hr.ts"), "utf8");
const modernPermissions = new Set([...permissionSource.matchAll(/\bHR_[A-Z0-9_]+:\s*"(hr(?::[a-z0-9_]+)+)"/gu)].map(match => match[1]));
const permission = value => {
  if (!modernPermissions.has(value)) throw new Error(`PERMISSION_TARGET_UNKNOWN:${value}`);
  return value;
};
const HR_PERMISSIONS = new Proxy({}, { get: (_target, property) => {
  const match = permissionSource.match(new RegExp(`\\b${String(property)}:\\s*"(hr(?::[a-z0-9_]+)+)"`, "u"));
  if (!match) throw new Error(`PERMISSION_CONSTANT_UNKNOWN:${String(property)}`);
  return permission(match[1]);
} });

const exact = (domain, permission) => ({ targetDomain: domain, targetPermissions: [permission], disposition: "exact_mapped", reasonCode: null });
const split = (domain, ...permissions) => ({ targetDomain: domain, targetPermissions: permissions, disposition: "split_mapped", reasonCode: null });
const retired = domain => ({ targetDomain: domain, targetPermissions: [], disposition: "retired", reasonCode: "NAVIGATION_CONTAINER_REPLACED_BY_MODERN_INFORMATION_ARCHITECTURE" });
const pending = reasonCode => ({ targetDomain: null, targetPermissions: [], disposition: "pending_review", reasonCode });

const reviewByCode = new Map([
  [100, ["employee_records", "employee_records", "navigate", "navigation", retired("employee_records")]],
  [105, ["employee_records", "employee_browser", "read", "park", exact("employee", HR_PERMISSIONS.HR_EMPLOYEE_READ)]],
  [110, ["employee_records", "employee_profile", "manage", "park", split("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)]],
  [115, ["employee_records", "employee_profile", "read", "park", exact("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ)]],
  [120, ["employee_records", "workforce_analysis", "read", "park", exact("employee_analytics", HR_PERMISSIONS.HR_DASHBOARD_PAGE)]],
  [125, ["employee_records", "employee_reports", "read", "park", exact("employee_analytics", HR_PERMISSIONS.HR_DASHBOARD_PAGE)]],
  [130, ["employee_records", "employee_skills", "read", "park", exact("employee_record", HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ)]],
  [135, ["employee_records", "employee_credentials", "read", "park", split("employee_credential", HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ, HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_DOCUMENT_READ)]],
  [140, ["employee_records", "service_length", "read", "park", exact("employee_record", HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ)]],
  [145, ["employee_records", "employee_birthday", "read", "park", exact("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ)]],
  [150, ["employee_records", "employee_number", "manage", "park", exact("employee", HR_PERMISSIONS.HR_EMPLOYEE_MANAGE)]],
  [152, ["employee_records", "report_center", "read", "park", exact("employee_analytics", HR_PERMISSIONS.HR_DASHBOARD_PAGE)]],
  [155, ["employee_records", "employee_batch", "manage", "park", exact("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)]],
  [160, ["employee_records", "employee_archive", "delete", "park", exact("employee", HR_PERMISSIONS.HR_EMPLOYEE_MANAGE)]],

  [200, ["employment_movement", "employment_movement", "navigate", "navigation", retired("employment_movement")]],
  [210, ["employment_movement", "onboarding", "manage", "park", split("onboarding", HR_PERMISSIONS.HR_ONBOARDING_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION)]],
  [215, ["employment_movement", "job_change", "manage", "park", split("job_change", HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE, HR_PERMISSIONS.HR_JOB_CHANGE_REVIEW)]],
  [220, ["employment_movement", "departure", "manage", "park", split("departure", HR_PERMISSIONS.HR_DEPARTURE_MANAGE, HR_PERMISSIONS.HR_DEPARTURE_REVIEW)]],
  [225, ["employment_movement", "rehire", "manage", "park", split("employment_transition", HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION)]],
  [228, ["employment_movement", "movement_browser", "read", "park", exact("employment_event", HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ)]],
  [230, ["employment_movement", "movement_query", "read", "park", exact("employment_event", HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ)]],

  [300, ["contract", "contract", "navigate", "navigation", retired("contract")]],
  [305, ["contract", "labor_contract", "manage", "park", exact("contract", HR_PERMISSIONS.HR_CONTRACT_MANAGE)]],
  [310, ["contract", "labor_contract", "read", "park", exact("contract", HR_PERMISSIONS.HR_CONTRACT_READ)]],
  [315, ["contract", "probation_expiry", "read", "park", exact("contract_reminder", HR_PERMISSIONS.HR_CONTRACT_REMINDER_PARK_READ)]],
  [320, ["contract", "contract_expiry", "read", "park", exact("contract_reminder", HR_PERMISSIONS.HR_CONTRACT_REMINDER_PARK_READ)]],
  [330, ["contract", "probation_confirmation", "manage", "park", split("employment_transition", HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION)]],

  [400, ["training", "training", "navigate", "navigation", retired("training")]],
  [405, ["training", "training_course", "manage", "park", exact("training_course", HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE)]],
  [410, ["training", "training_record", "manage", "park", exact("training_progress", HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE)]],
  [415, ["training", "training_course", "read", "park", exact("training", HR_PERMISSIONS.HR_TRAINING_READ)]],
  [420, ["training", "training_record", "read", "park", exact("training", HR_PERMISSIONS.HR_TRAINING_READ)]],
  [430, ["training", "training_cost", "read", "park", exact("training_cost", HR_PERMISSIONS.HR_TRAINING_COST_READ)]],

  [500, ["performance", "performance", "navigate", "navigation", retired("performance")]],
  [505, ["performance", "assessment_category", "manage", "park", exact("performance_template", HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE)]],
  [510, ["performance", "assessment_plan", "manage", "park", exact("performance", HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)]],
  [515, ["performance", "assessment_assignment", "manage", "park", exact("performance", HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)]],
  [520, ["performance", "assessment_record", "manage", "park", exact("performance", HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)]],
  [525, ["performance", "assessment_result", "read", "park", exact("performance_result", HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ)]],

  [600, ["reward_discipline", "reward_discipline", "navigate", "navigation", retired("reward_discipline")]],
  [605, ["reward_discipline", "reward_reason", "manage", "park", exact("reward", HR_PERMISSIONS.HR_REWARD_MANAGE)]],
  [610, ["reward_discipline", "reward_record", "manage", "park", exact("reward", HR_PERMISSIONS.HR_REWARD_MANAGE)]],
  [615, ["reward_discipline", "reward_record", "read", "park", exact("reward", HR_PERMISSIONS.HR_REWARD_READ)]],
  [620, ["reward_discipline", "reward_register", "read", "park", exact("reward", HR_PERMISSIONS.HR_REWARD_READ)]],
  [625, ["reward_discipline", "reward_department_summary", "read", "team", exact("reward", HR_PERMISSIONS.HR_REWARD_TEAM_READ)]],
  [630, ["reward_discipline", "reward_monthly_summary", "read", "park", exact("reward", HR_PERMISSIONS.HR_REWARD_READ)]],

  [700, ["payroll", "payroll", "navigate", "navigation", retired("payroll")]],
  [705, ["payroll", "payroll_account_set", "manage", "park", exact("payroll", HR_PERMISSIONS.HR_PAYROLL_MANAGE)]],
  [710, ["payroll", "payroll_formula", "manage", "park", split("payroll_rule", HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW)]],
  [715, ["payroll", "payroll_input", "manage", "park", exact("payroll", HR_PERMISSIONS.HR_PAYROLL_MANAGE)]],
  [720, ["payroll", "payroll_report", "read", "park", exact("payroll", HR_PERMISSIONS.HR_PAYROLL_READ)]],
  [735, ["payroll", "payroll_analysis", "read", "park", exact("payroll_history", HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ)]],
  [740, ["payroll", "bank_payout", "execute", "park", pending("MODERN_BANK_PAYOUT_EXECUTION_CAPABILITY_MISSING")]],
  [745, ["payroll", "month_end_close", "execute", "park", split("payroll_close", HR_PERMISSIONS.HR_PAYROLL_REVIEW, HR_PERMISSIONS.HR_PAYROLL_CONFIRM)]],

  [800, ["insurance", "insurance", "navigate", "navigation", retired("insurance")]],
  [805, ["insurance", "contribution_policy", "manage", "park", pending("MODERN_INSURANCE_POLICY_MANAGE_CAPABILITY_MISSING")]],
  [810, ["insurance", "insurance_ledger", "manage", "park", pending("MODERN_INSURANCE_LEDGER_MANAGE_CAPABILITY_MISSING")]],
  [815, ["insurance", "insured_employee", "manage", "park", pending("MODERN_INSURANCE_ENROLLMENT_MANAGE_CAPABILITY_MISSING")]],
  [820, ["insurance", "insurance_statistics", "read", "park", split("insurance", HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ)]],
  [835, ["insurance", "commercial_insurance_report", "read", "park", exact("insurance", HR_PERMISSIONS.HR_INSURANCE_READ)]],

  [900, ["attendance", "attendance", "navigate", "navigation", retired("attendance")]],
  [905, ["attendance", "attendance_settings", "manage", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)]],
  [910, ["attendance", "attendance_checkin", "manage", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)]],
  [920, ["attendance", "attendance_result", "manage", "park", split("attendance", HR_PERMISSIONS.HR_ATTENDANCE_CORRECT, HR_PERMISSIONS.HR_ATTENDANCE_CLOSE)]],
  [925, ["attendance", "attendance_record", "read", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_READ)]],
  [930, ["attendance", "attendance_statistics", "read", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_READ)]],
  [940, ["attendance", "overtime_record", "manage", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)]],
  [950, ["attendance", "night_shift_record", "manage", "park", exact("attendance", HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)]],

  [1000, ["recruitment", "recruitment", "navigate", "navigation", retired("recruitment")]],
  [1005, ["recruitment", "requisition", "manage", "park", exact("requisition", HR_PERMISSIONS.HR_REQUISITION_MANAGE)]],
  [1010, ["recruitment", "requisition_review", "review", "park", split("requisition", HR_PERMISSIONS.HR_REQUISITION_MANAGE, HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW)]],
  [1015, ["recruitment", "requisition_publish", "manage", "park", exact("requisition", HR_PERMISSIONS.HR_REQUISITION_MANAGE)]],
  [1020, ["recruitment", "candidate_hire", "execute", "park", split("candidate", HR_PERMISSIONS.HR_CANDIDATE_CONVERT, HR_PERMISSIONS.HR_ONBOARDING_MANAGE)]],
  [1025, ["recruitment", "talent_pool", "manage", "park", split("candidate", HR_PERMISSIONS.HR_CANDIDATE_READ, HR_PERMISSIONS.HR_CANDIDATE_MANAGE)]],

  [1100, ["system", "system", "navigate", "navigation", retired("system")]],
  [1105, ["system", "company_information", "manage", "park", pending("MODERN_ORGANIZATION_MANAGE_CAPABILITY_MISSING")]],
  [1110, ["system", "department", "manage", "park", pending("MODERN_ORGANIZATION_MANAGE_CAPABILITY_MISSING")]],
  [1115, ["system", "position", "manage", "park", exact("position", HR_PERMISSIONS.HR_POSITION_MANAGE)]],
  [1120, ["system", "data_dictionary", "manage", "park", exact("legacy_dictionary", HR_PERMISSIONS.HR_LEGACY_DICTIONARY_MANAGE)]],
  [1125, ["system", "reminder_options", "manage", "park", pending("MODERN_GENERIC_REMINDER_CONFIGURATION_CAPABILITY_MISSING")]],
  [1126, ["system", "custom_employee_profile", "manage", "park", exact("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)]],
  [1127, ["system", "housing_information", "manage", "park", exact("employee_profile", HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)]],
  [1130, ["system", "database_backup", "execute", "platform", pending("PLATFORM_BACKUP_CAPABILITY_BINDING_REQUIRED")]],
  [1135, ["system", "database_restore", "execute", "platform", pending("PLATFORM_RESTORE_CAPABILITY_BINDING_REQUIRED")]],
  [1140, ["system", "user_authorization", "manage", "platform", pending("PLATFORM_RBAC_CAPABILITY_BINDING_REQUIRED")]],
  [1160, ["system", "password_change", "execute", "self", pending("PLATFORM_ACCOUNT_PASSWORD_CAPABILITY_BINDING_REQUIRED")]],
  [1166, ["system", "operation_log", "read", "platform", pending("PLATFORM_AUDIT_LOG_CAPABILITY_BINDING_REQUIRED")]],

  [1200, ["work_assistant", "work_assistant", "navigate", "navigation", retired("work_assistant")]],
  [1205, ["work_assistant", "notebook", "manage", "self", pending("MODERN_NOTEBOOK_CAPABILITY_MISSING")]],
  [1210, ["work_assistant", "address_book", "manage", "park", pending("MODERN_ADDRESS_BOOK_CAPABILITY_MISSING")]],
  [1215, ["work_assistant", "meeting", "manage", "park", pending("MODERN_MEETING_CAPABILITY_MISSING")]],
  [1220, ["work_assistant", "notification", "manage", "park", pending("MODERN_NOTIFICATION_MANAGEMENT_CAPABILITY_MISSING")]],
  [1225, ["work_assistant", "policy_document", "manage", "park", pending("MODERN_POLICY_DOCUMENT_CAPABILITY_MISSING")]],
]);

const { artifactSha256, ...sourceArtifactBody } = sourceArtifact ?? {};
if (sourceArtifact?.containsUserBoundRows !== false
  || sourceArtifact?.count !== sourceArtifact?.items?.length
  || sourceArtifact.sourcePermissionReceiptSha256 !== sourceReceipt.receiptSha256
  || sourceArtifact.capabilitySetSha256 !== sourceReceipt.safeFacts?.capabilitySetSha256
  || artifactSha256 !== sha256(`${JSON.stringify(sourceArtifactBody, null, 2)}\n`)) {
  throw new Error("PERMISSION_PRIVATE_SOURCE_ARTIFACT_INVALID");
}
if (reviewByCode.size !== sourceArtifact.items.length) throw new Error(`PERMISSION_REVIEW_COUNT_MISMATCH:${reviewByCode.size}/${sourceArtifact.items.length}`);

const rows = sourceArtifact.items.map(source => {
  const review = reviewByCode.get(source.unitcode);
  if (!review) throw new Error(`PERMISSION_REVIEW_MISSING:${source.unitcode}`);
  const [legacyDomain, legacyResource, legacyAction, legacyScope, target] = review;
  return {
    legacyUnitCode: source.unitcode,
    legacyDomain,
    legacyResource,
    legacyAction,
    legacyScope,
    ...target,
    evidenceSha256: sha256(`${JSON.stringify(source)}\n`),
  };
});

const contract = buildLegacyClientPermissionCapabilityMapping(sourceInventory, rows, { modernPermissions, sourceReceipt });
writeFileSync(resolve(root, outputPath), `${JSON.stringify(contract, null, 2)}\n`, { mode: 0o644 });
writeFileSync(resolve(root, receiptOutputPath), `${JSON.stringify(sourceReceipt, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify({
  status: contract.status,
  summary: contract.summary,
  compatibilityCredit: contract.compatibilityCredit,
  authorizationGrantEdges: contract.authorizationGrantEdges,
  productionImport: contract.productionImport,
}));
