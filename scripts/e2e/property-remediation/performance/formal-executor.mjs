import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { canonicalProfilePath, validateFormalEvidence } from "./formal-evidence-gate.mjs";

const execFileAsync = promisify(execFile);
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = resolve(here, "../../../../");
const artifactsRoot = resolve(repoRoot, "artifacts/property-remediation/runs");
const workerSource = resolve(here, "load-worker.mjs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const exactHash = (value) => /^[0-9a-f]{64}$/u.test(value ?? "");
const exactCommit = (value) => /^[0-9a-f]{40}$/u.test(value ?? "");
const identityKey = (value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
const immutableImage = (value, label) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*@sha256:[0-9a-f]{64}$/u.test(value)) throw new Error(`invalid approved ${label} image`);
  return value;
};
const required = (env, key) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`missing required environment variable: ${key}`);
  return value;
};
const safeIdentifier = (value, label) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value)) throw new Error(`invalid ${label}`);
  return value;
};
const fileHash = (path) => sha(readFileSync(path));

export function seedBusinessClock(path, expected) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest?.businessClock !== expected) throw new Error("seed manifest business clock mismatch");
  return manifest.businessClock;
}

function safeCommand(value, password, label) {
  if (value.includes(password) || /(?:password|passwd|token|secret)\s*=/iu.test(value)) {
    throw new Error(`${label} must not embed credentials; use a credential-free wrapper`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const containers = JSON.parse(required(env, "PROPERTY_PERF_CONTAINERS_JSON"));
  const expectedNames = ["web", "api", "postgres", "browserWorker"];
  if (JSON.stringify(Object.keys(containers).sort()) !== JSON.stringify(expectedNames.sort())) {
    throw new Error("PROPERTY_PERF_CONTAINERS_JSON must contain exactly web/api/postgres/browserWorker");
  }
  for (const key of expectedNames) containers[key] = safeIdentifier(containers[key], `${key} container`);
  const password = required(env, "PROPERTY_PERF_PASSWORD");
  const reviewer = required(env, "PROPERTY_PERF_REVIEWER");
  const executionOwner = required(env, "PROPERTY_PERF_EXECUTION_OWNER");
  if (identityKey(reviewer) === identityKey(executionOwner)) throw new Error("performance reviewer must be independent from execution owner");
  const expectedDatasetSha256 = required(env, "PROPERTY_PERF_EXPECTED_DATASET_SHA256");
  if (!exactHash(expectedDatasetSha256)) throw new Error("invalid approved dataset sha256");
  const approvedCommitSha = required(env, "PROPERTY_PERF_APPROVED_COMMIT_SHA");
  if (!exactCommit(approvedCommitSha)) throw new Error("invalid approved commit sha");
  const config = {
    baseUrl: new URL(required(env, "PROPERTY_PERF_BASE_URL")).origin,
    workerBaseUrl: new URL(env.PROPERTY_PERF_WORKER_BASE_URL?.trim() || required(env, "PROPERTY_PERF_BASE_URL")).origin,
    username: required(env, "PROPERTY_PERF_USERNAME"),
    password,
    authPath: env.PROPERTY_PERF_AUTH_PATH?.trim() || "/api/v1/auth/login",
    containers,
    datasetManifest: resolve(required(env, "PROPERTY_PERF_DATASET_MANIFEST")),
    seedManifest: resolve(required(env, "PROPERTY_PERF_SEED_MANIFEST")),
    businessClock: required(env, "PROPERTY_PERF_BUSINESS_CLOCK"),
    restartCommand: safeCommand(required(env, "PROPERTY_PERF_RESTART_COMMAND"), password, "restart command"),
    cleanupCommand: safeCommand(required(env, "PROPERTY_PERF_CLEANUP_COMMAND"), password, "cleanup command"),
    gcCommand: safeCommand(required(env, "PROPERTY_PERF_GC_COMMAND"), password, "GC command"),
    dbWaitCommand: safeCommand(required(env, "PROPERTY_PERF_DB_WAIT_COMMAND"), password, "DB wait command"),
    postgresParametersCommand: safeCommand(required(env, "PROPERTY_PERF_POSTGRES_PARAMETERS_COMMAND"), password, "PostgreSQL parameter command"),
    reviewer,
    executionOwner,
    approvedInputs: {
      commitSha: approvedCommitSha,
      datasetSha256: expectedDatasetSha256,
      postgresImage: immutableImage(required(env, "PROPERTY_PERF_APPROVED_POSTGRES_IMAGE"), "PostgreSQL"),
      browserImage: immutableImage(required(env, "PROPERTY_PERF_APPROVED_BROWSER_IMAGE"), "browser-worker")
    },
    requestTimeoutMilliseconds: Number(env.PROPERTY_PERF_REQUEST_TIMEOUT_MS ?? "30000"),
    telemetryIntervalMilliseconds: Number(env.PROPERTY_PERF_TELEMETRY_INTERVAL_MS ?? "5000")
  };
  if (!Number.isInteger(config.requestTimeoutMilliseconds) || config.requestTimeoutMilliseconds < 1000) throw new Error("invalid request timeout");
  if (!Number.isInteger(config.telemetryIntervalMilliseconds) || config.telemetryIntervalMilliseconds < 1000) throw new Error("invalid telemetry interval");
  if (!/^\/[^\s]*$/u.test(config.authPath)) throw new Error("invalid auth path");
  if (Number.isNaN(Date.parse(config.businessClock))) throw new Error("invalid business clock");
  return config;
}

async function runShell(command) {
  const startedAt = new Date().toISOString();
  const result = await execFileAsync("/bin/sh", ["-lc", command], { maxBuffer: 16 * 1024 * 1024 });
  return { command, startedAt, finishedAt: new Date().toISOString(), exitCode: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function inspectContainer(name) {
  const { stdout } = await execFileAsync("docker", ["inspect", name], { maxBuffer: 4 * 1024 * 1024 });
  const [value] = JSON.parse(stdout);
  if (!value?.State?.Running) throw new Error(`container is not running: ${name}`);
  return value;
}

export function deriveResourceObservation(inspections, expected, approvedImageReferences = {}) {
  const limits = {};
  const imageDigests = {};
  for (const [key, wanted] of Object.entries(expected)) {
    const value = inspections[key];
    const cpu = value?.HostConfig?.NanoCpus / 1_000_000_000;
    const memoryMiB = value?.HostConfig?.Memory / 1024 / 1024;
    if (cpu !== wanted.cpu || memoryMiB !== wanted.memoryMiB) throw new Error(`fixed resource mismatch: ${key}`);
    if (!/^sha256:[0-9a-f]{64}$/u.test(value?.Image ?? "")) throw new Error(`missing immutable image digest: ${key}`);
    if (approvedImageReferences[key] && value?.Config?.Image !== approvedImageReferences[key]) throw new Error(`approved image reference mismatch: ${key}`);
    limits[key] = { cpu, memoryMiB };
    imageDigests[key] = value.Image;
  }
  return { limits, imageDigests, imageReferences: Object.fromEntries(Object.entries(approvedImageReferences).map(([key]) => [key, inspections[key]?.Config?.Image])) };
}

export function deriveBusinessClockBindings(inspections, expected) {
  const bindings = {};
  for (const [key, inspection] of Object.entries(inspections)) {
    const entry = inspection?.Config?.Env?.find((value) => value.startsWith("PROPERTY_PERF_BUSINESS_CLOCK="));
    const value = entry?.slice("PROPERTY_PERF_BUSINESS_CLOCK=".length);
    if (value !== expected) throw new Error(`business clock binding mismatch: ${key}`);
    bindings[key] = value;
  }
  return bindings;
}

async function numericShell(command, label) {
  const observation = await runShell(command);
  const value = Number(observation.stdout);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} command must print one non-negative number`);
  return { value, observation };
}

function parseDockerStats(stdout, containers) {
  const toMiB = (raw) => {
    const match = String(raw).match(/^([0-9.]+)([KMGT]?i?B)$/u);
    if (!match) return Number.NaN;
    const scale = { B: 1 / 1024 / 1024, KB: 1 / 1024, KiB: 1 / 1024, MB: 1, MiB: 1, GB: 1024, GiB: 1024, TB: 1024 * 1024, TiB: 1024 * 1024 };
    return Number(match[1]) * scale[match[2]];
  };
  const byName = {};
  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    const item = JSON.parse(line);
    const cpuPercent = Number(String(item.CPUPerc).replace("%", ""));
    const memoryMiB = toMiB(String(item.MemUsage).split("/")[0].trim());
    const key = Object.entries(containers).find(([, name]) => name === item.Name)?.[0];
    if (!key || !Number.isFinite(cpuPercent) || !Number.isFinite(memoryMiB)) throw new Error("invalid docker stats observation");
    byName[key] = { cpuPercent, memoryMiB };
  }
  if (Object.keys(byName).length !== Object.keys(containers).length) throw new Error("incomplete docker stats observation");
  return byName;
}

async function collectTelemetry(config) {
  const names = Object.values(config.containers);
  const [{ stdout }, gc, dbWait] = await Promise.all([
    execFileAsync("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...names]),
    numericShell(config.gcCommand, "GC"),
    numericShell(config.dbWaitCommand, "DB wait")
  ]);
  return { at: new Date().toISOString(), containers: parseDockerStats(stdout, config.containers), gcPauseMilliseconds: gc.value, dbWaitMilliseconds: dbWait.value };
}

function p95(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)];
}

function summarizeTelemetry(observations) {
  if (observations.length === 0) throw new Error("no telemetry observations collected");
  const componentMetrics = {};
  for (const key of ["web", "api", "postgres", "browserWorker"]) {
    componentMetrics[key] = {
      cpuPercentP95: p95(observations.map((item) => item.containers[key].cpuPercent)),
      memoryMiBP95: p95(observations.map((item) => item.containers[key].memoryMiB))
    };
  }
  return {
    cpuPercentP95: Math.max(...Object.values(componentMetrics).map((item) => item.cpuPercentP95)),
    memoryMiBP95: Math.max(...Object.values(componentMetrics).map((item) => item.memoryMiBP95)),
    gcPauseMillisecondsP95: p95(observations.map((item) => item.gcPauseMilliseconds)),
    dbWaitMillisecondsP95: p95(observations.map((item) => item.dbWaitMilliseconds)),
    componentMetrics
  };
}

async function login(config) {
  const response = await fetch(`${config.baseUrl}${config.authPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `track-c-perf-login-${crypto.randomUUID()}` },
    body: JSON.stringify({ username: config.username, password: config.password }),
    signal: AbortSignal.timeout(config.requestTimeoutMilliseconds)
  });
  const body = await response.json();
  const token = body?.data?.accessToken ?? body?.data?.access_token ?? body?.accessToken;
  if (!response.ok || typeof token !== "string" || token.length === 0) throw new Error(`performance login failed with HTTP ${response.status}`);
  return token;
}

async function runWorker(config, payload) {
  const remotePath = `/tmp/property-track-c-load-worker-${process.pid}.mjs`;
  await execFileAsync("docker", ["cp", workerSource, `${config.containers.browserWorker}:${remotePath}`]);
  try {
    const child = spawn("docker", ["exec", "-i", config.containers.browserWorker, "node", remotePath], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.end(JSON.stringify(payload));
    const exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", resolveExit);
    });
    if (exitCode !== 0) throw new Error(`load worker failed (${exitCode}): ${Buffer.concat(stderr).toString("utf8").trim()}`);
    return JSON.parse(Buffer.concat(stdout).toString("utf8"));
  } finally {
    await execFileAsync("docker", ["exec", config.containers.browserWorker, "rm", "-f", remotePath]);
  }
}

