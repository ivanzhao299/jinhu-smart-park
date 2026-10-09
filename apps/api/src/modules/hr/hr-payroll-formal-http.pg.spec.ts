import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import type { Request } from "express";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS, HR_INSURANCE_OWNED_PERMISSIONS, HR_INSURANCE_POLICY_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import { IdempotencyService, setIdempotencyService } from "../../shared/services/idempotency.service";
import { IdempotencyRequestEntity } from "../../shared/entities/idempotency-request.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { LoginLogEntity } from "../audit/entities/login-log.entity";
import { OpLogEntity } from "../audit/entities/op-log.entity";
import { HrPayrollFormalRuleController } from "./hr-payroll-formal-rule.controller";
import { HrPayrollFormalInputController } from "./hr-payroll-formal-input.controller";
import { HrPayrollFormalRunController } from "./hr-payroll-formal-run.controller";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";

import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { lockModernPayrollInsuranceSources } from "./hr-payroll-insurance-source";

const enabled = process.env.HR_PAYROLL_FORMAL_HTTP_PG_REQUIRED === "1";
// Full real schema, Nest routes/DTOs/permission guard/services/audit/idempotency.
// Loopback synthetic principals are injected; this is not a JWT or production-role UAT.
test("full-schema HTTP payroll lifecycle validates, replays, confirms and corrects exact results", {skip:!enabled}, async()=>{
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT,"15490");
  assert.match(process.env.POSTGRES_DB??"",/^jinhu_hr_migration_lab_core_payroll(?:fresh|upgrade)$/u);
  const db=new DataSource({type:"postgres",host:"127.0.0.1",port:15490,username:"postgres",password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[LoginLogEntity,OpLogEntity,IdempotencyRequestEntity],synchronize:false});
  await db.initialize();
  const scope={tenantId:randomUUID().replaceAll("-",""),parkId:randomUUID().replaceAll("-","")};
  const author:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic-author",roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_READ,HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_RULE_READ,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_PAYROLL_REVIEW,HR_PERMISSIONS.HR_PAYROLL_CONFIRM,HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW]};
  const actors={author,reviewer:{...author,sub:randomUUID(),username:"synthetic-reviewer"},limited:{...author,sub:randomUUID(),permissions:[HR_PERMISSIONS.HR_PAYROLL_READ]},foreign:{...author,sub:randomUUID(),parkId:randomUUID().replaceAll("-","")}};
  const audit=new AuditService(db.getRepository(LoginLogEntity),db.getRepository(OpLogEntity));
  const rules=new HrPayrollFormalRuleService(db,audit),inputs=new HrPayrollFormalInputService(db,rules,audit),runs=new HrPayrollFormalRunService(db,inputs,audit);
  class FixtureModule {}
  Module({controllers:[HrPayrollFormalRuleController,HrPayrollFormalInputController,HrPayrollFormalRunController],providers:[{provide:HrPayrollFormalRuleService,useValue:rules},{provide:HrPayrollFormalInputService,useValue:inputs},{provide:HrPayrollFormalRunService,useValue:runs}]})(FixtureModule);
  const app=await NestFactory.create(FixtureModule,{logger:["error"]});
  setIdempotencyService(new IdempotencyService(db.getRepository(IdempotencyRequestEntity),db));
  app.setGlobalPrefix("api/v1");
  app.use((req:Request&{user?:JwtPrincipal},_res:unknown,next:()=>void)=>{req.user=actors[req.header("x-fixture-user") as keyof typeof actors]??actors.author;next();});
  app.useGlobalGuards(new PermissionGuard(new Reflector()));
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  try{
    const migrationRows=await db.query("SELECT filename FROM sys_schema_migration_history WHERE status='succeeded' AND filename LIKE ANY($1::text[])",[["000347_%","000348_%","000349_%","000350_%"]]);
    assert.equal(migrationRows.length,4,"requires actual full migration runner history");
    await app.listen(0,"127.0.0.1");const base=await app.getUrl();
    async function request<T>(method:string,path:string,body:unknown=undefined,actor:keyof typeof actors="author",key=randomUUID(),expected=method==="GET"?200:201):Promise<T>{
      const response=await fetch(`${base}/api/v1/hr/payroll/${path}`,{method,headers:{"content-type":"application/json","x-fixture-user":actor,"x-idempotency-key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const payload=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(payload)}`);return payload as T;
    }
    await request("GET","formal-runs/options?inputId=invalid&expectedInputVersion=0",undefined,"author",randomUUID(),400);
    await request("GET","formal-runs/options?inputId=invalid&expectedInputVersion=1",undefined,"limited",randomUUID(),403);
    const employeeId=randomUUID(),periodId=randomUUID();
    await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date) VALUES($1,$2,$3,$4,'合成HTTP员工','active','2026-10-01')",[employeeId,scope.tenantId,scope.parkId,`SYN-${randomUUID()}`]);
    await db.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-10-01','2026-10-01','2026-10-31','open')",[periodId,scope.tenantId,scope.parkId]);
    const set=await request<{id:string}>("POST","rules",{ruleCode:`HTTP-${randomUUID()}`,displayName:"合成HTTP规则"});
    const definition={roundingPolicy:"line_items_half_up",items:[{code:"收入",role:"earning",expression:null},{code:"税",role:"tax",expression:null},{code:"应发",role:"gross",expression:"[收入]"},{code:"实发",role:"net",expression:"[应发]-[税]"}]};
    const draft=await request<{id:string;version:number}>("POST",`rules/${set.id}/versions`,{expectedHeadRevision:0,definition,reason:"合成现行业务"});
    const submitted=await request<{version:number}>("POST",`rules/versions/${draft.id}/submit`,{expectedVersion:draft.version});
    const approval={expectedVersion:submitted.version,decision:"approve",effectiveFrom:"2026-10",reason:"独立复核规则"};
    await request("POST",`rules/versions/${draft.id}/review`,approval,"author",randomUUID(),403);
    await request("POST",`rules/versions/${draft.id}/review`,approval,"reviewer");
    const inputPayload={periodId,ruleSetId:set.id,ruleVersionId:draft.id,expectedHeadRevision:0,reason:"合成正式输入",employees:[{employeeId,expectedEmployeeVersion:1,directItems:{收入:"100.2350",税:"0.0100"}}]};
    await request("POST","inputs",{...inputPayload,tenantId:"override"},"author",randomUUID(),400);
    const input=await request<{id:string;version:number}>("POST","inputs",inputPayload);
    await request("POST",`inputs/${input.id}/confirm`,{expectedVersion:input.version},"author",randomUUID(),403);
    const confirmed=await request<{version:number}>("POST",`inputs/${input.id}/confirm`,{expectedVersion:input.version},"reviewer");
    const optionsPath=`formal-runs/options?inputId=${input.id}&expectedInputVersion=${confirmed.version}&page=1&pageSize=20`;
    const options=await request<{requires:Record<string,boolean>;items:unknown[];canCreateBase:boolean}>("GET",optionsPath);
    assert.deepEqual(options.requires,{compensation:false,attendance:false,insurance:false});assert.equal(options.items.length,1);assert.equal(options.canCreateBase,true);
    await request("GET",optionsPath,undefined,"foreign",randomUUID(),404);
    const body={inputId:input.id,expectedInputVersion:confirmed.version},key=randomUUID();
    const created=await request<{id:string;version:number;grossAmount:string;netAmount:string}>("POST","formal-runs",body,"author",key);
    assert.equal(created.grossAmount,"100.24");assert.equal(created.netAmount,"100.23");
    assert.deepEqual(await request("POST","formal-runs",body,"author",key),created,"real database idempotency replay");
    await request("POST","formal-runs",{...body,expectedInputVersion:confirmed.version+1},"author",key,409);
    assert.equal((await db.query("SELECT count(*)::int n FROM hr_payroll_run WHERE tenant_id=$1 AND park_id=$2",[scope.tenantId,scope.parkId]))[0].n,1);
    const detail=await request<{totals:{netAmount:string};canReview:boolean;items:Array<{items:unknown[]}>}>("GET",`formal-runs/${created.id}?page=1&pageSize=20`);
    assert.equal(detail.totals.netAmount,"100.23");assert.equal(detail.items[0]?.items.length,4);assert.equal(detail.canReview,false);
    await request("POST",`formal-runs/${created.id}/review`,{expectedVersion:created.version,reason:"自审"},"author",randomUUID(),403);
    const reviewed=await request<{version:number}>("POST",`formal-runs/${created.id}/review`,{expectedVersion:created.version,reason:"核对分项"},"reviewer");
    const frozen=await request<{version:number;status:string}>("POST",`formal-runs/${created.id}/confirm`,{expectedVersion:reviewed.version,reason:"确认金额"},"reviewer");assert.equal(frozen.status,"confirmed");
    const correctionOptions=await request<{canCreateBase:boolean;correctionRuns:Array<{id:string}>}>("GET",optionsPath);assert.equal(correctionOptions.canCreateBase,false);assert.equal(correctionOptions.correctionRuns[0]?.id,created.id);
    const corrected=await request<{id:string;netAmount:string}>("POST","formal-runs",{...body,correctionOfRunId:created.id,correctionReason:"重新核对后更正"});assert.notEqual(corrected.id,created.id);assert.equal(corrected.netAmount,"100.23");
    assert.equal((await db.query("SELECT status FROM hr_payroll_run WHERE id=$1",[created.id]))[0].status,"confirmed");
    await assert.rejects(db.query("UPDATE hr_payslip SET net_amount=0 WHERE run_id=$1",[created.id]),/frozen|balance/u);
    // Real producer migrations/services feed the formal payroll consumer; no insurance-table fixtures.
    const insuredId=randomUUID();
    await db.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date) VALUES($1,$2,$3,$4,'合成保险工资员工','active','2026-10-01')",[insuredId,scope.tenantId,scope.parkId,`SYN-${randomUUID()}`]);
    const insuranceActor={...author,permissions:[...author.permissions,HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE,...Object.values(HR_INSURANCE_OWNED_PERMISSIONS)]};
    const policyService=new HrInsurancePolicyVersionService(db,audit),owned=new HrInsuranceOwnedPeriodService(db,audit);
    const policy=await policyService.create(scope,insuranceActor,{requestId:randomUUID(),policyCode:`SYN-${randomUUID()}`,policyName:"合成保险政策",variantNo:1,effectiveFrom:"2026-01",effectiveThrough:"2026-12",reason:"验证实际来源衔接",items:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,factors:{base:{rate:"0.01",fixedAmount:null},employer:{rate:"0.01",fixedAmount:null},employee:{rate:"0.01",fixedAmount:null},supplement:{rate:"0.01",fixedAmount:null}}}))});
    const previewBody={requestId:randomUUID(),employeeId:insuredId,expectedEmployeeVersion:1,policyVersionId:policy.id,expectedDefinitionHash:policy.definitionHash,periodMonth:"2026-10",includeFund:false,bases:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,contributionBase:"10.00"}))};
    const preview=await owned.preview(scope,insuranceActor,previewBody);
    const insurance=await owned.confirm(scope,insuranceActor,{requestId:randomUUID(),previewId:preview.id,expectedPreviewHash:preview.previewHash,reason:"实际确认来源"});
    const insuranceSet=await request<{id:string}>("POST","rules",{ruleCode:`INS-${randomUUID()}`,displayName:"合成保险工资规则"});
    const insuranceDefinition={roundingPolicy:"line_items_half_up",items:[definition.items[0],{code:"养老个人扣款",role:"deduction",expression:"[人事系统.养老保险个人金额]"},definition.items[1],definition.items[2],{code:"实发",role:"net",expression:"[应发]-[养老个人扣款]-[税]"}]};
    const insuranceRule=await request<{id:string;version:number}>("POST",`rules/${insuranceSet.id}/versions`,{expectedHeadRevision:0,definition:insuranceDefinition,reason:"实际保险接工资"});
    const insuranceSubmitted=await request<{version:number}>("POST",`rules/versions/${insuranceRule.id}/submit`,{expectedVersion:insuranceRule.version});
    await request("POST",`rules/versions/${insuranceRule.id}/review`,{expectedVersion:insuranceSubmitted.version,decision:"approve",effectiveFrom:"2026-10",reason:"独立核对"},"reviewer");
    const insuranceInput=await request<{id:string;version:number}>("POST","inputs",{...inputPayload,ruleSetId:insuranceSet.id,ruleVersionId:insuranceRule.id,employees:[{employeeId:insuredId,expectedEmployeeVersion:1,directItems:{收入:"100.00",税:"0.00"}}]});
    const insuranceConfirmed=await request<{version:number}>("POST",`inputs/${insuranceInput.id}/confirm`,{expectedVersion:insuranceInput.version},"reviewer");
    const insuranceOptionsPath=`formal-runs/options?inputId=${insuranceInput.id}&expectedInputVersion=${insuranceConfirmed.version}`;
    type InsuranceSelection={employeeId:string;sourceKind:"modern_confirmed";sourceId:string;expectedVersion:number;expectedHash:string};
    const insuranceOptions=await request<{items:Array<{insuranceSource:InsuranceSelection}>}>("GET",insuranceOptionsPath);
    assert.equal(insuranceOptions.items[0]!.insuranceSource.sourceId,insurance.id);
    const insuranceChoice=insuranceOptions.items[0]!.insuranceSource;
    const insuranceRun=await request<{id:string;deductionAmount:string;netAmount:string}>("POST","formal-runs",{inputId:insuranceInput.id,expectedInputVersion:insuranceConfirmed.version,insuranceSources:[insuranceChoice]});
    assert.equal(insuranceRun.deductionAmount,"0.10");assert.equal(insuranceRun.netAmount,"99.90");
    const evidence=await db.query("SELECT snapshot FROM hr_payroll_formal_run_evidence WHERE run_id=$1",[insuranceRun.id]);
    assert.ok(JSON.stringify(evidence[0].snapshot).includes(insurance.id));
    await owned.close(scope,insuranceActor,{requestId:randomUUID(),revisionId:insurance.id,expectedPeriodVersion:1,reason:"关账后更正"});
    const nextPreview=await owned.preview(scope,insuranceActor,{...previewBody,requestId:randomUUID(),bases:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,contributionBase:"20.00"}))});
    const reader=db.createQueryRunner();await reader.connect();await reader.startTransaction();
    let nextInsurance:Awaited<ReturnType<HrInsuranceOwnedPeriodService["correct"]>>;
    try{
      await lockModernPayrollInsuranceSources(reader.manager,scope,"2026-10-01",[insuranceChoice]);
      const pendingCorrection=owned.correct(scope,insuranceActor,{requestId:randomUUID(),previewId:nextPreview.id,expectedPreviewHash:nextPreview.previewHash,previousRevisionId:insurance.id,expectedPeriodVersion:1,reason:"更正实际保险金额"});
      // Observe a real waiting family lock, rather than infer serialization from a mock.
      let waiting=false;
      for(let attempt=0;attempt<40&&!waiting;attempt++){
        const locks=await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS waiting");
        waiting=locks[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
      }
      await reader.commitTransaction();nextInsurance=await pendingCorrection;
      assert.equal(waiting,true,"insurance correction waits for the payroll consumer's current source family lock");
    }finally{if(reader.isTransactionActive)await reader.rollbackTransaction();await reader.release();}

    assert.equal(nextInsurance.revisionNo,2);
    const nextChoices=await request<{items:Array<{insuranceSource:InsuranceSelection}>}>("GET",insuranceOptionsPath);
    assert.equal(nextChoices.items[0]!.insuranceSource.expectedVersion,2);
    const stale=await Promise.allSettled([db.transaction(async manager=>{
      return lockModernPayrollInsuranceSources(manager,scope,"2026-10-01",[insuranceChoice]);
    })]);
    assert.equal(stale[0]!.status,"rejected");
    assert.deepEqual((await db.query("SELECT snapshot FROM hr_payroll_formal_run_evidence WHERE run_id=$1",[insuranceRun.id]))[0].snapshot,evidence[0].snapshot,"insurance corrections preserve already-calculated payroll snapshot");

    assert.ok((await db.query("SELECT count(*)::int n FROM sys_op_log WHERE tenant_id=$1 AND park_id=$2",[scope.tenantId,scope.parkId]))[0].n>0,"real required audit persisted");
  }finally{await app.close();setIdempotencyService(null);await db.destroy();}
});
