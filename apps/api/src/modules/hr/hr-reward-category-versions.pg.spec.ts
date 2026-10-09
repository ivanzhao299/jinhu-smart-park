import "reflect-metadata";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {ConflictException,NotFoundException} from "@nestjs/common";
import {DataSource,type EntityManager} from "typeorm";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrRewardsService} from "./hr-rewards.service";
const required=process.env.HR_REWARD_VERSIONS_PG_REQUIRED==='1';
test('real category versions preserve historical references, reject one stale concurrent editor and read one snapshot',{skip:!required},async()=>{
 if(process.env.POSTGRES_HOST!=='127.0.0.1'||process.env.POSTGRES_PORT!=='15488')throw Error('Reward versions test requires owned loopback15488');
 const connection={type:'postgres' as const,host:'127.0.0.1',port:15488,username:'postgres'},name=`hr_reward_versions_${randomUUID().replace(/-/g,'')}`;
 const admin=new DataSource({...connection,database:'postgres'});let db:DataSource|undefined,other:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});other=new DataSource({...connection,database:name});await db.initialize();await other.initialize();
  // Owned minimal SQL contract fixture; not full-schema migration acceptance.
  await db.query(`CREATE TABLE hr_reward_discipline_category(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,park_id text,category_code text,current_version_no int DEFAULT 1,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false,create_by text,update_by text,create_time timestamptz DEFAULT now(),update_time timestamptz DEFAULT now(),version int DEFAULT 1,UNIQUE(tenant_id,park_id,category_code));
CREATE TABLE hr_reward_discipline_category_version(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id text,park_id text,category_id uuid REFERENCES hr_reward_discipline_category(id),version_no int,kind text,name text,impact_level text,description text,create_by text,create_time timestamptz DEFAULT now(),UNIQUE(category_id,version_no));
CREATE TABLE historical_case(id uuid PRIMARY KEY,category_version_id uuid REFERENCES hr_reward_discipline_category_version(id));`);
  const scope={tenantId:'tenant',parkId:'park'},actor:JwtPrincipal={...scope,sub:randomUUID(),username:'synthetic',roles:[],permissions:[H.HR_REWARD_MANAGE]},audit={recordOperationRequired:async()=>{}},service=new HrRewardsService(db,audit as never),writer=new HrRewardsService(other,audit as never),definition={kind:'reward',name:'合成制度',impactLevel:'normal',description:'旧版说明'};
  const category=await service.createCategory(scope,actor,{...definition,code:'SYN'});await db.query('INSERT INTO historical_case VALUES($1,$2)',[randomUUID(),category.versionId]);
  for(let i=2;i<=23;i++)await service.versionCategory(scope,actor,category.id,{...definition,name:`合成版本${i}`});
  const first=await service.categoryVersions(scope,actor,category.id,{page:1,page_size:20}),second=await service.categoryVersions(scope,actor,category.id,{page:2,page_size:20});assert.equal(first.total,23);assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(second.items[2].versionNo,1);assert.equal(second.items[2].description,'旧版说明');assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,23);
  const race=await Promise.allSettled([service.versionCategory(scope,actor,category.id,{...definition,expectedVersionNo:23,name:'合成编辑A'}),writer.versionCategory(scope,actor,category.id,{...definition,expectedVersionNo:23,name:'合成编辑B'})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&r.reason instanceof ConflictException).length,1);
  assert.equal((await db.query('SELECT current_version_no FROM hr_reward_discipline_category WHERE id=$1',[category.id]))[0].current_version_no,24);const historical=(await db.query('SELECT v.version_no,v.name,v.description FROM historical_case c JOIN hr_reward_discipline_category_version v ON v.id=c.category_version_id'))[0];assert.deepEqual(historical,{version_no:1,name:'合成制度',description:'旧版说明'});
  const originalTransaction=db.transaction.bind(db);let injected=false;
  db.transaction=((level:unknown,fn?: (m:EntityManager)=>Promise<unknown>)=>typeof level==='string'?originalTransaction('REPEATABLE READ',async m=>{const originalQuery=m.query.bind(m);m.query=async(sql:string,params?:unknown[])=>{const rows=await originalQuery(sql,params);if(!injected&&sql.startsWith('SELECT id,category_code')){injected=true;await writer.versionCategory(scope,actor,category.id,{...definition,expectedVersionNo:24,name:'并发新版本'});}return rows;};return fn!(m);}):originalTransaction(level as (m:EntityManager)=>Promise<unknown>)) as typeof db.transaction;
  const snapshot=await service.categoryVersions(scope,actor,category.id,{page:1,page_size:20});assert.equal(snapshot.category.currentVersionNo,24);assert.equal(snapshot.total,24);assert.equal(snapshot.items[0].versionNo,24);db.transaction=originalTransaction;
  const latest=await service.categoryVersions(scope,actor,category.id,{page:1,page_size:20});assert.equal(latest.total,25);assert.equal(latest.category.currentVersionNo,25);assert.equal(latest.items[0].versionNo,25);
  const empty=await service.categoryVersions(scope,actor,category.id,{page:999,page_size:20});assert.equal(empty.total,25);assert.deepEqual(empty.items,[]);
  await assert.rejects(service.categoryVersions({...scope,parkId:'foreign'},{...actor,parkId:'foreign'},category.id,{page:1,page_size:20}),NotFoundException);
  await db.query("UPDATE hr_reward_discipline_category SET status='disabled' WHERE id=$1",[category.id]);assert.equal((await service.categoryVersions(scope,actor,category.id,{page:1,page_size:20})).category.status,'disabled');await assert.rejects(service.versionCategory(scope,actor,category.id,{...definition,expectedVersionNo:25}),NotFoundException);
  await db.query('UPDATE hr_reward_discipline_category SET is_deleted=true WHERE id=$1',[category.id]);await assert.rejects(service.categoryVersions(scope,actor,category.id,{page:1,page_size:20}),NotFoundException);
 }finally{if(other?.isInitialized)await other.destroy();if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query('SELECT count(*)::int total FROM pg_database WHERE datname=$1',[name]))[0].total,0);}await admin.destroy();}}
});
