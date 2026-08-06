import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCrossOwnerProductionExceptions,
  assertFailedRunClosure,
  assertTaskProductionSources,
  runC4InputGate
} from "./track-b2a-c4-input-gate.mjs";

const source = (text) => [{ path: "apps/api/src/modules/property-tasks/example.ts", source: text }];

test("C4 frozen input and ownership gate independently passes", () => {
  const result = runC4InputGate();
  assert.equal(result.status, "passed");
  assert.equal(result.recalculated.endpoint_row_count, 49);
  assert.equal(result.recalculated.approval_file_count, 53);
  assert.equal(result.recalculated.approval_grammar_bytes, 8182);
  assert.equal(result.recalculated.approval_runtime_sha256,
    "1d9b5533fff085a125c8aae913b6ff06ac3e7d73606e5710ec796964ec48e853");
  assert.deepEqual(result.cross_owner_production_exceptions, {
    count: 1,
    paths: ["apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts"]
  });
  assert.deepEqual(result.open_p0_p1, []);
});

test("C4 v2 rejects failed-run cleanup and detached-evidence tampering", () => {
  const freeze = {
    "failed-run-01i-cleanup-status": "passed",
    "failed-run-01i-container-absent": "true",
    "failed-run-01i-anonymous-volume-absent": "true",
    "failed-run-01i-artifact": "artifact-sha",
    "failed-run-01i-reservation": "reservation-sha"
  };
  const failedRun = { status: "failed", candidate_admissible: false,
    cleanup: { status: "passed", container_absent: true, anonymous_volume_absent: true,
      errors: [] } };
  const manifest = "run_id\tb2ac4_runtime_formal_v11_20260801i\nstatus\tfailed\n"
    + "candidate_admissible\tfalse\nartifact-sha\nreservation-sha\n";
  const reservation = { run_id: "b2ac4_runtime_formal_v11_20260801i",
    artifact: ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/c4-runtime-formal-candidate-v11-20260801i.json",
    manifest: ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/c4-runtime-formal-candidate-v11-20260801i.manifest.txt" };
  assert.doesNotThrow(() => assertFailedRunClosure(freeze, failedRun, manifest, reservation));
  assert.throws(() => assertFailedRunClosure(freeze, { ...failedRun,
    cleanup: { ...failedRun.cleanup, anonymous_volume_absent: false } }, manifest, reservation),
  /anonymous volume absence/);
  assert.throws(() => assertFailedRunClosure(freeze, failedRun,
    manifest.replace("artifact-sha", "tampered"), reservation), /does not bind artifact-sha/);
  assert.throws(() => assertFailedRunClosure(freeze, failedRun, manifest,
    { ...reservation, run_id: "rolled_back" }), /reservation runId/);
});

test("C4 v2 rejects widened, missing or additional cross-owner production exceptions", () => {
  const exact = {
    "allowed-cross-owner-production-exception-count": "1",
    "allowed-cross-owner-production-exception":
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.ts"
  };
  assert.doesNotThrow(() => assertCrossOwnerProductionExceptions(exact));
  for (const tampered of [
    { ...exact, "allowed-cross-owner-production-exception-count": "2" },
    { ...exact, "allowed-cross-owner-production-exception": "apps/api/src/modules/property-approvals/**" },
    { ...exact, "allowed-cross-owner-production-exception":
      "apps/api/src/modules/property-approvals/property-mutation-receipt.adapter.spec.ts" }
  ]) assert.throws(() => assertCrossOwnerProductionExceptions(tampered), /exact single adapter path/);
});

test("C4 production scanner rejects direct projection and head DML", () => {
  for (const statement of [
    "INSERT INTO public.biz_property_task_projection (id) VALUES (1)",
    "UPDATE biz_property_task_projection_head SET projection_version = 2",
    "DELETE FROM public.biz_property_task_projection WHERE task_id = $1"
  ]) {
    assert.throws(() => assertTaskProductionSources(source(statement)),
      /direct projection\/head DML/);
  }
});

test("C4 production scanner permits only receipt-port mediated access", () => {
  assert.throws(() => assertTaskProductionSources(source(
    "import { DatabasePropertyMutationReceiptAdapter } from '../property-approvals/property-mutation-receipt.adapter';"
  )), /bypasses the receipt port token/);
  assert.throws(() => assertTaskProductionSources(source(
    "const query = 'select * from biz_property_mutation_receipt';"
  )), /bypasses the receipt port token/);
  assert.throws(() => assertTaskProductionSources(source(
    "class MutationReceiptCoordinator {}"
  )), /without PROPERTY_MUTATION_RECEIPT_PORT/);
  assert.doesNotThrow(() => assertTaskProductionSources(source(
    "import { PROPERTY_MUTATION_RECEIPT_PORT } from '@jinhu/shared';\n"
      + "const sql = 'select * from fn_property_task_projection_replace_v1($1)';"
  )));
});

test("C4 production scanner rejects test-only fixture registrations", () => {
  assert.throws(() => assertTaskProductionSources(source(
    "const sourceType = 'test_fixture_homestay';"
  )), /contains test_fixture_\*/);
});
