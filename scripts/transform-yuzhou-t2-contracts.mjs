#!/usr/bin/env node
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {basename,resolve} from "node:path";

const dir=resolve(process.argv[2]??"");
if(!basename(dir).startsWith("staging-"))throw Error("controlled staging directory is required");
const sha=value=>createHash("sha256").update(value).digest("hex");
const canon=value=>JSON.stringify(value,Object.keys(value).sort());
const safe=value=>JSON.stringify(value).replaceAll("\\","\\\\");
const read=name=>{
  const value=JSON.parse(readFileSync(resolve(dir,name),"utf8"));
  if(!Array.isArray(value))throw Error("extraction must be an array");
  return value;
};
const defs=[
  {raw:"contract-types.raw.json",out:"contract-types.jsonl",table:"dbo.compacttypecode",key:row=>String(row.typeCode??"").trim()},
  {raw:"contracts.raw.json",out:"contracts.jsonl",table:"dbo.compact",key:row=>String(row.contractNo??"").trim()},
  {raw:"contract-changes.raw.json",out:"contract-changes.jsonl",table:"dbo.compact_c",key:row=>`${String(row.contractNo??"").trim()}|${row.sequenceNo}`},
];
const summary={formatVersion:1,generatedAt:new Date().toISOString(),domains:{}};
for(const definition of defs){
  const seen=new Set(),rows=read(definition.raw).map(source=>{
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
