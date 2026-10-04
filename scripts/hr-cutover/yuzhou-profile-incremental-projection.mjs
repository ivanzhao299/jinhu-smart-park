import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
const hash=v=>createHash("sha256").update(v).digest("hex");
export const canonicalProfile=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonicalProfile).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalProfile(v[k])}`).join(",")}}`;
const fail=code=>{throw new Error(code);};
const plain=v=>v!==null&&typeof v==="object"&&Object.getPrototypeOf(v)===Object.prototype;
const originalMapped={sex:"gender",birthday:"dateOfBirth",handtel:"personalMobile",email:"personalEmail",addr:"address",idcard:"idNumber"};
// The original T5 certificate remains six-field-only. These optional columns are
// additional raw semantics, never additional historical baseline authority.
const aliases={oldaddr:{targetField:"nativePlace",sourceMaxLength:50},edulevel:{targetField:"degree",sourceMaxLength:24}};
const mapped={...originalMapped,...Object.fromEntries(Object.entries(aliases).map(([column,rule])=>[column,rule.targetField]))};
export const YUZHOU_PROFILE_ALIAS_EVIDENCE=Object.freeze({
  catalogSha256:"8e62d0308c14db70192f5b94f8cc775f2e87032d14f5cbeaee238d1d177f5014",
  procedures:{u_personinfo2003:"adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a",web_personinfo_SelectCommand:"4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868"},
  custody:"metadata_only_not_live_source_custody",
});
// Inventory the modern UpdateHrEmployeeProfileDto whitelist, excluding its CAS
// control expectedVersion. No inferred dictionary or generic raw-code fallback.
const pending={
  idType:"No reviewed raw document-type mapping; do not infer resident_id from idcard",
  englishName:"No verified raw source binding",
  ethnicity:"Exact source dictionary and target representation not bound",
  politicalStatus:"Exact source dictionary and target representation not bound",
  partyJoinDate:"No verified raw date semantics",
  heightCm:"No verified raw measurement and unit contract",
  weightKg:"No verified raw measurement and unit contract",
  maritalStatus:"Exact source dictionary and target representation not bound",
  healthStatus:"person.physical is 体质, not evidence of healthStatus",
  householdRegistration:"No verified raw source binding",
  highestEducation:"person.edu joins educode.edu to eduname; edu/secedu precedence unproven",
  major:"No verified raw source binding",
  foreignLanguage:"Exact source dictionary and target representation not bound",
  languageLevel:"Exact source dictionary and target representation not bound",
  graduationDate:"No verified raw date semantics or education precedence",
  graduationSchool:"No verified raw binding or education precedence",
  homePhone:"No verified raw source binding",
  jobTitle:"person.assignment has 职务/职称 conflict; no canonical jobTitle binding",
  jobGrade:"person.grade is 工资标准, not evidence of jobGrade",
  employeeCategory:"Exact source dictionary and target representation not bound",
  technicalTitle:"No exact scoped dictionary artifact in this raw profile entry",
  technicalGrade:"No exact scoped dictionary artifact in this raw profile entry",
  emergencyContactName:"No verified raw source binding",
  emergencyContactMobile:"No verified raw source binding",
  remark:"No verified raw source binding",
};
export const YUZHOU_PROFILE_FIELD_COVERAGE=Object.freeze([
  ...Object.entries(mapped).map(([sourceField,targetField])=>({targetField,sourceField,disposition:"supported",originalBaseline:!Object.hasOwn(aliases,sourceField),...(aliases[sourceField]?{sourceMaxLength:aliases[sourceField].sourceMaxLength,evidence:"hash_bound_procedure_alias",sourceOptional:true}:{})})),
  ...Object.entries(pending).map(([targetField,reason])=>({targetField,disposition:"pending_semantic_binding",reason})),
].sort((a,b)=>a.targetField.localeCompare(b.targetField)));
export function verifyProfileSource(row) {
  if(!plain(row)||row.sourceTable!=="dbo.person.core_residue"||!/^[-]?\d+$/u.test(row.sourceKey??"")||!plain(row.source)) fail("YUZHOU_PROFILE_SOURCE_INVALID");
  const {source}=readT5RetainedSource(row,{encoding:"json_backslash_doubled_v1"});
  if(!Number.isInteger(source.id)||source.id<-2147483648||source.id>2147483647||String(source.id)!==row.sourceKey||row.sourceIdentitySha256!==hash(`${row.sourceTable}\0${row.sourceKey}`)||typeof source.person!=="string"||!source.person.trim()||source.person.length>10) fail("YUZHOU_PROFILE_SOURCE_INVALID");
  for(const column of Object.keys(originalMapped)) if(!Object.hasOwn(source,column)||!(source[column]===null||typeof source[column]==="string")) fail("YUZHOU_PROFILE_SOURCE_SCHEMA_INVALID");
  for(const column of Object.keys(aliases)) if(Object.hasOwn(source,column)) {
    const value=source[column];
    if(value!==null && (typeof value!=="string" || value.includes("\0") || !value.isWellFormed())) fail("YUZHOU_PROFILE_SOURCE_SCHEMA_INVALID");
    if(typeof value==="string" && [...value].length>aliases[column].sourceMaxLength) fail("YUZHOU_PROFILE_FIELD_INVALID");
  }
  if(Object.hasOwn(source,"password")||Object.hasOwn(source,"photo")) fail("YUZHOU_PROFILE_SOURCE_FORBIDDEN");
  return {...row,source};
}
export function profileSourceFields(source, omittedFields=[]) {
  const text=value=>value===null?null:value.trim()||null;
  const fields=Object.fromEntries(Object.entries(mapped).filter(([column])=>Object.hasOwn(source,column)).map(([column,field])=>[field,text(source[column])]));
  for(const key of omittedFields) {if(!Object.values(originalMapped).includes(key))fail("YUZHOU_PROFILE_ADMISSION_INVALID");delete fields[key];}
  if(fields.dateOfBirth!==undefined&&fields.dateOfBirth!==null) {
    if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/u.test(fields.dateOfBirth)) fail("YUZHOU_PROFILE_DATE_INVALID");
    fields.dateOfBirth=fields.dateOfBirth.slice(0,10);
    const date=new Date(`${fields.dateOfBirth}T00:00:00Z`);
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==fields.dateOfBirth) fail("YUZHOU_PROFILE_DATE_INVALID");
  }
  if(fields.idNumber?.startsWith("enc:")) fail("YUZHOU_PROFILE_PROTECTED_INPUT_INVALID");
  return fields;
}
export function projectYuzhouProfile(row,employees,{baselineWitness,aliasAcceptance,omittedFields=[]}={}) {
  const verified=verifyProfileSource(row),source=verified.source;
  const employee=employees.get(source.person.trim());if(!employee) fail("YUZHOU_PROFILE_EMPLOYEE_MISSING");
  let fields={employeeSourceKey:employee.sourceKey,employeeSourceTable:employee.sourceTable,...(baselineWitness?{}:profileSourceFields(source,omittedFields))};
  if(baselineWitness) fields={};
  else {
    const limits={gender:32,personalMobile:32,personalEmail:128,address:500,idNumber:64,nativePlace:128,degree:64};
    for(const key of omittedFields) {if(!Object.values(originalMapped).includes(key))fail("YUZHOU_PROFILE_ADMISSION_INVALID");delete fields[key];}
    for(const [key,value] of Object.entries(fields)) if(value!==null&&limits[key]&&value.length>limits[key])fail("YUZHOU_PROFILE_FIELD_INVALID");
    if(fields.personalEmail!==undefined&&fields.personalEmail!==null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(fields.personalEmail))fail("YUZHOU_PROFILE_EMAIL_INVALID");
  }
  if(aliasAcceptance!==undefined) {
    if(baselineWitness || !plain(aliasAcceptance) || Object.keys(aliasAcceptance).sort().join(",")!=="bindingSha256,fields,operationId,proof,version"
      || aliasAcceptance.version!==1 || aliasAcceptance.proof!=="original_t5_alias_fields_v1" || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(aliasAcceptance.operationId??"")
      || !/^[a-f0-9]{64}$/u.test(aliasAcceptance.bindingSha256??"") || !Array.isArray(aliasAcceptance.fields) || !aliasAcceptance.fields.length || new Set(aliasAcceptance.fields).size!==aliasAcceptance.fields.length
      || aliasAcceptance.fields.some(field=>!["nativePlace","degree"].includes(field)||!Object.hasOwn(fields,field))) fail("YUZHOU_PROFILE_ALIAS_ACCEPTANCE_INVALID");
    fields=Object.fromEntries(aliasAcceptance.fields.map(field=>[field,fields[field]]));
  }
  const item={domain:"profile",sourceTable:row.sourceTable,sourceKey:`sha256:${row.sourceIdentitySha256}`,rowDigest:"",fields,...(baselineWitness?{profileBaselineWitness:baselineWitness}:{}),...(aliasAcceptance?{profileAliasAcceptance:aliasAcceptance}:{})};
  item.rowDigest=hash(canonicalProfile({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:null,fields,...(aliasAcceptance?{profileAliasAcceptance:aliasAcceptance}:{})}));
  const fieldCoverage=Object.keys(source).sort().map(column=>({field:column,valuePresent:source[column]!==null,disposition:aliasAcceptance && mapped[column] && !aliasAcceptance.fields.includes(mapped[column])?"not_requested_alias_acceptance":mapped[column]?(baselineWitness?(Object.hasOwn(aliases,column)?"pending_initial_field_baseline":"baseline_only_source_evidence"):omittedFields.includes(mapped[column])?"pending_unchanged_original_invalid_field":"carried"):"pending_api_adapter",...(mapped[column]?{targetField:mapped[column]}:{})}));
  return {item,declaration:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,disposition:"api_eligible"},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,rawSource:source,fieldCoverage}};
}
