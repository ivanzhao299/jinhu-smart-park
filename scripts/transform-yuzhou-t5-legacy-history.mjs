#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const dir=resolve(process.argv[2]??"");
if(!basename(dir).startsWith("staging-")) throw Error("controlled staging directory is required");
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
const read=name=>{const value=JSON.parse(readFileSync(resolve(dir,name),"utf8"));if(!Array.isArray(value))throw Error(`${name} must be an array`);return value;};
const identity=(table,key,source,extra={})=>({sourceTable:`dbo.${table}`,sourceKey:String(key),sourceIdentitySha256:sha(`dbo.${table}\0${key}`),sourceRowSha256:sha(canonical(source)),source,...extra});
// PostgreSQL COPY text consumes backslash escapes before jsonb parsing, so preserve
// every JSON escape by doubling the transport-layer backslash.
const write=(name,rows)=>{const path=resolve(dir,name);writeFileSync(path,rows.map(row=>JSON.stringify(row).replaceAll("\\","\\\\")).join("\n")+(rows.length?"\n":""),{mode:0o600});chmodSync(path,0o600);return sha(readFileSync(path));};
const expected={accept:0,family:4560,his:375,knowhow:6,ticket:237,photo:2949,docs:1003,course:0,train:0,trainhis:2,jobtrain:0,bonuscode:8,bonusrecord:0,jch_1:0};
const keyFor={accept:"id",family:"id",his:"id",knowhow:"id",ticket:"id",photo:"id",docs:"id",course:"course",train:"id",trainhis:"id",jobtrain:"id",bonuscode:"bonus",bonusrecord:"id",jch_1:"id"};
const domainFor={accept:"candidate",family:"family",his:"experience",knowhow:"skill",ticket:"credential",course:"training_course",train:"training_history",trainhis:"training_history",jobtrain:"training_course",bonuscode:"reward_category",bonusrecord:"reward_history",jch_1:"reward_history"};
const employeeCodeFor={family:"person",knowhow:"person",ticket:"person",train:"person",trainhis:"person",bonusrecord:"person"};
const catalog=read("catalog.raw.json");
if(catalog.some(item=>item.table==="jch_1")) throw Error("dbo.jch_1 now exists; freeze an explicit column contract before extraction");
const requiredCatalogTables=["accept","bonuscode","bonusrecord","course","docs","family","his","jobtrain","knowhow","person","ticket","train","trainhis"];
for(const table of requiredCatalogTables)if(!catalog.some(item=>item.schema==="dbo"&&item.table===table))throw Error(`required source object dbo.${table} is absent`);
const domains={};
for(const [name,count] of Object.entries(expected)){
  const source=read(`${name}.raw.json`);
  if(source.length!==count) throw Error(`${name} count drift: expected ${count}, got ${source.length}`);
  const key=keyFor[name]; const seen=new Set();
  const rows=source.map(row=>{const value=row[key];if(value===null||value===undefined||String(value)==="")throw Error(`${name} missing stable key`);if(seen.has(String(value)))throw Error(`${name} duplicate stable key`);seen.add(String(value));
    if(name==="photo"){
      const detected=/^FFD8FF/i.test(row.magicPrefix??"")?"image/jpeg":/^89504E470D0A1A0A/i.test(row.magicPrefix??"")?"image/png":/^47494638/i.test(row.magicPrefix??"")?"image/gif":/^424D/i.test(row.magicPrefix??"")?"image/bmp":row.actualSize>0?"application/octet-stream":null;
      return identity("person.photo",value,row,{employeeCode:String(row.person??"").trim(),fileRole:"employee_photo",legacyPathSha256:row.photofile?sha(String(row.photofile)):null,contentSha256:row.contentSha256?.toLowerCase()??null,declaredSize:row.photosize??null,actualSize:row.actualSize??null,declaredMime:null,detectedMime:detected,readabilityStatus:row.actualSize>0?"readable":"empty"});
    }
    if(name==="docs"){
      const detected=/^25504446/i.test(row.magicPrefix??"")?"application/pdf":/^FFD8FF/i.test(row.magicPrefix??"")?"image/jpeg":/^89504E470D0A1A0A/i.test(row.magicPrefix??"")?"image/png":row.actualSize>0?"application/octet-stream":null;
      return identity(name,value,row,{fileRole:"employee_document",legacyPathSha256:(row.FPath||row.fName)?sha(`${row.FPath??""}\0${row.fName??""}`):null,contentSha256:row.contentSha256?.toLowerCase()??null,declaredSize:row.fSize??null,actualSize:row.actualSize??null,declaredMime:row.FType||null,detectedMime:detected,readabilityStatus:row.actualSize>0?"readable":(row.FPath?"path_reference_only":"empty")});
    }
    return identity(name,value,row,{domain:domainFor[name],employeeCode:employeeCodeFor[name]?String(row[employeeCodeFor[name]]??"").trim():null});
  });
  const file=`${name}.jsonl`; domains[name]={sourceObject:`dbo.${name==="photo"?"person.photo":name}`,rows:rows.length,file,fileSha256:write(file,rows),objectStatus:name==="jch_1"?"absent":rows.length===0?"empty":"present"};
}
const catalogSha256=sha(canonical(catalog));
const business={formatVersion:1,catalogSha256,domains};
const businessSha256=sha(canonical(business));
const manifest={...business,businessSha256,generatedAt:new Date().toISOString(),sensitive:true,productionImport:"HOLD"};
const manifestPath=resolve(dir,"manifest.json");writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{mode:0o600});chmodSync(manifestPath,0o600);
console.log(`YUZHOU_T5_TRANSFORM_OK business_sha256=${businessSha256} rows=${Object.values(domains).reduce((sum,item)=>sum+item.rows,0)}`);
