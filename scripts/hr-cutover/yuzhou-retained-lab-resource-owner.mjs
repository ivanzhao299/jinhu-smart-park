#!/usr/bin/env node
/* global AbortController: readonly */
import process from "node:process";
import { Buffer } from "node:buffer";
import { randomBytes, createHash } from "node:crypto";
import { constants, openSync, writeFileSync, fsyncSync, closeSync, mkdirSync, readdirSync, statfsSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as pause } from "node:timers/promises";
import { assertYuzhouLabResources } from "./yuzhou-lab-resource-descriptor.mjs";
import { assertYuzhouLabCapacity, assertYuzhouLabContainer } from "./run-yuzhou-real-bundle-lab.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read, parseProductionImportPrivateJson as parse,
  productionImportPrivateDirectory as directory, measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url))), SELF = "scripts/hr-cutover/yuzhou-retained-lab-resource-owner.mjs";
const run = promisify(execFile), LIMIT = 65536;
const fail = () => { throw new Error("LAB_RESOURCE_OWNER_INVALID"); };
const sha = v => createHash("sha256").update(v).digest("hex");
const OWNER_LABEL = "org.jinhu.hr-lab.owner";
export function validateYuzhouLocalDockerSocket(dockerHost) {
  if (typeof dockerHost !== "string" || !dockerHost.startsWith("unix:///") || dockerHost.includes("\0")) fail();
  const path = dockerHost.slice(7);
  if (resolve(path) !== path || realpathSync(path) !== path) fail();
  const stat = lstatSync(path);
  if (!stat.isSocket() || ![0, process.getuid()].includes(stat.uid)) fail();
  return { path, dev: stat.dev, ino: stat.ino };
}
const executeDefault = async (file, args, options) => (await run(file, args, options)).stdout;
function writePrivate(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDir(path) { const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
/** Creates only fresh dedicated resources. No cleanup entrypoint is provided. */
export async function prepareYuzhouRetainedLabResources(input, { execute = executeDefault, leaseRoot = join(homedir(), ".jinhu-hr-lab-resource-leases"), currentHead = () => currentCandidateFreezeRepositorySha(ROOT, [SELF, "scripts/db-migrate.sh", "scripts/db-seed-prod.sh"]) } = {}) {
  let stage = "INPUT", created = {}, output, original, sequence = 0, ownsOutput = false;
  const abort = new AbortController(), cancel = () => abort.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    if (!input || Object.keys(input).sort().join() !== ["runId", "name", "imageId", "port", "outputDirectory", "capacityObserver", "dockerHost"].sort().join() ||
        !/^jinhu_hr_migration_lab_[a-z0-9_]{6,40}$/u.test(input.name ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(input.runId ?? "") ||
        !/^sha256:[a-f0-9]{64}$/u.test(input.imageId ?? "") || !Number.isInteger(input.port) || input.port < 1024 || input.port > 65535) fail();
    input = JSON.parse(JSON.stringify(input)); output = input.outputDirectory; original = directory(output); if (readdirSync(output).length) fail();
    ownsOutput = true;
    const observer = input.capacityObserver;
    if (!observer || Object.keys(observer).sort().join() !== ["container", "containerId", "imageId", "port"].sort().join() || !/^[A-Za-z0-9_.-]+$/u.test(observer.container ?? "") || !/^[a-f0-9]{64}$/u.test(observer.containerId ?? "") || !/^sha256:[a-f0-9]{64}$/u.test(observer.imageId ?? "") || !Number.isInteger(observer.port) || observer.port < 1024 || observer.port > 65535) fail();
    const codeSha = currentHead(); if (!/^[a-f0-9]{40}$/u.test(codeSha ?? "")) fail();
    stage = "ENDPOINT"; const socket = validateYuzhouLocalDockerSocket(input.dockerHost);
    const env = { PATH: process.env.PATH, DOCKER_HOST: input.dockerHost, COMPOSE_PROJECT_NAME: input.name, POSTGRES_USER: "jinhu", POSTGRES_DB: input.name };
    let leasePath, leaseStat; const ownerNonce = randomBytes(32).toString("hex");
    const command = async (file, args, timeout = 30000) => {
      abort.signal.throwIfAborted();
      const now = validateYuzhouLocalDockerSocket(input.dockerHost); if (now.dev !== socket.dev || now.ino !== socket.ino) fail();
      if (leasePath) {
        directory(leasePath, leaseStat);
        const pin = read(join(leasePath, "owner.json"), LIMIT, { bytes: 0, maximum: LIMIT }, () => {});
        if (pin.sha256 !== sha(JSON.stringify({ ownerNonce }))) fail();
      }
      return execute(file, args, { env, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, signal: abort.signal });
    };
    const docker = args => command("docker", args);
    const inspect = async (kind, name) => { const list = JSON.parse(await docker([kind, "inspect", name])); if (!Array.isArray(list) || list.length !== 1) fail(); return list[0]; };
    stage = "LEASE";
    const daemonId = (await docker(["info", "--format", "{{.ID}}"])).trim(); if (!/^[A-Za-z0-9:_-]{6,128}$/u.test(daemonId)) fail();
    const endpointIdentitySha256 = sha(JSON.stringify({ daemonId, pathSha256: sha(socket.path), dev: socket.dev, ino: socket.ino }));
    try { mkdirSync(leaseRoot, { mode: 0o700 }); } catch (e) { if (e.code !== "EEXIST") throw e; }
    directory(leaseRoot);
    const newLease = join(leaseRoot, sha(`${daemonId}:${input.name}`)); mkdirSync(newLease, { mode: 0o700 });
    leaseStat = directory(newLease); writePrivate(join(newLease, "owner.json"), JSON.stringify({ ownerNonce })); syncDir(newLease); syncDir(leaseRoot); leasePath = newLease;
    const owned = (kind, obj) => {
      const labels = kind === "container" ? obj.Config?.Labels : obj.Labels;
      if (labels?.[OWNER_LABEL] !== ownerNonce || (kind === "container" &&
          (labels["com.docker.compose.container-number"] !== "1" || labels["com.docker.compose.config-hash"] !== composeConfigSha256 || labels["com.docker.compose.service"] !== "postgres" || labels["com.docker.compose.project"] !== input.name))) fail();
    };
    const verifyCreated = async () => {
      for (const [kind, identity] of Object.entries(created)) {
        const obj = await inspect(kind, identity.id ?? identity.name); owned(kind, obj);
        if ((kind === "volume" && (obj.Name !== identity.name || obj.CreatedAt !== identity.createdAt)) || (kind !== "volume" && obj.Id !== identity.id)) fail();
      }
    };
    const journal = () => { directory(output, original); writePrivate(join(output, `stage-${String(sequence++).padStart(2, "0")}.json`), JSON.stringify({ stage, runId: input.runId, codeSha, plannedName: input.name, created }) + "\n"); syncDir(output); };
    stage = "CAPACITY";
    const template = '{"Id":{{json .Id}},"Image":{{json .Image}},"State":{{json .State}},"Config":{"Labels":{{json .Config.Labels}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}';
    assertYuzhouLabContainer(observer, JSON.parse(await docker(["container", "inspect", "--format", template, observer.container])));
    const df = (await docker(["exec", observer.containerId, "df", "-Pk", "/var/lib/postgresql/data"])).trim().split("\n").at(-1).trim().split(/\s+/u);
    const used = Number((await docker(["exec", observer.containerId, "du", "-sk", "/var/lib/postgresql/data"])).trim().split(/\s+/u)[0]);
    const host = statfsSync(output); assertYuzhouLabCapacity(host.bavail * host.bsize, Number(df[3]), used);
    stage = "ABSENCE";
    for (const kind of ["container", "volume", "network"]) {
      const args = [kind, "ls", ...(kind === "container" ? ["-a"] : []), "--format", kind === "container" ? "{{.Names}}" : "{{.Name}}"];
      if ((await docker(args)).trim().split("\n").includes(input.name)) fail();
      const existing = await docker([kind, "ls", ...(kind === "container" ? ["-a"] : []), "--filter", `label=com.docker.compose.project=${input.name}`, "--format", "{{.ID}}"]);
      if (existing.trim()) fail();
    }
    stage = "IMAGE"; const image = await inspect("image", input.imageId);
    if (image.Id !== input.imageId || JSON.stringify(image.Config?.Entrypoint) !== '["docker-entrypoint.sh"]' || JSON.stringify(image.Config?.Cmd) !== '["postgres"]') fail();
    journal();
    stage = "PRIVATE_CONFIG";
    const password = randomBytes(32), bytes = Buffer.from(`POSTGRES_PASSWORD=${password.toString("hex")}\nPOSTGRES_USER=jinhu\nPOSTGRES_DB=postgres\nPGDATA=/var/lib/postgresql/data\n`);
    try { writePrivate(join(output, "postgres.env"), bytes); } finally { password.fill(0); bytes.fill(0); }
    const compose = { name: input.name, services: { postgres: { image: input.imageId, pull_policy: "never", container_name: input.name, env_file: [join(output, "postgres.env")],
      labels: { [OWNER_LABEL]: ownerNonce }, ports: [`127.0.0.1:${input.port}:5432`], volumes: ["data:/var/lib/postgresql/data"], networks: ["lab"], restart: "no" } },
      volumes: { data: { external: true, name: input.name } }, networks: { lab: { external: true, name: input.name } } };
    const composeConfigSha256 = sha(JSON.stringify(compose));
    const composePath = join(output, "compose.json"); writePrivate(composePath, JSON.stringify(compose)); env.COMPOSE_FILE = composePath; syncDir(output);
    stage = "VOLUME"; journal(); await docker(["volume", "create", "--driver", "local", "--label", `com.docker.compose.project=${input.name}`, "--label", `${OWNER_LABEL}=${ownerNonce}`, input.name]);
    const volume = await inspect("volume", input.name); owned("volume", volume); created.volume = { name: volume.Name, createdAt: volume.CreatedAt }; journal();
    stage = "NETWORK"; await verifyCreated(); journal(); await docker(["network", "create", "--driver", "bridge", "--label", `com.docker.compose.project=${input.name}`, "--label", `${OWNER_LABEL}=${ownerNonce}`, input.name]);
    const network = await inspect("network", input.name); owned("network", network); created.network = { name: network.Name, id: network.Id }; journal();
    stage = "CONTAINER"; await verifyCreated(); journal();
    // Docker create is exclusive by name; unlike compose up it never reconfigures an existing container.
    const containerId = (await docker(["container", "create", "--name", input.name, "--label", `com.docker.compose.project=${input.name}`, "--label", "com.docker.compose.service=postgres", "--label", "com.docker.compose.container-number=1", "--label", `com.docker.compose.config-hash=${composeConfigSha256}`, "--label", "com.docker.compose.oneoff=False", "--label", `${OWNER_LABEL}=${ownerNonce}`,
      "--env-file", join(output, "postgres.env"), "--mount", `type=volume,source=${input.name},target=/var/lib/postgresql/data`, "--network", network.Id, "--publish", `127.0.0.1:${input.port}:5432`, input.imageId])).trim();
    if (!/^[a-f0-9]{64}$/u.test(containerId)) fail();
    let container = await inspect("container", containerId); owned("container", container); if (container.Id !== containerId) fail();
    created.container = { name: input.name, id: container.Id, imageId: container.Image }; journal();
    await verifyCreated(); await docker(["container", "start", containerId]); container = await inspect("container", containerId); owned("container", container);
    const descriptor = { database: input.name, container: input.name, containerId: container.Id, imageId: input.imageId, port: input.port, composeProject: input.name, volume: created.volume, network: created.network };
    assertYuzhouLabResources(descriptor, { container, volume, network });
    stage = "READY_CHECK";
    let ready = false;
    // The image's temporary initialization server accepts Unix sockets but not TCP.
    // Wait for the final server, otherwise CREATE DATABASE can race its shutdown.
    for (let i = 0; i < 60; i++) { await verifyCreated(); try { await docker(["exec", container.Id, "pg_isready", "-h", "127.0.0.1", "-U", "jinhu", "-d", "postgres"]); ready = true; break; } catch { abort.signal.throwIfAborted(); await pause(500, undefined, { signal: abort.signal }); } }
    if (!ready) fail();
    stage = "DATABASE"; await verifyCreated(); journal(); await docker(["exec", container.Id, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres", "-c", `CREATE DATABASE "${input.name}" TEMPLATE template0;`]);
    stage = "MIGRATE"; await verifyCreated(); journal(); await command("/bin/sh", [join(ROOT, "scripts/db-migrate.sh")], 2700000);
    stage = "SEED"; await verifyCreated(); journal(); env.ALLOW_PRODUCTION_SEED = "yes"; await command("/bin/sh", [join(ROOT, "scripts/db-seed-prod.sh")], 2700000);
    stage = "VERIFY";
    await verifyCreated();
    assertYuzhouLabResources(descriptor, { container: await inspect("container", input.name), volume: await inspect("volume", input.name), network: await inspect("network", input.name) });
    if (currentHead() !== codeSha) fail();
    stage = "REGISTRY"; directory(output, original);
    const registry = join(output, "registry"); mkdirSync(registry, { mode: 0o700 }); syncDir(output);
    const artifacts = { "resource-descriptor.json": descriptor }, pins = { "resource-descriptor.json": measure(descriptor, LIMIT) };
    const receipt = { status: "DEDICATED_LAB_PREPARED", evidenceMode: execute === executeDefault ? "real_commands" : "synthetic_adapter", runId: input.runId, codeSha,
      requestSha256: measure(input, LIMIT).sha256, endpointIdentitySha256, ownerNonceSha256: sha(ownerNonce), composeSourceSha256: composeConfigSha256, artifacts: pins, migrationsApplied: true, productionSeedsApplied: true, bootstrapAdminRun: false,
      importedDataLoaded: false, cleanupImplemented: false, productionImport: "HOLD" };
    emit(registry, artifacts, receipt, pins, LIMIT, "prepare-receipt.json"); return receipt;
  } catch {
    // Journals survive; no automatic deletion. Names/identities contain no credentials/business rows.
    if (ownsOutput) try { directory(output, original); writePrivate(join(output, "prepare-failure.json"), JSON.stringify({ stage, created, cleanupAttempted: false }) + "\n"); syncDir(output); } catch { /* never overwrite or expose raw errors */ }
    return { status: "FAILED", failureCode: `LAB_RESOURCE_PREPARE_${stage}_FAILED`, cleanupAttempted: false, productionImport: "HOLD" };
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try {
    const a = process.argv.slice(2);
    {
      if (a.length !== 5 || a[0] !== "--prepare" || a[1] !== "--request" || a[3] !== "--request-sha256" || !/^[a-f0-9]{64}$/u.test(a[4] ?? "")) fail();
      const chunks = [], pin = read(a[2], LIMIT, { bytes: 0, maximum: LIMIT }, p => chunks.push(Buffer.from(p)));
      if (pin.sha256 !== a[4]) fail(); const bytes = Buffer.concat(chunks); let input;
      try { input = parse(bytes); } finally { bytes.fill(0); chunks.forEach(p => p.fill(0)); }
      result = await prepareYuzhouRetainedLabResources(input);
    }
  } catch { result = { status: "FAILED", failureCode: "LAB_RESOURCE_REQUEST_INVALID", productionImport: "HOLD" }; }
  process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status === "FAILED") process.exitCode = 1;
}
