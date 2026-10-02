import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validateSync} from "class-validator";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrContractReminderQueryDto} from "./dto/hr-contract-reminder.dto";
import {HrContractReminderService} from "./hr-contract-reminder.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const scope={tenantId:"tenant",parkId:"park"};
const actor=(permissions:string[]):JwtPrincipal=>({sub:"user",username:"synthetic",roles:[],permissions,tenantId:scope.tenantId,parkId:scope.parkId});
test("reminder filters validate closed enums and numeric windows",()=>{
 assert.equal(validateSync(plainToInstance(HrContractReminderQueryDto,{kind:"probation_expiry",window_days:"60",page:"3",page_size:"50"})).length,0);
 for(const fields of [{kind:"unknown"},{window_days:"61"},{window_days:""},{page:"0"},{page_size:"101"}])assert.ok(validateSync(plainToInstance(HrContractReminderQueryDto,fields)).length);
});
test("self reminder count, summary and rows preserve scope while filters precede pagination",async()=>{
 const calls:Array<{sql:string;values:unknown[]}>=[];let audits=0;
 const db={query:async(sql:string,values:unknown[])=>{calls.push({sql,values:[...values]});if(sql.includes("count(*)"))return [{n:calls.length===1?113:63}];return [{id:"r",contract_id:"c",employee_id:"e",reminder_kind:"probation_expiry",window_days:30,due_date:"2026-10-10",status:"open",recipient_user_id:"user"}];}};
 const service=new HrContractReminderService(db as never,{recordOperationRequired:async()=>{audits++;}} as never);
 const result=await service.list(scope,actor([HR_PERMISSIONS.HR_CONTRACT_REMINDER_SELF_READ]),plainToInstance(HrContractReminderQueryDto,{status:"open",kind:"probation_expiry",window_days:30,page:2,page_size:50}));
 assert.equal(result.total,63);assert.equal(result.active_sixty_day_total,113);assert.equal(result.page,2);assert.equal(audits,1);
 for(const call of calls){assert.match(call.sql,/r.tenant_id=\$1 AND r.park_id=\$2 AND r.recipient_user_id=\$3/);assert.deepEqual(call.values.slice(0,3),["tenant","park","user"]);}
 assert.deepEqual(calls[1]!.values,["tenant","park","user","open","probation_expiry",30]);
 assert.deepEqual(calls[2]!.values,["tenant","park","user","open","probation_expiry",30,50,50]);
 assert.match(calls[1]!.sql,/r.status=\$4 AND r.reminder_kind=\$5 AND r.window_days=\$6/);
 assert.match(calls[2]!.sql,/r.status=\$4 AND r.reminder_kind=\$5 AND r.window_days=\$6/);
 assert.doesNotMatch(calls[0]!.sql,/r.status=\$4/);assert.match(calls[0]!.sql,/NOT IN\('resolved','cancelled'\)/);
});
test("denied reminder reads do not query a count or summary",async()=>{
 const service=new HrContractReminderService({query:async()=>{throw new Error("unexpected read");}} as never,{} as never);
 assert.deepEqual(await service.list(scope,actor([]),new HrContractReminderQueryDto()),{items:[],total:0,page:1,page_size:20,active_sixty_day_total:0});
});

test("managed-tree filters and KPI retain both employee tree and recipient constraints",async()=>{
 const calls:Array<{sql:string;values:unknown[]}>=[];
 const db={query:async(sql:string,values:unknown[])=>{calls.push({sql,values:[...values]});if(sql.includes("SELECT id FROM hr_employee"))return [{id:"manager"}];if(sql.includes("WITH RECURSIVE"))return [{id:"managed"}];if(sql.includes("count(*)"))return [{n:1}];return [];}};
 const service=new HrContractReminderService(db as never,{recordOperationRequired:async()=>{}} as never);
 await service.list(scope,actor([HR_PERMISSIONS.HR_CONTRACT_REMINDER_TEAM_READ]),plainToInstance(HrContractReminderQueryDto,{kind:"contract_expiry",window_days:60}));
 for(const call of calls.filter(item=>item.sql.includes("FROM hr_contract_reminder"))){assert.match(call.sql,/r.employee_id=ANY\(\$3::uuid\[\]\) AND r.recipient_user_id=\$4/);assert.deepEqual(call.values.slice(0,4),["tenant","park",["managed"],"user"]);}
});
