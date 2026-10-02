import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { EntityManager } from "typeorm";
import { CreateHrPayrollReconciliationDto, type HrPayrollInsuranceSourceDto } from "./dto/hr-payroll-history.dto";
import { assertPayrollInsuranceChoices, lockModernPayrollInsuranceSources } from "./hr-payroll-insurance-source";
const employeeId="10000000-0000-4000-8000-000000000001", sourceId="20000000-0000-4000-8000-000000000001";
const choice: HrPayrollInsuranceSourceDto={employeeId,sourceId,sourceKind:"modern_confirmed",expectedVersion:1,expectedHash:"a".repeat(64)};
test("insurance source DTO rejects missing modern hashes, NULL lists, duplicates and invalid versions",async()=>{
 const request={legacyBatchId:sourceId,attendanceInputBatchId:employeeId,insuranceSources:[choice]};
 assert.equal((await validate(plainToInstance(CreateHrPayrollReconciliationDto,request))).length,0);
 for(const insuranceSources of [null,[],[choice,choice],[{...choice,expectedHash:undefined}],[{...choice,expectedVersion:0}],[{...choice,expectedVersion:"1"}]]) {
  assert.ok((await validate(plainToInstance(CreateHrPayrollReconciliationDto,{...request,insuranceSources}))).length>0);
 }
 assert.equal((await validate(plainToInstance(CreateHrPayrollReconciliationDto,{legacyBatchId:sourceId,attendanceInputBatchId:employeeId}))).length,0);
});
test("explicit choices must exactly cover payroll employees without implicit fallback",()=>{
 assert.doesNotThrow(()=>assertPayrollInsuranceChoices([employeeId],[choice]));
 for(const choices of [[],[choice,choice],[{...choice,employeeId:sourceId}],[{...choice,sourceKind:"historical" as const}]]) {
  assert.throws(()=>assertPayrollInsuranceChoices([employeeId],choices));
 }
});
test("modern source resolver locks the same family before reading and binds exact version/hash",async()=>{
 const calls:Array<{sql:string;args:unknown[]}>=[];
 const row={id:sourceId,employee_id:employeeId,revision_no:1,snapshot_sha256:choice.expectedHash,
  result:{items:[{insuranceKind:"oldage",amounts:{base:"1.00",employer:"0.20",employee:"0.10",supplement:"0.00"}}]}};
 const manager={query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return sql.includes("FROM hr_insurance_owned_revision r")?[row]:[];}} as unknown as EntityManager;
 const sources=await lockModernPayrollInsuranceSources(manager,{tenantId:"tenant",parkId:"park"},"2026-07-01",[choice]);
 assert.match(calls[0]!.sql,/jsonb_build_array\('insurance-owned-family'/u);
 assert.match(calls[1]!.sql,/NOT EXISTS[\s\S]*FOR UPDATE OF r FOR SHARE OF p/u);
 assert.deepEqual(calls[1]!.args,["tenant","park",sourceId,employeeId,"2026-07-01"]);
 assert.equal(sources.get(employeeId)!.items[0]!.employeeAmount,"0.10");
 await assert.rejects(()=>lockModernPayrollInsuranceSources(manager,{tenantId:"tenant",parkId:"park"},"2026-07-01",[{...choice,expectedHash:"b".repeat(64)}]),/stale, foreign or changed/u);
});
