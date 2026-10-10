import assert from "node:assert/strict";
import test from "node:test";
import type {HrPerformanceReviewV2} from "../../lib/hr-api";
import {performanceDimensionLedgerCsv,performanceResultLedgerCsv} from "./performance/performance-result-export";

const review=(status="self_review"):HrPerformanceReviewV2=>({id:"private-review-id",cycleId:"private-cycle-id",cycleName:"=2026年绩效",status,employee:{id:"private-employee-id",code:"=E-001",name:"张\n三"},dimensions:[{code:"work",name:'工作,"质量"',weight:"0.0000",scoreMin:"0",scoreMax:"100"}],selfSubmission:{scores:{work:0},comments:{work:"自评\n说明"},score:"0.0000"},managerSubmission:{scores:{work:88.25},comments:{work:"主管意见"},score:"88.2500"},calibration:{scores:{work:90},score:"90.0000"},result:{score:"90.0000",levelCode:"A",levelName:"优秀"},appeal:{id:"private-appeal-id",status:"pending"},actions:{selfReview:false,managerReview:false,acknowledge:false,appeal:false,resolveAppeal:false}});

test("performance result ledger whitelists source facts and masks premature self result fields",()=>{
 const csv=performanceResultLedgerCsv([review()],{selfOnly:true,canReadResult:false});
 assert.ok(csv.startsWith("\uFEFF"));
 for(const text of ["评价周期","'=2026年绩效","'=E-001","张\n三","员工自评","0.0000","申诉状态"])assert.ok(csv.includes(text));
 for(const text of ["88.2500","90.0000","优秀","private-"])assert.ok(!csv.includes(text));
 const acknowledged=performanceResultLedgerCsv([review("employee_acknowledged")],{selfOnly:true,canReadResult:false});
 assert.ok(acknowledged.includes("88.2500"));assert.ok(acknowledged.includes("优秀"));
 const resultReader=performanceResultLedgerCsv([review()],{selfOnly:true,canReadResult:true});
 assert.ok(resultReader.includes("90.0000"));assert.ok(resultReader.includes("优秀"));
 const teamReader=performanceResultLedgerCsv([review()],{selfOnly:false,canReadResult:false});
 assert.ok(teamReader.includes("88.2500"));assert.ok(teamReader.includes("优秀"));
});

test("dimension ledger preserves score zero, null and decimal strings without exporting identifiers",()=>{
 const row=review("unmapped-status");row.selfSubmission!.comments.work="=formula()";row.managerSubmission=null;row.calibration=null;row.result=null;row.appeal=null;
 const csv=performanceDimensionLedgerCsv([row],{selfOnly:false,canReadResult:false});
 for(const text of ["维度编号",'工作,""质量""',"0.0000","\"0\"","'=formula()","unmapped-status"])assert.ok(csv.includes(text));
 for(const text of ["private-review-id","private-cycle-id","private-employee-id","private-appeal-id","90.0000"])assert.ok(!csv.includes(text));
});
