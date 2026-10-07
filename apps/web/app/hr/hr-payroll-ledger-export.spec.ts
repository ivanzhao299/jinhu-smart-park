import test from "node:test";
import assert from "node:assert/strict";
import {collectPayrollLedger,payrollLedgerCsv} from "./payroll/payroll-ledger-export";
import {collectEmployeeDirectory,employeeDirectoryCsv} from "./employees/employee-directory-export";
import type {HrPayrollHistoryRow,HrEmployee} from "../../lib/hr-api";

const row=(id:number):HrPayrollHistoryRow=>({id:String(id),periodMonth:"2026-07-01",legacyScheme:"1",bookName:"标准账套",employeeCode:`E${id}`,employeeName:`员工${id}`,grossAmount:"5100.0000",deductionAmount:"100.0000",taxAmount:null,netAmount:"5000.0000",publicationStatus:"published"});
const rows=Array.from({length:205},(_,i)=>row(i+1));
const page=(n:number)=>({items:rows.slice((n-1)*100,n*100),total:205,page:n,page_size:100});

test("payroll export collects all filtered pages and rechecks the first page",async()=>{
  const calls:number[]=[];const result=await collectPayrollLedger(async(n,size)=>{assert.equal(size,100);calls.push(n);return page(n);},()=>true);
  assert.equal(result?.length,205);assert.deepEqual(calls,[1,2,3,1]);
});
test("payroll export rejects partial, changing and duplicate pages",async()=>{
  for(const bad of [{...page(2),total:204},{...page(2),items:page(2).items.slice(1)},{...page(2),items:[rows[0]!,...page(2).items.slice(1)]},{...page(2),page:1},{...page(2),page_size:20}]){
    await assert.rejects(collectPayrollLedger(async n=>n===2?bad:page(n),()=>true));
  }
});
test("payroll export stops at the limit and never returns failed partial reads",async()=>{
  let calls=0;await assert.rejects(collectPayrollLedger(async()=>{calls++;return {...page(1),total:5001};},()=>true),/5000/);assert.equal(calls,1);
  await assert.rejects(collectPayrollLedger(async n=>{if(n===2)throw new Error("denied");return page(n);},()=>true),/denied/);
});
test("payroll export rejects changed first-page amounts and stops stale contexts",async()=>{
  let first=0;await assert.rejects(collectPayrollLedger(async n=>n===1&&first++>0?{...page(1),items:page(1).items.map(r=>({...r,netAmount:"1.0000"}))}:page(n),()=>true),/变化/);
  let calls=0;assert.equal(await collectPayrollLedger(async()=>{calls++;return page(1);},()=>false),null);assert.equal(calls,0);
  let current=true;assert.equal(await collectPayrollLedger(async n=>{current=false;return page(n);},()=>current),null);
});
test("payroll CSV allowlists business columns, preserves raw decimals and missing amounts",()=>{
  const record={...row(1),netAmount:"9007199254740993.1234",legacySourceTable:"PRIVATE_TABLE",mappingStatus:"PRIVATE_STATUS",bookName:'账套,"甲"\n乙'};
  const csv=payrollLedgerCsv([record],false);assert.ok(csv.startsWith("\uFEFF"));assert.ok(csv.includes('"9007199254740993.1234"'));assert.ok(csv.includes('"账套,""甲""\n乙"'));assert.ok(csv.includes('"100.0000","","9007199254740993.1234"'));
  assert.ok(!csv.includes("PRIVATE_TABLE"));assert.ok(!csv.includes("PRIVATE_STATUS"));assert.ok(!csv.includes('"id"'));assert.ok(csv.includes('"员工可见"'));
});
test("self CSV excludes identity and management visibility regardless of extra API fields",()=>{
  const csv=payrollLedgerCsv([{...row(1),employeeName:"PRIVATE_NAME",employeeCode:"PRIVATE_CODE"}],true);
  assert.ok(!csv.includes("PRIVATE_NAME"));assert.ok(!csv.includes("PRIVATE_CODE"));assert.ok(!csv.includes("员工可见"));assert.ok(csv.includes("5000.0000"));
});
test("CSV blocks leading spreadsheet formulas while preserving original text and negatives",()=>{
  for(const bookName of ["=1+1","\t@SUM(A1)"," \u0001+1","-2"]){const csv=payrollLedgerCsv([{...row(1),bookName,netAmount:"-12.3400"}],true);assert.ok(csv.includes(`"'${bookName}"`));assert.ok(csv.includes('"\'-12.3400"'));}
});
test("shared collector preserves directory 50-row paging and existing column projection",async()=>{
  const records=Array.from({length:120},(_,i)=>({id:String(i),employeeCode:`E${i}`,fullName:"甲",employmentType:"full_time",employmentStatus:"active",workLocation:null,userId:null,hireDate:null,departureDate:null} as HrEmployee));
  const calls:number[]=[];const result=await collectEmployeeDirectory(async(n,size)=>{assert.equal(size,50);calls.push(n);return {items:records.slice((n-1)*size,n*size),total:120,page:n,page_size:size};},()=>true);
  assert.equal(result?.length,120);assert.deepEqual(calls,[1,2,3,1]);assert.ok(employeeDirectoryCsv(records).startsWith('\uFEFF"员工编号","姓名"'));assert.ok(employeeDirectoryCsv(records).includes('"全职","在职"'));
});
