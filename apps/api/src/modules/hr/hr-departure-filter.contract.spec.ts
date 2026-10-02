import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrDepartureService } from "./hr-departure.service";
import { HrDepartureListDto } from "./dto/hr-departure.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
const employeeId="00000000-0000-4000-8000-000000000011";
test("exact employee filter only narrows all three role scopes and count/page agree",async()=>{
 for(const permission of [HR_PERMISSIONS.HR_DEPARTURE_READ,HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ,HR_PERMISSIONS.HR_DEPARTURE_SELF_READ]){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const service=Object.create(HrDepartureService.prototype) as HrDepartureService;
  Object.assign(service,{db:{query:async(sql:string,params:unknown[])=>{calls.push({sql,params:[...params]});return sql.startsWith("SELECT count")?[{total:113}]:[]}},audit:{recordOperationRequired:async()=>{}}});
  const actor={sub:"actor",username:"test",roles:[],permissions:[permission]} as unknown as JwtPrincipal;
  const result=await service.list({tenantId:"tenant",parkId:"park"},actor,plainToInstance(HrDepartureListDto,{employee_id:employeeId,page:3,page_size:50}));
  assert.equal(result.total,113);assert.equal(result.page,3);assert.equal(calls.length,2);
  for(const call of calls){assert.match(call.sql,/d.tenant_id=\$1 AND d.park_id=\$2/);assert.match(call.sql,/d.subject_employee_id=\$\d/);assert.equal(call.params.includes(employeeId),true);if(permission===HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ)assert.match(call.sql,/e.primary_org_id IN/);if(permission===HR_PERMISSIONS.HR_DEPARTURE_SELF_READ)assert.match(call.sql,/d.applicant_user_id=\$3 OR e.user_id=\$3/)}
  assert.deepEqual(calls[1]!.params.slice(-2),[50,100]);
 }
});
test("invalid employee filter is rejected by the DTO",async()=>{assert.ok((await validate(plainToInstance(HrDepartureListDto,{employee_id:"E-1"}))).length);assert.equal((await validate(plainToInstance(HrDepartureListDto,{employee_id:employeeId}))).length,0)});
