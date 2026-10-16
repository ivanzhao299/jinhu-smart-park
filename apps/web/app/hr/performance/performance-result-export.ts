import type {HrPerformanceReviewV2} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";

export const performanceReviewStatusLabels:Record<string,string>={planning:"规划中",self_review:"员工自评",manager_review:"主管评价",calibration:"校准中",employee_acknowledged:"待员工签收",appealed:"申诉处理中",confirmed:"已确认"};
const appealStatusLabels:Record<string,string>={submitted:"待处理",upheld:"已采纳",rejected:"已驳回"};

export type PerformanceResultExportAccess={selfOnly:boolean;canReadResult:boolean};

function statusLabel(status:string){return performanceReviewStatusLabels[status]??status;}
function mayReadResult(row:HrPerformanceReviewV2,access:PerformanceResultExportAccess){
 return !access.selfOnly||access.canReadResult||["employee_acknowledged","appealed","confirmed"].includes(row.status);
}
function resultColumns(row:HrPerformanceReviewV2,access:PerformanceResultExportAccess){
 const visible=mayReadResult(row,access);
 return [row.selfSubmission?.score,visible?row.managerSubmission?.score:null,visible?row.calibration?.score:null,visible?row.result?.score:null,visible?row.result?.levelName:null];
}
function reviewColumns(row:HrPerformanceReviewV2){
 return [row.cycleName,row.employee.code,row.employee.name,statusLabel(row.status)];
}

/** Explicit live-review projection. Scores are source facts and are never recalculated here. */
export function performanceResultLedgerCsv(rows:readonly HrPerformanceReviewV2[],access:PerformanceResultExportAccess):string{
 const includeChannelEvidence=rows.some(row=>row.calculationMode==='five_channel_v1');
 const headers=["评价周期","员工编号","员工姓名","办理状态","自评总分","主管总分","校准总分","最终分","等级","申诉状态",...(includeChannelEvidence?["计算模式","输入修订","等级候选编号","等级说明","等级下限","等级上限","等级来源顺序","等级来源定义"]:[])];
 return csvDocument([headers,...rows.map(row=>[...reviewColumns(row),...resultColumns(row,access),row.appeal?appealStatusLabels[row.appeal.status]??row.appeal.status:null,...(includeChannelEvidence?[row.calculationMode??'dimension_weighted_v1',mayReadResult(row,access)?row.result?.inputRevisionId:null,...(mayReadResult(row,access)&&row.result?.gradeCandidate?[row.result.gradeCandidate.id,row.result.gradeCandidate.description,row.result.gradeCandidate.minValue,row.result.gradeCandidate.maxValue,row.result.gradeCandidate.sourceOrderText,row.result.gradeCandidate.sourceAssessmentRef]:[null,null,null,null,null,null])]:[])])]);
}

export function performanceDimensionLedgerCsv(rows:readonly HrPerformanceReviewV2[],access:PerformanceResultExportAccess):string{
 const headers=["评价周期","员工编号","员工姓名","办理状态","维度编号","维度名称","权重","最低分","最高分","自评维度分","自评评语","主管维度分","主管评语","校准维度分"];
 return csvDocument([headers,...rows.flatMap(row=>row.dimensions.map(dimension=>{
  const visible=mayReadResult(row,access);
  return [...reviewColumns(row),dimension.code,dimension.name,dimension.weight,dimension.scoreMin,dimension.scoreMax,row.selfSubmission?.scores[dimension.code],row.selfSubmission?.comments[dimension.code],visible?row.managerSubmission?.scores[dimension.code]:null,visible?row.managerSubmission?.comments[dimension.code]:null,visible?row.calibration?.scores[dimension.code]:null];
 }))]);
}
