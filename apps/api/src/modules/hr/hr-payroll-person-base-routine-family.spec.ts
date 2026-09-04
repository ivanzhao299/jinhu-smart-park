import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePayrollFormula,
  parsePayrollFormula,
  projectLegacyPersonBasePayInput,
  projectLegacyPersonBasePayPeriodInput,
} from "./hr-payroll-formula-dsl";

test("u_inputbasepay projects exact legacy money into the reviewed basic-pay input",()=>{
 const expression=parsePayrollFormula("[人事系统.基本工资]");
 assert.equal(expression.status,"manual_review");
 const projected=projectLegacyPersonBasePayInput("1234.5");
 assert.equal(projected,"1234.5000");
 assert.equal(evaluatePayrollFormula(expression.ast!,{"hr:基本工资":projected!}),"1234.5000");
});

test("u_inputbasepay preserves four-place scale and the nearest half-away rounding consumer",()=>{
 const projected=projectLegacyPersonBasePayInput("1.0000");
 const expression=parsePayrollFormula("[人事系统.基本工资] / 6");
 assert.equal(evaluatePayrollFormula(expression.ast!,{"hr:基本工资":projected!}),"0.1667");
 assert.equal(projectLegacyPersonBasePayInput("-10.0050"),"-10.0050");
});

test("u_inputbasepay keeps missing source null and rejects invalid or over-scale money",()=>{
 assert.equal(projectLegacyPersonBasePayInput(null),null);
 assert.equal(projectLegacyPersonBasePayInput(undefined),null);
 for(const value of ["", "1.00001", "not-money", "10000000000000000.0000"]){
  assert.throws(()=>projectLegacyPersonBasePayInput(value),/PAYROLL_FORMULA_UNSAFE/u,value);
 }
});

test("u_inputbasepay period predicate projects only exact year and month without a write side effect",()=>{
 assert.deepEqual(projectLegacyPersonBasePayPeriodInput({value:"1234.5",rowYear:2026,rowMonth:9,targetYear:2026,targetMonth:9}),{matchesPeriod:true,value:"1234.5000"});
 assert.deepEqual(projectLegacyPersonBasePayPeriodInput({value:"1234.5",rowYear:2026,rowMonth:8,targetYear:2026,targetMonth:9}),{matchesPeriod:false,value:null});
 assert.throws(()=>projectLegacyPersonBasePayPeriodInput({value:"1234.5",rowYear:2026,rowMonth:13,targetYear:2026,targetMonth:9}),/rowMonth is invalid/u);
});
