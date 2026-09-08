/* global AbortController: readonly */
import process from "node:process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, realpath, lstat, readdir, open, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { prepareYuzhouRealBundleLabArtifacts } from "./yuzhou-real-bundle-lab-artifacts.mjs";
import { runYuzhouRealBundleLabOwner } from "./yuzhou-real-bundle-lab-owner.mjs";
import { createYuzhouLabRunState } from "./yuzhou-real-bundle-lab-run-state.mjs";
import { createYuzhouRealBundleLabPgProbes } from "./yuzhou-real-bundle-lab-pg-probes.mjs";
import { withYuzhouRealHttpLab } from "./yuzhou-real-http-lab-runtime.mjs";
import { verifyYuzhouRealImportHttp } from "./yuzhou-real-import-http-probe.mjs";
import { createProductionImportArtifactCryptoProvider, readBoundedPrivateArtifactBytes, PRODUCTION_IMPORT_EXECUTION_DEPENDENCY_PATHS } from "./execute-production-import.mjs";
import { decryptProductionImportEnvelope } from "./production-import-crypto-provider.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), HASH = /^[0-9a-f]{64}$/u;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("LAB_CLI_GUARD"); };
const privatePath = p => typeof p === "string" && isAbsolute(p) && resolve(p) === p && !p.includes("\0");
const exact = (o, keys) => { if (!o || Object.keys(o).sort().join() !== [...keys].sort().join()) fail(); };
export const LAB_EXECUTION_DEPENDENCIES = Object.freeze([...new Set([...PRODUCTION_IMPORT_EXECUTION_DEPENDENCY_PATHS,
  ...["run-yuzhou-real-bundle-lab", "yuzhou-real-bundle-lab-artifacts", "yuzhou-real-bundle-lab-owner", "yuzhou-real-bundle-lab-run-state", "yuzhou-real-bundle-lab-pg-probes", "yuzhou-real-http-lab-runtime", "yuzhou-real-import-http-probe", "production-import-phase-rollback"].map(n => `scripts/hr-cutover/${n}.mjs`),
  "pnpm-lock.yaml", "apps/api/package.json", "apps/api/tsconfig.json", "packages/shared/package.json"])] .sort());

