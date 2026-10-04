import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalProfile } from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
import { projectYuzhouExtendedRecord,verifyExtendedRecordSource,YUZHOU_RECORD_FIELD_COVERAGE } from "../hr-cutover/yuzhou-record-incremental-projection.mjs";
const sha=v=>createHash("sha256").update(v).digest("hex");
const employees=new Map([["SYN-1",{sourceTable:"dbo.person",sourceKey:"SYN-1"}]]);
const skill=()=>({id:1,person:"SYN-1",knowhow:" Synthetic skill ",grade:" Source grade ",memo:" Original note "});
const credential=()=>({id:2,person:"SYN-1",tickettype:null,ticket:" Synthetic credential ",ticketno:"SYN-NUMBER",org:" Synthetic authority ",getdate:"2020-02-29 00:00:00",validdate:"2030-01-01",memo:null,ticketfilename:null});
function row(table,source){return {sourceTable:table,sourceKey:String(source.id),sourceIdentitySha256:sha(`${table}\0${source.id}`),sourceRowSha256:sha(canonicalProfile(source)),source};}
test("fixed mappings preserve original grade and do not fabricate proficiency/date",()=>{
 const value=projectYuzhouExtendedRecord(row("dbo.knowhow",skill()),employees);
 assert.deepEqual(value.candidate.fields,{employeeSourceTable:"dbo.person",employeeSourceKey:"SYN-1",skillName:"Synthetic skill",legacyGrade:"Source grade",note:"Original note"});
 assert.equal(value.admission,"pending_original_receipt_and_api_adapter");assert.equal(value.declaration.disposition,"candidate_only");
 assert.equal("item" in value,false);assert.equal("proficiency" in value.candidate.fields,false);assert.equal("acquiredDate" in value.candidate.fields,false);
 assert.ok(YUZHOU_RECORD_FIELD_COVERAGE.skill.find(v=>v.targetField==="proficiency"&&v.disposition==="pending_semantic_binding"));
});
test("credential mapping reuses original fallback/date-prefix and omits attachment association",()=>{
 const value=projectYuzhouExtendedRecord(row("dbo.ticket",credential()),employees);
 assert.deepEqual(value.candidate.fields,{employeeSourceTable:"dbo.person",employeeSourceKey:"SYN-1",credentialType:"legacy",credentialName:"Synthetic credential",credentialNumber:"SYN-NUMBER",issuingAuthority:"Synthetic authority",acquiredDate:"2020-02-29",validTo:"2030-01-01",note:null});
 assert.deepEqual(value.declaration.pendingFields,[]);assert.equal(value.sourceEvidence.fileReferenceSha256,null);
 const source={...credential(),ticketfilename:"synthetic/private/source.pdf"};const withFile=projectYuzhouExtendedRecord(row("dbo.ticket",source),employees);
 assert.equal(withFile.sourceEvidence.fileReferenceSha256,sha(source.ticketfilename));assert.deepEqual(withFile.declaration.pendingFields,["attachmentAssociation"]);
 assert.equal(JSON.stringify(withFile).includes(source.ticketfilename),false);assert.equal("legacyFileReferenceSha256" in withFile.candidate.fields,false);
});
test("invalid or reversed dates and source masks cannot clear valid modern fields",()=>{
 for(const change of [{getdate:"2026-02-30"},{getdate:"0000-01-01"},{validdate:"2019-01-01"},{validdate:"invalid"},{ticketno:"SYN***"}]){
  const value=projectYuzhouExtendedRecord(row("dbo.ticket",{...credential(),...change}),employees);
  const field=change.getdate?"acquiredDate":change.validdate?"validTo":"credentialNumber";
  assert.equal(field in value.candidate.fields,false);assert.ok(value.declaration.pendingFields.includes(field));
  assert.equal(value.sourceEvidence.fieldCoverage.find(v=>v.targetField===field).disposition,field==="credentialNumber"?"pending_masked_value":"pending_invalid_date");
 }
 const empty=projectYuzhouExtendedRecord(row("dbo.ticket",{...credential(),getdate:null,validdate:null,ticketno:null}),employees);
 assert.equal(empty.candidate.fields.acquiredDate,null);assert.equal(empty.candidate.fields.validTo,null);assert.equal(empty.candidate.fields.credentialNumber,null);
});
test("row hashes and identities stay strict across legacy transport without hash repair",()=>{
 const source={...skill(),knowhow:'Synthetic\\name"with中文'};const original=row("dbo.knowhow",source);
 const transport={...original,source:{...source,knowhow:source.knowhow.replaceAll('\\','\\\\').replaceAll('"','\\"')}};
 assert.equal(projectYuzhouExtendedRecord(transport,employees).candidate.fields.skillName,source.knowhow);
 for(const change of [{sourceRowSha256:"a".repeat(64)},{sourceIdentitySha256:"b".repeat(64)},{sourceKey:"01"},{sourceKey:1},{sourceTable:"dbo.unknown"}])assert.throws(()=>verifyExtendedRecordSource({...original,...change}));
 assert.throws(()=>projectYuzhouExtendedRecord({...original,source:{...source,knowhow:"changed"}},employees));
});
test("schema extensions, invalid types, owner gaps and oversize facts fail safely",()=>{
 for(const source of [{...skill(),grade:4},{...skill(),knowhow:null},{...skill(),knowhow:" "},{...skill(),knowhow:"a".repeat(161)},{...skill(),grade:"a".repeat(65)},{...skill(),memo:"a\0b"},{...skill(),grade:"bad\ud800"},{...skill(),new_field:"unreviewed"},{...skill(),person:"other"}])assert.throws(()=>projectYuzhouExtendedRecord(row("dbo.knowhow",source),employees));
 const missing=skill();delete missing.grade;assert.throws(()=>verifyExtendedRecordSource(row("dbo.knowhow",missing)));
 assert.throws(()=>projectYuzhouExtendedRecord(row("dbo.ticket",credential()),new Map([["SYN-1",{sourceTable:"wrong",sourceKey:"fake"}]])));
});
test("stable projected row digest changes only with mapped facts and owner",()=>{
 const first=projectYuzhouExtendedRecord(row("dbo.knowhow",skill()),employees).candidate;
 const second=projectYuzhouExtendedRecord(row("dbo.knowhow",{...skill(),memo:"changed"}),employees).candidate;
 assert.match(first.sourceKey,/^sha256:[0-9a-f]{64}$/);assert.match(first.rowDigest,/^[0-9a-f]{64}$/);assert.equal(first.sourceKey,second.sourceKey);assert.notEqual(first.rowDigest,second.rowDigest);
 assert.equal(first.rowDigest,sha(canonicalProfile({domain:first.domain,sourceTable:first.sourceTable,sourceKey:first.sourceKey,sourceUpdatedAt:null,fields:first.fields})));
});
