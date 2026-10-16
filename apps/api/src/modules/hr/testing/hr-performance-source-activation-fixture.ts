import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {DataSource} from 'typeorm';
import {IdempotencyRequestEntity} from '../../../shared/entities/idempotency-request.entity';
import {OpLogEntity} from '../../audit/entities/op-log.entity';
import {LoginLogEntity} from '../../audit/entities/login-log.entity';
const h=(value:unknown)=>createHash('sha256').update(`synthetic:${value}`).digest('hex');
const q=(value:unknown)=>`'${String(value).replaceAll("'","''")}'`;
const root=resolve(__dirname,'../../../../../..');
const artifact='/Users/mac/.codex/artifacts/hr-performance-source-activation-20261017';
export class HrPerformanceSourceActivationFixture {
 readonly name=`hr-source-activation-${randomUUID()}`;readonly database=`jinhu_hr_migration_lab_activation_${randomUUID().replaceAll('-','').slice(0,12)}`;
 readonly compose=resolve(artifact,this.name+'.yaml');db!:DataSource;attempted=false;
 docker(...args:string[]){return execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
 async start(){
  try{writeFileSync(this.compose,`services:\n  postgres:\n    image: postgres:16-alpine\n    container_name: ${this.name}\n    labels:\n      jinhu.hr-source-activation: ${this.name}\n    tmpfs:\n      - /var/lib/postgresql/data\n    environment:\n      POSTGRES_USER: jinhu\n      POSTGRES_HOST_AUTH_METHOD: trust\n      POSTGRES_DB: ${this.database}\n    ports:\n      - 127.0.0.1::5432\n`.replaceAll('\\n','\n'),{mode:0o600});this.attempted=true;this.docker('compose','-p',this.name,'-f',this.compose,'up','-d');
   for(let i=0;;i++){try{this.docker('exec',this.name,'pg_isready','-h','127.0.0.1','-U','jinhu','-d',this.database);break;}catch(e){if(i===100)throw e;await new Promise(r=>setTimeout(r,100));}}
   let migrationOutput='';try{migrationOutput=execFileSync('sh',['scripts/db-migrate.sh'],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:128*1024*1024,env:{...process.env,COMPOSE_FILE:this.compose,COMPOSE_PROJECT_NAME:this.name,POSTGRES_USER:'jinhu',POSTGRES_DB:this.database,MIGRATION_EXECUTED_BY:'owned-source-activation-fixture',MIGRATION_BASELINE_ON_NONEMPTY_DB:'no'}});}catch(e){const failure=e as {stdout?:string;stderr?:string};migrationOutput=String(failure.stdout??'')+String(failure.stderr??'');throw e;}finally{writeFileSync(resolve(artifact,this.name+'-migrations.log'),migrationOutput,{mode:0o600});}
   const port=Number(this.docker('port',this.name,'5432/tcp').split(':').pop());this.db=new DataSource({type:'postgres',host:'127.0.0.1',port,username:'jinhu',database:this.database,logging:['error'],logger:{logQueryError:(error)=>console.error('Owned SQL boundary:',error),logQuery:()=>{},logQuerySlow:()=>{},logSchemaBuild:()=>{},logMigration:()=>{},log:()=>{}},entities:[IdempotencyRequestEntity,OpLogEntity,LoginLogEntity]});await this.db.initialize();console.log(`Owned full migration PG ${this.name}`);return this;
  }catch(e){await this.close();throw e;}
 }
 async close(){try{if(this.db?.isInitialized)await this.db.destroy();}finally{if(this.attempted&&this.docker('ps','-aq','--filter',`name=^/${this.name}$`)){assert.equal(this.docker('inspect','--format','{{index .Config.Labels "jinhu.hr-source-activation"}}',this.name),this.name);this.docker('compose','-p',this.name,'-f',this.compose,'down','-v','--remove-orphans');assert.equal(this.docker('ps','-aq','--filter',`name=^/${this.name}$`),'');console.log(`Owned full migration PG removed ${this.name}`);}}}
 async seedQualification(){
 const sql=(query:string,parameters?:unknown[])=>this.db.query(query,parameters);
 const checksum=(n:number)=>{const files=readdirSync(resolve(root,'database/migrations')).filter(f=>f.startsWith(String(n).padStart(6,'0')+'_'));assert.equal(files.length,1);return createHash('sha256').update(readFileSync(resolve(root,'database/migrations',files[0]!))).digest('hex');};
const operation = "yzprod-import-20260905T010203Z-123456abcdef";
const values:Record<string,string> = {
  plan: h("plan"), auth: h("authorization"), nonce: h("nonce"),
  rollbackAuth: h("rollback-authorization"), rollbackNonce: h("rollback-nonce"),
  code: "1".repeat(40), source: h("source"), mapping: h("mapping"), target: h("target"),
  t0: h("after"), relation: "", identity: "",
};
const relations = {
  asssession: Array.from({ length: 7 }, (_, index) => ({
    sourceIdentitySha256: h(`session-${index + 1}`), sourceRowSha256: h(`session-row-${index + 1}`),
    id: index + 1, asssession: `Synthetic ${index + 1}`, description: null,
    assessmenttype: null, year: 2026, month: index + 1, quarter: null, myorder: index + 1,
  })),
  asssour: [],
  asssourperson: Array.from({ length: 117 }, (_, index) => ({
    sourceIdentitySha256: h(`assignment-${index + 1}`), sourceRowSha256: h(`assignment-row-${index + 1}`),
    id: index + 1, asssessionid: 1, person: index < 9 ? "P1" : `X${String(index).padStart(3, "0")}`,
    assperson: "", lb: 1,
  })),
};
const identity = { sessions: relations.asssession.map(session => ({
  sourceSessionIdentitySha256: session.sourceIdentitySha256,
  status: "unmatched", reasonCode: "NO_MODERN_CYCLE",
  targetReviewCycleId: null, decisionAttestationSha256: h(`decision-${session.id}`),
})) };
const relationBytes = Buffer.from(JSON.stringify(relations));
const identityBytes = Buffer.from(JSON.stringify(identity));
values.relation = createHash("sha256").update(relationBytes).digest("hex");
values.identity = createHash("sha256").update(identityBytes).digest("hex");


 values.scope=(await sql("SELECT hr_yuzhou_production_target_scope_sha256('tenant-a','park-a') scope"))[0].scope;
 const scopeSql=q(values.scope),t0IdentitySql="hr_performance_yuzhou_person_identity_sha256('P1')";
 await sql(`
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name) VALUES('tenant-a','TENANT-A','Synthetic Tenant');
INSERT INTO biz_park(tenant_id,park_id,park_code,park_name) VALUES('tenant-a','park-a','PARK-A','Synthetic Park');
INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type)
VALUES('10000000-0000-4000-8000-000000000001','tenant-a','park-a','ORG-A','Synthetic Org','department');
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id)
VALUES('20000000-0000-4000-8000-000000000001','tenant-a','park-a','P1','Synthetic Employee',
  '10000000-0000-4000-8000-000000000001');
SELECT hr_yuzhou_consume_import_authorization_v2(
 ${q(operation)},${q(values.code)},${q(values.source)},${q(values.mapping)},${q(values.plan)},${q(values.target)},'tenant-a','park-a',${scopeSql},${q(values.auth)},${q(values.nonce)},now()-interval '1 minute',now()+interval '1 hour',now()-interval '2 minutes',now()+interval '2 hours',${q(h('approvals'))},${q(h('manifest'))},${q(h('pair'))},${q(h('a'))},${q(h('b'))});
UPDATE hr_yuzhou_production_import_operation SET status='running',started_at=now(),current_phase='T0' WHERE operation_id=${q(operation)};
INSERT INTO hr_yuzhou_production_import_phase(
  operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,
  applied_record_count,before_canonical_sha256,after_canonical_sha256,started_at,finished_at,
  payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
) VALUES(${q(operation)},'T0',0,'running',${q(h("t0-manifest"))},2,0,${q(h("before"))},
  NULL,now(),NULL,${q(h("bundle-artifact"))},${q(h("bundle"))},
  'yuzhou-production-import-canonical-json-v1');
INSERT INTO migration_batch(
  id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
  started_at,finished_at,execution_context,production_import_operation_id,production_import_phase
) VALUES('30000000-0000-0000-0000-000000000001',${q(`${operation}-t0`)},'yuzhou-v10',${q(values.source)},
  current_database(),'load','running',${q(`prod-import-v2@${values.code}`)},now(),NULL,
  'production_import',${q(operation)},'T0');
INSERT INTO hr_yuzhou_production_import_record(
  operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,
  target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
  target_version_after,planned_target_table
) VALUES(${q(operation)},'T0',${t0IdentitySql},${q(h("t0-row"))},'insert','hr_employee',
  '20000000-0000-4000-8000-000000000001',${q(h("employee-after"))},'yuzhou-v10','dbo.person',
  'sha256:'||${t0IdentitySql},${q(h("employee-business"))},1,'hr_employee');
INSERT INTO hr_yuzhou_production_import_record(
  operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,
  target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
  target_version_after,planned_target_table
) VALUES(${q(operation)},'T0',${q(h("org-identity"))},${q(h("org-row"))},'insert','sys_org',
  '10000000-0000-4000-8000-000000000001',${q(h("org-after"))},'yuzhou-v10','dbo.department',
  ${q(`sha256:${h("org-identity")}`)},${q(h("org-business"))},1,'sys_org');
INSERT INTO hr_yuzhou_production_import_record_dependency(
  operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,
  depends_on_source_identity_sha256,expected_target_table
) VALUES(${q(operation)},'T0',${t0IdentitySql},'primary_org','T0',${q(h("org-identity"))},'sys_org');
INSERT INTO legacy_record_map(
  id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
  source_row_sha256,target_table,target_id,mapping_status,is_active
) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
  'yuzhou-v10','dbo.person','sha256:'||${t0IdentitySql},${t0IdentitySql},${q(h("t0-row"))},
  'hr_employee','20000000-0000-4000-8000-000000000001','loaded',true);
INSERT INTO legacy_record_map(
  id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
  source_row_sha256,target_table,target_id,mapping_status,is_active
) VALUES('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',
  'yuzhou-v10','dbo.department',${q(`sha256:${h("org-identity")}`)},${q(h("org-identity"))},
  ${q(h("org-row"))},'sys_org','10000000-0000-4000-8000-000000000001','loaded',true);
INSERT INTO hr_yuzhou_production_import_projection_receipt(
  operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
) VALUES(${q(operation)},'T0',${t0IdentitySql},'30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001');
INSERT INTO hr_yuzhou_production_import_projection_receipt(
  operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
) VALUES(${q(operation)},'T0',${q(h("org-identity"))},'30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002');
UPDATE migration_batch SET status='succeeded',finished_at=now()
  WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=2,
  after_canonical_sha256=${q(h("after"))},finished_at=now()
  WHERE operation_id=${q(operation)} AND phase='T0';
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
`);
 const batchId='30000000-0000-0000-0000-000000000001',labBatch=randomUUID();
 const facts={assessmentcode:[{sourceIdentitySha256:h('profile'),sourceRowSha256:h('profile-row'),assessment:7,assessmentname:'Synthetic complete rubric',department:null,mpercent:30,tpercent:10,xpercent:25,cpercent:15,spercent:20,timekeep:true,bonus:false,master:true}],
 assgradecode:Array.from({length:41},(_,i)=>({sourceIdentitySha256:h('grade-'+i),sourceRowSha256:h('grade-row-'+i),assgrade:'G'+String(i).padStart(2,'0'),description:'说'.repeat(500),myorder:String(i).padStart(2,'0'),assessmentid:7,minvalue:i,maxvalue:i+1})),
 assitem:[1,2].map(i=>({sourceIdentitySha256:h('item-'+i),sourceRowSha256:h('item-row-'+i),id:i,assid:7,assitem:'Synthetic item '+i,fullvalue:'9999999999999999.99',myorder:i===1?2147483647:-2147483648})),
 assitemgradedes:[1,2].map(i=>({sourceIdentitySha256:h('guide-'+i),sourceRowSha256:h('guide-row-'+i),id:i,assitemid:i,grade:'G00',description:'导'.repeat(500),minvalue:-2147483648,maxvalue:2147483647,myorder:i})),
 assessmentdetail:Array.from({length:101},(_,i)=>({sourceIdentitySha256:h('detail-'+i),sourceRowSha256:h('detail-row-'+i),id:i+1,asssessionid:1,person:'P1',assitemid:i%2+1,selfvalue:i===0?'9999999999999999.99':null,mitemvalue:'0.00',itemvalue:'1.25',xitemvalue:null,citemvalue:'-0.50',selfgrade:null,assgrade:'G00',appraisal:(i===0?'😀'.repeat(200):'Independent detail '+i) as string|null}))};
 facts.assessmentdetail.push({...facts.assessmentdetail[1]!,sourceIdentitySha256:h('isolated-detail'),sourceRowSha256:h('isolated-detail-row'),id:102,asssessionid:2,appraisal:null});
 const masters={assessmentmaster:[1,2,3].map(i=>({sourceIdentitySha256:h('master-'+i),sourceRowSha256:h('master-row-'+i),id:9000+i,asssessionid:i===3?2:1,person:'P1',selfgrade:null,assgrade:'G00',selfvalue:'9999999999999999.99',itemvalue:'0.00',mitemvalue:'999999999999999999',xitemvalue:'-999999999999999999',citemvalue:'0',mastervalue:'2.10',timekeepvalue:null,bonusvalue:'-0.20',totalvalue:'79.00',selfappraisal:'自'.repeat(500),appraisal:'评'.repeat(500),pay:'999999999999999.9999',assessmentperson:'Original source author',recdate:'2020-07-15T12:34:56.123456',operator:'SOURCE',des:i===1?'Selected master original text':'OTHER_MASTER_PRIVATE_TEXT'}))};
 const factBytes=Buffer.from(JSON.stringify(facts)),masterBytes=Buffer.from(JSON.stringify(masters)),digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 await sql(`INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,execution_context,started_at) VALUES($1,'synthetic-oracle','yuzhou-v10',$2,current_database(),'load','running','owned-contract','lab_rehearsal',now())`,[labBatch,values.source]);
 await sql(`BEGIN ISOLATION LEVEL SERIALIZABLE;CALL materialize_yuzhou_performance_legacy_lab('tenant-a','park-a',${q(labBatch)},${q(JSON.stringify(facts))});CALL materialize_yuzhou_performance_legacy_master_lab('tenant-a','park-a',${q(labBatch)},${q(JSON.stringify(masters))});COMMIT;`);
 const oracle=(await sql("SELECT f.*,i.fact_set_sha256 identity_hash FROM hr_yuzhou_performance_full_fact_set_v1('tenant-a','park-a',$1) f CROSS JOIN hr_yuzhou_performance_fact_identity_set_v1('tenant-a','park-a',$1) i",[labBatch]))[0];
 await sql(`BEGIN;UPDATE migration_batch SET phase='rollback',status='running' WHERE id=${q(labBatch)};SET LOCAL yuzhou.performance_legacy_rollback_batch_id=${q(labBatch)};
 DELETE FROM hr_performance_legacy_master_result WHERE migration_batch_id=${q(labBatch)};DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id=${q(labBatch)};DELETE FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id=${q(labBatch)};DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id=${q(labBatch)};DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id=${q(labBatch)};DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id=${q(labBatch)};UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id=${q(labBatch)};COMMIT;`);
 const args=[operation,values.plan,h('fact-loader-contract'),values.auth,values.nonce,values.code,values.source,values.mapping,values.target,'tenant-a','park-a',values.scope,values.t0,h('restore'),h('location'),h('canonical'),digest(factBytes),digest(masterBytes),factBytes,masterBytes,oracle.template_rows,oracle.level_rule_rows,oracle.dimension_rows,oracle.guide_rows,oracle.dimension_result_rows,oracle.master_result_rows,oracle.active_fact_maps,oracle.identity_hash,oracle.full_fact_set_sha256,...[300,301,302,303,310,311].map(checksum)];
 const applied=await this.db.transaction('SERIALIZABLE',async m=>{await m.query('SET LOCAL ROLE jinhu_hr_yuzhou_performance_facts_writer');return(await m.query(`SELECT * FROM hr_yuzhou_apply_performance_facts_production_v1(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args))[0];});assert.equal(applied.status,'succeeded');assert.equal(Number(applied.dimension_result_rows),102);
 const relArgs=[operation,values.plan,values.auth,values.nonce,values.code,values.source,values.mapping,values.target,'tenant-a','park-a',values.scope,values.t0,values.relation,values.identity,relationBytes,identityBytes,checksum(305),checksum(306)];
 const relationReceipt=await this.db.transaction('SERIALIZABLE',async m=>{await m.query('SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer');return(await m.query(`SELECT * FROM hr_yuzhou_apply_performance_relations_production_v1(${relArgs.map((_,i)=>'$'+(i+1)).join(',')})`,relArgs))[0];});assert.equal(relationReceipt.status,'succeeded');assert.equal(Number(relationReceipt.assignment_rows),117);
 const parent=(await sql('SELECT * FROM hr_yuzhou_performance_relations_production_receipt WHERE operation_id=$1',[operation]))[0];
 const identityArgs=[operation,values.plan,values.auth,values.nonce,h('identity-extension'),values.code,values.source,values.mapping,values.target,'tenant-a','park-a',values.scope,values.t0,parent.receipt_sha256,h('parent-relations-contract'),applied.receipt_sha256,102,3,oracle.identity_hash,checksum(308),checksum(310)];
 const identityReceipt=await this.db.transaction('SERIALIZABLE',async m=>{await m.query('SET LOCAL ROLE jinhu_hr_yuzhou_performance_fact_identity_writer');return(await m.query(`SELECT * FROM hr_yuzhou_apply_performance_fact_identity_production_v1(${identityArgs.map((_,i)=>'$'+(i+1)).join(',')})`,identityArgs))[0];});assert.equal(identityReceipt.status,'succeeded');assert.equal(Number(identityReceipt.resolved_rows),105);

 const assessmentOperation='yzprod-perfrel-20260905T020304Z-abcdef123456',personIdentity=(await sql("SELECT hr_performance_yuzhou_person_identity_sha256('P1') identity"))[0].identity;
 const payload={personAssessments:[{sourcePersonIdentitySha256:personIdentity,sourceAssessmentId:7}]};
 const payloadHash=(await sql('SELECT hr_yuzhou_performance_person_assessment_payload_sha256($1) h',[payload]))[0].h;
 const consume=[assessmentOperation,operation,values.code,values.source,values.mapping,values.t0,'f9eac8435900c05251c82c0c1be04bbe63992ca9f65a9879c21c838af898f62c',h('restore-receipt'),h('payload-artifact'),h('safe-receipt'),checksum(307),payloadHash,h('assessment-sealed'),h('assessment-binding'),h('assessment-auth'),h('assessment-nonce'),new Date(Date.now()+3600000).toISOString()];
 await this.db.transaction('SERIALIZABLE',async m=>{await m.query(`SELECT hr_yuzhou_consume_performance_person_assessment_authorization(${consume.map((_,i)=>'$'+(i+1)).join(',')})`,consume);await m.query('CALL materialize_yuzhou_performance_ass_compute_weight_relation_production($1,$2,$3,$4,$5,$6)',[assessmentOperation,'tenant-a','park-a',checksum(307),payloadHash,payload]);});
 const personReceipt=(await sql('SELECT * FROM hr_yuzhou_performance_person_assessment_production_receipt($1)',[assessmentOperation]))[0];assert.equal(personReceipt.status,'succeeded');assert.equal(Number(personReceipt.master_rows),3);
 await sql("UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1",[operation]);
 await sql("UPDATE legacy_record_map SET mapping_status='verified' WHERE batch_id=$1 AND source_table IN('dbo.person','dbo.department') AND mapping_status='loaded'",[batchId]);
 console.log('Genuine 311/308/310/309 qualification fixture succeeded: 102details/41grades/3masters (selected101 + independent null-note detail) and7sessions/117assignments');
 return {operation,batchId:'30000000-0000-0000-0000-000000000001',values,relations,identity,relationBytes,identityBytes,checksum};
 }
}
