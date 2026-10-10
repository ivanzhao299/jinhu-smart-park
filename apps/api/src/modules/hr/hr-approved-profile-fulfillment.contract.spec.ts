import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root=resolve(__dirname,"../../../../../");
const read=(file:string)=>readFileSync(resolve(root,file),"utf8");

test("approved profile fulfillment keeps the source, profile and receipt in one scoped contract",()=>{
 const controller=read("apps/api/src/modules/hr/hr.controller.ts");
 const service=read("apps/api/src/modules/hr/hr.service.ts");
 const migration=read("database/migrations/000355_hr_approved_profile_fulfillment.sql");
 assert.match(controller,/@Get\("approvals\/profile-fulfillments"\)[\s\S]{0,220}HR_APPROVAL_PARK_REVIEW[\s\S]{0,160}HR_EMPLOYEE_PROFILE_MANAGE/);
 assert.match(controller,/@Post\("approvals\/:id\/profile-fulfillment"\)[\s\S]{0,220}IdempotencyInterceptor[\s\S]{0,280}captureBody:false/);
 assert.match(service,/private async saveEmployeeProfile\(manager:EntityManager/);
 assert.match(service,/request_type='profile_change'[\s\S]{0,120}status='approved'[\s\S]{0,120}FOR UPDATE/);
 assert.match(service,/source\.subject_employee_id!==dto\.employeeId/);
 assert.match(service,/source\.version\)!==dto\.expectedApprovalVersion/);
 assert.match(service,/hr_profile_approval_fulfillment[\s\S]{0,300}saveEmployeeProfile[\s\S]{0,900}INSERT INTO hr_profile_approval_fulfillment/s);
 assert.match(service,/fieldNames=Object\.keys\(dto\)[\s\S]{0,260}expectedVersion/);
 assert.match(migration,/uq_hr_profile_approval_fulfillment_source/);
 assert.match(migration,/uq_hr_profile_approval_fulfillment_profile_version/);
 assert.match(migration,/hr_approval_request[\s\S]{0,900}uq_hr_approval_request_scope_id/);
 assert.match(migration,/pg_index[\s\S]{0,300}indisunique[\s\S]{0,300}indpred IS NULL[\s\S]{0,300}indnkeyatts=3/);
 assert.match(migration,/attname='tenant_id'[\s\S]{0,180}attname='park_id'[\s\S]{0,180}attname='id'/);
 assert.match(migration,/fk_hr_profile_approval_fulfillment_source[\s\S]{0,180}hr_approval_request/);
 assert.match(migration,/fk_hr_profile_approval_fulfillment_employee[\s\S]{0,160}hr_employee/);
 assert.match(migration,/fk_hr_profile_approval_fulfillment_profile[\s\S]{0,180}hr_employee_profile/);
});
