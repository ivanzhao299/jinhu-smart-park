import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { HR_ACCESS_MATRIX,HR_PERMISSIONS } from "@jinhu/shared";
import { ANY_PERMISSIONS_KEY,PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { HrApprovalRequestEntity,HrEmployeeProfileEntity,HrFeedbackAssignmentEntity,HrGoalEntity,HrPayslipEntity,HrPerformancePlanEntity,HrWorkReportEntity } from "./entities/hr.entities";
import { isHrEmployeeIdAccessible,projectHrApproval,projectHrEmployeeProfile,projectHrFeedbackAssignment,projectHrGoal,projectHrPayslip,projectHrPerformancePlan,projectHrWorkReport,resolveHrAttendanceAccessScope,resolveHrContractAccessScope,resolveHrEmployeeAccessScope,resolveHrEmployeeProfileAccess,resolveHrInsuranceAccessScope } from "./hr-access-policy";
import { HrController } from "./hr.controller";
import { HrGoalReportController } from "./hr-goal-report.controller";
import { HrService } from "./hr.service";

const actor = (permissions: string[], isSuper = false): JwtPrincipal => ({
  sub: "user-1", username: "tester", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions, isSuper
});

test("employee access scope is fail-closed from park to managed tree to explicit self or none", () => {
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_READ])), "park");
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ])), "managed_org_tree");
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW])), "none");
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW])), "none");
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ])), "self");
  assert.equal(resolveHrEmployeeAccessScope(actor([])), "none");
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_PAYSLIP_SELF_READ])), "none");
  assert.equal(resolveHrEmployeeAccessScope(actor([], true)), "park");
});

test("runtime employee and profile access consume the shared role matrix through exact atoms",()=>{
  assert.equal(resolveHrEmployeeAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ])),HR_ACCESS_MATRIX.DEPARTMENT_MANAGER.employeeScope);
  assert.deepEqual(resolveHrEmployeeProfileAccess(actor([HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ])),{scope:"park",projection:"masked"});
  assert.deepEqual(resolveHrEmployeeProfileAccess(actor([HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE])),{scope:"park",projection:"full"});
  assert.deepEqual(resolveHrEmployeeProfileAccess(actor([HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ])),{scope:"managed_org_tree",projection:"masked"});
  assert.deepEqual(resolveHrEmployeeProfileAccess(actor([HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ])),{scope:"self",projection:"self_masked"});
  assert.deepEqual(resolveHrEmployeeProfileAccess(actor([HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ])),{scope:"none",projection:null});
});

test("employee scope rejects cross-organization targets and never promotes client input", () => {
  assert.equal(isHrEmployeeIdAccessible("self", "employee-self", "employee-self", []), true);
  assert.equal(isHrEmployeeIdAccessible("self", "employee-other", "employee-self", ["employee-other"]), false);
  assert.equal(isHrEmployeeIdAccessible("managed_org_tree", "employee-child", "manager", ["employee-child"]), true);
  assert.equal(isHrEmployeeIdAccessible("managed_org_tree", "employee-sibling", "manager", ["employee-child"]), false);
  assert.equal(isHrEmployeeIdAccessible("park", "employee-other", "manager", []), true);
  assert.equal(isHrEmployeeIdAccessible("none", "employee-self", "employee-self", ["employee-self"]), false);
});

test("labor contract access composes only its exact park, team, and self permissions",()=>{
  assert.deepEqual(resolveHrContractAccessScope(actor([])),{park:false,managedOrgTree:false,self:false});
  assert.deepEqual(resolveHrContractAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_READ])),{park:false,managedOrgTree:false,self:false});
  assert.deepEqual(resolveHrContractAccessScope(actor([HR_PERMISSIONS.HR_CONTRACT_SELF_READ])),{park:false,managedOrgTree:false,self:true});
  assert.deepEqual(resolveHrContractAccessScope(actor([HR_PERMISSIONS.HR_CONTRACT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_SELF_READ])),{park:false,managedOrgTree:true,self:true});
  assert.deepEqual(resolveHrContractAccessScope(actor([HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ])),{park:true,managedOrgTree:false,self:false});
});

