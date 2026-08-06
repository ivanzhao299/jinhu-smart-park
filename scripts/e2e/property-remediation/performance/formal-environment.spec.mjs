import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { assertSourceReady, loadEnvironmentConfig } from "./formal-environment.mjs";

const digest = "a".repeat(64);

function fixtureEnv() {
  const directory = mkdtempSync(resolve(tmpdir(), "property-perf-env-"));
  const dump = resolve(directory, "isolated.dump");
  writeFileSync(dump, Buffer.from("PGDMPfixture-only"));
  return {
    PROPERTY_PERF_PROJECT_NAME: "jinhu-track-c-perf-fixture",
    PROPERTY_PERF_POSTGRES_DB: "jinhu_perf_fixture",
    PROPERTY_PERF_POSTGRES_IMAGE: `postgres@sha256:${digest}`,
    PROPERTY_PERF_BROWSER_IMAGE: `node@sha256:${digest}`,
    PROPERTY_PERF_DATASET_DUMP: dump,
    PROPERTY_PERF_USERNAME: "perf_admin",
    PROPERTY_PERF_ADMIN_NAME: "Performance Admin",
    PROPERTY_PERF_PASSWORD: "Fixture-Only-Password-123!",
    PROPERTY_PERF_POSTGRES_PASSWORD: "fixture-postgres-password-1234567890",
    PROPERTY_PERF_JWT_SECRET: "fixture-jwt-secret-12345678901234567890",
    PROPERTY_PERF_PARTY_DATA_ENCRYPTION_KEY: "fixture-party-key-12345678901234567890",
    PROPERTY_PERF_BUSINESS_CLOCK: "2026-08-04T00:00:00Z",
    PROPERTY_PERF_REVIEWER: "release-reviewer"
  };
}

test("accepts an isolated digest-pinned environment contract", async () => {
  const config = await loadEnvironmentConfig(fixtureEnv());
  assert.equal(config.projectName, "jinhu-track-c-perf-fixture");
  assert.equal(config.postgresDb, "jinhu_perf_fixture");
  assert.equal(config.dataset.size, 17);
  assert.match(config.dataset.sha256, /^[0-9a-f]{64}$/u);
});

test("rejects shared names, mutable images and weak credentials", async () => {
  const shared = fixtureEnv();
  shared.PROPERTY_PERF_PROJECT_NAME = "jinhu-uat";
  await assert.rejects(loadEnvironmentConfig(shared), /invalid performance project name/u);

  const mutable = fixtureEnv();
  mutable.PROPERTY_PERF_POSTGRES_IMAGE = "postgres:16-alpine";
  await assert.rejects(loadEnvironmentConfig(mutable), /pinned by sha256 digest/u);

  const weak = fixtureEnv();
  weak.PROPERTY_PERF_PASSWORD = "alllowercasepassword";
  await assert.rejects(loadEnvironmentConfig(weak), /bootstrap strength rules/u);
});

test("source readiness includes untracked formal source paths and fails closed", async () => {
  let observedArgs;
  await assertSourceReady({ execute: async (_executable, args) => {
    observedArgs = args;
    return { stdout: "" };
  } });
  assert.ok(observedArgs.includes("--untracked-files=all"));
  assert.ok(!observedArgs.includes("--untracked-files=no"));
  await assert.rejects(assertSourceReady({ execute: async () => ({ stdout: "?? scripts/untracked-formal-input.mjs\n" }) }), /uncommitted changes/u);

  const repository = mkdtempSync(resolve(tmpdir(), "property-perf-source-ready-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    mkdirSync(resolve(repository, "scripts"));
    writeFileSync(resolve(repository, "scripts/untracked-formal-input.mjs"), "export default true;\n");
    await assert.rejects(assertSourceReady({ cwd: repository }), /uncommitted changes/u);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("compose definition fixes all formal resources and isolates state", () => {
  const compose = readFileSync(resolve(import.meta.dirname, "compose.formal.yml"), "utf8");
  for (const marker of ["cpus: 1", "cpus: 2", "mem_limit: 1g", "mem_limit: 2g", "mem_limit: 4g", "${PROPERTY_PERF_PROJECT_NAME}-postgres-data", "PROPERTY_PERF_DATASET_DUMP", "track_io_timing=on"]) assert.match(compose, new RegExp(marker.replace(/[${}]/gu, "\\$&"), "u"));
  assert.doesNotMatch(compose, /jinhu_uat_20260804|jinhu-smart-park-postgres/u);
  const control = compose.slice(compose.indexOf("  control:"));
  for (const marker of [
    "FILE_STORAGE_LOCAL_ROOT: /var/lib/jinhu/performance-control-files",
    'AUTH_SMS_FIXED_CODE: ""',
    'AUTH_SMS_CODE_VISIBLE: "false"',
    'AUTH_WECHAT_MOCK_ENABLED: "false"'
  ]) assert.match(control, new RegExp(marker, "u"));
  const environmentControl = readFileSync(resolve(import.meta.dirname, "environment-control.sh"), "utf8");
  for (const command of ["db-migrate.sh", "db-seed-prod.sh", "bootstrap-admin.sh", "check-init-baseline.sh", "pg_restore"]) assert.match(environmentControl, new RegExp(command, "u"));
});
