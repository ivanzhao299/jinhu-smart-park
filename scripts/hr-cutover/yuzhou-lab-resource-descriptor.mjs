const fail = () => { throw new Error("LAB_RESOURCE_INVALID"); };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) fail(); };
const name = v => typeof v === "string" && /^jinhu_hr_migration_lab_[a-z0-9_]{6,40}$/u.test(v);
const id = v => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
export function validateYuzhouLabResourceDescriptor(r) {
  exact(r, ["database", "container", "containerId", "imageId", "port", "composeProject", "volume", "network"]);
  exact(r.volume, ["name", "createdAt"]); exact(r.network, ["name", "id"]);
  if (![r.database, r.container, r.composeProject, r.volume.name, r.network.name].every(name) ||
      !id(r.containerId) || !id(r.network.id) || !/^sha256:[0-9a-f]{64}$/u.test(r.imageId ?? "") ||
      !Number.isInteger(r.port) || r.port < 1024 || r.port > 65535 ||
      typeof r.volume.createdAt !== "string" || !Number.isFinite(Date.parse(r.volume.createdAt))) fail();
  return r;
}
/** Descriptor comparison is not live A/B evidence or a trust-root proof. */
export function assertYuzhouLabResourcePair(a, b) {
  [a, b].forEach(validateYuzhouLabResourceDescriptor);
  for (const key of ["database", "container", "containerId", "port", "composeProject"]) if (a[key] === b[key]) fail();
  if (a.volume.name === b.volume.name || a.network.name === b.network.name || a.network.id === b.network.id) fail();
  return true;
}
export function assertYuzhouLabResources(r, { container: c, volume: v, network: n }) {
  validateYuzhouLabResourceDescriptor(r);
  const project = x => x?.Labels?.["com.docker.compose.project"] === r.composeProject;
  const ports = c?.NetworkSettings?.Ports;
  const p = ports?.["5432/tcp"];
  const mounts = c?.Mounts?.filter(m => m.Destination === "/var/lib/postgresql/data");
  const pgdata = c?.Config?.Env?.filter(e => e.startsWith("PGDATA=")) ?? [];
  if (c?.Id !== r.containerId || c.Name !== `/${r.container}` || c.Image !== r.imageId || c.State?.Running !== true || !project(c.Config) ||
      JSON.stringify(c.Config.Entrypoint) !== '["docker-entrypoint.sh"]' || JSON.stringify(c.Config.Cmd) !== '["postgres"]' ||
      Object.keys(ports ?? {}).some(k => k !== "5432/tcp" && ports[k] !== null) || p?.length !== 1 || p[0].HostIp !== "127.0.0.1" || p[0].HostPort !== String(r.port) ||
      mounts?.length !== 1 || mounts[0].Type !== "volume" || mounts[0].Name !== r.volume.name || mounts[0].RW !== true ||
      c.Mounts.length !== 1 ||
      pgdata.length > 1 || (pgdata.length === 1 && pgdata[0] !== "PGDATA=/var/lib/postgresql/data") ||
      Object.keys(c.NetworkSettings.Networks ?? {}).join() !== r.network.name || c.NetworkSettings.Networks[r.network.name].NetworkID !== r.network.id ||
      v?.Name !== r.volume.name || v.CreatedAt !== r.volume.createdAt || v.Driver !== "local" || Object.keys(v.Options ?? {}).length !== 0 || !project(v) ||
      n?.Id !== r.network.id || n.Name !== r.network.name || n.Driver !== "bridge" || n.Scope !== "local" || !project(n)) fail();
  return true;
}
