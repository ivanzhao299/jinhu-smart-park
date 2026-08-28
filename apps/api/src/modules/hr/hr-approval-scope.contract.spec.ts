import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { HR_PERMISSIONS,resolveHrAccessScope } from "@jinhu/shared";
import { ForbiddenException,NotFoundException } from "@nestjs/common";
import { HrService } from "./hr.service";

const root=path.resolve(__dirname,"../../../../..");
const read=(relative:string)=>fs.readFileSync(path.join(root,relative),"utf8");

test("approval review access resolves exact park/team atoms and fails closed",()=>{
 assert.equal(resolveHrAccessScope("approval_review",{permissions:[HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW]}),"park");
 assert.equal(resolveHrAccessScope("approval_review",{permissions:[HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]}),"managed_org_tree");
 assert.equal(resolveHrAccessScope("approval_review",{permissions:[HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE]}),"none");
 assert.equal(resolveHrAccessScope("approval_review",{permissions:[]}),"none");
});

test("pending and review routes bind actor and enforce scope in the service",()=>{
 const controller=read("apps/api/src/modules/hr/hr.controller.ts");
 const service=read("apps/api/src/modules/hr/hr.service.ts");
 assert.match(controller,/pendingApprovals\(@CurrentScope\(\)s:TenantParkScope,@CurrentUser\(\)u:JwtPrincipal\)/);
 assert.match(controller,/HR_APPROVAL_PARK_REVIEW,HR_PERMISSIONS\.HR_APPROVAL_TEAM_REVIEW/);
 assert.match(controller,/await this\.service\.assertApprovalMakerChecker\(s,u,id\)/);
 assert.match(service,/resolveHrApprovalReviewAccessScope\(actor\)/);
 assert.match(service,/applicantEmployeeId:In\(managedIds\),subjectEmployeeId:In\(managedIds\)/);
 assert.match(service,/if\(access==="none"\)throw new NotFoundException\("HR approval request not found"\)/);
 assert.match(service,/Applicants cannot review their own request/);
 assert.match(service,/return projectHrApproval\(request\)/);
 assert.doesNotMatch(service,/reviewer:boolean/);
});

test("maker-checker uses immutable request creator even after employee soft deletion",async()=>{
 const service={approvalRequests:{findOne:async()=>({createBy:"actor"})}};
 await assert.rejects(()=>HrService.prototype.assertApprovalMakerChecker.call(service as never,{tenantId:"tenant",parkId:"park"},{sub:"actor",permissions:[HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW]} as never,"00000000-0000-4000-8000-000000000031"),ForbiddenException);
});

test("production seed grants exact review scopes without legacy broad review",()=>{
 const seed=read("database/seeds/production/000016_hr_management_foundation.sql");
 assert.match(seed,/HR_MANAGER','人力资源负责人','hr:approval:park_review/);
 assert.match(seed,/DEPARTMENT_MANAGER','部门负责人','hr:approval:team_review/);
 assert.match(seed,/code='hr:approval:review'.*is_deleted=false/s);
 assert.match(seed,/is_enabled=false,status='disabled',is_deleted=true/);
});

test("team pending approvals apply both applicant and subject managed-tree predicates",async()=>{
 let where:Record<string,unknown>|undefined;
 const service={
  managedEmployeeIds:async()=>["00000000-0000-4000-8000-000000000020"],
  auditService:{recordOperationRequired:async()=>undefined},
  approvalRequests:{find:async(options:{where:Record<string,unknown>})=>{where=options.where;return [];}}
 };
 const result=await HrService.prototype.pendingApprovals.call(service as never,{tenantId:"tenant",parkId:"park"},{sub:"actor",permissions:[HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]} as never);
 assert.deepEqual(result,[]);
 assert.deepEqual((where?.applicantEmployeeId as {value:unknown}).value,["00000000-0000-4000-8000-000000000020"]);
 assert.deepEqual((where?.subjectEmployeeId as {value:unknown}).value,["00000000-0000-4000-8000-000000000020"]);
});

test("pending approval payload is not returned when required audit fails",async()=>{
 const auditFailure=new Error("required audit unavailable");
 const service={
  auditService:{recordOperationRequired:async()=>{throw auditFailure;}},
  approvalRequests:{find:async()=>[{id:"request",payload:{sensitive:"redacted"}}]}
 };
 await assert.rejects(()=>HrService.prototype.pendingApprovals.call(service as never,{tenantId:"tenant",parkId:"park"},{sub:"actor",username:"actor",roles:[],permissions:[HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW]} as never),auditFailure);
});

test("direct cross-tree review is safe not-found and self-review is forbidden",async()=>{
 const managedId="00000000-0000-4000-8000-000000000020";
 let request:Record<string,unknown>|null=null;
 let where:Record<string,unknown>|undefined;
 const service={
  managedEmployeeIds:async()=>[managedId],
  employees:{findOne:async()=>({id:"00000000-0000-4000-8000-000000000099"})},
  dataSource:{transaction:async(work:(manager:unknown)=>unknown)=>work({getRepository:()=>({findOne:async(options:{where:Record<string,unknown>})=>{where=options.where;return request;}})})}
 };
 const actor={sub:"actor",permissions:[HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]} as never;
 const scope={tenantId:"tenant",parkId:"park"};
 await assert.rejects(()=>HrService.prototype.reviewApproval.call(service as never,scope,actor,"00000000-0000-4000-8000-000000000031",{action:"approve"} as never),NotFoundException);
 assert.deepEqual((where?.applicantEmployeeId as {value:unknown}).value,[managedId]);
 request={id:"request",applicantEmployeeId:managedId,subjectEmployeeId:managedId,status:"submitted"};
 service.employees.findOne=async()=>({id:managedId});
 await assert.rejects(()=>HrService.prototype.reviewApproval.call(service as never,scope,actor,"00000000-0000-4000-8000-000000000031",{action:"approve"} as never),ForbiddenException);
});
