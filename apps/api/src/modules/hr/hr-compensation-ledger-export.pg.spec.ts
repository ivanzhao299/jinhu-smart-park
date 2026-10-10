import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {test} from "node:test";
import {ForbiddenException} from "@nestjs/common";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {DataSource,type EntityManager} from "typeorm";
import {HrService} from "./hr.service";

const enabled=process.env.HR_COMPENSATION_ASSIGNMENT_LEDGER_PG_REQUIRED==="1";
test("isolated PostgreSQL: complete compensation export scopes, snapshot concurrency, exact limits and audit failures",{skip:!enabled,timeout:90_000},async()=>{
 const suffix=randomBytes(6).toString("hex"),name=`hr-comp-export-${suffix}`,password=randomBytes(18).toString("hex"),env={...process.env,POSTGRES_PASSWORD:password};
 const docker=(args:string[])=>execFileSync("docker",args,{encoding:"utf8",env,timeout:20_000,stdio:["ignore","pipe","pipe"]}).trim();
 let db:DataSource|undefined,writer:DataSource|undefined,created=false;
 try {
  docker(["image","inspect","postgres:16-alpine","--format","{{.Id}}"]);
  docker(["run","-d","--name",name,"--label",`hr-comp-export=${suffix}`,"--tmpfs","/var/lib/postgresql/data","-p","127.0.0.1::5432","-e","POSTGRES_PASSWORD","postgres:16-alpine"]);created=true;
  let port=0;for(let i=0;i<80&&!port;i++){try{port=Number(docker(["port",name,"5432/tcp"]).split(":").at(-1));}catch{/* container startup */}if(!port)await delay(150);}assert.ok(port);
  const options={type:"postgres" as const,host:"127.0.0.1",port,username:"postgres",password,database:"postgres"};
  for(let i=0;i<80&&!db;i++){const candidate=new DataSource(options);try{await candidate.initialize();db=candidate;}catch{if(candidate.isInitialized)await candidate.destroy();await delay(150);}}assert.ok(db);
  writer=await new DataSource(options).initialize();
  await db.query("CREATE TABLE hr_employee(id uuid primary key,tenant_id text,park_id text,employee_code text,full_name text,employment_status text,is_deleted boolean)");
  await db.query("CREATE TABLE hr_compensation_plan(id uuid primary key,tenant_id text,park_id text,plan_code text,plan_name text,is_deleted boolean)");
  await db.query("CREATE TABLE hr_employee_compensation(id uuid primary key,tenant_id text,park_id text,employee_id uuid,plan_id uuid,effective_from date,effective_to date,base_salary numeric(18,2),allowance_amount numeric(18,2),variable_target numeric(18,2),status text,version int,is_deleted boolean)");
  const scope={tenantId:"tenant",parkId:"park"},employee=randomUUID(),plan=randomUUID(),foreign=randomUUID(),deletedEmployee=randomUUID(),deletedPlan=randomUUID(),foreignPlan=randomUUID();
  await db.query("INSERT INTO hr_employee VALUES($1,$2,$3,'E%_\\','Literal %_\\','departed',false),($4,'other','other','FOREIGN','Foreign','active',false),($5,$2,$3,'DELETED','Deleted','active',true)",[employee,scope.tenantId,scope.parkId,foreign,deletedEmployee]);
  await db.query("INSERT INTO hr_compensation_plan VALUES($1,$2,$3,'PLAN','Plan',false),($4,$2,$3,'DELETED','Deleted',true),($5,'other','other','FOREIGN','Foreign',false)",[plan,scope.tenantId,scope.parkId,deletedPlan,foreignPlan]);
  const insert=async(id:string,employeeId=employee,planId=plan,deleted=false,tenantId=scope.tenantId,parkId=scope.parkId)=>db!.query("INSERT INTO hr_employee_compensation VALUES($1,$2,$3,$4,$5,'2026-01-01',NULL,'1234.50','0.01','0.00','active',1,$6)",[id,tenantId,parkId,employeeId,planId,deleted]);
  const ids=Array.from({length:21},()=>randomUUID());for(const id of ids)await insert(id);
  await insert(randomUUID(),foreign);await insert(randomUUID(),deletedEmployee);await insert(randomUUID(),employee,deletedPlan);await insert(randomUUID(),employee,foreignPlan);await insert(randomUUID(),employee,plan,true);await insert(randomUUID(),employee,plan,false,"other","other");
  const service=Object.create(HrService.prototype) as HrService;
  const audits:Array<{path:string;afterJson:unknown}>=[];let failAudit=false,transactions=0,concurrent=false;
  const original=db.transaction.bind(db);
  const dataSource={transaction:(isolation:"REPEATABLE READ",run:(manager:EntityManager)=>Promise<unknown>)=>{
   transactions++;assert.equal(isolation,"REPEATABLE READ");
   return original(isolation,async manager=>{
    const query=manager.query.bind(manager),hooked=Object.create(manager) as EntityManager;
    Object.defineProperty(hooked,"query",{value:async(sql:string,params?:unknown[])=>{
     const value=await query(sql,params);
     if(concurrent&&sql.includes("snapshot_at")){
      concurrent=false;
      // Commit from a genuinely independent connection after the export establishes its snapshot.
      await writer!.query("UPDATE hr_employee_compensation SET base_salary='7654.32',version=2 WHERE id=$1",[ids[0]]);
      await writer!.query("INSERT INTO hr_employee_compensation VALUES($1,$2,$3,$4,$5,'2026-02-01',NULL,'7.23',0,0,'active',1,false)",[randomUUID(),scope.tenantId,scope.parkId,employee,plan]);
     }
     return value;
    }});
    return run(hooked);
   });
  }};
  Object.assign(service,{dataSource,auditService:{recordOperationRequired:async(input:{path:string;afterJson:unknown})=>{if(failAudit)throw new Error("audit unavailable");audits.push(input);}}});
  const actor={sub:randomUUID(),username:"test",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_COMPENSATION_READ]};
  const value=await service.exportCompensationAssignments(scope,actor,{keyword:"%_\\",employeeId:employee});
  assert.equal(value.total,21);assert.equal(value.items.length,21);assert.equal(new Set(value.items.map(row=>row.id)).size,21);assert.deepEqual(value.items.map(row=>row.id),[...ids].sort().reverse());
  assert.equal(value.items[0]?.employeeId,employee);assert.equal(value.items[0]?.baseSalary,"1234.50");assert.equal(value.items[0]?.allowanceAmount,"0.01");assert.equal(value.items[0]?.effectiveTo,null);assert.equal(new Date(value.snapshotAt).toISOString(),value.snapshotAt);
  assert.equal(audits[0]?.path,"/hr/compensation/assignments/export");assert.deepEqual(audits[0]?.afterJson,{fieldGroups:["financial","compensation"],projection:"park",itemCount:21});
  const paged=await service.listCompensationAssignments(scope,actor,{page:2,page_size:20,keyword:"%_\\",employeeId:employee});assert.equal(paged.total,21);assert.equal(paged.items.length,1);
  for(const q of [{keyword:"not present"},{employeeId:foreign},{employeeId:employee,keyword:"not present"}]){const empty=await service.exportCompensationAssignments(scope,actor,q);assert.equal(empty.total,0);assert.deepEqual(empty.items,[]);}
  const before=transactions;
  for(const denied of [{...actor,permissions:[]},{...actor,parkId:"other"},{...actor,tenantId:"other"}])await assert.rejects(service.exportCompensationAssignments(scope,denied,{}),ForbiddenException);
  assert.equal(transactions,before);
  failAudit=true;await assert.rejects(service.exportCompensationAssignments(scope,actor,{}),/audit unavailable/);failAudit=false;
  concurrent=true;const frozen=await service.exportCompensationAssignments(scope,actor,{});assert.equal(frozen.total,21);assert.equal(frozen.items.find(row=>row.id===ids[0])?.baseSalary,"1234.50");assert.equal(frozen.items.find(row=>row.id===ids[0])?.version,1);
  const newer=await service.exportCompensationAssignments(scope,actor,{});assert.equal(newer.total,22);assert.equal(newer.items.find(row=>row.id===ids[0])?.baseSalary,"7654.32");assert.equal(newer.items[0]?.baseSalary,"7.23");
  // 22 visible records + 4978 = exact limit. Hidden references do not consume the export limit.
  await db.query("INSERT INTO hr_employee_compensation SELECT md5('export-boundary-'||n)::uuid,$1,$2,$3,$4,'2020-01-01',NULL,1,0,0,'active',1,false FROM generate_series(1,4978) n",[scope.tenantId,scope.parkId,employee,plan]);
  const boundary=await service.exportCompensationAssignments(scope,actor,{});assert.equal(boundary.total,5000);assert.equal(boundary.items.length,5000);
  const auditsBeforeOverflow=audits.length;await insert(randomUUID());await assert.rejects(service.exportCompensationAssignments(scope,actor,{}),/exceeds 5000/);assert.equal(audits.length,auditsBeforeOverflow);
 } finally {
  if(writer?.isInitialized)await writer.destroy();if(db?.isInitialized)await db.destroy();if(created)docker(["rm","-f",name]);assert.equal(docker(["ps","-aq","--filter",`label=hr-comp-export=${suffix}`]),"");
 }
});
