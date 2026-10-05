import assert from "node:assert/strict";
import test from "node:test";
import { trainingPlanFactsPayload } from "./training/TrainingPlanFactsForm";
test('plan facts form omits unchanged fields and unpermitted title, retaining revision fence',()=>{
 const current={courseTitle:'Current',startDate:'2026-10-01',endDate:'2026-10-02',factRevision:4};
 const form=new FormData();form.set('courseName',' Current ');form.set('startDate',current.startDate);form.set('endDate',current.endDate);form.set('reason',' revised ');
 assert.deepEqual(trainingPlanFactsPayload(form,current,true),{expectedRevision:4,reason:'revised'});
 form.set('courseName','Updated');form.set('startDate','2026-09-30');
 assert.deepEqual(trainingPlanFactsPayload(form,current,false),{expectedRevision:4,reason:'revised',startDate:'2026-09-30'});
 assert.deepEqual(trainingPlanFactsPayload(form,current,true),{expectedRevision:4,reason:'revised',courseName:'Updated',startDate:'2026-09-30'});
});
