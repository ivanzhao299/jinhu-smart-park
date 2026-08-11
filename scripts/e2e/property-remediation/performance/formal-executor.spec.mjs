import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { checkConfig, deriveBusinessClockBindings, deriveResourceObservation, loadConfig, seedBusinessClock } from "./formal-executor.mjs";

const hash = "a".repeat(64);

function fixtureEnv() {
  const directory = mkdtempSync(resolve(tmpdir(), "track-c-perf-"));
  const dataset = resolve(directory, "dataset.json");
  const seed = resolve(directory, "seed.sql");
  writeFileSync(dataset, "{}\n");
  writeFileSync(seed, `${JSON.stringify({ businessClock: "2026-08-04T00:00:00Z", files: [] })}\n`);
  const datasetSha256 = createHash("sha256").update(readFileSync(dataset)).digest("hex");
  return {
    PROPERTY_PERF_BASE_URL: "http://api.example.test:3101",
    PROPERTY_PERF_WORKER_BASE_URL: "http://api:3001",
    PROPERTY_PERF_USERNAME: "performance-user",
    PROPERTY_PERF_PASSWORD: "not-a-real-password",
    PROPERTY_PERF_CONTAINERS_JSON: JSON.stringify({ web: "perf-web", api: "perf-api", postgres: "perf-postgres", browserWorker: "perf-browser" }),
    PROPERTY_PERF_DATASET_MANIFEST: dataset,
    PROPERTY_PERF_EXPECTED_DATASET_SHA256: datasetSha256,
    PROPERTY_PERF_APPROVED_COMMIT_SHA: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    PROPERTY_PERF_APPROVED_POSTGRES_IMAGE: `postgres@sha256:${hash}`,
    PROPERTY_PERF_APPROVED_BROWSER_IMAGE: `node@sha256:${hash}`,
    PROPERTY_PERF_SEED_MANIFEST: seed,
    PROPERTY_PERF_BUSINESS_CLOCK: "2026-08-04T00:00:00Z",
    PROPERTY_PERF_RESTART_COMMAND: "/opt/perf/restart.sh",
    PROPERTY_PERF_CLEANUP_COMMAND: "/opt/perf/cleanup.sh",
    PROPERTY_PERF_GC_COMMAND: "/opt/perf/gc-observation.sh",
    PROPERTY_PERF_DB_WAIT_COMMAND: "/opt/perf/db-wait-observation.sh",
    PROPERTY_PERF_POSTGRES_PARAMETERS_COMMAND: "/opt/perf/pg-parameters.sh",
    PROPERTY_PERF_REVIEWER: "track-c-release-reviewer",
    PROPERTY_PERF_EXECUTION_OWNER: "track-c-performance-runner"
  };
}

test("accepts a complete credential-safe formal configuration", async () => {
  const env = fixtureEnv();
  const config = loadConfig(env);
  assert.equal(config.baseUrl, "http://api.example.test:3101");
  assert.equal(config.workerBaseUrl, "http://api:3001");
  assert.deepEqual(await checkConfig(env), {
    status: "PASS",
    schemaVersion: "property-track-c-performance-config-check-v1",
    matrixRuns: 30,
    secretsLogged: false
  });
});

test("fails closed for missing inputs and credentials embedded in commands", () => {
  const env = fixtureEnv();
  delete env.PROPERTY_PERF_GC_COMMAND;
  assert.throws(() => loadConfig(env), /PROPERTY_PERF_GC_COMMAND/u);

  const unsafe = fixtureEnv();
  unsafe.PROPERTY_PERF_RESTART_COMMAND = `restart --password=${unsafe.PROPERTY_PERF_PASSWORD}`;
  assert.throws(() => loadConfig(unsafe), /must not embed credentials/u);
});

test("requires the exact four-container resource profile and immutable image ids", () => {
  const profile = {
    web: { cpu: 1, memoryMiB: 1024 },
    api: { cpu: 2, memoryMiB: 2048 },
    postgres: { cpu: 2, memoryMiB: 4096 },
    browserWorker: { cpu: 2, memoryMiB: 2048 }
  };
  const inspections = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, {
    Image: `sha256:${hash}`,
    Config: { Image: key === "postgres" ? `postgres@sha256:${hash}` : key === "browserWorker" ? `node@sha256:${hash}` : `local-${key}:fixture` },
    HostConfig: { NanoCpus: value.cpu * 1_000_000_000, Memory: value.memoryMiB * 1024 * 1024 }
  }]));
  assert.deepEqual(deriveResourceObservation(inspections, profile).limits, profile);
  assert.deepEqual(deriveResourceObservation(inspections, profile, { postgres: `postgres@sha256:${hash}`, browserWorker: `node@sha256:${hash}` }).imageReferences, { postgres: `postgres@sha256:${hash}`, browserWorker: `node@sha256:${hash}` });
  assert.throws(() => deriveResourceObservation(inspections, profile, { postgres: `postgres@sha256:${"b".repeat(64)}` }), /approved image reference mismatch: postgres/u);
  inspections.api.HostConfig.Memory = 1024 * 1024;
  assert.throws(() => deriveResourceObservation(inspections, profile), /fixed resource mismatch: api/u);
});

test("fails closed when the dataset checksum or reviewer binding drifts", async () => {
  const dataset = fixtureEnv();
  dataset.PROPERTY_PERF_EXPECTED_DATASET_SHA256 = "b".repeat(64);
  await assert.rejects(checkConfig(dataset), /dataset checksum does not match approved input/u);
  const reviewer = fixtureEnv();
  reviewer.PROPERTY_PERF_EXECUTION_OWNER = reviewer.PROPERTY_PERF_REVIEWER.toUpperCase();
  assert.throws(() => loadConfig(reviewer), /reviewer must be independent/u);
});

test("requires the declared dataset business clock on every measured container", () => {
  const businessClock = "2026-08-04T00:00:00Z";
  const inspections = Object.fromEntries(["web", "api", "postgres", "browserWorker"].map((key) => [key, {
    Config: { Env: [`PROPERTY_PERF_BUSINESS_CLOCK=${businessClock}`] }
  }]));
  assert.deepEqual(deriveBusinessClockBindings(inspections, businessClock), {
    web: businessClock,
    api: businessClock,
    postgres: businessClock,
    browserWorker: businessClock
  });
  inspections.api.Config.Env = [];
  assert.throws(() => deriveBusinessClockBindings(inspections, businessClock), /business clock binding mismatch: api/u);
});

test("requires the seed manifest to bind the declared dataset business clock", () => {
  const env = fixtureEnv();
  assert.equal(seedBusinessClock(env.PROPERTY_PERF_SEED_MANIFEST, env.PROPERTY_PERF_BUSINESS_CLOCK), env.PROPERTY_PERF_BUSINESS_CLOCK);
  writeFileSync(env.PROPERTY_PERF_SEED_MANIFEST, `${JSON.stringify({ businessClock: "2026-08-05T00:00:00Z", files: [] })}\n`);
  assert.throws(() => seedBusinessClock(env.PROPERTY_PERF_SEED_MANIFEST, env.PROPERTY_PERF_BUSINESS_CLOCK), /seed manifest business clock mismatch/u);
});

test("telemetry sampling is serialized before the final sample", () => {
  const source = readFileSync(resolve(import.meta.dirname, "formal-executor.mjs"), "utf8");
  assert.doesNotMatch(source, /setInterval\(sample,/u);
  assert.match(source, /await pendingSample;/u);
});