test("attendance and insurance ledgers use only their exact park, team, self permissions",()=>{
 assert.equal(resolveHrAttendanceAccessScope(actor([HR_PERMISSIONS.HR_EMPLOYEE_READ])),"none");
 assert.equal(resolveHrAttendanceAccessScope(actor([HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ])),"self");
 assert.equal(resolveHrAttendanceAccessScope(actor([HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ])),"managed_org_tree");
 assert.equal(resolveHrAttendanceAccessScope(actor([HR_PERMISSIONS.HR_ATTENDANCE_READ])),"park");
 assert.equal(resolveHrInsuranceAccessScope(actor([HR_PERMISSIONS.HR_PAYSLIP_SELF_READ])),"none");
 assert.equal(resolveHrInsuranceAccessScope(actor([HR_PERMISSIONS.HR_INSURANCE_SELF_READ])),"self");
 assert.equal(resolveHrInsuranceAccessScope(actor([HR_PERMISSIONS.HR_INSURANCE_TEAM_READ])),"managed_org_tree");
 assert.equal(resolveHrInsuranceAccessScope(actor([HR_PERMISSIONS.HR_INSURANCE_READ])),"park");
});

test("attendance and insurance read routes retain exact atomic permissions",()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.attendanceCalendars),[HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ,HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ]);
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.insurancePeriods),[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ,HR_PERMISSIONS.HR_INSURANCE_SELF_READ]);
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.insurancePeriod),[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_TEAM_READ,HR_PERMISSIONS.HR_INSURANCE_SELF_READ]);
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.myInsurancePeriods),[HR_PERMISSIONS.HR_INSURANCE_SELF_READ]);
});

test("labor contract routes retain exact read permissions",()=>{
  const expected=[HR_PERMISSIONS.HR_CONTRACT_READ,HR_PERMISSIONS.HR_CONTRACT_TEAM_READ,HR_PERMISSIONS.HR_CONTRACT_SELF_READ];
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.contracts),expected);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.contract),expected);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.myContracts),[HR_PERMISSIONS.HR_CONTRACT_SELF_READ]);
});

test("labor contract writes require the atomic manage permission and body-free audit",()=>{
 for(const method of ["createContract","contractAction","createContractChange","contractChangeAction"] as const){
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[HR_PERMISSIONS.HR_CONTRACT_MANAGE]);
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrController.prototype[method]).captureBody,false);
  assert.ok(Reflect.getMetadata("__interceptors__",HrController.prototype[method])?.length);
 }
});

test("labor contract service is fail-closed without an exact contract permission",async()=>{
  const service=Reflect.construct(HrService,Array(27).fill({})) as HrService;
  assert.deepEqual(await service.listContracts(
    {tenantId:"tenant-1",parkId:"park-1"},actor([HR_PERMISSIONS.HR_EMPLOYEE_READ]),{page:1,page_size:20}
  ),{items:[],total:0,page:1,page_size:20});
});

test("labor contract projection excludes legacy source, salary, scope, and audit internals",()=>{
  const projector=(HrService.prototype as unknown as {projectContractRaw:(row:Record<string,unknown>)=>Record<string,unknown>}).projectContractRaw;
  const projected=projector.call({}, {
    id:"contract-1",employee_id:"employee-1",employee_code:"JH-001",employee_name:"张三",contract_no:"HT-001",contract_type_id:"type-1",contract_type_name:"固定期限",start_date:"2026-01-01",end_date:"2028-01-01",probation_end_date:null,status:"active",is_historical_import:true,
    source_snapshot:{secret:true},base_salary:"9999",probation_salary:"8888",tenant_id:"tenant-1",park_id:"park-1",create_by:"user-1",remark:"private"
  });
  assert.deepEqual(Object.keys(projected),["id","employeeId","employeeCode","employeeName","contractNo","contractTypeId","contractTypeName","startDate","endDate","probationEndDate","status","isHistoricalImport"]);
});

