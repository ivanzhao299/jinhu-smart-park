import type { HrCredentialRecord,HrExperienceRecord,HrExtendedRecordKind,HrSkillRecord } from "../../../lib/hr-api";
export type ExtendedRecord=HrExperienceRecord|HrSkillRecord|HrCredentialRecord;
export type RecordField={key:string;label:string;max:number;required?:boolean;type?:"date"|"textarea";options?:readonly {value:string;label:string}[]};
export const recordDefinitions:Record<HrExtendedRecordKind,{label:string;fields:readonly RecordField[]}>= {
 experience:{label:"经历",fields:[{key:"type",label:"经历类型",max:24,required:true,options:[{value:"education",label:"教育经历"},{value:"work",label:"工作经历"}]},{key:"organizationName",label:"学校或单位",max:200,required:true},{key:"title",label:"专业或职务",max:160},{key:"startDate",label:"开始日期",max:10,required:true,type:"date"},{key:"endDate",label:"结束日期",max:10,type:"date"},{key:"summary",label:"经历说明",max:2000,type:"textarea"}]},
 skill:{label:"技能",fields:[{key:"skillName",label:"技能名称",max:160,required:true},{key:"proficiency",label:"熟练程度",max:24,options:[{value:"basic",label:"基础"},{value:"intermediate",label:"熟练"},{value:"advanced",label:"高级"},{value:"expert",label:"专家"}]},{key:"legacyGrade",label:"业务等级",max:64},{key:"acquiredDate",label:"获得日期",max:10,type:"date"},{key:"note",label:"备注",max:2000,type:"textarea"}]},
 credential:{label:"证照",fields:[{key:"credentialType",label:"证照类别",max:64,required:true},{key:"credentialName",label:"证照名称",max:160,required:true},{key:"credentialNumber",label:"证照编号",max:64},{key:"issuingAuthority",label:"发证机关",max:200},{key:"acquiredDate",label:"取得日期",max:10,type:"date"},{key:"validTo",label:"有效期至",max:10,type:"date"},{key:"note",label:"备注",max:2000,type:"textarea"}]},
};
export function createRecordDraft(kind:HrExtendedRecordKind,record:ExtendedRecord|null){
 const values=record as unknown as Record<string,unknown>|null;
 return Object.fromEntries(recordDefinitions[kind].fields.map(field=>[field.key,typeof values?.[field.key]==="string"?values[field.key]:field.key==="type"?"work":""])) as Record<string,string>;
}
export function buildRecordPatch(kind:HrExtendedRecordKind,draft:Record<string,string>,initial:Record<string,string>,isNew:boolean,clearNumber=false){
 const patch:Record<string,string|null>={};
 for(const field of recordDefinitions[kind].fields){
  if(field.key==="credentialNumber"&&clearNumber){patch.credentialNumber=null;continue;}
  if(!isNew&&draft[field.key]===initial[field.key])continue;
  const value=(draft[field.key]??"").trim();
  // An unavailable/masked number is never carried into an update implicitly.
  if(field.key==="credentialNumber"&&!value&&!clearNumber)continue;
  patch[field.key]=field.required?value:value||null;
 }
 return patch;
}
export function recordTitle(kind:HrExtendedRecordKind,record:ExtendedRecord){
 if(kind==="experience")return (record as HrExperienceRecord).organizationName;
 if(kind==="skill")return (record as HrSkillRecord).skillName;
 return (record as HrCredentialRecord).credentialName;
}
export function admitRecordVersion(record:ExtendedRecord|null){return record===null||(Number.isInteger(record.version)&&record.version!>=1&&record.version!<=2147483646);}
