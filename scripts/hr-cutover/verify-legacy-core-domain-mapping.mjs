#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLegacyAtomicInventory } from "./legacy-atomic-inventory-lib.mjs";
import { LegacyCoreMappingError,verifyLegacyCoreDomainMapping } from "./legacy-core-domain-mapping-lib.mjs";

const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
let inventoryPath=null,mappingPath=resolve(root,"scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json"),json=false;
for(let i=2;i<process.argv.length;i+=1){const arg=process.argv[i];if(arg==="--inventory"&&process.argv[i+1])inventoryPath=resolve(process.argv[++i]);else if(arg==="--mapping"&&process.argv[i+1])mappingPath=resolve(process.argv[++i]);else if(arg==="--json")json=true;else throw new Error(`ARGUMENT_INVALID: ${arg}`)}
if(!inventoryPath)throw new Error("ARGUMENT_INVALID: --inventory is required");
try{
  const inventory=JSON.parse(readFileSync(inventoryPath,"utf8")),mapping=JSON.parse(readFileSync(mappingPath,"utf8"));
  validateLegacyAtomicInventory(inventory);
  const report=verifyLegacyCoreDomainMapping(inventory,mapping,{root});
  if(json)console.log(JSON.stringify(report,null,2));else console.log(`Yuzhou core reviewed mapping PASS: tables=${report.selectedTables} fields=${report.fields} mapped=${report.mappedFields} gaps=${report.gapFields} rules=${report.rules} ruleGaps=${report.gapRules}`);
}catch(error){const code=error instanceof LegacyCoreMappingError?error.code:"LEGACY_CORE_MAPPING_FAILED";console.error(`${code}: ${error.message}`);process.exitCode=1}
