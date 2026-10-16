import {validateHrPerformanceChannelDefinition,type HrPerformanceChannelDefinition} from './hr-performance-channel-definition';
import {validateHrPerformanceWorkflowPolicy,type HrPerformanceWorkflowPolicy} from './hr-performance-channel-workflow';
export type HrPerformanceSourceDraftKind = 'template' | 'review';
export const HR_PERFORMANCE_SOURCE_FIELDS = {
  "template_profile": {
    "source_assessment": "integer",
    "source_assessment_name": "varchar(50)",
    "source_department": "varchar(30)",
    "source_m_percent": "integer",
    "source_t_percent": "integer",
    "source_x_percent": "integer",
    "source_c_percent": "integer",
    "source_s_percent": "integer",
    "source_timekeep": "boolean",
    "source_bonus": "boolean",
    "source_master": "boolean"
  },
  "level_rule": {
    "source_ass_grade": "varchar(12)",
    "source_description": "varchar(500)",
    "source_my_order": "varchar(2)",
    "source_assessment_id": "integer",
    "source_min_value": "integer",
    "source_max_value": "integer"
  },
  "dimension_profile": {
    "source_item_id": "integer",
    "source_assessment_id": "integer",
    "source_item_name": "varchar(100)",
    "source_full_value": "numeric(18,2)",
    "source_my_order": "integer"
  },
  "dimension_level_guide": {
    "source_guide_id": "integer",
    "source_item_id": "integer",
    "source_grade": "varchar(12)",
    "source_description": "varchar(500)",
    "source_min_value": "integer",
    "source_max_value": "integer",
    "source_my_order": "integer"
  },
  "dimension_result": {
    "source_detail_id": "integer",
    "source_session_id": "integer",
    "source_person_code": "varchar(10)",
    "source_item_id": "integer",
    "source_self_value": "numeric(18,2)",
    "source_m_item_value": "numeric(18,2)",
    "source_item_value": "numeric(18,2)",
    "source_x_item_value": "numeric(18,2)",
    "source_c_item_value": "numeric(18,2)",
    "source_self_grade": "varchar(12)",
    "source_ass_grade": "varchar(12)",
    "source_appraisal": "varchar(200)"
  },
  "master_result": {
    "source_master_id": "integer",
    "source_session_id": "integer",
    "source_person_code": "varchar(10)",
    "source_self_grade": "varchar(12)",
    "source_ass_grade": "varchar(12)",
    "source_self_value": "numeric(18,2)",
    "source_item_value": "numeric(18,2)",
    "source_m_item_value": "numeric(18,0)",
    "source_x_item_value": "numeric(18,0)",
    "source_c_item_value": "numeric(18,0)",
    "source_master_value": "numeric(18,2)",
    "source_timekeep_value": "numeric(18,2)",
    "source_bonus_value": "numeric(18,2)",
    "source_total_value": "numeric(18,2)",
    "source_self_appraisal": "varchar(500)",
    "source_appraisal": "varchar(500)",
    "source_pay": "numeric(19,4)",
    "source_assessment_person": "varchar(50)",
    "source_recorded_at": "timestamp without time zone",
    "source_operator_code": "varchar(10)",
    "source_description": "varchar(500)"
  }
} as const;
export const HR_PERFORMANCE_SOURCE_EDITABLE_FIELDS = {
  "template_profile": [
    "source_assessment_name",
    "source_department",
    "source_m_percent",
    "source_t_percent",
    "source_x_percent",
    "source_c_percent",
    "source_s_percent",
    "source_timekeep",
    "source_bonus",
    "source_master"
  ],
  "level_rule": [
    "source_description",
    "source_my_order",
    "source_min_value",
    "source_max_value"
  ],
  "dimension_profile": [
    "source_item_name",
    "source_full_value",
    "source_my_order"
  ],
  "dimension_level_guide": [
    "source_grade",
    "source_description",
    "source_min_value",
    "source_max_value",
    "source_my_order"
  ],
  "dimension_result": [
    "source_self_value",
    "source_m_item_value",
    "source_item_value",
    "source_x_item_value",
    "source_c_item_value",
    "source_appraisal"
  ],
  "master_result": [
    "source_master_value",
    "source_timekeep_value",
    "source_bonus_value",
    "source_self_appraisal",
    "source_appraisal",
    "source_description",
    "source_pay"
  ]
} as const;
export type HrPerformanceSourceFamily = keyof typeof HR_PERFORMANCE_SOURCE_FIELDS;
export type HrPerformanceSourceValue = string | boolean | null;
export interface HrPerformanceSourceRecord {family:HrPerformanceSourceFamily;identitySha256:string;sourceFactId:string;values:Record<string,HrPerformanceSourceValue>;}
export interface HrPerformanceSourceBinding {employeeId:string|null;orgId:string|null;startDate:string|null;endDate:string|null;businessPeriodRef:string|null;}
export interface HrPerformanceSourceSnapshot {schemaVersion:1;records:HrPerformanceSourceRecord[];binding:HrPerformanceSourceBinding;definition:HrPerformanceChannelDefinition|null;workflow:HrPerformanceWorkflowPolicy|null;}
export interface HrPerformanceSourceChange {family:HrPerformanceSourceFamily;sourceFactId:string;field:string;value:HrPerformanceSourceValue;}
export interface HrPerformanceSourcePatch {expectedRevisionId:string;reason:string;changes?:HrPerformanceSourceChange[];binding?:HrPerformanceSourceBinding;definition?:HrPerformanceChannelDefinition|null;workflow?:HrPerformanceWorkflowPolicy|null;}
export interface HrPerformanceSourceManifestSummary {schemaVersion:1;manifestSha256:string;familyCounts:Record<HrPerformanceSourceFamily,number>;}
export interface HrPerformanceSourceReceipt {draftId:string;revisionId:string;revisionNo:number;outcome:'created'|'reused'|'updated'|'refreshed'|'alreadyCurrent';}
export interface HrPerformanceSourceCandidate {kind:HrPerformanceSourceDraftKind;sourceId:string;migrationBatchId:string;label:string|null;}
export interface HrPerformanceSourceBindingLabels {employeeName:string|null;employeeCode:string|null;orgName:string|null;}
export interface HrPerformanceSourcePreview {bindingLabels:HrPerformanceSourceBindingLabels;kind:HrPerformanceSourceDraftKind;sourceId:string;manifest:HrPerformanceSourceManifestSummary;snapshot:HrPerformanceSourceSnapshot;qualification:'NOT_EVALUATED';}
export interface HrPerformanceSourceDraftListItem {draftId:string;kind:HrPerformanceSourceDraftKind;revisionId:string;revisionNo:number;createdAt:string;qualification:'NOT_EVALUATED';}
export interface HrPerformanceSourceRevision {bindingLabels:HrPerformanceSourceBindingLabels;revisionId:string;revisionNo:number;previousRevisionId:string|null;sourceId:string;origin:'source'|'human'|'refresh';reason:string;createdBy:string;createdAt:string;manifest:HrPerformanceSourceManifestSummary;snapshot:HrPerformanceSourceSnapshot;}
export interface HrPerformanceSourceDraftDetail extends HrPerformanceSourceDraftListItem {revision:HrPerformanceSourceRevision;}
export interface HrPerformanceSourcePage<T> {items:T[];total:number;page:number;pageSize:number;}
export interface HrPerformanceSourceHistory extends HrPerformanceSourcePage<HrPerformanceSourceRevision> {draftId:string;currentRevisionId:string;qualification:'NOT_EVALUATED';}
const fail=():never=>{throw new Error('INVALID_SOURCE_DRAFT');};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown,keys:readonly string[])=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail();const r=v as Record<string,unknown>;if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))return fail();return r;};
export function validateHrPerformanceSourceValue(family:HrPerformanceSourceFamily,field:string,value:unknown):void {
 const fields=HR_PERFORMANCE_SOURCE_FIELDS[family] as Record<string,string>|undefined;const type=fields?.[field];if(!type)return fail();if(value===null)return;
 if(type==='boolean'){if(typeof value!=='boolean')fail();return;}
 if(typeof value!=='string')return fail();
 if(type==='integer'){if(!/^-?\d+$/.test(value)||BigInt(value)<-2147483648n||BigInt(value)>2147483647n)fail();return;}
 if(type.startsWith('numeric')){const [precision,scale]=type.match(/\d+/g)!.map(Number);if(!new RegExp(scale===0?'^-?\\d+$':`^-?\\d+(?:\\.\\d{1,${scale}})?$`).test(value)||value.replace(/^-/,'').split('.')[0]!.replace(/^0+/,'').length>precision!-scale!)fail();return;}
 if(type.startsWith('varchar')){if([...value].length>Number(type.match(/\d+/)![0]))fail();return;}
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(value))fail();
}
// JSON object key order is not a business change; record/array order remains significant.
function sameSourceJson(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameSourceJson(v,b[i]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
 return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.hasOwn(right,key)&&sameSourceJson(left[key],right[key]));
}
export function applyHrPerformanceSourcePatch(current:HrPerformanceSourceSnapshot,patch:HrPerformanceSourcePatch):HrPerformanceSourceSnapshot {
 const next=structuredClone(current);const seen=new Set<string>();
 if(patch.changes!==undefined){if(!Array.isArray(patch.changes)||!patch.changes.length)fail();for(const raw of patch.changes){const c=object(raw,['family','sourceFactId','field','value']);const family=c.family as HrPerformanceSourceFamily;const editable=HR_PERFORMANCE_SOURCE_EDITABLE_FIELDS[family] as readonly string[]|undefined;if(!editable||typeof c.field!=='string'||!editable.includes(c.field)||!uuid(c.sourceFactId))return fail();const key=JSON.stringify([family,c.sourceFactId,c.field]);if(seen.has(key))fail();seen.add(key);const record=next.records.find(r=>r.family===family&&r.sourceFactId===c.sourceFactId);if(!record||record.values[c.field]===c.value)return fail();validateHrPerformanceSourceValue(family,c.field,c.value);record.values[c.field]=c.value as HrPerformanceSourceValue;}}
 if(patch.binding!==undefined){const b=object(patch.binding,['employeeId','orgId','startDate','endDate','businessPeriodRef']);for(const k of ['employeeId','orgId'])if(b[k]!==null&&!uuid(b[k]))fail();for(const k of ['startDate','endDate']){const v=b[k];if(v!==null&&(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))fail();}if(b.startDate!==null&&b.endDate!==null&&String(b.startDate)>String(b.endDate))fail();if(b.businessPeriodRef!==null&&(typeof b.businessPeriodRef!=='string'||![...b.businessPeriodRef].length||[...b.businessPeriodRef].length>120||!b.businessPeriodRef.trim()))fail();next.binding=patch.binding;}
 if(patch.definition!==undefined)next.definition=patch.definition;
 if(patch.workflow!==undefined)next.workflow=patch.workflow;
 if(next.definition!==null)validateHrPerformanceChannelDefinition(next.definition);
 if(next.workflow!==null){if(next.definition===null)return fail();validateHrPerformanceWorkflowPolicy(next.workflow,next.definition);}
 if(sameSourceJson(next,current))fail();return next;
}

export interface HrPerformanceSourceOrgOption {id:string;orgName:string;}
export interface HrPerformanceSourceEmployeeOption {id:string;employeeCode:string;fullName:string;employmentStatus:string;}
