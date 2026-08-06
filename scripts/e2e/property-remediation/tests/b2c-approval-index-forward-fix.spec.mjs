import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import {
  classifyHistoryRows, scenarios, targets, validateFailedRetryReview, validateTargetIdentity,
} from "../track-b2c-approval-index-forward-fix-gate.mjs";

const root = process.cwd();
const research = resolve(root, ".trellis/tasks/07-30-pr192-b-domain-integrations/research");
const migrationPath = resolve(root, "database/migrations/000197_property_approval_active_source_index_forward_fix.sql");
const runnerPath = resolve(root, "scripts/e2e/property-remediation/track-b2c-approval-index-forward-fix-gate.mjs");
const r0Path = resolve(research, "b2c-000197-r0-reservation-candidate-20260802.grammar");
const r1Path = resolve(research, "b2c-000197-r1-v2-checksum-seal-20260802.grammar");
const migration = readFileSync(migrationPath, "utf8");
const runner = readFileSync(runnerPath, "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exact = (status = "succeeded", checksum = "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059") => ({
  filename: "000197_property_approval_active_source_index_forward_fix.sql", checksum, status,
});
const unknown = (suffix = "unknown.sql", status = "succeeded") => ({
  filename: `000197_${suffix}`, checksum: "1".repeat(64), status,
});
const rejects = (fn, marker) => assert.throws(fn, new RegExp(marker));

test("v2 immutable R0/R1/SQL chain is exact and old R1 is audit-only", () => {
  assert.equal(sha256(readFileSync(r0Path)), "705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439");
  assert.equal(sha256(readFileSync(r1Path)), "244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b");
  assert.equal(sha256(readFileSync(migrationPath)), "a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059");
  const r1 = readFileSync(r1Path, "utf8");
  assert.match(r1, /r0_raw_sha256\t705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439/);
  assert.match(r1, /superseded_r1_disposition\tRETURNED-audit-only-never-executed/);
  assert.match(r1, /execution_authorized\tfalse-until-v2-sql-r1-two-independent-go/);
});

test("SQL checks the complete 000197 prefix and exact self history", () => {
  assert.match(migration, /unknown-000197-history/);
  assert.match(migration, /filename LIKE '000197\\_%' ESCAPE '\\' AND filename<>v_self_filename/g);
  assert.match(migration, /v_primary_filename IS NULL\) IS DISTINCT FROM \(v_standard_filename IS NULL/);
  assert.match(migration, /v_primary_checksum IS DISTINCT FROM v_standard_checksum/);
  assert.match(migration, /v_primary_status IS DISTINCT FROM v_standard_status/);
  assert.match(migration, /v_primary_status NOT IN \('running','succeeded'\)/);
});

test("history classifier executes every required matrix branch", () => {
  assert.deepEqual(classifyHistoryRows([], []), { decision: "execute", state: "dual-absent" });
  assert.deepEqual(classifyHistoryRows([exact()], [exact()]),
    { decision: "skip-and-verify", state: "dual-succeeded" });
  rejects(() => classifyHistoryRows([exact("running")], [exact("running")]), "running-hard-fail");
  rejects(() => classifyHistoryRows([exact("failed")], [exact("failed")]), "failed-review-path-sha-required");
  rejects(() => classifyHistoryRows([exact()], []), "single-sided-hard-fail");
  rejects(() => classifyHistoryRows([], [exact()]), "single-sided-hard-fail");
  rejects(() => classifyHistoryRows([exact()], [exact("running")]), "mismatch-hard-fail");
  rejects(() => classifyHistoryRows([exact()], [exact("succeeded", "2".repeat(64))]), "mismatch-hard-fail");
  rejects(() => classifyHistoryRows([unknown()], [unknown()]), "unknown-prefix-hard-fail");
  rejects(() => classifyHistoryRows([unknown()], []), "unknown-prefix-hard-fail");
  rejects(() => classifyHistoryRows([exact(), unknown()], [exact()]), "unknown-prefix-hard-fail");
  rejects(() => classifyHistoryRows([unknown("a.sql"), unknown("b.sql")],
    [unknown("a.sql"), unknown("b.sql")]), "unknown-prefix-hard-fail");
  rejects(() => classifyHistoryRows([exact("mystery")], [exact("mystery")]), "unknown-status-hard-fail");
  rejects(() => classifyHistoryRows([exact("succeeded", "3".repeat(64))],
    [exact("succeeded", "3".repeat(64))]), "checksum-hard-fail");
});

