import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../../..");
const migration=readFileSync(resolve(root,"database/migrations/000250_hr_payroll_reconciliation_simulation.sql"),"utf8");
const controller=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-payroll-history.controller.ts"),"utf8");
const service=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-payroll-history.service.ts"),"utf8");
const dsl=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-payroll-formula-dsl.ts"),"utf8");
const entities=readFileSync(resolve(root,"apps/api/src/modules/hr/entities/hr.entities.ts"),"utf8");
const productionSeed=readFileSync(resolve(root,"database/seeds/production/000018_hr_payroll_history_rbac.sql"),"utf8");

test("reconciliation schema is append-only, scoped and contains no payment capability",()=>{
 for(const table of ["hr_payroll_reconciliation_policy_version","hr_payroll_reconciliation_policy_current","hr_payroll_reconciliation_run","hr_payroll_reconciliation_result","hr_payroll_reconciliation_item_difference","hr_payroll_reconciliation_review_action"])assert.match(migration,new RegExp(`CREATE TABLE ${table}`));
 for(const entity of ["HrPayrollReconciliationPolicyVersionEntity","HrPayrollReconciliationRunEntity","HrPayrollReconciliationResultEntity","HrPayrollReconciliationItemDifferenceEntity","HrPayrollReconciliationReviewActionEntity"])assert.match(entities,new RegExp(`export class ${entity}`));
 assert.match(migration,/append-only/u);assert.match(migration,/FOREIGN KEY\(tenant_id,park_id,attendance_input_batch_id\)/u);
 assert.match(migration,/FOREIGN KEY\(tenant_id,park_id,compensation_version_id\) REFERENCES hr_employee_compensation/u);
 assert.match(migration,/FOREIGN KEY\(tenant_id,park_id,insurance_period_id\) REFERENCES hr_employee_insurance_period/u);
 assert.match(migration,/uq_hr_payroll_formula_one_approved_item/u);
 assert.match(migration,/trg_hr_payroll_reconciliation_policy_append_only/u);
 assert.match(migration,/trg_hr_payroll_reconciliation_policy_current_guard/u);
 const executable=migration.replace(/^--.*$/gmu,"");assert.doesNotMatch(executable,/\bpaid\b|payment_status|disbursement_status|bank_export|tax_submit|enable_payment/iu);
 assert.doesNotMatch(service,/hr_payroll_run|hr_payslip|confirmPayroll|payPayroll/iu);
});
test("simulation requires exact permissions, idempotency, body-free audit and frozen closed inputs",()=>{
 assert.match(controller,/@Post\("reconciliations\/simulate"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_PAYROLL_RECONCILIATION_CALCULATE[\s\S]*captureBody:\s*false/u);
 assert.match(controller,/@Post\("reconciliations\/:id\/review-actions"\)[\s\S]*HR_PAYROLL_RECONCILIATION_REVIEW[\s\S]*captureBody:\s*false/u);
 assert.match(service,/period_status\s*!==\s*"closed"\s*\|\|\s*attendance\.batch_status\s*!==\s*"effective"/u);
 assert.match(service,/effective_from<=\$4::date AND \(effective_to IS NULL OR effective_to>=\$4::date\)/u);
 assert.match(service,/attendanceVersions/u);
 for(const frozen of ["frozen_employee_version","frozen_compensation_version","frozen_insurance_version","frozen_formula_version"])assert.match(service,new RegExp(frozen));
 assert.match(service,/pg_advisory_xact_lock/u);assert.match(service,/FOR UPDATE/u);assert.match(service,/FOR SHARE/u);
 assert.match(controller,/@Post\("reconciliation-policies"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_PAYROLL_RECONCILIATION_REVIEW[\s\S]*captureBody:\s*false/u);
 assert.match(service,/Each payroll book requires exactly one current approved net-item mapping/u);
 assert.match(service,/const newTotal = this\.decimalToScaled\(mappedNetValue\)/u);
 assert.doesNotMatch(service,/for \(const value of calculated\.values\(\)\)/u);
 assert.match(service,/Legacy net amount is missing and no authoritative net policy can be applied/u);
 assert.match(service,/Frozen compensation input is incomplete for a legacy employee/u);
 assert.match(service,/Frozen insurance input is incomplete for a legacy employee/u);
 assert.match(service,/Legacy payroll item required by an approved formula is missing/u);
 assert.doesNotMatch(service,/snapshot\.net_amount \?\? "0"|old\?\.decimal_value \?\? "0"|comp\?\.base_salary \?\? "0"/u);
});
test("DSL uses a standalone parser and BigInt evaluator with hard limits",()=>{
 assert.match(dsl,/LIMITS=\{expression:2000,tokens:256,depth:24,dependencies:64\}/u);
 assert.match(dsl,/BigInt/u);assert.match(dsl,/division by zero/u);assert.match(dsl,/decimal overflow/u);assert.match(dsl,/formula dependency cycle/u);
 assert.match(dsl,/assertFormulaEvaluationOrder/u);
 assert.doesNotMatch(dsl,/\beval\s*\(|new Function|Function\s*\(/u);
 assert.match(service,/parse_status='approved_for_simulation'/u);
 assert.match(service,/Legacy conditional formula must be converted to an explicit restricted DSL condition before approval/u);
 assert.match(service,/Approved formula contains an unsupported legacy condition/u);
});
test("production seed grants reconciliation atoms only to the HR manager baseline",()=>{
 for(const permission of ["hr:payroll_reconciliation:calculate","hr:payroll_reconciliation:review"])assert.match(productionSeed,new RegExp(permission));
 assert.match(productionSeed,/\('HR_MANAGER','hr:payroll_reconciliation:calculate'\)/u);
 assert.match(productionSeed,/\('HR_MANAGER','hr:payroll_reconciliation:review'\)/u);
 assert.match(productionSeed,/DEPARTMENT_MANAGER[\s\S]*hr:payroll_reconciliation:calculate[\s\S]*RAISE EXCEPTION/u);
 assert.doesNotMatch(productionSeed,/\('DEPARTMENT_MANAGER','hr:payroll_reconciliation:(?:calculate|review)'\)/u);
});
