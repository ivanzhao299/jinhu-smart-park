import { IdempotencyKeyGuard } from "../../shared/guards/idempotency-key.guard";
import { HrPayrollTrialService } from "./hr-payroll-trial.service";
import { HrPayrollTrialController } from "./hr-payroll-trial.controller";
import type { PayrollTrialDto } from "./dto/hr-payroll-trial.dto";
import type { PayrollTrialResult } from "@jinhu/shared";
import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DataSource, type EntityManager } from "typeorm";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import type { Request } from "express";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalInputController } from "./hr-payroll-formal-input.controller";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { HrPayrollPeriodLifecycleService } from "./hr-payroll-period-lifecycle.service";
import type { HrPayrollFormalDefinitionDto } from "./dto/hr-payroll-formal-rule.dto";

const required = process.env.HR_PAYROLL_TRIAL_PG_REQUIRED === "1";
test("actual all-book trial HTTP and PostgreSQL preserve 93 records, serialize sources and make no business writes", { skip: !required }, async (context) => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT, "15490");
  const database = `jinhu_hr_trial_lab_${randomUUID().replaceAll("-", "")}`;
  const admin = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15490, username: "postgres", database: "postgres" });
  await admin.initialize();
  let db: DataSource | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15490, username: "postgres", database });
    await db.initialize();
    // Only original catalog FK prerequisite is a fixture. The entire new migration is executed unchanged.
    await db.query(`CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pgcrypto;      CREATE TABLE hr_payroll_period(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),period_month date,start_date date,end_date date,status text,is_deleted boolean DEFAULT false,version int DEFAULT 1,update_by uuid,update_time timestamptz);
      CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),version int,hire_date date,departure_date date,is_deleted boolean DEFAULT false,employee_code text DEFAULT 'SYNTHETIC',full_name text DEFAULT '合成员工');
      CREATE TABLE sys_user(id uuid,tenant_id varchar(64),park_id varchar(64),UNIQUE(tenant_id,park_id,id));
      CREATE TABLE hr_attendance_request(id uuid,tenant_id varchar(64),park_id varchar(64),UNIQUE(tenant_id,park_id,id));
      CREATE TABLE test_required_audit(id uuid DEFAULT uuid_generate_v4(), metadata jsonb NOT NULL);`);
    // Receipt/control prerequisites are synthetic; execute actual complete source/catalog migrations.
    await db.query(`CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id varchar(64) PRIMARY KEY,status text,binding_sha256 char(64),binding jsonb);
      CREATE TABLE migration_batch(id uuid PRIMARY KEY,run_id text,t4_followon_operation_id text,target_database text,status text);
      CREATE TABLE legacy_record_map(batch_id uuid,target_table text,target_id uuid,is_active boolean,mapping_status text);
      CREATE FUNCTION hr_payroll_reconciliation_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Payroll reconciliation evidence is append-only'; END $$;`);
    for (const file of ["000248_hr_payroll_legacy_history.sql","000319_hr_payroll_reconciliation_source.sql"]) await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations",file),"utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000347_hr_payroll_formal_rules.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000348_hr_payroll_formal_inputs.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000233_hr_compensation_payroll.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000247_hr_attendance_month_close.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000363_hr_attendance_approved_leave_payroll_facts.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000367_hr_attendance_interval_payroll_facts.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000368_hr_business_trip_month_allocations.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000243_hr_payroll_concurrency_integrity.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000349_hr_payroll_formal_run_evidence.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000350_hr_payroll_formal_run_ledger_bridge.sql"), "utf8"));
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000351_hr_payroll_period_close_correction.sql"), "utf8"));
    const scope={tenantId:randomUUID(),parkId:randomUUID()},actor:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic-author",roles:[],permissions:Object.values(HR_PERMISSIONS)},reviewer={...actor,sub:randomUUID(),username:"synthetic-reviewer"};
    let failAudit=false,holdPreparation=false,holdAudit:Promise<void>|null=null,auditReached:()=>void=()=>{};
    const audit={recordOperationRequired:async(value:{afterJson:unknown;action:string},manager:EntityManager)=>{await manager.query("INSERT INTO test_required_audit(metadata) VALUES($1)",[value.afterJson??{}]);if(failAudit)throw new Error("synthetic audit failure");if((value.action==="全账套只算不发核对"||holdPreparation&&value.action==="读取当期工资准备")&&holdAudit){auditReached();await holdAudit;}}} as unknown as AuditService;
    const rules=new HrPayrollFormalRuleService(db,audit),inputs=new HrPayrollFormalInputService(db,rules,audit),runs=new HrPayrollFormalRunService(db,inputs,audit),service=new HrPayrollTrialService(db,inputs,runs,audit);
    const periodId=randomUUID(),batchId=randomUUID(),controlId=randomUUID(),operation=`synthetic-${randomUUID()}`;
    await db.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-07-01','2026-07-01','2026-07-31','open')",[periodId,scope.tenantId,scope.parkId]);
    await db.query("INSERT INTO hr_yuzhou_t4_followon_operation VALUES($1,'succeeded',repeat('a',64),jsonb_build_object('targetScope',jsonb_build_object('tenantId',$2::text,'parkId',$3::text),'triple',jsonb_build_object('sourceSnapshotHash',repeat('b',64))))",[operation,scope.tenantId,scope.parkId]);
    await db.query("INSERT INTO migration_batch VALUES($1,$2,$2,current_database(),'succeeded')",[controlId,operation]);
    await db.query("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES($1,$2,$3,$4,repeat('b',64),repeat('b',64),repeat('b',64),93,93,'staged')",[batchId,scope.tenantId,scope.parkId,operation]);
    const employeeIds=Array.from({length:64},()=>randomUUID());
    await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,hire_date,version) SELECT x.id,$2,$3,'SYN-'||x.n,'合成员工 '||x.n,'2026-07-01'::date,1 FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,n int)",[JSON.stringify(employeeIds.map((id,n)=>({id,n}))),scope.tenantId,scope.parkId]);
    const definition:HrPayrollFormalDefinitionDto={roundingPolicy:"line_items_half_up",items:[{code:"收入",role:"earning",expression:null},{code:"扣款",role:"deduction",expression:null},{code:"税",role:"tax",expression:null},{code:"数量",role:"informational",expression:null},{code:"无匹配直接项",role:"informational",expression:null},{code:"应发",role:"gross",expression:"[收入]"},{code:"实发",role:"net",expression:"[应发]-[扣款]-[税]"}]};
    const selection:PayrollTrialDto={legacyBatchId:batchId,month:"2026-07",books:[]};let serial=0;
    for(const [scheme,roster] of [[34,employeeIds.slice(0,54)],[35,employeeIds.slice(25,64)]] as const){
      const [{id:bookId}]=await db.query("INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES($1,$2,$3,'合成同名账套',repeat('a',64)) RETURNING id",[scope.tenantId,scope.parkId,scheme]);
      const [{id:bookPeriod}]=await db.query("INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,'2026-07-01',1,repeat('a',64)) RETURNING id",[scope.tenantId,scope.parkId,bookId]);
      const versionIds:string[]=[];
      // These definitions deliberately use the approved direct codes. The preparation
      // projection must bind this exact book-scoped version chain; it has no alias layer.
      for(const [index,code] of ["收入","扣款","税","数量"].entries()){
        const [{id:definitionId}]=await db.query("INSERT INTO hr_payroll_item_definition(tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,$4) RETURNING id",[scope.tenantId,scope.parkId,bookId,code]);
        const [{id}]=await db.query("INSERT INTO hr_payroll_item_version(tenant_id,park_id,item_definition_id,version_no,display_name,value_type,decimal_scale,legacy_item_type,legacy_add_or_sub,item_category,source_hash) VALUES($1,$2,$3,1,'同名项目',$4,$5,'legacy','legacy','unclassified',repeat('a',64)) RETURNING id",[scope.tenantId,scope.parkId,definitionId,index===3?"text":"decimal",index===3?null:4]);versionIds.push(id);
      }
      const snapshots:Array<Record<string,unknown>>=[],items:Array<Record<string,unknown>>=[];
      for(const employeeId of roster){
        const id=randomUUID(),n=serial++;
        snapshots.push({id,employee_id:employeeId,source_hash:n.toString(16).padStart(64,"0"),net:n===0?null:"99.0099"});
        for(let index=0;index<(n<63?25:24);index++){const numeric=index<3,known=index<4,sourceNull=index===2,decimal=n===1&&index===0?"9999999999999999.9999":numeric&&!sourceNull?["100.2350","-1.2340"][index]:null;items.push({id:randomUUID(),snapshot_id:id,item_version_id:known?versionIds[index]:null,column:`c${index}`,type:numeric?"decimal":known?"text":"unmapped",is_null:sourceNull,raw:sourceNull?null:decimal??"source text",decimal,text:index===3?"not numeric":null});
          // A second source column bound to the same exact version is never guessed.
          if(n===0&&index===0)items.push({id:randomUUID(),snapshot_id:id,item_version_id:versionIds[0],column:"income_duplicate",type:"decimal",is_null:false,raw:"100.2350",decimal:"100.2350",text:null});}
      }
      await db.query(`INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash,net_amount)
        SELECT x.id,$2,$3,$4,$5,x.employee_id,$6,repeat('a',64),x.source_hash,'mapped',x.source_hash,x.net FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,employee_id uuid,source_hash text,net numeric)`,[JSON.stringify(snapshots),scope.tenantId,scope.parkId,batchId,bookPeriod,`salary${scheme}`]);
      await db.query(`INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,source_hash,raw_value,decimal_value,text_value)
        SELECT x.id,$2,$3,x.snapshot_id,x.item_version_id,x.col,x.type,x.is_null,repeat('a',64),x.raw,x.decimal,x.text FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,snapshot_id uuid,item_version_id uuid,col text,type text,is_null boolean,raw text,decimal numeric,text text)`,[JSON.stringify(items.map(row=>({...row,col:row.column}))),scope.tenantId,scope.parkId]);
      for(const [table,rows] of [["hr_payroll_legacy_snapshot",snapshots],["hr_payroll_legacy_snapshot_item",items]] as const)await db.query("INSERT INTO legacy_record_map SELECT $1,$2,x.id,true,'loaded' FROM jsonb_to_recordset($3::jsonb) AS x(id uuid)",[controlId,table,JSON.stringify(rows)]);
      const source=await db.transaction(async manager=>{const [{hash}]=await manager.query("SELECT encode(digest(hr_build_payroll_reconciliation_source($1,$2,$3,$4,'2026-07-01')::text,'sha256'),'hex') AS hash",[scope.tenantId,scope.parkId,batchId,bookId]);return(await manager.query("SELECT hr_freeze_payroll_reconciliation_source($1,$2,$3,$4,'2026-07-01',repeat('a',64),$5,$6,$7,$8,'synthetic review') AS id",[scope.tenantId,scope.parkId,batchId,bookId,hash,snapshots.length,items.length,actor.sub]))[0].id as string;});
      const set=await rules.createSet(scope,actor,{ruleCode:`BOOK-${scheme}`,displayName:`现代规则 ${scheme}`,sourceBookId:bookId});
      const rule=await rules.createVersion(scope,actor,set.id,{expectedHeadRevision:0,definition,reason:"synthetic approved rules"});
      const submitted=await rules.submitVersion(scope,actor,rule.id,{expectedVersion:rule.version});
      await rules.reviewVersion(scope,reviewer,rule.id,{expectedVersion:submitted.version,decision:"approve",effectiveFrom:"2026-07",reason:"independent review"});
      const input=await inputs.create(scope,actor,{periodId,ruleSetId:set.id,ruleVersionId:rule.id,expectedHeadRevision:0,reason:"synthetic complete roster",employees:(scheme===34?roster.slice(0,-1):roster).map(employeeId=>({employeeId,expectedEmployeeVersion:1,directItems:{收入:"100.2350",扣款:"1.2340",税:"0.0000",数量:"-1.2345",无匹配直接项:"0.0000"}}))});
      const confirmed=await inputs.confirm(scope,reviewer,input.id,{expectedVersion:input.version});
      selection.books.push({bookId,reconciliationSourceId:source,inputId:input.id,expectedInputVersion:confirmed.version,mappings:definition.items.slice(0,4).map((item,index)=>({modernCode:item.code,sourceItemVersionId:versionIds[index]!}))});
    }
    // A confirmed roster may be valid for modern input yet incomplete for this source book.
    await assert.rejects(() => service.calculate(scope, actor, selection), /roster must cover/);
    const gapSelection = structuredClone(selection);
    const [{rule_set_id:fullRuleSetId,rule_version_id:fullRuleVersionId}] = await db.query("SELECT rule_set_id,rule_version_id FROM hr_payroll_formal_input WHERE id=$1", [selection.books[0]!.inputId]);
    const fullInput = await inputs.create(scope, actor, {periodId,ruleSetId:fullRuleSetId,ruleVersionId:fullRuleVersionId,expectedHeadRevision:1,reason:"synthetic complete roster revision",employees:employeeIds.slice(0,54).map(employeeId=>({employeeId,expectedEmployeeVersion:1,directItems:{收入:"100.2350",扣款:"1.2340",税:"0.0000",数量:"-1.2345",无匹配直接项:"0.0000"}}))});
    const fullConfirmed = await inputs.confirm(scope, reviewer, fullInput.id, {expectedVersion:fullInput.version});
    selection.books[0] = {...selection.books[0]!,inputId:fullInput.id,expectedInputVersion:fullConfirmed.version};
    const baseline=async()=>{const result:Record<string,string>={};for(const table of ["hr_payroll_run","hr_payslip","hr_payslip_item","hr_payroll_formal_input","hr_payroll_rule_version","hr_payroll_legacy_batch","hr_payroll_book","hr_payroll_book_period","hr_payroll_legacy_snapshot","hr_payroll_legacy_snapshot_item","hr_payroll_reconciliation_source","legacy_record_map","migration_batch","hr_yuzhou_t4_followon_operation"]){result[table]=(await db!.query(`SELECT md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS hash FROM ${table} t`))[0].hash;}return result;};
    const before=await baseline();
    const ruleSets=await Promise.all(selection.books.map(async book=>(await db!.query("SELECT rule_set_id FROM hr_payroll_formal_input WHERE id=$1",[book.inputId]))[0].rule_set_id as string));
    const sourceQuery=(index=0)=>({periodId,ruleSetId:ruleSets[index]!,reconciliationSourceId:selection.books[index]!.reconciliationSourceId,page:1,pageSize:20});
    const preparedBooks=await Promise.all(selection.books.map(async (_,index)=>{
      const all:string[]=[];let rosterHash="";
      for(let page=1;;page++){
        const prepared=await inputs.preparation(scope,actor,{...sourceQuery(index),page});
        assert.equal(prepared.source?.recordCount,index===0?54:39);assert.equal(prepared.source?.bookId,selection.books[index]!.bookId);
        assert.equal(prepared.source?.month,"2026-07");assert.match(prepared.source!.sourceHash,/^[a-f0-9]{64}$/);assert.match(prepared.source!.rosterHash,/^[a-f0-9]{64}$/);
        if(rosterHash)assert.equal(prepared.source!.rosterHash,rosterHash);rosterHash=prepared.source!.rosterHash;
        assert.ok(prepared.items.every(row=>row.expectedEmployeeVersion===1&&row.eligibility?.eligibleStart==="2026-07-01"&&!row.requiresSettlementWindow));
        assert.ok(prepared.items.every(row=>!("directItems" in row)));all.push(...prepared.items.map(row=>row.employeeId));if(all.length===prepared.total)break;
      }
      assert.equal(new Set(all).size,all.length);return all;
    }));
    assert.equal(preparedBooks[0]!.filter(id=>preparedBooks[1]!.includes(id)).length,29);
    assert.deepEqual(await baseline(),before,"source preparation changes no business table");
    // The opt-in source projection stays exact-decimal text at the PostgreSQL boundary.
    // It reads no formula result, preserves negative scale-four values, and reports
    // missing numeric applicability rather than inventing zeroes.
    const sourceValues = await inputs.preparation(scope,actor,{...sourceQuery(),includeSourceValues:true});
    assert.equal(sourceValues.items.length,20);
    for (const item of sourceValues.items) {
      if(item.employeeId===employeeIds[0]) {
        assert.equal(item.sourceValues?.values.收入,undefined);
        assert.ok(item.sourceValues?.issues.some(issue=>issue.code==="收入"&&issue.reason==="ambiguous"));
      } else assert.equal(item.sourceValues?.values.收入,item.employeeId===employeeIds[1]?"9999999999999999.9999":"100.2350");
      assert.equal(item.sourceValues?.values.扣款,"-1.2340");
      const expectedIssues=[{code:"税",reason:"source_null"},{code:"数量",reason:"non_decimal"},{code:"无匹配直接项",reason:"missing"},...(item.employeeId===employeeIds[0]?[{code:"收入",reason:"ambiguous"}]:[])].sort((left,right)=>left.code.localeCompare(right.code));
      assert.deepEqual(item.sourceValues?.issues,expectedIssues);
    }
    assert.deepEqual(await baseline(),before,"opt-in source projection remains a read-only preparation");
    assert.equal((await inputs.preparation(scope,actor,{...sourceQuery(),page:99})).total,54);
    assert.equal((await inputs.preparation(scope,actor,{...sourceQuery(),keyword:"no match"})).total,0);
    assert.equal((await inputs.preparation(scope,actor,{periodId,ruleSetId:ruleSets[0]!,page:1,pageSize:100})).total,64,"ordinary preparation still offers scoped directory");
    for(const query of [{...sourceQuery(),reconciliationSourceId:randomUUID()},{...sourceQuery(),reconciliationSourceId:selection.books[1]!.reconciliationSourceId},{...sourceQuery(),correctionWindowId:randomUUID()}])await assert.rejects(()=>inputs.preparation(scope,actor,query));
    const otherPeriod=randomUUID();await db.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-08-01','2026-08-01','2026-08-31','open')",[otherPeriod,scope.tenantId,scope.parkId]);
    await assert.rejects(()=>inputs.preparation(scope,actor,{...sourceQuery(),periodId:otherPeriod}),/source month's open period/);await db.query("DELETE FROM hr_payroll_period WHERE id=$1",[otherPeriod]);
    await db.query("UPDATE migration_batch SET status='failed' WHERE id=$1",[controlId]);await assert.rejects(()=>inputs.preparation(scope,actor,sourceQuery()),/changed/);await db.query("UPDATE migration_batch SET status='succeeded' WHERE id=$1",[controlId]);
    const foreignPreparationScope={...scope,parkId:randomUUID()};await assert.rejects(()=>inputs.preparation(foreignPreparationScope,{...actor,...foreignPreparationScope},sourceQuery()),/scope/);
    await db.query("UPDATE hr_employee SET is_deleted=true WHERE id=$1",[employeeIds[0]]);
    await assert.rejects(()=>inputs.preparation(scope,actor,sourceQuery()),/Every source employee/);
    await db.query("UPDATE hr_employee SET is_deleted=false WHERE id=$1",[employeeIds[0]]);
    const preparationAudit=(await db.query("SELECT count(*)::int n FROM test_required_audit"))[0].n;
    failAudit=true;await assert.rejects(()=>inputs.preparation(scope,actor,{...sourceQuery(),includeSourceValues:true}),/synthetic audit failure/);failAudit=false;
    assert.equal((await db.query("SELECT count(*)::int n FROM test_required_audit"))[0].n,preparationAudit);assert.deepEqual(await baseline(),before);
    // Current employee versions remain stable until the required preparation audit commits.
    let releasePreparation=()=>{};holdAudit=new Promise<void>(resolve=>{releasePreparation=resolve;});holdPreparation=true;
    const preparationReached=new Promise<void>(resolve=>{auditReached=resolve;});const readingPreparation=inputs.preparation(scope,actor,sourceQuery());await preparationReached;
    const rosterWriter=db.createQueryRunner();await rosterWriter.connect();await rosterWriter.startTransaction();
    const sourceWriter=db.createQueryRunner();await sourceWriter.connect();await sourceWriter.startTransaction();
    try {
      const [{id:lockedSnapshot}]=await db.query("SELECT id FROM hr_payroll_legacy_snapshot WHERE employee_id=$1 AND legacy_source_table='salary34'",[employeeIds[0]]);
      const appending=sourceWriter.query("INSERT INTO hr_payroll_legacy_snapshot_item(tenant_id,park_id,snapshot_id,legacy_column_name,value_type,is_source_null,source_hash,raw_value) VALUES($1,$2,$3,'preparation-race','unmapped',false,repeat('a',64),'synthetic')",[scope.tenantId,scope.parkId,lockedSnapshot]);
      let sourceWaiting=false;for(let attempt=0;attempt<50&&!sourceWaiting;attempt++){sourceWaiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='hr_payroll_legacy_snapshot_item'::regclass AND NOT granted) AS waiting"))[0].waiting;if(!sourceWaiting)await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(sourceWaiting,true,"source append waits for preparation audit commit");
      const changing=rosterWriter.query("UPDATE hr_employee SET version=version+1 WHERE id=$1",[employeeIds[0]]);
      let waiting=false;for(let attempt=0;attempt<50&&!waiting;attempt++){waiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='transactionid' AND NOT granted) AS waiting"))[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true);
      releasePreparation();assert.equal((await readingPreparation).total,54);await changing;await rosterWriter.commitTransaction();await appending;await sourceWriter.rollbackTransaction();
    }finally{releasePreparation();holdAudit=null;holdPreparation=false;if(rosterWriter.isTransactionActive)await rosterWriter.rollbackTransaction();await rosterWriter.release();if(sourceWriter.isTransactionActive)await sourceWriter.rollbackTransaction();await sourceWriter.release();}
    const changedPreparation=await inputs.preparation(scope,actor,sourceQuery());assert.equal(changedPreparation.items.find(row=>row.employeeId===employeeIds[0])?.expectedEmployeeVersion,2);
    await db.query("UPDATE hr_employee SET version=1 WHERE id=$1",[employeeIds[0]]);assert.deepEqual(await baseline(),before);
    assert.equal((await service.options(scope,actor,{})).periods[0]?.recordCount,93);
    const options=await service.options(scope,actor,{legacyBatchId:batchId,month:"2026-07"});assert.equal(options.books.length,2);assert.equal(options.recordCount,93);assert.equal(options.employeeCount,64);assert.deepEqual(options.books.map(b=>b.recordCount).sort((a,b)=>a-b),[39,54]);
    const result=await service.calculate(scope,actor,selection);assert.equal(result.recordCount,93);assert.equal(result.employeeCount,64);assert.equal(result.bookCount,2);assert.equal(new Set(result.records.map(row=>row.sourceRecordId)).size,93);
    assert.equal(result.records.filter(row=>row.net.status==="missing_source").length,1);
    assert.equal(result.records[0]!.lines.find(line=>line.modernCode==="收入")?.difference,"0.0050");assert.ok(result.records.every(row=>row.totals.netAmount==="99.01"));
    const sourceLines = result.records.flatMap(record => record.lines).filter(line => line.sourceItemId !== null);
    assert.equal(sourceLines.length, 2296);
    assert.equal(new Set(sourceLines.map(line => line.sourceItemId)).size, 2296);
    const unknownLines = sourceLines.filter(line => line.status === "unknown_source");
    assert.equal(unknownLines.length, 2296 - (93 * 4 + 1));
    assert.ok(unknownLines.every(line => line.sourceValue === "source text" && /^c\d+$/u.test(line.sourceName ?? "") && line.difference === null));
    assert.equal((await db.query("SELECT count(*)::int n FROM hr_payroll_legacy_snapshot_item"))[0].n,2296);assert.deepEqual(await baseline(),before,"no business writes");
    for(const bad of [{...selection,books:selection.books.slice(0,1)},{...selection,books:selection.books.map((book,index)=>index?book:{...book,expectedInputVersion:99})},{...selection,books:selection.books.map((book,index)=>index?book:{...book,reconciliationSourceId:selection.books[1]!.reconciliationSourceId})},{...selection,books:selection.books.map((book,index)=>index?book:{...book,mappings:[{modernCode:"收入",sourceItemVersionId:selection.books[1]!.mappings[0]!.sourceItemVersionId}]})}])await assert.rejects(()=>service.calculate(scope,actor,bad));
    await assert.rejects(() => service.calculate(scope, actor, gapSelection), /newer confirmed/);
    await assert.rejects(() => service.calculate(scope, actor, {...selection,month:"2026-08"}), /empty/);
    const foreignScope = {...scope,tenantId:randomUUID()};
    await assert.rejects(() => service.calculate(foreignScope, {...actor,...foreignScope}, selection), /receipt/);
    const auditCount=(await db.query("SELECT count(*)::int n FROM test_required_audit"))[0].n;failAudit=true;await assert.rejects(()=>service.calculate(scope,actor,selection),/synthetic audit failure/);failAudit=false;assert.equal((await db.query("SELECT count(*)::int n FROM test_required_audit"))[0].n,auditCount);assert.deepEqual(await baseline(),before);
    // Crossing the total budget inside the mandatory audit must roll back its insert too.
    let clockOffset = 0;
    const realNow = Date.now;
    const clock = context.mock.method(Date, "now", () => realNow() + clockOffset);
    holdAudit = Promise.resolve();
    auditReached = () => { clockOffset = 30001; };
    try {
      await assert.rejects(() => service.calculate(scope, actor, selection), /time budget/);
      assert.equal((await db.query("SELECT count(*)::int n FROM test_required_audit"))[0].n, auditCount);
      assert.deepEqual(await baseline(), before);
    } finally { clock.mock.restore(); holdAudit = null; auditReached = () => {}; }
    @Module({controllers:[HrPayrollTrialController,HrPayrollFormalInputController],providers:[{provide:HrPayrollTrialService,useValue:service},{provide:HrPayrollFormalInputService,useValue:inputs}]})class FixtureModule{}
    const app=await NestFactory.create(FixtureModule,{logger:false});
    app.use((req:Request&{user?:JwtPrincipal},_res:unknown,next:()=>void)=>{req.user=req.headers["x-fixture-denied"]?{...actor,permissions:[]}:actor;next();});app.useGlobalGuards(new PermissionGuard(new Reflector()),new IdempotencyKeyGuard(new Reflector()));app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
    try{await app.listen(0,"127.0.0.1");const url=await app.getUrl();
      const preparationUrl=`${url}/hr/payroll/inputs/preparation?${new URLSearchParams(Object.entries(sourceQuery()).map(([key,value])=>[key,String(value)]))}`;
      const preparationResponse=await fetch(preparationUrl);assert.equal(preparationResponse.status,200);const preparedHttp=await preparationResponse.json() as {total:number;source:{recordCount:number};items:unknown[]};assert.equal(preparedHttp.total,54);assert.equal(preparedHttp.source.recordCount,54);assert.equal(preparedHttp.items.length,20);
      assert.equal((await fetch(preparationUrl,{headers:{"x-fixture-denied":"1"}})).status,403);assert.equal((await fetch(`${preparationUrl}&unexpected=1`)).status,400);assert.equal((await fetch(`${preparationUrl}&correctionWindowId=${randomUUID()}`)).status,400);
      const response=await fetch(`${url}/hr/payroll/trial-comparisons`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"synthetic-trial-key"},body:JSON.stringify(selection)});assert.equal(response.status,201);assert.equal(((await response.json()) as PayrollTrialResult).recordCount,93);assert.equal((await fetch(`${url}/hr/payroll/trial-comparisons/options`,{headers:{"x-fixture-denied":"1"}})).status,403);assert.equal((await fetch(`${url}/hr/payroll/trial-comparisons`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"synthetic-trial-key"},body:JSON.stringify({...selection,tenantId:"foreign"})})).status,400);}finally{await app.close();}
    const formal=await runs.create(scope,actor,{inputId:selection.books[0]!.inputId,expectedInputVersion:selection.books[0]!.expectedInputVersion});assert.equal(formal.employeeCount,54);assert.equal(formal.netAmount,"5346.54");await assert.rejects(()=>runs.create(scope,actor,{inputId:selection.books[1]!.inputId,expectedInputVersion:selection.books[1]!.expectedInputVersion}),/already have a run/);
    assert.equal((await service.calculate(scope,actor,selection)).recordCount,93,"trial ignores formal overlap without weakening formal safeguard");
    const evidence=(await db.query("SELECT snapshot FROM hr_payroll_formal_run_evidence WHERE run_id=$1",[formal.id]))[0].snapshot;
    for(const row of evidence.results){const trial=result.records.find(record=>record.bookId===selection.books[0]!.bookId&&record.employeeId===row.employeeId)!;assert.equal(row.calculation.netAmount,trial.totals.netAmount);assert.deepEqual(row.calculation.items.map((item:{code:string;amount:string|null;decimalValue:string})=>[item.code,item.amount??item.decimalValue]),trial.lines.filter(line=>line.modernCode).map(line=>[line.modernCode,line.modernValue]));}
    let release=()=>{};holdAudit=new Promise<void>(resolve=>{release=resolve;});const reached=new Promise<void>(resolve=>{auditReached=resolve;});const calculating=service.calculate(scope,actor,selection);await reached;
    const writer=db.createQueryRunner();await writer.connect();await writer.startTransaction();
    try{const insert=writer.query(`INSERT INTO hr_payroll_legacy_snapshot_item(tenant_id,park_id,snapshot_id,legacy_column_name,value_type,is_source_null,source_hash,raw_value) VALUES($1,$2,$3,'concurrent','unmapped',false,repeat('a',64),'synthetic append')`,[scope.tenantId,scope.parkId,result.records[0]!.sourceRecordId]);let waiting=false;for(let attempt=0;attempt<50&&!waiting;attempt++){waiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='hr_payroll_legacy_snapshot_item'::regclass AND NOT granted) AS waiting"))[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true);release();holdAudit=null;assert.equal((await calculating).recordCount,93);await insert;await writer.commitTransaction();await assert.rejects(()=>service.calculate(scope,actor,selection),/source|Source/);await assert.rejects(()=>inputs.preparation(scope,actor,sourceQuery(selection.books.findIndex(book=>book.bookId===result.records[0]!.bookId))),/source|Source|changed/);}finally{release();holdAudit=null;if(writer.isTransactionActive)await writer.rollbackTransaction();await writer.release();}
    // Same-book duplicates fail before any builder call, even when a source is already stale.
    const [{book_period_id:duplicatePeriod,legacy_source_table:table}]=await db.query("SELECT book_period_id,legacy_source_table FROM hr_payroll_legacy_snapshot WHERE id=$1",[result.records[0]!.sourceRecordId]);
    await db.query("INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash) VALUES($1,$2,$3,$4,$5,$6,repeat('d',64),repeat('d',64),'mapped',repeat('d',64))",[scope.tenantId,scope.parkId,batchId,duplicatePeriod,result.records[0]!.employeeId,table]);await assert.rejects(()=>service.calculate(scope,actor,selection),/Duplicate employee/);
    // Freeze the now duplicated complete book with intact append-only guards, then reject its census.
    for(const tableName of ["hr_payroll_legacy_snapshot","hr_payroll_legacy_snapshot_item"])await db.query(`INSERT INTO legacy_record_map SELECT $1,$2,t.id,true,'loaded' FROM ${tableName} t WHERE NOT EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.target_id=t.id AND m.target_table=$2)`,[controlId,tableName]);
    const duplicatedBookIndex=selection.books.findIndex(book=>book.bookId===result.records[0]!.bookId),duplicatedBook=selection.books[duplicatedBookIndex]!;
    const duplicateSource=await db.transaction(async manager=>{
      const [{hash,records,items}]=await manager.query("WITH source AS (SELECT hr_build_payroll_reconciliation_source($1,$2,$3,$4,'2026-07-01') AS payload) SELECT encode(digest(payload::text,'sha256'),'hex') AS hash,jsonb_array_length(payload->'snapshots') AS records,jsonb_array_length(payload->'items') AS items FROM source",[scope.tenantId,scope.parkId,batchId,duplicatedBook.bookId]);
      return(await manager.query("SELECT hr_freeze_payroll_reconciliation_source($1,$2,$3,$4,'2026-07-01',repeat('a',64),$5,$6,$7,$8,'synthetic duplicate-source review') AS id",[scope.tenantId,scope.parkId,batchId,duplicatedBook.bookId,hash,records,items,actor.sub]))[0].id as string;
    });
    await assert.rejects(()=>inputs.preparation(scope,actor,{...sourceQuery(duplicatedBookIndex),reconciliationSourceId:duplicateSource}),/duplicate source records/);
    const otherBookIndex=1-duplicatedBookIndex,otherBook=selection.books[otherBookIndex]!;
    const [{id:incompletePeriod,source_table:incompleteTable}]=await db.query("SELECT p.id,'salary'||b.legacy_scheme AS source_table FROM hr_payroll_book_period p JOIN hr_payroll_book b ON b.id=p.book_id WHERE p.book_id=$1",[otherBook.bookId]);
    await db.query("INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash) VALUES($1,$2,$3,$4,NULL,$5,repeat('e',64),repeat('e',64),'employee_unmapped',repeat('e',64))",[scope.tenantId,scope.parkId,batchId,incompletePeriod,incompleteTable]);
    const beforeIncompleteRead=await baseline();await assert.rejects(()=>inputs.preparation(scope,actor,sourceQuery(otherBookIndex)),/incomplete, unavailable or duplicate/);assert.deepEqual(await baseline(),beforeIncompleteRead);
    // No source parameter preserves the governed closed-period correction preparation.
    const reviewedRun = await runs.transition(scope, reviewer, formal.id, "review", {expectedVersion:formal.version,reason:"synthetic independent review"});
    const confirmedRun = await runs.transition(scope, reviewer, formal.id, "confirm", {expectedVersion:reviewedRun.version,reason:"synthetic independent confirmation"});
    const lifecycle = new HrPayrollPeriodLifecycleService(db, audit);
    const closedPeriod = await lifecycle.close(scope, reviewer, periodId, {expectedVersion:1,reason:"synthetic period close"});
    const window = await lifecycle.openCorrection(scope, actor, periodId, {expectedVersion:closedPeriod.version,originalRunId:formal.id,expectedRunVersion:confirmedRun.version,reason:"synthetic correction preparation"});
    const correctionQuery = {periodId,ruleSetId:ruleSets[0]!,correctionWindowId:window.id,page:1,pageSize:20};
    const beforeCorrectionRead = await baseline(), correctionRoster:string[] = [];
    for(let page=1;page<=3;page++) {
      const prepared = await inputs.preparation(scope, actor, {...correctionQuery,page});
      assert.equal(prepared.source, undefined);
      assert.equal(prepared.correctionWindowId, window.id);
      assert.equal(prepared.correctionOfRunId, formal.id);
      assert.equal(prepared.correctionEmployeeCount, 54);
      assert.equal(prepared.total, 54);
      assert.equal(prepared.expectedHeadRevision, window.inputHeadAtOpen);
      correctionRoster.push(...prepared.items.map(row=>row.employeeId));
    }
    assert.deepEqual(correctionRoster.sort(), [...preparedBooks[0]!].sort());
    const filteredCorrection = await inputs.preparation(scope, actor, {...correctionQuery,keyword:"no match"});
    assert.equal(filteredCorrection.total, 0);assert.equal(filteredCorrection.correctionEmployeeCount, 54);
    const emptyCorrection = await inputs.preparation(scope, actor, {...correctionQuery,page:99});
    assert.equal(emptyCorrection.items.length, 0);assert.equal(emptyCorrection.total, 54);
    assert.deepEqual(await baseline(), beforeCorrectionRead, "correction preparation remains read-only");
  }finally{if(db?.isInitialized)await db.destroy();await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);await admin.destroy();}
});
