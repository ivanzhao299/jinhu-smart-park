import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { HrRecordVersionDto, UpdateHrCredentialRecordDto,UpdateHrExperienceRecordDto,UpdateHrSkillRecordDto } from "./dto/hr-record-maintenance.dto";
const invalid=(dto:typeof HrRecordVersionDto,input:Record<string,unknown>)=>validateSync(plainToInstance(dto,input),{whitelist:true,forbidNonWhitelisted:true}).length>0;
test("record patches enforce domain allowlists, real dates, required names and nullable clear",()=>{
  for(const dto of [UpdateHrExperienceRecordDto,UpdateHrSkillRecordDto,UpdateHrCredentialRecordDto]){
    for(const version of [undefined,null,0,-1,1.5,"1",2147483647])assert.equal(invalid(dto,{expectedVersion:version}),true);
    assert.equal(invalid(dto,{expectedVersion:1,legacy_source_identity_sha256:"override"}),true);
  }
  assert.equal(invalid(UpdateHrExperienceRecordDto,{expectedVersion:1,organizationName:null}),true);
  assert.equal(invalid(UpdateHrExperienceRecordDto,{expectedVersion:1,organizationName:"  "}),true);
  assert.equal(invalid(UpdateHrExperienceRecordDto,{expectedVersion:1,startDate:"2026-02-30"}),true);
  assert.equal(invalid(UpdateHrCredentialRecordDto,{expectedVersion:1,validTo:"0000-01-01"}),true);
  assert.equal(invalid(UpdateHrSkillRecordDto,{expectedVersion:1,acquiredDate:"2026-01-01T00:00:00Z"}),true);
  assert.equal(invalid(UpdateHrSkillRecordDto,{expectedVersion:1,proficiency:"unknown"}),true);
  assert.equal(invalid(UpdateHrSkillRecordDto,{expectedVersion:1,legacyGrade:"a".repeat(65)}),true);
  assert.equal(invalid(UpdateHrSkillRecordDto,{expectedVersion:1,proficiency:null,note:null}),false);
  assert.equal(invalid(UpdateHrCredentialRecordDto,{expectedVersion:1,credentialNumber:null,validTo:null}),false);
  assert.equal(invalid(UpdateHrExperienceRecordDto,{expectedVersion:1,endDate:null,summary:null}),false);
  const patch=plainToInstance(UpdateHrCredentialRecordDto,{expectedVersion:1,credentialName:"  Name  "});assert.equal(patch.credentialName,"Name");assert.equal(patch.credentialNumber,undefined);
  assert.equal(invalid(HrRecordVersionDto,{expectedVersion:1,note:"extra"}),true);
});
