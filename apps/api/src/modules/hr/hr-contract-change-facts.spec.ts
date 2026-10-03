import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validateSync} from "class-validator";
import {CreateHrContractChangeDto} from "./dto/hr.dto";
import {nextContractSegmentTerm,readModernContractChangeFacts,validateModernContractChangeFacts} from "./hr-contract-change-facts";

test("change DTO and direct facts reject coercion and invalid dates",()=>{
 const base={changeType:"renewal",newStartDate:"2092-01-01"};
 for(const value of [0,12,1200])assert.equal(validateSync(plainToInstance(CreateHrContractChangeDto,{...base,contractTermMonths:value})).length,0);
 for(const value of [null,"12",-1,1.5,1201])assert.ok(validateSync(plainToInstance(CreateHrContractChangeDto,{...base,contractTermMonths:value})).length);
 for(const signatureDate of [null,"","2092-02-30","2092-01-01T01:00:00Z"])assert.throws(()=>validateModernContractChangeFacts({signatureDate}));
 assert.deepEqual(validateModernContractChangeFacts({contractTermMonths:0,signatureDate:"2092-02-29"}),{contractTermMonths:0,signatureDate:"2092-02-29"});
});
test("changed dates cannot inherit a stale term, unchanged dates retain it",()=>{
 const current={startDate:"2090-01-01",endDate:"2091-12-31",contractTermMonths:24};
 assert.equal(nextContractSegmentTerm(current,{changeType:"amendment",newStartDate:"2092-01-01",newEndDate:"2092-12-31"},{}),null);
 assert.equal(nextContractSegmentTerm(current,{changeType:"amendment",newStartDate:current.startDate,newEndDate:current.endDate},{}),24);
 assert.equal(nextContractSegmentTerm({...current,endDate:null},{changeType:"renewal",newStartDate:current.startDate,newEndDate:null},{}),null);
 assert.equal(nextContractSegmentTerm(current,{changeType:"amendment",newStartDate:"2092-01-01",newEndDate:null},{contractTermMonths:0}),0);
});
test("old snapshot supplies no signature and versioned facts return only the narrow fields",()=>{
 assert.deepEqual(readModernContractChangeFacts({signedAt:"operation-time",raw:"private"}),{});
 assert.deepEqual(readModernContractChangeFacts({modernContractFacts:{version:1,contractTermMonths:12,signatureDate:"2091-12-15",raw:"private"}}),{contractTermMonths:12,signatureDate:"2091-12-15"});
 assert.throws(()=>readModernContractChangeFacts({modernContractFacts:{version:1,contractTermMonths:"12"}}));
 assert.throws(()=>readModernContractChangeFacts({modernContractFacts:{version:2}}));
});
