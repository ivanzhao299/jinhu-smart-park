import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = resolve(here, "../../../../");
const composeFile = resolve(here, "compose.formal.yml");
const artifactsRoot = resolve(repoRoot, "artifacts/property-remediation/runs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const required = (env, key) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`missing required environment variable: ${key}`);
  return value;
};
const safeName = (value, pattern, label) => {
  if (!pattern.test(value)) throw new Error(`invalid ${label}`);
  return value;
};

function immutableImage(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*@sha256:[0-9a-f]{64}$/u.test(value)) throw new Error(`${label} must be pinned by sha256 digest`);
  return value;
}

function strongSecret(value, label, minimum = 32) {
  if (value.length < minimum) throw new Error(`${label} must contain at least ${minimum} characters`);
  return value;
}

function adminPassword(value) {
  strongSecret(value, "performance account password", 12);
  if (!/[A-Z]/u.test(value) || !/[a-z]/u.test(value) || !/[0-9]/u.test(value) || !/[^A-Za-z0-9]/u.test(value)) throw new Error("performance account password does not meet bootstrap strength rules");
  return value;
}

function datasetDump(path) {
  const absolute = resolve(path);
  const bytes = readFileSync(absolute);
  if (bytes.subarray(0, 5).toString("ascii") !== "PGDMP") throw new Error("dataset dump must be a PostgreSQL custom-format pg_dump");
  return { path: absolute, sha256: sha(bytes), size: statSync(absolute).size };
}

function sourceSha() {
  return execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).then(({ stdout }) => stdout.trim());
}

export async function loadEnvironmentConfig(env = process.env) {
  const commitSha = await sourceSha();
  const projectName = safeName(required(env, "PROPERTY_PERF_PROJECT_NAME"), /^jinhu-track-c-perf-[a-z0-9][a-z0-9-]{2,40}$/u, "performance project name");
  const postgresDb = safeName(required(env, "PROPERTY_PERF_POSTGRES_DB"), /^jinhu_perf_[a-z0-9_]{3,40}$/u, "performance database name");
  const performancePassword = adminPassword(required(env, "PROPERTY_PERF_PASSWORD"));
  const config = {
    schemaVersion: "property-track-c-formal-environment-v1",
    commitSha,
    projectName,
    postgresDb,
    postgresUser: safeName(env.PROPERTY_PERF_POSTGRES_USER?.trim() || "jinhu_perf", /^[a-z][a-z0-9_]{2,31}$/u, "PostgreSQL user"),
    postgresImage: immutableImage(required(env, "PROPERTY_PERF_POSTGRES_IMAGE"), "PostgreSQL image"),
    browserImage: immutableImage(required(env, "PROPERTY_PERF_BROWSER_IMAGE"), "browser-worker image"),
    dataset: datasetDump(required(env, "PROPERTY_PERF_DATASET_DUMP")),
    username: safeName(required(env, "PROPERTY_PERF_USERNAME"), /^[A-Za-z0-9_.@-]{3,80}$/u, "performance username"),
    adminName: required(env, "PROPERTY_PERF_ADMIN_NAME"),
    secrets: {
      postgresPassword: strongSecret(required(env, "PROPERTY_PERF_POSTGRES_PASSWORD"), "PostgreSQL password"),
      jwtSecret: strongSecret(required(env, "PROPERTY_PERF_JWT_SECRET"), "JWT secret"),
      partyKey: strongSecret(required(env, "PROPERTY_PERF_PARTY_DATA_ENCRYPTION_KEY"), "party encryption key"),
      adminPassword: performancePassword
    },
    apiPort: Number(env.PROPERTY_PERF_API_PORT ?? "33101"),
    webPort: Number(env.PROPERTY_PERF_WEB_PORT ?? "33100"),
    businessClock: required(env, "PROPERTY_PERF_BUSINESS_CLOCK"),
    reviewer: required(env, "PROPERTY_PERF_REVIEWER")
  };
  if (![config.apiPort, config.webPort].every((value) => Number.isInteger(value) && value >= 1024 && value <= 65535) || config.apiPort === config.webPort) throw new Error("invalid or colliding published ports");
  if (Number.isNaN(Date.parse(config.businessClock))) throw new Error("invalid business clock");
  return config;
}

