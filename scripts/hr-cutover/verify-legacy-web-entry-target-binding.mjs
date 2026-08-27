#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {LegacyWebEntryBindingError,verifyLegacyWebEntryTargetBinding} from "./legacy-web-entry-target-binding-lib.mjs";
const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
let contract=resolve(root,"scripts/hr-cutover/contracts/legacy-web-entry-target-binding-v1.json"),json=false;
for(let index=2;index<process.argv.length;index++){
  if(process.argv[index]==="--contract"&&process.argv[index+1])contract=resolve(process.argv[++index]);
  else if(process.argv[index]==="--json")json=true;
  else throw new Error(`ARGUMENT_INVALID: ${process.argv[index]}`);
}
try{
  const report=verifyLegacyWebEntryTargetBinding(JSON.parse(readFileSync(contract,"utf8")),{root});
  console.log(json?JSON.stringify(report,null,2):`Yuzhou Web entry binding PASS: entries=${report.entries} mapped=${report.mapped} gaps=${report.gaps} roleMatrix=${report.roleMatrixVerified} import=${report.productionImport}`);
}catch(error){
  const code=error instanceof LegacyWebEntryBindingError?error.code:"LEGACY_WEB_ENTRY_BINDING_FAILED";
  console.error(`${code}: ${error.message}`);process.exitCode=1;
}
