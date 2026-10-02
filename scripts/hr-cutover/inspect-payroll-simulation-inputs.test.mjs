import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {inspectPayrollSimulationInputs} from "./inspect-payroll-simulation-inputs.mjs";

test("invalid scope and month fail before database access",async()=>{
 let calls=0;const client={query:async()=>{calls++;throw new Error("unexpected database access");}};
 for(const input of [{tenantId:"",parkId:"p",periodMonth:"2026-07-01"},{tenantId:"t",parkId:" ",periodMonth:"2026-07-01"},{tenantId:"t",parkId:"p",periodMonth:"2026-13-01"},{tenantId:"t",parkId:"p",periodMonth:"2026-07-02"},{tenantId:"t",parkId:"p",periodMonth:"0000-01-01"}])await assert.rejects(inspectPayrollSimulationInputs(client,input),/SCOPE_OR_MONTH_INVALID/);
 assert.equal(calls,0);
});

test("failed inspection always rolls back and never commits",async()=>{
 const statements=[];const client={query:async sql=>{statements.push(sql);if(sql.startsWith("WITH legacy"))throw new Error("synthetic query failure");return {rows:[]};}};
 await assert.rejects(inspectPayrollSimulationInputs(client,{tenantId:"t",parkId:"p",periodMonth:"2026-07-01"}),/synthetic query failure/);
 assert.equal(statements[0],"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");assert.equal(statements.at(-1),"ROLLBACK");assert.equal(statements.includes("COMMIT"),false);
});

