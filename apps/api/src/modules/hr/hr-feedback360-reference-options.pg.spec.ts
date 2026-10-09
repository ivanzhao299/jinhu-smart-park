import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {DataSource,type EntityManager} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {HrFeedback360Service} from "./hr-feedback360.service";
const required=process.env.HR_FEEDBACK_OPTIONS_PG_REQUIRED==='1';
test('real PostgreSQL 601+ employee/subject pages preserve scope, literal search and snapshot counts',{skip:!required},async()=>{
 if(process.env.POSTGRES_HOST!=='127.0.0.1'||process.env.POSTGRES_PORT!=='15487')throw Error('Feedback options requires isolated loopback15487');
 const connection={type:'postgres' as const,host:'127.0.0.1',port:15487,username:'postgres'},name=`hr_feedback_options_${randomUUID().replaceAll('-','')}`,admin=new DataSource({...connection,database:'postgres'});
 let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();
  assert.equal((await db.query('SELECT current_database() name'))[0].name,name);
  // Disposable query fixture: does not claim migration or production business acceptance.
  await db.query('CREATE TABLE sys_org(id uuid PRIMARY KEY,tenant_id text,park_id text,parent_id uuid,leader_user_id uuid,is_deleted boolean,status text)');
  await db.query('CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,employee_code text,full_name text,employment_status text,is_deleted boolean,primary_org_id uuid,user_id uuid,manager_employee_id uuid,private_contact text)');
  await db.query('CREATE TABLE hr_feedback360_cycle(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_code text,cycle_name text,create_time timestamptz DEFAULT now())');
  await db.query('CREATE TABLE hr_feedback360_subject(id uuid PRIMARY KEY,tenant_id text,park_id text,cycle_id uuid,employee_id uuid,status text)');
  const org=randomUUID(),child=randomUUID(),other=randomUUID(),leader=randomUUID(),self=randomUUID(),cycle=randomUUID();
  await db.query("INSERT INTO sys_org VALUES($1,'tenant','park',null,$4,false,'enabled'),($2,'tenant','park',$1,null,false,'enabled'),($3,'tenant','park',null,null,false,'enabled')",[org,child,other,leader]);
  await db.query("INSERT INTO hr_employee SELECT gen_random_uuid(),'tenant','park','SYN-'||lpad(n::text,3,'0'),'合成员工'||n,'active',false,$1,null,null,'excluded' FROM generate_series(1,601) n",[org]);
  const me=(await db.query("SELECT id FROM hr_employee WHERE employee_code='SYN-001'"))[0].id as string;
  const literal=randomUUID(),childEmployee=randomUUID(),manager=randomUUID(),report=randomUUID(),unrelated=randomUUID();
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant','park','LITERAL',$6,'active',false,$7,null,null,'excluded'),($2,'tenant','park','CHILD','合成下级组织','active',false,$8,null,null,'excluded'),($3,'tenant','park','MANAGER','合成上级','active',false,$9,null,null,'excluded'),($4,'tenant','park','REPORT','合成下属','active',false,$9,null,$10,'excluded'),($5,'tenant','park','UNRELATED','合成无关员工','active',false,$9,null,null,'excluded')",[literal,childEmployee,manager,report,unrelated,'A_%\\',org,child,other,me]);
  await db.query('UPDATE hr_employee SET user_id=$1,manager_employee_id=$2 WHERE id=$3',[self,manager,me]);
  const excluded=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant','park','DELETED','删除','active',true,$5,null,null,'excluded'),($2,'tenant','park','DEPARTED','离职','departed',false,$5,null,null,'excluded'),($3,'foreign','park','FOREIGN-T','跨租户','active',false,$5,null,null,'excluded'),($4,'tenant','foreign','FOREIGN-P','跨园区','active',false,$5,null,null,'excluded')",[...excluded,org]);
  await db.query("INSERT INTO hr_feedback360_cycle VALUES($1,'tenant','park','SYN-CYCLE','合成周期',now())",[cycle]);
  await db.query("INSERT INTO hr_feedback360_subject SELECT gen_random_uuid(),'tenant','park',$1,id,'responding' FROM hr_employee WHERE employee_code LIKE 'SYN-%'",[cycle]);
  await db.query("INSERT INTO hr_feedback360_subject VALUES($1,'tenant','park',$5,$6,'closed'),($2,'tenant','park',$5,$7,'nominating'),($3,'tenant','park',$5,$8,'published'),($4,'tenant','park',$5,$9,'draft')",[randomUUID(),randomUUID(),randomUUID(),randomUUID(),cycle,literal,manager,unrelated,childEmployee]);
  await db.query("INSERT INTO hr_feedback360_subject VALUES($1,'tenant','foreign',$3,$4,'responding'),($2,'foreign','park',$3,$4,'responding')",[randomUUID(),randomUUID(),cycle,me]);
  const scope={tenantId:'tenant',parkId:'park'},actor={...scope,sub:leader,username:'synthetic',roles:[],permissions:[H.HR_FEEDBACK_CYCLE_MANAGE,H.HR_FEEDBACK_NOMINATE,H.HR_FEEDBACK_RESULT_PUBLISH] as string[]},audit={recordOperationRequired:async()=>{}};
  const service=new HrFeedback360Service(db,audit as never,{} as never);
  const employees=new Set<string>();for(let page=1;page<=31;page++){const result=await service.employeeOptions(scope,actor,{page,page_size:20});assert.equal(result.total,606);for(const item of result.items){assert.deepEqual(Object.keys(item).sort(),['employeeCode','fullName','id']);assert.ok(!employees.has(String(item.id)));employees.add(String(item.id));}}assert.equal(employees.size,606);
  const later=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:'SYN-601'});assert.equal(later.total,1);assert.equal(later.items[0]?.fullName,'合成员工601');
  const literalPage=await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:'A_%\\'});assert.equal(literalPage.total,1);assert.equal(literalPage.items[0]?.employeeCode,'LITERAL');assert.equal((await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:'%'})).total,1);
  const empty=await service.employeeOptions(scope,actor,{page:999,page_size:20});assert.equal(empty.total,606);assert.deepEqual(empty.items,[]);
  const team={...actor,permissions:[H.HR_FEEDBACK_TEAM_READ,H.HR_FEEDBACK_NOMINATE]};assert.equal((await service.employeeOptions(scope,team,{page:1,page_size:20})).total,603);
  const own={...actor,sub:self,permissions:[H.HR_FEEDBACK_NOMINATE]};assert.equal((await service.employeeOptions(scope,own,{page:1,page_size:20})).total,604);assert.equal((await service.employeeOptions(scope,own,{page:1,page_size:20,keyword:'UNRELATED'})).total,0);
  for(const purpose of ['nominate','publish'] as const){const seen=new Set<string>();for(let page=1;page<=31;page++){const result=await service.subjectOperationOptions(scope,actor,{page,page_size:20,purpose});assert.equal(result.total,602);for(const item of result.items){assert.deepEqual(Object.keys(item).sort(),['cycleCode','cycleName','employeeCode','id','status','subjectName']);assert.ok(!seen.has(String(item.id)));seen.add(String(item.id));}}assert.equal(seen.size,602);assert.equal((await service.subjectOperationOptions(scope,actor,{page:1,page_size:20,purpose,keyword:'SYN-601'})).total,1);const last=await service.subjectOperationOptions(scope,actor,{page:999,page_size:20,purpose});assert.equal(last.total,602);assert.deepEqual(last.items,[]);}
  assert.equal((await service.subjectOperationOptions(scope,team,{page:1,page_size:20,purpose:'nominate'})).total,601);assert.equal((await service.subjectOperationOptions(scope,own,{page:1,page_size:20,purpose:'nominate'})).total,1);
  await db.query("INSERT INTO hr_employee VALUES($1,'tenant','park','SNAP-A','合成快照A','active',false,$2,null,null,'excluded')",[randomUUID(),org]);
  let injected=false;const live=db;
  const intercepted=new HrFeedback360Service({transaction:async(isolation:'REPEATABLE READ',job:(m:Pick<EntityManager,'query'>)=>Promise<unknown>)=>live.transaction(isolation,async m=>job({query:async(sql:string,params?:unknown[])=>{const rows=await m.query(sql,params);if(!injected&&sql.includes(' ORDER BY employee_code,id LIMIT')){injected=true;await live.query("INSERT INTO hr_employee VALUES($1,'tenant','park','SNAP-B','合成快照B','active',false,$2,null,null,'excluded')",[randomUUID(),org]);}return rows;}}))} as never,audit as never,{} as never);
  const snapshot=await intercepted.employeeOptions(scope,actor,{page:1,page_size:20,keyword:'SNAP-'});assert.equal(snapshot.items.length,1);assert.equal(snapshot.total,1);assert.equal((await service.employeeOptions(scope,actor,{page:1,page_size:20,keyword:'SNAP-'})).total,2);
 }finally{if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query('SELECT count(*)::int total FROM pg_database WHERE datname=$1',[name]))[0].total,0);}await admin.destroy();}}
});
