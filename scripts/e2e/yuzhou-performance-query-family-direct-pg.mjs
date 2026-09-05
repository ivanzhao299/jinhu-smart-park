import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";

const container = `jinhu-hr-query-family-pg-${process.pid}`;
const image = "postgres:16-alpine";
const inheritedEnvironment = Object.fromEntries(
  ["HOME", "PATH", "TMPDIR", "DOCKER_HOST", "DOCKER_CONTEXT", "XDG_CONFIG_HOME"]
    .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]),
);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: inheritedEnvironment,
    ...options,
  });
}

let started = false;
try {
  const launch = run("docker", [
    "run", "--rm", "-d",
    "--name", container,
    "--label", "jinhu.synthetic-purpose=yuzhou-performance-query-family",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e", "POSTGRES_USER=jinhu",
    "-e", "POSTGRES_DB=jinhu_query_family",
    "-p", "127.0.0.1::5432",
    image,
  ]);
  assert.equal(launch.status, 0, launch.stderr);
  started = true;

  let hostPort = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const portResult = run("docker", ["port", container, "5432/tcp"]);
    const ready = run("docker", [
      "exec", container, "pg_isready", "-q", "-U", "jinhu", "-d", "jinhu_query_family",
    ]);
    const match = portResult.stdout.trim().match(/127\.0\.0\.1:(\d+)$/u);
    if (portResult.status === 0 && ready.status === 0 && match) {
      hostPort = match[1];
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  }
  assert.match(hostPort, /^\d+$/u, "synthetic PostgreSQL did not become ready");

  const test = run(
    "pnpm",
    [
      "--filter", "@jinhu/api", "exec", "node", "--test", "--test-force-exit",
      "--test-reporter=spec", "--require", "ts-node/register",
      "src/modules/hr/hr-performance-legacy-query-family.pg.spec.ts",
    ],
    {
      env: {
        ...inheritedEnvironment,
        CI: "1",
        HR_PERFORMANCE_LEGACY_QUERY_PG: "1",
        POSTGRES_HOST: "127.0.0.1",
        POSTGRES_PORT: hostPort,
        POSTGRES_USER: "jinhu",
        POSTGRES_DB: "jinhu_query_family",
        POSTGRES_PASSWORD: "",
      },
    },
  );
  process.stdout.write(test.stdout);
  process.stderr.write(test.stderr);
  assert.equal(test.status, 0, "synthetic PostgreSQL query-family contract failed");
} finally {
  if (started) {
    const stop = run("docker", ["stop", "--time", "1", container]);
    assert.equal(stop.status, 0, stop.stderr);
  }
}
