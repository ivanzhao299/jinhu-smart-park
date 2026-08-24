import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
 HR_ENTITIES,HrApprovalRequestEntity,HrCompensationPlanEntity,HrEmployeeCompensationEntity,HrEmployeeEntity,HrEmployeeProfileEntity,
 HrEmploymentEventEntity,HrFeedbackAssignmentEntity,HrFeedbackCycleEntity,HrFeedbackResponseEntity,HrGoalCheckinEntity,HrGoalCycleEntity,
 HrGoalEntity,HrPayrollPeriodEntity,HrPayrollRunEntity,HrPayslipEntity,HrPerformanceCycleEntity,HrPerformancePlanEntity,HrPositionEntity,HrWorkReportEntity
} from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required=process.env.HR_PAYROLL_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the HR payroll PostgreSQL gate");
const suite=required?describe:describe.skip;

const scope={tenantId:"hr-payroll-gate",parkId:"hr-payroll-gate"};
const actor={sub:"11111111-1111-4111-8111-111111111111"} as never;

suite("HR payroll PostgreSQL concurrency gate",()=>{
 let dataSource:DataSource;
 let service:HrService;

 async function reset(){
  await dataSource.query("DELETE FROM hr_payslip WHERE tenant_id=$1 AND park_id=$2",[scope.tenantId,scope.parkId]);
  await dataSource.query("DELETE FROM hr_payroll_run WHERE tenant_id=$1 AND park_id=$2",[scope.tenantId,scope.parkId]);
  await dataSource.query("DELETE FROM hr_payroll_period WHERE tenant_id=$1 AND park_id=$2",[scope.tenantId,scope.parkId]);
 }

 async function createPeriod(){
  const rows=await dataSource.query(`INSERT INTO hr_payroll_period
   (tenant_id,park_id,period_month,start_date,end_date,status,create_by,update_by)
   VALUES ($1,$2,'2099-01-01','2099-01-01','2099-01-31','open',$3,$3) RETURNING id`,
   [scope.tenantId,scope.parkId,"11111111-1111-4111-8111-111111111111"]
  ) as Array<{id:string}>;
  return rows[0]!.id;
 }

 before(async()=>{
  dataSource=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),
   database:process.env.POSTGRES_DB??"jinhu_hr_payroll_gate",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,
   entities:[...HR_ENTITIES],synchronize:false});
  await dataSource.initialize();
  const repositories=[HrEmployeeEntity,HrPositionEntity,HrEmploymentEventEntity,HrEmployeeProfileEntity,HrGoalCycleEntity,HrGoalEntity,
   HrGoalCheckinEntity,HrWorkReportEntity,HrPerformanceCycleEntity,HrPerformancePlanEntity,HrFeedbackCycleEntity,HrFeedbackAssignmentEntity,
   HrFeedbackResponseEntity,HrCompensationPlanEntity,HrEmployeeCompensationEntity,HrPayrollPeriodEntity,HrPayrollRunEntity,HrPayslipEntity,
   HrApprovalRequestEntity].map(entity=>dataSource.getRepository(entity));
  service=new (HrService as unknown as new(...args:unknown[])=>HrService)(...repositories,{}, {}, {publishWorkReportSubmitted:async()=>undefined,publishWorkReportReviewed:async()=>undefined},dataSource);
 });
 beforeEach(reset);
 after(async()=>{if(dataSource?.isInitialized){await reset();await dataSource.destroy();}});

 it("serializes duplicate base-run creation to one committed winner",async()=>{
  const periodId=await createPeriod();
  const results=await Promise.allSettled([
   service.createPayrollRun(scope,actor,{periodId}),
   service.createPayrollRun(scope,actor,{periodId})
  ]);
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  const rejected=results.find(result=>result.status==="rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof ConflictException);
  const rows=await dataSource.query("SELECT count(*)::int AS count FROM hr_payroll_run WHERE tenant_id=$1 AND park_id=$2 AND period_id=$3",[scope.tenantId,scope.parkId,periodId]) as Array<{count:number}>;
  assert.equal(rows[0]!.count,1);
 });

 it("serializes concurrent review so a stale second writer gets a conflict",async()=>{
  const periodId=await createPeriod();
  const run=await service.createPayrollRun(scope,actor,{periodId});
  const results=await Promise.allSettled([
   service.transitionPayrollRun(scope,actor,run.id,"review"),
   service.transitionPayrollRun(scope,actor,run.id,"review")
  ]);
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  const rejected=results.find(result=>result.status==="rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof ConflictException);
  const rows=await dataSource.query("SELECT status FROM hr_payroll_run WHERE id=$1",[run.id]) as Array<{status:string}>;
  assert.equal(rows[0]!.status,"reviewing");
 });

 it("rolls back an unbalanced run update at the database boundary",async()=>{
  const periodId=await createPeriod();
  const run=await service.createPayrollRun(scope,actor,{periodId});
  await assert.rejects(dataSource.transaction(manager=>manager.query(
   "UPDATE hr_payroll_run SET gross_total=100,deduction_total=10,net_total=95 WHERE id=$1",[run.id]
  )),/ck_hr_payroll_totals_balance/);
  const rows=await dataSource.query("SELECT gross_total::text AS gross FROM hr_payroll_run WHERE id=$1",[run.id]) as Array<{gross:string}>;
  assert.equal(rows[0]!.gross,"0.00");
 });
});
