import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const actor={sub:"user-1",username:"hr-manager",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_DECISION_CENTER_PAGE],isSuper:false} as JwtPrincipal;

function service(rows:Array<Record<string,unknown>>,audit:()=>Promise<void>=async()=>undefined){
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const target={dataSource:{query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return rows;}},auditService:{recordOperationRequired:audit}};
 return {calls,run:(query:{from:string;to:string})=>HrService.prototype.workforceDecisionSnapshot.call(target as never,scope,actor,query)};
}

test("workforce decision snapshot is one scoped aggregate without employee or position identifiers",async()=>{
 const fixture=[{employee_total:8,active_headcount:6,byStatus:[{status:"active",count:6},{status:"departed",count:2}],byType:[{type:"full_time",count:7},{type:"part_time",count:1}],position_total:4,configured_position_count:3,unconfigured_position_count:1,headcount_limit:8,active_assigned_headcount:5,active_unassigned_headcount:1,vacancy_count:2,over_capacity_position_count:1,total:5,employee_count:4,historical_count:3,online_count:2,eventByType:[{eventType:"transfer",count:5}],eventByMonth:[{month:"2026-08",count:5}]}];
 const {calls,run}=service(fixture);
 assert.deepEqual(await run({from:"2026-01-01",to:"2026-12-31"}),{from:"2026-01-01",to:"2026-12-31",employeeTotal:8,activeHeadcount:6,byStatus:fixture[0]!.byStatus,byType:fixture[0]!.byType,staffing:{positionTotal:4,configuredPositionCount:3,unconfiguredPositionCount:1,headcountLimit:8,activeAssignedHeadcount:5,activeUnassignedHeadcount:1,vacancyCount:2,overCapacityPositionCount:1},employmentEvents:{total:5,employeeCount:4,historicalCount:3,onlineCount:2,byType:fixture[0]!.eventByType,byMonth:fixture[0]!.eventByMonth}});
 assert.equal(calls.length,1);assert.deepEqual(calls[0]!.params,[scope.tenantId,scope.parkId,"2026-01-01","2026-12-31"]);
 assert.match(calls[0]!.sql,/tenant_id=\$1 AND park_id=\$2 AND is_deleted=false/);assert.match(calls[0]!.sql,/migration_decision='accepted'/);assert.match(calls[0]!.sql,/count\(DISTINCT employee_id\)/);assert.match(calls[0]!.sql,/hr_position/);assert.match(calls[0]!.sql,/headcount_limit/);assert.match(calls[0]!.sql,/employment_status IN \('active','probation'\)/);assert.match(calls[0]!.sql,/status='enabled'/);
 assert.doesNotMatch(calls[0]!.sql,/full_name|employee_code|work_mobile|work_email|reason|before_snapshot|after_snapshot|position_code|position_name|org_name/);
});

test("workforce decision snapshot fails closed for invalid ranges and audit failure",async()=>{
 const invalid=service([]);await assert.rejects(invalid.run({from:"2026-12-31",to:"2026-01-01"}),/date range is invalid/u);assert.equal(invalid.calls.length,0);
 const auditFailure=service([{employee_total:0,active_headcount:0,byStatus:[],byType:[],total:0,employee_count:0,historical_count:0,online_count:0,eventByType:[],eventByMonth:[]}],async()=>{throw new Error("required audit unavailable");});
 await assert.rejects(auditFailure.run({from:"2026-01-01",to:"2026-12-31"}),/required audit unavailable/u);
});

test("workforce decision route requires only its dedicated aggregate permission",()=>{
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.workforceDecisionSnapshot),[HR_PERMISSIONS.HR_DECISION_CENTER_PAGE]);
});
