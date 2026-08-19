import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../../..");
const migration=readFileSync(resolve(root,"database/migrations/000216_hr_employee_foundation.sql"),"utf8");
const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
const service=readFileSync(resolve(__dirname,"hr.service.ts"),"utf8");
const performanceMigration=readFileSync(resolve(root,"database/migrations/000219_hr_performance_feedback.sql"),"utf8");
const payrollMigration=readFileSync(resolve(root,"database/migrations/000220_hr_compensation_payroll.sql"),"utf8");
const approvalMigration=readFileSync(resolve(root,"database/migrations/000221_hr_approval_workflow.sql"),"utf8");
const fileAccess=readFileSync(resolve(root,"apps/api/src/modules/files/file-business-access.service.ts"),"utf8");
const employeeUi=readFileSync(resolve(root,"apps/web/app/hr/employees/HrEmployeesClient.tsx"),"utf8");

test("HR foundation separates login identity, employee history, sensitive profile and documents",()=>{
 for(const table of ["hr_position","hr_employee","hr_employee_profile","hr_employment_event","hr_employee_document"])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(migration,/uq_hr_employee_scope_user[\s\S]*user_id IS NOT NULL/);
 assert.match(migration,/file_id uuid NOT NULL REFERENCES sys_file\(id\)/);
});
test("HR employee documents reuse protected file surfaces without generic exposure",()=>{
 assert.match(fileAccess,/"hr_employee_document"/);
 assert.match(fileAccess,/HR_EMPLOYEE_PROFILE_MANAGE/);
 assert.match(fileAccess,/Employees can only read their own HR documents/);
 assert.match(fileAccess,/FROM hr_employee WHERE id=\$1 AND tenant_id=\$2 AND park_id=\$3/);
 assert.match(employeeUi,/FileUploader bizType="hr_employee_document"/);
 assert.match(employeeUi,/AttachmentList bizType="hr_employee_document"/);
});
test("HR approvals support submit, return, resubmit, approve and withdraw with action history",()=>{
 assert.match(approvalMigration,/CREATE TABLE IF NOT EXISTS hr_approval_request/);
 assert.match(approvalMigration,/CREATE TABLE IF NOT EXISTS hr_approval_action/);
 assert.match(service,/submit:\["draft"\]/);
 assert.match(service,/resubmit:\["returned"\]/);
 assert.match(service,/approve:\["submitted"\]/);
 assert.match(service,/return:\["submitted"\]/);
 assert.match(service,/withdraw:\["submitted"\]/);
});
test("payroll freezes confirmed snapshots and requires correction runs",()=>{
 for(const table of ["hr_compensation_plan","hr_employee_compensation","hr_payroll_period","hr_payroll_run","hr_payslip","hr_payslip_item"])assert.match(payrollMigration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(service,/Correction must reference a confirmed run/);
 assert.match(service,/Only calculated payroll can enter review/);
 assert.match(service,/Only reviewed payroll can be confirmed/);
 assert.match(service,/status:"confirmed"/);
 assert.match(service,/compensationSnapshot/);
 assert.match(service,/Confirmed payroll cannot be adjusted; create a correction run/);
 assert.match(service,/Deductions and tax cannot exceed gross amount/);
});
test("performance and 360 flows preserve state and anonymity boundaries",()=>{
 for(const table of ["hr_performance_cycle","hr_performance_plan","hr_performance_item","hr_feedback_cycle","hr_feedback_assignment","hr_feedback_response"])assert.match(performanceMigration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(service,/Plan is not in self review/);
 assert.match(service,/Plan is not in manager review/);
 assert.match(service,/Plan is not ready for calibration/);
 assert.match(service,/Employee has no active goals in this performance cycle/);
 assert.match(service,/targetSnapshot:\{metricName:goal\.metricName/);
 assert.match(service,/Anonymous result threshold has not been reached/);
 assert.doesNotMatch(service,/reviewerEmployeeId,averageScore/);
});
test("HR endpoints require module and distinct manager/self permissions",()=>{
 assert.match(controller,/@RequireModule\("hr"\)/);
 assert.match(controller,/employees\/me[\s\S]*HR_EMPLOYEE_SELF_READ/);
 assert.match(controller,/Post\("employees"\)[\s\S]*HR_EMPLOYEE_MANAGE/);
 assert.match(controller,/captureBody:false/);
 assert.match(controller,/employees\/:id\/profile[\s\S]*HR_EMPLOYEE_PROFILE_READ/);
 assert.match(controller,/employees\/:id\/transitions[\s\S]*HR_EMPLOYMENT_TRANSITION/);
});
test("HR reference writes fail closed to the current tenant and park",()=>{
 assert.match(service,/User is unavailable in current scope/);
 assert.match(service,/Position does not belong to primary organization/);
 assert.match(service,/Employee cannot manage themselves/);
 assert.match(service,/User is already linked to another employee/);
 assert.match(service,/eventType:"profile_updated"/);
 assert.match(service,/Employment status must be changed through a lifecycle action/);
 assert.match(service,/start_probation:"probation"/);
 assert.match(service,/Child goal weights cannot exceed 100 percent/);
 assert.match(service,/WITH RECURSIVE managed_org/);
 assert.match(service,/employee\.primary_org_id IN \(SELECT id FROM managed_org\)/);
 assert.match(service,/Work report is outside the manager organization scope/);
 assert.match(service,/Performance plan is outside the manager organization scope/);
});
test("work report actions project into the existing workflow inbox",()=>{
 const moduleSource=readFileSync(resolve(__dirname,"hr.module.ts"),"utf8");
 const notificationSource=readFileSync(resolve(__dirname,"hr-notification.service.ts"),"utf8");
 assert.match(moduleSource,/UserMessageEntity/);
 assert.match(service,/publishWorkReportSubmitted/);
 assert.match(service,/publishWorkReportReviewed/);
 assert.match(notificationSource,/category:\s*"hr"/);
 assert.match(notificationSource,/targetUrl:\s*"\/hr\/work-reports"/);
 assert.match(notificationSource,/\.orIgnore\(\)/);
});