test("failed retry rejects arbitrary nonempty proof and requires lowercase raw SHA", () => {
  const target = targets[0];
  rejects(() => validateFailedRetryReview({ path: "anything", rawSha: "x", target }), "path-sha-required");
  rejects(() => validateFailedRetryReview({ path: "anything", rawSha: "A".repeat(64), target }), "path-sha-required");
  rejects(() => validateFailedRetryReview({ path: "anything", rawSha: "a".repeat(64), target }),
    "path-not-immutable-research-child");
  rejects(() => classifyHistoryRows([exact("failed")], [exact("failed")], {
    failedRetryReview: { path: "anything", rawSha: "a".repeat(64), target },
  }), "path-not-immutable-research-child");
});

function inspectFixture(target) {
  return {
    Id: target.containerId, Name: `/${target.container}`, Image: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    Config: { Image: "postgres:16-alpine", Env: [`POSTGRES_DB=${target.database}`] },
    State: { Running: true }, Mounts: [{ Type: "volume", Name: target.volume, Destination: "/var/lib/postgresql/data" }],
  };
}

test("resource classifier rejects same-name replacement and every frozen identity drift", () => {
  const target = targets[0]; const observed = [target.database, "16.14"];
  assert.equal(validateTargetIdentity(target, inspectFixture(target), observed).container_id, target.containerId);
  for (const mutate of [
    (x) => { x.Id = "f".repeat(64); },
    (x) => { x.Name = "/same-name-replacement"; },
    (x) => { x.Image = "sha256:" + "f".repeat(64); },
    (x) => { x.Config.Image = "postgres:17-alpine"; },
    (x) => { x.State.Running = false; },
    (x) => { x.Mounts[0].Name = "replacement-volume"; },
    (x) => { x.Config.Env = ["POSTGRES_DB=wrong"]; },
  ]) {
    const fixture = structuredClone(inspectFixture(target)); mutate(fixture);
    rejects(() => validateTargetIdentity(target, fixture, observed), "resource-identity-drift");
  }
  rejects(() => validateTargetIdentity(target, inspectFixture(target), ["wrong", "16.14"]), "postgres-identity-drift");
  rejects(() => validateTargetIdentity(target, inspectFixture(target), [target.database, "16.13"]), "postgres-identity-drift");
});

test("SQL retains exact lock, signed catalog and create-first swap", () => {
  const positions = ["BEGIN;", "SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '120s';",
    "LOCK TABLE public.biz_property_approval_request IN SHARE MODE;", "DO $preflight$",
    "CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build",
    "DROP INDEX public.uq_biz_property_approval_request_active_source;",
    "ALTER INDEX public.uq_biz_property_approval_request_active_source_v2_build", "DO $postcheck$", "COMMIT;"
  ].map((token, index) => index === 9 ? migration.lastIndexOf(token) : migration.indexOf(token));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  for (const hash of ["89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584",
    "d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37",
    "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c",
    "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda"]) assert.match(migration, new RegExp(hash));
  assert.doesNotMatch(migration, /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i);
  assert.doesNotMatch(migration, /(?:CREATE|DROP)\s+(?:UNIQUE\s+)?INDEX\s+IF\s+(?:NOT\s+)?EXISTS/i);
});

test("runner freezes worktree rescan, manifest, exact resources and review fields", () => {
  for (const marker of ["worktree-list-drift", "repo-worktree-prefix-scan-drift", "manifest-file-drift",
    "resource-identity-drift", "review-artifact-duplicate-key", "review-raw-sha-mismatch",
    "review-authority-or-decision-drift", "corrected_catalog_decision", "reviewer_authority"]) {
    assert.match(runner, new RegExp(marker));
  }
  assert.doesNotMatch(runner, /command\("docker", \["(?:run|rm|stop|kill|volume|system|prune)"/);
});

test("all section 10 scenarios remain registered and final-only cases stay deferred", () => {
  assert.equal(scenarios.length, 15);
  assert.deepEqual(scenarios.map((value) => Number(value.slice(0, 2))),
    Array.from({ length: 15 }, (_, index) => index + 1));
  assert.match(runner, /deferred: \["01-fresh-final-ordered-catalog", "03-upgrade-191-192-present-exact"/);
  assert.match(runner, /"14-later-191-192-application-preserves-index-and-data", "final-current-handoff"/);
  assert.match(runner, /live-execution-locked-pending-v2-two-independent-go/);
});
