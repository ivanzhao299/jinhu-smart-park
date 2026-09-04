#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root=resolve(import.meta.dirname,"../..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const json=path=>JSON.parse(read(path));
const sha=path=>createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex");
const mapping=json("scripts/hr-cutover/contracts/legacy-u-errandrecords-modern-map-v1.json");
const fixture=json("scripts/hr-cutover/contracts/legacy-u-errandrecords-fixture-v1.json");
const contract=json("scripts/hr-cutover/contracts/legacy-u-errandrecords-parity-v1.json");
const routineLedger=json(mapping.sourceBinding.routineLedgerPath);

test("u_errandrecords is one canonical read-only family with no hidden historical variant",()=>{
 assert.equal(mapping.canonicalFamily,"u_errandrecords");
 assert.equal(mapping.familyScope,"single_family_only");
 assert.deepEqual(mapping.historicalVariants.map(row=>row.sourceName),["u_errandrecords"]);
 assert.deepEqual(mapping.historicalVariants[0].aliasesOrBackupsInLedger,[]);
 assert.equal(mapping.sourceBinding.routineLedgerSha256,sha(mapping.sourceBinding.routineLedgerPath));
 const variants=routineLedger.routines.filter(row=>row.canonicalFamily==="u_errandrecords"||row.sourceName.toLowerCase().includes("errand"));
 assert.equal(variants.length,1);
 const sourceRoutine=variants[0];
 assert.equal(sourceRoutine.routineId,"RULE-89960D3A0FC9C591");
 assert.equal(sourceRoutine.sourceArtifactSha256,"843efe8aa268d7f06ca21ccf8f3892854876f3bbf5bdd6d05e0c3eea4a778f6a");
 assert.deepEqual(sourceRoutine.parameters,[]);
 assert.deepEqual(sourceRoutine.readTables,["departmentcode","errand","person"]);
 assert.deepEqual(sourceRoutine.writeTables,[]);
 assert.deepEqual(sourceRoutine.calledRoutines,[]);
 assert.equal(sourceRoutine.dynamicMutationStatus,"none");
 assert.deepEqual(sourceRoutine.statementProfile,{select:1,insert:0,update:0,delete:0,merge:0,alter:0});
});

test("safe structural evidence accounts for every output and both legacy joins without carrying SQL text",()=>{
 assert.deepEqual(mapping.safeStructuralEvidence.outputFields,[
  "departmentcode.departmentname",
  "errand.person",
  "person.name",
  "errand.startdate",
  "errand.enddate",
  "errand.days",
 ]);
 assert.deepEqual(mapping.safeStructuralEvidence.joinPredicates,[
  "errand.person=person.person",
  "person.department=departmentcode.department",
 ]);
 assert.equal(mapping.sourceContract.outputs.length,6);
 assert.equal(mapping.sourceContract.filterSemantics,"no_parameter_no_where_no_status_filter");
 assert.equal(mapping.sourceContract.orderingSemantics,"not_declared");
 assert.equal(mapping.safeStructuralEvidence.explicitTransaction,false);
 assert.equal(mapping.safeStructuralEvidence.dynamicSql,false);
 assert.equal("sqlText" in mapping,false);
 assert.equal("routineBody" in mapping,false);
});

