import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { checkConfig, deriveResourceObservation, loadConfig } from "./formal-executor.mjs";

const hash = "a".repeat(64);

function fixtureEnv() {
  const directory = mkdtempSync(resolve(tmpdir(), "track-c-perf-"));
  const dataset = resolve(directory, "dataset.json");
  const seed = resolve(directory, "seed.sql");
  writeFileSync(dataset, "{}\n");
  writeFileSync(seed, "-- fixture\n");
  return {
    PROPERTY_PERF_BASE_URL: "http://api.example.test:3101",
    PROPERTY_PERF_USERNAME: "performance-user",
    PROPERTY_PERF_PASSWORD: "not-a-real-password",
    PROPERTY_PERF_CONTAINERS_JSON: JSON.stringify({ web: "perf-web", api: "perf-api", postgres: "perf-postgres", browserWorker: "perf-browser" }),
    PROPERTY_PERF_DATASET_MANIFEST: dataset,
    PROPERTY_PERF_SEED_MANIFEST: seed,
    PROPERTY_PERF_BUSINESS_CLOCK: "2026-08-04T00:00:00Z",
    PROPERTY_PERF_RESTART_COMMAND: "/opt/perf/restart.sh",
    PROPERTY_PERF_CLEANUP_COMMAND: "/opt/perf/cleanup.sh",
    PROPERTY_PERF_GC_COMMAND: "/opt/perf/gc-observation.sh",
    PROPERTY_PERF_DB_WAIT_COMMAND: "/opt/perf/db-wait-observation.sh",
    PROPERTY_PERF_POSTGRES_PARAMETERS_COMMAND: "/opt/perf/pg-parameters.sh",
    PROPERTY_PERF_REVIEWER: "track-c-release-reviewer"
  };
}

test("accepts a complete credential-safe formal configuration", async () => {
  const env = fixtureEnv();
  const config = loadConfig(env);
  assert.equal(config.baseUrl, "http://api.example.test:3101");
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
    HostConfig: { NanoCpus: value.cpu * 1_000_000_000, Memory: value.memoryMiB * 1024 * 1024 }
  }]));
  assert.deepEqual(deriveResourceObservation(inspections, profile).limits, profile);
  inspections.api.HostConfig.Memory = 1024 * 1024;
  assert.throws(() => deriveResourceObservation(inspections, profile), /fixed resource mismatch: api/u);
});
