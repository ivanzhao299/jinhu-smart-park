import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
const scope={tenantId:"fixture-tenant",parkId:"fixture-park"};
const actor:JwtPrincipal={sub:"10000000-0000-4000-8000-000000000001",username:"fixture",roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_RULE_READ],...scope};
function fixture(rawExpression="[基本项目] + 1.2500",rawCondition:string|null=null,parseStatus="manual_review",missing=false,auditFailure=false){
 const selected:string[]=[],where:unknown[]=[],audits:Record<string,unknown>[]=[];let queries=0;
 const row={id:"formula",bookId:"book",bookName:"Synthetic book",legacyScheme:"synthetic",itemName:"Net",versionNo:1,rawExpression,rawCondition,parserVersion:"source-parser",parseStatus,dependencyCodes:[],calculationOrder:2,reviewedAt:null,reviewReason:null};
 const q:Record<string,unknown>={};for(const method of ["from","innerJoin","leftJoin","select","addSelect","where"]){q[method]=(...args:unknown[])=>{if(method==="addSelect")selected.push(String(args[0]));if(method==="where")where.push(...args);return q;};}q.getRawOne=async()=>{queries++;return missing?undefined:row;};
 const service=new HrPayrollHistoryService({createQueryBuilder:()=>q} as unknown as DataSource,{recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);if(auditFailure)throw new Error("audit unavailable");}} as unknown as AuditService);
 return {service,selected,where,audits,get queries(){return queries;}};
}
test("formula details require rule-read before querying or auditing",async()=>{const f=fixture();await assert.rejects(()=>f.service.formulaDetail(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW]},"formula"),ForbiddenException);assert.equal(f.queries,0);assert.equal(f.audits.length,0);});
test("scoped formula projection preserves expression, condition and precision with metadata-only audit",async()=>{const f=fixture();const result=await f.service.formulaDetail(scope,actor,"formula");assert.equal(result.rawExpression,"[基本项目] + 1.2500");assert.equal(result.rawCondition,null);assert.equal(result.approvalEligibility,"syntax_ready");assert.deepEqual(result.syntax.dependencies,["payroll:基本项目"]);assert.ok(f.selected.includes("formula.raw_expression"));assert.ok(f.selected.includes("formula.raw_condition"));assert.match(String(f.where[0]),/formula.tenant_id=:tenantId AND formula.park_id=:parkId AND formula.id=:id/);assert.deepEqual(f.where[1],{...scope,id:"formula"});assert.equal(f.audits.length,1);assert.equal(JSON.stringify(f.audits).includes(result.rawExpression),false);assert.equal("dsl_ast" in result,false);});
test("unsafe and separate legacy conditions block approval, terminals remain terminal",async()=>{for(const [expression,condition,status,expected] of [["select amount from salary",null,"manual_review","blocked"],["1.0000","old condition","manual_review","blocked"],["1",null,"approved_for_simulation","terminal"],["1",null,"rejected","terminal"]] as const){const f=fixture(expression,condition,status);assert.equal((await f.service.formulaDetail(scope,actor,"formula")).approvalEligibility,expected);}});
test("missing scoped formula and required-audit failures return no detail",async()=>{await assert.rejects(()=>fixture("1",null,"parsed",true).service.formulaDetail(scope,actor,"foreign"),NotFoundException);await assert.rejects(()=>fixture("1",null,"parsed",false,true).service.formulaDetail(scope,actor,"formula"),/audit unavailable/);});
