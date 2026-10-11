import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { CreateHrBusinessTripMonthAllocationDto } from "./dto/hr.dto";
import { HrController } from "./hr.controller";
import { businessTripAllocationMonths, validateBusinessTripAllocation } from "./hr-business-trip-month-allocation";
import { parsePayrollFormula } from "./hr-payroll-formula-dsl";
import { projectApprovedTripDeclaredDaysPayrollInput } from "./hr-payroll-attendance-input";

test("allocation routes preserve operation permission, replay interceptor and body-free audit", () => {
  for (const handler of [HrController.prototype.allocateBusinessTripMonth,HrController.prototype.businessTripMonthAllocation,HrController.prototype.businessTripMonthAllocationHistory]) assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,handler),[H.HR_ATTENDANCE_OPERATE]);
  const handler=HrController.prototype.allocateBusinessTripMonth;
  assert.ok(Reflect.getMetadata("__interceptors__",handler).some((item:unknown)=>item instanceof IdempotencyInterceptor));
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,handler).captureBody,false);
});
test("Shanghai half-open options include three actual months and exclude exact end boundary",()=>{
  assert.deepEqual(businessTripAllocationMonths(new Date("2026-01-31T12:00:00+08:00"),new Date("2026-03-01T12:00:00+08:00")),["2026-01","2026-02","2026-03"]);
  assert.deepEqual(businessTripAllocationMonths(new Date("2026-07-31T23:00:00+08:00"),new Date("2026-08-01T00:00:00+08:00")),["2026-07"]);
  assert.deepEqual(businessTripAllocationMonths(new Date("2026-12-31T23:00:00+08:00"),new Date("2027-01-01T00:00:00.001+08:00")),["2026-12","2027-01"]);
  for(const [start,end] of [[null,new Date()],[new Date("invalid"),new Date()],[new Date(10),new Date(9)],[new Date("2026-01-01"),new Date("2026-05-01")]] as const) assert.throws(()=>businessTripAllocationMonths(start,end));
});
test("allocation accepts explicit zero but rejects missing/negative source, duplicate/omitted months, fractional values and totals", async()=>{
  const months=["2026-07","2026-08"],valid=[{month:"2026-07",days:0},{month:"2026-08",days:3}];
  assert.deepEqual(validateBusinessTripAllocation(months,3,[...valid].reverse()),valid);
  for(const source of [null,undefined,-1,0.5])assert.throws(()=>validateBusinessTripAllocation(months,source,valid));
  for(const input of [[valid[0]], [valid[0],valid[0]], [...valid,{month:"2026-09",days:0}], [{month:"2026-07",days:1},valid[1]], [{month:"2026-07",days:0.5},valid[1]], [{month:"2026-07",days:-1},valid[1]]])assert.throws(()=>validateBusinessTripAllocation(months,3,input));
  const dto={expectedVersion:1,reason:"explicit fact",allocations:valid};
  assert.equal((await validate(plainToInstance(CreateHrBusinessTripMonthAllocationDto,dto))).length,0);
  assert.ok((await validate(plainToInstance(CreateHrBusinessTripMonthAllocationDto,{...dto,allocations:[{month:"2026-13",days:-1}]}))).length);
});
test("declared-day reference requires v5/manual review while v1-v4 evidence stays stable",()=>{
  for(const [expression,version] of [["1","v1"],["[人事系统.养老保险个人金额]","v2"],["[人事系统.批准请假分钟]","v3"],["[人事系统.批准出差区间分钟]","v4"],["[人事系统.批准出差申报天数]","v5"]]){
    const parsed=parsePayrollFormula(expression!);assert.equal(parsed.parserVersion,`jinhu-payroll-dsl-${version}`);if(version!=="v1")assert.equal(parsed.status,"manual_review");
  }
  assert.equal(projectApprovedTripDeclaredDaysPayrollInput("4294967294"),"4294967294.0000");
  for(const value of [null,undefined,-1,"1.5","9223372036854775808",9007199254740992])assert.throws(()=>projectApprovedTripDeclaredDaysPayrollInput(value));
});
