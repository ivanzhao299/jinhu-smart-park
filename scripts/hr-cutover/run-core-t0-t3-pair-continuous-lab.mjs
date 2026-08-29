#!/usr/bin/env node
/* global process */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareCoreT0T3Facts, validateCorePairIsolation, verifyCoreT0T3Facts } from "./core-t0-t3-rehearsal.mjs";
import { runCoreT0T3ContinuousLab } from "./run-core-t0-t3-continuous-lab.mjs";
import { runCoreTechnicalUat } from "./run-core-t0-t3-technical-uat.mjs";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const fail=(code,detail)=>{const error=new Error(`${code}: ${detail}`);error.code=code;throw error;};
const safeCode=error=>/^[A-Z][A-Z0-9_]+$/u.test(error?.code??"")?error.code:"CORE_PAIR_CONTINUOUS_FAILED";
const privateMode=path=>(statSync(path).mode&0o777)===0o600;
const directoryMode=path=>(statSync(path).mode&0o777)===0o700;

function privateJson(path,label){
 const requested=resolve(path);if(!existsSync(requested)||lstatSync(requested).isSymbolicLink()||!statSync(requested).isFile()||!privateMode(requested))fail("CORE_PAIR_CONTINUOUS_ARTIFACT_UNSAFE",label);
 try{return JSON.parse(readFileSync(requested,"utf8"));}catch{fail("CORE_PAIR_CONTINUOUS_ARTIFACT_INVALID",label);}
}
function readFacts(config){return verifyCoreT0T3Facts(privateJson(resolve(dirname(config.target.runtimeRoot),"audit","core-facts.json"),`${config.rehearsal}:facts`),config);}
function assertCheckpoint(result,rehearsal){if(result?.status!=="CHECKPOINT_READY"||result?.state!=="rollback_ready")fail("CORE_PAIR_CONTINUOUS_CHECKPOINT_FAILED",rehearsal);}
function assertUat(result,rehearsal){if(result?.status!=="PASS"||result?.productionImport!=="HOLD")fail("CORE_PAIR_CONTINUOUS_UAT_FAILED",rehearsal);}
function assertCleanup(result,rehearsal){if(result?.status!=="CONTRACT_PASS"||result?.state!=="cleaned"||result?.residualCount!==0)fail("CORE_PAIR_CONTINUOUS_CLEANUP_FAILED",rehearsal);}

export function parseCorePairContinuousArgs(argv){
 const input=argv[0]==="--"?argv.slice(1):argv,args={},allowed=new Set(["--config-a","--config-b","--summary"]);
 for(let index=0;index<input.length;index+=1){const key=input[index];if(!allowed.has(key)||!input[index+1]||allowed.has(input[index+1]))fail("CORE_PAIR_CONTINUOUS_ARGUMENT_INVALID",key);const name=key.slice(2).replace(/-([a-z])/gu,(_match,letter)=>letter.toUpperCase());if(Object.hasOwn(args,name))fail("CORE_PAIR_CONTINUOUS_ARGUMENT_INVALID",key);args[name]=resolve(input[++index]);}
 for(const key of ["configA","configB","summary"])if(!args[key])fail("CORE_PAIR_CONTINUOUS_ARGUMENT_INVALID",key);
 return args;
}

export async function runCoreT0T3PairContinuous({configAPath,configBPath,summaryPath},{runner=runCoreT0T3ContinuousLab,technicalUat=runCoreTechnicalUat}={}){
 const configA=privateJson(configAPath,"config A"),configB=privateJson(configBPath,"config B");validateCorePairIsolation(configA,configB);
 const started=[],cleanup=[];let primary,result;
 try{
  const resultA=await runner({configPath:configAPath,durationMinutes:300,pollMilliseconds:1000,stopAfter:"rollback_ready"});started.push({config:configA,path:configAPath});assertCheckpoint(resultA,"A");
  const resultB=await runner({configPath:configBPath,durationMinutes:300,pollMilliseconds:1000,stopAfter:"rollback_ready"});started.push({config:configB,path:configBPath});assertCheckpoint(resultB,"B");
  const comparison=compareCoreT0T3Facts(readFacts(configA),readFacts(configB));
  const uatA=await technicalUat(configAPath),uatB=await technicalUat(configBPath);assertUat(uatA,"A");assertUat(uatB,"B");
  result={formatVersion:1,profile:"core_t0_t3",status:"CONTRACT_PASS",triple:configA.triple,comparison,technicalUat:{a:{status:uatA.status,observedChecks:uatA.observedChecks},b:{status:uatB.status,observedChecks:uatB.observedChecks}},cleanup,productionImport:"HOLD"};
 }catch(error){primary=error;}
 finally{
  for(const item of started.toReversed()){try{const result=await runner({configPath:item.path,durationMinutes:300,pollMilliseconds:1000});assertCleanup(result,item.config.rehearsal);cleanup.push({rehearsal:item.config.rehearsal,status:result.status,residualCount:result.residualCount});}catch(error){cleanup.push({rehearsal:item.config.rehearsal,status:safeCode(error)});if(!primary)primary=error;}}
 }
 if(primary)throw primary;
 if(!result)fail("CORE_PAIR_CONTINUOUS_INVARIANT","completed without result");
 return result;
}

function ensureSummary(path){const absolute=resolve(path),parent=dirname(absolute);if(!existsSync(parent)||lstatSync(parent).isSymbolicLink()||!statSync(parent).isDirectory()||!directoryMode(parent)||existsSync(absolute))fail("CORE_PAIR_CONTINUOUS_SUMMARY_UNSAFE",absolute);return absolute;}
function currentHead(){const result=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",stdio:"pipe"});if(result.status!==0||!/^[0-9a-f]{40}\n$/u.test(result.stdout))fail("CORE_PAIR_CONTINUOUS_GIT_INVALID","HEAD");return result.stdout.trim();}

async function main(){
 const args=parseCorePairContinuousArgs(process.argv.slice(2)),configA=privateJson(args.configA,"config A"),configB=privateJson(args.configB,"config B"),head=currentHead();
 if(configA.triple.codeSha!==head||configB.triple.codeSha!==head)fail("CORE_PAIR_CONTINUOUS_TRIPLE_INVALID","checkout code SHA differs from config");
 const summary=ensureSummary(args.summary);
 try{const result=await runCoreT0T3PairContinuous({configAPath:args.configA,configBPath:args.configB,summaryPath:summary});writeFileSync(summary,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});chmodSync(summary,0o600);if(!privateMode(summary))fail("CORE_PAIR_CONTINUOUS_SUMMARY_UNSAFE",summary);process.stdout.write(`${JSON.stringify({status:result.status,summary,productionImport:"HOLD"})}\n`);}
 catch(error){const result={formatVersion:1,profile:"core_t0_t3",status:"HOLD",errorCode:safeCode(error),productionImport:"HOLD"};writeFileSync(summary,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});chmodSync(summary,0o600);if(!privateMode(summary))fail("CORE_PAIR_CONTINUOUS_SUMMARY_UNSAFE",summary);throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`${safeCode(error)}\n`);process.exitCode=1;});
