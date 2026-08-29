#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyT1EventTypeDecision } from "./verify-yuzhou-t1-event-type-decision.mjs";
import { verifyCoreDictionaryCapture } from "./capture-yuzhou-core-dictionary-receipt.mjs";

const SHA=/^[0-9a-f]{64}$/u;
const required=Object.freeze({employment_event_type:"employment_event_type",employment_event_state:"employment_event_state",contract_type:"contract_type",contract_state:"contract_state"});
const fail=code=>{throw new Error(code);};
const json=path=>JSON.parse(readFileSync(resolve(path),"utf8"));
const genericKeys=["formatVersion","artifactKind","sourceSystem","sourceSnapshotSha256","sourceCaptureSha256","dictionaryCode","sourceObject","sourceRecordCount","decisions","productionImport"];
const decisionKeys=["sourceValue","usageCount","decision","targetDomain","targetValue","reasonCode"];
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());

function verifyGenericDictionaryDecision(value, dictionaryCode){
 if(!exact(value,genericKeys))fail("CORE_DICTIONARY_PACKAGE_SHAPE_INVALID");
 if(value.formatVersion!==1||value.artifactKind!=="yuzhou_hr_dictionary_machine_decision"||value.sourceSystem!=="yuzhou-v10"||value.dictionaryCode!==dictionaryCode||typeof value.sourceObject!=="string"||!value.sourceObject||!SHA.test(value.sourceSnapshotSha256??"")||!SHA.test(value.sourceCaptureSha256??"")||!Number.isSafeInteger(value.sourceRecordCount)||value.sourceRecordCount<1||value.productionImport!=="HOLD"||!Array.isArray(value.decisions)||!value.decisions.length)fail("CORE_DICTIONARY_PACKAGE_INVALID");
 const sources=new Set();let usage=0;
 for(const row of value.decisions){
  if(!exact(row,decisionKeys)||typeof row.sourceValue!=="string"||!row.sourceValue||sources.has(row.sourceValue)||!Number.isSafeInteger(row.usageCount)||row.usageCount<1||!["map","quarantine"].includes(row.decision)||row.targetDomain!==dictionaryCode||typeof row.reasonCode!=="string"||!row.reasonCode)fail("CORE_DICTIONARY_PACKAGE_ITEM_INVALID");
  if((row.decision==="map"&&(typeof row.targetValue!=="string"||!row.targetValue))||(row.decision==="quarantine"&&row.targetValue!==null))fail("CORE_DICTIONARY_PACKAGE_ITEM_INVALID");
  sources.add(row.sourceValue);usage+=row.usageCount;
 }
 if(usage!==value.sourceRecordCount)fail("CORE_DICTIONARY_PACKAGE_CONSERVATION_FAILED");
 return {dictionaryCode:value.dictionaryCode,sourceSnapshotSha256:value.sourceSnapshotSha256,sourceCaptureSha256:value.sourceCaptureSha256,sourceObject:value.sourceObject,sourceRecordCount:value.sourceRecordCount,decisionSha256:createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex"),productionImport:"HOLD"};
}
export function verifyCoreDictionaryPreflight(packages){
 if(!packages||typeof packages!=="object"||Array.isArray(packages)||JSON.stringify(Object.keys(packages).sort())!==JSON.stringify(Object.keys(required).sort()))fail("CORE_DICTIONARY_PACKAGE_SET_INVALID");
 const results={},snapshots=new Set();
 for(const [key,code] of Object.entries(required)){
  const value=packages[key];if(!value||typeof value!=="object")fail("CORE_DICTIONARY_PACKAGE_MISSING");
  const result=key==="employment_event_type"?verifyT1EventTypeDecision(value):verifyGenericDictionaryDecision(value,code);
  if(result.dictionaryCode!==code||result.productionImport!=="HOLD"||!SHA.test(result.sourceSnapshotSha256??""))fail("CORE_DICTIONARY_PACKAGE_INVALID");
  snapshots.add(result.sourceSnapshotSha256);results[key]=result;
 }
 if(snapshots.size!==1)fail("CORE_DICTIONARY_SOURCE_SNAPSHOT_DRIFT");
 return {status:"PASS",sourceSnapshotSha256:[...snapshots][0],packageCount:4,packages:Object.keys(required),productionImport:"HOLD",preflightSha256:createHash("sha256").update(`${JSON.stringify(results)}\n`).digest("hex")};
}
export function verifyCoreDictionaryCaptureBinding(packages, receipt){
 const preflight=verifyCoreDictionaryPreflight(packages),capture=verifyCoreDictionaryCapture(receipt);
 if(preflight.sourceSnapshotSha256!==capture.sourceSnapshotSha256)fail("CORE_DICTIONARY_CAPTURE_SOURCE_DRIFT");
 for(const code of ["employment_event_state","contract_type","contract_state"]){
  const packageValue=packages[code],captureValue=capture.dictionaries[code];
  if(packageValue.sourceCaptureSha256!==capture.captureSha256||packageValue.sourceObject!==captureValue.sourceObject||packageValue.sourceRecordCount!==captureValue.sourceRecordCount)fail("CORE_DICTIONARY_CAPTURE_BINDING_INVALID");
 }
 return {...preflight,captureSha256:capture.captureSha256};
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{const args=process.argv.slice(2);if(args.length!==4)fail("CORE_DICTIONARY_ARGUMENTS_REQUIRED");const packages=Object.fromEntries(Object.keys(required).map((key,index)=>[key,json(args[index])]));process.stdout.write(`${JSON.stringify(verifyCoreDictionaryPreflight(packages))}\n`);}catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}}
