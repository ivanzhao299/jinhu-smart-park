import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTrainingCarriageReadonlySql,sanitizeTrainingCarriageObservation} from '../diagnose-production-runtime-revision.mjs';
const fixture={operationBound:true,trainingSourceCount:0,historySourceCount:2,mappedHistorySourceCount:2,historyArchiveCount:2,formalPlanCount:0,formalParticipantCount:0,formalCompletedParticipantCount:0,formalParticipantsWithScoreCount:0,formalParticipantsWithCostCount:0,sourceBoundProjectionCount:0,sourceBoundLiveProjectionCount:0};
test('carriage counts describe missing formal projection without claiming business acceptance',()=>{
 const result=sanitizeTrainingCarriageObservation(JSON.stringify(fixture));
 assert.equal(result.status,'PASS'); assert.equal(result.businessAcceptance,false); assert.equal(result.productionWrites,false); assert.equal(result.sourceFieldsDecrypted,false);
 assert.equal(result.formalPlanCount,0); assert.equal(result.historyArchiveCount,2);
});
test('rejects unexpected private rows, malformed counts and impossible relations',()=>{
 for(const value of [{...fixture,employeeId:'private'},{...fixture,historyArchiveCount:3},{...fixture,mappedHistorySourceCount:3},{...fixture,sourceBoundLiveProjectionCount:1},{...fixture,formalParticipantsWithScoreCount:1},{...fixture,formalPlanCount:-1},{...fixture,formalPlanCount:1.5}]) assert.throws(()=>sanitizeTrainingCarriageObservation(JSON.stringify(value)),/TRAINING_CARRIAGE_RESULT_INVALID/);
 assert.equal(sanitizeTrainingCarriageObservation(JSON.stringify({...fixture,operationBound:false})).status,'FAIL');
});
test('query uses exact source linkage in a bounded read-only transaction without payload decryption',()=>{
 const sql=buildTrainingCarriageReadonlySql();
 assert.match(sql,/ISOLATION LEVEL REPEATABLE READ READ ONLY/); assert.match(sql,/statement_timeout='30s'/); assert.match(sql,/ROLLBACK;\s*$/);
 assert.match(sql,/s.source_row_sha256=p.source_row_sha256/); assert.match(sql,/s.operation_id=r.operation_id/);
 assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE)\b/im); assert.doesNotMatch(sql,/\b(?:decrypt|record_payload|restricted_safe_projection)\b/i);
});
