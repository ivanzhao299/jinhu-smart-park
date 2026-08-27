import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const actor={sub:"user-1",username:"hr-admin",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ],isSuper:false} as JwtPrincipal;

function service(rows:Array<Record<string,unknown>>,audit:()=>Promise<void>=async()=>undefined){
 const calls:Array<{sql:string;params:unknown[]}>=[];
 const target={
  dataSource:{query:async(sql:string,params:unknown[])=>{calls.push({sql,params});return rows;}},
  auditService:{recordOperationRequired:audit},
 };
 return {calls,run:(query:{from:string;to:string})=>HrService.prototype.employmentEventStatistics.call(target as never,scope,actor,query)};
}

test("employment-event statistics use one scoped aggregate snapshot and stable projections",async()=>{
 const fixture=[{total:7,employee_count:4,historical_count:5,online_count:2,byType:[{eventType:"transfer",count:4},{eventType:"depart",count:3}],byMonth:[{month:"2026-01",count:2},{month:"2026-02",count:5}]}];
 const {calls,run}=service(fixture);
 assert.deepEqual(await run({from:"2026-01-01",to:"2026-12-31"}),{from:"2026-01-01",to:"2026-12-31",total:7,employeeCount:4,historicalCount:5,onlineCount:2,byType:fixture[0]!.byType,byMonth:fixture[0]!.byMonth});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0]!.params,[scope.tenantId,scope.parkId,"2026-01-01","2026-12-31"]);
 assert.match(calls[0]!.sql,/tenant_id=\$1 AND park_id=\$2 AND is_deleted=false/);
 assert.match(calls[0]!.sql,/count\(DISTINCT employee_id\)/);
 assert.doesNotMatch(calls[0]!.sql,/full_name|employee_code|reason|before_snapshot|after_snapshot/);
});

test("invalid ranges fail before querying and required audit failure blocks response",async()=>{
 const invalid=service([]);
 await assert.rejects(invalid.run({from:"2026-12-31",to:"2026-01-01"}),/date range is invalid/u);
 assert.equal(invalid.calls.length,0);
 const auditFailure=service([{total:0,employee_count:0,historical_count:0,online_count:0,byType:[],byMonth:[]}],async()=>{throw new Error("required audit unavailable");});
 await assert.rejects(auditFailure.run({from:"2026-01-01",to:"2026-12-31"}),/required audit unavailable/u);
});

test("statistics route requires the exact employment-event read permission",()=>{
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.employmentEventStatistics),[HR_PERMISSIONS.HR_EMPLOYMENT_EVENT_READ]);
});
