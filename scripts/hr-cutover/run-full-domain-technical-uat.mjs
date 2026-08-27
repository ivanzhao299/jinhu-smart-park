#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { buildEvidenceIndex, manifestHash, verifyManifestChain } from "./parent-manifest.mjs";
import { currentState, validateConfig } from "./full-domain-lifecycle.mjs";

const ROOT=resolve(import.meta.dirname,"../..");
const require=createRequire(resolve(ROOT,"apps/api/package.json"));
const bcrypt=require("bcrypt");
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const writePrivate=(path,value)=>{writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});chmodSync(path,0o600);};
const sleep=(ms)=>new Promise((done)=>setTimeout(done,ms));

function parse(argv){const out={};for(let i=0;i<argv.length;i+=1){if(argv[i]==="--")continue;if(argv[i]!=="--config")fail("CLI_ARGUMENT_INVALID",argv[i]);out.config=resolve(argv[++i]);}if(!out.config)fail("CLI_ARGUMENT_INVALID","--config required");return out;}
function credential(path){return Object.fromEntries(readFileSync(path,"utf8").trim().split("\n").map((line)=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));}
function psql(config,vars,sql){const args=["exec","-i",config.target.postgresContainer,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","jinhu","-d",config.target.database];for(const [key,value]of Object.entries(vars))args.push("-v",`${key}=${value}`);const result=spawnSync("docker",args,{input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"]});if(result.status!==0)fail("TECHNICAL_UAT_DATABASE_FAILED",result.stderr.trim().split("\n").at(-1)??"psql");return result.stdout.trim();}
async function waitUrl(url){for(let n=0;n<120;n+=1){try{const response=await fetch(url);if(response.status<500)return;}catch{}await sleep(500);}fail("TECHNICAL_UAT_SERVER_NOT_READY",url);}
async function request(url,options={},expected=200){const response=await fetch(url,options);if(response.status!==expected)fail("TECHNICAL_UAT_HTTP_FAILED",`${response.status} ${url}`);let body=null;try{body=await response.json();}catch{}return body;}
function token(body){return body?.data?.accessToken??body?.accessToken??body?.data?.data?.accessToken;}
function registryFile(config,path){const registryPath=resolve(config.target.evidenceRoot,"resource-registry.json"),rows=JSON.parse(readFileSync(registryPath,"utf8"));if(!rows.some((entry)=>entry.type==="file"&&resolve(entry.planned)===path))rows.push({type:"file",planned:path,observed:path,removed:false,residualCount:0});writePrivate(registryPath,rows);}
function registryProcesses(config,pids){const registryPath=resolve(config.target.evidenceRoot,"resource-registry.json"),rows=JSON.parse(readFileSync(registryPath,"utf8")),entry=rows.find((row)=>row.type==="process"&&row.planned===`${config.runId}:managed_children`);if(!entry)fail("RESOURCE_TYPE_MISSING","managed process registry");entry.observed=pids.filter(Number.isInteger);entry.removed=entry.observed.length===0;entry.residualCount=entry.observed.length;writePrivate(registryPath,rows);}
async function stopChild(child){if(!child||child.exitCode!==null)return;if(!child.killed)child.kill("SIGTERM");for(let n=0;n<20&&child.exitCode===null;n+=1)await sleep(100);if(child.exitCode===null)child.kill("SIGKILL");}

