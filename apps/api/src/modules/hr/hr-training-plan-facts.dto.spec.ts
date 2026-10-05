import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HrTrainingPlanFactsDto, HrTrainingCorrectionDto } from "./dto/hr-training.dto";
test('plan facts DTO rejects null, invalid calendar dates, blank text and absent version',async()=>{
 const base={expectedRevision:0,reason:'Synthetic correction',startDate:'2020-02-29'};
 assert.equal((await validate(plainToInstance(HrTrainingPlanFactsDto,base))).length,0);
 for(const patch of [{expectedRevision:undefined},{expectedRevision:-1},{courseName:null},{courseName:' '},{reason:' '},{startDate:null},{startDate:'2021-02-29'},{startDate:'2021-01-01T00:00:00Z'}])assert.ok((await validate(plainToInstance(HrTrainingPlanFactsDto,{...base,...patch}))).length>0);
});
test('ordinary result correction requires an integer revision and nonblank reason',async()=>{
 const base={expectedRevision:0,correctedScore:'0',reason:'Synthetic review'};
 assert.equal((await validate(plainToInstance(HrTrainingCorrectionDto,base))).length,0);
 for(const patch of [{expectedRevision:undefined},{expectedRevision:-1},{expectedRevision:0.5},{reason:'  '},{reason:'\u0000'},{reason:undefined}])assert.ok((await validate(plainToInstance(HrTrainingCorrectionDto,{...base,...patch}))).length>0);
});

test('nullable result fields accept explicit clear but hours reject null',async()=>{
 const base={expectedRevision:0,reason:'Synthetic clear'};
 for(const patch of [{correctedScore:null},{correctedEvaluation:null},{correctedActualCost:null},{certificateFileId:null},{correctedEvaluation:''}])assert.equal((await validate(plainToInstance(HrTrainingCorrectionDto,{...base,...patch}))).length,0);
 for(const patch of [{correctedHours:null},{correctedScore:''},{correctedActualCost:''},{certificateFileId:''}])assert.ok((await validate(plainToInstance(HrTrainingCorrectionDto,{...base,...patch}))).length>0);
});
