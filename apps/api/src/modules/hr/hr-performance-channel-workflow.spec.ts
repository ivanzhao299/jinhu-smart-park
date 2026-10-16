import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyHrPerformanceChannelDefinition,emptyHrPerformanceWorkflowPolicy,validateHrPerformanceInputChanges,validateHrPerformanceWorkflowPolicy} from '@jinhu/shared';

test('channel changes preserve exact strings, explicit NULL and stable IDs; reject malformed authorship requests',()=>{
 const change={detailId:' stable ',field:'s',state:'VALUE',value:'9999999999999999.99',evidence:'Reviewed source'};
 validateHrPerformanceInputChanges([change]);assert.equal(change.detailId,' stable ');assert.equal(change.value,'9999999999999999.99');
 validateHrPerformanceInputChanges([{...change,detailId:null,field:'salaryReference',value:'999999999999999.9999'}]);
 validateHrPerformanceInputChanges([{...change,state:'EXPLICIT_NULL',value:null}]);
 for(const invalid of [{...change,actorUserId:'forged'},{...change,value:1},{...change,value:'1e2'},{...change,value:'10000000000000000'},{...change,value:'1.001'},{...change,evidence:'  '},{...change,state:'UNPROVIDED'},{...change,state:'EXPLICIT_NULL',value:'0'},{...change,detailId:null},{...change,field:'unknown'}])assert.throws(()=>validateHrPerformanceInputChanges([invalid]));
 assert.throws(()=>validateHrPerformanceInputChanges([change,change]));assert.throws(()=>validateHrPerformanceInputChanges([]));
});

test('workflow policy has exact complete shape and preserves distinct repeated-item details',()=>{
 const d=emptyHrPerformanceChannelDefinition(),p=emptyHrPerformanceWorkflowPolicy();d.items=[{id:'item',name:null,fullValue:null,order:null,sourceAssessmentRef:null,guides:[]}];p.detailDefinitions=[{id:'a',itemId:'item'},{id:'b',itemId:'item'}];validateHrPerformanceWorkflowPolicy(p,d);assert.equal(p.detailDefinitions.length,2);
 assert.throws(()=>validateHrPerformanceWorkflowPolicy({...p,extra:true},d));assert.throws(()=>validateHrPerformanceWorkflowPolicy({...p,detailDefinitions:[{id:'a',itemId:'absent'}]},d));assert.throws(()=>validateHrPerformanceWorkflowPolicy({...p,detailDefinitions:[p.detailDefinitions[0],p.detailDefinitions[0]]},d));assert.throws(()=>validateHrPerformanceWorkflowPolicy(p,d,true));
});
