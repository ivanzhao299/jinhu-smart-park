import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/hr-cutover/run-hr-attendance-request-lab.mjs"),"utf8");

test("attendance request lab runner keeps a five-hour capacity, isolated gate and cleanup contract",()=>{
 for(const value of ["argv[0]===\"--\"?argv.slice(1):argv","MIN_DURATION_MINUTES=300","stopAfter:\"rollback_ready\"","run-hr-attendance-request-pg-gate.sh","POSTGRES_HOST:\"127.0.0.1\"","attendance-request-lab-summary.json","writeSummary(gate.summaryPath,result)","HR_ATTENDANCE_LAB_CLEANUP_INVALID","residualCount!==0","productionImport:\"HOLD\""])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.doesNotMatch(script,/prod:deploy|production-import|T4|T5/u);
});
