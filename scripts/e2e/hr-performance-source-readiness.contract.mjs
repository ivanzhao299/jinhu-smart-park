import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sourceFamilies,familyCountKeys,masterCountKeys,ledgerCountKeys,formalCountKeys,performanceSourceReadinessSql,validPerformanceSourceReadiness,parsePerformanceSourceReadiness,diagnosePerformanceSourceReadiness } from '../diagnose-hr-performance-source-readiness.mjs';
const zero=keys=>Object.fromEntries(keys.map(k=>[k,0]));
const empty=()=>({sources:Object.fromEntries(sourceFamilies.map(([k])=>[k,zero(familyCountKeys)])),master:zero(masterCountKeys),dimensionSubjectActiveEmployeeCount:0,ledgers:zero(ledgerCountKeys),formal:zero(formalCountKeys),scopedSourceFactsSha256:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'});
const observe=v=>diagnosePerformanceSourceReadiness('/synthetic',()=>JSON.stringify(v));
test('strict fixed aggregate shape keeps formal continuation UNVERIFIED',()=>{
 const v=empty();assert.ok(validPerformanceSourceReadiness(v));
 const out=diagnosePerformanceSourceReadiness('/synthetic',(command,args,options)=>{
 assert.equal(command,'docker');assert.deepEqual(args.slice(0,7),['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T']);
 assert.equal(options.cwd,'/synthetic');assert.equal(options.input,performanceSourceReadinessSql);assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,16384);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);return JSON.stringify(v);
 });
 assert.equal(out.formalContinuationReadiness,'UNVERIFIED');assert.equal(out.productionBusinessWrites,0);
 assert.deepEqual(Object.keys(out),['kind',...Object.keys(v),'formalContinuationReadiness','productionBusinessWrites']);
 const full=empty();for(const group of Object.values(full.sources))Object.assign(group,{rawCount:2,visibleCount:2,exactMapCount:2,mapGapCount:0});
 Object.assign(full.master,{resolutionPresentCount:2,personResolvedCount:2,detailResolvedCount:2,bothResolvedCount:2,bothResolvedMatchedCount:2,exactVisibleMatchedCount:2,subjectActiveEmployeeCount:2,formalReviewLinkCount:2,formalTemplateVersionLinkCount:2});
 Object.assign(full.ledgers,{relations308Count:1,relations308SucceededCount:1,facts310Count:1,facts310SucceededCount:1,assessment309Count:1,assessment309SucceededCount:1});
 assert.equal(observe(full).formalContinuationReadiness,'UNVERIFIED','Even matching observed counters never qualify complete source/math');
});
test('rejects missing/extra/private keys and every non-safe count',()=>{
 const bad=v=>assert.throws(()=>observe(v),/HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID/);
 for(const key of Object.keys(empty())) {const v=empty();delete v[key];bad(v);}
 bad({...empty(),privateRow:'forbidden'});bad({...empty(),sources:[]});bad({...empty(),master:null});
 for(const [group,keys] of [['master',masterCountKeys],['ledgers',ledgerCountKeys],['formal',formalCountKeys],...sourceFamilies.map(([family])=>[`sources.${family}`,familyCountKeys])]) {
 for(const key of keys)for(const invalid of [-1,1.1,Number.MAX_SAFE_INTEGER+1,'0',null,true]) {const v=empty(),target=group.startsWith('sources.')?v.sources[group.split('.')[1]]:v[group];target[key]=invalid;bad(v);}
 const v=empty(),target=group.startsWith('sources.')?v.sources[group.split('.')[1]]:v[group];target.unknown=0;bad(v);
 }
 for(const hash of ['',null,'A'.repeat(64),'a'.repeat(63),'x'.repeat(64)])bad({...empty(),scopedSourceFactsSha256:hash});
 for(const raw of ['null','[]','{}','private database error','{"bad\\q":0}',JSON.stringify(empty()).replace('"rawCount":0','"rawCount":0,"rawCount":0'),JSON.stringify(empty()).replace('"rawCount":0','"rawCount":0,"raw\\u0043ount":0')])assert.throws(()=>parsePerformanceSourceReadiness(raw),/RESULT_INVALID/);
});
test('cross-count partitions and subset inequalities fail closed',()=>{
 const rich=empty();Object.assign(rich.sources.masterResult,{rawCount:4,visibleCount:4,exactMapCount:4,mapGapCount:0});Object.assign(rich.master,{resolutionPresentCount:4,personResolvedCount:3,personUnresolvedCount:1,detailResolvedCount:3,detailUnresolvedCount:1,detailUnmatchedCount:1,bothResolvedCount:2,bothResolvedMatchedCount:2});assert.ok(validPerformanceSourceReadiness(rich));rich.master.bothResolvedCount=1;rich.master.bothResolvedMatchedCount=1;assert.equal(validPerformanceSourceReadiness(rich),false,'Resolved intersection has a lower as well as upper bound');
 const mutations=[v=>v.sources.masterResult.visibleCount=1,v=>v.sources.masterResult.exactMapCount=1,v=>v.sources.masterResult.mapGapCount=1,v=>v.master.resolutionPresentCount=1,v=>v.master.resolutionMissingCount=1,v=>v.master.personResolvedCount=1,v=>v.master.detailResolvedCount=1,v=>v.master.personAmbiguousCount=1,v=>v.master.detailUnmatchedCount=1,v=>v.master.bothResolvedMatchedCount=1,v=>v.master.exactVisibleMatchedCount=1,v=>v.master.subjectActiveEmployeeCount=1,v=>v.master.formalReviewLinkCount=1,v=>v.dimensionSubjectActiveEmployeeCount=1,v=>v.formal.legacyTemplateVersionLinkCount=1,v=>v.formal.fiveChannelPublishedVersionCount=1,...['relations308','facts310','assessment309'].map(prefix=>v=>v.ledgers[`${prefix}SucceededCount`]=1)];
 for(const mutate of mutations){const v=empty();mutate(v);assert.equal(validPerformanceSourceReadiness(v),false);}
});
test('bounded read-only SQL has exact maps, separate receipts, no helper calls and no personal projection',()=>{
 assert.match(performanceSourceReadinessSql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(performanceSourceReadinessSql,/statement_timeout='5s'/);assert.match(performanceSourceReadinessSql,/lock_timeout='2s'/);assert.match(performanceSourceReadinessSql,/ROLLBACK;$/);
 assert.doesNotMatch(performanceSourceReadinessSql.replace(/'(?:''|[^'])*'/g,"''"),/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|FOR SHARE|FOR UPDATE)\b/i);
 assert.doesNotMatch(performanceSourceReadinessSql,/\bhr_[a-z0-9_]+\s*\(/i);
 for(const [,table,source] of sourceFamilies){assert.match(performanceSourceReadinessSql,new RegExp(table));assert.ok(performanceSourceReadinessSql.includes(source));}
 assert.match(performanceSourceReadinessSql,/m.source_identity_sha256=f.source_identity_sha256 AND m.source_row_sha256=f.source_row_sha256/);
 assert.match(performanceSourceReadinessSql,/parent_relations_receipt_sha256=parent.receipt_sha256/);assert.match(performanceSourceReadinessSql,/HAVING count\(\*\)=1/);
 assert.match(performanceSourceReadinessSql,/person_resolution_status='resolved' AND r.detail_resolution_status='resolved' AND r.comparison_status='matched'/);
 const final=performanceSourceReadinessSql.split('SELECT json_build_object(').at(-1);assert.doesNotMatch(final,/source_person_code|source_total_value|source_pay|source_assessment_name/);
});
test('transport failures use only fixed codes and SSH stdin is self-contained',()=>{
 assert.throws(()=>diagnosePerformanceSourceReadiness('relative'),/PATH_INVALID/);
 assert.throws(()=>diagnosePerformanceSourceReadiness('/synthetic',()=>{throw new Error('private SQL/password');}),/^Error: HR_PERFORMANCE_SOURCE_READINESS_PROBE_FAILED$/);
 assert.throws(()=>diagnosePerformanceSourceReadiness('/synthetic',()=>'{bad'),/^Error: HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID$/);
 const module=readFileSync(new URL('../diagnose-hr-performance-source-readiness.mjs',import.meta.url),'utf8');
 assert.ok([...module.matchAll(/from '([^']+)'/g)].every(m=>m[1].startsWith('node:')));
 const failed=execFileSync(process.execPath,['--input-type=module','-','/synthetic'],{input:module.replace('run=execFileSync','run=()=>{throw new Error("private stderr")}').replace('process.exitCode=1','process.exitCode=0'),encoding:'utf8',stdio:['pipe','pipe','pipe']});assert.equal(failed,'');
});
test('workflow defaults false, is runtime-only, masks errors and retains success artifact',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 const input=workflow.split('      diagnose_performance_source_readiness:')[1].split('      payroll_coverage_month:')[0];assert.match(input,/default: false/);assert.match(input,/type: boolean/);
 const step=workflow.split('      - name: Diagnose HR performance source readiness counts (read-only)')[1].split('      - name:')[0];
 assert.match(step,/inputs.deploy_mode == 'diagnose-production-runtime-revision' && inputs.diagnose_performance_source_readiness/);assert.match(step,/node --input-type=module -/);assert.match(step,/< scripts\/diagnose-hr-performance-source-readiness.mjs/);assert.match(step,/HR_PERFORMANCE_SOURCE_READINESS_REMOTE_FAILED/);assert.doesNotMatch(step,/prod:deploy|db:migrate|db:seed|console\.log/);
 const artifact=workflow.split('      - name: Retain HR performance source readiness observation')[1].split('      - name:')[0];assert.match(artifact,/&& success\(\)/);assert.match(artifact,/hr-performance-source-readiness-observation.json/);assert.match(artifact,/if-no-files-found: error/);
 assert.match(workflow,/diagnose-production-runtime-revision[\s\S]*ops-only/);
});
