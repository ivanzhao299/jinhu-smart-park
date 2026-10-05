import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTrainingHistoryFacts,planTrainingHistoryFacts,createTrainingHistoryInTransaction } from "./hr-yuzhou-training-transaction";
const facts={courseName:"Synthetic",startDate:"2020-01-01",endDate:"2020-01-02",hours:"8"};
test("unchanged source preserves modern hours corrections",()=>{
 const plan=planTrainingHistoryFacts(facts,facts,{...facts,hours:"10"},facts);assert.equal(plan.action,"unchanged");assert.equal(plan.correctedHours,undefined);
});
test("clean hours change appends correction while same-field modern divergence conflicts",()=>{
 const changed={...facts,hours:"9"};const clean=planTrainingHistoryFacts(changed,facts,facts,facts);assert.equal(clean.action,"update");assert.equal(clean.correctedHours,"9");
 const conflict=planTrainingHistoryFacts(changed,facts,{...facts,hours:"10"},facts);assert.equal(conflict.action,"conflict");assert.deepEqual(conflict.conflictFields,["hours"]);assert.equal(conflict.correctedHours,undefined);
 const converged=planTrainingHistoryFacts(changed,facts,changed,facts);assert.equal(converged.action,"update");assert.equal(converged.correctedHours,undefined);
});
test("plan fact changes are independent revisions while unknown baselines remain conflicts",()=>{
 for(const [key,value] of [["courseName","Changed"],["startDate","2019-12-31"],["endDate","2020-01-03"]]){const plan=planTrainingHistoryFacts({...facts,[key!]:value},facts,facts,facts);assert.equal(plan.action,"update");assert.deepEqual(plan.correctedPlanFacts,{[key!]:value});}
 assert.ok(planTrainingHistoryFacts(facts,{},facts,{}).conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"));
 const modern={...facts,startDate:"2020-01-02",endDate:"2020-01-04"};
 const protectedPlan=planTrainingHistoryFacts(facts,facts,modern,facts);assert.equal(protectedPlan.action,"unchanged");
 const crossed=planTrainingHistoryFacts({...facts,endDate:"2020-01-01"},facts,modern,facts);assert.equal(crossed.action,"conflict");
 const invalidMerged=planTrainingHistoryFacts({...facts,endDate:"2020-01-01"},facts,{...facts,startDate:"2020-01-02"},facts);assert.ok(invalidMerged.conflictFields.includes("TRAINING_PLAN_FACTS_DATE_RANGE_INVALID"));
});
test("facts enforce reviewed date/hour schema without echoing rejected contents",()=>{
 for(const value of [{...facts,hours:"0"},{...facts,hours:"8.5"},{...facts,startDate:"2023-02-29"},{...facts,endDate:"2019-01-01"},{...facts,score:"88"},{...facts,courseName:"Secret\0name"}])assert.throws(()=>normalizeTrainingHistoryFacts(value),/TRAINING_IMPORT_FACTS_INVALID/);
});
test("business primitive requires an active caller transaction before writes",async()=>{
 await assert.rejects(createTrainingHistoryInTransaction({queryRunner:{isTransactionActive:false}} as never,{tenantId:"t",parkId:"p"},{sub:"",tenantId:"t",parkId:"p"} as never,"", "",facts),/TRAINING_IMPORT_TRANSACTION_REQUIRED/);
});
test("memo is independent, nullable, exact, and omission preserves older packages",()=>{
 for(const memo of [null,"","  独立备注\n原样  "])assert.equal(normalizeTrainingHistoryFacts({...facts,memo}).memo,memo);
 assert.equal(Object.hasOwn(normalizeTrainingHistoryFacts(facts),"memo"),false);
 for(const memo of [undefined,42,{},"x".repeat(2001),"bad\0note","bad\ud800"])assert.throws(()=>normalizeTrainingHistoryFacts({...facts,memo}),/FACTS_INVALID/);
 const old={...facts,memo:"原备注"};
 assert.equal(planTrainingHistoryFacts(facts,old,{...old,memo:"现代备注"},old).action,"unchanged");
 assert.equal(planTrainingHistoryFacts({...facts,memo:null},old,old,old).correctedMemo,null);
 assert.equal(planTrainingHistoryFacts({...facts,memo:""},old,old,old).correctedMemo,"");
 assert.equal(planTrainingHistoryFacts(old,old,{...old,memo:null},old).action,"unchanged");
 assert.deepEqual(planTrainingHistoryFacts({...old,memo:"来源变化"},old,{...old,memo:"现代变化"},old).conflictFields,["memo"]);
 assert.ok(planTrainingHistoryFacts({...facts,memo:null},facts,{...facts,memo:null},facts).conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"));
});
