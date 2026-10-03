import assert from "node:assert/strict";
import test from "node:test";
import {projectHistoricalContractTerms} from "./hr-contract-original-terms";

test("original integer year facts remain independent and zero is preserved",()=>{
 const result=projectHistoricalContractTerms(true,{unconfirmedTerm:2,unconfirmedTotalTerm:"5",unconfirmedRenewalYears:0,raw:"private"});
 assert.deepEqual(result,{originalTermYears:{initial:{value:2,status:"recorded"},total:{value:5,status:"recorded"},renewal:{value:0,status:"recorded"}}});
});
test("unknown and invalid source values are not coerced or defaulted",()=>{
 for(const value of [false,true,-1,1.5,"2年","-1","1.0"," ",{},[],2147483648])assert.deepEqual(projectHistoricalContractTerms(true,{unconfirmedTerm:value}).originalTermYears?.initial,{value:null,status:"unconfirmed"});
 for(const value of [null,undefined,""])assert.deepEqual(projectHistoricalContractTerms(true,{unconfirmedTerm:value}).originalTermYears?.initial,{value:null,status:"missing"});
});
test("modern and unrelated source snapshots do not gain original term fields",()=>{
 assert.deepEqual(projectHistoricalContractTerms(false,{unconfirmedTerm:2}),{});
 assert.deepEqual(projectHistoricalContractTerms(true,{raw:"private"}),{});
});
