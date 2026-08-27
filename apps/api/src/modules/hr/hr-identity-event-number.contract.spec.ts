import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { HrEmployeeEntity,HrEmploymentEventEntity } from "./entities/hr.entities";

const root=resolve(__dirname,"../../../../..");
const migration=readFileSync(resolve(root,"database/migrations/000266_hr_employee_identity_event_number.sql"),"utf8");
const service=readFileSync(resolve(root,"apps/api/src/modules/hr/hr.service.ts"),"utf8");

test("employee code is unique across all history and immutable after allocation",()=>{
 assert.match(migration,/CREATE UNIQUE INDEX uq_hr_employee_scope_code\s+ON hr_employee\(tenant_id, park_id, employee_code\);/u);
 assert.match(migration,/HR_EMPLOYEE_CODE_HISTORY_CONFLICT/u);
 assert.match(migration,/trg_hr_employee_code_immutable/u);
 assert.match(service,/employeeCode:dto\.employeeCode\}\}\)\)throw new ConflictException\("Employee code has already been allocated and cannot be reused"\)/u);
 assert.match(service,/dto\.employeeCode!==row\.employeeCode/u);
 const index=getMetadataArgsStorage().indices.find(item=>item.target===HrEmployeeEntity&&JSON.stringify(item.columns).includes("employeeCode"));
 assert.equal(index?.unique,true);
 assert.equal(index?.where,undefined);
});

test("online lifecycle events receive immutable Yuzhou-compatible JZ/DZ/LZ/FZ numbers",()=>{
 for(const prefix of ["JZ","DZ","LZ","FZ"])assert.match(migration,new RegExp(`'${prefix}'`));
 assert.match(migration,/pg_advisory_xact_lock/u);
 assert.match(migration,/HR_EMPLOYMENT_EVENT_NO_EXHAUSTED/u);
 assert.match(migration,/trg_hr_employment_event_no/u);
 assert.match(migration,/\^JZ\[0-9\]\{10\}\$/u);
 assert.match(migration,/\^DZ\[0-9\]\{10\}\$/u);
 assert.match(migration,/\^LZ\[0-9\]\{10\}\$/u);
 assert.match(migration,/\^FZ\[0-9\]\{10\}\$/u);
 const column=getMetadataArgsStorage().columns.find(item=>item.target===HrEmploymentEventEntity&&item.propertyName==="eventNo");
 assert.equal(column?.options.name,"event_no");
 assert.equal(column?.options.nullable,true);
});

test("historical event identity remains exact while online sequence is separate",()=>{
 assert.match(migration,/SET event_no = legacy_event_no/u);
 assert.match(migration,/IF NEW\.is_historical_import THEN\s+NEW\.event_no := coalesce\(NEW\.event_no, NEW\.legacy_event_no\)/u);
 assert.match(migration,/event_type IN \('transfer', 'suspend'\) THEN 'DZ'/u);
 assert.match(migration,/to_char\(NEW\.effective_date, 'YYYYMM'\)/u);
});
