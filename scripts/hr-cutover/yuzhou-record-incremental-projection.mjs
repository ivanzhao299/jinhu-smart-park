import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
import { structuredDate } from "./t5-nonfile-field-projection.mjs";
import { canonicalProfile } from "./yuzhou-profile-incremental-projection.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");
const fail=code=>{throw Object.assign(new Error(code),{code});};
const definitions=Object.freeze({
 "dbo.knowhow":{domain:"skill",mapping:{knowhow:"skillName",grade:"legacyGrade",memo:"note"},limits:{skillName:160,legacyGrade:64,note:2000},required:["skillName"],dates:[],extras:[]},
 "dbo.ticket":{domain:"credential",mapping:{tickettype:"credentialType",ticket:"credentialName",ticketno:"credentialNumber",org:"issuingAuthority",getdate:"acquiredDate",validdate:"validTo",memo:"note"},limits:{credentialType:64,credentialName:160,credentialNumber:64,issuingAuthority:200,note:2000},required:["credentialType","credentialName"],dates:["acquiredDate","validTo"],extras:["ticketfilename"]},
});
const plain=value=>value!==null&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype;
export const YUZHOU_RECORD_FIELD_COVERAGE=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([table,rule])=>[rule.domain,Object.freeze([
 ...Object.entries(rule.mapping).map(([sourceField,targetField])=>({sourceTable:table,sourceField,targetField,disposition:"fixed_mapping_candidate",originalBaseline:"server_original_receipt_proof_required"})),
 ...(rule.domain==="skill"?[{targetField:"proficiency",disposition:"pending_semantic_binding",reasonCode:"NO_VERIFIED_GRADE_PROFICIENCY_MAPPING"},{targetField:"acquiredDate",disposition:"pending_semantic_binding",reasonCode:"NO_VERIFIED_SOURCE_DATE"}]:[{sourceField:"ticketfilename",disposition:"pending_file_association",reasonCode:"NO_VERIFIED_ATTACHMENT_ASSOCIATION"}]),
])])));
export function verifyExtendedRecordSource(row){
 if(!plain(row)||!Object.hasOwn(definitions,row.sourceTable)||typeof row.sourceKey!=="string"||!/^[-]?\d+$/u.test(row.sourceKey)||!plain(row.source))fail("YUZHOU_RECORD_SOURCE_INVALID");
 const rule=definitions[row.sourceTable];
 const {source}=readT5RetainedSource(row,{encoding:"json_backslash_doubled_v1"});
 if(!Number.isInteger(source.id)||source.id<-2147483648||source.id>2147483647||String(source.id)!==row.sourceKey||row.sourceIdentitySha256!==hash(`${row.sourceTable}\0${source.id}`)||typeof source.person!=="string"||!source.person.trim()||source.person.length>10||source.person.includes("\0")||!source.person.isWellFormed())fail("YUZHOU_RECORD_SOURCE_INVALID");
 for(const column of [...Object.keys(rule.mapping),...rule.extras])if(!Object.hasOwn(source,column)||(source[column]!==null&&typeof source[column]!=="string"))fail("YUZHOU_RECORD_SOURCE_SCHEMA_INVALID");
 const known=new Set(["id","person",...Object.keys(rule.mapping),...rule.extras]);
 if(Object.entries(source).some(([key,value])=>!known.has(key)&&value!==null))fail("YUZHOU_RECORD_SOURCE_SCHEMA_CHANGED");
 return {...row,source};
}
/** A source-bound candidate, NOT an API-admitted package item. The public
 * executor must authenticate original receipts/baselines before integration. */
export function projectYuzhouExtendedRecord(row,employees){
 const verified=verifyExtendedRecordSource(row),source=verified.source,rule=definitions[row.sourceTable];
 const employee=employees.get(source.person.trim());
 if(!employee||employee.sourceTable!=="dbo.person"||typeof employee.sourceKey!=="string"||!employee.sourceKey.trim())fail("YUZHOU_RECORD_EMPLOYEE_MISSING");
 const fields={employeeSourceTable:employee.sourceTable,employeeSourceKey:employee.sourceKey},pendingFields=[],pendingReasons={};
 for(const [column,field] of Object.entries(rule.mapping)){
  const raw=source[column];if(raw!==null&&(raw.includes("\0")||!raw.isWellFormed()))fail("YUZHOU_RECORD_FIELD_INVALID");
  let value=raw===null?null:raw.trim()||null;
  if(field==="credentialType"&&value===null)value="legacy"; // Existing executed T5 fallback, no new category inference.
  if(rule.dates.includes(field)){
   const gaps=[],date=structuredDate(value,`ticket.${column}`,gaps);
   if(gaps.length||date?.startsWith("0000")){pendingFields.push(field);pendingReasons[field]="INVALID_STRUCTURED_VALUE";}else fields[field]=date;
  }else{
   if(field==="credentialNumber"&&value?.includes("*")){pendingFields.push(field);pendingReasons[field]="MASKED_SOURCE_VALUE";continue;}
   if((rule.required.includes(field)&&value===null)||(value!==null&&value.length>rule.limits[field]))fail("YUZHOU_RECORD_FIELD_INVALID");
   fields[field]=value;
  }
 }
 if(fields.acquiredDate&&fields.validTo&&fields.validTo<fields.acquiredDate){delete fields.validTo;pendingFields.push("validTo");pendingReasons.validTo="INVALID_STRUCTURED_VALUE";}
 let fileReferenceSha256=null;
 if(rule.domain==="credential"&&source.ticketfilename!==null&&source.ticketfilename.trim()){
  if(source.ticketfilename.includes("\0")||!source.ticketfilename.isWellFormed())fail("YUZHOU_RECORD_FIELD_INVALID");
  fileReferenceSha256=hash(source.ticketfilename);pendingFields.push("attachmentAssociation");
 }
 const candidate={domain:rule.domain,sourceTable:row.sourceTable,sourceKey:`sha256:${row.sourceIdentitySha256}`,fields,rowDigest:""};
 candidate.rowDigest=hash(canonicalProfile({domain:candidate.domain,sourceTable:candidate.sourceTable,sourceKey:candidate.sourceKey,sourceUpdatedAt:null,fields}));
 return {candidate,admission:"pending_original_receipt_and_api_adapter",declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"candidate_only",pendingFields,pendingReasons},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,fileReferenceSha256,fieldCoverage:YUZHOU_RECORD_FIELD_COVERAGE[rule.domain].map(entry=>({...entry,...(pendingFields.includes(entry.targetField)?{disposition:pendingReasons[entry.targetField]==="MASKED_SOURCE_VALUE"?"pending_masked_value":"pending_invalid_date",reasonCode:pendingReasons[entry.targetField]}:{})}))}};
}
