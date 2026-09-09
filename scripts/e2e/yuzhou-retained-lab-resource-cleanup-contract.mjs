import test from "node:test";
import { cleanupYuzhouRetainedLabResources } from "../hr-cutover/yuzhou-retained-lab-resource-cleanup.mjs";
import { LAB_EXECUTION_DEPENDENCIES, persistYuzhouLabFinalReceipt } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL } from "../hr-cutover/production-import-target-model.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { prepareYuzhouRetainedLabResources } from "../hr-cutover/yuzhou-retained-lab-resource-owner.mjs";
async function fixture(t, defect) {
  // Short absolute path stays below macOS sockaddr_un limits, even after realpath.
  const root = await realpath(await mkdtemp("/tmp/lab-resource-owner-")), outputDirectory = join(root, "out");
  await mkdir(outputDirectory, { mode: 0o700 }); await mkdir(join(root, ".colima/default"), { recursive: true, mode: 0o700 });
  const socketPath = join(root, ".colima/default/docker.sock"), server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const name = "jinhu_hr_migration_lab_resource", imageId = `sha256:${"a".repeat(64)}`, id = "b".repeat(64), networkId = "c".repeat(64), calls = [];
  const input = { runId: "resource-run", name, imageId, port: 25432, outputDirectory, dockerHost: `unix://${socketPath}`, capacityObserver: { container: "existing-lab", containerId: "d".repeat(64), imageId, port: 15432 } };
  const Labels = { "com.docker.compose.project": name, "com.docker.compose.service": "postgres", "com.docker.compose.container-number": defect === "wrong-number" ? "2" : "1" };
  const objects = { image: { Id: imageId, Config: { Entrypoint: ["docker-entrypoint.sh"], Cmd: ["postgres"] } }, volume: { Name: name, CreatedAt: "2026-09-09T00:00:00Z", Driver: "local", Labels },
    network: { Name: name, Id: networkId, Driver: "bridge", Scope: "local", Labels }, container: { Id: defect === "wrong-id" ? "wrong" : id, Name: `/${name}`, Image: imageId, State: { Running: true },
      Config: { Labels, Entrypoint: ["docker-entrypoint.sh"], Cmd: ["postgres"] }, Mounts: [{ Type: "volume", Name: name, Destination: "/var/lib/postgresql/data", RW: true }],
      NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "25432" }] }, Networks: { [name]: { NetworkID: networkId } } } } };
  const execute = async (file, args, options) => {
    calls.push({ file, args, options }); assert.equal(options.env.DOCKER_HOST, input.dockerHost); assert.equal(options.shell, undefined);
    if (args[0] === "info") return "synthetic-daemon-001";
    if (args[1] === "create") {
      const owner = args.find(a => a.startsWith("org.jinhu.hr-lab.owner="))?.split("=")[1];
      const labels = args[0] === "container" ? objects.container.Config.Labels : objects[args[0]].Labels;
      labels["org.jinhu.hr-lab.owner"] = defect === "foreign-owner" && args[0] === "volume" ? "foreign" : owner;
      if (args[0] === "container") labels["com.docker.compose.config-hash"] = defect === "wrong-config-label" ? "wrong" : args.find(a => a.startsWith("com.docker.compose.config-hash="))?.split("=")[1];
      if (defect === "ack-loss" && args[0] === "volume") throw Error("ACK LOSS");
      if (args[0] === "container") return id;
    }
    if (file === "/bin/sh") {
      // Compose exec's default filters require config-hash presence and index 1.
      assert.equal(objects.container.Config.Labels["com.docker.compose.container-number"], "1");
      assert.equal(objects.container.Config.Labels["com.docker.compose.config-hash"], createHash("sha256").update(await readFile(options.env.COMPOSE_FILE)).digest("hex"));
      if (defect === "migration" && args[0].endsWith("db-migrate.sh")) throw Error("PRIVATE SQL"); return "";
    }
    if (args.includes("--format") && args[1] === "inspect") return JSON.stringify({ Id: input.capacityObserver.containerId, Image: imageId, State: { Running: true }, Config: { Labels: { "com.docker.compose.project": "jinhu_hr_migration_lab" } }, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "15432" }] } } });
    if (args[0] === "exec" && args[2] === "df") return `Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/mock 30000000 100000 ${defect === "capacity" ? 1 : 20000000} 1% /var/lib/postgresql/data\n`;
    if (args[0] === "exec" && args[2] === "du") return "164000 /var/lib/postgresql/data\n";
    if (args[1] === "ls") return defect === "existing-volume" && args[0] === "volume" ? name : "";
    if (args[1] === "inspect") return JSON.stringify([objects[args[0]]]);
    if (defect === "network" && args[0] === "network" && args[1] === "create") throw Error("RAW DOCKER SECRET");
    return "";
  };
  return { input, calls, execute, leaseRoot: join(root, "leases"), currentHead: () => "e".repeat(40) };
}
const h = value => createHash("sha256").update(value).digest("hex");
async function cleanupFixture(t, defect) {
  const f = await fixture(t); const prepared = await prepareYuzhouRetainedLabResources(f.input, f);
  assert.equal(prepared.status, "DEDICATED_LAB_PREPARED");
  const root = resolveParent(f.input.outputDirectory), stateRoot = join(root, "state"), outputDirectory = join(root, "cleanup");
  for (const d of [stateRoot, outputDirectory]) await mkdir(d, { mode: 0o700 });
  const put = async (path, value) => { const bytes = JSON.stringify(value); await writeFile(path, bytes, { mode: 0o600 }); return { path, sha256: h(bytes) }; };
  const pin = async path => ({ path, sha256: h(await readFile(path)) });
  // Explicit synthetic stand-ins for real-command provenance; output remains synthetic_adapter.
  prepared.evidenceMode = defect === "wrong-receipt" ? "synthetic_adapter" : "real_commands";
  const prepareReceipt = await put(join(f.input.outputDirectory, "registry/prepare-receipt.json"), prepared);
  const resourceDescriptor = await pin(join(f.input.outputDirectory, "registry/resource-descriptor.json")), descriptor = JSON.parse(await readFile(resourceDescriptor.path));
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") }, targetScope = { tenantId: "tenant", parkId: "park" };
  targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const unopened = { path: join(root, "unopened"), sha256: h("pin") };
  const c = { formatVersion: 1, artifacts: { preparedRoot: root, expectedSummarySha256: h("summary"), expectedTriple: triple,
    binding: { codeSha: triple.codeSha, sourceSnapshotHash: triple.sourceSnapshotHash, mappingSha256: triple.mappingContractHash, executorSha256: h("executor") }, target: { database: descriptor.database }, targetScope,
    runId: f.input.runId, operationId: "yzprod-import-20260909T000000Z-aaaaaaaaaaaa", expectedCounts: { records: 4, inserted: 4, quarantined: 0 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 } },
    stateRoot, container: descriptor.container, containerId: descriptor.containerId, imageId: descriptor.imageId, port: descriptor.port, resourceDescriptor: descriptor,
    dependencies: Object.fromEntries(LAB_EXECUTION_DEPENDENCIES.map(p => [p, h(p)])), runtimeTreeSha256: h("runtime"), envelopes: unopened, keyFiles: [],
    baselineCounts: Object.fromEntries(Object.keys(MODEL.targetTables).map(table => [table, table === "sys_org" ? 15 : table === "hr_contract_type" ? 3 : 0])),
    phaseCounts: Object.fromEntries(["T0", "T1", "T2", "T3"].map(p => [p, { records: 1, inserted: 1, quarantined: 0 }])),
    pairMaterials: { side: "A", originalConfig: unopened, receipt: unopened, sideReceipt: unopened, overlays: unopened } };
  const sideConfig = await put(join(root, "side-config.json"), c), manifestSha256 = h("manifest");
  const result = { status: "LAB_PASS", counts: c.artifacts.expectedCounts, httpVerified: true, rollbackVerified: true, residualVerified: true, failureCodes: [], productionImport: "HOLD",
    sideExecutionProvenance: { executionCodeSha: "e".repeat(40), executorSha256: c.artifacts.binding.executorSha256, runtimeTreeSha256: c.runtimeTreeSha256,
      sourceProvenance: { preparedTriple: triple, originalConfigSha256: unopened.sha256, pairMaterialsReceiptSha256: unopened.sha256, side: "A", currentCommitVerified: false } } };
  await persistYuzhouLabFinalReceipt({ stateRoot, identity: { runId: c.artifacts.runId, configSha256: sideConfig.sha256, binding: c.artifacts.binding, manifestSha256 }, result });
  const finalReceipt = await pin(join(stateRoot, `final-${c.artifacts.runId}.json`));
  const httpRegistry = await put(join(stateRoot, `http-${c.artifacts.runId}.json`), { manifestSha256, binding: c.artifacts.binding, database: descriptor.database, tenantId: targetScope.tenantId, parkId: targetScope.parkId,
    createdUserIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"], createdRoleId: "00000000-0000-4000-8000-000000000003" });
  const input = { prepareRequest: await put(join(root, "prepare-request.json"), f.input), prepareReceipt, resourceDescriptor, sideConfig, finalReceipt, httpRegistry, outputDirectory };
  if (defect === "active-writer") await mkdir(join(stateRoot, "exclusive-owner"), { mode: 0o700 });
  f.calls.length = 0; const deleted = [], queries = [];
  const execute = async (file, args, opts) => {
    if (defect === "absence-failure" && args[1] === "ls" && deleted.length) throw Error("PRIVATE ENUMERATION FAILURE");
    if (defect === "still-present" && args[0] === "container" && args[1] === "ls" && deleted.includes("container")) return descriptor.containerId;
    if (args[1] === "rm") { f.calls.push({ file, args, options: opts }); if (defect === "partial" && args[0] === "network") throw Error("PRIVATE STDERR"); deleted.push(args[0]); return ""; }
    const output = await f.execute(file, args, opts);
    if (args[1] === "inspect" && args[0] === "container") {
      const values = JSON.parse(output); values[0].Config.Env = ["POSTGRES_PASSWORD=synthetic-only"];
      if (defect === "wrong-id") values[0].Id = "f".repeat(64);
      if (defect === "wrong-owner") values[0].Config.Labels["org.jinhu.hr-lab.owner"] = "foreign";
      return JSON.stringify(values);
    }
    return output;
  };
  const createClient = options => { assert.equal(options.host, "127.0.0.1"); assert.equal(options.database, descriptor.database); return {
    connect: async () => queries.push("connect"), end: async () => { queries.push("end"); if (defect === "end-failure") throw Error("PRIVATE END FAILURE"); }, query: async sql => {
      queries.push(sql);
      if ((defect === "sql-failure" && sql.includes("lab-pg:identity")) || (defect === "rollback-failure" && sql === "ROLLBACK")) throw Error("PRIVATE SQL FAILURE");
      if (sql.includes("lab-pg:identity")) return { rows: [{ database_name: descriptor.database }] };
      if (sql.includes("lab-pg:scope")) return { rows: [{ tenant_exists: true, park_exists: true }] };
      if (sql.includes("lab-pg:count")) return { rows: [{ n: c.baselineCounts[sql.match(/FROM (\w+) WHERE/u)[1]] }] };
      if (sql.includes("lab-pg:ledger")) return { rows: [] };
      if (sql.includes("lab-pg:global")) return { rows: [{ active_maps: defect === "residual" ? 1 : 0, running_batches: 0, other_connections: 0 }] };
      if (sql.includes("lab-pg:fixtures")) return { rows: [{ n: 0 }] };
      return { rows: [] };
    } }; };
  return { input, execute, createClient, leaseRoot: f.leaseRoot, deleted, queries, calls: f.calls };
}
const resolveParent = path => join(path, "..");
test("cleanup requires fresh readonly residual proof and deletes exact container/network/volume in order", async t => {
  const f = await cleanupFixture(t), result = await cleanupYuzhouRetainedLabResources(f.input, f);
  assert.equal(result.status, "DEDICATED_LAB_RESOURCES_REMOVED"); assert.deepEqual(f.deleted, ["container", "network", "volume"]);
  assert.equal(result.evidenceMode, "synthetic_adapter"); assert.ok(f.queries.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")); assert.ok(f.queries.includes("ROLLBACK")); assert.equal(f.queries.at(-1), "end");
  assert.ok(!f.queries.some(q => /COMMIT|DELETE|UPDATE|INSERT/u.test(q)));
  assert.deepEqual(JSON.parse(await readFile(join(f.input.outputDirectory, "receipt/cleanup-receipt.json"))), result);
  assert.ok(f.calls.filter(c => c.args[1] === "rm").every(c => c.file === "docker" && !c.options.shell));
});
for (const defect of ["wrong-receipt", "wrong-id", "wrong-owner", "active-writer", "residual", "partial", "still-present", "sql-failure", "rollback-failure", "end-failure", "absence-failure"]) test(`cleanup ${defect} refuses or stops without success receipt`, async t => {
  const f = await cleanupFixture(t, defect), result = await cleanupYuzhouRetainedLabResources(f.input, f);
  assert.equal(result.status, "FAILED"); assert.deepEqual(f.deleted, ["partial", "still-present", "absence-failure"].includes(defect) ? ["container"] : []);
  assert.ok(!(await readdir(f.input.outputDirectory)).includes("receipt"));
  if (defect === "residual") assert.equal(f.queries.at(-1), "end");
  if (["sql-failure", "rollback-failure", "end-failure"].includes(defect)) {
    assert.ok(f.queries.includes("ROLLBACK")); assert.equal(f.queries.at(-1), "end");
    assert.ok(!f.calls.some(c => c.args[1] === "rm"));
  }
});
