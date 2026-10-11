import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SaveHrRequisitionDto } from "./dto/hr-recruitment.dto";
import { HrRequisitionService } from "./hr-requisition.service";

const scope={tenantId:"tenant",parkId:"park"};
const actor={sub:"00000000-0000-4000-8000-000000000001",permissions:[HR_PERMISSIONS.HR_REQUISITION_READ,HR_PERMISSIONS.HR_REQUISITION_MANAGE],isSuper:false};
const row={id:"00000000-0000-4000-8000-000000000010",version:1,requisitionCode:"REQ-1",title:"合成岗位",orgId:"00000000-0000-4000-8000-000000000011",orgName:"组织",positionId:null,positionName:null,headcount:2,hiredCount:0,ownerUserId:"00000000-0000-4000-8000-000000000012",ownerName:"负责人",plannedOnboardDate:null,status:"draft",approvalNote:null,updatedAt:"2026-10-11T00:00:00.000Z"};

test("requisition stale CAS has the stable marker and writes no history",async()=>{
 const calls:string[]=[];const manager={query:async(sql:string)=>{calls.push(sql);return [row];}};
 const service=new HrRequisitionService({transaction:async(fn:(m:unknown)=>unknown)=>fn(manager)} as never,{} as never);
 await assert.rejects(service.update(scope,actor as never,row.id,{expectedVersion:2,changeReason:"合成陈旧",title:"新标题"}),error=>error instanceof ConflictException&&error.message==="HR_REQUISITION_VERSION_CONFLICT");
 assert.equal(calls.length,1);assert.match(calls[0]!,/FOR UPDATE OF r/);assert.ok(!calls.some(sql=>sql.includes("hr_requisition_history")));
});

test("requisition edit requires both read and manage before SQL",async()=>{
 let called=false;const service=new HrRequisitionService({transaction:async()=>{called=true;}} as never,{} as never);
 await assert.rejects(service.update(scope,{...actor,permissions:[HR_PERMISSIONS.HR_REQUISITION_MANAGE]} as never,row.id,{expectedVersion:1,changeReason:"缺少读",title:"新标题"}),ForbiddenException);
 assert.equal(called,false);
});

test("requisition DTO rejects nonnullable nulls and blank identity fields",async()=>{
 for(const input of [{requisitionCode:null},{title:" "},{orgId:null},{ownerUserId:null},{headcount:null},{status:null}])assert.ok((await validate(plainToInstance(SaveHrRequisitionDto,{expectedVersion:1,changeReason:"合成",...input}),{whitelist:true,forbidNonWhitelisted:true})).length>0,JSON.stringify(input));
});

test("requisition lifecycle has stable definite business conflict markers",async()=>{
 const hired={...row,status:"paused",headcount:1,hiredCount:1};const manager={query:async()=>[hired]};const service=new HrRequisitionService({transaction:async(fn:(m:unknown)=>unknown)=>fn(manager)} as never,{} as never);
 await assert.rejects(service.update(scope,actor as never,hired.id,{expectedVersion:1,changeReason:"无余量重开",status:"open"}),error=>error instanceof ConflictException&&error.message==="HR_REQUISITION_HEADCOUNT_CONFLICT");
 await assert.rejects(service.update(scope,actor as never,hired.id,{expectedVersion:1,changeReason:"已录用改岗",orgId:"00000000-0000-4000-8000-000000000099"}),error=>error instanceof ConflictException&&error.message==="HR_REQUISITION_HIRED_REFERENCE_CONFLICT");
 const cancelled={...row,status:"cancelled"};const cancelledService=new HrRequisitionService({transaction:async(fn:(m:unknown)=>unknown)=>fn({query:async()=>[cancelled]})} as never,{} as never);
 await assert.rejects(cancelledService.update(scope,actor as never,cancelled.id,{expectedVersion:1,changeReason:"终态编辑",title:"不得编辑"}),error=>error instanceof ConflictException&&error.message==="HR_REQUISITION_STATE_CONFLICT");
});
