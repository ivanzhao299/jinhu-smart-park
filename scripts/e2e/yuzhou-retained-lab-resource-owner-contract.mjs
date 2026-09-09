import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, readdir, stat, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { prepareYuzhouRetainedLabResources, validateYuzhouLocalDockerSocket } from "../hr-cutover/yuzhou-retained-lab-resource-owner.mjs";
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
    if (args[2] === "pg_isready") {
      assert.deepEqual(args.slice(2), ["pg_isready", "-h", "127.0.0.1", "-U", "jinhu", "-d", "postgres"]);
      if (defect === "temporary-server" && calls.filter(c => c.args[2] === "pg_isready").length === 1) throw Error("FINAL_TCP_SERVER_NOT_READY");
      return "";
    }
    if (args[1] === "ls") return defect === "existing-volume" && args[0] === "volume" ? name : "";
    if (args[1] === "inspect") return JSON.stringify([objects[args[0]]]);
    if (defect === "network" && args[0] === "network" && args[1] === "create") throw Error("RAW DOCKER SECRET");
    return "";
  };
  return { input, calls, execute, leaseRoot: join(root, "leases"), currentHead: () => "e".repeat(40) };
}
test("prepare creates fresh resources after capacity check, template0 DB, migrations/seeds, private receipt-last registry", async t => {
  const f = await fixture(t), result = await prepareYuzhouRetainedLabResources(f.input, f);
  assert.equal(result.status, "DEDICATED_LAB_PREPARED"); assert.equal(result.evidenceMode, "synthetic_adapter"); assert.equal(result.cleanupImplemented, false);
  const env = await readFile(join(f.input.outputDirectory, "postgres.env"), "utf8"); assert.match(env, /^POSTGRES_PASSWORD=[a-f0-9]{64}\n/u);
  assert.equal((await stat(join(f.input.outputDirectory, "postgres.env"))).mode & 0o077, 0);
  assert.equal(JSON.stringify(result).includes(env.split("\n")[0]), false);
  assert.ok(f.calls.findIndex(c => c.args.includes("df")) < f.calls.findIndex(c => c.args.includes("create")));
  assert.ok(f.calls.some(c => c.args.some(a => a.includes("TEMPLATE template0"))));
  const create = f.calls.find(c => c.args[0] === "container" && c.args[1] === "create");
  assert.ok(create.args.includes("com.docker.compose.container-number=1"));
  assert.equal(create.args[create.args.indexOf("com.docker.compose.container-number=1") - 1], "--label");
  assert.equal(create.args.find(a => a.startsWith("com.docker.compose.config-hash=")), `com.docker.compose.config-hash=${result.composeSourceSha256}`);
  assert.deepEqual(f.calls.filter(c => c.file === "/bin/sh").map(c => c.args[0].split("/").at(-1)), ["db-migrate.sh", "db-seed-prod.sh"]);
  assert.ok(!f.calls.some(c => c.args.some(a => /bootstrap|prune|down/u.test(a))));
  assert.equal(JSON.parse(await readFile(join(f.input.outputDirectory, "registry/prepare-receipt.json"))).status, result.status);
});
test("temporary Unix-only server cannot release database creation before final TCP readiness", async t => {
  const f = await fixture(t, "temporary-server"), result = await prepareYuzhouRetainedLabResources(f.input, f);
  assert.equal(result.status, "DEDICATED_LAB_PREPARED");
  const ready = f.calls.map((c, i) => c.args[2] === "pg_isready" ? i : -1).filter(i => i >= 0);
  assert.equal(ready.length, 2);
  assert.ok(f.calls.findIndex(c => c.args.some(a => a.includes("TEMPLATE template0"))) > ready[1]);
});
for (const defect of ["capacity", "existing-volume", "network", "migration", "wrong-id", "wrong-number", "wrong-config-label", "foreign-owner", "ack-loss"]) test(`fails safely at ${defect} without cleanup or ready registry`, async t => {
  const f = await fixture(t, defect), result = await prepareYuzhouRetainedLabResources(f.input, f);
  assert.equal(result.status, "FAILED"); assert.equal(result.cleanupAttempted, false); assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.ok(!(await readdir(f.input.outputDirectory)).includes("registry"));
  if (["capacity", "existing-volume"].includes(defect)) assert.ok(!f.calls.some(c => c.args.includes("create")));
  if (defect === "network") assert.equal(JSON.parse(await readFile(join(f.input.outputDirectory, "prepare-failure.json"))).created.volume.name, f.input.name);
  if (defect === "ack-loss") assert.equal(f.calls.filter(c => c.args[1] === "create").length, 1);
  if (["wrong-number", "wrong-config-label"].includes(defect)) assert.ok(!f.calls.some(c => c.file === "/bin/sh" || c.args[1] === "start"));
});
test("Colima-shaped local Unix endpoint is a real socket; remote and regular files rejected", async t => {
  const f = await fixture(t); assert.ok(validateYuzhouLocalDockerSocket(f.input.dockerHost).ino);
  for (const endpoint of ["tcp://127.0.0.1:2375", "ssh://local", "unix://remote/path"]) assert.throws(() => validateYuzhouLocalDockerSocket(endpoint));
  const file = join(f.input.outputDirectory, "not-socket"); await writeFile(file, "x");
  assert.throws(() => validateYuzhouLocalDockerSocket(`unix://${file}`));
  const link = join(f.input.outputDirectory, "socket-link"); await symlink(f.input.dockerHost.slice(7), link);
  assert.throws(() => validateYuzhouLocalDockerSocket(`unix://${link}`));
});
test("shared daemon/name lease excludes concurrent output directories and is never stolen", async t => {
  const a = await fixture(t), b = await fixture(t); b.leaseRoot = a.leaseRoot; b.input.dockerHost = a.input.dockerHost;
  const results = await Promise.all([prepareYuzhouRetainedLabResources(a.input, a), prepareYuzhouRetainedLabResources(b.input, b)]);
  assert.equal(results.filter(r => r.status === "DEDICATED_LAB_PREPARED").length, 1);
  assert.equal(results.find(r => r.status === "FAILED").failureCode, "LAB_RESOURCE_PREPARE_LEASE_FAILED");
  const leases = await readdir(a.leaseRoot); assert.equal(leases.length, 1);
  assert.ok((await readFile(join(a.leaseRoot, leases[0], "owner.json"), "utf8")).includes("ownerNonce"));
  assert.ok(![...a.calls, ...b.calls].some(c => c.args[0] === "compose" && c.args.includes("up")));
});