async function executeCell(config, profile, scenario, concurrency, runIndex, runDir) {
  const temperature = profile.temperatureByRun[runIndex];
  let coldStartProofSha256 = null;
  if (temperature === "cold") {
    const proof = await runShell(config.restartCommand);
    const proofPath = resolve(runDir, `${scenario.id}-c${concurrency}-r${runIndex + 1}-cold-proof.json`);
    writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
    coldStartProofSha256 = fileHash(proofPath);
  }
  const token = await login(config);
  const observations = [];
  let telemetryError;
  const sample = async () => {
    try { observations.push(await collectTelemetry(config)); } catch (error) { telemetryError ??= error; }
  };
  await sample();
  let pendingSample = Promise.resolve();
  const queueSample = () => { pendingSample = pendingSample.then(sample); };
  const interval = setInterval(queueSample, config.telemetryIntervalMilliseconds);
  const startedAt = new Date().toISOString();
  let load;
  try {
    load = await runWorker(config, { baseUrl: config.workerBaseUrl, path: scenario.path, token, concurrency, warmupSeconds: profile.warmupSeconds, formalSeconds: profile.formalSeconds, minimumRequests: profile.minimumRequests, requestTimeoutMilliseconds: config.requestTimeoutMilliseconds });
  } finally {
    clearInterval(interval);
    await pendingSample;
  }
  await sample();
  if (telemetryError) throw telemetryError;
  const telemetry = summarizeTelemetry(observations);
  const key = `${scenario.id}|c${concurrency}|r${runIndex + 1}|${temperature}`;
  const raw = { key, startedAt, finishedAt: new Date().toISOString(), load, telemetry, observations };
  const rawPath = resolve(runDir, `${key.replaceAll("|", "-")}.json`);
  writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
  return {
    key,
    temperature,
    warmupSeconds: load.warmup.elapsedSeconds,
    formalSeconds: load.formal.elapsedSeconds,
    requests: load.formal.requests,
    coldStartProofSha256,
    metrics: { ...load.formal.metrics, cpuPercentP95: telemetry.cpuPercentP95, memoryMiBP95: telemetry.memoryMiBP95, gcPauseMillisecondsP95: telemetry.gcPauseMillisecondsP95, dbWaitMillisecondsP95: telemetry.dbWaitMillisecondsP95 },
    componentMetrics: telemetry.componentMetrics,
    execution: { command: `docker exec -i ${config.containers.browserWorker} node <ephemeral-load-worker>`, startedAt, finishedAt: raw.finishedAt, exitCode: 0 },
    artifactSha256: fileHash(rawPath),
    failureCount: load.formal.failures.length
  };
}

