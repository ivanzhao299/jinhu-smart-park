import assert from 'node:assert/strict';
import test from 'node:test';
import shared from '../../packages/shared/dist/index.js';
const {emptyHrPerformanceChannelDefinition,emptyHrPerformanceWorkflowPolicy,emptyHrPerformanceChannelInput,validateHrPerformanceWorkflowPolicy,validateHrPerformanceInputChanges,performanceInputPolicy}=shared;
const definition=()=>{const d=emptyHrPerformanceChannelDefinition();d.items=[{id:'item',name:null,fullValue:null,order:null,sourceAssessmentRef:null,guides:[]}];return d;};
const policy=()=>{const p=emptyHrPerformanceWorkflowPolicy();p.detailDefinitions=[{id:'detail1',itemId:'item'},{id:'detail2',itemId:'item'}];return p;};
test('optional paired appraisal policy preserves exact legacy JSON and independent cells',()=>{
 const d=definition(),w=policy(),before=JSON.stringify(w),old=emptyHrPerformanceChannelInput(w);validateHrPerformanceWorkflowPolicy(w,d);assert.equal(JSON.stringify(w),before);assert.ok(old.details.every(x=>!Object.hasOwn(x,'appraisal')));
 const enabled={...w,detailAppraisalPolicy:{stage:null,allowedActors:[],required:null,allowExplicitNull:null},appealReviewAllowed:{...w.appealReviewAllowed,detailAppraisal:null}};
 validateHrPerformanceWorkflowPolicy(enabled,d);assert.throws(()=>validateHrPerformanceWorkflowPolicy(enabled,d,true));const input=emptyHrPerformanceChannelInput(enabled);assert.equal(input.details.length,2);assert.notEqual(input.details[0].appraisal,input.details[1].appraisal);assert.equal(input.details[0].appraisal.state,'UNPROVIDED');assert.deepEqual(performanceInputPolicy(d,enabled,'detailAppraisal'),enabled.detailAppraisalPolicy);
 const withoutAppeal=structuredClone(enabled);delete withoutAppeal.appealReviewAllowed.detailAppraisal;assert.throws(()=>validateHrPerformanceWorkflowPolicy(withoutAppeal,d));const withoutPolicy=structuredClone(enabled);delete withoutPolicy.detailAppraisalPolicy;assert.throws(()=>validateHrPerformanceWorkflowPolicy(withoutPolicy,d));assert.throws(()=>validateHrPerformanceWorkflowPolicy({...enabled,detailAppraisalPolicy:{...enabled.detailAppraisalPolicy,extra:true}},d));
});
test('detail appraisal changes use independent detail identity and max200 Unicode codepoints',()=>{
 const c={detailId:'detail1',field:'detailAppraisal',state:'VALUE',value:'😀'.repeat(200),evidence:'Explicit evidence'};validateHrPerformanceInputChanges([c,{...c,detailId:'detail2',value:''}]);validateHrPerformanceInputChanges([{...c,state:'EXPLICIT_NULL',value:null}]);
 for(const changes of [[{...c,value:'😀'.repeat(201)}],[{...c,detailId:null}],[{...c,value:1}],[c,c],[{...c,actorUserId:'forged'}],[{...c,field:'unknown'}]])assert.throws(()=>validateHrPerformanceInputChanges(changes));
});
