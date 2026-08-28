import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,before,describe,it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrEmployeeEntity,HrEmployeeProfileEntity } from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required=process.env.HR_EMPLOYEE_SCOPE_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required");
const suite=required?describe:describe.skip;

suite("HR employee three-role real PostgreSQL scope gate",()=>{
  let db:DataSource,service:HrService;
  const scope={tenantId:"10000001",parkId:"20000001"};
  const ids={
    managerUser:randomUUID(),selfUser:randomUUID(),rootOrg:randomUUID(),childOrg:randomUUID(),siblingOrg:randomUUID(),disabledOrg:randomUUID(),
    manager:randomUUID(),managed:randomUUID(),outsideDirect:randomUUID(),disabledOrgEmployee:randomUUID(),foreignTenant:randomUUID(),foreignPark:randomUUID(),
    deletedOrg:randomUUID(),deletedOrgEmployee:randomUUID()
  };
  const suffix=randomUUID().replaceAll("-","").slice(0,10);
  const actor=(sub:string,permissions:string[]):JwtPrincipal=>({sub,username:`p0-${suffix}`,tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});
  const hrActor=actor(ids.managerUser,[HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ]);
  const managerActor=actor(ids.managerUser,[HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ]);
  const selfActor=actor(ids.selfUser,[HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ]);
  const audits:Array<Record<string,unknown>>=[];

  before(async()=>{
    db=new DataSource({
      type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??5432),
      database:process.env.POSTGRES_DB,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,
      entities:[HrEmployeeEntity,HrEmployeeProfileEntity]
    });
    await db.initialize();
    await db.query(
      "INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$3,$4,$5,$5,'x','enabled'),($2,$3,$4,$6,$6,'x','enabled')",
      [ids.managerUser,ids.selfUser,scope.tenantId,scope.parkId,`p0-manager-${suffix}`,`p0-self-${suffix}`]
    );
    await db.query(
      `INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,leader_user_id,status)
       VALUES($1,$5,$6,NULL,$8,$8,'department',$7,'enabled'),
             ($2,$5,$6,$1,$9,$9,'department',NULL,'enabled'),
             ($3,$5,$6,NULL,$10,$10,'department',NULL,'enabled'),
             ($4,$5,$6,$1,$11,$11,'department',NULL,'disabled')`,
      [ids.rootOrg,ids.childOrg,ids.siblingOrg,ids.disabledOrg,scope.tenantId,scope.parkId,ids.managerUser,`P0-ROOT-${suffix}`,`P0-CHILD-${suffix}`,`P0-SIBLING-${suffix}`,`P0-DISABLED-${suffix}`]
    );
    await db.query(
      `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,manager_employee_id,employment_status,attendance_card_no,remark)
       VALUES($1,$7,$8,$15,'Manager',$9,$11,NULL,'active',$21,'internal'),
             ($2,$7,$8,$16,'Managed',NULL,$12,$1,'active',$22,'internal'),
             ($3,$7,$8,$17,'Outside direct',$10,$13,$1,'active',$23,'internal'),
             ($4,$7,$8,$18,'Disabled org',NULL,$14,$1,'active',$24,'internal'),
             ($5,'foreign-tenant',$8,$19,'Foreign tenant',NULL,$12,$1,'active',$25,'internal'),
             ($6,$7,'foreign-park',$20,'Foreign park',NULL,$12,$1,'active',$26,'internal')`,
      [ids.manager,ids.managed,ids.outsideDirect,ids.disabledOrgEmployee,ids.foreignTenant,ids.foreignPark,scope.tenantId,scope.parkId,ids.managerUser,ids.selfUser,ids.rootOrg,ids.childOrg,ids.siblingOrg,ids.disabledOrg,`P0-M-${suffix}`,`P0-D-${suffix}`,`P0-X-${suffix}`,`P0-Z-${suffix}`,`P0-T-${suffix}`,`P0-P-${suffix}`,...Array.from({length:6},(_,index)=>`P0-${suffix}-${index}-card`)]
    );
    await db.query(
      `INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,status,is_deleted)
       VALUES($1,$2,$3,$4,$5,$5,'department','enabled',true)`,
      [ids.deletedOrg,scope.tenantId,scope.parkId,ids.rootOrg,`P0-DELETED-${suffix}`]
    );
    await db.query(
      `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,manager_employee_id,employment_status,attendance_card_no,remark)
       VALUES($1,$2,$3,$4,'Deleted org',$5,$6,'active',$7,'internal')`,
      [ids.deletedOrgEmployee,scope.tenantId,scope.parkId,`P0-Y-${suffix}`,ids.deletedOrg,ids.manager,`P0-${suffix}-D`]
    );
    await db.query(
      `INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,id_type,id_number_masked,personal_mobile,personal_email,address,emergency_contact_name,emergency_contact_mobile,remark)
       VALUES($1,$2,$3,'resident_id','320812198901011234','13812345678','managed@example.test','private','王小明','13987654321','internal'),
             ($1,$2,$4,'resident_id','320812198901019999','13912345678','self@example.test','private','李小明','13787654321','internal')`,
      [scope.tenantId,scope.parkId,ids.managed,ids.outsideDirect]
    );
    const args=Array(33).fill(undefined);
    args[0]=db.getRepository(HrEmployeeEntity);args[3]=db.getRepository(HrEmployeeProfileEntity);args[30]=db;
    args[31]={recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}};
    args[32]={decrypt:()=>"must-not-be-returned"};
    service=Reflect.construct(HrService,args) as HrService;
  });

  after(async()=>{
    if(!db?.isInitialized)return;
    await db.query("DELETE FROM hr_employee_profile WHERE employee_id=ANY($1::uuid[])",[[ids.managed,ids.outsideDirect]]);
    await db.query("DELETE FROM hr_employee WHERE id=ANY($1::uuid[])",[[ids.manager,ids.managed,ids.outsideDirect,ids.disabledOrgEmployee,ids.foreignTenant,ids.foreignPark,ids.deletedOrgEmployee]]);
    await db.query("DELETE FROM sys_org WHERE id=ANY($1::uuid[])",[[ids.childOrg,ids.disabledOrg,ids.deletedOrg,ids.rootOrg,ids.siblingOrg]]);
    await db.query("DELETE FROM sys_user WHERE id=ANY($1::uuid[])",[[ids.managerUser,ids.selfUser]]);
    await db.destroy();
  });

  it("includes only enabled managed organization descendants and never external direct reports",async()=>{
    const result=await service.listEmployees(scope,managerActor,{page:1,page_size:50});
    assert.deepEqual(result.items.map(row=>row.id),[ids.managed]);
    assert.deepEqual(Object.keys(result.items[0]!).sort(),[
      "departureDate","employeeCode","employmentStatus","employmentType","fullName","hireDate","id","managerEmployeeId",
      "positionId","primaryOrgId","userId","workEmail","workLocation","workMobile"
    ].sort());
    for(const hidden of [ids.outsideDirect,ids.disabledOrgEmployee,ids.deletedOrgEmployee,ids.foreignTenant,ids.foreignPark]){
      await assert.rejects(service.detailEmployeeForActor(scope,managerActor,hidden),NotFoundException);
    }
    const parkResult=await service.listEmployees(scope,hrActor,{page:1,page_size:50});
    assert.deepEqual(new Set(parkResult.items.map(row=>row.id)),new Set([ids.manager,ids.managed,ids.outsideDirect,ids.disabledOrgEmployee,ids.deletedOrgEmployee]));
    for(const crossScope of [ids.foreignTenant,ids.foreignPark]){
      await assert.rejects(service.detailEmployeeForActor(scope,hrActor,crossScope),NotFoundException);
    }
  });

  it("returns audited masked team and self profiles while cross-person and cross-tree reads fail before audit",async()=>{
    const team=await service.employeeProfile(scope,managerActor,ids.managed);
    assert.equal(team?.employeeId,ids.managed);assert.equal(team?.masked,true);assert.equal(team?.personalMobile,"138****5678");
    for(const forbidden of ["idNumber","remark","tenantId","parkId","createBy","attendanceCardNo"]){
      assert.equal(forbidden in (team??{}),false);
    }
    const beforeCross=audits.length;
    await assert.rejects(service.employeeProfile(scope,managerActor,ids.outsideDirect),NotFoundException);
    assert.equal(audits.length,beforeCross);
    const self=await service.myEmployeeProfile(scope,selfActor);
    assert.equal(self?.employeeId,ids.outsideDirect);assert.equal(self?.masked,true);assert.equal(self?.personalEmail,"s***@example.test");
    await assert.rejects(service.employeeProfile(scope,selfActor,ids.managed),NotFoundException);
  });

  it("blocks a sensitive response when required audit persistence fails",async()=>{
    const holder=service as unknown as {auditService:{recordOperationRequired:(input:Record<string,unknown>)=>Promise<void>}};
    const original=holder.auditService;
    holder.auditService={recordOperationRequired:async()=>{throw new Error("audit unavailable");}};
    await assert.rejects(service.employeeProfile(scope,managerActor,ids.managed),/audit unavailable/u);
    holder.auditService=original;
  });
});
