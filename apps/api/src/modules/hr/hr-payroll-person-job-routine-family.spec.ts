import assert from "node:assert/strict";
import test from "node:test";
import {
  divideLegacyPersonJobPayCandidate,
  projectLegacyPersonJobPayInput,
  projectLegacyPersonJobPayPeriodInput,
} from "./hr-payroll-person-job-routine-family";

test("u_inputjobpay projects exact legacy money into an isolated job-pay candidate input",()=>{
 const projected=projectLegacyPersonJobPayInput("456.7");
 assert.equal(projected,"456.7000");
});

test("u_inputjobpay preserves four-place scale and named half-away rounding",()=>{
 assert.equal(divideLegacyPersonJobPayCandidate("456.7000",6),"76.1167");
 assert.equal(projectLegacyPersonJobPayInput("-10.0050"),"-10.0050");
});

test("u_inputjobpay keeps missing source null and rejects invalid money",()=>{
 assert.equal(projectLegacyPersonJobPayInput(null),null);
 assert.equal(projectLegacyPersonJobPayInput(undefined),null);
 for(const value of ["", "1.00001", "not-money", "10000000000000000.0000"]){
  assert.throws(()=>projectLegacyPersonJobPayInput(value),/PAYROLL_FORMULA_UNSAFE/u,value);
 }
});

test("u_inputjobpay period projection has no side effect outside the exact month",()=>{
 assert.deepEqual(projectLegacyPersonJobPayPeriodInput({value:"456.7",rowYear:2026,rowMonth:9,targetYear:2026,targetMonth:9}),{matchesPeriod:true,value:"456.7000"});
 assert.deepEqual(projectLegacyPersonJobPayPeriodInput({value:"456.7",rowYear:2026,rowMonth:8,targetYear:2026,targetMonth:9}),{matchesPeriod:false,value:null});
 assert.throws(()=>projectLegacyPersonJobPayPeriodInput({value:"456.7",rowYear:2026,rowMonth:13,targetYear:2026,targetMonth:9}),/rowMonth is invalid/u);
});
