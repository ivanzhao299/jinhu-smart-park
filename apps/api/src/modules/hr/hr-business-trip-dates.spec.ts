import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { EntityManager } from "typeorm";
import { BadRequestException } from "@nestjs/common";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AmendHrBusinessTripDatesDto } from "./dto/hr.dto";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";
import { HrAttendanceRequestEntity } from "./entities/hr.entities";

test("date correction routes require OPERATE, replay interceptor and body-free generic audit",()=>{
 const handler=HrController.prototype.amendBusinessTripDates;
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,handler),[H.HR_ATTENDANCE_OPERATE]);
 assert.ok(Reflect.getMetadata("__interceptors__",handler).some((item:unknown)=>item instanceof IdempotencyInterceptor));
 assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,handler).captureBody,false);
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrController.prototype.businessTripDatesHistory),[H.HR_ATTENDANCE_OPERATE]);
});
test("date amendment rejects malformed dates, imprecise minutes, no offset, missing version/reason",async()=>{
 const valid={startAt:"2026-07-01T00:00:00+08:00",endAt:"2026-07-02T00:00:00+08:00",expectedVersion:1,reason:"synthetic"};
 assert.equal((await validate(plainToInstance(AmendHrBusinessTripDatesDto,valid))).length,0);
 for(const patch of [{expectedVersion:0},{reason:" "},{startAt:"invalid"},{endAt:undefined}])assert.ok((await validate(plainToInstance(AmendHrBusinessTripDatesDto,{...valid,...patch}))).length);
 const service=Reflect.construct(HrService,Array(32).fill(undefined)) as HrService;
 const scope={tenantId:"test",parkId:"test"},actor={...scope,sub:"test",roles:[],permissions:[H.HR_ATTENDANCE_OPERATE]} as unknown as JwtPrincipal;
 for(const patch of [{startAt:"2026-02-30T00:00:00+08:00"},{startAt:"2026-07-01T00:00:01+08:00"},{startAt:"2026-07-01T00:00:00"},{endAt:"2026-09-01T00:00:00+08:00"},{endAt:valid.startAt}])await assert.rejects(service.amendBusinessTripDates(scope,actor,"test",{...valid,...patch}),BadRequestException);
});
test("missing/reversed old endpoints use persisted unknown footprint without enumerating old dates",async()=>{
 // These shapes cannot be inserted under current CHECK constraints. This tests the read boundary only.
 const service=Reflect.construct(HrService,Array(32).fill(undefined)) as HrService;
 const helper=service as unknown as {businessTripDateImpact:(manager:EntityManager,scope:{tenantId:string;parkId:string},row:HrAttendanceRequestEntity,start:Date,end:Date)=>Promise<{dates:string[];months:string[];locks:string[]}>};
 for(const [startAt,endAt] of [[null,null],[new Date("2026-03-02T00:00:00Z"),new Date("2026-03-01T00:00:00Z")]]){
  const queries:unknown[][]=[];
  const manager={query:async(_sql:string,params:unknown[])=>{queries.push(params);return queries.length===1?[{work_date:"2020-01-01"}]:[{month:"2020-01-01"}];}} as unknown as EntityManager;
  const result=await helper.businessTripDateImpact(manager,{tenantId:"t",parkId:"p"},{id:"r",employeeId:"e",startAt,endAt} as HrAttendanceRequestEntity,new Date("2026-07-01T00:00:00+08:00"),new Date("2026-07-02T00:00:00+08:00"));
  assert.equal(queries[0]![3],false);assert.equal(queries[1]![2],false);
  assert.deepEqual(result.dates,["2020-01-01","2026-07-01"]);assert.deepEqual(result.locks,["2020-01-01","2026-06-01","2026-07-01"]);
 }
});
