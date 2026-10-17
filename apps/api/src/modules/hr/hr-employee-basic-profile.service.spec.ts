import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrService } from "./hr.service";
import { HrEmployeeEntity,HrEmployeeProfileEntity } from "./entities/hr.entities";
import { BadRequestException,ValidationPipe } from "@nestjs/common";
import { UpdateHrEmployeeProfileDto } from "./dto/hr.dto";

test("employee identity is encrypted at rest, excluded from write replay, and revealed only by audited read",async()=>{
 let stored:HrEmployeeProfileEntity|null=null,auditCalls=0;
 const employees={findOne:async()=>({id:"00000000-0000-4000-8000-000000000011"})};
 const profiles={findOne:async()=>stored};
 const query={where:()=>query,setLock:()=>query,getMany:async()=>stored?[stored]:[]};
 const profileRepo={createQueryBuilder:()=>query,findOne:async()=>stored,create:(value:object)=>value,save:async(value:HrEmployeeProfileEntity)=>{stored=Object.assign(value,{id:"00000000-0000-4000-8000-000000000021",employeeId:"00000000-0000-4000-8000-000000000011"});return stored;}};
 const dataSource={transaction:async(callback:(manager:{getRepository:(entity:unknown)=>typeof profileRepo|typeof employees})=>unknown)=>callback({getRepository:(entity:unknown)=>entity===HrEmployeeEntity?employees:profileRepo}),query:async()=>[{definitionId:"00000000-0000-4000-8000-000000000031",maintenanceVersion:null,maintainedType:null,maintainedStatus:null,valueEncrypted:null,code:"def1",label:"玉舟扩展字段",valueType:"text",group:"扩展档案",sortOrder:"0",value:"历史值",sourceValid:true}]};
 const sensitive={identityProfile:(value:string)=>({encrypted:`enc:v1:${value}`,masked:"32**************34",hash:`hmac256:${value}`}),decrypt:(value:string|null)=>value?.replace("enc:v1:","")??null};
 const args=Array(33).fill({});args[0]=employees;args[3]=profiles;args[30]=dataSource;args[31]={recordOperationRequired:async()=>{auditCalls+=1;}};args[32]=sensitive;
 const service=Reflect.construct(HrService,args) as HrService,scope={tenantId:"tenant",parkId:"park"},actor={sub:"00000000-0000-4000-8000-000000000001",username:"hr",tenantId:"tenant",parkId:"park",roles:["HR_MANAGER"],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE],isSuper:false};
 const writeResult=await service.updateEmployeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011",{expectedVersion:0,idType:"resident_id",idNumber:" 320812198901011234 ",dateOfBirth:"1989-01-01",heightCm:175,weightKg:70});
 const persisted=stored as HrEmployeeProfileEntity|null;
 assert.equal(persisted?.idNumberEncrypted,"enc:v1:320812198901011234");
 assert.equal(persisted?.idNumberFingerprint,"hmac256:320812198901011234");
 assert.equal("idNumberEncrypted" in writeResult,false);
 assert.equal("idNumber" in writeResult,false);
 const readResult=await service.employeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011");
 assert.equal(readResult?.idNumber,"320812198901011234");
 assert.deepEqual(readResult?.customFields,[{definitionId:"00000000-0000-4000-8000-000000000031",version:0,code:"def1",label:"玉舟扩展字段",valueType:"text",group:"扩展档案",sortOrder:0,value:"历史值",sourceValid:true}]);
 assert.equal("idNumberEncrypted" in (readResult??{}),false);
 assert.equal(auditCalls,1);
 // Omission preserves the encrypted identity; an explicit empty form value clears all three representations.
 await service.updateEmployeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011",{expectedVersion:1,remark:"Changed another field"});
 assert.equal(persisted?.idNumberEncrypted,"enc:v1:320812198901011234");
 assert.equal(persisted?.dateOfBirth,null);assert.equal(persisted?.heightCm,null);
 const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
 const clear=await pipe.transform({expectedVersion:2,idNumber:""},{type:"body",metatype:UpdateHrEmployeeProfileDto});
 const clearResult=await service.updateEmployeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011",clear);
 assert.equal(persisted?.idNumberEncrypted,null);
 assert.equal(persisted?.idNumberMasked,null);
 assert.equal(persisted?.idNumberFingerprint,null);
 assert.equal("idNumber" in clearResult,false);
 assert.equal(clearResult.version,3);
});

test("profile management permission can read the profile it manages",()=>{
 const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
 assert.match(controller,/@Get\("employees\/:id\/profile"\)[^\n]+HR_EMPLOYEE_PROFILE_MANAGE/);
});

