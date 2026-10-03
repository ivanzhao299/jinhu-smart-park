#!/usr/bin/env node
/* global process */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeYuzhouImportFromStaging } from "../hr-cutover/build-yuzhou-import-from-staging.mjs";
import { canonicalProfile } from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
const sha=v=>createHash("sha256").update(v).digest("hex");
const args=Object.fromEntries(process.argv.slice(2).reduce((out,v,i,all)=>i%2?out:[...out,[v,all[i+1]]],[]));
const root=resolve(args["--root"]),input=JSON.parse(readFileSync(args["--source"],"utf8"));
mkdirSync(root,{mode:0o700});
const put=(path,value)=>writeFileSync(path,`${JSON.stringify(value)}\n`,{mode:0o600});
const t0=join(root,"staging-t0"),t5=join(root,"staging-profile");mkdirSync(t0,{mode:0o700});mkdirSync(t5,{mode:0o700});
for(const [name,rows] of Object.entries({"departments.raw.json":[],"positions.raw.json":[],"employees.raw.json":input.sources.map(source=>({employeeCode:source.person,fullName:`Source ${source.person}`,legacyStatus:"1",hireDate:"2024-01-01",formalDate:"2024-03-31"})),"employee-job-states.raw.json":[],"job-state-code-metadata.raw.json":[],"job-state-codes.raw.json":[]}))put(join(t0,name),rows);
execFileSync(process.execPath,["scripts/transform-yuzhou-t0.mjs",t0],{cwd:resolve(import.meta.dirname,"../.."),stdio:"pipe"});
const records=input.sources.map(source=>({sourceTable:"dbo.person.core_residue",sourceKey:String(source.id),sourceIdentitySha256:sha(`dbo.person.core_residue\0${source.id}`),sourceRowSha256:sha(canonicalProfile(source)),source,employeeCode:source.person,domain:"employee_profile_raw",materialized:{idNumber:{encrypted:"enc:v1:synthetic-old-ciphertext-never-used"}}}));
writeFileSync(join(t5,"person_core.jsonl"),records.map(row=>JSON.stringify(row).replaceAll("\\","\\\\")).join("\n")+(records.length?"\n":""),{mode:0o600});
put(join(t5,"manifest.json"),{formatVersion:1,productionImport:"HOLD",domains:{person_core:{sourceObject:"dbo.person.core_residue",rows:records.length,file:"person_core.jsonl",fileSha256:sha(readFileSync(join(t5,"person_core.jsonl")))}}});
const ref=path=>({path,sha256:sha(readFileSync(path))});
const config={formatVersion:1,t0Manifest:ref(join(t0,"manifest.json")),profileManifest:ref(join(t5,"manifest.json")),includeEmployees:input.includeEmployees??false,extractedAt:"2026-10-04T12:00:00Z",sourceCustody:{sourceSnapshotSha256:sha("synthetic"),evidenceSha256:sha("synthetic custody"),declaration:"caller_attests_same_controlled_snapshot",targetScope:input.scope},outputDir:join(root,"output")};
if(input.includeEmployees){
 const helper=join(root,"job-state-helper");
 execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",helper,"--contract-type-id","00000000-0000-4000-8000-000000000001","--employee-only","yes"],{cwd:resolve(import.meta.dirname,"../.."),stdio:"pipe"});
 const decision=JSON.parse(readFileSync(join(helper,"input.json"),"utf8")).jobStateDecisionArtifact;
 put(join(root,"job-state.json"),decision);config.jobStateDecisionArtifact=ref(join(root,"job-state.json"));
}
if(input.witness){put(join(root,"witness.json"),input.witness);config.profileBaselineWitness=ref(join(root,"witness.json"));}
put(join(root,"config.json"),config);
process.stdout.write(`${JSON.stringify(materializeYuzhouImportFromStaging(join(root,"config.json")))}\n`);
