import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../..");
const script=readFileSync(resolve(root,"scripts/run-hr-attendance-request-pg-gate.sh"),"utf8");

test("attendance PostgreSQL gate is confined to an isolated loopback migration lab and covers calculation provenance",()=>{
 for(const value of ["POSTGRES_HOST","POSTGRES_PORT","POSTGRES_DB","POSTGRES_USER","POSTGRES_PASSWORD","127.0.0.1|localhost|::1","jinhu_hr_migration_lab_core_","HR_ATTENDANCE_REQUEST_PG_REQUIRED=1","HR_ATTENDANCE_CALC_PG_REQUIRED=1","hr-attendance-request.pg.spec.ts","hr-attendance-calculation.pg.spec.ts"])assert.match(script,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 assert.doesNotMatch(script,/prod:deploy|docker compose up|db:migrate/u);
});