async function environmentEvidence(config, profile) {
  const inspections = Object.fromEntries(await Promise.all(Object.entries(config.containers).map(async ([key, name]) => [key, await inspectContainer(name)])));
  const resources = deriveResourceObservation(inspections, profile.resourceProfile, { postgres: config.approvedInputs.postgresImage, browserWorker: config.approvedInputs.browserImage });
  const businessClockBindings = deriveBusinessClockBindings(inspections, config.businessClock);
  const pgObservation = await runShell(config.postgresParametersCommand);
  const postgresParameters = JSON.parse(pgObservation.stdout);
  if (!postgresParameters || Array.isArray(postgresParameters) || Object.keys(postgresParameters).length === 0) throw new Error("PostgreSQL parameter command must print a non-empty JSON object");
  const seedSha256 = fileHash(config.seedManifest);
  const seedClock = seedBusinessClock(config.seedManifest, config.businessClock);
  const datasetChecksum = fileHash(config.datasetManifest);
  if (datasetChecksum !== config.approvedInputs.datasetSha256) throw new Error("dataset checksum does not match approved input");
  const provenance = { ...resources, postgresParameters, seedSha256, datasetChecksum, businessClock: config.businessClock, seedBusinessClock: seedClock, businessClockBindings };
  return { datasetChecksum, environment: { ...resources, postgresParameters, seedSha256, businessClock: config.businessClock, seedBusinessClock: seedClock, businessClockBindings, environmentDigest: sha(JSON.stringify(provenance)) } };
}