test("employee routes expose only the reviewed full, self, and manager permissions", () => {
  const expected = [
    HR_PERMISSIONS.HR_EMPLOYEE_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ
  ];
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY, HrController.prototype.employees), expected);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY, HrController.prototype.employee), expected);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype.profile),[
    HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ,
    HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.myProfile),[HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ]);
});

test("service remains fail-closed when invoked without an employee read permission", async () => {
  const service = Reflect.construct(HrService, Array(26).fill({})) as HrService;
  const unprivileged = actor([HR_PERMISSIONS.HR_PAYSLIP_SELF_READ]);
  assert.deepEqual(
    await service.listEmployees(
      { tenantId: "tenant-1", parkId: "park-1" },
      unprivileged,
      { page: 2, page_size: 20 }
    ),
    { items: [], total: 0, page: 2, page_size: 20 }
  );
  await assert.rejects(
    service.detailEmployeeForActor(
      { tenantId: "tenant-1", parkId: "park-1" },
      unprivileged,
      "00000000-0000-4000-8000-000000000001"
    ),
    NotFoundException
  );
});

test("manager employee scope is derived from tenant and park bounded organization data", async () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  let findOptions: { where?: Record<string, unknown> } | undefined;
  const employees = {
    findOne: async () => ({ id: "manager-employee" }),
    findAndCount: async (options: { where?: Record<string, unknown> }) => {
      findOptions = options;
      return [[], 0];
    }
  };
  const dataSource = {
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      return [{ id: "managed-employee" }];
    }
  };
  const service = Reflect.construct(
    HrService,
    [employees, ...Array(28).fill({}), {}, dataSource]
  ) as HrService;
  const scope = { tenantId: "tenant-1", parkId: "park-1" };
  const manager = actor([HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ]);

  assert.deepEqual(
    await service.listEmployees(scope, manager, { page: 1, page_size: 20 }),
    { items: [], total: 0, page: 1, page_size: 20 }
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0]!.sql, /sys_org WHERE tenant_id=\$1 AND park_id=\$2/u);
  assert.match(queries[0]!.sql, /child\.tenant_id=\$1 AND child\.park_id=\$2/u);
  assert.match(queries[0]!.sql, /employee\.tenant_id=\$1 AND employee\.park_id=\$2/u);
  assert.deepEqual(queries[0]!.parameters, ["tenant-1", "park-1", "user-1", "manager-employee"]);
  assert.equal(findOptions?.where?.tenantId, "tenant-1");
  assert.equal(findOptions?.where?.parkId, "park-1");
  assert.equal(findOptions?.where?.isDeleted, false);
  assert.ok(findOptions?.where?.id, "manager list must retain the server-derived employee ID filter");
});

test("employee directory keyword searches name and code without dropping scope filters", async () => {
  let findOptions: { where?: Array<Record<string, unknown>> } | undefined;
  const employees = {
    findAndCount: async (options: { where?: Array<Record<string, unknown>> }) => {
      findOptions = options;
      return [[], 0];
    }
  };
  const service = Reflect.construct(HrService, [employees, ...Array(25).fill({})]) as HrService;
  await service.listEmployees(
    { tenantId: "tenant-1", parkId: "park-1" },
    actor([HR_PERMISSIONS.HR_EMPLOYEE_READ]),
    { page: 1, page_size: 20, keyword: "JH-001", status: "active" }
  );
  assert.equal(findOptions?.where?.length, 2);
  assert.equal(findOptions?.where?.[0]?.tenantId, "tenant-1");
  assert.equal(findOptions?.where?.[0]?.parkId, "park-1");
  assert.equal(findOptions?.where?.[0]?.employmentStatus, "active");
  assert.ok(findOptions?.where?.[0]?.fullName);
  assert.ok(findOptions?.where?.[1]?.employeeCode);
});

