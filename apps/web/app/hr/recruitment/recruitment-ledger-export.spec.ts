import assert from "node:assert/strict";
import test from "node:test";
import { recruitmentLedgerExportCsv } from "./recruitment-ledger-export";
const req = {id:"r",requisitionCode:"=1+1",title:"岗位\"名称\n第二行",orgId:"o",orgName:"部门",positionId:null,positionName:null,ownerUserId:"u",ownerName:null,headcount:2,hiredCount:0,plannedOnboardDate:"2026-07-01",status:"open"};
const candidate={id:"c",candidateNo:"C",fullName:"姓名",requisitionId:"r",requisitionTitle:"岗位",stage:"screening",source:null,expectedOnboardDate:null,latestEvaluation:null,mobileMasked:"138****0000",emailMasked:null,identityMasked:null,convertedEmployeeId:null};
const snapshot=(items:unknown[])=>({items,total:items.length,snapshotAt:"2026-10-11T00:00:00.000Z"});
test("CSV exports complete public projections with Chinese labels and formula escaping",()=>{
 const output=recruitmentLedgerExportCsv(snapshot(Array.from({length:21},(_,i)=>({...req,id:`r${i}`,privateField:"SECRET"}))),"requisition");
 assert.equal(output.total,21);assert.ok(output.csv.startsWith("\uFEFF"));assert.match(output.csv,/'=1\+1/);assert.match(output.csv,/岗位""名称\n第二行/);assert.match(output.csv,/招聘中/);assert.doesNotMatch(output.csv,/SECRET|ownerUserId/);
 const masked=recruitmentLedgerExportCsv(snapshot([{...candidate,mobile:"SECRET",identityCipher:"SECRET"}]),"candidate");assert.match(masked.csv,/138\*\*\*\*0000/);assert.match(masked.csv,/筛选/);assert.doesNotMatch(masked.csv,/SECRET/);
 assert.equal(recruitmentLedgerExportCsv(snapshot([]),"candidate").csv.split("\r\n").length,1);
});
test("rejects incomplete, duplicate, oversized, malformed calendar and invalid projection snapshots",()=>{
 for(const kind of ["requisition","candidate"] as const){const row=kind==="requisition"?req:candidate;
  for(const bad of [null,{...snapshot([row]),total:2},snapshot([row,row]),snapshot([{...row,id:""}]),{...snapshot([row]),snapshotAt:"2026-02-30T00:00:00.000Z"},{...snapshot([]),total:5001},snapshot([{...row,status:"unknown",stage:"unknown"}]),snapshot([{...row,plannedOnboardDate:"2026-02-30",expectedOnboardDate:"2026-02-30"}])])assert.throws(()=>recruitmentLedgerExportCsv(bad,kind),/无法核对/);
 }
 assert.throws(()=>recruitmentLedgerExportCsv(snapshot([{...req,headcount:1,hiredCount:2}]),"requisition"));
 assert.throws(()=>recruitmentLedgerExportCsv(snapshot([{...candidate,mobileMasked:42}]),"candidate"));
});