async function cleanupEvidence(config, runDir) {
  const result = await runShell(config.cleanupCommand);
  const parsed = JSON.parse(result.stdout);
  if (!Number.isInteger(parsed?.residualCount) || parsed.residualCount < 0 || !Array.isArray(parsed?.manifest)) throw new Error("cleanup command must print {residualCount,manifest[]} JSON");
  const path = resolve(runDir, "cleanup.json");
  writeFileSync(path, `${JSON.stringify({ ...result, parsed }, null, 2)}\n`);
  return { attempted: true, residualCount: parsed.residualCount, manifestSha256: fileHash(path), artifact: basename(path) };
}

export async function checkConfig(env = process.env) {
  const config = loadConfig(env);
  const commitSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
  if (commitSha !== config.approvedInputs.commitSha) throw new Error("current commit does not match approved input");
  if (fileHash(config.datasetManifest) !== config.approvedInputs.datasetSha256) throw new Error("dataset checksum does not match approved input");
  seedBusinessClock(config.seedManifest, config.businessClock);
  return { status: "PASS", schemaVersion: "property-track-c-performance-config-check-v1", matrixRuns: 30, secretsLogged: false };
}

async function executeFormal() {
  if (process.env.PROPERTY_PERF_FORMAL_RUN !== "yes") throw new Error("formal execution requires PROPERTY_PERF_FORMAL_RUN=yes");
  const config = loadConfig();
  const profileBytes = readFileSync(canonicalProfilePath);
  const profile = JSON.parse(profileBytes);
  const commitSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
  if (commitSha !== config.approvedInputs.commitSha) throw new Error("current commit does not match approved input");
  const runId = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${commitSha.slice(0, 12)}`;
  const runDir = resolve(artifactsRoot, runId);
  mkdirSync(artifactsRoot, { recursive: true });
  mkdirSync(runDir, { recursive: false });
  const provenance = await environmentEvidence(config, profile);
  const results = [];
  let cleanup;
  let executionError;
  try {
    for (const scenario of profile.scenarios) for (const concurrency of profile.concurrency) for (let runIndex = 0; runIndex < profile.runsPerConcurrency; runIndex += 1) {
      results.push(await executeCell(config, profile, scenario, concurrency, runIndex, runDir));
    }
  } catch (error) {
    executionError = error;
  } finally {
    try { cleanup = await cleanupEvidence(config, runDir); } catch (error) { executionError ??= error; }
  }
  const failureLogs = results.filter((item) => item.failureCount > 0).map((item) => ({ key: item.key, sha256: item.artifactSha256 }));
  if (executionError) {
    const failurePath = resolve(runDir, "execution-failure.json");
    const message = String(executionError?.message ?? executionError).replaceAll(config.password, "[REDACTED]");
    writeFileSync(failurePath, `${JSON.stringify({ at: new Date().toISOString(), message }, null, 2)}\n`);
    failureLogs.push({ key: "executor", sha256: fileHash(failurePath) });
  }
  const evidence = { schemaVersion: "property-track-c-performance-evidence-v1", profileSha256: sha(profileBytes), commitSha, datasetChecksum: provenance.datasetChecksum, approvedInputs: config.approvedInputs, environment: provenance.environment, results, cleanup, failureLogs, reviewer: config.reviewer, executionOwner: config.executionOwner };
  const evidencePath = resolve(runDir, "formal-evidence.json");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (executionError) throw new Error(`formal execution failed; partial evidence: ${evidencePath}; ${executionError.message}`);
  const gate = validateFormalEvidence(evidence, profile, { commitSha, datasetSha256: provenance.datasetChecksum });
  if (gate.status !== "PASS") throw new Error(`formal evidence gate failed: ${gate.errors.join("; ")}`);
  process.stdout.write(`${JSON.stringify({ status: "PASS", evidencePath, evidenceSha256: fileHash(evidencePath), gate }, null, 2)}\n`);
}

function usage() {
  return "usage: formal-executor.mjs --check-config | --formal";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode] = process.argv.slice(2);
  try {
    if (mode === "--check-config") process.stdout.write(`${JSON.stringify(await checkConfig(), null, 2)}\n`);
    else if (mode === "--formal") await executeFormal();
    else throw new Error(usage());
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
