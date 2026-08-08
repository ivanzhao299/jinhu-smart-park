import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { assertSourceReady, cleanupInventory, loadEnvironmentConfig } from "./formal-environment.mjs";

const digest = "a".repeat(64);

function fixtureEnv() {
  const directory = mkdtempSync(resolve(tmpdir(), "property-perf-env-"));
  const dump = resolve(directory, "isolated.dump");
  writeFileSync(dump, Buffer.from("PGDMPfixture-only"));
  const expectedDatasetSha256 = createHash("sha256").update(readFileSync(dump)).digest("hex");
  const approvedCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return {
    PROPERTY_PERF_PROJECT_NAME: "jinhu-track-c-perf-fixture",
    PROPERTY_PERF_POSTGRES_DB: "jinhu_perf_fixture",
    PROPERTY_PERF_POSTGRES_IMAGE: `postgres@sha256:${digest}`,
    PROPERTY_PERF_BROWSER_IMAGE: `node@sha256:${digest}`,
    PROPERTY_PERF_APPROVED_POSTGRES_IMAGE: `postgres@sha256:${digest}`,
    PROPERTY_PERF_APPROVED_BROWSER_IMAGE: `node@sha256:${digest}`,
    PROPERTY_PERF_EXPECTED_DATASET_SHA256: expectedDatasetSha256,
    PROPERTY_PERF_APPROVED_COMMIT_SHA: approvedCommitSha,
    PROPERTY_PERF_DATASET_DUMP: dump,
    PROPERTY_PERF_USERNAME: "perf_admin",
    PROPERTY_PERF_ADMIN_NAME: "Performance Admin",
    PROPERTY_PERF_PASSWORD: "Fixture-Only-Password-123!",
    PROPERTY_PERF_POSTGRES_PASSWORD: "fixture-postgres-password-1234567890",
    PROPERTY_PERF_JWT_SECRET: "fixture-jwt-secret-12345678901234567890",
    PROPERTY_PERF_PARTY_DATA_ENCRYPTION_KEY: "fixture-party-key-12345678901234567890",
    PROPERTY_PERF_BUSINESS_CLOCK: "2026-08-04T00:00:00Z",
    PROPERTY_PERF_REVIEWER: "release-reviewer",
    PROPERTY_PERF_EXECUTION_OWNER: "performance-runner"
  };
}

test("accepts an isolated digest-pinned environment contract", async () => {
  const config = await loadEnvironmentConfig(fixtureEnv());
  assert.equal(config.projectName, "jinhu-track-c-perf-fixture");
  assert.equal(config.postgresDb, "jinhu_perf_fixture");
  assert.equal(config.dataset.size, 17);
  assert.match(config.dataset.sha256, /^[0-9a-f]{64}$/u);
});

test("rejects drift from approved dataset and external image inputs", async () => {
  const dataset = fixtureEnv();
  dataset.PROPERTY_PERF_EXPECTED_DATASET_SHA256 = "b".repeat(64);
  await assert.rejects(loadEnvironmentConfig(dataset), /dataset sha256 does not match approved input/u);
  const image = fixtureEnv();
  image.PROPERTY_PERF_APPROVED_POSTGRES_IMAGE = `postgres@sha256:${"b".repeat(64)}`;
  await assert.rejects(loadEnvironmentConfig(image), /PostgreSQL image does not match approved input/u);
  const commit = fixtureEnv();
  commit.PROPERTY_PERF_APPROVED_COMMIT_SHA = "b".repeat(40);
  await assert.rejects(loadEnvironmentConfig(commit), /current commit does not match approved input/u);
});

test("requires reviewer independence from the execution owner", async () => {
  const env = fixtureEnv();
  env.PROPERTY_PERF_EXECUTION_OWNER = `  ${env.PROPERTY_PERF_REVIEWER.toUpperCase()}  `;
  await assert.rejects(loadEnvironmentConfig(env), /reviewer must be independent/u);
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

test("cleanup inventory fails closed when compose down reports an error", () => {
  const clean = { containers: 0, networks: 0, volumes: 0, images: 0, secretFiles: 0 };
  assert.equal(cleanupInventory("jinhu-track-c-perf-fixture", clean).residualCount, 0);
  const failed = cleanupInventory("jinhu-track-c-perf-fixture", clean, "compose down failed");
  assert.equal(failed.residualCount, 1);
  assert.equal(failed.manifest[0].downError, "compose down failed");
  assert.equal(cleanupInventory("jinhu-track-c-perf-fixture", { ...clean, images: 1 }).residualCount, 1);
});

test("compose definition fixes all formal resources and isolates state", () => {
  const compose = readFileSync(resolve(import.meta.dirname, "compose.formal.yml"), "utf8");
  for (const marker of ["cpus: 1", "cpus: 2", "mem_limit: 1g", "mem_limit: 2g", "mem_limit: 4g", "${PROPERTY_PERF_PROJECT_NAME}-postgres-data", "PROPERTY_PERF_DATASET_DUMP", "PROPERTY_PERF_BUSINESS_CLOCK", "track_io_timing=on"]) assert.match(compose, new RegExp(marker.replace(/[${}]/gu, "\\$&"), "u"));
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

test("formal image builds bootstrap the pinned package manager through the configured registry with retries", () => {
  const dockerfiles = [
    resolve(import.meta.dirname, "../../../../infra/docker/Dockerfile.api"),
    resolve(import.meta.dirname, "../../../../infra/docker/Dockerfile.web"),
    resolve(import.meta.dirname, "Dockerfile.control")
  ].map((path) => readFileSync(path, "utf8"));
  for (const dockerfile of dockerfiles) {
    assert.match(dockerfile, /ENV COREPACK_NPM_REGISTRY="\$NPM_REGISTRY"/u);
    assert.match(dockerfile, /for attempt in 1 2 3/u);
    assert.match(dockerfile, /corepack prepare pnpm@9\.12\.0 --activate/u);
  }
  assert.equal([...dockerfiles[1].matchAll(/corepack prepare pnpm@9\.12\.0 --activate/gu)].length, 2);
});
