import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { Response } from "express";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { buildDownloadResponseHeaders,FilesController } from "../files/files.controller";

const read=(path:string)=>readFileSync(resolve(__dirname,path),"utf8");

test("P0 sensitive reads use separate salary, payroll-detail and document atoms",()=>{
 const shared=read("../../../../../packages/shared/src/hr.ts");
 const controller=read("hr.controller.ts");
 const service=read("hr.service.ts");
 const fileAccess=read("../files/file-business-access.service.ts");
 for(const atom of [
  "HR_PAYROLL_DETAIL_READ","HR_CONTRACT_SALARY_READ","HR_INSURANCE_AMOUNT_READ",
  "HR_EMPLOYEE_DOCUMENT_READ","HR_EMPLOYEE_DOCUMENT_TEAM_READ","HR_EMPLOYEE_DOCUMENT_SELF_READ","HR_EMPLOYEE_DOCUMENT_MANAGE",
  "HR_CONTRACT_DOCUMENT_READ","HR_CONTRACT_DOCUMENT_TEAM_READ","HR_CONTRACT_DOCUMENT_SELF_READ","HR_CONTRACT_DOCUMENT_MANAGE",
 ])assert.match(shared,new RegExp(atom));
 assert.match(controller,/payroll\/runs\/:id\/payslips"\) @RequirePermissions\(HR_PERMISSIONS\.HR_PAYROLL_DETAIL_READ\)/u);
 assert.match(service,/canReadSalary=access\.park&&this\.hasPermission\(actor,HR_PERMISSIONS\.HR_CONTRACT_SALARY_READ\)/u);
 assert.match(service,/fieldGroups:canReadSalary\?\["employment_contract","financial","compensation"\]/u);
 assert.doesNotMatch(fileAccess,/canReadAll=this\.hasPermission\(actor,HR_PERMISSIONS\.HR_EMPLOYEE_PROFILE_READ\)/u);
 assert.doesNotMatch(fileAccess,/parkRead=this\.hasPermission\(actor,HR_PERMISSIONS\.HR_CONTRACT_READ\)/u);
});

test("generic file listing excludes every protected HR type before total is counted",()=>{
 const service=read("../files/files.service.ts");
 const access=read("../files/file-business-access.service.ts");
 assert.match(service,/\{ bizType: Not\(In\(\[\.\.\.PROPERTY_BUSINESS_FILE_TYPES\]\)\) \}/u);
 for(const type of [
  "hr_employee_document","hr_employee_photo","hr_candidate_resume","hr_candidate_offer_evidence",
  "hr_employee_credential_evidence","hr_lifecycle_checklist_evidence","hr_training_certificate",
  "hr_training_evidence","hr_reward_evidence","hr_contract_document",
 ])assert.match(access,new RegExp(`"${type}"`));
});

test("team insurance projection cannot expose amounts without the amount atom",()=>{
 const service=read("hr.service.ts");
 const seed=read("../../../../../database/seeds/production/000016_hr_management_foundation.sql");
 assert.match(service,/canReadAmounts=access==="self"\|\|this\.hasPermission\(actor,HR_PERMISSIONS\.HR_INSURANCE_AMOUNT_READ\)/u);
 assert.match(service,/\.\.\.\(canReadAmounts\?\{employeeAmount:/u);
 assert.match(seed,/\('HR_MANAGER','人力资源负责人','hr:insurance_amount:read'\)/u);
 assert.doesNotMatch(seed,/\('DEPARTMENT_MANAGER','部门负责人','hr:insurance_amount:read'\)/u);
});

test("audit failure sets no download header and never opens the storage stream",async()=>{
 let streamCalls=0;
 const files={
  prepareAuditedDownload:async()=>{throw new Error("required audit unavailable");},
  openReadStream:async()=>{streamCalls+=1;throw new Error("must not open");},
 };
 const controller=new FilesController(files as never,{getId:()=>"request-1"} as never);
 const headers:Array<[string,string|number|readonly string[]]>=[];
 const response={setHeader:(name:string,value:string|number|readonly string[])=>{headers.push([name,value]);}} as unknown as Response;
 const actor={sub:"user-1",username:"tester",tenantId:"tenant-1",parkId:"park-1",roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_READ]} as JwtPrincipal;
 await assert.rejects(controller.download({tenantId:"tenant-1",parkId:"park-1"},actor,"file-1",response),/required audit unavailable/u);
 assert.deepEqual(headers,[]);
 assert.equal(streamCalls,0);
});

test("storage-open failure sets no download header and returns no stream",async()=>{
 let streamCalls=0;
 const files={
  prepareAuditedDownload:async()=>({file:{mimeType:"application/pdf",fileSize:"12",originalName:"payroll.pdf"},absolutePath:"/missing/payroll.pdf"}),
  openReadStream:async()=>{streamCalls+=1;throw new Error("storage unavailable");},
 };
 const controller=new FilesController(files as never,{getId:()=>"request-1"} as never);
 const headers:Array<[string,string|number|readonly string[]]>=[];
 const response={setHeader:(name:string,value:string|number|readonly string[])=>{headers.push([name,value]);}} as unknown as Response;
 const actor={sub:"user-1",username:"tester",tenantId:"tenant-1",parkId:"park-1",roles:[],permissions:[HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_READ]} as JwtPrincipal;
 await assert.rejects(controller.download({tenantId:"tenant-1",parkId:"park-1"},actor,"file-1",response),/storage unavailable/u);
 assert.deepEqual(headers,[]);
 assert.equal(streamCalls,1);
});

test("download headers cannot be injected by legacy filename or MIME metadata",()=>{
 const headers=buildDownloadResponseHeaders({mimeType:"application/pdf\r\nX-Evil: 1",fileSize:"12\r\nX:1",originalName:'薪资"\r\nX-Evil: 1.pdf'});
 assert.equal(headers["Content-Type"],"application/octet-stream");
 assert.equal(headers["Content-Length"],"0");
 assert.doesNotMatch(headers["Content-Disposition"],/[\r\n]/u);
 assert.match(headers["Content-Disposition"],/%0D%0A/u);
});

test("production seed converges HR roles to exact sensitive-read atoms",()=>{
 const seed=read("../../../../../database/seeds/production/000016_hr_management_foundation.sql");
 for(const code of ["hr:payroll_detail:read","hr:contract_salary:read","hr:insurance_amount:read","hr:employee_document:read","hr:contract_document:read"]){
  assert.match(seed,new RegExp(code.replace(":","\\:")));
 }
 assert.match(seed,/Removed by HR foundation exact permission convergence/u);
});
