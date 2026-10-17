import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(resolve(root,'apps/api/package.json')),{Client}=require('pg');
if(process.env.APP_RUNTIME_MODE!=='hr_enterprise'||!process.env.POSTGRES_DB||process.env.POSTGRES_DB==='jinhu_smart_park')throw new Error('Explicit dedicated independent HR database required');
const manifest=JSON.parse(readFileSync(resolve(root,'database/hr-enterprise/install-manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=manifest.steps.map(s=>{const sql=readFileSync(resolve(root,s.file),'utf8');if(sha(sql)!==s.sha256)throw new Error('Independent HR initialization checksum mismatch: '+s.file);return{...s,sql:sql.replace(/^BEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'')};});
const db=new Client({host:process.env.POSTGRES_HOST??'127.0.0.1',port:Number(process.env.POSTGRES_PORT??5432),user:process.env.POSTGRES_USER??'jinhu',password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB});await db.connect();
try{
 await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('jinhu-hr-enterprise-schema',0))");
 const {rows:[state]}=await db.query("SELECT to_regclass('public.sys_hr_enterprise_schema_history') history,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') n");
 if(!state.history&&state.n)throw new Error('Independent HR initialization requires an empty dedicated database');
 await db.query('CREATE TABLE IF NOT EXISTS sys_hr_enterprise_schema_history(file text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const {rows:history}=await db.query('SELECT file,sha256 FROM sys_hr_enterprise_schema_history ORDER BY file');if(history.some(row=>!files.some(f=>f.file===row.file&&f.sha256===row.sha256)))throw new Error('Independent HR history/checksum conflict');
 for(const step of files){if(history.some(r=>r.file===step.file)){console.log('Verified applied independent HR schema:',step.file);continue;}await db.query(step.sql);await db.query('INSERT INTO sys_hr_enterprise_schema_history(file,sha256) VALUES($1,$2)',[step.file,step.sha256]);console.log('Applied independent HR schema:',step.file);}
 const {rows:[forbidden]}=await db.query("SELECT to_regclass('public.biz_park') park,to_regclass('public.asset_park') asset,to_regclass('public.rel_user_park') membership");if(Object.values(forbidden).some(Boolean))throw new Error('Park schema must be absent from independent HR');
 await db.query('COMMIT');console.log('Independent HR versioned schema ready; no tenant/member/business seed executed');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