test("approved partial profile fulfillment preserves every unsubmitted field and records only submitted fields",async()=>{
 const scope={tenantId:"profile-tenant",parkId:"profile-park"},employeeId="00000000-0000-4000-8000-000000000011",approvalId="00000000-0000-4000-8000-000000000041";
 const stored=Object.assign(new HrEmployeeProfileEntity(),{id:"00000000-0000-4000-8000-000000000021",...scope,employeeId,version:4,isDeleted:false,nativePlace:"Original",englishName:"Retained name",dateOfBirth:"1989-01-01",heightCm:"175.50",highestEducation:"Retained education",homePhone:"synthetic-phone",idNumberEncrypted:"enc:retained",idNumberMasked:"masked",idNumberFingerprint:"fingerprint",sourceSnapshot:{original:"retained"}});
 let fieldNames:string[]=[];
 const query={where:()=>query,setLock:()=>query,getMany:async()=>[stored]};
 const profiles={createQueryBuilder:()=>query,save:async(row:HrEmployeeProfileEntity)=>row};
 const employees={findOne:async()=>({id:employeeId})};
 const manager={getRepository:(entity:unknown)=>entity===HrEmployeeEntity?employees:profiles,query:async(sql:string,params:unknown[])=>{
  if(sql.includes("FROM hr_approval_request"))return [{id:approvalId,subject_employee_id:employeeId,version:1}];
  if(sql.includes("INSERT INTO hr_profile_approval_fulfillment")){fieldNames=JSON.parse(params[8] as string);return [{fulfilled_at:new Date("2026-07-01T00:00:00Z")}];}
  return [];
 }};
 const service=Object.create(HrService.prototype) as HrService;
 Object.assign(service,{dataSource:{transaction:async(callback:(value:typeof manager)=>unknown)=>callback(manager)},sensitiveData:{identityProfile:()=>{throw Error("Unexpected identity change");}}});
 const actor={sub:"00000000-0000-4000-8000-000000000001",username:"synthetic",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE]};
 await service.fulfillApprovedProfile(scope,actor,approvalId,{employeeId,expectedApprovalVersion:1,expectedVersion:4,nativePlace:"Updated"});
 assert.equal(stored.nativePlace,"Updated");assert.equal(stored.englishName,"Retained name");assert.equal(stored.dateOfBirth,"1989-01-01");assert.equal(stored.heightCm,"175.50");assert.equal(stored.highestEducation,"Retained education");assert.equal(stored.homePhone,"synthetic-phone");assert.equal(stored.idNumberEncrypted,"enc:retained");assert.deepEqual(stored.sourceSnapshot,{original:"retained"});assert.equal(stored.version,5);assert.deepEqual(fieldNames,["nativePlace"]);
 await service.fulfillApprovedProfile(scope,actor,approvalId,{employeeId,expectedApprovalVersion:1,expectedVersion:5,nativePlace:null,dateOfBirth:null,heightCm:null,idNumber:null});
 assert.equal(stored.nativePlace,null);assert.equal(stored.dateOfBirth,null);assert.equal(stored.heightCm,null);assert.equal(stored.idNumberEncrypted,null);assert.equal(stored.idNumberMasked,null);assert.equal(stored.idNumberFingerprint,null);assert.equal(stored.englishName,"Retained name");assert.equal(stored.highestEducation,"Retained education");assert.deepEqual(fieldNames,["nativePlace","dateOfBirth","heightCm","idNumber"]);assert.equal(stored.version,6);
 await assert.rejects(service.fulfillApprovedProfile(scope,actor,approvalId,{employeeId,expectedApprovalVersion:1,expectedVersion:6}),BadRequestException);assert.equal(stored.version,6);
});

test("profile DTO preserves explicit null clears and still rejects invalid nonempty numbers",async()=>{
 const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
 const value=await pipe.transform({expectedVersion:1,heightCm:null,weightKg:null,dateOfBirth:null,idType:null,personalEmail:null},{type:"body",metatype:UpdateHrEmployeeProfileDto});
 for(const key of ["heightCm","weightKg","dateOfBirth","idType","personalEmail"])assert.equal(value[key],null);
 const blank=await pipe.transform({expectedVersion:1,heightCm:"",weightKg:""},{type:"body",metatype:UpdateHrEmployeeProfileDto});assert.equal(blank.heightCm,null);assert.equal(blank.weightKg,null);
 for(const input of [{heightCm:0},{weightKg:501},{heightCm:"not-a-number"}])await assert.rejects(pipe.transform({expectedVersion:1,...input},{type:"body",metatype:UpdateHrEmployeeProfileDto}));
});