test("storage and projection gaps are closed while source state, join rehearsal and timezone evidence remain pending",()=>{
 assert.equal(mapping.parityStatus,"pending");
 assert.deepEqual(mapping.modernContract.confirmedFieldMappings.map(row=>row.modernField),["organizationName","employeeCode","employeeName","startAt","endAt","legacyDeclaredDays"]);
 assert.deepEqual(mapping.modernContract.unresolvedFieldMappings,[]);
 assert.deepEqual(mapping.modernContract.unresolvedSemantics,[
  "source_data_state_not_bound_to_a_current_safe_count_receipt",
  "legacy_inner_join_omission_not_yet_rehearsed_against_scoped_employee_and_org_references",
  "legacy_smalldatetime_timezone_interpretation_not_bound_to_a_reviewed_source_setting",
 ]);
 assert.equal(contract.routines[0].semantics.outputFieldMappings.status,"verified");
 assert.equal(contract.routines[0].semantics.readMappings.status,"pending");
 assert.equal(contract.routines[0].semantics.nullSemantics.status,"pending");
 assert.equal(fixture.sourceDataState,"unknown");
 assert.equal(fixture.unknownSourceStateBlocksVerifiedParity,true);
 const report=evaluateLegacyRoutineParityContract({contract,routineLedger:fixture.sourceRoutineLedger});
 assert.equal(report.status,"IN_PROGRESS");
 assert.equal(report.summary.sourceRoutines,1);
 assert.equal(report.summary.verifiedRoutines,0);
 assert.equal(report.summary.verifiedSemanticParityPercent,0);
 assert.deepEqual(report.reasonCodes,["ROUTINE_SEMANTIC_EVIDENCE_PENDING"]);
 assert.equal(report.productionImport,"HOLD");
});

test("positive, negative, permission and read-only conservation tests are bound to executable evidence",()=>{
 const evidenceSha=sha("apps/api/src/modules/hr/hr-errand-routine-family.spec.ts");
 const row=contract.routines[0];
 for(const kind of ["positive","negative","permission","conservation"])assert.deepEqual(row.testEvidence[kind].map(item=>item.evidenceSha256),[evidenceSha]);
 for(const id of ["positive-projection-shape","negative-unmatched-join","permission-fail-closed","read-only-conservation"])assert.ok(fixture.cases.some(item=>item.testId===id));
 assert.equal(fixture.containsBusinessValues,false);
});

test("migration, scoped API and responsive page expose the two formerly missing fields without opening a legacy write path",()=>{
 const migration=read("database/migrations/000297_hr_attendance_business_trip_legacy_source.sql");
 const service=read("apps/api/src/modules/hr/hr.service.ts");
 const controller=read("apps/api/src/modules/hr/hr.controller.ts");
 const dto=read("apps/api/src/modules/hr/dto/hr.dto.ts");
 const api=read("apps/web/lib/hr-api.ts");
 const page=read("apps/web/app/hr/attendance/HrAttendanceClient.tsx");
 for(const field of ["legacy_source_table","legacy_source_id","legacy_declared_days","legacy_source_identity_sha256","legacy_source_row_sha256"])assert.match(migration,new RegExp(field));
 assert.match(migration,/legacy_source_table = 'dbo\.errand'/);
 assert.match(migration,/uq_hr_attendance_request_legacy_source_id/);
 assert.match(service,/if\(q\.type\)qb\.andWhere\("request\.request_type=:type"/);
 assert.match(service,/innerJoin\(HrEmployeeEntity/);
 assert.match(service,/leftJoin\(OrgEntity/);
 assert.match(service,/organization\.org_name AS organization_name/);
 assert.match(service,/request\.legacy_declared_days AS legacy_declared_days/);
 assert.match(service,/legacySourceTable:null/);
 assert.doesNotMatch(dto,/class CreateHrAttendanceRequestDto[^}]*legacySource/s);
 assert.match(controller,/@Get\("attendance\/requests"\)/);
 assert.match(controller,/@Get\("attendance\/requests\/:id"\)/);
 assert.match(api,/attendanceRequests:\(token\?:string/);
 assert.match(api,/attendanceRequest:\(id:string/);
 assert.match(page,/business_trip/);
 assert.match(page,/row\.organizationName/);
 assert.match(page,/row\.legacyDeclaredDays/);
 assert.match(page,/className="ds-table-shell"/);
 assert.match(page,/className="ds-mobile-record-list"/);
 assert.equal(mapping.productionImport,"HOLD");
});

console.log("Yuzhou u_errandrecords family fail-closed contract passed.");
