import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

const root=resolve(__dirname,"../../../../../"),read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const controller=read("apps/api/src/modules/hr/hr-job-change.controller.ts"),service=read("apps/api/src/modules/hr/hr-job-change.service.ts"),dto=read("apps/api/src/modules/hr/dto/hr-job-change.dto.ts"),migration=read("database/migrations/000354_hr_approved_employment_job_change_fulfillment.sql");

test("approved employment fulfillment is permission-gated, source-versioned, linked and draft-only",()=>{
 for(const atom of ["HR_APPROVAL_PARK_REVIEW","HR_JOB_CHANGE_MANAGE"])assert.match(controller,new RegExp(atom));
 assert.match(controller,/approved-employment-requests/);assert.match(controller,/from-approval\/:id/);assert.match(controller,/IdempotencyInterceptor/);
 assert.match(dto,/expectedApprovalVersion/);assert.match(service,/request_type='employment_change'/);assert.match(service,/r\.status='approved'/);assert.match(service,/FOR UPDATE OF r/);assert.match(service,/source\.subject_employee_id!==d\.employeeId/);assert.match(service,/source\.version.*d\.expectedApprovalVersion/);assert.match(service,/assertLinkedSourceEmployee/);assert.match(service,/must retain the approved employment request employee/);assert.match(service,/createDraft\(m,s,a,d\)/);assert.match(service,/sourceApprovalId/);assert.match(service,/sourceApprovalVersion/);assert.match(service,/recordHrSensitiveRead/);
 assert.match(migration,/uq_hr_job_change_approval_fulfillment_source UNIQUE/);assert.match(migration,/uq_hr_job_change_approval_fulfillment_target UNIQUE/);assert.match(migration,/FOREIGN KEY\(tenant_id,park_id,approval_request_id\)/);assert.match(migration,/FOREIGN KEY\(tenant_id,park_id,job_change_application_id\)/);
 assert.doesNotMatch(service,/UPDATE hr_employee SET[^`]*createFromApproval/);
});

// Route :id identifies the source request; target IDs are recorded by fulfillment history.
test("from-approval operation audit identifies the source approval rather than a job-change ID",()=>{
 const route=controller.split(' @Post("from-approval/:id")')[1]?.split(' @Put(":id")')[0];
 assert.ok(route);
 assert.match(route,/resource:"hr\.approval"/);
 assert.match(route,/bizType:"hr_approval",bizIdParam:"id",captureBody:false/);
 assert.doesNotMatch(route,/bizType:"hr_job_change_application"/);
});