test("real PostgreSQL input inventory is scoped, month-specific and read-only",{skip:process.env.PAYROLL_INPUT_INSPECTION_PG_REQUIRED!=="1",timeout:30000},async t=>{
 const container="jinhu_hr_migration_lab_import_20261001_a";
 const docker=args=>{const r=spawnSync("docker",args,{encoding:"utf8",timeout:10000});assert.equal(r.status,0,"isolated lab inspection failed");return r.stdout.trim();};
 assert.equal(docker(["port",container,"5432/tcp"]),"127.0.0.1:55491");
 const config=JSON.parse(docker(["inspect","--format","{{json .Config.Env}}",container]));
 const env=Object.fromEntries(config.filter(x=>x.startsWith("POSTGRES_")).map(x=>{const n=x.indexOf("=");return [x.slice(0,n),x.slice(n+1)];}));
 const require=createRequire(new URL("../../apps/api/package.json",import.meta.url));const {Client}=require("pg");
 const db=new Client({host:"127.0.0.1",port:55491,database:"postgres",user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,connectionTimeoutMillis:5000});await db.connect();
 const tables={
  hr_employee:"id text,tenant_id text,park_id text,is_deleted boolean DEFAULT false",
  hr_payroll_legacy_batch:"id text,tenant_id text,park_id text,status text,is_deleted boolean DEFAULT false",
  hr_payroll_book_period:"id text,tenant_id text,park_id text,book_id text,period_month date,is_deleted boolean DEFAULT false",
  hr_payroll_legacy_snapshot:"id text,tenant_id text,park_id text,batch_id text,book_period_id text,employee_id text,net_amount numeric,mapping_status text DEFAULT 'mapped',is_deleted boolean DEFAULT false",
  hr_attendance_period:"id text,tenant_id text,park_id text,period_month date,status text,is_deleted boolean DEFAULT false",
  hr_attendance_payroll_input_batch:"id text,tenant_id text,park_id text,period_id text,status text,is_deleted boolean DEFAULT false",
  hr_attendance_payroll_input_item:"tenant_id text,park_id text,batch_id text,employee_id text,is_deleted boolean DEFAULT false",
  hr_employee_compensation:"tenant_id text,park_id text,employee_id text,status text,effective_from date,effective_to date,is_deleted boolean DEFAULT false",
  hr_employee_insurance_period:"tenant_id text,park_id text,employee_id text,period_year int,period_month int,is_deleted boolean DEFAULT false",
  hr_payroll_reconciliation_policy_current:"tenant_id text,park_id text,book_id text,policy_version_id text",
  hr_payroll_reconciliation_policy_version:"id text,tenant_id text,park_id text,book_id text,net_item_version_id text,status text,is_deleted boolean DEFAULT false",
  hr_payroll_item_version:"id text,tenant_id text,park_id text,item_definition_id text,enabled boolean,value_type text,is_deleted boolean DEFAULT false",
  hr_payroll_item_definition:"id text,tenant_id text,park_id text,book_id text,is_deleted boolean DEFAULT false",
  hr_payroll_formula_version:"item_version_id text,tenant_id text,park_id text,book_id text,parse_status text,is_deleted boolean DEFAULT false"
 };
 const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park",periodMonth:"2026-07-01"};
 const checkedClient={query:async(sql,args)=>{if(sql.startsWith("WITH legacy")){assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only,"on");assert.equal((await db.query("SHOW transaction_isolation")).rows[0].transaction_isolation,"repeatable read");}return db.query(sql,args);}};
 const inspect=()=>inspectPayrollSimulationInputs(checkedClient,scope);
 try {
  for(const [name,columns]of Object.entries(tables))await db.query(`CREATE TEMP TABLE ${name}(${columns})`);
  await db.query(`INSERT INTO hr_employee VALUES('e1','synthetic-tenant','synthetic-park',false),('e2','synthetic-tenant','synthetic-park',false);
   INSERT INTO hr_payroll_legacy_batch VALUES('legacy','synthetic-tenant','synthetic-park','published',false);
   INSERT INTO hr_payroll_book_period VALUES('book-period','synthetic-tenant','synthetic-park','book','2026-07-01',false);
   INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,net_amount) VALUES('s1','synthetic-tenant','synthetic-park','legacy','book-period','e1',100),('s2','synthetic-tenant','synthetic-park','legacy','book-period','e2',200);
   INSERT INTO hr_attendance_period VALUES('period','synthetic-tenant','synthetic-park','2026-07-01','closed',false);
   INSERT INTO hr_attendance_payroll_input_batch VALUES('attendance','synthetic-tenant','synthetic-park','period','effective',false);
   INSERT INTO hr_attendance_payroll_input_item VALUES('synthetic-tenant','synthetic-park','attendance','e1',false),('synthetic-tenant','synthetic-park','attendance','e2',false);
   INSERT INTO hr_employee_compensation VALUES('synthetic-tenant','synthetic-park','e1','active','2026-07-01',null,false),('synthetic-tenant','synthetic-park','e2','active','2026-06-01',null,false);
   INSERT INTO hr_employee_insurance_period VALUES('synthetic-tenant','synthetic-park','e1',2026,7,false),('synthetic-tenant','synthetic-park','e2',2026,7,false);
   INSERT INTO hr_payroll_reconciliation_policy_current VALUES('synthetic-tenant','synthetic-park','book','policy');
   INSERT INTO hr_payroll_reconciliation_policy_version VALUES('policy','synthetic-tenant','synthetic-park','book','net','approved',false);
   INSERT INTO hr_payroll_item_version VALUES('net','synthetic-tenant','synthetic-park','definition',true,'decimal',false);
   INSERT INTO hr_payroll_item_definition VALUES('definition','synthetic-tenant','synthetic-park','book',false);
   INSERT INTO hr_payroll_formula_version VALUES('net','synthetic-tenant','synthetic-park','book','approved_for_simulation',false);`);
  await t.test("complete structural inputs never become calculation or payment approval",async()=>{const r=await inspect();assert.equal(r.counts.snapshots,2);assert.equal(r.counts.employees,2);assert.equal(r.structuralPrerequisitesPresent,true);assert.equal(r.simulationReady,false);assert.equal(r.sourceFrozen,false);assert.equal(r.paymentEnabled,false);assert.equal(r.databaseWrite,false);assert.equal(JSON.stringify(r).includes('"e1"'),false);});
  await t.test("staged source remains blocked without publication",async()=>{await db.query("UPDATE hr_payroll_legacy_batch SET status='staged'");const r=await inspect();assert.equal(r.counts.unpublished_snapshots,2);assert.ok(r.blockers.includes("HISTORY_NOT_PUBLISHED_AND_FROZEN_SOURCE_UNAVAILABLE"));await db.query("UPDATE hr_payroll_legacy_batch SET status='published'");});
  await t.test("foreign scope and other month cannot satisfy missing employee input",async()=>{await db.query("UPDATE hr_employee_insurance_period SET period_month=6 WHERE employee_id='e1'; UPDATE hr_employee_compensation SET park_id='foreign' WHERE employee_id='e1'; UPDATE hr_attendance_payroll_input_item SET tenant_id='foreign' WHERE employee_id='e1'");const r=await inspect();assert.equal(r.counts.employees_missing_insurance,1);assert.equal(r.counts.employees_missing_compensation,1);assert.equal(r.counts.employees_missing_attendance,1);await db.query("UPDATE hr_employee_insurance_period SET period_month=7; UPDATE hr_employee_compensation SET park_id='synthetic-park'; UPDATE hr_attendance_payroll_input_item SET tenant_id='synthetic-tenant'");});
  await t.test("missing net values and ambiguous approved formula mappings block",async()=>{await db.query("UPDATE hr_payroll_legacy_snapshot SET net_amount=null WHERE id='s1'; INSERT INTO hr_payroll_formula_version SELECT * FROM hr_payroll_formula_version");const r=await inspect();assert.equal(r.counts.missing_net_snapshots,1);assert.equal(r.counts.books_missing_unique_net_mapping,1);assert.equal(r.structuralPrerequisitesPresent,false);});
  await t.test("wrong period and unauthorized scope have no history",async()=>{for(const changed of [{...scope,periodMonth:'2026-08-01'},{...scope,parkId:'foreign'}]){const r=await inspectPayrollSimulationInputs(checkedClient,changed);assert.equal(r.counts.snapshots,0);assert.ok(r.blockers.includes('NO_MAPPED_HISTORY_FOR_MONTH'));}});
 } finally {
  await db.query("ROLLBACK");
  for(const name of Object.keys(tables))await db.query(`DROP TABLE IF EXISTS pg_temp.${name}`);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relkind='r'")).rows[0].n,0);
  await db.end();
 }
});