function nonSecretComposeEnv(config, secretDir) {
  const tag = config.commitSha.slice(0, 12);
  return {
    COMPOSE_PROJECT_NAME: config.projectName,
    PROPERTY_PERF_PROJECT_NAME: config.projectName,
    PROPERTY_PERF_POSTGRES_DB: config.postgresDb,
    PROPERTY_PERF_POSTGRES_USER: config.postgresUser,
    PROPERTY_PERF_POSTGRES_IMAGE: config.postgresImage,
    PROPERTY_PERF_BROWSER_IMAGE: config.browserImage,
    PROPERTY_PERF_API_IMAGE: `jinhu-property-perf-api:${tag}`,
    PROPERTY_PERF_WEB_IMAGE: `jinhu-property-perf-web:${tag}`,
    PROPERTY_PERF_CONTROL_IMAGE: `jinhu-property-perf-control:${tag}`,
    PROPERTY_PERF_API_PORT: String(config.apiPort),
    PROPERTY_PERF_WEB_PORT: String(config.webPort),
    PROPERTY_PERF_DATASET_DUMP: config.dataset.path,
    PROPERTY_PERF_SECRET_DIR: secretDir,
    PROPERTY_PERF_USERNAME: config.username,
    PROPERTY_PERF_ADMIN_NAME: config.adminName
  };
}

async function compose(runtime, args, options = {}) {
  return execFileAsync("docker", ["compose", "-p", runtime.projectName, "-f", composeFile, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...runtime.composeEnv },
    maxBuffer: 32 * 1024 * 1024,
    ...options
  });
}

