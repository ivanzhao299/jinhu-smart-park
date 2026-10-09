import assert from "node:assert/strict";
import test from "node:test";
import {contractLedgerCsv} from "./contract-ledger-export";
import type {HrContract} from "../../../lib/hr-api";
const row:HrContract={id:"private-id",employeeId:"private-employee-id",employeeCode:"SYN-001",employeeName:"=SYNTHETIC()",contractNo:'A,"B"',contractTypeName:"合成类型",startDate:"2026-01-02T16:00:00.000Z",endDate:null,probationEndDate:"2026-04-02",status:"active",isHistoricalImport:true,baseSalary:"SECRET-SALARY",remark:"SECRET-REMARK"};
test("contract CSV preserves calendar facts, labels and formula-safe text without sensitive/internal fields",()=>{
 const csv=contractLedgerCsv([row],false);assert(csv.startsWith("\uFEFF"));for(const value of ["员工编号","SYN-001","'=SYNTHETIC()","2026-01-02","履行中",'A,""B""'])assert(csv.includes(value));for(const value of ["private-","SECRET-","T16:","isHistoricalImport"])assert(!csv.includes(value));assert(csv.includes('"2026-01-02","","2026-04-02"'));
});
test("self contract CSV never exports identity even if unexpectedly returned",()=>{const csv=contractLedgerCsv([row],true);for(const value of ["员工编号","姓名","SYN-001","SYNTHETIC()"])assert(!csv.includes(value));assert(csv.includes("合同编号"));});
test("empty and unknown contract states remain explicit",()=>{assert.equal(contractLedgerCsv([],true).split("\r\n").length,1);assert(contractLedgerCsv([{...row,status:"other"}],true).includes('"other"'));});
