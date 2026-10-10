import assert from "node:assert/strict";
import test from "node:test";
import type {DataSource,EntityManager} from "typeorm";
import {HrProbationService} from "./hr-probation.service";

const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
const row={id:"application",version:7,application_no:"SYN-7",application_name:"Synthetic confirmation",application_date:"2026-10-01",applicant_user_id:"applicant",reason:"Synthetic reason",status:"submitted",review_comment:null,participants:[],private_column:"not a response field"};

test("probation lists expose the persisted application version without exposing internal columns",async()=>{
 const db={query:async(sql:string)=>sql.startsWith("SELECT count")?[{total:1}]:[row]};
 const service=new HrProbationService(db as unknown as DataSource);
 const result=await service.list(scope,{page:1,page_size:20});
 assert.equal(result.items[0]?.version,7);
 assert.equal(result.items[0]?.status,"submitted");
 assert.equal("private_column" in result.items[0]!,false);
 assert.equal("applicant_user_id" in result.items[0]!,false);
});

test("probation review returns the new persisted version and actual opinion from transaction readback",async()=>{
 const opinion="Please correct the planned date";
 let updated=false;
 const manager={query:async(sql:string,params:unknown[])=>{
  if(sql.includes("FOR UPDATE"))return [row];
  if(sql.startsWith("UPDATE hr_probation_application")){
   assert.equal(params[0],"returned");assert.equal(params[1],opinion);updated=true;return [];
  }
  if(sql.startsWith("SELECT a.*")){assert.ok(updated);return [{...row,version:8,status:"returned",review_comment:opinion}];}
  return [];
 }};
 const db={transaction:async<T>(work:(m:EntityManager)=>Promise<T>)=>work(manager as unknown as EntityManager)};
 const result=await new HrProbationService(db as unknown as DataSource).review(scope,{sub:"reviewer",username:"synthetic",...scope,roles:[],permissions:[]},"application",{action:"return",comment:opinion});
 assert.equal(result.version,8);assert.equal(result.status,"returned");assert.equal(result.reviewComment,opinion);
});
