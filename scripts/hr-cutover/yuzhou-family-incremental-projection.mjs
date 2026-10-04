import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
import { structuredDate } from "./t5-nonfile-field-projection.mjs";
import { canonicalProfile } from "./yuzhou-profile-incremental-projection.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");
const fail=code=>{throw new Error(code);};
const plain=value=>value!==null&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype;
const mapping=Object.freeze({rela:"relationship",member:"fullName",tel:"contact",birthday:"birthDate",jobunit:"workUnit",jobname:"jobTitle",political:"politicalStatus"});
const limits={relationship:32,fullName:100,contact:64,workUnit:200,jobTitle:160,politicalStatus:64};
export const YUZHOU_FAMILY_FIELD_COVERAGE=Object.freeze([
  ...Object.entries(mapping).map(([sourceField,targetField])=>({sourceField,targetField,disposition:"supported",originalBaseline:"server_certified_original_t5"})),
  {targetField:"identityNumber",disposition:"pending_semantic_binding",reason:"No verified family source document number"},
  {targetField:"isEmergencyContact",disposition:"pending_semantic_binding",reason:"No verified family source emergency designation"},
]);
export function verifyFamilySource(row) {
  if(!plain(row)||row.sourceTable!=="dbo.family"||!/^[-]?\d+$/u.test(row.sourceKey??"")||!plain(row.source))fail("YUZHOU_FAMILY_SOURCE_INVALID");
  const {source}=readT5RetainedSource(row,{encoding:"json_backslash_doubled_v1"});
  if(!Number.isInteger(source.id)||source.id<-2147483648||source.id>2147483647||String(source.id)!==row.sourceKey||row.sourceIdentitySha256!==hash(`dbo.family\0${source.id}`)||typeof source.person!=="string"||!source.person.trim()||source.person.length>10)fail("YUZHOU_FAMILY_SOURCE_INVALID");
  for(const column of Object.keys(mapping))if(!Object.hasOwn(source,column)||(source[column]!==null&&typeof source[column]!=="string"))fail("YUZHOU_FAMILY_SOURCE_SCHEMA_INVALID");
  return {...row,source};
}
/** Frozen seven-field mapping; invalid historical dates stay explicit pending,
 * never clear a modern date. Old encrypted materialized values are not inputs. */
export function projectYuzhouFamily(row,employees) {
  const verified=verifyFamilySource(row),source=verified.source;
  const employee=employees.get(source.person.trim());if(!employee)fail("YUZHOU_FAMILY_EMPLOYEE_MISSING");
  const fields={employeeSourceTable:employee.sourceTable,employeeSourceKey:employee.sourceKey},gaps=[];
  for(const [column,field] of Object.entries(mapping)){
    const raw=source[column];
    if(raw!==null&&(raw.includes("\0")||!raw.isWellFormed()))fail("YUZHOU_FAMILY_FIELD_INVALID");
    const value=raw===null?null:raw.trim()||null;
    if(field==="birthDate"){
      const date=structuredDate(value,"family.birthday",gaps);
      if(!gaps.length&&date?.startsWith("0000"))gaps.push({fieldLocator:"family.birthday",reasonCode:"INVALID_STRUCTURED_VALUE"});
      if(!gaps.length)fields[field]=date;
    }else{
      if((field==="relationship"||field==="fullName")&&value===null)fail("YUZHOU_FAMILY_FIELD_INVALID");
      if(value!==null&&value.length>limits[field])fail("YUZHOU_FAMILY_FIELD_INVALID");
      fields[field]=value;
    }
  }
  const item={domain:"family",sourceTable:row.sourceTable,sourceKey:`sha256:${row.sourceIdentitySha256}`,rowDigest:"",fields};
  item.rowDigest=hash(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields}));
  return {item,declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"api_eligible",pendingFields:gaps},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,fieldCoverage:YUZHOU_FAMILY_FIELD_COVERAGE.map(value=>({...value,...(gaps.length&&value.targetField==="birthDate"?{disposition:"pending_invalid_date",reasonCode:"INVALID_STRUCTURED_VALUE"}:{})}))}};
}
