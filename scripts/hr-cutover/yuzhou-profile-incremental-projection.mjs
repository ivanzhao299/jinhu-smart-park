import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
const hash=v=>createHash("sha256").update(v).digest("hex");
export const canonicalProfile=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonicalProfile).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalProfile(v[k])}`).join(",")}}`;
const fail=code=>{throw new Error(code);};
const plain=v=>v!==null&&typeof v==="object"&&Object.getPrototypeOf(v)===Object.prototype;
const mapped={sex:"gender",birthday:"dateOfBirth",handtel:"personalMobile",email:"personalEmail",addr:"address",idcard:"idNumber"};
export function verifyProfileSource(row) {
  if(!plain(row)||row.sourceTable!=="dbo.person.core_residue"||!/^[-]?\d+$/u.test(row.sourceKey??"")||!plain(row.source)) fail("YUZHOU_PROFILE_SOURCE_INVALID");
  const {source}=readT5RetainedSource(row,{encoding:"json_backslash_doubled_v1"});
  if(!Number.isInteger(source.id)||source.id<-2147483648||source.id>2147483647||String(source.id)!==row.sourceKey||row.sourceIdentitySha256!==hash(`${row.sourceTable}\0${row.sourceKey}`)||typeof source.person!=="string"||!source.person.trim()||source.person.length>10) fail("YUZHOU_PROFILE_SOURCE_INVALID");
  for(const column of Object.keys(mapped)) if(!Object.hasOwn(source,column)||!(source[column]===null||typeof source[column]==="string")) fail("YUZHOU_PROFILE_SOURCE_SCHEMA_INVALID");
  if(Object.hasOwn(source,"password")||Object.hasOwn(source,"photo")) fail("YUZHOU_PROFILE_SOURCE_FORBIDDEN");
  return {...row,source};
}
export function profileSourceFields(source, omittedFields=[]) {
  const text=value=>value===null?null:value.trim()||null;
  const fields=Object.fromEntries(Object.entries(mapped).map(([column,field])=>[field,text(source[column])]));
  for(const key of omittedFields) {if(!Object.values(mapped).includes(key))fail("YUZHOU_PROFILE_ADMISSION_INVALID");delete fields[key];}
  if(fields.dateOfBirth!==undefined&&fields.dateOfBirth!==null) {
    if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/u.test(fields.dateOfBirth)) fail("YUZHOU_PROFILE_DATE_INVALID");
    fields.dateOfBirth=fields.dateOfBirth.slice(0,10);
    const date=new Date(`${fields.dateOfBirth}T00:00:00Z`);
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==fields.dateOfBirth) fail("YUZHOU_PROFILE_DATE_INVALID");
  }
  if(fields.idNumber?.startsWith("enc:")) fail("YUZHOU_PROFILE_PROTECTED_INPUT_INVALID");
  return fields;
}
export function projectYuzhouProfile(row,employees,{baselineWitness,omittedFields=[]}={}) {
  const verified=verifyProfileSource(row),source=verified.source;
  const employee=employees.get(source.person.trim());if(!employee) fail("YUZHOU_PROFILE_EMPLOYEE_MISSING");
  let fields={employeeSourceKey:employee.sourceKey,employeeSourceTable:employee.sourceTable,...(baselineWitness?{}:profileSourceFields(source,omittedFields))};
  if(baselineWitness) fields={};
  else {
    const limits={gender:32,personalMobile:32,personalEmail:128,address:500,idNumber:64};
    for(const key of omittedFields) {if(!Object.values(mapped).includes(key))fail("YUZHOU_PROFILE_ADMISSION_INVALID");delete fields[key];}
    for(const [key,value] of Object.entries(fields)) if(value!==null&&limits[key]&&value.length>limits[key])fail("YUZHOU_PROFILE_FIELD_INVALID");
    if(fields.personalEmail!==undefined&&fields.personalEmail!==null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(fields.personalEmail))fail("YUZHOU_PROFILE_EMAIL_INVALID");
  }
  const item={domain:"profile",sourceTable:row.sourceTable,sourceKey:`sha256:${row.sourceIdentitySha256}`,rowDigest:"",fields,...(baselineWitness?{profileBaselineWitness:baselineWitness}:{})};
  item.rowDigest=hash(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields}));
  const fieldCoverage=Object.keys(source).sort().map(column=>({field:column,valuePresent:source[column]!==null,disposition:mapped[column]?(baselineWitness?"baseline_only_source_evidence":omittedFields.includes(mapped[column])?"pending_unchanged_original_invalid_field":"carried"):"pending_api_adapter",...(mapped[column]?{targetField:mapped[column]}:{})}));
  return {item,declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"api_eligible"},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,rawSource:source,fieldCoverage}};
}
