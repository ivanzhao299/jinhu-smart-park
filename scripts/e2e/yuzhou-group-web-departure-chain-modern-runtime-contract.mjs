/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";
import {GroupWebDepartureChainRuntimeTaskError,verifyGroupWebDepartureChainRuntimeTask,verifyGroupWebDepartureChainRuntimeTaskSources} from "../hr-cutover/group-web-departure-chain-modern-runtime-task.mjs";

const root=resolve(import.meta.dirname,"../.."),json=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const task=json("scripts/hr-cutover/contracts/group-web-departure-chain-modern-runtime-task-v1.json");
const sources=()=>({moduleMapping:json(task.sourceContracts[0].path),sourceAudit:json(task.sourceContracts[1].path),departureEvidence:json(task.sourceContracts[2].path),readTarget:path=>readFileSync(resolve(root,path),"utf8")});
const expectCode=(action,code)=>assert.throws(action,error=>error instanceof GroupWebDepartureChainRuntimeTaskError&&error.code===code);

test("Group Web departure chain freezes one task without claiming six runtime entries",()=>{
 const report=verifyGroupWebDepartureChainRuntimeTask(root,task);
 assert.equal(report.status,"READY_NOT_EXECUTED");assert.equal(report.candidateId,"GROUP-WEB-INTERACTION-42-47-DEPARTURE-CHAIN");assert.equal(report.taskReadyIncrement,1);assert.equal(report.runtimeCoverageIncrement,0);assert.equal(report.proven.legacyEntriesFrozen,6);assert.equal(report.stillRequired.legacyEntryObservations,6);assert.deepEqual(report.coverageCredit,{groupWebNavigableEntries:{numerator:0,denominator:186},legacyInteractionParity:{numerator:0,denominator:6}});assert.equal(report.compatibilityScoreContribution,0);assert.equal(report.productionImport,"HOLD");
});

test("all six departure entries remain score-90 partial in the shared model",()=>{
 const coverage=assessLegacyGroupWebImplementationCoverage(json(task.sourceContracts[0].path),root),selected=coverage.items.filter(item=>task.legacyEntries.some(entry=>entry.legacyId===item.legacyId));assert.equal(coverage.summary.total,231);assert.equal(selected.length,6);for(const item of selected){assert.equal(item.score,90);assert.equal(item.implementationStatus,"partial");assert.deepEqual(item.dimensions,task.candidate.currentStaticEvidence.dimensionsEach);}
});

test("six legacy entry slot totals and 25 semantic fields remain explicit",()=>{
 assert.deepEqual(task.legacyEntries.map(entry=>entry.legacyId),[42,43,44,45,46,47]);assert.equal(task.legacyEntries.reduce((sum,entry)=>sum+entry.controls,0),74);assert.equal(task.legacyEntries.reduce((sum,entry)=>sum+entry.requestKeys,0),75);assert.equal(task.legacyEntries.reduce((sum,entry)=>sum+entry.formActions,0),6);assert.equal(task.legacySemanticFields.length,25);assert.ok(task.legacySemanticFields.every(field=>/(?:requires|blocked|unresolved)/u.test(field.disposition)));
});

test("empty interview and handover tables cannot erase their features",()=>{
 for(const key of ["interview","handover"]){const feature=task.legacySourceDatabaseShape[key];assert.equal(feature.rowCount,0);assert.equal(feature.featureRequired,true);assert.equal(feature.emptyDataDoesNotRemoveBehavior,true);}assert.ok(task.blockingGaps.includes("GROUP_WEB_DEPARTURE_EMPTY_INTERVIEW_HANDOVER_TABLES_STILL_REQUIRE_FEATURE_UAT"));
});

test("modern departure status permissions API and desktop plus phone observations are frozen",()=>{
 assert.deepEqual(task.modernRuntimeContract.applicationStatuses,["draft","submitted","returned","approved","cancelled","applied"]);assert.equal(Object.values(task.modernRuntimeContract.clearanceStatuses).flat().length,14);assert.equal(task.modernRuntimeContract.transitionMatrix.length,6);assert.equal(task.modernRuntimeContract.roleMatrix.length,12);assert.equal(task.modernRuntimeContract.apiTasks.length,28);assert.deepEqual(task.modernRuntimeContract.browserTask.viewports.map(viewport=>viewport.width),[1440,390]);assert.equal(task.runtimeEvidence.requiredModernBrowserObservations,24);
});

