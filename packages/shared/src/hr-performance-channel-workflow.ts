import {validateHrPerformanceChannelDefinition,type HrPerformanceChannelDefinition,type HrPerformanceChannelActor,type HrPerformanceChannelStage} from './hr-performance-channel-definition';
export const HR_PERFORMANCE_CHANNEL_KEYS=['s','m','t','x','c'] as const;
export const HR_PERFORMANCE_ADJUSTMENT_KEYS=['master','timekeep','bonus'] as const;
export const HR_PERFORMANCE_MASTER_KEYS=['selfAppraisal','appraisal','description','salaryReference'] as const;
export type HrPerformanceInputField='detailAppraisal'|typeof HR_PERFORMANCE_CHANNEL_KEYS[number]|typeof HR_PERFORMANCE_ADJUSTMENT_KEYS[number]|typeof HR_PERFORMANCE_MASTER_KEYS[number];
export interface HrPerformanceMasterPolicy {stage:HrPerformanceChannelStage|null;allowedActors:HrPerformanceChannelActor[];required:boolean|null;allowExplicitNull:boolean|null;}
export interface HrPerformanceWorkflowPolicy {
 schemaVersion:1;detailDefinitions:Array<{id:string;itemId:string}>;
 detailAppraisalPolicy?:HrPerformanceMasterPolicy;
 masterPolicies:Record<typeof HR_PERFORMANCE_MASTER_KEYS[number],HrPerformanceMasterPolicy>;
 appealReviewAllowed:Record<Exclude<HrPerformanceInputField,'detailAppraisal'>,boolean|null>&{detailAppraisal?:boolean|null};
}
export interface HrPerformanceInputCell {state:'UNPROVIDED'|'EXPLICIT_NULL'|'VALUE';value:string|null;actorUserId:string|null;changedAt:string|null;evidence:string|null;}
export interface HrPerformanceChannelInput {
 schemaVersion:1;details:Array<{id:string;itemId:string;channels:Record<typeof HR_PERFORMANCE_CHANNEL_KEYS[number],HrPerformanceInputCell>;appraisal?:HrPerformanceInputCell;}>;
 adjustments:Record<typeof HR_PERFORMANCE_ADJUSTMENT_KEYS[number],HrPerformanceInputCell>;
 master:Record<typeof HR_PERFORMANCE_MASTER_KEYS[number],HrPerformanceInputCell>;
}
export interface HrPerformanceInputChange {detailId:string|null;field:HrPerformanceInputField;state:'EXPLICIT_NULL'|'VALUE';value:string|null;evidence:string;}
const fail=():never=>{throw new Error('Invalid performance channel workflow payload');};
const obj=(v:unknown,keys:readonly string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||![null,Object.prototype].includes(Object.getPrototypeOf(v)))return fail();const r=v as Record<string,unknown>;if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.prototype.hasOwnProperty.call(r,k)))return fail();return r;};
const str=(v:unknown,min:number,max:number)=>typeof v==='string'&&[...v].length>=min&&[...v].length<=max;
const nullableBool=(v:unknown)=>v===null||typeof v==='boolean';
export function validateHrPerformanceWorkflowPolicy(value:unknown,definition:HrPerformanceChannelDefinition,publish=false):asserts value is HrPerformanceWorkflowPolicy {
 validateHrPerformanceChannelDefinition(definition);const extended=Boolean(value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'detailAppraisalPolicy'));const r=obj(value,['schemaVersion','detailDefinitions','masterPolicies','appealReviewAllowed',...(extended?['detailAppraisalPolicy']:[])]);if(r.schemaVersion!==1||!Array.isArray(r.detailDefinitions))fail();
 const items=new Set(definition.items.map(i=>i.id)),ids=new Set<string>();for(const d of r.detailDefinitions as unknown[]){const x=obj(d,['id','itemId']);if(!str(x.id,1,128)||!str(x.itemId,1,128)||!items.has(x.itemId as string)||ids.has(x.id as string))fail();ids.add(x.id as string);}
 const masters=obj(r.masterPolicies,HR_PERFORMANCE_MASTER_KEYS),appeals=obj(r.appealReviewAllowed,[...HR_PERFORMANCE_CHANNEL_KEYS,...HR_PERFORMANCE_ADJUSTMENT_KEYS,...HR_PERFORMANCE_MASTER_KEYS,...(extended?['detailAppraisal']:[])]);
 for(const v of Object.values(appeals))if(!nullableBool(v)||(publish&&v===null))fail();
 const policies=[...Object.values(definition.channels),...Object.values(definition.adjustmentPolicy),...Object.values(masters),...(extended?[obj(r.detailAppraisalPolicy,['stage','allowedActors','required','allowExplicitNull'])]:[])];
 for(const policy of policies){const p=policy as Record<string,unknown>;if(Object.values(masters).includes(policy)||policy===r.detailAppraisalPolicy)obj(policy,['stage','allowedActors','required','allowExplicitNull']);if(p.stage!==null&&!['self_review','manager_review','calibration'].includes(p.stage as string))fail();if(!Array.isArray(p.allowedActors)||p.allowedActors.some(a=>!['self','manager','calibrator'].includes(a))||new Set(p.allowedActors).size!==p.allowedActors.length||!nullableBool(p.required)||!nullableBool(p.allowExplicitNull))fail();if(publish){const actor={self_review:'self',manager_review:'manager',calibration:'calibrator'}[p.stage as HrPerformanceChannelStage];if(!actor||!(p.allowedActors as string[]).includes(actor)||p.required===null||p.allowExplicitNull===null||p.required===true&&p.allowExplicitNull===true)fail();}}
 if(publish&&(!ids.size||!definition.items.length||!definition.gradeCandidates.length||Object.values(definition.adjustmentPolicy).some(p=>p.inputMode!=='manual_with_evidence')))fail();
}
export function emptyHrPerformanceWorkflowPolicy():HrPerformanceWorkflowPolicy {
 const policy=():HrPerformanceMasterPolicy=>({stage:null,allowedActors:[],required:null,allowExplicitNull:null});
 return {schemaVersion:1,detailDefinitions:[],masterPolicies:{selfAppraisal:policy(),appraisal:policy(),description:policy(),salaryReference:policy()},appealReviewAllowed:{s:null,m:null,t:null,x:null,c:null,master:null,timekeep:null,bonus:null,selfAppraisal:null,appraisal:null,description:null,salaryReference:null}};
}
export function emptyHrPerformanceChannelInput(policy:HrPerformanceWorkflowPolicy):HrPerformanceChannelInput {
 const cell=():HrPerformanceInputCell=>({state:'UNPROVIDED',value:null,actorUserId:null,changedAt:null,evidence:null});
 return {schemaVersion:1,details:policy.detailDefinitions.map(d=>({...d,channels:{s:cell(),m:cell(),t:cell(),x:cell(),c:cell()},...(policy.detailAppraisalPolicy===undefined?{}:{appraisal:cell()})})),adjustments:{master:cell(),timekeep:cell(),bonus:cell()},master:{selfAppraisal:cell(),appraisal:cell(),description:cell(),salaryReference:cell()}};
}
export function validateHrPerformanceInputChanges(value:unknown):asserts value is HrPerformanceInputChange[] {
 if(!Array.isArray(value)||!value.length)fail();const seen=new Set<string>();
 for(const entry of value as unknown[]){const r=obj(entry,['detailId','field','state','value','evidence']);if(![...HR_PERFORMANCE_CHANNEL_KEYS,...HR_PERFORMANCE_ADJUSTMENT_KEYS,...HR_PERFORMANCE_MASTER_KEYS,'detailAppraisal'].includes(r.field as HrPerformanceInputField)||(!str(r.evidence,2,1000)||!String(r.evidence).trim())||!['VALUE','EXPLICIT_NULL'].includes(r.state as string))fail();const channel=r.field==='detailAppraisal'||(HR_PERFORMANCE_CHANNEL_KEYS as readonly unknown[]).includes(r.field);if(channel?!str(r.detailId,1,128):r.detailId!==null)fail();const key=JSON.stringify([r.detailId,r.field]);if(seen.has(key))fail();seen.add(key);if(r.state==='EXPLICIT_NULL'){if(r.value!==null)fail();continue;}
 if((['selfAppraisal','appraisal','description','detailAppraisal'] as unknown[]).includes(r.field)){if(!str(r.value,0,r.field==='detailAppraisal'?200:500))fail();}else{const scale=r.field==='salaryReference'?4:2,maxInteger=r.field==='salaryReference'?15:16;if(typeof r.value!=='string'||!(new RegExp(`^-?\\d+(?:\\.\\d{1,${scale}})?$`)).test(r.value)||r.value.replace(/^-/,'').split('.')[0]!.replace(/^0+/,'').length>maxInteger)fail();}
 }
}
export function performanceInputPolicy(definition:HrPerformanceChannelDefinition,workflow:HrPerformanceWorkflowPolicy,field:HrPerformanceInputField):HrPerformanceMasterPolicy {
 if(field==='detailAppraisal')return workflow.detailAppraisalPolicy??fail();
 if((HR_PERFORMANCE_CHANNEL_KEYS as readonly string[]).includes(field))return definition.channels[field as typeof HR_PERFORMANCE_CHANNEL_KEYS[number]];
 if((HR_PERFORMANCE_ADJUSTMENT_KEYS as readonly string[]).includes(field))return definition.adjustmentPolicy[field as typeof HR_PERFORMANCE_ADJUSTMENT_KEYS[number]];
 return workflow.masterPolicies[field as typeof HR_PERFORMANCE_MASTER_KEYS[number]];
}

/** Missing cells represent unavailable projections, never an unprovided source value. */
export interface HrPerformanceChannelInputProjection {
 schemaVersion:1;details:Array<{id:string;itemId:string;channels:Partial<HrPerformanceChannelInput['details'][number]['channels']>;appraisal?:HrPerformanceInputCell;}>;
 adjustments:Partial<HrPerformanceChannelInput['adjustments']>;master:Partial<HrPerformanceChannelInput['master']>;
}
