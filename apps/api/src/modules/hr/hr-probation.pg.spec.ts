import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,test} from "node:test";
import {DataSource} from "typeorm";
import {HrProbationService} from "./hr-probation.service";

const enabled=process.env.HR_PROBATION_PG_TEST==="1",scope={tenantId:"10000001",parkId:"20000001"};
let db:DataSource,service:HrProbationService,applicant:string,reviewer:string,confirmer:string,employeeA:string,employeeB:string,employeeC:string;
const actor=(sub:string)=>({sub,username:"probation-pg",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[]});

before(async()=>{if(!enabled)return;db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??15432),username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB});await db.initialize();service=new HrProbationService(db);applicant=randomUUID();reviewer=randomUUID();confirmer=randomUUID();employeeA=randomUUID();employeeB=randomUUID();employeeC=randomUUID();
 await db.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$2,$3,$4,'转正申请人','not-login','enabled'),($5,$2,$3,$6,'转正审核人','not-login','enabled'),($7,$2,$3,$8,'转正确认人','not-login','enabled')`,[applicant,scope.tenantId,scope.parkId,`prob-a-${applicant.slice(0,8)}`,reviewer,`prob-r-${reviewer.slice(0,8)}`,confirmer,`prob-c-${confirmer.slice(0,8)}`]);
 await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date,probation_end_date)VALUES($1,$2,$3,$4,'试用员工甲','probation','2026-06-01','2026-09-01'),($5,$2,$3,$6,'试用员工乙','probation','2026-06-01','2026-09-01'),($7,$2,$3,$8,'试用员工丙','probation','2026-06-01','2026-09-01')`,[employeeA,scope.tenantId,scope.parkId,`PROBA-${employeeA.slice(0,8)}`,employeeB,`PROBB-${employeeB.slice(0,8)}`,employeeC,`PROBC-${employeeC.slice(0,8)}`]);
});
after(async()=>{if(enabled&&db?.isInitialized)await db.destroy();});

test("probation batch requires maker checker and confirms every employee exactly once",{skip:!enabled},async()=>{
 const cancellable=await service.create(scope,actor(applicant),{applicationName:"待取消转正",applicationDate:"2026-08-20",reason:"验证提交后取消保留事实快照",participants:[{employeeId:employeeC,plannedConfirmationDate:"2026-09-01"}]}) as {id:string};
 await service.act(scope,actor(applicant),cancellable.id,{action:"submit"});await service.act(scope,actor(applicant),cancellable.id,{action:"cancel"});
 const cancelled=(await db.query(`SELECT status,jsonb_array_length(participant_snapshot) snapshot_count FROM hr_probation_application WHERE id=$1`,[cancellable.id]))[0];assert.equal(cancelled.status,"cancelled");assert.equal(cancelled.snapshot_count,1);
 assert.equal((await db.query(`SELECT status FROM hr_probation_application_employee WHERE application_id=$1`,[cancellable.id]))[0].status,"cancelled");
 const draft=await service.create(scope,actor(applicant),{applicationName:"九月批量转正",applicationDate:"2026-08-20",reason:"试用期考核通过",participants:[{employeeId:employeeA,plannedConfirmationDate:"2026-09-01"},{employeeId:employeeB,plannedConfirmationDate:"2026-09-01"}]}) as {id:string;status:string};assert.equal(draft.status,"draft");
 await service.act(scope,actor(applicant),draft.id,{action:"submit"});
 assert.equal((await db.query(`SELECT jsonb_array_length(participant_snapshot) count FROM hr_probation_application WHERE id=$1`,[draft.id]))[0].count,2);
 await assert.rejects(service.review(scope,actor(applicant),draft.id,{action:"approve"}),/cannot review/i);
 await service.review(scope,actor(reviewer),draft.id,{action:"approve"});
 const race=await Promise.allSettled([service.confirm(scope,actor(confirmer),draft.id),service.confirm(scope,actor(confirmer),draft.id)]);assert.equal(race.filter(result=>result.status==="fulfilled").length,1);
 const employees=await db.query(`SELECT id,employment_status,probation_end_date::text FROM hr_employee WHERE id=ANY($1::uuid[]) ORDER BY id`,[[employeeA,employeeB]]);assert.equal(employees.length,2);assert.ok(employees.every((row:{employment_status:string;probation_end_date:string})=>row.employment_status==="active"&&row.probation_end_date==="2026-09-01"));
 assert.equal((await db.query(`SELECT count(*)::int count FROM hr_employment_event WHERE employee_id=ANY($1::uuid[]) AND event_type='confirm_employment'`,[[employeeA,employeeB]]))[0].count,2);
 assert.equal((await db.query(`SELECT count(*)::int count FROM hr_probation_application_employee WHERE application_id=$1 AND status='confirmed'`,[draft.id]))[0].count,2);
 await assert.rejects(db.query(`UPDATE hr_probation_application_action SET comment='tamper' WHERE application_id=$1`,[draft.id]),/append-only/);
});
