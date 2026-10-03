import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validateSync} from "class-validator";
import {getMetadataArgsStorage} from "typeorm";
import {CreateHrContractDto} from "./dto/hr.dto";
import {HrContractEntity} from "./entities/hr.entities";
import {HrService} from "./hr.service";

const fields=["confidentialityAgreement","nonCompeteAgreement","trainingServiceAgreement"] as const;
const base={employeeId:"00000000-0000-4000-8000-000000000001",contractTypeId:"00000000-0000-4000-8000-000000000002",contractNo:"SYN",startDate:"2090-01-01"};
test("three agreement inputs accept only explicit booleans or omission",()=>{
 for(const field of fields){
  for(const value of [true,false,undefined])assert.equal(validateSync(plainToInstance(CreateHrContractDto,{...base,[field]:value})).length,0);
  for(const value of [null,"true","false",0,1,[],{}])assert.ok(validateSync(plainToInstance(CreateHrContractDto,{...base,[field]:value})).some(e=>e.property===field));
 }
});
test("entity mappings use the existing boolean columns and false defaults",()=>{
 for(const [property,column] of [["confidentialityAgreement","confidentiality_agreement"],["nonCompeteAgreement","non_compete_agreement"],["trainingServiceAgreement","training_service_agreement"]]){
  const metadata=getMetadataArgsStorage().columns.find(c=>c.target===HrContractEntity&&c.propertyName===property);assert.ok(metadata);assert.equal(metadata.options.name,column);assert.equal(metadata.options.type,"boolean");assert.equal(metadata.options.default,false);
 }
});
test("modern payload preserves omitted flags and retains explicit false",()=>{
 const service=Object.create(HrService.prototype);
 const values=Reflect.get(service,"contractValues") as (dto:CreateHrContractDto)=>Record<string,unknown>;
 const omitted=values.call(service,base);for(const field of fields)assert.equal(Object.hasOwn(omitted,field),false);
 const supplied=values.call(service,{...base,confidentialityAgreement:false,nonCompeteAgreement:true,trainingServiceAgreement:false});assert.equal(supplied.confidentialityAgreement,false);assert.equal(supplied.nonCompeteAgreement,true);assert.equal(supplied.trainingServiceAgreement,false);
});
