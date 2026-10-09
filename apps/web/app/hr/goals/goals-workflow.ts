import type {HrGoal,HrGoalCycle,HrGoalManagementContext,HrGoalOptions,HrGoalCheckin,HrGoalChangeContext,HrGoalChangeDetail} from "../../../lib/hr-api";
const text=(v:unknown)=>typeof v==="string";
const nullableText=(v:unknown)=>v==null||text(v);
export function requireGoalRows(value:HrGoal[]):HrGoal[]{
 if(!Array.isArray(value)||value.some(g=>!g||!text(g.id)||!text(g.goalName)||!["group","department","employee"].includes(g.goalLevel)||!["draft","active","completed","cancelled"].includes(g.status)||![g.cycleId,g.weight,g.progress,g.metricName,g.unit,g.startDate,g.dueDate].every(text)||!nullableText(g.ownerName)||!nullableText(g.targetValue)||!nullableText(g.currentValue)||!Number.isSafeInteger(g.currentVersionNo)))throw new Error("目标办理信息无效，请重新读取。");return value;
}
export function requireGoalContext(value:HrGoalManagementContext):HrGoalManagementContext{
 if(!value||!Array.isArray(value.parents)||value.parents.some(g=>!g||![g.id,g.cycleId,g.goalName,g.startDate,g.dueDate].every(text)||!["group","department"].includes(g.goalLevel)||!["draft","active"].includes(g.status)))throw new Error("目标上级选项无效，请重新读取。");requireGoalRows(value.items);return value;
}
export function requireGoalCycles(value:HrGoalCycle[]):HrGoalCycle[]{if(!Array.isArray(value)||value.some(c=>!c||![c.id,c.cycleCode,c.cycleName,c.startDate,c.endDate].every(text)||!["draft","active","closed"].includes(c.status)))throw new Error("目标周期信息无效，请重新读取。");return value;}
export function requireGoalOptions(value:HrGoalOptions):HrGoalOptions{if(!value||typeof value.canCreateGroup!=="boolean"||!Array.isArray(value.orgs)||!Array.isArray(value.employees)||value.orgs.some(o=>!o||!text(o.id)||!text(o.orgName))||value.employees.some(e=>!e||!text(e.id)||!text(e.fullName)))throw new Error("目标归属选项无效，请重新读取。");return value;}

export function requireCheckinGoals(value:HrGoal[]):HrGoal[]{requireGoalRows(value);if(value.some(g=>g.status!=="active"||g.goalLevel!=="employee"||!text(g.ownerEmployeeId)))throw new Error("本人进度办理目标无效，请重新读取。");return value;}
export function requireGoalHistory(value:HrGoalCheckin[]):HrGoalCheckin[]{if(!Array.isArray(value)||value.some(c=>!c||![c.id,c.goalId,c.progress,c.summary,c.confidence,c.createTime].every(text)||![c.currentValue,c.risks,c.nextAction].every(nullableText)))throw new Error("目标进展记录无效，请重新读取。");return value;}

export function requireGoalChangeContext(value:HrGoalChangeContext):HrGoalChangeContext{requireGoalContext(value);requireGoalOptions(value);requireGoalCycles(value.cycles);return value;}
export function requireGoalChangeDetail(value:HrGoalChangeDetail):HrGoalChangeDetail{
 if(!value||!value.goal)throw new Error("目标版本详情无效，请重新读取。");requireGoalRows([value.goal]);
 if(!(value.goal.metricDefinition===null||text(value.goal.metricDefinition))||!Array.isArray(value.collaborators)||value.collaborators.some(c=>!c||!text(c.employeeId)||!nullableText(c.employeeName))||!Array.isArray(value.versions)||value.versions.some(v=>!v||!Number.isSafeInteger(v.versionNo)||v.versionNo<1||!text(v.changeReason)||!text(v.createdAt)||!v.snapshot||typeof v.snapshot!=="object"||Array.isArray(v.snapshot)))throw new Error("目标版本详情无效，请重新读取。");
 return value;
}
