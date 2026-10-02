#!/usr/bin/env node
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

// Use a dedicated connected pg Client, outside any caller-owned transaction.
// Counts only. This receipt neither freezes input nor authorizes calculation,
// historical publication, import, account changes or payment.
export async function inspectPayrollSimulationInputs(client,{tenantId,parkId,periodMonth}) {
 if(typeof tenantId!=="string"||!tenantId.trim()||tenantId.length>64||typeof parkId!=="string"||!parkId.trim()||parkId.length>64||typeof periodMonth!=="string"||!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(periodMonth)||periodMonth.startsWith("0000"))throw new Error("PAYROLL_INPUT_SCOPE_OR_MONTH_INVALID");
 let begun=false;
 try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");begun=true;
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='1s'");
  const {rows}=await client.query(`WITH legacy AS (
   SELECT s.id,s.employee_id,s.net_amount,p.book_id,b.status
   FROM hr_payroll_legacy_snapshot s
   JOIN hr_payroll_legacy_batch b ON b.id=s.batch_id AND b.tenant_id=s.tenant_id AND b.park_id=s.park_id AND b.is_deleted=false
   JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id AND p.is_deleted=false
   JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id AND e.is_deleted=false
   WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.is_deleted=false AND s.mapping_status='mapped' AND p.period_month=$3::date
  ), employees AS (SELECT DISTINCT employee_id FROM legacy), books AS (SELECT DISTINCT book_id FROM legacy), attendance AS (
   SELECT b.id FROM hr_attendance_payroll_input_batch b JOIN hr_attendance_period p
    ON p.id=b.period_id AND p.tenant_id=b.tenant_id AND p.park_id=b.park_id AND p.is_deleted=false
   WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.is_deleted=false AND b.status='effective' AND p.status='closed' AND p.period_month=$3::date
  ), net_mappings AS (
   SELECT cur.book_id,count(*) AS n FROM hr_payroll_reconciliation_policy_current cur
   JOIN hr_payroll_reconciliation_policy_version policy ON policy.id=cur.policy_version_id AND policy.tenant_id=cur.tenant_id AND policy.park_id=cur.park_id AND policy.book_id=cur.book_id AND policy.status='approved' AND policy.is_deleted=false
   JOIN hr_payroll_item_version item ON item.id=policy.net_item_version_id AND item.tenant_id=cur.tenant_id AND item.park_id=cur.park_id AND item.is_deleted=false AND item.enabled=true AND item.value_type='decimal'
   JOIN hr_payroll_item_definition d ON d.id=item.item_definition_id AND d.tenant_id=cur.tenant_id AND d.park_id=cur.park_id AND d.book_id=cur.book_id AND d.is_deleted=false
   JOIN hr_payroll_formula_version f ON f.item_version_id=item.id AND f.book_id=cur.book_id AND f.tenant_id=cur.tenant_id AND f.park_id=cur.park_id AND f.parse_status='approved_for_simulation' AND f.is_deleted=false
   WHERE cur.tenant_id=$1 AND cur.park_id=$2 GROUP BY cur.book_id
  ) SELECT
   (SELECT count(*) FROM legacy)::int AS snapshots,
   (SELECT count(*) FROM employees)::int AS employees,
   (SELECT count(*) FROM books)::int AS books,
   (SELECT count(*) FROM legacy WHERE status<>'published')::int AS unpublished_snapshots,
   (SELECT count(*) FROM legacy WHERE net_amount IS NULL)::int AS missing_net_snapshots,
   (SELECT count(*) FROM attendance)::int AS effective_attendance_batches,
   (SELECT count(*) FROM employees e WHERE NOT EXISTS (
    SELECT 1 FROM hr_attendance_payroll_input_item i JOIN attendance a ON a.id=i.batch_id
    WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.employee_id=e.employee_id AND i.is_deleted=false
   ))::int AS employees_missing_attendance,
   (SELECT count(*) FROM employees e WHERE NOT EXISTS (
    SELECT 1 FROM hr_employee_compensation c WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.employee_id=e.employee_id AND c.is_deleted=false AND c.status='active' AND c.effective_from<=$3::date AND (c.effective_to IS NULL OR c.effective_to>=$3::date)
   ))::int AS employees_missing_compensation,
   (SELECT count(*) FROM employees e WHERE NOT EXISTS (
    SELECT 1 FROM hr_employee_insurance_period i WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.employee_id=e.employee_id AND i.is_deleted=false AND i.period_year=extract(year FROM $3::date) AND i.period_month=extract(month FROM $3::date)
   ))::int AS employees_missing_insurance,
   (SELECT count(*) FROM books b LEFT JOIN net_mappings m ON m.book_id=b.book_id WHERE coalesce(m.n,0)<>1)::int AS books_missing_unique_net_mapping`,[tenantId,parkId,periodMonth]);
  const counts=rows[0];
  if(!counts||Object.values(counts).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error("PAYROLL_INPUT_COUNTS_INVALID");
  const blockers=[];
  if(!counts.snapshots)blockers.push("NO_MAPPED_HISTORY_FOR_MONTH");
  if(counts.unpublished_snapshots)blockers.push("HISTORY_NOT_PUBLISHED_AND_FROZEN_SOURCE_UNAVAILABLE");
  if(counts.missing_net_snapshots)blockers.push("LEGACY_NET_AMOUNT_MISSING");
  if(counts.effective_attendance_batches!==1)blockers.push("CLOSED_EFFECTIVE_ATTENDANCE_BATCH_NOT_UNIQUE");
  if(counts.employees_missing_attendance)blockers.push("ATTENDANCE_EMPLOYEE_INPUT_MISSING");
  if(counts.employees_missing_compensation)blockers.push("COMPENSATION_INPUT_MISSING");
  if(counts.employees_missing_insurance)blockers.push("INSURANCE_INPUT_MISSING");
  if(counts.books_missing_unique_net_mapping)blockers.push("APPROVED_NET_MAPPING_MISSING_OR_AMBIGUOUS");
  return {kind:"hr_payroll_simulation_input_inventory",periodMonth,counts,blockers,
   structuralPrerequisitesPresent:blockers.length===0,simulationReady:false,
   remainingValidation:["SELECT_EXACT_LEGACY_AND_ATTENDANCE_BATCH","VERIFY_APPROVED_FORMULA_AST_AND_DEPENDENCIES","VERIFY_REQUIRED_LEGACY_ITEM_VALUES","BUSINESS_PERIOD_AND_RULE_ACCEPTANCE"],
   databaseWrite:false,sourceFrozen:false,payrollPublished:false,paymentEnabled:false};
 } finally {if(begun)await client.query("ROLLBACK");}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);
 if(args.length!==3){process.stderr.write("Usage: node inspect-payroll-simulation-inputs.mjs TENANT_ID PARK_ID YYYY-MM-01\n");process.exitCode=1;}
 else if(["POSTGRES_HOST","POSTGRES_PORT","POSTGRES_DB","POSTGRES_USER"].some(key=>!process.env[key]?.trim())||!/^\d+$/.test(process.env.POSTGRES_PORT)||Number(process.env.POSTGRES_PORT)<1||Number(process.env.POSTGRES_PORT)>65535) {
  process.stderr.write("PAYROLL_INPUT_EXPLICIT_DATABASE_CONFIG_REQUIRED\n");process.exitCode=1;
 } else {
  const require=createRequire(new URL("../../apps/api/package.json",import.meta.url));
  const {Client}=require("pg");
  const client=new Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT??5432),database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,connectionTimeoutMillis:5000});
  try {await client.connect();const result=await inspectPayrollSimulationInputs(client,{tenantId:args[0],parkId:args[1],periodMonth:args[2]});process.stdout.write(JSON.stringify(result)+"\n");}
  catch {process.stderr.write("PAYROLL_INPUT_INSPECTION_FAILED\n");process.exitCode=1;}
  finally {await client.end();}
 }
}
