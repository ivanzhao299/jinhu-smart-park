import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { HrInsurancePeriodQueryDto } from "./dto/hr.dto";
test("insurance employee filter accepts one UUID and rejects malformed/repeated values",()=>{
 const id="11111111-1111-4111-8111-111111111111";
 for(const value of [id,undefined])assert.equal(validateSync(plainToInstance(HrInsurancePeriodQueryDto,{employee_id:value})).length,0);
 for(const value of ["", "employee-name",[id],[id,id],42,{}])assert(validateSync(plainToInstance(HrInsurancePeriodQueryDto,{employee_id:value})).some(e=>e.property==="employee_id"));
});
