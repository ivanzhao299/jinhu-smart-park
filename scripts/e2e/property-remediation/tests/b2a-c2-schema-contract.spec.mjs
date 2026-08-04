import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "database/migrations/000194_property_task_projection_contract_correction.sql", "utf8"
);
const migration189 = readFileSync(
  "database/migrations/000189_property_b_module_rbac_definitions.sql", "utf8"
);
const runner = readFileSync(
  "scripts/e2e/property-remediation/track-b2a-c2-schema-gate.mjs", "utf8"
);
const mappingPath = ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-worst-path-dominance-equivalence-mapping-v1.json";
const mapping = readFileSync(mappingPath);
const mappingManifest = JSON.parse(readFileSync(`${mappingPath.replace(/\.json$/, "")}.manifest.json`, "utf8"));
const candidateTemplate = readFileSync(
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-schema-migration-candidate.md", "utf8"
);
const targetedSummary = readFileSync(
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-v12-targeted-diagnostic-summary.md", "utf8"
);

test("000194 is forward-only and does not consume 191/192 objects", () => {
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\n$/);
  assert.doesNotMatch(migration, /(?:FROM|JOIN|REFERENCES|UPDATE|INSERT INTO|ALTER TABLE)\s+[^\n;]*00019[12]/i);
  assert.match(runner, /000185[\s\S]*000190[\s\S]*000193[\s\S]*migration194/);
});

