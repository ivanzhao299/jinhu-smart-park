import test from "node:test";
import assert from "node:assert/strict";
import { validateYuzhouLabResourceDescriptor, assertYuzhouLabResources, assertYuzhouLabResourcePair } from "../hr-cutover/yuzhou-lab-resource-descriptor.mjs";
import { assertYuzhouLabContainer } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
const make = (side = "a") => {
  const name = `jinhu_hr_migration_lab_${side.repeat(6)}`;
  const r = { database: name, container: name, containerId: side.repeat(64), imageId: `sha256:${"c".repeat(64)}`, port: side === "a" ? 15432 : 15433, composeProject: name,
    volume: { name, createdAt: "2026-09-09T00:00:00Z" }, network: { name, id: side.repeat(64) } };
  const Labels = { "com.docker.compose.project": name };
  return { r, actual: { container: { Id: r.containerId, Name: `/${name}`, Image: r.imageId, State: { Running: true }, Config: { Labels, Entrypoint: ["docker-entrypoint.sh"], Cmd: ["postgres"] },
    Mounts: [{ Destination: "/var/lib/postgresql/data", Type: "volume", Name: name, RW: true }],
    NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: String(r.port) }] }, Networks: { [name]: { NetworkID: r.network.id } } } },
  volume: { Name: name, CreatedAt: r.volume.createdAt, Driver: "local", Labels }, network: { Name: name, Id: r.network.id, Driver: "bridge", Scope: "local", Labels } } };
};
test("exact dedicated resources pass through CLI; independent descriptors are not pair evidence", () => {
  const { r, actual } = make(); assert.equal(validateYuzhouLabResourceDescriptor(r), r);
  assert.equal(assertYuzhouLabContainer({ resourceDescriptor: r }, actual.container, actual), true);
  assert.equal(assertYuzhouLabResourcePair(r, make("b").r), true);
});
for (const [label, mutate] of [
  ["container", x => x.container.Id = "d".repeat(64)], ["image", x => x.container.Image = "sha256:" + "d".repeat(64)],
  ["public port", x => x.container.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0"],
  ["compose", x => x.container.Config.Labels["com.docker.compose.project"] = "production"],
  ["volume", x => x.volume.CreatedAt = "2026-09-08T00:00:00Z"], ["network", x => x.network.Id = "d".repeat(64)],
  ["extra network", x => x.container.NetworkSettings.Networks.other = {}], ["bind mount", x => x.container.Mounts[0].Type = "bind"],
  ["local bind volume", x => x.volume.Options = { type: "none", o: "bind", device: "/same-data" }],
  ["redirected PGDATA", x => x.container.Config.Env = ["PGDATA=/other"]],
  ["duplicate PGDATA", x => x.container.Config.Env = ["PGDATA=/var/lib/postgresql/data", "PGDATA=/other"]],
  ["writable extra mount", x => x.container.Mounts.push({ Destination: "/other", RW: true })],
  ["data directory command", x => x.container.Config.Cmd = ["postgres", "-D", "/tmp/other"]],
  ["data directory setting", x => x.container.Config.Cmd = ["postgres", "-c", "data_directory=/tmp/other"]],
  ["custom config", x => x.container.Config.Cmd = ["postgres", "-c", "config_file=/tmp/custom.conf"]],
  ["custom entrypoint", x => x.container.Config.Entrypoint = ["custom-entrypoint.sh"]],
  ["readonly config mount", x => x.container.Mounts.push({ Destination: "/etc/postgresql", RW: false })],
]) test(`reject actual ${label} mismatch`, () => { const { r, actual } = make(); mutate(actual); assert.throws(() => assertYuzhouLabResources(r, actual), /^Error: LAB_RESOURCE_INVALID$/); });
for (const key of ["database", "container", "containerId", "port", "composeProject", "volume", "network"]) test(`pair rejects shared ${key}`, () => {
  const a = make().r, b = make("b").r; b[key] = a[key]; assert.throws(() => assertYuzhouLabResourcePair(a, b), /LAB_RESOURCE_INVALID/);
});
test("unknown fields and production names rejected", () => {
  const { r } = make(); assert.throws(() => validateYuzhouLabResourceDescriptor({ ...r, host: "localhost" }), /LAB_RESOURCE_INVALID/);
  assert.throws(() => validateYuzhouLabResourceDescriptor({ ...r, database: "production" }), /LAB_RESOURCE_INVALID/);
});
