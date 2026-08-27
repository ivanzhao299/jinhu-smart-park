import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,test} from "node:test";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {DataSource} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import {HrJobChangeService} from "./hr-job-change.service";

const enabled=process.env.HR_JOB_CHANGE_PG_TEST==="1",scope={tenantId:"10000001",parkId:"20000001"};
let db:DataSource,service:HrJobChangeService,applicant:string,reviewer:string,applier:string,employeeA:string,employeeB:string,employeeC:string,oldOrg:string,newOrg:string,otherOrg:string,oldPosition:string,newPosition:string;
const actor=(sub:string,permissions:string[]=[])=>({sub,username:"job-change-pg",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});

before(async()=>{if(!enabled)return;db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??15432),username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB});await db.initialize();service=new HrJobChangeService(db,{recordOperationRequired:async()=>undefined} as unknown as AuditService);applicant=randomUUID();reviewer=randomUUID();applier=randomUUID();employeeA=randomUUID();employeeB=randomUUID();employeeC=randomUUID();oldOrg=randomUUID();newOrg=randomUUID();otherOrg=randomUUID();oldPosition=randomUUID();newPosition=randomUUID();
 await db.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$2,$3,$4,'岗位变更申请人','not-login','enabled'),($5,$2,$3,$6,'岗位变更审核人','not-login','enabled'),($7,$2,$3,$8,'岗位变更生效人','not-login','enabled')`,[applicant,scope.tenantId,scope.parkId,`jca-${applicant.slice(0,8)}`,reviewer,`jcr-${reviewer.slice(0,8)}`,applier,`jcp-${applier.slice(0,8)}`]);
 await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,leader_user_id,status)VALUES($1,$2,$3,$4,'原部门','department',$9,'enabled'),($5,$2,$3,$6,'新部门','department',NULL,'enabled'),($7,$2,$3,$8,'第三部门','department',NULL,'enabled')`,[oldOrg,scope.tenantId,scope.parkId,`OLD-${oldOrg.slice(0,8)}`,newOrg,`NEW-${newOrg.slice(0,8)}`,otherOrg,`OTH-${otherOrg.slice(0,8)}`,applicant]);
 await db.query(`INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name,status)VALUES($1,$2,$3,$4,$5,'原岗位','enabled'),($6,$2,$3,$7,$8,'新岗位','enabled')`,[oldPosition,scope.tenantId,scope.parkId,oldOrg,`OP-${oldPosition.slice(0,8)}`,newPosition,newOrg,`NP-${newPosition.slice(0,8)}`]);
 await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,position_id,employment_status)VALUES($1,$2,$3,$4,'异动员工甲',$5,$6,'active'),($7,$2,$3,$8,'异动员工乙',$5,$6,'active'),($9,$2,$3,$10,'异动员工丙',$5,$6,'active')`,[employeeA,scope.tenantId,scope.parkId,`JCA-${employeeA.slice(0,8)}`,oldOrg,oldPosition,employeeB,`JCB-${employeeB.slice(0,8)}`,employeeC,`JCC-${employeeC.slice(0,8)}`]);
});
after(async()=>{if(enabled&&db?.isInitialized)await db.destroy();});

test("job change preserves maker-checker approval and applies employee plus event atomically",{skip:!enabled},async()=>{
 const baseline=(await db.query(`INSERT INTO hr_employment_event(tenant_id,park_id,employee_id,event_type,effective_date,before_snapshot,after_snapshot,reason,status,is_historical_import) VALUES($1,$2,$3,'transfer','2026-08-01','{}','{}','编号序列基线','effective',false) RETURNING event_no`,[scope.tenantId,scope.parkId,employeeC]))[0];
 const hr=actor(applicant,[HR_PERMISSIONS.HR_JOB_CHANGE_READ]),draft=await service.create(scope,hr,{applicationName:"运营岗位调动",employeeId:employeeA,applicationDate:"2026-08-20",effectiveDate:"2026-08-21",changeType:"transfer",afterOrgId:newOrg,afterPositionId:newPosition,reason:"组织协同需要"}) as {id:string;applicationNo:string;status:string};assert.match(draft.applicationNo,/^DZ202608\d{4}$/);assert.equal(Number(draft.applicationNo.slice(-4)),Number(baseline.event_no.slice(-4))+1);assert.equal(draft.status,"draft");
 const manager=actor(applicant,[HR_PERMISSIONS.HR_JOB_CHANGE_TEAM_READ,HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE]),visible=await service.list(scope,manager,{page:1,page_size:20});assert.equal(visible.total,1);const refs=await service.options(scope,manager);assert.equal(refs.employees.length,3);assert.ok(refs.orgs.length>=3);assert.equal(refs.positions.filter((x:{orgId:string})=>x.orgId===newOrg).length,1);
 await service.act(scope,hr,draft.id,{action:"submit"});await assert.rejects(service.review(scope,actor(applicant),draft.id,{action:"approve"}),/cannot review/i);await service.review(scope,actor(reviewer),draft.id,{action:"approve"});
 const race=await Promise.allSettled([service.apply(scope,actor(applier),draft.id),service.apply(scope,actor(applier),draft.id)]);assert.equal(race.filter(x=>x.status==="fulfilled").length,1);
 const employee=(await db.query(`SELECT primary_org_id,position_id FROM hr_employee WHERE id=$1`,[employeeA]))[0];assert.equal(employee.primary_org_id,newOrg);assert.equal(employee.position_id,newPosition);
 const events=await db.query(`SELECT event_no,event_type,before_snapshot,after_snapshot FROM hr_employment_event WHERE employee_id=$1 AND event_type='transfer'`,[employeeA]);assert.equal(events.length,1);assert.equal(events[0].event_no,draft.applicationNo);assert.equal(events[0].before_snapshot.orgId,undefined);assert.equal(events[0].before_snapshot.primary_org_id,oldOrg);assert.equal(events[0].after_snapshot.primary_org_id,newOrg);
 await assert.rejects(db.query(`UPDATE hr_job_change_action SET comment='tamper' WHERE application_id=$1`,[draft.id]),/append-only/);
});

test("approved application fails closed when current assignment drifted",{skip:!enabled},async()=>{
 const hr=actor(applicant,[HR_PERMISSIONS.HR_JOB_CHANGE_READ]),draft=await service.create(scope,hr,{applicationName:"财务岗位调动",employeeId:employeeB,applicationDate:"2026-08-20",effectiveDate:"2026-08-21",changeType:"transfer",afterOrgId:newOrg,afterPositionId:newPosition,reason:"岗位轮换"}) as {id:string};await service.act(scope,hr,draft.id,{action:"submit"});await service.review(scope,actor(reviewer),draft.id,{action:"approve"});await db.query(`UPDATE hr_employee SET primary_org_id=$1,position_id=NULL WHERE id=$2`,[otherOrg,employeeB]);await assert.rejects(service.apply(scope,actor(applier),draft.id),/changed after approval/i);assert.equal((await db.query(`SELECT count(*)::int count FROM hr_employment_event WHERE employee_id=$1 AND event_type='transfer'`,[employeeB]))[0].count,0);
});
