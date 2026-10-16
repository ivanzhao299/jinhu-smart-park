import 'reflect-metadata';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import {Module,ValidationPipe,ConflictException} from '@nestjs/common';
import {NestFactory,Reflector} from '@nestjs/core';
import {DataSource,type QueryRunner} from 'typeorm';
import {emptyHrPerformanceChannelDefinition,validateHrPerformanceChannelDefinition,HR_PERMISSIONS} from '@jinhu/shared';
import {PermissionGuard} from '../../shared/guards/permission.guard';
import {IdempotencyKeyGuard} from '../../shared/guards/idempotency-key.guard';
import {IdempotencyService,setIdempotencyService} from '../../shared/services/idempotency.service';
import {IdempotencyRequestEntity} from '../../shared/entities/idempotency-request.entity';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {HrPerformanceReviewService} from './hr-performance-review.service';
import {HrPerformanceReviewController} from './hr-performance-review.controller';
import {HrPerformanceEvaluationService} from './hr-performance-evaluation.service';

const complete=()=>{
 const c=emptyHrPerformanceChannelDefinition();c.displayName='';c.departmentLabel='合成部门';c.weights={sPercent:'-2147483648',mPercent:'2147483647',tPercent:null,xPercent:'000',cPercent:'-0'};
 c.items=Array.from({length:101},(_,i)=>({id:` item-${i} `,name:i===0?'':null,fullValue:i===0?'9999999999999999.99':null,order:i,sourceAssessmentRef:'0001',guides:[{id:' shared-guide ',grade:'',description:null,minValue:'-9999999999999999.99',maxValue:null,order:null}]}));
 c.gradeCandidates=Array.from({length:41},(_,i)=>({id:`grade-${i}`,code:'same-code',description:'',sourceOrderText:'01',sourceAssessmentRef:null,minValue:i===0?'000.00':null,maxValue:'9999999999999999.99'}));return c;
};
test('owned PG + actual HTTP channel definition, strict payload, history/CAS, source preservation, old mode',{skip:process.env.HR_PERFORMANCE_CHANNEL_DEFINITION_PG_REQUIRED!=='1',timeout:120000},async()=>{
 const name=`hr-channel-definition-${randomUUID()}`,docker=(...args:string[])=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 let attempted=false,db:DataSource|undefined,app:Awaited<ReturnType<typeof NestFactory.create>>|undefined;
 try{
  attempted=true;docker('run','-d','--name',name,'--label',`jinhu.hr-channel-definition=${name}`,'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:16-alpine');console.log(`Owned PostgreSQL: ${name}`);
  const port=Number(docker('port',name,'5432/tcp').split(':').pop());assert.ok(port>0);
  for(let i=0;;i++){try{docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres');break;}catch(error){if(i===50)throw error;await new Promise(r=>setTimeout(r,100));}}
  db=new DataSource({type:'postgres',host:'127.0.0.1',port,username:'postgres',database:'postgres',entities:[IdempotencyRequestEntity]});await db.initialize();const sql=(q:string,p?:unknown[])=>db!.query(q,p),migration=(f:string)=>readFileSync(resolve(__dirname,'../../../../../database/migrations',f),'utf8');
  await sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid,UNIQUE(tenant_id,park_id,id));CREATE TABLE hr_employee(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id));CREATE TABLE hr_performance_plan(id uuid,tenant_id varchar(64),park_id varchar(64));CREATE TABLE hr_performance_item(id uuid);CREATE TABLE sys_org(id uuid,tenant_id varchar(64),park_id varchar(64),status text,is_deleted boolean)');
  await sql(migration('000258_hr_performance_template_planning.sql'));
  const core=readFileSync(resolve(__dirname,'hr-performance-channel-snapshot-core.pg.spec.ts'),'utf8');
  await sql(core.slice(core.indexOf('    CREATE TABLE migration_batch('),core.indexOf('    CREATE TABLE hr_performance_template(')));
  for(const f of ['000300_hr_performance_yuzhou_legacy_model.sql','000302_hr_performance_yuzhou_legacy_master.sql','000304_hr_performance_yuzhou_legacy_master_parity.sql','000321_hr_performance_yuzhou_total_rounding.sql','000370_hr_performance_channel_snapshot_core.sql','000136_idempotency_request.sql'])await sql(migration(f));
  const scope={tenantId:'synthetic-t',parkId:'synthetic-p'},actor:JwtPrincipal={...scope,sub:randomUUID(),username:'synthetic',roles:[],permissions:[HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,HR_PERMISSIONS.HR_PERFORMANCE_MANAGE]};await sql('INSERT INTO sys_user VALUES($1,$2,$3)',[scope.tenantId,scope.parkId,actor.sub]);
  const service=new HrPerformanceReviewService(db,{} as never),dimension={templateCode:'OLD',templateName:'Original',versionName:'Old V1',dimensions:[{code:'work',name:'Work',weight:1,scoringGuide:{text:'Original guide'}}],levels:[{code:'all',name:'All',scoreMin:0,scoreMax:100}]};
  const old=await service.createTemplate(scope,actor,dimension);await service.publishTemplate(scope,actor,String(old.versionId));const org=randomUUID();await sql("INSERT INTO sys_org VALUES($1,$2,$3,'enabled',false)",[org,scope.tenantId,scope.parkId]);
  const cycle=await service.createCycle(scope,actor,{cycleCode:'OLD-CYCLE',cycleName:'Original frozen cycle',startDate:'2090-01-01',endDate:'2090-12-31',templateVersionId:String(old.versionId),applicableOrgIds:[org]});await sql("UPDATE hr_performance_review_cycle SET status='self_review' WHERE id=$1",[cycle.id]);
  const original=await sql('SELECT row_to_json(v) data FROM hr_performance_template_version v WHERE id=$1',[old.versionId]),frozen=await sql('SELECT template_snapshot FROM hr_performance_review_cycle WHERE id=$1',[cycle.id]);
  const functions=()=>sql("SELECT proname,pg_get_functiondef(oid) definition,proacl::text acl FROM pg_proc WHERE proname LIKE 'hr_performance_yuzhou_%' OR proname IN('hr_performance_snapshot_score','hr_performance_five_channel_snapshot_total_v1','hr_performance_threshold_snapshot_grade_v1') ORDER BY proname"),beforeFunctions=await functions();
  const batch=randomUUID(),map=randomUUID(),fact=randomUUID();await sql("INSERT INTO migration_batch VALUES($1,'synthetic','yuzhou-v10',repeat('f',64),current_database(),'load','running','test')",[batch]);
  await sql("INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES($1,$2,'yuzhou-v10','dbo.assessmentcode','1',repeat('a',64),repeat('b',64),'hr_performance_legacy_template_profile',$3,'loaded',true)",[map,batch,fact]);
  await sql("INSERT INTO hr_performance_legacy_template_profile(id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,source_assessment,source_assessment_name) VALUES($1,$2,$3,$4,$5,repeat('a',64),repeat('b',64),1,'合成来源')",[fact,scope.tenantId,scope.parkId,batch,map]);
  const facts=()=>sql('SELECT row_to_json(f) data FROM hr_performance_legacy_template_profile f ORDER BY id'),beforeFacts=await facts();await sql(migration('000371_hr_performance_channel_definition_maintenance.sql'));
  await assert.rejects(sql("INSERT INTO hr_performance_template_version(tenant_id,park_id,template_id,version_no,version_name,total_weight) VALUES($1,$2,$3,100,'Invalid old',NULL)",[scope.tenantId,scope.parkId,old.id]),/ck_hr_perf_template_mode/);
  const config=complete();validateHrPerformanceChannelDefinition(config);assert.equal((await sql('SELECT hr_performance_channel_config_valid_v1($1) valid',[config]))[0].valid,true);
  // JSON numbers express integer values independent of lexical fractional zeroes.
  for(const raw of ['1.0','-2147483648.0','2147483647.000']) {
   const rawConfig=JSON.stringify(config).replace('"order":0',`"order":${raw}`);
   validateHrPerformanceChannelDefinition(JSON.parse(rawConfig));
   assert.equal((await sql('SELECT hr_performance_channel_config_valid_v1($1::jsonb) valid',[rawConfig]))[0].valid,true);
  }
  const body={templateCode:'CHANNEL',templateName:'Stable parent',versionName:'Channel V1',config};class Fixture{}
  Module({controllers:[HrPerformanceReviewController],providers:[{provide:HrPerformanceReviewService,useValue:service},{provide:HrPerformanceEvaluationService,useValue:{}}]})(Fixture);app=await NestFactory.create(Fixture,{logger:false});setIdempotencyService(new IdempotencyService(db.getRepository(IdempotencyRequestEntity),db));
  app.use((req:{user?:unknown;header:(n:string)=>string|undefined},_res:unknown,next:()=>void)=>{const role=req.header('x-synthetic-role');req.user=role==='none'?{...actor,permissions:[]}:role==='read'?{...actor,permissions:[HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ]}:role==='foreign'?{...actor,parkId:'foreign'}:actor;next();});app.useGlobalGuards(new PermissionGuard(new Reflector()),new IdempotencyKeyGuard(new Reflector()));app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const request=async(method:string,path:string,payload?:unknown,status=method==='GET'?200:201,key=randomUUID(),role='manage')=>{const r=await fetch(`${base}/hr/performance-v2/${path}`,{method,headers:{'content-type':'application/json','x-idempotency-key':key,'x-synthetic-role':role},...(payload===undefined?{}:{body:JSON.stringify(payload)})});const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;};
  await request('POST','templates/channel',body,403,randomUUID(),'none');await request('POST','templates/channel',body,403,randomUUID(),'read');const key=randomUUID(),first=await request('POST','templates/channel',body,201,key);assert.deepEqual(await request('POST','templates/channel',body,201,key),first);await request('POST','templates/channel',{...body,versionName:'Different'},409,key);
  const detail=await request('GET',`templates/${first.id}`);assert.deepEqual(detail.channelDefinition,config);assert.equal(detail.currentRevisionId,first.currentRevisionId);assert.deepEqual(detail.dimensions,[]);await request('GET',`templates/${first.id}`,undefined,404,randomUUID(),'foreign');await request('GET',`template-versions/${first.versionId}/channel-definition/history`,undefined,200,randomUUID(),'read');await request('GET',`template-versions/${first.versionId}/channel-definition/history`,undefined,404,randomUUID(),'foreign');await request('GET',`template-versions/${first.versionId}/channel-definition/history`,undefined,403,randomUUID(),'none');await request('POST',`template-versions/${first.versionId}/channel-definition/revisions`,{config,expectedRevisionId:first.currentRevisionId},403,randomUUID(),'read');
  type MutableConfig=ReturnType<typeof complete>;
  const mutations:Array<(c:MutableConfig)=>void>=[c=>{delete (c.weights as Partial<typeof c.weights>).sPercent;},c=>{Object.assign(c,{extra:true});},c=>{Object.assign(c.weights,{sPercent:1});},c=>{c.weights.sPercent='2147483648';},c=>{c.items[0]!.fullValue='1.001';},c=>{c.items[0]!.fullValue='10000000000000000';},c=>{c.items[0]!.fullValue='1e2';},c=>{c.items[0]!.fullValue='NaN';},c=>{c.items[1]!.id=c.items[0]!.id;},c=>{c.items[0]!.guides.push(c.items[0]!.guides[0]!);},c=>{c.gradeCandidates[1]!.id=c.gradeCandidates[0]!.id;},c=>{c.items[0]!.id='';},c=>{Object.assign(c.channels.s,{allowedActors:['unknown']});},c=>{Object.assign(c.channels.s,{stage:1});},c=>{Object.assign(c.channels.s,{required:'true'});},c=>{Object.assign(c.adjustmentPolicy.master,{inputMode:'automatic'});},c=>{Object.assign(c.gradeCandidates[0]!,{code:null});},c=>{c.items[0]!.order=2147483648;},c=>{c.items[0]!.order=0.5;}];
  for(const mutate of mutations){const bad=structuredClone(config);mutate(bad);assert.throws(()=>validateHrPerformanceChannelDefinition(bad));assert.equal((await sql('SELECT hr_performance_channel_config_valid_v1($1) valid',[bad]))[0].valid,false);await request('POST',`template-versions/${first.versionId}/channel-definition/revisions`,{config:bad,expectedRevisionId:first.currentRevisionId},400);}
  await request('POST','templates/channel',{...body,unknown:true},400);
  for(const field of ['templateCode','templateName','versionName'])await request('POST','templates/channel',{...body,[field]:' \t '},400);
  const changed={...config,displayName:'Renamed version'},attempts=await Promise.allSettled([1,2].map(()=>service.appendChannelDefinition(scope,actor,first.versionId,{config:changed,expectedRevisionId:first.currentRevisionId})));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.ok(attempts.some(r=>r.status==='rejected'&&r.reason instanceof ConflictException));
  const current=await service.templateDetail(scope,actor,first.id);assert.equal(current.templateName,'Stable parent');assert.equal(current.displayName,'Renamed version');const revisionBody={config:{...config,displayName:null},expectedRevisionId:String(current.currentRevisionId)},revisionKey=randomUUID();const appended=await request('POST',`template-versions/${first.versionId}/channel-definition/revisions`,revisionBody,201,revisionKey);assert.deepEqual(await request('POST',`template-versions/${first.versionId}/channel-definition/revisions`,revisionBody,201,revisionKey),appended);
  const history=await request('GET',`template-versions/${first.versionId}/channel-definition/history?page=2&pageSize=1`);assert.equal(history.total,3);assert.equal(history.items[0].revisionNo,2);assert.equal(history.items[0].config.items.length,101);
  await request('POST',`templates/${first.versionId}/publish`,{},400);await request('POST','score-preview',{templateVersionId:first.versionId,dimensionScores:{}},400);await request('POST','cycles',{cycleCode:'NO',cycleName:'No activation',startDate:'2090-01-01',endDate:'2090-01-31',templateVersionId:first.versionId,applicableOrgIds:[org]},400);
  await assert.rejects(sql("UPDATE hr_performance_template_version SET status='published',published_at=now() WHERE id=$1",[first.versionId]),/draft only|ck_hr_perf_template_mode/);await assert.rejects(sql("UPDATE hr_performance_template_version SET calculation_mode='dimension_weighted_v1',total_weight=1,channel_definition_revision_id=NULL WHERE id=$1",[first.versionId]),/identity/);
  await assert.rejects(sql("INSERT INTO hr_performance_template_dimension(tenant_id,park_id,template_version_id,dimension_code,dimension_name,weight) VALUES($1,$2,$3,'mix','Mixed',1)",[scope.tenantId,scope.parkId,first.versionId]),/do not use dimension children/);
  await assert.rejects(sql('UPDATE hr_performance_channel_definition_revision SET config=$2 WHERE id=$1',[first.currentRevisionId,changed]),/append-only/);await assert.rejects(sql('DELETE FROM hr_performance_channel_definition_revision WHERE id=$1',[first.currentRevisionId]),/append-only/);await assert.rejects(sql('UPDATE hr_performance_template_version SET channel_definition_revision_id=$2 WHERE id=$1',[first.versionId,first.currentRevisionId]),/successor/);
  const second=await request('POST',`templates/${first.id}/channel-versions`,{...body,versionName:'Channel V2',expectedVersionId:first.versionId});await request('POST',`templates/${first.id}/channel-versions`,{...body,expectedVersionId:first.versionId},409);await assert.rejects(sql('UPDATE hr_performance_template_version SET channel_definition_revision_id=$2 WHERE id=$1',[second.versionId,appended.currentRevisionId]),/successor|foreign key/);await request('POST',`template-versions/${first.versionId}/channel-definition/revisions`,{config,expectedRevisionId:appended.currentRevisionId},409);
  await assert.rejects(sql('INSERT INTO hr_performance_channel_definition_revision(tenant_id,park_id,template_version_id,revision_no,config,created_by,previous_revision_id) VALUES($1,$2,$3,2,$4,$5,$6)',[scope.tenantId,scope.parkId,second.versionId,config,actor.sub,second.currentRevisionId]),/head must advance/);await assert.rejects(sql('INSERT INTO hr_performance_channel_definition_revision(tenant_id,park_id,template_version_id,revision_no,config,created_by,previous_revision_id) VALUES($1,$2,$3,2,$4,$5,$6)',[scope.tenantId,scope.parkId,second.versionId,config,randomUUID(),second.currentRevisionId]),/foreign key/);
  await assert.rejects(sql("INSERT INTO hr_performance_review_cycle(tenant_id,park_id,cycle_code,cycle_name,start_date,end_date,template_version_id,template_snapshot) VALUES($1,$2,'DIRECT','Direct','2090-01-01','2090-01-31',$3,'{}')",[scope.tenantId,scope.parkId,second.versionId]),/draft only/);
  // Commit a revision after the first read statement finishes: a split head/page
  // read used to combine the old head with the newly committed page.
  const originalQuery=db.query.bind(db);let interleaved=false;
  Object.defineProperty(db,'query',{configurable:true,value:async(query:string,parameters?:unknown[],queryRunner?:QueryRunner)=>{
   const result=await originalQuery(query,parameters,queryRunner);
   if(!interleaved&&query.startsWith('SELECT v.id')){interleaved=true;await service.appendChannelDefinition(scope,actor,second.versionId,{config,expectedRevisionId:second.currentRevisionId});}
   return result;
  }});
  try {
   const snapshot=await service.channelDefinitionHistory(scope,actor,second.versionId,{page:1,pageSize:10});
   assert.equal(interleaved,true);
   assert.equal(snapshot.currentRevisionId,(snapshot.items as Array<{id:string}>)[0]!.id);
   assert.equal(snapshot.total,1);
  } finally {Object.defineProperty(db,'query',{configurable:true,value:originalQuery});}
  const oldNext=await service.createTemplateVersion(scope,actor,String(old.id),{...dimension,versionName:'Old V2',expectedVersionId:String(old.versionId)});await service.publishTemplate(scope,actor,String(oldNext.versionId));assert.equal((await service.previewScore(scope,actor,{templateVersionId:String(old.versionId),dimensionScores:{work:87.25}})).score,'87.25');
  const nowOld=(await sql('SELECT row_to_json(v) data FROM hr_performance_template_version v WHERE id=$1',[old.versionId]))[0].data;delete nowOld.calculation_mode;delete nowOld.channel_definition_revision_id;assert.deepEqual(nowOld,original[0].data);assert.deepEqual(await sql('SELECT template_snapshot FROM hr_performance_review_cycle WHERE id=$1',[cycle.id]),frozen);await assert.rejects(sql("UPDATE hr_performance_template_dimension SET dimension_name='Changed' WHERE template_version_id=$1",[old.versionId]),/immutable/);assert.deepEqual(await facts(),beforeFacts);assert.deepEqual(await functions(),beforeFunctions);
  assert.equal((await sql("SELECT has_table_privilege('public','hr_performance_channel_definition_revision','SELECT') allowed"))[0].allowed,false);
  console.log(`Validated ${mutations.length} strict HTTP/PG cases, complete101/41, replay/CAS/history, SQL bypasses and old/source preservation`);
 }finally{
  try{if(app)await app.close();}finally{setIdempotencyService(null);try{if(db?.isInitialized)await db.destroy();}finally{if(attempted&&docker('ps','-aq','--filter',`name=^/${name}$`)){assert.equal(docker('inspect','--format','{{index .Config.Labels "jinhu.hr-channel-definition"}}',name),name);docker('rm','-fv',name);assert.equal(docker('ps','-aq','--filter',`name=^/${name}$`),'');console.log(`Owned PostgreSQL removed: ${name}`);}}}
 }
});