export function parseYuzhouLabArgs(argv) {
  if (argv.length !== 5 || !["--validate", "--preflight", "--execute-isolated"].includes(argv[0]) || argv[1] !== "--config" || !privatePath(argv[2]) || argv[3] !== "--config-sha256" || !HASH.test(argv[4])) fail();
  return { mode: argv[0].slice(2), configPath: argv[2], configSha256: argv[4] };
}
export function validateYuzhouLabConfig(c) {
  exact(c, ["formatVersion", "artifacts", "stateRoot", "container", "containerId", "imageId", "port", "dependencies", "runtimeTreeSha256", "envelopes", "keyFiles", "baselineCounts", "phaseCounts"]);
  if (c.formatVersion !== 1 || !/^[A-Za-z0-9_.-]+$/u.test(c.container) || !HASH.test(c.containerId) || !/^sha256:[0-9a-f]{64}$/u.test(c.imageId) || !Number.isInteger(c.port) || c.port < 1024 || c.port > 65535 || !HASH.test(c.runtimeTreeSha256)) fail();
  exact(c.artifacts, ["preparedRoot", "expectedSummarySha256", "expectedTriple", "binding", "target", "targetScope", "runId", "operationId", "expectedCounts", "httpCounts"]);
  exact(c.artifacts.target, ["database"]);
  exact(c.artifacts.binding, ["codeSha", "sourceSnapshotHash", "mappingSha256", "executorSha256"]);
  exact(c.artifacts.expectedTriple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(c.artifacts.runId ?? "") || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(c.artifacts.operationId ?? "") || !HASH.test(c.artifacts.expectedSummarySha256 ?? "") || !/^[0-9a-f]{40}$/u.test(c.artifacts.binding.codeSha ?? "") || ["sourceSnapshotHash", "mappingSha256", "executorSha256"].some(k => !HASH.test(c.artifacts.binding[k] ?? ""))) fail();
  if (!/^jinhu_hr_migration_lab_[a-z0-9_]{6,}$/u.test(c.artifacts.target?.database ?? "") || c.artifacts.target.database.length > 63) fail();
  exact(c.dependencies, LAB_EXECUTION_DEPENDENCIES);
  if (Object.values(c.dependencies).some(v => !HASH.test(v)) || !Array.isArray(c.keyFiles) || c.keyFiles.length > 16) fail();
  if (!privatePath(c.stateRoot) || !privatePath(c.artifacts.preparedRoot)) fail();
  for (const d of [c.envelopes, ...c.keyFiles.map(k => k.keyFile)]) { exact(d, ["path", "sha256"]); if (!HASH.test(d.sha256) || !privatePath(d.path)) fail(); }
  for (const k of c.keyFiles) { exact(k, ["keyReferenceSha256", "keyFile"]); if (!HASH.test(k.keyReferenceSha256)) fail(); }
  return c;
}
// Existing capacity policy: 20 GiB host reserve + twice PG working set;
// 15 GiB in the container. This lab does not import attachment binaries.
export function assertYuzhouLabCapacity(hostFreeBytes, pgFreeKiB, pgUsedKiB) {
  if ([hostFreeBytes, pgFreeKiB, pgUsedKiB].some(v => !Number.isSafeInteger(v) || v < 0) ||
      hostFreeBytes < 20 * 1024 ** 3 + 2 * pgUsedKiB * 1024 || pgFreeKiB < 15 * 1024 ** 2) fail();
}
async function privateBytes(descriptor, limit) {
  if (await realpath(descriptor.path) !== descriptor.path) fail();
  const bytes = readBoundedPrivateArtifactBytes(descriptor.path, "private input", limit);
  if (sha(bytes) !== descriptor.sha256) fail(); return bytes;
}
// Hash the actual AppModule/shared source tree, not merely the runtime launcher.
export async function computeYuzhouLabExecutionBinding(repositoryRoot = ROOT) {
  const dependencies = {}, tree = [];
  for (const path of LAB_EXECUTION_DEPENDENCIES) dependencies[path] = sha(await readFile(join(repositoryRoot, path)));
  async function walk(path) {
    for (const item of (await readdir(join(repositoryRoot, path), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const child = `${path}/${item.name}`;
      if (item.isSymbolicLink()) fail();
      if (item.isDirectory()) await walk(child);
      else if (item.isFile()) tree.push([child, sha(await readFile(join(repositoryRoot, child)))]);
    }
  }
  await walk("apps/api/src"); await walk("packages/shared/src");
  const runtimeTreeSha256 = sha(JSON.stringify(tree));
  return { dependencies, runtimeTreeSha256, executorSha256: sha(JSON.stringify({ dependencies, runtimeTreeSha256 })) };
}
export function assertYuzhouLabContainer(c, d) {
  const p = d?.NetworkSettings?.Ports?.["5432/tcp"];
  if (d?.Id !== c.containerId || d.Image !== c.imageId || d.State?.Running !== true || d.Config?.Labels?.["com.docker.compose.project"] !== "jinhu_hr_migration_lab" || p?.length !== 1 || p[0].HostIp !== "127.0.0.1" || Number(p[0].HostPort) !== c.port) fail();
}
const docker = args => execFileSync("docker", args, { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
async function unusedState(c) {
  const s = await lstat(c.stateRoot); if (!s.isDirectory() || (s.mode & 0o077) || await realpath(c.stateRoot) !== c.stateRoot) fail();
  for (const name of ["exclusive-owner", `checkpoint-${c.artifacts.runId}.json`, `http-${c.artifacts.runId}.json`]) {
    try { await lstat(join(c.stateRoot, name)); fail(); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
}
/** Dedicated process only. No resume or SIGKILL recovery: retained metadata must
 * be reconciled explicitly before another run. No production entrypoint calls. */
export async function runYuzhouLabCli(input) {
  let pool, provider, stage = "CONFIG";
  const abort = new AbortController(), cancel = () => abort.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    if (!["validate", "preflight", "execute-isolated"].includes(input.mode) || !privatePath(input.configPath) || !HASH.test(input.configSha256 ?? "")) fail();
    const c = validateYuzhouLabConfig(JSON.parse((await privateBytes({ path: input.configPath, sha256: input.configSha256 }, 65536)).toString("utf8")));
    stage = "BINDING";
    const verifyBinding = async () => {
      const actual = await computeYuzhouLabExecutionBinding();
      if (LAB_EXECUTION_DEPENDENCIES.some(p => actual.dependencies[p] !== c.dependencies[p]) || actual.runtimeTreeSha256 !== c.runtimeTreeSha256 || actual.executorSha256 !== c.artifacts.binding.executorSha256) fail();
      const disk = await statfs(c.stateRoot); if (disk.bavail * disk.bsize < 20 * 1024 ** 3) fail();
      return { binding: c.artifacts.binding, capacityReady: true };
    };
    await verifyBinding(); await unusedState(c);
    stage = "ARTIFACTS"; const prepared = await prepareYuzhouRealBundleLabArtifacts(c.artifacts), manifest = JSON.parse(Buffer.from(prepared.manifestBytes).toString("utf8"));
    const phases = [], payloadBundles = {};
    for (const p of manifest.phases) { phases.push(JSON.parse(Buffer.from(await prepared.readArtifact(p.phaseArtifact.ref)).toString("utf8"))); payloadBundles[p.phase] = Buffer.from(await prepared.readArtifact(p.payloadArtifact.ref)); }
    stage = "CRYPTO";
    for (const k of c.keyFiles) { const bytes = await privateBytes(k.keyFile, 32); bytes.fill(0); }
    provider = await createProductionImportArtifactCryptoProvider({ envelopeArtifact: JSON.parse((await privateBytes(c.envelopes, 64 * 1024 ** 2)).toString("utf8")), keyFiles: c.keyFiles,
      plan: { operationId: manifest.operationId, targetScope: manifest.targetScope, phases }, payloadBundles, decryptEnvelope: decryptProductionImportEnvelope });
    const ids = { userIds: [], roleIds: [] };
    const probes = createYuzhouRealBundleLabPgProbes({ expectedDatabase: manifest.target.database, targetScope: manifest.targetScope, runId: manifest.runId,
      codeSha: manifest.binding.codeSha, sourceSnapshotHash: manifest.binding.sourceSnapshotHash, baselineCounts: c.baselineCounts, phaseCounts: c.phaseCounts, getHttpFixtureIds: () => ids });
    for (const p of phases) { const n = c.phaseCounts[p.phase]; if (n.records !== p.records.length || n.inserted !== p.records.filter(r => r.disposition === "insert").length || n.quarantined !== p.records.filter(r => r.disposition === "quarantine").length) fail(); }
    if (abort.signal.aborted) fail();
    if (input.mode === "validate") return { status: "VALIDATED", databaseContacted: false, databaseWrites: 0, productionImport: "HOLD" };
    stage = "TARGET";
    const inspect = () => { const d = JSON.parse(docker(["inspect", c.container]))[0]; assertYuzhouLabContainer(c, d); return d; };
    const descriptor = inspect(), password = descriptor.Config.Env.find(v => v.startsWith("POSTGRES_PASSWORD="))?.slice(18); if (!password) fail();
    const capacity = docker(["exec", c.container, "sh", "-c", 'd="${PGDATA:-/var/lib/postgresql/data}"; df -Pk "$d" && du -sk "$d"']).trim().split("\n");
    const df = capacity.at(-2)?.trim().split(/\s+/u), used = capacity.at(-1)?.trim().split(/\s+/u);
    const disk = await statfs(c.stateRoot);
    assertYuzhouLabCapacity(disk.bavail * disk.bsize, Number(df?.[3]), Number(used?.[0]));
    const { Pool } = createRequire(join(ROOT, "apps/api/package.json"))("pg");
    pool = new Pool({ host: "127.0.0.1", port: c.port, database: manifest.target.database, user: "jinhu", password, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 300000 });
    if (input.mode === "preflight") { const tx = await pool.connect(); try { await probes.captureBaseline({ tx }); } finally { tx.release(); } return { status: "PREFLIGHT_PASS", databaseWrites: 0, productionImport: "HOLD" }; }
    stage = "EXECUTE"; const state = await createYuzhouLabRunState({ stateRoot: c.stateRoot });
    const result = await runYuzhouRealBundleLabOwner({ ...prepared, pool, cryptoProvider: provider, mode: "real", signal: abort.signal, adapters: { ...probes, ...state, verifyBinding,
      verifyHttp: async () => {
        inspect(); if (abort.signal.aborted) fail();
        return withYuzhouRealHttpLab({ repositoryRoot: ROOT, container: c.container, database: manifest.target.database, scope: manifest.targetScope,
          register: async value => {
            if (value.database !== manifest.target.database || value.tenantId !== manifest.targetScope.tenantId || value.parkId !== manifest.targetScope.parkId || value.createdUserIds?.length !== 2 || ![...value.createdUserIds, value.createdRoleId].every(v => /^[0-9a-f-]{36}$/u.test(v))) fail();
            const file = await open(join(c.stateRoot, `http-${manifest.runId}.json`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
            try { await file.writeFile(JSON.stringify({ manifestSha256: prepared.manifestSha256, binding: manifest.binding, ...value })); await file.sync(); } finally { await file.close(); }
            const dir = await open(c.stateRoot, constants.O_RDONLY | constants.O_NOFOLLOW); try { await dir.sync(); } finally { await dir.close(); }
            ids.userIds = [...value.createdUserIds]; ids.roleIds = [value.createdRoleId];
          }, verify: async args => { if (abort.signal.aborted) fail(); const receipt = await verifyYuzhouRealImportHttp({ ...args, expectedCounts: manifest.httpCounts }); if (abort.signal.aborted) fail(); return receipt; } });
      } } });
    return { ...result, operationalCli: true, crashRecoveryImplemented: false };
  } catch { return { status: "FAILED", failureCodes: [`LAB_CLI_${stage}_FAILED`], productionImport: "HOLD", crashRecoveryImplemented: false }; }
  finally { provider?.destroy(); if (pool) await pool.end().catch(() => {}); process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result; try { result = await runYuzhouLabCli(parseYuzhouLabArgs(process.argv.slice(2))); } catch { result = { status: "FAILED", failureCodes: ["LAB_CLI_ARGS_FAILED"], productionImport: "HOLD" }; }
  process.stdout.write(`${JSON.stringify(result)}\n`); if (!["VALIDATED", "PREFLIGHT_PASS", "LAB_PASS"].includes(result.status)) process.exitCode = 1;
}
