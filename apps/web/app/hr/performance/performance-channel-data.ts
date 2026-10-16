import {HR_PERFORMANCE_CHANNEL_KEYS,HR_PERFORMANCE_ADJUSTMENT_KEYS,HR_PERFORMANCE_MASTER_KEYS,validateHrPerformanceChannelDefinition,validateHrPerformanceWorkflowPolicy,type HrPerformanceChannelInputProjection,type HrPerformanceInputCell,type HrPerformanceInputField,type HrPerformanceGradeCandidate,type HrPerformanceChannelDefinition} from '@jinhu/shared';
import type {HrPerformanceChannelCurrent,HrPerformanceChannelPreview,HrPerformanceChannelBatchReceipt} from '../../../lib/hr-api';
export type PerformanceOperation={success:string;send:(token:string|undefined,key:string)=>Promise<unknown>;accept:(value:unknown)=>boolean;retainEditor?:boolean;received?:(value:unknown)=>void;afterSuccess?:()=>Promise<void>};
export const adjustmentLabels={master:'调整项1',timekeep:'调整项2',bonus:'调整项3'};
export const gradeStatusLabels:Record<string,string>={RESOLVED:'等级已确定',TOTAL_UNAVAILABLE:'总分尚不可用',NO_ELIGIBLE_GRADE:'暂无符合条件的等级',AMBIGUOUS_TOP_THRESHOLD:'最高阈值有多个等级候选，请核对'};
export const masterLabels={selfAppraisal:'自评叙述',appraisal:'评价叙述',description:'评价说明',salaryReference:'薪资参考',detailAppraisal:'明细评语'};
export function performanceFieldLabel(field:string,definition?:HrPerformanceChannelDefinition|null):string {
 if((HR_PERFORMANCE_CHANNEL_KEYS as readonly string[]).includes(field)){const key=field as typeof HR_PERFORMANCE_CHANNEL_KEYS[number];return definition?.channels[key].businessName?.trim()||`渠道${HR_PERFORMANCE_CHANNEL_KEYS.indexOf(key)+1}`;}
 if((HR_PERFORMANCE_ADJUSTMENT_KEYS as readonly string[]).includes(field)){const key=field as typeof HR_PERFORMANCE_ADJUSTMENT_KEYS[number];return definition?.adjustmentPolicy[key].businessName?.trim()||adjustmentLabels[key];}
 return masterLabels[field as keyof typeof masterLabels]??'未识别字段';
}
export const inputKey=(detailId:string|null,field:HrPerformanceInputField)=>JSON.stringify([detailId,field]);
const fail=():never=>{throw new Error('绩效办理响应无效，请重新加载。');};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
const text=(value:unknown)=>typeof value==='string'&&value.length>0;
export function inputProjection(value:unknown,salaryVisible:boolean):HrPerformanceChannelInputProjection {
 const row=object(value);if(row.schemaVersion!==1||!Array.isArray(row.details))return fail();
 const cell=(value:unknown):HrPerformanceInputCell=>{const c=object(value);if(!['UNPROVIDED','EXPLICIT_NULL','VALUE'].includes(String(c.state))||!(c.value===null||typeof c.value==='string')||!(c.actorUserId===null||text(c.actorUserId))||!(c.changedAt===null||text(c.changedAt))||!(c.evidence===null||typeof c.evidence==='string'))return fail();if(c.state==='VALUE'?typeof c.value!=='string':c.value!==null)return fail();return {state:c.state as HrPerformanceInputCell['state'],value:c.value as string|null,actorUserId:c.actorUserId as string|null,changedAt:c.changedAt as string|null,evidence:c.evidence as string|null};};
 const cells=<K extends string>(value:unknown,keys:readonly K[]):Partial<Record<K,HrPerformanceInputCell>>=>{const source=object(value);return Object.fromEntries(keys.filter(k=>Object.hasOwn(source,k)).map(k=>[k,cell(source[k])])) as Partial<Record<K,HrPerformanceInputCell>>;};
 const ids=new Set<string>();const details=row.details.map(value=>{const d=object(value);if(!text(d.id)||!text(d.itemId)||ids.has(d.id as string))return fail();ids.add(d.id as string);const appraisal=Object.hasOwn(d,'appraisal')?cell(d.appraisal):undefined;if(appraisal?.state==='VALUE'&&[...appraisal.value!].length>200)return fail();return {id:d.id as string,itemId:d.itemId as string,channels:cells(d.channels,HR_PERFORMANCE_CHANNEL_KEYS),...(appraisal?{appraisal}:{})};});
 return {schemaVersion:1,details,adjustments:cells(row.adjustments,HR_PERFORMANCE_ADJUSTMENT_KEYS),master:cells(row.master,salaryVisible?HR_PERFORMANCE_MASTER_KEYS:HR_PERFORMANCE_MASTER_KEYS.filter(k=>k!=='salaryReference'))};
}
export function channelPreview(value:unknown,revisionId:string):HrPerformanceChannelPreview|null {
 if(value===null)return null;const row=object(value),grade=object(row.grade);if(row.schemaVersion!==1||row.mathVersion!=='five_channel_v1'||row.inputRevisionId!==revisionId||typeof row.complete!=='boolean'||!(row.score===null||typeof row.score==='string'&&/^-?\d+(?:\.\d{1,2})?$/.test(row.score))||typeof grade.status!=='string'||!(grade.expectedGrade===null||typeof grade.expectedGrade==='string')||!Number.isSafeInteger(grade.winningCandidateCount)||!(grade.winningMinValue===null||typeof grade.winningMinValue==='string'))return fail();
 let candidate:HrPerformanceGradeCandidate|null=null;
 if(row.gradeCandidate!==null){const c=object(row.gradeCandidate);if(!text(c.id)||typeof c.code!=='string'||['description','sourceOrderText','sourceAssessmentRef','minValue','maxValue'].some(key=>c[key]!==null&&typeof c[key]!=='string'))return fail();candidate={id:c.id as string,code:c.code,description:c.description as string|null,sourceOrderText:c.sourceOrderText as string|null,sourceAssessmentRef:c.sourceAssessmentRef as string|null,minValue:c.minValue as string|null,maxValue:c.maxValue as string|null};}
 if([row.levelCode,row.levelName].some(v=>v!==null&&typeof v!=='string'))return fail();
 return {schemaVersion:1,mathVersion:'five_channel_v1',inputRevisionId:revisionId,complete:row.complete,score:row.score as string|null,grade:{status:grade.status,expectedGrade:grade.expectedGrade as string|null,winningMinValue:grade.winningMinValue as string|null,winningCandidateCount:grade.winningCandidateCount as number},gradeCandidate:candidate,levelCode:row.levelCode as string|null,levelName:row.levelName as string|null};
}
export function channelCurrent(value:unknown,id:string,salaryPermission:boolean,salaryWritePermission=false):HrPerformanceChannelCurrent {
 const r=object(value),template=object(r.template);if(r.id!==id||r.calculationMode!=='five_channel_v1'||!text(r.currentRevisionId)||!Number.isSafeInteger(r.revisionNo)||typeof r.status!=='string'||typeof r.salaryReferenceAvailable!=='boolean'||!Array.isArray(r.allowedFields))return fail();
 validateHrPerformanceChannelDefinition(template.channelDefinition);validateHrPerformanceWorkflowPolicy(template.channelWorkflow,template.channelDefinition);
 const salaryVisible=salaryPermission&&r.salaryReferenceAvailable;
 const input=inputProjection(r.input,salaryVisible),policy=template.channelWorkflow;
 if(input.details.length!==policy.detailDefinitions.length||policy.detailDefinitions.some(d=>!input.details.some(i=>i.id===d.id&&i.itemId===d.itemId)))return fail();
 if(!policy.detailAppraisalPolicy&&input.details.some(d=>d.appraisal))return fail();
 const fields=[...HR_PERFORMANCE_CHANNEL_KEYS,...HR_PERFORMANCE_ADJUSTMENT_KEYS,...HR_PERFORMANCE_MASTER_KEYS,...(policy.detailAppraisalPolicy?['detailAppraisal']:[])] as string[];
 const allowedFields=r.allowedFields.map(value=>{const a=object(value);if(!fields.includes(String(a.field))||!(a.detailId===null||typeof a.detailId==='string'))return fail();const channel=(HR_PERFORMANCE_CHANNEL_KEYS as readonly string[]).includes(String(a.field));if(channel?!input.details.some(d=>d.id===a.detailId&&d.channels[a.field as typeof HR_PERFORMANCE_CHANNEL_KEYS[number]]):a.field==='detailAppraisal'?!input.details.some(d=>d.id===a.detailId&&d.appraisal):a.detailId!==null)return fail();return {detailId:a.detailId as string|null,field:a.field as HrPerformanceInputField};}).filter(a=>a.field!=='salaryReference'||salaryVisible&&salaryWritePermission);
 return {id,status:r.status,calculationMode:'five_channel_v1',currentRevisionId:r.currentRevisionId as string,revisionNo:r.revisionNo as number,input,allowedFields,template:{channelDefinition:template.channelDefinition,channelWorkflow:policy},salaryReferenceAvailable:salaryVisible,preview:channelPreview(r.preview,r.currentRevisionId as string)};
}
export function validBatchReceipt(value:unknown,id:string,reviewIds:readonly string[]):value is HrPerformanceChannelBatchReceipt {
 if(!value||typeof value!=='object')return false;const r=value as HrPerformanceChannelBatchReceipt;
 return r.id===id&&['active','completed'].includes(r.status)&&Number.isSafeInteger(r.pending)&&r.pending>=0&&Number.isSafeInteger(r.employeeCount)&&r.employeeCount>=0&&(r.status!=='completed'||r.pending===0)&&Array.isArray(r.items)&&r.items.length===reviewIds.length&&new Set(r.items.map(i=>i.id)).size===r.items.length&&r.employeeCount===r.items.filter(i=>i.status!=='failed').length&&r.items.every(i=>reviewIds.includes(i.id)&&(i.status==='failed'?Number.isInteger(i.errorCode)&&typeof i.message==='string':['employee_acknowledged','appealed','confirmed'].includes(i.status)));
}
export function validPage(row:{items:unknown[];total:number;page:number;pageSize:number},page:number,size:number){return Array.isArray(row.items)&&row.page===page&&row.pageSize===size&&Number.isSafeInteger(row.total)&&row.total>=0&&row.items.length===Math.min(size,Math.max(0,row.total-(page-1)*size));}
