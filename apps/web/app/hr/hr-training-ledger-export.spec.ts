import assert from "node:assert/strict";
import test from "node:test";
import type {HrTrainingPlan,HrTrainingPlanDetail} from "../../lib/hr-api";
import {trainingParticipantLedgerCsv,trainingPlanLedgerCsv} from "./training/training-ledger-export";

const plan:HrTrainingPlan={id:"private-plan-id",code:"TR-001",name:'培训,"计划"',courseTitle:"安全培训",startDate:"2026-10-01",endDate:"2026-10-02",status:"in_progress",mandatory:true,participantCount:0,completedCount:0,factRevision:0,budgetAmount:"9007199254740993.1234",actualCost:"0.0000",costCurrency:"CNY"};
const detail:HrTrainingPlanDetail={...plan,snapshot:{private:"never-export"},participants:[{id:"private-participant-id",employeeName:"=公式姓名",status:"checked_in",checkedInAt:"2026-10-01T09:00:00+08:00",completedHours:"0.00",score:"0.00",evaluation:"评价\n内容",memo:'备注,"文本"',actualCost:"12.3400",certificateFileId:"private-file-id",correctionVersion:0,canAct:true}]};

test("training plan ledger keeps exact zero and decimal facts while gating cost",()=>{
 const csv=trainingPlanLedgerCsv([plan],true);assert.ok(csv.startsWith("\uFEFF"));
 for(const text of ["培训编号","TR-001",'培训,""计划""',"进行中","是","9007199254740993.1234","0.0000",'"0","0","0"'])assert.ok(csv.includes(text));
 for(const text of ["private-plan-id","snapshot","private-"])assert.ok(!csv.includes(text));
 const withoutCost=trainingPlanLedgerCsv([plan],false);for(const text of ["预算金额","9007199254740993.1234","0.0000","CNY"])assert.ok(!withoutCost.includes(text));
});

test("training participant ledger applies self, team and cost whitelists to injected fields",()=>{
 const team=trainingParticipantLedgerCsv(detail,{selfOnly:false,teamOnly:true,canCost:true});
 for(const text of ["姓名","'=公式姓名","已签到","0.00","更正版本"])assert.ok(team.includes(text));
 for(const text of ["成绩","评价","备注","实际费用","12.3400","private-participant-id","private-file-id","never-export"])assert.ok(!team.includes(text));
 const self=trainingParticipantLedgerCsv(detail,{selfOnly:true,teamOnly:false,canCost:true});
 for(const text of ["姓名","公式姓名"])assert.ok(!self.includes(text));
 for(const text of ["成绩","评价\n内容",'备注,""文本""',"12.3400","CNY"])assert.ok(self.includes(text));
 const parkNoCost=trainingParticipantLedgerCsv(detail,{selfOnly:false,teamOnly:false,canCost:false});
 for(const text of ["姓名","'=公式姓名","成绩","评价","备注"])assert.ok(parkNoCost.includes(text));
 for(const text of ["实际费用","12.3400","CNY"])assert.ok(!parkNoCost.includes(text));
});

test("training ledgers preserve empty and unknown values without inventing state",()=>{
 const csv=trainingParticipantLedgerCsv({...detail,status:"legacy_unknown",courseTitle:null,participants:[{...detail.participants[0]!,checkedInAt:null,completedHours:null,score:null,evaluation:null,memo:null,actualCost:null}]},{selfOnly:false,teamOnly:false,canCost:true});
 assert.ok(csv.includes('"legacy_unknown"'));assert.ok(csv.includes('"","","",""'));
 assert.equal(trainingPlanLedgerCsv([],false).split("\r\n").length,1);
});
