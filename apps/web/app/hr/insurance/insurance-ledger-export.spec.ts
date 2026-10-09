import assert from "node:assert/strict";
import test from "node:test";
import {insuranceLedgerCsv} from "./insurance-ledger-export";
import type {HrInsurancePeriod} from "../../../lib/hr-api";
const row:HrInsurancePeriod={id:"private-id",employeeId:"private-employee",employeeCode:"SYN-CODE",employeeName:"=SYNTHETIC()",periodYear:2026,periodMonth:7,needsReview:false,reviewReasonCode:null,itemCount:6,employeeAmount:"90071992547409.91",supplementAmount:"0.10",employerAmount:"777.77",totalAmount:"888.88",legacyCompatibility:{legacyFlags:{private:"SECRET"}}};
for(const access of [{selfOnly:false,showAmounts:false,full:true},{selfOnly:false,showAmounts:true,full:false},{selfOnly:true,showAmounts:true,full:true},{selfOnly:false,showAmounts:true,full:true}])test(`insurance CSV applies exact amount and identity allowlists ${JSON.stringify(access)}`,()=>{
 const csv=insuranceLedgerCsv([row],access);assert.equal(csv.includes("90071992547409.91"),access.showAmounts);assert.equal(csv.includes("777.77"),access.showAmounts&&access.full&&!access.selfOnly);assert.equal(csv.includes("SYN-CODE"),!access.selfOnly);assert.equal(csv.includes("SYNTHETIC()"),!access.selfOnly);for(const text of ["private-","SECRET","legacyCompatibility"])assert(!csv.includes(text));assert(csv.includes("已入账"));
});
test("unknown historical period is never converted to a fake valid date",()=>{const csv=insuranceLedgerCsv([{...row,periodYear:0,periodMonth:0,needsReview:true,reviewReasonCode:"T3_INT4_INVALID"}],{selfOnly:true,showAmounts:false,full:false});assert(csv.includes('"","","6","来源期间缺失或无效"'));});
