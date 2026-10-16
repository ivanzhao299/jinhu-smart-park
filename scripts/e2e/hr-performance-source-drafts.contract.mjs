import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import shared from '../../packages/shared/dist/index.js';
const {applyHrPerformanceSourcePatch,validateHrPerformanceSourceValue,emptyHrPerformanceChannelDefinition,emptyHrPerformanceWorkflowPolicy}=shared;

test('source numeric strings retain exact precision, reject overflow/type/nonfinite',()=>{
 for(const [f,k,v] of [['master_result','source_pay','999999999999999.9999'],['master_result','source_m_item_value','999999999999999999'],['dimension_profile','source_full_value','9999999999999999.99'],['template_profile','source_s_percent','-2147483648']])assert.doesNotThrow(()=>validateHrPerformanceSourceValue(f,k,v));
 for(const v of ['1000000000000000.0000','1.00001','Infinity','1e2',1,{},true])assert.throws(()=>validateHrPerformanceSourceValue('master_result','source_pay',v));
 assert.throws(()=>validateHrPerformanceSourceValue('template_profile','source_s_percent','2147483648'));
});

test('closed changes preserve identities/hidden values and validate resulting definition/workflow pair',()=>{
 const id=randomUUID(),snapshot={schemaVersion:1,records:[{family:'master_result',identitySha256:'a'.repeat(64),sourceFactId:id,values:{source_pay:'999999999999999.9999',source_appraisal:null,source_total_value:'80.00'}}],binding:{employeeId:null,orgId:null,startDate:null,endDate:null,businessPeriodRef:null},definition:null,workflow:null};
 const change={family:'master_result',sourceFactId:id,field:'source_appraisal',value:'New comment'};
 const patch={expectedRevisionId:randomUUID(),reason:'Human change',changes:[change]};const next=applyHrPerformanceSourcePatch(snapshot,patch);assert.equal(next.records[0].values.source_pay,snapshot.records[0].values.source_pay);assert.equal(snapshot.records[0].values.source_appraisal,null);
 for(const changes of [[change,change],[{...change,field:'source_total_value'}],[{...change,sourceFactId:randomUUID()}],[{...change,value:null}],[{...change,extra:true}]])assert.throws(()=>applyHrPerformanceSourcePatch(snapshot,{...patch,changes}));
 assert.throws(()=>applyHrPerformanceSourcePatch(snapshot,{...patch,workflow:emptyHrPerformanceWorkflowPolicy()}));
 const configured=applyHrPerformanceSourcePatch(snapshot,{...patch,definition:emptyHrPerformanceChannelDefinition(),workflow:emptyHrPerformanceWorkflowPolicy()});assert.throws(()=>applyHrPerformanceSourcePatch(configured,{...patch,definition:null}));assert.equal(applyHrPerformanceSourcePatch(configured,{...patch,changes:undefined,definition:null,workflow:null}).definition,null);
 assert.throws(()=>applyHrPerformanceSourcePatch(snapshot,{...patch,binding:{...snapshot.binding,startDate:'2020-02-30'}}));
});

test('JSON object key order alone cannot create a human revision',()=>{
 const binding={employeeId:null,orgId:null,startDate:null,endDate:null,businessPeriodRef:null},definition=emptyHrPerformanceChannelDefinition(),workflow=emptyHrPerformanceWorkflowPolicy();
 const snapshot={schemaVersion:1,records:[],binding,definition,workflow};
 const reverse=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(reverse):Object.fromEntries(Object.entries(v).reverse().map(([k,value])=>[k,reverse(value)]))):v;
 for(const part of ['binding','definition','workflow'])assert.throws(()=>applyHrPerformanceSourcePatch(snapshot,{expectedRevisionId:randomUUID(),reason:'Reordered keys',[part]:reverse(snapshot[part])}));
});
