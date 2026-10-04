import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {canonicalProfile} from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
import {projectYuzhouTrainingHistory,verifyTrainingHistorySource,YUZHOU_TRAINING_FIELD_COVERAGE} from "../hr-cutover/yuzhou-training-incremental-projection.mjs";
const sha=value=>createHash("sha256").update(value).digest("hex");
const employees=new Map([["SYN-1",{sourceTable:"dbo.person",sourceKey:`sha256:${sha('dbo.person\0SYN-1')}`}]]);
const source=()=>({id:1,person:"SYN-1",organ:"Unknown provider meaning",coursename:" Synthetic training ",startdate:"2020-02-29T08:30:00",enddate:"2020-03-01T17:30:00",hours:8,attainment:"88.00",test:"Source label",trainmoney:"12.0000",memo:"Source memo"});
const row=value=>({sourceTable:"dbo.trainhis",sourceKey:String(value.id),sourceIdentitySha256:sha(`dbo.trainhis\0${value.id}`),sourceRowSha256:sha(canonicalProfile(value)),source:value});
test("reviewed fields preserve exact source owner and never infer result or financial facts",()=>{
 const original=row(source()),copy=structuredClone(original),p=projectYuzhouTrainingHistory(original,employees);
 assert.deepEqual(p.candidate.fields,{employeeSourceTable:"dbo.person",employeeSourceKey:employees.get("SYN-1").sourceKey,courseName:"Synthetic training",startDate:"2020-02-29",endDate:"2020-03-01",hours:"8"});
 assert.equal(p.admission,"pending_training_api_executor");assert.equal(p.declaration.disposition,"candidate_only");assert.equal("item" in p,false);
 assert.deepEqual(p.declaration.pendingFields,["organ","attainment","test","trainmoney","memo"]);
 for(const key of ["score","actualCost","provider","evaluation","status","currency"])assert.equal(key in p.candidate.fields,false);
 assert.deepEqual(original,copy);assert.equal(YUZHOU_TRAINING_FIELD_COVERAGE.length,10);
});
test("row hash, stable identity and one legacy escape layer are verified without repairing hashes",()=>{
 const s={...source(),coursename:'Synthetic\\name"中文'},r=row(s),transport={...r,source:{...s,coursename:s.coursename.replaceAll('\\','\\\\').replaceAll('"','\\"')}};
 assert.equal(projectYuzhouTrainingHistory(transport,employees).candidate.fields.courseName,s.coursename);
 for(const patch of [{sourceIdentitySha256:'a'.repeat(64)},{sourceRowSha256:'b'.repeat(64)},{sourceKey:'01'},{sourceKey:1},{sourceTable:'dbo.train'}])assert.throws(()=>verifyTrainingHistorySource({...r,...patch}));
 assert.throws(()=>verifyTrainingHistorySource({...r,source:{...s,hours:9}}));
});
test("missing columns, non-null new semantics and invalid raw types fail closed",()=>{
 const missing=source();delete missing.memo;
 for(const s of [missing,{...source(),newField:'unreviewed'},{...source(),attainment:{}},{...source(),trainmoney:Infinity},{...source(),person:'bad\0code'},{...source(),coursename:'bad\ud800'},{...source(),id:2147483648}])assert.throws(()=>projectYuzhouTrainingHistory(row(s),employees));
 assert.equal(projectYuzhouTrainingHistory(row({...source(),newField:null}),employees).candidate.fields.hours,'8');
});
test("required dates use reviewed local ISO date with strict calendar and chronology",()=>{
 for(const startdate of [null,'2023-02-29T00:00:00','0000-01-01T00:00:00','2020-01-01T25:00:00','2020-01-01','2020-01-01T00:00:00Z','2020-01-01T00:00:00junk'])assert.throws(()=>projectYuzhouTrainingHistory(row({...source(),startdate}),employees));
 assert.throws(()=>projectYuzhouTrainingHistory(row({...source(),enddate:'2020-02-28T00:00:00'}),employees));
 assert.equal(projectYuzhouTrainingHistory(row({...source(),startdate:'2020-02-29T00:00:00.1234567'}),employees).candidate.fields.startDate,'2020-02-29');
});
test("hours must be positive reviewed integers and owner must be exact source identity",()=>{
 for(const hours of [null,0,-1,1.5,'8',1000000])assert.throws(()=>projectYuzhouTrainingHistory(row({...source(),hours}),employees));
 for(const employee of [undefined,{sourceTable:'dbo.person',sourceKey:'SYN-1'},{sourceTable:'wrong',sourceKey:employees.get('SYN-1').sourceKey}])assert.throws(()=>projectYuzhouTrainingHistory(row(source()),new Map([['SYN-1',employee]])));
 assert.equal(projectYuzhouTrainingHistory(row({...source(),hours:999999}),employees).candidate.fields.hours,'999999');
});
test("projected fact digest is stable across extracts and changes only with mapped facts or owner",()=>{
 const a=projectYuzhouTrainingHistory(row(source()),employees),b=projectYuzhouTrainingHistory(row({...source(),memo:'changed unreviewed memo'}),employees),c=projectYuzhouTrainingHistory(row({...source(),hours:9}),employees);
 assert.equal(a.candidate.sourceKey,b.candidate.sourceKey);assert.equal(a.candidate.rowDigest,b.candidate.rowDigest);assert.notEqual(a.declaration.sourceRowSha256,b.declaration.sourceRowSha256);assert.notEqual(a.candidate.rowDigest,c.candidate.rowDigest);
 const changedOwner=projectYuzhouTrainingHistory(row(source()),new Map([['SYN-1',{sourceTable:'dbo.person',sourceKey:`sha256:${'a'.repeat(64)}`}]]));assert.notEqual(a.candidate.rowDigest,changedOwner.candidate.rowDigest);
});
test("errors never expose source names or values and coverage cannot be mutated",()=>{
 assert.throws(()=>projectYuzhouTrainingHistory(row({...source(),coursename:'Secret'.repeat(50)}),employees),error=>error.message==='YUZHOU_TRAINING_NAME_INVALID');
 assert.throws(()=>{YUZHOU_TRAINING_FIELD_COVERAGE[0].targetField='changed';},TypeError);
});