export async function runTechnicalUat(configInput){
 const config=validateConfig(structuredClone(configInput));
 if(config.backend!=="lab"||currentState(config)!=="uat_ready")fail("STATE_TRANSITION_INVALID","technical UAT requires lab uat_ready state");
 const apiMain=resolve(ROOT,"apps/api/dist/main.js"),webBuild=resolve(ROOT,"apps/web/.next/BUILD_ID");
 if(!existsSync(apiMain)||!existsSync(webBuild))fail("TECHNICAL_UAT_BUILD_MISSING","build API and Web before the rehearsal");
 const pg=credential(config.target.credentialArtifact),password=randomBytes(24).toString("base64url"),hash=await bcrypt.hash(password,12);
 const users=[`${config.target.accountNamespace}_hr`,`${config.target.accountNamespace}_manager`,`${config.target.accountNamespace}_employee`];
 const vars={run:config.runId,tenant:config.adapterEnv.T0.load.YUZHOU_TARGET_TENANT_ID,park:config.adapterEnv.T0.load.YUZHOU_TARGET_PARK_ID,hash,hr:users[0],manager:users[1],employee:users[2]};
 const provisionSql=`BEGIN;
WITH input(username,display_name,role_code) AS(VALUES(:'hr','HR UAT','HR_MANAGER'),(:'manager','Manager UAT','DEPARTMENT_MANAGER'),(:'employee','Employee UAT','EMPLOYEE_SELF_SERVICE'))
INSERT INTO sys_user(tenant_id,park_id,username,display_name,password_hash,is_enabled,status,remark) SELECT :'tenant',:'park',username,display_name,:'hash',true,'enabled','Yuzhou technical UAT '||:'run' FROM input;
WITH input(username,role_code) AS(VALUES(:'hr','HR_MANAGER'),(:'manager','DEPARTMENT_MANAGER'),(:'employee','EMPLOYEE_SELF_SERVICE'))
INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id,is_deleted,remark) SELECT :'tenant',:'park',u.id,r.id,false,'Yuzhou technical UAT '||:'run' FROM input i JOIN sys_user u ON u.tenant_id=:'tenant' AND u.park_id=:'park' AND u.username=i.username JOIN sys_role r ON r.tenant_id=:'tenant' AND r.park_id=:'park' AND r.code=i.role_code AND r.is_deleted=false;
INSERT INTO rel_user_park(tenant_id,user_id,park_id,is_default,status,is_deleted,remark) SELECT :'tenant',id,:'park',true,'enabled',false,'Yuzhou technical UAT '||:'run' FROM sys_user WHERE username IN(:'hr',:'manager',:'employee') AND tenant_id=:'tenant' AND park_id=:'park';
WITH employees AS(SELECT id,row_number()OVER(ORDER BY id) rn FROM hr_employee WHERE tenant_id=:'tenant' AND park_id=:'park' AND remark LIKE '%'||:'run'||'-t0%' AND is_deleted=false LIMIT 3), users AS(SELECT id,row_number()OVER(ORDER BY CASE username WHEN :'hr' THEN 1 WHEN :'manager' THEN 2 ELSE 3 END)rn FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')) UPDATE hr_employee e SET user_id=u.id FROM employees x JOIN users u USING(rn) WHERE e.id=x.id;
UPDATE sys_org o SET leader_user_id=u.id FROM sys_user u,hr_employee e WHERE u.username=:'manager' AND u.tenant_id=:'tenant' AND u.park_id=:'park' AND e.user_id=u.id AND o.id=e.primary_org_id;
COMMIT;`;
 const cleanupSql=`BEGIN; UPDATE sys_org SET leader_user_id=NULL WHERE leader_user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); UPDATE hr_employee SET user_id=NULL WHERE user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); DELETE FROM sys_auth_refresh_token WHERE user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); DELETE FROM rel_user_org WHERE user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); DELETE FROM rel_user_park WHERE user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); DELETE FROM rel_user_role WHERE user_id IN(SELECT id FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee')); DELETE FROM sys_login_log WHERE username IN(:'hr',:'manager',:'employee') AND tenant_id=:'tenant' AND park_id=:'park'; DELETE FROM sys_user WHERE tenant_id=:'tenant' AND park_id=:'park' AND username IN(:'hr',:'manager',:'employee'); COMMIT;`;
 let api,web;
 try{
  psql(config,vars,provisionSql);
  const common={...process.env,POSTGRES_HOST:"127.0.0.1",POSTGRES_PORT:String(config.target.postgresPort),POSTGRES_USER:pg.POSTGRES_USER,POSTGRES_PASSWORD:pg.POSTGRES_PASSWORD,POSTGRES_DB:config.target.database,JWT_SECRET:randomBytes(48).toString("hex"),APP_PORT:String(config.target.apiPort),WEB_ORIGIN:`http://127.0.0.1:${config.target.webPort}`,FILE_STORAGE_LOCAL_ROOT:config.target.fileRoot,AUTH_SMS_FIXED_CODE:"",AUTH_SMS_CODE_VISIBLE:"false",AUTH_WECHAT_MOCK_ENABLED:"false",NODE_ENV:"test"};
  api=spawn(process.execPath,[apiMain],{cwd:ROOT,env:common,stdio:"ignore"});
  web=spawn("pnpm",["--filter","@jinhu/web","start"],{cwd:ROOT,env:{...process.env,WEB_PORT:String(config.target.webPort),NEXT_PUBLIC_API_TARGET:`http://127.0.0.1:${config.target.apiPort}`},stdio:"ignore"});
  registryProcesses(config,[api.pid,web.pid]);
  await Promise.all([waitUrl(`http://127.0.0.1:${config.target.apiPort}/api/v1/health`),waitUrl(`http://127.0.0.1:${config.target.webPort}/login`)]);
  const headers=[];
  for(const username of users){const body=await request(`http://127.0.0.1:${config.target.apiPort}/api/v1/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId:vars.tenant,parkId:vars.park,username,password})});const access=token(body);if(!access)fail("TECHNICAL_UAT_LOGIN_FAILED",username);headers.push({authorization:`Bearer ${access}`});}
  const apiBase=`http://127.0.0.1:${config.target.apiPort}/api/v1`;
  await request(`${apiBase}/users/me`,{headers:headers[0]}); await request(`${apiBase}/hr/employees?page=1&page_size=5`,{headers:headers[0]}); await request(`${apiBase}/hr/payroll/history?page=1&page_size=5`,{headers:headers[0]});
  await request(`${apiBase}/users/me`,{headers:headers[1]}); await request(`${apiBase}/hr/employees?page=1&page_size=5`,{headers:headers[1]}); await request(`${apiBase}/hr/payroll/history/team-summary?page=1&page_size=5`,{headers:headers[1]}); await request(`${apiBase}/hr/payroll/history?page=1&page_size=5`,{headers:headers[1]},403);
  await request(`${apiBase}/users/me`,{headers:headers[2]}); await request(`${apiBase}/hr/employees/me`,{headers:headers[2]}); await request(`${apiBase}/hr/payroll/history?page=1&page_size=5`,{headers:headers[2]}); await request(`${apiBase}/hr/payroll/history-books?page=1&page_size=5`,{headers:headers[2]},403);
  for(const route of ["/hr","/hr/employees","/hr/payroll"]){const response=await fetch(`http://127.0.0.1:${config.target.webPort}${route}`,{redirect:"manual"});if(![200,307,308].includes(response.status))fail("TECHNICAL_UAT_WEB_ROUTE_FAILED",`${response.status} ${route}`);}
  const summaryPath=resolve(config.target.evidenceRoot,"technical-uat-summary.json");
  writePrivate(summaryPath,{formatVersion:1,parentRunId:config.runId,status:"PASS",roles:["hr","department_manager","employee_self_service"],apiChecks:12,negativeAuthorizationChecks:2,webRouteChecks:3,humanUat:"HOLD",productionImport:"HOLD"});registryFile(config,summaryPath);
  const chainPath=config.verification.manifestChainFile,chain=JSON.parse(readFileSync(chainPath,"utf8")),head=chain.find((row)=>!chain.some((candidate)=>candidate.manifest.supersedesManifestSha256===row.sha256));
  if(!head)fail("MANIFEST_CHAIN_INVALID","head missing");
  const evidence=buildEvidenceIndex(config.target.evidenceRoot,[{kind:"approved_ignored_attestation",relativePath:"cold-archive-scope-attestation.json"},{kind:"global_facts_summary",relativePath:"global-facts-summary.json"},{kind:"technical_uat_summary",relativePath:basename(summaryPath)}]);
  const manifest=structuredClone(head.manifest);manifest.supersedesManifestSha256=head.sha256;manifest.state="uat_ready";manifest.evidence=evidence;manifest.hardGates.technicalUat={status:"PASS",reasonCodes:[]};
  manifest.resourceRegistry=JSON.parse(readFileSync(resolve(config.target.evidenceRoot,"resource-registry.json"),"utf8")).map((entry)=>({...entry,observed:typeof entry.observed==="string"?entry.observed:null}));
  const record={sha256:manifestHash(manifest),manifest};chain.push(record);writePrivate(chainPath,chain);verifyManifestChain(chain,{evidenceRoot:config.target.evidenceRoot});
  return {state:"uat_ready",technicalUat:"PASS",apiChecks:12,negativeAuthorizationChecks:2,webRouteChecks:3,manifestSha256:record.sha256,productionImport:"HOLD"};
 }finally{
  await Promise.all([stopChild(web),stopChild(api)]);
  if(existsSync(resolve(config.target.evidenceRoot,"resource-registry.json")))registryProcesses(config,[]);
  try{psql(config,vars,cleanupSql);}catch(error){if(!String(error.message).includes("does not exist"))throw error;}
 }
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){try{const args=parse(process.argv.slice(2)),config=JSON.parse(readFileSync(args.config,"utf8"));const result=await runTechnicalUat(config);process.stdout.write(`${JSON.stringify(result)}\n`);}catch(error){process.stderr.write(`${error.code??"TECHNICAL_UAT_FAILED"}: ${error.message}\n`);process.exitCode=1;}}