function writeSecret(path, value) {
  writeFileSync(path, value, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

function createRuntime(config) {
  const setupDir = resolve(artifactsRoot, `environment-${config.projectName}-${config.commitSha.slice(0, 12)}`);
  const secretDir = resolve(setupDir, "secrets");
  mkdirSync(artifactsRoot, { recursive: true });
  mkdirSync(setupDir, { recursive: false });
  mkdirSync(secretDir, { recursive: false });
  writeSecret(resolve(secretDir, "postgres_password"), config.secrets.postgresPassword);
  writeSecret(resolve(secretDir, "jwt_secret"), config.secrets.jwtSecret);
  writeSecret(resolve(secretDir, "party_data_encryption_key"), config.secrets.partyKey);
  writeSecret(resolve(secretDir, "admin_password"), config.secrets.adminPassword);
  const seedManifestPath = resolve(setupDir, "seed-manifest.json");
  const seedDir = resolve(repoRoot, "database/seeds");
  const seedManifest = readdirSync(seedDir).filter((name) => name.endsWith(".sql")).sort().map((name) => ({ name, sha256: sha(readFileSync(resolve(seedDir, name))) }));
  writeFileSync(seedManifestPath, `${JSON.stringify({ commitSha: config.commitSha, files: seedManifest }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const runtime = {
    schemaVersion: config.schemaVersion,
    commitSha: config.commitSha,
    projectName: config.projectName,
    postgresDb: config.postgresDb,
    postgresUser: config.postgresUser,
    dataset: config.dataset,
    businessClock: config.businessClock,
    reviewer: config.reviewer,
    setupDir,
    secretDir,
    seedManifestPath,
    composeEnv: nonSecretComposeEnv(config, secretDir),
    containers: { web: `${config.projectName}-web`, api: `${config.projectName}-api`, postgres: `${config.projectName}-postgres`, browserWorker: `${config.projectName}-browser` }
  };
  const runtimePath = resolve(setupDir, "runtime.json");
  writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return { runtime, runtimePath };
}

async function validateCompose(config) {
  const placeholderSecretDir = resolve(artifactsRoot, "config-check-secrets-not-created");
  const runtime = { projectName: config.projectName, composeEnv: nonSecretComposeEnv(config, placeholderSecretDir) };
  await compose(runtime, ["config", "--quiet"]);
}

export async function assertSourceReady({ execute = execFileAsync, cwd = repoRoot } = {}) {
  const { stdout } = await execute("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", "apps", "packages", "database", "infra", "scripts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"], { cwd });
  if (stdout.trim()) throw new Error("formal source paths contain uncommitted changes");
}

async function provision(config) {
  if (process.env.PROPERTY_PERF_PROVISION !== "yes") throw new Error("provisioning requires PROPERTY_PERF_PROVISION=yes");
  await assertSourceReady();
  mkdirSync(artifactsRoot, { recursive: true });
  const { runtime, runtimePath } = createRuntime(config);
  try {
    await compose(runtime, ["build", "api", "web", "control"]);
    await compose(runtime, ["up", "-d", "--wait", "postgres"]);
    await compose(runtime, ["--profile", "control", "run", "--rm", "control", "initialize"]);
    await compose(runtime, ["up", "-d", "--wait", "api", "web", "browser-worker"]);
  } catch (error) {
    throw new Error(`isolated environment provisioning failed; runtime=${runtimePath}; ${error.message}`);
  }
  return { status: "READY", runtimePath, executorEnvironment: executorEnvironment(runtime, runtimePath) };
}

function executorEnvironment(runtime, runtimePath) {
  const script = resolve(here, "formal-environment.mjs");
  return {
    PROPERTY_PERF_BASE_URL: `http://127.0.0.1:${runtime.composeEnv.PROPERTY_PERF_API_PORT}`,
    PROPERTY_PERF_WORKER_BASE_URL: "http://api:3001",
    PROPERTY_PERF_CONTAINERS_JSON: JSON.stringify(runtime.containers),
    PROPERTY_PERF_DATASET_MANIFEST: runtime.dataset.path,
    PROPERTY_PERF_SEED_MANIFEST: runtime.seedManifestPath,
    PROPERTY_PERF_BUSINESS_CLOCK: runtime.businessClock,
    PROPERTY_PERF_RESTART_COMMAND: `node ${script} --restart --runtime ${runtimePath}`,
    PROPERTY_PERF_CLEANUP_COMMAND: `node ${script} --cleanup --runtime ${runtimePath}`,
    PROPERTY_PERF_GC_COMMAND: `node ${script} --gc --runtime ${runtimePath}`,
    PROPERTY_PERF_DB_WAIT_COMMAND: `node ${script} --db-wait --runtime ${runtimePath}`,
    PROPERTY_PERF_POSTGRES_PARAMETERS_COMMAND: `node ${script} --pg-parameters --runtime ${runtimePath}`,
    PROPERTY_PERF_REVIEWER: runtime.reviewer
  };
}

function readRuntime(path) {
  const absolute = resolve(path);
  const runtime = JSON.parse(readFileSync(absolute, "utf8"));
  if (runtime?.schemaVersion !== "property-track-c-formal-environment-v1" || !absolute.startsWith(`${artifactsRoot}/`) || !runtime.secretDir.startsWith(`${artifactsRoot}/`)) throw new Error("invalid formal runtime manifest");
  return { ...runtime, runtimePath: absolute };
}

async function waitHealthy(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", container]);
    if (["healthy", "running"].includes(stdout.trim())) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`container did not become healthy: ${container}`);
}

async function restart(runtime) {
  const startedAt = new Date().toISOString();
  await compose(runtime, ["restart", "postgres", "api", "web"]);
  await waitHealthy(runtime.containers.postgres);
  await waitHealthy(runtime.containers.api);
  await waitHealthy(runtime.containers.web);
  for (const name of ["gc-state.json", "db-wait-state.json"]) rmSync(resolve(runtime.setupDir, name), { force: true });
  return { status: "PASS", operation: "postgres-api-web-restart-and-cache-reset", startedAt, finishedAt: new Date().toISOString(), containers: [runtime.containers.postgres, runtime.containers.api, runtime.containers.web] };
}

async function dockerProjectCount(projectName, kind) {
  const args = kind === "container" ? ["ps", "-aq", "--filter", `label=com.docker.compose.project=${projectName}`] : kind === "network" ? ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${projectName}`] : ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${projectName}`];
  const { stdout } = await execFileAsync("docker", args);
  return stdout.trim() ? stdout.trim().split("\n").length : 0;
}

async function cleanup(runtime) {
  let downError = null;
  try { await compose(runtime, ["down", "--volumes", "--remove-orphans", "--rmi", "local"]); } catch (error) { downError = error.message; }
  rmSync(runtime.secretDir, { recursive: true, force: true });
  const remaining = {
    containers: await dockerProjectCount(runtime.projectName, "container"),
    networks: await dockerProjectCount(runtime.projectName, "network"),
    volumes: await dockerProjectCount(runtime.projectName, "volume"),
    secretFiles: 0
  };
  const residualCount = Object.values(remaining).reduce((sum, value) => sum + value, 0);
  return { residualCount, manifest: [{ projectName: runtime.projectName, remaining, downError }] };
}

