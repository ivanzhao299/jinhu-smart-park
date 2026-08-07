import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
export const canonicalProfilePath = resolve(here, "profile.v1.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const exactHash = (value) => /^[0-9a-f]{64}$/u.test(value ?? "");
const exactCommit = (value) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value ?? "");

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

export function validateProfile(profile) {
  const canonical = JSON.parse(readFileSync(canonicalProfilePath, "utf8"));
  if (!same(profile, canonical)) throw new Error("performance profile differs from the checked canonical profile");
  if (profile.warmupSeconds !== 120 || profile.formalSeconds !== 600 || profile.minimumRequests !== 10000
    || profile.runsPerConcurrency !== 5 || !same(profile.concurrency, [1, 10, 30])
    || !same(profile.temperatureByRun, ["cold", "warm", "warm", "warm", "warm"])) throw new Error("formal duration/sample/run matrix drift");
  return sha(readFileSync(canonicalProfilePath));
}

function validateResources(actual, expected) {
  if (!same(actual?.limits, expected)) throw new Error("fixed resource profile mismatch");
  for (const name of Object.keys(expected)) if (!/^sha256:[0-9a-f]{64}$/u.test(actual?.imageDigests?.[name] ?? "")) throw new Error(`missing image digest: ${name}`);
  if (!actual.postgresParameters || Object.keys(actual.postgresParameters).length === 0) throw new Error("missing PostgreSQL parameters");
  if (!exactHash(actual.seedSha256) || !exactHash(actual.environmentDigest) || !actual.businessClock || Number.isNaN(Date.parse(actual.businessClock))) throw new Error("incomplete environment provenance");
  if (actual.seedBusinessClock !== actual.businessClock) throw new Error("seed manifest business clock mismatch");
  for (const name of Object.keys(expected)) if (actual?.businessClockBindings?.[name] !== actual.businessClock) throw new Error(`business clock binding mismatch: ${name}`);
}

function expectedKeys(profile) {
  return profile.scenarios.flatMap(({ id }) => profile.concurrency.flatMap((concurrency) =>
    profile.temperatureByRun.map((temperature, index) => `${id}|c${concurrency}|r${index + 1}|${temperature}`)));
}

function coefficientOfVariation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return mean === 0 ? 0 : Math.sqrt(variance) / mean;
}

export function validateFormalEvidence(evidence, profile = JSON.parse(readFileSync(canonicalProfilePath, "utf8"))) {
  const profileSha256 = validateProfile(profile);
  const errors = [];
  if (evidence?.schemaVersion !== "property-track-c-performance-evidence-v1") errors.push("schema version");
  if (evidence?.profileSha256 !== profileSha256) errors.push("profile checksum");
  if (!exactCommit(evidence?.commitSha) || !exactHash(evidence?.datasetChecksum)) errors.push("commit/dataset checksum");
  try { validateResources(evidence?.environment, profile.resourceProfile); } catch (error) { errors.push(error.message); }
  const results = new Map((evidence?.results ?? []).map((item) => [item.key, item]));
  const keys = expectedKeys(profile);
  if (results.size !== keys.length || keys.some((key) => !results.has(key))) errors.push("incomplete 5-run/concurrency/cold-warm matrix");
  for (const key of keys) {
    const item = results.get(key);
    if (!item) continue;
    const expectedTemperature = key.split("|").at(-1);
    if (item.warmupSeconds < profile.warmupSeconds || item.formalSeconds < profile.formalSeconds || item.requests < profile.minimumRequests) errors.push(`${key}: duration/sample`);
    if (item.temperature !== expectedTemperature || (expectedTemperature === "cold" && !item.coldStartProofSha256)) errors.push(`${key}: temperature proof`);
    if (expectedTemperature === "cold" && !exactHash(item.coldStartProofSha256)) errors.push(`${key}: cold proof checksum`);
    const metrics = item.metrics ?? {};
    for (const field of ["p50Milliseconds", "p90Milliseconds", "p95Milliseconds", "p99Milliseconds", "throughputPerSecond", "errorRate", "cpuPercentP95", "memoryMiBP95", "gcPauseMillisecondsP95", "dbWaitMillisecondsP95"]) {
      if (!finite(metrics[field]) || metrics[field] < 0) errors.push(`${key}: missing metric ${field}`);
    }
    if (metrics.p95Milliseconds > profile.thresholds.p95Milliseconds) errors.push(`${key}: p95 threshold`);
    if (metrics.errorRate > profile.thresholds.errorRate) errors.push(`${key}: error threshold`);
    if (metrics.throughputPerSecond < profile.thresholds.minimumThroughputPerSecond) errors.push(`${key}: throughput threshold`);
  }
  for (const scenario of profile.scenarios) for (const concurrency of profile.concurrency) {
    const values = profile.temperatureByRun.map((temperature, index) => results.get(`${scenario.id}|c${concurrency}|r${index + 1}|${temperature}`)?.metrics?.p95Milliseconds).filter(finite);
    if (values.length !== profile.runsPerConcurrency || coefficientOfVariation(values) > profile.thresholds.p95CoefficientOfVariation) errors.push(`${scenario.id}|c${concurrency}: p95 CI/variation threshold`);
  }
  if (evidence?.cleanup?.attempted !== true || evidence?.cleanup?.residualCount !== 0 || !exactHash(evidence?.cleanup?.manifestSha256)) errors.push("cleanup residual/proof");
  if (!Array.isArray(evidence?.failureLogs) || evidence.failureLogs.some((item) => !exactHash(item.sha256))) errors.push("failure log catalog");
  return { schemaVersion: "property-track-c-performance-gate-result-v1", status: errors.length === 0 ? "PASS" : "FAIL", profileSha256, expectedRuns: keys.length, observedRuns: results.size, errors };
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--evidence") throw new Error("usage: formal-evidence-gate.mjs --evidence <formal-evidence.json>");
  return argv[1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = parseArgs(process.argv.slice(2));
    const result = validateFormalEvidence(JSON.parse(readFileSync(resolve(path), "utf8")));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