test("sensitive profile projection masks private contact data without full permission", () => {
  const profile = {
    id: "profile-1", employeeId: "employee-1", idType: "resident_id", idNumberMasked: "320812198901011234",
    personalMobile: "13812345678", personalEmail: "person@example.com", address: "江苏省淮安市",
    emergencyContactName: "王小明", emergencyContactMobile: "13987654321", remark: "private note"
  } as HrEmployeeProfileEntity;
  const masked=projectHrEmployeeProfile(profile,"masked");
  assert.deepEqual(masked,{id:"profile-1",employeeId:"employee-1",idType:"resident_id",idNumberMasked:"32**************34",jobTitle:null,jobGrade:null,employeeCategory:null,technicalTitle:null,technicalGrade:null,personalMobile:"138****5678",personalEmail:"p***@example.com",address:"***",emergencyContactName:"王**",emergencyContactMobile:"139****4321",masked:true});
  assert.equal("remark" in (masked??{}),false);
  assert.equal("dateOfBirth" in (masked??{}),false);
  assert.equal("highestEducation" in (masked??{}),false);
  assert.equal(projectHrEmployeeProfile(profile,"full")?.personalMobile, "13812345678");
  assert.equal(projectHrEmployeeProfile(profile,"full")?.masked, false);
  assert.deepEqual(projectHrEmployeeProfile(profile,"self_masked"),masked);
});

test("already masked identity values are never expanded or rewritten", () => {
  const profile = { id: "p", employeeId: "e", idType: null, idNumberMasked: "3208********1234",
    personalMobile: null, personalEmail: null, address: null, emergencyContactName: null,
    emergencyContactMobile: null, remark: null } as HrEmployeeProfileEntity;
  assert.equal(projectHrEmployeeProfile(profile,"masked")?.idNumberMasked, "3208********1234");
});

test("self and team read projections omit scope, audit, reviewer and unpublished score internals", () => {
  const internal={tenantId:"foreign-tenant",parkId:"foreign-park",createBy:"secret-actor",updateBy:"secret-actor",remark:"internal"};
  const goal={...internal,id:"goal",cycleId:"cycle",parentGoalId:null,goalLevel:"employee",goalName:"目标",ownerOrgId:null,ownerEmployeeId:"employee",weight:"1",metricName:null,targetValue:null,currentValue:null,unit:null,progress:"0",startDate:"2026-01-01",dueDate:"2026-12-31",status:"active"} as HrGoalEntity;
  const report={...internal,id:"report",employeeId:"employee",reportType:"daily",periodStart:"2026-08-24",periodEnd:"2026-08-24",completedWork:"done",nextPlan:null,risks:null,collaborationNeeds:null,hours:"8",status:"submitted",reviewerEmployeeId:"manager",reviewComment:null,submittedAt:new Date(),reviewedAt:null} as HrWorkReportEntity;
  const plan={...internal,id:"plan",cycleId:"cycle",employeeId:"employee",managerEmployeeId:"manager",status:"manager_review",selfScore:"88",managerScore:"91",calibratedScore:"92",finalScore:"92",selfSummary:"self",managerComment:"manager",calibrationComment:"calibration",confirmedAt:null} as HrPerformancePlanEntity;
  assert.equal("tenantId" in projectHrGoal(goal),false);
  assert.equal("createBy" in projectHrWorkReport(report),false);
  assert.equal(projectHrPerformancePlan(plan,"self").managerScore,null);
  assert.equal(projectHrPerformancePlan(plan,"manager").managerScore,"91");
  assert.equal(projectHrPerformancePlan(plan,"manager").calibratedScore,null);
  const inconsistentConfirmed={...plan,status:"confirmed",confirmedAt:null} as HrPerformancePlanEntity;
  assert.equal(projectHrPerformancePlan(inconsistentConfirmed,"self").managerScore,null);
  assert.equal(projectHrPerformancePlan(inconsistentConfirmed,"manager").finalScore,null);
});

