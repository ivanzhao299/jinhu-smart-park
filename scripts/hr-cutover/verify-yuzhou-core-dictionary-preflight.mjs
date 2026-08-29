#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyT1EventTypeDecision } from "./verify-yuzhou-t1-event-type-decision.mjs";

const SHA=/^[0-9a-f]{64}$/u;
const required=Object.freeze({employment_event_type:"employment_event_type",employment_event_state:"employment_event_state",contract_type:"contract_type",contract_state:"contract_state"});
const fail=code=>{throw new Error(code);};
const json=path=>JSON.parse(readFileSync(resolve(path),"utf8"));
export function verifyCoreDictionaryPreflight(packages){
 if(!packages||typeof packages!=="object"||Array.isArray(packages)||JSON.stringify(Object.keys(packages).sort())!==JSON.stringify(Object.keys(required).sort()))fail("CORE_DICTIONARY_PACKAGE_SET_INVALID");
 const results={},snapshots=new Set();
 for(const [key,code] of Object.entries(required)){
  const value=packages[key];if(!value||typeof value!=="object")fail("CORE_DICTIONARY_PACKAGE_MISSING");
  const result=key==="employment_event_type"?verifyT1EventTypeDecision(value):value;
  if(result.dictionaryCode!==code||result.productionImport!=="HOLD"||!SHA.test(result.sourceSnapshotSha256??""))fail("CORE_DICTIONARY_PACKAGE_INVALID");
  snapshots.add(result.sourceSnapshotSha256);results[key]=result;
 }
 if(snapshots.size!==1)fail("CORE_DICTIONARY_SOURCE_SNAPSHOT_DRIFT");
 return {status:"PASS",sourceSnapshotSha256:[...snapshots][0],packageCount:4,packages:Object.keys(required),productionImport:"HOLD",preflightSha256:createHash("sha256").update(`${JSON.stringify(results)}\n`).digest("hex")};
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{const args=process.argv.slice(2);if(args.length!==4)fail("CORE_DICTIONARY_ARGUMENTS_REQUIRED");const packages=Object.fromEntries(Object.keys(required).map((key,index)=>[key,json(args[index])]));process.stdout.write(`${JSON.stringify(verifyCoreDictionaryPreflight(packages))}\n`);}catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}}