async function queryPostgres(runtime, sql) {
  const { stdout } = await execFileAsync("docker", ["exec", runtime.containers.postgres, "psql", "-X", "-qAt", "-U", runtime.postgresUser, "-d", runtime.postgresDb, "-c", sql]);
  return stdout.trim();
}

function stateDelta(path, current) {
  let previous = current;
  try { previous = Number(readFileSync(path, "utf8")); } catch {}
  writeFileSync(path, String(current), { mode: 0o600 });
  return Math.max(0, current - previous);
}

async function observeGc(runtime) {
  const statePath = resolve(runtime.setupDir, "gc-state.json");
  let since = new Date().toISOString();
  try { since = readFileSync(statePath, "utf8").trim(); } catch {}
  const until = new Date().toISOString();
  const { stdout, stderr } = await execFileAsync("docker", ["logs", "--since", since, "--until", until, runtime.containers.api], { maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(statePath, until, { mode: 0o600 });
  const pauses = [...`${stdout}\n${stderr}`.matchAll(/(?:^|\s)pause=([0-9.]+)/gu)].map((match) => Number(match[1]));
  return pauses.length ? Math.max(...pauses) : 0;
}

async function observeDbWait(runtime) {
  const current = Number(await queryPostgres(runtime, "SELECT COALESCE(blk_read_time + blk_write_time, 0) FROM pg_stat_database WHERE datname = current_database();"));
  if (!Number.isFinite(current) || current < 0) throw new Error("invalid PostgreSQL I/O timing observation");
  return stateDelta(resolve(runtime.setupDir, "db-wait-state.json"), current);
}

async function postgresParameters(runtime) {
  const sql = "SELECT json_object_agg(name, setting ORDER BY name) FROM pg_settings WHERE name IN ('track_io_timing','shared_buffers','effective_cache_size','max_connections','work_mem','jit','random_page_cost','effective_io_concurrency','synchronous_commit');";
  return JSON.parse(await queryPostgres(runtime, sql));
}

function usage() {
  return "usage: formal-environment.mjs --check|--plan|--provision OR --restart|--cleanup|--gc|--db-wait|--pg-parameters --runtime <runtime.json>";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, runtimeFlag, runtimePath] = process.argv.slice(2);
    if (mode === "--check") {
      const config = await loadEnvironmentConfig();
      await validateCompose(config);
      process.stdout.write(`${JSON.stringify({ status: "PASS", schemaVersion: config.schemaVersion, commitSha: config.commitSha, datasetSha256: config.dataset.sha256, resources: { web: "1CPU/1GiB", api: "2CPU/2GiB", postgres: "2CPU/4GiB", browserWorker: "2CPU/2GiB" }, mutatingCommandsExecuted: false }, null, 2)}\n`);
    } else if (mode === "--plan") {
      const config = await loadEnvironmentConfig();
      process.stdout.write(`${JSON.stringify({ projectName: config.projectName, postgresDb: config.postgresDb, commitSha: config.commitSha, dataset: config.dataset, operations: ["build commit-bound images", "create isolated PostgreSQL volume", "restore custom-format dataset", "migrate", "production seed", "bootstrap performance admin", "strict baseline check", "health wait", "formal executor", "down volumes/images and prove residual=0"] }, null, 2)}\n`);
    } else if (mode === "--provision") {
      process.stdout.write(`${JSON.stringify(await provision(await loadEnvironmentConfig()), null, 2)}\n`);
    } else if (["--restart", "--cleanup", "--gc", "--db-wait", "--pg-parameters"].includes(mode) && runtimeFlag === "--runtime" && runtimePath) {
      const runtime = readRuntime(runtimePath);
      const value = mode === "--restart" ? await restart(runtime) : mode === "--cleanup" ? await cleanup(runtime) : mode === "--gc" ? await observeGc(runtime) : mode === "--db-wait" ? await observeDbWait(runtime) : await postgresParameters(runtime);
      process.stdout.write(`${typeof value === "number" ? value : JSON.stringify(value)}\n`);
    } else throw new Error(usage());
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
