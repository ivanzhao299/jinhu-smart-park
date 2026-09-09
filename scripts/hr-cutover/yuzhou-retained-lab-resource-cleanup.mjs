#!/usr/bin/env node
/* global AbortController: readonly */
import process from "node:process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { constants, openSync, writeFileSync, fsyncSync, closeSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateYuzhouLocalDockerSocket } from "./yuzhou-retained-lab-resource-owner.mjs";
import { assertYuzhouLabResources } from "./yuzhou-lab-resource-descriptor.mjs";
import { validateYuzhouLabConfig, readYuzhouLabFinalReceipt } from "./run-yuzhou-real-bundle-lab.mjs";
import { createYuzhouLabRunState } from "./yuzhou-real-bundle-lab-run-state.mjs";
import { createYuzhouRealBundleLabPgProbes } from "./yuzhou-real-bundle-lab-pg-probes.mjs";
import { readProductionImportPrivateBytes as read, parseProductionImportPrivateJson as parse,
  productionImportPrivateDirectory as directory, measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url))), LIMIT = 65536, run = promisify(execFile);
const sha = v => createHash("sha256").update(v).digest("hex");
const fail = () => { throw new Error("LAB_RESOURCE_CLEANUP_INVALID"); };
const same = (a, b) => measure(a, LIMIT).sha256 === measure(b, LIMIT).sha256;
const executeDefault = async (file, args, opts) => (await run(file, args, opts)).stdout;
const clientDefault = options => { const { Client } = createRequire(join(ROOT, "apps/api/package.json"))("pg"); return new Client(options); };
function load(d, limit = LIMIT) {
  if (!d || Object.keys(d).sort().join() !== "path,sha256" || !/^[a-f0-9]{64}$/u.test(d.sha256 ?? "")) fail();
  const chunks = [];
  try { const pin = read(d.path, limit, { bytes: 0, maximum: limit }, p => chunks.push(Buffer.from(p))); if (pin.sha256 !== d.sha256) fail();
    const bytes = Buffer.concat(chunks); try { return parse(bytes); } finally { bytes.fill(0); }
  } finally { chunks.forEach(p => p.fill(0)); }
}
function writeIntent(path, value) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  const dir = openSync(resolve(path, ".."), constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(dir); } finally { closeSync(dir); }
}
/** No delete retry/resume. Runtime lease fences writers; original resource lease/audit remain. */
export async function cleanupYuzhouRetainedLabResources(input, { execute = executeDefault, createClient = clientDefault, leaseRoot = join(homedir(), ".jinhu-hr-lab-resource-leases") } = {}) {
  let stage = "INPUT", runtimeLease; const removed = [];
  const abort = new AbortController(), cancel = () => abort.abort(); process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    if (!input || Object.keys(input).sort().join() !== ["prepareRequest", "prepareReceipt", "resourceDescriptor", "sideConfig", "finalReceipt", "httpRegistry", "outputDirectory"].sort().join()) fail();
    input = JSON.parse(JSON.stringify(input));
    const request = load(input.prepareRequest), prepared = load(input.prepareReceipt), descriptor = load(input.resourceDescriptor), c = validateYuzhouLabConfig(load(input.sideConfig));
    if (prepared.status !== "DEDICATED_LAB_PREPARED" || prepared.evidenceMode !== "real_commands" || prepared.productionImport !== "HOLD" || prepared.migrationsApplied !== true || prepared.productionSeedsApplied !== true ||
        prepared.requestSha256 !== measure(request, LIMIT).sha256 || prepared.runId !== request.runId || request.runId !== c.artifacts.runId ||
        input.prepareReceipt.path !== join(request.outputDirectory, "registry/prepare-receipt.json") || input.resourceDescriptor.path !== join(request.outputDirectory, "registry/resource-descriptor.json") ||
        prepared.artifacts?.["resource-descriptor.json"]?.sha256 !== input.resourceDescriptor.sha256 || !same(descriptor, c.resourceDescriptor) ||
        descriptor.database !== request.name || descriptor.imageId !== request.imageId || descriptor.port !== request.port || !c.pairMaterials) fail();
    load({ path: join(request.outputDirectory, "compose.json"), sha256: prepared.composeSourceSha256 });
    if (prepared.databaseRecovery) {
      const recovery = prepared.databaseRecovery;
      if (recovery.mode !== "database_only" || recovery.recoveryCodeSha !== prepared.codeSha || !/^[a-f0-9]{40}$/u.test(recovery.originalPrepareCodeSha ?? "") || recovery.seedBaselineVerified !== true || prepared.artifacts?.["database-recovery-request.json"]?.sha256 !== recovery.requestSha256) fail();
      const rr = load({ path: join(request.outputDirectory, "registry/database-recovery-request.json"), sha256: recovery.requestSha256 });
      if (!same(load(rr.prepareRequest), request) || rr.failure.path !== join(request.outputDirectory, "prepare-failure.json") || rr.compose.path !== join(request.outputDirectory, "compose.json") || rr.compose.sha256 !== prepared.composeSourceSha256) fail();
      const failed = load(rr.failure), last = load(rr.databaseStage);
      if (failed.stage !== "DATABASE" || last.stage !== "DATABASE" || last.codeSha !== recovery.originalPrepareCodeSha || last.runId !== request.runId || last.plannedName !== request.name || !same(failed.created, last.created) || last.created.container.id !== descriptor.containerId || !same(last.created.volume, descriptor.volume) || !same(last.created.network, descriptor.network)) fail();
    }
    if (input.finalReceipt.path !== join(c.stateRoot, `final-${c.artifacts.runId}.json`) || input.httpRegistry.path !== join(c.stateRoot, `http-${c.artifacts.runId}.json`)) fail();
    const wrapper = load(input.finalReceipt), identity = { runId: c.artifacts.runId, configSha256: input.sideConfig.sha256, manifestSha256: wrapper.value?.manifestSha256, binding: c.artifacts.binding };
    const final = await readYuzhouLabFinalReceipt({ stateRoot: c.stateRoot, identity }), r = final.result, p = r.sideExecutionProvenance;
    if (final.receiptSha256 !== wrapper.sha256 || r.status !== "LAB_PASS" || r.failureCodes.length || r.httpVerified !== true || r.rollbackVerified !== true || r.residualVerified !== true || !same(r.counts, c.artifacts.expectedCounts) ||
        !p || p.executorSha256 !== c.artifacts.binding.executorSha256 || p.runtimeTreeSha256 !== c.runtimeTreeSha256 ||
        p.sourceProvenance.side !== c.pairMaterials.side || p.sourceProvenance.originalConfigSha256 !== c.pairMaterials.originalConfig.sha256 || p.sourceProvenance.pairMaterialsReceiptSha256 !== c.pairMaterials.receipt.sha256) fail();
    const http = load(input.httpRegistry);
    if (http.manifestSha256 !== identity.manifestSha256 || !same(http.binding, c.artifacts.binding) || http.database !== descriptor.database || http.tenantId !== c.artifacts.targetScope.tenantId || http.parkId !== c.artifacts.targetScope.parkId || http.createdUserIds?.length !== 2 || typeof http.createdRoleId !== "string") fail();
    const outStat = directory(input.outputDirectory); if (readdirSync(input.outputDirectory).length) fail();
    stage = "LEASE";
    const state = await createYuzhouLabRunState({ stateRoot: c.stateRoot }); runtimeLease = await state.acquireExclusiveOwner({ runId: c.artifacts.runId, manifestSha256: identity.manifestSha256 });
    const runtimePath = join(c.stateRoot, "exclusive-owner"), runtimeStat = directory(runtimePath);
    const runtimeOwner = { path: join(runtimePath, "owner.json"), sha256: read(join(runtimePath, "owner.json"), LIMIT, { bytes: 0, maximum: LIMIT }, () => {}).sha256 };
    const socket = validateYuzhouLocalDockerSocket(request.dockerHost), env = { PATH: process.env.PATH, DOCKER_HOST: request.dockerHost };
    const docker = async args => { abort.signal.throwIfAborted(); const now = validateYuzhouLocalDockerSocket(request.dockerHost); if (now.dev !== socket.dev || now.ino !== socket.ino) fail();
      return execute("docker", args, { env, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024, signal: abort.signal }); };
    const daemonId = (await docker(["info", "--format", "{{.ID}}"])).trim();
    if (sha(JSON.stringify({ daemonId, pathSha256: sha(socket.path), dev: socket.dev, ino: socket.ino })) !== prepared.endpointIdentitySha256) fail();
    directory(leaseRoot); const resourceLease = join(leaseRoot, sha(`${daemonId}:${request.name}`)), leaseStat = directory(resourceLease);
    const ownerPin = read(join(resourceLease, "owner.json"), LIMIT, { bytes: 0, maximum: LIMIT }, () => {});
    const owner = load({ path: join(resourceLease, "owner.json"), sha256: ownerPin.sha256 });
    if (!/^[a-f0-9]{64}$/u.test(owner.ownerNonce ?? "") || sha(owner.ownerNonce) !== prepared.ownerNonceSha256) fail();
    if (prepared.databaseRecovery) {
      const expected = { requestSha256: prepared.databaseRecovery.requestSha256, originalPrepareCodeSha: prepared.databaseRecovery.originalPrepareCodeSha, recoveryCodeSha: prepared.codeSha, endpointIdentitySha256: prepared.endpointIdentitySha256 };
      const intent = read(join(resourceLease, "resume-database-intent.json"), LIMIT, { bytes: 0, maximum: LIMIT }, () => {});
      if (intent.sha256 !== sha(JSON.stringify(expected))) fail();
    }
    const checkLease = () => { directory(runtimePath, runtimeStat); load(runtimeOwner); directory(resourceLease, leaseStat); load({ path: join(resourceLease, "owner.json"), sha256: ownerPin.sha256 }); };
    const inspect = async (kind, target) => { checkLease(); const values = JSON.parse(await docker([kind, "inspect", target])); if (values.length !== 1) fail(); return values[0]; };
    const owned = (kind, obj) => {
      const labels = kind === "container" ? obj.Config?.Labels : obj.Labels;
      if (labels?.["org.jinhu.hr-lab.owner"] !== owner.ownerNonce || labels["com.docker.compose.project"] !== descriptor.composeProject) fail();
      if (kind === "container" && (obj.Id !== descriptor.containerId || obj.Config.Labels["com.docker.compose.config-hash"] !== prepared.composeSourceSha256 || obj.Config.Labels["com.docker.compose.container-number"] !== "1")) fail();
      if (kind === "network" && (obj.Id !== descriptor.network.id || obj.Name !== descriptor.network.name)) fail();
      if (kind === "volume" && (obj.Name !== descriptor.volume.name || obj.CreatedAt !== descriptor.volume.createdAt)) fail();
    };
    stage = "LIVE_IDENTITY";
    const live = { container: await inspect("container", descriptor.containerId), network: await inspect("network", descriptor.network.id), volume: await inspect("volume", descriptor.volume.name) };
    for (const kind of Object.keys(live)) owned(kind, live[kind]); assertYuzhouLabResources(descriptor, live);
    // O_EXCL fences concurrent/stale cleanup independently of output directory; retain it on all outcomes.
    writeIntent(join(resourceLease, "cleanup-intent.json"), { prepareReceiptSha256: input.prepareReceipt.sha256, finalReceiptSha256: final.receiptSha256 });
    stage = "FRESH_RESIDUAL";
    const password = live.container.Config.Env?.find(v => v.startsWith("POSTGRES_PASSWORD="))?.slice(18); if (!password) fail();
    const client = createClient({ host: "127.0.0.1", port: descriptor.port, user: "jinhu", database: descriptor.database, password, connectionTimeoutMillis: 10000 });
    try {
      await client.connect(); await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        await client.query("SET LOCAL statement_timeout = '30s'");
        const probes = createYuzhouRealBundleLabPgProbes({ expectedDatabase: descriptor.database, targetScope: c.artifacts.targetScope, runId: c.artifacts.runId,
          codeSha: c.artifacts.binding.codeSha, sourceSnapshotHash: c.artifacts.binding.sourceSnapshotHash, baselineCounts: c.baselineCounts, phaseCounts: c.phaseCounts,
          getHttpFixtureIds: () => ({ userIds: http.createdUserIds, roleIds: [http.createdRoleId] }) });
        await probes.verifyResidual({ tx: client, baseline: { tableCounts: c.baselineCounts } });
      } finally { await client.query("ROLLBACK"); }
    } finally { await client.end(); }
    for (const [kind, target] of [["container", descriptor.containerId], ["network", descriptor.network.id], ["volume", descriptor.volume.name]]) {
      stage = `DELETE_${kind.toUpperCase()}`; owned(kind, await inspect(kind, target));
      directory(input.outputDirectory, outStat); writeIntent(join(input.outputDirectory, `${kind}-intent.json`), { kind, targetIdentitySha256: sha(target), prepareReceiptSha256: input.prepareReceipt.sha256 });
      await docker([kind, "rm", ...(kind === "container" ? ["--force"] : []), target]);
      const listed = (await docker([kind, "ls", ...(kind === "container" ? ["-a", "--no-trunc"] : kind === "network" ? ["--no-trunc"] : []), "--format", kind === "volume" ? "{{.Name}}" : "{{.ID}}"])).trim().split("\n");
      if (listed.includes(target)) fail(); removed.push(kind);
    }
    stage = "RECEIPT"; await runtimeLease.release(); runtimeLease = undefined;
    // Intent files remain in the audit directory; publish receipt in a separate caller-created empty subdirectory.
    const receiptDirectory = join(input.outputDirectory, "receipt");
    const receipt = { status: "DEDICATED_LAB_RESOURCES_REMOVED", evidenceMode: execute === executeDefault && createClient === clientDefault ? "real_commands" : "synthetic_adapter",
      prepareReceiptSha256: input.prepareReceipt.sha256, finalReceiptSha256: final.receiptSha256, resourceDescriptorSha256: input.resourceDescriptor.sha256,
      sideConfigSha256: input.sideConfig.sha256, executionCodeSha: p.executionCodeSha, endpointIdentitySha256: prepared.endpointIdentitySha256,
      freshDatabaseResidualVerified: true, removed, auditArtifactsPreserved: true, formalFinalRehearsalPairProduced: false, productionImport: "HOLD" };
    // Created only after deletion evidence; no existing receipt is overwritten.
    mkdirSync(receiptDirectory, { mode: 0o700 });
    emit(receiptDirectory, {}, receipt, {}, LIMIT, "cleanup-receipt.json"); return receipt;
  } catch { return { status: "FAILED", failureCode: `LAB_RESOURCE_CLEANUP_${stage}_FAILED`, removed, productionImport: "HOLD" }; }
  finally { if (runtimeLease) await runtimeLease.release().catch(() => {}); process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result; try {
    const a = process.argv.slice(2); if (a.length !== 5 || a[0] !== "--cleanup" || a[1] !== "--request" || a[3] !== "--request-sha256") fail();
    result = await cleanupYuzhouRetainedLabResources(load({ path: a[2], sha256: a[4] }));
  } catch { result = { status: "FAILED", failureCode: "LAB_RESOURCE_CLEANUP_REQUEST_INVALID", productionImport: "HOLD" }; }
  process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status === "FAILED") process.exitCode = 1;
}
