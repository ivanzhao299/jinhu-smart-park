import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const source=readFileSync(resolve(import.meta.dirname,"../../scripts/hr-cutover/run-training-reward-continuous-lab.mjs"),"utf8");
test("training reward continuous runner preserves current source binding and two-pass isolated cleanup",()=>{
 for(const value of ["core_t0_t3","sourceCatalogSha256","sourceBusinessSha256","mappingContractSha256","stopAfter:\"rollback_ready\"","yztr-${stem}-load","yztr-${stem}-reload","provision-yuzhou-t5-nonfile-actor.sh","load-yuzhou-training-reward-history.sh","rollback-yuzhou-training-reward-history.sh","rollback-yuzhou-t5-nonfile-actor.sh","TRAINING_REWARD_SOURCE_BINDING_DRIFT","TRAINING_REWARD_CORE_CLEANUP_FAILED","residualCount=0","productionImport:\"HOLD\""])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 for(const forbidden of ["hr_payroll_run","hr_payslip","sys_file","hr_employee_document","productionImport:\"READY\""])assert.doesNotMatch(source,new RegExp(forbidden));
});
