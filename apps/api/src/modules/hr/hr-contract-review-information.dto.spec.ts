import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validateSync} from "class-validator";
import {ReviewHrContractInformationDto} from "./dto/hr.dto";
const input={employeeId:"00000000-0000-4000-8000-000000000001",contractTypeId:"00000000-0000-4000-8000-000000000002",contractNo:"SYN-REVIEW",startDate:"2090-01-01",expectedVersion:1};
const errors=(fields:Record<string,unknown>)=>validateSync(plainToInstance(ReviewHrContractInformationDto,{...input,...fields}),{whitelist:true,forbidNonWhitelisted:true});
test("review requires a strict explicit positive int4 version and inherited field validation",()=>{
 assert.equal(errors({}).length,0);
 for(const expectedVersion of [undefined,null,0,-1,1.5,"1",2147483648])assert.ok(errors({expectedVersion}).some(e=>e.property==="expectedVersion"));
 assert.equal(errors({expectedVersion:2147483647}).length,0);
 for(const fields of [{startDate:"invalid"},{employeeId:"invalid"},{sourceSnapshot:{}},{confidentialityAgreement:null}])assert.ok(errors(fields).length);
});