test("feedback, self payslip and approval projections expose only task-required fields", () => {
  const internal={tenantId:"tenant",parkId:"park",createBy:"actor",updateBy:"actor"};
  const assignment={...internal,id:"assignment",feedbackCycleId:"cycle",subjectEmployeeId:"subject",reviewerEmployeeId:"reviewer",relationType:"peer",weight:"1",status:"pending",submittedAt:null} as HrFeedbackAssignmentEntity;
  const payslip={...internal,id:"slip",runId:"run",employeeId:"employee",compensationSnapshot:{baseSalary:"10000"},grossAmount:"10000",deductionAmount:"1000",personalTax:"200",netAmount:"8800",status:"confirmed",createTime:new Date("2026-08-24T00:00:00Z")} as unknown as HrPayslipEntity;
  const approval={...internal,id:"approval",requestNo:"HR-1",requestType:"leave",applicantEmployeeId:"employee",subjectEmployeeId:"employee",title:"请假",payload:{days:1},status:"submitted",currentApproverId:null,submittedAt:new Date(),completedAt:null} as unknown as HrApprovalRequestEntity;
  assert.equal("reviewerEmployeeId" in projectHrFeedbackAssignment(assignment),false);
  assert.equal("compensationSnapshot" in projectHrPayslip(payslip,true),false);
  assert.equal("employeeId" in projectHrPayslip(payslip,true),false);
  assert.equal("compensationSnapshot" in projectHrPayslip(payslip,false),true);
  assert.equal("tenantId" in projectHrApproval(approval),false);
});

test("M3 read projections use exact public field allowlists", () => {
  const internal={tenantId:"tenant",parkId:"park",createBy:"creator",updateBy:"updater",updateTime:new Date(),isDeleted:false,version:4,remark:"internal"};
  const goal={...internal,id:"goal",cycleId:"cycle",parentGoalId:null,goalLevel:"employee",goalName:"目标",ownerOrgId:null,ownerEmployeeId:"employee",weight:"1",metricName:null,targetValue:null,currentValue:null,unit:null,progress:"0",startDate:"2026-01-01",dueDate:"2026-12-31",status:"active"} as HrGoalEntity;
  const assignment={...internal,id:"assignment",feedbackCycleId:"cycle",subjectEmployeeId:"subject",reviewerEmployeeId:"reviewer",relationType:"peer",weight:"1",status:"pending",submittedAt:null} as HrFeedbackAssignmentEntity;
  assert.deepEqual(Object.keys(projectHrGoal(goal)).sort(),[
    "currentValue","cycleId","dueDate","goalLevel","goalName","id","metricName","ownerEmployeeId","ownerOrgId","parentGoalId","progress","startDate","status","targetValue","unit","weight"
  ].sort());
  assert.deepEqual(Object.keys(projectHrFeedbackAssignment(assignment)).sort(),[
    "feedbackCycleId","id","relationType","status","subjectEmployeeId","submittedAt","weight"
  ].sort());
});

test("legacy HR reads retain exact permissions and T6 goal/report reads use atomic permissions", () => {
  const expected: Array<[keyof HrController,string]> = [
    ["myPerformance",HR_PERMISSIONS.HR_PERFORMANCE_SELF_REVIEW],
    ["managerPerformance",HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW],
    ["myFeedback",HR_PERMISSIONS.HR_FEEDBACK_RESPOND],
    ["feedbackResult",HR_PERMISSIONS.HR_FEEDBACK_RESULT_READ],
    ["payrollRuns",HR_PERMISSIONS.HR_PAYROLL_READ],
    ["payrollRunPayslips",HR_PERMISSIONS.HR_PAYROLL_READ],
    ["myPayslips",HR_PERMISSIONS.HR_PAYSLIP_SELF_READ],
    ["myApprovals",HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE],
    ["pendingApprovals",HR_PERMISSIONS.HR_APPROVAL_REVIEW]
  ];
  for(const [method,permission] of expected){
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype[method]),[permission]);
    assert.equal(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrController.prototype[method]),undefined);
  }
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrGoalReportController.prototype.myGoals),[HR_PERMISSIONS.HR_GOAL_SELF_READ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrGoalReportController.prototype.myReports),[HR_PERMISSIONS.HR_WORK_REPORT_SELF_READ]);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrGoalReportController.prototype.goals),[HR_PERMISSIONS.HR_GOAL_READ,HR_PERMISSIONS.HR_GOAL_TEAM_READ]);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrGoalReportController.prototype.teamReports),[HR_PERMISSIONS.HR_WORK_REPORT_TEAM_READ,HR_PERMISSIONS.HR_WORK_REPORT_REVIEW]);
});
