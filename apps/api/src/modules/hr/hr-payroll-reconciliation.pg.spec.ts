import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { HR_PAYROLL_DSL_PARSER_VERSION,parsePayrollFormula } from "./hr-payroll-formula-dsl";

const databaseUrl=process.env.HR_T4_RECONCILIATION_PG_URL;
const enabled=process.env.HR_T4_RECONCILIATION_PG_ALLOW_MUTATION==="yes"&&Boolean(databaseUrl);

test("real PostgreSQL reconciliation calculation is serialized, immutable and isolated",{skip:!enabled},async()=>{
 const db=new DataSource({type:"postgres",url:databaseUrl,ssl:false});await db.initialize();
 const ids={actor:randomUUID(),employee:randomUUID(),plan:randomUUID(),period:randomUUID(),summary:randomUUID(),attendanceBatch:randomUUID(),attendanceItem:randomUUID(),book:randomUUID(),definition:randomUUID(),item:randomUUID(),formula:randomUUID(),bookPeriod:randomUUID(),legacyBatch:randomUUID(),snapshot:randomUUID(),snapshotItem:randomUUID(),policy:randomUUID()};
 const legacyFormulaId=100000+Number.parseInt(ids.formula.slice(0,6),16)%800000;
 const scopeRow=(await db.query("SELECT tenant_id,park_id FROM biz_park WHERE is_deleted=false ORDER BY id LIMIT 1"))[0] as {tenant_id:string;park_id:string};
 const scope={tenantId:scopeRow.tenant_id,parkId:scopeRow.park_id};
 const parsed=parsePayrollFormula("[人事系统.基本工资]+[人事系统.津贴]");assert.ok(parsed.ast);
 const q=(sql:string,params:unknown[]=[])=>db.query(sql,params);
 try{
  await q("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,$4,'PG核对员工','active')",[ids.employee,scope.tenantId,scope.parkId,`PG-${ids.employee.slice(0,8)}`]);
  await q("INSERT INTO hr_compensation_plan(id,tenant_id,park_id,plan_code,plan_name,effective_from,status) VALUES($1,$2,$3,$4,'PG核对方案','2026-06-01','active')",[ids.plan,scope.tenantId,scope.parkId,`PG-${ids.plan.slice(0,8)}`]);
  await q("INSERT INTO hr_employee_compensation(tenant_id,park_id,employee_id,plan_id,effective_from,base_salary,allowance_amount,variable_target,status) VALUES($1,$2,$3,$4,'2026-06-01',120,5,0,'active')",[scope.tenantId,scope.parkId,ids.employee,ids.plan]);
  await q("INSERT INTO hr_attendance_period(id,tenant_id,park_id,period_month,status,active_version,closed_at,closed_by) VALUES($1,$2,$3,'2026-06-01','closed',1,now(),$4)",[ids.period,scope.tenantId,scope.parkId,ids.actor]);
  await q("INSERT INTO hr_attendance_month_summary(id,tenant_id,park_id,period_id,employee_id,summary_version,worked_minutes) VALUES($1,$2,$3,$4,$5,1,9600)",[ids.summary,scope.tenantId,scope.parkId,ids.period,ids.employee]);
  await q("INSERT INTO hr_attendance_payroll_input_batch(id,tenant_id,park_id,period_id,batch_no,batch_type,status,created_from_summary_version) VALUES($1,$2,$3,$4,1,'close','effective',1)",[ids.attendanceBatch,scope.tenantId,scope.parkId,ids.period]);
  await q("INSERT INTO hr_attendance_payroll_input_item(id,tenant_id,park_id,batch_id,employee_id,source_summary_id,worked_minutes,late_minutes,early_minutes,absence_days,missing_punch_days) VALUES($1,$2,$3,$4,$5,$6,9600,0,0,0,0)",[ids.attendanceItem,scope.tenantId,scope.parkId,ids.attendanceBatch,ids.employee,ids.summary]);
  await q("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,book_name,source_hash,status) VALUES($1,$2,$3,31,'PG服务核对账套',$4,'approved')",[ids.book,scope.tenantId,scope.parkId,"a".repeat(64)]);
  await q("INSERT INTO hr_payroll_item_definition(id,tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,'实发工资','NET')",[ids.definition,scope.tenantId,scope.parkId,ids.book]);
  await q("INSERT INTO hr_payroll_item_version(id,tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,source_hash) VALUES($1,$2,$3,$4,1,'实发工资','decimal','decimal','summary','summary',4,$5)",[ids.item,scope.tenantId,scope.parkId,ids.definition,"b".repeat(64)]);
  await q("INSERT INTO hr_payroll_formula_version(id,tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,expression_hash,parser_version,parse_status,dsl_ast,dependency_codes,calculation_order,reviewed_by,reviewed_at,review_reason) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'approved_for_simulation',$10,$11,1,$12,now(),'PG fixture')",[ids.formula,scope.tenantId,scope.parkId,ids.book,ids.item,legacyFormulaId,"[人事系统.基本工资]+[人事系统.津贴]","c".repeat(64),HR_PAYROLL_DSL_PARSER_VERSION,JSON.stringify(parsed.ast),JSON.stringify(parsed.dependencies),ids.actor]);
  await q("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,'2026-06-01',1,$5)",[ids.bookPeriod,scope.tenantId,scope.parkId,ids.book,"d".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,quarantined_row_count,status) VALUES($1,$2,$3,$4,$5,$6,$7,1,1,0,'unpublished')",[ids.legacyBatch,scope.tenantId,scope.parkId,`PG-${ids.legacyBatch.slice(0,8)}`,"e".repeat(64),"f".repeat(64),"1".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,net_amount,source_hash) VALUES($1,$2,$3,$4,$5,$6,'salary31',$7,$8,'mapped',100,$9)",[ids.snapshot,scope.tenantId,scope.parkId,ids.legacyBatch,ids.bookPeriod,ids.employee,"2".repeat(64),"3".repeat(64),"4".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,raw_value,decimal_value,source_hash) VALUES($1,$2,$3,$4,$5,'实发工资','decimal',false,'100',100,$6)",[ids.snapshotItem,scope.tenantId,scope.parkId,ids.snapshot,ids.item,"5".repeat(64)]);
  await q("UPDATE hr_payroll_legacy_batch SET status='published',published_at=now(),published_by=$1 WHERE id=$2",[ids.actor,ids.legacyBatch]);
  await q("INSERT INTO hr_payroll_reconciliation_policy_version(id,tenant_id,park_id,book_id,net_item_version_id,version_no,tolerance_amount,status,reviewed_by,review_reason,create_by,update_by) VALUES($1,$2,$3,$4,$5,1,0.01,'approved',$6,'PG fixture',$6,$6)",[ids.policy,scope.tenantId,scope.parkId,ids.book,ids.item,ids.actor]);
  await q("INSERT INTO hr_payroll_reconciliation_policy_current(tenant_id,park_id,book_id,policy_version_id,update_by) VALUES($1,$2,$3,$4,$5)",[scope.tenantId,scope.parkId,ids.book,ids.policy,ids.actor]);
  const protectedBefore=(await q("SELECT (SELECT count(*) FROM hr_payroll_run) AS runs,(SELECT count(*) FROM hr_payslip) AS slips,(SELECT count(*) FROM hr_payroll_legacy_snapshot) AS legacy,(SELECT count(*) FROM hr_attendance_payroll_input_item) AS attendance"))[0];
  const audit={recordOperationRequired:async()=>undefined};const service=new HrPayrollHistoryService(db,audit as never);const actor={sub:ids.actor,username:"pg-fixture",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]};const dto={legacyBatchId:ids.legacyBatch,attendanceInputBatchId:ids.attendanceBatch};
  const [first,second]=await Promise.all([service.simulateReconciliation(scope,actor,dto),service.simulateReconciliation(scope,actor,dto)]);assert.notEqual(first.id,second.id);
  const results=await q("SELECT old_total,new_total,delta_total FROM hr_payroll_reconciliation_result WHERE run_id=ANY($1::uuid[]) ORDER BY run_id",[[first.id,second.id]]);assert.equal(results.length,2);for(const row of results){assert.equal(row.old_total,"100.0000");assert.equal(row.new_total,"125.0000");assert.equal(row.delta_total,"25.0000");}
  await assert.rejects(()=>q("UPDATE hr_payroll_reconciliation_result SET new_total=999 WHERE run_id=$1",[first.id]),/append-only/u);
  const protectedAfter=(await q("SELECT (SELECT count(*) FROM hr_payroll_run) AS runs,(SELECT count(*) FROM hr_payslip) AS slips,(SELECT count(*) FROM hr_payroll_legacy_snapshot) AS legacy,(SELECT count(*) FROM hr_attendance_payroll_input_item) AS attendance"))[0];assert.deepEqual(protectedAfter,protectedBefore);
 }finally{await db.destroy();}
});
