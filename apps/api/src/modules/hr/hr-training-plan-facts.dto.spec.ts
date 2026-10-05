import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HrTrainingPlanFactsDto } from "./dto/hr-training.dto";
test('plan facts DTO rejects null, invalid calendar dates, blank text and absent version',async()=>{
 const base={expectedRevision:0,reason:'Synthetic correction',startDate:'2020-02-29'};
 assert.equal((await validate(plainToInstance(HrTrainingPlanFactsDto,base))).length,0);
 for(const patch of [{expectedRevision:undefined},{expectedRevision:-1},{courseName:null},{courseName:' '},{reason:' '},{startDate:null},{startDate:'2021-02-29'},{startDate:'2021-01-01T00:00:00Z'}])assert.ok((await validate(plainToInstance(HrTrainingPlanFactsDto,{...base,...patch}))).length>0);
});
