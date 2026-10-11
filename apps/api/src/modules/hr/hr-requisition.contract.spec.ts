import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root=join(__dirname,"../../../../..");
const read=(path:string)=>readFileSync(join(root,path),"utf8");
test("requisition maintenance exposes scoped detail history options and generic idempotent CAS write",()=>{
 const controller=read("apps/api/src/modules/hr/hr-recruitment.controller.ts"),service=read("apps/api/src/modules/hr/hr-requisition.service.ts");
 for(const route of ["requisitions/:id","requisitions/:id/history","requisitions/:id/reference-options"])assert.match(controller,new RegExp(`@Get\\(\"${route.replaceAll("/","\\/")}\"\\)`));
 assert.match(controller,/@Put\("requisitions\/:id"\) @UseInterceptors\(new IdempotencyInterceptor\(\)\)/);
 assert.match(service,/HR_REQUISITION_VERSION_CONFLICT/);assert.match(service,/HR_REQUISITION_CODE_CONFLICT/);assert.match(service,/FOR UPDATE OF r/);assert.match(service,/recordOperationRequired/);
});
test("requisition history is immutable and validates exact frozen business snapshots",()=>{
 const sql=read("database/migrations/000360_hr_requisition_history.sql");
 for(const key of ["requisitionCode","hiredCount","approvalNote","updatedAt"])assert.match(sql,new RegExp(`'${key}'`));
 assert.match(sql,/before_version>0 AND after_version=before_version\+1/);assert.match(sql,/trg_hr_requisition_history_append_only/);assert.match(sql,/FOREIGN KEY\(tenant_id,park_id,requisition_id\)/);
});
