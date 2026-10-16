import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { sourceFamilies,performanceSourceReadinessSql,diagnosePerformanceSourceReadiness } from '../diagnose-hr-performance-source-readiness.mjs';

const enabled=process.env.HR_PERFORMANCE_SOURCE_READINESS_PG==='1';
function removeOwned(name,owner,run) {
 let label;
 try { label=run(['inspect','--format','{{index .Config.Labels "codex.hr-performance-readiness-owner"}}',name]).trim(); }
 catch(error) { if(run(['ps','-aq','--filter',`name=^/${name}$`]).trim()!=='')throw error;return; }
 assert.equal(label,owner,'Never remove a container without exact ownership');
 const mounts=JSON.parse(run(['inspect','--format','{{json .Mounts}}',name]));
 const tmpfs=JSON.parse(run(['inspect','--format','{{json .HostConfig.Tmpfs}}',name]));
 const volumes=mounts.filter(m=>m.Type==='volume').map(m=>m.Name);
 run(['rm','-fv',name]);
 assert.equal(run(['ps','-aq','--filter',`name=^/${name}$`]).trim(),'');
 for(const volume of volumes)assert.equal(run(['volume','ls','-q','--filter',`name=^${volume}$`]).trim(),'');
 assert.equal(run(['volume','ls','-q','--filter',`label=codex.hr-performance-readiness-owner=${owner}`]).trim(),'');
 assert.ok(tmpfs&&Object.hasOwn(tmpfs,'/var/lib/postgresql/data'),'Owned database uses tmpfs');
 console.log(`Owned tmpfs PostgreSQL removed; container/associated volumes absent: ${name}`);
}
test('complete observer SQL on owned PostgreSQL query-projection fixtures (not full-schema guards)',{skip:!enabled},async()=>{
 const owner=randomUUID(),name=`hr-performance-readiness-${owner}`;
 const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['pipe','pipe','pipe']});
 const sql=text=>run(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],text).trim();
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const hash=c=>c.repeat(64),code='c'.repeat(40),S='10000001',P='20000001';
 const literal=v=>v===null?'NULL':typeof v==='boolean'||typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>sql(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`);
 const observe=()=>diagnosePerformanceSourceReadiness('/synthetic-owned-pg',()=>sql(performanceSourceReadinessSql));
 const frow=(n,tenant=S,park=P)=>({id:id(n),tenant_id:tenant,park_id:park,migration_batch_id:id(100),legacy_record_map_id:id(n+1000),source_identity_sha256:hash('a'),source_row_sha256:hash('b')});
 const binding={code_sha:code,source_snapshot_sha256:hash('d'),mapping_contract_sha256:hash('e'),target_identity_sha256:hash('f'),target_scope_sha256:hash('1')};
 const ledger={operation_id:'import-1',migration_batch_id:id(100),tenant_id:S,park_id:P,...binding,t0_phase_receipt_sha256:hash('2'),status:'succeeded',receipt_sha256:hash('3')};
 try {
  run(['run','-d','--name',name,'--label',`codex.hr-performance-readiness-owner=${owner}`,'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD=synthetic-local-only','postgres:16-alpine']);
  let ready=false;for(let i=0;i<100;i++){try{run(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}
  assert.ok(ready,'Required owned PostgreSQL must start; no shared fallback or skip');
  // Minimal projections expose every column read by the complete SQL. They intentionally
  // omit application guards, approved migration manifests and business source values.
  sql(`CREATE EXTENSION pgcrypto;
   CREATE TABLE migration_batch(id uuid,source_system text,execution_context text,status text,production_import_phase text,target_database text,source_snapshot_sha256 char(64),production_import_operation_id text);
   CREATE TABLE legacy_record_map(id uuid,batch_id uuid,source_system text,source_table text,source_pk_canonical text,source_identity_sha256 char(64),source_row_sha256 char(64),target_table text,target_id uuid,mapping_status text,is_active boolean);
   CREATE TABLE hr_performance_legacy_ass_compute_weight_resolution(legacy_master_result_id uuid,tenant_id text,park_id text,migration_batch_id uuid,person_resolution_status text,detail_resolution_status text,comparison_status text);
   CREATE TABLE hr_performance_legacy_identity_resolution(fact_kind text,legacy_master_result_id uuid,legacy_dimension_result_id uuid,tenant_id text,park_id text,migration_batch_id uuid,person_role text,person_resolution_status text,source_person_identity_sha256 char(64),owner_t0_record_map_id uuid,target_employee_id uuid);
   CREATE TABLE hr_employee(id uuid,tenant_id text,park_id text,is_deleted boolean);
   CREATE TABLE hr_yuzhou_production_import_projection_receipt(legacy_record_map_id uuid,phase text,operation_id text,source_identity_sha256 char(64),migration_batch_id uuid);
   CREATE TABLE hr_yuzhou_production_import_record(operation_id text,phase text,source_identity_sha256 char(64),source_system text,source_table text,source_pk_canonical text,target_table text,target_id uuid,disposition text,rollback_status text);
   CREATE TABLE hr_yuzhou_production_import_phase(operation_id text,phase text,status text,after_canonical_sha256 char(64));
   CREATE TABLE hr_yuzhou_production_import_operation(operation_id text,intent text,status text,execution_contract_version integer,target_tenant_id text,target_park_id text,code_sha char(40),source_snapshot_sha256 char(64),mapping_contract_sha256 char(64),target_identity_sha256 char(64),target_scope_sha256 char(64));
   CREATE TABLE hr_performance_template_version(id uuid,template_id uuid,tenant_id text,park_id text,calculation_mode text,status text);
   CREATE TABLE hr_performance_cycle_employee(id uuid,tenant_id text,park_id text,cycle_id uuid);
   CREATE TABLE hr_performance_review_cycle(id uuid,tenant_id text,park_id text);
   CREATE TABLE hr_performance_channel_definition_revision(id uuid,tenant_id text,park_id text);
   CREATE TABLE hr_performance_channel_input_revision(id uuid,tenant_id text,park_id text);
   CREATE TABLE hr_yuzhou_performance_relations_production_receipt(operation_id text,migration_batch_id uuid,tenant_id text,park_id text,code_sha char(40),source_snapshot_sha256 char(64),mapping_contract_sha256 char(64),target_identity_sha256 char(64),target_scope_sha256 char(64),t0_phase_receipt_sha256 char(64),status text,receipt_sha256 char(64),rollback_operation_id text,rollback_receipt_sha256 char(64),rolled_back_at timestamptz);
   CREATE TABLE hr_yuzhou_performance_fact_identity_production_receipt(LIKE hr_yuzhou_performance_relations_production_receipt);
   ALTER TABLE hr_yuzhou_performance_fact_identity_production_receipt ADD COLUMN parent_relations_receipt_sha256 char(64),ADD COLUMN extension_rollback_nonce_sha256 char(64);
   CREATE TABLE hr_yuzhou_performance_person_assessment_operation(operation_id text,parent_import_operation_id text,migration_batch_id uuid,target_tenant_id text,target_park_id text,code_sha char(40),source_snapshot_sha256 char(64),mapping_contract_sha256 char(64),target_identity_sha256 char(64),target_scope_sha256 char(64),t0_artifact_sha256 char(64),status text,applied_state_sha256 char(64),rolled_back_at timestamptz);`);
  for(const [,table] of sourceFamilies)sql(`CREATE TABLE ${table}(id uuid,tenant_id text,park_id text,migration_batch_id uuid,legacy_record_map_id uuid,source_identity_sha256 char(64),source_row_sha256 char(64),source_person_code text,target_cycle_employee_id uuid,target_template_version_id uuid,target_template_id uuid);`);
  const empty=observe();assert.ok(Object.values(empty.sources).every(v=>Object.values(v).every(n=>n===0)));assert.ok(Object.values(empty.master).every(n=>n===0));assert.ok(Object.values(empty.ledgers).every(n=>n===0));assert.ok(Object.values(empty.formal).every(n=>n===0));
  assert.equal(empty.scopedSourceFactsSha256,createHash('sha256').update('[]').digest('hex'));
  insert('migration_batch',{id:id(100),source_system:'yuzhou-v10',execution_context:'production_import',status:'succeeded',production_import_phase:'T0',target_database:'postgres',source_snapshot_sha256:binding.source_snapshot_sha256,production_import_operation_id:'import-1'});
  for(const [i,[,table,source]] of sourceFamilies.entries()) {
   insert(table,{...frow(i+1),source_person_code:' person-1 '});
   insert('legacy_record_map',{id:id(i+1001),batch_id:id(100),source_system:'yuzhou-v10',source_table:source,source_identity_sha256:hash('a'),source_row_sha256:hash('b'),target_table:table,target_id:id(i+1),mapping_status:'verified',is_active:true});
  }
  const populated=observe();for(const v of Object.values(populated.sources))assert.deepEqual(v,{rawCount:1,visibleCount:1,exactMapCount:1,mapGapCount:0});
  assert.equal(populated.master.resolutionMissingCount,1);
  const tuples=sourceFamilies.map(([kind],i)=>[kind,id(i+1),id(100),id(i+1001),hash('a'),hash('b')]).sort((a,b)=>a[0]<b[0]?-1:1);
  const canonical='['+tuples.map(tuple=>'['+tuple.map(v=>JSON.stringify(v)).join(', ')+']').join(', ')+']';
  assert.equal(populated.scopedSourceFactsSha256,createHash('sha256').update(canonical).digest('hex'),'Independent known raw tuple digest');
  for(const [i,[,table]] of sourceFamilies.entries()){insert(table,frow(i+101,'foreign',P));insert(table,frow(i+201,S,'foreign'));}
  assert.deepEqual(observe(),populated,'Foreign tenant/park facts cannot affect any raw count or hash');
  sql(`UPDATE legacy_record_map SET source_row_sha256='${hash('9')}' WHERE id='${id(1001)}';`);
  assert.deepEqual(observe().sources.templateProfile,{rawCount:1,visibleCount:1,exactMapCount:0,mapGapCount:1});
  assert.equal(observe().scopedSourceFactsSha256,populated.scopedSourceFactsSha256,'Map state is not part of raw-fact digest');
  sql(`UPDATE legacy_record_map SET source_row_sha256='${hash('b')}',source_table='wrong' WHERE id='${id(1001)}';`);assert.equal(observe().sources.templateProfile.exactMapCount,0);
  sql(`UPDATE legacy_record_map SET source_table='dbo.assessmentcode',batch_id='${id(999)}' WHERE id='${id(1001)}';`);assert.equal(observe().sources.templateProfile.visibleCount,0);
  sql(`UPDATE legacy_record_map SET batch_id='${id(100)}',mapping_status='loaded' WHERE id='${id(1001)}';`);assert.equal(observe().sources.templateProfile.visibleCount,0);
  sql(`UPDATE legacy_record_map SET mapping_status='verified',is_active=false WHERE id='${id(1001)}';`);assert.equal(observe().sources.templateProfile.exactMapCount,0);
  sql(`UPDATE legacy_record_map SET is_active=true WHERE id='${id(1001)}';UPDATE migration_batch SET status='failed';`);for(const v of Object.values(observe().sources))assert.equal(v.visibleCount,0);
  sql(`UPDATE migration_batch SET status='succeeded';UPDATE hr_performance_legacy_level_rule SET source_row_sha256='${hash('8')}' WHERE id='${id(2)}';`);assert.notEqual(observe().scopedSourceFactsSha256,populated.scopedSourceFactsSha256);
  sql(`UPDATE hr_performance_legacy_level_rule SET source_row_sha256='${hash('b')}' WHERE id='${id(2)}';`);assert.equal(observe().scopedSourceFactsSha256,populated.scopedSourceFactsSha256);
  // Reinsert in reverse order: digest is independent of physical scan order.
  sql('CREATE TEMP TABLE ordered_copy AS SELECT * FROM hr_performance_legacy_level_rule;DELETE FROM hr_performance_legacy_level_rule;INSERT INTO hr_performance_legacy_level_rule SELECT * FROM ordered_copy ORDER BY id DESC;');assert.equal(observe().scopedSourceFactsSha256,populated.scopedSourceFactsSha256);
  const resolution={legacy_master_result_id:id(6),tenant_id:S,park_id:P,migration_batch_id:id(100),person_resolution_status:'resolved',detail_resolution_status:'resolved',comparison_status:'matched'};
  insert('hr_performance_legacy_ass_compute_weight_resolution',{...resolution,tenant_id:'foreign'});assert.equal(observe().master.resolutionMissingCount,1);
  insert('hr_performance_legacy_ass_compute_weight_resolution',resolution);let m=observe().master;
  assert.equal(m.resolutionMissingCount,0);assert.equal(m.personResolvedCount,1);assert.equal(m.detailResolvedCount,1);assert.equal(m.bothResolvedMatchedCount,1);assert.equal(m.exactVisibleMatchedCount,1);
  insert('hr_performance_legacy_ass_compute_weight_resolution',resolution);assert.deepEqual(observe().master,m,'Duplicate identical joins do not multiply masters');
  sql(`UPDATE hr_performance_legacy_ass_compute_weight_resolution SET comparison_status='mismatch' WHERE tenant_id='${S}';`);m=observe().master;assert.equal(m.bothResolvedMatchedCount,0);assert.equal(m.bothResolvedMismatchCount,1);
  sql(`UPDATE hr_performance_legacy_ass_compute_weight_resolution SET person_resolution_status='evidence_ambiguous',detail_resolution_status='ambiguous',comparison_status='not_comparable' WHERE tenant_id='${S}';`);m=observe().master;assert.equal(m.personAmbiguousCount,1);assert.equal(m.detailAmbiguousCount,1);assert.equal(m.bothResolvedCount,0);
  sql(`UPDATE hr_performance_legacy_ass_compute_weight_resolution SET person_resolution_status='template_unmatched',detail_resolution_status='unmatched' WHERE tenant_id='${S}';`);m=observe().master;assert.equal(m.personUnmatchedCount,1);assert.equal(m.detailUnmatchedCount,1);
  sql(`UPDATE hr_performance_legacy_ass_compute_weight_resolution SET person_resolution_status='resolved',detail_resolution_status='resolved',comparison_status='matched' WHERE tenant_id='${S}';`);
  // Three layers remain separate. They observe current binding/status, not a complete
  // approved manifest or mathematical/evidence replay qualification.
  insert('hr_yuzhou_production_import_operation',{operation_id:'import-1',intent:'production_import',status:'succeeded',execution_contract_version:2,target_tenant_id:S,target_park_id:P,...binding});
  insert('hr_yuzhou_production_import_phase',{operation_id:'import-1',phase:'T0',status:'succeeded',after_canonical_sha256:hash('2')});
  insert('hr_yuzhou_performance_relations_production_receipt',ledger);
  insert('hr_yuzhou_performance_fact_identity_production_receipt',{...ledger,parent_relations_receipt_sha256:hash('3')});
  insert('hr_yuzhou_performance_person_assessment_operation',{operation_id:'assessment-1',parent_import_operation_id:'import-1',migration_batch_id:id(100),target_tenant_id:S,target_park_id:P,...binding,t0_artifact_sha256:hash('2'),status:'succeeded',applied_state_sha256:hash('4')});
  insert('hr_yuzhou_performance_relations_production_receipt',{...ledger,tenant_id:'foreign'});insert('hr_yuzhou_performance_fact_identity_production_receipt',{...ledger,park_id:'foreign'});
  assert.deepEqual(observe().ledgers,{relations308Count:1,relations308SucceededCount:1,facts310Count:1,facts310SucceededCount:1,assessment309Count:1,assessment309SucceededCount:1});
  sql(`UPDATE hr_yuzhou_performance_fact_identity_production_receipt SET rollback_operation_id='rollback';`);assert.equal(observe().ledgers.facts310SucceededCount,0);assert.equal(observe().ledgers.relations308SucceededCount,1);
  sql(`UPDATE hr_yuzhou_performance_fact_identity_production_receipt SET rollback_operation_id=NULL,parent_relations_receipt_sha256='${hash('0')}';`);assert.equal(observe().ledgers.facts310SucceededCount,0);
  sql(`UPDATE hr_yuzhou_performance_fact_identity_production_receipt SET parent_relations_receipt_sha256='${hash('3')}';UPDATE hr_yuzhou_performance_person_assessment_operation SET status='rolled_back',rolled_back_at=now();`);assert.equal(observe().ledgers.assessment309SucceededCount,0);assert.equal(observe().ledgers.facts310SucceededCount,1);
  sql(`UPDATE hr_yuzhou_performance_person_assessment_operation SET status='succeeded',rolled_back_at=NULL;UPDATE hr_yuzhou_performance_relations_production_receipt SET status='rolled_back';`);assert.equal(observe().ledgers.relations308SucceededCount,0);assert.equal(observe().ledgers.facts310SucceededCount,0);assert.equal(observe().ledgers.assessment309SucceededCount,0);
  sql(`UPDATE hr_yuzhou_performance_relations_production_receipt SET status='succeeded';UPDATE hr_yuzhou_production_import_operation SET target_park_id='foreign';`);assert.equal(observe().ledgers.relations308SucceededCount,0);
  sql(`UPDATE hr_yuzhou_production_import_operation SET target_park_id='${P}';UPDATE migration_batch SET source_snapshot_sha256='${hash('0')}';`);assert.equal(observe().ledgers.relations308SucceededCount,0);
  sql(`UPDATE migration_batch SET source_snapshot_sha256='${hash('d')}';`);
  // T0 subject identity: exact SHA, unique candidate, verified owner and live scope.
  const personHash=createHash('sha256').update(Buffer.concat([Buffer.from('dbo.person'),Buffer.from([0]),Buffer.from('person-1')])).digest('hex');
  insert('hr_employee',{id:id(500),tenant_id:S,park_id:P,is_deleted:false});
  insert('legacy_record_map',{id:id(501),batch_id:id(100),source_system:'yuzhou-v10',source_table:'dbo.person',source_pk_canonical:`sha256:${personHash}`,source_identity_sha256:personHash,source_row_sha256:hash('b'),target_table:'hr_employee',target_id:id(500),mapping_status:'verified',is_active:true});
  const projection={legacy_record_map_id:id(501),phase:'T0',operation_id:'import-1',source_identity_sha256:personHash,migration_batch_id:id(100)};
  insert('hr_yuzhou_production_import_projection_receipt',projection);
  insert('hr_yuzhou_production_import_record',{operation_id:'import-1',phase:'T0',source_identity_sha256:personHash,source_system:'yuzhou-v10',source_table:'dbo.person',source_pk_canonical:`sha256:${personHash}`,target_table:'hr_employee',target_id:id(500),disposition:'insert',rollback_status:'not_started'});
  for(const [kind,column,n] of [['master_result','legacy_master_result_id',6],['dimension_result','legacy_dimension_result_id',5]])insert('hr_performance_legacy_identity_resolution',{fact_kind:kind,[column]:id(n),tenant_id:S,park_id:P,migration_batch_id:id(100),person_role:'subject',person_resolution_status:'resolved',source_person_identity_sha256:personHash,owner_t0_record_map_id:id(501),target_employee_id:id(500)});
  assert.equal(observe().master.subjectActiveEmployeeCount,1);assert.equal(observe().dimensionSubjectActiveEmployeeCount,1);
  sql(`UPDATE hr_employee SET is_deleted=true;`);assert.equal(observe().master.subjectActiveEmployeeCount,0);
  sql(`UPDATE hr_employee SET is_deleted=false,park_id='foreign';`);assert.equal(observe().dimensionSubjectActiveEmployeeCount,0);
  sql(`UPDATE hr_employee SET park_id='${P}';UPDATE hr_performance_legacy_identity_resolution SET source_person_identity_sha256='${hash('0')}';`);assert.equal(observe().master.subjectActiveEmployeeCount,0);
  sql(`UPDATE hr_performance_legacy_identity_resolution SET source_person_identity_sha256='${personHash}';UPDATE legacy_record_map SET mapping_status='loaded' WHERE id='${id(501)}';`);assert.equal(observe().master.subjectActiveEmployeeCount,0,'Candidate loaded map still fails verified subject owner');
  sql(`UPDATE legacy_record_map SET mapping_status='verified' WHERE id='${id(501)}';`);insert('hr_yuzhou_production_import_projection_receipt',projection);assert.equal(observe().master.subjectActiveEmployeeCount,0,'Two T0 candidate rows are ambiguous, never collapsed to one');
  sql(`DELETE FROM hr_yuzhou_production_import_projection_receipt WHERE ctid IN(SELECT ctid FROM hr_yuzhou_production_import_projection_receipt LIMIT 1);`);assert.equal(observe().master.subjectActiveEmployeeCount,1);
  sql(`UPDATE hr_yuzhou_production_import_record SET rollback_status='succeeded';`);assert.equal(observe().master.subjectActiveEmployeeCount,0);
  sql(`UPDATE hr_yuzhou_production_import_record SET rollback_status='not_started';`);
  insert('hr_performance_template_version',{id:id(600),template_id:id(601),tenant_id:S,park_id:P,calculation_mode:'five_channel_v1',status:'published'});
  insert('hr_performance_template_version',{id:id(602),template_id:id(601),tenant_id:S,park_id:P,calculation_mode:'five_channel_v1',status:'draft'});
  insert('hr_performance_template_version',{id:id(603),template_id:id(601),tenant_id:S,park_id:P,calculation_mode:'dimension_weighted_v1',status:'published'});
  insert('hr_performance_review_cycle',{id:id(610),tenant_id:S,park_id:P});insert('hr_performance_cycle_employee',{id:id(611),tenant_id:S,park_id:P,cycle_id:id(610)});
  sql(`UPDATE hr_performance_legacy_master_result SET target_cycle_employee_id='${id(611)}',target_template_version_id='${id(600)}' WHERE id='${id(6)}';UPDATE hr_performance_legacy_template_profile SET target_template_id='${id(601)}',target_template_version_id='${id(600)}' WHERE id='${id(1)}';`);
  insert('hr_performance_channel_definition_revision',{id:id(620),tenant_id:S,park_id:P});insert('hr_performance_channel_input_revision',{id:id(621),tenant_id:S,park_id:P});
  for(const table of ['hr_performance_channel_definition_revision','hr_performance_channel_input_revision']){insert(table,{id:id(622),tenant_id:'foreign',park_id:P});insert(table,{id:id(623),tenant_id:S,park_id:'foreign'});}
  let result=observe();assert.equal(result.master.formalReviewLinkCount,1);assert.equal(result.master.formalTemplateVersionLinkCount,1);assert.deepEqual(result.formal,{legacyTemplateVersionLinkCount:1,fiveChannelVersionCount:2,fiveChannelPublishedVersionCount:1,fiveChannelDefinitionRevisionCount:1,fiveChannelInputRevisionCount:1});
  sql(`UPDATE hr_performance_template_version SET park_id='foreign';UPDATE hr_performance_review_cycle SET tenant_id='foreign';`);result=observe();assert.equal(result.master.formalReviewLinkCount,0);assert.equal(result.master.formalTemplateVersionLinkCount,0);assert.equal(result.formal.legacyTemplateVersionLinkCount,0);assert.equal(result.formal.fiveChannelVersionCount,0);
  const snapshot=()=>sql(`SELECT encode(digest(string_agg(row_json,'|' ORDER BY row_json),'sha256'),'hex') FROM(${sourceFamilies.map(([,t])=>`SELECT to_jsonb(t)::text row_json FROM ${t} t`).join(' UNION ALL ')}) rows;`);
  const before=snapshot();observe();assert.equal(snapshot(),before,'All raw source rows remain unchanged');
  assert.throws(()=>sql(`BEGIN READ ONLY;INSERT INTO hr_employee(id) VALUES('${id(900)}');ROLLBACK;`),error=>String(error.stderr).includes('read-only transaction'));
  assert.equal(observe().formalContinuationReadiness,'UNVERIFIED');assert.equal(observe().productionBusinessWrites,0);
  console.log('PASS: complete read-only query projection, scope/count/receipt/resolution/fanout/hash/identity/link negatives; not full-schema business qualification');
 } finally {
  removeOwned(name,owner,run);
 }
});


test('partial Docker creation failure still removes exact owned tmpfs instance',{skip:!enabled},()=>{
 const owner=randomUUID(),name=`hr-performance-readiness-partial-${owner}`;
 const run=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
 assert.throws(()=>{
  try {
   // Daemon has created the instance, but client-side setup fails before a successful
   // creation flag can be set. Cleanup must discover ownership by exact name.
   run(['run','-d','--name',name,'--label',`codex.hr-performance-readiness-owner=${owner}`,'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD=synthetic-local-only','postgres:16-alpine']);
   throw new Error('SYNTHETIC_CLIENT_CREATION_RESPONSE_FAILURE');
  } finally { removeOwned(name,owner,run); }
 },/^Error: SYNTHETIC_CLIENT_CREATION_RESPONSE_FAILURE$/);
});
