import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HrService } from "./hr.service";
import { HrEmployeeEntity, HrEmploymentEventEntity } from "./entities/hr.entities";
import { UpdateHrEmployeeBasicInformationDto, UpdateHrEmployeeDto } from "./dto/hr.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("ordinary employee DTO rejects missing versions and protected/invalid fields", async () => {
 const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
 const parse=(body:object)=>pipe.transform(body,{type:"body",metatype:UpdateHrEmployeeBasicInformationDto});
 for(const body of [{fullName:"Name"},{expectedVersion:0},{expectedVersion:1,fullName:null},{expectedVersion:1,fullName:"  "},{expectedVersion:1,fullName:"\u200b"},{expectedVersion:1,fullName:"1234"},
  {expectedVersion:1,employmentType:null},{expectedVersion:1,employmentStatus:"departed"},{expectedVersion:1,userId:randomUUID()},
  {expectedVersion:1,hireDate:"2026-02-30"},{expectedVersion:1,hireDate:"2026-01-01T10:00:00Z"},{expectedVersion:1,workEmail:"invalid"}])await assert.rejects(parse(body));
 const result=await parse({expectedVersion:1,fullName:" Name ",hireDate:null,workEmail:null});assert.equal(result.fullName,"Name");assert.equal(result.hireDate,null);
 await assert.rejects(pipe.transform({employeeCode:"SYN",fullName:"Name"},{type:"body",metatype:UpdateHrEmployeeDto}));
});

test("formal employee basic editing in isolated PostgreSQL",{skip:process.env.HR_EMPLOYEE_BASIC_PG_REQUIRED!=="1",timeout:60_000},async t=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.ok([55491,55497].includes(Number(process.env.POSTGRES_PORT)));assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_basic_${randomUUID().replaceAll("-","")}`;
 const db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,schema,uuidExtension:"pgcrypto",installExtensions:false,entities:[HrEmployeeEntity,HrEmploymentEventEntity]});
 await db.initialize();
 const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},actor={sub:randomUUID()} as JwtPrincipal;
 try{
  await db.query(`CREATE SCHEMA "${schema}"`);await db.synchronize();
  const employees=db.getRepository(HrEmployeeEntity),events=db.getRepository(HrEmploymentEventEntity),service=Object.create(HrService.prototype) as HrService;
  Object.assign(service,{dataSource:db,employees});
  const employee=()=>employees.save(employees.create({...scope,employeeCode:`SYN-${randomUUID()}`,fullName:"Synthetic original",employmentType:"full_time",employmentStatus:"active",userId:randomUUID(),primaryOrgId:randomUUID(),positionId:randomUUID(),managerEmployeeId:randomUUID(),hireDate:"2020-01-01",workMobile:"synthetic-phone",workLocation:"Synthetic work",workEmail:"synthetic@example.invalid",remark:"Synthetic remark"}));
  await t.test("edit ordinary fields preserves all omitted facts and relationships with audit",async()=>{
   const row=await employee();const read=await service.employeeBasicInformation(scope,row.id);assert.equal(read.version,1);assert.equal(read.remark,row.remark);assert.equal("userId" in read,false);
   const saved=await service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:1,fullName:"Synthetic revised",workLocation:"New work"});
   const after=await employees.findOneByOrFail({id:row.id});assert.equal(saved.version,2);assert.equal(after.fullName,"Synthetic revised");
   for(const key of ["userId","primaryOrgId","positionId","managerEmployeeId","employmentStatus","hireDate","workMobile","workEmail","remark"] as const)assert.equal(after[key],row[key]);
   const event=await events.findOneByOrFail({employeeId:row.id});assert.equal(event.beforeSnapshot.workLocation,"Synthetic work");assert.equal(event.afterSnapshot.workLocation,"New work");assert.equal(event.eventType,"profile_updated");
  });
  await t.test("explicit nullable clear changes only submitted fields",async()=>{
   const row=await employee();await service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:1,hireDate:null,workEmail:null,remark:null});
   const after=await employees.findOneByOrFail({id:row.id});assert.equal(after.hireDate,null);assert.equal(after.workEmail,null);assert.equal(after.remark,null);assert.equal(after.managerEmployeeId,row.managerEmployeeId);assert.equal(after.workMobile,row.workMobile);
  });
  await t.test("old PUT also preserves omitted links and requires a matching version",async()=>{
   const row=await employee();await service.updateEmployee(scope,actor,row.id,{expectedVersion:1,employeeCode:row.employeeCode,fullName:"Synthetic legacy route"});
   const after=await employees.findOneByOrFail({id:row.id});assert.equal(after.version,2);assert.equal(after.userId,row.userId);assert.equal(after.primaryOrgId,row.primaryOrgId);assert.equal(after.managerEmployeeId,row.managerEmployeeId);assert.equal(after.workMobile,row.workMobile);assert.equal(after.employmentStatus,"active");
   await assert.rejects(service.updateEmployee(scope,actor,row.id,{expectedVersion:1,employeeCode:row.employeeCode,fullName:"Stale overwrite"}),/changed/);assert.equal(await events.countBy({employeeId:row.id}),1);
  });
  await t.test("stale/missing version and foreign/deleted targets cause no writes",async()=>{
   const row=await employee();
   for(const expectedVersion of [0,undefined,2])await assert.rejects(service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion,fullName:"Rejected"} as UpdateHrEmployeeBasicInformationDto));
   await assert.rejects(service.employeeBasicInformation({...scope,tenantId:"foreign"},row.id));
   await assert.rejects(service.updateEmployeeBasicInformation({...scope,parkId:"foreign"},actor,row.id,{expectedVersion:1,fullName:"Rejected"}));
   assert.equal((await employees.findOneByOrFail({id:row.id})).fullName,row.fullName);assert.equal(await events.countBy({employeeId:row.id}),0);
   await employees.update(row.id,{isDeleted:true});await assert.rejects(service.employeeBasicInformation(scope,row.id));await assert.rejects(service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:2,fullName:"Rejected"}));
  });
  await t.test("independent transactions allow one concurrent winner and one conflict",async()=>{
   const row=await employee();const results=await Promise.allSettled(["One","Two"].map(fullName=>service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:1,fullName})));
   assert.equal(results.filter(result=>result.status==="fulfilled").length,1);assert.equal(results.filter(result=>result.status==="rejected").length,1);assert.equal((await employees.findOneByOrFail({id:row.id})).version,2);assert.equal(await events.countBy({employeeId:row.id}),1);
  });
  await t.test("no-op accepted update advances the version once",async()=>{
   const row=await employee();await service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:1,fullName:row.fullName});await service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:2,fullName:row.fullName});assert.equal((await employees.findOneByOrFail({id:row.id})).version,3);
  });
  await t.test("actual event insert failure rolls back fields and version",async()=>{
   const row=await employee();await db.query(`ALTER TABLE "${schema}".hr_employment_event ADD CONSTRAINT synthetic_basic_failure CHECK(employee_id <> '${row.id}'::uuid)`);
   await assert.rejects(service.updateEmployeeBasicInformation(scope,actor,row.id,{expectedVersion:1,fullName:"Rolled back"}));
   const after=await employees.findOneByOrFail({id:row.id});assert.equal(after.fullName,row.fullName);assert.equal(after.version,1);assert.equal(await events.countBy({employeeId:row.id}),0);
  });
 }finally{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.destroy();}
});
