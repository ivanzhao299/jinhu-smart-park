import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalProfilePath, validateFormalEvidence } from "./formal-evidence-gate.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const profileBytes = readFileSync(canonicalProfilePath);
const profile = JSON.parse(profileBytes);
const h = hash("fixture");

function evidence() {
  const results = profile.scenarios.flatMap(({ id }) => profile.concurrency.flatMap((concurrency) => profile.temperatureByRun.map((temperature, index) => ({
    key: `${id}|c${concurrency}|r${index + 1}|${temperature}`,
    temperature,
    warmupSeconds: 120,
    formalSeconds: 600,
    requests: 10000,
    coldStartProofSha256: temperature === "cold" ? h : null,
    metrics: { p50Milliseconds: 50, p90Milliseconds: 70, p95Milliseconds: 80, p99Milliseconds: 100, throughputPerSecond: 20, errorRate: 0, cpuPercentP95: 50, memoryMiBP95: 500, gcPauseMillisecondsP95: 3, dbWaitMillisecondsP95: 2 }
  }))));
  const businessClock = "2026-08-04T00:00:00Z";
  return { schemaVersion: "property-track-c-performance-evidence-v1", profileSha256: hash(profileBytes), commitSha: h.slice(0, 40), datasetChecksum: h, environment: { limits: profile.resourceProfile, imageDigests: Object.fromEntries(Object.keys(profile.resourceProfile).map((key) => [key, `sha256:${h}`])), postgresParameters: { shared_buffers: "1GB" }, seedSha256: h, environmentDigest: h, businessClock, seedBusinessClock: businessClock, businessClockBindings: Object.fromEntries(Object.keys(profile.resourceProfile).map((key) => [key, businessClock])) }, results, cleanup: { attempted: true, residualCount: 0, manifestSha256: h }, failureLogs: [] };
}

test("accepts complete fixed-profile evidence", () => assert.equal(validateFormalEvidence(evidence()).status, "PASS"));

test("fails closed when a run or cleanup proof is missing", () => {
  const value = evidence();
  value.results.pop();
  value.cleanup.residualCount = 1;
  const result = validateFormalEvidence(value);
  assert.equal(result.status, "FAIL");
  assert(result.errors.includes("incomplete 5-run/concurrency/cold-warm matrix"));
  assert(result.errors.includes("cleanup residual/proof"));
});

test("fails thresholds and missing telemetry dimensions", () => {
  const value = evidence();
  value.results[0].metrics.p95Milliseconds = 2000;
  delete value.results[0].metrics.dbWaitMillisecondsP95;
  const result = validateFormalEvidence(value);
  assert.equal(result.status, "FAIL");
  assert(result.errors.some((item) => item.includes("missing metric dbWaitMillisecondsP95")));
});

test("fails when a measured container is not bound to the declared business clock", () => {
  const value = evidence();
  delete value.environment.businessClockBindings.api;
  const result = validateFormalEvidence(value);
  assert.equal(result.status, "FAIL");
  assert(result.errors.includes("business clock binding mismatch: api"));
});

test("fails when the seed manifest clock is stale or the declared clock is invalid", () => {
  const stale = evidence();
  stale.environment.seedBusinessClock = "2026-08-05T00:00:00Z";
  assert(validateFormalEvidence(stale).errors.includes("seed manifest business clock mismatch"));
  const invalid = evidence();
  invalid.environment.businessClock = "not-a-date";
  assert(validateFormalEvidence(invalid).errors.includes("incomplete environment provenance"));
});
