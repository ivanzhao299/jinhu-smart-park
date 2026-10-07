import assert from "node:assert/strict";
import { test } from "node:test";
import { validateIncrementalContractTerm } from "./hr-yuzhou-contract-terms";

test("contract import terms use formal strict integer boundaries without coercion", () => {
  for (const [field,max] of [["contractTermMonths",1200],["probationMonths",120],["renewalCount",2147483647]] as const) {
    for (const value of [0,max]) assert.equal(validateIncrementalContractTerm(field,value),true);
    for (const value of [-1,max+1,0.5,"3",true,undefined,NaN]) assert.throws(()=>validateIncrementalContractTerm(field,value));
  }
  assert.equal(validateIncrementalContractTerm("contractTermMonths",null),true);
  assert.equal(validateIncrementalContractTerm("probationMonths",null),true);
  assert.throws(()=>validateIncrementalContractTerm("renewalCount",null));
});

test("contract agreement marks preserve explicit false and reject absent/null/string values", () => {
  for (const field of ["confidentialityAgreement","nonCompeteAgreement","trainingServiceAgreement"]) {
    for (const value of [true,false]) assert.equal(validateIncrementalContractTerm(field,value),true);
    for (const value of [null,undefined,0,1,"false","true"]) assert.throws(()=>validateIncrementalContractTerm(field,value));
  }
});

test("contract signature accepts only canonical actual dates and does not claim unrelated fields", () => {
  for (const value of [null,"2024-02-29","2026-10-08"]) assert.equal(validateIncrementalContractTerm("signatureDate",value),true);
  for (const value of ["2026-02-29","2026-04-31","2026-10-08T00:00:00Z","",1,undefined]) assert.throws(()=>validateIncrementalContractTerm("signatureDate",value));
  assert.equal(validateIncrementalContractTerm("source_snapshot",{}),false);
});
