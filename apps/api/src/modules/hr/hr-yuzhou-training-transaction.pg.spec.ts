import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after,before,test } from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {createTrainingHistoryInTransaction,correctTrainingHistoryHoursInTransaction} from "./hr-yuzhou-training-transaction";
const enabled=process.env.HR_TRAINING_IMPORT_PG_REQUIRED==="1",database=`jinhu_hr_training_import_lab_${randomUUID().replaceAll('-','')}`;
const scope={tenantId:"10000001",parkId:"20000001"},actorId=randomUUID(),employeeId=randomUUID(),foreignEmployee=randomUUID();
const actor:JwtPrincipal={sub:actorId,username:"synthetic-training-import",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE]};
const facts={courseName:"Synthetic training",startDate:"2020-02-29",endDate:"2020-03-01",hours:"8"};
let admin:DataSource,db:DataSource,created=false;
before(async()=>{
 if(!enabled)return;assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"55491");
 const config={type:"postgres" as const,host:"127.0.0.1",port:55491,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
 admin=new DataSource({...config,database:"postgres"});await admin.initialize();await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
 db=new DataSource({...config,database});await db.initialize();assert.equal((await db.query('SELECT current_database() name'))[0].name,database);
 await db.query(`CREATE EXTENSION "uuid-ossp";CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64));CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),is_deleted boolean DEFAULT false);CREATE TABLE sys_file(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),biz_type text,biz_id uuid,status integer,is_deleted boolean);`);
 // Exact real training migration, with only prerequisite owner/file fixtures.
 await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000254_hr_training_operations.sql"),"utf8"));
 await db.query('INSERT INTO sys_user VALUES($1,$2,$3)',[actorId,scope.tenantId,scope.parkId]);
 await db.query('INSERT INTO hr_employee(id,tenant_id,park_id) VALUES($1,$2,$3),($4,$2,\'20000002\')',[employeeId,scope.tenantId,scope.parkId,foreignEmployee]);
});
after(async()=>{if(db?.isInitialized)await db.destroy();if(admin?.isInitialized){try{if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[database]))[0].n,0);}}finally{await admin.destroy();}}});
const sourceKey=(n:string)=>`sha256:${n.repeat(64)}`;
const counts=async()=> (await db.query(`SELECT (SELECT count(*)::int FROM hr_training_course) courses,(SELECT count(*)::int FROM hr_training_plan) plans,(SELECT count(*)::int FROM hr_training_participant) participants,(SELECT count(*)::int FROM hr_training_result_correction) corrections,(SELECT count(*)::int FROM hr_training_action) actions`))[0];
test('real training guards accept complete history and reject overwrite/duplicate source codes',{skip:!enabled},async()=>{
 const value=await db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('a'),employeeId,facts));
 const p=(await db.query('SELECT status,snapshot FROM hr_training_plan WHERE id=$1',[value.planId]))[0];assert.equal(p.status,'completed');assert.equal(p.snapshot.courseTitle,facts.courseName);
 const participant=(await db.query(`SELECT status,completed_hours::text hours,score,actual_cost,to_char(completed_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') completed FROM hr_training_participant WHERE id=$1`,[value.participantId]))[0];assert.deepEqual(participant,{status:'completed',hours:'8.00',score:null,actual_cost:null,completed:'2020-03-01 00:00:00'});
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_training_action WHERE plan_id=$1',[value.planId]))[0].n,4);
 await assert.rejects(db.query('UPDATE hr_training_participant SET completed_hours=9 WHERE id=$1',[value.participantId]),/requires correction/);
 const before=await counts();await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('a'),employeeId,facts)),e=>(e as {code:string}).code==='23505');assert.deepEqual(await counts(),before);
 const c=await db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'9'));assert.equal(c.correctionVersion,1);
 assert.equal((await db.query('SELECT completed_hours::text hours FROM hr_training_participant WHERE id=$1',[value.participantId]))[0].hours,'8.00');
 await assert.rejects(db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'10')),/CORRECTION_STALE/);
 const races=await Promise.allSettled([db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,1,'10')),db.transaction(m=>correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,1,'11'))]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);
});
test('permissions/scope/owner checks reject without writes',{skip:!enabled},async()=>{
 const before=await counts();
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,{...actor,permissions:[]},sourceKey('b'),employeeId,facts)));
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,{...actor,parkId:'20000002'},sourceKey('b'),employeeId,facts)));
 await assert.rejects(db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('b'),foreignEmployee,facts)),/employee not found/);
 assert.deepEqual(await counts(),before);
});
test('later failure rolls back whole creation and correction with append-only action',{skip:!enabled},async()=>{
 const before=await counts();await assert.rejects(db.transaction(async m=>{await createTrainingHistoryInTransaction(m,scope,actor,sourceKey('c'),employeeId,facts);await m.query('SELECT 1/0');}));assert.deepEqual(await counts(),before);
 const value=await db.transaction(m=>createTrainingHistoryInTransaction(m,scope,actor,sourceKey('d'),employeeId,facts));
 await db.query(`CREATE FUNCTION fail_import_action() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='correct' AND current_setting('lab.fail_action',true)='yes' THEN RAISE EXCEPTION 'synthetic action failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER lab_fail_import_action BEFORE INSERT ON hr_training_action FOR EACH ROW EXECUTE FUNCTION fail_import_action();`);
 const beforeCorrection=await counts();await assert.rejects(db.transaction(async m=>{await m.query("SELECT set_config('lab.fail_action','yes',true)");await correctTrainingHistoryHoursInTransaction(m,scope,actor,value.participantId,0,'12');}),/synthetic action failure/);assert.deepEqual(await counts(),beforeCorrection);
 assert.equal((await db.query('SELECT count(*)::int n FROM hr_training_result_correction WHERE participant_id=$1',[value.participantId]))[0].n,0);
});