test("wage archive route mismatch and archive reopen are executable gaps",()=>{
 const routeGap=task.implementationGaps.find(item=>item.id==="GROUP_WEB_DEPARTURE_WAGE_ARCHIVE_ROUTE_MISMATCH"),reopenGap=task.implementationGaps.find(item=>item.id==="GROUP_WEB_DEPARTURE_ARCHIVE_REOPEN_CORRECTION_NOT_IMPLEMENTED");assert.ok(routeGap);assert.ok(reopenGap);assert.deepEqual(task.legacyEntries.filter(entry=>[46,47].includes(entry.legacyId)).map(entry=>entry.mappedTargetRoutes),[["/hr/employees"],["/hr/employees"]]);assert.equal(task.candidate.actualModernRoute,"/hr/lifecycle");assert.ok(routeGap.acceptance.includes("one_canonical_write_surface"));assert.ok(reopenGap.implementationAction.includes("hash_and_map_every_sp_CloseDoc_branch_even_when_source_rows_are_empty"));assert.ok(reopenGap.implementationAction.includes("add_a_separate_permissioned_archive_correction_request_if_reopen_is_business_required"));assert.ok(reopenGap.acceptance.includes("no_physical_reopen_or_history_rewrite"));
});

test("wage procedure and legacy identity lock cannot be mistaken for payroll or implicit user disable",()=>{
 const gap=task.implementationGaps.find(item=>item.id==="GROUP_WEB_DEPARTURE_LEGACY_PROCEDURE_AND_IDENTITY_EFFECTS_NOT_BOUND");assert.ok(gap);assert.deepEqual(task.legacyWorkflowRules.legacyProcedures,["sp_CloseDoc","sp_SetWageFlag"]);assert.ok(gap.implementationAction.includes("keep_wage_clearance_as_a_settled_or_waived_flag_not_a_payroll_payment"));assert.ok(gap.implementationAction.includes("create_or_link_an_audited_post_effective_identity_access_task_instead_of_disabling_a_user_inside_departure_apply"));assert.equal(task.runtimeEvidence.salaryValuesExcluded,true);
});

test("source identities aggregate shapes and modern tokens fail closed on drift",()=>{
 const moduleDrift=sources();moduleDrift.moduleMapping.items.find(item=>item.legacyId===46).targetRoutes=["/invented"];expectCode(()=>verifyGroupWebDepartureChainRuntimeTaskSources(task,moduleDrift),"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_DRIFT");const emptyDrift=sources();emptyDrift.departureEvidence.groupWeb.database.interview.rowCount=1;expectCode(()=>verifyGroupWebDepartureChainRuntimeTaskSources(task,emptyDrift),"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_SOURCE_DRIFT");const targetDrift=sources();targetDrift.readTarget=()=>"";expectCode(()=>verifyGroupWebDepartureChainRuntimeTaskSources(task,targetDrift),"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_MODERN_EVIDENCE_MISSING");
});

test("task cards cannot inflate departure runtime coverage or hide unresolved work",()=>{
 const mutations=[
  [candidate=>{candidate.status="pass";},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FALSE_COMPLETION"],
  [candidate=>{candidate.runtimeEvidence.status="observed";},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FALSE_COMPLETION"],
  [candidate=>{candidate.coverageCredit.groupWebNavigableEntries.numerator=6;},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_COVERAGE_INVALID"],
  [candidate=>{candidate.compatibilityScoreContribution=6;},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FALSE_COMPLETION"],
  [candidate=>{candidate.legacySemanticFields[0].disposition="verified";},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_FIELD_BINDINGS_INVALID"],
  [candidate=>{candidate.legacySourceDatabaseShape.interview.featureRequired=false;},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_EMPTY_FEATURE_INVALID"],
  [candidate=>{candidate.legacyWorkflowRules.runtimeStatus="pass";},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_WORKFLOW_FALSE_COMPLETION"],
  [candidate=>{candidate.legacyReportLayout.status="pass";},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_REPORT_FALSE_COMPLETION"],
  [candidate=>{candidate.blockingGaps=candidate.blockingGaps.filter(code=>code!=="GROUP_WEB_DEPARTURE_ARCHIVE_REOPEN_CORRECTION_NOT_IMPLEMENTED");},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_IMPLEMENTATION_GAP_MISSING"],
  [candidate=>{candidate.implementationGaps[1].implementationAction=[];},"GROUP_WEB_DEPARTURE_CHAIN_RUNTIME_REOPEN_GAP_INVALID"]
 ];for(const [mutate,code] of mutations){const candidate=structuredClone(task);mutate(candidate);expectCode(()=>verifyGroupWebDepartureChainRuntimeTaskSources(candidate,sources()),code);}
});
