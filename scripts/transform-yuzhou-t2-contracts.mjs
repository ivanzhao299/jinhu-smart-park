#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {basename,resolve} from "node:path";

const dir=resolve(process.argv[2]??"");
if(!basename(dir).startsWith("staging-"))throw Error("controlled staging directory is required");
const sha=value=>createHash("sha256").update(value).digest("hex");
const canon=value=>JSON.stringify(value,Object.keys(value).sort());
const safe=value=>JSON.stringify(value).replaceAll("\\","\\\\");
const isoDate=value=>{
  const text=String(value??"").trim();
  if(!text)return null;
  const parsed=new Date(`${text}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw Error(`dbo.compact invalid ISO date`);
  return text;
};
const nonNegativeInteger=(value,label)=>{
  const text=String(value??"").trim();
  if(!text)return null;
  if(!/^\d+$/.test(text))throw Error(`dbo.compact invalid ${label}`);
  const parsed=Number(text);
  if(!Number.isSafeInteger(parsed))throw Error(`dbo.compact invalid ${label}`);
  return parsed;
};
const inclusiveMonths=(startDate,endDate)=>{
  if(!startDate||!endDate)return null;
  const start=new Date(`${startDate}T00:00:00Z`),end=new Date(`${endDate}T00:00:00Z`);
  if(end<start)throw Error("dbo.compact invalid contract date range");
  const months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()+(end.getUTCDate()>=start.getUTCDate()?1:0);
  return months;
};
const materializeContractSemantics=source=>{
  const startDate=isoDate(source.startDate),endDate=isoDate(source.endDate),signedDate=isoDate(source.signedDate);
  const derivedContractTermMonths=inclusiveMonths(startDate,endDate),legacyRenewalCount=nonNegativeInteger(source.continuetimes,"continuetimes");
  return {...source,derivedContractTermMonths,legacyRenewalCount,contractTermDecision:derivedContractTermMonths===null?"NO_FIXED_DATE_BOUNDARY":"DERIVED_FROM_DATE_BOUNDARY",signatureDateDecision:signedDate===null?"ABSENT":"DIRECT_LEGACY_DATE",renewalCountDecision:legacyRenewalCount===null?"ABSENT_DEFAULT_ZERO":"DIRECT_NONNEGATIVE_LEGACY_COUNT"};
};
const read=name=>{
  const value=JSON.parse(readFileSync(resolve(dir,name),"utf8"));
  if(!Array.isArray(value))throw Error("extraction must be an array");
  return value;
};
const defs=[
  {raw:"contract-types.raw.json",out:"contract-types.jsonl",table:"dbo.compacttypecode",key:row=>String(row.typeCode??"").trim()},
  {raw:"contracts.raw.json",out:"contracts.jsonl",table:"dbo.compact",key:row=>String(row.contractNo??"").trim()},
  {raw:"contract-changes.raw.json",out:"contract-changes.jsonl",table:"dbo.compact_c",key:row=>[row.contractNo,row.employeeCode,row.startDate,row.endDate,row.signedAt].map(value=>String(value??"").trim()).join("|")},
];
const summary={formatVersion:1,generatedAt:new Date().toISOString(),domains:{}};
for(const definition of defs){
  const seen=new Set(),rows=read(definition.raw).map(raw=>{
    const source=definition.table==="dbo.compact"?materializeContractSemantics(raw):raw;
    const key=definition.key(source);
    if(!key||seen.has(key))throw Error(`${definition.table} blank or duplicate key`);
    seen.add(key);
    return {sourceTable:definition.table,sourceKey:key,sourceIdentitySha256:sha(`${definition.table}\0${key}`),sourceRowSha256:sha(canon(source)),source};
  });
  const path=resolve(dir,definition.out);
  writeFileSync(path,`${rows.map(safe).join("\n")}\n`,{mode:0o600});
  summary.domains[definition.table]={rows:rows.length,file:definition.out,fileSha256:sha(readFileSync(path))};
}
const statePath=resolve(dir,"contract-states.raw.json"),states=read("contract-states.raw.json");
summary.domains["dbo.compact.state"]={rows:states.length,file:"contract-states.raw.json",fileSha256:sha(readFileSync(statePath))};
writeFileSync(resolve(dir,"manifest.json"),`${JSON.stringify(summary,null,2)}\n`,{mode:0o600});
