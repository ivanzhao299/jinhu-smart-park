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
test("published snapshot changes and unknown baselines remain explicit conflicts",()=>{
 for(const [key,value] of [["courseName","Changed"],["startDate","2019-12-31"],["endDate","2020-01-03"]]){const plan=planTrainingHistoryFacts({...facts,[key!]:value},facts,facts,facts);assert.equal(plan.action,"conflict");assert.ok(plan.conflictFields.includes(`PUBLISHED_SNAPSHOT:${key}`));}
 assert.ok(planTrainingHistoryFacts(facts,{},facts,{}).conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"));
});
test("facts enforce reviewed date/hour schema without echoing rejected contents",()=>{
 for(const value of [{...facts,hours:"0"},{...facts,hours:"8.5"},{...facts,startDate:"2023-02-29"},{...facts,endDate:"2019-01-01"},{...facts,score:"88"},{...facts,courseName:"Secret\0name"}])assert.throws(()=>normalizeTrainingHistoryFacts(value),/TRAINING_IMPORT_FACTS_INVALID/);
});
test("business primitive requires an active caller transaction before writes",async()=>{
 await assert.rejects(createTrainingHistoryInTransaction({queryRunner:{isTransactionActive:false}} as never,{tenantId:"t",parkId:"p"},{sub:"",tenantId:"t",parkId:"p"} as never,"", "",facts),/TRAINING_IMPORT_TRANSACTION_REQUIRED/);
});
