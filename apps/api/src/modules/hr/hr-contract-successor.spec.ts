import assert from "node:assert/strict";
import test from "node:test";
import {historicalContractPredecessors,type ContractSuccessorCandidate} from "./hr-contract-successor";

const row=(fields:Partial<ContractSuccessorCandidate>={}):ContractSuccessorCandidate=>({id:"synthetic-predecessor",status:"active",isHistoricalImport:true,endDate:"2020-12-31",...fields});
test("ended historical terms precede modern work without mutating original facts",()=>{
 const rows=[row({id:"b"}),row({id:"a",endDate:"2019-12-31"})],before=JSON.stringify(rows);
 assert.deepEqual(historicalContractPredecessors(rows,"2026-10-03","2026-10-03"),["a","b"]);
 assert.equal(JSON.stringify(rows),before);
});
test("modern active and draft contracts continue to block regardless of their dates",()=>{
 for(const status of ["active","draft"])assert.equal(historicalContractPredecessors([row({status,isHistoricalImport:false})],"2026-10-03","2026-10-03"),null);
});
test("historical draft, open, unknown, overlapping and unended terms remain blocked",()=>{
 for(const fields of [{status:"draft"},{endDate:null},{endDate:"2026-10-03"},{endDate:"2027-01-01"},{endDate:"2020-02-30"},{endDate:"not-a-date"}])assert.equal(historicalContractPredecessors([row(fields)],"2026-10-03","2026-10-03"),null);
 for(const start of [null,"2020-12-30","2020-12-31","2026-02-30"])assert.equal(historicalContractPredecessors([row()],start,"2026-10-03"),null);
 assert.equal(historicalContractPredecessors([row({endDate:"2027-01-01"})],"2028-01-01","2026-10-03"),null);
});
test("one blocker among eligible predecessors still rejects; inactive history retains existing behavior",()=>{
 assert.equal(historicalContractPredecessors([row(),row({id:"modern",isHistoricalImport:false})],"2026-10-03","2026-10-03"),null);
 assert.deepEqual(historicalContractPredecessors([row({status:"expired"}),row({status:"terminated"}),row({status:"cancelled"})],"2026-10-03","2026-10-03"),[]);
});
