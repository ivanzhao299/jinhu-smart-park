import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPayrollHistoryQueryDto } from "./dto/hr-payroll-history.dto";
import { resolveHrPayrollHistoryAccessScope } from "./hr-access-policy";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";

const root=resolve(__dirname,"../../../../..");
const controller=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-payroll-history.controller.ts"),"utf8");
const service=readFileSync(resolve(root,"apps/api/src/modules/hr/hr-payroll-history.service.ts"),"utf8");
const migration=readFileSync(resolve(root,"database/migrations/000249_hr_payroll_history_review_actions.sql"),"utf8");

function actor(permissions:string[],isSuper=false):JwtPrincipal{return {sub:"10000000-0000-4000-8000-000000000001",username:"tester",tenantId:"t",parkId:"p",roles:[],permissions,isSuper};}

test("historical payroll scope is park, self, or fail-closed none",()=>{
 assert.equal(resolveHrPayrollHistoryAccessScope(actor([HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ])),"park");
 assert.equal(resolveHrPayrollHistoryAccessScope(actor([HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ])),"self");
 assert.equal(resolveHrPayrollHistoryAccessScope(actor([HR_PERMISSIONS.HR_PAYROLL_HISTORY_TEAM_SUMMARY])),"none");
 assert.equal(resolveHrPayrollHistoryAccessScope(actor([])),"none");
 assert.equal(resolveHrPayrollHistoryAccessScope(actor([],true)),"park");
});

test("service-direct unauthorized and team reads fail closed and remain required-audited",async()=>{
 const auditCalls:unknown[]=[];
 const dataSource={query:async()=>{throw new Error("database query must not run for fail-closed projections");}};
 const audit={recordOperationRequired:async(input:unknown)=>{auditCalls.push(input);}};
 const payroll=new HrPayrollHistoryService(dataSource as never,audit as never);
 const query={page:1,page_size:20};
 assert.deepEqual(await payroll.listHistory({tenantId:"t",parkId:"p"},actor([]),query),{items:[],total:0,page:1,page_size:20});
 assert.deepEqual(await payroll.teamSummary({tenantId:"t",parkId:"p"},actor([HR_PERMISSIONS.HR_PAYROLL_HISTORY_TEAM_SUMMARY]),query),{items:[],total:0,page:1,page_size:20});
 assert.equal(auditCalls.length,2);
 const failing=new HrPayrollHistoryService(dataSource as never,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as never);
 await assert.rejects(failing.listHistory({tenantId:"t",parkId:"p"},actor([]),query),/audit unavailable/);
});

test("history month filters reject invalid calendar months before database access",async()=>{
 const invalid=plainToInstance(HrPayrollHistoryQueryDto,{period_from:"2026-13-01",period_to:"2026-00-01"});
 assert.ok((await validate(invalid)).length>=2);
 assert.equal((await validate(plainToInstance(HrPayrollHistoryQueryDto,{period_from:"2026-01-01",period_to:"2026-12-01"}))).length,0);
});

test("amount routes never grant team permission and self history requires published own rows",()=>{
 assert.match(controller,/@Get\("history"\)[\s\S]*HR_PAYROLL_HISTORY_READ,HR_PERMISSIONS\.HR_PAYROLL_HISTORY_SELF_READ/);
 assert.match(controller,/@Get\("history\/team-summary"\)[\s\S]*HR_PAYROLL_HISTORY_TEAM_SUMMARY/);
 assert.doesNotMatch(controller,/@Get\("history"\)[\s\S]{0,250}HR_PAYROLL_HISTORY_TEAM_SUMMARY/);
 assert.match(service,/access==="self"[\s\S]*snapshot\.employee_id=:employeeId AND batch\.status='published'/);
 assert.match(service,/snapshot\.mapping_status='mapped'/);
 const teamBody=service.slice(service.indexOf("async teamSummary"),service.indexOf("async listBooks"));
 assert.doesNotMatch(teamBody,/gross_amount|deduction_amount|tax_amount|net_amount|COUNT\s*\(/i);
 assert.match(teamBody,/auditedTeamPage\(scope,actor,q,\[\],0\)/);
});

test("sensitive reads are allowlisted and required-audited before return",()=>{
 for(const path of ["/hr/payroll/history","/hr/payroll/history/:id","/hr/payroll/history/:id/items","/hr/payroll/history-formulas","/hr/payroll/history-review-cases"])assert.match(service,new RegExp(path.replace(/[/:]/g,match=>match==="/"?"\\/":match===":"?"\\:":match)));
 assert.match(service,/recordHrSensitiveRead\(this\.auditService/);
 assert.match(service,/projectReviewEvidence/);
 for(const forbidden of ["source_hash","source_content_group_hash","legacy_employee_hash","legacy_department_hash","source_backup_hash","manifest_hash","tenant_id","park_id"])assert.doesNotMatch(service,new RegExp(`addSelect\\([^\\n]*${forbidden}`));
 const formulaBody=service.slice(service.indexOf("async listFormulas"),service.indexOf("async listReviewCases"));
 assert.doesNotMatch(formulaBody,/addSelect\([^\n]*(?:raw_expression|raw_condition|source_hash|version_no|tenant_id|park_id)/i);
 const historyBody=service.slice(service.indexOf("async listHistory"),service.indexOf("async historyItems"));
 assert.doesNotMatch(historyBody,/addSelect\("(?:snapshot\.employee_id|book\.id)"/);
 assert.match(historyBody,/else qb\.addSelect\("employee\.employee_code","employeeCode"\)/);
 assert.match(service,/await this\.audit[\s\S]*return row/);
 assert.match(service,/await this\.audit[\s\S]*return rows/);
});

test("review actions are append-only, locked, idempotent, permission-exact, and body-free",()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS hr_payroll_review_action/);
 assert.match(migration,/BEFORE UPDATE OR DELETE ON hr_payroll_review_action/);
 assert.match(migration,/Legacy payroll review actions are append-only/);
 assert.match(service,/addReviewAction[\s\S]*HR_PAYROLL_FORMULA_REVIEW[\s\S]*pessimistic_write/);
 assert.match(service,/terminal action/);
 assert.match(controller,/@Post\("history-review-cases\/:id\/actions"\)[\s\S]*IdempotencyInterceptor[\s\S]*HR_PAYROLL_FORMULA_REVIEW[\s\S]*captureBody:false/);
});

test("T4 historical API has no payment or online payroll writes",()=>{
 assert.doesNotMatch(controller,/@(?:Post|Put|Delete)\("(?:pay|disburse|bank|tax-submit)/i);
 assert.doesNotMatch(service,/hr_payroll_run|hr_payslip|UPDATE hr_payroll_legacy_snapshot|DELETE FROM hr_payroll_legacy_snapshot/i);
});

test("paginated history uses explicit TypeORM order terms",()=>{
 assert.doesNotMatch(service,/\.orderBy\(order\)/);
 assert.match(service,/qb\.orderBy\(term\.column,term\.direction\)/);
 assert.match(service,/qb\.addOrderBy\(term\.column,term\.direction\)/);
});
