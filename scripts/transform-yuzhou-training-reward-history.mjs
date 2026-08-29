#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const stage=resolve(process.argv[2]??"");
if(!basename(stage).startsWith("staging-"))throw Error("controlled staging directory is required");
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
const read=name=>{const value=JSON.parse(readFileSync(resolve(stage,name),"utf8"));if(!Array.isArray(value))throw Error(`${name} must be an array`);return value;};
const write=(name,rows)=>{const path=resolve(stage,name),data=rows.map(row=>JSON.stringify(row).replaceAll("\\","\\\\")).join("\n")+(rows.length?"\n":"");writeFileSync(path,data,{mode:0o600});chmodSync(path,0o600);return sha(readFileSync(path));};
const date=value=>{const match=/^(\d{4}-\d{2}-\d{2})T/.exec(String(value??""));return match?.[1]??null;};
const text=value=>value===null||value===undefined?null:String(value).trim()||null;
const meta=JSON.parse(readFileSync(resolve(stage,"source-meta.json"),"utf8"));
const catalog=read("catalog.raw.json"),trainhis=read("trainhis.raw.json"),bonuscode=read("bonuscode.raw.json");
if(meta.sourceReadOnly!==1||catalog.length!==2||!catalog.every(row=>["trainhis","bonuscode"].includes(row.table)&&Array.isArray(row.columns)))throw Error("training reward source identity drift");
const seen=new Set(),identity=(table,key,row)=>{const sourceKey=String(key??"").trim();if(!sourceKey||seen.has(`${table}:${sourceKey}`))throw Error(`invalid stable source key for ${table}`);seen.add(`${table}:${sourceKey}`);return {sourceTable:`dbo.${table}`,sourceKey,sourceIdentitySha256:sha(`dbo.${table}\0${sourceKey}`),sourceRowSha256:sha(canonical(row))};};
const training=trainhis.map(row=>{const base=identity("trainhis",row.id,row),courseName=text(row.coursename),startDate=date(row.startdate),endDate=date(row.enddate),hours=Number(row.hours);const eligible=Boolean(text(row.person)&&courseName&&courseName.length<=160&&startDate&&endDate&&endDate>=startDate&&Number.isInteger(hours)&&hours>0&&hours<=999999);return {...base,domain:"training_history",employeeCode:text(row.person),status:eligible?"eligible":"quarantined",quarantineCode:eligible?null:"TRAINING_HISTORY_INCOMPLETE",source:{courseName,startDate,endDate,hours:Number.isInteger(hours)?hours:null,attainment:text(row.attainment),test:text(row.test)}};});
const rewards=bonuscode.map(row=>{const base=identity("bonuscode",row.bonus,row),code=text(row.bonus),name=text(row.bonusname),impactRaw=text(row.addsub),impact=impactRaw===null?NaN:Number(impactRaw),kind=impact>0?"reward":impact<0?"discipline":null,eligible=Boolean(code&&code.length<=64&&name&&name.length<=120&&kind);return {...base,domain:"reward_category",employeeCode:null,status:eligible?"eligible":"quarantined",quarantineCode:eligible?null:"REWARD_CATEGORY_IMPACT_UNRESOLVED",source:{code,name,impact:Number.isFinite(impact)?impactRaw:null,kind}};});
const trainingFile=write("training-history.jsonl",training),rewardFile=write("reward-category.jsonl",rewards);
const summary={formatVersion:1,artifactKind:"yuzhou_training_reward_history_staging",operationMode:"read_only_extract",sourceReadOnly:true,catalogSha256:sha(canonical(catalog)),domains:{trainingHistory:{sourceRows:training.length,eligibleRows:training.filter(row=>row.status==="eligible").length,quarantinedRows:training.filter(row=>row.status!=="eligible").length,file:"training-history.jsonl",fileSha256:trainingFile},rewardCategories:{sourceRows:rewards.length,eligibleRows:rewards.filter(row=>row.status==="eligible").length,quarantinedRows:rewards.filter(row=>row.status!=="eligible").length,file:"reward-category.jsonl",fileSha256:rewardFile}},productionImport:"HOLD"};
writeFileSync(resolve(stage,"manifest.json"),`${JSON.stringify(summary,null,2)}\n`,{mode:0o600});chmodSync(resolve(stage,"manifest.json"),0o600);
console.log(JSON.stringify({status:"PASS",domains:Object.fromEntries(Object.entries(summary.domains).map(([key,value])=>[key,{sourceRows:value.sourceRows,eligibleRows:value.eligibleRows,quarantinedRows:value.quarantinedRows}])),productionImport:"HOLD"}));
