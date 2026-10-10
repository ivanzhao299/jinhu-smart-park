import type {HrTrainingParticipant,HrTrainingPlan,HrTrainingPlanDetail} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";

export const trainingPlanStatusLabels:Record<string,string>={draft:"草稿",published:"待开始",in_progress:"进行中",completed:"已完成",cancelled:"已取消",assigned:"待签到",checked_in:"已签到"};

function planRecord(row:Pick<HrTrainingPlan,"code"|"name"|"courseTitle"|"startDate"|"endDate"|"status"|"factRevision">){
 return [row.code,row.name,row.courseTitle,row.startDate,row.endDate,trainingPlanStatusLabels[row.status]??row.status,row.factRevision];
}

export function trainingPlanLedgerCsv(rows:readonly HrTrainingPlan[],canCost:boolean):string{
 const headers=["培训编号","培训名称","课程","开始日期","结束日期","状态","是否必修","范围内参训人数","范围内完成人数","事实修订版本",...canCost?["预算金额","实际费用","币种"]:[]];
 return csvDocument([headers,...rows.map(row=>[...planRecord(row).slice(0,6),row.mandatory?"是":"否",row.participantCount,row.completedCount,row.factRevision,...canCost?[row.budgetAmount,row.actualCost,row.costCurrency]:[]])]);
}

export function trainingParticipantLedgerCsv(detail:HrTrainingPlanDetail,access:{selfOnly:boolean;teamOnly:boolean;canCost:boolean}):string{
 const planHeaders=["培训编号","培训名称","课程","开始日期","结束日期","计划状态","事实修订版本"];
 const participantHeaders=[...access.selfOnly?[]:["姓名"],"参训状态","签到时间","完成学时","更正版本",...access.teamOnly?[]:["成绩","评价","备注"],...access.canCost&&!access.teamOnly?["实际费用","币种"]:[]];
 const plan=planRecord(detail);
 return csvDocument([[...planHeaders,...participantHeaders],...detail.participants.map(row=>participantRecord(plan,row,access,detail.costCurrency))]);
}

function participantRecord(plan:readonly unknown[],row:HrTrainingParticipant,access:{selfOnly:boolean;teamOnly:boolean;canCost:boolean},currency:string|undefined){
 return [...plan,...access.selfOnly?[]:[row.employeeName],trainingPlanStatusLabels[row.status]??row.status,row.checkedInAt,row.completedHours,row.correctionVersion,...access.teamOnly?[]:[row.score,row.evaluation,row.memo],...access.canCost&&!access.teamOnly?[row.actualCost,currency]:[]];
}
