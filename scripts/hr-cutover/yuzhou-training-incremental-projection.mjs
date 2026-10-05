import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
import { structuredDate } from "./t5-nonfile-field-projection.mjs";
import { canonicalProfile } from "./yuzhou-profile-incremental-projection.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value!==null&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype;
const columns=["id","person","organ","coursename","startdate","enddate","hours","attainment","test","trainmoney","memo"];
const unresolved={organ:"TRAINING_HISTORY_ORGAN_PROVIDER_SEMANTICS_UNRESOLVED",attainment:"TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE",test:"TRAINING_HISTORY_TEST_RESULT_MAPPING_UNRESOLVED",trainmoney:"TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE"};
export const YUZHOU_TRAINING_FIELD_COVERAGE=Object.freeze([
 ...Object.entries({person:"employeeSourceKey",coursename:"courseName",startdate:"startDate",enddate:"endDate",hours:"hours",memo:"memo"}).map(([sourceField,targetField])=>Object.freeze({sourceTable:"dbo.trainhis",sourceField,targetField,disposition:"fixed_mapping_candidate"})),
 ...Object.entries(unresolved).map(([sourceField,reasonCode])=>Object.freeze({sourceTable:"dbo.trainhis",sourceField,disposition:"pending_semantic_or_writer_binding",reasonCode})),
]);
const validText=(value,max)=>typeof value==="string"&&value.length<=max&&!value.includes("\0")&&value.isWellFormed();
export function verifyTrainingHistorySource(row) {
 if(!plain(row)||row.sourceTable!=="dbo.trainhis"||typeof row.sourceKey!=="string"||!/^[-]?\d+$/u.test(row.sourceKey)||!plain(row.source))fail("YUZHOU_TRAINING_SOURCE_INVALID");
 const {source}=readT5RetainedSource(row,{encoding:"json_backslash_doubled_v1"});
 if(!Number.isInteger(source.id)||source.id<-2147483648||source.id>2147483647||String(source.id)!==row.sourceKey||row.sourceIdentitySha256!==hash(`dbo.trainhis\0${source.id}`))fail("YUZHOU_TRAINING_SOURCE_INVALID");
 if(columns.some(key=>!Object.hasOwn(source,key))||Object.entries(source).some(([key,value])=>!columns.includes(key)&&value!==null))fail("YUZHOU_TRAINING_SCHEMA_CHANGED");
 if(!validText(source.person,10)||!source.person.trim())fail("YUZHOU_TRAINING_OWNER_INVALID");
 for(const key of ["organ","coursename","startdate","enddate","test","memo"])if(source[key]!==null&&!validText(source[key],2000))fail("YUZHOU_TRAINING_FIELD_INVALID");
 for(const key of ["attainment","trainmoney"])if(source[key]!==null&&!(typeof source[key]==="number"&&Number.isFinite(source[key]))&&!(typeof source[key]==="string"&&/^-?\d+(?:\.\d+)?$/u.test(source[key])))fail("YUZHOU_TRAINING_FIELD_INVALID");
 return {...row,source};
}
function requiredDate(raw) {
 // Reviewed legacy transform takes the source ISO date, without UTC conversion.
 if(typeof raw!=="string"||!/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/u.test(raw))fail("YUZHOU_TRAINING_DATE_INVALID");
 const gaps=[],date=structuredDate(raw,"trainhis.date",gaps);
 if(!date||gaps.length)fail("YUZHOU_TRAINING_DATE_INVALID");
 return date;
}
/** Candidate only. API admission and formal training transactions are separate.
 * No result/status/provider/currency is inferred from unreviewed raw columns. */
export function projectYuzhouTrainingHistory(row,employees) {
 const verified=verifyTrainingHistorySource(row),source=verified.source;
 if(!(employees instanceof Map))fail("YUZHOU_TRAINING_OWNER_INVALID");
 const employee=employees.get(source.person.trim());
 if(!plain(employee)||employee.sourceTable!=="dbo.person"||!/^sha256:[a-f0-9]{64}$/u.test(employee.sourceKey??""))fail("YUZHOU_TRAINING_EMPLOYEE_MISSING");
 const courseName=source.coursename?.trim();
 if(!courseName||courseName.length>160)fail("YUZHOU_TRAINING_NAME_INVALID");
 const startDate=requiredDate(source.startdate),endDate=requiredDate(source.enddate);
 if(endDate<startDate)fail("YUZHOU_TRAINING_DATE_RANGE_INVALID");
 if(!Number.isInteger(source.hours)||source.hours<1||source.hours>999999)fail("YUZHOU_TRAINING_HOURS_INVALID");
 const fields={employeeSourceTable:employee.sourceTable,employeeSourceKey:employee.sourceKey,courseName,startDate,endDate,hours:String(source.hours),memo:source.memo};
 const candidate={domain:"training_history",sourceTable:"dbo.trainhis",sourceKey:`sha256:${row.sourceIdentitySha256}`,fields,rowDigest:""};
 candidate.rowDigest=hash(canonicalProfile({domain:candidate.domain,sourceTable:candidate.sourceTable,sourceKey:candidate.sourceKey,sourceUpdatedAt:null,fields}));
 return {candidate,admission:"pending_training_api_executor",declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"candidate_only",pendingFields:Object.keys(unresolved),pendingReasons:{...unresolved}},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,fieldCoverage:YUZHOU_TRAINING_FIELD_COVERAGE.map(entry=>({...entry}))}};
}
