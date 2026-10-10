import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ReviseHrApprovalDto } from "./dto/hr.dto";
import { HrApprovalActionEntity, HrApprovalRequestEntity, HrEmployeeEntity } from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required=process.env.HR_APPROVAL_REVISION_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the approval revision PostgreSQL gate");

test("approval revision DTO requires a current version and non-empty content reason",async()=>{
 const valid=plainToInstance(ReviseHrApprovalDto,{expectedVersion:1,title:"Returned request",description:"Corrected description",reason:"Addressed reviewer feedback"});
 assert.equal((await validate(valid)).length,0);
 const invalid=plainToInstance(ReviseHrApprovalDto,{expectedVersion:0,title:" ",description:"",reason:""});
 assert.ok((await validate(invalid)).length>0);
});

test("approval content revisions preserve predecessor actions and scope history in isolated PostgreSQL",{skip:!required,timeout:60_000},async()=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
 assert.equal(process.env.POSTGRES_PORT,"55497");
 assert.equal(process.env.POSTGRES_DB,"postgres");
 const schema=`hr_approval_revision_${randomUUID().replaceAll("-","")}`;
 const connection={type:"postgres" as const,host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,schema,uuidExtension:"uuid-ossp" as const,installExtensions:false};
 const setup=new DataSource({...connection,entities:[HrEmployeeEntity]});
 let db:DataSource|undefined;
 const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
 const actor=(sub:string,permissions:string[]=[]):JwtPrincipal=>({sub,username:`approval-${sub.slice(0,8)}`,tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});
 try{
  await setup.initialize();
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await setup.synchronize();
  const migration=(name:string)=>readFileSync(resolve(__dirname,"../../../../../database/migrations",name),"utf8").replace(/^BEGIN;\s*/u,`BEGIN;\nSET LOCAL search_path TO "${schema}", public;\n`);
  await setup.query(migration("000234_hr_approval_workflow.sql"));
  const predecessorApplicant=randomUUID(),predecessorRequest=randomUUID(),predecessorAction=randomUUID();
  await setup.query(`INSERT INTO "${schema}".hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,version) VALUES($1,$2,$3,'APP-PRE','Predecessor employee','active',1)`,[predecessorApplicant,scope.tenantId,scope.parkId]);
  await setup.query(`INSERT INTO "${schema}".hr_approval_request(id,tenant_id,park_id,request_no,request_type,applicant_employee_id,subject_employee_id,title,payload) VALUES($1,$2,$3,'APP-PRE','profile_change',$4,$4,'Predecessor request','{}')`,[predecessorRequest,scope.tenantId,scope.parkId,predecessorApplicant]);
  await setup.query(`INSERT INTO "${schema}".hr_approval_action(id,tenant_id,park_id,request_id,action,actor_user_id,before_status,after_status) VALUES($1,$2,$3,$4,'submit',$5,'draft','submitted')`,[predecessorAction,scope.tenantId,scope.parkId,predecessorRequest,randomUUID()]);
  await setup.query(migration("000353_hr_approval_content_revisions.sql"));
  const predecessor=await setup.query(`SELECT action,before_content,after_content FROM "${schema}".hr_approval_action WHERE id=$1`,[predecessorAction]);
  assert.deepEqual(predecessor,[{action:"submit",before_content:null,after_content:null}]);
  await assert.rejects(setup.query(`INSERT INTO "${schema}".hr_approval_action(id,tenant_id,park_id,request_id,action,actor_user_id,before_status,after_status) VALUES($1,$2,$3,$4,'edit',$5,'draft','draft')`,[randomUUID(),scope.tenantId,scope.parkId,predecessorRequest,randomUUID()]));
  await setup.destroy();

  db=new DataSource({...connection,entities:[HrEmployeeEntity,HrApprovalRequestEntity,HrApprovalActionEntity]});
  await db.initialize();
  const employees=db.getRepository(HrEmployeeEntity),requests=db.getRepository(HrApprovalRequestEntity),actions=db.getRepository(HrApprovalActionEntity);
  const applicantUser=randomUUID(),reviewerUser=randomUUID(),outsideUser=randomUUID();
  const applicant=await employees.save(employees.create({...scope,employeeCode:"APP-SELF",fullName:"Applicant",userId:applicantUser,employmentStatus:"active"}));
  const managed=await employees.save(employees.create({...scope,employeeCode:"APP-MANAGED",fullName:"Managed",userId:reviewerUser,employmentStatus:"active"}));
  const outside=await employees.save(employees.create({...scope,employeeCode:"APP-OUTSIDE",fullName:"Outside",userId:outsideUser,employmentStatus:"active"}));
  const service=Object.create(HrService.prototype) as HrService;
  Object.assign(service,{dataSource:db,employees,approvalRequests:requests,users:{find:async()=>[]},auditService:{recordOperationRequired:async()=>undefined}});
  (service as unknown as {managedEmployeeIds:()=>Promise<string[]>}).managedEmployeeIds=async()=>[managed.id];
  const own=actor(applicantUser,[HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE]);
  const reviewer=actor(reviewerUser,[HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]);
  const combined=actor(applicantUser,[HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE,HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]);
  const create=(applicantEmployeeId:string,subjectEmployeeId:string,status="draft")=>requests.save(requests.create({...scope,requestNo:`APP-${randomUUID()}`,requestType:"profile_change",applicantEmployeeId,subjectEmployeeId,title:"Original",payload:{description:"before",keep:"preserved"},status,currentApproverId:null,submittedAt:null,completedAt:null,createBy:applicantUser,updateBy:applicantUser}));

  const revision=await create(applicant.id,applicant.id,"returned");
  const edited=await service.reviseApproval(scope,own,revision.id,{expectedVersion:revision.version,title:"Revised",description:"after",reason:"Returned opinion addressed"});
  assert.equal(edited.version,revision.version+1);
  const edit=await actions.findOneByOrFail({requestId:revision.id,action:"edit"});
  assert.deepEqual(edit.beforeContent,{title:"Original",description:"before",version:revision.version});
  assert.deepEqual(edit.afterContent,{title:"Revised",description:"after",version:revision.version+1});
  assert.equal((await requests.findOneByOrFail({id:revision.id})).payload.keep,"preserved");
  await actions.update(edit.id,{beforeContent:{...edit.beforeContent,unexpected:"must not be projected"}});
  const ownHistory=await service.approvalHistory(scope,own,revision.id);
  const [firstAction]=ownHistory.actions;
  assert.ok(firstAction);
  assert.deepEqual(firstAction.beforeContent,{title:"Original",description:"before",version:revision.version});

  const concurrent=await create(applicant.id,applicant.id,"draft");
  const attempts=await Promise.allSettled(["first","second"].map(description=>service.reviseApproval(scope,own,concurrent.id,{expectedVersion:concurrent.version,title:description,description,reason:"Concurrent retry"})));
  assert.equal(attempts.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(await actions.countBy({requestId:concurrent.id,action:"edit"}),1);

  const rollback=await create(applicant.id,applicant.id,"draft");
  await db.query(`ALTER TABLE "${schema}".hr_approval_action ADD CONSTRAINT synthetic_edit_failure CHECK (request_id <> '${rollback.id}'::uuid OR action <> 'edit')`);
  await assert.rejects(service.reviseApproval(scope,own,rollback.id,{expectedVersion:rollback.version,title:"Must rollback",description:"Must rollback",reason:"Synthetic failure"}));
  assert.equal((await requests.findOneByOrFail({id:rollback.id})).title,"Original");
  assert.equal(await actions.countBy({requestId:rollback.id,action:"edit"}),0);
  await db.query(`ALTER TABLE "${schema}".hr_approval_action DROP CONSTRAINT synthetic_edit_failure`);

  const managedSubmitted=await create(managed.id,managed.id,"submitted");
  const managedDraft=await create(managed.id,managed.id,"draft");
  const outsideSubmitted=await create(outside.id,outside.id,"submitted");
  const managedApplicantOutsideSubject=await create(managed.id,outside.id,"submitted");
  await assert.doesNotReject(service.approvalHistory(scope,combined,revision.id));
  await assert.doesNotReject(service.approvalHistory(scope,reviewer,managedSubmitted.id));
  await assert.doesNotReject(service.approvalHistory(scope,combined,managedSubmitted.id));
  await assert.rejects(service.approvalHistory(scope,reviewer,managedDraft.id),NotFoundException);
  await assert.rejects(service.approvalHistory(scope,reviewer,outsideSubmitted.id),NotFoundException);
  await assert.rejects(service.approvalHistory(scope,reviewer,managedApplicantOutsideSubject.id),NotFoundException);
  (service as unknown as {managedEmployeeIds:()=>Promise<string[]>}).managedEmployeeIds=async()=>[];
  await assert.rejects(service.approvalHistory(scope,reviewer,managedSubmitted.id),NotFoundException);
  (service as unknown as {managedEmployeeIds:()=>Promise<string[]>}).managedEmployeeIds=async()=>[managed.id];
  Object.assign(service,{auditService:{recordOperationRequired:async()=>{throw new Error("synthetic audit failure");}}});
  await assert.rejects(service.approvalHistory(scope,reviewer,managedSubmitted.id),/synthetic audit failure/);
  Object.assign(service,{auditService:{recordOperationRequired:async()=>undefined}});
  await assert.rejects(service.reviseApproval(scope,reviewer,managedSubmitted.id,{expectedVersion:1,title:"Denied",description:"Denied",reason:"Denied"}),ForbiddenException);
  await assert.rejects(service.reviseApproval(scope,own,managedSubmitted.id,{expectedVersion:1,title:"Denied",description:"Denied",reason:"Denied"}),ForbiddenException);
  await assert.rejects(service.reviseApproval(scope,own,revision.id,{expectedVersion:1,title:"Stale",description:"Stale",reason:"Stale"}),ConflictException);
 }finally{
  if(db?.isInitialized)await db.destroy();
  if(setup.isInitialized)await setup.destroy();
  const cleanup=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});
  await cleanup.initialize();
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.destroy();
 }
});
