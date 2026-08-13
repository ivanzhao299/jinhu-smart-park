import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { requirePropertyApiE2eIsolation } from "./property-api-e2e-safety.mjs";

const root = resolve(import.meta.dirname, "../..");
const suites = new Map([
  ["homestay", "scripts/e2e/homestay-api-e2e.mjs"],
  ["housing", "scripts/e2e/housing-rental-api-e2e.mjs"]
]);
if (process.argv[2] === "--suite" && !process.argv[3]) {
  throw new Error("Property API E2E gate refused to run: --suite requires a nonempty suite name.");
}
const suiteArgument = process.argv[2] === "--suite" ? process.argv[3] : undefined;
const selectedSuites = suiteArgument ? [suiteArgument] : [...suites.keys()];
const startedAt = new Date().toISOString();
const runId = process.env.TEST_RUN_ID ?? `property-api-${Date.now()}-${randomUUID().slice(0, 8)}`;
const reportPath = resolve(root, process.env.PROPERTY_API_E2E_REPORT_PATH ?? "artifacts/property-api-e2e-report.json");
const readinessAttempts = 24;
const readinessDelayMs = 2500;
const readinessRequestTimeoutMs = 5000;

const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function validateEnvironment() {
  requirePropertyApiE2eIsolation({ requireRunId: false });
  for (const suite of selectedSuites) {
    if (!suites.has(suite)) throw new Error(`Property API E2E gate refused to run: unknown suite ${JSON.stringify(suite)}.`);
  }
}

async function requireReady() {
  const base = requirePropertyApiE2eIsolation({ requireRunId: false });
  const failures = [];
  for (const endpoint of ["health", "ready"]) {
    const url = new URL(endpoint, base.href.endsWith("/") ? base.href : `${base.href}/`);
    let ready = false;
    for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), readinessRequestTimeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) {
          ready = true;
          break;
        }
        failures.push(`${url} attempt ${attempt}/${readinessAttempts} returned ${response.status}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${url} attempt ${attempt}/${readinessAttempts} failed: ${message}`);
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < readinessAttempts) await delay(readinessDelayMs);
    }
    if (!ready) {
      throw new Error(`Property API E2E gate refused to run: ${url} did not become ready within the bounded retry budget; run migrations, seed, bootstrap, and start the API first. Last checks: ${failures.slice(-4).join("; ")}`);
    }
  }
}

function runSuite(name) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [suites.get(name)], {
      cwd: root,
      env: { ...process.env, PROPERTY_API_E2E_ISOLATED: "yes", TEST_RUN_ID: `${runId}-${name}` },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${name} suite failed (code=${code ?? "none"}, signal=${signal ?? "none"}).`));
    });
  });
}

const report = { runId, startedAt, suites: [], isolation: { database: process.env.POSTGRES_DB ?? null, teardown: "workflow-required" } };
let failure;
let activeSuite = null;
try {
  validateEnvironment();
  await requireReady();
  for (const suite of selectedSuites) {
    activeSuite = suite;
    await runSuite(suite);
    report.suites.push({ name: suite, status: "passed" });
    activeSuite = null;
  }
} catch (error) {
  failure = error;
  report.suites.push({ name: activeSuite ?? "gate", status: "failed", error: error instanceof Error ? error.message : String(error) });
} finally {
  report.finishedAt = new Date().toISOString();
  report.status = failure ? "failed" : "passed";
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[INFO] property API E2E report: ${reportPath}`);
}
if (failure) throw failure;
