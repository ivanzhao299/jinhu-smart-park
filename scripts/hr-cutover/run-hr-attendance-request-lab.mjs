#!/usr/bin/env node
/* global process */
import { spawnSync } from "node:child_process";
import { existsSync,lstatSync,readFileSync,statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCoreT0T3ContinuousLab } from "./run-core-t0-t3-continuous-lab.mjs";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const MIN_DURATION_MINUTES=300;
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const privateFile=path=>existsSync(path)&&!lstatSync(path).isSymbolicLink()&&statSync(path).isFile()&&(statSync(path).mode&0o777)===0o600;

function parse(argv){
 const output={durationMinutes:MIN_DURATION_MINUTES,pollSeconds:1},seen=new Set();
 for(let index=0;index<argv.length;index+=1){const key=argv[index];if(!["--config","--duration-minutes","--poll-seconds"].includes(key)||!argv[index+1])fail("HR_ATTENDANCE_LAB_ARGUMENT_INVALID",key);const name=key.slice(2).replace(/-([a-z])/gu,(_match,letter)=>letter.toUpperCase());if(seen.has(name))fail("HR_ATTENDANCE_LAB_ARGUMENT_INVALID",key);seen.add(name);output[name]=argv[++index];}
 if(!output.config)fail("HR_ATTENDANCE_LAB_ARGUMENT_MISSING","--config");
 output.config=resolve(output.config);output.durationMinutes=Number(output.durationMinutes);output.pollSeconds=Number(output.pollSeconds);
 if(!Number.isInteger(output.durationMinutes)||output.durationMinutes<MIN_DURATION_MINUTES)fail("HR_ATTENDANCE_LAB_DURATION_INVALID",String(output.durationMinutes));
 if(!Number.isInteger(output.pollSeconds)||output.pollSeconds<1||output.pollSeconds>60)fail("HR_ATTENDANCE_LAB_POLL_INVALID",String(output.pollSeconds));
 return output;
}

function configForGate(configPath){
 if(!privateFile(configPath))fail("HR_ATTENDANCE_LAB_CONFIG_UNSAFE",configPath);
 const config=JSON.parse(readFileSync(configPath,"utf8")),credentials=config?.target?.credentialRoot;
 if(config?.profile!=="core_t0_t3"||config?.productionImport!=="HOLD"||typeof credentials!=="string")fail("HR_ATTENDANCE_LAB_CONFIG_INVALID","core lab hold config required");
 const credentialPath=resolve(credentials,"postgres.env");
 if(!privateFile(credentialPath))fail("HR_ATTENDANCE_LAB_CREDENTIAL_UNSAFE",credentialPath);
 const values=Object.fromEntries(readFileSync(credentialPath,"utf8").trim().split("\n").map(line=>{const at=line.indexOf("=");return[ line.slice(0,at),line.slice(at+1) ];}));
 if(!/^jinhu_hr_migration_lab_core_[a-z0-9_]{6,36}$/u.test(values.POSTGRES_DB??""))fail("HR_ATTENDANCE_LAB_DATABASE_INVALID","isolated database required");
 if(!Number.isInteger(config.target?.ports?.postgres)||config.target.ports.postgres<1024||config.target.ports.postgres>65535)fail("HR_ATTENDANCE_LAB_PORT_INVALID","postgres");
 return {credentialPath,postgresPort:config.target.ports.postgres};
}

function runAttendanceGate({credentialPath,postgresPort}){
 const result=spawnSync("sh",[resolve(ROOT,"scripts/run-hr-attendance-request-pg-gate.sh")],{cwd:ROOT,encoding:"utf8",env:{...process.env,POSTGRES_HOST:"127.0.0.1",POSTGRES_PORT:String(postgresPort),...Object.fromEntries(readFileSync(credentialPath,"utf8").trim().split("\n").map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}))}});
 if(result.status!==0)fail("HR_ATTENDANCE_LAB_GATE_FAILED",String(result.status??"signal"));
 const lines=`${result.stdout}\n${result.stderr}`.split("\n").filter(line=>/^(?:▶ |  ✔ |✔ |ℹ )/u.test(line));
 return {status:"PASS",outputLines:lines.length};
}

export async function runHrAttendanceRequestLab(input){
 const options=parse(input),gate=configForGate(options.config);
 let failure=null,checkpoint;
 try{
  checkpoint=await runCoreT0T3ContinuousLab({configPath:options.config,durationMinutes:options.durationMinutes,pollMilliseconds:options.pollSeconds*1000,stopAfter:"rollback_ready"});
  if(checkpoint.status!=="CHECKPOINT_READY"||checkpoint.state!=="rollback_ready")fail("HR_ATTENDANCE_LAB_CHECKPOINT_INVALID",checkpoint.state);
  const verified=runAttendanceGate(gate);
  const cleanup=await runCoreT0T3ContinuousLab({configPath:options.config,durationMinutes:options.durationMinutes,pollMilliseconds:options.pollSeconds*1000});
  if(cleanup.status!=="CONTRACT_PASS"||cleanup.state!=="cleaned"||cleanup.residualCount!==0)fail("HR_ATTENDANCE_LAB_CLEANUP_INVALID",cleanup.state);
  return {status:"CONTRACT_PASS",checkpointState:checkpoint.state,attendanceGate:verified,cleanupState:cleanup.state,residualCount:cleanup.residualCount,productionImport:"HOLD"};
 }catch(error){
  failure=error;
  if(checkpoint?.state==="rollback_ready"){
   try{await runCoreT0T3ContinuousLab({configPath:options.config,durationMinutes:options.durationMinutes,pollMilliseconds:options.pollSeconds*1000});}catch(cleanupError){fail("HR_ATTENDANCE_LAB_RECOVERY_FAILED",String(cleanupError?.code??"cleanup"));}
  }
  throw failure;
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runHrAttendanceRequestLab(process.argv.slice(2)).then(result=>process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error=>{process.stderr.write(`${error.code??"HR_ATTENDANCE_LAB_FAILED"}\n`);process.exitCode=1;});
}
