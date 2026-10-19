import assert from "node:assert/strict";
import {test} from "node:test";
import {plainToInstance} from "class-transformer";
import {validateSync} from "class-validator";
import {HrJobChangeListDto} from "./dto/hr-job-change.dto";
test("optional application UUID accepts a single exact ID and rejects malformed or repeated IDs",()=>{
 const id="abcdef00-0000-4000-8000-000000000051";
 for(const value of [undefined,id])assert.deepEqual(validateSync(plainToInstance(HrJobChangeListDto,value===undefined?{}:{application_id:value})),[]);
 for(const value of ["","invalid",[id],[id,id],`${id},${id}`])assert.ok(validateSync(plainToInstance(HrJobChangeListDto,{application_id:value})).some(error=>error.property==="application_id"));
});
