import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrService } from "./hr.service";
import type { HrEmployeeProfileEntity } from "./entities/hr.entities";

test("employee identity is encrypted at rest, excluded from write replay, and revealed only by audited read",async()=>{
 let stored:HrEmployeeProfileEntity|null=null,auditCalls=0;
 const employees={findOne:async()=>({id:"00000000-0000-4000-8000-000000000011"})};
 const profiles={findOne:async()=>stored};
 const profileRepo={findOne:async()=>stored,create:(value:object)=>value,save:async(value:HrEmployeeProfileEntity)=>{stored=Object.assign(value,{id:"00000000-0000-4000-8000-000000000021",employeeId:"00000000-0000-4000-8000-000000000011"});return stored;}};
 const dataSource={transaction:async(callback:(manager:{getRepository:()=>typeof profileRepo})=>unknown)=>callback({getRepository:()=>profileRepo}),query:async()=>[{code:"def1",label:"玉舟扩展字段",valueType:"text",group:"扩展档案",sortOrder:"0",value:"历史值",sourceValid:true}]};
 const sensitive={identityProfile:(value:string)=>({encrypted:`enc:v1:${value}`,masked:"32**************34",hash:`hmac256:${value}`}),decrypt:(value:string|null)=>value?.replace("enc:v1:","")??null};
 const args=Array(33).fill({});args[0]=employees;args[3]=profiles;args[30]=dataSource;args[31]={recordOperationRequired:async()=>{auditCalls+=1;}};args[32]=sensitive;
 const service=Reflect.construct(HrService,args) as HrService,scope={tenantId:"tenant",parkId:"park"},actor={sub:"00000000-0000-4000-8000-000000000001",username:"hr",tenantId:"tenant",parkId:"park",roles:["HR_MANAGER"],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE],isSuper:false};
 const writeResult=await service.updateEmployeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011",{idType:"resident_id",idNumber:" 320812198901011234 ",dateOfBirth:"1989-01-01",heightCm:175,weightKg:70});
 const persisted=stored as HrEmployeeProfileEntity|null;
 assert.equal(persisted?.idNumberEncrypted,"enc:v1:320812198901011234");
 assert.equal(persisted?.idNumberFingerprint,"hmac256:320812198901011234");
 assert.equal("idNumberEncrypted" in writeResult,false);
 assert.equal("idNumber" in writeResult,false);
 const readResult=await service.employeeProfile(scope,actor,"00000000-0000-4000-8000-000000000011");
 assert.equal(readResult?.idNumber,"320812198901011234");
 assert.deepEqual(readResult?.customFields,[{code:"def1",label:"玉舟扩展字段",valueType:"text",group:"扩展档案",sortOrder:0,value:"历史值",sourceValid:true}]);
 assert.equal("idNumberEncrypted" in (readResult??{}),false);
 assert.equal(auditCalls,1);
});

test("profile management permission can read the profile it manages",()=>{
 const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
 assert.match(controller,/@Get\("employees\/:id\/profile"\)[^\n]+HR_EMPLOYEE_PROFILE_MANAGE/);
});
