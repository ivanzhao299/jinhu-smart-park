#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const SHA=/^[0-9a-f]{64}$/u;
const CONTRACT=Object.freeze({person_core:["employee_profile_raw","dbo.person.core_residue",2949],family:["family","dbo.family",4560],knowhow:["skill","dbo.knowhow",6],ticket:["credential","dbo.ticket",237]});
const fail=message=>{throw new Error(`T5_NONFILE_DOMAIN_ITEMS_INVALID: ${message}`);};
export function items(manifest){if(!manifest||manifest.artifactKind!=="yuzhou_t5_nonfile_materialization_stage"||manifest.productionImport!=="HOLD"||manifest.sourceRows!==7752||JSON.stringify(manifest.filesExcluded)!==JSON.stringify(["photo","docs"]))fail("manifest boundary");const names=Object.keys(CONTRACT);if(JSON.stringify(Object.keys(manifest.domains??{}).sort())!==JSON.stringify(names.sort()))fail("domain set");return names.map(name=>{const [domain,sourceObject,rows]=CONTRACT[name],item=manifest.domains[name];if(!item||item.sourceObject!==sourceObject||item.rows!==rows||!SHA.test(item.fileSha256??""))fail(name);return {domain,sourceObject,extractedCount:rows,checksumSha256:item.fileSha256,status:"running"};});}
if(process.argv[1]===new URL(import.meta.url).pathname){if(process.argv.length!==3)fail("manifest path");process.stdout.write(JSON.stringify(items(JSON.parse(readFileSync(resolve(process.argv[2]),"utf8")))));}