test("000194 owns the exact physical surface and one dual-mode writer", () => {
  for (const name of [
    "biz_property_task_projection_head", "biz_property_task_projection",
    "biz_property_task_projection_rebuild_audit",
    "sys_property_runtime_control_contract_audit"
  ]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}`));
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.fn_property_task_projection_replace_v1/g) ?? []).length, 1);
  assert.match(migration, /LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public/);
  assert.match(migration, /business_result_version/);
  assert.match(migration, /property\.task\.source-terminal\.closed/);
  assert.match(migration, /property\.task\.source-terminal\.cancelled/);
  assert.match(migration, /property-task-projection-preexisting-catalog-drift/);
  assert.match(migration, /1a3bb4bc4907fb1a2e0e00c2bfd7a95ae52b96dab6c2d755d6de33e4f75c7da5/);
  assert.match(migration, /50655ce0ca2a74ff653066b77b9ff60cd969663e07f6828934fd21ef601f2b47/);
  assert.match(migration, /1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4/);
  assert.match(migration, /d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45/);
  const rowLimit = migration.indexOf("jsonb_array_length(p_rows)>200");
  assert.ok(rowLimit > migration.indexOf("jsonb_typeof(value)<>'object'"));
  assert.ok(rowLimit < migration.indexOf("SELECT h.id,h.projection_version"));
  assert.ok(rowLimit < migration.indexOf("FROM public.biz_property_mutation_receipt", rowLimit));
  assert.match(migration, /to_char\(timestamp_text::timestamptz AT TIME ZONE 'UTC'/);
  assert.match(migration, /derivedAssignmentId'[\s\S]*lower\(\(value->>'derivedAssignmentId'\)::uuid::text\)/);
});

test("control correction is exact all-old or all-new and audited", () => {
  assert.match(migration, /a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8/);
  assert.match(migration, /81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3/);
  assert.match(migration, /v_old=v_expected AND v_new=0 AND v_audits=0/);
  assert.match(migration, /v_new=v_expected AND v_old=0 AND v_audits=v_expected/);
  assert.match(migration, /property-runtime-control-mixed-contract-state/);
  assert.match(migration, /runtime-control-contract-audit-v1/);
  assert.match(migration, /b2a_qualifying_scope/);
  assert.match(migration, /property-runtime-control-scope-exact-set-drift/);
  assert.match(migration, /a\.evidence_hash IS DISTINCT FROM encode\(digest/);
});

test("runner owns exact ephemeral cleanup and executes the 2M gate", () => {
  assert.match(runner, /assertExactEphemeralPostgresContainer/);
  assert.match(runner, /anonymous_volume_absent/);
  assert.match(runner, /const rows = 2_000_000/);
  assert.match(runner, /EXPLAIN \(ANALYZE,BUFFERS,FORMAT JSON\)/);
  assert.match(runner, /p95 > 200/);
  assert.match(runner, /sharedBlocks > 20_000/);
  assert.match(runner, /\["SIGINT","SIGTERM","SIGHUP"\]/);
  assert.match(runner, /b-property-task-projection-function-v1/);
  assert.match(runner, /public\.\$\{row\.identity\}/);
  assert.match(runner, /declared_attempts:20,recorded_attempts:20,executed_attempts:0,excluded_attempts:0,replacement_attempts:0/);
  assert.doesNotMatch(runner, /docker\s+(?:system\s+prune|volume\s+prune)/);
});

test("v12 records real deadline, legal 08006 ambiguity and bounded rollback evidence", () => {
  assert.match(runner, /B2A_C2_BUDGET_CHILD/);
  assert.match(runner, /deadlineNs=beginDispatchNs\+5_000_000_000n/);
  assert.match(runner, /SET LOCAL statement_timeout/);
  assert.match(runner, /SET LOCAL lock_timeout/);
  assert.match(runner, /deadline-expired-or-below-safety-before-\$\{name\}/);
  assert.match(runner, /outcome="commit-ambiguous"/);
  assert.match(runner, /outer_watchdog_ms: 60_000/);
  assert.match(runner, /reason:"predeclared-awaiting-execution"/);
  assert.match(runner, /B2A_C2_AMBIGUOUS_OPERATIONS/);
  assert.match(runner, /commit-frame-received-by-proxy-not-forwarded/);
  assert.match(runner, /backend-ready-for-query-after-commit-suppressed/);
  assert.match(runner, /SFATAL\\0VFATAL\\0C08006\\0Mconnection failure during COMMIT acknowledgement/);
  assert.match(runner, /commit_promise_error:commitError/);
  assert.match(runner, /commitError\?\.code==="08006"/);
  assert.match(runner, /commitError\?\.severity==="FATAL"/);
  assert.match(runner, /canonical_transport_class/);
  assert.match(runner, /observed_sqlstate:errorCode/);
  assert.match(runner, /replayed-completed/);
  assert.match(runner, /executed-after-absent/);
  assert.match(runner, /client\.query\(\{text:"ROLLBACK",query_timeout:rollbackTimeout\}\)/);
  assert.match(runner, /rollback-by-bounded-disconnect-after-deadline/);
  assert.match(runner, /remaining_budget_ms:rollbackRemaining/);
});

test("v12 budget child executes through deadline-derived connection setup without ReferenceError", () => {
  const spec={action:"property.task.rebuild",phase:"warmup",ordinal:1,status:"open",
    sourceVersion:1,resultVersion:1,mode:"manual-rebuild"};
  const child=spawnSync(process.execPath,["scripts/e2e/property-remediation/track-b2a-c2-schema-gate.mjs"],{
    cwd:process.cwd(),encoding:"utf8",timeout:10_000,env:{...process.env,
      B2A_C2_BUDGET_CHILD:"1",B2A_C2_BUDGET_SPEC:JSON.stringify(spec),B2A_C2_PG_PORT:"1",
      B2A_C2_PG_USER:"b2a_c2_unreachable",B2A_C2_PG_PASSWORD:"local-only",
      B2A_C2_PG_DATABASE:"b2a_c2_unreachable"}});
  assert.equal(child.signal,null,`budget child signal: ${child.signal}; stderr=${child.stderr}`);
  assert.equal(child.status,0,`budget child status: ${child.status}; stderr=${child.stderr}`);
  assert.doesNotMatch(child.stderr,/ReferenceError|connectionTimeoutMillis is not defined/);
  const record=JSON.parse(child.stdout.trim());
  assert.equal(record.executed,true);
  assert.equal(record.outcome,"failed");
  assert.equal(BigInt(record.deadline_ns)-BigInt(record.begin_dispatch_ns),5_000_000_000n);
  assert.ok(record.stage_markers.indexOf("hard-timer-armed-before-connect")>=0);
  assert.ok(record.stage_markers.indexOf("hard-timer-armed-before-connect")<record.stage_markers.indexOf("connect-dispatched"));
  assert.ok(record.error.message);
});

test("v12 helper child dynamically derives exact blocking timeouts and DB access counts", () => {
  const run=input=>spawnSync(process.execPath,["scripts/e2e/property-remediation/track-b2a-c2-schema-gate.mjs"],{
    cwd:process.cwd(),encoding:"utf8",timeout:10_000,
    env:{...process.env,B2A_C2_HELPER_CHILD:"1",B2A_C2_HELPER_INPUT:JSON.stringify(input)}});
  const timeoutChild=run({kind:"attempt-timeouts",operations:[
    {name:"connect",remaining_budget_ms:4999,statement_timeout_ms:null,lock_timeout_ms:null,outcome:"success"},
    {name:"receipt-started",remaining_budget_ms:4800,statement_timeout_ms:4775,lock_timeout_ms:4750,
      blocking_operation:true,outcome:"success"},
    {name:"replace-complete",remaining_budget_ms:4300,statement_timeout_ms:4275,lock_timeout_ms:4250,
      blocking_operation:true,outcome:"success"},
    {name:"commit",remaining_budget_ms:4200,statement_timeout_ms:4175,lock_timeout_ms:4175,
      blocking_operation:false,outcome:"success"},
    {name:"post-commit-observation",remaining_budget_ms:100,statement_timeout_ms:null,lock_timeout_ms:null,
      blocking_operation:false,outcome:"success"}
  ]});
  assert.equal(timeoutChild.status,0,timeoutChild.stderr);
  const timeout=JSON.parse(timeoutChild.stdout.trim());
  assert.equal(timeout.timeout_source_operation,"replace-complete");
  assert.equal(timeout.statement_timeout_ms,4275);
  assert.equal(timeout.lock_timeout_ms,4250);
  assert.equal(timeout.minimum_remaining_budget_ms,4300);
  assert.equal(timeout.blocking_operation_timeouts.length,2);
  const accessChild=run({kind:"negative-access",instrument:{receipt_scan_delta:3,head_scan_delta:0}});
  assert.equal(accessChild.status,0,accessChild.stderr);
  const access=JSON.parse(accessChild.stdout.trim());
  assert.equal(access.receipt,1);
  assert.equal(access.head,0);
  assert.equal(access.instrument.receipt_scan_delta,3);
  const dispatchChild=run({kind:"dispatch-timeout",name:"fixture-op",remainingBudgetMs:1000,
    dispatchNs:"123456",blockingOperation:true,deadlineSafetyMs:100,lockSafetyMs:50});
  assert.equal(dispatchChild.status,0,dispatchChild.stderr);
  const dispatch=JSON.parse(dispatchChild.stdout.trim());
  assert.equal(dispatch.configuration_evidence_same_object,true);
  assert.equal(dispatch.configured.statement,"SET LOCAL statement_timeout='900ms'");
  assert.equal(dispatch.configured.lock,"SET LOCAL lock_timeout='850ms'");
  assert.equal(dispatch.evidence.remaining_budget_ms,1000);
  assert.equal(dispatch.evidence.dispatch_ns,"123456");
  const expiredChild=run({kind:"dispatch-timeout",name:"expired",remainingBudgetMs:100,
    dispatchNs:"123457",blockingOperation:true,deadlineSafetyMs:50,lockSafetyMs:50});
  assert.notEqual(expiredChild.status,0);
  assert.match(expiredChild.stderr,/deadline-expired-or-below-safety-before-expired/);
  const lateChild=run({kind:"wait-budget",observedNs:"1001",deadlineNs:"1000",actualWaitMs:850,
    effectiveLockTimeoutMs:850,remainingBudgetMs:1000});
  assert.equal(lateChild.status,0,lateChild.stderr);
  const late=JSON.parse(lateChild.stdout.trim());
  assert.equal(late.waited_until_remaining_budget,false);
  assert.equal(late.deadline_exceeded,true);
  const shortChild=run({kind:"wait-budget",observedNs:"900",deadlineNs:"1000",actualWaitMs:100,
    effectiveLockTimeoutMs:850,remainingBudgetMs:1000,lowerToleranceMs:50,upperToleranceMs:50});
  assert.equal(shortChild.status,0,shortChild.stderr);
  const short=JSON.parse(shortChild.stdout.trim());
  assert.equal(short.deadline_exceeded,false);
  assert.equal(short.lower_bound_met,false);
  assert.equal(short.waited_until_remaining_budget,false);
  const delayedAbsenceChild=run({kind:"absence-poll",targetKind:"container",target:{id:"exact-id",name:"exact-name"},
    timeoutMs:100,intervalMs:10,sequence:[{absent:false,state:"removing"},{absent:false,state:"removing"},
      {absent:true,state:"no-such-object"}]});
  assert.equal(delayedAbsenceChild.status,0,delayedAbsenceChild.stderr);
  const delayedAbsence=JSON.parse(delayedAbsenceChild.stdout.trim());
  assert.equal(delayedAbsence.absent,true);
  assert.equal(delayedAbsence.timeline.length,3);
  assert.equal(delayedAbsence.deadline_ms,100);
  assert.equal(delayedAbsence.elapsed_ms,20);
  assert.equal(delayedAbsence.deadline_exceeded,false);
  assert.deepEqual(delayedAbsence.inspect_remaining_ms,[100,90,80]);
  const neverAbsentChild=run({kind:"absence-poll",targetKind:"container",target:{id:"exact-id",name:"exact-name"},
    timeoutMs:20,intervalMs:30,sequence:[{absent:false,state:"present"}]});
  assert.equal(neverAbsentChild.status,0,neverAbsentChild.stderr);
  const neverAbsent=JSON.parse(neverAbsentChild.stdout.trim());
  assert.equal(neverAbsent.absent,false);
  assert.equal(neverAbsent.timeline.at(-1).at_ms,20);
  assert.equal(neverAbsent.elapsed_ms,20);
  assert.equal(neverAbsent.deadline_exceeded,false);
  assert.deepEqual(neverAbsent.inspect_remaining_ms,[20,0]);
  const lateAbsenceChild=run({kind:"absence-poll",targetKind:"container",target:{id:"exact-id",name:"exact-name"},
    timeoutMs:20,intervalMs:10,sequence:[{absent:true,state:"no-such-object",advance_ms:21}]});
  assert.equal(lateAbsenceChild.status,0,lateAbsenceChild.stderr);
  const lateAbsence=JSON.parse(lateAbsenceChild.stdout.trim());
  assert.equal(lateAbsence.absent,false);
  assert.equal(lateAbsence.deadline_exceeded,true);
  assert.equal(lateAbsence.late_absence_rejected,true);
  assert.deepEqual(lateAbsence.inspect_remaining_ms,[20]);
});

test("v12 uses one reentry-safe lifecycle machine and exact signed artifact paths", () => {
  assert.equal((runner.match(/function runLifecycleCleanup\(/g) ?? []).length, 1);
  assert.match(runner, /runLifecycleCleanup\(machine,adapter\)/);
  assert.match(runner, /runLifecycleCleanup\(productionLifecycle/);
  assert.match(runner, /exactChain\.slice\(0, -1\)/);
  assert.match(runner, /recordHistory\(migration194\)/);
  for (const path of [
    "schemaVersion", "runId", "startedAt", "finishedAt", "baseCommit",
    "addendum_raw_sha256", "canonical_budget_digest", "negative_cases",
    "commit_ambiguous", "acquire_mode_matrix", "evidence_dag", "exact_targets"
  ]) assert.match(runner, new RegExp(path));
  assert.match(runner, /auditConstraintMatrixGate/);
  assert.match(runner, /nonqualifying-scope-unknown-control/);
  assert.match(runner, /all-old-with-existing-audit/);
  assert.match(runner, /origin_phase:"initialized",terminal_event:null/);
  assert.match(runner, /if\(signalHandled\|\|machine\.phase==="cleaned"\)return;signalHandled=true/);
  assert.doesNotMatch(runner, /allOldAfter\.auditCount!==12/);
  assert.match(runner, /qualifying_scope_count:qualifyingScopeCount/);
});

test("signal primary remains 128 when exact drop or temporary cleanup fails", () => {
  const fixtureDir=mkdtempSync("/tmp/b2a-c2-signal-static-");
  const execute=(signal,{dropFailure=false,tempFailure=false}={})=>{
    const child=spawnSync(process.execPath,["scripts/e2e/property-remediation/track-b2a-c2-schema-gate.mjs"],{
      cwd:process.cwd(),encoding:"utf8",timeout:10_000,env:{...process.env,
        B2A_C2_LIFECYCLE_CHILD:"1",B2A_C2_LIFECYCLE_TARGET:`signal-${signal.toLowerCase()}`,
        B2A_C2_LIFECYCLE_TEMP:`${fixtureDir}/${signal}.tmp`,B2A_C2_LIFECYCLE_LOG:`${fixtureDir}/commands.log`,
        B2A_C2_FAKE_CREATE:"/bin/true",B2A_C2_FAKE_TEST:"/bin/true",
        B2A_C2_FAKE_DROP:dropFailure?"/bin/false":"/bin/true",B2A_C2_SIGNAL:signal,
        B2A_C2_CREATE_STATUS:"0",B2A_C2_TEST_STATUS:"0",B2A_C2_DROP_STATUS:dropFailure?"29":"0",
        B2A_C2_TEMP_FAIL:tempFailure?"1":"0"}});
    assert.equal(child.signal,null,child.stderr);
    assert.equal(child.status,128,child.stderr);
    const emitted=JSON.parse(child.stdout.trim().split("\n").at(-1));
    assert.equal(emitted.primary_status,128);
    assert.equal(emitted.machine.cleanup_result.status,128);
    return emitted;
  };
  try{
    assert.equal(execute("SIGINT",{dropFailure:true}).drop_status,1);
    assert.equal(execute("SIGTERM",{tempFailure:true}).temp_status,31);
  }finally{rmSync(fixtureDir,{recursive:true,force:true});}
});

test("v12 recovery uses one shared transaction and one receipt identity grammar", () => {
  assert.equal((runner.match(/function receiptAcquireSql\(/g) ?? []).length, 1);
  assert.equal((runner.match(/function executeReceiptStateMachineTransaction\(/g) ?? []).length, 1);
  assert.match(runner, /BEGIN;\n\$\{receiptAcquireSql\(input\)\}[\s\S]*\\\\gset acquire_[\s\S]*\$\{businessSql\};[\s\S]*\$\{completeReceiptExactSql\(input\)\}[\s\S]*COMMIT;/);
  for (const field of ["receiptId", "tenantId", "parkId", "actorId", "actionId", "targetId", "clientKey", "requestHash"])
    assert.match(runner, new RegExp(`input\\.${field}`));
  assert.match(runner, /semantic_target_type:\{stored:false,derived_from:"action_id"/);
  assert.doesNotMatch(migration, /\btarget_type\b/i);
  assert.match(runner, /b2a-c2-receipt-identity-v1/);
  assert.match(runner, /receipt_identity_sha256:receiptIdentitySha256V1/);
  assert.match(runner, /const logicalIdentityGrammar=receiptIdentityGrammarV1/);
  assert.match(runner, /receipt_identity_contract:[\s\S]*ordered_fields/);
});

test("v12 executes function, direct-row, receipt and head concurrency matrices", () => {
  for (const marker of [
    "manual-target-forged",
    "receipt-absent", "receipt-request-hash", "rows-nonarray", "rows-extra-key",
    "rows-content-hash", "rows-order", "rows-duplicate", "head-absent-expected-nonzero"
  ]) assert.match(runner, new RegExp(marker));
  assert.ok(runner.includes("`${command}-assignment-version-forged`"));
  assert.ok(runner.includes("`${terminal}-source-version-forged`"));
  assert.match(runner, /function headVersionConcurrencyGate\(/);
  assert.match(runner, /headVersionConcurrency = headVersionConcurrencyGate\(\)/);
  assert.match(runner, /winner_count:1,loser_count:1,head_count:1,audit_count:1,projection_count:0,receipt_count:1/);
  assert.match(runner, /head_version_concurrency:headVersionConcurrency/);
  assert.match(runner, /function receiptAcquireConcurrencyGate\(/);
  assert.match(runner, /winner_count:1,loser_outcome:loser\.outcome/);
  assert.match(runner, /outcomes\.some\(row=>row\.outcome==="fail-closed-absent"\)/);
  assert.match(runner, /loser\.receipt_lock_count!==1/);
  for (const marker of ["command-reverse-manual-mode-action", "terminal-reverse-manual-mode-action",
    "${terminal}-result-version-forged", "${terminal}-result-ref-forged",
    "audit-manual-positive", "audit-terminal-reverse-mode-action", "audit-closed-result-version-forged",
    "audit-cancelled-result-ref-forged"])
    assert.ok(runner.includes(marker));
});

test("v12 receipt race uses top-level DML CTEs and a deterministic two-transaction latch", () => {
  const gate = runner.slice(runner.indexOf("function receiptAcquireConcurrencyGate("),
    runner.indexOf("function fakeLifecycleGate("));
  assert.doesNotMatch(gate, /FROM \(\$\{receiptAcquireSql\(input\)\}\)/);
  assert.equal((gate.match(/\$\{receiptAcquireSql\(input\)\}\n\s+\\\\gset/g) ?? []).length, 3);
  assert.match(gate, /receipt winner commit latch/);
  assert.match(gate, /receipt loser transaction latch/);
  assert.match(gate, /row\.blocking_pids\.map\(String\)\.includes\(winnerPid\)/);
  assert.match(gate, /winner_commit_latch:winnerBlocked\.timeline/);
  assert.match(gate, /loser_transaction_latch:loserBlocked\.timeline/);
  assert.match(runner, /function launchDetachedPsqlWorker/);
  assert.match(runner, /\.stdout 2>\$\{stem\}\.stderr/);
  assert.match(runner, /worker_status=\$\?/);
  assert.match(runner, /function detachedPsqlWorkerDiagnostic/);
  assert.match(runner, /function receiptWorkerActivity/);
  assert.match(runner, /pg_blocking_pids\(pid\) blocking_pids/);
  assert.match(runner, /receipt acquire outcomes timeout:[\s\S]*workers\.map\(detachedPsqlWorkerDiagnostic\)/);
  assert.match(gate, /workerDiagnostics\.some\(worker=>worker\.exit_code!==0\)/);
});

test("v12 asserts reservation, multi-scope and complete deadline boundaries before Docker", () => {
  assert.match(runner, /reservationPreflightGate\("start"\)/);
  assert.match(runner, /reservationPreflightGate\("before-194-apply"\)/);
  assert.match(runner, /000191_negative_injection\.sql/);
  assert.match(runner, /multi-scope gate requires at least 2 qualifying scopes/);
  assert.match(runner, /row\.row_count!==12\|\|row\.distinct_key_count!==12/);
  assert.match(runner, /hard-timer-armed-before-connect/);
  assert.ok(runner.indexOf("hard-timer-armed-before-connect")<runner.indexOf("connect-dispatched"));
  assert.match(runner, /connectionTimeoutMillis/);
  assert.match(runner, /post-commit-observation-dispatched/);
  assert.match(runner, /client-end-dispatched/);
  assert.match(runner, /if\(outcome==="success"&&endNs>deadlineNs\)outcome="late-end"/);
  assert.match(runner, /query_timeout_ms:rollbackTimeout,statement_timeout_ms:null,lock_timeout_ms:null/);
});

test("v12 rejects reserved 191/192 rows in either history store before 194", () => {
  const negative = runner.indexOf("historyReservationNegative=historyReservationNegativeGate()");
  const preflight = runner.indexOf("historyReservationPreflight=historyReservationPreflightGate(\"before-194-apply\")");
  const apply194 = runner.indexOf("applyFile(migration194)",preflight);
  assert.ok(negative >= 0 && preflight > negative && apply194 > preflight);
  assert.match(runner, /primary-only-reserved-row/);
  assert.match(runner, /standard-only-reserved-row/);
  assert.match(runner, /dual-store-inconsistent-reserved-row/);
  assert.match(runner, /dual-store-consistent-reserved-row/);
  assert.match(runner, /reserved-history-store-inconsistent-before-194/);
  assert.match(runner, /reserved-history-row-before-194/);
  assert.match(runner, /BEGIN;\$\{injection\.sql\}[\s\S]*COMMIT;/);
  assert.match(runner, /history reservation injection polluted fresh path/);
  assert.match(runner, /fresh_normal_path:historyReservationPreflightGate\("negative-suite-restored-fresh"\)/);
  assert.match(runner, /history_reservation_negative:historyReservationNegative/);
  assert.match(runner, /history_reservation_preflight:historyReservationPreflight/);
});

test("v12 multi-scope fixture preserves the complete production permission subtree for 000189", () => {
  const secondScope = runner.indexOf("B2a C2 isolated second qualifying scope");
  const parentFixture = runner.indexOf("B2A C2 exact production permission subtree fixture");
  const exactChainApply = runner.indexOf("for (const filename of exactChain.slice(0, -1))");
  assert.ok(secondScope >= 0);
  assert.ok(parentFixture > secondScope);
  assert.ok(exactChainApply > parentFixture);
  assert.match(runner, /CREATE TEMP TABLE b2a_c2_permission_fixture_map/);
  assert.match(runner, /permission\.tenant_id='10000001'[\s\S]*permission\.is_enabled=true[\s\S]*permission\.status='enabled'/);
  assert.match(runner, /JOIN b2a_c2_permission_fixture_map parent_fixture ON parent_fixture\.source_id=source\.parent_id/);
  assert.match(runner, /fixture_count<>source_count OR unresolved_parent_count<>0 OR semantic_drift_count<>0/);
  assert.match(runner, /source_semantics AS[\s\S]*fixture_semantics AS[\s\S]*EXCEPT SELECT \* FROM fixture_semantics/);
  assert.match(runner, /b2a-c2-second-scope-permission-subtree-fixture-failed/);
  assert.doesNotMatch(runner, /property-permission-parent-preflight-failed/);
  assert.doesNotMatch(runner, /property-bundle-permission-resolution-failed/);

  const memberBlock = migration189.slice(
    migration189.indexOf("INSERT INTO b0_signed_bundle_member VALUES"),
    migration189.indexOf("WITH bundle_hash AS")
  );
  const memberCodes = [...memberBlock.matchAll(/\('property-bundle:[^']+',\d+,'([^']+)'\)/g)]
    .map((match) => match[1]);
  const signedBlock = migration189.slice(
    migration189.indexOf("INSERT INTO b0_signed_permission_code VALUES"),
    migration189.indexOf("UPDATE sys_permission permission")
  );
  const signedCodes = new Set([...signedBlock.matchAll(/\('([^']+)'\)/g)].map((match) => match[1]));
  const distinctMembers = new Set(memberCodes);
  const preexistingMembers = [...distinctMembers].filter((code) => !signedCodes.has(code));
  assert.equal(memberCodes.length, 125);
  assert.equal(distinctMembers.size, 52);
  assert.equal(signedCodes.size, 25);
  assert.equal(preexistingMembers.length, 27);
  for (const required of ["asset:party", "file:read", "homestay:tasks:page", "housing:tasks:page", "audit:read"])
    assert.ok(preexistingMembers.includes(required));
});

test("v12 DAG validator traverses and rejects duplicate, dangling and cyclic graphs", () => {
  const start=runner.indexOf("function validateEvidenceDag(");
  const end=runner.indexOf("function validateDetachedHashChain",start);
  const validate=Function(`${runner.slice(start,end)};return validateEvidenceDag;`)();
  assert.equal(validate({nodes:["a","b"],edges:[["a","b"]]},["a","b"]).status,"passed");
  assert.throws(()=>validate({nodes:["a","a"],edges:[]}),/duplicate-node/);
  assert.throws(()=>validate({nodes:["a"],edges:[["a","missing"]]}),/dangling-edge/);
  assert.throws(()=>validate({nodes:["a","b"],edges:[["a","b"],["b","a"]]}),/cycle/);
  for(const node of ["candidate-main","watchdog-artifact","detached-manifest"])assert.ok(runner.includes(node));
  assert.match(runner, /validateDetachedHashChain/);
  assert.match(runner, /artifact-hash-chain-sidecar-mismatch/);
});

test("v12 direct DB-row negatives cover malformed command and terminal references", () => {
  for(const marker of ["audit-command-result-ref-bad-uuid","audit-command-result-ref-bad-version",
    "audit-terminal-result-ref-bad-source-type","audit-terminal-result-ref-bad-source-id",
    "audit-terminal-result-ref-bad-terminal-token"])assert.ok(runner.includes(marker));
});

test("v12 full-b corrections preserve exact deadline, access and C4 boundaries", () => {
  assert.doesNotMatch(runner, /timed\[0\]\?\.statement_timeout_ms/);
  assert.match(runner, /summarizeAttemptTimeouts\(parsed\.operations\?\?\[\]\)/);
  assert.match(runner, /operation\.blocking_operation===true/);
  assert.match(runner, /statement_timeout_ms<=operation\.remaining_budget_ms/);
  assert.match(runner, /timeout_source_operation:source\.name/);
  assert.match(runner, /const snapshot=createDispatchTimeoutSnapshot/);
  assert.match(runner, /const configured=timeoutSetSql\(snapshot\)/);
  assert.match(runner, /operations\.push\(\{\.\.\.snapshot/);
  assert.match(runner, /configured-transaction-setting-no-explicit-lock-operation/);
  assert.doesNotMatch(runner, /(?:set_config\('lock_timeout','1500ms'|SET LOCAL lock_timeout='1500ms')/);
  assert.match(runner, /forcedDeadlineNs=forcedBeginNs\+5_000_000_000n/);
  assert.doesNotMatch(runner, /remainingAtWaiterDispatch=Math\.max\(forcedRemaining\(\),1\)/);
  assert.match(runner, /deadlineSafetyMs:200,lockSafetyMs:100/);
  const forcedWaiter=runner.slice(runner.indexOf("SET LOCAL statement_timeout='${effectiveStatementTimeoutMs}ms'"),
    runner.indexOf("const waiterBlocked="));
  assert.ok(forcedWaiter.indexOf("SET LOCAL lock_timeout='${effectiveLockTimeoutMs}ms'")>0);
  assert.ok(forcedWaiter.indexOf("DO \\$waiter\\$")>forcedWaiter.indexOf("SET LOCAL lock_timeout"));
  assert.match(runner, /actual_wait_elapsed_ms/);
  assert.match(runner, /!waitBudgetEvidence\.waited_until_remaining_budget/);
  assert.doesNotMatch(runner, /waited_until_remaining_budget:true/);
  assert.match(runner, /deadline_exceeded:deadlineExceeded/);
  assert.match(runner, /upper_bound_met:upperBoundMet/);
  assert.match(runner, /rollback_snapshot_exact/);
  assert.doesNotMatch(runner, /accessCounts:/);
  assert.match(runner, /pg_stat_xact_user_tables/);
  assert.match(runner, /deriveNegativeAccessCounts\(accessInstrument\)/);
  assert.match(runner, /head race raw C2 loser must remain 23505/);
  assert.match(runner, /normalize-to-exact-replay-or-version-conflict/);
  assert.match(runner, /never-return-http-500/);
  assert.match(runner, /head_absent_raw_23505_normalization/);
});

test("v12 exact evidence schema has five materialized sidecars and fail-closed artifact paths", () => {
  assert.match(runner, /representative_or_self:"self"/);
  assert.match(runner, /equivalence_signature_ref:null/);
  assert.match(runner, /equivalence_mapping_status:"not-required-all-eight-executed"/);
  assert.match(runner, /evidence_scope:"function-fixture-only"/);
  for (const field of ["remaining_budget_ms", "minimum_remaining_budget_ms", "statement_timeout_ms", "lock_timeout_ms"])
    assert.match(runner, new RegExp(field));
  for (const field of ["container_image_reference", "container_image_digest", "postgresql_version", "pg_settings", "exact_targets"])
    assert.match(runner, new RegExp(field));
  for (const suffix of [".catalog.json", ".functions.json", ".security-controls.json", ".performance.json", ".projection-schema.grammar"])
    assert.match(runner, new RegExp(suffix.replaceAll(".", "\\.")));
  assert.match(runner, /b2a-c2-v12-detached-manifest-v1/);
  assert.match(runner, /self_reference:false,review_status:"pending"/);
  assert.match(runner, /B2A_C2_WATCHDOG_CHILD/);
  assert.match(runner, /\.watchdog\.json/);
  assert.match(runner, /full C2 candidate run requires PROPERTY_B2A_C2_ARTIFACT_PATH/);
  assert.match(runner, /sidecarPayloads\.length!==5/);
  assert.match(runner, /resolved_path:resolve\(root/);
});

test("v12 cleanup polls exact validated container and anonymous volume to daemon absence", () => {
  assert.match(runner, /function boundedExactAbsencePoll/);
  assert.match(runner, /deadline_ms:deadlineMs,[\s\S]*deadline_exceeded:deadlineExceeded,timeline/);
  assert.match(runner, /docker\(\["rm","-f","-v",cleanupTarget\]/);
  assert.match(runner, /inspectExactContainerAbsence\(cleanupTarget,containerName,context\)/);
  assert.match(runner, /docker\(\["volume","rm",exactVolume\]/);
  assert.match(runner, /inspectExactVolumeAbsence\(exactVolume,context\)/);
  assert.match(runner, /removal_commands:\{container_rm:commandEvidence\(containerRm\),volume_rm:commandEvidence\(volumeRm\)\}/);
  assert.match(runner, /absence_polls:\{container:containerPoll,anonymous_volume:volumePoll\}/);
  assert.match(runner, /nonzero_rm_allowed_only_when_final_exact_absent:true/);
  assert.match(runner, /wait\(Math\.min\(intervalMs,deadlineMs-observedMs\)\)/);
  assert.match(runner, /elapsed_ms:elapsedMs,deadline_exceeded:deadlineExceeded/);
  assert.match(runner, /const exactInspectCommandTimeoutMs=2_000/);
  assert.match(runner, /Math\.max\(1,Math\.min\(exactInspectCommandTimeoutMs,deadlineMs-Date\.now\(\)\)\)/);
  assert.match(runner, /timeout:timeoutMs,killSignal:"SIGKILL"/);
  assert.match(runner, /observation\.absent===true&&observedMs<=deadlineMs/);
  assert.match(runner, /late_absence_rejected:observation\.absent===true&&observedMs>deadlineMs/);
  assert.match(runner, /return \{\.\.\.dropEvidence,status:lifecycle\.status,lifecycle_status:lifecycle\.status/);
  assert.match(runner, /process\.exit\(result\.lifecycle_status\)/);
  assert.match(runner, /SIGINT-drop-fail-primary-preserved/);
  assert.match(runner, /SIGTERM-temp-fail-primary-preserved/);
  assert.match(runner, /exact container remained present after bounded removal deadline/);
  assert.match(runner, /exact anonymous volume remained present after bounded removal deadline/);
  assert.doesNotMatch(runner, /docker\(\["(?:system|container|volume)","prune"/);
});

test("v12 binds the signed budget identities without conflating candidate and signoff", () => {
  assert.match(runner, /addendum_raw_sha256: budgetContract\.candidate_raw_sha256/);
  assert.match(runner, /addendum_final_signoff_raw_sha256:budgetContract\.addendum_final_signoff_raw_sha256/);
  assert.match(runner, /canonical_budget_digest: budgetContract\.canonical_budget_digest/);
  assert.match(runner, /candidate_raw_sha256: "127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4"/);
  assert.match(runner, /addendum_final_signoff_raw_sha256: "1744d43ec80c9faeb52abb8659c78655df6575ad75024392b1c770644a5a0ac4"/);
});

test("v12 migration history is append-only and 000190 is proven unchanged across 000194", () => {
  const historyFunction = runner.slice(runner.indexOf("function recordHistory"), runner.indexOf("function migrationFileAndHistoryEvidence"));
  assert.doesNotMatch(historyFunction, /ON CONFLICT/);
  assert.match(runner, /migration190Before=migrationFileAndHistoryEvidence/);
  assert.match(runner, /000190 signed raw sha before 000194/);
  assert.match(runner, /JSON\.stringify\(migration190After\)!==JSON\.stringify\(migration190Before\)/);
  assert.match(runner, /da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a/);
});

test("detached equivalence candidate is immutable, unsigned and excludes production claims", () => {
  const rawSha = createHash("sha256").update(mapping).digest("hex");
  assert.equal(rawSha, mappingManifest.canonical_artifact.raw_sha256);
  assert.equal(mapping.length, mappingManifest.canonical_artifact.byte_length);
  assert.equal(mappingManifest.self_reference, false);
  const parsed=JSON.parse(mapping);
  assert.equal(parsed.exact_action_scope.length,8);
  for(const group of parsed.classes)for(const dimension of ["sql_sequence","locks","payload","writes","transaction","deadline","fault"]){
    const row=group.dimensions[dimension];
    for(const field of ["representative","mapped","comparison","dominates","evidence"])assert.ok(Object.hasOwn(row,field));
  }
  assert.equal(parsed.exclusions.production_controller_service_receipt_port,"pending_C4");
  assert.equal(parsed.exclusions.real_adapter_cardinality,"pending_B2c");
  assert.equal(parsed.dispositions.open_p0_p1,"not_computed");
  assert.equal(mappingManifest.release,"blocked");
});

test("v12 full candidate template remains pending and targeted evidence remains non-candidate", () => {
  assert.match(candidateTemplate, /FULL-C FAILED \/ NEXT FULL-D NOT RUN \/ NOT SIGNABLE/);
  assert.match(candidateTemplate, /b2a-c2-candidate-gate-artifact-v12\.json/);
  assert.match(candidateTemplate, /b2a-c2-candidate-gate-artifact-v12b\.json/);
  assert.match(candidateTemplate, /b2a-c2-candidate-gate-artifact-v12c\.json/);
  assert.match(candidateTemplate, /b2a-c2-candidate-gate-artifact-v12d\.json/);
  assert.match(candidateTemplate, /does not retroactively change the run to PASS/);
  assert.match(candidateTemplate, /must not be overwritten/);
  assert.match(candidateTemplate, /candidate_gate = NOT_RUN/);
  assert.match(candidateTemplate, /C2_release = blocked/);
  assert.match(targetedSummary, /TARGETED DIAGNOSTIC \/ NOT CANDIDATE \/ NOT C2 SIGNOFF/);
  assert.match(targetedSummary, /There is therefore no targeted raw artifact SHA/);
  assert.match(targetedSummary, /b2ac2_v12_targeted_20260801a/);
  assert.match(targetedSummary, /b2ac2_v12_targeted_20260801b/);
  assert.match(targetedSummary, /b2ac2_v12_targeted_20260801c/);
  assert.match(targetedSummary, /b2ac2_v12_targeted_20260801d/);
  assert.match(targetedSummary, /Eight signed action families and their 160 measured attempts/);
  assert.match(targetedSummary, /Two-million-row performance fixture/);
  assert.match(targetedSummary, /Outer watchdog injection/);
});
