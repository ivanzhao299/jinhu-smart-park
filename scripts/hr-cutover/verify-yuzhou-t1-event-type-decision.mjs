#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA=/^[0-9a-f]{64}$/u, values=new Set(["start_probation","transfer","depart","resume"]), keys=["formatVersion","artifactKind","sourceSystem","sourceSnapshotSha256","dictionaryCode","sourceTable","sourceRecordCount","decisions","productionImport"];
const fail=code=>{throw new Error(code);};
export function verifyT1EventTypeDecision(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))fail("T1_EVENT_TYPE_DECISION_SHAPE_INVALID");
 if(value.formatVersion!==1||value.artifactKind!=="yuzhou_t1_employment_event_type_machine_decision"||value.sourceSystem!=="yuzhou-v10"||!SHA.test(value.sourceSnapshotSha256)||value.dictionaryCode!=="employment_event_type"||value.sourceTable!=="dbo.readjust.readjusttype"||value.sourceRecordCount!==6887||value.productionImport!=="HOLD"||!Array.isArray(value.decisions)||value.decisions.length!==4)fail("T1_EVENT_TYPE_DECISION_INVALID");
 const sources=new Set(),targets=new Set();let usage=0;
 for(const row of value.decisions){if(!row||typeof row!=="object"||Array.isArray(row)||JSON.stringify(Object.keys(row).sort())!==JSON.stringify(["sourceValue","usageCount","decision","targetDomain","targetValue","reasonCode"].sort())||typeof row.sourceValue!=="string"||!row.sourceValue||sources.has(row.sourceValue)||!Number.isSafeInteger(row.usageCount)||row.usageCount<1||row.decision!=="map"||row.targetDomain!=="employment_event_type"||!values.has(row.targetValue)||targets.has(row.targetValue)||row.reasonCode!=="ONLINE_LIFECYCLE_EQUIVALENT")fail("T1_EVENT_TYPE_DECISION_ITEM_INVALID");sources.add(row.sourceValue);targets.add(row.targetValue);usage+=row.usageCount;}
 if(usage!==value.sourceRecordCount)fail("T1_EVENT_TYPE_DECISION_CONSERVATION_FAILED");
 return {dictionaryCode:value.dictionaryCode,sourceSnapshotSha256:value.sourceSnapshotSha256,sourceRecordCount:value.sourceRecordCount,decisionSha256:createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex"),productionImport:"HOLD"};
}
export function verifyT1EventTypeStaging(decision,types){
 const verified=verifyT1EventTypeDecision(decision);
 if(!Array.isArray(types)||types.length!==decision.decisions.length)fail("T1_EVENT_TYPE_STAGING_INVALID");
 const expected=new Map(decision.decisions.map(row=>[row.sourceValue,row.usageCount]));
 for(const row of types){if(!row||typeof row!=="object"||Object.keys(row).length!==2||typeof row.sourceValue!=="string"||!Number.isSafeInteger(row.usageCount)||expected.get(row.sourceValue)!==row.usageCount)fail("T1_EVENT_TYPE_STAGING_DRIFT");expected.delete(row.sourceValue);}
 if(expected.size)fail("T1_EVENT_TYPE_STAGING_DRIFT");return verified;
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{const input=JSON.parse(readFileSync(resolve(process.argv[2]),"utf8")),types=process.argv[3]?JSON.parse(readFileSync(resolve(process.argv[3]),"utf8")):null;process.stdout.write(`${JSON.stringify(types?verifyT1EventTypeStaging(input,types):verifyT1EventTypeDecision(input))}\n`);}catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}}
